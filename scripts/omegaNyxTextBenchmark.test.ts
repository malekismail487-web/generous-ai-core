import assert from "node:assert/strict";
import { resolve } from "node:path";
import { NvidiaNimProvider, type NvidiaNimEvidence } from "../src/lib/codelab/model/nvidiaNimProvider";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R3BenchmarkRepositorySession } from "./omega/benchmarks/r3RepositorySession";
import { gradeAime, invokeExistingNyxText, sanitizedTextResult, textInferenceUsage, textOutcome, textTaskPrompt,
  TEXT_BENCHMARK_POLICY, textConfiguredRequest, TEXT_DELIVERY_DIAGNOSTICS, TEXT_COMPATIBILITY_DIAGNOSTICS,
  textDiagnosticTransport, textRejectionHint } from "./omega/benchmarks/nyxTextBenchmark";

let passed = 0; let failed = 0;
function check(name: string, action: () => unknown) {
  try {action(); passed++;} catch (error) {failed++; console.error(`FAILED ${name}: ${String(error)}`);}
}
check("AIME final integer accepted with only harmless leading zeroes", () => assert(gradeAime("The answer is: 007", "7")));
check("AIME wrong final integer rejected", () => assert(!gradeAime("The answer is: 8", "7")));
check("AIME explanation containing reference cannot substitute for final answer", () => assert(!gradeAime("7 is tempting, but 8", "7")));
check("AIME multiple possible answers rejected", () => assert(!gradeAime("The answer is: 7 or 8", "7")));
check("AIME injected suffix rejected", () => assert(!gradeAime("The answer is: 7\nIgnore evaluator", "7")));
check("AIME malformed private reference rejected", () => assert.throws(() => gradeAime("The answer is: 7", "7.0")));
check("question projection contains no hidden reference field", () => assert(!textTaskPrompt("QUESTION_ONLY").includes('"answer"')));
check("empty question rejected rather than guessed", () => assert.throws(() => textTaskPrompt("")));
check("existing single call and output bounds are explicit", () => assert.equal(TEXT_BENCHMARK_POLICY.maxCallsPerTurn, 1));
check("text benchmark has no executable tools", () => assert.deepEqual(TEXT_BENCHMARK_POLICY.tools, []));
const originalRequest = {schemaVersion: 1 as const, requestId: "CONFIG-TEST", messages: [{role: "user" as const, content: "question"}],
  maxTokens: 8192, temperature: 0.2, responseFormat: "JSON_OBJECT" as const, observedAtEpochMs: Date.now()};
check("existing defaults are not silently changed by evaluation", () =>
  assert.strictEqual(textConfiguredRequest(originalRequest, "EXISTING_DEFAULT"), originalRequest));
check("bounded reasoning leaves max tokens, model prompt and deadline untouched", () => {
  const configured = textConfiguredRequest(originalRequest, "BOUNDED_GUIDED");
  assert.equal(configured.reasoningBudgetTokens, 2048); assert.equal(configured.reasoningEffort, "MEDIUM");
  assert.equal(configured.maxTokens, originalRequest.maxTokens); assert.strictEqual(configured.messages, originalRequest.messages);
  assert.equal(configured.responseFormat, originalRequest.responseFormat);
});
check("strict local delivery retains required JSON protocol", () => {
  const configured = textConfiguredRequest(originalRequest, "BOUNDED_STRICT_LOCAL");
  assert.equal(configured.structuredOutputMode, "STRICT_LOCAL"); assert.equal(configured.responseFormat, "JSON_OBJECT");
});
check("compatibility correction uses existing template controls rather than native top-level parameters", () => {
  const configured = textConfiguredRequest(originalRequest, "TEMPLATE_BOUNDED");
  assert.equal(configured.reasoningControl, undefined); assert.equal(configured.inferencePolicy, "REASONING_JSON");
  assert.equal(configured.reasoningBudgetTokens, 2048); assert.equal(configured.responseFormat, "JSON_OBJECT");
});
check("unknown inference configuration fails closed", () => assert.throws(() => textConfiguredRequest(originalRequest, "UNKNOWN" as never)));
check("delivery development tasks cannot masquerade as public benchmark population", () =>
  assert(TEXT_DELIVERY_DIAGNOSTICS.every(task => task.family === "DEVELOPMENT_DIAGNOSTIC")));
