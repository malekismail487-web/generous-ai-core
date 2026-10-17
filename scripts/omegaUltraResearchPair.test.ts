import assert from "node:assert/strict";
import {ULTRA_RESEARCH_PAIR_POLICY as P, ultraResearchModel, ultraResearchSelection, standaloneUltraRequest,
  standaloneUltraResult, runUltraResearchArm, summarizeUltraResearchPairs, ultraResearchProviderConfig,
  ULTRA_MEDIUM_RESEARCH_PAIR_POLICY, ultraResearchPairPolicy,
  type UltraResearchModel} from "./omega/benchmarks/ultraResearchPair";
import type {NvidiaNimCompletionRequest, NvidiaNimCompletionResult, NvidiaNimEvidence} from "../src/lib/codelab/model/nvidiaNimProvider";
import type {PrivateTextTask} from "./omega/benchmarks/nyxTextBenchmark";
import {theoryDigest} from "../src/lib/codelab/research/theoryContracts";

let passed = 0, failed = 0;
async function check(name: string, run: () => unknown | Promise<unknown>) {
  try {await run(); passed++;} catch {failed++; console.error(`FAILED ${name}`);}
}
const task: PrivateTextTask = {taskId: "DEVELOPMENT-PAIR", family: "DEVELOPMENT_DIAGNOSTIC",
  question: "What is six times seven?", answer: "42"};
function completion(content: string, request?: NvidiaNimCompletionRequest): NvidiaNimCompletionResult {
  const evidence: NvidiaNimEvidence = {evidenceId: "SYNTHETIC-DEVELOPMENT-NOT-LIVE", evidenceClass: "E3",
    providerId: "DEVELOPMENT-PAIR", endpointOrigin: "https://integrate.api.nvidia.com", model: P.model,
    requestDigest: theoryDigest(request ?? {}), responseDigest: theoryDigest(content),
    credentialSourceIdentity: "DEVELOPMENT_NO_SECRET", credentialPersisted: false, promptPersisted: false,
    networkAttempted: false, statusCode: 200, failureCategory: null, retryability: null, providerRequestId: null,
    finishReason: "stop", usage: {promptTokens: 400, completionTokens: 100, totalTokens: 500},
    delivery: {policy: "nvidia-capacity/1", requestsPerMinute: 40, scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT",
      httpAttempts: 1, rateLimitedResponses: 0, transientUnavailableResponses: 0, timedOutAttempts: 0,
      capacityWaitMs: 0, state: "DELIVERED", notBeforeEpochMs: null, authorityRenewed: false}};
  return {decision: "COMPLETED", reason: "synthetic_development", content, finishReason: "stop", evidence,
    executorAuthorityGranted: false};
}
const reply = (answer: string) => JSON.stringify({kind: "REPLY", message: `The answer is: ${answer}`});
const model = (content: string, observe: (request: NvidiaNimCompletionRequest) => void = () => {}): UltraResearchModel =>
  ({complete: async request => {observe(request); return completion(content, request);}});
await check("new research defaults to exact Ultra without changing historical selectors", () =>
  assert.equal(ultraResearchModel({}), P.model));
for (const variable of ["NVIDIA_NIM_MODEL", "NYX_TEXT_EVALUATION_MODEL"])
  for (const value of ["nvidia/nemotron-3-super-120b-a12b", "AUTO", "", "other"])
    await check("non Ultra campaign override rejected before invocation", () =>
      assert.throws(() => ultraResearchModel({[variable]: value})));
await check("canonical explicit Ultra override admitted", () => assert.equal(ultraResearchModel({NVIDIA_NIM_MODEL: P.model}), P.model));
await check("provider configuration refuses Super and keeps finite original delivery limits", () => {
  assert.throws(() => ultraResearchProviderConfig("nvidia/nemotron-3-super-120b-a12b"));
  assert.equal(ultraResearchProviderConfig(P.model).finalAttemptSelection, "REMAINING_REQUEST_WINDOW");
  assert.equal(ultraResearchProviderConfig(P.model).responseMode, "BOUNDED_SSE");
});
const population = (family: PrivateTextTask["family"], count: number) => Array.from({length: count}, (_, i) =>
  ({family, taskId: `${family}-${i + 1}`, question: `Synthetic problem ${i + 1}`, answer: family === "GPQA_DIAMOND" ? "A" : "42"}));
