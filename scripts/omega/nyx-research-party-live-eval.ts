import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runFlatTheoryBaseline } from "../../src/lib/codelab/research/flatTheoryBaseline";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { NYX_BOUNDED_OUTPUT_INSTRUCTION, NYX_DERIVATION_CHECK_INSTRUCTION, NyxNemotronTheoryCognition } from "../../src/lib/codelab/research/nyxNemotronTheoryCognition";
import { analyzeCoverageTransfer, type CoverageTransferArm } from "../../src/lib/codelab/research/coverageTransferAnalysis";
import { OmegaResearchExperimentRunner } from "../../src/lib/codelab/research/omegaResearchExperimentRunner";
import { assureResearchParty } from "../../src/lib/codelab/research/researchPartyAssurance";
import type { HypothesisAllocationPolicy, ResearchPartyLimits, ResearchPartyObjective }
  from "../../src/lib/codelab/research/researchPartyContracts";
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
import { NYX_RESEARCH_TRANSFER_TASKS } from "./nyx-research-transfer-fixtures";
import { NYX_HYPOTHESIS_COVERAGE_TASKS } from "./nyx-hypothesis-coverage-fixtures";
import { NYX_COVERAGE_TRANSFER_TASKS } from "./nyx-coverage-transfer-fixtures";
import { NYX_COVERAGE_TRANSFER_V2_TASKS } from "./nyx-coverage-transfer-v2-fixtures";
import { NYX_COVERAGE_TRANSFER_V3_TASKS } from "./nyx-coverage-transfer-v3-fixtures";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_RESEARCH_PARTY_LIVE result=BLOCKED reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}
if (!process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_RESEARCH_PARTY_LIVE result=BLOCKED reason=repository_secret_not_injected");
  process.exit(2);
}

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const diagnosticOnly = process.env.OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY === "1";
const policyComparison = process.env.OMEGA_NYX_RESEARCH_POLICY_COMPARISON === "1";
const allocationComparison = process.env.OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON === "1";
const maxParallelModelExecutions = Number(process.env.OMEGA_NYX_RESEARCH_MODEL_CONCURRENCY || "3");
if (![1, 2, 3].includes(maxParallelModelExecutions)) throw new Error("research_model_concurrency_invalid");
const corpus = process.env.OMEGA_NYX_RESEARCH_CORPUS || "LEGACY";
const boundedOutput = ["COVERAGE_TRANSFER_V2", "COVERAGE_TRANSFER_V3"].includes(corpus);
// Provider-documented reservation, not an increase in total completion compute.
// See https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer
// Freeze before inference; never tune it against an individual task's oracle.
const reasoningBudgetTokens = boundedOutput ? 256 : undefined;
const derivationTransfer = corpus === "COVERAGE_TRANSFER_V1" || boundedOutput;
if (!["LEGACY", "EXECUTABLE_TRANSFER_V1", "HYPOTHESIS_COVERAGE_DEVELOPMENT_V1", "COVERAGE_TRANSFER_V1", "COVERAGE_TRANSFER_V2", "COVERAGE_TRANSFER_V3"].includes(corpus)
  || (corpus !== "LEGACY" && (!policyComparison || diagnosticOnly))) throw new Error("research_corpus_selection_invalid");
if (allocationComparison !== (corpus === "HYPOTHESIS_COVERAGE_DEVELOPMENT_V1" || derivationTransfer)
  || (allocationComparison && (!policyComparison || diagnosticOnly))) {
  throw new Error("research_allocation_comparison_selection_invalid");
}
if (process.env.OMEGA_NYX_RESEARCH_COMPARE_TASKS !== undefined
  && !["1", "3"].includes(process.env.OMEGA_NYX_RESEARCH_COMPARE_TASKS)) throw new Error("research_task_count_selection_invalid");
