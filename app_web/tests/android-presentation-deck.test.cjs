const test=require('node:test'),assert=require('node:assert/strict');
const {create,exportHtml,MAX_IMAGES}=require('../../android-app/web/presentation-deck.js');
const png='data:image/png;base64,'+Buffer.from('\x89PNG\r\n\x1a\n','latin1').toString('base64');
function fixture(){const values=new Map();let deny=false;const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(deny)throw Error('QuotaExceededError');values.set(k,v);}};return{values,storage,deck:create({storage,projectKey:'github:owner/repo@abc'}),deny(){deny=true;}};}
test('project-scoped slides survive reload and remain separate from other projects',()=>{
 const f=fixture();assert.deepEqual(f.deck.load(),[]);const slides=f.deck.add({title:'Overview',notes:'Review notes',image:png});assert.equal(slides.length,1);
 assert.deepEqual(create({storage:f.storage,projectKey:'github:owner/repo@abc'}).list(),slides);
 assert.deepEqual(create({storage:f.storage,projectKey:'github:owner/other@abc'}).list(),[]);
 slides[0].title='External mutation';assert.equal(f.deck.list()[0].title,'Overview');
});
test('editing, reorder and deletion preserve slide identities and reject invalid operations',()=>{
 const f=fixture();f.deck.add({title:'A'});f.deck.add({title:'B'});const slides=f.deck.add({title:'C'}),a=slides[0].id,c=slides[2].id;
 assert.deepEqual(f.deck.move(c,0).map(s=>s.title),['C','A','B']);assert.equal(f.deck.update(a,{title:'Revised',notes:'Details'})[1].notes,'Details');
 assert.deepEqual(f.deck.remove(c).map(s=>s.title),['Revised','B']);const before=f.deck.list();
 assert.throws(()=>f.deck.update(a,{id:'new'}),/Only title/);assert.throws(()=>f.deck.move(a,-1),/position/);assert.throws(()=>f.deck.remove('missing'),/no longer/);assert.deepEqual(f.deck.list(),before);
});
test('quota failure keeps previous persisted slide deck intact',()=>{
 const f=fixture(),before=f.deck.add({title:'Saved'});f.deny();assert.throws(()=>f.deck.update(before[0].id,{title:'Lost'}),/previous slides are unchanged/);
 assert.throws(()=>f.deck.add({title:'Lost'}),/could not be saved/);assert.deepEqual(f.deck.list(),before);
});
test('slide count and screenshot size bounds fail without modifying the saved deck',()=>{
 const f=fixture();for(let i=0;i<30;i++)f.deck.add({title:String(i)});assert.throws(()=>f.deck.add(),/30 slides/);assert.equal(f.deck.list().length,30);
 const g=fixture(),bytes=Buffer.alloc(MAX_IMAGES*3/4);Buffer.from('\x89PNG\r\n\x1a\n','latin1').copy(bytes);const oversized='data:image/png;base64,'+bytes.toString('base64');assert.throws(()=>g.deck.add({image:oversized}),/12 MiB/);assert.deepEqual(g.deck.list(),[]);
});
test('only supported data images with matching signatures are accepted',()=>{
 const f=fixture();for(const image of ['https://evil.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YWJj','data:image/jpeg;base64,'+png.split(',')[1],png+'" onerror="alert(1)'])assert.throws(()=>f.deck.add({image}));
 assert.deepEqual(f.deck.list(),[]);assert.equal(f.deck.add({image:png}).length,1);
});
test('corrupt saved decks report failure instead of silently overwriting previous data',()=>{
 const f=fixture();f.deck.add();const key=[...f.values.keys()][0];f.values.set(key,'not JSON');assert.throws(()=>f.deck.add(),/unreadable/);assert.equal(f.values.get(key),'not JSON');
 f.values.set(key,JSON.stringify({version:9,slides:[]}));assert.throws(()=>f.deck.load(),/unsupported/);
});
test('portable export escapes untrusted titles and notes and includes standalone navigation',()=>{
 const f=fixture();f.deck.add({title:'<script>alert("title")</script>',notes:'</p><img src=x onerror=alert(1)>\n& notes',image:png});f.deck.add({title:'Second'});
 const html=f.deck.exportHtml();assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('&lt;script&gt;alert(&quot;title&quot;)'));assert.ok(html.includes('&lt;/p&gt;&lt;img'));assert.ok(html.includes('&amp; notes'));
 assert.equal((html.match(/<script>/g)||[]).length,1);assert.equal((html.match(/<section class="slide"/g)||[]).length,2);assert.ok(html.includes('src="'+png+'"'));assert.ok(html.includes('ArrowRight'));assert.ok(!/https?:\/\//.test(html));assert.throws(()=>exportHtml([]),/Add a slide/);
});
