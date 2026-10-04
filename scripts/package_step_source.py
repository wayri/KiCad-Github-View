"""Package pinned corresponding STEP dependency sources with upstream build instructions."""
from pathlib import Path
import argparse
import hashlib
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'importer.tar.gz': (
        'https://codeload.github.com/kovacsv/occt-import-js/tar.gz/c2148e54b456b571238d35cac037d304053d64b2',
        '2bd3799b2ac56cbf3f0df6300a51c8890e137bd001462702b356f621e33ff192'),
    'occt.tar.gz': (
        'https://codeload.github.com/Open-Cascade-SAS/OCCT/tar.gz/d2abb6d844231cb8f29be6894440874a4700e4a5',
        '2715d89a1bc44dfd34dab88f729c445ea93f6b57d6539b0c89614a80ae144a6c'),
}


def package(output: Path, cache: Path | None = None) -> Path:
    cache = cache or ROOT / '.vizdiff' / 'step-source'
    cache.mkdir(parents=True, exist_ok=True)
    data = {}
    for name, (url, digest) in SOURCES.items():
        path = cache / name
        if path.is_symlink():
            raise ValueError('Source cache must not contain symbolic links.')
        if path.exists():
            payload = path.read_bytes()
        else:
            with urllib.request.urlopen(url, timeout=60) as response:
                payload = response.read(100 * 1024 * 1024 + 1)
            if len(payload) > 100 * 1024 * 1024:
                raise ValueError('Source archive exceeds 100 MiB.')
        if hashlib.sha256(payload).hexdigest() != digest:
            raise ValueError(f'Pinned source checksum mismatch: {name}')
        if not path.exists():
            path.write_bytes(payload)
        data[name] = payload
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError('Source output must not be a symbolic link.')
    data['README.md'] = (ROOT / 'extension/vendor/occt/NOTICE.md').read_bytes()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, payload in sorted(data.items()):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, payload)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.vizdiff/step-corresponding-source.zip')
    args = parser.parse_args()
    print(package(args.output))
