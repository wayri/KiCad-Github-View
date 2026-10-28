"""Optional, network-free native messaging bridge for saved KiCad project archives."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import unicodedata
import zipfile

HOST_NAME = "dev.pocketkivi.kicad"
MAX_MESSAGE = 64 * 1024
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_DIRECTORY = 32 * 1024 * 1024
MAX_RATIO = 1000
SUFFIXES = {".kicad_pro": "kicad.exe", ".kicad_sch": "eeschema.exe", ".kicad_pcb": "pcbnew.exe"}


class HostError(ValueError):
    """Safe, deliberately non-sensitive error to return to the browser."""


def local_path(value: str, *, file: bool = True) -> Path:
    if not isinstance(value, str) or len(value) > 4096 or not value or "\x00" in value:
        raise HostError("Invalid local path.")
    path = Path(value)
    if not path.is_absolute() or value.startswith(("\\\\", "//")):
        raise HostError("Choose a file on a local drive.")
    for candidate in (path, *path.parents):
        info = candidate.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise HostError("Linked files and directories are not supported.")
    if file and (not path.is_file() or path.stat().st_nlink != 1):
        raise HostError("Choose a regular, nonlinked file.")
    return path


def relative_path(value: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 1024 or "\\" in value:
        raise HostError("Archive contains an unsafe path.")
    parts = value.split("/")
    for part in parts:
        if (not part or part in (".", "..") or part[-1:] in (" ", ".")
                or any(ord(c) < 32 or c in ':<>"|?*' for c in part)
                or re.fullmatch(r"(?i)(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?", part)
                or getattr(os.path, "isreserved", lambda _: False)(part)):
            raise HostError("Archive contains an unsafe path.")
    return "/".join(parts)


def preflight_directory(stream):
    """Bound central-directory parsing before ZipFile allocates any ZipInfo objects."""
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    tail_size = min(size, 22 + 65535)
    stream.seek(size - tail_size)
    tail = stream.read(tail_size)
    offset = tail.rfind(b"PK\x05\x06")
    if offset < 0 or len(tail) - offset < 22:
        raise HostError("Invalid ZIP directory.")
    _, disk, directory_disk, disk_count, count, length, start, comment = struct.unpack_from("<4s4H2IH", tail, offset)
    end = size - tail_size + offset
    if (disk or directory_disk or disk_count != count or not 0 < count <= MAX_ENTRIES
            or count == 0xffff or start == 0xffffffff or length == 0xffffffff
            or not 0 < length <= MAX_DIRECTORY or start + length != end
            or offset + 22 + comment != len(tail)):
        raise HostError("ZIP directory exceeds limits or uses unsupported ZIP64/multiple disks.")
    stream.seek(start)
    actual_count = 0
    while stream.tell() < end:
        if end - stream.tell() < 46 or actual_count >= MAX_ENTRIES:
            raise HostError("ZIP directory has too many entries or is malformed.")
        header = stream.read(46)
        if len(header) != 46 or header[:4] != b"PK\x01\x02":
            raise HostError("Invalid ZIP directory entry.")
        fields = struct.unpack("<4s6H3I5H2I", header)
        compressed, expanded = fields[8:10]
        name_length, extra_length, comment_length, entry_disk = fields[10:14]
        local_offset = fields[16]
        if (entry_disk or compressed == 0xffffffff or expanded == 0xffffffff
                or local_offset == 0xffffffff or local_offset + 30 > start
                or not 0 < name_length <= 4096
                or stream.tell() + name_length + extra_length + comment_length > end):
            raise HostError("Invalid or unsupported ZIP directory entry.")
        stream.seek(name_length, os.SEEK_CUR)
        extra = stream.read(extra_length)
        cursor = 0
        while cursor < len(extra):
            if len(extra) - cursor < 4:
                raise HostError("Invalid ZIP extra data.")
            tag, payload_length = struct.unpack_from("<HH", extra, cursor)
            cursor += 4 + payload_length
            if tag == 1 or cursor > len(extra):
                raise HostError("ZIP64 or malformed ZIP extra data is not supported.")
        stream.seek(comment_length, os.SEEK_CUR)
        actual_count += 1
    if actual_count != count or stream.tell() != end:
        raise HostError("ZIP directory count does not match its entries.")
    stream.seek(0)


def validate_archive(archive: zipfile.ZipFile, requested: str):
    entries = archive.infolist()
    if not entries or len(entries) > MAX_ENTRIES:
        raise HostError("Archive has too many entries or is empty.")
    paths, kinds, spellings = {}, {}, {}
    total = 0
    for item in entries:
        if item.orig_filename != item.filename:
            raise HostError("Archive contains an invalid filename.")
        name = relative_path(item.filename[:-1] if item.is_dir() else item.filename)
        parts = name.split("/")
        key = unicodedata.normalize("NFC", name).casefold()
        if key in paths:
            raise HostError("Archive contains colliding paths.")
        paths[key] = item
        for i in range(1, len(parts) + 1):
            spelling = "/".join(parts[:i])
            prefix = unicodedata.normalize("NFC", spelling).casefold()
            kind = "directory" if i < len(parts) or item.is_dir() else "file"
            if prefix in spellings and spellings[prefix] != spelling:
                raise HostError("Archive contains colliding paths.")
            if prefix in kinds and kinds[prefix] != kind:
                raise HostError("Archive contains conflicting paths.")
            kinds[prefix], spellings[prefix] = kind, spelling
        mode = item.external_attr >> 16
        if stat.S_IFMT(mode) not in (0, stat.S_IFDIR if item.is_dir() else stat.S_IFREG):
            raise HostError("Archive contains links or special files.")
        if item.flag_bits & 1 or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise HostError("Encrypted or unsupported ZIP entries are not supported.")
        if item.file_size > MAX_FILE or item.file_size > max(1024 * 1024, item.compress_size * MAX_RATIO):
            raise HostError("Archive exceeds the per-file size or compression limit.")
        total += item.file_size
        if total > MAX_TOTAL:
            raise HostError("Archive exceeds the expanded size limit.")
    names = {item.filename for item in entries if not item.is_dir()}
    target = requested if requested in names else None
    roots = {name.split("/")[0] for name in names}
    if target is None and len(roots) == 1:
        candidate = next(iter(roots)) + "/" + requested
        if candidate in names:
            target = candidate
    if target is None:
        raise HostError("Selected KiCad file is missing from this archive.")
    # Validate actual output size and CRC for EVERY member before creating files.
    actual_total = 0
    for item in entries:
        actual = 0
        with archive.open(item) as stream:
            while chunk := stream.read(1024 * 1024):
                actual += len(chunk)
                actual_total += len(chunk)
                if actual > item.file_size or actual > MAX_FILE or actual_total > MAX_TOTAL:
                    raise HostError("Archive exceeds the expanded size limit.")
        if actual != item.file_size:
            raise HostError("Archive entry size is invalid.")
    return entries, target


def installed_editors(config: dict) -> dict:
    if not isinstance(config, dict):
        raise HostError("Invalid native host configuration.")
    executable = local_path(config.get("kicadExecutable", ""))
    if executable.name.lower() != "kicad.exe":
        raise HostError("Configure the installed kicad.exe executable.")
    return {suffix: local_path(str(executable.parent / name)) for suffix, name in SUFFIXES.items()}


def handle(message: dict, config: dict) -> dict:
    if not isinstance(message, dict):
        raise HostError("Invalid request.")
    operation = message.get("operation")
    if operation not in ("status", "open-project"):
        raise HostError("Unsupported operation.")
    editors = installed_editors(config)
    if operation == "status":
        return {"ok": True, "available": True, "installedKiCad": True, "host": HOST_NAME}
    if set(message) != {"operation", "archivePath", "repository", "ref", "file"}:
        raise HostError("Invalid project request.")
    repository, revision = message["repository"], message["ref"]
    if (not isinstance(repository, str) or len(repository) > 240
            or not re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+", repository)
            or any(p in (".", "..") for p in repository.split("/"))):
        raise HostError("Invalid repository identity.")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", revision):
        raise HostError("Select a specific commit first.")
    requested = relative_path(message["file"])
    suffix = Path(requested).suffix.lower()
    if suffix not in editors:
        raise HostError("Select a KiCad project, schematic or PCB file.")
    source = local_path(message["archivePath"])
    if source.suffix.lower() != ".zip" or source.stat().st_size > MAX_ARCHIVE:
        raise HostError("Choose a ZIP archive no larger than 256 MiB.")
    destination = None
    # Keep the same open archive handle through both validation and extraction.
    with source.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or opened.st_size > MAX_ARCHIVE:
            raise HostError("Invalid archive file.")
        preflight_directory(stream)
        with zipfile.ZipFile(stream) as archive:
            entries, target = validate_archive(archive, requested)
            # The requested file must exist, even when its owning project can open.
            projects = [item.filename for item in entries
                        if not item.is_dir() and Path(item.filename).suffix.lower() == ".kicad_pro"]
            matching_project = str(Path(target).with_suffix(".kicad_pro")).replace("\\", "/")
            if matching_project in projects:
                target = matching_project
            elif suffix != ".kicad_pro" and len(projects) == 1:
                target = projects[0]
            suffix = Path(target).suffix.lower()
            local_path(str(source.parent), file=False)
            destination = Path(tempfile.mkdtemp(prefix="PocketKiVi-" + revision[:8] + "-", dir=source.parent))
            try:
                extracted_total = 0
                for item in entries:
                    output = destination.joinpath(*item.filename.rstrip("/").split("/"))
                    if item.is_dir():
                        output.mkdir(parents=True, exist_ok=True)
                    else:
                        output.parent.mkdir(parents=True, exist_ok=True)
                        with archive.open(item) as reader, output.open("xb") as writer:
                            extracted = 0
                            while chunk := reader.read(1024 * 1024):
                                extracted += len(chunk)
                                extracted_total += len(chunk)
                                if extracted > item.file_size or extracted_total > MAX_TOTAL:
                                    raise HostError("Archive changed while extracting.")
                                writer.write(chunk)
                            if extracted != item.file_size:
                                raise HostError("Archive changed while extracting.")
            except Exception:
                shutil.rmtree(destination)
                raise
    project = destination.joinpath(*target.split("/"))
    # Fixed trusted executable, no shell, no repository-controlled working directory.
    try:
        subprocess.Popen([str(editors[suffix]), str(project)], cwd=str(editors[suffix].parent),
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, close_fds=True, shell=False)
    except OSError:
        return {"ok": False, "error": "Project saved, but KiCad could not start.",
                "projectPath": str(project), "saved": True}
    return {"ok": True, "opened": True, "projectPath": str(project), "saved": True}


def read_exact(stream, size):
    result = bytearray()
    while len(result) < size:
        chunk = stream.read(size - len(result))
        if not chunk:
            raise HostError("Incomplete native message.")
        result.extend(chunk)
    return bytes(result)


def serve(reader, writer, config):
    try:
        size = struct.unpack("=I", read_exact(reader, 4))[0]
        if not 0 < size <= MAX_MESSAGE:
            raise HostError("Native message exceeds the size limit.")
        request = json.loads(read_exact(reader, size).decode("utf-8"))
        result = handle(request, config)
    except HostError as exc:
        result = {"ok": False, "error": str(exc)}
    except Exception:
        # This is the process boundary: never expose parser or OS exception data.
        result = {"ok": False, "error": "Could not validate or open the local project. Check the helper setup and ZIP archive."}
    encoded = json.dumps(result, ensure_ascii=True).encode("utf-8")
    writer.write(struct.pack("=I", len(encoded)) + encoded)
    writer.flush()


def main():
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        config_path = Path(__file__).with_name("native-host-config.json")
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        config = {}
    serve(sys.stdin.buffer, sys.stdout.buffer, config)


if __name__ == "__main__":
    main()