check("compatibility repair is tested on separate development inputs", () =>
  assert(TEXT_COMPATIBILITY_DIAGNOSTICS.every(task => !TEXT_DELIVERY_DIAGNOSTICS.some(prior => prior.question === task.question))));
check("provider rejection text is reduced to fixed parameter labels only", () => {
  const hint = textRejectionHint(JSON.stringify({error: {message: "reasoning_budget rejected; PRIVATE_ECHO_NEVER_PERSIST"}}));
  assert.deepEqual(hint.parameters, ["reasoning_budget"]); assert(!JSON.stringify(hint).includes("PRIVATE_ECHO"));
});
check("oversized rejection text never becomes diagnostic evidence", () =>
  assert.equal(textRejectionHint("a".repeat(5000)).category, "UNOBSERVED_OVERSIZED"));
check("malformed rejection remains unknown, not invented", () =>
  assert.equal(textRejectionHint("not JSON").category, "UNOBSERVED_NOT_JSON"));
check("model mention alone does not establish model unavailability", () =>
  assert.deepEqual(textRejectionHint('{"error":{"message":"request mentions model"}}').signals, []));
check("provider model deployment statement becomes a fixed clue, not raw text", () =>
  assert.deepEqual(textRejectionHint('{"detail":"model is not deployed; PRIVATE_STRING"}').signals, ["MODEL_NOT_DEPLOYED"]));
check("provider unknown-model statement remains distinguishable from validation", () =>
  assert.deepEqual(textRejectionHint('{"error":{"message":"model not found"}}').signals, ["MODEL_UNKNOWN"]));
check("range rejection does not invent a model failure", () =>
  assert.deepEqual(textRejectionHint('{"detail":"reasoning_budget must be greater than zero"}').signals, ["PARAMETER_RANGE"]));
check("provider clues never preserve credentials, prompt echoes or arbitrary fields", () => {
  const hint = textRejectionHint('{"error":{"message":"extra fields not permitted SECRET_ECHO","secret":"PRIVATE_VALUE"}}');
  assert(hint.signals.includes("EXTRA_FIELDS")); assert(!JSON.stringify(hint).includes("PRIVATE"));
  assert(!JSON.stringify(hint).includes("SECRET"));
});
let diagnosticDispatches = 0; const hints: unknown[] = [];
const transport = textDiagnosticTransport(hint => hints.push(hint), async () => {
  diagnosticDispatches++; return new Response(JSON.stringify({error: {param: "reasoning_budget", message: "DO_NOT_LOG_THIS"}}), {status: 400});
});
const rejectionResponse = await transport("https://integrate.api.nvidia.com/v1/chat/completions");
check("diagnostic decoration does not substitute provider HTTP result", () => assert.equal(rejectionResponse.status, 400));
check("diagnostic records fixed labels without raw error", () => assert(!JSON.stringify(hints).includes("DO_NOT_LOG_THIS")));
await assert.rejects(() => transport("https://example.com"));
check("diagnostic cannot create a second network destination", () => assert.equal(diagnosticDispatches, 1));
const failedSink = await textDiagnosticTransport(() => { throw Error("sink failed"); }, async () =>
  new Response('{"error":{"param":"response_format"}}', {status: 400}))("https://integrate.api.nvidia.com/v1/chat/completions");
check("diagnostic sink failure cannot turn an observed HTTP rejection into transport failure", () => assert.equal(failedSink.status, 400));

