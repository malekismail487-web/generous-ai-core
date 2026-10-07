import assert from "node:assert/strict";
import { resolve } from "node:path";
import { NvidiaNimProvider, type NvidiaNimEvidence } from "../src/lib/codelab/model/nvidiaNimProvider";
import { NvidiaCapacityCoordinator } from "../src/lib/codelab/model/nvidiaCapacity";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R3BenchmarkRepositorySession } from "./omega/benchmarks/r3RepositorySession";
import { gradeAime, invokeExistingNyxText, sanitizedTextResult, textInferenceUsage, textOutcome, textTaskPrompt,
  TEXT_BENCHMARK_POLICY, textConfiguredRequest, TEXT_DELIVERY_DIAGNOSTICS, TEXT_COMPATIBILITY_DIAGNOSTICS, TEXT_ACTION_SCHEMA_DIAGNOSTICS, TEXT_HOSTED_DIAGNOSTICS,
  textDiagnosticTransport, textRejectionHint, textCapabilityGap, compareTextPair, textTransferSelection,
  textWholePopulation, textPopulationIsFullyGraded, textDeliveryBlocked, textTimeoutTransferSelection,
  compareTextTimeoutPair, textBoundedTaskRequest, textFullFamilySelection,
  textHttpAttemptAllowance, textRecoveryTransferSelection, compareTextRecoveryPair,
  textDeliveryPreflightSelection, textDeliveryPreflightReady, textSharedRecoverySelection,
  textSessionActionContract, textSessionContractSelection, TEXT_SESSION_CONTRACT_DIAGNOSTICS, compareTextContractPair,
  textContractDiagnosticReady } from "./omega/benchmarks/nyxTextBenchmark";
import { nyxChatContractFormat } from "../src/lib/codelab/cli/nyxChatProtocol";

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
const windowTasks = (["AIME_2025", "BBEH_MINI"] as const).flatMap(family => Array.from({length: 8}, (_, index) =>
  ({family, taskId: family + "-" + index, question: "synthetic-window-" + index, answer: String(index)})));
check("historical transfer window is unchanged without an explicit offset", () =>
  assert.deepEqual(textTransferSelection(windowTasks).map(task => task.taskId),
    ["AIME_2025-4", "AIME_2025-5", "BBEH_MINI-4", "BBEH_MINI-5"]));
check("new transfer window is positional and disjoint from earlier task identities", () => {
  const historical = textTransferSelection(windowTasks);
  const fresh = textTransferSelection(windowTasks, 6);
  assert.deepEqual(fresh.map(task => task.taskId), ["AIME_2025-6", "AIME_2025-7", "BBEH_MINI-6", "BBEH_MINI-7"]);
  assert(fresh.every(task => !historical.some(previous => previous.taskId === task.taskId)));
});
check("transfer selection cannot consult or favor reference answers", () => {
  const changed = windowTasks.map(task => ({...task, answer: "a different private oracle"}));
  assert.deepEqual(textTransferSelection(changed, 6).map(task => task.taskId),
    textTransferSelection(windowTasks, 6).map(task => task.taskId));
});
check("invalid or incomplete windows fail closed instead of silently selecting fewer tasks", () => {
  for (const start of [-1, 1.5, NaN, Infinity, 7, "6" as never]) assert.throws(() => textTransferSelection(windowTasks, start));
});
const wholeTasks = (["AIME_2025", "BBEH_MINI"] as const).flatMap(family => Array.from({length: family === "AIME_2025" ? 30 : 460},
  (_, index) => ({family, taskId: `${family}-${index}`, question: "synthetic full-population objective", answer: String(index)})));
check("full AIME selection retains every ordered task without narrowing the corpus", () => {
  const selected = textWholePopulation(wholeTasks, "AIME_2025");
  assert.deepEqual(selected.map(task => task.taskId), Array.from({length: 30}, (_, index) => `AIME_2025-${index}`));
  assert(Object.isFrozen(selected)); assert.equal(wholeTasks.length, 490);
});
check("full BBEH population remains independently selectable and cannot disappear", () =>
  assert.equal(textWholePopulation(wholeTasks, "BBEH_MINI").length, 460));
check("FULL_BBEH retains every pinned task in order and excludes unrelated AIME tasks", () => {
  const selected = textFullFamilySelection(wholeTasks, "FULL_BBEH");
  assert.deepEqual(selected.map(task => task.taskId), Array.from({length: 460}, (_, index) => `BBEH_MINI-${index}`));
  assert(Object.isFrozen(selected)); assert.equal(wholeTasks.length, 490);
});
check("FULL_AIME compatibility is preserved by full-family dispatch", () =>
  assert.deepEqual(textFullFamilySelection(wholeTasks, "FULL_AIME"), textWholePopulation(wholeTasks, "AIME_2025")));
check("unknown full-family modes cannot silently choose a smaller campaign", () =>
  assert.throws(() => textFullFamilySelection(wholeTasks, "FULL_UNKNOWN" as never)));
check("BBEH whole-family selection never reads questions or reference answers", () => {
  const guarded = wholeTasks.map(task => ({family: task.family, taskId: task.taskId,
    get question(): string {throw Error("question inspected by selector");},
    get answer(): string {throw Error("private answer inspected by selector");}}));
  assert.equal(textFullFamilySelection(guarded, "FULL_BBEH").length, 460);
});
check("whole-population selection cannot inspect questions or reference answers", () => {
  const protectedTasks = wholeTasks.map(task => ({family: task.family, taskId: task.taskId,
    get question(): string {throw Error("question inspected before selection");},
    get answer(): string {throw Error("private oracle inspected by selector");}}));
  assert.equal(textWholePopulation(protectedTasks, "AIME_2025").length, 30);
});
check("next committed transfer offset selects unseen positions in both full populations", () =>
  assert.deepEqual(textTransferSelection(wholeTasks, 8).map(task => task.taskId),
    ["AIME_2025-8", "AIME_2025-9", "BBEH_MINI-8", "BBEH_MINI-9"]));
