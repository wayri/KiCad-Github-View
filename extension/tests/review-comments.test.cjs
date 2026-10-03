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
  assert.match(comments.toMarkdown(note), /Position \(mm\): 23.5, -4.25/);
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
  assert.match(markdown, /Severity: Info/);
});

test('GitHub Markdown marker round-trips severity and ignores malformed or unrelated comments', () => {
  const note = { ...sample(), severity: 'critical', text: 'Fix this before release' };
  const markdown = comments.toMarkdown(note);
  assert.match(markdown, /Severity: Critical/);
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
  assert.match(comments.toMarkdown(note), /Mentions: @alice, @Bob/);
  assert.match(comments.toMarkdown(note), /Updated: 2026-10-04T10:20:00\.000Z/);
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
  assert.match(markdown, /Mentions: @alice/);
  assert.equal(markdown.includes('<script>'), true, 'plain user body is not interpreted as trusted HTML here');
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
