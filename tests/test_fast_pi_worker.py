import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_fast_pi_worker', ROOT / 'scripts/build_fast_pi_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FastPIWorkerTests(unittest.TestCase):
    def test_generated_worker_matches_source_and_needs_no_imports(self):
        expected = worker.bundle(ROOT)
        self.assertEqual((ROOT / 'extension/fast-pi-worker-vscode.js').read_bytes(), expected)
        self.assertNotIn(b'importScripts(', expected)
        self.assertIn(b'KiCadFastPI.solveBoard', expected)

    def test_unexpected_worker_import_contract_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'extension').mkdir()
            (root / 'extension/fast-pi-worker.js').write_text("importScripts('unexpected.js');", encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'import contract'):
                worker.bundle(root)
