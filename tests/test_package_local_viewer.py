import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from kicad_vizdiff.local_viewer import asset_inventory
from kicad_vizdiff.cli import main

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_package', ROOT / 'scripts/package_local_viewer.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class LocalPackageTests(unittest.TestCase):
    def test_bundle_is_complete_and_read_only_inventory_loads(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            archive = builder.package(output=target / 'local.zip')
            with zipfile.ZipFile(archive) as bundle:
                self.assertIn('pocket_kiview/kicad_plugin/action.py', bundle.namelist())
                self.assertIn('pocket_kiview/kicad_vizdiff/local_viewer.py', bundle.namelist())
                self.assertFalse(any('.env' in p or p.endswith('options.js') for p in bundle.namelist()))
                bundle.extractall(target)
            web = target / 'pocket_kiview/web'
            names = asset_inventory(web)
            for name in ('local-viewer.html', 'local-runtime.js', 'local-project.js', 'schematic-viewer.html', 'pcb-viewer.html'):
                self.assertIn(name, names)
                self.assertEqual((web / name).read_bytes(), (ROOT / 'extension' / name).read_bytes())
            self.assertNotIn('manifest.json', names)
            self.assertNotIn('credential-vault.js', names)
            self.assertEqual(set(json.loads((web / 'local-assets.json').read_text())['files']), set(names))

    def test_browser_cli_does_not_require_native_rendering(self):
        with patch('kicad_vizdiff.local_viewer.main', return_value=0) as launch, patch('kicad_vizdiff.cli.find_kicad', side_effect=AssertionError('Native renderer should not run')):
            self.assertEqual(main(['browser', 'project/sensor.kicad_sch', '--assets', 'web', '--port', '1234', '--no-open']), 0)
            launch.assert_called_once_with(['--project', 'project/sensor.kicad_sch', '--port', '1234', '--assets', 'web', '--no-open'])
