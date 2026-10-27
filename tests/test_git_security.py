"""Demonstrate that read-only snapshots do not execute fsmonitor hooks."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from kicad_vizdiff.git import git, VizError


class GitHookBoundaryTests(unittest.TestCase):
    def test_ambient_git_directory_cannot_redirect_reads_and_transports_are_denied(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            selected, foreign = root / 'selected', root / 'foreign'
            for repo in (selected, foreign):
                subprocess.run(['git', 'init', str(repo)], check=True, capture_output=True)
            with patch.dict('os.environ', {'GIT_DIR': str(foreign / '.git'), 'GIT_WORK_TREE': str(foreign)}):
                result = git(selected, 'rev-parse', '--absolute-git-dir').decode().strip()
                self.assertEqual(Path(result).resolve(), (selected / '.git').resolve())
            # Even local transport is forbidden. Partial-clone object misses
            # must fail rather than invoking a repository's configured helpers.
            with self.assertRaisesRegex(VizError, 'transport.*not allowed'):
                git(selected, 'ls-remote', str(foreign))

    def test_repository_fsmonitor_command_is_disabled(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            repo = root / 'repo'
            repo.mkdir()
            subprocess.run(['git', 'init', str(repo)], check=True, capture_output=True)
            marker = root / 'hook-ran'
            hook = root / 'monitor.py'
            hook.write_text('from pathlib import Path\nimport sys\n'
                            f'Path({str(marker)!r}).write_text("executed")\n'
                            'sys.stdout.buffer.write(b"test-token\\0")\n', encoding='utf-8')
            command = f'"{Path(sys.executable).as_posix()}" "{hook.as_posix()}"'
            subprocess.run(['git', '-C', str(repo), 'config', 'core.fsmonitor', command], check=True)
            (repo / 'board.kicad_pcb').write_text('(kicad_pcb)')
            subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True, capture_output=True)
            if marker.exists():
                marker.unlink()
            # Positive control proves this Git installation runs the configured
            # command; the protected call must return files without executing it.
            subprocess.run(['git', '-C', str(repo), 'ls-files'], check=True, capture_output=True)
            self.assertTrue(marker.exists(), 'Positive control must execute the fixture hook.')
            marker.unlink()
            self.assertIn(b'board.kicad_pcb', git(repo, 'ls-files'))
            self.assertFalse(marker.exists())
