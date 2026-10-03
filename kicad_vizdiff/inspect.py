"""Index selectable KiCad objects for an SVG viewer.

Coordinates are KiCad millimetres in the exported sheet/board coordinate space.
KiCad's SVG exporter remains responsible for all visible geometry and lettering.
"""

from __future__ import annotations

from math import cos, radians, sin
from pathlib import Path

from .git import VizError, safe_path

MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_DEPTH = 512
MAX_NODES = 750_000


def _tokens(source):
    """Scan KiCad S-expressions without mistaking quoted parentheses for syntax."""
    i, length = 0, len(source)
    while i < length:
        c = source[i]
        if c.isspace():
            i += 1
        elif c == ';':
            end = source.find('\n', i)
            i = length if end < 0 else end + 1
        elif c in '()':
            yield c
            i += 1
        elif c == '"':
            i += 1
            parts = []
            start = i
            while i < length:
                c = source[i]
                if c == '"':
                    parts.append(source[start:i])
                    i += 1
                    break
                if c == '\\':
                    parts.append(source[start:i])
                    i += 1
                    if i >= length:
                        raise VizError('Unterminated KiCad string escape.')
                    parts.append({'n': '\n', 'r': '\r', 't': '\t'}.get(source[i], source[i]))
                    i += 1
                    start = i
                else:
                    i += 1
            else:
                raise VizError('Unterminated KiCad string.')
            yield ('atom', ''.join(parts))
        else:
            start = i
            while i < length and not source[i].isspace() and source[i] not in '();':
                i += 1
            if i == start:
                raise VizError('Invalid KiCad token.')
            yield ('atom', source[start:i])


def _parse(source):
    stack = []
    root = None
    nodes = 0
    for token in _tokens(source):
        if token == '(':
            nodes += 1
            if nodes > MAX_NODES:
                raise VizError('KiCad file contains too many expressions.')
            if len(stack) >= MAX_DEPTH:
                raise VizError('KiCad file nesting is too deep.')
            node = []
            if stack:
                stack[-1].append(node)
            elif root is not None:
                raise VizError('KiCad file contains multiple root expressions.')
            else:
                root = node
            stack.append(node)
        elif token == ')':
            if not stack:
                raise VizError('Unexpected closing parenthesis in KiCad file.')
            stack.pop()
        elif stack:
            stack[-1].append(token[1])
        else:
            raise VizError('Unexpected text outside KiCad root expression.')
    if stack or not isinstance(root, list) or not root:
        raise VizError('Incomplete KiCad S-expression.')
    return root


def _read(path):
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise VizError(f'KiCad file exceeds {MAX_FILE_BYTES // (1024 * 1024)} MiB: {path.name}')
    try:
        return _parse(path.read_text(encoding='utf-8-sig'))
    except (UnicodeError, OSError) as exc:
        raise VizError(f'Could not read KiCad file {path.name}: {exc}') from exc


def _children(node, key):
    return [part for part in node[1:] if isinstance(part, list) and part and part[0] == key]


def _child(node, key):
    return next((part for part in node[1:] if isinstance(part, list) and part and part[0] == key), None)


def _value(node, key, default=None):
    part = _child(node, key)
    return part[1] if part is not None and len(part) > 1 else default


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _point(node, key='at'):
    part = _child(node, key)
    if part is None or len(part) < 3:
        return None
    x, y = _number(part[1]), _number(part[2])
    return (x, y) if x is not None and y is not None else None


def _xy(node):
    if not isinstance(node, list) or len(node) < 3 or node[0] != 'xy':
        return None
    x, y = _number(node[1]), _number(node[2])
    return (x, y) if x is not None and y is not None else None


def _properties(node):
    return {p[1]: p[2] for p in _children(node, 'property') if len(p) >= 3}


def _identifier(node, prefix, index):
    return str(_value(node, 'uuid') or f'{prefix}:{index}')


