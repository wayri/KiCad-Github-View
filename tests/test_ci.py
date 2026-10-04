"""Actions comparison coverage against actual Git history and native KiCad."""
import json
import base64
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from kicad_vizdiff.git import VizError, git, snapshot
from kicad_vizdiff.render import find_kicad
from kicad_vizdiff.cli import main, PreparedDiff
from scripts.ci import review
from tests.fixtures import board, schematic


class ActionsReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        git(self.repo, 'init')
        self.output = self.repo / 'reports'

    def commit(self, message):
        git(self.repo, 'add', '-A', '--', '.')
        git(self.repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
            '-c', 'commit.gpgsign=false', 'commit', '-m', message)
        return git(self.repo, 'rev-parse', 'HEAD').decode().strip()

    def write(self, name, text):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def capture(self, args):
        self.calls.append(args)
        target = Path(args[args.index('--output') + 1])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('fixture report', encoding='utf-8')
        return 0

    def history(self):
        self.write('design/sensor.kicad_sch', schematic())
        self.write('design/sensor.kicad_pcb', board())
        self.write('design/old & sheet.kicad_sch', schematic().replace('Sensor interface', 'Rename fixture'))
        self.write('design/removed.kicad_sch', schematic().replace('Sensor interface', 'Delete fixture'))
        base = self.commit('Base designs')
        self.write('design/sensor.kicad_sch', schematic(True))
        self.write('design/sensor.kicad_pcb', board(True))
        (self.repo / 'design/old & sheet.kicad_sch').rename(self.repo / 'design/new & sheet.kicad_sch')
        (self.repo / 'design/removed.kicad_sch').unlink()
        return base, self.commit('Move, delete and modify designs')

    def test_renames_deletions_and_same_basename_outputs(self):
        base, head = self.history()
        self.calls = []
        self.assertEqual(review(base, head, self.output, self.repo, renderer=self.capture), 0)
        evidence = json.loads((self.output / 'review.json').read_text(encoding='utf-8'))
        records = {r['file']: r for r in evidence['files']}
        self.assertEqual((evidence['base'], evidence['head']), (base, head))
        self.assertEqual(records['design/removed.kicad_sch']['status'], 'D')
        self.assertEqual(records['design/new & sheet.kicad_sch']['oldFile'], 'design/old & sheet.kicad_sch')
        self.assertEqual(len({r['report'] for r in records.values()}), 4)
        self.assertTrue((self.output / 'design/sensor.kicad_sch.html').exists())
        self.assertTrue((self.output / 'design/sensor.kicad_pcb.html').exists())
        listing = (self.output / 'index.html').read_text(encoding='utf-8')
        self.assertIn('new &amp; sheet.kicad_sch', listing)
        self.assertIn('new%20%26%20sheet.kicad_sch.html', listing)
        renamed = next(a for a in self.calls if a[1] == 'design/new & sheet.kicad_sch')
        self.assertEqual(renamed[renamed.index('--old-file') + 1], 'design/old & sheet.kicad_sch')

    def test_pr_merge_base_excludes_later_base_branch_designs(self):
        self.write('sensor.kicad_sch', schematic())
        fork = self.commit('Common ancestor')
        git(self.repo, 'checkout', '-b', 'feature')
        self.write('sensor.kicad_sch', schematic(True))
        head = self.commit('Feature change')
        git(self.repo, 'checkout', '-b', 'advanced-base', fork)
        self.write('unrelated.kicad_pcb', board())
        base_tip = self.commit('Later base change')
        self.calls = []
        self.assertEqual(review(base_tip, head, self.output, self.repo,
                                merge_base=True, renderer=self.capture), 0)
        evidence = json.loads((self.output / 'review.json').read_text(encoding='utf-8'))
        self.assertEqual(evidence['base'], fork)
        self.assertEqual([r['file'] for r in evidence['files']], ['sensor.kicad_sch'])

    def test_render_failures_have_no_success_link_and_unchanged_range_has_index(self):
        base, head = self.history()
        self.assertEqual(review(base, head, self.output, self.repo, renderer=lambda _: 1), 1)
        listing = (self.output / 'index.html').read_text(encoding='utf-8')
        self.assertNotIn('<a ', listing)
        self.assertIn('rendering failed', listing)
        self.assertEqual(review(head, head, self.output, self.repo, renderer=lambda _: self.fail('Unexpected render')), 0)
        self.assertIn('No changed KiCad drawings', (self.output / 'index.html').read_text(encoding='utf-8'))

    def test_installed_command_reviews_empty_range_without_renderer_and_forwards_options(self):
        base, head = self.history()
        with patch('kicad_vizdiff.cli.find_kicad', side_effect=AssertionError('No renderer needed')):
            self.assertEqual(main(['review', '--repo', str(self.repo), '--base', head,
                                   '--head', head, '--output', str(self.output)]), 0)
        self.assertIn('No changed KiCad drawings', (self.output / 'index.html').read_text(encoding='utf-8'))
        self.calls = []
        self.assertEqual(review(base, head, self.output, self.repo, renderer=self.capture,
                                layers='Edge.Cuts', theme='custom', kicad_cli='native-cli'), 0)
        for args in self.calls:
            self.assertEqual(args[args.index('--layers') + 1], 'Edge.Cuts')
            self.assertEqual(args[args.index('--theme') + 1], 'custom')
            self.assertEqual(args[args.index('--kicad-cli') + 1], 'native-cli')

    def test_shared_setup_failure_retains_index_and_explicit_failure_evidence(self):
        base, head = self.history()
        with patch('kicad_vizdiff.cli.find_kicad', side_effect=VizError('Native fixture unavailable')):
            self.assertEqual(main(['review', '--repo', str(self.repo), '--base', base,
                                   '--head', head, '--output', str(self.output)]), 1)
        evidence = json.loads((self.output / 'review.json').read_text())
        self.assertEqual(evidence['setupError'], 'Native fixture unavailable')
        self.assertEqual(len(evidence['files']), 4)
        self.assertTrue(all(not record['success'] for record in evidence['files']))
        self.assertNotIn('<a ', (self.output / 'index.html').read_text())

    def test_prepared_reports_reject_different_revision_before_reading_snapshots(self):
        base, head = self.history()
        prepared = PreparedDiff(self.repo.resolve(), base, head, self.repo / 'before',
                                self.repo / 'after', 'unused-native-cli', '10.0')
        with (patch('kicad_vizdiff.cli.snapshot', side_effect=AssertionError('Unexpected snapshot')),
              patch('kicad_vizdiff.cli.render', side_effect=AssertionError('Unexpected render'))):
            self.assertEqual(main(['diff', 'design/sensor.kicad_pcb', '--repo', str(self.repo),
                                   '--base', head, '--head', base], prepared=prepared), 1)
        self.assertFalse((self.repo / '.vizdiff/index.html').exists())

    def test_native_reports_include_deleted_board_and_renamed_schematic(self):
        try:
            find_kicad()
        except VizError:
            self.skipTest('KiCad CLI is not installed')
        self.write('old.kicad_sch', schematic())
        self.write('removed.kicad_pcb', board())
        base = self.commit('Base')
        (self.repo / 'old.kicad_sch').rename(self.repo / 'new.kicad_sch')
        (self.repo / 'removed.kicad_pcb').unlink()
        head = self.commit('Rename schematic and delete board')
        with patch('kicad_vizdiff.cli.snapshot', wraps=snapshot) as snapshots:
            self.assertEqual(main(['review', '--repo', str(self.repo), '--base', base,
                                   '--head', head, '--output', str(self.output)]), 0)
        self.assertEqual(snapshots.call_count, 2)
        for call in snapshots.call_args_list:
            self.assertFalse(call.args[2].exists(), 'Shared snapshots must be cleaned up')
        self.assertTrue((self.output / 'new.kicad_sch.html').stat().st_size > 10000)
        self.assertTrue((self.output / 'removed.kicad_pcb.html').stat().st_size > 10000)
        source = (self.output / 'new.kicad_sch.html').read_text(encoding='utf-8')
        data = json.loads(re.search(r'<script id="report-data" type="application/json">(.*?)</script>', source, re.S)[1])
        self.assertEqual(len(data['pages']), 1)
        self.assertEqual(data['pages'][0]['status'], 'paired')
        self.assertEqual(data['beforeSheets'][0]['page'], data['sheets'][0]['page'])
        self.assertEqual(data['beforeObjects'][0]['page'], data['objects'][0]['page'])
        # Compare complete report data to independent single-file exports, not only counts.
        for name, old in [('new.kicad_sch', 'old.kicad_sch'), ('removed.kicad_pcb', 'removed.kicad_pcb')]:
            standalone = self.repo / (name + '.standalone.html')
            self.assertEqual(main(['diff', name, '--old-file', old, '--repo', str(self.repo),
                                   '--base', base, '--head', head, '--output', str(standalone)]), 0)
            def payload(path):
                data = json.loads(re.search(r'<script id="report-data" type="application/json">(.*?)</script>',
                                           path.read_text(encoding='utf-8'), re.S)[1])
                for page in data['pages']:
                    for side in ('before', 'after'):
                        if not page[side]:
                            continue
                        svg = base64.b64decode(page[side].split(',', 1)[1]).decode()
                        # KiCad's non-drawing title records the wall-clock export time.
                        svg = re.sub(r'(<title>[^<]*\bdate )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',
                                     r'\1EXPORT_TIME', svg)
                        page[side] = svg
                return data
            self.assertEqual(payload(self.output / (name + '.html')), payload(standalone))
        self.assertEqual(git(self.repo, 'diff', '--name-only', head).strip(), b'')
