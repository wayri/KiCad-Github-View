import hashlib
import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ios_package', ROOT / 'scripts/package_ios.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class IOSPackageTests(unittest.TestCase):
    def test_shared_payload_is_exact_bounded_and_offline(self):
        assets = builder.payload()
        index = json.loads(assets['ios-assets.json'])
        self.assertEqual(set(index['files']), set(assets) - {'ios-assets.json'})
        for name in ('local-viewer.html', 'local-runtime.js', 'local-project.js', 'review-handoff.js',
                     'schematic-renderer.js', 'pcb-renderer.js', 'vendor/spike-board3d.bundle.js',
                     'vendor/occt/occt-import-js.wasm', 'vendor/pdfjs/build/pdf.min.mjs'):
            self.assertEqual(assets[name], (ROOT / 'extension' / name).read_bytes())
            self.assertEqual(index['sha256'][name], hashlib.sha256(assets[name]).hexdigest())
        for name in builder.EXCLUDED:
            self.assertNotIn(name, assets)
        self.assertIn(b"window.KiViewIOS.openFolder", assets['local-viewer.js'])
        self.assertIn(b"window.KiCadLocalNative", assets['local-viewer.js'])

    def test_native_metadata_and_shared_scheme_are_consistent(self):
        info = plistlib.loads((ROOT / 'ios-app/PocketKiView/Info.plist').read_bytes())
        self.assertEqual(info['CFBundleDisplayName'], 'Pocket KiView')
        self.assertTrue(info['NSAppTransportSecurity']['NSAllowsLocalNetworking'])
        self.assertNotIn('NSAllowsArbitraryLoads', info['NSAppTransportSecurity'])
        self.assertIn('NSCameraUsageDescription', info)
        project = (ROOT / 'ios-app/PocketKiView.xcodeproj/project.pbxproj').read_text()
        self.assertIn('TARGETED_DEVICE_FAMILY = "1,2"', project)
        self.assertIn('PrivacyInfo.xcprivacy', project)
        scheme = ET.parse(ROOT / 'ios-app/PocketKiView.xcodeproj/xcshareddata/xcschemes/PocketKiView.xcscheme')
        target = scheme.find('.//BuildableReference').attrib['BlueprintIdentifier']
        self.assertIn(target + ' = { isa = PBXNativeTarget', project)

    def test_source_bundle_contains_no_signing_or_build_state(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = builder.package(output=Path(directory) / 'ios.zip')
            with zipfile.ZipFile(archive) as bundle:
                names = bundle.namelist()
                self.assertIn('ios-app/PocketKiView/ViewerViewController.swift', names)
                self.assertIn('ios-app/PocketKiView.xcodeproj/project.pbxproj', names)
                self.assertIn('ios-app/PocketKiView/web/ios-assets.json', names)
                self.assertFalse(any('xcuserdata/' in name or 'DerivedData/' in name or name.endswith(('.p12', '.pem', '.key')) for name in names))

    def test_cloud_build_has_no_apple_secrets_and_retains_unsigned_output(self):
        source = (ROOT / '.github/workflows/ios-preview.yml').read_text()
        self.assertIn('runs-on: macos-15', source)
        self.assertIn('CODE_SIGNING_ALLOWED=NO', source)
        self.assertIn('iphonesimulator', source)
        self.assertIn('PocketKiView-iOS-simulator.zip', source)
        self.assertNotIn('secrets.', source)
        self.assertNotIn('-allowProvisioningUpdates', source)
