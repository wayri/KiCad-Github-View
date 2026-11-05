const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parse}=require('../design-diff.js'),{boardInfo}=require('../fast-pi-workspace.js');
test('Fast PI setup reads saved net identifiers and copper layers without making up stackup values',()=>{
 const info=boardInfo(parse('(kicad_pcb (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (net 0 "") (net 2 "GND") (net 4 "-12V"))'));
 assert.deepEqual(info,{nets:[{id:2,name:'GND'},{id:4,name:'-12V'}],layers:['F.Cu','B.Cu']});
});
test('Fast PI worker returns exact solver result or a visible failure without executing arbitrary scripts',()=>{
 let handler,reply,imported;const context={self:{KiCadFastPI:{solveAdaptive(ast,options){if(options.fail)throw Error('disconnected');return {voltageV:ast[0],dropV:options.drop};}},postMessage:x=>reply=x},importScripts:path=>imported=path};
 vm.runInNewContext(fs.readFileSync(require.resolve('../fast-pi-worker.js'),'utf8'),context);handler=context.self.onmessage;
 assert.equal(imported,'fast-pi.js');handler({data:{ast:[5],options:{drop:.1}}});assert.equal(reply.ok,true);assert.equal(reply.result.voltageV,5);handler({data:{ast:[],options:{fail:true}}});assert.equal(reply.ok,false);assert.equal(reply.error,'disconnected');
});
test('VS Code Fast PI fetches only its host-supplied packaged worker and revokes the blob URL',async()=>{
 const {createWorker}=require('../fast-pi-workspace.js'),calls=[],signal=new AbortController().signal;
 const host={KiCadVSCodeContext:{fastPIWorkerUrl:'https://resources.example/media/fast-pi-worker-vscode.js'},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};},Blob:class {constructor(bytes,options){this.bytes=bytes;this.options=options;}},URL:{createObjectURL:()=> 'blob:owned-worker',revokeObjectURL:url=>calls.push({revoked:url})},Worker:class{constructor(url){this.url=url;}}};
 const worker=await createWorker(host,signal);assert.equal(worker.url,'blob:owned-worker');assert.equal(calls[0].url,host.KiCadVSCodeContext.fastPIWorkerUrl);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.signal,signal);assert.equal(calls[1].revoked,'blob:owned-worker');
 host.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(256*1024+1)});await assert.rejects(createWorker(host),/size is invalid/);
 host.fetch=async()=>({ok:false});await assert.rejects(createWorker(host),/could not be read/);
});
test('self-contained VS Code worker solves a supplied copper strip without importScripts',()=>{
 let reply;const context={postMessage:x=>reply=x};context.self=context;
 vm.runInNewContext(fs.readFileSync(require.resolve('../fast-pi-worker-vscode.js'),'utf8'),context);
 const ast=parse('(kicad_pcb (segment (net 1) (start .5 .5) (end 9.5 .5) (width 1) (layer "F.Cu")))');
 context.onmessage({data:{ast,options:{net:1,layers:[{name:'F.Cu',zMm:0,thicknessMm:.035}],conductivitySm:58000000,cellSizeMm:1,currentA:2,sourceVoltageV:5,source:{x:.5,y:.5,layer:'F.Cu'},sink:{x:9.5,y:.5,layer:'F.Cu'}}}});
 assert.equal(reply.ok,true);assert.ok(Math.abs(reply.result.dropV-2*.009/(58000000*.001*.000035))<1e-10);
});
test('KiCad 10 net names and quoted numeric names remain distinct from legacy IDs',()=>{
 const info=boardInfo(parse('(kicad_pcb (layers (0 "F.Cu" signal)) (segment (net "GND")) (zone (net "12")) (footprint "x" (pad "1" smd rect (net "VCC"))) (segment (net 2)) (footprint "y" (pad "1" smd rect (net 2 "LEGACY"))))'));
 assert.deepEqual(info.nets,[{id:'GND',name:'GND'},{id:'12',name:'12'},{id:'VCC',name:'VCC'},{id:2,name:'LEGACY'}]);
});
test('saved complete physical stackup derives copper center separation, missing layers remain explicit',()=>{
 const {savedStackup}=require('../fast-pi-workspace.js'),ast=parse(fs.readFileSync(require.resolve('./fixtures/fast-pi/dc-strip.kicad_pcb'),'utf8')),saved=savedStackup(ast);
 assert.equal(saved.length,2);assert.equal(saved[0].zMm,0);assert.equal(saved[0].thicknessMm,.035);assert.ok(Math.abs(saved[1].zMm-1.565)<1e-12);
 assert.deepEqual(savedStackup(parse('(kicad_pcb (layers (0 "F.Cu" signal) (2 "B.Cu" signal)) (general (thickness 1.6)))')),[]);
 assert.deepEqual(savedStackup(parse('(kicad_pcb (layers (0 "F.Cu" signal) (2 "B.Cu" signal)) (setup (stackup (layer "F.Cu" (thickness .035)) (layer "dielectric 1") (layer "B.Cu" (thickness .035)))))')),[]);
});

