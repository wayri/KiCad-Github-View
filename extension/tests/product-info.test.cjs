const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../product-info.js'),'utf8');
function load(extra={}){const context={...extra};vm.runInNewContext(code,context);return context.KiCadProductInfo;}
test('About prefers actual installed extension version over stale packaged metadata',()=>{
 const api=load({chrome:{runtime:{getManifest:()=>({version:'0.12.79',manifest_version:3,version_name:'Development acceptance'})}},KiCadProductVersion:{release:'0.12.78',appVersion:'0.12.78',platform:'Chromium'}});
 assert.equal(api.info().release,'0.12.79');assert.equal(api.caption(),'Version 0.12.79');assert.equal(api.info().label,'Development acceptance');
});
test('About distinguishes native app version from shared viewer release without network access',()=>{
 const api=load({KiCadProductVersion:{release:'0.12.78',appVersion:'1.78',platform:'Android'},fetch(){throw Error('About must stay local');}});
 assert.equal(api.caption(),'Version 1.78 · viewer release 0.12.78');assert.equal(api.info().platform,'Android');
});
test('unpackaged source and unavailable extension API never invent a release number',()=>{
 const api=load({KiCadProductVersion:{release:'__RELEASE_VERSION__',appVersion:'__APP_VERSION__',platform:'__PLATFORM__'},chrome:{runtime:{getManifest(){throw Error('unavailable');}}}});
 assert.equal(api.info().release,null);assert.equal(api.caption(),'Development checkout · not a packaged release');
 assert.equal(load({KiCadVSCodeContext:{version:'0.12.78'}}).caption(),'Version 0.12.78');
});
