const test=require('node:test'),assert=require('node:assert/strict');
const {populationOverlayCache}=require('../review-workspace.js');
test('warm frames reuse population overlays; model, variant, path and object changes stay correct',()=>{
 const base={objects:[{id:'r',kind:'symbol',path:'a',position:{x:1,y:2},populated:true,properties:{Value:'1k'}},{id:'d',kind:'footprint',path:'b',position:{x:1,y:2},populated:false,properties:{Value:'D'}}]};
 let reads=0;const objects=base.objects.map(item=>({...item,get kind(){reads++;return item.kind;}}));const cached=populationOverlayCache();
 assert.deepEqual(cached(objects,base,'default','a'),[]);const first=cached(objects,base,'default','b');assert.equal(first[0].item.id,'d');const count=reads;
 for(let i=0;i<100;i++)assert.equal(cached(objects,base,'default','b'),first);assert.equal(reads,count,'warm frames scanned design objects');
 const changed=objects.map(item=>({...item,properties:{Value:'2k'}}));assert.equal(cached(changed,base,'v1','a')[0].changed,true);
 assert.equal(cached(changed,base,'default','a').length,0);
 const next={objects:changed};assert.equal(cached(changed,next,'v1','a').length,0,'base model replacement was not invalidated');
});
const {objectNetLookup}=require('../review-workspace.js');
test('part connectivity index preserves path, direct/owner matches, ordering and model replacement',()=>{
 let reads=0;const primitive=owner=>({get ownerUuid(){reads++;return owner;}});
 const a={path:'a',objectIds:['p'],primitives:[primitive('u')]},b={path:'b',objectIds:['p'],primitives:[primitive('u')]},c={path:'a',objectIds:['x'],primitives:[primitive('u'),primitive('u')]};
 const model={nets:[a,b,c]},find=objectNetLookup(),part={path:'a',id:'p',kind:'symbol',uuid:'u'};
 assert.deepEqual(find(model,part),[a,c]);const once=reads;for(let i=0;i<100;i++)assert.deepEqual(find(model,part),[a,c]);assert.equal(reads,once);
 assert.deepEqual(find(model,{...part,kind:'pad'}),[a]);assert.deepEqual(find(model,{...part,path:'b'}),[b]);assert.deepEqual(find({nets:[c]},part),[c]);assert.deepEqual(find(model,null),[]);
});
