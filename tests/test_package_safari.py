import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from scripts import package_safari as builder


class SafariPackageTests(unittest.TestCase):
    def test_complete_deterministic_payload_and_private_options(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'safari.zip'
            first = builder.package(output=output).read_bytes()
            self.assertEqual(first, builder.package(output=output).read_bytes())
            with zipfile.ZipFile(output) as archive:
                manifest = json.loads(archive.read('web-extension/manifest.json'))
                self.assertEqual(manifest['manifest_version'], 3)
                self.assertIn('web-extension/' + manifest['background']['service_worker'], archive.namelist())
                for entry in manifest['content_scripts']:
                    for script in entry['js']:
                        self.assertIn('web-extension/' + script, archive.namelist())
                for resource in manifest['web_accessible_resources']:
                    self.assertNotIn('options.html', resource['resources'])
                    self.assertNotIn('options.js', resource['resources'])
                self.assertIn('web-extension/options.html', archive.namelist())
                self.assertNotIn('sandbox', manifest)
                self.assertNotIn('sandbox', manifest['content_security_policy'])
                self.assertNotIn('web-extension/html-sandbox.html', archive.namelist())
                source = archive.read('web-extension/project-viewer.js').decode()
                self.assertIn('Repository HTML preview is disabled', source)
                self.assertNotIn("chrome.runtime.getURL('html-sandbox.html')", source)
                self.assertNotIn('postMessage({type:\'kicad-html-preview\'', source)
                helper = archive.read('convert.sh').decode()
                self.assertIn('--copy-resources --no-open', helper)
                self.assertIn('safari-web-extension-packager', helper)
                self.assertIn('safari-web-extension-converter', helper)
                self.assertNotIn('--force', helper)
                self.assertEqual(archive.getinfo('convert.sh').external_attr >> 16, 0o100755)
                self.assertNotIn(b'\r', archive.read('convert.sh'))

    def test_adapter_rejects_changed_preview_entry(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = builder.payload()
            for name, content in data.items():
                if name.startswith('web-extension/'):
                    relative = name.removeprefix('web-extension/')
                    path = root / 'extension' / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
                    original = builder.ROOT / 'extension' / relative
                    path.write_bytes(original.read_bytes())
            for name in ['html-sandbox.html', 'html-sandbox.js']:
                (root / 'extension' / name).write_bytes((builder.ROOT / 'extension' / name).read_bytes())
            (root / 'extension/project-viewer.js').write_text('// changed', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'HTML preview entry changed'):
                builder.payload(root)
