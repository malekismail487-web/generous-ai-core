import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityAvailableEvidence, NyxQualityHoldoutTaskClass } from "./nyx-quality-holdout-fixtures";

export type NyxQualityV4TaskClass = NyxQualityHoldoutTaskClass | "ARCHITECTURE_SENSITIVE";

export interface NyxQualityV4Task {
  readonly taskId: string;
  readonly taskClass: NyxQualityV4TaskClass;
  readonly provenance: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V4";
  readonly objective: string;
  readonly initialDefect: string;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly mutationPaths: readonly string[];
  readonly initiallyAdmittedPaths: readonly string[];
  readonly availableEvidence: readonly NyxQualityAvailableEvidence[];
  readonly visibleVerifier: string;
  readonly candidateModule: string;
  readonly exportName: string;
  readonly hiddenCases: readonly HiddenEvaluationCase[];
  readonly qualityPolicy: EngineeringQualityPolicy;
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
}

export const NYX_V4_FROZEN_CORE = Object.freeze({
  commit: "3f59dc273748eee31a7928528283ab4e13258542",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "4a2f039439f0892a60d6f17e441b7efe1294ee17910601dcc2c97bc68faa8a12",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "183fd389ab4d3698d9da438aae0322c50825ff83187144fa443fd4a8cb580ea1",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "b964198d33050f96ab1aacabed7c7fdf2e08370953fccdd77d54f6688d361aa9",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "1fb618d25616c51757e664f5e4ca6e8390de4ec2bd8da4789c2c30d0050a6ffa",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "58bb102e49e66c554a4dbd4513a8fa41652791a4021c0771d898c57dccf42e0d",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

const provenance = "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V4" as const;

function policy(
  id: string,
  paths: readonly string[],
  readonlyPaths: readonly string[] = [],
  invariants: EngineeringQualityPolicy["invariants"] = [],
): EngineeringQualityPolicy {
  return Object.freeze({
    policyId: `NYX-V4-QUALITY-${id}`,
    allowedChangedPaths: Object.freeze([...paths]),
    readonlyPaths: Object.freeze([...readonlyPaths]),
    maxChangedFiles: paths.length,
    maxChangedLines: 42,
    maxCandidateBytes: 8_192,
    maxCyclomaticComplexity: 11,
    maxComplexityDelta: 6,
    maxNestingDepth: 4,
    maxAddedDeclarations: 4,
    invariants: Object.freeze([...invariants]),
  });
}

export const NYX_ENGINEERING_QUALITY_V4: readonly NyxQualityV4Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-QV4-A-COALESCE-INTERVALS",
    taskClass: "LOGIC_EDGE_CASE",
    provenance,
    objective: "Repair coalesceIntervals(intervals) for finite half-open numeric intervals [start,end] with start <= end. Return a new sorted array that merges overlapping or touching intervals, preserve zero-length intervals when isolated, throw RangeError for an invalid interval, preserve the named ESM export, and never mutate the input or its nested pairs.",
    initialDefect: "The implementation assumes input order, mutates the caller array, and fails to merge touching intervals.",
    correctFiles: Object.freeze({
      "src/coalesce-intervals.mjs": `export function coalesceIntervals(intervals) {
  const sorted = intervals.map((interval) => {
    if (!Array.isArray(interval) || interval.length !== 2
      || !Number.isFinite(interval[0]) || !Number.isFinite(interval[1]) || interval[0] > interval[1]) {
      throw new RangeError("invalid interval");
    }
    return [...interval];
  });
  sorted.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const result = [];
  for (const interval of sorted) {
    const previous = result[result.length - 1];
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else result.push(interval);
  }
  return result;
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/coalesce-intervals.mjs": `export function coalesceIntervals(intervals) {
  intervals.sort((left, right) => left[0] - right[0]);
  return intervals;
}
`,
    }),
    mutationPaths: Object.freeze(["src/coalesce-intervals.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/coalesce-intervals.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { coalesceIntervals } from "../src/coalesce-intervals.mjs";
const input=[[5,8],[1,3],[3,4]];const result=coalesceIntervals(input);
if(JSON.stringify(result)!==JSON.stringify([[1,4],[5,8]])||input[0][0]!==5)process.exit(2);
console.log("VISIBLE_PASS intervals");
`,
    candidateModule: "src/coalesce-intervals.mjs",
    exportName: "coalesceIntervals",
    hiddenCases: Object.freeze([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "NESTED", args: [[[8, 10], [2, 5], [4, 9]]], expectation: { kind: "RETURN", value: [[2, 10]] } },
      { caseId: "POINT", args: [[[2, 2], [4, 5]]], expectation: { kind: "RETURN", value: [[2, 2], [4, 5]] } },
      { caseId: "INVALID", args: [[[4, 2]]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: Object.freeze({ ...policy("INTERVALS", ["src/coalesce-intervals.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/coalesce-intervals.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/coalesce-intervals.mjs" },
    ]), maxComplexityDelta: 10 }),
    maxChanges: 1,
    maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-QV4-B-LEASE-TRANSITION",
    taskClass: "STATE_CONTROL_FLOW",
    provenance,
    objective: "Repair leaseTransition(state,event) to return exactly {state,result}. FREE+ACQUIRE becomes {state:'HELD',result:'ACQUIRED'}, HELD+RELEASE becomes {state:'FREE',result:'RELEASED'}, EXPIRED+RESET becomes {state:'FREE',result:'RESET'}, and every unsupported pair preserves state with result 'IGNORED'. Preserve the named ESM export and deterministic behavior.",
    initialDefect: "RELEASE frees every state and unsupported events return a bare string rather than the result contract.",
    correctFiles: Object.freeze({
      "src/lease-transition.mjs": `export function leaseTransition(state, event) {
  if (state === "FREE" && event === "ACQUIRE") return { state: "HELD", result: "ACQUIRED" };
  if (state === "HELD" && event === "RELEASE") return { state: "FREE", result: "RELEASED" };
  if (state === "EXPIRED" && event === "RESET") return { state: "FREE", result: "RESET" };
  return { state, result: "IGNORED" };
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/lease-transition.mjs": `export function leaseTransition(state, event) {
  if (state === "FREE" && event === "ACQUIRE") return { state: "HELD", result: "ACQUIRED" };
  if (event === "RELEASE") return { state: "FREE", result: "RELEASED" };
  return state;
}
`,
    }),
    mutationPaths: Object.freeze(["src/lease-transition.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/lease-transition.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { leaseTransition } from "../src/lease-transition.mjs";
if(JSON.stringify(leaseTransition("EXPIRED","RELEASE"))!==JSON.stringify({state:"EXPIRED",result:"IGNORED"}))process.exit(2);
console.log("VISIBLE_PASS lease");
`,
    candidateModule: "src/lease-transition.mjs",
    exportName: "leaseTransition",
    hiddenCases: Object.freeze([
      { caseId: "ACQUIRE", args: ["FREE", "ACQUIRE"], expectation: { kind: "RETURN", value: { state: "HELD", result: "ACQUIRED" } } },
      { caseId: "RELEASE", args: ["HELD", "RELEASE"], expectation: { kind: "RETURN", value: { state: "FREE", result: "RELEASED" } } },
      { caseId: "RESET", args: ["EXPIRED", "RESET"], expectation: { kind: "RETURN", value: { state: "FREE", result: "RESET" } } },
      { caseId: "IGNORED", args: ["HELD", "RESET"], expectation: { kind: "RETURN", value: { state: "HELD", result: "IGNORED" } } },
    ]),
    qualityPolicy: policy("LEASE", ["src/lease-transition.mjs"], [], [
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/lease-transition.mjs" },
    ]),
    maxChanges: 1,
    maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV4-C-DECODE-HEADER",
    taskClass: "API_TYPE_CONTRACT",
    provenance,
    objective: "Repair decodeHeader(input) to return exactly {ok:true,name,value} for strings containing one non-empty trimmed name and value separated by the first colon. Return exactly {ok:false,error:'INVALID_HEADER'} otherwise. Preserve later colons in the value, preserve the named ESM export, and do not throw for non-string input.",
    initialDefect: "The decoder splits every colon, accepts empty fields, and returns an array rather than the tagged result contract.",
    correctFiles: Object.freeze({
      "src/decode-header.mjs": `export function decodeHeader(input) {
  if (typeof input !== "string") return { ok: false, error: "INVALID_HEADER" };
  const separator = input.indexOf(":");
  if (separator < 0) return { ok: false, error: "INVALID_HEADER" };
  const name = input.slice(0, separator).trim();
  const value = input.slice(separator + 1).trim();
  return name && value ? { ok: true, name, value } : { ok: false, error: "INVALID_HEADER" };
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/decode-header.mjs": `export function decodeHeader(input) { return input.split(":").map((part) => part.trim()); }
`,
    }),
    mutationPaths: Object.freeze(["src/decode-header.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/decode-header.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { decodeHeader } from "../src/decode-header.mjs";
if(JSON.stringify(decodeHeader(" trace-id : a:b "))!==JSON.stringify({ok:true,name:"trace-id",value:"a:b"}))process.exit(2);
console.log("VISIBLE_PASS header");
`,
    candidateModule: "src/decode-header.mjs",
    exportName: "decodeHeader",
    hiddenCases: Object.freeze([
      { caseId: "BASIC", args: ["x: 1"], expectation: { kind: "RETURN", value: { ok: true, name: "x", value: "1" } } },
      { caseId: "NO-COLON", args: ["x"], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_HEADER" } } },
      { caseId: "EMPTY-NAME", args: [": value"], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_HEADER" } } },
      { caseId: "NON-STRING", args: [42], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_HEADER" } } },
    ]),
    qualityPolicy: Object.freeze({ ...policy("HEADER", ["src/decode-header.mjs"]), maxComplexityDelta: 8 }),
    maxChanges: 1,
    maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV4-D-RANK-CANDIDATES",
    taskClass: "MULTI_FILE_INTERACTION",
    provenance,
    objective: "Repair rankCandidates(candidates) to return candidate IDs ordered using the repository-owned compareCandidate helper. Preserve stable input order for exact comparator ties, do not mutate candidates, preserve both named ESM exports, and keep ranking policy in the shared comparator rather than duplicating it.",
    initialDefect: "The ranker sorts only by score, mutates its input, and bypasses the repository comparator's risk and ID rules.",
    correctFiles: Object.freeze({
      "src/compare-candidate.mjs": `export function compareCandidate(left, right) {
  return right.score - left.score || left.risk - right.risk || left.id.localeCompare(right.id);
}
`,
      "src/rank-candidates.mjs": `import { compareCandidate } from "./compare-candidate.mjs";
export function rankCandidates(candidates) {
  const ranked = candidates.map((candidate, index) => ({ candidate, index }));
  ranked.sort((left, right) => compareCandidate(left.candidate, right.candidate) || left.index - right.index);
  return ranked.map(({ candidate }) => candidate.id);
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/rank-candidates.mjs": `export function rankCandidates(candidates) {
  return candidates.sort((left, right) => right.score - left.score).map((candidate) => candidate.id);
}
`,
    }),
    mutationPaths: Object.freeze(["src/rank-candidates.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/rank-candidates.mjs", "src/compare-candidate.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { rankCandidates } from "../src/rank-candidates.mjs";
const input=[{id:"b",score:9,risk:3},{id:"a",score:9,risk:1}];
if(JSON.stringify(rankCandidates(input))!==JSON.stringify(["a","b"])||input[0].id!=="b")process.exit(2);
console.log("VISIBLE_PASS ranking");
`,
    candidateModule: "src/rank-candidates.mjs",
    exportName: "rankCandidates",
    hiddenCases: Object.freeze([
      { caseId: "SCORE", args: [[{ id: "a", score: 1, risk: 0 }, { id: "b", score: 2, risk: 9 }]], expectation: { kind: "RETURN", value: ["b", "a"] } },
      { caseId: "RISK", args: [[{ id: "z", score: 5, risk: 2 }, { id: "y", score: 5, risk: 1 }]], expectation: { kind: "RETURN", value: ["y", "z"] } },
      { caseId: "ID", args: [[{ id: "b", score: 5, risk: 1 }, { id: "a", score: 5, risk: 1 }]], expectation: { kind: "RETURN", value: ["a", "b"] } },
    ]),
    qualityPolicy: policy("RANK", ["src/rank-candidates.mjs"], ["src/compare-candidate.mjs"], [
      { invariantId: "CALL_COMPARATOR", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/rank-candidates.mjs", value: "compareCandidate" },
      { invariantId: "IMPORT_COMPARATOR", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/rank-candidates.mjs", value: "./compare-candidate.mjs" },
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/rank-candidates.mjs" },
    ]),
    maxChanges: 1,
    maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-QV4-E-INVENTORY-UPDATE",
    taskClass: "REGRESSION_SENSITIVE",
    provenance,
    objective: "Repair applyInventoryUpdate(snapshot,sku,delta) so an existing item's quantity changes by finite integer delta without going negative, version increments by one, and a completely new root/items/item structure is returned. Throw RangeError for an unknown SKU, invalid delta, or negative result. Preserve the named ESM export and both inputs.",
    initialDefect: "The implementation mutates nested caller state, accepts invalid deltas, and permits negative inventory.",
    correctFiles: Object.freeze({
      "src/inventory-update.mjs": `export function applyInventoryUpdate(snapshot, sku, delta) {
  const current = snapshot.items[sku];
  if (!current || !Number.isInteger(delta) || !Number.isFinite(delta) || current.quantity + delta < 0) {
    throw new RangeError("invalid inventory update");
  }
  return {
    ...snapshot,
    version: snapshot.version + 1,
    items: { ...snapshot.items, [sku]: { ...current, quantity: current.quantity + delta } },
  };
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/inventory-update.mjs": `export function applyInventoryUpdate(snapshot, sku, delta) {
  snapshot.items[sku].quantity += delta;
  snapshot.version += 1;
  return snapshot;
}
`,
    }),
    mutationPaths: Object.freeze(["src/inventory-update.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/inventory-update.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { applyInventoryUpdate } from "../src/inventory-update.mjs";
const state={version:2,items:{A:{quantity:3,label:"a"}}};const result=applyInventoryUpdate(state,"A",-2);
if(result.version!==3||result.items.A.quantity!==1||state.items.A.quantity!==3||result===state)process.exit(2);
console.log("VISIBLE_PASS inventory");
`,
    candidateModule: "src/inventory-update.mjs",
    exportName: "applyInventoryUpdate",
    hiddenCases: Object.freeze([
      { caseId: "ZERO", args: [{ version: 1, items: { A: { quantity: 2 } } }, "A", 0], expectation: { kind: "RETURN", value: { version: 2, items: { A: { quantity: 2 } } }, argsAfter: [{ version: 1, items: { A: { quantity: 2 } } }, "A", 0] } },
      { caseId: "NEGATIVE", args: [{ version: 1, items: { A: { quantity: 2 } } }, "A", -3], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "UNKNOWN", args: [{ version: 1, items: { A: { quantity: 2 } } }, "B", 1], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "FRACTION", args: [{ version: 1, items: { A: { quantity: 2 } } }, "A", 0.5], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("INVENTORY", ["src/inventory-update.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/inventory-update.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/inventory-update.mjs" },
    ]),
    maxChanges: 1,
    maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-QV4-F-RETENTION-POLICY",
    taskClass: "EVIDENCE_SEEKING",
    provenance,
    objective: "Repair retentionDays(tier) so it obtains retention behavior from the repository-owned retention policy module and returns that policy's day count. Preserve the named ESM export, do not modify the policy module, and do not duplicate policy values in the service.",
    initialDefect: "The service hard-codes obsolete retention values without consulting repository policy.",
    correctFiles: Object.freeze({
      "src/retention-policy.mjs": `const DAYS=Object.freeze({audit:365,standard:30,ephemeral:1});
export function retentionPolicy(tier){return {days:DAYS[tier]??7};}
`,
      "src/retention-days.mjs": `import { retentionPolicy } from "./retention-policy.mjs";
export function retentionDays(tier) { return retentionPolicy(tier).days; }
`,
    }),
    faultyFiles: Object.freeze({
      "src/retention-days.mjs": `export function retentionDays(tier) { return tier === "audit" ? 180 : 14; }
`,
    }),
    mutationPaths: Object.freeze(["src/retention-days.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/retention-days.mjs"]),
    availableEvidence: Object.freeze([{
      evidenceRef: "AVAILABLE:src/retention-policy.mjs",
      relativePath: "src/retention-policy.mjs",
      description: "Repository-owned retention policy explicitly required by the objective.",
    }]),
    visibleVerifier: `import { retentionDays } from "../src/retention-days.mjs";
if(retentionDays("audit")!==365||retentionDays("standard")!==30)process.exit(2);
console.log("VISIBLE_PASS retention");
`,
    candidateModule: "src/retention-days.mjs",
    exportName: "retentionDays",
    hiddenCases: Object.freeze([
      { caseId: "EPHEMERAL", args: ["ephemeral"], expectation: { kind: "RETURN", value: 1 } },
      { caseId: "UNKNOWN", args: ["custom"], expectation: { kind: "RETURN", value: 7 } },
    ]),
    qualityPolicy: policy("RETENTION", ["src/retention-days.mjs"], ["src/retention-policy.mjs"], [
      { invariantId: "CALL_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/retention-days.mjs", value: "retentionPolicy" },
      { invariantId: "IMPORT_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/retention-days.mjs", value: "./retention-policy.mjs" },
      { invariantId: "NO_AUDIT_LITERAL", dimension: "DUPLICATION", kind: "FORBIDDEN_LITERAL", path: "src/retention-days.mjs", value: 365 },
    ]),
    maxChanges: 1,
    maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV4-G-PARTITION-JOBS",
    taskClass: "ARCHITECTURE_SENSITIVE",
    provenance,
    objective: "Repair partitionJobs(jobs,shardCount) so it uses the repository-owned canonicalJobId helper, validates shardCount as a positive integer, and returns shard arrays containing original job IDs in stable input order. Assign each job by the sum of canonical Unicode code points modulo shardCount. Preserve the named ESM export, keep canonicalization in the shared helper, introduce no global state, and do not mutate jobs.",
    initialDefect: "The partitioner bypasses canonical identity, reverses stable order, and does not validate shard count.",
    correctFiles: Object.freeze({
      "src/job-id.mjs": `export function canonicalJobId(value){return value.trim().toLowerCase();}
`,
      "src/partition-jobs.mjs": `import { canonicalJobId } from "./job-id.mjs";
export function partitionJobs(jobs, shardCount) {
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new RangeError("invalid shard count");
  const shards = Array.from({ length: shardCount }, () => []);
  for (const job of jobs) {
    const hash = [...canonicalJobId(job)].reduce((sum, character) => sum + character.codePointAt(0), 0);
    shards[hash % shardCount].push(job);
  }
  return shards;
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/partition-jobs.mjs": `export function partitionJobs(jobs,shardCount){const shards=Array.from({length:shardCount},()=>[]);for(const job of jobs.reverse())shards[job.length%shardCount].push(job);return shards;}
`,
    }),
    mutationPaths: Object.freeze(["src/partition-jobs.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/partition-jobs.mjs", "src/job-id.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { partitionJobs } from "../src/partition-jobs.mjs";
const jobs=[" A ","b","a"];const result=partitionJobs(jobs,3);
if(JSON.stringify(result)!==JSON.stringify([[],[" A ","a"],["b"]])||jobs[0]!==" A ")process.exit(2);
console.log("VISIBLE_PASS partition");
`,
    candidateModule: "src/partition-jobs.mjs",
    exportName: "partitionJobs",
    hiddenCases: Object.freeze([
      { caseId: "NORMALIZED", args: [[" Z ", "z"], 2], expectation: { kind: "RETURN", value: [[" Z ", "z"], []], argsAfter: [[" Z ", "z"], 2] } },
      { caseId: "STABLE", args: [["c", "a", "d"], 2], expectation: { kind: "RETURN", value: [["d"], ["c", "a"]] } },
      { caseId: "INVALID", args: [["a"], 0], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("PARTITION", ["src/partition-jobs.mjs"], ["src/job-id.mjs"], [
      { invariantId: "CALL_JOB_ID", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/partition-jobs.mjs", value: "canonicalJobId" },
      { invariantId: "IMPORT_JOB_ID", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/partition-jobs.mjs", value: "./job-id.mjs" },
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/partition-jobs.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/partition-jobs.mjs" },
    ]),
    maxChanges: 1,
    maxPatchBytes: 6_144,
  }),
]);
