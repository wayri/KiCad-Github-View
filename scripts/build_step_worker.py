"""Bundle the locally supplied classic STEP worker for VS Code blob workers."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def bundle(root: Path = ROOT) -> bytes:
    source = root / 'extension'
    worker = (source / 'step-worker.js').read_bytes().replace(b'\r\n', b'\n')
    imports = b"importScripts('step-decoder.js','vendor/occt/occt-import-js.js');"
    if worker.count(imports) != 1:
        raise ValueError('STEP worker import contract changed; review the bundle builder.')
    return (b'/* STEP worker bundle; LGPL dependency notices: vendor/occt/NOTICE.md */\n' +
            (source / 'step-decoder.js').read_bytes().replace(b'\r\n', b'\n') + b'\n' +
            (source / 'vendor/occt/occt-import-js.js').read_bytes() + b'\n' +
            worker.replace(imports, b''))


if __name__ == '__main__':
    path = ROOT / 'extension/step-worker-vscode.js'
    path.write_bytes(bundle())
    print(path)
