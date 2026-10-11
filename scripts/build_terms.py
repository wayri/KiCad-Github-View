"""Render bundled terms from the reviewed plain Markdown source."""
from html import escape
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def build(root=ROOT):
    sections = []
    for block in (root / 'docs/play-store/TERMS.md').read_text(encoding='utf-8').strip().split('\n\n'):
        tag = 'h1' if block.startswith('# ') else 'h2' if block.startswith('## ') else 'p'
        value = block[2:] if tag == 'h1' else block[3:] if tag == 'h2' else block
        sections.append(f'<{tag}>{escape(value)}</{tag}>')
    page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Pocket KiView Terms of Service</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:20px;color:light-dark(#18313a,#e3edf0);background:light-dark(#f8fbfc,#14242b)}main{max-width:720px;margin:auto}h1{font-size:25px;line-height:1.2}h2{font-size:19px;margin-top:28px}p{overflow-wrap:anywhere;margin:12px 0}a{color:light-dark(#006578,#72d5eb)}</style></head><body><main>'''+''.join(sections)+'''<p>Support: <a href="mailto:support.kiview@sigharmonic.com">support.kiview@sigharmonic.com</a></p></main></body></html>\n'''
    for name in ('docs/play-store/terms.html', 'android-app/web/terms.html', 'extension/terms.html'):
        (root / name).write_text(page, encoding='utf-8')

if __name__ == '__main__':
    build()
