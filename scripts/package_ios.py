"""Stage exact shared offline viewer assets and a deterministic iOS source bundle."""
from pathlib import Path
import hashlib
import importlib.util
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'manifest.json', 'options.html', 'options.js', 'credential-vault.js',
    'credential-vault-host.html', 'credential-vault-host.js', 'credential-vault-worker.js',
    'github-review-api.js', 'gitlab-review-api.js', 'gitlab-hosts.js', 'gitlab-options.js',
    'gitlab-provider.js', 'mention-users.js', 'review-file-settings.js', 'background.js',
    'content.js', 'html-sandbox.html', 'html-sandbox.js', 'conflict-viewer.html',
    'conflict-viewer.js', 'conflict-viewer.css', 'conflict-properties.js', 'merge-conflicts.js'}


def payload(root=ROOT):
    spec = importlib.util.spec_from_file_location('ios_extension_package', root / 'scripts/package_extension.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    names = sorted((builder.FILES | builder.LEGAL_FILES | {'parsing.js'}) - EXCLUDED)
    result = {}
    for name in names:
        source = root / 'extension' / name
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to((root / 'extension').resolve()):
            raise ValueError(f'Invalid shared iOS asset: {name}')
        result[name] = source.read_bytes()
    manifest = {'files': names, 'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in result.items()}}
    result['ios-assets.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    return result


def package(root=ROOT, output=None):
    files = payload(root)
    stage = root / 'ios-app/PocketKiView/web'
    stage.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    sources = sorted(p for p in (root / 'ios-app').rglob('*') if p.is_file() and not p.is_symlink()
        and not any(x in {'web', 'DerivedData', 'build', 'xcuserdata'} for x in p.relative_to(root / 'ios-app').parts)
        and p.suffix in {'.swift', '.plist', '.pbxproj', '.xcscheme', '.xcprivacy', '.md'})
    output = output or root / 'dist/pocket-kiview-ios-source.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    contents = {str(p.relative_to(root)).replace('\\', '/'): p.read_bytes() for p in sources}
    contents.update({'ios-app/PocketKiView/web/' + name: data for name, data in files.items()})
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(contents.items()):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return output


if __name__ == '__main__':
    print(package())
