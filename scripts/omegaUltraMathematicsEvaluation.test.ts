import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import type {NvidiaNimCompletionRequest} from "../src/lib/codelab/model/nvidiaNimProvider";
import {NvidiaNimProvider} from "../src/lib/codelab/model/nvidiaNimProvider";
import {ReadOnlyRepositoryExecutor} from "../src/lib/codelab/executor/readOnlyExecutor";
import {R3BenchmarkRepositorySession} from "./omega/benchmarks/r3RepositorySession";
import {TEXT_BENCHMARK_POLICY, ULTRA_MATHEMATICS_EVALUATION_POLICY as POLICY,
  ultraMathematicsRequest, sanitizedTextResult, gradeAime, invokeExistingNyxText} from "./omega/benchmarks/nyxTextBenchmark";
import {ULTRA_CONTRACT_DIAGNOSTIC_VARIANTS, ultraContractDiagnosticRequest,
  textRejectionHint} from "./omega/benchmarks/nyxTextBenchmark";
import {AIME_2026_SOURCE, parseAime2026Data, mathematicsPopulationSummary,
  mathematicsPublicResult, mathematicsTaskHadOutage} from "./omega/nyx-aime26-live-eval";

let passed = 0, failed = 0;
function check(name: string, run: () => unknown) {
  try {run(); passed++;} catch {failed++; console.error(`FAILED ${name}`);}
}
const request: NvidiaNimCompletionRequest = {schemaVersion: 1, requestId: "ULTRA-MATH-DEVELOPMENT",
  messages: [{role: "user", content: "Development protocol test, not a benchmark question."}],
  maxTokens: POLICY.maxOutputTokens, temperature: 0.2, observedAtEpochMs: 100,
  deadlineEpochMs: 1000, responseFormat: "JSON_OBJECT"};
