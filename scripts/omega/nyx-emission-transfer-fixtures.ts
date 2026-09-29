import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";

/** Frozen before the first model-backed run. These tasks did not appear in the emission diagnostic. */
export const NYX_EMISSION_TRANSFER = Object.freeze({
  chunkId: "NYX-SOURCE-EMISSION-TRANSFER-001", version: "nyx-emission-transfer/1",
  arms: Object.freeze(["CURRENT", "REASONING_ENABLED"] as const),
  domainScope: Object.freeze(["DEPENDENCY_ORDERING", "IDEMPOTENT_STATE_REPLAY", "WEIGHTED_GRAPH_SEARCH"] as const),
  modelCallsPerTask: 3, candidateIterationsPerTask: 3, cognitionCorrectionsPerTask: 2,
  outputTokensPerCall: 3_072, wallClockMsPerTask: 240_000,
  sourceRepresentation: "TEXT" as const, intentCompilationMode: "SAFE_CANONICALIZATION" as const,
  repairFeedbackPolicy: "TRANSIENT_REJECTED_SOURCE_WINDOW" as const,
  authority: "DISPOSABLE_REPOSITORY_ONLY" as const, broadGeneralizationCertified: false,
});

export const NYX_EMISSION_TRANSFER_FROZEN_CORE = Object.freeze({
  commit: "ff459ec71c85079d432328b22751fb156d65ce29",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "b4254ef147ca1855a3ce969323411a6953f76eac37b89e0a775eec3ab7f6e6c8",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "cb0f1331436804e9595cbd341a9021baec3b09b7bdd0bd0106b99a92a5f291f6",
    "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts": "4f0dbb3d393d6e5c581e029aadd9a5c86372be6c4257b00cdb2e66ee61b167ff",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "3d6b24f088093b049b65284cce906adc74203d9d4a62f25fd8fc458410d55c0a",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "f4f1f180197e0a39c069816b8ecf6468bed38d4464404dae2c7a6df37e37e04b",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});

