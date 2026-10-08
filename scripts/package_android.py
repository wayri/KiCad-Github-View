"""Stage the shared viewer and native Android source archive; no credentials or remote code."""
from pathlib import Path
import hashlib
import importlib.util
import json
import re
import zipfile
ROOT = Path(__file__).resolve().parents[1]

def payload(root=ROOT):
    spec = importlib.util.spec_from_file_location('extension_builder', root / 'scripts/package_extension.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    excluded = {'merge-conflicts.js', 'conflict-viewer.html', 'conflict-viewer.js', 'conflict-viewer.css', 'conflict-properties.js', 'manifest.json', 'options.html', 'options.js', 'gitlab-options.js', 'gitlab-hosts.js', 'gitlab-provider.js', 'gitlab-review-api.js', 'github-review-api.js', 'mention-users.js', 'review-file-store.js', 'review-file-settings.js', 'html-sandbox.html', 'html-sandbox.js', 'credential-vault.js', 'credential-vault-host.html', 'credential-vault-host.js', 'credential-vault-worker.js'}
    names = (module.FILES - excluded) | {'parsing.js'}
    result = {}
    for name in sorted(names):
        content = (root / 'extension' / name).read_bytes()
        if name=='review-workspace.js':
            text=content.decode('utf-8').replace("&&!root.KiCadVSCodeContext","&&(!root.KiCadVSCodeContext||root.KiCadAndroidOnline)")
            text=text.replace("provider!=='github'||!remoteAvailable","!remoteAvailable").replace("!remoteAvailable||provider!=='github'","!remoteAvailable").replace("provider==='github'&&remoteAvailable","remoteAvailable")
            text=text.replace('Open on GitHub','Open thread').replace('Loading GitHub thread…','Loading thread…')
            content=text.encode('utf-8')
        if name=='project-viewer.js':
            text=content.decode('utf-8')
            text=text.replace("else discover();", "else if(rootAndroidLazy()){let ready=null;addEventListener('kicad-android:settings',async event=>{const path=event.detail?.file||rootFile;if(!ready)ready=discover();await ready;if(disposed)return;if(path!==active)await load(path,'settings');else activate('settings');});}else discover();function rootAndroidLazy(){return Boolean(globalThis.KiCadAndroidRuntime);}")
            content=text.encode('utf-8')
        if name=='loading-ui.js':
            text=content.decode('utf-8').replace('root.KiCadVSCodeContext)', '(root.KiCadVSCodeContext&&!root.KiCadAndroidRuntime))')
            text=text.replace("worker.onerror=()=>finish(new Error('The loading worker could not start. Reload the extension and retry.'));", "worker.onerror=()=>{worker?.terminate();if(root.KiCadAndroidRuntime)paint().then(()=>{if(signal?.aborted)throw Error('Loading cancelled.');return fallback();}).then(value=>finish(null,value),error=>finish(error));else finish(new Error('The loading worker could not start. Reload the extension and retry.'));};")
            content=text.encode('utf-8')
        if name.endswith('.html'):
            text = content.decode('utf-8')
            text = text.replace('</head>', '<link rel="stylesheet" href="android.css"></head>')
            text = re.sub(r'<script src=', '<script src="local-project.js"></script><script src="remote-review.js"></script><script src="revision-snapshots.js"></script><script src="runtime.js"></script><script src=', text, count=1)
            text = text.replace('<script src="revision-viewer.js">', '<script src="touch.js"></script><script src="revision-viewer.js">')
            text = text.replace('</body>', '<script src="android-project.js"></script><script src="touch-tooltips.js"></script><script src="resizable-sheets.js"></script><script src="adaptive-ui.js"></script></body>')
            # Folder HTML is deliberately excluded: it must never execute with a native bridge.
            content = text.encode('utf-8')
        result[name] = content
    for source in (root / 'android-app/web').iterdir():
        if source.is_file(): result[source.name] = source.read_bytes()
    result['shared-assets.json'] = (json.dumps({'assets': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(result.items())}}, indent=2)+'\n').encode()
    return result

def package(root=ROOT):
    assets = root / 'android-app/app/src/main/assets/viewer'
    for name, data in payload(root).items():
        path = assets / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    output = root / 'dist/kicad-visual-review-android-source.zip'; output.parent.mkdir(parents=True, exist_ok=True)
    sources = sorted(p for p in (root / 'android-app').rglob('*') if p.is_file() and not any(x in {'build','.gradle'} for x in p.relative_to(root / 'android-app').parts) and p.name != 'local.properties')
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sources:
            info = zipfile.ZipInfo(str(path.relative_to(root)).replace('\\','/'), (2020,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644 << 16; archive.writestr(info,path.read_bytes())
    return output
if __name__ == '__main__': print(package())
