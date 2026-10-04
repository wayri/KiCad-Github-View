import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('step_source', ROOT / 'scripts/package_step_source.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class StepSourceTests(unittest.TestCase):
    def test_cached_sources_are_verified_and_packaged_deterministically(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / 'cache'
            cache.mkdir()
            payload = b'owned source archive fixture'
            (cache / 'source.tar.gz').write_bytes(payload)
            pins = {'source.tar.gz': ('https://example.invalid/unreachable', hashlib.sha256(payload).hexdigest())}
            with patch.object(source, 'SOURCES', pins):
                first = source.package(Path(tmp) / 'first.zip', cache)
                second = source.package(Path(tmp) / 'second.zip', cache)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(archive.read('source.tar.gz'), payload)
                self.assertIn(b'LGPL', archive.read('README.md'))

    def test_tampered_cached_source_never_produces_a_release_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / 'cache'
            cache.mkdir()
            (cache / 'source.tar.gz').write_bytes(b'tampered')
            output = Path(tmp) / 'output.zip'
            pins = {'source.tar.gz': ('https://example.invalid/unreachable', hashlib.sha256(b'original').hexdigest())}
            with patch.object(source, 'SOURCES', pins):
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    source.package(output, cache)
            self.assertFalse(output.exists())
