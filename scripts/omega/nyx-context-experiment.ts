import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { RepositoryContextQuery } from "../../src/lib/codelab/repository/groundedRepositoryContext";
import type { NyxQualityV4Task } from "./nyx-quality-v4-fixtures";
import { NYX_SCHEDULER_FROZEN_CORE } from "./nyx-scheduler-challenge";

export const NYX_CONTEXT_EXPERIMENT = Object.freeze({
  chunkId: "NYX-GROUNDED-ENGINEERING-001", version: "nyx-context-ablation/1",
  hypothesis: "Dependency context reduces evidence-seeking cost without weakening independent acceptance.",
  falsification: "No reliable improvement, worse cost, or any authority/acceptance regression in matched-budget trials.",
  taskPopulation: "ONE_AUTHOR_CONSTRUCTED_SCIENTIFIC_COMPUTING_DIAGNOSTIC_TWO_CONTEXT_ARMS",
  privateHoldout: false, broadGeneralizationAssessed: false, causalBenefitEstablished: false,
  maxCognitionCycles: 3, maxOutputTokensPerCall: 4096, maxWallClockMs: 300_000,
  maxPromptBytesPerCall: 48_000, maxCumulativeOutputTokens: 24_576,
  contextMaxFiles: 2, contextMaxBytes: 8000, maxSnapshots: 4,
  contextComputeMatched: "SAME_CEILINGS_ACTUAL_INDEXING_READS_BYTES_AND_MODEL_USAGE_REPORTED",
  studyCoverage: { direct: ["BASE-12-RETRIEVAL", "VI-EXPERIMENTS", "IX-STRUCTURE", "DRAFT-LAYER-1", "DRAFT-LAYER-2"],
    supporting: ["IV-ADVERSARIAL-VERIFICATION", "DRAFT-LAYER-0", "REALITY_OVER_PREDICTION"],
    deferred: ["PHYSICAL_INSTRUMENTS", "OPEN_ENDED_DISCOVERY", "LEARNED_RETRIEVAL", "WEIGHT_UPDATES"],
    conflicts: [], superseded: [], status: "PARTIAL_JUST_IN_TIME" },
} as const);

// New cognition epoch. Original fixtures, scores and v1 core pins remain untouched.
export const NYX_CONTEXT_REPAIR_EXPERIMENT = Object.freeze({
  ...NYX_CONTEXT_EXPERIMENT, chunkId: "NYX-MEASURED-REJECTION-REPAIR-001", version: "nyx-context-repair/2",
  hypothesis: "Precise bounded rejection measurements improve source-quality correction under unchanged acceptance and budgets.",
  falsification: "Repeated source-quality rejection, no reproducible correction benefit, or any acceptance/authority regression.",
  comparisonBaselineCommit: "f31d149d5c2e00a844aae178419ff614842783e2",
  comparisonBaselineRun: "34481454745", historicalScoresUnchanged: true,
  isolatedVariable: "COGNITION_REJECTION_MEASUREMENTS_AND_PROTOCOL_VERSION",
  studyCoverage: { direct: ["STUDY-1:199,227-230", "STUDY-3:7-10,124-125", "STUDY-5:11,183-196"],
    supporting: ["STUDY-3:47,56,156", "STUDY-5:201-213,625-650"],
    deferred: ["REJECTED_SOURCE_CONTEXT_RETENTION", "WEIGHTS", "PHYSICAL_INSTRUMENTS", "BROAD_GENERALIZATION"],
    conflicts: ["PRECISE_MEASUREMENTS_DO_NOT_PROVE_MODEL_REPAIR_SUCCESS"],
    superseded: ["LOCATION_FREE_LINE_LENGTH_FEEDBACK"], status: "PARTIAL_JUST_IN_TIME" },
} as const);

export const NYX_CONTEXT_REPAIR_FROZEN_CORE = Object.freeze({
  // The runtime report records the actual commit; this precommitted manifest pins content, not an invented commit.
  commit: null, serialization: NYX_SCHEDULER_FROZEN_CORE.serialization,
  files: Object.freeze({ ...NYX_SCHEDULER_FROZEN_CORE.files,
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "4e0d147a7042698db5562aae64db362c4dcba3cda56adbfcb4f7bb91be3dd607",
  }),
});

