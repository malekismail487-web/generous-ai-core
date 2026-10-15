import assert from "node:assert/strict";
import {createExactModularRefuter, EXACT_MODULAR_REFUTATION_POLICY as POLICY}
  from "../src/lib/codelab/research/exactModularRefutation";
import {exactScalar, fitExactLinearSystem} from "../src/lib/codelab/research/exactLinearFit";

let passed = 0, failed = 0;
function check(name: string, action: () => void) {
  try {action(); passed++;} catch {failed++; console.error(`FAILED ${name}`);}
}
const p = POLICY.prime;
const q = (op: "ADD" | "SUB" | "MUL" | "DIV", a: string, b: string) => exactScalar(op, a, b, () => {});
check("fixed modulus is prime and every finite-field product is exactly representable", () => {
  for (let d = 2; d * d <= p; d++) assert.notEqual(p % d, 0);
  assert((p - 1) ** 2 < Number.MAX_SAFE_INTEGER);
  assert.equal(POLICY.admitsSolution, false); assert.equal(POLICY.grantsAuthority, false);
});
const filter = createExactModularRefuter(() => {});
check("full-column-rank modular contradiction refutes an impossible rational system", () => {
  const result = filter.refute([["1"], ["1"]], ["1", "2"]);
  assert.equal(result.state, "PROVABLY_INCONSISTENT"); assert.equal(result.rank, 1);
});
check("bad-prime rank loss cannot refute p*x=1", () => {
  const matrix = [[String(p)], [String(2 * p)]], rhs = ["1", "2"];
  assert.equal(fitExactLinearSystem(matrix, rhs, () => {}).state, "UNIQUE");
  const result = filter.refute(matrix, rhs);
  assert.equal(result.state, "NOT_REFUTED"); assert.equal(result.reason, "RANK_LOSS_OR_UNDERDETERMINATION");
});
check("rationally full rank can still lose rank modulo p and must fall through", () => {
  const matrix = [["1", "1"], ["1", String(p + 1)], ["2", String(p + 2)]];
  const rhs = ["1", "2", "3"];
  assert.equal(fitExactLinearSystem(matrix, rhs, () => {}).state, "UNIQUE");
  assert.equal(filter.refute(matrix, rhs).state, "NOT_REFUTED");
});
check("noninvertible rational denominators have no field image, never a fake zero", () => {
  assert.equal(filter.refute([[`1/${p}`], [`2/${p}`]], ["1", "2"]).reason, "NONINVERTIBLE_INPUT_DENOMINATOR");
  assert.equal(filter.refute([["1"], ["2"]], [`1/${p}`, `2/${p}`]).state, "NOT_REFUTED");
});
check("canonical cancellation is performed before testing the modulus", () => {
  assert.equal(filter.refute([[`${p}/${p}`], ["1"]], ["1", "1"]).state, "NOT_REFUTED");
});
check("modular consistency is not rational acceptance", () => {
  const matrix = [["1"], ["1"]], rhs = ["1", String(p + 1)];
  assert.equal(filter.refute(matrix, rhs).state, "NOT_REFUTED");
  assert.equal(fitExactLinearSystem(matrix, rhs, () => {}).state, "INCONSISTENT");
});
check("underdetermined and zero systems are not invented solutions or refutations", () => {
  assert.equal(filter.refute([["0", "0"], ["0", "0"]], ["1", "2"]).state, "NOT_REFUTED");
  assert.equal(filter.refute([["1", "2"]], ["1"]).state, "NOT_REFUTED");
});
let seed = 0x29b73e;
const next = (n: number) => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n;};
let refuted = 0;
for (let trial = 0; trial < 128; trial++) {
  const columns = 1 + next(3), rows = columns + 2;
  const matrix = Array.from({length: rows}, () => Array.from({length: columns}, () => `${next(19) - 9}/${next(11) + 1}`));
  const witness = Array.from({length: columns}, () => `${next(13) - 6}/${next(7) + 1}`);
  const rhs = matrix.map(row => row.reduce((sum, value, j) => q("ADD", sum, q("MUL", value, witness[j])), "0"));
  check(`generated rational witness cannot be refuted ${trial}`, () => {
    assert.equal(filter.refute(matrix, rhs).state, "NOT_REFUTED");
    assert.equal(filter.refute([...matrix].reverse().map(row => [...row].reverse()), [...rhs].reverse()).state, "NOT_REFUTED");
  });
  const perturbed = [...rhs]; perturbed[rows - 1] = q("ADD", perturbed[rows - 1], "1/97");
  const result = filter.refute(matrix, perturbed);
  check(`every generated modular refutation agrees with independent rational elimination ${trial}`, () => {
    if (result.state === "PROVABLY_INCONSISTENT") {
      refuted++; assert.equal(fitExactLinearSystem(matrix, perturbed, () => {}).state, "INCONSISTENT");
    }
  });
}
check("refutation detector is nonvacuous across the generated systems", () => assert(refuted >= 100));
for (const [matrix, rhs] of [
  [[], []], [[[]], ["1"]], [[["1"], ["1", "2"]], ["1", "2"]],
  [Array.from({length: 13}, () => ["1"]), Array(13).fill("1")],
  [[Array(9).fill("1")], ["1"]], [[["01"]], ["1"]], [[["1/0"]], ["1"]],
] as const) check("malformed matrix and literal boundaries fail closed", () => {
  assert.throws(() => filter.refute(matrix as string[][], rhs as string[]));
});
check("original 4096-bit scalar bound survives the prefilter", () => {
  const legal = (1n << 4095n).toString(), illegal = (1n << 4096n).toString();
  assert.equal(filter.refute([[legal], [legal]], ["1", "2"]).state, "PROVABLY_INCONSISTENT");
  assert.throws(() => filter.refute([[illegal]], ["1"]));
});
check("host getters are not executed during snapshot validation", () => {
  let entered = false; const hostile = Object.defineProperty({}, "matrix", {get() {entered = true; return [["1"]];}, enumerable: true});
  assert.throws(() => filter.refute(hostile as never, ["1"])); assert.equal(entered, false);
});
check("every query and hot cache hit remains owned by the original finite lifetime", () => {
  let live = true, work = 0;
  const scoped = createExactModularRefuter(() => {if (!live) throw Error("OWNER_REVOKED"); work++;});
  scoped.refute([["1"], ["1"]], ["1", "2"]); const before = work;
  scoped.refute([["1"], ["1"]], ["1", "2"]); assert(work > before); assert(scoped.statistics().hits > 0);
  live = false; assert.throws(() => scoped.refute([["1"]], ["1"])); assert.throws(() => scoped.statistics());
});
check("cache representation, entry count and eviction are bounded", () => {
  const scoped = createExactModularRefuter(() => {});
  for (let i = 1; i <= 400; i++) scoped.refute([[String(i)]], ["1"]);
  const stats = scoped.statistics();
  assert(stats.entries <= POLICY.maxEntries); assert(stats.retainedUnits <= POLICY.maxRetainedUnits);
  assert(stats.evictions > 0); assert(Object.isFrozen(scoped)); assert(Object.isFrozen(stats));
});
check("hot long-literal lookups retain word-proportional accounting", () => {
  const workFor = (literal: string) => {
    let work = 0; const scoped = createExactModularRefuter(() => {work++;});
    scoped.refute([[literal], [literal]], ["1", "2"]); const before = work;
    scoped.refute([[literal], [literal]], ["1", "2"]); return work - before;
  };
  const long = (1n << 4095n).toString();
  assert(workFor(long) >= workFor("1") + 2 * (Math.ceil(long.length / 64) - 1));
});
console.log(`OMEGA_EXACT_MODULAR_REFUTATION_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
