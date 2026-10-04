"""Build a deterministic browser-store archive from an explicit source inventory."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = {'step-decoder.js', 'step-worker.js', 'vendor/occt/occt-import-js.js', 'vendor/occt/occt-import-js.wasm', 'vendor/occt/license.occt-import-js.txt', 'vendor/occt/license.occt.txt', 'vendor/occt/NOTICE.md', 'vendor/occt/OCCT_LGPL_EXCEPTION.txt', 'vendor/occt/EMSCRIPTEN-LICENSE.txt', 'gitlab-review-api.js', 'gitlab-hosts.js', 'gitlab-options.js', 'gitlab-provider.js', 'loading-ui.js', 'load-worker.js', 'bom-analytics.js', 'file-compatibility.js', 'html-preview.js', 'html-sandbox.html', 'html-sandbox.js', 'revision-picker.js', 'project-viewer.html', 'project-viewer.css', 'project-viewer.js', 'project-settings.js', 'project-settings-ui.js', 'gerber-renderer.js', 'manifest.json',  'browser-data.js', 'design-diff.js',
         'design-model.js', 'net-model.js', 'ratsnest.js', 'paired-review.js', 'project-search.js', 'rule-reports.js', 'review-navigation.js', 'ui-icons.js', 'worksheet.js', 'view-state.js', 'review-comments.js', 'comment-compose.js', 'review-workspace.js', 'github-review-api.js', 'mention-users.js', 'options.html', 'options.js', 'review-file-store.js', 'review-file-settings.js',
         'review-tools.js', 'repo-models.js', 'browser-viewer.html', 'browser-viewer.js', 'revision-viewer.html', 'schematic-viewer.html',
         'pcb-viewer.html', 'revision-viewer.css', 'revision-viewer.js', 'owned-canvas.js', 'motion-webgl.js',
         'schematic-renderer.js', 'pcb-renderer.js', 'vendor/spike-board3d.bundle.js',
         'vendor/SPIKE-ENGINE-NOTICE.md', 'vendor/THREE-LICENSE', 'credential-vault.js',
         'credential-vault-host.html', 'credential-vault-host.js', 'credential-vault-worker.js'}

def package(root: Path = ROOT, output: Path | None = None) -> Path:
    source = root / 'extension'
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    files = set(FILES)
    files.add(manifest['background']['service_worker'])
    for script in manifest['content_scripts']:
        files.update(script['js'])
    files.update(manifest.get('icons', {}).values())
    for name in files:
        path = source / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):
            raise ValueError(f'Manifest references an unsafe or missing file: {name}')
    output = output or root / '.vizdiff' / f"kicad-visual-review-chrome-edge-brave-opera-vivaldi-chromium-{manifest['version']}.zip"
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (source / name).read_bytes())
    return output

if __name__ == '__main__':
    print(package())