check("missing, duplicate or unsupported whole populations fail closed", () => {
  assert.throws(() => textWholePopulation(wholeTasks.slice(1), "AIME_2025"));
  assert.throws(() => textWholePopulation([...wholeTasks.slice(1), wholeTasks[1]], "AIME_2025"));
  assert.throws(() => textWholePopulation(wholeTasks, "DEVELOPMENT_DIAGNOSTIC" as never));
});
check("full-score eligibility requires every task executed and independently graded", () => {
  assert(textPopulationIsFullyGraded("AIME_2025", 30, 30, 30));
  assert(textPopulationIsFullyGraded("BBEH_MINI", 460, 460, 460));
  assert(!textPopulationIsFullyGraded("AIME_2025", 30, 29, 29));
  assert(!textPopulationIsFullyGraded("AIME_2025", 30, 30, 29));
});
check("zero or subset counts cannot falsely certify an omitted benchmark family", () => {
  for (const family of ["AIME_2025", "BBEH_MINI", "DEVELOPMENT_DIAGNOSTIC"] as const)
    assert(!textPopulationIsFullyGraded(family, 0, 0, 0));
  assert(!textPopulationIsFullyGraded("AIME_2025", 2, 2, 2));
  assert(!textPopulationIsFullyGraded("AIME_2025", 31, 31, 31));
  assert(!textPopulationIsFullyGraded("AIME_2025", 30, 30, NaN));
});
check("hosted/native diagnostic isolates template kwargs instead of changing inference budget", () => {
  const legacy = textConfiguredRequest(originalRequest, "BOUNDED_GUIDED");
  const hosted = textConfiguredRequest(originalRequest, "HOSTED_BOUNDED");
  assert.equal(hosted.reasoningControl, "ULTRA_HOSTED_NATIVE");
  assert.deepEqual({...hosted, reasoningControl: legacy.reasoningControl}, legacy);
});
check("hosted diagnostics contain no reused development objective", () =>
  assert(TEXT_HOSTED_DIAGNOSTICS.every(task => ![...TEXT_DELIVERY_DIAGNOSTICS, ...TEXT_COMPATIBILITY_DIAGNOSTICS,
    ...TEXT_ACTION_SCHEMA_DIAGNOSTICS].some(prior => prior.question === task.question))));
check("hosted interval oracle is independent enumeration", () => assert.equal(String(
  Array.from({length: 13}, (_, i) => i + 2).filter(value => value % 3 !== 0).length), TEXT_HOSTED_DIAGNOSTICS[0].answer));
check("schema correction does not enable rejected reasoning/template settings", () => {
  const configured = textConfiguredRequest(originalRequest, "OBSERVATION_ALIGNED_SCHEMA", "SCOPED_FILE", false);
  assert.equal(configured.inferencePolicy, undefined); assert.equal(configured.reasoningControl, undefined);
  assert.equal(configured.maxTokens, originalRequest.maxTokens); assert.equal(configured.temperature, originalRequest.temperature);
  assert.strictEqual(configured.messages, originalRequest.messages);
});
check("unobserved file requires only the previously authorized read shape", () => {
  const format = textConfiguredRequest(originalRequest, "OBSERVATION_ALIGNED_SCHEMA", "SCOPED_FILE", false).responseFormat;
  assert(format && typeof format === "object"); assert.equal(format.type, "JSON_SCHEMA");
  assert.equal(format.name, "nyx_question_read"); assert.equal(format.schema.additionalProperties, false);
  assert.deepEqual(format.schema.required, ["kind", "path"]);
  assert(!JSON.stringify(format).includes("PROPOSE_EDIT")); assert(!JSON.stringify(format).includes("TERMINAL"));
});
check("observed and direct tasks use only exact reply shape", () => {
  for (const delivery of ["DIRECT", "SCOPED_FILE"] as const) {
    const format = textConfiguredRequest(originalRequest, "OBSERVATION_ALIGNED_SCHEMA", delivery, true).responseFormat;
    assert(format && typeof format === "object"); assert.equal(format.name, "nyx_final_reply");
    assert.deepEqual(format.schema.required, ["kind", "message"]); assert.equal(format.schema.additionalProperties, false);
    assert(!JSON.stringify(format).includes("src/question.mjs"));
  }
});
check("model text cannot become a trusted observation-state boolean", () =>
  assert.throws(() => textConfiguredRequest(originalRequest, "OBSERVATION_ALIGNED_SCHEMA", "SCOPED_FILE", "observed" as never)));
check("development schema tasks are disjoint from earlier diagnostics", () =>
  assert(TEXT_ACTION_SCHEMA_DIAGNOSTICS.every(task => ![...TEXT_DELIVERY_DIAGNOSTICS, ...TEXT_COMPATIBILITY_DIAGNOSTICS]
    .some(prior => prior.question === task.question))));
check("development arithmetic oracle is derived independently of model behavior", () => {
  assert.equal(String(Array.from({length: 6}, (_, i) => (i + 1) * (12 - i)).reduce((a, b) => a + b, 0) % 7),
    TEXT_ACTION_SCHEMA_DIAGNOSTICS[0].answer);
});
check("development ordering oracle is independently enumerated", () => {
  const permutations = (letters: string[]): string[][] => letters.length === 0 ? [[]]
    : letters.flatMap((letter, i) => permutations(letters.filter((_, j) => i !== j)).map(tail => [letter, ...tail]));
  const valid = permutations(["A", "B", "C", "D", "E", "F"]).filter(p => p.indexOf("E") === p.indexOf("F") + 1
    && p.indexOf("D") === p.indexOf("E") + 1 && p.indexOf("C") === p.indexOf("D") + 1
    && p.indexOf("B") < p.indexOf("F") && p.indexOf("A") > p.indexOf("C"));
  assert.equal(valid.length, 1); assert.equal(String(valid[0].indexOf("D") + 1), TEXT_ACTION_SCHEMA_DIAGNOSTICS[1].answer);
});
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
const budgetEvidence = {scope: "HOST_OWNED_RUN_INCLUDING_RETRIES" as const, limit: 2, dispatched: 2,
  remainingAttempts: 0, exhausted: true, dispatchDenied: true, renewed: false as const};
check("local physical budget exhaustion is not provider, schema, or reasoning failure", () =>
  assert.equal(textOutcome(denied, [{...unknown, delivery: {...unknown.delivery, state: "STOPPED", httpAttemptBudget: budgetEvidence}}], null),
    "RESOURCE_EXHAUSTION"));
check("successful final dispatch is still eligible for independent answer grading", () =>
  assert.equal(textOutcome(result, [{...retry, delivery: {...retry.delivery, httpAttemptBudget: {...budgetEvidence, dispatchDenied: false}}}], true), "PASS"));
const compoundBlocked = sanitizedTextResult(task, denied,
  [{...unknown, delivery: {...unknown.delivery, state: "STOPPED", httpAttemptBudget: budgetEvidence}}], null, 1);
check("resource exhaustion cannot hide the provider failure that prevented grading", () => {
  assert.equal(compoundBlocked.state, "RESOURCE_EXHAUSTION");
  assert.equal(compoundBlocked.correct, null); assert(compoundBlocked.usage.providerFailures > 0);
  assert(textDeliveryBlocked(compoundBlocked));
});
check("two compound delivery failures open the same bounded circuit despite different final labels", () => {
  let streak = 0;
  for (const row of [compoundBlocked, {...compoundBlocked, state: "SCHEMA_FAILURE"}])
    streak = textDeliveryBlocked(row) ? streak + 1 : 0;
  assert.equal(streak, 2);
});
check("a completed correct answer with recovered retry does not count as blocked delivery", () =>
  assert(!textDeliveryBlocked({...compoundBlocked, state: "PASS", correct: true})));
