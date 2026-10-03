import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { ARMS, attemptContext, jsonValue, sourceSchema, usageSchema, validateReceipt, zeroUsage,
  type CampaignSpec, type TaskSource, type ArmSpec, type ExternalReceipt, type FailureClass } from "./omega/benchmarks/contracts";
import { prepareTask, TaskExposureHistory, type PreparedTask } from "./omega/benchmarks/tasks";
import { exportPrediction, gradeExternalReport } from "./omega/benchmarks/officialFormats";
import { runCampaign, type BenchmarkAdapter, type AdapterOutput } from "./omega/benchmarks/campaign";
import { advanceCapabilityGap, createCapabilityGap, GAP_STEPS, gapExport, type GapEvidence } from "./omega/benchmarks/gaps";

let passed = 0; let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed++; else { failed++; console.error(`x ${label}`); }
}
function throws(body: () => unknown): boolean { try { body(); return false; } catch { return true; } }
async function rejects(body: () => Promise<unknown>): Promise<boolean> { try { await body(); return false; } catch { return true; } }
const digest = (s: string) => theoryDigest(s);
const source = (record: unknown, visibility: TaskSource["visibility"] = "SYNTHETIC", kind: TaskSource["kind"] = "DEVELOPMENT_REPRODUCTION"): TaskSource => ({
  dataset: "INDEPENDENT_DEVELOPMENT_PROTOCOL_FIXTURES_NOT_OFFICIAL_TASKS", revision: "format-test-v1",
  contentDigest: theoryDigest(record), visibility, kind, provenance: "Authored for deterministic contract tests; not NYX capability evidence" });
const rawArc = { train: [{ input: [[0, 2]], output: [[2, 0]] }],
  test: [{ input: [[3, 0]], output: [[0, 3]] }, { input: [[0, 4]], output: [[4, 0]] }] };
const arc = prepareTask("ARC_AGI", "format-fixture", "DEVELOPMENT", source(rawArc), rawArc);
const good = [{ attempt_1: [[0, 3]], attempt_2: [[0, 0]] }, { attempt_1: [[0, 0]], attempt_2: [[4, 0]] }];
const wrong = [{ attempt_1: [[3, 0]], attempt_2: [[0, 0]] }, { attempt_1: [[0, 4]], attempt_2: [[0, 0]] }];
const epoch: CampaignSpec = { schemaVersion: 1, campaignId: "CONTRACT_ONLY_NOT_A_CAPABILITY_CAMPAIGN",
  environmentIdentity: "LOCAL_PROTOCOL_FIXTURE", executionIdentity: "DETERMINISTIC_HARNESS_SELF_TEST",
  frozenAtEpochMs: 1000, expiresAtEpochMs: 100000, taskDigests: [arc.manifest.taskDigest],
  model: "same-frozen-model", modelConfigDigest: digest("config"), authorityDigest: digest("NO_HOST_AUTHORITY"),
  toolEnvelopeDigest: digest("JSON_ONLY"), verifierVersion: "independent-format-oracle-v1", verifierSourceDigest: digest("verifier-source"),
  limits: { maxCallsPerTask: 4, maxReportedTokensPerTask: 2000, maxToolCallsPerTask: 2, maxToolWorkUnitsPerTask: 100,
    maxAttemptsPerTask: 2, maxArtifactBytes: 4096, maxWallClockMsPerTask: 10000, maxWallClockMs: 80000 }, realizedComputeTolerance: 0 };
const armSpec = (arm: typeof ARMS[number], supportedCapabilities = ["JSON_GRID_OUTPUT"]): ArmSpec => ({
  arm, version: "protocol-test-only", sourceDigest: digest(arm), inferenceMode: "SYNTHETIC_PROTOCOL_TEST",
  model: epoch.model, modelConfigDigest: epoch.modelConfigDigest,
  authorityDigest: epoch.authorityDigest, toolEnvelopeDigest: epoch.toolEnvelopeDigest, supportedCapabilities });
const usage = { ...zeroUsage(), logicalCalls: 1, physicalCalls: 1, httpAttempts: 1, reportedTokens: 100, wallClockMs: 10 };
const output = (artifact: unknown, failure: FailureClass | null = null): AdapterOutput => ({ artifact,
  usage, failure, confidence: 0.5, requestDigests: [digest("request")], responseDigests: [digest("response")] });
