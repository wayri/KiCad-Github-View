const test=require('node:test'),assert=require('node:assert/strict'),{route}=require('../overview-routing.js');
test('orthogonal relationship routes stay outside drawing pages, including intervening sheets',()=>{
 const pages=[{path:'a',x:0,y:14,w:297,h:210},{path:'middle',x:332,y:14,w:297,h:210},{path:'b',x:664,y:14,w:297,h:210},{path:'lower',x:332,y:264,w:297,h:210}],before=JSON.stringify(pages),links=[{fromPath:'a',toPath:'b',name:'VCC'},{fromPath:'lower',toPath:'a',name:'GND'}],result=route(pages,links);
 assert.equal(result.omitted,0);assert.equal(result.links.length,2);assert.deepEqual(result.links.map(l=>l.name),['VCC','GND']);for(const link of result.links){assert.ok(link.points.length>=2);for(let i=1;i<link.points.length;i++){const a=link.points[i-1],b=link.points[i];assert.ok(a.x===b.x||a.y===b.y);for(const p of pages){const crosses=a.x===b.x?a.x>p.x&&a.x<p.x+p.w&&Math.max(a.y,b.y)>p.y&&Math.min(a.y,b.y)<p.y+p.h:a.y>p.y&&a.y<p.y+p.h&&Math.max(a.x,b.x)>p.x&&Math.min(a.x,b.x)<p.x+p.w;assert.equal(crosses,false);}}}assert.equal(JSON.stringify(pages),before);
});
test('missing or excessive overview relationships are omitted explicitly, never joined arbitrarily',()=>{
 const p=[{path:'a',x:0,y:0,w:10,h:10},{path:'b',x:50,y:0,w:10,h:10}];assert.equal(route(p,[{fromPath:'a',toPath:'missing'}]).omitted,1);assert.equal(route(Array.from({length:129},(_,i)=>({...p[0],path:String(i)})),[{fromPath:'0',toPath:'1'}]).omitted,1);
 const result=route(p,Array.from({length:260},()=>({fromPath:'a',toPath:'b'})));assert.equal(result.links.length,256);assert.equal(result.omitted,4);assert.ok(result.shared>0);
});
