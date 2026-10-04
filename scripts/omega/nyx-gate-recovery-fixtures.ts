import type { QualityInvariant } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT } from "../../src/lib/codelab/assurance/candidateEngineeringAdmission";
import type { NyxQualityV5Task } from "./nyx-quality-v5-fixtures";
import { NYX_ADMISSION_GUIDANCE, NYX_ADMISSION_GUIDANCE_FROZEN_CORE,
  NYX_ADMISSION_GUIDANCE_TASKS } from "./nyx-admission-guidance-fixtures";

/** Reissued source instances, same functional oracles. Not comparable to the earlier tiny-stub baselines. */
export const NYX_GATE_RECOVERY = Object.freeze({ ...NYX_ADMISSION_GUIDANCE,
  chunkId: "NYX-PUBLIC-IMMUTABILITY-REPAIR-001", version: "nyx-gate-recovery/2",
  sourceInstanceScope: "NEW_MODULAR_BASELINES_SAME_PREDECLARED_FUNCTIONAL_ORACLES",
  comparedWithHistoricalRun: false,
  previousEvaluatedCandidate: "33829c4c71b35aef6707e30f0f50e30b9804accd",
});
export const NYX_GATE_RECOVERY_FROZEN_CORE = Object.freeze({
  commit: "8d5c671267a8ff805907d2c65c9b28def65d0fe5",
  files: Object.freeze({ ...NYX_ADMISSION_GUIDANCE_FROZEN_CORE.files,
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "e501022e0c82a3602d127f1cfee77082fc1e571cb494841b6137726d3ef74f60",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "e7621acc7573111877c66afadb2404cb108c0786929c9898ccefaa1dd6edd9cd",
  }),
});

// The historical scored core above stays immutable. This explicit transport-only
// revision is not eligible for comparison using that historical core identity.
export const NYX_GATE_RECOVERY_TRANSPORT_REVISION = Object.freeze({
  chunkId: "NYX-PROVIDER-RECOVERY-001", predecessor: NYX_GATE_RECOVERY_FROZEN_CORE.commit,
  changedPath: "src/lib/codelab/model/nvidiaNimProvider.ts",
  sourceSha256: "75fd8f9d3726d65aa3a1e8fb855af88ae44b140c508c840a7159ea4daf055493",
  changedBehavior: "HONOR_TRANSIENT_RETRY_AFTER_AND_SHARE_EXHAUSTED_COOLDOWN",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
});
export const NYX_GATE_RECOVERY_DEADLINE_REVISION = Object.freeze({
  chunkId: "NYX-PROVIDER-DEADLINE-001", predecessor: "a5d08fc29e1e18cb760d1cbf7617ccf4d2831c9c",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "21edc5ca21bbb735e8175ac350ee148fac3af43f638df620ab0cb8446b04c388",
  changedBehavior: "BOUNDED_TRANSPORT_AND_BODY_SETTLEMENT_WITH_NONBLOCKING_ERROR_CLEANUP",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
});
// Separate delivery revision: old scored sources and score identities stay pinned.
export const NYX_GATE_RECOVERY_SERVER_ERROR_REVISION = Object.freeze({
  chunkId: "NYX-PROVIDER-SERVER-ERROR-RECOVERY-001", predecessor: "1e98f2ce6f0dfcb1dfbef720da6bae00c6ec4b5b",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "8575ff7120acc0a4f0464bd3082538998a51fbe77f88a6d108814bcb46a7e8f2",
  changedBehavior: "HTTP_500_SHARES_EXISTING_ONE_RETRY_COOLDOWN_WITHOUT_AUTHORITY_RENEWAL",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
});
export const NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION = Object.freeze({
  chunkId: "NYX-BOUNDED-OUTPUT-RELIABILITY-001", predecessor: "efcfaa86d4657e6462c20e54445c2c49b8abec53",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "6fdea92b31b426e601f78cde69a7db08a0fd56762703e5249b6de9a58edefc45",
  changedBehavior: "EXPLICIT_ULTRA_MEDIUM_EFFORT_REJECTED_FOR_UNSUPPORTED_OR_INCOMPATIBLE_REQUESTS",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  outputCeilingChanged: false, hardThinkingTokenLimit: false,
  source: "https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard",
});
export const NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION = Object.freeze({
  chunkId: "NYX-ANSWER-RESERVATION-001", predecessor: "24d7a973643967eeaf415eb8f43cb40a7c345839",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "1b8b705fdca5c63ab3171f7fb362efbdfc6c0844d9d8e9c0ee48196ecc7f2790",
  changedBehavior: "OPT_IN_ULTRA_REASONING_BUDGET_WITHIN_EXISTING_TOTAL_COMPLETION_CEILING",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  outputCeilingChanged: false, providerEnforcementMeasured: false,
  source: "https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer",
});
export const NYX_GATE_RECOVERY_ANSWER_COMPATIBILITY_REVISION = Object.freeze({
  chunkId: "NYX-ANSWER-RESERVATION-COMPATIBILITY-001", predecessor: "52a3bcf4103d8bc2cfc89946f261903958667ee8",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "0f2988eb5168a0d351e6d00a006096435f4b0ad3148bd0f0a7a1d75ee5d29708",
  changedBehavior: "USE_DOCUMENTED_CHAT_TEMPLATE_REASONING_BUDGET_AFTER_TOP_LEVEL_HTTP_400",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  outputCeilingChanged: false, providerEnforcementMeasured: false,
  source: NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.source,
});

