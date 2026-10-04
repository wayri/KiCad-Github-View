"""Package the GitHub App service, hosted viewer sources and deployment recipe."""
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from kicad_vizdiff.app_assets import RENDERER_ASSETS, VENDOR_ASSETS, VIEWER_PAGES
names = {'LICENSING.md', 'THIRD-PARTY-NOTICES.md', 'docs/INSTALL.md', 'docs/COMMENTS.md', 'docs/GIT-HOSTS.md', 'README.md', 'pyproject.toml', 'Dockerfile.github-app', '.dockerignore',
         'compose.github-app.yml', '.github/app-manifest.example.json',
         'docs/github-app.md', 'scripts/configure_github_app.py',
         'scripts/package_app_web.py', 'scripts/package_github_app.py', 'scripts/package_step_source.py'}
for file in (root / 'kicad_vizdiff').glob('*.py'):
    if file.is_file() and not file.is_symlink():
        names.add(file.relative_to(root).as_posix())
names.add('kicad_vizdiff/viewer.html')
names.update(f'app_web/{name}' for name in VIEWER_PAGES)
names.update(f'extension/{name}' for name in RENDERER_ASSETS)
names.update(f'extension/vendor/{name}' for name in VENDOR_ASSETS)
output = root / '.vizdiff/kicad-visual-review-github-app.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(names):
        archive.write(root / name, name)
print(output)
