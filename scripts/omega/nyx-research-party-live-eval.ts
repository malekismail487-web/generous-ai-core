import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runFlatTheoryBaseline } from "../../src/lib/codelab/research/flatTheoryBaseline";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { NyxNemotronTheoryCognition } from "../../src/lib/codelab/research/nyxNemotronTheoryCognition";
import { OmegaResearchExperimentRunner } from "../../src/lib/codelab/research/omegaResearchExperimentRunner";
import { assureResearchParty } from "../../src/lib/codelab/research/researchPartyAssurance";
import type { ResearchPartyLimits, ResearchPartyObjective } from "../../src/lib/codelab/research/researchPartyContracts";
import { TheoryNetwork } from "../../src/lib/codelab/research/theoryNetwork";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { TheoryResearchParty } from "../../src/lib/codelab/research/theoryResearchParty";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition,
  type R3BExecutionRequest } from "../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NYX_RESEARCH_PARTY_LIVE_TASKS, type NyxResearchPartyLiveTask } from "./nyx-research-party-fixtures";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_RESEARCH_PARTY_LIVE result=BLOCKED reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}
if (!process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_RESEARCH_PARTY_LIVE result=BLOCKED reason=repository_secret_not_injected");
  process.exit(2);
}

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const limits: ResearchPartyLimits = Object.freeze({ maxEntities: 8, maxModelCalls: 11, maxExperiments: 3,
  maxEvidenceItems: 128, maxWallClockMs: 15 * 60_000, maxPromptBytesPerCall: 64_000,
  maxOutputTokensPerCall: 768, maxTotalOutputTokens: 8_448, maxCostUnits: 10 });
const provider = NvidiaNimProvider.create({ providerId: "NYX-RESEARCH-PARTY-LIVE-NEMOTRON", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 96_000, maxOutputTokens: 1_024, timeoutMs: 90_000 });
const cognition = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-RESEARCH-PARTY-LIVE-COGNITION", provider, limits });
const parent = await mkdtemp(join(tmpdir(), "nyx-research-party-live-"));

function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}

