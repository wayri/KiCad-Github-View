const test = require('node:test');
const assert = require('node:assert/strict');
const comments = require('../review-comments.js');

const sample = () => ({
  id: 'note-1', text: 'Check pin 3', createdAt: '2026-10-03T09:20:00.000Z',
  anchor: { repository: 'owner/board', ref: 'a'.repeat(40), file: 'design/root.kicad_sch',
    uuid: 'component-uuid', objectId: 'symbol-17', reference: 'U3', kind: 'symbol',
    position: { x: 23.5, y: -4.25 }, variant: 'default' }
});

test('comment round trip preserves the validated anchor and text', () => {
  const note = sample();
  const normalized = comments.validateComment({ ...note, ignored: 'not persisted' });
  assert.equal(normalized.ignored, undefined);
  assert.equal(normalized.severity, 'info', 'older notes default to informational severity');
  assert.deepEqual(comments.parseComments(comments.exportComments([note])), [normalized]);
  assert.match(comments.toMarkdown(note), /\| Position \(mm\) \| 23.5, -4.25 \|/);
});

test('rejects oversized text, invalid paths, positions, timestamps and imports', () => {
  assert.throws(() => comments.validateComment({ ...sample(), text: 'x'.repeat(4001) }), /4,000/);
  assert.throws(() => comments.validateComment({ ...sample(), anchor: { ...sample().anchor, file: '../root.kicad_sch' } }), /file/);
  assert.throws(() => comments.validateComment({ ...sample(), anchor: { ...sample().anchor, position: { x: Infinity, y: 1 } } }), /position/);
  assert.throws(() => comments.validateComment({ ...sample(), createdAt: '2026-02-31T09:20:00Z' }), /creation time/);
  assert.throws(() => comments.validateComment({ ...sample(), severity: 'blocker' }), /severity/);
  assert.throws(() => comments.parseComments('x'.repeat(1024 * 1024 + 1)), /1 MiB/);
  assert.throws(() => comments.parseComments('{'), /JSON/);
  assert.throws(() => comments.parseComments(comments.exportComments([sample(), sample()])), /Duplicate/);
  assert.throws(() => comments.exportComments(Array.from({ length: 101 }, (_, index) => ({ ...sample(), id: `note-${index}` }))), /Too many/);
});