const focusedTaskId = process.env.OMEGA_NYX_RESEARCH_COMPARE_TASK_ID?.trim() || null;
if (focusedTaskId && (!policyComparison || diagnosticOnly || corpus !== "EXECUTABLE_TRANSFER_V1"
  || !NYX_RESEARCH_TRANSFER_TASKS.some(task => task.taskId === focusedTaskId))) {
  throw new Error("research_focused_task_selection_invalid");
}
// Resume only an unexecuted arm without rerunning completed stochastic samples.
// This is not a paired comparison and cannot promote a policy.
const focusedPolicy = process.env.OMEGA_NYX_RESEARCH_COMPARE_POLICY?.trim() || null;
if (focusedPolicy && (!focusedTaskId || !["REVISE_AFTER_OBSERVATION", "EXHAUST_PRECOMMITTED_FORECASTS"].includes(focusedPolicy))) {
  throw new Error("research_focused_policy_selection_invalid");
}
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const limits: ResearchPartyLimits = Object.freeze({ maxEntities: 8, maxModelCalls: 11, maxExperiments: 3,
  maxEvidenceItems: 128, maxWallClockMs: 15 * 60_000, maxPromptBytesPerCall: 64_000,
  maxOutputTokensPerCall: 1_536, maxTotalOutputTokens: 16_896, maxCostUnits: 10 });
const provider = NvidiaNimProvider.create({ providerId: "NYX-RESEARCH-PARTY-LIVE-NEMOTRON", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 96_000, maxOutputTokens: 1_536, timeoutMs: 90_000 });
const cognition = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-RESEARCH-PARTY-LIVE-COGNITION", provider, limits,
  ...(derivationTransfer ? { derivationChecks: true } : {}),
  ...(boundedOutput ? { boundedOutput: true, reasoningBudgetTokens } : {}) });
if (diagnosticOnly) {
  const started = Date.now(); const deadline = started + 10 * 60_000;
  const observations: Record<string, unknown>[] = [];
  const sourceBefore = execFileSync("git", ["status", "--porcelain=v1"], {encoding:"utf8"});
  if (sourceBefore.trim()) throw new Error("clean_diagnostic_checkout_required");
  for (const [at, task] of NYX_RESEARCH_PARTY_LIVE_TASKS.entries()) {
    const budgets = at % 2 === 0 ? [768,1536] : [1536,768];
    for (const maxOutputTokens of budgets) {
      if (Date.now() >= deadline) throw new Error("diagnostic_wall_clock_budget_exhausted");
      const observedAt = Date.now(); const objective = task.objective(CANDIDATE, observedAt);
      const probeLimits = {...limits,maxOutputTokensPerCall:maxOutputTokens,maxTotalOutputTokens:maxOutputTokens*limits.maxModelCalls};
      const probe = NyxNemotronTheoryCognition.create({cognitionId:"NYX-RESEARCH-OUTPUT-BUDGET-DIAGNOSTIC",provider,limits:probeLimits});
      const result = await probe.think({schemaVersion:1,requestId:`DIAGNOSTIC-${task.taskId}-${maxOutputTokens}`,
        role:"INVESTIGATOR",theoryId:`DIAGNOSTIC:${task.taskId}`,guardianId:`GUARDIAN:${task.taskId}`,
        objective,privatePriorContributions:[],peerContributions:[],experimentObservations:[],predictionFeedback:[],
        instruction:"Independently select the most likely causal mechanism and predict every catalogued experiment. This flat baseline receives no peer discussion or experimental feedback.",
        maxOutputTokens,observedAtEpochMs:observedAt,deadlineEpochMs:Math.min(deadline,objective.expiryEpochMs)});
      const record = {taskId:task.taskId,maxOutputTokens,decision:result.decision,reason:result.reason,
        diagnostics:result.diagnostics,intentDecision:result.intent?.decision??null,
        intentDigest:result.intent?theoryDigest(result.intent):null,evidence:result.evidence,
        elapsedMs:Date.now()-observedAt,grantsAuthority:false};
      observations.push(record); console.log(`NYX_RESEARCH_OUTPUT_DIAGNOSTIC ${JSON.stringify(record)}`);
    }
  }
  if (execFileSync("git", ["status", "--porcelain=v1"], {encoding:"utf8"}) !== sourceBefore) throw new Error("diagnostic_source_changed");
  const report = {schemaVersion:1,chunkId:"NYX-RESEARCH-OUTPUT-DIAGNOSTIC-001",candidate:CANDIDATE,model:MODEL,
    observations,maximumModelCalls:6,sourceRepositoryUnchanged:true,rawReasoningPersisted:false,
    authorityIncrease:false,capabilityPromotion:false,
    scope:"OUTPUT_BUDGET_DIAGNOSIS_NOT_COMPUTE_MATCHED_CAPABILITY_IMPROVEMENT",startedAtEpochMs:started,finishedAtEpochMs:Date.now()};
  await writeFile(join(process.env.RUNNER_TEMP?.trim()||tmpdir(),`nyx-research-party-live-diagnostic-${CANDIDATE.slice(0,12)}.json`),
    `${JSON.stringify(report,null,2)}\n`,{encoding:"utf8",mode:0o600});
  console.log(`NYX_RESEARCH_OUTPUT_DIAGNOSTIC_REPORT ${JSON.stringify(report)}`);
  process.exit(0); // Diagnostic completion is not hypothesis support or successful research.
}
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