def _object(node, kind, title, point, props, prefix, index, page=None, **extra):
    if point is None:
        return None
    item = {'id': _identifier(node, prefix, index), 'type': kind, 'title': str(title),
            'x': point[0], 'y': point[1], 'properties': props}
    if page is not None:
        item['page'] = page
    item.update(extra)
    return item


def _page_for(path, name, pages, root=False):
    if not pages:
        return None
    if root:
        exact = [p for p in pages if Path(p).stem.casefold() == path.stem.casefold()]
        if len(exact) == 1:
            return exact[0]
        return pages[0] if len(pages) == 1 else None
    # KiCad uses root-and-sheet names in its exported SVG filenames. Only use
    # this hint when it selects one page unambiguously.
    choices = []
    for page in pages:
        stem = Path(page).stem.casefold()
        for hint in (path.stem.casefold(), name.casefold()):
            if hint and (stem == hint or stem.endswith('-' + hint) or stem.endswith('_' + hint)):
                choices.append(page)
                break
    return choices[0] if len(choices) == 1 else None


def _schematic_objects(tree, sheet_id, page):
    result = []
    counts = {}
    for node in tree[1:]:
        if not isinstance(node, list) or not node:
            continue
        kind = node[0]
        if kind not in ('symbol', 'sheet', 'label', 'global_label', 'hierarchical_label',
                        'text', 'text_box', 'junction', 'no_connect', 'wire', 'bus',
                        'polyline', 'rectangle', 'circle', 'arc'):
            continue
        counts[kind] = counts.get(kind, 0) + 1
        index = counts[kind]
        prefix = f'{sheet_id}:{kind}'
        props = _properties(node)
        if kind == 'symbol':
            # Library definitions also use (symbol ...) but only placed symbols
            # are direct root children, as selected here.
            props = {'Reference': props.get('Reference', ''), 'Value': props.get('Value', ''),
                     'Library': _value(node, 'lib_id', ''), 'Unit': _value(node, 'unit', '') ,
                     **{k: v for k, v in props.items() if k not in ('Reference', 'Value')}}
            title = props['Reference'] or props['Value'] or 'Symbol'
            point = _point(node)
        elif kind == 'sheet':
            title = props.get('Sheetname', 'Sheet')
            props = {'Sheetname': title, 'Sheetfile': props.get('Sheetfile', ''),
                     **{k: v for k, v in props.items() if k not in ('Sheetname', 'Sheetfile')}}
            point = _point(node)
        elif kind in ('wire', 'bus', 'polyline'):
            pts = _child(node, 'pts')
            coords = [_xy(x) for x in pts[1:]] if pts else []
            coords = [p for p in coords if p]
            point = (sum(p[0] for p in coords) / len(coords), sum(p[1] for p in coords) / len(coords)) if coords else None
            title = kind.replace('_', ' ').title()
            if coords:
                props['Points'] = coords
        elif kind in ('rectangle', 'circle', 'arc'):
            point = _point(node, 'center') or _point(node, 'start')
            title = kind.title()
        else:
            point = _point(node)
            title = node[1] if len(node) > 1 and isinstance(node[1], str) and kind not in ('junction', 'no_connect') else kind.replace('_', ' ').title()
        item = _object(node, kind, title, point, props, prefix, index, page, sheetId=sheet_id)
        if item:
            if kind == 'sheet':
                item['targetSheetId'] = f'{sheet_id}/{_identifier(node, prefix, index)}'
            # The instance path disambiguates repeated sub-sheet files.
            item['id'] = f'{sheet_id}:{item["id"]}'
            result.append(item)
    return result


