"""Build a reproducible Safari development payload; Apple packaging runs on a Mac."""
from pathlib import Path
import argparse
import importlib.util
import json
import zipfile

try:
    from .package_extension import FILES, ROOT
except ImportError:
    spec = importlib.util.spec_from_file_location('package_extension', Path(__file__).with_name('package_extension.py'))
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    FILES, ROOT = builder.FILES, builder.ROOT


def payload(root: Path = ROOT) -> dict[str, bytes]:
    source = root / 'extension'
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    # Do not rely on Chromium's extension sandbox semantics in another browser.
    manifest.pop('sandbox', None)
    manifest['content_security_policy'].pop('sandbox', None)
    files = set(FILES) - {'html-sandbox.html', 'html-sandbox.js'}
    files.add(manifest['background']['service_worker'])
    for entry in manifest['content_scripts']:
        files.update(entry['js'])
    files.update(manifest.get('icons', {}).values())
    result = {}
    for name in sorted(files):
        path = source / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):
            raise ValueError(f'Unsafe or missing Safari source: {name}')
        result['web-extension/' + name] = path.read_bytes()
    result['web-extension/manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    entry = result['web-extension/project-viewer.js'].decode('utf-8')
    marker = "$('previewHTML').onclick=async()=>{"
    if entry.count(marker) != 1:
        raise ValueError('HTML preview entry changed; review Safari isolation adapter.')
    # Remove the privileged frame creation handler entirely from this target.
    start = entry.index(marker)
    end = entry.index("\n $('stopHTML').onclick=", start)
    entry = (entry[:start] + marker +
             "status('Repository HTML preview is disabled in this Safari development build. Use Saved source.');};" +
             entry[end:])
    result['web-extension/project-viewer.js'] = entry.encode()
    for name, destination in [('safari/convert.sh', 'convert.sh'), ('docs/SAFARI.md', 'README.md')]:
        path = root / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing Safari packaging asset: {name}')
        result[destination] = path.read_bytes().replace(b'\r\n', b'\n')
    return result


def package(root: Path = ROOT, output: Path | None = None) -> Path:
    data = payload(root)
    version = json.loads(data['web-extension/manifest.json'])['version']
    output = output or root / '.vizdiff' / f'kicad-visual-review-safari-{version}.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(data.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name == 'convert.sh' else 0o100644) << 16
            archive.writestr(info, content)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(package(output=parser.parse_args().output))