test('saved contact suggestions retain typed nets, native rotations, pad names and explicit copper layers',()=>{
 const {contactCandidates}=require('../fast-pi-workspace.js'),ast=parse('(kicad_pcb '+
 '(footprint "native" (at 156.21 122.174 -90) (fp_text reference "C173") (pad "1" smd rect (at -.75 0 180) (size 1 1) (layers "B.Cu") (net 312 "+1V8_USB"))) '+
 '(footprint "pth" (at 1 2 90) (property "Reference" "J1") (pad "A1" thru_hole circle (at 1 0) (size 2 2) (drill 1) (layers "*.Cu") (net "312"))) )');
 const numeric=contactCandidates(ast,312,['F.Cu','B.Cu']);assert.equal(numeric.items.length,1);assert.equal(numeric.truncated,false);assert.deepEqual(numeric.items[0],{x:156.21,y:121.424,layer:'B.Cu',reference:'C173',pin:'1',label:'C173 · pad 1 · B.Cu'});
 const named=contactCandidates(ast,'312',['F.Cu','B.Cu']);assert.equal(named.items.length,2);assert.ok(named.items.every(p=>Math.abs(p.x-1)<1e-12&&Math.abs(p.y-1)<1e-12&&p.reference==='J1'&&p.pin==='A1'));assert.deepEqual(named.items.map(p=>p.layer),['F.Cu','B.Cu']);
});
test('Chrome, Firefox and localhost use packaged same-origin workers without fetching or eval',async()=>{
 const source=fs.readFileSync(require.resolve('../fast-pi-workspace.js'),'utf8');
 for(const origin of ['chrome-extension://abcdef','moz-extension://abcdef','http://localhost:8123']){let workerUrl;const context={URL,document:{currentScript:{src:origin+'/fast-pi-workspace.js'}}};vm.runInNewContext(source,context);const worker=await context.KiCadFastPIWorkspace.createWorker({Worker:class{constructor(url){workerUrl=url;}}});assert.ok(worker);assert.equal(workerUrl,origin+'/fast-pi-worker.js');}
});
test('mounted Fast PI picks contacts, passes named nets and reviewed stackup to worker, and closes cleanly',async()=>{
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.hidden=false;this.text='';this.className='';this.attributes={};this._value='';this.classList={add:name=>this.className+=' '+name,contains:name=>this.className.split(' ').includes(name),toggle(){}};}
  set value(v){this._value=String(v);}get value(){return this._value;}
  set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);if(this.tagName==='select'&&this.children.length===1)this.value=item.value;}}
  replaceChildren(...items){this.children=[];this.append(...items);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
  setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(name,handler){(this.handlers||={})[name]=handler;}
  matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector.startsWith('[name=')?this.name===selector.slice(6,-1):this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0];}
  getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}showModal(){this.open=true;}close(){this.open=false;}focus(){this.focused=true;}contains(node){return node===this||this.children.some(child=>child.contains(node));}
 }
 const body=new Element('body'),canvas=new Element('canvas'),parent=new Element('div');parent.append(canvas);canvas.clientWidth=canvas.clientHeight=100;
 let click,keydown,posted,terminated=0,parses=0,validators=0;const handlers=new Map(),doc={body,currentScript:{src:'http://localhost:8123/fast-pi-workspace.js'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>{const n=new Element('text');n.textContent=text;return n;},addEventListener:(name,handler)=>{handlers.set(name,handler);if(name==='click')click=handler;else if(name==='keydown')keydown=handler;},removeEventListener:name=>{handlers.delete(name);if(name==='click')click=null;else if(name==='keydown')keydown=null;}};
 const fastPI=require('../fast-pi.js'),context={URL,document:doc,setTimeout,clearTimeout,AbortController,Worker:class{postMessage(data){posted=data;queueMicrotask(()=>this.onmessage({data:{ok:true,result:fastPI.solveBoard(data.ast,data.options)}}));}terminate(){terminated++;}},KiCadDesignDiff:{parse(value){parses++;return parse(value);}},KiCadFastPI:{...fastPI,createContactValidator(...args){validators++;return fastPI.createContactValidator(...args);}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../fast-pi-workspace.js'),'utf8'),context);
 const source=fs.readFileSync(require.resolve('./fixtures/fast-pi/dc-strip.kicad_pcb'),'utf8'),view={canvas,viewport:{camera:{zoom:1,world_to_screen:p=>p,screen_to_world:p=>p}}},session=context.KiCadFastPIWorkspace.mount({files:[{path:'strip.kicad_pcb',content:source}],currentFile:()=> 'strip.kicad_pcb',getCanvas:()=>view}),panel=session.open();
 assert.equal(panel.querySelector('[name=conductivity]').value,'58000000','visible nominal copper preset avoids a manual material entry');
 assert.equal(session.open(),panel);assert.equal(parses,1);
 panel.querySelectorAll('button').find(b=>b.textContent==='Copper · 58 MS/m').onclick();assert.equal(panel.querySelector('[name=conductivity]').value,'58000000');
 for(const [name,value]of Object.entries({conductivity:58000000,voltage:5,current:2,grid:1}))panel.querySelector(`[name=${name}]`).value=value;
 const buttons=panel.querySelectorAll('button');buttons.find(b=>b.textContent==='Pick source + load').onclick();
 click({target:canvas,clientX:50,clientY:50,preventDefault(){},stopImmediatePropagation(){}});assert.match(panel.querySelector('.fast-pi-status').textContent,/not copper/);
 const pointer=(type,x,y,id=1)=>{let blocked=false;handlers.get(type)({type,target:canvas,pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){blocked=true;}});return blocked;};
 assert.equal(pointer('pointerdown',.5,.5),true,'Fast PI owns the touch before ordinary net picking');pointer('pointermove',20,.5);pointer('pointerup',20,.5);assert.equal(posted,undefined,'drag does not solve or place a contact');
 pointer('pointerdown',.5,.5);pointer('pointerdown',9.5,.5,2);pointer('pointerup',9.5,.5,2);pointer('pointerup',.5,.5);assert.match(panel.querySelector('.fast-pi-status').textContent,/not copper/,'multitouch does not place a contact');
 for(const x of [.5,9.5]){pointer('pointerdown',x,.5);pointer('pointerup',x,.5);click({target:canvas,clientX:x,clientY:.5,preventDefault(){},stopImmediatePropagation(){}});}
 panel.querySelector('.fast-pi-inputs').handlers.input({target:panel.querySelector('[name=current]')});assert.match(panel.querySelector('.fast-pi-status').textContent,/Contacts retained/);
 await buttons.find(b=>b.textContent==='Solve').onclick();await Promise.resolve();
 assert.equal(posted.options.net,'VCC');assert.equal(posted.options.layers.length,2);assert.equal(posted.options.source.x,.5);assert.equal(posted.options.sink.x,9.5);assert.ok(panel.querySelector('.fast-pi-output').textContent.includes('Voltage drop'));assert.ok(panel.querySelector('.fast-pi-legend').textContent.includes('V drop'));
 assert.equal(panel.querySelector('.fast-pi-inputs').hidden,true,'solved analytics are not buried below setup');assert.equal(panel.querySelector('.fast-pi-actions').hidden,true);assert.equal(panel.querySelector('.fast-pi-intro').hidden,true);assert.equal(panel.querySelector('.fast-pi-status').hidden,false);assert.equal(panel.querySelector('.fast-pi-legend').hidden,false);assert.equal(panel.querySelector('.fast-pi-edit-inputs').hidden,false);assert.equal(panel.scrollTop,0);
 panel.querySelector('.fast-pi-edit-inputs').onclick();assert.equal(panel.querySelector('.fast-pi-inputs').hidden,false);assert.equal(panel.querySelector('.fast-pi-edit-inputs').hidden,true);assert.equal(panel.querySelector('[name=current]').value,'2');assert.ok(panel.querySelector('.fast-pi-output').textContent.includes('Voltage drop'),'reviewing inputs retains the solved result until an input changes');
 let preparedFields=0;context.KiCadFastPIField={prepare(){preparedFields++;return{bounds:{minX:0,minY:0,maxX:10,maxY:1},support:[{x:0,y:0,width:4,height:1},{x:6,y:0,width:4,height:1}],maximum:.1,description:'Interpolated solved voltage drop'};},maskGeometry(){return{copper:[{d:'M 0 0 L 10 0 L 10 1 L 0 1 Z',stroke:false,width:0}],holes:[{d:'M 4 .5 a .1 .1 0 1 0 .2 0',stroke:false,width:0}]};},texture(){return'data:image/png;base64,AA==';}};
 const display=panel.querySelector('[name=display]');display.value='mesh';display.onchange();display.value='smooth';display.onchange();const fieldGroup=parent.querySelector('svg').children[0],texture=fieldGroup.querySelector('image'),mask=fieldGroup.querySelector('mask'),support=fieldGroup.querySelector('clipPath');assert.ok(texture.attributes.mask.startsWith('url(#fast-pi-field-mask-'));assert.equal(texture.attributes['clip-path'],'url(#'+support.attributes.id+')');assert.equal(support.attributes.clipPathUnits,'userSpaceOnUse');assert.equal(support.children[0].attributes.d,'M 0 0 h 4 v 1 h -4 Z M 6 0 h 4 v 1 h -4 Z','resampling is independently clipped away from unsolved same-net copper between support runs');assert.equal(texture.attributes.href,'data:image/png;base64,AA==');assert.deepEqual(mask.children.map(path=>path.attributes.fill),['white','black'],'field image is always clipped by copper and subtractive drill mask');assert.ok(panel.querySelector('.fast-pi-legend').textContent.includes('Interpolated solved'));session.draw();assert.equal(preparedFields,1,'camera redraw does not regenerate field pixels or masks');
 const retained=parent.querySelector('svg').children[0];session.draw();assert.equal(parent.querySelector('svg').children[0],retained,'camera redraw retains solved mesh DOM');
 panel.querySelector('.fast-pi-inputs').handlers.input({target:panel.querySelector('[name=current]')});assert.equal(panel.querySelector('.fast-pi-output').textContent,'');assert.equal(panel.querySelector('.fast-pi-inputs').hidden,false);assert.equal(panel.querySelector('.fast-pi-edit-inputs').hidden,true);
 session.close();assert.equal(panel.hidden,true);assert.equal(session.open(),panel);assert.equal(parses,1);assert.equal(panel.querySelector('[name=voltage]').value,'5');assert.equal(panel.querySelector('.fast-pi-inputs').hidden,false);session.close();assert.equal(panel.querySelector('.fast-pi-output').textContent,'');session.dispose();assert.equal(click,null);assert.equal(keydown,null);assert.equal(handlers.size,0);assert.ok(terminated>0);
 const withPads=source.slice(0,source.lastIndexOf(')'))+'(footprint "source" (at .5 .5) (property "Reference" "U1") (pad "A1" smd rect (at 0 0) (size .4 .4) (layers "F.Cu") (net "VCC"))) (footprint "load" (at 9.5 .5) (property "Reference" "J1") (pad "2" smd rect (at 0 0) (size .4 .4) (layers "F.Cu") (net "VCC"))))';
 const chooseSession=context.KiCadFastPIWorkspace.mount({files:[{path:'contacts.kicad_pcb',content:withPads}],currentFile:()=> 'contacts.kicad_pcb',getCanvas:()=>view}),choose=chooseSession.open(),parseCount=parses,validatorCount=validators;
 context.matchMedia=()=>({matches:true});choose.querySelector('.fast-pi-source').onclick();let picker=body.querySelector('.fast-pi-contact-picker');assert.equal(picker.open,true);let search=picker.querySelector('input');assert.equal(search.focused,undefined,'coarse-pointer chooser does not open a software keyboard automatically');assert.equal(picker.querySelector('header').querySelector('button').focused,true);search.value='U1';search.oninput();assert.equal(picker.querySelectorAll('.fast-pi-contact-option').length,1);picker.querySelector('.fast-pi-contact-option').onclick();assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined);assert.ok(choose.querySelector('.fast-pi-source').textContent.includes('U1 · pad A1 · F.Cu'));
 context.matchMedia=()=>({matches:false});choose.querySelector('.fast-pi-load').onclick();picker=body.querySelector('.fast-pi-contact-picker');search=picker.querySelector('input');assert.equal(search.focused,true,'fine pointers retain immediate keyboard search');search.value='J1';search.oninput();const layerChoice=picker.querySelector('select');layerChoice.value='B.Cu';layerChoice.onchange();assert.equal(picker.querySelectorAll('.fast-pi-contact-option').length,0,'the explicit layer filter never substitutes another layer');layerChoice.value='F.Cu';layerChoice.onchange();picker.querySelector('.fast-pi-contact-option').onclick();assert.ok(choose.querySelector('.fast-pi-load').textContent.includes('J1 · pad 2 · F.Cu'));assert.equal(parses,parseCount,'opening/searching contact suggestions reuses the parsed source');assert.equal(validators,validatorCount+1,'the selected-net geometry validator is cached across contact changes');
 choose.querySelector('.fast-pi-source').onclick();picker=body.querySelector('.fast-pi-contact-picker');search=picker.querySelector('input');search.value='U1';search.oninput();context.innerWidth=900;context.innerHeight=600;chooseSession.draw();assert.equal(search.value,'U1','camera/size redraw retains the chooser search');assert.equal(body.querySelector('.fast-pi-contact-picker'),picker);keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined);assert.ok(choose.querySelector('.fast-pi-source').textContent.includes('U1'));
 choose.querySelector('.fast-pi-load').onclick();click({target:canvas});assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined,'outside click dismisses without selecting');
 choose.querySelector('.fast-pi-source').onclick();body.querySelector('.fast-pi-contact-picker').querySelector('.fast-pi-contact-repick').onclick();assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined);assert.ok(choose.querySelector('.fast-pi-load').textContent.includes('J1'),'repick retains the other terminal');assert.match(choose.querySelector('.fast-pi-status').textContent,/Tap source copper/);
 choose.querySelector('.fast-pi-clear-source').onclick();assert.equal(choose.querySelector('.fast-pi-clear-source').disabled,true);assert.ok(choose.querySelector('.fast-pi-load').textContent.includes('J1'),'clearing source retains the independently chosen load');choose.querySelector('.fast-pi-solve').onclick();assert.match(choose.querySelector('.fast-pi-status').textContent,/Choose both/);
 choose.querySelectorAll('button').find(b=>b.textContent==='Pick source + load').onclick();pointer('pointerdown',.5,.5);pointer('pointerup',.5,.5);picker=body.querySelector('.fast-pi-contact-picker');assert.ok(picker,'nearby ambiguity asks the user instead of silently choosing');assert.equal(choose.querySelector('.fast-pi-clear-source').disabled,true);picker.querySelector('.fast-pi-contact-option').onclick();choose.querySelectorAll('button').find(b=>b.textContent==='Cancel / clear').onclick();
 choose.querySelector('.fast-pi-choose-pads').onclick();picker=body.querySelector('.fast-pi-contact-picker');
 search=picker.querySelector('input');search.value='U1';search.oninput();picker.querySelector('.fast-pi-contact-option').onclick();
 picker=body.querySelector('.fast-pi-contact-picker');assert.equal(picker.attributes['aria-label'],'Load contact suggestions','guided source selection immediately offers loads');
 search=picker.querySelector('input');search.value='J1';search.oninput();picker.querySelector('.fast-pi-contact-option').onclick();
 assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined);assert.match(choose.querySelector('.fast-pi-status').textContent,/Contacts set/);
 chooseSession.dispose();assert.equal(body.querySelector('.fast-pi-contact-picker'),undefined);assert.equal(handlers.size,0);
});