function proposal(repositoryRoot: string, taskId: string, change: R2GProposedChange): R2GPatchProposal {
  const base = { schemaVersion: 1 as const, proposalId: `${taskId}-PROPOSAL`, requestId: `${taskId}-PROPOSAL-REQUEST`,
    repositoryRoot, baseCandidateCommit: CANDIDATE, changes: Object.freeze([change]), applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: hash(canonical(base)) });
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, taskId: string, observedAt: number): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `${taskId}-PROVISION`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${taskId.toLowerCase()}`,
    repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: observedAt, expiresAtEpochMs: observedAt + 14 * 60_000,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

async function createOmegaExperimentRunner(task: NyxResearchPartyLiveTask, objective: ResearchPartyObjective) {
  const taskRoot = join(parent, task.taskId.toLowerCase());
  const sourceRoot = join(taskRoot, "source");
  const sandboxRoot = join(taskRoot, "sandboxes");
  await mkdir(join(sourceRoot, "src"), { recursive: true });
  await mkdir(join(sourceRoot, "tools"), { recursive: true });
  await mkdir(sandboxRoot, { recursive: true });
  const markerBefore = "research-fixture:source-baseline\n";
  const markerAfter = "research-fixture:isolated-candidate\n";
  await writeFile(join(sourceRoot, "src", "marker.txt"), markerBefore, "utf8");
  const outcomeByTool = Object.fromEntries(objective.experimentCatalog.map((experiment) =>
    [experiment.toolId, task.outcome(experiment.experimentId)]));
  const probeSource = [
    "const outcomes = Object.freeze(" + JSON.stringify(outcomeByTool) + ");",
    "const toolId = process.argv[2];",
    "if (!Object.prototype.hasOwnProperty.call(outcomes, toolId)) process.exit(3);",
    "console.log(outcomes[toolId]);",
    "",
  ].join("\n");
  await writeFile(join(sourceRoot, "tools", "probe.mjs"), probeSource, "utf8");
  const sourceDigestBefore = theoryDigest({ markerBefore, probeSource });
  const observedAt = Date.now();
  const sourceExecutor = await ReadOnlyRepositoryExecutor.create({ executorId: `${task.taskId}-R1`,
    tokenId: `${task.taskId}-R1-TOKEN`, repositoryRoot: sourceRoot, resourceScopes: ["."],
    issuedAtEpochMs: observedAt - 1_000, expiresAtEpochMs: observedAt + 15 * 60_000,
    constraints: { maxFileBytes: 100_000, maxDirectoryEntries: 100, allowedExtensions: [".txt", ".mjs"] },
    issuer: "OMEGA-RESEARCH-HOLDOUT", auditIdentity: `${task.taskId}-R1-AUDIT` });
  const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `${task.taskId}-R2A`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "nyx-research-party-live/1",
    environmentIdentity: `github-${process.platform}-${process.arch}`, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: sourceRoot, approvedSandboxRoot: sandboxRoot,
    capability: { capabilityId: `${task.taskId}-R2A-CAP`, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity: `${task.taskId}-R2A-AUDIT`, issuedAtEpochMs: observedAt - 1_000,
      expiresAtEpochMs: observedAt + 15 * 60_000 } };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, observedAt);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, task.taskId, observedAt), observedAt);
  if (!provisioned.sandbox) throw new Error(`research_sandbox_provision_failed:${provisioned.reason}`);
  const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
  await cp(sourceRoot, cloneRoot, { recursive: true, errorOnExist: true, force: false });
  const change: R2GProposedChange = { kind: "MODIFY", relativePath: "src/marker.txt",
    expectedBaseHash: hash(markerBefore), proposedContentHash: hash(markerAfter), proposedContent: markerAfter,
    baselineEvidenceId: `${task.taskId}-BASELINE-EVIDENCE`, baselineObservationId: `${task.taskId}-BASELINE-OBSERVATION`,
    sandboxArtifactId: `${task.taskId}-SANDBOX-ARTIFACT` };
  const patch = proposal(sourceRoot, task.taskId, change);
  const applicator = await R3ADisposablePatchApplicator.create({ executorId: `${task.taskId}-R3A`,
    candidateCommit: CANDIDATE, evaluatorVersion: "nyx-research-party-live/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    sourceRepositoryRoot: sourceRoot, sourceRepositoryExecutor: sourceExecutor, disposableRepositoryRoot: cloneRoot,
    sandbox: provisioned.sandbox, lifecycle, proposal: patch,
    capability: { capabilityId: `${task.taskId}-R3A-CAP`, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity: `${task.taskId}-R3A-AUDIT`, issuedAtEpochMs: observedAt - 1_000,
      expiresAtEpochMs: observedAt + 15 * 60_000 }, allowedExtensions: [".txt", ".mjs"],
    maxChanges: 1, maxPatchBytes: 10_000 });
  const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `${task.taskId}-R3A-REQUEST`,
    applicationId: `${task.taskId}-R3A-APPLICATION`, proposalId: patch.proposalId, proposalDigest: patch.proposalDigest,
    disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
    capabilityId: `${task.taskId}-R3A-CAP`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
    issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY", auditIdentity: `${task.taskId}-R3A-AUDIT`,
    observedAtEpochMs: observedAt + 1_000 };
  const application = await applicator.apply(applyRequest);
  if (application.decision !== "APPLIED") throw new Error(`research_candidate_apply_failed:${application.reason}`);
  const entrypoint = "tools/probe.mjs";
  const entrypointDigest = hash(await readFile(join(cloneRoot, entrypoint)));
  const definitions: R3BEngineeringToolDefinition[] = objective.experimentCatalog.map((experiment) => ({
    toolId: experiment.toolId, toolKind: "TEST", toolVersion: "nyx-research-probe/1", entrypoint,
    expectedEntrypointSha256: entrypointDigest, arguments: [experiment.toolId], workingDirectory: ".",
    timeoutMs: 5_000, maxOutputBytes: 1_024, allowedMutationPrefixes: [], allowChildProcesses: false }));
  const executor = await R3BControlledEngineeringExecutor.create({ executorId: `${task.taskId}-R3B`,
    candidateCommit: CANDIDATE, evaluatorVersion: "nyx-research-party-live/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    disposableRepositoryRoot: cloneRoot, disposableRepositoryId: application.disposableRepositoryId,
    applicator, appliedCandidate: application,
    capability: { capabilityId: `${task.taskId}-R3B-CAP`, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity: `${task.taskId}-R3B-AUDIT`, issuedAtEpochMs: observedAt - 1_000,
      expiresAtEpochMs: observedAt + 15 * 60_000 }, tools: definitions,
    maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 10_000, maxOutputBytes: 10_000 });
  const bindings = objective.experimentCatalog.map((experiment, index) => {
    const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `${task.taskId}-R3B-REQUEST-${index}`,
      executionId: `${task.taskId}-R3B-EXECUTION-${index}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL",
      toolId: experiment.toolId, disposableRepositoryId: application.disposableRepositoryId,
      applicationId: application.applicationId, proposalDigest: application.proposalDigest,
      capabilityId: `${task.taskId}-R3B-CAP`, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity: `${task.taskId}-R3B-AUDIT`, environmentIdentity: lifecycleConfig.environmentIdentity,
      observedAtEpochMs: observedAt + 2_000 + index };
    return { experimentId: experiment.experimentId, verification: { toolId: experiment.toolId, executor, request },
      outcomeByOutputDigest: Object.fromEntries(experiment.possibleOutcomes.map((outcome) => [hash(outcome), outcome])) };
  });
  return { runner: OmegaResearchExperimentRunner.create(bindings), sourceRoot, sourceDigestBefore,
    sourceUnchanged: async () => theoryDigest({ markerBefore: await readFile(join(sourceRoot, "src", "marker.txt"), "utf8"),
      probeSource: await readFile(join(sourceRoot, "tools", "probe.mjs"), "utf8") }) === sourceDigestBefore };
}