check("independent preparation detector rejects malformed artificial source rows", () => {
  const run = spawnSync(process.env.OMEGA_POLYNOMIAL_PYTHON || "python3",
    ["scripts/omega/benchmarks/test-prepare-aime26.py"], {encoding: "utf8", timeout: 10000,
      env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"}});
  assert.equal(run.status, 0); assert.match(run.stderr, /Ran 5 tests/); assert.match(run.stderr, /OK/);
});
check("mathematics profile does not change reviewed default resource policy", () => {
  assert.equal(TEXT_BENCHMARK_POLICY.maxOutputTokens, 8192);
  assert.equal(TEXT_BENCHMARK_POLICY.maxTaskMs, 180000);
  assert.equal(POLICY.productionDefaultsChanged, false); assert.equal(POLICY.grantsAuthority, false);
  assert.equal(POLICY.reasoningBudgetTokens, null);
  assert.equal(POLICY.reasoningBudgetControl, "HOSTED_DEFAULT_UNVERIFIED_WITHIN_TOTAL_COMPLETION_CEILING");
  assert.equal(POLICY.maxLogicalCalls, 2);
});
check("unobserved question requests only deterministic read with no thinking budget", () => {
  const r = ultraMathematicsRequest(request, false);
  assert.equal(r.inferencePolicy, "CONSTRAINED_JSON"); assert.equal(r.reasoningBudgetTokens, undefined);
  assert.equal(r.reasoningControl, "ULTRA_HOSTED_NATIVE"); assert.equal(r.deadlineEpochMs, 1000);
});
check("observed question enables hosted high reasoning without medium effort", () => {
  const r = ultraMathematicsRequest(request, true);
  assert.equal(r.inferencePolicy, "REASONING_JSON"); assert.equal(r.reasoningEffort, undefined);
  assert.equal(r.reasoningBudgetTokens, undefined); assert.equal(r.responseFormat, request.responseFormat);
  assert.equal(r.structuredOutputMode, "STRICT_LOCAL");
  assert.equal(r.messages, request.messages); assert.equal(r.maxTokens, request.maxTokens);
});
for (const budget of [0, 8192, 32768, NaN]) check(`unexpected mathematical completion budget rejected ${budget}`, () =>
  assert.throws(() => ultraMathematicsRequest({...request, maxTokens: budget}, true)));
for (const observed of [null, 1, "true", {}]) check(`forged observation flag rejected ${typeof observed}`, () =>
  assert.throws(() => ultraMathematicsRequest(request, observed as boolean)));
for (const variant of ULTRA_CONTRACT_DIAGNOSTIC_VARIANTS) {
  check(`development wire factorial preserves the observation and authority contract ${variant}`, () => {
    const before = ultraContractDiagnosticRequest(request, false, variant);
    assert.deepEqual(before, ultraMathematicsRequest(request, false));
    const after = ultraContractDiagnosticRequest(request, true, variant);
    assert.equal(after.messages, request.messages); assert.equal(after.responseFormat, request.responseFormat);
    assert.equal(after.maxTokens, 16384); assert.equal(after.deadlineEpochMs, request.deadlineEpochMs);
    assert.equal(after.reasoningEffort, undefined); assert.equal(after.inferencePolicy, "REASONING_JSON");
    assert.equal(after.structuredOutputMode, variant.startsWith("LOCAL") ? "STRICT_LOCAL" : undefined);
    assert.equal(after.reasoningBudgetTokens, variant.endsWith("NO_BUDGET") ? undefined : 12288);
  });
}
check("unknown diagnostic configuration cannot become a fallback", () =>
  assert.throws(() => ultraContractDiagnosticRequest(request, true, "AUTO" as never)));
check("provider-stated reasoning/grammar conflicts retain fixed labels, not error echoes", () => {
  const hint = textRejectionHint(JSON.stringify({error: {message:
    "Model validation: guided decoding is incompatible with reasoning. PRIVATE_ECHO"}}));
  assert(hint.signals.includes("REASONING_GUIDANCE_CONFLICT")); assert(hint.signals.includes("GUIDANCE_BACKEND"));
  assert(!JSON.stringify(hint).includes("PRIVATE_ECHO"));
});

// Constructed development rows only. No downloaded question or answer is read.
const development = () => ({schemaVersion: 1, family: "AIME_2026", dataset: AIME_2026_SOURCE.dataset,
  revision: AIME_2026_SOURCE.revision, sourceSha256: String(AIME_2026_SOURCE.sourceSha256),
  license: AIME_2026_SOURCE.license,
  tasks: Array.from({length: 30}, (_, i) => ({family: "AIME_2026", taskId: `AIME-2026-${i + 1}`,
    question: `Artificial development record ${i + 1}; never a source benchmark question.`, answer: "17"}))});
const encode = (body: unknown) => {const raw = JSON.stringify(body);
  return {raw, sha256: createHash("sha256").update(raw).digest("hex")};};
check("pinned preparation accepts all thirty artificial development records", () => {
  const {raw, sha256} = encode(development()), tasks = parseAime2026Data(raw, sha256);
  assert.equal(tasks.length, 30); assert(Object.isFrozen(tasks)); assert(Object.isFrozen(tasks[0]));
});
check("prepared byte change is rejected even if declared source stays identical", () => {
  const {raw, sha256} = encode(development()); assert.throws(() => parseAime2026Data(`${raw} `, sha256));
});
for (const mutation of ["missing", "duplicate", "wrong-source", "wrong-family", "extra", "bad-answer", "blank"]) {
  check(`corrupted mathematical population fails closed ${mutation}`, () => {
    const d = development();
    if (mutation === "missing") d.tasks.pop();
    if (mutation === "duplicate") d.tasks[1].taskId = d.tasks[0].taskId;
    if (mutation === "wrong-source") d.sourceSha256 = "0".repeat(64);
    if (mutation === "wrong-family") d.tasks[0].family = "GPQA_DIAMOND";
    if (mutation === "extra") d.tasks.push({...d.tasks[0], taskId: "AIME-2026-999"});
    if (mutation === "bad-answer") d.tasks[0].answer = "17 or 18";
    if (mutation === "blank") d.tasks[0].question = " ";
    const {raw, sha256} = encode(d); assert.throws(() => parseAime2026Data(raw, sha256));
  });
}
const result = (id: number, correct: boolean | null, state: string) => ({taskId: `AIME-2026-${id}`,
  family: "AIME_2026" as const, state, correct}) as Parameters<typeof mathematicsPopulationSummary>[0][number];
check("empty coverage cannot establish a mathematics score", () => {
  const r = mathematicsPopulationSummary([]); assert.equal(r.score, null); assert.equal(r.target100Reached, false);
});
check("a slow answer after an HTTP 200 read is not a complete endpoint outage", () => {
  assert.equal(mathematicsTaskHadOutage({modelEvidence: [{statusCode: 200, failureCategory: null},
    {statusCode: null, failureCategory: "PROVIDER_TIMEOUT"}]}), false);
  assert.equal(mathematicsTaskHadOutage({modelEvidence: [{statusCode: null, failureCategory: "PROVIDER_TIMEOUT"}]}), true);
  assert.equal(mathematicsTaskHadOutage({modelEvidence: [{statusCode: 503, failureCategory: "PROVIDER_UNAVAILABLE"}]}), true);
  assert.equal(mathematicsTaskHadOutage({modelEvidence: []}), false);
  assert.equal(mathematicsTaskHadOutage({modelEvidence: [{statusCode: 200, failureCategory: "PROVIDER_RESPONSE_SCHEMA_ERROR"}]}), false);
});
check("development-only diagnosis selects zero benchmark tasks and cannot earn a vacuous perfect score", () => {
  const r = mathematicsPopulationSummary([], 0);
  assert.equal(r.selected, 0); assert.equal(r.score, null); assert.equal(r.fullyGraded, false);
  assert.equal(r.correctFractionOfSelected, null); assert.equal(r.target100Reached, false);
  assert.throws(() => mathematicsPopulationSummary([result(1, true, "PASS")], 0));
});
check("twenty-nine correct tasks cannot satisfy thirty-task target", () => {
  const r = mathematicsPopulationSummary(Array.from({length: 29}, (_, i) => result(i, true, "PASS")));
  assert.equal(r.score, null); assert.equal(r.unexecuted, 1); assert.equal(r.target100Reached, false);
});
check("one ungraded delivery failure cannot disappear from fixed denominator", () => {
  const rows = Array.from({length: 29}, (_, i) => result(i, true, "PASS")); rows.push(result(29, null, "PROVIDER_FAILURE"));
  const r = mathematicsPopulationSummary(rows); assert.equal(r.score, null); assert.equal(r.ungraded, 1); assert.equal(r.target100Reached, false);
});
check("valid wrong answer yields measured below-ceiling score, never a job failure by itself", () => {
  const rows = Array.from({length: 29}, (_, i) => result(i, true, "PASS")); rows.push(result(29, false, "REASONING_FAILURE"));
  const r = mathematicsPopulationSummary(rows); assert.equal(r.score, 29 / 30); assert.equal(r.target100Reached, false);
});
check("complete identical-population acceptance alone reaches target", () => {
  const r = mathematicsPopulationSummary(Array.from({length: 30}, (_, i) => result(i, true, "PASS")));
  assert.equal(r.score, 1); assert.equal(r.target100Reached, true);
});
check("duplicate or contradictory outcome cannot inflate mathematical acceptance", () => {
  assert.throws(() => mathematicsPopulationSummary([result(1, true, "PASS"), result(1, true, "PASS")]));
  assert.throws(() => mathematicsPopulationSummary([result(1, true, "PROVIDER_FAILURE")]));
  assert.throws(() => mathematicsPopulationSummary([result(1, false, "ANSWER_FORMAT_FAILURE")]));
});
check("sanitized report removes brute-forceable answer and prediction hashes", () => {
  const internal = sanitizedTextResult({family: "AIME_2026", taskId: "AIME-2026-1", question: "Artificial test", answer: "17"},
    null, [], null, 1);
  const publicRow = mathematicsPublicResult(internal);
  assert(!("privateOracleDigest" in publicRow)); assert(!("predictionDigest" in publicRow)); assert(!("eventDigests" in publicRow));
});
check("mathematical evaluation retains the existing final-integer acceptance oracle", () => {
  assert(gradeAime("The answer is: 017", "17")); assert(!gradeAime("The answer is: 18", "17"));
  assert(!gradeAime("The answer is: 17 or 18", "17"));
});
check("no raw model reasoning or reference-answer fields enter report implementation", () => {
  const source = readFileSync("scripts/omega/nyx-aime26-live-eval.ts", "utf8");
  assert(source.includes("mathematicsPublicResult(sanitizedTextResult"));
  assert(source.includes("if (!cleanup.sourceUnchanged || !cleanup.cleanupVerified)"));
});
for (const mode of ["PROFILE_V2", "GUIDED_REFERENCE", "HOSTILE", "HOSTILE_AFTER_READ"] as const) {
  const hostile = mode.startsWith("HOSTILE");
  let reader: ReadOnlyRepositoryExecutor | null = null;
  const started = Date.now(), deadline = started + 10000;
  const question = "Artificial development arithmetic: add seventeen and nineteen.";
  const questionFile = `export const question = ${JSON.stringify(question)};\n`;
  const repository = await R3BenchmarkRepositorySession.create({"src/question.mjs": questionFile}, "a".repeat(40), deadline, 1);
  try {
    const payloads: Record<string, unknown>[] = [];
    const provider = NvidiaNimProvider.create({providerId: "ULTRA-MATH-TEST-DOUBLE", model: POLICY.model,
      authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-double", read: () => "not-a-real-credential"},
      maxPromptBytes: 64000, maxOutputTokens: POLICY.maxOutputTokens, timeoutMs: 1000,
      transport: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        const action = mode === "HOSTILE" || mode === "HOSTILE_AFTER_READ" && payloads.length > 1
          ? {kind: "CONTAINER_EXEC", argv: ["sh", "-c", "not-executed"]}
          : payloads.length === 1 ? {kind: "READ_FILE", path: "src/question.mjs"}
          : {kind: "REPLY", message: "The answer is: 36"};
        return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(action)}, finish_reason: "stop"}],
          usage: {prompt_tokens: 40, completion_tokens: 30, total_tokens: 70}}), {status: 200});
      }});
    reader = await ReadOnlyRepositoryExecutor.create({executorId: `MATH-TEST-${hostile}`, tokenId: `MATH-TOKEN-${hostile}`,
      repositoryRoot: repository.sourceRoot, resourceScopes: ["src/question.mjs"], issuedAtEpochMs: started,
      expiresAtEpochMs: deadline, constraints: {maxFileBytes: 64000, maxDirectoryEntries: 1, allowedExtensions: [".mjs"]},
      issuer: "DEVELOPMENT", auditIdentity: "MATH-AUDIT"});
    const result = await invokeExistingNyxText({sessionId: `MATH-DEVELOPMENT-${hostile}`, reader,
      candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0, maxModelCallsPerTurn: 2,
      maxOutputTokens: POLICY.maxOutputTokens, maxTurnMs: deadline - Date.now(),
      actionContract: {kind: "READ_THEN_REPLY", path: "src/question.mjs"},
      model: {complete: request => {
        const observed = reader!.auditLog().some(event => event.observation.content === questionFile && event.authorization.allowed);
        return provider.complete(mode === "GUIDED_REFERENCE" ? ultraContractDiagnosticRequest(request, observed, "GUIDED_BUDGET")
          : ultraMathematicsRequest(request, observed));
      }}}
      , question, "SCOPED_FILE");
    check(`existing scoped chat obeys the high-reasoning mathematics protocol ${mode}`, () => {
      assert(result); assert.equal(result.sourceRepositoryMutated, false); assert.equal(result.broaderAuthorityGranted, false);
      assert(!result.events.some(event => ["COMPUTER", "CANDIDATE", "ANALYSIS"].includes(event.eventType)));
      if (hostile) {assert.notEqual(result.outcome, "REPLIED"); assert.equal(reader!.auditLog().length, mode === "HOSTILE_AFTER_READ" ? 1 : 0);}
      else {
        assert.equal(result.outcome, "REPLIED"); assert(gradeAime(result.message, "36")); assert.equal(payloads.length, 2);
        assert.equal(payloads[0].reasoning_effort, "none"); assert.equal(payloads[0].reasoning_budget, undefined);
        assert.equal(payloads[1].reasoning_effort, "high");
        assert.equal(payloads[1].reasoning_budget, mode === "GUIDED_REFERENCE" ? 12288 : undefined);
        assert.equal(payloads[1].max_tokens, 16384); assert.equal(reader!.auditLog().length, 1);
        assert.equal("response_format" in payloads[1], mode === "GUIDED_REFERENCE");
        assert.equal("response_format" in payloads[0], true);
      }
    });
  } catch {failed++; console.error(`FAILED mathematical protocol integration ${mode}`);}
  finally {
    reader?.terminate(Date.now(), "TEST_FINISHED");
    const cleanup = await repository.close();
    check(`mathematical protocol cleanup and source integrity hostile=${hostile}`, () => {
      assert(cleanup.cleanupVerified); assert(cleanup.sourceUnchanged);
    });
  }
}
console.log(`OMEGA_ULTRA_MATHEMATICS_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
