import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";

/** Predeclared, distinct coding-transfer problems. These are not proof or scientific-discovery benchmarks. */
export const NYX_TRANSFER_EPOCH = Object.freeze({
  chunkId: "NYX-TRANSFER-MATCHED-002",
  version: "nyx-transfer-matched/2",
  arms: Object.freeze(["MINIMAL_REFERENCE", "CURRENT", "REASONING_ENABLED"] as const),
  domainScope: Object.freeze(["MATHEMATICAL_PROGRAMMING", "SCIENTIFIC_DATA_PROGRAMMING",
    "EVIDENCE_LOGIC_PROGRAMMING", "REPOSITORY_DEPENDENCY_PROGRAMMING"] as const),
  modelCallsPerTask: 3,
  candidateIterationsPerTask: 3,
  cognitionCorrectionsPerTask: 2,
  outputTokensPerCall: 1_536,
  wallClockMsPerTask: 180_000,
  sourceRepresentation: "LINES" as const,
  intentCompilationMode: "SAFE_CANONICALIZATION" as const,
  authority: "DISPOSABLE_REPOSITORY_ONLY" as const,
  broadGeneralizationCertified: false,
});

// The scored core is pinned independently of the new tasks. Changing the core
// requires a new evaluation epoch, not silently reusing this comparison.
export const NYX_TRANSFER_EPOCH_FROZEN_CORE = Object.freeze({
  commit: "98a41a1133989df2af06d567578483f3a98bf27a",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "b4254ef147ca1855a3ce969323411a6953f76eac37b89e0a775eec3ab7f6e6c8",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "cb0f1331436804e9595cbd341a9021baec3b09b7bdd0bd0106b99a92a5f291f6",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "3d6b24f088093b049b65284cce906adc74203d9d4a62f25fd8fc458410d55c0a",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "f4f1f180197e0a39c069816b8ecf6468bed38d4464404dae2c7a6df37e37e04b",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

const provenance = "NYX_TRANSFER_MATCHED_FRESH_2026_09_27" as const;
function policy(id: string, paths: readonly string[], readonlyPaths: readonly string[] = [],
  invariants: EngineeringQualityPolicy["invariants"] = []): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-TRANSFER-${id}`, allowedChangedPaths: Object.freeze([...paths]),
    readonlyPaths: Object.freeze([...readonlyPaths]), maxChangedFiles: paths.length, maxChangedLines: 70,
    maxCandidateBytes: 10_240, maxCyclomaticComplexity: 20, maxComplexityDelta: 16,
    maxNestingDepth: 5, maxAddedDeclarations: 5, invariants: Object.freeze([...invariants]) });
}

export const NYX_TRANSFER_EPOCH_TASKS: readonly NyxQualityV5Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-TRANSFER-A-CONGRUENCES", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair mergeCongruences(left,right) for integer congruences x ≡ residue (mod positive modulus). Return the smallest nonnegative solution and positive least-common-multiple modulus as {residue,modulus}; return null when inconsistent. Normalize negative residues. Throw RangeError on non-integer or non-positive modulus and on unsafe-integer output. Preserve the named ESM export, and do not mutate inputs.",
    initialDefect: "The implementation only handles equal moduli and rejects valid non-coprime systems.",
    correctFiles: Object.freeze({ "src/merge-congruences.mjs": `export function mergeCongruences(left, right) {
  const m = left.modulus, n = right.modulus;
  if (![m, n, left.residue, right.residue].every(Number.isSafeInteger) || m <= 0 || n <= 0) {
    throw new RangeError("invalid congruence");
  }
  const a = ((left.residue % m) + m) % m;
  const b = ((right.residue % n) + n) % n;
  let oldR = m, r = n, oldS = 1, s = 0;
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if ((b - a) % oldR !== 0) return null;
  const modulus = (m / oldR) * n;
  if (!Number.isSafeInteger(modulus)) throw new RangeError("unsafe modulus");
  const period = n / oldR;
  const step = (((b - a) / oldR * oldS) % period + period) % period;
  const residue = ((a + m * step) % modulus + modulus) % modulus;
  if (!Number.isSafeInteger(residue)) throw new RangeError("unsafe residue");
  return { residue, modulus };
}
` }),
    faultyFiles: Object.freeze({ "src/merge-congruences.mjs": `export function mergeCongruences(left, right) {
  if (left.modulus !== right.modulus || left.residue !== right.residue) return null;
  return left;
}
` }),
    mutationPaths: Object.freeze(["src/merge-congruences.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/merge-congruences.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { mergeCongruences } from "../src/merge-congruences.mjs";
const result = mergeCongruences({residue:2,modulus:6},{residue:8,modulus:14});
if(JSON.stringify(result)!==JSON.stringify({residue:8,modulus:42}))process.exit(2);
console.log("VISIBLE_PASS congruences");
`, candidateModule: "src/merge-congruences.mjs", exportName: "mergeCongruences",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "INCONSISTENT", args: [{ residue: 1, modulus: 2 }, { residue: 0, modulus: 2 }],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "NEGATIVE", args: [{ residue: -2, modulus: 5 }, { residue: 3, modulus: 7 }],
        expectation: { kind: "RETURN", value: { residue: 3, modulus: 35 } } },
      { caseId: "SHARED_FACTOR", args: [{ residue: 4, modulus: 6 }, { residue: 4, modulus: 8 }],
        expectation: { kind: "RETURN", value: { residue: 4, modulus: 24 } } },
      { caseId: "INVALID_MODULUS", args: [{ residue: 1, modulus: 0 }, { residue: 1, modulus: 3 }],
        expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: Object.freeze({ ...policy("CONGRUENCES", ["src/merge-congruences.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION",
        path: "src/merge-congruences.mjs" },
    ]), maxAddedDeclarations: 13 }), maxChanges: 1, maxPatchBytes: 7_168,
  }),
  Object.freeze({
    taskId: "NYX-TRANSFER-B-SENSOR-FUSION", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair fuseReadings(readings) to combine independent measurements {value,uncertainty} by inverse-variance weighting. Return {estimate,uncertainty}, both rounded to six decimal places; uncertainty is sqrt(1/sum(1/u²)). Reject an empty array, non-finite values, and non-positive or non-finite uncertainties with RangeError. Preserve the named ESM export and do not mutate readings.",
    initialDefect: "The implementation averages readings without uncertainty weighting or input validation.",
    correctFiles: Object.freeze({ "src/fuse-readings.mjs": `export function fuseReadings(readings) {
  if (!Array.isArray(readings) || readings.length === 0) throw new RangeError("invalid readings");
  let weightSum = 0, weightedSum = 0;
  for (const reading of readings) {
    if (!reading || !Number.isFinite(reading.value) || !Number.isFinite(reading.uncertainty)
      || reading.uncertainty <= 0) throw new RangeError("invalid reading");
    const weight = 1 / (reading.uncertainty ** 2);
    weightSum += weight;
    weightedSum += weight * reading.value;
  }
  if (!Number.isFinite(weightSum) || !Number.isFinite(weightedSum) || weightSum <= 0) {
    throw new RangeError("unsafe result");
  }
  return { estimate: Number((weightedSum / weightSum).toFixed(6)),
    uncertainty: Number(Math.sqrt(1 / weightSum).toFixed(6)) };
}
` }),
    faultyFiles: Object.freeze({ "src/fuse-readings.mjs": `export function fuseReadings(readings) {
  return { estimate: readings.reduce((sum, item) => sum + item.value, 0) / readings.length, uncertainty: 0 };
}
` }),
    mutationPaths: Object.freeze(["src/fuse-readings.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/fuse-readings.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { fuseReadings } from "../src/fuse-readings.mjs";
if(JSON.stringify(fuseReadings([{value:0,uncertainty:1},{value:2,uncertainty:1}]))!==JSON.stringify({estimate:1,uncertainty:0.707107}))process.exit(2);
console.log("VISIBLE_PASS sensor-fusion");
`, candidateModule: "src/fuse-readings.mjs", exportName: "fuseReadings",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "UNEQUAL_UNCERTAINTY", args: [[{ value: 0, uncertainty: 1 }, { value: 10, uncertainty: 2 }]],
        expectation: { kind: "RETURN", value: { estimate: 2, uncertainty: 0.894427 } } },
      { caseId: "SINGLE", args: [[{ value: -3, uncertainty: 0.5 }]],
        expectation: { kind: "RETURN", value: { estimate: -3, uncertainty: 0.5 } } },
      { caseId: "ZERO_UNCERTAINTY", args: [[{ value: 1, uncertainty: 0 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "NAN_VALUE", args: [[{ value: "NaN", uncertainty: 1 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "EMPTY", args: [[]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("FUSION", ["src/fuse-readings.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION",
        path: "src/fuse-readings.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-TRANSFER-C-EVIDENCE", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair classifyClaim(observations). Count only fresh, independent observations from distinct sourceId values; later duplicate sourceIds cannot add votes. Each counted result is SUPPORT or REFUTE. Return CONFLICTED when both occur, SUPPORTED when at least two distinct sources support, REFUTED when at least two refute, and INSUFFICIENT_EVIDENCE otherwise. Preserve the named ESM export and do not mutate observations.",
    initialDefect: "The implementation treats stale, dependent, and duplicate observations as independent support.",
    correctFiles: Object.freeze({ "src/classify-claim.mjs": `export function classifyClaim(observations) {
  const seen = new Set();
  let support = 0, refute = 0;
  for (const item of observations) {
    if (!item.fresh || !item.independent || seen.has(item.sourceId)) continue;
    seen.add(item.sourceId);
    if (item.result === "SUPPORT") support += 1;
    if (item.result === "REFUTE") refute += 1;
  }
  if (support > 0 && refute > 0) return "CONFLICTED";
  if (support >= 2) return "SUPPORTED";
  if (refute >= 2) return "REFUTED";
  return "INSUFFICIENT_EVIDENCE";
}
` }),
    faultyFiles: Object.freeze({ "src/classify-claim.mjs": `export function classifyClaim(observations) {
  return observations.filter((item) => item.result === "SUPPORT").length >= 2 ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE";
}
` }),
    mutationPaths: Object.freeze(["src/classify-claim.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/classify-claim.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { classifyClaim } from "../src/classify-claim.mjs";
const observations=[{sourceId:"a",result:"SUPPORT",fresh:true,independent:true},{sourceId:"a",result:"SUPPORT",fresh:true,independent:true}];
if(classifyClaim(observations)!=="INSUFFICIENT_EVIDENCE")process.exit(2);
console.log("VISIBLE_PASS evidence");
`, candidateModule: "src/classify-claim.mjs", exportName: "classifyClaim",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "TWO_INDEPENDENT", args: [[
        { sourceId: "a", result: "SUPPORT", fresh: true, independent: true },
        { sourceId: "b", result: "SUPPORT", fresh: true, independent: true }]],
        expectation: { kind: "RETURN", value: "SUPPORTED" } },
      { caseId: "CONFLICT", args: [[
        { sourceId: "a", result: "SUPPORT", fresh: true, independent: true },
        { sourceId: "b", result: "REFUTE", fresh: true, independent: true }]],
        expectation: { kind: "RETURN", value: "CONFLICTED" } },
      { caseId: "REFUTED", args: [[
        { sourceId: "a", result: "REFUTE", fresh: true, independent: true },
        { sourceId: "b", result: "REFUTE", fresh: true, independent: true }]],
        expectation: { kind: "RETURN", value: "REFUTED" } },
      { caseId: "STALE_DEPENDENT", args: [[
        { sourceId: "a", result: "SUPPORT", fresh: true, independent: true },
        { sourceId: "b", result: "SUPPORT", fresh: false, independent: true },
        { sourceId: "c", result: "SUPPORT", fresh: true, independent: false }]],
        expectation: { kind: "RETURN", value: "INSUFFICIENT_EVIDENCE" } },
    ]), qualityPolicy: policy("EVIDENCE", ["src/classify-claim.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION",
        path: "src/classify-claim.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-TRANSFER-D-BUILD-ORDER", taskClass: "ARCHITECTURE_SENSITIVE", provenance,
    objective: "Repair orderBuilds(targets) to return target IDs in dependency-safe order. Each target has id, dependencies (array of IDs), and priority. At each step choose the ready target with highest priority, breaking ties by original input order. Return null for duplicate IDs, missing dependencies, or cycles. Do not mutate targets or any dependency array; preserve the named ESM export.",
    initialDefect: "The implementation sorts by priority while ignoring dependency edges and mutating the input.",
    correctFiles: Object.freeze({ "src/order-builds.mjs": `export function orderBuilds(targets) {
  const byId = new Map(targets.map((target) => [target.id, target]));
  if (byId.size !== targets.length || targets.some((target) =>
    target.dependencies.some((dependency) => !byId.has(dependency)))) return null;
  const remaining = new Set(targets.map((target) => target.id));
  const done = new Set();
  const ordered = [];
  while (remaining.size > 0) {
    let choice = null;
    for (const target of targets) {
      if (!remaining.has(target.id) || !target.dependencies.every((dependency) => done.has(dependency))) continue;
      if (choice === null || target.priority > choice.priority) choice = target;
    }
    if (choice === null) return null;
    ordered.push(choice.id);
    remaining.delete(choice.id);
    done.add(choice.id);
  }
  return ordered;
}
` }),
    faultyFiles: Object.freeze({ "src/order-builds.mjs": `export function orderBuilds(targets) {
  return targets.sort((a, b) => b.priority - a.priority).map((target) => target.id);
}
` }),
    mutationPaths: Object.freeze(["src/order-builds.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/order-builds.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { orderBuilds } from "../src/order-builds.mjs";
const targets=[{id:"app",dependencies:["core"],priority:9},{id:"core",dependencies:[],priority:1}];
if(JSON.stringify(orderBuilds(targets))!==JSON.stringify(["core","app"])||targets[0].id!=="app")process.exit(2);
console.log("VISIBLE_PASS build-order");
`, candidateModule: "src/order-builds.mjs", exportName: "orderBuilds",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "READY_PRIORITY", args: [[
        { id: "low", dependencies: [], priority: 1 }, { id: "high", dependencies: [], priority: 9 }]],
        expectation: { kind: "RETURN", value: ["high", "low"] } },
      { caseId: "STABLE_TIE", args: [[
        { id: "a", dependencies: [], priority: 3 }, { id: "b", dependencies: [], priority: 3 }]],
        expectation: { kind: "RETURN", value: ["a", "b"] } },
      { caseId: "CYCLE", args: [[
        { id: "a", dependencies: ["b"], priority: 1 }, { id: "b", dependencies: ["a"], priority: 1 }]],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "MISSING", args: [[{ id: "a", dependencies: ["missing"], priority: 1 }]],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "DUPLICATE", args: [[
        { id: "a", dependencies: [], priority: 1 }, { id: "a", dependencies: [], priority: 2 }]],
        expectation: { kind: "RETURN", value: null } },
    ]), qualityPolicy: Object.freeze({ ...policy("BUILD-ORDER", ["src/order-builds.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION",
        path: "src/order-builds.mjs" },
    ]), maxAddedDeclarations: 8 }), maxChanges: 1, maxPatchBytes: 7_168,
  }),
]);
