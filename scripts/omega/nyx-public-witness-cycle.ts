import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash } from "./benchmarks/r3RepositorySession";
import { createArcAdapter, type ArcIntegrationEvidence } from "./benchmarks/nyxArcAdapter";
import { prepareTask } from "./benchmarks/tasks";
import { runCampaign } from "./benchmarks/campaign";
import type { ArmSpec, CampaignSpec } from "./benchmarks/contracts";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
  throw Error("public_witness_cycle_requires_authorized_injected_secret");
const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
  throw Error("public_witness_cycle_clean_candidate_required");
const sourceBefore = theoryDigest(git("ls-files", "-s"));
const sourceTreeDigest = theoryDigest(await Promise.all(git("ls-files", "--", "src/lib/codelab", "scripts/omega/benchmarks")
  .split("\n").filter(p => p.endsWith(".ts")).sort().map(async path => ({path, hash: contentHash(await readFile(path, "utf8"))}))));
// Authored and frozen before this cycle's inference. No official/reserved tasks used.
// Different rule families, not parameter variants of the frozen public ARC tasks.
type Grid = number[][];
const matrix = (rows: number, columns: number, seed: number): Grid => Array.from({length: rows}, (_, r) =>
  Array.from({length: columns}, (_, c) => (r * 3 + c * 7 + seed) % 10));
const seeds = (rows: number, columns: number, seed: number): Grid => Array.from({length: rows}, (_, r) =>
  Array.from({length: columns}, (_, c) => r === 0 ? (c + seed) % 9 + 1 : 0));
const anchors = (rows: number, columns: number, seed: number): Grid => {
  const out = Array.from({length: rows}, () => Array(columns).fill(0) as number[]);
  out[1 + seed][2 + seed] = 9; out[rows - 2][columns - 3] = 9; return out;
};
const rules = [
  {id: "DEV-HORIZONTAL", tier: "DEVELOPMENT" as const, make: matrix,
    solve: (g: Grid) => g.map(row => [...row].reverse())},
  {id: "DEV-COLOR-PERMUTATION", tier: "DEVELOPMENT" as const, make: matrix,
    solve: (g: Grid) => g.map(row => row.map(v => v === 3 ? 7 : v === 7 ? 3 : v))},
  {id: "TRANSFER-SEED-PROPAGATION", tier: "VALIDATION" as const, make: seeds,
    solve: (g: Grid) => g.map(() => [...g[0]])},
  {id: "TRANSFER-SPATIAL-BOUNDARY", tier: "VALIDATION" as const, make: anchors,
    solve: (g: Grid) => {
      const points: [number, number][] = [];
      g.forEach((row, r) => row.forEach((v, c) => {if (v === 9) points.push([r, c]);}));
      const [a, b] = points; const out = g.map(row => [...row]);
      for (let r = a[0]; r <= b[0]; r++) for (let c = a[1]; c <= b[1]; c++)
        if (r === a[0] || r === b[0] || c === a[1] || c === b[1]) out[r][c] = 9;
      return out;
    }},
];
const tasks = rules.map((rule, index) => {
  const pair = (rows: number, columns: number, seed: number) => {
    const input = rule.make(rows, columns, seed); return {input, output: rule.solve(input)};
  };
  const raw = {train: [pair(22, 26, index), pair(24, 25, index + 1)],
    test: [pair(27, 29, index + 2), pair(28, 24, index + 3)]};
  return prepareTask("ARC_AGI", rule.id, rule.tier, {dataset: "NYX-PUBLIC-WITNESS-CYCLE-AUTHORED",
    revision: "1", contentDigest: theoryDigest(raw), visibility: "SYNTHETIC", kind: "DATASET_TASK",
    provenance: "Fresh authored task population, two distinct development and two transfer rule families; same-session author/evaluator correlation, NOT official, sealed, independently authored, or proof of pretraining absence."}, raw);
});
const model = "nvidia/nemotron-3-ultra-550b-a55b";
const modelConfiguration = {model, temperature: 0, inferencePolicy: "CONSTRAINED_JSON", maxOutputTokens: 4096,
  maxProviderPromptBytes: 64000, timeoutMs: 45000};
const authority = {sourceWrites: false, productionAuthority: false, generalShell: false, generalNetwork: false,
  existingR3DisposableOnly: true, candidateNetworkIsolation: "NOT_PROVEN", hostileCodeSandbox: false};
const toolEnvelope = {tool: "EXISTING_R3B_TEST", maxChangedFiles: 1, maxPatchBytes: 12000, timeoutMs: 2000,
  acceptance: "UNCHANGED_EXACT_PUBLIC_MATCH_INPUT_IMMUTABILITY_AND_STATIC_ADMISSION",
  experimentalVariable: "PUBLIC_FAILURE_RENDERING_ONLY", publicDataEncoding: "COMPACT_JSON_IDENTICAL_BOTH_ARMS",
  workUnit: "PUBLIC_EXAMPLE_AND_TEST_INPUT_INVOCATIONS_NOT_CPU_CYCLES"};