const adapters = (artifact: unknown) => ARMS.map(arm => ({ spec: armSpec(arm), invoke: async () => output(artifact) }));
const clock = () => 1001;

check(Object.isFrozen(arc.manifest) && Object.isFrozen(arc.input.train), "task custody and model-facing inputs are immutable");
check(theoryDigest(arc.input) === arc.manifest.inputDigest, "model-visible input digest is reproducible");
check(JSON.stringify(arc.input.test) === JSON.stringify(rawArc.test.map(t => ({ input: t.input }))), "ARC test answers never enter model input");
check(arc.scoreArc!(good).state === "PASS" && arc.scoreArc!(good).correct === 2, "ARC accepts exact match in either of two predictions");
check(arc.scoreArc!(wrong).state === "FAIL" && arc.scoreArc!(wrong).correct === 0, "ARC gives no pixel-level partial credit");
check(arc.scoreArc!([good[0], wrong[1]]).correct === 1, "ARC denominator counts test outputs, not merely task identities");
check(throws(() => arc.scoreArc!([good[0]])), "missing ARC test predictions rejected");
check(throws(() => arc.scoreArc!([...good, good[0]])), "extra ARC test predictions rejected");
check(throws(() => arc.scoreArc!([{ ...good[0], attempt_3: [[0, 3]] }, good[1]])), "third ARC guess rejected rather than increasing chance");
check(throws(() => arc.scoreArc!([{ attempt_1: [[1], [1, 2]], attempt_2: [[0]] }, good[1]])), "ragged grid rejected");
check(throws(() => arc.scoreArc!([{ attempt_1: [[10]], attempt_2: [[0]] }, good[1]])), "out-of-domain ARC color rejected");
check(throws(() => arc.scoreArc!([{ attempt_1: Array.from({ length: 31 }, () => [1]), attempt_2: [[0]] }, good[1]])), "oversized ARC grid rejected");
check(throws(() => prepareTask("ARC_AGI", "x", "DEVELOPMENT", { ...source(rawArc), contentDigest: digest("wrong") }, rawArc)), "mismatched source content rejected");
check(throws(() => prepareTask("ARC_AGI", "x", "SEALED", source(rawArc, "PUBLIC", "DATASET_TASK"), rawArc)), "public task cannot claim protected sealed tier");
check(throws(() => prepareTask("ARC_AGI", "x", "SEALED", source(rawArc, "PROTECTED", "PUBLIC_SAMPLE"), rawArc)), "public sample cannot be relabeled sealed");
const sealed = prepareTask("ARC_AGI", "s", "SEALED", source(rawArc, "INDEPENDENT_PRIVATE", "DATASET_TASK"), rawArc);
const exposure = new TaskExposureHistory(); exposure.record(arc.manifest, "DESIGN_INFLUENCE", { failure: "protocol-only" });
check(!exposure.eligible(sealed.manifest), "design influence retires exact input even across changed task identity and tier");
check(exposure.eligible(arc.manifest), "retired material remains useful development regression evidence");
check(Object.isFrozen(exposure.snapshot()), "exposure history cannot be silently modified in place");
check(!new TaskExposureHistory(exposure.snapshot()).eligible(sealed.manifest), "exported exposure history preserves retirement across process-local sessions");
check(throws(() => new TaskExposureHistory([{ ...exposure.snapshot()[0], inputDigest: "corrupt" }])), "corrupted exposure import is rejected");

const sweRaw = { instance_id: "demo__repo-1", repo: "demo/repo", base_commit: "a".repeat(40),
  problem_statement: "Repair the boundary condition", patch: "ORACLE_ONLY", test_patch: "ORACLE_ONLY",
  FAIL_TO_PASS: ["PRIVATE_TEST"], PASS_TO_PASS: ["PRIVATE_TEST"], hints_text: "ORACLE_ONLY", extra: "ORACLE_ONLY" };