def _pcb_objects(tree, page, pages):
    result = []
    counts = {}
    net_names = {n[1]: n[2] for n in _children(tree, 'net') if len(n) >= 3}
    for node in tree[1:]:
        if not isinstance(node, list) or not node:
            continue
        kind = node[0]
        if kind not in ('footprint', 'segment', 'arc', 'via', 'zone', 'gr_text', 'gr_text_box',
                        'gr_line', 'gr_arc', 'gr_rect', 'gr_circle', 'gr_poly', 'dimension', 'target'):
            continue
        counts[kind] = counts.get(kind, 0) + 1
        index = counts[kind]
        prefix = f'pcb:{kind}'
        props = _properties(node)
        if kind == 'footprint':
            point = _point(node)
            title = props.get('Reference') or (node[1] if len(node) > 1 else 'Footprint')
            props = {'Reference': props.get('Reference', ''), 'Value': props.get('Value', ''),
                     'Library': node[1] if len(node) > 1 and isinstance(node[1], str) else '',
                     'Layer': _value(node, 'layer', ''),
                     **{k: v for k, v in props.items() if k not in ('Reference', 'Value')}}
        elif kind == 'segment':
            start, end = _point(node, 'start'), _point(node, 'end')
            point = ((start[0]+end[0])/2, (start[1]+end[1])/2) if start and end else None
            title = 'Track'
            props = {'Layer': _value(node, 'layer', ''), 'Width': _value(node, 'width', ''),
                     'Net': net_names.get(_value(node, 'net'), _value(node, 'net', '')),
                     'Start': start, 'End': end}
        elif kind == 'via':
            point = _point(node)
            title = 'Via'
            layers = _child(node, 'layers')
            props = {'Layers': layers[1:] if layers else [], 'Size': _value(node, 'size', ''),
                     'Drill': _value(node, 'drill', ''),
                     'Net': net_names.get(_value(node, 'net'), _value(node, 'net', ''))}
        elif kind == 'zone':
            polygon = _child(node, 'polygon')
            pts = _child(polygon, 'pts') if polygon else None
            coords = [_xy(x) for x in pts[1:]] if pts else []
            coords = [p for p in coords if p]
            point = (sum(p[0] for p in coords)/len(coords), sum(p[1] for p in coords)/len(coords)) if coords else None
            title = 'Copper zone'
            props = {'Layer': _value(node, 'layer', ''), 'Net': _value(node, 'net_name', ''),
                     'Name': _value(node, 'name', '')}
        elif kind in ('arc', 'gr_arc', 'gr_line', 'gr_rect', 'gr_circle', 'gr_poly'):
            point = _point(node, 'mid') or _point(node, 'center') or _point(node, 'start')
            title = kind.replace('gr_', '').replace('_', ' ').title()
            props = {'Layer': _value(node, 'layer', ''), 'Width': _value(node, 'width', ''),
                     'Start': _point(node, 'start'), 'End': _point(node, 'end'),
                     'Mid': _point(node, 'mid'), 'Center': _point(node, 'center')}
        elif kind in ('gr_text', 'gr_text_box'):
            point = _point(node)
            title = node[1] if len(node) > 1 else 'Text'
            props = {'Text': title, 'Layer': _value(node, 'layer', '')}
        else:
            point = _point(node)
            title = kind.title()
        item = _object(node, kind, title, point, props, prefix, index, page)
        if item:
            object_layers = props.get('Layers') or ([props['Layer']] if props.get('Layer') else [])
            item['pages'] = [p for p in pages if p == page or p in object_layers]
            result.append(item)
        if kind != 'footprint' or point is None:
            continue
        fp_id = item['id'] if item else _identifier(node, prefix, index)
        at = _child(node, 'at')
        angle = _number(at[3]) if at and len(at) > 3 else 0.0
        angle = angle or 0.0
        c, s = cos(radians(angle)), sin(radians(angle))
        for pad_index, pad in enumerate(_children(node, 'pad'), start=1):
            local = _point(pad)
            if local is None:
                continue
            # KiCad's board Y axis points down; positive footprint angle turns
            # local +X toward board -Y.
            absolute = (point[0] + local[0]*c + local[1]*s,
                        point[1] - local[0]*s + local[1]*c)
            number = pad[1] if len(pad) > 1 else ''
            net = _child(pad, 'net')
            layers = _child(pad, 'layers')
            size = _child(pad, 'size')
            pad_props = {'Number': number, 'Footprint': title, 'Type': pad[2] if len(pad) > 2 else '',
                         'Shape': pad[3] if len(pad) > 3 else '',
                         'Size': size[1:] if size else [], 'Layers': layers[1:] if layers else [],
                         'Net': net[2] if net and len(net) > 2 else net_names.get(net[1], '') if net and len(net) > 1 else ''}
            pad_item = _object(pad, 'pad', f'{title} pad {number}', absolute, pad_props,
                               f'{fp_id}:pad', pad_index, page, footprintId=fp_id)
            pad_item['pages'] = [p for p in pages if p == page or p in pad_props['Layers']
                                 or any(layer.startswith('*.') and p.endswith(layer[1:])
                                        for layer in pad_props['Layers'])]
            result.append(pad_item)
    return result


