import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimEvidence } from
  "../../src/lib/codelab/model/nvidiaNimProvider";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { TEXT_BENCHMARK_POLICY, gradeAime, invokeExistingNyxText, sanitizedTextResult,
  TEXT_DELIVERY_DIAGNOSTICS, TEXT_COMPATIBILITY_DIAGNOSTICS, TEXT_INFERENCE_CONFIGURATIONS, TEXT_DIAGNOSTIC_CONFIGURATIONS, textConfiguredRequest,
  type TextInferenceConfiguration, type PrivateTextTask } from "./benchmarks/nyxTextBenchmark";
import { R3BenchmarkRepositorySession } from "./benchmarks/r3RepositorySession";

export async function runTextBenchmarkEpoch() {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("text_epoch_requires_explicit_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
  const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
    throw Error("text_epoch_requires_clean_candidate");
  const mode = process.env.NYX_TEXT_EPOCH_MODE || "SMOKE";
  if (!["SMOKE", "FRESH", "DIAGNOSTIC", "COMPATIBILITY", "FULL"].includes(mode)) throw Error("text_epoch_mode_invalid");
  const configuration = process.env.NYX_TEXT_CONFIGURATION || "EXISTING_DEFAULT";
  if (!TEXT_INFERENCE_CONFIGURATIONS.includes(configuration as TextInferenceConfiguration)) throw Error("text_epoch_configuration_invalid");
  const delivery = process.env.NYX_TEXT_DELIVERY || "DIRECT";
  if (!["DIRECT", "SCOPED_FILE"].includes(delivery)) throw Error("text_epoch_delivery_invalid");
  if (!process.env.NYX_TEXT_DATA || !process.env.NYX_BBEH_ROOT) throw Error("text_epoch_data_missing");
  const data = JSON.parse(await readFile(resolve(process.env.NYX_TEXT_DATA), "utf8"));
  if (data.schemaVersion !== 1 || data.aimeRevision !== "c94da77eb22bbd6439e62a323bec18493a421302"
    || data.aimeDigest !== "9f9066ff48ad2e31f9bf1b1ac6d5e80693195f987985f2859f89dd25ffa51c2d"
    || data.bbehRevision !== "80d12ca916b7158f22293fcf3144f4d3d854d4be"
    || data.bbehEvaluatorDigest !== "4b4f06e5babb015de2ba639bae995a5526182ffb5b5890af54dfcf038580eb34"
    || !Array.isArray(data.tasks) || data.tasks.length !== 490)
    throw Error("text_epoch_data_pin_invalid");
  const tasks = data.tasks as PrivateTextTask[];
  if (tasks.filter(t => t.family === "AIME_2025").length !== 30
    || tasks.filter(t => t.family === "BBEH_MINI").length !== 460
    || new Set(tasks.map(t => t.taskId)).size !== 490
    || tasks.some(t => !["AIME_2025", "BBEH_MINI"].includes(t.family)
      || typeof t.question !== "string" || typeof t.answer !== "string")) throw Error("text_epoch_population_invalid");
  const selection = mode === "COMPATIBILITY" ? TEXT_COMPATIBILITY_DIAGNOSTICS.map(task =>
    ({...task, taskId: `${task.taskId}-TEMPLATE_BOUNDED`, configuration: "TEMPLATE_BOUNDED" as const}))
    : mode === "DIAGNOSTIC" ? TEXT_DELIVERY_DIAGNOSTICS.flatMap((task, index) =>
    [...(index ? [...TEXT_DIAGNOSTIC_CONFIGURATIONS].reverse() : TEXT_DIAGNOSTIC_CONFIGURATIONS)].map(variant =>
      ({...task, taskId: `${task.taskId}-${variant}`, configuration: variant})))
    : (mode === "SMOKE" || mode === "FRESH" ? [...tasks.filter(t => t.family === "AIME_2025").slice(mode === "FRESH" ? 2 : 0, mode === "FRESH" ? 4 : 2),
      ...tasks.filter(t => t.family === "BBEH_MINI").slice(mode === "FRESH" ? 2 : 0, mode === "FRESH" ? 4 : 2)] : tasks)
      .map(task => ({...task, configuration: configuration as TextInferenceConfiguration}));
  const before = git("ls-files", "-s"); const began = Date.now();
  const deadline = began + (mode === "FULL" ? 19000000 : mode === "DIAGNOSTIC" ? 1200000 : 900000);
  const provider = NvidiaNimProvider.create({providerId: "NYX-ACTUAL-TEXT-BENCHMARK",
    model: TEXT_BENCHMARK_POLICY.model, authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64000,
    maxOutputTokens: TEXT_BENCHMARK_POLICY.maxOutputTokens, timeoutMs: 120000});
  const results: (ReturnType<typeof sanitizedTextResult> & {configuration: TextInferenceConfiguration})[] = [];
  const blocked: {taskId: string; reason: string}[] = [];
  let consecutiveProviderFailures = 0;
  for (const task of selection) {
    if (Date.now() >= deadline || mode !== "DIAGNOSTIC" && consecutiveProviderFailures >= 2) break;
    const started = Date.now(); const evidence: NvidiaNimEvidence[] = [];
    const questionFile = `export const question = ${JSON.stringify(task.question)};\n`;
    if (delivery === "SCOPED_FILE" && Buffer.byteLength(questionFile) > 64000) {
      blocked.push({taskId: task.taskId, reason: "UNCHANGED_SCOPED_FILE_CAPABILITY_LIMIT"}); continue;
    }
    const repository = delivery === "SCOPED_FILE" ? await R3BenchmarkRepositorySession.create(
      {"src/question.mjs": questionFile}, candidate, Math.min(deadline, started + TEXT_BENCHMARK_POLICY.maxTaskMs), 1) : null;
    let reader: ReadOnlyRepositoryExecutor | null = null;
    let result = null; let correct: boolean | null = null;
    try {
      reader = await ReadOnlyRepositoryExecutor.create({executorId: `TEXT-${task.taskId}`, tokenId: `TEXT-TOKEN-${task.taskId}`,
        repositoryRoot: repository?.sourceRoot ?? resolve("."),
        resourceScopes: [repository ? "src/question.mjs" : "scripts/omega/benchmarks"], issuedAtEpochMs: started - 1,
        expiresAtEpochMs: Math.min(deadline, started + TEXT_BENCHMARK_POLICY.maxTaskMs),
        constraints: {maxFileBytes: repository ? 64000 : 1, maxDirectoryEntries: 1, allowedExtensions: [repository ? ".mjs" : ".txt"]},
        issuer: "NYX-TEXT-BENCHMARK", auditIdentity: `TEXT-AUDIT-${task.taskId}`});
      if (!repository) reader.terminate(started, "NO_REPOSITORY_TOOLS_IN_TEXT_BENCHMARK");
      result = await invokeExistingNyxText({sessionId: task.taskId, reader,
        model: {complete: async request => {const response = await provider.complete(textConfiguredRequest(request, task.configuration));
          evidence.push(response.evidence); return response;}},
        candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0, maxModelCallsPerTurn: repository ? 2 : 1,
        maxTurnMs: Math.min(TEXT_BENCHMARK_POLICY.maxTaskMs, deadline - Date.now()),
        maxOutputTokens: TEXT_BENCHMARK_POLICY.maxOutputTokens}, task.question, delivery as "DIRECT" | "SCOPED_FILE");
      if (!result) {blocked.push({taskId: task.taskId, reason: "UNCHANGED_CHAT_INPUT_CAPABILITY_LIMIT"}); continue;}
      if (result.outcome === "REPLIED") {
        if (task.family !== "BBEH_MINI") correct = gradeAime(result.message, task.answer);
        else {
          const grade = JSON.parse(execFileSync(process.env.NYX_EVALUATOR_PYTHON || "python",
            ["scripts/omega/benchmarks/prepare-text-benchmarks.py", "grade", "--bbeh", process.env.NYX_BBEH_ROOT],
            {input: JSON.stringify({response: result.message, reference: task.answer}), encoding: "utf8", timeout: 10000,
              maxBuffer: 10000, env: {PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT,
                PYTHONPATH: process.env.NYX_EVALUATOR_PYTHONPATH}}));
          if (grade.verifierDigest !== data.bbehEvaluatorDigest || typeof grade.correct !== "boolean")
            throw Error("bbeh_grade_binding_invalid");
          correct = grade.correct;
        }
      }
    } catch { /* No raw question, response, secret, or Python exception is logged. */ }
    finally {
      reader?.terminate(Date.now(), "TEXT_TASK_FINISHED");
      if (repository) {
        const cleanup = await repository.close();
        if (!cleanup.sourceUnchanged || !cleanup.cleanupVerified) throw Error("text_epoch_fixture_cleanup_failed");
      }
    }
    if (reader?.auditLog().some(t => t.toolAction !== null && (!repository
      || t.request.resourcePath !== "src/question.mjs" || t.request.action !== "READ_FILE")))
      throw Error("text_epoch_unexpected_repository_action");
    const row = {...sanitizedTextResult(task, result, evidence, correct, Date.now() - started), configuration: task.configuration};
    row.usage.toolCalls = reader?.auditLog().filter(t => t.toolAction !== null).length ?? 0;
    row.usage.toolWorkUnits = row.usage.toolCalls * Buffer.byteLength(questionFile);
    results.push(row); console.log(`NYX_TEXT_TASK ${JSON.stringify(row)}`);
    consecutiveProviderFailures = row.state === "PROVIDER_FAILURE" ? consecutiveProviderFailures + 1 : 0;
  }
  const sourceUnchanged = before === git("ls-files", "-s") && !git("status", "--porcelain");
  const families = (["DIAGNOSTIC", "COMPATIBILITY"].includes(mode) ? ["DEVELOPMENT_DIAGNOSTIC"] : ["AIME_2025", "BBEH_MINI"]).map(family => {
    const population = selection.filter(t => t.family === family);
    const rows = results.filter(t => t.family === family);
    const familyBlocked = blocked.filter(t => population.some(p => p.taskId === t.taskId));
    return {family, selected: population.length, executed: rows.length,
      correct: rows.filter(r => r.correct === true).length, graded: rows.filter(r => r.correct !== null).length,
      blockedByCapability: familyBlocked.length, notExecuted: population.length - rows.length - familyBlocked.length,
      fullPopulation: family === "AIME_2025" ? 30 : family === "BBEH_MINI" ? 460 : null,
      fullBenchmarkScoreClaim: mode === "FULL" && rows.length === population.length
        && rows.every(r => r.correct !== null)};
  });
  const report = {schemaVersion: 1, identity: "NYX-PUBLIC-TEXT-BENCHMARK-EPOCH-001", candidate, mode,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID || "authorized-local"}`,
    environment: `${process.platform}-${process.arch}-node-${process.version}`,
    policy: {...TEXT_BENCHMARK_POLICY, delivery, maxCallsPerTurn: delivery === "DIRECT" ? 1 : 2,
      tools: delivery === "DIRECT" ? [] : ["READ_ONLY_DISPOSABLE_QUESTION_FILE"],
      fixtureCleanupRequired: true, inputTruncationAllowed: false},
    populationDigest: theoryDigest(tasks), selectionDigest: theoryDigest(selection),
    selectedTaskIds: selection.map(t => t.taskId), verifier: {bbehRevision: data.bbehRevision,
      bbehSourceDigest: data.bbehEvaluatorDigest, aime: "EXACT_FINAL_INTEGER_CUSTOM_ADAPTER_NOT_MATHARENA_HARNESS"},
    configuration: mode === "DIAGNOSTIC" ? "COUNTERBALANCED_DEFAULT_VS_BOUNDED_GUIDED_VS_BOUNDED_STRICT_LOCAL" : configuration,
    configurationIsEvaluationOnly: true, productionDefaultsChanged: false,
    inference: "E4_LIVE_NVIDIA", verification: "E3_WITHHELD_REFERENCES_UPSTREAM_BBEH_GRADER",
    results, blocked, families, sourceUnchanged, authorityDelta: "NONE", repairAttempts: 0,
    firstAttemptOnly: true, broadPromotion: false, calibration: "NOT_SUPPORTED_BY_CURRENT_REPLY_PROTOCOL",
    stopReason: mode !== "DIAGNOSTIC" && consecutiveProviderFailures >= 2 ? "PROVIDER_UNAVAILABLE_CONSECUTIVE_TASKS"
      : Date.now() >= deadline ? "FROZEN_WALL_CLOCK_BUDGET" : "SELECTION_EXHAUSTED",
    contamination: "PUBLIC_DATA_PRETRAINING_EXPOSURE_UNKNOWN_NOT_SEALED"};
  await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-text-benchmark-${candidate}.json`), JSON.stringify(report, null, 2));
  console.log(`NYX_TEXT_EPOCH ${JSON.stringify(report)}`);
  if (!sourceUnchanged) process.exitCode = 1;
  return report;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/nyx-text-benchmark-epoch.ts")) await runTextBenchmarkEpoch();
