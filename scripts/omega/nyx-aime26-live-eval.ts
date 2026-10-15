import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile, rename, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {liveNvidiaCapacity} from "../../src/lib/codelab/model/nvidiaCapacity";
import {ReadOnlyRepositoryExecutor} from "../../src/lib/codelab/executor/readOnlyExecutor";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {R3BenchmarkRepositorySession} from "./benchmarks/r3RepositorySession";
import {gradeAime, invokeExistingNyxText, sanitizedTextResult, textBoundedTaskRequest,
  textDiagnosticTransport, textRejectionHint, ultraMathematicsRequest,
  ULTRA_MATHEMATICS_EVALUATION_POLICY as POLICY, TEXT_SESSION_CONTRACT_DIAGNOSTICS,
  ULTRA_CONTRACT_DIAGNOSTIC_VARIANTS, ultraContractDiagnosticRequest, type UltraContractDiagnosticVariant,
  type PrivateTextTask} from "./benchmarks/nyxTextBenchmark";

export const AIME_2026_SOURCE = Object.freeze({dataset: "MathArena/aime_2026",
  revision: "d2de22f3c656b4f56cf8981212186377d1e23bc3",
  sourceSha256: "d91db799651b4cc1f0734f52792a695c9cc60dac342524b3d8e5b2ff31c3e957",
  license: "cc-by-nc-sa-4.0", population: 30,
  grading: "EXACT_FINAL_INTEGER_EXISTING_NYX_ADAPTER_NOT_MATHARENA_INFERENCE_HARNESS"});

export function parseAime2026Data(raw: string, preparedSha256: string): readonly PrivateTextTask[] {
  if (Buffer.byteLength(raw, "utf8") > 2_000_000 || !/^[a-f0-9]{64}$/.test(preparedSha256)
    || createHash("sha256").update(raw, "utf8").digest("hex") !== preparedSha256)
    throw Error("aime_2026_prepared_digest_mismatch");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).sort().join("|") !== "dataset|family|license|revision|schemaVersion|sourceSha256|tasks"
    || data.schemaVersion !== 1 || data.family !== "AIME_2026"
    || data.dataset !== AIME_2026_SOURCE.dataset || data.revision !== AIME_2026_SOURCE.revision
    || data.sourceSha256 !== AIME_2026_SOURCE.sourceSha256 || data.license !== AIME_2026_SOURCE.license
    || !Array.isArray(data.tasks) || data.tasks.length !== AIME_2026_SOURCE.population
    || new Set(data.tasks.map((task: PrivateTextTask) => task.taskId)).size !== AIME_2026_SOURCE.population
    || data.tasks.some((task: PrivateTextTask, index: number) => !task || typeof task !== "object" || Array.isArray(task)
      || Object.keys(task).sort().join("|") !== "answer|family|question|taskId"
      || task.family !== "AIME_2026"
      || !/^AIME-2026-\d+$/.test(task.taskId) || typeof task.question !== "string" || !task.question.trim()
      || typeof task.answer !== "string" || !/^(0|[1-9][0-9]{0,2})$/.test(task.answer)
      || index > 0 && Number(task.taskId.split("-").at(-1)) <= Number(data.tasks[index - 1].taskId.split("-").at(-1))))
    throw Error("aime_2026_prepared_population_invalid");
  return Object.freeze(data.tasks.map((task: PrivateTextTask) => Object.freeze({...task})));
}

type FullResult = ReturnType<typeof sanitizedTextResult>;
export function mathematicsPublicResult(row: FullResult) {
  // AIME has only 1000 possible answers: their hashes are NOT confidentiality.
  const {privateOracleDigest: _private, predictionDigest: _prediction, eventDigests: _events, ...publicRow} = row;
  return Object.freeze({...publicRow, correct: ["PASS", "REASONING_FAILURE"].includes(row.state) ? row.correct : null});
}
type PublicResult = ReturnType<typeof mathematicsPublicResult>;

