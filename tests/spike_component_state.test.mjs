import assert from "node:assert/strict";
import test from "node:test";
import { populationMask, uniqueComponentIndexes } from "../extension/spike/componentState.mjs";

const parts = [
  { id: "a", ref: "R1" },
  { id: "b", ref: "U2" },
  { id: "c", ref: "U2" },
  { id: "d", ref: "C3" },
];

test("only unique board references may identify one component", () => {
  const indexes = uniqueComponentIndexes(parts);
  assert.equal(indexes.get("R1"), 0);
  assert.equal(indexes.get("U2"), null);
  assert.equal(indexes.get("C3"), 3);
  assert.equal(indexes.has("U9"), false);
});

test("population state hides requested unique bodies and restores unspecified bodies", () => {
  assert.deepEqual(populationMask(parts, [
    { reference: "R1", populated: false },
    { reference: "U2", populated: false },
    { reference: "U9", populated: false },
  ]), [false, true, true, true]);
  assert.deepEqual(populationMask(parts, [{ reference: "C3", populated: false }]), [true, true, true, false]);
  assert.deepEqual(populationMask(parts, []), [true, true, true, true]);
});

test("duplicate requests and malformed states never hide an uncertain body", () => {
  assert.deepEqual(populationMask(parts, [
    { reference: "R1", populated: false },
    { reference: "R1", populated: true },
    { reference: "C3", populated: "false" },
  ]), [true, true, true, true]);
});