check("a graded wrong answer remains a measured failure rather than an outage", () =>
  assert(!textDeliveryBlocked({...compoundBlocked, state: "REASONING_FAILURE", correct: false})));
check("ordinary exhausted authority without provider failure cannot invent an outage", () =>
  assert(!textDeliveryBlocked({...compoundBlocked, usage: {...compoundBlocked.usage, providerFailures: 0}})));
check("an observed primary provider failure still stops when detailed cost is unknown", () =>
  assert(textDeliveryBlocked({...compoundBlocked, state: "PROVIDER_FAILURE", usage: {...compoundBlocked.usage, providerFailures: 0}})));
check("a genuine non-provider task outcome resets consecutive outage tracking", () => {
  let streak = 1;
  const row = {...compoundBlocked, state: "SCHEMA_FAILURE", usage: {...compoundBlocked.usage, providerFailures: 0}};
  streak = textDeliveryBlocked(row) ? streak + 1 : 0;
  assert.equal(streak, 0);
});
check("failed physical calls are all unknown, not zero compute", () => assert.equal(textInferenceUsage([unknown], 10).unknownUsageCalls, 2));
check("local rejection cannot invent live HTTP attempts", () => assert.equal(textInferenceUsage([
  {...unknown, networkAttempted: false, delivery: {...unknown.delivery, httpAttempts: 0, timedOutAttempts: 0,
    transientUnavailableResponses: 0}, failureCategory: null}], 10).physicalCalls, 0));
check("a passed task does not create an unresolved capability gap", () => assert.equal(textCapabilityGap(sanitized), null));
check("schema failure registers existing gap semantics without claiming repair", () => {
  const gap = textCapabilityGap(sanitizedTextResult(task, denied, evidence, null, 1));
  assert(gap); assert.equal(gap.failureClass, "SCHEMA_FAILURE"); assert.equal(gap.grantsAuthority, false);
  assert.equal(gap.benchmarkReevaluationEligible, false); assert.equal(gap.steps.length, 0);
  assert.equal(gap.status, "OBSERVED");
});
const pairRows = [{...sanitized, configuration: "EXISTING_DEFAULT" as const},
  {...sanitized, configuration: "OBSERVATION_ALIGNED_SCHEMA" as const}];
check("realized comparison requires bound same-input distinct configurations", () => assert(compareTextPair(pairRows).matchedRealizedCompute));
check("duplicate configuration cannot establish an ablation", () => assert(!compareTextPair([pairRows[0], pairRows[0]]).boundPair));
check("different objective cannot masquerade as paired transfer", () =>
  assert(!compareTextPair([pairRows[0], {...pairRows[1], inputDigest: "a".repeat(64)}]).boundPair));
check("unknown usage blocks actual-compute matching", () =>
  assert(!compareTextPair([pairRows[0], {...pairRows[1], usage: {...pairRows[1].usage, unknownUsageCalls: 1}}]).matchedRealizedCompute));
check("equal call ceiling cannot hide extra realized model tokens", () =>
  assert(!compareTextPair([pairRows[0], {...pairRows[1], usage: {...pairRows[1].usage, reportedTokens: 600}}]).matchedRealizedCompute));
const ignoredGrammar = await invokeExistingNyxText({...config(makeProvider('{"kind":"UNKNOWN","message":"The answer is: 731"}')),
  model: {complete: request => makeProvider('{"kind":"UNKNOWN","message":"The answer is: 731"}')
    .complete(textConfiguredRequest(request, "OBSERVATION_ALIGNED_SCHEMA"))}}, "QUESTION");
check("ignored hosted grammar cannot bypass unchanged local action parser", () =>
  assert.equal(textOutcome(ignoredGrammar, [], null), "SCHEMA_FAILURE"));
const afterIgnoredGrammar = dispatches;
const oversized = await invokeExistingNyxText(config(makeProvider('{}')), "a".repeat(8000));
check("oversized objective is capability blocked without truncation", () => assert.equal(oversized, null));
check("oversized objective consumes no live model call", () => assert.equal(dispatches, afterIgnoredGrammar));
await assert.rejects(() => invokeExistingNyxText({...config(makeProvider('{}')), editablePaths: ["secret.txt"]}, "QUESTION"));
check("mutation scope cannot be added by evaluator", () => assert.equal(dispatches, afterIgnoredGrammar));
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
check("timeout transfer counterbalances a fresh positional window with identical inference configuration", () => {
  const tasks = textTimeoutTransferSelection(wholeTasks, 10);
  assert.equal(tasks.length, 8);
  assert.deepEqual(tasks.slice(0, 4).map(task => task.timeoutProfile),
    ["FIXED_ATTEMPT", "FINAL_CALLER_LEASE", "FINAL_CALLER_LEASE", "FIXED_ATTEMPT"]);
  assert(tasks.every(task => task.configuration === "OBSERVATION_ALIGNED_SCHEMA"));
  assert.deepEqual(tasks.map(task => task.taskId),
    ["AIME_2025-10-FIXED_ATTEMPT", "AIME_2025-10-FINAL_CALLER_LEASE", "AIME_2025-11-FINAL_CALLER_LEASE", "AIME_2025-11-FIXED_ATTEMPT",
      "BBEH_MINI-10-FIXED_ATTEMPT", "BBEH_MINI-10-FINAL_CALLER_LEASE", "BBEH_MINI-11-FINAL_CALLER_LEASE", "BBEH_MINI-11-FIXED_ATTEMPT"]);
});
check("setup cannot move model deadline beyond the pre-provision task lease", () => {
  const configured = textBoundedTaskRequest({...originalRequest, deadlineEpochMs: 9000}, 8000);
  assert.equal(configured.deadlineEpochMs, 8000);
  assert.strictEqual(configured.messages, originalRequest.messages); assert.equal(configured.maxTokens, originalRequest.maxTokens);
});
check("an earlier or expired model deadline is never renewed", () =>
  assert.equal(textBoundedTaskRequest({...originalRequest, deadlineEpochMs: 1000}, 8000).deadlineEpochMs, 1000));
check("missing caller deadline receives only the already frozen task expiry", () =>
  assert.equal(textBoundedTaskRequest(originalRequest, 8000).deadlineEpochMs, 8000));
