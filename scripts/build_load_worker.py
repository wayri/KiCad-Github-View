"""Build the self-contained, CSP-compatible VS Code preparation worker."""
from pathlib import Path
import re
import ast
ROOT=Path(__file__).resolve().parents[1]
def bundle(root=ROOT):
    worker=(root/'extension/load-worker.js').read_text(encoding='utf-8')
    matches=list(re.finditer(r'^importScripts\(([^\n]+)\);\r?$',worker,re.M))
    if len(matches)!=1:raise ValueError('Preparation worker import contract changed.')
    names=ast.literal_eval('['+matches[0].group(1)+']')
    if not all(isinstance(n,str) and re.fullmatch(r'[a-z-]+\.js',n) for n in names):raise ValueError('Unsafe preparation worker dependency.')
    body=worker[:matches[0].start()]+worker[matches[0].end():]
    text='/* Self-contained VS Code preparation worker. Regenerate with scripts/build_load_worker.py. */\n'+''.join((root/'extension'/n).read_text(encoding='utf-8')+'\n;\n' for n in names)+body
    return text.encode('utf-8')
if __name__=='__main__':
    path=ROOT/'extension/load-worker-vscode.js'
    path.write_bytes(bundle());print(path)
