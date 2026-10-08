import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { selectArcEpoch, ARC_PUBLIC_EPOCH_SELECTION, ARC_ARRAY_BOUND_TRANSFER_SELECTION,
  ARC_SUPER_CONFIGURATION_SELECTION } from "./omega/nyx-arc-benchmark-epoch";
import { runCampaign, type AdapterOutput, type TaskRun } from "./omega/benchmarks/campaign";
import { zeroUsage, type ArmSpec, type CampaignSpec } from "./omega/benchmarks/contracts";
import { prepareTask } from "./omega/benchmarks/tasks";

let passed = 0; let failed = 0;
function check(value: unknown, label: string) { if (value) passed++; else { failed++; console.error(`x ${label}`); } }
function throws(body: () => unknown) { try { body(); return false; } catch { return true; } }
async function rejects(body: () => Promise<unknown>) { try { await body(); return false; } catch { return true; } }
const names = Array.from({length: 120}, (_, i) => `${i.toString(16).padStart(8, "0")}.json`);
const full = selectArcEpoch("FULL_PUBLIC", [...names].reverse());
check(full.taskIds.length === 120 && full.taskIds.join() === names.map(n => n.slice(0, -5)).join(),
  "entire population selected independently of directory order and task correctness");
check(Object.isFrozen(full) && Object.isFrozen(full.taskIds), "full population immutable before inference");
check(throws(() => selectArcEpoch("FULL_PUBLIC", names.slice(1))), "missing tasks rejected, not quietly excluded");
check(throws(() => selectArcEpoch("FULL_PUBLIC", [...names.slice(1), names[1]])), "duplicate identities rejected");
check(throws(() => selectArcEpoch("FULL_PUBLIC", [...names.slice(1), "../escape.json"])), "malformed identity rejected");
check(throws(() => selectArcEpoch("BASELINE", names)), "historical subset cannot silently change identity");
check(throws(() => selectArcEpoch("UNKNOWN" as never, names)), "unknown population mode rejected");
const frozenNames = [...ARC_PUBLIC_EPOCH_SELECTION.taskIds, ...ARC_ARRAY_BOUND_TRANSFER_SELECTION.taskIds,
  ...ARC_SUPER_CONFIGURATION_SELECTION.taskIds, ...Array.from({length: 102}, (_, i) => `f${i.toString(16).padStart(7, "0")}`)]
  .map(id => `${id}.json`);
const configurationSelection = selectArcEpoch("SUPER_CONFIGURATION_TRANSFER", frozenNames.reverse());
check(configurationSelection.taskIds.join() === ARC_SUPER_CONFIGURATION_SELECTION.taskIds.join(),
  "configuration comparison freezes next eight names without task-content filtering");
check(Object.isFrozen(configurationSelection.taskIds)
  && configurationSelection.taskIds.every(id => ![...ARC_PUBLIC_EPOCH_SELECTION.taskIds, ...ARC_ARRAY_BOUND_TRANSFER_SELECTION.taskIds].includes(id)),
  "fresh configuration identities are immutable and disjoint from ten previously exposed tasks");
check(throws(() => selectArcEpoch("SUPER_CONFIGURATION_TRANSFER", names)), "configuration transfer cannot substitute easier task identities");

// Independently authored protocol fixtures, never actual ARC task answers or cognitive evidence.
const tasks = Array.from({length: 6}, (_, i) => {
  const raw = {train: [{input: [[i]], output: [[i + 1]]}], test: [{input: [[i]], output: [[i + 1]]}]};
  return prepareTask("ARC_AGI", `INDEPENDENT-POPULATION-${i}`, "DEVELOPMENT", {dataset: "PROTOCOL-FIXTURES",
    revision: "1", contentDigest: theoryDigest(raw), visibility: "SYNTHETIC", kind: "DEVELOPMENT_REPRODUCTION",
    provenance: "Population/circuit tests only, not cognitive performance evidence."}, raw);
});
const digest = theoryDigest("population-contract-test");
const spec: CampaignSpec = {schemaVersion: 1, campaignId: "POPULATION-CONTRACT-TEST", environmentIdentity: "TEST",
  executionIdentity: "TEST", frozenAtEpochMs: 1000, expiresAtEpochMs: 100000, taskDigests: tasks.map(t => t.manifest.taskDigest),
  model: "TEST-NOT-LIVE", modelConfigDigest: digest, authorityDigest: digest, toolEnvelopeDigest: digest,
  verifierVersion: "TEST", verifierSourceDigest: digest,
  limits: {maxCallsPerTask: 2, maxReportedTokensPerTask: 1000, maxToolCallsPerTask: 3, maxToolWorkUnitsPerTask: 100,
    maxAttemptsPerTask: 1, maxArtifactBytes: 50000, maxWallClockMsPerTask: 1000, maxWallClockMs: 10000},
  realizedComputeTolerance: 0.1};
