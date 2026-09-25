import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV4Task } from "./nyx-quality-v4-fixtures";
import { NYX_REPAIR_FEEDBACK_FROZEN_CORE } from "./nyx-repair-feedback-diagnostic";

export type NyxRepairFeedbackTransferTask = Omit<NyxQualityV4Task, "provenance"> & {
  readonly provenance: "NYX_REPAIR_FEEDBACK_TRANSFER_2026_09_25";
};

const path = "src/select-latest.mjs";
const qualityPolicy: EngineeringQualityPolicy = Object.freeze({
  policyId: "NYX-REPAIR-FEEDBACK-TRANSFER-SELECT-LATEST",
  allowedChangedPaths: [path], readonlyPaths: [], maxChangedFiles: 1,
  maxChangedLines: 50, maxCandidateBytes: 8_192, maxCyclomaticComplexity: 12,
  maxComplexityDelta: 8, maxNestingDepth: 4, maxAddedDeclarations: 6,
  invariants: [{ invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT",
    kind: "NO_PARAMETER_MUTATION", path }],
});

/** New task distribution; the prior scored task and outcome remain untouched. */
export const NYX_REPAIR_FEEDBACK_TRANSFER_TASK: NyxRepairFeedbackTransferTask = Object.freeze({
  taskId: "NYX-FRESH-SELECT-LATEST-RECORDS", taskClass: "STATE_CONTROL_FLOW",
  provenance: "NYX_REPAIR_FEEDBACK_TRANSFER_2026_09_25",
  objective: "Repair selectLatest(records). Inputs are arrays of records {id,version,value} with nonempty string id, nonnegative safe-integer version, and string value. For each id return a fresh object holding the greatest version, sorted lexicographically by id. Identical duplicate id+version+value is idempotent. Same id+version with different value throws RangeError. Never mutate the input array or its objects. Preserve the named ESM export.",
  initialDefect: "The implementation retains the last arrival even if its version is older, silently accepts a same-version conflict, and returns references to caller-owned objects.",
  correctFiles: Object.freeze({ [path]: `export function selectLatest(records) {
  const latest = new Map();
  for (const record of records) {
    const previous = latest.get(record.id);
    if (previous && previous.version === record.version && previous.value !== record.value) {
      throw new RangeError("conflicting version");
    }
    if (!previous || record.version > previous.version) latest.set(record.id,
      { id: record.id, version: record.version, value: record.value });
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}
` }),
  faultyFiles: Object.freeze({ [path]: `export function selectLatest(records) {
  const latest = new Map();
  for (const record of records) latest.set(record.id, record);
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}
` }),
  mutationPaths: Object.freeze([path]), initiallyAdmittedPaths: Object.freeze([path]),
  availableEvidence: Object.freeze([]),
  visibleVerifier: `import { selectLatest } from "../src/select-latest.mjs";
const records=[{id:"b",version:3,value:"new"},{id:"a",version:0,value:"a"},
  {id:"b",version:1,value:"old"}];
const before=JSON.stringify(records);
const result=selectLatest(records);
if(JSON.stringify(result)!==JSON.stringify([{id:"a",version:0,value:"a"},
  {id:"b",version:3,value:"new"}])||JSON.stringify(records)!==before)process.exit(2);
console.log("VISIBLE_PASS select-latest");
`,
  candidateModule: path, exportName: "selectLatest",
  hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
    { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
    { caseId: "HIGH_NOT_LAST", args: [[{ id: "x", version: 7, value: "high" },
      { id: "x", version: 2, value: "low" }]], expectation: { kind: "RETURN",
      value: [{ id: "x", version: 7, value: "high" }] } },
    { caseId: "SAME_VERSION", args: [[{ id: "x", version: 1, value: "same" },
      { id: "x", version: 1, value: "same" }]], expectation: { kind: "RETURN",
      value: [{ id: "x", version: 1, value: "same" }] } },
    { caseId: "CONFLICT", args: [[{ id: "x", version: 1, value: "left" },
      { id: "x", version: 1, value: "right" }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    { caseId: "ORDER", args: [[{ id: "z", version: 0, value: "z" },
      { id: "a", version: 0, value: "a" }]], expectation: { kind: "RETURN", value: [
      { id: "a", version: 0, value: "a" }, { id: "z", version: 0, value: "z" }] } },
  ]),
  qualityPolicy, maxChanges: 1, maxPatchBytes: 6_144,
});

export const NYX_REPAIR_FEEDBACK_TRANSFER = Object.freeze({
  chunkId: "OMEGA-NYX-REPAIR-FEEDBACK-TRANSFER-001", version: "nyx-repair-feedback-transfer/1",
  arms: Object.freeze(["DIAGNOSTIC_ONLY", "TRANSIENT_REJECTED_SOURCE_WINDOW"] as const),
  taskCount: 1, repetitions: 1, maxCognitionCyclesPerTask: 3, maxOutputTokensPerCall: 1_536,
  authorityIncrease: false, defaultConfigurationChanged: false,
  frozenCore: NYX_REPAIR_FEEDBACK_FROZEN_CORE,
});