test('contact validator uses saved copper, net and layer before a mesh or electrical assumptions exist',()=>{
 const {createContactValidator}=require('../fast-pi.js');
 const ast=parse('(kicad_pcb (segment (net "VCC") (start 0 0) (end 10 0) (width 1) (layer "F.Cu")) (segment (net "GND") (start 0 3) (end 10 3) (width 1) (layer "F.Cu")))');
 const accepts=createContactValidator(ast,'VCC',[{name:'F.Cu'},{name:'B.Cu'}]);
 assert.equal(accepts({x:1,y:0,layer:'F.Cu'}),true);assert.equal(accepts({x:1,y:3,layer:'F.Cu'}),false);assert.equal(accepts({x:1,y:0,layer:'B.Cu'}),false);assert.equal(accepts({x:1,y:2,layer:'F.Cu'}),false);
});


test('large solved overlays batch all sampled edges into bounded color paths',()=>{
 const {overlayGeometry}=require('../fast-pi-workspace.js'),result={nodes:[{x:0,y:0,layer:'F.Cu',voltageV:5},{x:1,y:0,layer:'F.Cu',voltageV:4.9}],sourceIndex:0,dropV:.1,edges:Array.from({length:12000},(_,i)=>({a:0,b:1,currentA:i/12000,lossW:i/120000,currentDensityAm2:i}))};
 const geometry=overlayGeometry(result,'F.Cu','current');assert.equal(geometry.paths.length,64);assert.equal(geometry.paths.reduce((n,path)=>n+(path.d.match(/M /g)||[]).length,0),12000);assert.equal(geometry.maximum,result.edges.at(-1).currentA);assert.equal(overlayGeometry(result,'B.Cu','voltage').paths.length,0);
});


