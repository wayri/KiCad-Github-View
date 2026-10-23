"""Deterministic read-only local UI and KiCad legacy launcher bundle."""
from pathlib import Path
import importlib.util
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ('kicad_vizdiff/__init__.py', 'kicad_vizdiff/local_viewer.py',
          'kicad_plugin/__init__.py', 'kicad_plugin/action.py')


def payload(root=ROOT):
    spec = importlib.util.spec_from_file_location('local_extension_package', root / 'scripts/package_extension.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    names = builder.FILES | builder.LEGAL_FILES
    # Authentication and website-only entry points are unnecessary for local mode.
    excluded = {'manifest.json', 'options.html', 'options.js', 'credential-vault.js',
                'credential-vault-host.html', 'credential-vault-host.js', 'credential-vault-worker.js',
                'github-review-api.js', 'gitlab-review-api.js', 'gitlab-hosts.js', 'gitlab-options.js',
                'gitlab-provider.js', 'mention-users.js', 'review-file-settings.js'}
    names = sorted((names - excluded) | {'parsing.js'})
    result = {'web/' + name: (root / 'extension' / name).read_bytes() for name in names}
    result['web/local-assets.json'] = (json.dumps({'files': [name for name in names if name != 'LICENSE.txt']}, indent=2) + '\n').encode()
    for name in PYTHON:
        result[name] = (root / name).read_bytes()
    result['__init__.py'] = b'"""Pocket KiView legacy PCB launcher."""\nfrom . import kicad_plugin\n'
    result['README.md'] = (root / 'docs/LOCAL-VIEWER.md').read_bytes()
    return result


def package(root=ROOT, output=None):
    version = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8'))['version']
    output = output or root / 'dist' / f'pocket-kiview-local-preview-{version}.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(payload(root).items()):
            info = zipfile.ZipInfo('pocket_kiview/' + name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return output


if __name__ == '__main__':
    print(package())