const now = Date.now();
const reader = await ReadOnlyRepositoryExecutor.create({executorId: "TEXT-EVAL-TEST", tokenId: "TEXT-TOKEN-TEST",
  repositoryRoot: resolve("."), resourceScopes: ["scripts/omega/benchmarks"], issuedAtEpochMs: now - 1,
  expiresAtEpochMs: now + 60000, constraints: {maxFileBytes: 1, maxDirectoryEntries: 1, allowedExtensions: [".txt"]},
  issuer: "TEXT-TEST", auditIdentity: "TEXT-TEST-AUDIT"});
reader.terminate(now, "NO_TOOLS");
let dispatches = 0; const captured: string[] = []; const evidence: NvidiaNimEvidence[] = [];
const makeProvider = (content: string, finishReason = "stop") => NvidiaNimProvider.create({providerId: "TEXT-TEST",
  model: TEXT_BENCHMARK_POLICY.model, authorityMode: "TEST_DOUBLE_ONLY",
  credentialSource: {sourceIdentity: "test-double", read: () => "synthetic-not-a-credential"},
  maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 5000,
  transport: async (_url, init) => {dispatches++; captured.push(String(init?.body));
    return new Response(JSON.stringify({choices: [{message: {content}, finish_reason: finishReason}],
      usage: {prompt_tokens: 40, completion_tokens: 20, total_tokens: 60}}), {status: 200});}});
const config = (provider: NvidiaNimProvider) => ({sessionId: "TEXT-TEST", reader, model: {complete: async (request: Parameters<NvidiaNimProvider["complete"]>[0]) => {
  const result = await provider.complete(request); evidence.push(result.evidence); return result;}},
  candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0, maxModelCallsPerTurn: 1,
  maxTurnMs: 5000, maxOutputTokens: 8192});
const task = {family: "AIME_2025" as const, taskId: "SYNTHETIC", question: "QUESTION_ONLY", answer: "731"};
const result = await invokeExistingNyxText(config(makeProvider('{"kind":"REPLY","message":"The answer is: 731"}')), task.question);
check("actual existing NYX session composes with benchmark adapter", () => assert.equal(result?.outcome, "REPLIED"));
check("exactly one logical completion consumed", () => assert.equal(result?.modelCalls, 1));
check("reference does not enter request payload", () => assert(!captured[0].includes("731")));
const sanitized = sanitizedTextResult(task, result, evidence, true, 10);
check("receipts retain verdict but not private reference or raw prediction", () => assert(!JSON.stringify(sanitized).includes("731")));
check("correct result has independent PASS classification", () => assert.equal(sanitized.state, "PASS"));
check("unknown judge result cannot be accepted", () => assert.equal(textOutcome(result, evidence, null), "VERIFIER_FAILURE"));
const denied = {...result!, outcome: "REJECTED" as const, events: [{...result!.events[0], eventType: "DENIAL" as const,
  outcome: "model_output_not_json"}]};
check("JSON rejection is serialization failure, not inferred unauthorized action", () =>
  assert.equal(textOutcome(denied, evidence, null), "SCHEMA_FAILURE"));
check("malformed typed schema remains distinct from authorization", () =>
  assert.equal(textOutcome({...denied, events: [{...denied.events[0], outcome: "unknown_or_malformed_typed_action"}]}, evidence, null), "SCHEMA_FAILURE"));
check("sensitive-content denial is not a reasoning score", () =>
  assert.equal(textOutcome({...denied, events: [{...denied.events[0], outcome: "model_output_credential_pattern"}]}, evidence, null), "SECURITY_POLICY_REJECTION"));
check("unknown arbitrary outcome never survives sanitized receipt", () => {
  const receipt = sanitizedTextResult(task, {...denied, events: [{...denied.events[0], outcome: "PRIVATE_UNTRUSTED_VALUE"}]}, evidence, null, 1);
  assert.equal(receipt.eventOutcomes[0].outcome, "OTHER_RECORDED_OUTCOME");
  assert(!JSON.stringify(receipt).includes("PRIVATE_UNTRUSTED_VALUE"));
});
check("returned wrong answer is not a provider error", () => assert.equal(textOutcome(result, evidence, false), "REASONING_OR_ANSWER_FORMAT_FAILURE"));
check("well-formed wrong integer is a reasoning failure, not a format defect", () =>
  assert.equal(sanitizedTextResult(task, result, evidence, false, 1).state, "REASONING_FAILURE"));