test('escapes file and object metadata in a GitHub Markdown draft', () => {
  const note = sample();
  note.anchor.file = 'design/part](bad.example).kicad_sch';
  note.anchor.reference = 'U3*`[link]';
  const markdown = comments.toMarkdown(note);
  assert.match(markdown, /part\\\]\\\(bad\\\.example\\\)/);
  assert.match(markdown, /U3\\\*\\`\\\[link\\\]/);
  assert.match(markdown, /Check pin 3/);
  assert.match(markdown, /\| Severity \| Info \|/);
});

test('GitHub Markdown marker round-trips severity and ignores malformed or unrelated comments', () => {
  const note = { ...sample(), severity: 'critical', text: 'Fix this before release' };
  const markdown = comments.toMarkdown(note);
  assert.match(markdown, /\| Severity \| Critical \|/);
  assert.match(markdown, /<!-- kicad-review:v1 [A-Za-z0-9_-]+ -->/);
  assert.deepEqual(comments.fromMarkdown(`Unrelated discussion\n${markdown}\n<!-- kicad-review:v1 bad -->`),
    [comments.validateComment(note)]);
  assert.deepEqual(comments.fromMarkdown('<!-- kicad-review:v1 bad -->'), []);
  assert.throws(() => comments.fromMarkdown('😀'.repeat(300000)), /1 MiB/);
});

test('new skip state and mentions round-trip while older lifecycle states remain valid', () => {
  const note = { ...sample(), state:'skipped', mentions:['@alice','Bob','ALICE'],
    updatedAt:'2026-10-04T10:20:00.000Z' };
  const normalized = comments.validateComment(note);
  assert.deepEqual(normalized.mentions, ['alice','Bob']);
  assert.equal(normalized.state, 'skipped');
  assert.deepEqual(comments.parseSidecar(comments.serializeSidecar([note])), [normalized]);
  assert.match(comments.toMarkdown(note), /\| Mentions \| @alice, @Bob \|/);
  assert.match(comments.toMarkdown(note), /\| Updated \(UTC\) \| 2026-10-04T10:20:00\.000Z \|/);
  assert.deepEqual(comments.fromMarkdown(comments.toMarkdown(note)), [normalized]);
  for (const state of ['open','resolved','wont-fix']) assert.equal(comments.validateComment({...sample(),state}).state,state);
});

test('mention validation rejects injection and oversize input without changing shared state', () => {
  for (const mention of ['@', '@bad user', '@-bad', '@bad-', '@<script>', '@bad\nline', '@a'.repeat(50)]) {
    assert.throws(() => comments.validateComment({...sample(),mentions:[mention]}), /mention/);
  }
  assert.throws(() => comments.validateComment({...sample(),mentions:Array.from({length:21},(_,i)=>`user${i}`)}), /mentions/);
  assert.throws(() => comments.validateComment({...sample(),state:'closed'}), /state/);
  assert.throws(() => comments.validateComment({...sample(),updatedAt:'2026-10-02T00:00:00Z'}), /precedes/);
  const markdown = comments.toMarkdown({...sample(),mentions:['@alice'],text:'@alice check <script>'});
  assert.match(markdown, /\| Mentions \| @alice \|/);
  assert.equal(markdown.includes('<script>'), false, 'note text is emitted as escaped plain Markdown');
});

test('GitHub body formats user text and drawing context safely while retaining the revision permalink and marker',()=>{
 const note={...sample(),threadType:'discussion',severity:'major',state:'resolved',text:'Check **spacing** | fast\n@alice <script>alert(1)</script>',tags:['placement|clearance'],mentions:['alice'],
  anchor:{...sample().anchor,repository:'owner/repo',ref:'feature/review',file:'design/a (rev)#1.kicad_pcb',kind:'footprint',reference:'J1|A',variant:'prototype'}};
 const markdown=comments.toMarkdown(note);
 assert.ok(markdown.startsWith('## KiCad visual review\n\n### Review comment\n\n'));
 assert.match(markdown, /Check.*\n@alice/s);
 assert.equal(markdown.includes('<script>'),false);
 assert.ok(markdown.includes('| Destination type | Discussion |'));
 assert.ok(markdown.includes('| Component / object | J1\\|A (footprint) |'));
 assert.ok(markdown.includes('| Review state | resolved |'));
 assert.ok(markdown.includes('| Tags | placement\\|clearance |'));
 assert.ok(markdown.includes('| Position (mm) | 23.5, -4.25 |'));
 assert.ok(markdown.includes('| Revision | feature/review |'));
 assert.ok(markdown.includes('<https://github.com/owner/repo/blob/feature/review/design/a%20(rev)%231.kicad_pcb>'));
 assert.ok(markdown.includes('| Mentions | @alice |'));
 assert.match(markdown,/<!-- kicad-review:v1 [A-Za-z0-9_-]+ -->/);
 const netNote={...note,id:'net-note',anchor:{...note.anchor,kind:'net',reference:'SENSE | DATA',position:undefined,area:{x:1,y:2,width:3,height:4}}};
 const netBody=comments.toMarkdown(netNote);
 assert.ok(netBody.includes('| Net | SENSE \\| DATA |'));
 assert.ok(netBody.includes('| Area (mm) | 1, 2; 3 × 4 |')); assert.deepEqual(comments.fromMarkdown(markdown),[comments.validateComment(note)]);
});

const attachment=()=>({provider:'github',repository:'owner/board',mime:'image/png',url:'https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef',width:200,height:100});
const gitlabAttachment=()=>({provider:'gitlab',host:'https://gitlab.example.org',repository:'group/sub/project',projectId:19,mime:'image/png',url:'https://gitlab.example.org/-/project/19/uploads/'+'a'.repeat(32)+'/kicad-review-'+'b'.repeat(20)+'.png',width:200,height:100});
test('GitLab screenshot metadata round trips and rejects other project identities and unsafe URLs',()=>{
 const a=gitlabAttachment(),note={...sample(),anchor:{...sample().anchor,provider:'gitlab',host:a.host,repository:a.repository},attachments:[a]};
 assert.deepEqual(comments.fromMarkdown(comments.toMarkdown(note))[0].attachments,[a]);
 for(const change of [{host:'https://another.example.org'},{repository:'group/other'},{projectId:20},{url:a.url+'?token=x'},{url:a.url+'#fragment'},{url:'https://evil.example/a.png'},{url:a.url.replace('/project/19/','/project/20/')},{url:a.url.replace('.png','.svg')}])assert.throws(()=>comments.validateComment({...note,attachments:[{...a,...change}]}),/attachment/i);
 assert.throws(()=>comments.validateComment({...sample(),attachments:[a]}),/attachment/i);
});
test('published screenshots render in Markdown and round trip without embedded image bytes',()=>{
  const note={...sample(),attachments:[attachment()],capture:{mime:'image/png',width:200,height:100,dataUrl:'data:image/png;base64,iVBORw0KGgo='}};
  const body=comments.toMarkdown(note);
  assert.match(body,/!\[Captured drawing area/);
  assert.ok(body.includes(attachment().url));
  assert.ok(!body.includes('attach it manually'));
  assert.ok(!body.includes(note.capture.dataUrl));
  const [read]=comments.fromMarkdown(body);
  assert.deepEqual(read.attachments,[attachment()]);
  assert.equal(read.capture,undefined);
});
test('attachment metadata rejects external hosts, URL injection and cross-provider records',()=>{
  for(const url of ['https://evil.example/image.png',attachment().url+'?token=secret',attachment().url+'#x','https://github.com@evil.example/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef',attachment().url+'/x']){
    assert.throws(()=>comments.validateComment({...sample(),attachments:[{...attachment(),url}]}),/attachment/);
  }
  assert.throws(()=>comments.validateComment({...sample(),attachments:Array(5).fill(attachment())}),/attachment/);
  assert.throws(()=>comments.validateAttachment({...attachment(),width:1025}),/attachment/);
  assert.throws(()=>comments.validateComment({...sample(),anchor:{...sample().anchor,provider:'gitlab',host:'https://gitlab.com'},attachments:[attachment()]}),/attachment/);
});
test('read receipts are per reader and revision; sorting age and read filters are independent', () => {
  const older = {...sample(),id:'old',createdAt:'2026-10-01T09:20:00.000Z',updatedAt:'2026-10-01T09:20:00.000Z'};
  const newer = {...sample(),id:'new',createdAt:'2026-10-03T09:20:00.000Z',updatedAt:'2026-10-04T09:20:00.000Z',state:'skipped'};
  const keyA = comments.receiptKey(newer,'Alice'), keyB = comments.receiptKey(newer,'bob');
  assert.notEqual(keyA,keyB);
  assert.equal(comments.isUnread(newer,'2026-10-03T10:00:00.000Z'),true);
  assert.equal(comments.isUnread(newer,'2026-10-04T09:20:00.000Z'),false);
  assert.deepEqual(comments.sortAndFilter([newer,older],{order:'oldest'}).map(n=>n.id),['old','new']);
  assert.deepEqual(comments.sortAndFilter([older,newer],{order:'newest'}).map(n=>n.id),['new','old']);
  assert.deepEqual(comments.sortAndFilter([older,newer],{read:'unread'},n=>n.id==='old'?n.updatedAt:undefined).map(n=>n.id),['new']);
  assert.deepEqual(comments.sortAndFilter([older,newer],{state:'skipped',query:'@alice'},()=>undefined),[]);
  assert.throws(() => comments.receiptKey(newer,'<bad>'), /reader/);
});

test('GitLab scopes preserve provider and subgroups while separating review receipts and import identities',()=>{
 const github=sample(),gitlab={...sample(),anchor:{...sample().anchor,provider:'gitlab'}};
 assert.equal(comments.normalizeScope({...gitlab.anchor,repository:'group/sub/project'}).repository,'group/sub/project');
 assert.throws(()=>comments.normalizeScope({...github.anchor,repository:'group/sub/project'}));
 assert.notEqual(comments.receiptKey(github,'alice'),comments.receiptKey(gitlab,'alice'));
 assert.equal(comments.parseComments(comments.exportComments([github,gitlab])).length,2);
 assert.equal(comments.parseSidecar(comments.serializeSidecar([github,gitlab])).length,2);
 assert.throws(()=>comments.normalizeScope({...gitlab.anchor,provider:'unknown'}));
});


test('Issue and Discussion types survive sidecar, export and GitHub marker round trips; legacy notes remain valid',()=>{
 const note={id:'typed',text:'Review connection',createdAt:'2026-10-04T00:00:00Z',anchor:{repository:'wayri/board',ref:'main',file:'board.kicad_pcb'}};
 for(const threadType of ['issue','discussion']){const value={...note,threadType};assert.equal(comments.parseSidecar(comments.serializeSidecar([value]))[0].threadType,threadType);assert.equal(comments.parseComments(comments.exportComments([value]))[0].threadType,threadType);assert.equal(comments.fromMarkdown(comments.toMarkdown(value))[0].threadType,threadType);}
 assert.equal(comments.validateComment(note).threadType,undefined);assert.throws(()=>comments.validateComment({...note,threadType:'pull-request'}),/thread type/);
});

 test('review filters group closed states and sort severity and dates without mutating notes',()=>{
 const states=['open','resolved','skipped','wont-fix'],severities=['minor','critical','major','info'];const notes=states.map((state,i)=>({...sample(),id:state,state,severity:severities[i],createdAt:`2026-10-0${i+1}T00:00:00Z`,updatedAt:`2026-10-0${4-i}T00:00:00Z`})),before=JSON.stringify(notes);
 const ids=f=>comments.sortAndFilter(notes,f).map(n=>n.id);
 assert.deepEqual(ids({state:'closed'}),['resolved','wont-fix']);assert.deepEqual(ids({state:'open'}),['open']);assert.deepEqual(ids({state:'skipped'}),['skipped']);assert.deepEqual(ids({state:'closed',severity:'info'}),['wont-fix']);
 assert.deepEqual(ids({order:'severity'}),['resolved','skipped','open','wont-fix']);assert.deepEqual(ids({order:'severity-lowest'}),['wont-fix','open','skipped','resolved']);assert.deepEqual(ids({order:'newest'}),['wont-fix','skipped','resolved','open']);assert.deepEqual(ids({order:'oldest'}),['open','resolved','skipped','wont-fix']);assert.deepEqual(ids({order:'updated'}),['open','resolved','skipped','wont-fix']);assert.deepEqual(ids({order:'updated-oldest'}),['wont-fix','skipped','resolved','open']);assert.equal(JSON.stringify(notes),before);
 assert.deepEqual(ids({state:'closed',read:'read'},()=>undefined),[]);assert.throws(()=>ids({state:'unknown'}),/filter/);
 });

 test('issue and discussion categories map remote conversations and retain unassigned legacy notes only in all',()=>{
 const notes=[{...sample(),id:'issue',threadType:'issue',state:'resolved'},{...sample(),id:'discussion',threadType:'discussion',state:'open'},{...sample(),id:'legacy'},{...sample(),id:'old-discussion',github:{source:'discussion-comment'}},{...sample(),id:'old-issue',remoteRefs:[{kind:'issue'}]}];
 assert.equal(comments.commentType(notes[2]),null);assert.equal(comments.commentType(notes[3]),'discussion');assert.equal(comments.commentType({...notes[0],github:{source:'discussion-comment'}}),'discussion');assert.equal(comments.commentType({remoteRefs:[{kind:'issue'},{kind:'discussion'}]}),null);
 assert.deepEqual(comments.sortAndFilter(notes,{threadType:'issue'}).map(n=>n.id),['issue','old-issue']);assert.deepEqual(comments.sortAndFilter(notes,{threadType:'discussion'}).map(n=>n.id),['discussion','old-discussion']);assert.deepEqual(comments.sortAndFilter(notes,{threadType:'issue',state:'closed'}).map(n=>n.id),['issue']);assert.equal(comments.sortAndFilter(notes,{threadType:'all'}).length,5);assert.throws(()=>comments.sortAndFilter(notes,{threadType:'chat'}),/filter/);
 });
