import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { prepareTask } from "./benchmarks/tasks";
import { createArcAdapter, type ArcIntegrationEvidence } from "./benchmarks/nyxArcAdapter";
import { runCampaign, matchedObservedAttempts } from "./benchmarks/campaign";
import { contentHash } from "./benchmarks/r3RepositorySession";
import type { ArmSpec, CampaignSpec } from "./benchmarks/contracts";

// Selection is committed before any task content is opened. No correctness-based filtering.
export const ARC_PUBLIC_EPOCH_SELECTION = Object.freeze({ revision: "f3283f727488ad98fe575ea6a5ac981e4a188e49",
  partition: "data/evaluation", population: 120, selection: "FIRST_EIGHT_LEXICOGRAPHIC_PATHS",
  taskIds: ["0934a4d8", "135a2760", "136b0064", "13e47133", "142ca369", "16b78196", "16de56c4", "1818057f"],
  oraclePolicy: "WITHHELD_OUTPUTS_EVALUATOR_ONLY_NO_BENCHMARK_FEEDBACK_RETRIES",
  contamination: "PUBLIC_EVALUATION_PRETRAINING_EXPOSURE_UNKNOWN_NOT_SEALED" });

export async function runArcBenchmarkEpoch() {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("arc_epoch_requires_explicit_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
    throw Error("arc_epoch_requires_clean_frozen_candidate");
  const root = resolve(process.env.NYX_ARC_DATA_ROOT || "");
  if (!process.env.NYX_ARC_DATA_ROOT || execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    !== ARC_PUBLIC_EPOCH_SELECTION.revision || execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).trim())
    throw Error("arc_epoch_dataset_revision_or_dirty_tree");
  const names = (await readdir(join(root, ARC_PUBLIC_EPOCH_SELECTION.partition))).filter(n => n.endsWith(".json")).sort();
  if (names.length !== ARC_PUBLIC_EPOCH_SELECTION.population
    || theoryDigest(names.slice(0, 8).map(n => n.slice(0, -5))) !== theoryDigest(ARC_PUBLIC_EPOCH_SELECTION.taskIds))
    throw Error("arc_epoch_frozen_selection_changed");
  const sourceBefore = theoryDigest(git("ls-files", "-s"));
  const sources = git("ls-files", "--", "src/lib/codelab", "scripts/omega/benchmarks").split("\n")
    .filter(p => p.endsWith(".ts")).sort();
  const sourceDigest = theoryDigest(await Promise.all(sources.map(async path => ({path, hash: contentHash(await readFile(path, "utf8"))}))));
  // Read exact committed objects, not checkout-normalized bytes. Raw answers never enter adapter inputs or logs.
  const tasks = ARC_PUBLIC_EPOCH_SELECTION.taskIds.map(taskId => {
    const path = `${ARC_PUBLIC_EPOCH_SELECTION.partition}/${taskId}.json`;
    const raw = JSON.parse(execFileSync("git", ["-C", root, "show", `${ARC_PUBLIC_EPOCH_SELECTION.revision}:${path}`], {encoding: "utf8"}));
    return prepareTask("ARC_AGI", taskId, "VALIDATION", {dataset: "arcprize/ARC-AGI-2 public evaluation",
      revision: ARC_PUBLIC_EPOCH_SELECTION.revision, contentDigest: theoryDigest(raw), visibility: "PUBLIC", kind: "DATASET_TASK",
      provenance: `https://github.com/arcprize/ARC-AGI-2/blob/${ARC_PUBLIC_EPOCH_SELECTION.revision}/${path}; public subset, not protected leaderboard evaluation.`}, raw);
  });
  const began = Date.now(); const model = "nvidia/nemotron-3-ultra-550b-a55b";
  const modelConfiguration = {model, temperature: 0, inferencePolicy: "CONSTRAINED_JSON", maxOutputTokens: 8192,
    maxProviderPromptBytes: 64000, timeoutMs: 65000};
  const authority = {existingIsolatedR1R2R3: true, sourceWrites: false, production: false, unrestrictedShell: false,
    generalNetwork: false, credentialEnvironmentForwarding: false, candidateNetworkIsolation: "NOT_PROVEN", hostileCodeSandbox: false};
  const tools = {tool: "EXISTING_R3B_TEST", maxChangedFiles: 1, maxPatchBytes: 12000, timeoutMs: 2000,
    publicFeedback: "FULL_DUMP", sourceRepresentation: "LINES", dataEncoding: "LOSSLESS_COMPACT_JSON",
    acceptance: "UNCHANGED_PUBLIC_EXAMPLES_STATIC_ADMISSION_AND_PRIVATE_EXACT_TWO_GUESS_SCORER"};
  const spec: CampaignSpec = {schemaVersion: 1, campaignId: "NYX-ARC-PUBLIC-EVALUATION-BASELINE-001",
    environmentIdentity: `${process.platform}-${process.arch}-node-${process.version}`,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID || "authorized-local"}`,
    frozenAtEpochMs: began, expiresAtEpochMs: began + 2900000, taskDigests: tasks.map(t => t.manifest.taskDigest), model,
    modelConfigDigest: theoryDigest(modelConfiguration), authorityDigest: theoryDigest(authority), toolEnvelopeDigest: theoryDigest(tools),
    verifierVersion: "arc-exact-two-predictions/1", verifierSourceDigest: contentHash(await readFile("scripts/omega/benchmarks/tasks.ts", "utf8")),
    limits: {maxCallsPerTask: 2, maxReportedTokensPerTask: 100000, maxToolCallsPerTask: 3, maxToolWorkUnitsPerTask: 600,
      maxAttemptsPerTask: 1, maxArtifactBytes: 50000, maxWallClockMsPerTask: 155000, maxWallClockMs: 2800000},
    realizedComputeTolerance: 0.1};
  const provider = NvidiaNimProvider.create({providerId: "NYX-ARC-PUBLIC-BASELINE", model,
    authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes: modelConfiguration.maxProviderPromptBytes, maxOutputTokens: modelConfiguration.maxOutputTokens,
    timeoutMs: modelConfiguration.timeoutMs});
  const integration: ArcIntegrationEvidence[] = [];
  const adapters = (["RAW_MODEL", "MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX"] as const).map(arm => {
    const armSpec: ArmSpec = {arm, version: "nyx-existing-r3-arc/1", sourceDigest: theoryDigest({sourceDigest, arm}),
      inferenceMode: "LIVE_PROVIDER_E4", model, modelConfigDigest: spec.modelConfigDigest, authorityDigest: spec.authorityDigest,
      toolEnvelopeDigest: arm === "RAW_MODEL" ? theoryDigest({tools: []}) : spec.toolEnvelopeDigest,
      supportedCapabilities: ["JSON_GRID_OUTPUT"]};
    return createArcAdapter({spec: armSpec, provider, candidateCommit: candidate, maxOutputTokens: modelConfiguration.maxOutputTokens,
      compactPublicData: true, onIntegrationEvidence: trace => {
        integration.push(trace); console.log(`NYX_ARC_PUBLIC_TRACE ${JSON.stringify(trace)}`);
      }});
  });
  const campaign = await runCampaign(spec, tasks, adapters, null);
  const pairs = tasks.map(task => ({taskDigest: task.manifest.taskDigest,
    currentVersusReferenceMatched: matchedObservedAttempts(campaign.runs.filter(r => r.taskDigest === task.manifest.taskDigest
      && ["CURRENT_NYX", "MODEL_EQUIVALENT_TOOLS"].includes(r.arm)).flatMap(r => r.attempts), spec.realizedComputeTolerance)}));
  const sourceUnchanged = sourceBefore === theoryDigest(git("ls-files", "-s")) && !git("status", "--porcelain");
  const report = {schemaVersion: 1, candidate, selection: ARC_PUBLIC_EPOCH_SELECTION, modelConfiguration, authority, tools,
    campaign, integration, pairs, sourceUnchanged, inference: "E4_LIVE_NVIDIA", verification: "E3_INDEPENDENT_EXACT_GRID_SCORER",
    broadPromotion: false, fullBenchmarkScoreClaim: false, grantsAuthority: false,
    integrationTraceComplete: integration.length === campaign.runs.filter(r => r.attempts.length && r.arm !== "RAW_MODEL").length,
    interpretation: "FROZEN_PUBLIC_EVALUATION_SUBSET_NOT_FULL_BENCHMARK_OR_PROTECTED_SCORE"};
  await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-arc-public-${candidate}.json`), JSON.stringify(report, null, 2));
  console.log(`NYX_ARC_PUBLIC_EPOCH ${JSON.stringify(report)}`);
  if (!sourceUnchanged || !report.integrationTraceComplete || integration.some(t => !t.cleanupVerified || !t.sourceUnchanged))
    process.exitCode = 1;
  return report;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/nyx-arc-benchmark-epoch.ts")) await runArcBenchmarkEpoch();