// Response classification/accounting is a new runtime identity, not a rescore
// of the earlier answer-reservation experiment. Its request contract is unchanged.
export const NYX_GATE_RECOVERY_RESPONSE_ACCOUNTING_REVISION = Object.freeze({
  chunkId: "NYX-RESPONSE-ACCOUNTING-001", predecessor: "84aad2995385cb72badbf1aea078bf8487aded5a",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "f3c93d782dff85c6183b4041cff333c65e1861f3505a74b6dfa835787179b603",
  cognitionPath: "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts",
  cognitionSourceSha256: "9cc9de557038c34c7e7489030c808463ea06b4711892e264095335890c122d41",
  changedBehavior: "CLASSIFY_INVALID_RESPONSE_SHAPE_AND_RETAIN_USAGE_WITHOUT_FINAL_CONTENT",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  outputCeilingChanged: false, requestPayloadChanged: false,
});

// New OPT-IN wire experiment: historical source/score identities above remain immutable.
// Default settings retain their exact payload; only explicit diagnostic requests differ.
export const NYX_GATE_RECOVERY_WIRE_DIAGNOSTIC_REVISION=Object.freeze({
  chunkId:"NYX-REASONING-WIRE-CONFIGURATION-DIAGNOSTIC-001",predecessor:"1b95fda010a4eec31790472ab84ab5467ff1844d",
  changedPath:NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256:"bbb4a870946b2780121ea98d788b604d324afb737501cdfddd8c365893212fd9",
  changedBehavior:"OPT_IN_NATIVE_ULTRA_CONTROLS_AND_HOSTED_GRAMMAR_ABLATION_STRICT_LOCAL_CONTRACT_UNCHANGED",
  experimentalOnly:true,defaultRequestPayloadChanged:false,acceptanceOracleChanged:false,authorityIncrease:false,
  outputCeilingChanged:false,historicalScoresComparable:false,
  source:"https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer",
});

/** Opt-in hosted compatibility experiment; all prior scored sources remain pinned. */
export const NYX_GATE_RECOVERY_HOSTED_NATIVE_REVISION = Object.freeze({
  chunkId: "NYX-HOSTED-NATIVE-COMPATIBILITY-001",
  predecessor: "80b8fc674dc38b1817fdc6e98e5b10257dcdd62c",
  changedPath: NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath,
  sourceSha256: "5ea2e4e79322c3534683eb5d2855c6623bd2540a2b42f6c4b7ddbf7596ca2a5d",
  changedBehavior: "OPT_IN_HOSTED_NATIVE_FIELDS_WITHOUT_TEMPLATE_KWARGS",
  experimentalOnly: true, defaultRequestPayloadChanged: false,
  historicalScoresComparable: false, acceptanceOracleChanged: false,
  authorityIncrease: false, outputCeilingChanged: false,
  providerCompatibilityVerified: false,
  source: NYX_GATE_RECOVERY_WIRE_DIAGNOSTIC_REVISION.source,
});

