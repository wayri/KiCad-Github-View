"""Explicit per-user Windows installation of the Pocket KiVi native host."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys

HOST_NAME = "dev.pocketkivi.kicad"


def batch_literal(path):
    value = str(path)
    # Batch expansion happens even inside quotes. Reject rather than escape it.
    if any(c in value for c in '%!^&|<>\r\n"'):
        raise ValueError("Installation paths must not contain batch metacharacters.")
    return '"' + value + '"'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome-id", action="append", default=[], help="Exact 32-letter Chrome/Chromium extension ID")
    parser.add_argument("--edge-id", action="append", default=[], help="Exact 32-letter Edge extension ID")
    parser.add_argument("--firefox-id", action="append", default=[], help="Exact installed Firefox add-on ID")
    parser.add_argument("--kicad", required=True, type=Path, help="Full installed kicad.exe path")
    args = parser.parse_args(argv)
    if os.name != "nt":
        parser.error("This installer supports Windows only.")
    if not (args.chrome_id or args.edge_id or args.firefox_id):
        parser.error("Specify at least one browser extension ID.")
    for extension_id in args.chrome_id + args.edge_id:
        if not re.fullmatch(r"[a-p]{32}", extension_id):
            parser.error("Chromium extension IDs must contain exactly 32 letters a-p.")
    for extension_id in args.firefox_id:
        if not re.fullmatch(r"[A-Za-z0-9_@.{}+-]{1,255}", extension_id):
            parser.error("Invalid Firefox add-on ID.")
    # Import only our trusted source. The installed host is standalone and uses -I.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from kicad_vizdiff.native_host import installed_editors, local_path
    executable = local_path(str(args.kicad))
    installed_editors({"kicadExecutable": str(executable)})
    python = local_path(sys.executable)
    if python.name.lower() == "pythonw.exe":
        parser.error("Run this installer with console Python, not pythonw.exe.")
    home = local_path(os.environ["LOCALAPPDATA"], file=False)
    destination = home / "PocketKiVi" / "native-host"
    launcher = destination / "launch.bat"
    source = Path(__file__).resolve().parents[1] / "kicad_vizdiff" / "native_host.py"
    command = "@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\n" + batch_literal(python) + " -I -u " + batch_literal(destination / "native_host.py") + "\r\n"
    # Refuse stale registrations to another installation; never overwrite existing data.
    import winreg
    registrations = []
    for product, ids, key in (("Google\\Chrome", args.chrome_id, "allowed_origins"),
                             ("Microsoft\\Edge", args.edge_id, "allowed_origins"),
                             ("Mozilla", args.firefox_id, "allowed_extensions")):
        if not ids:
            continue
        registry_path = "Software\\" + product + "\\NativeMessagingHosts\\" + HOST_NAME
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry_path):
                parser.error("This host is already registered. Remove its registration before reinstalling.")
        except FileNotFoundError:
            pass
        manifest = {"name": HOST_NAME, "description": "Open a saved KiCad project with installed KiCad",
                    "path": str(launcher), "type": "stdio",
                    key: ["chrome-extension://" + item + "/" for item in ids] if key == "allowed_origins" else ids}
        registrations.append((registry_path, product.replace("\\", "-") + ".json", manifest))
    # Resolve parent links before writes; do not follow a pre-existing junction.
    if destination.parent.exists():
        local_path(str(destination.parent), file=False)
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(source, destination / "native_host.py")
    (destination / "native-host-config.json").write_text(json.dumps({"kicadExecutable": str(executable)}), encoding="utf-8")
    launcher.write_bytes(command.encode("utf-8"))
    for registry_path, filename, manifest in registrations:
        manifest_path = destination / filename
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, registry_path) as registry_key:
            winreg.SetValueEx(registry_key, "", 0, winreg.REG_SZ, str(manifest_path))
    print("Installed optional Pocket KiVi host at " + str(destination))
    print("Restart the browser and choose Open in KiCad. Managed policies may block native messaging.")


if __name__ == "__main__":
    main()
