const test = require('node:test');
const assert = require('node:assert/strict');
require('../design-diff.js');
const { collect, resolveModelPath, modelPose } = require('../repo-models.js');

const board = `(kicad_pcb
  (footprint "Demo:Part" (layer "F.Cu") (at 100 80 90) (uuid "part-a")
    (property "Reference" "R1")
    (model "models/body.wrl" (offset (xyz 1 2 3)) (scale (xyz 1.5 2 1)) (rotate (xyz 10 20 30)))
    (model "${'${KIPRJMOD}'}/models/cap.glb" (offset (xyz 0 0 0)))
    (model "models/case.step"))
  (footprint "Demo:Back" (layer "B.Cu") (at 150 85 180) (uuid "part-b")
    (property "Reference" "U2")
    (model "../shared/back.vrml" (scale (xyz 1 1 1))))
)`;

test('resolves only same-repository model references', () => {
  assert.equal(resolveModelPath('hardware/board.kicad_pcb', 'models/a.wrl'), 'hardware/models/a.wrl');
  assert.equal(resolveModelPath('hardware/board.kicad_pcb', '../shared/a.wrl'), 'shared/a.wrl');
  assert.equal(resolveModelPath('hardware/board.kicad_pcb', '${KIPRJMOD}/models/a.wrl'), 'hardware/models/a.wrl');
  for (const path of ['../../escape.wrl', '/absolute.wrl', 'C:/absolute.wrl', 'https://host/model.wrl',
    '${KICAD8_3DMODEL_DIR}/body.wrl', 'models\\body.wrl', 'model.wrl?other', 'models/%00.wrl']) {
    assert.equal(resolveModelPath('hardware/board.kicad_pcb', path), null, path);
  }
});

test('collects every supported model with per-model transforms and footprint side', () => {
  const { models, diagnostics } = collect(board, 'hardware/board.kicad_pcb');
  assert.equal(models.length, 3);
  assert.deepEqual(models.map(item => item.path), ['hardware/models/body.wrl', 'hardware/models/cap.glb', 'shared/back.vrml']);
  assert.deepEqual(models[0], { path: 'hardware/models/body.wrl', format: 'wrl', footprintId: 'part-a', reference: 'R1',
    footprint: { x: 100, y: 80, angle: 90, layer: 'F.Cu' }, offset: [1, 2, 3], scale: [1.5, 2, 1], rotate: [10, 20, 30] });
  assert.deepEqual(models[2].footprint, { x: 150, y: 85, angle: 180, layer: 'B.Cu' });
  assert.ok(diagnostics.some(message => message.includes('STEP')));
});

test('model pose follows KiCad millimetre offsets, footprint rotation, and bottom flip', () => {
  const { models } = collect(board, 'hardware/board.kicad_pcb');
  const front = modelPose(models[0], 100, 80, 1.6);
  assert.ok(Math.abs(front.position[0] + 2) < 1e-10);
  assert.ok(Math.abs(front.position[1] - 1) < 1e-10);
  assert.equal(front.position[2], 3.8);
  assert.equal(front.footprintAngle, Math.PI / 2);
  assert.deepEqual(front.scale, [3.81, 5.08, 2.54]);
  assert.ok(Math.abs(front.modelRotation[0] + 10 * Math.PI / 180) < 1e-10);
  const back = modelPose({ ...models[2], offset: [1, 2, 3], rotate: [10, 20, 30] }, 100, 80, 1.6);
  assert.ok(Math.abs(back.position[0] - 49) < 1e-10);
  assert.ok(Math.abs(back.position[1] - -3) < 1e-10);
  assert.equal(back.position[2], -3.8);
  assert.ok(Math.abs(back.modelRotation[0] - 170 * Math.PI / 180) < 1e-10);
  assert.ok(Math.abs(back.modelRotation[1] - 20 * Math.PI / 180) < 1e-10);
});

test('rejects invalid transforms and hidden models without loading them', () => {
  const source = board.replace('(offset (xyz 1 2 3))', '(offset (xyz 1 bad 3))')
    .replace('(model "${KIPRJMOD}/models/cap.glb" (offset (xyz 0 0 0)))',
      '(model "${KIPRJMOD}/models/cap.glb" (hide yes))');
  const { models, diagnostics } = collect(source, 'hardware/board.kicad_pcb');
  assert.equal(models.length, 1);
  assert.equal(models[0].reference, 'U2');
  assert.ok(diagnostics.some(message => message.includes('transform is invalid')));
});

test('model parsing rejects non-board source and caps model count', () => {
  assert.throws(() => collect('(kicad_sch)', 'board.kicad_pcb'), /saved KiCad PCB/);
  const many = `(kicad_pcb (footprint "Part" (layer "F.Cu") (at 1 2)
    (property "Reference" "U1") ${Array.from({ length: 40 }, (_, index) => `(model "m/${index}.wrl")`).join(' ')}))`;
  const result = collect(many, 'board.kicad_pcb');
  assert.equal(result.models.length, 32);
  assert.ok(result.diagnostics.some(message => message.includes('first 32')));
});

test('legacy reference and missing UUID follow SPIKE parser identity fallback', () => {
  const result = collect('(kicad_pcb (footprint "Legacy" (layer "F.Cu") (at 1 2)'
    + ' (fp_text reference "J2") (model "body.wrl")))', 'board.kicad_pcb');
  assert.equal(result.models[0].reference, 'J2');
  assert.equal(result.models[0].footprintId, 'component-J2');
});