check("malformed task or model expiry fails closed", () => {
  assert.throws(() => textBoundedTaskRequest(originalRequest, NaN));
  assert.throws(() => textBoundedTaskRequest({...originalRequest, deadlineEpochMs: Infinity}, 8000));
});
check("timeout transfer cannot choose tasks using answers or correctness", () => {
  const changed = wholeTasks.map(task => ({...task, answer: "changed private oracle", question: "different content"}));
  assert.deepEqual(textTimeoutTransferSelection(changed, 10).map(task => task.taskId),
    textTimeoutTransferSelection(wholeTasks, 10).map(task => task.taskId));
});
check("timeout transfer retains positional bounds", () => {
  for (const start of [-1, NaN, 29]) assert.throws(() => textTimeoutTransferSelection(wholeTasks, start));
});
const timeoutRows = pairRows.map((row, index) => ({...row, configuration: "OBSERVATION_ALIGNED_SCHEMA" as const,
  timeoutProfile: index ? "FINAL_CALLER_LEASE" as const : "FIXED_ATTEMPT" as const}));
check("timeout comparison requires unchanged task/oracle/configuration and distinct delivery profiles", () =>
  assert(compareTextTimeoutPair(timeoutRows).matchedRealizedCompute));
check("duplicate timeout profiles cannot establish an ablation", () =>
  assert(!compareTextTimeoutPair([timeoutRows[0], timeoutRows[0]]).boundPair));
check("timeout comparison cannot combine inference and timeout changes", () =>
  assert(!compareTextTimeoutPair([timeoutRows[0], {...timeoutRows[1], configuration: "EXISTING_DEFAULT"}]).boundPair));
check("unknown timeout compute prevents matched-cognitive comparison", () =>
  assert(!compareTextTimeoutPair([timeoutRows[0], {...timeoutRows[1], usage: {...timeoutRows[1].usage, unknownUsageCalls: 1}}]).matchedRealizedCompute));
check("timeout reliability comparison never promotes cognition automatically", () =>
  assert.equal(compareTextTimeoutPair(timeoutRows).cognitivePromotion, false));
check("historical physical limits remain unchanged unless recovery is explicitly selected", () => {
  assert.equal(textHttpAttemptAllowance("DIRECT"), 1);
  assert.equal(textHttpAttemptAllowance("SCOPED_FILE"), 2);
  assert.equal(textHttpAttemptAllowance("DIRECT", "BOUNDED_RECOVERY"), 3);
  assert.equal(textHttpAttemptAllowance("SCOPED_FILE", "BOUNDED_RECOVERY"), 4);
});
check("unknown recovery or delivery requests cannot obtain retry authority", () => {
  assert.throws(() => textHttpAttemptAllowance("DIRECT", "UNBOUNDED" as never));
  assert.throws(() => textHttpAttemptAllowance("SHELL" as never, "BOUNDED_RECOVERY"));
});
check("fresh recovery comparison changes only the named delivery allowance", () => {
  const selection = textRecoveryTransferSelection(wholeTasks, 12);
  assert.equal(selection.length, 8);
  assert.deepEqual(selection.slice(0, 4).map(t => t.recoveryProfile),
    ["FIXED_REQUESTS", "BOUNDED_RECOVERY", "BOUNDED_RECOVERY", "FIXED_REQUESTS"]);
  assert(selection.every(t => t.configuration === "OBSERVATION_ALIGNED_SCHEMA"));
  assert.deepEqual(selection.map(t => t.question), textRecoveryTransferSelection(
    wholeTasks.map(t => ({...t, answer: "different private reference"})), 12).map(t => t.question));
});

// Independent fault schedules exercise the actual NYX session/provider/capacity composition.
// Virtual waiting avoids real network, credentials, benchmark questions and sixty-second test sleeps.
async function deliveryReproduction(profile: "FIXED_REQUESTS" | "BOUNDED_RECOVERY", statuses: number[],
  options: {leaseMs?: number; content?: string; finishReason?: string} = {}) {
  const frozenAt = Date.now(); let virtualNow = frozenAt;
  const bodies: string[] = []; const observations: NvidiaNimEvidence[] = [];
  const starts: number[] = []; let credentialReads = 0;
  const provider = NvidiaNimProvider.create({providerId: "TEXT-RECOVERY-DEVELOPMENT", model: TEXT_BENCHMARK_POLICY.model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-double:recovery", read: () => {
      credentialReads++; return "synthetic-not-a-credential";}},
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 5000,
    testCapacity: new NvidiaCapacityCoordinator({now: () => virtualNow, sleep: async (ms, signal) => {
      signal.throwIfAborted(); virtualNow += ms;}}), onCapacityProgress: () => undefined,
    transport: async (_url, init) => {
      const index = bodies.length; bodies.push(String(init?.body)); starts.push(virtualNow);
      const status = statuses[index] ?? 200;
      if (status !== 200) return new Response(null, {status});
      return new Response(JSON.stringify({choices: [{message: {content: options.content
        ?? '{"kind":"REPLY","message":"The answer is: 731"}'}, finish_reason: options.finishReason ?? "stop"}],
        usage: {prompt_tokens: 40, completion_tokens: 20, total_tokens: 60}}), {status: 200});
    }}).withHttpAttemptBudget(textHttpAttemptAllowance("DIRECT", profile));
  const outcome = await invokeExistingNyxText({...config(provider), sessionId: `RECOVERY-${profile}`,
    maxTurnMs: 180000, model: {complete: async request => {
      const response = await provider.complete(textBoundedTaskRequest(
        textConfiguredRequest(request, "OBSERVATION_ALIGNED_SCHEMA", "DIRECT"), frozenAt + (options.leaseMs ?? 180000)));
      observations.push(response.evidence); return response;}}}, task.question);
  const correct = outcome?.outcome === "REPLIED" ? gradeAime(outcome.message, task.answer) : null;
  return {row: sanitizedTextResult(task, outcome, observations, correct, virtualNow - frozenAt),
    bodies, starts, credentialReads, outcome};
}
const fixedRecovery = await deliveryReproduction("FIXED_REQUESTS", [503, 200]);
const boundedRecovery = await deliveryReproduction("BOUNDED_RECOVERY", [503, 200]);
check("baseline reproduces one-request cap preventing an otherwise recoverable delivery", () => {
  assert.equal(fixedRecovery.row.correct, null); assert.equal(fixedRecovery.bodies.length, 1);
  assert.equal(fixedRecovery.row.state, "RESOURCE_EXHAUSTION");
});
check("bounded recovery actually resumes the same NYX request after a sixty-second 503 cooldown", () => {
  assert.equal(boundedRecovery.row.correct, true); assert.equal(boundedRecovery.row.state, "PASS");
  assert.equal(boundedRecovery.starts[1] - boundedRecovery.starts[0], 60000);
  assert.equal(new Set(boundedRecovery.bodies).size, 1); assert.equal(boundedRecovery.outcome?.modelCalls, 1);
});
check("recovery preserves failed physical work and unknown usage instead of claiming free compute", () => {
  assert.equal(boundedRecovery.row.usage.logicalCalls, 1); assert.equal(boundedRecovery.row.usage.physicalCalls, 2);
  assert.equal(boundedRecovery.row.usage.unknownUsageCalls, 1); assert.equal(boundedRecovery.row.usage.providerFailures, 1);
  assert.equal(boundedRecovery.row.usage.retries, 1); assert.equal(boundedRecovery.row.usage.reportedTokens, 60);
});
const doubleRateLimit = await deliveryReproduction("BOUNDED_RECOVERY", [429, 429, 200]);
check("two successive rate limits recover within the original finite lease and three-request cap", () => {
  assert.equal(doubleRateLimit.row.correct, true); assert.equal(doubleRateLimit.row.usage.physicalCalls, 3);
  assert.equal(doubleRateLimit.starts[2] - doubleRateLimit.starts[0], 120000);
  assert(doubleRateLimit.row.modelEvidence.every(e => e.delivery?.authorityRenewed === false));
});
const shortLease = await deliveryReproduction("BOUNDED_RECOVERY", [429, 200], {leaseMs: 42000});
check("a cooldown beyond task expiry cannot renew the lease or read a credential for another attempt", () => {
  assert.equal(shortLease.row.correct, null); assert.equal(shortLease.bodies.length, 1);
  assert.equal(shortLease.credentialReads, 1); assert.equal(shortLease.row.state, "PROVIDER_FAILURE");
});
const repeatedUnavailable = await deliveryReproduction("BOUNDED_RECOVERY", [503, 503, 200]);
check("persistent service unavailability stops under existing transient retry policy", () => {
  assert.equal(repeatedUnavailable.bodies.length, 2); assert.equal(repeatedUnavailable.row.correct, null);
  assert.equal(repeatedUnavailable.row.state, "PROVIDER_FAILURE");
});
const authFailure = await deliveryReproduction("BOUNDED_RECOVERY", [401, 200]);
check("credential rejection is not retried or bypassed by recovery", () => {
  assert.equal(authFailure.bodies.length, 1); assert.equal(authFailure.row.correct, null);
});
const recoveredWrong = await deliveryReproduction("BOUNDED_RECOVERY", [503, 200],
  {content: '{"kind":"REPLY","message":"The answer is: 730"}'});