const provenance = "NYX_EMISSION_TRANSFER_FRESH_2026_09_29" as const;
function policy(id: string, path: string): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-EMISSION-TRANSFER-${id}`,
    allowedChangedPaths: Object.freeze([path]), readonlyPaths: Object.freeze([]),
    maxChangedFiles: 1, maxChangedLines: 100, maxCandidateBytes: 10_240,
    maxCyclomaticComplexity: 20, maxComplexityDelta: 16, maxNestingDepth: 5,
    maxAddedDeclarations: 10, invariants: Object.freeze([{ invariantId: "NO_INPUT_MUTATION",
      dimension: "ARCHITECTURAL_FIT" as const, kind: "NO_PARAMETER_MUTATION" as const, path }]) });
}

export const NYX_EMISSION_TRANSFER_TASKS: readonly NyxQualityV5Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-EMISSION-A-BUILD-ORDER", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair orderBuilds(jobs). Each job has a unique nonempty string id and a requires array of job ids. Return every id once in a dependency-before-dependent topological order. Whenever several jobs are ready, choose the lexicographically smallest id. Throw RangeError for malformed jobs, duplicate ids, unknown dependencies, or a dependency cycle. Ignore duplicate dependency entries. Do not mutate jobs or nested arrays; preserve the named ESM export.",
    initialDefect: "The implementation returns input order without satisfying dependencies or validating cycles.",
    correctFiles: Object.freeze({ "src/order-builds.mjs": `export function orderBuilds(jobs) {
  if (!Array.isArray(jobs)) throw new RangeError("invalid jobs");
  const byId = new Map();
  for (const job of jobs) {
    if (!job || typeof job.id !== "string" || !job.id || !Array.isArray(job.requires)
      || byId.has(job.id)) throw new RangeError("invalid job");
    byId.set(job.id, job);
  }
  const waiting = new Map();
  for (const [id, job] of byId) {
    if (job.requires.some((dep) => typeof dep !== "string" || !byId.has(dep))) {
      throw new RangeError("unknown dependency");
    }
    waiting.set(id, new Set(job.requires));
  }
  const result = [];
  while (waiting.size) {
    const ready = [...waiting].filter(([, deps]) => deps.size === 0)
      .map(([id]) => id).sort()[0];
    if (ready === undefined) throw new RangeError("dependency cycle");
    result.push(ready);
    waiting.delete(ready);
    for (const deps of waiting.values()) deps.delete(ready);
  }
  return result;
}
` }),
    faultyFiles: Object.freeze({ "src/order-builds.mjs": `export function orderBuilds(jobs) {
  return jobs.map((job) => job.id);
}
` }),
    mutationPaths: Object.freeze(["src/order-builds.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/order-builds.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { orderBuilds } from "../src/order-builds.mjs";
const jobs=[{id:"compile",requires:["parse"]},{id:"parse",requires:[]},{id:"test",requires:["compile"]}];
const before=JSON.stringify(jobs);
if(JSON.stringify(orderBuilds(jobs))!==JSON.stringify(["parse","compile","test"])||JSON.stringify(jobs)!==before)process.exit(2);
console.log("VISIBLE_PASS build-order");
`,
    candidateModule: "src/order-builds.mjs", exportName: "orderBuilds",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "LEXICAL", args: [[{ id: "z", requires: [] }, { id: "a", requires: [] }]],
        expectation: { kind: "RETURN", value: ["a", "z"] } },
      { caseId: "DUPLICATE_DEP", args: [[{ id: "b", requires: ["a", "a"] }, { id: "a", requires: [] }]],
        expectation: { kind: "RETURN", value: ["a", "b"] } },
      { caseId: "UNKNOWN", args: [[{ id: "a", requires: ["absent"] }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "CYCLE", args: [[{ id: "a", requires: ["b"] }, { id: "b", requires: ["a"] }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "DUPLICATE_ID", args: [[{ id: "a", requires: [] }, { id: "a", requires: [] }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("BUILD-ORDER", "src/order-builds.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-EMISSION-B-STOCK-REPLAY", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair replayStock(events). Events have nonempty string id and sku plus a safe-integer delta. Validate every event. Count only the first occurrence of each id; later duplicate ids are ignored. Process counted events in input order, maintaining per-sku stock starting at zero. Throw RangeError if any counted event would make stock negative at that moment, even if later events replenish it. Return an ordinary object containing final balances for all observed counted SKUs, with keys in lexicographic order. Do not mutate events; preserve the named ESM export.",
    initialDefect: "The implementation sums every event, including duplicate ids, and accepts temporary negative stock.",
    correctFiles: Object.freeze({ "src/replay-stock.mjs": `export function replayStock(events) {
  if (!Array.isArray(events)) throw new RangeError("invalid events");
  const seen = new Set();
  const stock = new Map();
  for (const event of events) {
    if (!event || typeof event.id !== "string" || !event.id
      || typeof event.sku !== "string" || !event.sku
      || !Number.isSafeInteger(event.delta)) throw new RangeError("invalid event");
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const balance = (stock.get(event.sku) ?? 0) + event.delta;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new RangeError("negative stock");
    stock.set(event.sku, balance);
  }
  return Object.fromEntries([...stock].sort(([a], [b]) => a.localeCompare(b)));
}
` }),
    faultyFiles: Object.freeze({ "src/replay-stock.mjs": `export function replayStock(events) {
  const totals = {};
  for (const event of events) totals[event.sku] = (totals[event.sku] ?? 0) + event.delta;
  return totals;
}
` }),
    mutationPaths: Object.freeze(["src/replay-stock.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/replay-stock.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { replayStock } from "../src/replay-stock.mjs";
const events=[{id:"x",sku:"a",delta:3},{id:"x",sku:"a",delta:100},{id:"y",sku:"a",delta:-2}];
const before=JSON.stringify(events);
if(JSON.stringify(replayStock(events))!==JSON.stringify({a:1})||JSON.stringify(events)!==before)process.exit(2);
console.log("VISIBLE_PASS stock-replay");
`,
    candidateModule: "src/replay-stock.mjs", exportName: "replayStock",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: {} } },
      { caseId: "SORTED", args: [[{ id: "1", sku: "z", delta: 2 }, { id: "2", sku: "a", delta: 1 }]],
        expectation: { kind: "RETURN", value: { a: 1, z: 2 } } },
      { caseId: "TEMP_NEGATIVE", args: [[{ id: "1", sku: "a", delta: -1 }, { id: "2", sku: "a", delta: 2 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "DUPLICATE", args: [[{ id: "1", sku: "a", delta: 1 }, { id: "1", sku: "b", delta: 5 }]],
        expectation: { kind: "RETURN", value: { a: 1 } } },
      { caseId: "INVALID", args: [[{ id: "1", sku: "a", delta: 0.5 }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "OVERFLOW", args: [[{ id: "1", sku: "a", delta: Number.MAX_SAFE_INTEGER },
        { id: "2", sku: "a", delta: 1 }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("STOCK-REPLAY", "src/replay-stock.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    taskId: "NYX-EMISSION-C-ROUTE-COST", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair cheapestRoute(edges, start, goal). Edges are directed and have nonempty string from/to labels; start and goal are nonempty strings. Each cost must be a finite nonnegative number, otherwise throw RangeError. Return {cost,path} for the minimum-cost route, where path lists nodes from start to goal. Among equal-cost routes choose the lexicographically smallest joined path. Return null if unreachable. start===goal returns {cost:0,path:[start]}. Do not mutate edges; preserve the named ESM export.",
    initialDefect: "The implementation only inspects one direct edge and cannot traverse or resolve equal-cost routes.",
    correctFiles: Object.freeze({ "src/cheapest-route.mjs": `export function cheapestRoute(edges, start, goal) {
  if (!Array.isArray(edges) || !start || !goal) throw new RangeError("invalid route");
  for (const edge of edges) {
    if (!Number.isFinite(edge.cost) || edge.cost < 0) throw new RangeError("invalid edge");
  }
  const pending = [{ node: start, cost: 0, path: [start] }];
  const settled = new Set();
  while (pending.length) {
    pending.sort((a, b) => a.cost - b.cost
      || a.path.join("\\0").localeCompare(b.path.join("\\0")));
    const current = pending.shift();
    if (settled.has(current.node)) continue;
    if (current.node === goal) return { cost: current.cost, path: current.path };
    settled.add(current.node);
    for (const edge of edges) {
      if (edge.from === current.node && !settled.has(edge.to)) {
        pending.push({ node: edge.to, cost: current.cost + edge.cost,
          path: [...current.path, edge.to] });
      }
    }
  }
  return null;
}
` }),
    faultyFiles: Object.freeze({ "src/cheapest-route.mjs": `export function cheapestRoute(edges, start, goal) {
  const direct = edges.find((edge) => edge.from === start && edge.to === goal);
  return direct ? { cost: direct.cost, path: [start, goal] } : null;
}
` }),
    mutationPaths: Object.freeze(["src/cheapest-route.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/cheapest-route.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { cheapestRoute } from "../src/cheapest-route.mjs";
const edges=[{from:"a",to:"b",cost:2},{from:"b",to:"c",cost:1},{from:"a",to:"c",cost:9}];
const before=JSON.stringify(edges);
if(JSON.stringify(cheapestRoute(edges,"a","c"))!==JSON.stringify({cost:3,path:["a","b","c"]})||JSON.stringify(edges)!==before)process.exit(2);
console.log("VISIBLE_PASS route-cost");
`,
    candidateModule: "src/cheapest-route.mjs", exportName: "cheapestRoute",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "IDENTITY", args: [[], "a", "a"],
        expectation: { kind: "RETURN", value: { cost: 0, path: ["a"] } } },
      { caseId: "UNREACHABLE", args: [[{ from: "a", to: "b", cost: 1 }], "b", "a"],
        expectation: { kind: "RETURN", value: null } },
      { caseId: "CHEAPER_CHAIN", args: [[{ from: "a", to: "c", cost: 10 },
        { from: "a", to: "b", cost: 2 }, { from: "b", to: "c", cost: 3 }], "a", "c"],
        expectation: { kind: "RETURN", value: { cost: 5, path: ["a", "b", "c"] } } },
      { caseId: "TIE", args: [[{ from: "a", to: "c", cost: 1 }, { from: "a", to: "b", cost: 1 },
        { from: "b", to: "z", cost: 1 }, { from: "c", to: "z", cost: 1 }], "a", "z"],
        expectation: { kind: "RETURN", value: { cost: 2, path: ["a", "b", "z"] } } },
      { caseId: "INVALID_WEIGHT", args: [[{ from: "a", to: "b", cost: -1 }], "a", "b"],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "ZERO_CYCLE", args: [[{ from: "a", to: "b", cost: 0 }, { from: "b", to: "a", cost: 0 },
        { from: "b", to: "c", cost: 1 }], "a", "c"],
        expectation: { kind: "RETURN", value: { cost: 1, path: ["a", "b", "c"] } } },
    ]), qualityPolicy: policy("ROUTE-COST", "src/cheapest-route.mjs"), maxChanges: 1, maxPatchBytes: 7_168,
  }),
]);
