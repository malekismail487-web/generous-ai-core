import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";
import { NYX_TRANSFER_EPOCH_FROZEN_CORE } from "./nyx-transfer-epoch-fixtures";

/** Fresh problems are scored once, after the transport/feedback configuration is frozen. */
export const NYX_TRANSFER_FOLLOWUP = Object.freeze({
  chunkId: "NYX-CODING-TRANSFER-FOLLOWUP-001",
  version: "nyx-transfer-followup/1",
  arms: Object.freeze(["MINIMAL_REFERENCE", "CURRENT", "REASONING_ENABLED"] as const),
  domainScope: Object.freeze(["INTERVAL_ALGORITHMS", "SCIENTIFIC_CALIBRATION",
    "TEMPORAL_EVIDENCE_POLICY", "REPOSITORY_IMPACT_GRAPH"] as const),
  modelCallsPerTask: 3,
  candidateIterationsPerTask: 3,
  cognitionCorrectionsPerTask: 2,
  outputTokensPerCall: 3_072,
  wallClockMsPerTask: 240_000,
  sourceRepresentation: "LINES" as const,
  intentCompilationMode: "SAFE_CANONICALIZATION" as const,
  repairFeedbackPolicy: "TRANSIENT_REJECTED_SOURCE_WINDOW" as const,
  authority: "DISPOSABLE_REPOSITORY_ONLY" as const,
  broadGeneralizationCertified: false,
});

// The previous matched epoch stays immutable. The scored model/executor/oracle
// core is unchanged; this follow-up varies only task population and shared
// transport budget/feedback configuration.
export const NYX_TRANSFER_FOLLOWUP_FROZEN_CORE = NYX_TRANSFER_EPOCH_FROZEN_CORE;
const provenance = "NYX_TRANSFER_FOLLOWUP_FRESH_2026_09_27" as const;

function policy(id: string, path: string, invariants: EngineeringQualityPolicy["invariants"] = []):
  EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-TRANSFER-FOLLOWUP-${id}`,
    allowedChangedPaths: Object.freeze([path]), readonlyPaths: Object.freeze([]),
    maxChangedFiles: 1, maxChangedLines: 80, maxCandidateBytes: 10_240,
    maxCyclomaticComplexity: 20, maxComplexityDelta: 16, maxNestingDepth: 5,
    maxAddedDeclarations: 10, invariants: Object.freeze([...invariants]) });
}
function noMutation(path: string): EngineeringQualityPolicy["invariants"] {
  return [{ invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT",
    kind: "NO_PARAMETER_MUTATION", path }];
}

export const NYX_TRANSFER_FOLLOWUP_TASKS: readonly NyxQualityV5Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-FOLLOWUP-A-INTERVALS", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair coalesceIntervals(intervals). Each interval is a half-open range {start,end} of safe integers with start < end. Return a new ascending array of disjoint ranges, merging both overlaps and touching boundaries. An empty input returns []. Throw RangeError for malformed intervals, non-safe-integer boundaries, or start >= end. Do not mutate the input or its interval objects; preserve the named ESM export.",
    initialDefect: "The implementation sorts the input in place and fails to merge touching and overlapping ranges.",
    correctFiles: Object.freeze({ "src/coalesce-intervals.mjs": `export function coalesceIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new RangeError("invalid intervals");
  const ordered = intervals.map((range) => {
    if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start >= range.end) throw new RangeError("invalid interval");
    return { start: range.start, end: range.end };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of ordered) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}
