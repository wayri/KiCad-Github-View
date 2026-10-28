"""Build a deterministic browser-store archive from an explicit source inventory."""
from pathlib import Path
import json
import importlib.util
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LEGAL_FILES = {'terms.html', 'LICENSE.txt'}
MODEL_FILES = {'embedded-models.js', 'vendor/fzstd/fzstd.js', 'vendor/fzstd/LICENSE'}
FILES = {'analysis-data.js', 'analysis-viewer.html', 'analysis-viewer.css', 'analysis-viewer.js', 'touch-canvas.js', 'merge-conflicts.js', 'conflict-viewer.html', 'conflict-viewer.js', 'conflict-viewer.css', 'conflict-properties.js', 'bom-manager.js', 'bom-manager.css', 'part-fields.js', 'BRAND-ASSETS.md', 'step-decoder.js', 'step-worker.js', 'vendor/occt/occt-import-js.js', 'vendor/occt/occt-import-js.wasm', 'vendor/occt/license.occt-import-js.txt', 'vendor/occt/license.occt.txt', 'vendor/occt/NOTICE.md', 'vendor/occt/OCCT_LGPL_EXCEPTION.txt', 'vendor/occt/EMSCRIPTEN-LICENSE.txt', 'gitlab-review-api.js', 'gitlab-hosts.js', 'gitlab-options.js', 'gitlab-provider.js', 'loading-ui.js', 'load-worker.js', 'bom-analytics.js', 'file-compatibility.js', 'html-preview.js', 'html-sandbox.html', 'html-sandbox.js', 'revision-picker.js', 'project-viewer.html', 'project-viewer.css', 'project-viewer.js', 'project-settings.js', 'project-settings-ui.js', 'gerber-renderer.js', 'manifest.json',  'browser-data.js', 'design-diff.js',
         'design-model.js', 'net-model.js', 'overview-connectivity.js', 'ratsnest.js', 'paired-review.js', 'project-search.js', 'rule-reports.js', 'review-navigation.js', 'ui-icons.js', 'worksheet.js', 'view-state.js', 'review-comments.js', 'comment-compose.js', 'review-workspace.js', 'github-review-api.js', 'mention-users.js', 'options.html', 'options.js', 'review-file-store.js', 'review-file-settings.js',
         'review-tools.js', 'repo-models.js', 'browser-viewer.html', 'browser-viewer.js', 'revision-viewer.html', 'schematic-viewer.html',
         'pcb-viewer.html', 'revision-viewer.css', 'revision-viewer.js', 'owned-canvas.js', 'motion-webgl.js',
         'schematic-renderer.js', 'pcb-renderer.js', 'vendor/spike-board3d.bundle.js',
         'vendor/SPIKE-ENGINE-NOTICE.md', 'vendor/THREE-LICENSE', 'credential-vault.js',
         'credential-vault-host.html', 'credential-vault-host.js', 'credential-vault-worker.js'}
FILES.update({'overview-routing.js','dashboard.html','dashboard.css','dashboard.js','project-recents.js'})
FILES.update({'workspace-chrome.css','workspace-chrome.js','revision-actions.js','revision-fork.js','analysis-simulation.js','analysis-simulation.css'})
FILES.update({'provider-oauth.js','provider-oauth.json'})
FILES.update({'native-kicad.js', 'comment-focus.js'})
FILES.update({'chat-content.js','chat-panel.js','chat-panel.css','review-sync.js','work-board-panel.js'})
FILES.update({'compact-surfaces.css','compact-surfaces.js'})
FILES.update({'managed-policy.js','managed-policy-schema.json','managed-policy-options.js'})
FILES.update(MODEL_FILES)
FILES.update({'repository-explorer.js','repository-explorer.css','layer-colors.js'})
FILES.update({'engineering-launcher.js', 'review-handoff.js', 'local-project.js', 'local-import.js', 'local-runtime.js', 'local-viewer.html', 'local-viewer.js', 'local-viewer.css', 'local-layout.js'})
FILES.update({'analysis-spatial.js', 'analysis-overlay.js'})
FILES.update({'variant-manager.js', 'bom-import.js', 'bom-viewer.html', 'bom-viewer.js','bom-workspace.js', 'bom-field-table.js', 'bom-viewer.css', 'calculator-tools.js', 'calculator-viewer.html', 'calculator-viewer.js', 'calculator-viewer.css', 'analysis-bom-link.js', 'gerber-analysis.js', 'gerber-viewer.html', 'gerber-viewer.js', 'gerber-viewer.css'})
FILES.update({'calculator-catalog.js','calculator-visuals.js'})
FILES.update({'tool-header.css','tool-header.js'})
FILES.update({'startup-health.js','environment-diagnostics.js','environment-options.js'})

FILES.update({'population-inspection.js','population-photo.js','population-review.js','testpoint-tools.js','photo-alignment.js','component-links.js','photo-review.js','photo-review.css'})
FILES.update({'ui-foundation.css','tool-surfaces.css','gerber-camera.js'})
PDF_FILES = {'pdf-tools.js','pdf-viewer.html','pdf-viewer.css','pdf-viewer.js','vendor/pdfjs/FILES.json'} | {'vendor/pdfjs/'+name for name in json.loads((ROOT/'extension/vendor/pdfjs/FILES.json').read_text())['files']}
FILES.update(PDF_FILES)
FILES.update({'section-pages.js','section-pages.css','board-setup-ui.js','board-setup-ui.css','mobile-sidebar.js','mobile-sidebar.css','testpoint-tools.css','sheet-hierarchy-links.js','responsive-controls.js','phone-polish.css'})

def package(root: Path = ROOT, output: Path | None = None) -> Path:
    source = root / 'extension'
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    files = set(FILES) | LEGAL_FILES | MODEL_FILES
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
            content = (source / name).read_bytes()
            if name == 'provider-oauth.json':
                spec = importlib.util.spec_from_file_location('publisher_oauth', root / 'scripts/provider_oauth.py')
                config = importlib.util.module_from_spec(spec); spec.loader.exec_module(config)
                content = config.payload(root)
            archive.writestr(info, content)
    return output

if __name__ == '__main__':
    print(package())