def inspect(project_root: Path, relative: str, pages: list[str] | None = None) -> dict:
    """Return JSON-ready ``objects`` and ``sheets`` for a repository file.

    ``pages`` should be the KiCad SVG exporter filenames from the same revision.
    A missing/ambiguous page is left unset; the caller must not place it on an
    arbitrary SVG. Child sheet paths are constrained to ``project_root``.
    """
    project_root = Path(project_root).resolve()
    source = safe_path(project_root, relative)
    if not source.exists():
        return {'objects': [], 'sheets': []}
    if source.suffix not in ('.kicad_sch', '.kicad_pcb'):
        raise VizError('Object inspection requires a .kicad_sch or .kicad_pcb file.')
    tree = _read(source)
    if source.suffix == '.kicad_pcb':
        if tree[0] != 'kicad_pcb':
            raise VizError('Expected a KiCad PCB file.')
        board_pages = pages or []
        page = next((p for p in board_pages if p == 'All selected layers'), None)
        if page is None:
            page = _page_for(source, '', board_pages, root=True)
        return {'objects': _pcb_objects(tree, page, board_pages), 'sheets': []}
    if tree[0] != 'kicad_sch':
        raise VizError('Expected a KiCad schematic file.')
    objects, sheets = [], []
    seen = set()

    def visit(path, root_tree, sheet_id, name, parent_id, depth):
        if depth > 64:
            raise VizError('Schematic hierarchy is too deep.')
        resolved = path.resolve()
        if resolved in seen:
            # A repeated sheet is valid; a cycle on the active route is not.
            return
        seen.add(resolved)
        try:
            page = _page_for(path, name, pages or [], root=parent_id is None)
            sheets.append({'id': sheet_id, 'name': name, 'file': path.relative_to(project_root).as_posix(),
                           'parentId': parent_id, 'page': page})
            local_objects = _schematic_objects(root_tree, sheet_id, page)
            objects.extend(local_objects)
            for sheet_index, sheet in enumerate(_children(root_tree, 'sheet'), start=1):
                props = _properties(sheet)
                filename = props.get('Sheetfile')
                if not filename or '\\' in filename or ':' in filename:
                    continue
                candidate = (path.parent / filename).resolve()
                if not candidate.is_relative_to(project_root) or not candidate.is_file():
                    continue
                child_id = f'{sheet_id}/{_identifier(sheet, f"{sheet_id}:sheet", sheet_index)}'
                child_tree = _read(candidate)
                if child_tree[0] != 'kicad_sch':
                    continue
                visit(candidate, child_tree, child_id, props.get('Sheetname', candidate.stem), sheet_id, depth + 1)
        finally:
            seen.remove(resolved)

    visit(source, tree, str(_value(tree, 'uuid') or relative), source.stem, None, 0)
    return {'objects': objects, 'sheets': sheets}