const swe = prepareTask("SWE_BENCH", sweRaw.instance_id, "DEVELOPMENT", source(sweRaw), sweRaw);
check(Object.keys(swe.input).sort().join(",") === "base_commit,problem_statement,repo", "SWE input allowlist excludes patches, hidden tests, hints and arbitrary fields");
check(!JSON.stringify(swe.input).includes("ORACLE_ONLY") && !JSON.stringify(swe.input).includes("PRIVATE_TEST"), "SWE oracle does not leak into cognition input");
check(throws(() => prepareTask("SWE_BENCH", "other", "DEVELOPMENT", source(sweRaw), sweRaw)), "SWE instance identity mismatch rejected");
const hleRaw = { id: "hle-format", question: "Explain a bounded property", image: "", answer: "ORACLE_ONLY", rationale: "ORACLE_ONLY" };
const hle = prepareTask("HLE", hleRaw.id, "DEVELOPMENT", source(hleRaw), hleRaw);
check(Object.keys(hle.input).sort().join(",") === "image,question", "HLE strips answer and explanation metadata");
const visualRaw = { ...hleRaw, image: "data:image/png;base64,synthetic" };
const visual = prepareTask("HLE", hleRaw.id, "DEVELOPMENT", source(visualRaw), visualRaw);
check(visual.manifest.requiredCapabilities.includes("AUTHORIZED_MULTIMODAL_INPUT"), "multimodal HLE requires explicit capability rather than dropping the image");
const terminalRaw = { task_name: "terminal-format", instruction: "Inspect only the isolated domain", task_checksum: "official-checksum",
  solution: "ORACLE_ONLY", tests: "ORACLE_ONLY" };
const terminal = prepareTask("TERMINAL_BENCH", terminalRaw.task_name, "DEVELOPMENT", source(terminalRaw), terminalRaw);
check(Object.keys(terminal.input).join(",") === "instruction", "terminal tests and reference solution are evaluator-only");
check(throws(() => exportPrediction(terminal, "rm -rf /", epoch.model)), "shell text is not a Terminal-Bench agent integration");
const mathRaw = { problem: "An independently authored development math problem", answer: "ORACLE_ONLY" };
const math = prepareTask("FRONTIER_MATH", "math-format", "DEVELOPMENT", source(mathRaw), mathRaw);
check(!JSON.stringify(math.input).includes("ORACLE_ONLY"), "mathematical oracle is excluded from model input");
check((exportPrediction(swe, "diff --git a/a b/a", epoch.model) as { instance_id: string }).instance_id === sweRaw.instance_id, "SWE export follows pinned prediction format");
check(JSON.stringify(exportPrediction(arc, good, epoch.model)).includes("attempt_2"), "ARC export includes required paired grid predictions");
check(throws(() => exportPrediction(swe, { resolved: true }, epoch.model)), "candidate cannot export a success claim as a patch");
check(throws(() => exportPrediction(hle, { correct: "yes" }, epoch.model)), "HLE candidate cannot export judge result as response");
check(JSON.stringify(exportPrediction(math, "42", epoch.model)).includes("REQUIRES_AUTHORIZED_EPOCH_ADAPTER"), "FrontierMath generic export is not misrepresented as an official protocol");

function contextFor(task: PreparedTask, artifact: unknown, attempt = 1) {
  return attemptContext({ ...epoch, taskDigests: [task.manifest.taskDigest] }, task.manifest, armSpec("CURRENT_NYX"), attempt, artifact);
}
function receiptFor(context: ReturnType<typeof contextFor>, report: unknown): ExternalReceipt {
  return { schemaVersion: 1, campaignDigest: context.campaignDigest, taskDigest: context.taskDigest,
    armSourceDigest: context.armSourceDigest, attempt: context.attempt, artifactDigest: context.artifactDigest,
    evaluationRunId: context.evaluationRunId, environment: "independent-format-test", evaluatorVersion: epoch.verifierVersion,
    evaluatorSourceDigest: epoch.verifierSourceDigest, rawReportDigest: theoryDigest(report), custody: "CALLER_ATTESTED_NOT_AUTHENTICATED" };
}
const patch = "diff --git a/a b/a"; const sweContext = contextFor(swe, patch);
const sweSpec = { ...epoch, taskDigests: [swe.manifest.taskDigest] };
const sweReport = { [sweRaw.instance_id]: { patch_is_None: false, patch_exists: true, patch_successfully_applied: true, resolved: true, infra_failure: false } };
const sweReceipt = receiptFor(sweContext, sweReport);
check(gradeExternalReport(swe, { receipt: sweReceipt, report: sweReport }, sweContext, sweSpec).state === "PASS", "bound SWE official per-instance report imported");
check(gradeExternalReport(swe, { receipt: sweReceipt, report: sweReport }, sweContext, sweSpec).quality === "NOT_EVALUATED", "functional benchmark success does not certify code quality");
check(contextFor(swe, "different patch").evaluationRunId !== sweContext.evaluationRunId, "changed patch receives new evaluator cache identity");
check(contextFor(swe, patch, 2).evaluationRunId !== sweContext.evaluationRunId, "repair attempt receives new evaluator cache identity");
for (const key of ["campaignDigest", "taskDigest", "armSourceDigest", "artifactDigest", "evaluationRunId", "evaluatorSourceDigest", "rawReportDigest"] as const)
  check(throws(() => validateReceipt({ ...sweReceipt, [key]: digest("wrong") }, sweReport, sweContext, sweSpec)), `stale external receipt ${key} rejected`);
