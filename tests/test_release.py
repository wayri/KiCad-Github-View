import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_ignored_local_runtime_cannot_pass_committed_source_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL)
            git('init', '-q')
            (root / '.gitignore').write_text('build/\n')
            (root / 'viewer.js').write_text('saved viewer')
            (root / 'build').mkdir()
            (root / 'build/runtime.js').write_text('required runtime available locally')
            git('add', '.gitignore', 'viewer.js')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Incomplete source')
            with self.assertRaisesRegex(ValueError, 'absent from committed source: build/runtime.js'):
                release.audit_committed_assets({'viewer.js', 'build/runtime.js'}, root)
            (root / '.gitignore').write_text('build/\n!build/\n!build/runtime.js\n')
            git('add', '.gitignore', 'build/runtime.js')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Complete source')
            self.assertEqual(release.audit_committed_assets({'viewer.js', 'build/runtime.js'}, root), 2)

    def test_android_binary_asset_audit_rejects_stale_missing_and_duplicate_entries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'app.apk'
            expected = {'index.html': b'current', 'viewer.js': b'script'}
            def fixture(entries):
                with zipfile.ZipFile(path, 'w') as archive:
                    for name, content in entries:
                        archive.writestr(name, content)
            fixture([('assets/viewer/' + name, content) for name, content in expected.items()] + [('classes.dex', b'native')])
            release.audit_android_payload(path, expected, 'assets/viewer/')
            fixture([('assets/viewer/index.html', b'old'), ('assets/viewer/viewer.js', b'script')])
            with self.assertRaisesRegex(ValueError, 'package/source mismatch'):
                release.audit_android_payload(path, expected, 'assets/viewer/')
            fixture([('assets/viewer/index.html', b'current')])
            with self.assertRaisesRegex(ValueError, 'inventory'):
                release.audit_android_payload(path, expected, 'assets/viewer/')
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                fixture([('assets/viewer/index.html', b'current')] * 2)
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                release.audit_android_payload(path, expected, 'assets/viewer/')

    def test_android_release_names_are_separate_version_and_explicit_signing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'android-app/app').mkdir(parents=True)
            (root / 'android-app/app/build.gradle').write_text("versionName '1.24'")
            self.assertEqual(release.android_names(root), {
                'pocket-kivi-android-phone-tablet-1.24-development.apk',
                'pocket-kivi-android-1.24-unsigned.aab',
                'pocket-kivi-android-source-1.24.zip'})

    def test_guides_archive_retains_relative_image_paths_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'docs/images').mkdir(parents=True)
            (root / 'docs/using-github-integration').mkdir()
            (root / 'README.md').write_text('Guide index')
            (root / 'USER-GUIDE.md').write_text('Illustrated walkthrough')
            (root / 'docs/chrome-privacy.html').write_text('<h1>Privacy</h1>')
            (root / 'docs/images/draftsman').mkdir()
            (root / 'docs/images/draftsman/walkthrough.webm').write_bytes(b'fixture video')
            (root / 'docs/using-github-integration/README.md').write_text('![Example](../images/example.jpg)')
            (root / 'docs/images/example.jpg').write_bytes(b'fixture pixels')
            first = release.package_guides(root / 'first.zip', root)
            second = release.package_guides(root / 'second.zip', root)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(archive.read('docs/images/example.jpg'), b'fixture pixels')
                self.assertEqual(archive.read('USER-GUIDE.md'), b'Illustrated walkthrough')
                self.assertEqual(archive.read('docs/images/draftsman/walkthrough.webm'), b'fixture video')
                self.assertIn('docs/chrome-privacy.html', archive.namelist())
                self.assertIn('docs/using-github-integration/README.md', archive.namelist())

    def test_tag_binding_and_dirty_checkout_rejection(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaisesRegex(ValueError, 'committed Git checkout'):
                release.source_commit(root, 'v0.11.0')
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            git('init', '-b', 'main')
            (root / 'source.txt').write_text('saved')
            git('add', 'source.txt')
            git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
                'commit', '-m', 'fixture')
            git('tag', 'v0.11.0')
            self.assertEqual(release.source_commit(root, 'v0.11.0'), git('rev-parse', 'HEAD'))
            with self.assertRaisesRegex(ValueError, 'point to the checked-out'):
                release.source_commit(root, 'v0.11.1')
            (root / 'source.txt').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'clean source checkout'):
                release.source_commit(root, 'v0.11.0')

    def test_nested_export_cannot_inherit_parent_release_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            parent = Path(folder)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=parent,
                                               stderr=subprocess.DEVNULL)
            git('init', '-q')
            (parent / 'source.txt').write_text('saved', encoding='utf-8')
            git('add', 'source.txt')
            git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
            git('tag', 'v0.11.0')
            nested = parent / 'export'
            nested.mkdir()
            self.assertIsNone(release.source_commit(nested))
            with self.assertRaisesRegex(ValueError, 'committed Git checkout'):
                release.source_commit(nested, 'v0.11.0')

    def test_versions_reject_mismatch_bad_tags_and_missing_notes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('extension', 'vscode-extension', 'docs/releases'):
                (root / name).mkdir(parents=True)
            (root / 'extension/manifest.json').write_text('{"version":"0.11.0"}')
            native = root / 'vscode-extension/package.json'
            native.write_text('{"version":"0.11.1"}')
            with self.assertRaisesRegex(ValueError, 'versions differ'):
                release.versions(root)
            native.write_text('{"version":"0.11.0"}')
            for tag in ('main', 'v0.11.1', 'v0.11.0;bad', '../v0.11.0', 'v0.11.0-rc.1'):
                with self.assertRaisesRegex(ValueError, 'tag must match'):
                    release.versions(root, tag)
            with self.assertRaisesRegex(ValueError, 'release notes'):
                release.versions(root, 'v0.11.0')
            (root / 'docs/releases/v0.11.0.md').write_text('Preview notes')
            self.assertEqual(release.versions(root, 'v0.11.0'), '0.11.0')

    def test_archives_are_reproducible_and_audit_detects_modified_source_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            browser = release.module('package_extension')
            native = release.module('package_vscode')
            chrome_path = browser.package(output=root / 'chrome.zip')
            self.assertEqual(chrome_path.read_bytes(), browser.package(output=root / 'chrome2.zip').read_bytes())
            native_path = native.package(output=root / 'native.vsix')
            audit = release.audit_packages(chrome_path, native_path)
            self.assertGreater(audit['chromeFiles'], 40)
            with zipfile.ZipFile(chrome_path) as original, zipfile.ZipFile(root / 'bad.zip', 'w') as altered:
                for name in original.namelist():
                    altered.writestr(name, b'changed' if name == 'content.js' else original.read(name))
            with self.assertRaisesRegex(ValueError, 'mismatch: content.js'):
                release.audit_packages(root / 'bad.zip', native_path)

    def test_application_archive_normalization_preserves_bytes_and_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with zipfile.ZipFile(root / 'raw.zip', 'w') as archive:
                archive.writestr('nested/example.txt', 'payload')
            release.normalize_archive(root / 'raw.zip', root / 'first.zip')
            release.normalize_archive(root / 'raw.zip', root / 'second.zip')
            self.assertEqual((root / 'first.zip').read_bytes(), (root / 'second.zip').read_bytes())
            with zipfile.ZipFile(root / 'raw.zip', 'w') as archive:
                archive.writestr('../credential.txt', 'payload')
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                release.normalize_archive(root / 'raw.zip', root / 'bad.zip')

    def test_unknown_output_files_cannot_be_uploaded_as_release_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            (output / 'private.env').write_text('unrelated')
            with self.assertRaisesRegex(ValueError, 'unexpected files'):
                release.build(output)
            self.assertEqual((output / 'private.env').read_text(), 'unrelated')

    def test_release_and_install_notes_are_present_for_current_version(self):
        version = release.versions()
        install = (ROOT / 'docs/INSTALL.md').read_text(encoding='utf-8')
        self.assertIn(f'chrome-edge-brave-opera-vivaldi-chromium-{version}.zip', install)
        self.assertIn(f'vscode-{version}.vsix', install)
        for name in ('ci.yml', 'release.yml'):
            workflow = (ROOT / '.github/workflows' / name).read_text(encoding='utf-8')
            self.assertIn('scripts/release.py', workflow)
            self.assertNotIn('pull_request_target', workflow)


if __name__ == '__main__':
    unittest.main()