const arm: ArmSpec = {arm: "CURRENT_NYX", version: "TEST", sourceDigest: theoryDigest("independent-adapter"),
  inferenceMode: "SYNTHETIC_PROTOCOL_TEST", model: spec.model, modelConfigDigest: digest, authorityDigest: digest,
  toolEnvelopeDigest: digest, supportedCapabilities: ["JSON_GRID_OUTPUT"]};
const baseOutput: AdapterOutput = {artifact: [{attempt_1: [[9]], attempt_2: [[9]]}],
  usage: {...zeroUsage(), logicalCalls: 1, physicalCalls: 1, httpAttempts: 1, reportedTokens: 10},
  failure: null, confidence: null, requestDigests: [], responseDigests: []};
const outage: AdapterOutput = {...baseOutput, artifact: null, failure: "PROVIDER_FAILURE",
  usage: {...baseOutput.usage, providerFailures: 1, unknownUsageCalls: 1, reportedTokens: 0}};
const run = (invoke: () => Promise<AdapterOutput>, onRun?: (run: TaskRun) => void | Promise<void>, stopAfter = 2) =>
  runCampaign(spec, tasks, [{spec: arm, invoke}], null, undefined, () => 1001,
    {maxConsecutiveProviderFailures: stopAfter, onRun});
let calls = 0; const observed: TaskRun[] = [];
const unavailable = await run(async () => { calls++; return outage; }, record => { observed.push(record); });
const current = unavailable.runs.filter(r => r.arm === "CURRENT_NYX");
check(calls === 2 && current.length === 6, "two observed outages stop requests, not population accounting");
check(current.slice(0, 2).every(r => r.attempts[0]?.failure === "PROVIDER_FAILURE" && r.attempts[0].evaluation === null),
  "provider failure is not reclassified as a hidden-case failure");
check(current.slice(2).every(r => r.reason === "PROVIDER_FAILURE_CIRCUIT_OPEN" && !r.attempts.length),
  "unexecuted tasks remain explicitly blocked without invented answers");
check(unavailable.summaries.find(s => s.arm === "CURRENT_NYX")!.benchmarkScorePercent === null,
  "incomplete population cannot produce a benchmark score");
check(unavailable.providerFailureCircuit.open && !unavailable.broadPromotion && !unavailable.matchedRealizedCompute,
  "outage cannot grant promotion or matched-compute claims");
check(observed.length === 24 && observed.every(r => Object.isFrozen(r) && !("artifact" in r)),
  "every requested arm/task state has a sanitized immutable progress record");
calls = 0;
const wrong = await run(async () => { calls++; return baseOutput; });
check(calls === 6 && wrong.summaries.find(s => s.arm === "CURRENT_NYX")!.benchmarkScorePercent === 0,
  "low independently graded accuracy does not terminate the population");
calls = 0;
const malformed = await run(async () => { calls++; return {...baseOutput, artifact: null, failure: "SCHEMA_FAILURE"}; });
check(calls === 6 && malformed.summaries.find(s => s.arm === "CURRENT_NYX")!.benchmarkScorePercent === null,
  "ungraded interface failures remain distinct from wrong grid answers");
