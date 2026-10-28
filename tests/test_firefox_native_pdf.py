from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class FirefoxNativePdfTests(unittest.TestCase):
    def test_native_entry_is_owned_local_code_without_bundled_renderer(self):
        html = (ROOT / 'extension/firefox/pdf-viewer.html').read_text(encoding='utf8')
        source = (ROOT / 'extension/firefox/pdf-viewer.js').read_text(encoding='utf8')
        self.assertIn('id="nativePDF"', html)
        self.assertIn('Open in Firefox', html)
        self.assertIn('Download PDF', html)
        self.assertIn('pdf-tools.js', html)
        self.assertNotIn('vendor/pdfjs', html + source)
        self.assertNotIn('innerHTML', source)
        self.assertIn('URL.revokeObjectURL(currentURL)', source)
        self.assertNotIn('tool-header.js', html)  # Its PDF.js controls require #page.

    @unittest.skipUnless(shutil.which('node'), 'Node is required for viewer lifecycle checks')
    def test_binary_provider_cancellation_and_blob_lifecycle(self):
        script = r'''const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('extension/firefox/pdf-viewer.js','utf8').replace(/export \{ openPDF \};\s*$/,'globalThis.openPDF=openPDF;');
const tools=require('./extension/pdf-tools.js'),events={},revoked=[],created=[],opened=[],messages=[],downloads=[];
let sequence=0,pending;
function element(id){return {id,children:[],hidden:false,disabled:false,files:[],style:{},textContent:'',value:'',setAttribute(){},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},remove(){},click(){if(this.download)downloads.push({href:this.href,name:this.download})}};}
const nodes=Object.fromEntries(['status','nativePDF','viewport','openNative','download','closeDocument','title','files','repository','sidebar','projectFiles','back'].map(id=>[id,element(id)]));nodes.sidebar.hidden=true;
const document={getElementById:id=>nodes[id],createElement:tag=>element(tag),body:element('body')};
class BlobURL extends URL {static createObjectURL(blob){assert.equal(blob.type,'application/pdf');const value='blob:moz-extension://test/'+(++sequence);created.push(value);return value;}static revokeObjectURL(url){revoked.push(url);}}
const context=vm.createContext({console,document,location:{search:'?repository=wayri/demo&ref=pinned-sha&provider=gitlab&host=https%3A%2F%2Fgitlab.example'},history:{back(){}},URL:BlobURL,URLSearchParams,Uint8Array,ArrayBuffer,Blob,KiCadPDFTools:tools,setTimeout:()=>1,clearTimeout(){},chrome:{runtime:{sendMessage:async message=>{messages.push(message);if(message.type==='project-inventory')return {ok:true,result:{files:[{path:'docs/manual.pdf'}]}};if(message.type==='pdf-file')return new Promise(resolve=>pending=resolve);throw Error('Unexpected message');}}}});
context.window={addEventListener:(type,handler)=>events[type]=handler,open:(...args)=>opened.push(args)};
vm.runInContext(source,context,{filename:'firefox/pdf-viewer.js'});
const bytes=new TextEncoder().encode('%PDF-1.4\nlocal fixture');
(async()=>{
 assert.equal(await context.openPDF(bytes,'../../report.pdf'),true);assert.equal(created.length,1);assert.equal(nodes.nativePDF.src,created[0]);assert.equal(nodes.download.disabled,false);
 nodes.openNative.onclick();assert.deepEqual(opened[0],[created[0],'_blank','noopener,noreferrer']);
 nodes.download.onclick();assert.deepEqual(downloads[0],{href:created[0],name:'report.pdf'});
 await context.openPDF(bytes,'second.pdf');assert.ok(revoked.includes(created[0]));nodes.closeDocument.onclick();assert.ok(revoked.includes(created[1]));assert.equal(nodes.nativePDF.hidden,true);assert.equal(nodes.download.disabled,true);
 const before=created.length;assert.equal(await context.openPDF(new Uint8Array([1,2,3]),'bad.pdf'),false);assert.equal(created.length,before);assert.match(nodes.status.textContent,/header/);
 let read=false;nodes.files.files=[{name:'large.pdf',size:tools.LIMITS.bytes+1,arrayBuffer:()=>{read=true;throw Error('Must not read');}}];await nodes.files.onchange();assert.equal(read,false);assert.match(nodes.status.textContent,/32 MiB/);
 await nodes.repository.onclick();assert.equal(nodes.projectFiles.children.length,1);nodes.projectFiles.children[0].onclick();assert.ok(pending);nodes.closeDocument.onclick();pending({ok:true,result:{base64:Buffer.from(bytes).toString('base64')}});await new Promise(resolve=>setImmediate(resolve));assert.equal(created.length,before);assert.equal(nodes.nativePDF.hidden,true);
 const request=messages.find(message=>message.type==='pdf-file');assert.equal(request.repository,'wayri/demo');assert.equal(request.ref,'pinned-sha');assert.equal(request.provider,'gitlab');assert.equal(request.host,'https://gitlab.example');assert.equal(request.file,'docs/manual.pdf');
 await context.openPDF(bytes,'active.pdf');const active=created.at(-1);events.pagehide();assert.ok(revoked.includes(active));assert.equal(nodes.nativePDF.hidden,true);
})().catch(error=>{console.error(error);process.exitCode=1;});'''
        result = subprocess.run(['node', '-e', script], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
