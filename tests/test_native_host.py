import io
import json
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from kicad_vizdiff import native_host as host


class NativeHostTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in host.SUFFIXES.values():
            (self.root / name).write_bytes(b"test executable; never launched")
        self.config = {"kicadExecutable": str(self.root / "kicad.exe")}
        self.source = self.root / "download.zip"
        self.request = {"operation": "open-project", "archivePath": str(self.source),
                        "repository": "owner/repo", "ref": "a" * 40, "file": "folder/board.kicad_pcb"}

    def archive(self, entries):
        with zipfile.ZipFile(self.source, "w", zipfile.ZIP_DEFLATED) as z:
            for name, content in entries:
                z.writestr(name, content)

    def test_wrapped_project_extracted_and_safe_launch(self):
        self.archive([("repo-sha/folder/board.kicad_pcb", "(kicad_pcb)"), ("repo-sha/readme.txt", "read me")])
        with patch.object(host.subprocess, "Popen") as launch:
            response = host.handle(self.request, self.config)
        self.assertTrue(response["opened"])
        target = Path(response["projectPath"])
        self.assertEqual(target.read_text(), "(kicad_pcb)")
        self.assertEqual(target.parents[3], self.root)
        self.assertEqual(launch.call_args.args[0], [str(self.root / "pcbnew.exe"), str(target)])
        self.assertIs(launch.call_args.kwargs["shell"], False)
        self.assertEqual(launch.call_args.kwargs["cwd"], str(self.root))

    def test_exact_unwrapped_file_and_all_editors(self):
        for suffix, editor in host.SUFFIXES.items():
            self.request["file"] = "board" + suffix
            self.archive([(self.request["file"], "content")])
            with patch.object(host.subprocess, "Popen") as launch:
                result = host.handle(self.request, self.config)
            self.assertTrue(result["ok"])
            self.assertEqual(launch.call_args.args[0][0], str(self.root / editor))

    def test_status_does_not_create_project_or_launch(self):
        with patch.object(host.subprocess, "Popen") as launch:
            result = host.handle({"operation": "status"}, self.config)
        self.assertTrue(result["available"])
        launch.assert_not_called()
        self.assertNotIn(str(self.root), json.dumps(result))

    def test_prefers_matching_or_unique_project_but_does_not_guess(self):
        for project_files, expected in ((["folder/board.kicad_pro", "other.kicad_pro"], "folder/board.kicad_pro"),
                                        (["main.kicad_pro"], "main.kicad_pro"),
                                        (["one.kicad_pro", "two.kicad_pro"], "folder/board.kicad_pcb")):
            with self.subTest(project_files=project_files):
                self.archive([("folder/board.kicad_pcb", "pcb"), *[(name, "{}") for name in project_files]])
                with patch.object(host.subprocess, "Popen") as launch:
                    result = host.handle(self.request, self.config)
                self.assertTrue(result["projectPath"].replace("\\", "/").endswith("/" + expected))
                self.assertEqual(launch.call_args.args[0][0], str(self.root / host.SUFFIXES[Path(expected).suffix]))

    def test_unsafe_names_rejected_before_writes(self):
        for name in ("../evil", "/evil", "C:/evil", "a/../evil", "a//evil", "nul.txt", "a/evil.", "a:stream", "a/./b",
                     "COM¹", "LPT².txt", "nested/com³.dat", "CONIN$", "conout$.txt"):
            with self.subTest(name=name):
                self.archive([("folder/board.kicad_pcb", "ok"), (name, "evil")])
                before = set(self.root.iterdir())
                with self.assertRaises(host.HostError):
                    host.handle(self.request, self.config)
                self.assertEqual(set(self.root.iterdir()), before)

    def test_directory_preflight_rejects_before_zipfile_construction(self):
        self.archive([("folder/board.kicad_pcb", "ok")])
        valid = self.source.read_bytes()
        end = valid.rfind(b"PK\x05\x06")
        central = valid.find(b"PK\x01\x02")
        cases = []
        for location, fmt, value in ((end + 4, "H", 1), (end + 6, "H", 1),
                                     (end + 8, "H", 2), (end + 10, "H", host.MAX_ENTRIES + 1),
                                     (end + 12, "I", host.MAX_DIRECTORY + 1),
                                     (end + 16, "I", central + 1), (end + 20, "H", 10),
                                     (central + 28, "H", 4097), (central + 30, "H", 65535),
                                     (central + 34, "H", 1), (central + 42, "I", 0xffffffff)):
            changed = bytearray(valid)
            struct.pack_into("<" + fmt, changed, location, value)
            cases.append(bytes(changed))
        count_mismatch = bytearray(valid)
        struct.pack_into("<HH", count_mismatch, end + 8, 2, 2)
        cases.extend([bytes(count_mismatch), valid[:central] + b"FAIL" + valid[central + 4:], valid[:-1]])
        for index, data in enumerate(cases):
            with self.subTest(case=index):
                self.source.write_bytes(data)
                before = set(self.root.iterdir())
                with patch.object(host.zipfile, "ZipFile") as constructor:
                    with self.assertRaises(host.HostError):
                        host.handle(self.request, self.config)
                constructor.assert_not_called()
                self.assertEqual(set(self.root.iterdir()), before)

    def test_directory_actual_count_is_bounded_even_when_eocd_lies(self):
        self.archive([("folder/board.kicad_pcb", "ok"), ("extra", "x")])
        data = bytearray(self.source.read_bytes())
        end = data.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", data, end + 8, 1, 1)
        self.source.write_bytes(data)
        with patch.object(host, "MAX_ENTRIES", 1), patch.object(host.zipfile, "ZipFile") as constructor:
            with self.assertRaises(host.HostError):
                host.handle(self.request, self.config)
        constructor.assert_not_called()

    def test_zip64_extra_rejected_before_zipfile_construction(self):
        item = zipfile.ZipInfo("folder/board.kicad_pcb")
        item.extra = struct.pack("<HH", 1, 0)
        self.archive([(item, "ok")])
        with patch.object(host.zipfile, "ZipFile") as constructor:
            with self.assertRaises(host.HostError):
                host.handle(self.request, self.config)
        constructor.assert_not_called()

    def test_raw_backslash_and_corrupt_crc_rejected_before_writes(self):
        self.archive([("folder/board.kicad_pcb", "ok"), ("a/evil", "evil")])
        self.source.write_bytes(self.source.read_bytes().replace(b"a/evil", b"a\\evil"))
        with self.assertRaises(host.HostError):
            host.handle(self.request, self.config)
        with zipfile.ZipFile(self.source, "w", zipfile.ZIP_STORED) as archive:
            archive.writestr("folder/board.kicad_pcb", b"unique-payload")
        self.source.write_bytes(self.source.read_bytes().replace(b"unique-payload", b"broken-payload"))
        before = set(self.root.iterdir())
        with self.assertRaises(zipfile.BadZipFile):
            host.handle(self.request, self.config)
        self.assertEqual(set(self.root.iterdir()), before)

    def test_collisions_and_special_files_rejected(self):
        for names in (("A/file", "a/other"), ("a", "a/b"), ("a/b", "a"), ("x", "X"), ("é/a", "e\u0301/b")):
            self.archive([("folder/board.kicad_pcb", "ok"), *[(n, "x") for n in names]])
            with self.assertRaises(host.HostError):
                host.handle(self.request, self.config)
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.archive([("folder/board.kicad_pcb", "ok"), (link, "../outside")])
        with self.assertRaises(host.HostError):
            host.handle(self.request, self.config)

    def test_budget_rejections(self):
        self.archive([("folder/board.kicad_pcb", "x" * 100)])
        for limit in ("MAX_FILE", "MAX_TOTAL", "MAX_ARCHIVE", "MAX_ENTRIES"):
            with self.subTest(limit=limit), patch.object(host, limit, 0):
                with self.assertRaises(host.HostError):
                    host.handle(self.request, self.config)
        self.archive([("folder/board.kicad_pcb", "x" * (2 * 1024 * 1024))])
        with patch.object(host, "MAX_RATIO", 1), self.assertRaises(host.HostError):
            host.handle(self.request, self.config)

    def test_invalid_request_and_missing_member(self):
        self.archive([("other.kicad_pcb", "x")])
        for update in ({"ref": "main"}, {"file": "../x.kicad_pro"}, {"file": "script.exe"},
                       {"repository": "../repo"}, {"operation": "run"}, {"command": "evil"}, {}):
            with self.subTest(update=update), self.assertRaises(host.HostError):
                host.handle({**self.request, **update}, self.config)

    def test_launch_failure_keeps_downloaded_project(self):
        self.archive([("folder/board.kicad_pcb", "x")])
        with patch.object(host.subprocess, "Popen", side_effect=OSError("secret diagnostic")):
            result = host.handle(self.request, self.config)
        self.assertFalse(result["ok"])
        self.assertTrue(Path(result["projectPath"]).exists())
        self.assertNotIn("secret", json.dumps(result))

    def test_repeated_open_creates_unique_copy(self):
        self.archive([("folder/board.kicad_pcb", "x")])
        with patch.object(host.subprocess, "Popen"):
            first = host.handle(self.request, self.config)
            second = host.handle(self.request, self.config)
        self.assertNotEqual(first["projectPath"], second["projectPath"])

    def test_protocol(self):
        message = json.dumps({"operation": "status"}).encode()
        for frame, expected in ((struct.pack("=I", len(message)) + message, True),
                                (struct.pack("=I", host.MAX_MESSAGE + 1), False),
                                (struct.pack("=I", 10) + b"{}", False),
                                (struct.pack("=I", 2) + b"{{", False)):
            output = io.BytesIO()
            host.serve(io.BytesIO(frame), output, self.config)
            raw = output.getvalue()
            self.assertEqual(struct.unpack("=I", raw[:4])[0], len(raw) - 4)
            self.assertEqual(json.loads(raw[4:])["ok"], expected)


if __name__ == "__main__":
    unittest.main()
