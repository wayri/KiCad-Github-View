"""Execute the composite Action's shell with a recording renderer, without posting."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CompositeActionTests(unittest.TestCase):
    def setUp(self):
        windows_bash = Path('C:/Program Files/Git/bin/bash.exe')
        self.bash = str(windows_bash) if windows_bash.is_file() else shutil.which('bash')
        if not self.bash:
            self.skipTest('Bash is unavailable')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        source = (ROOT / 'action.yml').read_text(encoding='utf-8')
        body = source.split('      run: |\n', 1)[1]
        self.script = '\n'.join(line[8:] for line in body.splitlines())

    def execute(self, **overrides):
        capture = self.folder / 'arguments.bin'
        outputs = self.folder / 'outputs.txt'
        environment = {**os.environ, 'KICAD_FILE': '', 'KICAD_BASE': 'base',
                       'KICAD_HEAD': 'head', 'KICAD_OUTPUT': 'single.html',
                       'KICAD_DIRECTORY': 'reviews with spaces', 'KICAD_LAYERS': 'Edge.Cuts',
                       'KICAD_OLD_FILE': '', 'KICAD_MERGE_BASE': 'false',
                       'GITHUB_OUTPUT': outputs.as_posix(), 'CAPTURE': capture.as_posix(),
                       'RENDER_EXIT': '0', **overrides}
        prefix = 'set -e\nkicad-vizdiff() { printf "%s\\0" "$@" > "$CAPTURE"; return "$RENDER_EXIT"; }\n'
        result = subprocess.run([self.bash, '--noprofile', '--norc', '-c', prefix + self.script],
                                env=environment, capture_output=True, timeout=15)
        arguments = capture.read_bytes().decode().rstrip('\0').split('\0') if capture.exists() else []
        output = outputs.read_text() if outputs.exists() else ''
        return result, arguments, output

    def test_repository_and_single_drawing_modes_keep_inputs_literal(self):
        result, arguments, output = self.execute(KICAD_MERGE_BASE='true', KICAD_HEAD='$(touch injected)')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(arguments, ['review', '--base', 'base', '--head', '$(touch injected)',
                                    '--layers', 'Edge.Cuts', '--output', 'reviews with spaces', '--merge-base'])
        self.assertEqual(output, 'report=reviews with spaces\n')
        self.assertFalse((ROOT / 'injected').exists())
        result, arguments, _ = self.execute(KICAD_FILE='sub/new.kicad_sch', KICAD_OLD_FILE='sub/old.kicad_sch')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(arguments[0:2], ['diff', 'sub/new.kicad_sch'])
        self.assertEqual(arguments[-2:], ['--old-file', 'sub/old.kicad_sch'])

    def test_failure_preserves_artifact_path_and_rejects_ambiguous_options(self):
        result, _, output = self.execute(RENDER_EXIT='1')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(output, 'report=reviews with spaces\n')
        for options in ({'KICAD_DIRECTORY': 'report\ninjected=value'},
                        {'KICAD_MERGE_BASE': 'maybe'}, {'KICAD_OLD_FILE': 'old.kicad_pcb'},
                        {'KICAD_FILE': 'board.kicad_pcb', 'KICAD_MERGE_BASE': 'true'}):
            # Each invocation has fresh output files to establish no output injection.
            for path in self.folder.iterdir():
                path.unlink()
            result, arguments, output = self.execute(**options)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(arguments, [])
            self.assertEqual(output, '')


if __name__ == '__main__':
    unittest.main()
