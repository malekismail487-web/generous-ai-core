import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimEvidence } from
  "../../src/lib/codelab/model/nvidiaNimProvider";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { TEXT_BENCHMARK_POLICY, gradeAime, invokeExistingNyxText, sanitizedTextResult,
  type PrivateTextTask } from "./benchmarks/nyxTextBenchmark";

export async function runTextBenchmarkEpoch() {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("text_epoch_requires_explicit_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
  const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
    throw Error("text_epoch_requires_clean_candidate");
  const mode = process.env.NYX_TEXT_EPOCH_MODE || "SMOKE";
  if (!["SMOKE", "FULL"].includes(mode)) throw Error("text_epoch_mode_invalid");
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
  const selection = mode === "SMOKE" ? [...tasks.filter(t => t.family === "AIME_2025").slice(0, 2),
    ...tasks.filter(t => t.family === "BBEH_MINI").slice(0, 2)] : tasks;
  const before = git("ls-files", "-s"); const began = Date.now();
  const deadline = began + (mode === "SMOKE" ? 900000 : 19000000);
  const provider = NvidiaNimProvider.create({providerId: "NYX-ACTUAL-TEXT-BENCHMARK",
    model: TEXT_BENCHMARK_POLICY.model, authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64000,
    maxOutputTokens: TEXT_BENCHMARK_POLICY.maxOutputTokens, timeoutMs: 120000});
  const results: ReturnType<typeof sanitizedTextResult>[] = [];
  const blocked: {taskId: string; reason: string}[] = [];
  let consecutiveProviderFailures = 0;
  for (const task of selection) {
    if (Date.now() >= deadline || consecutiveProviderFailures >= 2) break;
    const started = Date.now(); const evidence: NvidiaNimEvidence[] = [];
    const reader = await ReadOnlyRepositoryExecutor.create({executorId: `TEXT-${task.taskId}`, tokenId: `TEXT-TOKEN-${task.taskId}`,
      repositoryRoot: resolve("."), resourceScopes: ["scripts/omega/benchmarks"], issuedAtEpochMs: started - 1,
      expiresAtEpochMs: Math.min(deadline, started + TEXT_BENCHMARK_POLICY.maxTaskMs),
      constraints: {maxFileBytes: 1, maxDirectoryEntries: 1, allowedExtensions: [".txt"]},
      issuer: "NYX-TEXT-BENCHMARK", auditIdentity: `TEXT-AUDIT-${task.taskId}`});
    reader.terminate(started, "NO_REPOSITORY_TOOLS_IN_TEXT_BENCHMARK");
    let result = null; let correct: boolean | null = null;
    try {
      result = await invokeExistingNyxText({sessionId: task.taskId, reader,
        model: {complete: async request => {const response = await provider.complete(request);
          evidence.push(response.evidence); return response;}},
        candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0, maxModelCallsPerTurn: 1,
        maxTurnMs: Math.min(TEXT_BENCHMARK_POLICY.maxTaskMs, deadline - Date.now()),
        maxOutputTokens: TEXT_BENCHMARK_POLICY.maxOutputTokens}, task.question);
      if (!result) {blocked.push({taskId: task.taskId, reason: "UNCHANGED_CHAT_INPUT_CAPABILITY_LIMIT"}); continue;}
      if (result.outcome === "REPLIED") {
        if (task.family === "AIME_2025") correct = gradeAime(result.message, task.answer);
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
    if (reader.auditLog().some(t => t.toolAction !== null)) throw Error("text_epoch_unexpected_repository_action");
    const row = sanitizedTextResult(task, result, evidence, correct, Date.now() - started);
    results.push(row); console.log(`NYX_TEXT_TASK ${JSON.stringify(row)}`);
    consecutiveProviderFailures = row.state === "PROVIDER_FAILURE" ? consecutiveProviderFailures + 1 : 0;
  }
  const sourceUnchanged = before === git("ls-files", "-s") && !git("status", "--porcelain");
  const families = ["AIME_2025", "BBEH_MINI"].map(family => {
    const population = selection.filter(t => t.family === family);
    const rows = results.filter(t => t.family === family);
    const familyBlocked = blocked.filter(t => population.some(p => p.taskId === t.taskId));
    return {family, selected: population.length, executed: rows.length,
      correct: rows.filter(r => r.correct === true).length, graded: rows.filter(r => r.correct !== null).length,
      blockedByCapability: familyBlocked.length, notExecuted: population.length - rows.length - familyBlocked.length,
      fullPopulation: family === "AIME_2025" ? 30 : 460,
      fullBenchmarkScoreClaim: mode === "FULL" && rows.length === population.length
        && rows.every(r => r.correct !== null)};
  });
  const report = {schemaVersion: 1, identity: "NYX-PUBLIC-TEXT-BENCHMARK-EPOCH-001", candidate, mode,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID || "authorized-local"}`,
    environment: `${process.platform}-${process.arch}-node-${process.version}`,
    policy: TEXT_BENCHMARK_POLICY, populationDigest: theoryDigest(tasks), selectionDigest: theoryDigest(selection),
    selectedTaskIds: selection.map(t => t.taskId), verifier: {bbehRevision: data.bbehRevision,
      bbehSourceDigest: data.bbehEvaluatorDigest, aime: "EXACT_FINAL_INTEGER_CUSTOM_ADAPTER_NOT_MATHARENA_HARNESS"},
    configuration: "EXISTING_NYX_CHAT_DEFAULT_0_2_JSON_OBJECT_NO_COGNITIVE_CHANGES",
    inference: "E4_LIVE_NVIDIA", verification: "E3_WITHHELD_REFERENCES_UPSTREAM_BBEH_GRADER",
    results, blocked, families, sourceUnchanged, authorityDelta: "NONE", repairAttempts: 0,
    firstAttemptOnly: true, broadPromotion: false, calibration: "NOT_SUPPORTED_BY_CURRENT_REPLY_PROTOCOL",
    stopReason: consecutiveProviderFailures >= 2 ? "PROVIDER_UNAVAILABLE_CONSECUTIVE_TASKS"
      : Date.now() >= deadline ? "FROZEN_WALL_CLOCK_BUDGET" : "SELECTION_EXHAUSTED",
    contamination: "PUBLIC_DATA_PRETRAINING_EXPOSURE_UNKNOWN_NOT_SEALED"};
  await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-text-benchmark-${candidate}.json`), JSON.stringify(report, null, 2));
  console.log(`NYX_TEXT_EPOCH ${JSON.stringify(report)}`);
  if (!sourceUnchanged) process.exitCode = 1;
  return report;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/nyx-text-benchmark-epoch.ts")) await runTextBenchmarkEpoch();