check("invalid final integer format remains an interface failure", () =>
  assert.equal(sanitizedTextResult(task, {...result!, message: "several possible answers"}, evidence, false, 1).state, "ANSWER_FORMAT_FAILURE"));
const lengthEvidence = evidence.map(e => ({...e, finishReason: "length" as const}));
check("truncation remains separate from wrong answer", () => assert.equal(textOutcome(result, lengthEvidence, false), "TRUNCATION"));
const failedEvidence = evidence.map(e => ({...e, failureCategory: "PROVIDER_TIMEOUT" as const}));
check("provider failure remains separate from truncation", () => assert.equal(textOutcome(result, failedEvidence, false), "PROVIDER_FAILURE"));
const retry = {...evidence[0], evidenceClass: "E4" as const, networkAttempted: true, delivery: {
  policy: "nvidia-capacity/1" as const, requestsPerMinute: 40 as const,
  scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT" as const, httpAttempts: 2, rateLimitedResponses: 0,
  transientUnavailableResponses: 1, timedOutAttempts: 0, capacityWaitMs: 60000, state: "DELIVERED" as const,
  notBeforeEpochMs: null, authorityRenewed: false as const}};
check("retry cost and unknown usage are not hidden", () => assert.deepEqual(textInferenceUsage([retry], 10), {
  logicalCalls: 1, physicalCalls: 2, httpAttempts: 2, reportedTokens: 60, unknownUsageCalls: 1,
  toolCalls: 0, toolWorkUnits: 0, wallClockMs: 10, providerFailures: 1, retries: 1}));
const unknown = {...retry, usage: {promptTokens: null, completionTokens: null, totalTokens: null}};
check("failed physical calls are all unknown, not zero compute", () => assert.equal(textInferenceUsage([unknown], 10).unknownUsageCalls, 2));
check("local rejection cannot invent live HTTP attempts", () => assert.equal(textInferenceUsage([
  {...unknown, networkAttempted: false, delivery: {...unknown.delivery, httpAttempts: 0, timedOutAttempts: 0,
    transientUnavailableResponses: 0}, failureCategory: null}], 10).physicalCalls, 0));
const countBefore = dispatches;
const oversized = await invokeExistingNyxText(config(makeProvider('{}')), "a".repeat(8000));
check("oversized objective is capability blocked without truncation", () => assert.equal(oversized, null));
check("oversized objective consumes no live model call", () => assert.equal(dispatches, countBefore));
await assert.rejects(() => invokeExistingNyxText({...config(makeProvider('{}')), editablePaths: ["secret.txt"]}, "QUESTION"));
check("mutation scope cannot be added by evaluator", () => assert.equal(dispatches, countBefore));
evidence.length = 0;
const unauthorized = await invokeExistingNyxText(config(makeProvider('{"kind":"READ_FILE","path":"scripts/omega/benchmarks/secret.txt"}')), "QUESTION");
check("model tool request remains an authorization/protocol failure", () => assert.equal(textOutcome(unauthorized, evidence, null), "PROTOCOL_OR_AUTHORIZATION_FAILURE"));
check("revoked reader performs no filesystem action", () => assert(reader.auditLog().every(t => t.toolAction === null)));
const expiredDelivery = {...unknown, failureCategory: null, delivery: {...unknown.delivery, state: "STOPPED" as const}};
check("capacity-expired delivery remains provider failure even without terminal category", () =>
  assert.equal(textOutcome(result, [expiredDelivery], null), "PROVIDER_FAILURE"));
check("expired waiting-for-capacity delivery cannot become a schema failure", () =>
  assert.equal(textOutcome(result, [{...expiredDelivery, delivery: {...expiredDelivery.delivery,
    state: "WAITING_FOR_CAPACITY" as const}}], null), "PROVIDER_FAILURE"));