check("an independently graded wrong answer after delivery recovery remains a reasoning failure", () => {
  assert.equal(recoveredWrong.row.correct, false); assert.equal(recoveredWrong.row.state, "REASONING_FAILURE");
  assert(!textDeliveryBlocked(recoveredWrong.row));
});
const recoveredFormat = await deliveryReproduction("BOUNDED_RECOVERY", [503, 200],
  {content: '{"kind":"REPLY","message":"Several answers may be possible"}'});
check("an invalid final answer format is not falsely diagnosed as a reasoning failure", () =>
  assert.equal(recoveredFormat.row.state, "ANSWER_FORMAT_FAILURE"));
const emptyTruncation = await deliveryReproduction("BOUNDED_RECOVERY", [200], {content: "", finishReason: "length"});
check("explicit token-limit stop with no final content is truncation rather than reasoning or outage", () =>
  assert.equal(emptyTruncation.row.state, "TRUNCATION"));
const malformedRecovered = await deliveryReproduction("BOUNDED_RECOVERY", [503, 200], {content: "not JSON"});
check("recovery never relaxes the strict typed action parser", () =>
  assert.equal(malformedRecovered.row.state, "SCHEMA_FAILURE"));
const recoveryPair = [{...fixedRecovery.row, configuration: "OBSERVATION_ALIGNED_SCHEMA" as const,
  recoveryProfile: "FIXED_REQUESTS" as const}, {...boundedRecovery.row, configuration: "OBSERVATION_ALIGNED_SCHEMA" as const,
  recoveryProfile: "BOUNDED_RECOVERY" as const}];
