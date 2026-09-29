import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";

/** Frozen, previously unscored tasks. A pass here is a narrow live capability result, not broad certification. */
export const NYX_ADMISSION_GUIDANCE = Object.freeze({
  chunkId: "NYX-ADMISSION-GUIDANCE-TRANSFER-001", version: "nyx-admission-guidance/1",
  arms: Object.freeze(["CURRENT", "REASONING_ENABLED"] as const),
  domainScope: Object.freeze(["INTERVAL_NORMALIZATION", "IDEMPOTENT_STATE_MACHINE", "VERSIONED_RECONCILIATION"] as const),
  modelCallsPerTask: 3, candidateIterationsPerTask: 3, cognitionCorrectionsPerTask: 2,
  outputTokensPerCall: 3_072, wallClockMsPerTask: 240_000,
  sourceRepresentation: "TEXT" as const, intentCompilationMode: "SAFE_CANONICALIZATION" as const,
  repairFeedbackPolicy: "TRANSIENT_REJECTED_SOURCE_WINDOW" as const,
  authority: "DISPOSABLE_REPOSITORY_ONLY" as const, broadGeneralizationCertified: false,
});

export const NYX_ADMISSION_GUIDANCE_FROZEN_CORE = Object.freeze({
  commit: "e8e36824f96749bf10b0036b6f98afa3901e0166",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "b4254ef147ca1855a3ce969323411a6953f76eac37b89e0a775eec3ab7f6e6c8",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "230961d9afa4150627f6bfb0e5adc2c0d775690d78298066888853454ba9d232",
    "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts": "4f0dbb3d393d6e5c581e029aadd9a5c86372be6c4257b00cdb2e66ee61b167ff",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "3d6b24f088093b049b65284cce906adc74203d9d4a62f25fd8fc458410d55c0a",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "3bbe10e7dc64a1d28fd4eb608649c7f0251f1a017469c13551999dbd37dd13ca",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

const provenance = "NYX_ADMISSION_GUIDANCE_FRESH_2026_09_29" as const;
function policy(id: string, path: string): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-ADMISSION-GUIDANCE-${id}`,
    allowedChangedPaths: Object.freeze([path]), readonlyPaths: Object.freeze([]),
    maxChangedFiles: 1, maxChangedLines: 100, maxCandidateBytes: 10_240,
    maxCyclomaticComplexity: 20, maxComplexityDelta: 16, maxNestingDepth: 5,
    maxAddedDeclarations: 10, invariants: Object.freeze([{ invariantId: "NO_INPUT_MUTATION",
      dimension: "ARCHITECTURAL_FIT" as const, kind: "NO_PARAMETER_MUTATION" as const, path }]) });
}

export const NYX_ADMISSION_GUIDANCE_TASKS: readonly NyxQualityV5Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-GUIDANCE-A-WINDOWS", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair mergeWindows(windows). Every entry must be a two-element array of safe integers [start,end] with start<=end; otherwise throw RangeError. Return new [start,end] arrays sorted by start then end, merging overlapping or integer-adjacent inclusive windows. An empty input returns []. Do not mutate the input or its inner arrays; preserve the named ESM export.",
    initialDefect: "The implementation sorts the input in place and never merges overlaps or adjacency.",
    correctFiles: Object.freeze({ "src/merge-windows.mjs": `export function mergeWindows(windows) {
  if (!Array.isArray(windows)) throw new RangeError("invalid windows");
  const sorted = windows.map((window) => {
    if (!Array.isArray(window) || window.length !== 2
      || !Number.isSafeInteger(window[0]) || !Number.isSafeInteger(window[1])
      || window[0] > window[1]) throw new RangeError("invalid window");
    return [...window];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && (window[0] <= last[1] || window[0] === last[1] + 1)) {
      last[1] = Math.max(last[1], window[1]);
    } else merged.push(window);
  }
  return merged;
}
` }),
    faultyFiles: Object.freeze({ "src/merge-windows.mjs": `export function mergeWindows(windows) {
  return windows.sort((a, b) => a[0] - b[0]);
}
` }),
    mutationPaths: Object.freeze(["src/merge-windows.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/merge-windows.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { mergeWindows } from "../src/merge-windows.mjs";
const input=[[5,7],[1,2],[3,4]];
const before=JSON.stringify(input);
if(JSON.stringify(mergeWindows(input))!==JSON.stringify([[1,7]])||JSON.stringify(input)!==before)process.exit(2);
console.log("VISIBLE_PASS windows");
`,
    candidateModule: "src/merge-windows.mjs", exportName: "mergeWindows",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "OVERLAP", args: [[[6, 9], [1, 7]]], expectation: { kind: "RETURN", value: [[1, 9]] } },
      { caseId: "DISJOINT", args: [[[8, 9], [1, 2]]], expectation: { kind: "RETURN", value: [[1, 2], [8, 9]] } },
      { caseId: "NEGATIVE_ADJACENT", args: [[[-3, -2], [-1, 0]]],
        expectation: { kind: "RETURN", value: [[-3, 0]] } },
      { caseId: "INVALID_ORDER", args: [[[3, 2]]], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "INVALID_NUMBER", args: [[[1, 1.5]]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("WINDOWS", "src/merge-windows.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-GUIDANCE-B-LEASES", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair replayLeases(events). Input is an array of events with nonempty string id, nonempty string resource, and kind 'ACQUIRE' or 'RELEASE'. Validate every event, including later duplicates; malformed input throws RangeError. Process only the first occurrence of each id, in input order. ACQUIRE of an already held resource and RELEASE of an unheld resource throw RangeError. Return a new lexicographically sorted array of held resource names. Do not mutate events; preserve the named ESM export.",
    initialDefect: "The implementation toggles state and counts duplicate event ids.",
    correctFiles: Object.freeze({ "src/replay-leases.mjs": `export function replayLeases(events) {
  if (!Array.isArray(events)) throw new RangeError("invalid events");
  const seen = new Set();
  const held = new Set();
  for (const event of events) {
    if (!event || typeof event.id !== "string" || !event.id
      || typeof event.resource !== "string" || !event.resource
      || !["ACQUIRE", "RELEASE"].includes(event.kind)) throw new RangeError("invalid event");
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (event.kind === "ACQUIRE") {
      if (held.has(event.resource)) throw new RangeError("already held");
      held.add(event.resource);
    } else {
      if (!held.has(event.resource)) throw new RangeError("not held");
      held.delete(event.resource);
    }
  }
  return [...held].sort();
}
` }),
    faultyFiles: Object.freeze({ "src/replay-leases.mjs": `export function replayLeases(events) {
  const held = new Set();
  for (const event of events) {
    if (held.has(event.resource)) held.delete(event.resource);
    else held.add(event.resource);
  }
  return [...held];
}
` }),
    mutationPaths: Object.freeze(["src/replay-leases.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/replay-leases.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { replayLeases } from "../src/replay-leases.mjs";
const events=[{id:"1",resource:"b",kind:"ACQUIRE"},{id:"1",resource:"b",kind:"ACQUIRE"},{id:"2",resource:"a",kind:"ACQUIRE"}];
const before=JSON.stringify(events);
if(JSON.stringify(replayLeases(events))!==JSON.stringify(["a","b"])||JSON.stringify(events)!==before)process.exit(2);
console.log("VISIBLE_PASS leases");
`,
    candidateModule: "src/replay-leases.mjs", exportName: "replayLeases",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "RELEASE", args: [[{ id: "1", resource: "a", kind: "ACQUIRE" },
        { id: "2", resource: "a", kind: "RELEASE" }]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "DUPLICATE_ID", args: [[{ id: "1", resource: "a", kind: "ACQUIRE" },
        { id: "1", resource: "b", kind: "ACQUIRE" }]], expectation: { kind: "RETURN", value: ["a"] } },
      { caseId: "DOUBLE_ACQUIRE", args: [[{ id: "1", resource: "a", kind: "ACQUIRE" },
        { id: "2", resource: "a", kind: "ACQUIRE" }]], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "UNHELD_RELEASE", args: [[{ id: "1", resource: "a", kind: "RELEASE" }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "MALFORMED_DUPLICATE", args: [[{ id: "1", resource: "a", kind: "ACQUIRE" },
        { id: "1", resource: "", kind: "ACQUIRE" }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("LEASES", "src/replay-leases.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-GUIDANCE-C-VERSIONS", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair latestRecords(records). Each record has a nonempty string key, a nonnegative safe-integer version, and a string value. Throw RangeError for malformed records. For each key choose the highest version; if the currently highest version appears twice with different values, throw RangeError. Exact duplicates are allowed. Return an ordinary object with keys inserted in lexicographic order and values equal to the selected strings. Do not mutate records; preserve the named ESM export.",
    initialDefect: "The implementation blindly takes the last record and misses version and conflict semantics.",
    correctFiles: Object.freeze({ "src/latest-records.mjs": `export function latestRecords(records) {
  if (!Array.isArray(records)) throw new RangeError("invalid records");
  const selected = new Map();
  for (const record of records) {
    if (!record || typeof record.key !== "string" || !record.key
      || !Number.isSafeInteger(record.version) || record.version < 0
      || typeof record.value !== "string") throw new RangeError("invalid record");
    const previous = selected.get(record.key);
    if (!previous || record.version > previous.version) selected.set(record.key, record);
    else if (record.version === previous.version && record.value !== previous.value) {
      throw new RangeError("conflicting record");
    }
  }
  return Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, record]) => [key, record.value]));
}
` }),
    faultyFiles: Object.freeze({ "src/latest-records.mjs": `export function latestRecords(records) {
  const result = {};
  for (const record of records) result[record.key] = record.value;
  return result;
}
` }),
    mutationPaths: Object.freeze(["src/latest-records.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/latest-records.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { latestRecords } from "../src/latest-records.mjs";
const records=[{key:"z",version:2,value:"new"},{key:"z",version:1,value:"old"},{key:"a",version:0,value:"first"}];
const before=JSON.stringify(records);
if(JSON.stringify(latestRecords(records))!==JSON.stringify({a:"first",z:"new"})||JSON.stringify(records)!==before)process.exit(2);
console.log("VISIBLE_PASS versions");
`,
    candidateModule: "src/latest-records.mjs", exportName: "latestRecords",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: {} } },
      { caseId: "HIGHEST", args: [[{ key: "a", version: 3, value: "high" },
        { key: "a", version: 1, value: "low" }]], expectation: { kind: "RETURN", value: { a: "high" } } },
      { caseId: "EQUAL_IDENTICAL", args: [[{ key: "a", version: 1, value: "x" },
        { key: "a", version: 1, value: "x" }]], expectation: { kind: "RETURN", value: { a: "x" } } },
      { caseId: "CONFLICT", args: [[{ key: "a", version: 1, value: "x" },
        { key: "a", version: 1, value: "y" }]], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "INVALID_VERSION", args: [[{ key: "a", version: -1, value: "x" }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "SORTED", args: [[{ key: "z", version: 0, value: "z" },
        { key: "a", version: 0, value: "a" }]], expectation: { kind: "RETURN", value: { a: "a", z: "z" } } },
    ]), qualityPolicy: policy("VERSIONS", "src/latest-records.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
]);
