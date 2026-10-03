import hashlib
import importlib.util
import json
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
            for name in builder.ASSETS:
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
                self.assertEqual(manifest['version'], '0.11.0')
                self.assertEqual(manifest['contributes']['customEditors'][0]['priority'], 'default')
                self.assertEqual({s['filenamePattern'] for s in manifest['contributes']['customEditors'][0]['selector']},
                                 {'*.kicad_sch', '*.kicad_pcb', '*.kicad_pro', '*.kicad_prl', '*.kicad_dru', '*.kicad_wks', '*.gbr', '*.ger', '*.gerber', '*.gtl', '*.gbl', '*.gts', '*.gbs', '*.gto', '*.gbo', '*.gtp', '*.gbp', '*.gko', '*.gm1', '*.drl', '*.xln', 'fp-lib-table', 'sym-lib-table', '*.gm[0-9]*', '*.g[0-9]*'})
                document = ET.fromstring(archive.read('extension.vsixmanifest'))
                ns = {'v': 'http://schemas.microsoft.com/developer/vsx-schema/2011'}
                self.assertEqual(document.find('v:Metadata/v:Identity', ns).attrib['Version'], '0.11.0')
                for asset in document.findall('v:Assets/v:Asset', ns):
                    self.assertIn(asset.attrib['Path'], archive.namelist())
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

    def test_entry_adapter_rejects_shared_contract_drift(self):
        with self.assertRaisesRegex(ValueError, 'entry changed'):
            builder.adapt_entry(b'changed entry')
        with self.assertRaises(ValueError):
            builder.adapt_entry(b'new URLSearchParams(location.search)' * 2)

    def test_missing_asset_fails_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'Missing shared viewer asset'):
                builder.prepare_media(Path(folder))


if __name__ == '__main__':
    unittest.main()