const aime = population("AIME_2026", 30), gpqa = population("GPQA_DIAMOND", 198);
await check("selection is deterministic counterbalanced and independent of private references", () => {
  const selected = ultraResearchSelection(aime, gpqa);
  assert.equal(selected.length, 4); assert.deepEqual(selected.map(t => t.family), ["AIME_2026", "GPQA_DIAMOND", "AIME_2026", "GPQA_DIAMOND"]);
  assert.deepEqual(selected.map(t => t.taskId), ultraResearchSelection(aime.map(t => ({...t, answer: "999"})),
    gpqa.map(t => ({...t, answer: "D"}))).map(t => t.taskId));
  assert.throws(() => ultraResearchSelection(aime.slice(1), gpqa));
});
await check("standalone prompt has same high effort token ceiling and never receives a reference", () => {
  const request = standaloneUltraRequest("Synthetic objective", "DEVELOPMENT-REQUEST", Date.now() + 10000);
  assert.equal(request.maxTokens, 16384); assert.equal(request.temperature, P.temperature);
  assert.equal(request.reasoningControl, "ULTRA_HOSTED_NATIVE"); assert.equal(request.structuredOutputMode, "STRICT_LOCAL");
  assert.equal(request.reasoningBudgetTokens, undefined); assert.equal(request.messages.length, 2);
  assert(!JSON.stringify(request.messages).includes("PRIVATE_REFERENCE_NOT_FOR_MODEL"));
});
await check("standalone result is parsed without inventing NYX audit events", () => {
  const result = standaloneUltraResult(completion(reply("42")));
  assert.equal(result.turn.outcome, "REPLIED"); assert.deepEqual(result.turn.events, []);
  assert.equal(result.turn.sourceRepositoryMutated, false);
});
for (const raw of ["rm -rf arbitrary-text", "[]", '{"kind":"REPLY","message":"x","extra":true}', "```json\n{}\n```"])
  await check("malformed output remains unexecutable and ungraded", () =>
    assert.equal(standaloneUltraResult(completion(raw)).turn.outcome, "REJECTED"));
await check("recognized tool action has no standalone authority", () => {
  const result = standaloneUltraResult(completion('{"kind":"READ_FILE","path":"src/question.mjs"}'));
  assert.equal(result.rejection, "PROTOCOL_OR_AUTHORIZATION_FAILURE");
});
const captured: NvidiaNimCompletionRequest[] = [];
const direct = await runUltraResearchArm(task, "STANDALONE_ULTRA", model(reply("42"), r => captured.push(r)), "a".repeat(40), Date.now() + 10000);
const nyx = await runUltraResearchArm(task, "CURRENT_NYX_CLOSED_BOOK", model(reply("42"), r => captured.push(r)), "a".repeat(40), Date.now() + 10000);
await check("medium is a separately versioned experiment with identical resource and acceptance limits", () => {
  const {version: _v, reasoningEffort: _e, ...medium} = ULTRA_MEDIUM_RESEARCH_PAIR_POLICY;
  const {version: _hv, reasoningEffort: _he, ...high} = P;
  assert.deepEqual(medium, high); assert.notEqual(_v, _hv);
  assert.equal(ultraResearchPairPolicy(), P);
  assert.equal(ultraResearchPairPolicy("MEDIUM"), ULTRA_MEDIUM_RESEARCH_PAIR_POLICY);
  assert.throws(() => ultraResearchPairPolicy("LOW" as "HIGH"));
});
await check("medium selection has its own frozen rank independent of answers and input order", () => {
  const ids = (rows: readonly PrivateTextTask[]) => rows.map(t => t.taskId);
  const selected = ultraResearchSelection(aime, gpqa, "MEDIUM");
  assert.deepEqual(ids(selected), ids(ultraResearchSelection([...aime].reverse().map(t => ({...t, answer: "0"})),
    [...gpqa].reverse().map(t => ({...t, answer: "D"})), "MEDIUM")));
  assert.equal(selected.length, 4);
  assert.notDeepEqual(ids(selected), ids(ultraResearchSelection(aime, gpqa)));
  assert.throws(() => ultraResearchSelection(aime, gpqa, "AUTO" as "MEDIUM"));
});
const mediumCaptured: NvidiaNimCompletionRequest[] = [];
const mediumDirect = await runUltraResearchArm(task, "STANDALONE_ULTRA", model(reply("42"), r => mediumCaptured.push(r)),
  "a".repeat(40), Date.now() + 10000, [], "MEDIUM");