check("reliability advantage with unknown retry compute cannot certify a cognitive gain", () => {
  const comparison = compareTextRecoveryPair(recoveryPair);
  assert(comparison.boundPair); assert(!comparison.matchedRealizedCompute); assert(!comparison.cognitivePromotion);
  assert.deepEqual(comparison.graded, [false, true]);
});
check("recovery comparisons reject mixed tasks, oracles, configurations and duplicate profiles", () => {
  assert(!compareTextRecoveryPair([recoveryPair[0], {...recoveryPair[1], inputDigest: "a".repeat(64)}]).boundPair);
  assert(!compareTextRecoveryPair([recoveryPair[0], {...recoveryPair[1], privateOracleDigest: "b".repeat(64)}]).boundPair);
  assert(!compareTextRecoveryPair([recoveryPair[0], {...recoveryPair[1], configuration: "EXISTING_DEFAULT"}]).boundPair);
  assert(!compareTextRecoveryPair([recoveryPair[0], recoveryPair[0]]).boundPair);
});
const preflightTasks = textDeliveryPreflightSelection();
check("shared recovery applies equally to all task arms without modifying source selection", () => {
  const original = [{configuration: "EXISTING_DEFAULT", recoveryProfile: undefined},
    {configuration: "OBSERVATION_ALIGNED_SCHEMA", recoveryProfile: undefined}];
  const changed = textSharedRecoverySelection(original, "BOUNDED_RECOVERY");
  assert(changed.every(row => row.recoveryProfile === "BOUNDED_RECOVERY"));
  assert(original.every(row => row.recoveryProfile === undefined));
  assert.deepEqual(textSharedRecoverySelection(original), original);
});
check("shared recovery rejects invalid profiles and cannot overwrite a transport ablation", () => {
  assert.throws(() => textSharedRecoverySelection([], "UNLIMITED" as never));
  assert.throws(() => textSharedRecoverySelection([{recoveryProfile: "FIXED_REQUESTS" as const},
    {recoveryProfile: "BOUNDED_RECOVERY" as const}], "BOUNDED_RECOVERY"));
});
async function scopedRecoveryReproduction(profile: "FIXED_REQUESTS" | "BOUNDED_RECOVERY",
  options: {failuresBeforeRead?: number; configuration?: "SESSION_NATIVE_PHASE_CONTRACT";
    transientRecovery?: "WITHIN_SHARED_BUDGET"} = {}) {
  const began = Date.now(), expires = began + 180000;
  let virtualNow = began, physical = 0;
  const observations: NvidiaNimEvidence[] = [], bodies: string[] = [];
  const source = 'export const question = "Independent delivery exercise";\n';
  const repository = await R3BenchmarkRepositorySession.create({"src/question.mjs": source}, "a".repeat(40), expires, 1);
  const scopedReader = await ReadOnlyRepositoryExecutor.create({executorId: `SCOPED-RECOVERY-${profile}`,
    tokenId: `SCOPED-RECOVERY-TOKEN-${profile}`, repositoryRoot: repository.sourceRoot,
    resourceScopes: ["src/question.mjs"], issuedAtEpochMs: began - 1, expiresAtEpochMs: expires,
    constraints: {maxFileBytes: 64000, maxDirectoryEntries: 1, allowedExtensions: [".mjs"]},
    issuer: "DEVELOPMENT-ONLY", auditIdentity: `SCOPED-RECOVERY-AUDIT-${profile}`});
  const provider = NvidiaNimProvider.create({providerId: `SCOPED-RECOVERY-${profile}`, model: TEXT_BENCHMARK_POLICY.model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-double", read: () => "synthetic-not-a-credential"},
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 5000, onCapacityProgress: () => undefined,
    testCapacity: new NvidiaCapacityCoordinator({now: () => virtualNow,
      sleep: async (ms, signal) => {signal.throwIfAborted(); virtualNow += ms;}}),
    transport: async (_url, init) => {
      bodies.push(String(init?.body));
      if (++physical <= (options.failuresBeforeRead ?? 1)) return new Response(null, {status: 503});
      const content = physical === (options.failuresBeforeRead ?? 1) + 1 ? '{"kind":"READ_FILE","path":"src/question.mjs"}'
        : '{"kind":"REPLY","message":"The answer is: 731"}';
      return new Response(JSON.stringify({choices: [{message: {content}, finish_reason: "stop"}],
        usage: {prompt_tokens: 40, completion_tokens: 20, total_tokens: 60}}), {status: 200});
    }}).withHttpAttemptBudget(textHttpAttemptAllowance("SCOPED_FILE", profile), options.transientRecovery);
  try {
    const outcome = await invokeExistingNyxText({...config(provider), sessionId: `SCOPED-RECOVERY-${profile}`,
      reader: scopedReader, maxModelCallsPerTurn: 2, maxTurnMs: expires - Date.now(),
      actionContract: textSessionActionContract(options.configuration ?? "OBSERVATION_ALIGNED_SCHEMA", "SCOPED_FILE"),
      model: {complete: async request => {
        const response = await provider.complete(textBoundedTaskRequest(textConfiguredRequest(request,
          options.configuration ?? "OBSERVATION_ALIGNED_SCHEMA", "SCOPED_FILE", scopedReader.auditLog().some(row => row.toolAction !== null)), expires));
        observations.push(response.evidence); return response;
      }}}, "Independent delivery exercise", "SCOPED_FILE");
    const correct = outcome?.outcome === "REPLIED" ? gradeAime(outcome.message, "731") : null;
    return {outcome, row: sanitizedTextResult({family: "DEVELOPMENT_DIAGNOSTIC", taskId: "SCOPED-RECOVERY",
      question: "Independent delivery exercise", answer: "731"}, outcome, observations, correct, virtualNow - began),
      bodies, observations, reads: scopedReader.auditLog().filter(row => row.toolAction !== null).length};
  } finally {
    scopedReader.terminate(Date.now(), "DEVELOPMENT_FINISHED");
    const cleanup = await repository.close();
    assert(cleanup.sourceUnchanged && cleanup.cleanupVerified);
  }
}
const scopedFixed = await scopedRecoveryReproduction("FIXED_REQUESTS");
const scopedRecovered = await scopedRecoveryReproduction("BOUNDED_RECOVERY");
check("two physical attempts reproduce a recovered read followed by blocked final answer", () => {
  assert.equal(scopedFixed.row.state, "RESOURCE_EXHAUSTION"); assert.equal(scopedFixed.row.correct, null);
  assert.equal(scopedFixed.reads, 1); assert.equal(scopedFixed.row.usage.physicalCalls, 2);
});
check("shared bounded recovery completes read and answer without adding reasoning turns", () => {
  assert.equal(scopedRecovered.row.correct, true); assert.equal(scopedRecovered.row.state, "PASS");
  assert.equal(scopedRecovered.outcome?.modelCalls, 2); assert.equal(scopedRecovered.reads, 1);
  assert.equal(scopedRecovered.row.usage.physicalCalls, 3); assert.equal(scopedRecovered.row.usage.unknownUsageCalls, 1);
});
check("scoped recovery retains identical retry payload and never sends the private reference", () => {
  assert.equal(scopedRecovered.bodies[0], scopedRecovered.bodies[1]);
  assert(scopedRecovered.bodies.every(body => !body.includes("731")));
});
check("scoped retry cannot extend the original task expiry or change authorization", () => {
  assert(scopedRecovered.observations.every(row => row.delivery?.authorityRenewed === false));
  assert(scopedRecovered.row.broaderAuthorityGranted === false && scopedRecovered.row.sourceRepositoryMutated === false);
});
const preflightRows = preflightTasks.map(task => ({...sanitizedTextResult(task, result,
  [{...retry, delivery: {...retry.delivery, httpAttempts: 1, transientUnavailableResponses: 0,
    capacityWaitMs: 0}}], true, 1), configuration: task.configuration, recoveryProfile: task.recoveryProfile}));
check("delivery preflight selects only pre-existing independent development objectives", () => {
  assert.equal(preflightTasks.length, 2); assert(Object.isFrozen(preflightTasks));
  assert(preflightTasks.every(task => task.family === "DEVELOPMENT_DIAGNOSTIC" && Object.isFrozen(task)));
  assert.deepEqual(preflightTasks.map(task => task.question), TEXT_ACTION_SCHEMA_DIAGNOSTICS.map(task => task.question));
});
check("preflight preserves exact inference configuration and bounded retry profile", () =>
  assert(preflightTasks.every(task => task.configuration === "OBSERVATION_ALIGNED_SCHEMA"
    && task.recoveryProfile === "BOUNDED_RECOVERY")));
check("complete stable independently graded development delivery establishes narrow readiness", () =>
  assert(textDeliveryPreflightReady(preflightRows)));
check("a wrong independently graded answer remains measurable rather than an infrastructure block", () =>
  assert(textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], correct: false, state: "REASONING_FAILURE"}])));
