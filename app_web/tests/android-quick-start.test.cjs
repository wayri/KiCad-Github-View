const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('android-app/web/quick-start.js','utf8');

function fixture({done=false,search='',hash='',viewing=false,denied=false,deniedGetter=false,loading=false}={}){
 const values=new Map(done?[['pocket-kivi.quick-start.v1','done']]:[]),events={};let focused=0;
 const walk=node=>[node,...node.children.flatMap(walk)];
 function make(tag){
  const node={tagName:tag.toUpperCase(),children:[],dataset:{},attrs:{},textContent:'',parent:null,listeners:{},hidden:false,open:false,
   classList:{contains(name){return node.className?.split(' ').includes(name)||false;}},
   append(...children){for(const child of children){child.remove();child.parent=this;this.children.push(child);}},
   remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}},
   insertBefore(child,before){child.remove();child.parent=this;const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,child);},
   replaceChildren(){for(const child of [...this.children])child.remove();},
   setAttribute(name,value){this.attrs[name]=value;},
   contains(child){return walk(this).includes(child);},
   querySelector(selector){return walk(this).slice(1).find(child=>selector.startsWith('.')?child.classList.contains(selector.slice(1)):child.tagName===selector.toUpperCase())||null;},
   addEventListener(name,fn){this.listeners[name]=fn;},
   showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},
   click(){if(!this.disabled)this.onclick?.();}
  };return node;
 }
 const body=make('body'),welcome=make('section'),headline=make('h1'),actions=make('div'),viewer=make('iframe'),menu=make('dialog'),menuContent=make('div');
 welcome.id='welcome';actions.className='android-welcome-actions';viewer.id='viewer';viewer.hidden=!viewing;menu.id='appMenuDialog';menuContent.className='android-sheet-content';menu.append(menuContent);welcome.append(headline,actions);body.append(welcome,viewer,menu);
 const document={body,readyState:loading?'loading':'complete',activeElement:{focus(){focused++;}},createElement:make,getElementById:id=>walk(body).find(node=>node.id===id),
  querySelector:selector=>selector==='#appMenuDialog .android-sheet-content'?menuContent:null,
  querySelectorAll:selector=>selector==='dialog[open]'?walk(body).filter(node=>node.tagName==='DIALOG'&&node.open):[],
  addEventListener(name,fn){events[name]=fn;}
 };
 const storage={getItem(key){if(denied)throw Error('storage denied');return values.get(key)||null;},setItem(key,value){if(denied)throw Error('storage denied');values.set(key,value);}};
 const context={document,location:{search,hash},localStorage:storage,addEventListener:(name,fn)=>{events[name]=fn;}};if(deniedGetter)Object.defineProperty(context,'localStorage',{get(){throw Error('storage getter denied');}});
 vm.createContext(context);vm.runInContext(source,context);if(loading)events.DOMContentLoaded();
 const dialog=document.getElementById('androidQuickStart'),content=dialog.children[1],controls=content.children[5];
 return{context,events,dialog,menu,values,progress:content.children[0],heading:content.children[2],back:controls.children[0],next:controls.children[1],skip:dialog.children[0].children[1],
  menuHelp:document.getElementById('androidQuickStartButton'),homeHelp:welcome.querySelector('.quick-start-link'),get focused(){return focused;}};
}

test('first launch introduction navigates forward/back and persists completion',()=>{
 const f=fixture({loading:true});assert.equal(f.dialog.open,true);assert.equal(f.progress.textContent,'1 of 3');assert.equal(f.back.disabled,true);
 f.next.click();assert.equal(f.progress.textContent,'2 of 3');assert.equal(f.heading.textContent,'Explore with your fingers');f.back.click();assert.equal(f.progress.textContent,'1 of 3');
 f.next.click();f.next.click();assert.equal(f.next.textContent,'Start exploring');f.next.click();assert.equal(f.dialog.open,false);assert.equal(f.values.get('pocket-kivi.quick-start.v1'),'done');assert.equal(f.focused,1);
 assert.equal(fixture({done:true}).dialog.open,false,'completion does not interrupt later launches');
});
test('guide can be replayed from home or menu after completion',()=>{
 const f=fixture({done:true});f.menu.open=true;f.menuHelp.click();assert.equal(f.menu.open,false);assert.equal(f.dialog.open,true);f.next.click();f.skip.click();assert.equal(f.dialog.open,false);
 f.homeHelp.click();assert.equal(f.dialog.open,true);assert.equal(f.progress.textContent,'1 of 3');assert.equal(f.back.disabled,true);f.skip.click();assert.equal(f.values.get('pocket-kivi.quick-start.v1'),'done');
});
test('external links and an active project never trigger automatic introduction',()=>{
 for(const options of [{search:'?github=repo'},{hash:'#project'},{viewing:true}]){const f=fixture(options);assert.equal(f.dialog.open,false);f.homeHelp.click();assert.equal(f.dialog.open,true,'manual guide remains available');}
});
test('denied storage does not prevent using or closing the introduction',()=>{
 for(const options of [{denied:true},{deniedGetter:true}]){
  const f=fixture(options);assert.equal(f.dialog.open,true);f.next.click();f.next.click();assert.doesNotThrow(()=>f.next.click());assert.equal(f.dialog.open,false);
  f.homeHelp.click();assert.doesNotThrow(()=>f.skip.click());assert.equal(f.dialog.open,false);
 }
});

test('unsupported secure native transport exposes a fixed notice without accepting event content',()=>{
 const f=fixture();assert.equal(f.dialog.open,true);f.events['kicad-android-security-unavailable']({detail:'<script>credential theft</script>'});assert.equal(f.dialog.open,false);const notice=f.context.document.getElementById('androidNativeSecurityNotice');assert.equal(notice.attrs.role,'alert');assert.match(notice.textContent,/native access disabled/);assert.doesNotMatch(notice.textContent,/script|credential theft/);f.events['kicad-android-security-unavailable']();assert.equal(f.context.document.getElementById('androidNativeSecurityNotice'),notice);
});