` }),
    faultyFiles: Object.freeze({ "src/coalesce-intervals.mjs": `export function coalesceIntervals(intervals) {
  return intervals.sort((a, b) => a.start - b.start);
}
` }),
    mutationPaths: Object.freeze(["src/coalesce-intervals.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/coalesce-intervals.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { coalesceIntervals } from "../src/coalesce-intervals.mjs";
const input=[{start:5,end:8},{start:1,end:3},{start:3,end:6}];
const before=JSON.stringify(input);
const result=coalesceIntervals(input);
if(JSON.stringify(result)!==JSON.stringify([{start:1,end:8}])||JSON.stringify(input)!==before)process.exit(2);
console.log("VISIBLE_PASS intervals");
`,
    candidateModule: "src/coalesce-intervals.mjs", exportName: "coalesceIntervals",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "NESTED", args: [[{ start: 1, end: 9 }, { start: 2, end: 3 }]],
        expectation: { kind: "RETURN", value: [{ start: 1, end: 9 }] } },
      { caseId: "DISJOINT", args: [[{ start: 4, end: 6 }, { start: -2, end: 0 }]],
        expectation: { kind: "RETURN", value: [{ start: -2, end: 0 }, { start: 4, end: 6 }] } },
      { caseId: "INVALID", args: [[{ start: 2, end: 2 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "UNSAFE", args: [[{ start: 0, end: 9007199254740992 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("INTERVALS", "src/coalesce-intervals.mjs",
      noMutation("src/coalesce-intervals.mjs")), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-FOLLOWUP-B-CALIBRATION", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair fitCalibration(samples). Each sample has finite numeric measured and reference fields. Fit reference = slope * measured + intercept by ordinary unweighted least squares. Return {slope,intercept}, each rounded to six decimals. Throw RangeError for fewer than two samples, non-finite values, zero measured variance, or a non-finite result. Do not mutate samples; preserve the named ESM export.",
    initialDefect: "The implementation derives a slope from only the first pair and assumes intercept zero.",
    correctFiles: Object.freeze({ "src/fit-calibration.mjs": `export function fitCalibration(samples) {
  if (!Array.isArray(samples) || samples.length < 2) throw new RangeError("invalid samples");
  let sumX = 0, sumY = 0;
  for (const sample of samples) {
    if (!sample || !Number.isFinite(sample.measured) || !Number.isFinite(sample.reference)) {
      throw new RangeError("invalid sample");
    }
    sumX += sample.measured;
    sumY += sample.reference;
  }
  const meanX = sumX / samples.length;
  const meanY = sumY / samples.length;
  let covariance = 0, variance = 0;
  for (const sample of samples) {
    covariance += (sample.measured - meanX) * (sample.reference - meanY);
    variance += (sample.measured - meanX) ** 2;
  }
  const slope = covariance / variance;
  const intercept = meanY - slope * meanX;
  if (variance === 0 || !Number.isFinite(slope) || !Number.isFinite(intercept)) {
    throw new RangeError("invalid fit");
  }
  return { slope: Number(slope.toFixed(6)), intercept: Number(intercept.toFixed(6)) };
}
` }),
    faultyFiles: Object.freeze({ "src/fit-calibration.mjs": `export function fitCalibration(samples) {
  return { slope: samples[0].reference / samples[0].measured, intercept: 0 };
}
` }),
    mutationPaths: Object.freeze(["src/fit-calibration.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/fit-calibration.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { fitCalibration } from "../src/fit-calibration.mjs";
const samples=[{measured:0,reference:1},{measured:1,reference:3},{measured:2,reference:5}];
const before=JSON.stringify(samples);
if(JSON.stringify(fitCalibration(samples))!==JSON.stringify({slope:2,intercept:1})||JSON.stringify(samples)!==before)process.exit(2);
console.log("VISIBLE_PASS calibration");
`,
    candidateModule: "src/fit-calibration.mjs", exportName: "fitCalibration",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "NEGATIVE_SLOPE", args: [[{ measured: 1, reference: 5 }, { measured: 2, reference: 3 },
        { measured: 3, reference: 1 }]], expectation: { kind: "RETURN", value: { slope: -2, intercept: 7 } } },
      { caseId: "NOISY", args: [[{ measured: 0, reference: 0 }, { measured: 1, reference: 2 },
        { measured: 2, reference: 2 }]],
        expectation: { kind: "RETURN", value: { slope: 1, intercept: 0.333333 } } },
      { caseId: "DEGENERATE", args: [[{ measured: 2, reference: 1 }, { measured: 2, reference: 3 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "NONFINITE", args: [[{ measured: 1, reference: "Infinity" }, { measured: 2, reference: 3 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "TOO_FEW", args: [[{ measured: 1, reference: 2 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("CALIBRATION", "src/fit-calibration.mjs",
      noMutation("src/fit-calibration.mjs")), maxChanges: 1, maxPatchBytes: 7_168,
  }),
  Object.freeze({
    taskId: "NYX-FOLLOWUP-C-ENTITLEMENT", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair resolveEntitlement(events, now). An event has sourceId, action ALLOW or DENY, issuedAt and expiresAt. Count only events active at now (issuedAt <= now < expiresAt). For each sourceId, only its latest active event counts; ties in issuedAt use the later input event. If any counted event is DENY return DENIED; otherwise at least two distinct counted ALLOW sources return ALLOWED; otherwise return INSUFFICIENT_EVIDENCE. Ignore unknown actions. Do not mutate events; preserve the named ESM export.",
    initialDefect: "The implementation counts all ALLOW entries, including expired duplicates, and ignores DENY precedence.",
    correctFiles: Object.freeze({ "src/resolve-entitlement.mjs": `export function resolveEntitlement(events, now) {
  const latest = new Map();
  for (const event of events) {
    if (!(event.issuedAt <= now && now < event.expiresAt)) continue;
    if (event.action !== "ALLOW" && event.action !== "DENY") continue;
    const previous = latest.get(event.sourceId);
    if (!previous || event.issuedAt >= previous.issuedAt) latest.set(event.sourceId, event);
  }
  const counted = [...latest.values()];
  if (counted.some((event) => event.action === "DENY")) return "DENIED";
  return counted.filter((event) => event.action === "ALLOW").length >= 2
    ? "ALLOWED" : "INSUFFICIENT_EVIDENCE";
}
` }),
    faultyFiles: Object.freeze({ "src/resolve-entitlement.mjs": `export function resolveEntitlement(events, now) {
  return events.filter((event) => event.action === "ALLOW").length >= 2
    ? "ALLOWED" : "INSUFFICIENT_EVIDENCE";
}
` }),
    mutationPaths: Object.freeze(["src/resolve-entitlement.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/resolve-entitlement.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { resolveEntitlement } from "../src/resolve-entitlement.mjs";
const events=[{sourceId:"a",action:"ALLOW",issuedAt:1,expiresAt:9},
  {sourceId:"a",action:"ALLOW",issuedAt:2,expiresAt:9},
  {sourceId:"b",action:"DENY",issuedAt:1,expiresAt:9}];
if(resolveEntitlement(events,5)!=="DENIED"||resolveEntitlement(events.slice(0,2),5)!=="INSUFFICIENT_EVIDENCE")process.exit(2);
console.log("VISIBLE_PASS entitlement");
`,
    candidateModule: "src/resolve-entitlement.mjs", exportName: "resolveEntitlement",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "TWO_SOURCES", args: [[
        { sourceId: "a", action: "ALLOW", issuedAt: 1, expiresAt: 8 },
        { sourceId: "b", action: "ALLOW", issuedAt: 1, expiresAt: 8 }], 5],
        expectation: { kind: "RETURN", value: "ALLOWED" } },
      { caseId: "LATEST_OVERRIDES", args: [[
        { sourceId: "a", action: "DENY", issuedAt: 1, expiresAt: 8 },
        { sourceId: "a", action: "ALLOW", issuedAt: 3, expiresAt: 8 },
        { sourceId: "b", action: "ALLOW", issuedAt: 2, expiresAt: 8 }], 5],
        expectation: { kind: "RETURN", value: "ALLOWED" } },
      { caseId: "EXPIRY_BOUNDARY", args: [[
        { sourceId: "a", action: "DENY", issuedAt: 1, expiresAt: 5 },
        { sourceId: "b", action: "ALLOW", issuedAt: 1, expiresAt: 9 }], 5],
        expectation: { kind: "RETURN", value: "INSUFFICIENT_EVIDENCE" } },
      { caseId: "TIE_LATER_INPUT", args: [[
        { sourceId: "a", action: "ALLOW", issuedAt: 1, expiresAt: 9 },
        { sourceId: "a", action: "DENY", issuedAt: 1, expiresAt: 9 }], 5],
        expectation: { kind: "RETURN", value: "DENIED" } },
      { caseId: "FUTURE_UNKNOWN", args: [[
        { sourceId: "a", action: "ALLOW", issuedAt: 7, expiresAt: 9 },
        { sourceId: "b", action: "UNKNOWN", issuedAt: 1, expiresAt: 9 }], 5],
        expectation: { kind: "RETURN", value: "INSUFFICIENT_EVIDENCE" } },
    ]), qualityPolicy: policy("ENTITLEMENT", "src/resolve-entitlement.mjs",
      noMutation("src/resolve-entitlement.mjs")), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-FOLLOWUP-D-IMPACT", taskClass: "ARCHITECTURE_SENSITIVE", provenance,
    objective: "Repair impactedModules(modules, changed). Each module has id and dependencies (IDs it imports). Return all changed modules plus every module transitively dependent on them, ordered by original modules input order. Return null for duplicate module IDs, missing dependency IDs, or a changed ID not in modules. Dependency cycles are legal and must terminate. Do not mutate modules, dependencies, or changed; preserve the named ESM export.",
    initialDefect: "The implementation only returns direct dependents, misses transitive impact, and ignores invalid references.",
    correctFiles: Object.freeze({ "src/impacted-modules.mjs": `export function impactedModules(modules, changed) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  if (byId.size !== modules.length || modules.some((module) =>
    module.dependencies.some((id) => !byId.has(id))) || changed.some((id) => !byId.has(id))) return null;
  const impacted = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const module of modules) {
      if (!impacted.has(module.id) && module.dependencies.some((id) => impacted.has(id))) {
        impacted.add(module.id);
        grew = true;
      }
    }
  }
  return modules.filter((module) => impacted.has(module.id)).map((module) => module.id);
}
` }),
    faultyFiles: Object.freeze({ "src/impacted-modules.mjs": `export function impactedModules(modules, changed) {
  return modules.filter((module) => module.dependencies.some((id) => changed.includes(id)))
    .map((module) => module.id);
}
` }),
    mutationPaths: Object.freeze(["src/impacted-modules.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/impacted-modules.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { impactedModules } from "../src/impacted-modules.mjs";
const modules=[{id:"app",dependencies:["ui"]},{id:"core",dependencies:[]},
  {id:"ui",dependencies:["core"]},{id:"docs",dependencies:[]}];
if(JSON.stringify(impactedModules(modules,["core"]))!==JSON.stringify(["app","core","ui"]))process.exit(2);
console.log("VISIBLE_PASS impact");
`,
    candidateModule: "src/impacted-modules.mjs", exportName: "impactedModules",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "UNRELATED", args: [[
        { id: "a", dependencies: [] }, { id: "b", dependencies: [] }], ["a"]],
        expectation: { kind: "RETURN", value: ["a"] } },
      { caseId: "CYCLE", args: [[
        { id: "a", dependencies: ["b"] }, { id: "b", dependencies: ["a"] }], ["b"]],
        expectation: { kind: "RETURN", value: ["a", "b"] } },
      { caseId: "MISSING", args: [[{ id: "a", dependencies: ["missing"] }], ["a"]],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "DUPLICATE", args: [[
        { id: "a", dependencies: [] }, { id: "a", dependencies: [] }], ["a"]],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "UNKNOWN_CHANGED", args: [[{ id: "a", dependencies: [] }], ["missing"]],
        expectation: { kind: "RETURN", value: null } },
    ]), qualityPolicy: policy("IMPACT", "src/impacted-modules.mjs",
      noMutation("src/impacted-modules.mjs")), maxChanges: 1, maxPatchBytes: 6_144,
  }),
]);