const began = Date.now();
const spec: CampaignSpec = {schemaVersion: 1, campaignId: "NYX-PUBLIC-FAILURE-WITNESS-CYCLE-001",
  environmentIdentity: `${process.platform}-${process.arch}-node-${process.version}`,
  executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID || "authorized-local"}`,
  frozenAtEpochMs: began, expiresAtEpochMs: began + 1500000, taskDigests: tasks.map(t => t.manifest.taskDigest), model,
  modelConfigDigest: theoryDigest(modelConfiguration), authorityDigest: theoryDigest(authority), toolEnvelopeDigest: theoryDigest(toolEnvelope),
  verifierVersion: "arc-exact-two-predictions/1", verifierSourceDigest: contentHash(await readFile("scripts/omega/benchmarks/tasks.ts", "utf8")),
  limits: {maxCallsPerTask: 2, maxReportedTokensPerTask: 100000, maxToolCallsPerTask: 3, maxToolWorkUnitsPerTask: 12,
    maxAttemptsPerTask: 1, maxArtifactBytes: 50000, maxWallClockMsPerTask: 150000, maxWallClockMs: 1450000},
  realizedComputeTolerance: 0.1};
const provider = NvidiaNimProvider.create({providerId: "NYX-PUBLIC-WITNESS-CYCLE", model,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: modelConfiguration.maxProviderPromptBytes, maxOutputTokens: modelConfiguration.maxOutputTokens,
  timeoutMs: modelConfiguration.timeoutMs});
const integration: ArcIntegrationEvidence[] = [];
const adapters = (["CURRENT_NYX", "CANDIDATE_NYX"] as const).map(arm => {
  const mode = arm === "CURRENT_NYX" ? "FULL_DUMP" : "COMPACT_WITNESS";
  const armSpec: ArmSpec = {arm, version: `nyx-public-witness/1-${mode}`, sourceDigest: theoryDigest({sourceTreeDigest, mode}),
    inferenceMode: "LIVE_PROVIDER_E4", model, modelConfigDigest: spec.modelConfigDigest,
    authorityDigest: spec.authorityDigest, toolEnvelopeDigest: spec.toolEnvelopeDigest, supportedCapabilities: ["JSON_GRID_OUTPUT"]};
  return createArcAdapter({spec: armSpec, provider, candidateCommit: candidate, maxOutputTokens: modelConfiguration.maxOutputTokens,
    publicFeedbackMode: mode, compactPublicData: true,
    onIntegrationEvidence: trace => {integration.push(trace); console.log(`NYX_WITNESS_TRACE ${JSON.stringify(trace)}`);}});
});
const campaign = await runCampaign(spec, tasks, adapters, null);
const pairs = tasks.map(task => {
  const records = (["CURRENT_NYX", "CANDIDATE_NYX"] as const).map(arm => campaign.runs.find(r => r.arm === arm && r.taskDigest === task.manifest.taskDigest)!);
  const attempts = records.map(r => r.attempts[0]);
  const usages = attempts.map(a => a?.usage);
  const stable = usages.every(u => u && !u.unknownUsageCalls && !u.providerFailures && !u.retries);
  const matched = stable && attempts.every(a => a?.evaluation && a.verifierUsage && !a.verifierUsage.unknownUsageCalls)
    && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(field => {
    const values = usages.map(u => u![field as "physicalCalls" | "reportedTokens" | "toolWorkUnits"]);
    return Math.max(...values) - Math.min(...values) <= Math.max(...values, 1) * spec.realizedComputeTolerance;
  });
  return {taskDigest: task.manifest.taskDigest, tier: task.manifest.tier, matchedRealizedInferenceAndToolCompute: matched,
    stable, outcomes: records.map(r => ({arm: r.arm, state: r.state, ...r.attempts[0]}))};
});
const sourceUnchanged = sourceBefore === theoryDigest(git("ls-files", "-s")) && !git("status", "--porcelain");
const report = {schemaVersion: 1, candidate, sourceTreeDigest, campaign, pairs, integration, sourceUnchanged,
  hypothesis: "Compact public failure witnesses improve bounded verifier-guided repair by preserving actionable mismatches inside existing observation limits.",
  falsification: "No reproducible increase in accepted solutions or decrease in repair cost on fresh tasks at matched realized compute.",
  acceptanceOracleChanged: false, inference: "E4_LIVE_NVIDIA", scorer: "E3_UNCHANGED_EXACT_GRID_ORACLE",
  authorIndependence: "SAME_SESSION_NOT_INDEPENDENTLY_AUTHORED", reservedEvaluationUsed: false,
  matchedRealizedCompute: pairs.every(p => p.matchedRealizedInferenceAndToolCompute), broadPromotion: false,
  integrationTraceComplete: integration.length === campaign.runs.filter(r => r.attempts.length && ["CURRENT_NYX", "CANDIDATE_NYX"].includes(r.arm)).length,
  verdict: "REVIEW_REQUIRED_NO_AUTOMATIC_PROMOTION", grantsAuthority: false};
await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-public-witness-${candidate}.json`), JSON.stringify(report, null, 2));
console.log(`NYX_PUBLIC_WITNESS_CYCLE ${JSON.stringify(report)}`);
if (!sourceUnchanged || !report.integrationTraceComplete || integration.some(t => !t.sourceUnchanged || !t.cleanupVerified)) process.exitCode = 1;
// Exactly one cycle. Provider/model failures remain observations; no unbounded rerun.
