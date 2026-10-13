const test=require('node:test'),assert=require('node:assert/strict');
const {install,selector}=require('../section-pages.js');
function fixture(){
 const microtasks=[],listeners={},pages=[];
 const host={MutationObserver:class{observe(){}},setTimeout:fn=>microtasks.push(fn)};
 function page(tag='DIALOG'){
  const events={},classes=new Set(),buttonEvents={};
  const button={textContent:'Close',getAttribute:()=>null,classList:{add(){}},setAttribute(){},replaceChildren(){},addEventListener:(type,fn)=>buttonEvents[type]=fn,focus(){}};
  const header={classList:{add(){}},querySelectorAll:()=>[button],prepend(){}};
  const p={tagName:tag,hidden:tag!=='DIALOG',isConnected:true,open:false,field:{value:'unchanged'},classList:{add:v=>classes.add(v)},setAttribute(){},removeAttribute(){},querySelector:s=>s==='.section-page-back'?button:header,
   addEventListener:(type,fn)=>events[type]=fn,show(){this.open=true;},showModal(){this.open=true;this.modal=true;},close(){this.open=false;events.close?.();},classes,backButton:()=>buttonEvents.click({preventDefault(){},stopImmediatePropagation(){}})};
  pages.push(p);return p;
 }
 const doc={body:{},querySelectorAll:()=>pages,querySelector:()=>null,createTextNode:s=>s,addEventListener:(type,fn)=>listeners[type]=fn};
 return{doc,host,page,flush:()=>{while(microtasks.length)microtasks.shift()();},click:()=>listeners.click()};
}
test('sections use nonmodal pages and Back restores the parent and field state',()=>{
 const f=fixture(),menu=f.page(),settings=f.page();install(f.doc,f.host);
 menu.showModal();menu.field.value='retained';f.click();menu.close();settings.showModal();f.flush();
 assert.equal(settings.open,true);assert.equal(settings.modal,undefined);assert.equal(menu.open,false);
 settings.backButton();assert.equal(menu.open,true);assert.equal(settings.open,false);assert.equal(menu.field.value,'retained');
 f.click();menu.close();settings.showModal();f.flush();settings.backButton();menu.backButton();assert.equal(menu.open,false);assert.equal(settings.open,false);
});
test('hidden settings sections occupy a page and Back hides them',()=>{
 const f=fixture(),settings=f.page('SECTION'),api=install(f.doc,f.host);settings.hidden=false;api.scan();assert.equal(settings.classes.has('section-page'),true);assert.equal(api.back(),true);assert.equal(settings.hidden,true);
});
test('confirmation and file-picker dialogs are not included in page routing',()=>{
 assert.doesNotMatch(selector,/library-confirm|androidQuickStart|exitDraft|dialog:not|dialog\s*$/);
 const f=fixture();const confirmation={open:false,showModal(){this.open=true;this.modal=true;}};install(f.doc,f.host);confirmation.showModal();assert.equal(confirmation.modal,true);
});
