import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { createArcAdapter, ARC_R3_ADAPTER_VERSION, type ArcIntegrationEvidence } from "./benchmarks/nyxArcAdapter";
import { contentHash } from "./benchmarks/r3RepositorySession";
import { prepareTask } from "./benchmarks/tasks";
import { runCampaign } from "./benchmarks/campaign";
import type { ArmSpec, CampaignSpec } from "./benchmarks/contracts";

// Frozen before task contents were opened; no selection by correctness or convenience.
export const ARC_DEVELOPMENT_SELECTION = Object.freeze({ revision: "f3283f727488ad98fe575ea6a5ac981e4a188e49",
  dataset: "arcprize/ARC-AGI-2 public training", selection: "FIRST_THREE_SORTED_PUBLIC_TRAINING_TASK_PATHS",
  upstreamTaskPopulation: 1000,
  tasks: [
    { taskId: "00576224", blob: "decb19e8c4fd902945bf3b3a1d432fac79f4c30e" },
    { taskId: "007bbfb7", blob: "194d6e53b44a972b678ab7511fbe3bafbcac654a" },
    { taskId: "009d5c81", blob: "049872096396a564ecca72befef743d9f884ee3c" },
  ] });
if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_ARC_DEVELOPMENT BLOCKED_AUTHORITY_OR_MISSING_INJECTED_SECRET"); process.exit(2);
}
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const candidate = process.env.GITHUB_SHA?.trim() || git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
  throw Error("nyx_arc_clean_frozen_candidate_required");
const sourceBefore = theoryDigest({ index: git("ls-files", "-s"), status: git("status", "--porcelain") });
const sources = git("ls-files", "--", "src/lib/codelab", "scripts/omega/benchmarks").split("\n")
  .filter(path => path.endsWith(".ts")).sort();
const sourceTreeDigest = theoryDigest(await Promise.all(sources.map(async path => ({ path, hash: contentHash(await readFile(path, "utf8")) }))));
const verifierSourceDigest = contentHash(await readFile("scripts/omega/benchmarks/tasks.ts", "utf8"));
const tasks = await Promise.all(ARC_DEVELOPMENT_SELECTION.tasks.map(async selection => {
  const path = `scripts/omega/benchmarks/fixtures/arc-training-${selection.taskId}.json`;
  // The imported text has one added final LF; explicitly verify all remaining upstream bytes.
  // Normalize Git checkout CRLF, not arbitrary JSON formatting or task semantics.
  const bytes = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  if (!bytes.endsWith("\n") || execFileSync("git", ["hash-object", "--stdin"],
    { input: bytes.slice(0, -1), encoding: "utf8" }).trim() !== selection.blob) throw Error("arc_upstream_content_changed");
  const raw = JSON.parse(bytes);
  return prepareTask("ARC_AGI", selection.taskId, "DEVELOPMENT", { dataset: ARC_DEVELOPMENT_SELECTION.dataset,
    revision: ARC_DEVELOPMENT_SELECTION.revision, contentDigest: theoryDigest(raw), visibility: "PUBLIC", kind: "DATASET_TASK",
    provenance: `https://github.com/arcprize/ARC-AGI-2/blob/${ARC_DEVELOPMENT_SELECTION.revision}/data/training/${selection.taskId}.json; public training, potentially pretraining-exposed, NOT held-out benchmark evidence.` }, raw);
}));
const began = Date.now(); const model = "nvidia/nemotron-3-ultra-550b-a55b";
const modelConfiguration = { model, temperature: 0, inferencePolicy: "CONSTRAINED_JSON", maxOutputTokens: 8192,
  maxProviderPromptBytes: 64000, timeoutMs: 120000 };
const authority = { nvidiaEndpointOnly: true, isolatedR1R2R3Candidate: true, productionAuthority: false,
  sourceWrites: false, unrestrictedShell: false, arbitraryTools: false, credentialEnvironmentForwarded: false,
  candidateNetworkIsolation: "NOT_PROVEN", hostileCodeSandbox: false };
const tools = { publicExampleVerification: "EXISTING_R3B_FIXED_NODE_TOOL", maxChangedFiles: 1,
  maxPatchBytes: 12000, timeoutMsPerExecution: 2000, outputBytes: 64000,
  workUnit: "PUBLIC_EXAMPLE_AND_TEST_INPUT_INVOCATIONS_NOT_CPU_CYCLES" };
