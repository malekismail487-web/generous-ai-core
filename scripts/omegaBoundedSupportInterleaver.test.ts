import assert from "node:assert/strict";
import {interleaveBoundedSupports, BOUNDED_SUPPORT_INTERLEAVER_POLICY as POLICY} from "../src/lib/codelab/research/boundedSupportInterleaver";
let passed = 0, failed = 0;
function check(label: string, fn: () => void) {try {fn(); passed++;} catch (e) {failed++; console.error(`FAIL ${label}: ${String(e)}`);}}
function prefix(atoms: number, minimum: number, maximum: number, count: number) {
  let work = 0; const stream = interleaveBoundedSupports(atoms, minimum, maximum, () => {work++;});
  const supports = [];
  try {for (let i = 0; i < count; i++) {const next = stream.next(); if (next.done) break; supports.push(next.value);}}
  finally {stream.return();}
  return {supports, work};
}
check("Small exhaustive enumeration is complete without duplicates", () => {
  const {supports} = prefix(6, 1, 4, 1000);
  assert.equal(supports.length, 6 + 15 + 20 + 15);
  assert.equal(new Set(supports.map(s => s.join(","))).size, supports.length);
  assert(supports.every(s => Object.isFrozen(s) && s.every((v, i) => v >= 0 && v < 6 && (!i || v > s[i - 1]))));
});
check("Every live cardinality gets one support before another round", () => {
  assert.deepEqual(prefix(58, 1, 3, 9).supports.map(s => s.length), [1, 2, 3, 1, 2, 3, 1, 2, 3]);
});
check("All 58 singleton atoms are reached within the unchanged 244-support exploratory allowance", () => {
  const {supports} = prefix(58, 1, 3, 244);
  assert.equal(supports.length, 244);
  assert.equal(new Set(supports.filter(s => s.length === 1).map(s => s[0])).size, 58);
});
check("Finite observation/coefficient dimensions do not generate invalid sizes", () => {
  assert.deepEqual(prefix(3, 3, 3, 100).supports, [[0, 1, 2]]);
  assert.equal(prefix(1, 1, 1, 100).supports.length, 1);
});
check("Stopping a tiny prefix does not eagerly enumerate combinations of 58 choose eight", () => {
  const {supports, work} = prefix(58, 1, 8, 8);
  assert.equal(supports.length, 8); assert(work < 200); assert.deepEqual(supports.map(s => s.length), [1, 2, 3, 4, 5, 6, 7, 8]);
});
check("An exhausted cardinality does not starve the remaining streams", () => {
  const {supports} = prefix(4, 1, 4, 100);
  assert.deepEqual([1, 2, 3, 4].map(size => supports.filter(s => s.length === size).length), [4, 6, 4, 1]);
});
for (const [atoms, minimum, maximum] of [[0, 1, 1], [59, 1, 1], [2, 0, 1], [2, 2, 1], [2, 1, 3], [58, 1, 9], [2.5, 1, 1], [2, 1.5, 2], [NaN, 1, 1]])
  check("Malformed dimensions fail before any support is yielded", () => assert.throws(() => interleaveBoundedSupports(atoms, minimum, maximum, () => {}).next()));
check("Revocation is checked on resumed generation and cleanup does not renew it", () => {
  let live = true; const stream = interleaveBoundedSupports(58, 1, 8, () => {if (!live) throw Error("REVOKED");});
  assert.equal(stream.next().done, false); live = false; assert.throws(() => stream.next(), /REVOKED/); assert.doesNotThrow(() => stream.return());
});
check("Closing a suspended stream cannot execute the rest of its search", () => {
  let work = 0; const stream = interleaveBoundedSupports(58, 1, 8, () => {work++;}); stream.next();
  const before = work; stream.return(); assert.equal(work, before); assert.equal(stream.next().done, true);
});
check("Scheduling is deterministic and carries no mathematical or execution verdict", () => {
  assert.deepEqual(prefix(12, 2, 4, 37).supports, prefix(12, 2, 4, 37).supports);
  assert.equal(POLICY.authorityGranted, false); assert.equal(POLICY.mathematicalAcceptanceGranted, false); assert(Object.isFrozen(POLICY));
});
console.log(`OMEGA_BOUNDED_SUPPORT_INTERLEAVER_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