test('Fast PI isolation uses saved string net identity without UUID-dependent model membership',()=>{
 const {isolationPrimitives}=require('../fast-pi-workspace.js'),vcc={kind:'zone',netId:'VCC',netName:'VCC'},gnd={kind:'zone',netId:'GND',netName:'GND'},legacy={kind:'track',netId:12,netName:'legacy'},quoted={kind:'pad',netId:'12',netName:'12'},view={primitives:[vcc,gnd,legacy,quoted]};
 assert.deepEqual(isolationPrimitives(view,[{path:'board.kicad_pcb',name:'VCC',code:'name:VCC',primitives:[]}],'board.kicad_pcb',{id:'VCC',name:'VCC'}),[vcc]);
 assert.deepEqual(isolationPrimitives(view,[],'board.kicad_pcb',{id:'12',name:'12'}),[quoted]);assert.deepEqual(isolationPrimitives(view,[],'board.kicad_pcb',{id:12,name:'legacy'}),[legacy]);
 assert.deepEqual(isolationPrimitives({primitives:[vcc]},[{path:'elsewhere.kicad_pcb',name:'GND',primitives:[vcc]}],'board.kicad_pcb',{id:'GND',name:'GND'}),[]);
 const mapped={},stale={};assert.deepEqual(isolationPrimitives({primitives:[mapped],netNames:new Map([[mapped,'VCC']])},[{path:'board.kicad_pcb',name:'VCC',primitives:[stale]}],'board.kicad_pcb',{id:'VCC',name:'VCC'}),[mapped]);
});


