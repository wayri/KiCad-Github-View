"""Stage the two audited store packages without rebuilding or publishing them."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def prepare(version='0.12.46'):
    source = ROOT / '.vizdiff' / f'release-{version}' / 'dist/release'
    manifest = json.loads((source / 'release-manifest.json').read_text(encoding='utf-8'))
    if manifest['version'] != version or manifest['sourceDirty']:
        raise ValueError('Use a verified release from a clean source snapshot.')
    names = [f'kicad-visual-review-vscode-{version}.vsix',
             f'kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{version}.zip']
    verified = {}
    for name in names:
        path = source / name
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != manifest['assets'][name]:
            raise ValueError('Release checksum mismatch: ' + name)
        with zipfile.ZipFile(path) as archive:
            metadata = json.loads(archive.read('extension/package.json' if name.endswith('.vsix') else 'manifest.json'))
            if metadata['version'] != version:
                raise ValueError('Packaged version mismatch: ' + name)
            if name.endswith('.vsix') and (metadata['publisher'], metadata['name']) != ('wayri', 'kicad-visual-review'):
                raise ValueError('Unexpected immutable Marketplace identity.')
        verified[name] = digest
    target = ROOT / 'dist' / f'store-submission-{version}'
    target.mkdir(parents=True, exist_ok=True)
    for name in names:
        shutil.copy2(source / name, target / name)
    (target / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in verified.items()), encoding='utf-8')
    report = {'version': version, 'sourceCommit': manifest['sourceCommit'], 'artifacts': verified,
              'status': 'Prepared locally; not uploaded to either store.',
              'pending': ['Publisher account sign-in and ownership', 'Installed desktop/browser smoke tests',
                          'Listing preview, licensing and disclosures', 'Current genuine screenshots',
                          'Chrome public extension privacy policy and developer registration']}
    (target / 'submission-status.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(target)


if __name__ == '__main__':
    prepare()