check(throws(() => validateReceipt({ ...sweReceipt, attempt: 2 }, sweReport, sweContext, sweSpec)), "old attempt receipt rejected");
check(throws(() => validateReceipt({ ...sweReceipt, custody: "SIGNED" }, sweReport, sweContext, sweSpec)), "hash binding cannot claim signed custody");
check(throws(() => validateReceipt(sweReceipt, { resolved: false }, sweContext, sweSpec)), "raw external report modification rejected");
const inconsistentSwe = { [sweRaw.instance_id]: { ...sweReport[sweRaw.instance_id], patch_successfully_applied: false } };
check(throws(() => gradeExternalReport(swe, { receipt: receiptFor(sweContext, inconsistentSwe), report: inconsistentSwe }, sweContext, sweSpec)), "SWE resolved without applied patch fails closed");
const infraSwe = { [sweRaw.instance_id]: { ...sweReport[sweRaw.instance_id], resolved: false, infra_failure: true } };
check(gradeExternalReport(swe, { receipt: receiptFor(sweContext, infraSwe), report: infraSwe }, sweContext, sweSpec).state === "INSUFFICIENT_EVIDENCE", "SWE infrastructure failure is not a reasoning verdict");

const hleAnswer = "Answer: 17\nConfidence: 60%"; const hleContext = contextFor(hle, hleAnswer);
const hleSpec = { ...epoch, taskDigests: [hle.manifest.taskDigest] };
const hleReport = { [hleRaw.id]: { model: epoch.model, response: hleAnswer, judge_response: { correct: "yes", confidence: 60 } } };
check(gradeExternalReport(hle, { receipt: receiptFor(hleContext, hleReport), report: hleReport }, hleContext, hleSpec).confidence === 0.6, "HLE judge confidence is bounded and imported distinctly");
const wrongHle = { [hleRaw.id]: { ...hleReport[hleRaw.id], response: "another candidate" } };
check(throws(() => gradeExternalReport(hle, { receipt: receiptFor(hleContext, wrongHle), report: wrongHle }, hleContext, hleSpec)), "cached HLE judgement cannot attach to another response");
const substringHle = { [hleRaw.id]: { ...hleReport[hleRaw.id], judge_response: { correct: "yes but no", confidence: 60 } } };
check(throws(() => gradeExternalReport(hle, { receipt: receiptFor(hleContext, substringHle), report: substringHle }, hleContext, hleSpec)), "HLE yes substring is not accepted as a strict judge verdict");
const terminalArtifact = { trajectoryDigest: digest("trajectory") }; const terminalContext = contextFor(terminal, terminalArtifact);
const terminalSpec = { ...epoch, taskDigests: [terminal.manifest.taskDigest] };
const terminalReport = { task_name: terminalRaw.task_name, task_checksum: terminalRaw.task_checksum,
  trial_name: terminalContext.evaluationRunId, verifier_result: { rewards: { reward: 1 } }, exception_info: null };
check(gradeExternalReport(terminal, { receipt: receiptFor(terminalContext, terminalReport), report: terminalReport }, terminalContext, terminalSpec).state === "PASS", "Harbor binary independent reward imported with checksum and trial binding");
for (const modification of [{ task_checksum: "other" }, { trial_name: "cached" }, { verifier_result: { rewards: { reward: 0.5 } } }, { step_results: [{}] }]) {
  const report = { ...terminalReport, ...modification };
  check(throws(() => gradeExternalReport(terminal, { receipt: receiptFor(terminalContext, report), report }, terminalContext, terminalSpec)), "unsupported or unbound Harbor result rejected");
}
const unavailableTerminal = { ...terminalReport, verifier_result: null };
check(gradeExternalReport(terminal, { receipt: receiptFor(terminalContext, unavailableTerminal), report: unavailableTerminal }, terminalContext, terminalSpec).state === "INSUFFICIENT_EVIDENCE", "missing Harbor verifier is not a pass or cognitive failure");
const mathContext = contextFor(math, "42"); const mathSpec = { ...epoch, taskDigests: [math.manifest.taskDigest] };
const mathReport = { format: "AUTHORIZED_EPOCH_NORMALIZED_V1", taskDigest: mathContext.taskDigest,
  responseDigest: mathContext.artifactDigest, accepted: true, verifierAvailable: true };
