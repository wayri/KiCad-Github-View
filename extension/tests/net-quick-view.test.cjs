const test=require('node:test'),assert=require('node:assert/strict');
const {mount,occurrences,rotateVector,viewportPoint,MAX_WINDOWS}=require('../net-quick-view.js'),owned=require('../owned-canvas.js');
class Element{
 constructor(tag,document){this.tag=tag;this.ownerDocument=document;this.children=[];this.listeners={};this.style={};this.attributes={};this.parent=null;this.textContent='';}
 append(...children){for(const child of children){this.children.push(child);child.parent=this;}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.removed=true;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(name,handler){(this.listeners[name]||=[]).push(handler);}
 setPointerCapture(){}
 getBoundingClientRect(){return{left:0,top:0,width:280,height:280};}
 emit(name,values={}){for(const handler of this.listeners[name]||[])handler({button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){},stopPropagation(){},target:this,...values});}
}
function descendants(element){return[element,...element.children.flatMap(descendants)];}
function fixture(count=5){const document={createElement:tag=>new Element(tag,document)},holder=new Element('div',document),viewports=[],located=[];
 const designs=Array.from({length:count},(_,i)=>({primitives:[{type:'line',uuid:'line'+i,points:[{x:i,y:0},{x:i+3,y:4}],layer:'F.Cu'}],layers:['F.Cu']}));
 const entries=designs.map((design,i)=>({path:'sheet'+i+'.kicad_sch',label:'Sheet '+i,instanceId:'instance'+i,design,groups:[{id:'net'+i,name:'Power '+i,primitives:design.primitives}]}));
 const canvasAPI={bounds:owned.bounds,mount(host){const viewport={canvas:new Element('canvas',document),viewport:{camera:new owned.Camera(280,280)},setDocument(design,path){this.design=design;this.path=path;},setNetHighlights(groups){this.groups=groups;},draw(){},requestDraw(){},dispose(){this.disposed=true;}};host.append(viewport.canvas);viewports.push(viewport);return viewport;}};
 const quick=mount({holder,getEntries:()=>entries,onLocate:(...args)=>located.push(args),canvasAPI,document});const button=label=>descendants(holder).find(element=>element.tag==='button'&&element.attributes['aria-label']===label);return{document,holder,quick,entries,viewports,located,button,canvasAPI};}
test('occurrences use only saved primitives from each exact source and preserve hierarchy instances',()=>{
 const live={uuid:'pad',type:'pad'},stale={...live},design={primitives:[live]};const entries=[{path:'a.kicad_sch',instanceId:'one',design,groups:[{id:'net',name:'VCC',primitives:[live,stale]}]},{path:'a.kicad_sch',instanceId:'two',design,groups:[{id:'net',name:'VCC',primitives:[live]}]}],before=JSON.stringify(entries),rows=occurrences(entries);
 assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.deepEqual(rows[0].group.primitives,[live]);assert.equal(rows[0].group.primitives[0],live);assert.equal(JSON.stringify(entries),before);assert.equal(occurrences([{...entries[0],groups:[{primitives:[stale]}]}]).length,0);
});
test('quarter-turn viewport transforms rotate pads, text and arcs as one rigid view and invert cursor coordinates',()=>{
 const fixtures=[{type:'pad',points:[{x:100,y:120},{x:130,y:120},{x:130,y:135},{x:100,y:135}]},{type:'text',x:160,y:70,angle:30},{type:'arc',start:{x:30,y:50},mid:{x:50,y:30},end:{x:70,y:50}}],snapshot=JSON.stringify(fixtures);
 for(let turns=0;turns<4;turns++)for(const p of [{x:10,y:30},{x:200,y:230},{x:140,y:140}]){const offset=rotateVector({x:p.x-140,y:p.y-140},turns),screen={x:140+offset.x,y:140+offset.y};assert.deepEqual(viewportPoint(screen,280,280,turns),p);assert.equal(Math.hypot(offset.x,offset.y),Math.hypot(p.x-140,p.y-140));}
 assert.deepEqual(rotateVector({x:1,y:0},1),{x:-0,y:1});assert.deepEqual(rotateVector({x:1,y:0},-1),{x:0,y:-1});assert.equal(JSON.stringify(fixtures),snapshot);
});
test('occurrence list opens at most four independent read-only views and closing releases every viewport',()=>{
 const f=fixture(),before=JSON.stringify(f.entries);assert.equal(f.quick.open(),5);for(let i=0;i<5;i++)f.button('Power '+i+' · Sheet '+i).emit('click');assert.equal(f.viewports.length,MAX_WINDOWS);assert.ok(descendants(f.holder).some(node=>node.textContent.includes('Four quick views')));assert.equal(f.viewports[0].design,f.entries[0].design);
 f.button('Rotate clockwise').emit('click');assert.equal(f.viewports[0].canvas.style.transform,'rotate(90deg)');f.button('Rotate counterclockwise').emit('click');assert.equal(f.viewports[0].canvas.style.transform,'rotate(0deg)');f.button('Locate').emit('click');assert.equal(f.located[0][0],f.entries[0]);
 f.button('Close quick view').emit('click');assert.equal(f.viewports[0].disposed,true);f.button('Power 4 · Sheet 4').emit('click');assert.equal(f.viewports.length,5);f.quick.close();assert.ok(f.viewports.every(viewport=>viewport.disposed));assert.equal(JSON.stringify(f.entries),before);f.quick.dispose();f.quick.dispose();assert.throws(()=>f.quick.open(),/closed/);
});
test('rotated miniature pan and cursor-anchored wheel zoom preserve world-coordinate semantics',()=>{
 const f=fixture(1);f.quick.open();f.button('Power 0 · Sheet 0').emit('click');f.button('Rotate clockwise').emit('click');const host=descendants(f.holder).find(node=>node.className==='net-quick-view-canvas'),camera=f.viewports[0].viewport.camera;
 camera.center.set(0,0);camera.zoom=2;host.emit('pointerdown',{clientX:10,clientY:10});host.emit('pointermove',{clientX:30,clientY:10});assert.equal(camera.center.x,0);assert.equal(camera.center.y,10);host.emit('pointerup');
 const point=viewportPoint({x:80,y:90},280,280,1),before=camera.screen_to_world(point);host.emit('wheel',{clientX:80,clientY:90,deltaY:-50});const after=camera.screen_to_world(point);assert.ok(Math.abs(before.x-after.x)<1e-10);assert.ok(Math.abs(before.y-after.y)<1e-10);f.quick.dispose();
});
test('renderer failures clean up a partial miniature and show a bounded diagnostic',()=>{
 const f=fixture(1);f.canvasAPI.mount=()=>{throw Error('Canvas unavailable');};f.quick.open();f.button('Power 0 · Sheet 0').emit('click');assert.equal(descendants(f.holder).filter(node=>node.className==='net-quick-view-window').length,0);assert.ok(descendants(f.holder).some(node=>node.textContent==='Quick view unavailable: Canvas unavailable'));f.quick.dispose();
});
