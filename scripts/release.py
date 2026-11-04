"""Test, build and audit downloadable releases. Never pushes or publishes."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def module(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def versions(root: Path = ROOT, tag: str | None = None) -> str:
    chrome = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8'))
    native = json.loads((root / 'vscode-extension/package.json').read_text(encoding='utf-8'))
    version = chrome['version']
    if not re.fullmatch(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', version):
        raise ValueError('Extension version must be three numeric components without leading zeros.')
    if native['version'] != version:
        raise ValueError('Chrome and VS Code versions differ.')
    if tag is not None and tag != f'v{version}':
        raise ValueError(f'Release tag must match both extension manifests: v{version}.')
    if not (root / 'docs/releases' / f'v{version}.md').is_file():
        raise ValueError(f'Missing reviewed release notes for v{version}.')
    return version


def run(command: list[str], root: Path = ROOT):
    print('+ ' + ' '.join(command), flush=True)
    environment = {**os.environ, 'PYTHONUTF8': '1'}
    subprocess.run(command, cwd=root, env=environment, check=True)


def run_tests(root: Path = ROOT):
    # Python expands paths so this also works on Windows and Node 22 runners.
    tests = sorted(str(p.relative_to(root)) for pattern in (
        'extension/tests/*.test.cjs', 'vscode-extension/tests/*.test.cjs',
        'app_web/tests/*.test.cjs', 'tests/*.test.cjs', 'tests/*.test.mjs') for p in root.glob(pattern))
    if not tests:
        raise ValueError('No JavaScript acceptance tests found.')
    run([sys.executable, 'scripts/package_vscode.py'], root)
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'], root)
    run(['node', '--test', '--test-concurrency=1', *tests], root)


def source_commit(root: Path = ROOT, tag: str | None = None) -> str | None:
    # Git searches parent folders; a nested export is not itself a source checkout.
    top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=root,
                         text=True, capture_output=True)
    if top.returncode or Path(top.stdout.strip()).resolve() != root.resolve():
        if tag:
            raise ValueError('A tagged release requires a committed Git checkout.')
        return None
    result = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=root,
                            text=True, capture_output=True)
    if result.returncode:
        if tag:
            raise ValueError('A tagged release requires a committed Git checkout.')
        return None
    commit = result.stdout.strip()
    if tag:
        target = subprocess.run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}'],
                                cwd=root, text=True, capture_output=True)
        if target.returncode or target.stdout.strip() != commit:
            raise ValueError('Release tag must exist locally and point to the checked-out commit.')
        if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=root):
            raise ValueError('Tagged release requires a clean source checkout.')
    return commit


def audit_committed_assets(required: set[str], root: Path = ROOT):
    """Ignored local dependencies must not masquerade as a complete source release."""
    tracked = set(subprocess.check_output(
        ['git', 'ls-tree', '-r', '--name-only', '-z', 'HEAD'], cwd=root
    ).decode('utf-8').split('\0'))
    missing = sorted(required - tracked)
    if missing:
        raise ValueError('Required release assets absent from committed source: ' + ', '.join(missing[:8]))
    return len(required)


def normalize_archive(source: Path, target: Path):
    """Normalize timestamps and permissions of existing explicitly selected app assets."""
    with zipfile.ZipFile(source) as incoming, zipfile.ZipFile(target, 'w',
            compression=zipfile.ZIP_DEFLATED, compresslevel=9) as outgoing:
        for name in sorted(incoming.namelist()):
            if name.startswith('/') or '..' in Path(name).parts or '\\' in name:
                raise ValueError('Unsafe release archive entry.')
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            outgoing.writestr(info, incoming.read(name))


def audit_packages(chrome: Path, native: Path, root: Path = ROOT):
    browser_builder, native_builder = module('package_extension'), module('package_vscode')
    manifest = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8'))
    expected = set(browser_builder.FILES) | set(browser_builder.LEGAL_FILES) | set(manifest['icons'].values())
    expected.add(manifest['background']['service_worker'])
    expected.add('VERSION.txt')
    chrome_metadata = browser_builder.version_metadata(root, 'chrome')
    vscode_metadata = browser_builder.version_metadata(root, 'vscode')
    for entry in manifest['content_scripts']:
        expected.update(entry['js'])
    with zipfile.ZipFile(chrome) as archive:
        if set(archive.namelist()) != expected:
            raise ValueError('Chrome archive inventory differs from audited source inventory.')
        for name in expected:
            source = browser_builder.version_text(chrome_metadata) if name == 'VERSION.txt' else (root / 'extension' / name).read_bytes()
            if name == 'product-version.js':
                source = browser_builder.version_script(source, chrome_metadata)
            if archive.read(name) != source:
                raise ValueError(f'Chrome package/source mismatch: {name}')
    with zipfile.ZipFile(native) as archive:
        expected_native = ({f'extension/media/{name}' for name in native_builder.ASSETS} |
                           {f'extension/{name}' for name in native_builder.HOST_FILES} |
                           {f'extension/media/{provider}-review-host-api.js' for provider in ('github', 'gitlab')} |
                           {'extension/media/shared-assets.json', 'extension.vsixmanifest', '[Content_Types].xml', 'VERSION.txt', 'extension/media/VERSION.txt'})
        if set(archive.namelist()) != expected_native:
            raise ValueError('VSIX archive inventory differs from audited source inventory.')
        for name in ('VERSION.txt', 'extension/media/VERSION.txt'):
            if archive.read(name) != browser_builder.version_text(vscode_metadata):
                raise ValueError(f'VSIX generated version mismatch: {name}')
        for name in native_builder.ASSETS:
            source = (root / 'extension' / name).read_bytes()
            expected_bytes = native_builder.adapt_entry(source) if name == 'revision-viewer.js' else source
            if name == 'product-version.js':
                expected_bytes = browser_builder.version_script(source, vscode_metadata)
            if archive.read(f'extension/media/{name}') != expected_bytes:
                raise ValueError(f'VSIX package/source mismatch: {name}')
        for name in native_builder.HOST_FILES:
            if archive.read(f'extension/{name}') != (root / 'vscode-extension' / name).read_bytes():
                raise ValueError(f'VSIX host/source mismatch: {name}')
        for provider in ('github', 'gitlab'):
            name = f'{provider}-review-host-api.js'
            expected_bytes = native_builder.host_review_factory((root / 'extension' / f'{provider}-review-api.js').read_bytes(), provider)
            if archive.read(f'extension/media/{name}') != expected_bytes:
                raise ValueError(f'VSIX generated host/source mismatch: {name}')
    return {'chromeFiles': len(expected), 'sharedVSCodeAssets': len(native_builder.ASSETS)}


def package_guides(output: Path, root: Path = ROOT):
    paths = [root / 'README.md', root / 'USER-GUIDE.md', *sorted((root / 'docs').rglob('*.md')),
             *sorted((root / 'extension/docs').rglob('*.md')),
             *([root / 'vscode-extension/README.md'] if (root / 'vscode-extension/README.md').is_file() else []),
             *([root / 'vscode-extension/GUIDE.md'] if (root / 'vscode-extension/GUIDE.md').is_file() else []),
             *sorted((root / 'vscode-extension/images').glob('*.jpg')),
             *([root / 'LICENSE'] if (root / 'LICENSE').is_file() else []),
             *([root / 'LICENSING.md'] if (root / 'LICENSING.md').is_file() else []),
             *[root / name for name in ('COMMERCIAL-LICENSING.md', 'THIRD-PARTY-NOTICES.md', 'SECURITY.md') if (root / name).is_file()],
             *sorted((root / 'docs/images').rglob('*.jpg')),
               *sorted((root / 'docs/images').rglob('*.png')),
               *sorted((root / 'docs/images/draftsman').glob('*.webm')),
               root / 'docs/chrome-privacy.html']
    # Only established public evidence names at version/ or version/feature/.
    # Never collect arbitrary docs configuration, credentials or scratch JSON.
    evidence_names = {'capture-manifest.json', 'collection-manifest.json', 'browser-worker-benchmark.json',
                      'solver-benchmark.json', 'interaction-observation.json'}
    images = root / 'docs/images'
    candidates = [*images.glob('*/*.json'), *images.glob('*/*/*.json')]
    for manifest in sorted(candidates):
        parts = manifest.relative_to(images).parts
        version = parts[0]
        if manifest.name not in evidence_names or not re.fullmatch(r'(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)', version):
            continue
        if len(parts) == 3 and not re.fullmatch(r'[a-z0-9][a-z0-9-]*', parts[1]):
            continue
        if manifest.is_symlink() or any(parent.is_symlink() for parent in manifest.parents if parent.is_relative_to(root)) or not manifest.resolve().is_relative_to(root.resolve()):
            raise ValueError('Unsafe guide evidence JSON.')
        if manifest.stat().st_size > 1024 * 1024:
            raise ValueError('Guide capture/evidence manifest exceeds 1 MiB.')
        document = json.loads(manifest.read_text(encoding='utf-8'))
        if not isinstance(document, dict):
            raise ValueError('Guide evidence JSON must be an object; capture version/schema cannot be inferred.')
        if manifest.name in {'capture-manifest.json', 'collection-manifest.json'} and (document.get('schemaVersion') != 1 or document.get('release') != version):
            raise ValueError('Guide capture manifest version/schema differs from its directory.')
        paths.append(manifest)
    # Preserve the searchable gallery beside its Markdown and relative images.
    # Only versioned gallery names are eligible, never arbitrary repository HTML.
    paths.extend(path for path in sorted((root / 'docs').glob('SCREENSHOT-GALLERY-*.html'))
                 if re.fullmatch(r'SCREENSHOT-GALLERY-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.html', path.name))
    paths.extend(sorted((root / 'docs/play-store/assets').glob('*.png')))
    paths.extend(sorted((root / 'docs/play-store').glob('*.html')))
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in paths:
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                raise ValueError('Unsafe guide source.')
            info = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    return output


def android_version(root: Path = ROOT) -> str:
    source = (root / 'android-app/app/build.gradle').read_text(encoding='utf-8')
    match = re.search(r"versionName\s+['\"]([0-9]+\.[0-9]+(?:\.[0-9]+)?)['\"]", source)
    if not match:
        raise ValueError('Missing numeric Android versionName.')
    return match.group(1)


def android_names(root: Path = ROOT) -> set[str]:
    version = android_version(root)
    return {f'pocket-kivi-android-phone-tablet-{version}-development.apk',
            f'pocket-kivi-android-{version}-unsigned.aab',
            f'pocket-kivi-android-source-{version}.zip'}


def audit_android_payload(archive_path: Path, expected: dict[str, bytes], prefix: str):
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate Android archive entries.')
        actual = {name for name in names if name.startswith(prefix) and not name.endswith('/')}
        if actual != {prefix + name for name in expected}:
            raise ValueError('Android asset inventory differs from current source.')
        for name, data in expected.items():
            if archive.read(prefix + name) != data:
                raise ValueError(f'Android package/source mismatch: {name}')


def audit_android_source(archive_path: Path, root: Path = ROOT):
    """Audit original source bytes plus the one explicitly generated root entry."""
    builder = module('package_android')
    version_builder = module('package_extension')
    version_content = version_builder.version_text(version_builder.version_metadata(root, 'android'))
    source_names = {path.relative_to(root).as_posix() for path in builder.source_files(root)}
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        expected_names = source_names | {'VERSION.txt'}
        if set(names) != expected_names or len(names) != len(expected_names):
            raise ValueError('Android source archive inventory differs from current source.')
        if archive.read('VERSION.txt') != version_content:
            raise ValueError('Android generated VERSION.txt differs from canonical release/app metadata.')
        embedded = 'android-app/app/src/main/assets/viewer/VERSION.txt'
        if embedded in source_names and archive.read(embedded) != version_content:
            raise ValueError('Android embedded VERSION.txt differs from canonical release/app metadata.')
        for name in sorted(source_names):
            path = root / name
            if not path.resolve().is_relative_to((root / 'android-app').resolve()) or not path.is_file() or path.is_symlink() or archive.read(name) != path.read_bytes():
                raise ValueError(f'Android source archive mismatch: {name}')
    return len(expected_names)


def package_android(output: Path, root: Path = ROOT):
    """Accept only locally built binaries whose embedded viewer matches this checkout."""
    version = android_version(root)
    builder = module('package_android')
    expected = builder.payload(root)
    apk = root / 'android-app/app/build/outputs/apk/debug/app-debug.apk'
    bundle = root / 'android-app/app/build/outputs/bundle/release/app-release.aab'
    lint = root / 'android-app/app/build/reports/lint-results-debug.xml'
    for path in (apk, bundle, lint):
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing Android build output: {path}; run assembleDebug lintDebug bundleRelease.')
    issues = ET.parse(lint).getroot().findall('issue')
    if any(issue.get('severity') in {'Fatal', 'Error'} for issue in issues):
        raise ValueError('Android lint contains errors.')
    sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk:
        raise ValueError('ANDROID_HOME is required to audit APK version and signature.')
    tools = Path(sdk) / 'build-tools/36.1.0'
    suffix = '.bat' if os.name == 'nt' else ''
    subprocess.run([str(tools / ('apksigner' + suffix)), 'verify', str(apk)], check=True, cwd=root)
    aapt = tools / ('aapt2.exe' if os.name == 'nt' else 'aapt2')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, cwd=root)
    if 'application-debuggable' in badging:
        raise ValueError('Refusing to distribute a debuggable Android APK.')
    gradle = (root / 'android-app/app/build.gradle').read_text(encoding='utf-8')
    code = re.search(r'versionCode\s+(\d+)', gradle).group(1)
    if not re.search(r"package: name='dev\.kicadvizdiff\.android' versionCode='" + code + r"' versionName='" + re.escape(version) + "'", badging):
        raise ValueError('Android APK package/version differs from source.')
    audit_android_payload(apk, expected, 'assets/viewer/')
    audit_android_payload(bundle, expected, 'base/assets/viewer/')
    with zipfile.ZipFile(bundle) as archive:
        if any(re.fullmatch(r'META-INF/[^/]+\.(?:RSA|DSA|EC|SF)', name, re.IGNORECASE) for name in archive.namelist()):
            raise ValueError('Expected an unsigned Android bundle.')
    source = builder.package(root)
    audit_android_source(source, root)
    for source_path, name in ((apk, f'pocket-kivi-android-phone-tablet-{version}-development.apk'),
                              (bundle, f'pocket-kivi-android-{version}-unsigned.aab'),
                              (source, f'pocket-kivi-android-source-{version}.zip')):
        shutil.copyfile(source_path, output / name)
    return {'version': version, 'versionCode': int(code), 'viewerAssets': len(expected),
            'apkSignature': 'Verified development/debug signature; not a production signing identity.',
            'debuggable': False,
            'bundleSigning': 'Unsigned; not ready for Play Store upload.',
            'lintWarnings': sum(issue.get('severity') == 'Warning' for issue in issues),
            'deviceAcceptance': 'Not implied by the release build; requires separate device verification.',
            'reproducibility': 'Build instructions and exact source commit recorded; signed binary bytes may differ between builds.'}


def package_native_helper(output: Path, version: str):
    """Explicit source-only Windows helper; no local registration or signing data."""
    sources = {'kicad_vizdiff/__init__.py': 'kicad_vizdiff/__init__.py',
               'kicad_vizdiff/native_host.py': 'kicad_vizdiff/native_host.py',
               'scripts/install_native_host.py': 'scripts/install_native_host.py',
               'README.md': 'docs/OPEN-IN-KICAD.md', 'LICENSE': 'LICENSE'}
    path = output / f'pocket-kivi-windows-kicad-helper-{version}.zip'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for target, source in sorted(sources.items()):
            info = zipfile.ZipInfo('pocket-kivi-native-helper/' + target, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (ROOT / source).read_bytes())
    with zipfile.ZipFile(path) as archive:
        if len(archive.namelist()) != len(sources):
            raise ValueError('Desktop helper inventory mismatch.')
        for target, source in sources.items():
            if archive.read('pocket-kivi-native-helper/' + target) != (ROOT / source).read_bytes():
                raise ValueError('Desktop helper source mismatch.')
    return len(sources)


def build(output: Path, tag: str | None = None, android: bool = False):
    version = versions(tag=tag)
    commit = source_commit(tag=tag)
    if tag:
        browser, native = module('package_extension'), module('package_vscode')
        manifest = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))
        browser_files = set(browser.FILES) | set(browser.LEGAL_FILES) | set(manifest['icons'].values()) | {'manifest.json', manifest['background']['service_worker']}
        for entry in manifest['content_scripts']:
            browser_files.update(entry['js'])
        required = {'kicad_vizdiff/native_host.py', 'scripts/install_native_host.py', 'docs/OPEN-IN-KICAD.md'} | {f'extension/{name}' for name in browser_files | set(native.ASSETS)} | {f'vscode-extension/{name}' for name in native.HOST_FILES}
        if android:
            # The source ZIP deliberately includes generated viewer copies. Their
            # inputs are covered by the browser assets and tracked Android web files.
            generated = ROOT / 'android-app/app/src/main/assets/viewer'
            required.update(path.relative_to(ROOT).as_posix() for path in module('package_android').source_files(ROOT) if not path.is_relative_to(generated))
        audit_committed_assets(required)
    if output.is_symlink() or any(parent.is_symlink() for parent in output.parents):
        raise ValueError("Release output must not follow symbolic links.")
    output = output.resolve()
    # Refuse any unknown/stale files so the publisher's wildcard cannot upload extras.
    names = {f'pocket-kivi-windows-kicad-helper-{version}.zip', f'kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{version}.zip', f'kicad-visual-review-vscode-{version}.vsix',
             f'kicad-visual-review-firefox-{version}.zip', f'kicad-visual-review-safari-{version}.zip',
             f'kicad-visual-review-guides-{version}.zip', 'FIREFOX.md', 'SAFARI.md',
             f'kicad-visual-review-app-web-{version}.zip', f'kicad-visual-review-github-app-{version}.zip',
             f'kicad-visual-review-step-source-{version}.zip', f'pocket-kiview-local-preview-{version}.zip', 'SHA256SUMS.txt', 'RELEASE-NOTES.md', 'INSTALL.md', 'COMMENTS.md', 'GIT-HOSTS.md', 'THIRD-PARTY-NOTICES.md', 'release-manifest.json', 'HARDENED-DEPLOYMENT.md'}
    if android:
        names.update(android_names())
    if output.is_symlink():
        raise ValueError('Release output must not be a symbolic link.')
    if output.exists() and any(p.name not in names or not p.is_file() or p.is_symlink() for p in output.iterdir()):
        raise ValueError('Release output has unexpected files; use a new empty output directory.')
    output.mkdir(parents=True, exist_ok=True)
    chrome = module('package_extension').package(output=output / f'kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{version}.zip')
    native = module('package_vscode').package(output=output / f'kicad-visual-review-vscode-{version}.vsix')
    evidence = audit_packages(chrome, native)
    evidence['windowsNativeHelperSourceFiles'] = package_native_helper(output, version)
    local_builder = module('package_local_viewer')
    local_path = local_builder.package(output=output / f'pocket-kiview-local-preview-{version}.zip')
    with zipfile.ZipFile(local_path) as archive:
        local_expected = {'pocket_kiview/' + name: data for name, data in local_builder.payload().items()}
        if set(archive.namelist()) != set(local_expected) or any(archive.read(name) != data for name, data in local_expected.items()):
            raise ValueError('Standalone local viewer package/source mismatch.')
    evidence['localViewerFiles'] = len(local_expected)
    if android:
        evidence['android'] = package_android(output)
    module('package_step_source').package(output / f'kicad-visual-review-step-source-{version}.zip')
    for target in ('firefox', 'safari'):
        builder = module(f'package_{target}')
        path = builder.package(output=output / f'kicad-visual-review-{target}-{version}.zip')
        expected = builder.payload()
        with zipfile.ZipFile(path) as archive:
            if set(archive.namelist()) != set(expected) or any(archive.read(name) != data for name, data in expected.items()):
                raise ValueError(f'{target} package/source mismatch.')
        evidence[f'{target}Files'] = len(expected)
    evidence['installedFirefoxAcceptance'] = 'Not performed; unsigned development package.'
    evidence['nativeSafariAcceptance'] = 'Not performed; macOS conversion, signing and runtime verification required.'
    package_guides(output / f'kicad-visual-review-guides-{version}.zip')
    run([sys.executable, 'scripts/package_app_web.py'])
    run([sys.executable, 'scripts/package_github_app.py'])
    for kind in ('app-web', 'github-app'):
        normalize_archive(ROOT / '.vizdiff' / f'kicad-visual-review-{kind}.zip',
                          output / f'kicad-visual-review-{kind}-{version}.zip')
    for source, destination in ((f'docs/releases/v{version}.md', 'RELEASE-NOTES.md'),
                                ('docs/HARDENED-DEPLOYMENT.md', 'HARDENED-DEPLOYMENT.md'), ('docs/INSTALL.md', 'INSTALL.md'), ('docs/FIREFOX.md', 'FIREFOX.md'), ('docs/SAFARI.md', 'SAFARI.md'), ('docs/COMMENTS.md', 'COMMENTS.md'), ('docs/GIT-HOSTS.md', 'GIT-HOSTS.md'), ('THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.md')):
        shutil.copyfile(ROOT / source, output / destination)
    assets = sorted(p for p in output.iterdir() if p.name not in {'SHA256SUMS.txt', 'release-manifest.json'})
    digests = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in assets}
    report = {'schemaVersion': 1, 'version': version, 'tag': tag, 'sourceCommit': commit,
              'prerelease': True, 'packageAudit': evidence, 'assets': digests,
              'sourceDirty': bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=ROOT)) if commit else True,
              'verification': 'Tests must pass before this command builds. Native CLI tests skip when KiCad is unavailable. Live GitHub/store acceptance is not implied.',
              'pythonToolVersion': '0.1.0'}
    (output / 'release-manifest.json').write_text(json.dumps(report, indent=2, sort_keys=True)+'\n', encoding='utf-8')
    digests['release-manifest.json'] = hashlib.sha256((output / 'release-manifest.json').read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in sorted(digests.items())), encoding='utf-8')
    print(f'Release assets verified: {output}', flush=True)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', help='Existing checked-out version tag, e.g. v0.11.0')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/release')
    parser.add_argument('--android', action='store_true', help='Include audited assembleDebug/lintDebug/bundleRelease outputs (requires Android SDK 36.1.0).')
    args = parser.parse_args()
    versions(tag=args.tag)
    source_commit(tag=args.tag)
    run_tests()
    build(args.output, args.tag, android=args.android)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