test('analyzed-net isolation finds real UUID-less dc-strip saved zone and excludes board worksheet',()=>{
 const {isolationPrimitives}=require('../fast-pi-workspace.js'),renderer=require('../pcb-renderer.js'),path='dc-strip.kicad_pcb',ast=parse(fs.readFileSync(require.resolve('./fixtures/fast-pi/dc-strip.kicad_pcb'),'utf8')),design=renderer.build(ast,path),net=boardInfo(ast).nets.find(net=>net.name==='VCC'),selected=isolationPrimitives({primitives:design.primitives},[{path,name:'VCC',code:'name:VCC',primitives:[]}],path,net);
 assert.ok(selected.some(p=>p.kind==='zone'));assert.ok(selected.some(p=>p.kind==='zone-outline'));assert.ok(selected.every(p=>p.netId==='VCC'&&!p.frame&&p.layer!=='Edge.Cuts'));assert.ok(selected.every(p=>design.primitives.includes(p)));assert.ok(selected.length<design.primitives.length);
});

test('actual rendered numeric and quoted numeric nets isolate independently',()=>{
 const {isolationPrimitives}=require('../fast-pi-workspace.js'),renderer=require('../pcb-renderer.js'),path='mixed.kicad_pcb',ast=parse('(kicad_pcb (version 20260206) (layers (0 "F.Cu" signal)) (net 12 "LEGACY") (segment (net 12) (start 0 0) (end 2 0) (width 1) (layer "F.Cu")) (segment (net "12") (start 0 3) (end 2 3) (width 1) (layer "F.Cu")))'),design=renderer.build(ast,path),info=boardInfo(ast);
 for(const net of info.nets){const selected=isolationPrimitives({primitives:design.primitives},[],path,net);assert.equal(selected.length,1);assert.equal(selected[0].netId,net.id);assert.equal(selected[0].points[0].y,typeof net.id==='number'?0:3);}
});
