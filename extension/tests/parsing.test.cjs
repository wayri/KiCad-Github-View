const test = require('node:test');
const assert = require('node:assert/strict');
const { route, filePath, embeddedBlobData, blobRequest, viewerParams } = require('../parsing.js');

test('finds KiCad blob and pull request routes only on GitHub', () => {
  assert.deepEqual(route('https://github.com/owner/repo/blob/main/design/root.kicad_sch'), {
    kind: 'blob', repository: 'owner/repo', tail: ['main', 'design', 'root.kicad_sch']
  });
  assert.deepEqual(route('https://github.com/owner/repo/pull/42/files'), {
    kind: 'pull', repository: 'owner/repo', number: 42
  });
  assert.equal(route('https://example.com/owner/repo/blob/main/root.kicad_sch'), null);
  assert.equal(route('https://github.com/owner/repo/blob/main/readme.md'), null);
  assert.equal(route('https://github.com/owner/repo/pull/9007199254740992/files'), null);
});

test('uses embedded GitHub ref data for slash-containing branch names', () => {
  const url = route('https://github.com/owner/repo/blob/feature/new-ui/design/root.kicad_sch');
  const embedded = embeddedBlobData([JSON.stringify({ payload: {
    path: 'design/root.kicad_sch', refInfo: { name: 'feature/new-ui', currentOid: 'a'.repeat(40) }
  } })]);
  assert.deepEqual(blobRequest(url, embedded), {
    repository: 'owner/repo', file: 'design/root.kicad_sch', head: 'a'.repeat(40)
  });
});

test('rejects unsafe and unrelated file paths', () => {
  for (const path of ['../root.kicad_sch', '/root.kicad_sch', 'a\\b.kicad_pcb', 'root.kicad_sch.exe']) {
    assert.equal(filePath(path), null);
  }
  assert.equal(route('https://github.com/a/b/blob/main/%2e%2e/root.kicad_pcb'), null);
});

test('viewer query carries revision and absence status for PR additions and removals', () => {
  const params = viewerParams({ repository: 'owner/repo', headRepository: 'fork/repo',
    file: 'board.kicad_pcb', oldFile: 'board.kicad_pcb', base: 'a'.repeat(40),
    head: 'b'.repeat(40), status: 'added', pullNumber: 42, pullRepository: 'owner/repo' });
  assert.equal(params.get('headRepository'), 'fork/repo');
  assert.equal(params.get('base'), 'a'.repeat(40));
  assert.equal(params.get('status'), 'added');
  assert.equal(params.get('pullNumber'), '42');
  assert.equal(params.get('pullRepository'), 'owner/repo');
  assert.equal(viewerParams({ repository: 'owner/repo', file: 'root.kicad_sch', head: 'main' }).has('status'), false);
  assert.throws(() => viewerParams({ repository: 'fork/repo', file: 'root.kicad_sch', head: 'main',
    pullNumber: 42 }), /Invalid pull request context/);
  assert.throws(() => viewerParams({ repository: 'fork/repo', file: 'root.kicad_sch', head: 'main',
    pullNumber: 0, pullRepository: 'owner/repo' }), /Invalid pull request context/);
});


test('inline project and fabrication routes accept supported files without widening drawing paths',()=>{
 for(const file of ['board.kicad_pro','board.kicad_prl','rules.kicad_dru','page.kicad_wks','fp-lib-table','sym-lib-table','gerbers/top.gbr','gerbers/top.gtl','holes.drl']){assert.ok(filePath(file));assert.ok(route('https://github.com/owner/repo/blob/main/'+file));}
 for(const file of ['../top.gbr','C:/top.gbr','x\u0000.gbr','a/../top.gbr','notes.js','top.gbr.exe'])assert.equal(filePath(file),null);
 assert.equal(require('../browser-data.js').validPath('board.kicad_pro'),false);
});


test('GitLab nested namespaces use authoritative blob data for slash refs', () => {
  const parsed = route('https://gitlab.com/group/subgroup/board/-/blob/feature/power/design/root.kicad_sch?ref_type=heads');
  assert.deepEqual(parsed, {kind:'blob', provider:'gitlab', repository:'group/subgroup/board',
    tail:['feature','power','design','root.kicad_sch']});
  assert.equal(blobRequest(parsed, null), null, 'URL and ref_type cannot disambiguate branch and folders');
  const info = blobRequest(parsed, {repository:'group/subgroup/board', head:'feature/power', file:'design/root.kicad_sch'});
  assert.equal(info.provider, 'gitlab');
  assert.equal(viewerParams(info).get('provider'), 'gitlab');
  assert.equal(blobRequest(parsed, {repository:'wrong/board',head:'feature/power',file:'design/root.kicad_sch'}), null);
  assert.equal(blobRequest(parsed, {repository:'group/subgroup/board',head:'main',file:'design/root.kicad_sch'}), null);
  assert.equal(route('https://gitlab.example.com/group/board/-/blob/main/root.kicad_sch'), null);
  assert.deepEqual(route('https://gitlab.com/group/board/-/merge_requests/1/diffs'), {kind:'merge',provider:'gitlab',host:'https://gitlab.com',repository:'group/board',number:1});
  assert.equal(route('https://gitlab.com/group/board/-/merge_requests/1'), null);
  assert.equal(route('https://gitlab.com/group/board/-/merge_requests/1/diffs?diff_id=2'), null);
  assert.equal(route('https://gitlab.com/group/%2Fboard/-/blob/main/root.kicad_sch'), null);
});


test('current nested file and branch determine the embedded SHA, not stale or same-basename tree entries', () => {
  const current = route('https://github.com/owner/private/blob/feature/review/SubSheets/HPBM-SMALL.kicad_pcb');
  const scripts = [JSON.stringify({entries: [
    {path:'HPBM-SMALL.kicad_pcb',refInfo:{name:'feature/review',currentOid:'a'.repeat(40)}},
    {path:'SubSheets/HPBM-SMALL.kicad_pcb',refInfo:{name:'old-branch',currentOid:'b'.repeat(40)}},
    {path:'SubSheets/HPBM-SMALL.kicad_pcb',refInfo:{name:'feature/review',currentOid:'c'.repeat(40)}}
  ]})];
  assert.deepEqual(blobRequest(current, embeddedBlobData(scripts, current)), {
    repository:'owner/private',file:'SubSheets/HPBM-SMALL.kicad_pcb',head:'c'.repeat(40)
  });
  const stale = embeddedBlobData([JSON.stringify({path:'SubSheets/HPBM-SMALL.kicad_pcb',refInfo:{name:'old-branch',currentOid:'b'.repeat(40)}})],current);
  assert.equal(stale,null);
  assert.notEqual(blobRequest(current,stale)?.head,'b'.repeat(40));
});


test('report source paths and host routes accept only bounded safe text formats',()=>{
 for(const file of ['analysis.json','results.csv','results.tsv','simulation.wbk','output.raw','report.html','report.htm','simulation.txt','root.kicad_sch.txt']){assert.equal(filePath(file),file);assert.equal(require('../browser-data.js').validPath(file),false);assert.ok(route('https://github.com/owner/repo/blob/main/'+file));}
 for(const file of ['../results.csv','/analysis.wbk','x\\analysis.raw','x:report.html','results.csv.exe','report.js'])assert.equal(filePath(file),null);
});