check(gradeExternalReport(math, { receipt: receiptFor(mathContext, mathReport), report: mathReport }, mathContext, mathSpec).state === "PASS", "authorized normalized math receipt imported without inventing official format");

const sweAdapters = ARMS.map(arm => ({ spec: armSpec(arm, [...swe.manifest.requiredCapabilities]), invoke: async () => output(patch) }));
const externalEvaluator = { version: epoch.verifierVersion, sourceDigest: epoch.verifierSourceDigest,
  evaluate: async (_task: PreparedTask, _artifact: unknown, context: ReturnType<typeof contextFor>) => ({
    report: sweReport, receipt: receiptFor(context, sweReport) }) };
const externalCampaign = await runCampaign(sweSpec, [swe], sweAdapters, externalEvaluator, undefined, clock);
check(externalCampaign.summaries.every(s => s.finalAccepted === 1 && s.qualityNotEvaluated === 1),
  "external official-format grading composes through the real campaign loop without self-certifying quality");
check(!externalCampaign.matchedRealizedCompute && externalCampaign.summaries.every(s => s.unknownVerifierUsage === 1),
  "missing independent evaluator consumption prevents a compute-match claim");
const meteredExternal = await runCampaign(sweSpec, [swe], sweAdapters, { ...externalEvaluator,
  evaluate: async (task, artifact, context) => ({ ...await externalEvaluator.evaluate(task, artifact, context), usage: zeroUsage() }) }, undefined, clock);
check(meteredExternal.matchedRealizedCompute, "known deterministic external evaluation cost permits a matched format-only comparison");
const missingVerifier = await runCampaign(sweSpec, [swe], sweAdapters, null, undefined, clock);
check(missingVerifier.runs.every(r => r.state === "BLOCKED_ENVIRONMENT" && !r.attempts.length), "missing verifier blocks execution without a forged verdict");
const wrongVerifier = { ...externalEvaluator, sourceDigest: digest("different-verifier") };
check(await rejects(() => runCampaign(sweSpec, [swe], sweAdapters, wrongVerifier, undefined, clock)), "unfrozen evaluator version cannot judge a campaign");
const forgedVerdict = await runCampaign(sweSpec, [swe], sweAdapters, { ...externalEvaluator, evaluate: async (_t, _a, context) => ({
  receipt: receiptFor(context, { resolved: true }), report: { resolved: true } }) }, undefined, clock);
check(forgedVerdict.runs.every(r => r.attempts[0].failure === "VERIFIER_FAILURE" && r.attempts[0].evaluation === null),
  "candidate-like success label cannot replace official per-instance verification evidence");