function task(index: number, helperPath: string, helperName: string, helperSource: string,
  goodSource: string, faultySource: string): NyxQualityV5Task {
  const original = NYX_ADMISSION_GUIDANCE_TASKS[index];
  const importPath = `./${helperPath.split("/").at(-1)}`;
  const quote = `Keep validation in the existing ${helperName} helper and call it through its existing import '${importPath}'.`;
  const invariants: readonly QualityInvariant[] = Object.freeze([
    { invariantId: "REUSE_VALIDATOR_IMPORT", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT",
      path: original.candidateModule, value: importPath },
    { invariantId: "REUSE_VALIDATOR_CALL", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL",
      path: original.candidateModule, value: helperName },
  ]);
  return Object.freeze({ ...original,
    taskId: original.taskId.replace("NYX-GUIDANCE", "NYX-GATE-RECOVERY"),
    provenance: "NYX_GATE_RECOVERY_SOURCE_2026_09_30",
    objective: `${original.objective} ${quote} The validator is read-only. ${OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT}`,
    correctFiles: Object.freeze({ [original.candidateModule]: goodSource, [helperPath]: helperSource }),
    faultyFiles: Object.freeze({ [original.candidateModule]: faultySource }),
    initiallyAdmittedPaths: Object.freeze([original.candidateModule, helperPath]),
    qualityPolicy: Object.freeze({ ...original.qualityPolicy,
      policyId: original.qualityPolicy.policyId.replace("ADMISSION-GUIDANCE", "GATE-RECOVERY"),
      readonlyPaths: Object.freeze([helperPath]),
      invariants: Object.freeze([...original.qualityPolicy.invariants, ...invariants]) }),
    publicQualityObligations: Object.freeze([...invariants.map((invariant) => Object.freeze({
      objectiveQuote: quote, invariant })), Object.freeze({
      objectiveQuote: OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT,
      invariant: original.qualityPolicy.invariants.find((item) => item.kind === "NO_PARAMETER_MUTATION")! })]),
  });
}

export const NYX_GATE_RECOVERY_TASKS: readonly NyxQualityV5Task[] = Object.freeze([
  task(0, "src/window-input.mjs", "checkedWindows", `export function checkedWindows(windows) {
  if (!Array.isArray(windows)) throw new RangeError("invalid windows");
  return windows.map((window) => {
    if (!Array.isArray(window) || window.length !== 2
      || !Number.isSafeInteger(window[0]) || !Number.isSafeInteger(window[1])
      || window[0] > window[1]) throw new RangeError("invalid window");
    return [...window];
  });
}
`, `import { checkedWindows } from "./window-input.mjs";
export function mergeWindows(windows) {
  const sorted = [...checkedWindows(windows)].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && (window[0] <= last[1] || window[0] === last[1] + 1)) {
      last[1] = Math.max(last[1], window[1]);
    } else merged.push(window);
  }
  return merged;
}
`, `import { checkedWindows } from "./window-input.mjs";
export function mergeWindows(windows) {
  return checkedWindows(windows).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
`),
  task(1, "src/lease-input.mjs", "checkedLeaseEvents", `export function checkedLeaseEvents(events) {
  if (!Array.isArray(events)) throw new RangeError("invalid events");
  for (const event of events) {
    if (!event || typeof event.id !== "string" || !event.id
      || typeof event.resource !== "string" || !event.resource
      || !["ACQUIRE", "RELEASE"].includes(event.kind)) throw new RangeError("invalid event");
  }
  return events;
}
`, `import { checkedLeaseEvents } from "./lease-input.mjs";
export function replayLeases(events) {
  const seen = new Set();
  const held = new Set();
  for (const event of checkedLeaseEvents(events)) {
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
`, `import { checkedLeaseEvents } from "./lease-input.mjs";
export function replayLeases(events) {
  const held = new Set();
  for (const event of checkedLeaseEvents(events)) {
    if (held.has(event.resource)) held.delete(event.resource);
    else held.add(event.resource);
  }
  return [...held];
}
`),
  task(2, "src/record-input.mjs", "checkedRecords", `export function checkedRecords(records) {
  if (!Array.isArray(records)) throw new RangeError("invalid records");
  for (const record of records) {
    if (!record || typeof record.key !== "string" || !record.key
      || !Number.isSafeInteger(record.version) || record.version < 0
      || typeof record.value !== "string") throw new RangeError("invalid record");
  }
  return records;
}
`, `import { checkedRecords } from "./record-input.mjs";
export function latestRecords(records) {
  const selected = new Map();
  for (const record of checkedRecords(records)) {
    const previous = selected.get(record.key);
    if (!previous || record.version > previous.version) selected.set(record.key, record);
    else if (record.version === previous.version && record.value !== previous.value) {
      throw new RangeError("conflicting record");
    }
  }
  return Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, record]) => [key, record.value]));
}
`, `import { checkedRecords } from "./record-input.mjs";
export function latestRecords(records) {
  const selected = new Map();
  for (const record of checkedRecords(records)) selected.set(record.key, record);
  return Object.fromEntries([...selected].map(([key, record]) => [key, record.value]));
}
`),
]);
