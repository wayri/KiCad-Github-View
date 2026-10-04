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
    run(['node', '--test', *tests], root)


def source_commit(root: Path = ROOT, tag: str | None = None) -> str | None:
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
    expected = set(browser_builder.FILES) | set(manifest['icons'].values())
    expected.add(manifest['background']['service_worker'])
    for entry in manifest['content_scripts']:
        expected.update(entry['js'])
    with zipfile.ZipFile(chrome) as archive:
        if set(archive.namelist()) != expected:
            raise ValueError('Chrome archive inventory differs from audited source inventory.')
        for name in expected:
            if archive.read(name) != (root / 'extension' / name).read_bytes():
                raise ValueError(f'Chrome package/source mismatch: {name}')
    with zipfile.ZipFile(native) as archive:
        expected_native = ({f'extension/media/{name}' for name in native_builder.ASSETS} |
                           {f'extension/{name}' for name in native_builder.HOST_FILES} |
                           {'extension/media/shared-assets.json', 'extension.vsixmanifest', '[Content_Types].xml'})
        if set(archive.namelist()) != expected_native:
            raise ValueError('VSIX archive inventory differs from audited source inventory.')
        for name in native_builder.ASSETS:
            source = (root / 'extension' / name).read_bytes()
            expected_bytes = native_builder.adapt_entry(source) if name == 'revision-viewer.js' else source
            if archive.read(f'extension/media/{name}') != expected_bytes:
                raise ValueError(f'VSIX package/source mismatch: {name}')
        for name in native_builder.HOST_FILES:
            if archive.read(f'extension/{name}') != (root / 'vscode-extension' / name).read_bytes():
                raise ValueError(f'VSIX host/source mismatch: {name}')
    return {'chromeFiles': len(expected), 'sharedVSCodeAssets': len(native_builder.ASSETS)}


def package_guides(output: Path, root: Path = ROOT):
    paths = [root / 'README.md', *sorted((root / 'docs').rglob('*.md')),
             *sorted((root / 'extension/docs').rglob('*.md')),
             *([root / 'vscode-extension/README.md'] if (root / 'vscode-extension/README.md').is_file() else []),
             *sorted((root / 'docs/images').rglob('*.jpg')),
             *sorted((root / 'docs/images').rglob('*.png'))]
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in paths:
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                raise ValueError('Unsafe guide source.')
            info = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    return output


def build(output: Path, tag: str | None = None):
    version = versions(tag=tag)
    commit = source_commit(tag=tag)
    if output.is_symlink() or any(parent.is_symlink() for parent in output.parents):
        raise ValueError("Release output must not follow symbolic links.")
    output = output.resolve()
    # Refuse any unknown/stale files so the publisher's wildcard cannot upload extras.
    names = {f'kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{version}.zip', f'kicad-visual-review-vscode-{version}.vsix',
             f'kicad-visual-review-firefox-{version}.zip', f'kicad-visual-review-safari-{version}.zip',
             f'kicad-visual-review-guides-{version}.zip', 'FIREFOX.md', 'SAFARI.md',
             f'kicad-visual-review-app-web-{version}.zip', f'kicad-visual-review-github-app-{version}.zip',
             f'kicad-visual-review-step-source-{version}.zip', 'SHA256SUMS.txt', 'RELEASE-NOTES.md', 'INSTALL.md', 'COMMENTS.md', 'GIT-HOSTS.md', 'THIRD-PARTY-NOTICES.md', 'release-manifest.json'}
    if output.is_symlink():
        raise ValueError('Release output must not be a symbolic link.')
    if output.exists() and any(p.name not in names or not p.is_file() or p.is_symlink() for p in output.iterdir()):
        raise ValueError('Release output has unexpected files; use a new empty output directory.')
    output.mkdir(parents=True, exist_ok=True)
    chrome = module('package_extension').package(output=output / f'kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{version}.zip')
    native = module('package_vscode').package(output=output / f'kicad-visual-review-vscode-{version}.vsix')
    evidence = audit_packages(chrome, native)
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
                                ('docs/INSTALL.md', 'INSTALL.md'), ('docs/FIREFOX.md', 'FIREFOX.md'), ('docs/SAFARI.md', 'SAFARI.md'), ('docs/COMMENTS.md', 'COMMENTS.md'), ('docs/GIT-HOSTS.md', 'GIT-HOSTS.md'), ('THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.md')):
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
    args = parser.parse_args()
    versions(tag=args.tag)
    source_commit(tag=args.tag)
    run_tests()
    build(args.output, args.tag)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
