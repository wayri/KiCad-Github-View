import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('android_package',ROOT/'scripts/package_android.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class AndroidPackageTests(unittest.TestCase):
    def test_shared_engine_and_native_runtime_are_packaged_without_online_credentials(self):
        assets=builder.payload()
        for name in ('owned-canvas.js','schematic-renderer.js','pcb-renderer.js'):
            self.assertEqual(assets[name],(ROOT/'extension'/name).read_bytes())
        self.assertIn(b'root.KiCadAndroidOnline', assets['review-workspace.js'])
        self.assertIn(b"if(!remoteAvailable)return",assets['review-workspace.js'])
        for name in ('remote-review.js','gitlab.js','github.js','index.html','index.js','runtime.js','local-project.js','touch-canvas.js','vendor/spike-board3d.bundle.js','vendor/occt/occt-import-js.wasm'):
            self.assertIn(name,assets)
        for name in ('options.html','credential-vault.js','html-sandbox.html'):
            self.assertNotIn(name,assets)
        page=assets['revision-viewer.html'].decode()
        self.assertLess(page.index('runtime.js'),page.index('revision-viewer.js'))
        root_page=assets['index.html'].decode()
        self.assertLess(root_page.index('revision-snapshots.js'),root_page.index('index.js'))
        self.assertIn(b'window.top.KiCadAndroid.ensureSnapshots()',assets['runtime.js'])
        self.assertNotIn(b'KiCadAndroidSnapshots.create(',assets['runtime.js'])
        self.assertLess(page.index('owned-canvas.js'),page.index('touch-canvas.js'))
        self.assertLess(page.index('touch-canvas.js'),page.index('revision-viewer.js'))
    def test_html_local_script_references_resolve_in_bundle(self):
        import re
        assets=builder.payload()
        for name,data in assets.items():
            if name.endswith('.html'):
                for script in re.findall(r'<script src="([^"]+)"',data.decode()):
                    self.assertIn(script,assets,name+': missing '+script)
if __name__=='__main__': unittest.main()
