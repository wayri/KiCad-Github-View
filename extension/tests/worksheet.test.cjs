const test = require("node:test");
const assert = require("node:assert/strict");
const { build } = require("../worksheet.js");
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`);

test("default sheet geometry matches the KiCad 10 native SVG reference", () => {
  // Independent reference: kicad-cli 10.0.6 sch export svg sensor.kicad_sch.
  // KiCad rounds standard page sizes to mils in its native page settings.
  const primitives = build({width:297.0022,height:210.0072,format:"A4"}, "sensor.kicad_sch");
  const frames = primitives.filter(p => p.kind === "page-frame");
  assert.deepEqual(frames[0].points, [{x:10,y:10},{x:287.0022,y:10},{x:287.0022,y:200.0072},{x:10,y:200.0072}]);
  const block = primitives.find(p => p.kind === "title-block" && p.type === "polygon");
  near(block.points[0].x,177.0022); near(block.points[0].y,166.0072);
  near(block.points[2].x,285.0022); near(block.points[2].y,198.0072);
  assert.equal(primitives.filter(p=>p.kind === "page-zone" && p.type === "line").length,16);
  assert.deepEqual(primitives.filter(p=>p.kind === "page-zone" && p.type === "text" && p.y===11).map(p=>[p.x,p.text]),
    [[35,"1"],[85,"2"],[135,"3"],[185,"4"],[235,"5"],[285,"6"]]);
  assert.deepEqual(primitives.filter(p=>p.kind === "page-zone" && p.type === "text" && p.x===11).map(p=>[p.y,p.text]),
    [[35,"A"],[85,"B"],[135,"C"],[185,"D"]]);
  const split = primitives.find(p=>p.type === "line" && Math.abs(p.points[0].x-197.0022)<0.0001);
  near(split.points[0].y,191.5072); near(split.points[1].y,194.5072);
  assert.ok(primitives.every(p=>p.frame === true && p.color === "#a0a0a0" && p.path === "sensor.kicad_sch"));
});

test("native title field offsets, metadata, filename and sheet identity", () => {
  const p=build({width:297.0022,height:210.0072,format:"A4",titleBlock:{title:"Sensor interface",date:"2026-09-14",rev:"B",company:"KiCad Visual Review",comments:["one","two","three","four","five"]}},
    "hardware/sensor.kicad_sch", {sheetNumber:2,sheetCount:5,sheetName:"/Power/",kicadVersion:"10.0.6"});
  const get = text => p.find(i=>i.text===text);
  // SVG text baselines include half the stroke-font height; primitives retain
  // the actual centered worksheet anchors from pagelayout_default.kicad_wks.
  const title=get("Title: Sensor interface");near(title.x,178.0022);near(title.y,189.3072);
  assert.deepEqual([title.size,title.bold,title.italic],[2,true,true]);
  near(get("Date: 2026-09-14").x,200.0022); near(get("Date: 2026-09-14").y,193.1072);
  near(get("Rev: B").x,263.0022);
  near(get("File: sensor.kicad_sch").y,185.7072);
  assert.ok(get("Sheet: /Power/") && get("Id: 2/5") && get("KiCad E.D.A. 10.0.6"));
  near(get("one").y,177.0072);near(get("four").y,168.0072);
  assert.equal(get("five"),undefined,"native default worksheet displays four comments");
});

test("portrait and large pages retain margins and fit zone repetitions", () => {
  for(const page of [{width:210,height:297,format:"A4"},{width:1189,height:841,format:"A0"}]) {
    const p=build(page,"test.kicad_pcb");
    const inner=p.filter(i=>i.kind === "page-frame")[1];
    assert.deepEqual(inner.points[0],{x:12,y:12});
    assert.deepEqual(inner.points[2],{x:page.width-12,y:page.height-12});
    assert.ok(p.filter(i=>i.kind === "page-zone" && i.type === "text").every(i=>i.x>=10 && i.x<=page.width-10 && i.y>=10 && i.y<=page.height-10));
  }
  assert.deepEqual(build({width:0,height:210}),[]);
});