const complete = await runCampaign(epoch, [arc], adapters(good), null, undefined, clock);
check(complete.summaries.every(s => s.firstAttemptAccepted === 1 && s.repairedAccepted === 0), "first-attempt acceptance is distinct from repaired success");
check(complete.matchedRealizedCompute, "all equivalent-tool arms with exact known realized usage can be compared");
check(complete.rawModelComputeParitied === false, "raw model is not falsely labeled equivalent-tools control");
check(complete.arms.every(a => a.inferenceMode === "SYNTHETIC_PROTOCOL_TEST"), "synthetic adapter evidence cannot be mistaken for live provider execution");
check(complete.broadPromotion === false && complete.officialLeaderboardClaim === false && complete.grantsAuthority === false, "protocol replay does not self-promote intelligence or authority");
const { reportDigest, ...reportBody } = complete;
check(reportDigest === theoryDigest(reportBody), "campaign outcome has reproducible tamper-evident digest");
check(Object.isFrozen(complete.runs[0].attempts[0]), "per-attempt outcome cannot be changed in place");
check(!JSON.stringify(complete).includes('"attempt_1"'), "campaign archives sanitized artifact digests rather than raw output");
check(complete.summaries.every(s => s.benchmarkScorePercent === 100), "format-only full coverage exact ARC score aggregation is correct");
const repairedAdapters = ARMS.map(arm => ({ spec: armSpec(arm), invoke: async (request: Parameters<BenchmarkAdapter["invoke"]>[0]) => {
  check(!("manifest" in request) && !JSON.stringify(request.input.test).includes("output"), "adapter receives neither oracle nor private manifest");
  if (request.attempt === 2) check(request.feedback?.state === "FAIL" && !JSON.stringify(request.feedback).includes("expected"), "repair feedback contains no private answers");
  return output(request.attempt === 1 ? wrong : good);
} }));
const repaired = await runCampaign(epoch, [arc], repairedAdapters, null, undefined, clock);
check(repaired.summaries.every(s => s.firstAttemptAccepted === 0 && s.repairedAccepted === 1 && s.repairAttempts === 1), "repair cannot be credited as first-try performance");
check(repaired.capabilityGaps.length === 4 && repaired.capabilityGaps.every(g => !g.benchmarkReevaluationEligible), "failed attempts preserved as gaps despite later success");
const sealedFail = await runCampaign({ ...epoch, taskDigests: [sealed.manifest.taskDigest] }, [sealed], adapters(wrong), null, undefined, clock);
check(sealedFail.runs.every(r => r.attempts.length === 1), "sealed private answers never guide within-campaign repair");
const retired = await runCampaign({ ...epoch, taskDigests: [sealed.manifest.taskDigest] }, [sealed], adapters(good), null, exposure, clock);
check(retired.runs.every(r => r.state === "RETIRED_FROM_UNBIASED_EVALUATION" && !r.attempts.length), "retired sealed task never executes");
const unavailable = await runCampaign(epoch, [arc], [], null, undefined, clock);
check(unavailable.runs.length === 4 && unavailable.summaries.every(s => s.benchmarkScorePercent === null), "missing arm stays in population, not zero or invented score");
const unsupported = await runCampaign(epoch, [arc], ARMS.map(a => ({ spec: armSpec(a, []), invoke: async () => output(good) })), null, undefined, clock);
check(unsupported.runs.every(r => r.state === "BLOCKED_AUTHORITY"), "unsupported capabilities cannot be exercised by text intent");
check(await rejects(() => runCampaign({ ...epoch, schemaVersion: 2 } as never, [arc], adapters(good), null, undefined, clock)), "unsupported campaign schema rejected");
check(await rejects(() => runCampaign(epoch, [arc], [adapters(good)[0], adapters(good)[0]], null, undefined, clock)), "duplicate arms rejected");
check(await rejects(() => runCampaign(epoch, [], adapters(good), null, undefined, clock)), "task omission violates frozen population");
check(await rejects(() => runCampaign(epoch, [arc], adapters(good), null, undefined, () => 100000)), "expired campaign rejected before inference");
const selfVerifier = adapters(good); selfVerifier[1].spec = { ...selfVerifier[1].spec, sourceDigest: epoch.verifierSourceDigest };
check(await rejects(() => runCampaign(epoch, [arc], selfVerifier, null, undefined, clock)), "candidate and verifier source identity cannot be identical");
for (const field of ["model", "modelConfigDigest", "authorityDigest", "toolEnvelopeDigest"] as const) {
  const mutated = adapters(good); mutated[1].spec = { ...mutated[1].spec, [field]: digest("changed") };
  check(await rejects(() => runCampaign(epoch, [arc], mutated, null, undefined, clock)), `unmatched ${field} rejected`);
}
const unknown = adapters(good).map(a => ({ ...a, invoke: async () => ({ ...output(good), usage: { ...usage, unknownUsageCalls: 1 } }) }));
check(!(await runCampaign(epoch, [arc], unknown, null, undefined, clock)).matchedRealizedCompute, "unknown token use cannot claim compute matching");
const retry = adapters(good).map(a => ({ ...a, invoke: async () => ({ ...output(good), usage: { ...usage, httpAttempts: 2, retries: 1 } }) }));
check((await runCampaign(epoch, [arc], retry, null, undefined, clock)).summaries.every(s => !s.providerStable), "successful retry is still provider-unstable evidence");
const unequal = adapters(good); unequal[3].invoke = async () => ({ ...output(good), usage: { ...usage, reportedTokens: 101 } });
check(!(await runCampaign(epoch, [arc], unequal, null, undefined, clock)).matchedRealizedCompute, "nominal limits do not imply equal realized tokens");
const excess = adapters(good).map(a => ({ ...a, invoke: async () => ({ ...output(good), usage: { ...usage, physicalCalls: 5, httpAttempts: 5 } }) }));
check((await runCampaign(epoch, [arc], excess, null, undefined, clock)).runs.every(r => r.attempts[0].failure === "RESOURCE_EXHAUSTION"), "actual call overspend is rejected despite correct artifact");
const pending: BenchmarkAdapter = { spec: armSpec("RAW_MODEL"), invoke: async () => new Promise(() => {}) };
const timed = await runCampaign({ ...epoch, limits: { ...epoch.limits, maxWallClockMsPerTask: 10 } }, [arc], [pending], null, undefined, clock);
check(timed.runs.find(r => r.arm === "RAW_MODEL")!.attempts[0].usage === null, "unsettled invocation does not fabricate zero usage");
check(timed.runs.find(r => r.arm === "RAW_MODEL")!.attempts.length === 1, "unknown in-flight work is not retried behind caller's back");
check(!timed.matchedRealizedCompute, "missing observations invalidate compute-match claim");
const selfClaim = adapters(good).map(a => ({ ...a, invoke: async () => ({ ...output(good), accepted: true }) }));
check((await runCampaign(epoch, [arc], selfClaim, null, undefined, clock)).runs.every(r => r.attempts[0].failure === "SCHEMA_FAILURE"),
  "model cannot insert an acceptance authority field into a candidate record");
