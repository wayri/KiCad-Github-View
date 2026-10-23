import hashlib
import importlib.util
import json
import re
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_vscode', ROOT / 'scripts/package_vscode.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageVSCodeTests(unittest.TestCase):
    def test_package_is_explicit_complete_and_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in (*builder.ASSETS, *builder.BUILD_INPUTS):
                target = root / 'extension' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / 'extension' / name).read_bytes())
            for name in builder.HOST_FILES:
                target = root / 'vscode-extension' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / 'vscode-extension' / name).read_bytes())
            (root / 'vscode-extension' / 'secret.env').write_text('not distributable')
            (root / 'extension' / 'unexpected.js').write_text('not in inventory')
            first, second = builder.package(root).read_bytes(), builder.package(root).read_bytes()
            self.assertEqual(first, second)
            with zipfile.ZipFile(builder.package(root)) as archive:
                expected = ({f'extension/{name}' for name in builder.HOST_FILES} |
                            {f'extension/media/{name}' for name in builder.ASSETS} |
                            {'extension/media/shared-assets.json', '[Content_Types].xml', 'extension.vsixmanifest'})
                self.assertEqual(set(archive.namelist()), expected)
                manifest = json.loads(archive.read('extension/package.json'))
                self.assertEqual(manifest['main'], manifest['browser'])
                self.assertTrue(manifest['capabilities']['virtualWorkspaces'])
                self.assertEqual(manifest['version'], json.loads((ROOT / 'vscode-extension/package.json').read_text(encoding='utf-8'))['version'])
                self.assertEqual(manifest['contributes']['customEditors'][0]['priority'], 'default')
                self.assertEqual({s['filenamePattern'] for s in manifest['contributes']['customEditors'][0]['selector']},
                                 {'*.kicad_sch', '*.kicad_pcb', '*.kicad_pro', '*.kicad_prl', '*.kicad_dru', '*.kicad_wks', '*.gbr', '*.ger', '*.gerber', '*.gtl', '*.gbl', '*.gts', '*.gbs', '*.gto', '*.gbo', '*.gtp', '*.gbp', '*.gko', '*.gm1', '*.drl', '*.xln', 'fp-lib-table', 'sym-lib-table', '*.gm[0-9]*', '*.g[0-9]*'})
                document = ET.fromstring(archive.read('extension.vsixmanifest'))
                ns = {'v': 'http://schemas.microsoft.com/developer/vsx-schema/2011'}
                self.assertEqual(document.find('v:Metadata/v:Identity', ns).attrib['Version'], manifest['version'])
                self.assertEqual(document.find('v:Metadata/v:GalleryFlags', ns).text, 'Public')
                self.assertEqual(document.find('v:Metadata/v:License', ns).text, 'extension/LICENSE.txt')
                for asset in document.findall('v:Assets/v:Asset', ns):
                    self.assertIn(asset.attrib['Path'], archive.namelist())
                self.assertEqual(manifest['license'], 'SEE LICENSE IN LICENSE.txt')
                self.assertEqual(archive.read('extension/LICENSE.txt'), (ROOT / 'LICENSE').read_bytes())
                license_asset = next(a for a in document.findall('v:Assets/v:Asset', ns) if a.attrib['Type'] == 'Microsoft.VisualStudio.Services.Content.License')
                self.assertEqual(license_asset.attrib['Path'], 'extension/LICENSE.txt')
                readme = archive.read('extension/README.md').decode('utf-8')
                for name in builder.README_IMAGES:
                    image = archive.read(f'extension/{name}')
                    self.assertTrue(image.startswith(b'\xff\xd8\xff'))
                    self.assertIn('/' + Path(name).name + ')', readme)
                self.assertNotRegex(readme, r'!\[[^\]]*\]\((?!https://)')
                ET.fromstring(archive.read('[Content_Types].xml'))
                inventory = json.loads(archive.read('extension/media/shared-assets.json'))
                for name in builder.ASSETS:
                    source, packaged = (ROOT / 'extension' / name).read_bytes(), archive.read(f'extension/media/{name}')
                    self.assertEqual(inventory['assets'][name]['sourceSha256'], hashlib.sha256(source).hexdigest())
                    self.assertEqual(inventory['assets'][name]['packagedSha256'], hashlib.sha256(packaged).hexdigest())
                    if name != 'revision-viewer.js':
                        self.assertEqual(source, packaged)
                entry = archive.read('extension/media/revision-viewer.js').decode()
                self.assertIn('KiCadVSCodeContext?.search ?? location.search', entry)
                self.assertNotIn('kicanvas', entry.lower())

    def test_viewer_html_dependencies_are_packaged(self):
        for name in ('revision-viewer.html', 'project-viewer.html', 'conflict-viewer.html'):
            html = (ROOT / 'extension' / name).read_text(encoding='utf-8')
            for reference in re.findall(r'(?:src|href)="([^"?#]+)"', html):
                if reference.endswith(('.js', '.css')) and '://' not in reference:
                    self.assertIn(reference, builder.ASSETS, f'{name} requires {reference}')

    def test_entry_adapter_rejects_shared_contract_drift(self):
        with self.assertRaisesRegex(ValueError, 'entry changed'):
            builder.adapt_entry(b'changed entry')
        with self.assertRaises(ValueError):
            builder.adapt_entry(b'new URLSearchParams(location.search)' * 2)

    def test_missing_asset_fails_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'Missing shared viewer asset'):
                builder.prepare_media(Path(folder))

    def test_stale_step_worker_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in (*builder.ASSETS, *builder.BUILD_INPUTS):
                target = root / 'extension' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / 'extension' / name).read_bytes())
            (root / 'extension/step-decoder.js').write_bytes(b'/* altered binding */')
            with self.assertRaisesRegex(ValueError, 'worker bundle is stale'):
                builder.prepare_media(root)

    def test_step_bundle_survives_checkout_line_endings_without_changing_vendor_bytes(self):
        spec = importlib.util.spec_from_file_location('worker_builder', ROOT / 'scripts/build_step_worker.py')
        worker_builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker_builder)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in builder.BUILD_INPUTS:
                target = root / 'extension' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / 'extension' / name).read_bytes())
            vendor = (root / 'extension/vendor/occt/occt-import-js.js').read_bytes()
            expected = worker_builder.bundle(root)
            for name in ('step-decoder.js', 'step-worker.js'):
                target = root / 'extension' / name
                text = target.read_bytes().replace(b'\r\n', b'\n')
                target.write_bytes(text.replace(b'\n', b'\r\n'))
            self.assertEqual(worker_builder.bundle(root), expected)
            self.assertIn(vendor, expected)
            for name in ('step-decoder.js', 'step-worker.js'):
                target = root / 'extension' / name
                target.write_bytes(target.read_bytes().replace(b'\r\n', b'\n'))
            self.assertEqual(worker_builder.bundle(root), expected)


if __name__ == '__main__':
    unittest.main()
