"""Delegate geometry and lettering to KiCad's own SVG exporter."""

import base64
import os
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

from .git import VizError, run, safe_path

DEFAULT_LAYERS = "F.Cu,B.Cu,F.Silkscreen,B.Silkscreen,Edge.Cuts"


def find_kicad(explicit=None):
    candidate = explicit or os.environ.get("KICAD_CLI") or shutil.which("kicad-cli")
    if candidate:
        return str(candidate)
    if os.name == "nt":
        installs = list((Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "KiCad").glob("*/bin/kicad-cli.exe"))
        if installs:
            return str(max(installs, key=lambda p: tuple(int(x) for x in re.findall(r"\d+", p.parts[-3]))))
    mac = Path("/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
    if mac.exists():
        return str(mac)
    raise VizError("KiCad CLI not found. Install KiCad 9+ or pass --kicad-cli PATH.")


def render(project, relative, output, executable, layers=DEFAULT_LAYERS, theme=None):
    project = Path(project).resolve()
    output = Path(output).resolve()
    source = safe_path(project, relative)
    if not source.exists():
        return {}
    if source.suffix not in (".kicad_sch", ".kicad_pcb"):
        raise VizError("Choose a .kicad_sch or .kicad_pcb file (use the root schematic for hierarchical sheets).")
    output.mkdir(parents=True, exist_ok=True)
    extra = ["--theme", theme] if theme else []
    if source.suffix == ".kicad_sch":
        run([executable, "sch", "export", "svg", "--output", str(output) + os.sep,
             "--no-background-color", *extra, str(source)], cwd=source.parent)
        svg_files = sorted(output.glob("*.svg"), key=lambda p: (p.stem != source.stem, p.name))
        pages = {p.name: p.read_text(encoding="utf-8") for p in svg_files}
    else:
        requested = list(dict.fromkeys(x.strip() for x in layers.split(",") if x.strip()))
        if not requested:
            raise VizError("At least one PCB layer must be selected.")
        pages = {}
        selections = [("All selected layers", ",".join(requested))]
        if len(requested) > 1:
            selections += [(layer, layer) for layer in requested]
        for index, (label, selection) in enumerate(selections):
            target = output / f"layer-{index}.svg"
            # Fixed paper coordinates, never fit-to-board independently per revision.
            run([executable, "pcb", "export", "svg", "--output", str(target),
                 "--layers", selection, "--mode-single", "--page-size-mode", "0",
                 *extra, str(source)], cwd=source.parent)
            pages[label] = target.read_text(encoding="utf-8")
    if not pages:
        raise VizError(f"KiCad produced no SVG output for {relative}.")
    return pages


def bounds(svg):
    try:
        root = ET.fromstring(svg)
        box = [float(v) for v in root.attrib["viewBox"].replace(",", " ").split()]
        if len(box) != 4 or box[2] <= 0 or box[3] <= 0:
            raise ValueError("invalid viewBox")
        return box
    except (ET.ParseError, KeyError, ValueError) as exc:
        raise VizError(f"Invalid SVG output: {exc}") from exc


def image_uri(svg, box):
    if svg is None:
        return None
    # SVGs are used only as image sources, never injected into the report DOM.
    value = " ".join(f"{v:g}" for v in box)
    svg = re.sub(r'viewBox="[^"]*"', f'viewBox="{value}"', svg, count=1)
    # Match physical aspect ratio to the shared viewBox for revisions with different paper sizes.
    svg = re.sub(r'(<svg\b[^>]*?)\bwidth="[^"]*"', lambda m: m[1] + f'width="{box[2]}mm"', svg, count=1)
    svg = re.sub(r'(<svg\b[^>]*?)\bheight="[^"]*"', lambda m: m[1] + f'height="{box[3]}mm"', svg, count=1)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def pair_pages(before, after):
    pages = []
    for name in dict.fromkeys([*before, *after]):
        old, new = before.get(name), after.get(name)
        boxes = [bounds(svg) for svg in (old, new) if svg is not None]
        x, y = min(b[0] for b in boxes), min(b[1] for b in boxes)
        box = [x, y, max(b[0] + b[2] for b in boxes) - x, max(b[1] + b[3] for b in boxes) - y]
        pages.append({"name": name, "before": image_uri(old, box), "after": image_uri(new, box),
                      "box": box, "width": box[2], "height": box[3],
                      "status": "added" if old is None else "removed" if new is None else "paired"})
    return pages


def add_drawing_boxes(pages, before_objects, after_objects, pcb=False):
    """Attach revision-aligned drawing extents in KiCad sheet coordinates."""
    for page in pages:
        name = page['name']
        objects = [o for o in [*before_objects, *after_objects]
                   if name in o.get('pages', []) or o.get('page') == name]
        if pcb:
            outlines = [o for o in [*before_objects, *after_objects]
                        if o.get('properties', {}).get('Layer') == 'Edge.Cuts']
            if outlines:
                objects = outlines
        points = []
        for obj in objects:
            props = obj.get('properties') or {}
            for candidate in ((obj.get('x'), obj.get('y')), props.get('Start'),
                              props.get('End'), props.get('Mid'), props.get('Center')):
                if (isinstance(candidate, (list, tuple)) and len(candidate) == 2
                        and all(isinstance(v, (int, float)) for v in candidate)):
                    points.append(candidate)
            for candidate in props.get('Points') or []:
                if (isinstance(candidate, (list, tuple)) and len(candidate) == 2
                        and all(isinstance(v, (int, float)) for v in candidate)):
                    points.append(candidate)
        if points:
            x0, x1 = min(p[0] for p in points), max(p[0] for p in points)
            y0, y1 = min(p[1] for p in points), max(p[1] for p in points)
            page['drawingBox'] = [x0, y0, max(x1-x0, 0.1), max(y1-y0, 0.1)]
    return pages
