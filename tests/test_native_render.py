"""One end-to-end check of real KiCad pages, Git revisions and sheet navigation."""
import json
from pathlib import Path
import re
import tempfile
import unittest

from kicad_vizdiff.cli import main
from kicad_vizdiff.git import git
from kicad_vizdiff.render import find_kicad
from kicad_vizdiff.git import VizError
from tests.fixtures import schematic, uid


class NativeRenderTests(unittest.TestCase):
    def test_full_page_hierarchy_and_git_diff(self):
        try:
            find_kicad()
        except VizError:
            self.skipTest('KiCad CLI is not installed')
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            git(repo, 'init')
            child_id = uid('child')
            root = schematic().replace('(sheet_instances (path "/" (page "1")))',
                f'''(sheet (at 30 30) (size 20 12) (uuid "{child_id}")
                     (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch"))
                    (sheet_instances (path "/" (page "1")))''')
            (repo / 'sensor.kicad_sch').write_text(root, encoding='utf-8')
            (repo / 'power.kicad_sch').write_text(schematic(), encoding='utf-8')
            git(repo, 'add', '.')
            git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                '-c', 'commit.gpgsign=false', 'commit', '-m', 'Base')
            (repo / 'power.kicad_sch').write_text(schematic(True), encoding='utf-8')
            git(repo, 'add', '.')
            git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                '-c', 'commit.gpgsign=false', 'commit', '-m', 'Head')
            output = repo / 'review.html'
            self.assertEqual(main(['diff', 'sensor.kicad_sch', '--repo', str(repo),
                                   '--base', 'HEAD~1', '--head', 'HEAD', '--output', str(output)]), 0)
            match = re.search(r'<script id="report-data" type="application/json">(.*?)</script>',
                              output.read_text(encoding='utf-8'), re.S)
            self.assertIsNotNone(match)
            report = json.loads(match.group(1))
            self.assertEqual(len(report['pages']), 2)
            self.assertEqual(report['pages'][0]['name'], 'sensor.svg')
            self.assertTrue(all(p['width'] > 200 and p['height'] > 180 for p in report['pages']))
            root_page = next(p for p in report['pages'] if p['name'] == 'sensor.svg')
            self.assertTrue(root_page['before'] and root_page['after'])
            sheet = next(o for o in report['objects'] if o['type'] == 'sheet')
            target = next(s for s in report['sheets'] if s['id'] == sheet['targetSheetId'])
            self.assertEqual(target['page'], 'sensor-Power.svg')
            self.assertTrue(any(o['type'] == 'symbol' and o['page'] == target['page']
                                for o in report['objects']))


if __name__ == '__main__':
    unittest.main()
