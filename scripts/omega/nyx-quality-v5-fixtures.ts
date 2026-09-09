import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityAvailableEvidence, NyxQualityHoldoutTaskClass } from "./nyx-quality-holdout-fixtures";

export type NyxQualityV5TaskClass = NyxQualityHoldoutTaskClass | "ARCHITECTURE_SENSITIVE";

export interface NyxQualityV5Task {
  readonly taskId: string;
  readonly taskClass: NyxQualityV5TaskClass;
  readonly provenance: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V5";
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

export const NYX_V5_FROZEN_CORE = Object.freeze({
  commit: "90eebbd73566f750d89f09335fb01406b41fe11a",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "adfc8728226e1a84a42cd3b6ebc620bba4e7fa21aa10440810a8cf619f72281a",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "a78c5d7999239b7cff96749ce16dfe265627f9dcdd776b433b0a530cbe59f1a8",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "b964198d33050f96ab1aacabed7c7fdf2e08370953fccdd77d54f6688d361aa9",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "1fb618d25616c51757e664f5e4ca6e8390de4ec2bd8da4789c2c30d0050a6ffa",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "58bb102e49e66c554a4dbd4513a8fa41652791a4021c0771d898c57dccf42e0d",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

const provenance = "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V5" as const;

function policy(id: string, paths: readonly string[], readonlyPaths: readonly string[] = [],
  invariants: EngineeringQualityPolicy["invariants"] = []): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-V5-QUALITY-${id}`, allowedChangedPaths: Object.freeze([...paths]),
    readonlyPaths: Object.freeze([...readonlyPaths]), maxChangedFiles: paths.length, maxChangedLines: 48,
    maxCandidateBytes: 8_192, maxCyclomaticComplexity: 11, maxComplexityDelta: 7, maxNestingDepth: 4,
    maxAddedDeclarations: 4, invariants: Object.freeze([...invariants]) });
}

export const NYX_ENGINEERING_QUALITY_V5: readonly NyxQualityV5Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-QV5-A-ROTATE-RING", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair rotateRing(items,offset) to return a new array left-rotated by an integer offset. Normalize offsets larger than the array and negative offsets, return a new empty array for empty input, throw RangeError for a non-integer offset, preserve the named ESM export, and never mutate items.",
    initialDefect: "The implementation mutates the input with splice and does not normalize negative or oversized offsets.",
    correctFiles: Object.freeze({ "src/rotate-ring.mjs": `export function rotateRing(items, offset) {
  if (!Number.isInteger(offset)) throw new RangeError("invalid offset");
  if (items.length === 0) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}
` }),
    faultyFiles: Object.freeze({ "src/rotate-ring.mjs": `export function rotateRing(items, offset) {
  return items.splice(offset).concat(items);
}
` }),
    mutationPaths: Object.freeze(["src/rotate-ring.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/rotate-ring.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { rotateRing } from "../src/rotate-ring.mjs";
const input=[1,2,3,4];const result=rotateRing(input,5);
if(JSON.stringify(result)!==JSON.stringify([2,3,4,1])||JSON.stringify(input)!==JSON.stringify([1,2,3,4]))process.exit(2);
console.log("VISIBLE_PASS rotate");
`, candidateModule: "src/rotate-ring.mjs", exportName: "rotateRing",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "NEGATIVE", args: [[1, 2, 3, 4], -1], expectation: { kind: "RETURN", value: [4, 1, 2, 3], argsAfter: [[1, 2, 3, 4], -1] } },
      { caseId: "EMPTY", args: [[], 12], expectation: { kind: "RETURN", value: [], argsAfter: [[], 12] } },
      { caseId: "FULL", args: [["a", "b"], 4], expectation: { kind: "RETURN", value: ["a", "b"] } },
      { caseId: "INVALID", args: [[1], 0.5], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("ROTATE", ["src/rotate-ring.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/rotate-ring.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/rotate-ring.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV5-B-CIRCUIT-TRANSITION", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair circuitTransition(state,signal) to return exactly {state,outcome}. CLOSED+FAILURE becomes OPEN/TRIPPED, OPEN+TIMEOUT becomes HALF_OPEN/PROBE, HALF_OPEN+SUCCESS becomes CLOSED/RESET, HALF_OPEN+FAILURE becomes OPEN/RETRIPPED, and every other pair preserves state with outcome IGNORED. Preserve the named ESM export and deterministic behavior.",
    initialDefect: "The implementation opens on every failure and returns a bare state string for unsupported pairs.",
    correctFiles: Object.freeze({ "src/circuit-transition.mjs": `export function circuitTransition(state, signal) {
  if (state === "CLOSED" && signal === "FAILURE") return { state: "OPEN", outcome: "TRIPPED" };
  if (state === "OPEN" && signal === "TIMEOUT") return { state: "HALF_OPEN", outcome: "PROBE" };
  if (state === "HALF_OPEN" && signal === "SUCCESS") return { state: "CLOSED", outcome: "RESET" };
  if (state === "HALF_OPEN" && signal === "FAILURE") return { state: "OPEN", outcome: "RETRIPPED" };
  return { state, outcome: "IGNORED" };
}
` }),
    faultyFiles: Object.freeze({ "src/circuit-transition.mjs": `export function circuitTransition(state, signal) {
  if (signal === "FAILURE") return { state: "OPEN", outcome: "TRIPPED" };
  return state;
}
` }),
    mutationPaths: Object.freeze(["src/circuit-transition.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/circuit-transition.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { circuitTransition } from "../src/circuit-transition.mjs";
if(JSON.stringify(circuitTransition("OPEN","TIMEOUT"))!==JSON.stringify({state:"HALF_OPEN",outcome:"PROBE"}))process.exit(2);
console.log("VISIBLE_PASS circuit");
`, candidateModule: "src/circuit-transition.mjs", exportName: "circuitTransition",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "TRIP", args: ["CLOSED", "FAILURE"], expectation: { kind: "RETURN", value: { state: "OPEN", outcome: "TRIPPED" } } },
      { caseId: "RESET", args: ["HALF_OPEN", "SUCCESS"], expectation: { kind: "RETURN", value: { state: "CLOSED", outcome: "RESET" } } },
      { caseId: "RETRIP", args: ["HALF_OPEN", "FAILURE"], expectation: { kind: "RETURN", value: { state: "OPEN", outcome: "RETRIPPED" } } },
      { caseId: "IGNORE", args: ["OPEN", "SUCCESS"], expectation: { kind: "RETURN", value: { state: "OPEN", outcome: "IGNORED" } } },
    ]), qualityPolicy: policy("CIRCUIT", ["src/circuit-transition.mjs"]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV5-C-PARSE-BYTE-SIZE", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair parseByteSize(input) to accept a trimmed non-negative integer followed by B, KB, or MB and return exactly {ok:true,bytes}, using powers of 1024. Reject unsafe results, decimals, signs, missing units, unknown units, and non-string input with exactly {ok:false,error:'INVALID_SIZE'}. Preserve the named ESM export and do not throw.",
    initialDefect: "The parser uses parseInt, ignores units, and accepts malformed prefixes.",
    correctFiles: Object.freeze({ "src/parse-byte-size.mjs": `export function parseByteSize(input) {
  if (typeof input !== "string") return { ok: false, error: "INVALID_SIZE" };
  const match = /^(\\d+)(B|KB|MB)$/.exec(input.trim());
  if (!match) return { ok: false, error: "INVALID_SIZE" };
  const units = { B: 1, KB: 1024, MB: 1024 * 1024 };
  const bytes = Number(match[1]) * units[match[2]];
  return Number.isSafeInteger(bytes) ? { ok: true, bytes } : { ok: false, error: "INVALID_SIZE" };
}
` }),
    faultyFiles: Object.freeze({ "src/parse-byte-size.mjs": `export function parseByteSize(input) { return { ok: true, bytes: parseInt(input, 10) }; }
` }),
    mutationPaths: Object.freeze(["src/parse-byte-size.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/parse-byte-size.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { parseByteSize } from "../src/parse-byte-size.mjs";
if(JSON.stringify(parseByteSize(" 2KB "))!==JSON.stringify({ok:true,bytes:2048})||parseByteSize("2.5KB").ok)process.exit(2);
console.log("VISIBLE_PASS bytes");
`, candidateModule: "src/parse-byte-size.mjs", exportName: "parseByteSize",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "BYTES", args: ["0B"], expectation: { kind: "RETURN", value: { ok: true, bytes: 0 } } },
      { caseId: "MEGABYTES", args: ["3MB"], expectation: { kind: "RETURN", value: { ok: true, bytes: 3145728 } } },
      { caseId: "NO-UNIT", args: ["12"], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_SIZE" } } },
      { caseId: "NON-STRING", args: [12], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_SIZE" } } },
    ]), qualityPolicy: Object.freeze({ ...policy("BYTES", ["src/parse-byte-size.mjs"]), maxComplexityDelta: 9 }),
    maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV5-D-PRIORITIZE-JOBS", taskClass: "MULTI_FILE_INTERACTION", provenance,
    objective: "Repair prioritizeJobs(jobs) to return job IDs ordered by the repository-owned comparePriority helper, preserving stable input order for exact comparator ties. Do not mutate jobs, preserve both named ESM exports, and do not duplicate deadline or severity policy in the ranker.",
    initialDefect: "The ranker mutates its input and duplicates an incomplete severity-only ordering.",
    correctFiles: Object.freeze({
      "src/compare-priority.mjs": `export function comparePriority(left, right) { return left.deadline - right.deadline || right.severity - left.severity; }
`,
      "src/prioritize-jobs.mjs": `import { comparePriority } from "./compare-priority.mjs";
export function prioritizeJobs(jobs) {
  const ranked = jobs.map((job, index) => ({ job, index }));
  ranked.sort((left, right) => comparePriority(left.job, right.job) || left.index - right.index);
  return ranked.map(({ job }) => job.id);
}
`,
    }),
    faultyFiles: Object.freeze({ "src/prioritize-jobs.mjs": `export function prioritizeJobs(jobs) {
  return jobs.sort((left, right) => right.severity - left.severity).map((job) => job.id);
}
` }),
    mutationPaths: Object.freeze(["src/prioritize-jobs.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/prioritize-jobs.mjs", "src/compare-priority.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { prioritizeJobs } from "../src/prioritize-jobs.mjs";
const input=[{id:"late",deadline:9,severity:9},{id:"soon",deadline:1,severity:1}];
if(JSON.stringify(prioritizeJobs(input))!==JSON.stringify(["soon","late"])||input[0].id!=="late")process.exit(2);
console.log("VISIBLE_PASS priority");
`, candidateModule: "src/prioritize-jobs.mjs", exportName: "prioritizeJobs",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "SEVERITY", args: [[{ id: "a", deadline: 2, severity: 1 }, { id: "b", deadline: 2, severity: 5 }]], expectation: { kind: "RETURN", value: ["b", "a"] } },
      { caseId: "STABLE", args: [[{ id: "a", deadline: 2, severity: 1 }, { id: "b", deadline: 2, severity: 1 }]], expectation: { kind: "RETURN", value: ["a", "b"] } },
    ]),
    qualityPolicy: policy("PRIORITY", ["src/prioritize-jobs.mjs"], ["src/compare-priority.mjs"], [
      { invariantId: "CALL_COMPARATOR", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/prioritize-jobs.mjs", value: "comparePriority" },
      { invariantId: "IMPORT_COMPARATOR", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/prioritize-jobs.mjs", value: "./compare-priority.mjs" },
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/prioritize-jobs.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-QV5-E-RESERVE-QUOTA", taskClass: "REGRESSION_SENSITIVE", provenance,
    objective: "Repair reserveQuota(snapshot,amount) so a non-negative integer amount no greater than available capacity increments used, decrements available, increments version, and returns a new root and quota object. Throw RangeError otherwise. Preserve the named ESM export and never mutate snapshot.",
    initialDefect: "The implementation mutates nested state and accepts fractional, negative, and excessive reservations.",
    correctFiles: Object.freeze({ "src/reserve-quota.mjs": `export function reserveQuota(snapshot, amount) {
  if (!Number.isInteger(amount) || amount < 0 || amount > snapshot.quota.available) {
    throw new RangeError("invalid reservation");
  }
  return { ...snapshot, version: snapshot.version + 1,
    quota: { ...snapshot.quota, used: snapshot.quota.used + amount, available: snapshot.quota.available - amount } };
}
` }),
    faultyFiles: Object.freeze({ "src/reserve-quota.mjs": `export function reserveQuota(snapshot, amount) {
  snapshot.quota.used += amount; snapshot.quota.available -= amount; return snapshot;
}
` }),
    mutationPaths: Object.freeze(["src/reserve-quota.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/reserve-quota.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { reserveQuota } from "../src/reserve-quota.mjs";
const input={version:4,quota:{used:2,available:5,label:"primary"}};const result=reserveQuota(input,3);
if(result.version!==5||result.quota.used!==5||result.quota.available!==2||input.quota.used!==2||result===input)process.exit(2);
console.log("VISIBLE_PASS quota");
`, candidateModule: "src/reserve-quota.mjs", exportName: "reserveQuota",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "ZERO", args: [{ version: 1, quota: { used: 3, available: 4 } }, 0], expectation: { kind: "RETURN", value: { version: 2, quota: { used: 3, available: 4 } }, argsAfter: [{ version: 1, quota: { used: 3, available: 4 } }, 0] } },
      { caseId: "EXCESS", args: [{ version: 1, quota: { used: 3, available: 4 } }, 5], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "NEGATIVE", args: [{ version: 1, quota: { used: 3, available: 4 } }, -1], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "FRACTION", args: [{ version: 1, quota: { used: 3, available: 4 } }, 1.5], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("QUOTA", ["src/reserve-quota.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/reserve-quota.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/reserve-quota.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-QV5-F-RETRY-DELAY", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair retryDelay(reason,attempt) so it obtains baseMs and capMs from the repository-owned retry policy and returns capped exponential delay baseMs*2^attempt. Throw RangeError unless attempt is a non-negative integer. Preserve the named ESM export, do not modify the policy module, and do not duplicate policy constants in the service.",
    initialDefect: "The service hard-codes one linear delay and never consults repository policy.",
    correctFiles: Object.freeze({
      "src/retry-policy.mjs": `const POLICIES=Object.freeze({timeout:{baseMs:250,capMs:4000},rate_limit:{baseMs:1000,capMs:16000}});
export function retryPolicy(reason){return POLICIES[reason]??{baseMs:500,capMs:8000};}
`,
      "src/retry-delay.mjs": `import { retryPolicy } from "./retry-policy.mjs";
export function retryDelay(reason, attempt) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("invalid attempt");
  const { baseMs, capMs } = retryPolicy(reason);
  return Math.min(capMs, baseMs * (2 ** attempt));
}
`,
    }),
    faultyFiles: Object.freeze({ "src/retry-delay.mjs": `export function retryDelay(reason, attempt) { return 1000 * (attempt + 1); }
` }),
    mutationPaths: Object.freeze(["src/retry-delay.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/retry-delay.mjs"]),
    availableEvidence: Object.freeze([{ evidenceRef: "AVAILABLE:src/retry-policy.mjs", relativePath: "src/retry-policy.mjs",
      description: "Repository-owned backoff policy explicitly required by the objective." }]),
    visibleVerifier: `import { retryDelay } from "../src/retry-delay.mjs";
if(retryDelay("timeout",2)!==1000||retryDelay("rate_limit",5)!==16000)process.exit(2);
console.log("VISIBLE_PASS retry");
`, candidateModule: "src/retry-delay.mjs", exportName: "retryDelay",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "ZERO", args: ["timeout", 0], expectation: { kind: "RETURN", value: 250 } },
      { caseId: "DEFAULT", args: ["other", 2], expectation: { kind: "RETURN", value: 2000 } },
      { caseId: "CAPPED", args: ["other", 8], expectation: { kind: "RETURN", value: 8000 } },
      { caseId: "INVALID", args: ["timeout", -1], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("RETRY", ["src/retry-delay.mjs"], ["src/retry-policy.mjs"], [
      { invariantId: "CALL_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/retry-delay.mjs", value: "retryPolicy" },
      { invariantId: "IMPORT_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/retry-delay.mjs", value: "./retry-policy.mjs" },
      { invariantId: "NO_POLICY_LITERAL", dimension: "DUPLICATION", kind: "FORBIDDEN_LITERAL", path: "src/retry-delay.mjs", value: 1000 },
    ]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV5-G-ROUTE-OPERATIONS", taskClass: "ARCHITECTURE_SENSITIVE", provenance,
    objective: "Repair routeOperations(operations) so it delegates execution-plane classification to the repository-owned operationPlane helper and returns exactly {local,remote}, each containing original operation IDs in stable input order. Preserve the named ESM export, keep classification policy in the helper, introduce no global state, and do not mutate operations.",
    initialDefect: "The router duplicates a name-prefix heuristic and reverses the caller's operation array.",
    correctFiles: Object.freeze({
      "src/operation-plane.mjs": `export function operationPlane(type){return type==="READ"||type==="CACHE"?"LOCAL":"REMOTE";}
`,
      "src/route-operations.mjs": `import { operationPlane } from "./operation-plane.mjs";
export function routeOperations(operations) {
  const result = { local: [], remote: [] };
  for (const operation of operations) {
    const target = operationPlane(operation.type) === "LOCAL" ? result.local : result.remote;
    target.push(operation.id);
  }
  return result;
}
`,
    }),
    faultyFiles: Object.freeze({ "src/route-operations.mjs": `export function routeOperations(operations){const local=[];const remote=[];for(const operation of operations.reverse())(operation.id.startsWith("L")?local:remote).push(operation.id);return {local,remote};}
` }),
    mutationPaths: Object.freeze(["src/route-operations.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/route-operations.mjs", "src/operation-plane.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { routeOperations } from "../src/route-operations.mjs";
const input=[{id:"x",type:"READ"},{id:"L-wrong",type:"WRITE"}];const result=routeOperations(input);
if(JSON.stringify(result)!==JSON.stringify({local:["x"],remote:["L-wrong"]})||input[0].id!=="x")process.exit(2);
console.log("VISIBLE_PASS routing");
`, candidateModule: "src/route-operations.mjs", exportName: "routeOperations",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "CACHE", args: [[{ id: "a", type: "CACHE" }, { id: "b", type: "EXECUTE" }]], expectation: { kind: "RETURN", value: { local: ["a"], remote: ["b"] } } },
      { caseId: "STABLE", args: [[{ id: "z", type: "WRITE" }, { id: "y", type: "READ" }, { id: "x", type: "READ" }]], expectation: { kind: "RETURN", value: { local: ["y", "x"], remote: ["z"] } } },
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: { local: [], remote: [] } } },
    ]),
    qualityPolicy: policy("ROUTING", ["src/route-operations.mjs"], ["src/operation-plane.mjs"], [
      { invariantId: "CALL_PLANE", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/route-operations.mjs", value: "operationPlane" },
      { invariantId: "IMPORT_PLANE", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/route-operations.mjs", value: "./operation-plane.mjs" },
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/route-operations.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/route-operations.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 6_144,
  }),
]);