const mediumNyx = await runUltraResearchArm(task, "CURRENT_NYX_CLOSED_BOOK", model(reply("42"), r => mediumCaptured.push(r)),
  "a".repeat(40), Date.now() + 10000, [], "MEDIUM");
await check("both medium arms use the same native wire profile and unchanged strict parser and oracle", () => {
  assert(mediumCaptured.length === 2 && mediumCaptured.every(r => r.reasoningEffort === "MEDIUM"
    && r.reasoningControl === "ULTRA_HOSTED_NATIVE" && r.reasoningBudgetTokens === undefined
    && r.maxTokens === P.maxOutputTokens && r.temperature === P.temperature && r.structuredOutputMode === "STRICT_LOCAL"));
  assert(mediumDirect.correct && mediumNyx.correct);
  for (const r of [mediumDirect, mediumNyx]) assert(r.cleanup.sourceUnchanged && r.cleanup.cleanupVerified
    && r.authorization.toolsExecuted === 0 && r.authorization.repositoryReadsExecuted === 0);
});
await check("medium results require explicit medium summary and cannot contaminate historical high evidence", () => {
  const summary = summarizeUltraResearchPairs([task.taskId], [mediumDirect, mediumNyx], "MEDIUM");
  assert.equal(summary.bothCorrect, 1); assert.equal(summary.cognitivePromotion, false);
  assert.equal(summary.officialBenchmarkScoreClaim, false);
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [mediumDirect, mediumNyx]));
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [direct, mediumNyx], "MEDIUM"));
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [direct, nyx], "MEDIUM"));
});
await check("medium preserves wrong-answer and incomplete-coverage semantics", async () => {
  const wrong = await runUltraResearchArm(task, "STANDALONE_ULTRA", model(reply("43")),
    "a".repeat(40), Date.now() + 10000, [], "MEDIUM");
  assert.equal(wrong.state, "REASONING_FAILURE"); assert.equal(wrong.correct, false);
  const summary = summarizeUltraResearchPairs([task.taskId, "UNEXECUTED"], [wrong, mediumNyx], "MEDIUM");
  assert.equal(summary.nyxOnly, 1); assert.equal(summary.ungradedOrUnexecutedPairs, 1);
  assert(summary.arms.every(a => a.pilotAccuracy === null));
});
await check("both real disposable fixture paths admit the same independently graded reply", () => {
  assert.equal(direct.correct, true); assert.equal(nyx.correct, true);
  for (const row of [direct, nyx]) {assert(row.cleanup?.cleanupVerified); assert(row.cleanup?.sourceUnchanged);
    assert.equal(row.authorization.repositoryReadsExecuted, 0); assert.equal(row.logicalRequests, 1);}
  assert(captured.every(r => r.maxTokens === P.maxOutputTokens && r.temperature === P.temperature
    && r.reasoningControl === "ULTRA_HOSTED_NATIVE" && r.structuredOutputMode === "STRICT_LOCAL"));
});
await check("public rows omit enumerable answer and provider-envelope hashes", () => {
  for (const row of [direct, nyx]) {assert(!("privateOracleDigest" in row)); assert(!("predictionDigest" in row));
    assert(!("eventDigests" in row)); assert(row.modelEvidence.every(e => e.responseDigest === null));}
});
await check("fully graded known synthetic equal compute is distinguished from promotion", () => {
  const summary = summarizeUltraResearchPairs([task.taskId], [direct, nyx]);
  assert.equal(summary.bothCorrect, 1); assert(summary.pairs[0].exactlyMatchedReportedModelCompute);
  assert.equal(summary.cognitivePromotion, false); assert.equal(summary.officialBenchmarkScoreClaim, false);
});
await check("unexecuted pairs and unknown usage cannot become matched compute or a full score", () => {
  const empty = summarizeUltraResearchPairs([task.taskId], []);
  assert.equal(empty.ungradedOrUnexecutedPairs, 1); assert.equal(empty.arms[0].pilotAccuracy, null);
  const unknown = {...nyx, usage: {...nyx.usage, unknownUsageCalls: 1}};
  assert(!summarizeUltraResearchPairs([task.taskId], [direct, unknown]).pairs[0].exactlyMatchedReportedModelCompute);
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [direct, direct]));
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [direct, {...nyx, inputDigest: "b".repeat(64)}]));
});
await check("wrong valid answers and invalid answer formats remain different outcomes", async () => {
  const wrong = await runUltraResearchArm(task, "STANDALONE_ULTRA", model(reply("43")), "a".repeat(40), Date.now() + 10000);
  const format = await runUltraResearchArm(task, "STANDALONE_ULTRA", model('{"kind":"REPLY","message":"approximately forty two"}'), "a".repeat(40), Date.now() + 10000);
  assert.equal(wrong.state, "REASONING_FAILURE"); assert.equal(wrong.correct, false);
  assert.equal(format.state, "ANSWER_FORMAT_FAILURE"); assert.equal(format.correct, null);
});
await check("NYX unauthorized read stays rejected without executing R1", async () => {
  const denied = await runUltraResearchArm(task, "CURRENT_NYX_CLOSED_BOOK", model('{"kind":"READ_FILE","path":"src/question.mjs"}'), "a".repeat(40), Date.now() + 10000);
  assert.equal(denied.correct, null); assert.equal(denied.authorization.repositoryReadsExecuted, 0);
  assert.equal(denied.state, "PROTOCOL_OR_AUTHORIZATION_FAILURE");
});
await check("standalone terminal and lease requirements equal NYX admission requirements", () => {
  const response = completion(reply("42"));
  assert.equal(standaloneUltraResult({...response, finishReason: null}).turn.outcome, "MODEL_FAILURE");
  assert.equal(standaloneUltraResult(response, false).turn.outcome, "BUDGET_EXHAUSTED");
});
await check("malformed deadlines reject before model invocation", async () => {
  let invoked = false;
  const probe = model(reply("42"), () => {invoked = true;});
  for (const deadline of [NaN, Infinity, -1, Date.now() - 1, Date.now() + 10000.5])
    await assert.rejects(() => runUltraResearchArm(task, "STANDALONE_ULTRA", probe, "a".repeat(40), deadline),
      /ultra_research_input_scope_rejected/);
  assert.equal(invoked, false);
});
for (const arm of P.arms) {
  await check("explicit token truncation cannot turn a valid-looking reply into a grade", async () => {
    const response = completion(reply("42"));
    const truncated: NvidiaNimCompletionResult = {...response, finishReason: "length", evidence: {...response.evidence, finishReason: "length"}};
    const row = await runUltraResearchArm(task, arm, {complete: async () => truncated}, "a".repeat(40), Date.now() + 10000);
    assert.equal(row.state, "TRUNCATION"); assert.equal(row.correct, null); assert(row.cleanup?.cleanupVerified);
  });
  await check("provider failure is ungraded rather than model reasoning failure", async () => {
    const response = completion(reply("42"));
    const unavailable: NvidiaNimCompletionResult = {...response, decision: "PROVIDER_ERROR", content: null, finishReason: null,
      evidence: {...response.evidence, statusCode: 503, finishReason: null,
        failureCategory: "PROVIDER_SERVER_ERROR", usage: {promptTokens: null, completionTokens: null, totalTokens: null}}};
    const row = await runUltraResearchArm(task, arm, {complete: async () => unavailable}, "a".repeat(40), Date.now() + 10000);
    assert.equal(row.state, "PROVIDER_FAILURE"); assert.equal(row.correct, null);
    assert.equal(row.usage.unknownUsageCalls, 1); assert(row.cleanup?.cleanupVerified);
  });
  await check("model identity mismatch fails closed even when NYX catches the internal exception", async () => {
    const response = completion(reply("42"));
    await assert.rejects(() => runUltraResearchArm(task, arm, {complete: async () =>
      ({...response, evidence: {...response.evidence, model: "nvidia/nemotron-3-super-120b-a12b"}})},
    "a".repeat(40), Date.now() + 10000), /ultra_research_provider_model_mismatch/);
  });
  await check("thrown provider exception is the same owned infrastructure failure in either arm", async () => {
    await assert.rejects(() => runUltraResearchArm(task, arm, {complete: async () => {throw Error("private_transport_detail");}},
      "a".repeat(40), Date.now() + 10000), /ultra_research_model_invocation_failed/);
  });
}
await check("inconsistent result truth bits cannot manufacture a paired acceptance", () => {
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [{...direct, correct: null}]));
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [{...direct, correct: false}]));
  assert.throws(() => summarizeUltraResearchPairs([task.taskId], [{...direct, state: "TRUNCATION"}]));
});
console.log(`OMEGA_ULTRA_RESEARCH_PAIR_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
