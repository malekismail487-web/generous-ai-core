import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityV4Task } from "./nyx-quality-v4-fixtures";

export type NyxRepairFeedbackTask = Omit<NyxQualityV4Task, "provenance"> & {
  readonly provenance: "NYX_REPAIR_FEEDBACK_FRESH_2026_09_25";
};

const path = "src/compact-events.mjs";
const qualityPolicy: EngineeringQualityPolicy = Object.freeze({
  policyId: "NYX-REPAIR-FEEDBACK-COMPACT-EVENTS",
  allowedChangedPaths: [path], readonlyPaths: [], maxChangedFiles: 1,
  maxChangedLines: 70, maxCandidateBytes: 8_192, maxCyclomaticComplexity: 17,
  maxComplexityDelta: 13, maxNestingDepth: 5, maxAddedDeclarations: 6,
  invariants: [
    { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT",
      kind: "NO_PARAMETER_MUTATION", path },
    { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT",
      kind: "NO_GLOBAL_MUTABLE_STATE", path },
  ],
});

/** Frozen before live inference. Both arms receive exactly this task and oracle. */
export const NYX_REPAIR_FEEDBACK_TASK: NyxRepairFeedbackTask = Object.freeze({
  taskId: "NYX-FRESH-COMPACT-VERSIONED-EVENTS", taskClass: "LOGIC_EDGE_CASE",
  provenance: "NYX_REPAIR_FEEDBACK_FRESH_2026_09_25",
  objective: "Repair compactEvents(events). Each event is {key,revision,payload}, where key is a nonempty string, revision is a nonnegative safe integer, and payload is a string. For each key retain its highest-revision event. An exact duplicate key+revision+payload is idempotent; conflicting payloads at the same key and revision throw RangeError. Reject malformed input with RangeError. Return new {key,revision,payload} objects sorted lexicographically by key. Do not mutate the input or its members. Preserve the named ESM export.",
  initialDefect: "The implementation mutates input order and keeps the last arrival rather than the highest revision; it silently accepts conflicting same-revision payloads.",
  correctFiles: Object.freeze({ [path]: `export function compactEvents(events) {
  if (!Array.isArray(events)) throw new RangeError("invalid events");
  const latest = new Map();
  for (const event of events) {
    if (!event || typeof event.key !== "string" || event.key.length === 0
      || !Number.isSafeInteger(event.revision) || event.revision < 0
      || typeof event.payload !== "string") throw new RangeError("invalid event");
    const previous = latest.get(event.key);
    if (previous && previous.revision === event.revision
      && previous.payload !== event.payload) throw new RangeError("conflicting revision");
    if (!previous || event.revision > previous.revision) {
      latest.set(event.key, { key: event.key, revision: event.revision, payload: event.payload });
    }
  }
  return [...latest.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
` }),
  faultyFiles: Object.freeze({ [path]: `export function compactEvents(events) {
  const latest = new Map();
  events.sort((a, b) => a.key.localeCompare(b.key));
  for (const event of events) latest.set(event.key, event);
  return [...latest.values()];
}
` }),
  mutationPaths: Object.freeze([path]), initiallyAdmittedPaths: Object.freeze([path]),
  availableEvidence: Object.freeze([]),
  visibleVerifier: `import { compactEvents } from "../src/compact-events.mjs";
const events=[{key:"b",revision:3,payload:"new"},{key:"a",revision:0,payload:"a"},
  {key:"b",revision:1,payload:"old"}];
const before=JSON.stringify(events);
const result=compactEvents(events);
if(JSON.stringify(result)!==JSON.stringify([{key:"a",revision:0,payload:"a"},
  {key:"b",revision:3,payload:"new"}])||JSON.stringify(events)!==before)process.exit(2);
console.log("VISIBLE_PASS compact-events");
`,
  candidateModule: path, exportName: "compactEvents",
  hiddenCases: Object.freeze<HiddenEvaluationCase[]>([
    { caseId: "EMPTY", args: [[]], expectation: { kind: "RETURN", value: [] } },
    { caseId: "HIGHEST_NOT_LAST", args: [[{ key: "x", revision: 5, payload: "new" },
      { key: "x", revision: 2, payload: "old" }]], expectation: { kind: "RETURN",
      value: [{ key: "x", revision: 5, payload: "new" }] } },
    { caseId: "IDEMPOTENT", args: [[{ key: "x", revision: 1, payload: "same" },
      { key: "x", revision: 1, payload: "same" }]], expectation: { kind: "RETURN",
      value: [{ key: "x", revision: 1, payload: "same" }] } },
    { caseId: "CONFLICT", args: [[{ key: "x", revision: 1, payload: "left" },
      { key: "x", revision: 1, payload: "right" }]], expectation: { kind: "THROW", errorName: "RangeError" } },
    { caseId: "INVALID_REVISION", args: [[{ key: "x", revision: -1, payload: "bad" }]],
      expectation: { kind: "THROW", errorName: "RangeError" } },
    { caseId: "MALFORMED", args: [null], expectation: { kind: "THROW", errorName: "RangeError" } },
    { caseId: "SORTED", args: [[{ key: "z", revision: 0, payload: "z" },
      { key: "a", revision: 0, payload: "a" }]], expectation: { kind: "RETURN", value: [
      { key: "a", revision: 0, payload: "a" }, { key: "z", revision: 0, payload: "z" }] } },
  ]),
  qualityPolicy, maxChanges: 1, maxPatchBytes: 6_144,
});

export const NYX_REPAIR_FEEDBACK_COMPARISON = Object.freeze({
  chunkId: "OMEGA-NYX-REPAIR-FEEDBACK-DIAGNOSTIC-001",
  version: "nyx-repair-feedback-diagnostic/1",
  arms: Object.freeze(["DIAGNOSTIC_ONLY", "TRANSIENT_REJECTED_SOURCE_WINDOW"] as const),
  maxCognitionCyclesPerTask: 3, maxCandidateIterationsPerTask: 3,
  maxCognitionCorrectionsPerTask: 2, maxOutputTokensPerCall: 1_536,
  maxPromptBytesPerCall: 48_000, maxWallClockMsPerTask: 180_000,
  sourceRepresentation: "LINES", intentCompilationMode: "SAFE_CANONICALIZATION",
  repetitions: 1, authorityIncrease: false, defaultConfigurationChanged: false,
  stopAfterPairedTask: true, capabilityClaim: "INTERFACE_DIAGNOSTIC_ONLY",
});

/** Core source hashes are checked at execution; this suite cannot silently rescore after a change. */
export const NYX_REPAIR_FEEDBACK_FROZEN_CORE = Object.freeze({
  commit: "03abdcf7acf54afe52c3a435484037f93e64ecf5",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "b4254ef147ca1855a3ce969323411a6953f76eac37b89e0a775eec3ab7f6e6c8",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "cb0f1331436804e9595cbd341a9021baec3b09b7bdd0bd0106b99a92a5f291f6",
    "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts": "0d40820e9cc721992390184344aa00e8c37d7a9c44fefbe695a4742c1fa2a52a",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "3d6b24f088093b049b65284cce906adc74203d9d4a62f25fd8fc458410d55c0a",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "f4f1f180197e0a39c069816b8ecf6468bed38d4464404dae2c7a6df37e37e04b",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});
