import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile, writeFile, rename} from "node:fs/promises";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {liveNvidiaCapacity} from "../../src/lib/codelab/model/nvidiaCapacity";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {parseAime2026Data, AIME_2026_SOURCE} from "./nyx-aime26-live-eval";
import {parsePinnedGpqaData, GPQA_DIAMOND_SOURCE, textInferenceUsage, type PrivateTextTask} from "./benchmarks/nyxTextBenchmark";
import {ULTRA_RESEARCH_PAIR_POLICY as P, ultraResearchModel, ultraResearchProviderConfig,
  ultraResearchSelection, runUltraResearchArm, summarizeUltraResearchPairs,
  type UltraResearchArm, type UltraResearchRow} from "./benchmarks/ultraResearchPair";

const AVAILABILITY_TASK: PrivateTextTask = Object.freeze({family: "DEVELOPMENT_DIAGNOSTIC",
  taskId: "ULTRA-AVAILABILITY-DEVELOPMENT", question: "A box contains three red counters and four blue counters. How many counters are in the box? Return only the final integer.", answer: "7"});

export async function runUltraResearchPair() {
  const model = ultraResearchModel(process.env);
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("ultra_pair_requires_authorized_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
  const candidate = git("rev-parse", "HEAD"), indexedSource = git("ls-files", "-s");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== process.env.GITHUB_SHA || git("status", "--porcelain"))
    throw Error("ultra_pair_requires_clean_frozen_candidate");
  if (!process.env.NYX_ULTRA_PAIR_AIME || !process.env.NYX_ULTRA_PAIR_GPQA || !process.env.NYX_ULTRA_PAIR_AIME_SHA256)
    throw Error("ultra_pair_verified_data_required");
  const aime = parseAime2026Data(await readFile(resolve(process.env.NYX_ULTRA_PAIR_AIME), "utf8"), process.env.NYX_ULTRA_PAIR_AIME_SHA256);
  const gpqa = parsePinnedGpqaData(await readFile(resolve(process.env.NYX_ULTRA_PAIR_GPQA), "utf8")).tasks;
  const selected = ultraResearchSelection(aime, gpqa), began = Date.now(), epochDeadline = began + P.maxEpochMs;
  const sourceBindings = Object.fromEntries(await Promise.all([
    "scripts/omega/nyx-ultra-research-pair.ts", "scripts/omega/benchmarks/ultraResearchPair.ts",
    "scripts/omega/nyx-aime26-live-eval.ts", "scripts/omega/benchmarks/nyxTextBenchmark.ts",
    "scripts/omega/benchmarks/r3RepositorySession.ts", "scripts/omega/benchmarks/prepare-text-benchmarks.py",
    "src/lib/codelab/cli/nyxChatSession.ts", "src/lib/codelab/cli/nyxChatProtocol.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "src/lib/codelab/model/nvidiaEventStream.ts",
    "src/lib/codelab/model/nvidiaCapacity.ts", "src/lib/codelab/executor/readOnlyExecutor.ts",
    ".github/workflows/omega-nyx-ultra-research-pair.yml",
  ].map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  const provider = NvidiaNimProvider.create({...ultraResearchProviderConfig(model), credentialSource: nvidiaNimCredentialFromEnvironment(process.env)});
  const rows: UltraResearchRow[] = [], preflight: UltraResearchRow[] = [];
  const waits: {taskId: string; arm: string; state: string; waitedMs: number}[] = [];
  let pending: {taskId: string; arm: UltraResearchArm; started: number; evidence: NvidiaNimEvidence[]} | null = null;
  let stopReason = "IN_PROGRESS", infrastructureCode: string | null = null, sourceUnchanged: boolean | null = null;
  const usage = (items: readonly UltraResearchRow[]) => items.reduce((total, row) => {
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += row.usage[key];
    return total;
  }, {logicalCalls: 0, physicalCalls: 0, httpAttempts: 0, reportedTokens: 0, unknownUsageCalls: 0,
    toolCalls: 0, toolWorkUnits: 0, wallClockMs: 0, providerFailures: 0, retries: 0});
  const snapshot = () => ({schemaVersion: 1, identity: "NYX-ULTRA-STANDALONE-CLOSED-BOOK-PAIR-001", candidate,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID}`, environment: `${process.platform}-${process.arch}-node-${process.version}`,
    policy: P, modelIdentifierScope: "EXACT_REQUESTED_IDENTIFIER_NOT_WEIGHT_DIGEST_OR_IMMUTABLE_SERVING_BUILD",
    sourceBindings, sources: {aime: AIME_2026_SOURCE, gpqa: GPQA_DIAMOND_SOURCE},
    preparedAimeSha256: process.env.NYX_ULTRA_PAIR_AIME_SHA256,
    selectedTasks: selected.map(task => ({taskId: task.taskId, family: task.family, inputDigest: theoryDigest(task.question)})),
    selection: "FIXED_ID_HASH_RANK_TWO_PER_FAMILY_WITHOUT_REFERENCE_OR_PRIOR_OUTCOME_SELECTION",
    exposure: "EXPOSED_PUBLIC_PROGRAM_CORPORA_NOT_FRESH_GENERALIZATION_PROVIDER_PRETRAINING_UNKNOWN",
    armOrder: selected.map((t, index) => ({taskId: t.taskId,
      arms: Math.floor(index / 2) % 2 === 0 ? [...P.arms] : [...P.arms].reverse()})),
    preflight, results: rows, summary: summarizeUltraResearchPairs(selected.map(t => t.taskId), rows),
    usage: {benchmark: usage(rows), developmentAvailability: usage(preflight), allCompletedCells: usage([...preflight, ...rows]),
      interruptedAttempt: pending ? {taskId: pending.taskId, arm: pending.arm,
        observedUsageSoFar: textInferenceUsage(pending.evidence, Date.now() - pending.started),
        notAFinalUsageEstimate: true} : null},
    capacityWaits: waits, stopReason, infrastructureCode, elapsedMs: Date.now() - began, sourceUnchanged,
    inFlight: pending ? {taskId: pending.taskId, arm: pending.arm,
      status: "STARTED_NOT_TERMINAL_HTTP_DISPATCH_AND_USAGE_MAY_BE_UNKNOWN_IN_INTERRUPTED_CHECKPOINT"} : null,
    rawQuestionsStored: false, rawAnswersStored: false, rawModelReasoningStored: false,
    lowEntropyAnswerHashesStored: false, credentialsStored: false, historicalSuccessesMerged: false,
    wholeResearchArchitectureExercised: false, toolsOrRepositoryActionsAuthorized: false,
    benchmarkHarness: "CUSTOM_NYX_FIRST_REPLY_PILOT_NOT_AUTHOR_INFERENCE_HARNESS_OR_FULL_BENCHMARK",
    defaultUltraChanged: false, authorityDelta: "NONE", architecturalPromotion: false,
    interpretation: "AVAILABILITY_DOES_NOT_PROVE_PROVIDER_STABILITY_PILOT_DOES_NOT_PROVE_GENERAL_CAPABILITY"});
  const checkpoint = async () => {
    const path = join(process.env.RUNNER_TEMP || tmpdir(), `nyx-ultra-pair-${candidate}.json`);
    await writeFile(`${path}.pending`, JSON.stringify(snapshot())); await rename(`${path}.pending`, path);
    console.log(`NYX_ULTRA_PAIR_PROGRESS ${JSON.stringify({candidate, preflightCells: preflight.length,
      benchmarkCells: rows.length, stopReason})}`);
  };
  const execute = async (task: PrivateTextTask, arm: UltraResearchArm) => {
    const ready = await liveNvidiaCapacity.waitUntilReady(epochDeadline, new AbortController().signal);
    waits.push({taskId: task.taskId, arm, state: ready.state, waitedMs: ready.waitedMs});
    if (ready.state !== "READY" || Date.now() >= epochDeadline) return null;
    pending = {taskId: task.taskId, arm, started: Date.now(), evidence: []}; await checkpoint();
    const result = await runUltraResearchArm(task, arm,
      provider.withHttpAttemptBudget(P.maxPhysicalCallsPerTaskArm, "WITHIN_SHARED_BUDGET"), candidate, epochDeadline, pending.evidence);
    pending = null; return result;
  };
  await checkpoint();
  try {
    for (const arm of P.arms) {
      const row = await execute(AVAILABILITY_TASK, arm); if (!row) {stopReason = "AVAILABILITY_WAIT_LIMIT"; break;}
      preflight.push(row); await checkpoint();
    }
    if (preflight.length !== 2 || preflight.some(row => row.correct !== true)) stopReason = "AVAILABILITY_NOT_PASSED_NO_BENCHMARK_CALLS";
    else {
      outer: for (const [index, task] of selected.entries()) {
        const order = Math.floor(index / 2) % 2 === 0 ? [...P.arms] : [...P.arms].reverse();
        for (const arm of order) {
          const row = await execute(task, arm); if (!row) {stopReason = "EPOCH_OR_CAPACITY_LIMIT"; break outer;}
          rows.push(row); await checkpoint();
        }
      }
      if (rows.length === selected.length * P.arms.length) stopReason = "PILOT_SELECTION_EXHAUSTED";
    }
  } catch (error) {
    const owned = ["ultra_research_input_scope_rejected", "ultra_research_logical_budget_exceeded", "ultra_research_wire_profile_mismatch",
      "ultra_research_provider_model_mismatch", "ultra_research_model_invocation_failed",
      "ultra_research_unexpected_repository_action", "ultra_research_cleanup_failed"];
    infrastructureCode = error instanceof Error && owned.includes(error.message) ? error.message : "ultra_pair_infrastructure_failure";
    stopReason = "INFRASTRUCTURE_OR_CONTRACT_FAILURE";
  }
  sourceUnchanged = indexedSource === git("ls-files", "-s") && git("status", "--porcelain") === "";
  if (!sourceUnchanged) {stopReason = "SOURCE_INTEGRITY_FAILURE"; infrastructureCode = "source_changed";}
  await checkpoint(); const report = snapshot(); console.log(`NYX_ULTRA_RESEARCH_PAIR_EPOCH ${JSON.stringify(report)}`);
  const costs = report.usage.allCompletedCells;
  if (costs.logicalCalls > P.maxEpochLogicalCalls || costs.physicalCalls > P.maxEpochPhysicalCalls)
    throw Error("ultra_pair_epoch_budget_invariant_failed");
  if (!sourceUnchanged || stopReason !== "PILOT_SELECTION_EXHAUSTED" || report.summary.arms.some(a => !a.completePilot)) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runUltraResearchPair().catch(() => {console.error("NYX_ULTRA_PAIR_INPUT_OR_RUNTIME_REJECTED_NO_RAW_DATA_LOGGED"); process.exitCode = 1;});