check("empty partial duplicated or extra preflight rows cannot establish readiness", () => {
  for (const rows of [[], preflightRows.slice(0, 1), [preflightRows[0], preflightRows[0]], [...preflightRows, preflightRows[0]]])
    assert(!textDeliveryPreflightReady(rows));
});
check("ungraded provider schema truncation and resource outcomes never establish readiness", () => {
  for (const state of ["PROVIDER_FAILURE", "SCHEMA_FAILURE", "TRUNCATION", "RESOURCE_EXHAUSTION", "ANSWER_FORMAT_FAILURE"])
    assert(!textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], correct: null, state}]));
});
check("contradictory correctness and outcome labels cannot establish readiness", () => {
  assert(!textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], correct: false}]));
  assert(!textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], state: "REASONING_FAILURE"}]));
});
check("preflight cannot silently substitute a task family input oracle or inference profile", () => {
  for (const delta of [{family: "AIME_2025" as const}, {inputDigest: "a".repeat(64)},
    {privateOracleDigest: "b".repeat(64)}, {configuration: "EXISTING_DEFAULT" as const},
    {recoveryProfile: "FIXED_REQUESTS" as const}])
    assert(!textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], ...delta}]));
});
check("recovered or unknown usage cannot be called stable delivery readiness", () => {
  for (const delta of [{logicalCalls: 2}, {physicalCalls: 2}, {providerFailures: 1}, {retries: 1}, {unknownUsageCalls: 1}])
    assert(!textDeliveryPreflightReady([preflightRows[0], {...preflightRows[1], usage: {...preflightRows[1].usage, ...delta}}]));
});
check("the new contract diagnostic is development-only and counterbalanced", () => {
  const tasks = textSessionContractSelection();
  assert.equal(tasks.length, 4);
  assert(tasks.every(task => task.family === "DEVELOPMENT_DIAGNOSTIC" && task.recoveryProfile === "BOUNDED_RECOVERY"));
  assert.deepEqual(tasks.map(task => task.configuration), ["OBSERVATION_ALIGNED_SCHEMA", "SESSION_ACTION_CONTRACT",
    "SESSION_ACTION_CONTRACT", "OBSERVATION_ALIGNED_SCHEMA"]);
  assert(TEXT_SESSION_CONTRACT_DIAGNOSTICS.every(task =>
    ![...TEXT_DELIVERY_DIAGNOSTICS, ...TEXT_ACTION_SCHEMA_DIAGNOSTICS, ...TEXT_COMPATIBILITY_DIAGNOSTICS]
      .some(previous => previous.taskId === task.taskId || previous.question === task.question)));
});
check("the candidate selects the shared session contract rather than a replacement request shim", () => {
  assert.strictEqual(textConfiguredRequest(originalRequest, "SESSION_ACTION_CONTRACT"), originalRequest);
  assert.deepEqual(textSessionActionContract("SESSION_ACTION_CONTRACT", "SCOPED_FILE"),
    {kind: "READ_THEN_REPLY", path: "src/question.mjs"});
  assert.deepEqual(textSessionActionContract("SESSION_ACTION_CONTRACT", "DIRECT"), {kind: "REPLY_ONLY"});
  for (const configuration of ["EXISTING_DEFAULT", "OBSERVATION_ALIGNED_SCHEMA"] as const)
    assert.equal(textSessionActionContract(configuration, "SCOPED_FILE"), undefined);
});
check("contract selection cannot silently change defaults or accept unknown delivery", () => {
  assert.throws(() => textSessionActionContract("UNKNOWN" as never, "DIRECT"));
  assert.throws(() => textSessionActionContract("SESSION_ACTION_CONTRACT", "NETWORK" as never));
  assert.strictEqual(textConfiguredRequest(originalRequest, "EXISTING_DEFAULT"), originalRequest);
});
const contractPair = pairRows.map((row, index) => ({...row,
  configuration: index ? "SESSION_ACTION_CONTRACT" as const : "OBSERVATION_ALIGNED_SCHEMA" as const}));
check("contract comparison cannot substitute for historical default-schema comparisons", () => {
  assert(compareTextContractPair(contractPair).boundPair);
  assert(!compareTextPair(contractPair).boundPair);
  assert(!compareTextContractPair(pairRows).boundPair);
  assert.equal(compareTextContractPair(contractPair).cognitivePromotion, false);
});
check("protocol comparison records provider instability and unknown compute without promotion", () => {
  const rows = [contractPair[0], {...contractPair[1], usage: {...contractPair[1].usage,
    providerFailures: 1, unknownUsageCalls: 1}}];
  assert(!compareTextContractPair(rows).stable); assert(!compareTextContractPair(rows).matchedRealizedCompute);
  assert(!compareTextContractPair(rows).cognitivePromotion);
});
check("phase denials remain visible and cannot be counted as a tool operation or correct answer", () => {
  const denied = sanitizedTextResult({family: "DEVELOPMENT_DIAGNOSTIC", taskId: "PHASE-DENIED",
    question: "independent", answer: "731"}, {...result, outcome: "BUDGET_EXHAUSTED", events: [{sequence: 1,
      eventType: "DENIAL", requestDigest: "a".repeat(64), resultDigest: "b".repeat(64), evidenceClass: "E3",
      evidenceId: "PHASE-EVIDENCE", outcome: "action_not_permitted_in_current_phase"}]}, [], null, 1);
  assert.equal(denied.correct, null); assert.equal(denied.state, "PROTOCOL_OR_AUTHORIZATION_FAILURE");
  assert.equal(denied.eventOutcomes[0].outcome, "action_not_permitted_in_current_phase");
  assert.equal(denied.usage.toolCalls, 0);
});
check("native phase controls leave the original prompt schema tokens and lease untouched", () => {
  const contract = {kind: "READ_THEN_REPLY" as const, path: "src/question.mjs"};
  for (const observed of [false, true]) {
    const base = {...originalRequest, responseFormat: nyxChatContractFormat(contract, observed), deadlineEpochMs: Date.now() + 180000};
    const configured = textConfiguredRequest(base, "SESSION_NATIVE_PHASE_CONTRACT", "SCOPED_FILE", observed);
    assert.strictEqual(configured.messages, base.messages); assert.strictEqual(configured.responseFormat, base.responseFormat);
    assert.equal(configured.deadlineEpochMs, base.deadlineEpochMs); assert.equal(configured.maxTokens, base.maxTokens);
    assert.equal(configured.reasoningControl, "ULTRA_HOSTED_NATIVE");
    assert.equal(configured.inferencePolicy, observed ? "REASONING_JSON" : "CONSTRAINED_JSON");
    assert.equal(configured.reasoningEffort, observed ? "MEDIUM" : undefined);
    assert.equal(configured.reasoningBudgetTokens, observed ? 2048 : undefined);
  }
});
check("direct reply keeps finite reasoning rather than inheriting read-only phase settings", () => {
  const configured = textConfiguredRequest(originalRequest, "SESSION_NATIVE_PHASE_CONTRACT", "DIRECT", false);
  assert.equal(configured.inferencePolicy, "REASONING_JSON"); assert.equal(configured.reasoningBudgetTokens, 2048);
  assert.deepEqual(textSessionActionContract("SESSION_NATIVE_PHASE_CONTRACT", "SCOPED_FILE"),
    textSessionActionContract("SESSION_ACTION_CONTRACT", "SCOPED_FILE"));
});
const nativeSelection = textSessionContractSelection("SESSION_NATIVE_PHASE_CONTRACT");
check("native configuration ablation changes only phase inference controls, not development objectives", () => {
  assert.deepEqual(nativeSelection.map(row => row.configuration), ["SESSION_ACTION_CONTRACT", "SESSION_NATIVE_PHASE_CONTRACT",
    "SESSION_NATIVE_PHASE_CONTRACT", "SESSION_ACTION_CONTRACT"]);
  assert.deepEqual(nativeSelection.map(row => row.question), textSessionContractSelection().map(row => row.question));
  assert(nativeSelection.every(row => row.recoveryProfile === "BOUNDED_RECOVERY"));
  assert.throws(() => textSessionContractSelection("UNKNOWN" as never));
});
const nativePair = pairRows.map((row, index) => ({...row,
  configuration: index ? "SESSION_NATIVE_PHASE_CONTRACT" as const : "SESSION_ACTION_CONTRACT" as const}));