export interface NyxContextTask extends Omit<NyxQualityV4Task, "provenance"> {
  readonly provenance: "AUTHOR_CONSTRUCTED_CONTEXT_DIAGNOSTIC_NOT_PRIVATE_HOLDOUT";
  readonly contextMode: RepositoryContextQuery["mode"];
}

const summary = `import { observeReading, round } from "./opaque.mjs";

export function summarize(readings, calibration, unit) {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new RangeError("empty or malformed readings");
  }
  const observations = readings.map((reading) => observeReading(reading, calibration, unit));
  const count = observations.length;
  const total = observations.reduce((sum, item) => sum + item.value, 0);
  const variance = observations.reduce((sum, item) => sum + item.variance, 0);
  return {
    values: observations.map((item) => round(item.value)),
    mean: round(total / count),
    standardUncertainty: round(Math.sqrt(variance) / count),
  };
}
`;
const opaque = `// This is the immutable measurement contract, not an evaluator or a reference solution.
export const round = (value) => Number(value.toFixed(9));

export function observeReading(reading, calibration, unit) {
  const scalars = [reading?.raw, reading?.uncertainty, calibration?.gain, calibration?.offset];
  if (!scalars.every(Number.isFinite) || reading.uncertainty < 0
    || calibration.gain === 0 || !["V", "mV"].includes(unit)) {
    throw new RangeError("invalid measurement");
  }
  const scale = unit === "mV" ? 0.001 : 1;
  const value = (reading.raw * calibration.gain + calibration.offset) * scale;
  const sigma = Math.abs(calibration.gain) * reading.uncertainty * scale;
  if (!Number.isFinite(value) || !Number.isFinite(sigma * sigma)) {
    throw new RangeError("measurement overflow");
  }
  return { value, variance: sigma * sigma };
}
`;
const faulty = summary.replace("round(total / count)", "round(total)")
  .replace("round(Math.sqrt(variance) / count)", "round(Math.sqrt(variance / count))");
const correctFiles = Object.freeze({
  "src/summary.mjs": summary,
  "src/opaque.mjs": opaque,
  "src/presentation.mjs": `// summarize readings calibration unit mean standardUncertainty independent uncertainty variance values
// Repair measurement batches voltage millivolts gain offset round immutable reject malformed empty inputs
export const presentationLabel = "Measurement summary";
`,
});
const r = (raw: number, uncertainty: number) => ({ raw, uncertainty });
const c = (gain: number, offset = 0) => ({ gain, offset });
function returns(caseId: string, args: readonly unknown[], value: unknown): HiddenEvaluationCase {
  return { caseId, args, expectation: { kind: "RETURN", value, argsAfter: args } };
}
function rejects(caseId: string, args: readonly unknown[]): HiddenEvaluationCase {
  return { caseId, args, expectation: { kind: "THROW", errorName: "RangeError" } };
}
// Hand-calculated constants; no call to the reference implementation generates expected values.
const hiddenCases: readonly HiddenEvaluationCase[] = Object.freeze([
  returns("negative-gain", [[r(2, 3), r(4, 4)], c(-2, 10), "V"],
    { values: [6, 2], mean: 4, standardUncertainty: 5 }),
  returns("millivolt-scale", [[r(2000, 300), r(4000, 400)], c(2, 1000), "mV"],
    { values: [5, 9], mean: 7, standardUncertainty: 0.5 }),
  returns("single-reading", [[r(3, 0.5)], c(4, 1), "V"],
    { values: [13], mean: 13, standardUncertainty: 2 }),
  returns("unequal-sigmas", [[r(0, 0), r(6, 0), r(3, 6)], c(1), "V"],
    { values: [0, 6, 3], mean: 3, standardUncertainty: 2 }),
  returns("zero-uncertainty", [[r(-2, 0), r(2, 0)], c(1), "V"],
    { values: [-2, 2], mean: 0, standardUncertainty: 0 }),
  returns("permutation", [[r(4, 4), r(2, 3)], c(-2, 10), "V"],
    { values: [2, 6], mean: 4, standardUncertainty: 5 }),
  returns("offset-shift", [[r(2, 3), r(4, 4)], c(-2, 14), "V"],
    { values: [10, 6], mean: 8, standardUncertainty: 5 }),
  returns("replicated-independent-four", [[r(2, 1), r(2, 1), r(2, 1), r(2, 1)], c(1), "V"],
    { values: [2, 2, 2, 2], mean: 2, standardUncertainty: 0.5 }),
  rejects("empty", [[], c(1), "V"]),
  rejects("malformed-array", [null, c(1), "V"]),
  rejects("negative-uncertainty", [[r(2, -1)], c(1), "V"]),
  rejects("unsupported-unit", [[r(2, 1)], c(1), "kV"]),
  rejects("zero-gain", [[r(2, 1)], c(0), "V"]),
  rejects("non-numeric-reading", [[{ raw: "3", uncertainty: 1 }], c(1), "V"]),
  rejects("missing-calibration", [[r(2, 1)], null, "V"]),
]);

