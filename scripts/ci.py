"""Render changed KiCad files on GitHub Actions using the checked-out full history."""
import os
from pathlib import Path
import subprocess

from kicad_vizdiff.cli import main


def changed(base, head):
    raw = subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=ACMR', '-z',
                                   base, head, '--', '*.kicad_sch', '*.kicad_pcb'])
    return [p.decode() for p in raw.split(b'\0') if p]


if __name__ == '__main__':
    base = os.environ.get('BASE_SHA') or 'HEAD~1'
    head = os.environ.get('HEAD_SHA') or 'HEAD'
    result = 0
    for name in changed(base, head):
        output = Path('kicad-review') / Path(name).with_suffix('.html')
        result |= main(['diff', name, '--base', base, '--head', head, '--output', str(output)])
    raise SystemExit(result)