calls = 0;
const recovered = await run(async () => ++calls % 2 ? outage : baseOutput);
check(calls === 6 && !recovered.providerFailureCircuit.open, "healthy observed delivery resets consecutive outages");
check(await rejects(() => run(async () => baseOutput, () => { throw Error("checkpoint-failed"); })),
  "progress-custody failure is not silently hidden behind a completed report");
for (const limit of [0, 11, 1.5, NaN]) check(await rejects(() => run(async () => baseOutput, undefined, limit)),
  `invalid provider circuit threshold ${limit} rejected`);

// Independent resource-accounting fixtures, not ARC/model capability evidence.
const configured = async (arms: ArmSpec["arm"][], output: (arm: ArmSpec["arm"], inputDigest: string) => AdapterOutput = () => baseOutput) =>
  runCampaign(spec, tasks, arms.map(name => ({spec: {...arm, arm: name, sourceDigest: theoryDigest(name)},
    invoke: async (request: {inputDigest: string}) => output(name, request.inputDigest)})), null, undefined, () => 1001);
const pair = await configured(["CURRENT_NYX", "CANDIDATE_NYX"]);
check(pair.matchedRealizedCompute, "two declared measured controls can match without a fictional third control");
check(pair.runs.filter(r => r.arm === "MODEL_EQUIVALENT_TOOLS").every(r => r.state === "BLOCKED_ENVIRONMENT"),
  "unused arm remains visible rather than erased from population accounting");
check(pair.computeMatchScope === "CONFIGURED_NON_RAW_ARMS_GLOBAL_AND_EACH_TASK_MINIMUM_TWO_CONTROLS"
  && !pair.broadPromotion && !pair.grantsAuthority, "compute parity is not success, cognitive promotion or authority");
check(!(await configured(["CURRENT_NYX"])).matchedRealizedCompute, "one declared control is not a comparison");
check(!(await configured(["RAW_MODEL", "CURRENT_NYX"])).matchedRealizedCompute, "raw model cannot substitute for a second equivalent-tool control");
check((await configured(["MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX", "CANDIDATE_NYX"])).matchedRealizedCompute,
  "three declared controls preserve the original matching requirement");
const imbalanced = await configured(["CURRENT_NYX", "CANDIDATE_NYX"], (name, inputDigest) => {
  const index = tasks.findIndex(task => task.manifest.inputDigest === inputDigest);
  const high = (index % 2 === 0) === (name === "CURRENT_NYX");
  return {...baseOutput, usage: {...baseOutput.usage, reportedTokens: high ? 100 : 10}};
});
check(imbalanced.summaries.find(s => s.arm === "CURRENT_NYX")!.usage.reportedTokens
  === imbalanced.summaries.find(s => s.arm === "CANDIDATE_NYX")!.usage.reportedTokens && !imbalanced.matchedRealizedCompute,
  "equal aggregate tokens cannot conceal opposite per-task compute imbalances");
for (const [label, patch] of [
  ["unknown tokens", {unknownUsageCalls: 1}], ["provider failure", {providerFailures: 1}],
  ["retry", {retries: 1}], ["no inference", {logicalCalls: 0, physicalCalls: 0, httpAttempts: 0}],
  ["unequal physical calls", {logicalCalls: 2, physicalCalls: 2, httpAttempts: 2}],
  ["unequal tool work", {toolWorkUnits: 10}], ["over-tolerance tokens", {reportedTokens: 12}]
] as const) check(!(await configured(["CURRENT_NYX", "CANDIDATE_NYX"], name => name === "CURRENT_NYX" ? baseOutput
  : {...baseOutput, usage: {...baseOutput.usage, ...patch}})).matchedRealizedCompute, `${label} still prevents compute parity`);
const missing = await runCampaign(spec, tasks, ["CURRENT_NYX", "CANDIDATE_NYX"].map(name => ({spec: {...arm,
  arm: name as ArmSpec["arm"], sourceDigest: theoryDigest(name), supportedCapabilities: name === "CANDIDATE_NYX" ? [] : arm.supportedCapabilities},
  invoke: async () => baseOutput})), null, undefined, () => 1001);
check(!missing.matchedRealizedCompute, "declared but unavailable control cannot be quietly omitted");
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
