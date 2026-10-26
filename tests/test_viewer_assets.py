"""Prepared packages must contain the scripts and styles their entry points load."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class ViewerAssetTests(unittest.TestCase):
    def test_browser_and_vscode_entry_dependencies_are_in_the_package(self):
        for name, attribute in [('package_extension', 'FILES'), ('package_vscode', 'ASSETS')]:
            files = set(getattr(load(name), attribute))
            if name == 'package_extension':
                manifest = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))
                files.add(manifest['background']['service_worker'])
                for entry in manifest['content_scripts']:
                    files.update(entry['js'])
            for file in sorted(files):
                if not file.endswith('.html'):
                    continue
                html = (ROOT / 'extension' / file).read_text(encoding='utf-8')
                refs = re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css))["\']', html)
                for ref in refs:
                    with self.subTest(package=name, page=file, resource=ref):
                        target = str(Path(file).parent / ref).replace('\\', '/')
                        self.assertTrue(target in files, f'{name}: {file} requires missing {target}')

    def test_guard_runs_before_the_viewer_entry_in_all_platform_payloads(self):
        for file in ['pcb-viewer.html', 'schematic-viewer.html', 'revision-viewer.html', 'project-viewer.html', 'browser-viewer.html']:
            html = (ROOT / 'extension' / file).read_text(encoding='utf-8')
            scripts = re.findall(r'<script src="([^"]+)"', html)
            self.assertEqual(scripts[0], 'startup-health.js', file)

if __name__ == '__main__':
    unittest.main()