check(complete.summaries.every(s => s.falseAcceptances === null), "unexecuted false-acceptance audit is unknown, not invented zero");
check(complete.summaries.every(s => s.verifierUsage.toolWorkUnits === 2 && s.unknownVerifierUsage === 0), "local exact verifier work is separately metered by tested outputs");
check(await rejects(() => runCampaign({ ...epoch, taskDigests: [arc.manifest.taskDigest, sealed.manifest.taskDigest] }, [arc, sealed], adapters(good), null, undefined, clock)),
  "duplicate normalized input cannot inflate evaluation population by changing task identity");
for (const failure of ["TRUNCATION", "SYNTAX_FAILURE", "HIDDEN_CASE_FAILURE", "QUALITY_REJECTION", "PROVIDER_FAILURE"] as const) {
  const result = await runCampaign(epoch, [arc], [{ spec: armSpec("CURRENT_NYX"), invoke: async () => output(null, failure) }], null, undefined, clock);
  check(result.runs.find(r => r.arm === "CURRENT_NYX")!.attempts[0].failure === failure, `observed ${failure} is preserved without conflating outcome classes`);
}
check(throws(() => usageSchema.parse({ ...usage, reportedTokens: -1 })), "negative token accounting rejected");
check(throws(() => usageSchema.parse({ ...usage, unknownUsageCalls: 2 })), "unknown-call count cannot exceed physical calls");
check(throws(() => usageSchema.parse({ ...usage, logicalCalls: 2 })), "unaccounted logical dispatch rejected");
check(throws(() => sourceSchema.parse({ ...source(rawArc), credential: "not-permitted" })), "credential field is not accepted as task provenance");
for (const malformed of [undefined, NaN, Infinity, 1n, new Date(), { x: undefined }, Array(2)])
  check(throws(() => jsonValue(malformed)), "noncanonical JSON value rejected before hashing");
check(throws(() => jsonValue(JSON.parse('{"__proto__":{}}'))), "prototype-bearing data rejected");
check(throws(() => jsonValue("x".repeat(100), 10)), "serialized artifact byte bound enforced");

const gap = createCapabilityGap({ gapId: "NYX-GENERAL-FAILURE-CLASS", failureClass: "HIDDEN_CASE_FAILURE",
  capabilityClass: "General boundary reasoning, not a benchmark-specific answer", benchmarkTaskDigest: arc.manifest.taskDigest,
  benchmarkInputDigest: arc.manifest.inputDigest, failureEvidenceDigest: digest("failure") });
