const test=require('node:test'),assert=require('node:assert/strict');
const comments=require('../review-comments.js');
const local={repository:'local/workspace',ref:'workspace_123',file:'design/board.kicad_pcb'};
const remote={provider:'gitlab',host:'https://gitlab.example.org',repository:'group/sub/project',ref:'main',file:'prefix/design/board.kicad_pcb'};
const date='2026-10-26T01:00:00.000Z';
const receipt=(extra={})=>({provider:'gitlab',host:remote.host,repository:remote.repository,kind:'issue',number:42,url:remote.host+'/'+remote.repository+'/-/issues/42#note_123',publishedAt:date,...extra});
const attachment=(extra={})=>({provider:'gitlab',host:remote.host,repository:remote.repository,projectId:7,mime:'image/png',width:640,height:400,url:remote.host+'/-/project/7/uploads/'+'a'.repeat(32)+'/kicad-review-'+'b'.repeat(20)+'.png',...extra});
const note=(extra={})=>({id:'workspace_note',text:'Inspect TP1',createdAt:date,anchor:{...local,reference:'TP1'},remoteRefs:[receipt()],attachments:[attachment()],mentions:['review.person_name'],...extra});

test('explicit workspace binding accepts matching GitLab receipts/screenshots/mentions without rewriting local anchor',()=>{
 const bound=comments.forWorkspace(local,remote),value=bound.validateComment(note());
 assert.deepEqual(value.anchor,{...local,reference:'TP1'});assert.equal(value.anchor.provider,undefined);assert.equal(value.anchor.host,undefined);assert.equal(value.remoteRefs[0].host,remote.host);assert.deepEqual(value.mentions,['review.person_name']);
 const otherFile=bound.validateComment(note({anchor:{...local,file:'sub/other.kicad_sch'}}));assert.equal(otherFile.anchor.file,'sub/other.kicad_sch');
 const exported=bound.exportComments([value]),parsed=bound.parseComments(exported);assert.deepEqual(parsed[0],value);
 assert.deepEqual(bound.fromMarkdown(bound.toMarkdown(value))[0],value);
});
test('default validator remains strict and a new binding never changes it',()=>{
 assert.throws(()=>comments.validateComment(note()));comments.forWorkspace(local,remote);assert.throws(()=>comments.validateComment(note()));
 assert.throws(()=>comments.validateComment(note({remoteRefs:[],attachments:[]})),/mention/);
 const strictRemote={...note(),anchor:{...remote,reference:'TP1'}};assert.equal(comments.validateComment(strictRemote).anchor.provider,'gitlab');
});
test('bound privileges require exact workspace repository/ref and absent provider/host fields',()=>{
 const bound=comments.forWorkspace(local,remote);for(const anchor of [{...local,ref:'workspace_124'},{...local,repository:'other/workspace'},{...local,provider:'github'},{...local,host:remote.host},{...local,provider:'gitlab',host:remote.host}])assert.throws(()=>bound.validateComment(note({anchor})));
});
test('bound receipts and attachments reject wrong remote host, repository and provider',()=>{
 const bound=comments.forWorkspace(local,remote);
 for(const ref of [receipt({host:'https://other.example.org',url:'https://other.example.org/'+remote.repository+'/-/issues/42'}),receipt({repository:'other/project',url:remote.host+'/other/project/-/issues/42'}),{kind:'issue',repository:'owner/repo',number:42,url:'https://github.com/owner/repo/issues/42',publishedAt:date}])assert.throws(()=>bound.validateComment(note({remoteRefs:[ref]})));
 for(const image of [attachment({host:'https://other.example.org',url:'https://other.example.org/-/project/7/uploads/'+'a'.repeat(32)+'/kicad-review-'+'b'.repeat(20)+'.png'}),attachment({repository:'other/project'}),{provider:'github',repository:'owner/repo',mime:'image/png',width:1,height:1,url:'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc'}])assert.throws(()=>bound.validateComment(note({attachments:[image]})));
});
test('real remote anchors retain their original strict matching inside bound APIs',()=>{
 const bound=comments.forWorkspace(local,remote),elsewhere={provider:'gitlab',host:'https://elsewhere.example.org',repository:'other/project',ref:'next',file:'board.kicad_pcb'};
 const value={...note({attachments:[],mentions:[]}),anchor:elsewhere,remoteRefs:[receipt({host:elsewhere.host,repository:elsewhere.repository,url:elsewhere.host+'/other/project/-/issues/42'})]};assert.deepEqual(bound.validateComment(value),comments.validateComment(value));
 assert.throws(()=>bound.validateComment({...value,remoteRefs:[receipt()]}));
});
test('factory validates and snapshots caller-provided binding scopes',()=>{
 for(const [a,b]of [[{...local,repository:'owner/repo'},remote],[{...local,provider:'github'},remote],[{...local,ref:'../bad'},remote],[local,{...remote,provider:'github'}],[local,{...remote,host:'http://gitlab.com'}],[local,{...remote,file:'../bad.kicad_pcb'}]])assert.throws(()=>comments.forWorkspace(a,b));
 const a={...local},b={...remote},bound=comments.forWorkspace(a,b);a.ref='changed';b.repository='other/project';b.host='https://other.example.org';assert.equal(bound.validateComment(note()).remoteRefs[0].repository,remote.repository);
});
test('bound validators share publication safety locks across API instances',async()=>{
 const first=comments.forWorkspace(local,remote),second=comments.forWorkspace({...local,ref:'workspace_456'},remote),records=new Map();let reads=0;
 const storage={get:async key=>{reads++;await new Promise(resolve=>setImmediate(resolve));return{[key]:records.get(key)};},set:async value=>Object.entries(value).forEach(([key,record])=>records.set(key,record))};
 const results=await Promise.allSettled([first.reservePublication(storage,'bound-test',100000),second.reservePublication(storage,'bound-test',100000)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(reads,2);
});
