import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV4Task } from "./nyx-quality-v4-fixtures";

export type NyxFreshCircuitTask = Omit<NyxQualityV4Task, "provenance"> & {
  readonly provenance: "NYX_CIRCUIT_FRESH_TOPICS_2026_09_25";
  readonly topic: "LEDGER" | "DEPENDENCIES";
};

const provenance = "NYX_CIRCUIT_FRESH_TOPICS_2026_09_25" as const;

function policy(id: string, path: string): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-FRESH-CIRCUIT-${id}`, allowedChangedPaths: [path], readonlyPaths: [],
    maxChangedFiles: 1, maxChangedLines: 80, maxCandidateBytes: 8_192,
    maxCyclomaticComplexity: 20, maxComplexityDelta: 16, maxNestingDepth: 5, maxAddedDeclarations: 8,
    invariants: [{ invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT",
      kind: "NO_PARAMETER_MUTATION", path },
    { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT",
      kind: "NO_GLOBAL_MUTABLE_STATE", path }],
  });
}

/** Both topics are frozen before the first model call. They are diagnostics, not a generalization certificate. */
export const NYX_FRESH_CIRCUIT_TOPICS: readonly NyxFreshCircuitTask[] = Object.freeze([
  Object.freeze({
    topic: "LEDGER", taskId: "NYX-FRESH-LEDGER-RECONCILIATION", taskClass: "LOGIC_EDGE_CASE",
    provenance,
    objective: "Repair reconcileLedger(checkpoint,events). A checkpoint has finite safe-integer balance and nonnegative integer lastSequence. Each event has a nonempty string id, integer sequence greater than lastSequence, and finite safe-integer delta. Process events in ascending sequence. Exact repeated id+sequence+delta is idempotent; a repeated id with different data or a shared sequence with different ids throws RangeError. Reject malformed input and unsafe balance overflow with RangeError. Return {balance,appliedIds} with ids in applied sequence order. Preserve the named ESM export and never mutate inputs.",
    initialDefect: "The implementation processes arrival order, double-counts repeats, and mutates the events array.",
    correctFiles: Object.freeze({ "src/reconcile-ledger.mjs": `export function reconcileLedger(checkpoint, events) {
  if (!checkpoint || !Number.isSafeInteger(checkpoint.balance)
    || !Number.isSafeInteger(checkpoint.lastSequence) || checkpoint.lastSequence < 0
    || !Array.isArray(events)) throw new RangeError("invalid ledger input");
  const byId = new Map();
  const bySequence = new Map();
  for (const event of events) {
    if (!event || typeof event.id !== "string" || event.id.length === 0
      || !Number.isSafeInteger(event.sequence) || event.sequence <= checkpoint.lastSequence
      || !Number.isSafeInteger(event.delta)) throw new RangeError("invalid event");
    const priorId = byId.get(event.id);
    if (priorId) {
      if (priorId.sequence !== event.sequence || priorId.delta !== event.delta) {
        throw new RangeError("conflicting event id");
      }
      continue;
    }
    if (bySequence.has(event.sequence)) throw new RangeError("conflicting sequence");
    const normalized = { id: event.id, sequence: event.sequence, delta: event.delta };
    byId.set(event.id, normalized);
    bySequence.set(event.sequence, normalized);
  }
  const ordered = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  let balance = checkpoint.balance;
  const appliedIds = [];
  for (const event of ordered) {
    balance += event.delta;
    if (!Number.isSafeInteger(balance)) throw new RangeError("unsafe balance");
    appliedIds.push(event.id);
  }
  return { balance, appliedIds };
}
` }),
    faultyFiles: Object.freeze({ "src/reconcile-ledger.mjs": `export function reconcileLedger(checkpoint, events) {
  events.sort((a, b) => a.sequence - b.sequence);
  return { balance: events.reduce((sum, event) => sum + event.delta, checkpoint.balance),
    appliedIds: events.map((event) => event.id) };
}
` }),
    mutationPaths: Object.freeze(["src/reconcile-ledger.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/reconcile-ledger.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { reconcileLedger } from "../src/reconcile-ledger.mjs";
const checkpoint={balance:10,lastSequence:2};
const events=[{id:"b",sequence:4,delta:-3},{id:"a",sequence:3,delta:5},
  {id:"a",sequence:3,delta:5}];
const before=JSON.stringify(events);
const result=reconcileLedger(checkpoint,events);
if(JSON.stringify(result)!==JSON.stringify({balance:12,appliedIds:["a","b"]})
  ||JSON.stringify(events)!==before)process.exit(2);
console.log("VISIBLE_PASS ledger");
`,
    candidateModule: "src/reconcile-ledger.mjs", exportName: "reconcileLedger",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [{ balance: 7, lastSequence: 0 }, []],
        expectation: { kind: "RETURN", value: { balance: 7, appliedIds: [] } } },
      { caseId: "OUT_OF_ORDER", args: [{ balance: 4, lastSequence: 1 }, [
        { id: "c", sequence: 7, delta: 2 }, { id: "a", sequence: 3, delta: 4 },
        { id: "b", sequence: 5, delta: -1 }]],
      expectation: { kind: "RETURN", value: { balance: 9, appliedIds: ["a", "b", "c"] } } },
      { caseId: "IDEMPOTENT", args: [{ balance: 0, lastSequence: 0 }, [
        { id: "x", sequence: 1, delta: 3 }, { id: "x", sequence: 1, delta: 3 }]],
      expectation: { kind: "RETURN", value: { balance: 3, appliedIds: ["x"] } } },
      { caseId: "ID_CONFLICT", args: [{ balance: 0, lastSequence: 0 }, [
        { id: "x", sequence: 1, delta: 3 }, { id: "x", sequence: 2, delta: 3 }]],
      expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "SEQUENCE_CONFLICT", args: [{ balance: 0, lastSequence: 0 }, [
        { id: "x", sequence: 1, delta: 3 }, { id: "y", sequence: 1, delta: 3 }]],
      expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "UNSAFE_SUM", args: [{ balance: Number.MAX_SAFE_INTEGER, lastSequence: 0 }, [
        { id: "x", sequence: 1, delta: 1 }]], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "STALE_SEQUENCE", args: [{ balance: 0, lastSequence: 4 }, [
        { id: "x", sequence: 4, delta: 1 }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("LEDGER", "src/reconcile-ledger.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
  Object.freeze({
    topic: "DEPENDENCIES", taskId: "NYX-FRESH-DEPENDENCY-LAYERS", taskClass: "STATE_CONTROL_FLOW",
    provenance,
    objective: "Repair dependencyLayers(tasks) for an array of {id,dependsOn}. Return deterministic topological layers of ids, with ids within each layer sorted lexicographically; a task belongs to the earliest layer after all its dependencies. Reject duplicate/empty ids, malformed dependency lists, unknown or self dependencies, and cycles with RangeError. Return [] for no tasks. Preserve the named ESM export and never mutate tasks or their dependency arrays.",
    initialDefect: "The implementation ignores dependencies, returns arrival-order tasks in one layer, and accepts cycles.",
    correctFiles: Object.freeze({ "src/dependency-layers.mjs": `export function dependencyLayers(tasks) {
  if (!Array.isArray(tasks)) throw new RangeError("invalid tasks");
  const pending = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || task.id.length === 0
      || !Array.isArray(task.dependsOn) || pending.has(task.id)
      || task.dependsOn.some((id) => typeof id !== "string" || id.length === 0)) {
      throw new RangeError("invalid task");
    }
    pending.set(task.id, new Set(task.dependsOn));
  }
  for (const [id, dependencies] of pending) {
    for (const dependency of dependencies) {
      if (dependency === id || !pending.has(dependency)) throw new RangeError("invalid dependency");
    }
  }
  const layers = [];
  const completed = new Set();
  while (pending.size > 0) {
    const ready = [...pending.entries()]
      .filter(([, dependencies]) => [...dependencies].every((dependency) => completed.has(dependency)))
      .map(([id]) => id).sort();
    if (ready.length === 0) throw new RangeError("cyclic dependencies");
    layers.push(ready);
    for (const id of ready) pending.delete(id);
    for (const id of ready) completed.add(id);
  }
  return layers;
}
` }),
    faultyFiles: Object.freeze({ "src/dependency-layers.mjs": `export function dependencyLayers(tasks) {
  return [tasks.map((task) => task.id)];
}
` }),
    mutationPaths: Object.freeze(["src/dependency-layers.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/dependency-layers.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { dependencyLayers } from "../src/dependency-layers.mjs";
const tasks=[{id:"deploy",dependsOn:["test"]},{id:"build",dependsOn:[]},
  {id:"test",dependsOn:["build"]},{id:"lint",dependsOn:[]}];
const before=JSON.stringify(tasks);
const layers=dependencyLayers(tasks);
if(JSON.stringify(layers)!==JSON.stringify([["build","lint"],["test"],["deploy"]])
  ||JSON.stringify(tasks)!==before)process.exit(2);
console.log("VISIBLE_PASS dependencies");
`,
    candidateModule: "src/dependency-layers.mjs", exportName: "dependencyLayers",
    hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
      { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
      { caseId: "INDEPENDENT_SORT", args: [[{ id: "z", dependsOn: [] }, { id: "a", dependsOn: [] }]],
        expectation: { kind: "RETURN", value: [["a", "z"]] } },
      { caseId: "DIAMOND", args: [[{ id: "done", dependsOn: ["left", "right"] },
        { id: "right", dependsOn: ["root"] }, { id: "left", dependsOn: ["root"] },
        { id: "root", dependsOn: [] }]],
      expectation: { kind: "RETURN", value: [["root"], ["left", "right"], ["done"]] } },
      { caseId: "CYCLE", args: [[{ id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: ["a"] }]], expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "UNKNOWN", args: [[{ id: "a", dependsOn: ["missing"] }]],
        expectation: { kind: "THROW", errorName: "RangeError" } },
      { caseId: "DUPLICATE", args: [[{ id: "a", dependsOn: [] },
        { id: "a", dependsOn: [] }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]),
    qualityPolicy: policy("DEPENDENCIES", "src/dependency-layers.mjs"), maxChanges: 1, maxPatchBytes: 6_144,
  }),
]);

export function freshCircuitTopic(topic: "LEDGER" | "DEPENDENCIES"): NyxFreshCircuitTask {
  const task = NYX_FRESH_CIRCUIT_TOPICS.find((candidate) => candidate.topic === topic);
  if (!task) throw new Error("nyx_fresh_circuit_topic_unknown");
  return task;
}
