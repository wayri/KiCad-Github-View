from __future__ import annotations

import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('firefox_pdf_csp', ROOT / 'scripts/firefox_pdf_csp.py')
ADAPTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADAPTER)


class FirefoxPdfCspTests(unittest.TestCase):
    def test_pinned_modules_preserve_notices_and_replace_dynamic_loaders(self):
        for name in ADAPTER.SOURCE_SHA256:
            path = 'vendor/pdfjs/build/' + name
            original = (ROOT / 'extension' / path).read_bytes()
            packaged = ADAPTER.adapt(path, original)
            self.assertTrue(packaged.startswith(original[:500]))
            self.assertIn(b'Copyright', packaged[:2000])
            self.assertNotIn(ADAPTER.GLOBAL_FALLBACK.encode(), packaged)
            self.assertNotIn(ADAPTER.WORKER_IMPORT.encode(), packaged)
            self.assertNotIn(ADAPTER.DECODER_IMPORT.encode(), packaged)
            self.assertIn(b'globalThis', packaged)
        self.assertEqual(ADAPTER.adapt('other.js', b'unchanged'), b'unchanged')

    def test_upstream_drift_and_repeated_source_contract_fail_closed(self):
        path = 'vendor/pdfjs/build/pdf.min.mjs'
        content = (ROOT / 'extension' / path).read_bytes()
        with self.assertRaisesRegex(ValueError, 'digest changed'):
            ADAPTER.adapt(path, content + b'\n')
        with self.assertRaisesRegex(ValueError, 'contract changed'):
            ADAPTER._replace_once('two two', 'two', 'one')
        with self.assertRaisesRegex(ValueError, 'contract changed'):
            ADAPTER._replace_once('absent', 'two', 'one')

    @unittest.skipUnless(shutil.which('node'), 'Node is required for module/runtime checks')
    def test_complete_adapted_modules_are_valid_javascript(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ADAPTER.SOURCE_SHA256:
                path = 'vendor/pdfjs/build/' + name
                result = Path(folder) / name
                result.write_bytes(ADAPTER.adapt(path, (ROOT / 'extension' / path).read_bytes()))
                subprocess.run(['node', '--check', str(result)], check=True, capture_output=True)

    @unittest.skipUnless(shutil.which('node'), 'Node is required for module/runtime checks')
    def test_literal_imports_load_both_decoders_and_reject_untrusted_locations(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            build, wasm = root / 'build', root / 'wasm'
            build.mkdir(); wasm.mkdir()
            (root / 'package.json').write_text('{"type":"module"}', encoding='utf8')
            helper = build / 'adapter.mjs'
            helper.write_text(ADAPTER.WORKER_HELPER + ADAPTER.DECODER_HELPER +
                              '\nexport {kiviImportPdfWorker,kiviImportPdfDecoder};', encoding='utf8')
            (build / 'pdf.worker.min.mjs').write_text('export const WorkerMessageHandler = "local-worker";', encoding='utf8')
            for name in ('jbig2', 'openjpeg'):
                (wasm / (name + '_nowasm_fallback.js')).write_text(
                    'export default () => "' + name + '-local";', encoding='utf8')
            script = root / 'check.mjs'
            script.write_text('''import assert from 'node:assert/strict';
import {kiviImportPdfWorker,kiviImportPdfDecoder} from './build/adapter.mjs';
const worker=new URL('./build/pdf.worker.min.mjs',import.meta.url).href;
const local=new URL('./wasm/',import.meta.url).href;
assert.equal((await kiviImportPdfWorker(worker)).WorkerMessageHandler,'local-worker');
for(const name of ['jbig2','openjpeg'])
  assert.equal((await kiviImportPdfDecoder(name+'_nowasm_fallback.js',local)).default(),name+'-local');
for(const source of ['https://attacker.invalid/pdf.worker.min.mjs',worker+'?override=1','data:text/javascript,export{}'])
  await assert.rejects(kiviImportPdfWorker(source),/packaged local/);
for(const base of ['https://attacker.invalid/wasm/',local+'?override=1',null])
  await assert.rejects(kiviImportPdfDecoder('jbig2_nowasm_fallback.js',base),/packaged local/);
await assert.rejects(kiviImportPdfDecoder('../build/adapter.mjs',local),/Unsupported/);
''', encoding='utf8')
            subprocess.run(['node', str(script)], check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
