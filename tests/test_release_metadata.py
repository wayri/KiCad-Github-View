"""Focused generated-metadata audits; no APK build, native execution or network."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_metadata', ROOT/'scripts/release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

class ReleaseMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.put('extension/manifest.json','{"version":"0.12.80"}')
        self.put('android-app/app/build.gradle',"android {\n versionName '1.80'\n}\n")
        self.put('android-app/app/src/main/AndroidManifest.xml','<manifest/>\n')
        builder=release.module('package_extension')
        self.version=builder.version_text(builder.version_metadata(self.root,'android'))
        self.put('android-app/app/src/main/assets/viewer/VERSION.txt',self.version)

    def put(self,name,content):
        path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(content if isinstance(content,bytes) else content.encode('utf-8'))
        return path

    def android_archive(self,changes=None,omit=(),duplicate=None):
        names=release.module('package_android').source_files(self.root)
        data={p.relative_to(self.root).as_posix():p.read_bytes() for p in names}
        data['VERSION.txt']=self.version;data.update(changes or {})
        path=self.root/'source.zip'
        with zipfile.ZipFile(path,'w') as archive:
            for name,content in data.items():
                if name not in omit:archive.writestr(name,content)
            if duplicate:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore',UserWarning);archive.writestr(duplicate,data[duplicate])
        return path

    def test_android_source_accepts_generated_root_version_and_exact_source_bytes(self):
        path=self.android_archive()
        self.assertEqual(release.audit_android_source(path,self.root),4)
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(archive.read('VERSION.txt'),self.version)
            self.assertIn(b'Release: 0.12.80\nAppVersion: 1.80\nPlatform: Android\n',archive.read('VERSION.txt'))

    def test_android_source_rejects_bad_release_app_platform_or_extra_version_metadata(self):
        for content in (self.version.replace(b'0.12.80',b'0.12.79'),self.version.replace(b'1.80',b'1.79'),self.version.replace(b'Android',b'Chrome'),self.version+b'Unexpected: value\n'):
            with self.subTest(content=content),self.assertRaisesRegex(ValueError,'generated VERSION.txt'):
                release.audit_android_source(self.android_archive({'VERSION.txt':content}),self.root)
        embedded='android-app/app/src/main/assets/viewer/VERSION.txt'
        self.put(embedded,self.version.replace(b'1.80',b'1.79'))
        with self.assertRaisesRegex(ValueError,'embedded VERSION.txt'):
            release.audit_android_source(self.android_archive(),self.root)

    def test_android_source_rejects_missing_duplicate_unexpected_and_modified_source_entries(self):
        for archive in [lambda:self.android_archive(omit={'VERSION.txt'}),lambda:self.android_archive({'VERSION.json':b'{}'}),lambda:self.android_archive({'../outside.txt':b'x'}),lambda:self.android_archive(duplicate='VERSION.txt')]:
            with self.subTest(archive=archive),self.assertRaisesRegex(ValueError,'inventory'):
                release.audit_android_source(archive(),self.root)
        with self.assertRaisesRegex(ValueError,'source archive mismatch'):
            release.audit_android_source(self.android_archive({'android-app/app/src/main/AndroidManifest.xml':b'changed'}),self.root)

    def guide_fixture(self):
        self.put('README.md','[Capture evidence](docs/images/0.12.79/capture-manifest.json)\n')
        self.put('USER-GUIDE.md','Guide\n');self.put('docs/chrome-privacy.html','Privacy\n')
        return self.put('docs/images/0.12.79/capture-manifest.json',json.dumps({'schemaVersion':1,'release':'0.12.79','captures':[]}))

    def test_guides_include_only_versioned_public_capture_json_with_original_bytes(self):
        manifest=self.guide_fixture()
        self.put('docs/images/0.12.79/01-board.jpg',b'image fixture')
        for name in ('docs/private.json','docs/images/0.12.79/settings.json','docs/images/scratch/capture-manifest.json','docs/images/0.12.79/scratch/hidden/capture-manifest.json','.vizdiff/capture-manifest.json'):
            self.put(name,'{"private":"excluded fixture"}')
        first=release.package_guides(self.root/'guide.zip',self.root).read_bytes()
        self.assertEqual(first,release.package_guides(self.root/'guide2.zip',self.root).read_bytes())
        with zipfile.ZipFile(self.root/'guide.zip') as archive:
            self.assertEqual([n for n in archive.namelist() if n.endswith('.json')],['docs/images/0.12.79/capture-manifest.json'])
            self.assertEqual(archive.read('docs/images/0.12.79/capture-manifest.json'),manifest.read_bytes())
            self.assertIn('docs/images/0.12.79/01-board.jpg',archive.namelist())

    def test_guides_include_exact_nested_evidence_names_and_exclude_secret_or_deeper_json(self):
        self.guide_fixture()
        included = {}
        for feature in ('fast-pi', 'cross-probes'):
            for name in ('capture-manifest.json', 'browser-worker-benchmark.json', 'solver-benchmark.json', 'interaction-observation.json'):
                value = {'schemaVersion':1,'release':'0.12.79'} if name == 'capture-manifest.json' else {'observed':True}
                relative = f'docs/images/0.12.79/{feature}/{name}'
                included[relative] = self.put(relative,json.dumps(value)).read_bytes()
            self.put(f'docs/images/0.12.79/{feature}/secret.json','{"secret":"excluded fixture"}')
            self.put(f'docs/images/0.12.79/{feature}/scratch/interaction-observation.json','{"private":"excluded fixture"}')
        with zipfile.ZipFile(release.package_guides(self.root/'nested.zip',self.root)) as archive:
            actual = {name:archive.read(name) for name in archive.namelist() if name.endswith('.json')}
            self.assertEqual(set(actual),set(included)|{'docs/images/0.12.79/capture-manifest.json'})
            for name,content in included.items():self.assertEqual(actual[name],content)

    def test_nested_benchmark_requires_bounded_json_object_but_not_capture_schema(self):
        self.guide_fixture()
        path=self.put('docs/images/0.12.79/fast-pi/solver-benchmark.json','{"measurements":[]}')
        release.package_guides(self.root/'valid.zip',self.root)
        path.write_text('[]',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'must be an object'):
            release.package_guides(self.root/'invalid.zip',self.root)
        path.write_bytes(b' '*(1024*1024+1))
        with self.assertRaisesRegex(ValueError,'exceeds 1 MiB'):
            release.package_guides(self.root/'large.zip',self.root)

    def test_guides_reject_mismatched_or_oversized_capture_metadata(self):
        manifest=self.guide_fixture()
        for value in ({'schemaVersion':1,'release':'0.12.78'},{'schemaVersion':99,'release':'0.12.79'},[]):
            manifest.write_text(json.dumps(value),encoding='utf-8')
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'version/schema'):
                release.package_guides(self.root/'bad.zip',self.root)
        manifest.write_bytes(b' '*(1024*1024+1))
        with self.assertRaisesRegex(ValueError,'exceeds 1 MiB'):
            release.package_guides(self.root/'bad.zip',self.root)

if __name__=='__main__':unittest.main()
