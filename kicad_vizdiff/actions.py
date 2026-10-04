"""Produce revision-bound Actions reports, including renamed and deleted drawings."""
import html
import json
from pathlib import Path
from urllib.parse import quote

from .render import DEFAULT_LAYERS
from .git import VizError, git, resolve, root, safe_path

DRAWINGS = {'.kicad_sch', '.kicad_pcb'}


def changed(repo, base, head):
    fields = git(repo, 'diff', '--name-status', '-z', '--find-renames',
                 '--diff-filter=ACDMRT', base, head, '--').split(b'\0')
    records, cursor = [], 0
    while cursor < len(fields) and fields[cursor]:
        status = fields[cursor].decode('ascii')
        cursor += 1
        old = fields[cursor].decode('utf-8')
        cursor += 1
        name = old
        if status[0] in 'RC':
            name = fields[cursor].decode('utf-8')
            cursor += 1
        old_kind, new_kind = Path(old).suffix, Path(name).suffix
        # A move across drawing formats is a deletion and an addition.
        if status[0] in 'RC' and old_kind != new_kind:
            if old_kind in DRAWINGS and status[0] == 'R':
                records.append({'file': old, 'oldFile': old, 'status': 'D'})
            if new_kind in DRAWINGS:
                records.append({'file': name, 'oldFile': name, 'status': 'A'})
        elif new_kind in DRAWINGS:
            records.append({'file': name, 'oldFile': old, 'status': status})
    if len(records) > 256:
        raise VizError('More than 256 changed drawings; split the review into smaller changes.')
    return records


def review(base, head, output='kicad-review', repo='.', merge_base=False, renderer=None,
           layers=DEFAULT_LAYERS, theme=None, kicad_cli=None):
    if renderer is None:
        from .cli import main
        renderer = main
    repo = root(Path(repo))
    base, head = resolve(repo, base), resolve(repo, head)
    if merge_base:
        base = git(repo, 'merge-base', base, head).decode('ascii').strip()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = changed(repo, base, head)
    result = 0
    for record in records:
        # Retain the drawing extension to prevent PCB/schematic name collisions.
        report = record['file'] + '.html'
        target = safe_path(output, report)
        arguments = ['diff', record['file'], '--repo', str(repo), '--old-file',
                     record['oldFile'], '--base', base, '--head', head,
                     '--output', str(target), '--layers', layers]
        if theme:
            arguments.extend(['--theme', theme])
        if kicad_cli:
            arguments.extend(['--kicad-cli', kicad_cli])
        code = renderer(arguments)
        record.update(report=report, success=code == 0)
        result |= code
    evidence = {'base': base, 'head': head, 'mergeBase': merge_base, 'files': records}
    (output / 'review.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    rows = []
    for record in records:
        label = html.escape(record['file'])
        if record['success']:
            label = '<a href="' + quote(record['report'], safe='/') + '">' + label + '</a>'
        else:
            label += ' — rendering failed (see Actions log)'
        rows.append('<li>' + html.escape(record['status']) + ' · ' + label + '</li>')
    listing = '<ul>' + ''.join(rows) + '</ul>' if rows else '<p>No changed KiCad drawings.</p>'
    (output / 'index.html').write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>KiCad visual review</title>'
        '<h1>KiCad visual review</h1><p>Base: <code>' + base + '</code><br>Head: <code>'
        + head + '</code></p>' + listing + '</html>', encoding='utf-8')
    return result