const taskResults: Record<string, unknown>[] = [];
let partyAccepted = 0;
let baselineCorrect = 0;
let falseAcceptances = 0;
let sourceMutationFailures = 0;
let authorityFailures = 0;
let providerFailures = 0;
try {
  for (const [index, task] of NYX_RESEARCH_PARTY_LIVE_TASKS.entries()) {
    const objective = task.objective(CANDIDATE, Date.now());
    const networkCoordinator = {};
    const network = TheoryNetwork.create({ namespace: `nyx-live-party-${index}`, addressCapacity: "1000000000000",
      maxAssignedPairs: 100, maxConcurrentActivations: 8, maxTotalActivations: 100,
      maxEvents: 1_000, maxPredictionsPerTheory: 64, maxObservationsPerTheory: 128,
      maxRelations: 1_000, maxFanout: 16, maxMessages: 1_000, activationLifetimeMs: 10 * 60_000,
      now: () => Date.now() }, networkCoordinator);
    const omega = await createOmegaExperimentRunner(task, objective);
    const party = TheoryResearchParty.create({ partyId: `${task.taskId}-PARTY`, network,
      coordinator: networkCoordinator, cognition, experiments: omega.runner, limits, investigatorCount: 3,
      now: () => Date.now() });
    let partyResult;
    let flatResult;
    // Alternate order to reduce systematic provider-order advantage.
    if (index % 2 === 0) {
      partyResult = await party.investigate(objective);
      flatResult = await runFlatTheoryBaseline({ baselineId: `${task.taskId}-FLAT`, cognition, objective, limits,
        now: () => Date.now() });
    } else {
      flatResult = await runFlatTheoryBaseline({ baselineId: `${task.taskId}-FLAT`, cognition, objective, limits,
        now: () => Date.now() });
      partyResult = await party.investigate(objective);
    }
    const assurance = assureResearchParty({ objective, limits, result: partyResult,
      groundTruth: { taskId: task.taskId, expectedMechanismId: task.expectedMechanismId,
        oracleDigest: task.oracleDigest, oracleProvenanceRoot: task.oracleProvenanceRoot, hiddenFromCognition: true } });
    const sourceUnchanged = await omega.sourceUnchanged();
    const flatCorrect = flatResult.selectedMechanismId === task.expectedMechanismId;
    if (assurance.decision === "ACCEPT") partyAccepted += 1;
    if (flatCorrect) baselineCorrect += 1;
    if (assurance.decision === "ACCEPT" && partyResult.decision.selectedMechanismId !== task.expectedMechanismId) falseAcceptances += 1;
    if (!sourceUnchanged) sourceMutationFailures += 1;
    if (partyResult.authorityGranted || flatResult.authorityGranted) authorityFailures += 1;
    providerFailures += [...partyResult.cognitionEvidence, ...flatResult.cognitionEvidence]
      .filter((item) => item.statusCode !== 200).length;
    taskResults.push({ taskId: task.taskId, executionOrder: index % 2 === 0 ? "PARTY_THEN_FLAT" : "FLAT_THEN_PARTY",
      expectedMechanismDigest: theoryDigest(task.expectedMechanismId),
      party: { assuranceDecision: assurance.decision, decision: partyResult.decision.state,
        selectedMechanismDigest: partyResult.decision.selectedMechanismId ? theoryDigest(partyResult.decision.selectedMechanismId) : null,
        modelCalls: partyResult.resourceUsage.modelCalls, experiments: partyResult.resourceUsage.experiments,
        totalTokens: partyResult.resourceUsage.totalTokens, evidenceChainComplete: partyResult.evidenceChainComplete,
        actualReasoningEngine: partyResult.actualReasoningEngine, providerEvidenceClasses: [...new Set(partyResult.cognitionEvidence.map((item) => item.evidenceClass))],
        addressability: partyResult.addressability, authorityGranted: partyResult.authorityGranted,
        findings: assurance.findings },
      flat: { decision: flatResult.decision,
        selectedMechanismDigest: flatResult.selectedMechanismId ? theoryDigest(flatResult.selectedMechanismId) : null,
        correct: flatCorrect, modelCalls: flatResult.resourceUsage.modelCalls, totalTokens: flatResult.resourceUsage.totalTokens,
        authorityGranted: flatResult.authorityGranted }, sourceRepositoryUnchanged: sourceUnchanged });
  }
  const report = { schemaVersion: 1, chunkId: "NYX-RESEARCH-TISSUE-LIVE-001", candidateCommit: CANDIDATE,
    model: MODEL, evidence: { liveCognition: "E4", omegaExperiments: "E3", hiddenOracle: "E3",
      modelClaims: "E1", independentInstitutionalReplication: false }, matchedLimits: limits,
    aggregate: { tasks: NYX_RESEARCH_PARTY_LIVE_TASKS.length, partyAccepted, baselineCorrect,
      partyGain: partyAccepted - baselineCorrect, falseAcceptances, sourceMutationFailures,
      authorityFailures, providerFailures, broadGeneralizationEstablished: false,
      institutionalScientificCapabilityEstablished: false }, taskResults };
  const reportRoot = process.env.RUNNER_TEMP?.trim() || tmpdir();
  const reportPath = join(reportRoot, `nyx-research-party-live-${CANDIDATE.slice(0, 12)}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`NYX_RESEARCH_PARTY_LIVE_REPORT ${JSON.stringify(report)}`);
  if (partyAccepted < 2 || partyAccepted < baselineCorrect || falseAcceptances !== 0
    || sourceMutationFailures !== 0 || authorityFailures !== 0) process.exitCode = 1;
} finally {
  await rm(parent, { recursive: true, force: true });
}