check("native comparison preserves historical pair identities and rejects substitutions", () => {
  assert(compareTextContractPair(nativePair, "SESSION_NATIVE_PHASE_CONTRACT").boundPair);
  assert(!compareTextContractPair(nativePair).boundPair);
  assert(!compareTextContractPair(contractPair, "SESSION_NATIVE_PHASE_CONTRACT").boundPair);
  assert.throws(() => compareTextContractPair(nativePair, "UNKNOWN" as never));
});
const nativeReadyRows = nativeSelection.map(task => ({...sanitizedTextResult(task, result, [], true, 1),
  configuration: task.configuration, recoveryProfile: task.recoveryProfile,
  usage: {...pairRows[0].usage, logicalCalls: 2, physicalCalls: 2, httpAttempts: 2, providerFailures: 0,
    retries: 0, unknownUsageCalls: 0, toolCalls: 1},
  eventOutcomes: [{sequence: 1, eventType: "READ" as const, outcome: "OBSERVED", evidenceClass: "E3" as const}]}));
check("complete stable contract diagnostic can pass but cannot promote cognition", () => {
  assert(textContractDiagnosticReady(nativeReadyRows, "SESSION_NATIVE_PHASE_CONTRACT"));
  assert(!compareTextContractPair(nativePair, "SESSION_NATIVE_PHASE_CONTRACT").cognitivePromotion);
});
check("partial duplicated unknown or recovered contract delivery fails readiness", () => {
  for (const rows of [[], nativeReadyRows.slice(0, 3), [...nativeReadyRows.slice(0, 3), nativeReadyRows[0]]])
    assert(!textContractDiagnosticReady(rows, "SESSION_NATIVE_PHASE_CONTRACT"));
  for (const delta of [{physicalCalls: 3}, {providerFailures: 1}, {retries: 1}, {unknownUsageCalls: 1}, {toolCalls: 0}])
    assert(!textContractDiagnosticReady([{...nativeReadyRows[0], usage: {...nativeReadyRows[0].usage, ...delta}},
      ...nativeReadyRows.slice(1)], "SESSION_NATIVE_PHASE_CONTRACT"));
});
check("wrong ungraded mismatched or denied answers cannot be hidden by a successful workflow", () => {
  for (const delta of [{correct: false}, {correct: null}, {state: "SCHEMA_FAILURE"}, {eventOutcomes: []},
    {inputDigest: "f".repeat(64)}, {privateOracleDigest: "a".repeat(64)}, {configuration: "EXISTING_DEFAULT" as const}])
    assert(!textContractDiagnosticReady([{...nativeReadyRows[0], ...delta}, ...nativeReadyRows.slice(1)], "SESSION_NATIVE_PHASE_CONTRACT"));
});
check("output-shape evidence cannot become raw response retention or a successful answer", () => {
  const row = sanitizedTextResult(task, denied, [{...evidence[0], contentShape: {json: "INVALID", leadingMarkdownFence: true,
    thinkingDelimiterPresent: false}}], null, 1);
  assert.equal(row.state, "SCHEMA_FAILURE"); assert.equal(row.correct, null);
  assert.deepEqual(row.modelEvidence[0].contentShape, {json: "INVALID", leadingMarkdownFence: true, thinkingDelimiterPresent: false});
  assert(!JSON.stringify(row).includes("731"));
});
const twoErrorControl = await scopedRecoveryReproduction("BOUNDED_RECOVERY", {failuresBeforeRead: 2,
  configuration: "SESSION_NATIVE_PHASE_CONTRACT"});
const twoErrorRecovered = await scopedRecoveryReproduction("BOUNDED_RECOVERY", {failuresBeforeRead: 2,
  configuration: "SESSION_NATIVE_PHASE_CONTRACT", transientRecovery: "WITHIN_SHARED_BUDGET"});
check("general two-error recovery actually completes the shared session R1 read and independently graded answer", () => {
  assert.equal(twoErrorControl.row.state, "PROVIDER_FAILURE"); assert.equal(twoErrorControl.reads, 0);
  assert.equal(twoErrorRecovered.row.state, "PASS"); assert.equal(twoErrorRecovered.row.correct, true);
  assert.equal(twoErrorRecovered.reads, 1); assert.equal(twoErrorRecovered.outcome?.modelCalls, 2);
  assert.equal(twoErrorRecovered.row.usage.physicalCalls, 4); assert.equal(twoErrorRecovered.row.usage.providerFailures, 2);
  assert.equal(twoErrorRecovered.row.usage.unknownUsageCalls, 2);
});
check("native phase transport sends identical read retries then bounded answer reasoning without reference leakage", () => {
  const bodies = twoErrorRecovered.bodies;
  assert.equal(bodies[0], bodies[1]); assert.equal(bodies[1], bodies[2]);
  const read = JSON.parse(bodies[2]), answer = JSON.parse(bodies[3]);
  assert.equal(read.reasoning_effort, "none"); assert.equal(answer.reasoning_effort, "medium");
  assert.equal(answer.reasoning_budget, 2048); assert.equal(read.max_tokens, 8192); assert.equal(answer.max_tokens, 8192);
  assert.equal(read.response_format.json_schema.schema.properties.kind.enum[0], "READ_FILE");
  assert.equal(answer.response_format.json_schema.schema.properties.kind.enum[0], "REPLY");
  assert(bodies.every(body => !body.includes("731")));
});
check("recovered success still cannot assert stable delivery or new executor authority", () => {
  assert(!twoErrorRecovered.row.sourceRepositoryMutated && !twoErrorRecovered.row.broaderAuthorityGranted);
  assert(twoErrorRecovered.observations.every(evidence => evidence.delivery?.authorityRenewed === false));
  assert(!textContractDiagnosticReady([{...nativeReadyRows[0], usage: twoErrorRecovered.row.usage},
    ...nativeReadyRows.slice(1)], "SESSION_NATIVE_PHASE_CONTRACT"));
});
console.log(`Omega NYX text benchmark tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