let progressive = gap;
for (let index = 0; index < GAP_STEPS.length; index++) {
  const e: GapEvidence = { step: GAP_STEPS[index], evidenceDigest: digest(`e${index}`), corpusDigest: digest(index >= 4 ? "transfer" : `dev${index}`),
    inputDigests: [digest(index >= 4 ? "transfer-input" : `dev-input-${index}`)], tier: index >= 4 ? "VALIDATION" : "DEVELOPMENT",
    comparison: index === 3 ? "MECHANISM_OFF_VS_ON" : "NOT_APPLICABLE", matchedCompute: index >= 3,
    improvement: index >= 3 ? "SUPPORTED" : "NOT_MEASURED" };
  if (index === 0) check(throws(() => advanceCapabilityGap(progressive, { ...e, step: "ABLATED" })), "gap cannot skip development reproduction");
  if (index === 2) check(throws(() => advanceCapabilityGap(progressive, { ...e, inputDigests: progressive.steps[1].inputDigests })), "mechanism must test separate development examples");
  if (index === 3) {
    check(throws(() => advanceCapabilityGap(progressive, { ...e, matchedCompute: false })), "unmatched ablation cannot promote gap repair");
    check(throws(() => advanceCapabilityGap(progressive, { ...e, improvement: "REFUTED" })), "negative ablation cannot be voted into improvement");
  }
  if (index === 4) check(throws(() => advanceCapabilityGap(progressive, { ...e, inputDigests: progressive.steps[2].inputDigests })), "fresh transfer cannot recycle exact development inputs");
  check(throws(() => advanceCapabilityGap(progressive, { ...e, inputDigests: [arc.manifest.inputDigest] })), "benchmark answer reproduction is excluded from general mechanism development");
  progressive = advanceCapabilityGap(progressive, e);
  check(gapExport(progressive).benchmarkReevaluationEligible === (index === GAP_STEPS.length - 1), "reevaluation eligibility follows complete supported workflow");
}
check(!gapExport(progressive).semanticIndependenceProvedByDigests, "digest disjointness is not proof of semantic task independence");
const forged = { ...gap, steps: progressive.steps.slice(1) };
check(throws(() => gapExport(forged)), "serialized skipped history cannot forge reevaluation eligibility");
check(gapExport(progressive).grantsAuthority === false, "successful gap workflow grants no tool or production authority");
for (const file of ["contracts.ts", "tasks.ts", "officialFormats.ts", "campaign.ts", "gaps.ts"]) {
  const contents = readFileSync(`scripts/omega/benchmarks/${file}`, "utf8");
  check(!/node:child_process|\bfetch\s*\(|eval\s*\(|NVIDIA_API_KEY|node:fs/.test(contents), "benchmark core has no process, filesystem, credential or network authority");
}
const help = execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/w0rs/register-typescript-loader.mjs",
  "scripts/omega/benchmark-cli.ts", "--help"], { encoding: "utf8" });
check(help.includes("no model, terminal, deployment or network authority"), "operational CLI exposes truthful data-only boundary");
const cliScore = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/w0rs/register-typescript-loader.mjs",
  "scripts/omega/benchmark-cli.ts", "score-arc", "--task", "scripts/omega/benchmarks/fixtures/arc-format-task.json",
  "--prediction", "scripts/omega/benchmarks/fixtures/arc-format-predictions.json"], { encoding: "utf8" }));
check(cliScore.result.correct === 2 && cliScore.result.total === 2 && !cliScore.officialLeaderboardClaim, "real CLI reads fixture envelope and scores paired predictions without claiming model capability");
check(!JSON.stringify(cliScore).includes('"attempt_1"'), "CLI score output does not unnecessarily persist candidate grids");
const pins = JSON.parse(readFileSync("scripts/omega/benchmarks/upstream-pins.json", "utf8"));
check(pins.families.length === 5 && new Set(pins.families.map((f: { family: string }) => f.family)).size === 5, "all five requested benchmark families are represented exactly once");
check(!pins.officialBenchmarksExecuted && !pins.cognitiveImprovementClaim, "catalog distinguishes measurement plumbing from cognition improvement");
check(pins.families.filter((f: { harnessRevision?: string }) => f.harnessRevision).every((f: { harnessRevision: string }) => /^[a-f0-9]{40}$/.test(f.harnessRevision)), "reviewed upstream harnesses use immutable commit pins");
check(pins.planCoverage.coverageStatus === "PARTIAL_JUST_IN_TIME", "benchmark work remains just-in-time plan coverage, not corpus completeness");
console.log(`Omega benchmark capability harness tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
