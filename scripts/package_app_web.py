"""Stage the hosted browser viewer and its audited, locally bundled engines."""

from pathlib import Path
import shutil
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from kicad_vizdiff.app_assets import VIEWER_PAGES, RENDERER_ASSETS, VENDOR_ASSETS
SOURCE = ROOT / "app_web"
VENDOR = ROOT / "extension" / "vendor"
RENDERER = ROOT / "extension"
OUTPUT = ROOT / ".vizdiff" / "app-web"
ARCHIVE = ROOT / ".vizdiff" / "kicad-visual-review-app-web.zip"
PAGES = VIEWER_PAGES
ASSETS = VENDOR_ASSETS
RENDERERS = RENDERER_ASSETS


def package() -> None:
    for name in PAGES:
        if not (SOURCE / name).is_file():
            raise SystemExit(f"Missing hosted viewer source: {name}")
    for name in ASSETS:
        if not (VENDOR / name).is_file():
            raise SystemExit(f"Missing bundled viewer dependency: {name}")
    for name in RENDERERS:
        if not (RENDERER / name).is_file():
            raise SystemExit(f"Missing owned renderer source: {name}")
    if OUTPUT.exists():
        allowed = (ROOT / ".vizdiff").resolve()
        if OUTPUT.is_symlink() or not OUTPUT.resolve().is_relative_to(allowed):
            raise SystemExit("Refusing to replace viewer output outside .vizdiff")
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "vendor").mkdir(exist_ok=True)
    for name in PAGES:
        shutil.copy2(SOURCE / name, OUTPUT / name)
    for name in ASSETS:
        destination = OUTPUT / "vendor" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(VENDOR / name, destination)
    for name in RENDERERS:
        shutil.copy2(RENDERER / name, OUTPUT / name)
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in PAGES + RENDERERS + tuple('vendor/'+name for name in ASSETS):
            archive.write(OUTPUT / name, name)
    print(OUTPUT)
    print(ARCHIVE)


if __name__ == "__main__":
    package()