export const NYX_CONTEXT_TASKS: readonly NyxContextTask[] = Object.freeze(
  (["LEXICAL", "DEPENDENCY_AUGMENTED"] as const).map((contextMode) => ({
    taskId: `NYX-CONTEXT-${contextMode.replaceAll("_", "-")}`,
    taskClass: "MULTI_FILE_INTERACTION" as const,
    provenance: "AUTHOR_CONSTRUCTED_CONTEXT_DIAGNOSTIC_NOT_PRIVATE_HOLDOUT" as const,
    contextMode,
    objective: "Repair summarize(readings, calibration, unit). Use the immutable observeReading contract to calibrate "
      + "independent measurements and convert V/mV to volts. Return values in input order, their arithmetic mean, "
      + "and standardUncertainty of that mean from independent known measurement uncertainties (not sample scatter). "
      + "Round only returned numbers using the existing round helper. Preserve caller inputs and the module interface. "
      + "Reject malformed or empty batches and preserve measurement validation. Do not edit dependency contracts or tests.",
    initialDefect: "Aggregation confuses total with mean and propagated mean uncertainty with per-reading RMS uncertainty.",
    correctFiles, faultyFiles: Object.freeze({ "src/summary.mjs": faulty }),
    mutationPaths: ["src/summary.mjs"], initiallyAdmittedPaths: ["src/summary.mjs"], availableEvidence: [],
    visibleVerifier: `import assert from "node:assert/strict";
import { summarize } from "../src/summary.mjs";
const input = [{raw: 2, uncertainty: 3}, {raw: 4, uncertainty: 4}];
assert.deepEqual(summarize(input, {gain: 1, offset: 0}, "V"),
  {values: [2, 4], mean: 3, standardUncertainty: 2.5});
console.log("VISIBLE_PASS calibrated summary");
`,
    candidateModule: "src/summary.mjs", exportName: "summarize", hiddenCases,
    qualityPolicy: { policyId: "CONTEXT-MEASUREMENT-QUALITY-1", allowedChangedPaths: ["src/summary.mjs"],
      readonlyPaths: ["src/opaque.mjs", "src/presentation.mjs"], maxChangedFiles: 1, maxChangedLines: 30,
      maxCandidateBytes: 8192, maxCyclomaticComplexity: 12, maxComplexityDelta: 3, maxNestingDepth: 4,
      maxAddedDeclarations: 2, invariants: [{ invariantId: "immutable-contract-call", kind: "REQUIRED_CALL" as const,
        dimension: "ARCHITECTURAL_FIT" as const, path: "src/summary.mjs", value: "observeReading" }] },
    maxChanges: 1, maxPatchBytes: 4096,
  })),
);

export const NYX_CONTEXT_MUTANTS = Object.freeze([
  { id: "total-not-mean", before: "round(total / count)", after: "round(total)" },
  { id: "rms-not-mean-uncertainty", before: "Math.sqrt(variance) / count", after: "Math.sqrt(variance / count)" },
  { id: "variance-not-sigma", before: "Math.sqrt(variance) / count", after: "variance / count" },
  { id: "duplicate-count", before: "const count = observations.length;", after: "const count = 1;" },
  { id: "visible-case-hardcode", before: "round(total / count)", after: "3" },
  { id: "mutate-input", before: "const count = observations.length;", after: "readings.reverse();\n  const count = observations.length;" },
]);