export function mathematicsPopulationSummary(rows: readonly PublicResult[], selected: number = AIME_2026_SOURCE.population) {
  if (!Number.isSafeInteger(selected) || selected < 0 || rows.length > selected
    || new Set(rows.map(row => row.taskId)).size !== rows.length
    || rows.some(row => row.family !== "AIME_2026" || !/^AIME-2026-\d+$/.test(row.taskId)
      || ![true, false, null].includes(row.correct)
      || (row.correct === true) !== (row.state === "PASS")
      || (row.correct === false) !== (row.state === "REASONING_FAILURE"))) throw Error("mathematics_result_population_invalid");
  const graded = rows.filter(row => row.correct !== null).length;
  const correct = rows.filter(row => row.correct === true).length;
  const complete = selected > 0 && rows.length === selected && graded === selected;
  return {selected, attempted: rows.length, graded, correct, wrong: graded - correct,
    ungraded: rows.length - graded, unexecuted: selected - rows.length,
    fullyGraded: complete, score: complete ? correct / selected : null,
    correctFractionOfSelected: selected > 0 ? correct / selected : null, target100Reached: complete && correct === selected};
}

export async function runAime2026Epoch() {
  const mode = process.env.NYX_AIME26_MODE ?? "FROZEN_BENCHMARK";
  if (!["FROZEN_BENCHMARK", "DEVELOPMENT_CONTRACT_DIAGNOSIS"].includes(mode)) throw Error("aime_2026_mode_invalid");
  const diagnose = mode === "DEVELOPMENT_CONTRACT_DIAGNOSIS";
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("aime_2026_requires_explicit_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
  const candidate = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== process.env.GITHUB_SHA || git("status", "--porcelain"))
    throw Error("aime_2026_requires_frozen_clean_candidate");
  if (!diagnose && (!process.env.NYX_AIME26_DATA || !process.env.NYX_AIME26_PREPARED_SHA256))
    throw Error("aime_2026_verified_preparation_required");
  const tasks = diagnose ? [] : parseAime2026Data(await readFile(resolve(process.env.NYX_AIME26_DATA!), "utf8"),
    process.env.NYX_AIME26_PREPARED_SHA256!);
  const began = Date.now(), epochDeadline = began + (diagnose ? 4 * POLICY.maxTaskMs : POLICY.maxEpochMs);
  const indexedSource = git("ls-files", "-s");
  const sourceBindings = Object.fromEntries(await Promise.all([
    "scripts/omega/nyx-aime26-live-eval.ts", "scripts/omega/benchmarks/nyxTextBenchmark.ts",
    "scripts/omega/benchmarks/prepare-text-benchmarks.py", "scripts/omega/benchmarks/r3RepositorySession.ts",
    "src/lib/codelab/cli/nyxChatSession.ts", "src/lib/codelab/cli/nyxChatProtocol.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "src/lib/codelab/model/nvidiaCapacity.ts",
    "src/lib/codelab/executor/readOnlyExecutor.ts", ".github/workflows/omega-nyx-aime26-one-shot.yml",
  ].map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  const rows: PublicResult[] = [], preflight: PublicResult[] = [];
  const diagnostics: {variant: UltraContractDiagnosticVariant; result: PublicResult}[] = [];
  const requestRejections: (ReturnType<typeof textRejectionHint> & {status: number; taskId: string | null; call: number | null})[] = [];
  const capacityWaits: {beforeTaskId: string; state: string; waitedMs: number}[] = [];
  let stopReason = "IN_PROGRESS";
  let infrastructureCode: string | null = null;
  let pending: {taskId: string; logicalCalls: number; evidence: NvidiaNimEvidence[]} | null = null;
  const provider = NvidiaNimProvider.create({providerId: "NYX-AIME26-ULTRA-HIGH-REASONING",
    model: POLICY.model, authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64000,
    maxOutputTokens: POLICY.maxOutputTokens, timeoutMs: 120000, finalAttemptTimeoutMs: 180000,
    finalAttemptSelection: "LAST_ATTEMPT_OR_NO_RETRY_WINDOW",
    transport: textDiagnosticTransport(value => requestRejections.push({...value, taskId: pending?.taskId ?? null,
      call: pending?.logicalCalls ?? null}))});
  const snapshot = () => ({schemaVersion: 1, identity: diagnose ? "NYX-ULTRA-CONTRACT-DIAGNOSIS-001" : "NYX-AIME2026-ULTRA-HIGH-REASONING-001", candidate, mode,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID}`, environment: `${process.platform}-${process.arch}-node-${process.version}`,
    policy: POLICY, source: AIME_2026_SOURCE, sourceBindings, preparedSha256: process.env.NYX_AIME26_PREPARED_SHA256,
    populationInputDigest: theoryDigest(tasks.map(task => ({taskId: task.taskId, question: task.question}))),
    selectedTaskIds: tasks.map(task => task.taskId), preflight, results: rows, diagnostics,
    diagnosticPolicy: diagnose ? {variants: ULTRA_CONTRACT_DIAGNOSTIC_VARIANTS,
      developmentTask: TEXT_SESSION_CONTRACT_DIAGNOSTICS[0].taskId, maxLogicalCalls: 8, maxPhysicalCalls: 16,
      maxEpochMs: 4 * POLICY.maxTaskMs, model: POLICY.model, maxOutputTokens: POLICY.maxOutputTokens,
      highReasoningEveryAnswer: true, explicitReasoningBudget: [12_288, null],
      hostedGrammarVariedOnlyAfterObservation: true, localValidationUnchanged: true,
      benchmarkQuestionsLoaded: false, configurationPromotion: false} : null,
    summary: mathematicsPopulationSummary(rows, diagnose ? 0 : AIME_2026_SOURCE.population), requestRejections, capacityWaits, stopReason,
    infrastructureCode, interruptedAttempt: pending ? {taskId: pending.taskId, logicalCalls: pending.logicalCalls,
      completedCallEvidence: pending.evidence, callsWithoutTerminalEvidence: pending.logicalCalls - pending.evidence.length,
      grading: "NOT_ADMITTED_AFTER_INFRASTRUCTURE_FAILURE"} : null,
    elapsedMs: Date.now() - began, sourceUnchanged: indexedSource === git("ls-files", "-s") && !git("status", "--porcelain"),
    rawQuestionsStored: false, rawAnswersStored: false, lowEntropyAnswerHashesStored: false,
    rawModelReasoningStored: false, credentialsStored: false, additionalReasoningTurns: false,
    originalAime2025ResultsPreserved: true, memory: "NEW_SESSION_PER_TASK_DISPOSED_AFTER_USE_NOT_PROVIDER_UNLEARNING",
    contamination: "PUBLIC_POPULATION_PRETRAINING_EXPOSURE_UNKNOWN_NOT_SEALED",
    benchmarkHarness: "CUSTOM_NYX_CLOSED_BOOK_EXACT_INTEGER_NOT_MATHARENA_INFERENCE_HARNESS",
    sourceRepositoryMutation: false, authorityDelta: "NONE", architecturalCognitiveGainClaim: false,
    vendorSuperiorityClaim: false, defaultUltraConfigurationChanged: false});
  const checkpoint = async () => {
    const report = snapshot();
    const path = join(process.env.RUNNER_TEMP || tmpdir(), `nyx-aime26-${candidate}.json`);
    await writeFile(`${path}.pending`, JSON.stringify(report)); await rename(`${path}.pending`, path);
    console.log(`NYX_AIME26_PROGRESS ${JSON.stringify({candidate, preflight: preflight.length, ...report.summary, stopReason})}`);
  };
  const execute = async (task: PrivateTextTask, variant?: UltraContractDiagnosticVariant) => {
    const ready = await liveNvidiaCapacity.waitUntilReady(epochDeadline, new AbortController().signal);
    capacityWaits.push({beforeTaskId: task.taskId, state: ready.state, waitedMs: ready.waitedMs});
    if (ready.state !== "READY" || Date.now() >= epochDeadline) return null;
    const started = Date.now(), deadline = Math.min(epochDeadline, started + POLICY.maxTaskMs);
    pending = {taskId: task.taskId, logicalCalls: 0, evidence: []};
    const questionFile = `export const question = ${JSON.stringify(task.question)};\n`;
    if (Buffer.byteLength(questionFile, "utf8") > 64000) throw Error("aime_2026_question_exceeds_unchanged_scope");
    const repository = await R3BenchmarkRepositorySession.create({"src/question.mjs": questionFile}, candidate, deadline, 1);
    let reader: ReadOnlyRepositoryExecutor | null = null;
    const evidence = pending.evidence;
    try {
      reader = await ReadOnlyRepositoryExecutor.create({executorId: `AIME26-${task.taskId}`, tokenId: `AIME26-TOKEN-${task.taskId}`,
        repositoryRoot: repository.sourceRoot, resourceScopes: ["src/question.mjs"], issuedAtEpochMs: started,
        expiresAtEpochMs: deadline, constraints: {maxFileBytes: 64000, maxDirectoryEntries: 1, allowedExtensions: [".mjs"]},
        issuer: "NYX-AIME26-EVALUATION", auditIdentity: `AIME26-AUDIT-${task.taskId}`});
      const taskProvider = provider.withHttpAttemptBudget(POLICY.maxPhysicalCalls, "WITHIN_SHARED_BUDGET");
      const result = await invokeExistingNyxText({sessionId: task.taskId, reader,
        candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0, maxModelCallsPerTurn: POLICY.maxLogicalCalls,
        maxTurnMs: deadline - Date.now(), maxOutputTokens: POLICY.maxOutputTokens,
        actionContract: {kind: "READ_THEN_REPLY", path: "src/question.mjs"},
        model: {complete: async request => {
          pending!.logicalCalls++;
          const observed = reader!.auditLog().some(event => event.request.action === "READ_FILE"
            && event.request.resourcePath === "src/question.mjs" && event.authorization.allowed
            && event.toolAction !== null && event.observation.content === questionFile);
          const configured = variant ? ultraContractDiagnosticRequest(request, observed, variant)
            : ultraMathematicsRequest(request, observed);
          const response = await taskProvider.complete(textBoundedTaskRequest(configured, deadline));
          evidence.push(response.evidence); return response;
        }}}, task.question, "SCOPED_FILE");
      const correct = result?.outcome === "REPLIED" && !evidence.some(item => item.finishReason === "length")
        ? gradeAime(result.message, task.answer) : null;
      return mathematicsPublicResult(sanitizedTextResult(task, result, evidence, correct, Date.now() - started));
    } finally {
      reader?.terminate(Date.now(), "AIME26_TASK_FINISHED");
      const cleanup = await repository.close();
      if (!cleanup.sourceUnchanged || !cleanup.cleanupVerified) throw Error("aime_2026_fixture_cleanup_failed");
      pending = null;
    }
  };
  await checkpoint();
  try {
    if (diagnose) {
      for (const variant of ULTRA_CONTRACT_DIAGNOSTIC_VARIANTS) {
        const task = {...TEXT_SESSION_CONTRACT_DIAGNOSTICS[0], taskId: `ULTRA-WIRE-${variant}`};
        const row = await execute(task, variant);
        if (!row) {stopReason = "CAPACITY_OR_FROZEN_DIAGNOSTIC_LIMIT"; break;}
        diagnostics.push({variant, result: row}); await checkpoint();
      }
      if (stopReason === "IN_PROGRESS") stopReason = "DEVELOPMENT_CONTRACT_DIAGNOSTIC_EXHAUSTED_NO_BENCHMARK_EXECUTED";
    }
    if (!diagnose) {
    for (const task of TEXT_SESSION_CONTRACT_DIAGNOSTICS) {
      const row = await execute(task);
      if (row) preflight.push(row);
      if (!row || row.state !== "PASS" || row.correct !== true) {stopReason = "DEVELOPMENT_DELIVERY_PREFLIGHT_FAILED_NO_BENCHMARK_TASK_ATTEMPTED"; break;}
      await checkpoint();
    }
    if (stopReason === "IN_PROGRESS") {
      let consecutiveDeliveryFailures = 0;
      for (const task of tasks) {
        const row = await execute(task);
        if (!row) {stopReason = "CAPACITY_OR_FROZEN_EPOCH_LIMIT"; break;}
        rows.push(row); await checkpoint();
        consecutiveDeliveryFailures = row.modelEvidence.some(item => item.failureCategory !== null) ? consecutiveDeliveryFailures + 1 : 0;
        if (consecutiveDeliveryFailures >= 2) {stopReason = "CONSECUTIVE_PROVIDER_FAILURES"; break;}
      }
      if (stopReason === "IN_PROGRESS") stopReason = "SELECTION_EXHAUSTED";
    }
    }
  } catch (error) {
    stopReason = "INFRASTRUCTURE_FAILURE_SANITIZED";
    const message = error instanceof Error ? error.message : "";
    infrastructureCode = ["aime_2026_fixture_cleanup_failed", "aime_2026_question_exceeds_unchanged_scope",
      "benchmark_repository_config", "nyx_chat_session_policy_invalid", "benchmark_repository_lease_expired"]
      .includes(message) ? message : "UNCLASSIFIED_LOCAL_INFRASTRUCTURE_ERROR";
  }
  await checkpoint();
  const report = snapshot();
  console.log(`NYX_AIME26_EPOCH ${JSON.stringify(report)}`);
  if (!report.sourceUnchanged || (diagnose ? report.diagnostics.length !== 4 : !report.summary.fullyGraded)) process.exitCode = 1;
  return report;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/nyx-aime26-live-eval.ts")) await runAime2026Epoch();