const spec: CampaignSpec = { schemaVersion: 1, campaignId: "NYX-ARC-EXISTING-R3-DEVELOPMENT-001",
  environmentIdentity: `${process.platform}-${process.arch}-node-${process.version}`,
  executionIdentity: process.env.GITHUB_RUN_ID ? `github-actions-${process.env.GITHUB_RUN_ID}` : "LOCAL_AUTHORIZED_NVIDIA",
  frozenAtEpochMs: began, expiresAtEpochMs: began + 1_800_000, taskDigests: tasks.map(t => t.manifest.taskDigest), model,
  modelConfigDigest: theoryDigest(modelConfiguration), authorityDigest: theoryDigest(authority), toolEnvelopeDigest: theoryDigest(tools),
  verifierVersion: "arc-exact-two-predictions/1", verifierSourceDigest,
  limits: { maxCallsPerTask: 2, maxReportedTokensPerTask: 100000, maxToolCallsPerTask: 3, maxToolWorkUnitsPerTask: 600,
    maxAttemptsPerTask: 1, maxArtifactBytes: 50000, maxWallClockMsPerTask: 220000, maxWallClockMs: 1_750_000 },
  realizedComputeTolerance: 0.1 };
const provider = NvidiaNimProvider.create({ providerId: "NYX-ARC-EXISTING-R3", model,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: modelConfiguration.maxProviderPromptBytes, maxOutputTokens: modelConfiguration.maxOutputTokens,
  timeoutMs: modelConfiguration.timeoutMs });
const integration: ArcIntegrationEvidence[] = [];
const adapters = (["RAW_MODEL", "MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX"] as const).map(arm => {
  const armSpec: ArmSpec = { arm, version: ARC_R3_ADAPTER_VERSION, sourceDigest: theoryDigest({ sourceTreeDigest, arm }),
    inferenceMode: "LIVE_PROVIDER_E4", model, modelConfigDigest: spec.modelConfigDigest, authorityDigest: spec.authorityDigest,
    toolEnvelopeDigest: arm === "RAW_MODEL" ? theoryDigest({ tools: [] }) : spec.toolEnvelopeDigest, supportedCapabilities: ["JSON_GRID_OUTPUT"] };
  return createArcAdapter({ spec: armSpec, provider, candidateCommit: candidate, maxOutputTokens: modelConfiguration.maxOutputTokens,
    onIntegrationEvidence: value => { integration.push(value); console.log(`NYX_ARC_R3_TRACE ${JSON.stringify(value)}`); } });
});
const campaign = await runCampaign(spec, tasks, adapters, null);
const sourceUnchanged = theoryDigest({ index: git("ls-files", "-s"), status: git("status", "--porcelain") }) === sourceBefore;
const report = { schemaVersion: 1, candidate, sourceTreeDigest, selection: ARC_DEVELOPMENT_SELECTION,
  modelConfiguration, authority, tools, campaign, integration, sourceUnchanged,
  evidence: { inference: "E4_LIVE_NVIDIA", verification: "E3_INDEPENDENT_EXACT_GRID_SCORER", oracleCustody: "PROCESS_LOCAL_CALLER_TRUST_NOT_SIGNED" },
  interpretation: "SMALL_PUBLIC_TRAINING_INTEGRATION_PILOT_NOT_HELD_OUT_OR_FRONTIER_SCORE",
  firstTryAccounting: "FIRST_ACCEPTED_CALL_WITH_ONE_CANDIDATE; INTERNAL_REPAIR_REPORTED_SEPARATELY",
  candidateNyxUnavailable: "NO_UNVALIDATED_NEW_MECHANISM_ADDED", matchedRealizedComputeClaim: false,
  broadCapabilityPromotion: false, grantsAuthority: false };
const path = join(tmpdir(), `nyx-arc-development-${candidate}.json`);
await writeFile(path, JSON.stringify(report, null, 2));
console.log(`NYX_ARC_DEVELOPMENT ${JSON.stringify(report)}`);
if (!sourceUnchanged || integration.some(i => !i.sourceUnchanged || !i.cleanupVerified)) process.exitCode = 1;
// Cognitive failure stays in the report; it must not trigger unbounded CI retries.