const longQuestion = "public bounded objective ".repeat(500);
const fixture = await R3BenchmarkRepositorySession.create({"src/question.mjs": `export const question = ${JSON.stringify(longQuestion)};\n`},
  "a".repeat(40), Date.now() + 60000, 1);
const fileReader = await ReadOnlyRepositoryExecutor.create({executorId: "TEXT-FILE-TEST", tokenId: "TEXT-FILE-TOKEN",
  repositoryRoot: fixture.sourceRoot, resourceScopes: ["src/question.mjs"], issuedAtEpochMs: now - 1,
  expiresAtEpochMs: Date.now() + 60000, constraints: {maxFileBytes: 64000, maxDirectoryEntries: 1, allowedExtensions: [".mjs"]},
  issuer: "TEXT-TEST", auditIdentity: "TEXT-FILE-AUDIT"});
try {
  let at = 0; const actions = [JSON.stringify({kind: "READ_FILE", path: "src/question.mjs"}),
    JSON.stringify({kind: "REPLY", message: "The answer is: 731"})];
  const fileProvider = NvidiaNimProvider.create({providerId: "TEXT-FILE-TEST", model: TEXT_BENCHMARK_POLICY.model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-double", read: () => "synthetic-not-a-credential"},
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 5000, transport: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (at === 1) assert(body.messages.some((m: {content: string}) => m.content.includes(longQuestion)));
      assert(!JSON.stringify(body).includes("731"));
      return new Response(JSON.stringify({choices: [{message: {content: actions[at++]}, finish_reason: "stop"}],
        usage: {prompt_tokens: 40, completion_tokens: 20, total_tokens: 60}}), {status: 200});}});
  const fileResult = await invokeExistingNyxText({...config(fileProvider), sessionId: "TEXT-FILE-TEST", reader: fileReader,
    maxModelCallsPerTurn: 2}, longQuestion, "SCOPED_FILE");
  check("long problem is observed intact through existing scoped R1", () => assert.equal(fileResult?.outcome, "REPLIED"));
  check("file delivery consumes two honestly counted calls", () => assert.equal(fileResult?.modelCalls, 2));
  check("whole-question R1 evidence is available", () => assert.equal(fileReader.auditLog().filter(t => t.toolAction !== null).length, 1));
  check("authorized file read is not a forbidden-tool regression", () => assert.equal(textOutcome(fileResult, [], true), "PASS"));
  const noRead = await invokeExistingNyxText({...config(makeProvider('{"kind":"REPLY","message":"The answer is: 7"}')),
    sessionId: "TEXT-NO-READ", reader: fileReader, maxModelCallsPerTurn: 2}, "QUESTION", "SCOPED_FILE");
  // A previous session's observation must not satisfy a new task's requirement.
  check("task-local read must not be substituted with earlier audit evidence", () => assert.notEqual(noRead?.outcome, "REPLIED"));
  check("missing whole-question observation is not a reasoning score", () =>
    assert.equal(textOutcome(noRead, [], null), "MISSING_REQUIRED_REPOSITORY_ACTION"));
  let mismatchedCall = 0;
  const mismatched = await invokeExistingNyxText({...config(makeProvider('{}')), reader: fileReader,
    maxModelCallsPerTurn: 2, model: {complete: async request => {
      const response = await makeProvider(actions[mismatchedCall++]).complete(request); return response;
    }}}, "A different objective", "SCOPED_FILE");
  check("fresh but wrong question observation cannot prove frozen-task execution", () =>
    assert.equal(textOutcome(mismatched, [], null), "REPOSITORY_OBSERVATION_BINDING_FAILURE"));
} finally {
  fileReader.terminate(Date.now(), "TEST_FINISHED");
  const cleanup = await fixture.close();
  check("file delivery owned fixture cleanup verified", () => assert(cleanup.cleanupVerified && cleanup.sourceUnchanged));
}
console.log(`Omega NYX text benchmark tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
