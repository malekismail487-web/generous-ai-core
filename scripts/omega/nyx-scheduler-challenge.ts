import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";

export type NyxSchedulerChallenge = Omit<NyxQualityV5Task, "provenance"> & {
  readonly provenance: "NYX_SCHEDULER_DIAGNOSTIC_V1_NOT_INSTITUTIONAL_CERTIFICATION";
};

export const NYX_SCHEDULER_FROZEN_CORE = Object.freeze({
  commit: "7e29b5190eb00bd4d83b385eb7f4062d283366e9",
  serialization: "UTF8_CRLF_TO_LF_ONLY",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "adfc8728226e1a84a42cd3b6ebc620bba4e7fa21aa10440810a8cf619f72281a",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "90be87254a131c9de6722112285a92d316971c59bd5b4015d1d74531805d86fa",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "b98f09ddcaefeca3e4319a502f2f3bdcc9387683212cb27ffb541326b3f5b1ab",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "1fb618d25616c51757e664f5e4ca6e8390de4ec2bd8da4789c2c30d0050a6ffa",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

export const NYX_SCHEDULER_EXPERIMENT = Object.freeze({
  chunkId: "NYX-HARD-REJECTION-REPAIR-001", maxCognitionCycles: 4, maxWallClockMs: 480_000,
  maxOutputTokensPerCall: 8_192, maxCumulativeOutputTokens: 32_768, maxPromptBytesPerCall: 48_000,
  scope: "ONE_CONSTRUCTED_MULTIFILE_TASK_NOT_BROAD_GENERALIZATION",
  evidenceIndependence: "E3_AUTHOR_ADJACENT_ORACLES_PLUS_E4_MODEL_CALLS",
  privateHoldout: false, candidateHiddenExpectations: true,
  planCoverage: { status: "PARTIAL_JUST_IN_TIME",
    direct: ["VIII.2_MUTATION_BENCHMARKING", "ORIGINAL.14_FAILURE_TRAJECTORIES", "DCCLXXX_ASSURANCE_KERNEL"],
    supporting: ["BUILDER_BREAKER", "EXECUTABLE_EVIDENCE_OUTRANKS_CONFIDENCE", "DETECTORS_REQUIRE_VALIDATION"],
    deferred: ["INDEPENDENT_INSTITUTIONAL_REPLICATION", "PRODUCTION_AUTHORITY", "DEVICE_INTEGRATION", "WEIGHT_RESEARCH"],
    conflicts: ["RETRY_UNTIL_ACCEPTED_IS_BOUNDED_BY_AUTHORITY_AND_RESOURCE_LIMITS"],
    superseded: ["SMALL_SINGLE_FILE_SMOKE_AS_SUFFICIENT_ENGINEERING_EVIDENCE"],
  },
});

// Author-written reference and cases are evaluator assets, never cognition evidence.
const correctFiles: Readonly<Record<string, string>> = Object.freeze({
  "src/contracts.mjs": `export function validate(config, events) {
  const integer = (n) => Number.isInteger(n) && n >= 0 && n <= 1000000;
  const name = (s) => typeof s === "string" && s.length > 0 && s.length <= 80;
  const require = (condition) => { if (!condition) throw new RangeError("invalid scheduler input"); };
  require(config && config.capacity && config.tenantLimits && Array.isArray(config.jobs));
  require(integer(config.capacity.cpu) && integer(config.capacity.gpu));
  require(integer(config.agingQuantum) && config.agingQuantum > 0);
  require(config.jobs.length <= 200 && Array.isArray(events) && events.length <= 2000);
  require(Object.values(config.tenantLimits).every((limit) => integer(limit) && limit > 0));
  const ids = new Set(config.jobs.map((job) => job.id));
  require(ids.size === config.jobs.length);
  for (const job of config.jobs) {
    require(name(job.id) && Object.hasOwn(config.tenantLimits, job.tenant));
    require(Array.isArray(job.deps) && new Set(job.deps).size === job.deps.length);
    require(job.deps.every((id) => ids.has(id)));
    require([job.cpu, job.gpu, job.priority, job.submittedAt, job.maxAttempts, job.leaseMs].every(integer));
    require(job.cpu + job.gpu > 0 && job.maxAttempts > 0 && job.leaseMs > 0);
  }
  const resolved = new Set();
  for (let round = 0; round < config.jobs.length; round += 1) {
    for (const job of config.jobs) if (job.deps.every((id) => resolved.has(id))) resolved.add(job.id);
  }
  require(resolved.size === config.jobs.length);
  for (const event of events) {
    require(event && name(event.id) && integer(event.at));
    require(["TICK", "FINISH", "CANCEL"].includes(event.kind));
    if (event.kind !== "TICK") require(ids.has(event.jobId));
    if (event.kind === "FINISH") require(integer(event.lease) && typeof event.ok === "boolean");
  }
}
`,
  "src/graph.mjs": `export function propagate(jobs) {
  const blocked = new Set(["FAILED", "CANCELLED", "BLOCKED"]);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  for (let round = 0; round < jobs.length; round += 1) {
    for (const job of jobs) {
      if (job.state === "QUEUED" && job.deps.some((id) => blocked.has(byId.get(id).state))) {
        job.state = "BLOCKED";
      }
    }
  }
}

export function readyJobs(jobs, now) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return jobs.filter((job) => job.state === "QUEUED" && job.submittedAt <= now
    && job.deps.every((id) => byId.get(id).state === "SUCCEEDED"));
}
`,
  "src/resources.mjs": `export function usage(jobs) {
  return jobs.filter((job) => job.state === "RUNNING").reduce((sum, job) => ({
    cpu: sum.cpu + job.cpu, gpu: sum.gpu + job.gpu
  }), { cpu: 0, gpu: 0 });
}

export function ordered(ready, now, quantum) {
  const score = (job) => job.priority + Math.floor((now - job.submittedAt) / quantum);
  return [...ready].sort((a, b) => score(b) - score(a) || a.submittedAt - b.submittedAt
    || (a.id < b.id ? -1 : Number(a.id > b.id)));
}

export function fits(job, jobs, config) {
  const used = usage(jobs);
  const tenants = jobs.filter((item) => item.state === "RUNNING" && item.tenant === job.tenant).length;
  return used.cpu + job.cpu <= config.capacity.cpu && used.gpu + job.gpu <= config.capacity.gpu
    && tenants < config.tenantLimits[job.tenant];
}
`,
  "src/transitions.mjs": `function retry(job) {
  job.state = job.attempt >= job.maxAttempts ? "FAILED" : "QUEUED";
  job.expiresAt = null;
}

export function expire(jobs, now) {
  for (const job of jobs) if (job.state === "RUNNING" && job.expiresAt <= now) retry(job);
}

export function applyEvent(jobs, event) {
  if (event.kind === "TICK") return;
  const job = jobs.find((item) => item.id === event.jobId);
  if (event.kind === "CANCEL") {
    if (["RUNNING", "QUEUED"].includes(job.state)) {
      job.state = "CANCELLED";
      job.expiresAt = null;
    }
    return;
  }
  if (job.state !== "RUNNING" || job.attempt !== event.lease) return;
  if (!event.ok) { retry(job); return; }
  job.state = "SUCCEEDED";
  job.expiresAt = null;
}

export function start(job, now) {
  job.state = "RUNNING";
  job.attempt += 1;
  job.expiresAt = now + job.leaseMs;
}
`,
  "src/scheduler.mjs": `import { validate } from "./contracts.mjs";
import { propagate, readyJobs } from "./graph.mjs";
import { usage, ordered, fits } from "./resources.mjs";
import { expire, applyEvent, start } from "./transitions.mjs";

function fingerprint(event) {
  return JSON.stringify([event.kind, event.at, event.jobId ?? null, event.lease ?? null, event.ok ?? null]);
}

function duplicate(seen, event) {
  const signature = fingerprint(event);
  if (!seen.has(event.id)) { seen.set(event.id, signature); return false; }
  if (seen.get(event.id) !== signature) throw new RangeError("conflicting event id");
  return true;
}

function schedule(jobs, config, now) {
  propagate(jobs);
  const ready = ordered(readyJobs(jobs, now), now, config.agingQuantum);
  for (const job of ready) if (fits(job, jobs, config)) start(job, now);
}

export function simulate(config, events) {
  validate(config, events);
  const jobs = config.jobs.map((job) => ({ ...job, deps: [...job.deps],
    state: "QUEUED", attempt: 0, expiresAt: null }));
  const seen = new Map();
  let now = 0;
  for (const event of events) {
    if (duplicate(seen, event)) continue;
    if (event.at < now) throw new RangeError("time regression");
    now = event.at;
    expire(jobs, now);
    applyEvent(jobs, event);
    schedule(jobs, config, now);
  }
  const snapshots = jobs.map(({ id, state, attempt, expiresAt }) => ({ id, state, attempt, expiresAt }));
  snapshots.sort((a, b) => a.id < b.id ? -1 : Number(a.id > b.id));
  return { now, jobs: snapshots, used: usage(jobs) };
}
`,
});

// Each mutation is separately falsified by the independent expected-value cases.
export const NYX_SCHEDULER_MUTANTS = Object.freeze([
  { id: "DEPENDENCY_ANY", path: "src/graph.mjs", before: "job.deps.every", after: "job.deps.some" },
  { id: "NO_CANCELLATION_PROPAGATION", path: "src/graph.mjs",
    before: '["FAILED", "CANCELLED", "BLOCKED"]', after: '["FAILED", "BLOCKED"]' },
  { id: "REVERSED_PRIORITY", path: "src/resources.mjs", before: "score(b) - score(a)", after: "score(a) - score(b)" },
  { id: "OVERCOMMIT_GPU", path: "src/resources.mjs", before: "used.gpu + job.gpu <= config.capacity.gpu", after: "true" },
  { id: "IGNORE_TENANT_QUOTA", path: "src/resources.mjs", before: "tenants < config.tenantLimits[job.tenant]", after: "true" },
  { id: "LATE_EXPIRY", path: "src/transitions.mjs", before: "job.expiresAt <= now", after: "job.expiresAt < now" },
  { id: "NO_FENCING", path: "src/transitions.mjs", before: ' || job.attempt !== event.lease', after: "" },
  { id: "IGNORE_EVENT_CONFLICT", path: "src/scheduler.mjs",
    before: 'if (seen.get(event.id) !== signature) throw new RangeError("conflicting event id");', after: "// No conflict check." },
  { id: "HEAD_OF_LINE_BLOCKING", path: "src/scheduler.mjs",
    before: "for (const job of ready) if (fits(job, jobs, config)) start(job, now);",
    after: "for (const job of ready) { if (!fits(job, jobs, config)) break; start(job, now); }" },
]);

const faultyFiles: Record<string, string> = {};
for (const mutant of NYX_SCHEDULER_MUTANTS) {
  const source = faultyFiles[mutant.path] ?? correctFiles[mutant.path];
  if (!source.includes(mutant.before)) throw new Error(`missing_mutation_target:${mutant.id}`);
  faultyFiles[mutant.path] = source.replace(mutant.before, mutant.after);
}

type Job = { id: string; tenant: string; deps: string[]; cpu: number; gpu: number;
  priority: number; submittedAt: number; maxAttempts: number; leaseMs: number };
function job(id: string, changes: Partial<Job> = {}): Job {
  return { id, tenant: "t", deps: [], cpu: 1, gpu: 0, priority: 0, submittedAt: 0,
    maxAttempts: 2, leaseMs: 10, ...changes };
}
function config(jobs: Job[], capacity = { cpu: 2, gpu: 1 }, tenantLimits = { t: 2, u: 2 }) {
  return { capacity, tenantLimits, agingQuantum: 5, jobs };
}
const tick = (id: string, at: number) => ({ id, at, kind: "TICK" });
const finish = (id: string, at: number, jobId: string, lease: number, ok = true) =>
  ({ id, at, kind: "FINISH", jobId, lease, ok });
const row = (id: string, state: string, attempt = 0, expiresAt: number | null = null) =>
  ({ id, state, attempt, expiresAt });
function returns(caseId: string, args: unknown[], now: number, jobs: ReturnType<typeof row>[], cpu = 0, gpu = 0): HiddenEvaluationCase {
  return { caseId, args, expectation: { kind: "RETURN", value: { now, jobs, used: { cpu, gpu } }, argsAfter: args } };
}
function throws(caseId: string, args: unknown[]): HiddenEvaluationCase {
  return { caseId, args, expectation: { kind: "THROW", errorName: "RangeError" } };
}

// Expectations are hand-derived state tables, not outputs computed by the reference.
const hiddenCases: HiddenEvaluationCase[] = [
  returns("COMPOSED_OUTAGE_RECOVERY", [config([
    job("a", { cpu: 2, gpu: 1, priority: 5, leaseMs: 5 }),
    job("b", { tenant: "u", gpu: 1, priority: 9, leaseMs: 5 }),
    job("c", { tenant: "u", deps: ["a"] }), job("d", { deps: ["b"] }),
    job("e", { tenant: "u", priority: 1, maxAttempts: 1, leaseMs: 5 }),
    job("f", { tenant: "u", deps: ["c", "d"] }),
  ], { cpu: 3, gpu: 1 }, { t: 1, u: 2 }), [tick("start", 0), finish("b-ok", 1, "b", 1),
    finish("e-fail", 2, "e", 1, false), tick("expire-a", 6), finish("stale-a", 7, "a", 1),
    finish("a-ok", 8, "a", 2), { id: "cancel-c", at: 9, kind: "CANCEL", jobId: "c" },
    finish("d-ok", 10, "d", 1)]], 10, [row("a", "SUCCEEDED", 2), row("b", "SUCCEEDED", 1),
    row("c", "CANCELLED", 1), row("d", "SUCCEEDED", 1), row("e", "FAILED", 1), row("f", "BLOCKED")]),
  returns("EMPTY", [config([]), [tick("a", 0)]], 0, []),
  returns("NO_IMPLICIT_START", [config([job("a")]), []], 0, [row("a", "QUEUED")]),
  returns("ONE_START", [config([job("a")]), [tick("a", 0)]], 0, [row("a", "RUNNING", 1, 10)], 1),
  returns("DEPENDENCY_AND", [config([job("a"), job("b"), job("c", { deps: ["a", "b"] })]),
    [tick("t", 0), finish("f", 1, "a", 1)]], 1,
  [row("a", "SUCCEEDED", 1), row("b", "RUNNING", 1, 10), row("c", "QUEUED")], 1),
  returns("CHAIN_START", [config([job("a"), job("b", { deps: ["a"] })]),
    [tick("t", 0), finish("f", 1, "a", 1)]], 1, [row("a", "SUCCEEDED", 1), row("b", "RUNNING", 1, 11)], 1),
  returns("TENANT_FAIRNESS", [config([job("a"), job("b"), job("c", { tenant: "u" })],
    { cpu: 3, gpu: 1 }, { t: 1, u: 1 }), [tick("t", 0)]], 0,
  [row("a", "RUNNING", 1, 10), row("b", "QUEUED"), row("c", "RUNNING", 1, 10)], 2),
  returns("GPU_CONSERVATION", [config([job("a", { gpu: 1 }), job("b", { gpu: 1 })]), [tick("t", 0)]], 0,
    [row("a", "RUNNING", 1, 10), row("b", "QUEUED")], 1, 1),
  returns("CPU_CONSERVATION", [config([job("a", { cpu: 2 }), job("b")]), [tick("t", 0)]], 0,
    [row("a", "RUNNING", 1, 10), row("b", "QUEUED")], 2),
  returns("SKIP_NONFIT", [config([job("a", { cpu: 3, priority: 9 }), job("b")]), [tick("t", 0)]], 0,
    [row("a", "QUEUED"), row("b", "RUNNING", 1, 10)], 1),
  returns("PRIORITY", [config([job("a"), job("b", { priority: 9 })], { cpu: 1, gpu: 0 }), [tick("t", 0)]], 0,
    [row("a", "QUEUED"), row("b", "RUNNING", 1, 10)], 1),
  returns("AGING", [config([job("a"), job("b", { priority: 2, submittedAt: 20 })], { cpu: 1, gpu: 0 }),
    [tick("t", 20)]], 20, [row("a", "RUNNING", 1, 30), row("b", "QUEUED")], 1),
  returns("FUTURE_SUBMISSION", [config([job("a", { submittedAt: 2 })]), [tick("t", 1)]], 1, [row("a", "QUEUED")]),
  returns("INCLUSIVE_EXPIRY", [config([job("a")]), [tick("t", 0), finish("f", 10, "a", 1)]], 10,
    [row("a", "RUNNING", 2, 20)], 1),
  returns("STALE_COMPLETION", [config([job("a")]), [tick("t", 0), tick("e", 10), finish("f", 11, "a", 1)]], 11,
    [row("a", "RUNNING", 2, 20)], 1),
  returns("EXHAUSTION_PROPAGATION", [config([job("a", { maxAttempts: 1 }), job("b", { deps: ["a"] })]),
    [tick("t", 0), tick("e", 10)]], 10, [row("a", "FAILED", 1), row("b", "BLOCKED")]),
  returns("CANCEL_TRANSITIVE", [config([job("c", { deps: ["b"] }), job("b", { deps: ["a"] }), job("a")]),
    [tick("t", 0), { id: "c", at: 1, kind: "CANCEL", jobId: "a" }]], 1,
  [row("a", "CANCELLED", 1), row("b", "BLOCKED"), row("c", "BLOCKED")]),
  returns("FAILED_RETRY", [config([job("a")]), [tick("t", 0), finish("f", 1, "a", 1, false)]], 1,
    [row("a", "RUNNING", 2, 11)], 1),
  returns("DUPLICATE_OLD_EVENT", [config([job("a")]), [tick("t", 0), tick("e", 2), tick("t", 0)]], 2,
    [row("a", "RUNNING", 1, 10)], 1),
  returns("PROTOTYPE_SAFE_IDS", [config([job("__proto__")]), [tick("__proto__", 0)]], 0,
    [row("__proto__", "RUNNING", 1, 10)], 1),
  returns("STABLE_TIE", [config([job("b"), job("a")], { cpu: 1, gpu: 0 }), [tick("t", 0)]], 0,
    [row("a", "RUNNING", 1, 10), row("b", "QUEUED")], 1),
  throws("CONFLICTING_EVENT", [config([job("a")]), [tick("t", 0), tick("t", 1)]]),
  throws("TIME_REGRESSION", [config([job("a")]), [tick("t", 2), tick("s", 1)]]),
  throws("CYCLE", [config([job("a", { deps: ["b"] }), job("b", { deps: ["a"] })]), []]),
  throws("MISSING_DEP", [config([job("a", { deps: ["absent"] })]), []]),
  throws("DUPLICATE_JOB", [config([job("a"), job("a")]), []]),
  throws("NEGATIVE_RESOURCE", [config([job("a", { cpu: -1 })]), []]),
  throws("UNKNOWN_JOB", [config([]), [finish("f", 0, "absent", 1)]]),
  throws("UNKNOWN_TENANT", [config([job("a", { tenant: "absent" })]), []]),
];

const visibleVerifier = `import assert from "node:assert/strict";
import { simulate } from "../src/scheduler.mjs";
const base = { tenant: "t", deps: [], cpu: 1, gpu: 0, priority: 0,
  submittedAt: 0, maxAttempts: 2, leaseMs: 10 };
const config = { capacity: { cpu: 1, gpu: 0 }, tenantLimits: { t: 1 }, agingQuantum: 5,
  jobs: [{ ...base, id: "a" }, { ...base, id: "b", deps: ["a"] }] };
const before = JSON.stringify(config);
const result = simulate(config, [{ id: "t", kind: "TICK", at: 0 },
  { id: "f", kind: "FINISH", at: 1, jobId: "a", lease: 1, ok: true }]);
assert.deepEqual(result, { now: 1, jobs: [
  { id: "a", state: "SUCCEEDED", attempt: 1, expiresAt: null },
  { id: "b", state: "RUNNING", attempt: 1, expiresAt: 11 }
], used: { cpu: 1, gpu: 0 } }, "dependency release and dispatch must compose");
assert.equal(JSON.stringify(config), before, "caller inputs remain immutable");
console.log("VISIBLE_PASS scheduler composition");
`;
const paths = Object.freeze(["src/graph.mjs", "src/resources.mjs", "src/transitions.mjs", "src/scheduler.mjs"]);
export const NYX_SCHEDULER_CHALLENGE: NyxSchedulerChallenge = Object.freeze({
  taskId: "NYX-SCHEDULER-LEASE-FENCING-001", taskClass: "ARCHITECTURE_SENSITIVE",
  provenance: "NYX_SCHEDULER_DIAGNOSTIC_V1_NOT_INSTITUTIONAL_CERTIFICATION",
  objective: [
    "Repair the four mutable modules of the deterministic multi-tenant scheduler. Preserve exports and contracts.mjs.",
    "simulate(config,events) validates via the immutable contracts module, never mutates its inputs, and returns exactly",
    "{now,jobs:[{id,state,attempt,expiresAt}],used:{cpu,gpu}}, jobs sorted by JS lexical id, no additional fields.",
    "Initial state: now=0, every job QUEUED, attempt=0, expiresAt=null. No scheduling occurs without an event.",
    "Process new events in nondecreasing at order; otherwise RangeError. Same id with identical kind/at/jobId/lease/ok",
    "is a no-op even when old; conflicting payload for the same id is RangeError. Property order is irrelevant.",
    "For each new event: expire running leases where expiresAt<=at, then apply event, then propagate, then schedule.",
    "Expiry/failure clears expiresAt; exhausted attempts become FAILED, otherwise QUEUED. Attempts count starts.",
    "FINISH acts only on RUNNING with matching attempt===lease. Stale completions do nothing. ok=true SUCCEEDED;",
    "ok=false retries/exhausts. CANCEL makes queued/running jobs CANCELLED and clears expiry; terminal jobs unchanged.",
    "Any QUEUED job with a FAILED/CANCELLED/BLOCKED dependency becomes BLOCKED, transitively, independent of input order.",
    "Ready means QUEUED, submittedAt<=now, ALL dependencies SUCCEEDED. Empty dependency list is ready.",
    "Rank descending priority+floor((now-submittedAt)/agingQuantum), then earlier submittedAt, then lexical id.",
    "Start ready jobs in rank order only if both aggregate CPU/GPU capacity AND tenant running-job quota allow it.",
    "Skip non-fitting jobs and continue; do not stop the scan. On start: RUNNING, attempt+=1, expiresAt=now+leaseMs.",
    "Resources count RUNNING jobs only; recompute after each start. No I/O, global state, wall clocks or randomness.",
    "Public quality constraints remain binding: preserve modular boundaries, avoid duplication, <=120 characters/line.",
  ].join(" "),
  initialDefect: "Visible evidence reports a broken dependency-release/dispatch interaction; investigate all four modules against the complete contract.",
  correctFiles, faultyFiles: Object.freeze(faultyFiles), mutationPaths: paths,
  initiallyAdmittedPaths: Object.freeze([...paths, "src/contracts.mjs"]), availableEvidence: Object.freeze([]),
  visibleVerifier, candidateModule: "src/scheduler.mjs", exportName: "simulate", hiddenCases: Object.freeze(hiddenCases),
  qualityPolicy: Object.freeze({ policyId: "NYX-SCHEDULER-QUALITY-1", allowedChangedPaths: paths,
    readonlyPaths: Object.freeze(["src/contracts.mjs"]), maxChangedFiles: 4, maxChangedLines: 200,
    // Whole-fixture assessment includes the immutable input validator (28 AST branches).
    // Changed files still face the existing independent public-admission limit of 12.
    maxCandidateBytes: 24_576, maxCyclomaticComplexity: 28, maxComplexityDelta: 8, maxNestingDepth: 4,
    maxAddedDeclarations: 12, invariants: Object.freeze([
      { invariantId: "ENTRY_VALIDATES", dimension: "ARCHITECTURAL_FIT" as const,
        kind: "REQUIRED_CALL" as const, path: "src/scheduler.mjs", value: "validate" },
      ...paths.map((path) => ({ invariantId: `NO_GLOBAL_STATE:${path}`, dimension: "ARCHITECTURAL_FIT" as const,
        kind: "NO_GLOBAL_MUTABLE_STATE" as const, path })),
    ]) }), maxChanges: 4, maxPatchBytes: 24_576,
});