async function createOmegaExperimentRunner(task: NyxResearchPartyLiveTask, objective: ResearchPartyObjective,
  variant = "") {
  const taskRoot = join(parent, `${task.taskId.toLowerCase()}${variant ? `-${variant}` : ""}`);
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
  const probeSource = task.probeSource ?? [
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
  const bindings = await Promise.all(objective.experimentCatalog.map(async (experiment, index) => {
    const capabilityId = `${task.taskId}-R3B-CAP-${index}`;
    const auditIdentity = `${task.taskId}-R3B-AUDIT-${index}`;
    // One authorized probe owns one single-use executor; never reset its guard.
    const executor = await R3BControlledEngineeringExecutor.create({ executorId: `${task.taskId}-R3B-${index}`,
    candidateCommit: CANDIDATE, evaluatorVersion: "nyx-research-party-live/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    disposableRepositoryRoot: cloneRoot, disposableRepositoryId: application.disposableRepositoryId,
    applicator, appliedCandidate: application,
    capability: { capabilityId, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity, issuedAtEpochMs: observedAt - 1_000,
      expiresAtEpochMs: observedAt + 15 * 60_000 }, tools: [definitions[index]],
    maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 10_000, maxOutputBytes: 10_000 });
    const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `${task.taskId}-R3B-REQUEST-${index}`,
      executionId: `${task.taskId}-R3B-EXECUTION-${index}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL",
      toolId: experiment.toolId, disposableRepositoryId: application.disposableRepositoryId,
      applicationId: application.applicationId, proposalDigest: application.proposalDigest,
      capabilityId, issuer: "OMEGA-ISOLATED-EVALUATION-AUTHORITY",
      auditIdentity, environmentIdentity: lifecycleConfig.environmentIdentity,
      observedAtEpochMs: observedAt + 2_000 + index };
    return { experimentId: experiment.experimentId, verification: { toolId: experiment.toolId, executor, request },
      outcomeByOutputDigest: Object.fromEntries(experiment.possibleOutcomes.map((outcome) => [hash(outcome), outcome])) };
  }));
  return { runner: OmegaResearchExperimentRunner.create(bindings), sourceRoot, sourceDigestBefore,
    sourceUnchanged: async () => theoryDigest({ markerBefore: await readFile(join(sourceRoot, "src", "marker.txt"), "utf8"),
      probeSource: await readFile(join(sourceRoot, "tools", "probe.mjs"), "utf8") }) === sourceDigestBefore };
}

async function createParty(task: NyxResearchPartyLiveTask, objective: ResearchPartyObjective,
  identity: string, experimentPolicy?: "REVISE_AFTER_OBSERVATION" | "EXHAUST_PRECOMMITTED_FORECASTS",
  hypothesisAllocationPolicy?: HypothesisAllocationPolicy) {
  const coordinator = {};
  const network = TheoryNetwork.create({ namespace: `nyx-live-party-${identity}`, addressCapacity: "1000000000000",
    maxAssignedPairs: 100, maxConcurrentActivations: 8, maxTotalActivations: 100,
    maxEvents: 1_000, maxPredictionsPerTheory: 64, maxObservationsPerTheory: 128,
    maxRelations: 1_000, maxFanout: 16, maxMessages: 1_000, activationLifetimeMs: 10 * 60_000,
    now: () => Date.now() }, coordinator);
  const omega = await createOmegaExperimentRunner(task, objective, identity);
  const party = TheoryResearchParty.create({ partyId: `${task.taskId}-PARTY-${identity}`, network,
    coordinator, cognition, experiments: omega.runner, limits, investigatorCount: 3,
    now: () => Date.now(), experimentPolicy, maxParallelModelExecutions, hypothesisAllocationPolicy,
    ...(boundedOutput ? { stopOnProviderFailure: true } : {}) });
  return { party, omega };
}

if (policyComparison) {
  // One task is the default live commissioning bound; three requires explicit selection.
  const corpusTasks = corpus === "LEGACY" ? NYX_RESEARCH_PARTY_LIVE_TASKS
    : corpus === "COVERAGE_TRANSFER_V3" ? NYX_COVERAGE_TRANSFER_V3_TASKS
    : boundedOutput ? NYX_COVERAGE_TRANSFER_V2_TASKS : derivationTransfer ? NYX_COVERAGE_TRANSFER_TASKS
    : allocationComparison ? NYX_HYPOTHESIS_COVERAGE_TASKS : NYX_RESEARCH_TRANSFER_TASKS;
  const tasks = focusedTaskId ? corpusTasks.filter(task => task.taskId === focusedTaskId)
    : corpusTasks.slice(0, process.env.OMEGA_NYX_RESEARCH_COMPARE_TASKS === "3" ? 3 : 1);
  const records: Record<string, unknown>[] = [];
  let providerBlocked = false;
  let acceptanceViolations = 0;
  try {
    for (const [index, task] of tasks.entries()) {
      const orderedArms = derivationTransfer
        ? (index % 2 === 0 ? ["DERIVATION_ONLY", "ROTATING_PARTITION"] as const
          : ["ROTATING_PARTITION", "DERIVATION_ONLY"] as const)
        : allocationComparison
        ? (index % 2 === 0 ? ["INDEPENDENT", "ROTATING_PARTITION", "COVERAGE_AWARE"] as const
          : ["COVERAGE_AWARE", "ROTATING_PARTITION", "INDEPENDENT"] as const)
        : (index % 2 === 0 ? ["REVISE_AFTER_OBSERVATION", "EXHAUST_PRECOMMITTED_FORECASTS"] as const
          : ["EXHAUST_PRECOMMITTED_FORECASTS", "REVISE_AFTER_OBSERVATION"] as const);
      const arms = focusedPolicy ? orderedArms.filter(policy => policy === focusedPolicy) : orderedArms;
      for (const [position, policy] of arms.entries()) {
        // Each arm receives a fresh, equal lifetime; earlier provider waits must
        // not consume the second arm's authority or objective validity window.
        const objective = task.objective(CANDIDATE, Date.now());
        const { party, omega } = await createParty(task, objective, `${index}-${position}`,
          allocationComparison ? "EXHAUST_PRECOMMITTED_FORECASTS"
            : policy as "REVISE_AFTER_OBSERVATION" | "EXHAUST_PRECOMMITTED_FORECASTS",
          policy === "ROTATING_PARTITION" || policy === "COVERAGE_AWARE" ? policy : undefined);
        const result = await party.investigate(objective);
        const assurance = assureResearchParty({ objective, limits, result,
          groundTruth: { taskId: task.taskId, expectedMechanismId: task.expectedMechanismId,
            oracleDigest: task.oracleDigest, oracleProvenanceRoot: task.oracleProvenanceRoot, hiddenFromCognition: true } });
        const sourceUnchanged = await omega.sourceUnchanged();
        const failures = result.cognitionOutcomes?.filter(item => item.outcomeClass === "PROVIDER_FAILURE").length ?? 0;
        if (failures) providerBlocked = true;
        if (!sourceUnchanged || result.authorityGranted || (assurance.decision === "ACCEPT"
          && result.decision.selectedMechanismId !== task.expectedMechanismId)) acceptanceViolations += 1;
        records.push({ taskId: task.taskId, policy, assurance, decision: result.decision,
          resourceUsage: result.resourceUsage, providerFailures: failures,
          peakParallelModelExecutions: result.addressability.simultaneousModelExecutions,
          cognitionOutcomes: result.cognitionOutcomes,
          cognitionOutcomeCounts: Object.fromEntries(["CONTRIBUTION", "PROVIDER_FAILURE", "INTEGRATION_REJECTION",
            "OUTPUT_TRUNCATION", "MODEL_OUTPUT_REJECTION", "UNKNOWN_FAILURE"].map(outcomeClass =>
              [outcomeClass, result.cognitionOutcomes?.filter(item => item.outcomeClass === outcomeClass).length ?? 0])),
          transport: { telemetryComplete: result.cognitionEvidence.every(item => item.delivery != null),
            httpAttempts: result.cognitionEvidence.reduce((sum, item) => sum + (item.delivery?.httpAttempts ?? 0), 0),
            transientResponses: result.cognitionEvidence.reduce((sum, item) => sum + (item.delivery?.transientUnavailableResponses ?? 0), 0),
            rateLimitedResponses: result.cognitionEvidence.reduce((sum, item) => sum + (item.delivery?.rateLimitedResponses ?? 0), 0),
            timedOutAttempts: result.cognitionEvidence.reduce((sum, item) => sum + (item.delivery?.timedOutAttempts ?? 0), 0),
            capacityWaitMs: result.cognitionEvidence.reduce((sum, item) => sum + (item.delivery?.capacityWaitMs ?? 0), 0) },
          cognitionEvidence: result.cognitionEvidence, evidenceChainComplete: result.evidenceChainComplete,
          forecastAudit: result.contributions.filter(item => item.intent.mechanismId !== null).map(item => ({
            contributionId: item.contributionId, contributionDigest: item.contributionDigest, theoryId: item.theoryId,
            role: item.role, mechanismId: item.intent.mechanismId, evidenceRefs: item.intent.evidenceRefs,
            forecasts: item.intent.forecasts.map(forecast => {
              const observation = result.observations.find(observed => observed.experimentId === forecast.experimentId);
              return { experimentId: forecast.experimentId, expectedOutcome: forecast.expectedOutcome,
                observationId: observation?.observationId ?? null, evidenceId: observation?.evidence.evidenceId ?? null,
                observedOutcome: observation?.outcome ?? null,
                disposition: !observation ? "NOT_OBSERVED" : observation.outcome === forecast.expectedOutcome
                  ? "MATCHED_PRECOMMITMENT" : "FALSIFIED_PRECOMMITMENT" };
            }), grantsAuthority: false,
          })),
          ...(allocationComparison ? { hypothesisAllocations: result.hypothesisAllocations,
            catalogMechanisms: objective.mechanismCatalog.length,
            initialDistinctMechanisms: new Set(result.contributions.filter(item => item.role === "INVESTIGATOR")
              .map(item => item.intent.mechanismId).filter(Boolean)).size,
            totalDistinctMechanisms: new Set(result.contributions.map(item => item.intent.mechanismId).filter(Boolean)).size,
            predictedExperiments: new Set(result.contributions.flatMap(item => item.intent.forecasts
              .map(forecast => forecast.experimentId))).size } : {}),
          contributionsByRole: Object.fromEntries(["INVESTIGATOR", "FALSIFIER", "REVISER", "META_REVIEWER"]
            .map(role => [role, result.contributions.filter(item => item.role === role).length])),
          sourceRepositoryUnchanged: sourceUnchanged, authorityGranted: result.authorityGranted });
        console.log(`NYX_RESEARCH_POLICY_ARM ${JSON.stringify(records.at(-1))}`);
        // No expensive capability rerun around an unavailable provider.
        if (providerBlocked) break;
      }
      if (providerBlocked) break;
    }
    const executionBlocked = records.some(record =>
      (record.decision as { reason: string }).reason === "research_party_experiment_infrastructure_failure");
    const candidateFailed = records.some(record => record.policy === (derivationTransfer ? "ROTATING_PARTITION"
      : allocationComparison ? "COVERAGE_AWARE" : "EXHAUST_PRECOMMITTED_FORECASTS")
      && (record.assurance as { decision: string }).decision !== "ACCEPT");
    const realizedCompute = tasks.map(task => {
      const arms = records.filter(record => record.taskId === task.taskId);
      const usages = arms.map(record => record.resourceUsage as { modelCalls: number; experiments: number;
        totalTokens: number | null; wallClockMs: number });
      const complete = arms.length === (allocationComparison && !derivationTransfer ? 3 : 2);
      const known = complete && usages.every(usage => usage.totalTokens !== null);
      const tokens = usages.map(usage => usage.totalTokens ?? 0);
      return { taskId: task.taskId, complete,
        modelCallsMatched: complete && new Set(usages.map(usage => usage.modelCalls)).size === 1,
        experimentsMatched: complete && new Set(usages.map(usage => usage.experiments)).size === 1,
        tokenUsageKnown: known, tokenSpreadFraction: known && tokens.length > 0 && Math.max(...tokens) > 0
          ? (Math.max(...tokens) - Math.min(...tokens)) / Math.max(...tokens) : null,
        wallClockSpreadMs: usages.length ? Math.max(...usages.map(usage => usage.wallClockMs))
          - Math.min(...usages.map(usage => usage.wallClockMs)) : null };
    });
    const report = { schemaVersion: 1, chunkId: derivationTransfer ? "NYX-COVERAGE-TRANSFER-LIVE-001"
      : allocationComparison ? "NYX-HYPOTHESIS-COVERAGE-LIVE-001"
      : "NYX-EVIDENCE-FIRST-LIVE-001", candidateCommit: CANDIDATE,
      model: MODEL, corpus, corpusDigest: theoryDigest(tasks.map(task => task.oracleDigest)), matchedLimits: limits,
      comparisonScope: derivationTransfer ? "PAIRED_FRESH_DEVELOPMENT_TRANSFER_IDENTICAL_DERIVATION_GUIDANCE"
        : allocationComparison ? "THREE_ARM_DEVELOPMENT_NOT_HELDOUT_GENERALIZATION"
        : focusedPolicy ? "SINGLE_ARM_CONTINUATION_NOT_PAIRED"
        : focusedTaskId ? "FOCUSED_REGRESSION_ONLY" : "FROZEN_CORPUS_COMPARISON",
      selectedTaskIds: tasks.map(task => task.taskId),
      selectedPolicy: focusedPolicy, requestedArms: tasks.length * (allocationComparison && !derivationTransfer ? 3 : focusedPolicy ? 1 : 2),
      scheduling: { maxParallelModelExecutions, peerViewsFrozenBeforePhase: true, grantsAuthority: false },
      requestedTasks: tasks.length, completedArms: records.length, providerBlocked, executionBlocked, acceptanceViolations,
      evidence: { cognition: "E4", experimentsAndOracle: "E3", independentInstitutionalReplication: false },
      realizedComputeMatched: realizedCompute.every(item => item.complete && item.modelCallsMatched
        && item.experimentsMatched && item.tokenUsageKnown && item.tokenSpreadFraction === 0),
      realizedCompute, broadPromotion: false,
      computeMatchingDefinition: "EQUAL_REPORTED_MODEL_TOKENS_CALL_RESERVATIONS_EXPERIMENT_COUNTS_NOT_GPU_TIME_OR_LATENCY",
      ...(allocationComparison ? { evaluationTier: "DEVELOPMENT", freshHeldoutClaim: false,
        simplerSameBudgetControl: derivationTransfer ? "DERIVATION_ONLY" : "ROTATING_PARTITION", oracleUnchanged: true,
        allocationIsEvidence: false, defaultPolicyChanged: false } : {}),
      ...(derivationTransfer ? { treatmentControls: { identicalDerivationInstruction: true,
        derivationInstructionDigest: theoryDigest(NYX_DERIVATION_CHECK_INSTRUCTION),
        initialPeerVisibility: "NONE", sequencingPolicy: "EXHAUST_PRECOMMITTED_FORECASTS",
        armOrdering: "COUNTERBALANCED_BY_TASK_INDEX", fixedTaskOrder: true,
        extraCallsForAllocation: 0, evaluationPopulation: "THREE_NEW_FINITE_MECHANISM_FAMILIES" },
        emissionPolicy: { boundedOutput, mediumEffort: boundedOutput,
          requestedThinkingBudgetTokens: reasoningBudgetTokens ?? null,
          nominalAnswerReservationTokens: reasoningBudgetTokens === undefined ? null : limits.maxOutputTokensPerCall - reasoningBudgetTokens,
          thinkingBudgetEnforcementMeasured: false,
          instructionDigest: boundedOutput ? theoryDigest(NYX_BOUNDED_OUTPUT_INSTRUCTION) : null,
          hardThinkingTokenLimit: false, outputTokenCeilingChanged: false,
          localParserChanged: true, parserRevision: "PREDICTION_CUSTODY_INTERSECTION_V1",
          providerExhaustionStopsArm: boundedOutput,
          sharedAcrossArms: true, infrastructureNotCapabilityClaim: true },
        pairedAnalysis: analyzeCoverageTransfer(tasks.map(task => task.taskId), records as unknown as CoverageTransferArm[]) } : {}),
      verdict: providerBlocked ? "INCONCLUSIVE_PROVIDER_FAILURE" : executionBlocked ? "INCONCLUSIVE_EXECUTION_FAILURE"
        : candidateFailed ? "EMPIRICALLY_NOT_YET_VERIFIED" : "BOUNDED_LIVE_COMPARISON_ONLY",
      records };
    await writeFile(join(process.env.RUNNER_TEMP?.trim() || tmpdir(),
      `nyx-research-party-live-policy-${CANDIDATE.slice(0, 12)}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`NYX_RESEARCH_POLICY_REPORT ${JSON.stringify(report)}`);
    if (providerBlocked || executionBlocked || acceptanceViolations > 0 || candidateFailed) process.exitCode = 1;
  } finally { await rm(parent, { recursive: true, force: true }); }
} else {
const taskResults: Record<string, unknown>[] = [];
let partyAccepted = 0;
let baselineCorrect = 0;
let falseAcceptances = 0;
let sourceMutationFailures = 0;
let authorityFailures = 0;
let providerFailures = 0;
const providerStatusCounts: Record<string, number> = {};
try {
  for (const [index, task] of NYX_RESEARCH_PARTY_LIVE_TASKS.entries()) {
    const objective = task.objective(CANDIDATE, Date.now());
    const { party, omega } = await createParty(task, objective, String(index));
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
    const cognitionEvidence = [...partyResult.cognitionEvidence, ...flatResult.cognitionEvidence];
    providerFailures += cognitionEvidence.filter((item) => item.evidenceClass === "E4" && item.statusCode !== 200).length;
    for (const item of cognitionEvidence) {
      const key = item.statusCode === null ? "NO_STATUS" : String(item.statusCode);
      providerStatusCounts[key] = (providerStatusCounts[key] ?? 0) + 1;
    }
    taskResults.push({ taskId: task.taskId, executionOrder: index % 2 === 0 ? "PARTY_THEN_FLAT" : "FLAT_THEN_PARTY",
      expectedMechanismDigest: theoryDigest(task.expectedMechanismId),
      party: { assuranceDecision: assurance.decision, decision: partyResult.decision.state,
        decisionReason: partyResult.decision.reason, cognitionEvidence: partyResult.cognitionEvidence,
        selectedMechanismDigest: partyResult.decision.selectedMechanismId ? theoryDigest(partyResult.decision.selectedMechanismId) : null,
        modelCalls: partyResult.resourceUsage.modelCalls, experiments: partyResult.resourceUsage.experiments,
        totalTokens: partyResult.resourceUsage.totalTokens, evidenceChainComplete: partyResult.evidenceChainComplete,
        actualReasoningEngine: partyResult.actualReasoningEngine, providerEvidenceClasses: [...new Set(partyResult.cognitionEvidence.map((item) => item.evidenceClass))],
        addressability: partyResult.addressability, authorityGranted: partyResult.authorityGranted,
        findings: assurance.findings },
      flat: { decision: flatResult.decision,
        decisionReason: flatResult.reason, cognitionEvidence: flatResult.cognitionEvidence,
        selectedMechanismDigest: flatResult.selectedMechanismId ? theoryDigest(flatResult.selectedMechanismId) : null,
        correct: flatCorrect, modelCalls: flatResult.resourceUsage.modelCalls, totalTokens: flatResult.resourceUsage.totalTokens,
        authorityGranted: flatResult.authorityGranted }, sourceRepositoryUnchanged: sourceUnchanged });
  }
  const report = { schemaVersion: 1, chunkId: "NYX-RESEARCH-TISSUE-LIVE-001", candidateCommit: CANDIDATE,
    model: MODEL, evidence: { liveCognition: "E4", omegaExperiments: "E3", hiddenOracle: "E3",
      modelClaims: "E1", independentInstitutionalReplication: false }, matchedLimits: limits,
    aggregate: { tasks: NYX_RESEARCH_PARTY_LIVE_TASKS.length, partyAccepted, baselineCorrect,
      partyGain: partyAccepted - baselineCorrect, falseAcceptances, sourceMutationFailures,
      authorityFailures, providerFailures, providerStatusCounts, broadGeneralizationEstablished: false,
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
}
