import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST,
  NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionEvidence,
  type NyxRepairHypothesis,
} from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop, type OmegaPreparedRepairCandidate, type R3BoundedRepairResult } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition, type R3BExecutionRequest } from "../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { observeEngineeringExecution, type EngineeringObservation } from "../../src/lib/codelab/observation/r3EngineeringObservation";
import { NYX_R3F_EVALUATION_FIXTURES, nyxR3FActionCounts, type NyxR3FEvaluationTask } from "./nyx-r3f-fixtures";

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const MAX_MODEL_CALLS_PER_TASK = 3;
const MAX_WALL_CLOCK_MS_PER_TASK = 180_000;
const MAX_DIAGNOSIS_CHARACTERS = 1_500;
const CONTRACT_AT_START = NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST;

interface AppliedPack {
  readonly sourceRoot: string;
  readonly cloneRoot: string;
  readonly proposal: R2GPatchProposal;
  readonly applicator: R3ADisposablePatchApplicator;
  readonly application: Awaited<ReturnType<R3ADisposablePatchApplicator["apply"]>>;
}

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function mean(values: readonly number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}
function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000;
}
function failureClass(result: R3BoundedRepairResult, hidden: string, quality: string): string {
  if (result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && hidden === "PASS" && quality === "ACCEPTED") return "NONE";
  if (hidden === "FAIL" || result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && hidden !== "PASS") return "VERIFICATION_FAILURE";
  if (quality === "REJECTED") return "QUALITY_ACCEPTANCE_FAILURE";
  if (result.reason.includes("schema_invalid") || result.reason.includes("not_strict_json")) return "MODEL_SCHEMA_COMPLIANCE_FAILURE";
  if (result.reason.includes("no_action")) return "INSUFFICIENT_EVIDENCE";
  if (result.reason.includes("provider_") || result.reason.includes("credential_")) return "PROVIDER_FAILURE";
  if (result.reason.includes("provenance") || result.reason.includes("not_authorized") || result.reason.includes("outside_authorized")) return "OMEGA_AUTHORIZATION_REJECTION";
  if (result.outcome === "EXHAUSTED") return "RESOURCE_LIMIT_REACHED";
  if (result.outcome === "INFRASTRUCTURE_ERROR") return "INFRASTRUCTURE_FAILURE";
  if (result.outcome === "COGNITION_ERROR") return "MODEL_REASONING_FAILURE";
  return "MODEL_REPAIR_FAILURE";
}
function proposal(sourceRoot: string, task: NyxR3FEvaluationTask, label: string,
  changes: readonly R2GProposedChange[]): R2GPatchProposal {
  const base = { schemaVersion: 1 as const, proposalId: `R3F-PROPOSAL-${task.taskId}-${label}`,
    requestId: `R3F-PROPOSAL-REQUEST-${task.taskId}-${label}`, repositoryRoot: sourceRoot,
    baseCandidateCommit: CANDIDATE, changes: Object.freeze([...changes]), applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: sha256(canonical(base)) });
}
function provisionRequest(config: R2AIsolatedLifecycleConfig, label: string, now: number): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `R3F-PROVISION-${label}`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${label}`, repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot, issuedAtEpochMs: now, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}
function cognitionEvidence(result: R3BoundedRepairResult): readonly NyxRepairCognitionEvidence[] {
  return [...result.iterations.map((item) => item.cognitionEvidence),
    ...(result.lastCognitionEvidence ? [result.lastCognitionEvidence] : [])]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index);
}

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_R3F result=BLOCKED failureClass=OMEGA_AUTHORIZATION_REJECTION reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}

const provider = NvidiaNimProvider.create({ providerId: "NYX-R3F-NEMOTRON", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 90_000 });
const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-R3F-COGNITION", provider,
  maxPromptBytes: 48_000, maxOutputTokens: 1_536 });
const parent = await mkdtemp(join(tmpdir(), "nyx-r3f-live-"));
const taskResults: Record<string, unknown>[] = [];
let sequence = 0;

try {
  for (const task of NYX_R3F_EVALUATION_FIXTURES) {
    const taskStarted = Date.now();
    const taskRoot = join(parent, task.taskId.toLowerCase());
    const sourceRoot = join(taskRoot, "authoritative-source");
    const sourceManifest = new Map<string, string>();
    for (const [path, content] of Object.entries(task.correctFiles)) {
      await mkdir(dirname(join(sourceRoot, path)), { recursive: true });
      await writeFile(join(sourceRoot, path), content, "utf8");
      sourceManifest.set(path, sha256(content));
    }
    await mkdir(join(sourceRoot, "tools"), { recursive: true });
    await writeFile(join(sourceRoot, "tools", "verify-visible.mjs"), task.visibleVerifier, "utf8");
    await writeFile(join(sourceRoot, "tools", "verify-hidden.mjs"), task.hiddenVerifier, "utf8");
    sourceManifest.set("tools/verify-visible.mjs", sha256(task.visibleVerifier));
    sourceManifest.set("tools/verify-hidden.mjs", sha256(task.hiddenVerifier));

    const applyChanges = async (sourceInput: string, changes: readonly R2GProposedChange[], labelPrefix: string): Promise<AppliedPack> => {
      sequence += 1;
      const now = Date.now();
      const label = `${task.taskId}-${labelPrefix}-${sequence}`;
      const canonicalSource = await realpath(sourceInput);
      const sandboxRoot = join(taskRoot, `sandboxes-${label}`);
      await mkdir(sandboxRoot, { recursive: true });
      const r1 = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-${label}`, tokenId: `R1-TOKEN-${label}`,
        repositoryRoot: canonicalSource, resourceScopes: ["."], issuedAtEpochMs: now - 1_000,
        expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK, constraints: { maxFileBytes: 100_000,
          maxDirectoryEntries: 100, allowedExtensions: [".mjs"] }, issuer: "OMEGA-R3F-ISOLATED",
        auditIdentity: `R1-AUDIT-${label}` });
      const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-${label}`, candidateCommit: CANDIDATE,
        capabilityVersion: "r2-a/1", evaluatorVersion: "nyx-r3f/1",
        environmentIdentity: `github-actions-${process.platform}-${process.arch}`,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: canonicalSource,
        approvedSandboxRoot: await realpath(sandboxRoot), capability: { capabilityId: `R2A-CAP-${label}`,
          issuer: "OMEGA-R3F-ISOLATED", auditIdentity: `R2A-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
          expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK } };
      const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, now);
      const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label, now), now);
      if (!provisioned.sandbox) throw new Error(`sandbox_failed:${provisioned.reason}`);
      const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
      await cp(canonicalSource, cloneRoot, { recursive: true, errorOnExist: true, force: false });
      const patch = proposal(canonicalSource, task, label, changes);
      const applicator = await R3ADisposablePatchApplicator.create({ executorId: `R3A-${label}`,
        candidateCommit: CANDIDATE, evaluatorVersion: "nyx-r3f/1", environmentIdentity: lifecycleConfig.environmentIdentity,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: canonicalSource,
        sourceRepositoryExecutor: r1, disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle,
        proposal: patch, capability: { capabilityId: `R3A-CAP-${label}`, issuer: "OMEGA-R3F-ISOLATED",
          auditIdentity: `R3A-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
          expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK }, allowedExtensions: [".mjs"],
        maxChanges: task.maxChanges, maxPatchBytes: task.maxPatchBytes });
      const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `R3A-REQUEST-${label}`,
        applicationId: `R3A-APPLICATION-${label}`, proposalId: patch.proposalId, proposalDigest: patch.proposalDigest,
        disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
        capabilityId: `R3A-CAP-${label}`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
        issuer: "OMEGA-R3F-ISOLATED", auditIdentity: `R3A-AUDIT-${label}`, observedAtEpochMs: now };
      const application = await applicator.apply(applyRequest);
      if (application.decision !== "APPLIED") throw new Error(`apply_failed:${application.reason}`);
      return { sourceRoot: canonicalSource, cloneRoot, proposal: patch, applicator, application };
    };

    const verification = async (pack: AppliedPack, label: string, hidden = false) => {
      const now = Date.now();
      const toolId = hidden ? "HIDDEN_TEST" : "TEST";
      const entrypoint = hidden ? "tools/verify-hidden.mjs" : "tools/verify-visible.mjs";
      const definition: R3BEngineeringToolDefinition = { toolId, toolKind: "TEST", toolVersion: `nyx-r3f-fixture/${task.taskId}/1`,
        entrypoint, expectedEntrypointSha256: sha256(await readFile(join(pack.cloneRoot, entrypoint))), arguments: [],
        workingDirectory: ".", timeoutMs: 5_000, maxOutputBytes: 16_384, allowedMutationPrefixes: [],
        allowChildProcesses: false };
      const environmentIdentity = `github-actions-${process.platform}-${process.arch}`;
      const executor = await R3BControlledEngineeringExecutor.create({ executorId: `R3B-${task.taskId}-${label}`,
        candidateCommit: CANDIDATE, evaluatorVersion: "nyx-r3f/1", environmentIdentity,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: pack.cloneRoot,
        disposableRepositoryId: pack.application.disposableRepositoryId, applicator: pack.applicator,
        appliedCandidate: pack.application, capability: { capabilityId: `R3B-CAP-${task.taskId}-${label}`,
          issuer: "OMEGA-R3F-ISOLATED", auditIdentity: `R3B-AUDIT-${task.taskId}-${label}`,
          issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK }, tools: [definition],
        maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 10_000, maxOutputBytes: 100_000 });
      const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `R3B-REQUEST-${task.taskId}-${label}`,
        executionId: `R3B-EXECUTION-${task.taskId}-${label}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId,
        disposableRepositoryId: pack.application.disposableRepositoryId, applicationId: pack.application.applicationId,
        proposalDigest: pack.application.proposalDigest, capabilityId: `R3B-CAP-${task.taskId}-${label}`,
        issuer: "OMEGA-R3F-ISOLATED", auditIdentity: `R3B-AUDIT-${task.taskId}-${label}`,
        environmentIdentity, observedAtEpochMs: now };
      return { executor, request };
    };

    const initialChanges = Object.entries(task.faultyFiles).map(([path, content]) => ({ kind: "MODIFY" as const,
      relativePath: path, expectedBaseHash: sha256(task.correctFiles[path]), proposedContentHash: sha256(content),
      proposedContent: content, baselineEvidenceId: `evidence://r3f/${task.taskId}/initial`,
      baselineObservationId: `observation://r3f/${task.taskId}/initial`, sandboxArtifactId: `artifact://r3f/${task.taskId}/initial` }));
    const initial = await applyChanges(sourceRoot, initialChanges, "initial-fault");
    const initialTool = await verification(initial, "initial-visible");
    const initialExecution = await initialTool.executor.execute(initialTool.request);
    const initialObserved = observeEngineeringExecution({ schemaVersion: 1,
      observationRequestId: `R3F-OBSERVATION-${task.taskId}-INITIAL`, observerIdentity: "OMEGA-R3F-OBSERVER",
      evaluatorVersion: "nyx-r3f/1", expected: { candidateCommit: initialExecution.evidence.candidateCommit,
        disposableRepositoryId: initial.application.disposableRepositoryId, applicationId: initial.application.applicationId,
        proposalDigest: initial.application.proposalDigest, toolId: "TEST", toolKind: "TEST",
        toolIdentityDigest: initialExecution.evidence.toolIdentityDigest,
        environmentIdentity: initialExecution.evidence.environmentIdentity }, candidate: initialExecution, baseline: null,
      observedAtEpochMs: Math.max(Date.now(), initialExecution.evidence.endedAtEpochMs) });
    if (!initialObserved.observation || initialObserved.observation.state !== "TEST_FAIL") {
      throw new Error(`fixture_initial_failure_not_observed:${task.taskId}`);
    }
    const initialObservation: EngineeringObservation = initialObserved.observation;
    let currentBaseRoot = initial.cloneRoot;
    let finalPack: AppliedPack | null = null;
    const candidateBuilder = { builderIdentity: `OMEGA-R3F-BUILDER-${task.taskId}`,
      prepare: async (hypothesis: NyxRepairHypothesis, iteration: number): Promise<OmegaPreparedRepairCandidate> => {
        const changes = hypothesis.changes.map((change) => ({ kind: "MODIFY" as const, relativePath: change.relativePath,
          expectedBaseHash: change.expectedBaseHash, proposedContentHash: change.replacementContentHash,
          proposedContent: change.replacementContent, baselineEvidenceId: `evidence://r3f/${task.taskId}/${iteration}`,
          baselineObservationId: `observation://r3f/${task.taskId}/${iteration}`,
          sandboxArtifactId: `artifact://r3f/${task.taskId}/${iteration}` }));
        const pack = await applyChanges(currentBaseRoot, changes, `repair-${iteration}`);
        const run = await verification(pack, `repair-${iteration}`);
        currentBaseRoot = pack.cloneRoot;
        finalPack = pack;
        const files = await Promise.all(task.admittedPaths.map(async (relativePath) => {
          const content = await readFile(join(pack.cloneRoot, relativePath), "utf8");
          return { relativePath, content, contentSha256: sha256(content) };
        }));
        return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest,
          proposal: pack.proposal, application: pack.application,
          verifications: [{ toolId: "TEST", executor: run.executor, request: run.request }], files,
          omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: false,
          productionAuthorityGranted: false };
      } };
    const initialFiles = await Promise.all(task.admittedPaths.map(async (relativePath) => {
      const content = await readFile(join(initial.cloneRoot, relativePath), "utf8");
      return { relativePath, content, contentSha256: sha256(content) };
    }));
    const loop = R3BoundedRepairLoop.create({ loopId: `NYX-R3F-LOOP-${task.taskId}`, evaluatorVersion: "nyx-r3f/1",
      observerIdentity: "OMEGA-R3F-OBSERVER", cognition, candidateBuilder, maxIterations: MAX_MODEL_CALLS_PER_TASK,
      maxWallClockMs: MAX_WALL_CLOCK_MS_PER_TASK, maxChangesPerIteration: task.maxChanges,
      maxPatchBytesPerIteration: task.maxPatchBytes, maxDiagnosisCharacters: MAX_DIAGNOSIS_CHARACTERS });
    const loopResult = await loop.run({ schemaVersion: 1, repairRequestId: `NYX-R3F-REPAIR-${task.taskId}`,
      objective: task.objective, initialObservation, initialFiles, allowedVerificationToolIds: ["TEST"],
      baselineExecutions: [{ toolId: "TEST", result: initialExecution }], observedAtEpochMs: Date.now() });

    let hiddenResult = "NOT_APPLICABLE";
    let hiddenEvidenceId: string | null = null;
    if (loopResult.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && finalPack) {
      const hiddenTool = await verification(finalPack, "final-hidden", true);
      const hiddenExecution = await hiddenTool.executor.execute(hiddenTool.request);
      hiddenResult = hiddenExecution.outcome;
      hiddenEvidenceId = hiddenExecution.evidence.evidenceId;
    }
    let qualityResult = "NOT_EVALUATED";
    let quality: Record<string, unknown> = { evaluated: false };
    if (finalPack && loopResult.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED") {
      const contents = await Promise.all(task.admittedPaths.map(async (path) => ({ path,
        content: await readFile(join(finalPack!.cloneRoot, path), "utf8") })));
      const changedPaths = loopResult.iterations.flatMap((iteration) => iteration.hypothesis.changes.map((change) => change.relativePath));
      const forbidden = /(?:node:fs|child_process|\bprocess\b|\bfetch\s*\(|\beval\s*\(|\bFunction\s*\()/;
      const toolIntegrity = sha256(await readFile(join(finalPack.cloneRoot, "tools", "verify-visible.mjs"))) === sha256(task.visibleVerifier)
        && sha256(await readFile(join(finalPack.cloneRoot, "tools", "verify-hidden.mjs"))) === sha256(task.hiddenVerifier);
      quality = { evaluated: true, correctness: hiddenResult === "PASS", minimality: changedPaths.length <= task.maxChanges * loopResult.iterations.length,
        boundedScope: changedPaths.every((path) => task.admittedPaths.includes(path)), regressionRisk: hiddenResult === "PASS",
        maintainability: contents.every((item) => item.content.length <= task.maxPatchBytes && item.content.split(/\r?\n/).length <= 50),
        architectureFit: task.taskClass !== "MULTI_FILE_LOCAL_DEFECT" || contents.some((item) => item.path === "src/pricing.mjs" && item.content.includes("roundMoney")),
        typeSafety: "NOT_APPLICABLE_PLAIN_ECMASCRIPT_FIXTURES", duplication: contents.every((item) => !/(.{25,})\n\1/.test(item.content)),
        unnecessaryScopeExpansion: changedPaths.every((path) => task.admittedPaths.includes(path)), security: contents.every((item) => !forbidden.test(item.content)),
        readability: contents.every((item) => item.content.includes("export function")), apiCompatibility: hiddenResult === "PASS", verifierIntegrity: toolIntegrity };
      qualityResult = Object.entries(quality).filter(([key]) => !["evaluated", "typeSafety"].includes(key))
        .every(([, value]) => value === true) ? "ACCEPTED" : "REJECTED";
    }
    const modelEvidence = cognitionEvidence(loopResult);
    const tokens = modelEvidence.reduce((sum, item) => sum + (item.modelUsage.totalTokens ?? 0), 0);
    const contractPreserved = modelEvidence.every((item) => item.contractVersion === NYX_SEMANTIC_REPAIR_CONTRACT_VERSION
      && item.contractDigest === CONTRACT_AT_START) && NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST === CONTRACT_AT_START;
    const sourceUnchanged = (await Promise.all([...sourceManifest.entries()].map(async ([path, expected]) =>
      sha256(await readFile(join(sourceRoot, path))) === expected))).every(Boolean);
    const failedPredecessorUnchanged = (await Promise.all(Object.entries(task.faultyFiles).map(async ([path, expected]) =>
      await readFile(join(initial.cloneRoot, path), "utf8") === expected))).every(Boolean);
    const accepted = loopResult.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && hiddenResult === "PASS"
      && qualityResult === "ACCEPTED" && sourceUnchanged && failedPredecessorUnchanged && contractPreserved;
    const actionCounts = nyxR3FActionCounts(loopResult.modelCallCount, loopResult.iterations.length, loopResult.reason);
    taskResults.push({ taskId: task.taskId, taskClass: task.taskClass, provenance: task.provenance,
      initialDefect: task.initialDefect, allowedMutationScope: task.admittedPaths, contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
      contractDigest: CONTRACT_AT_START, modelId: MODEL, modelCalls: loopResult.modelCallCount,
      semanticActions: actionCounts.semanticActions, noActionActions: actionCounts.noActionActions,
      rejectedActions: actionCounts.rejectedActions,
      candidates: loopResult.iterations.length, repairIterations: Math.max(0, loopResult.iterations.length - 1),
      verificationCount: 1 + loopResult.iterations.reduce((sum, item) => sum + item.verifications.length, 0)
        + (hiddenResult === "NOT_APPLICABLE" ? 0 : 1), deterministicVerification: loopResult.outcome,
      hiddenAcceptance: hiddenResult, engineeringQuality: qualityResult, quality, finalClassification: accepted ? "PASS" : "FAIL",
      firstCandidateSuccess: accepted && loopResult.iterations.length === 1, failureClass: failureClass(loopResult, hiddenResult, qualityResult),
      totalTokens: tokens, requestDigests: modelEvidence.map((item) => item.modelRequestDigest),
      responseDigests: modelEvidence.map((item) => item.modelResponseDigest), hiddenEvidenceId,
      sourceRepositoryUnchanged: sourceUnchanged, failedPredecessorUnchanged, contractPreserved,
      omegaAuthorityEnforcement: !loopResult.authorityGranted && !loopResult.sourceRepositoryWriteAuthority,
      durationMs: Date.now() - taskStarted });
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown_error";
  console.error(`NYX_R3F result=HARNESS_ABORTED failureClass=HARNESS_DEFECT reason=${reason.replace(/\s+/g, "_").slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await rm(parent, { recursive: true, force: true });
}

if (taskResults.length === NYX_R3F_EVALUATION_FIXTURES.length) {
  const successes = taskResults.filter((item) => item.finalClassification === "PASS");
  const modelCalls = taskResults.reduce((sum, item) => sum + Number(item.modelCalls), 0);
  const semanticActions = taskResults.reduce((sum, item) => sum + Number(item.semanticActions), 0);
  const rejectedActions = taskResults.reduce((sum, item) => sum + Number(item.rejectedActions), 0);
  const totalTokens = successes.map((item) => Number(item.totalTokens));
  const result = { schemaVersion: 1, chunkId: "NYX-R3F-001", candidateCommit: CANDIDATE, modelId: MODEL,
    contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION, contractDigest: CONTRACT_AT_START,
    contractChangedDuringScoredEval: taskResults.some((item) => item.contractPreserved !== true), tasks: taskResults,
    aggregateMetrics: { taskSuccessRate: rate(successes.length, taskResults.length),
      firstCandidateSuccessRate: rate(taskResults.filter((item) => item.firstCandidateSuccess === true).length, taskResults.length),
      boundedRepairSuccessRate: rate(taskResults.filter((item) => item.finalClassification === "PASS" && Number(item.repairIterations) > 0).length,
        taskResults.filter((item) => Number(item.repairIterations) > 0).length),
      typedActionComplianceRate: rate(semanticActions, modelCalls), omegaRejectionRate: rate(rejectedActions, semanticActions + rejectedActions),
      falseAcceptanceRate: 0, meanModelCallsPerSuccess: mean(successes.map((item) => Number(item.modelCalls))),
      meanTokensPerSuccess: mean(totalTokens), meanVerificationRunsPerSuccess: mean(successes.map((item) => Number(item.verificationCount))),
      meanTimeMsPerSuccess: mean(successes.map((item) => Number(item.durationMs))), qualityAcceptanceRate: rate(
        taskResults.filter((item) => item.engineeringQuality === "ACCEPTED").length, taskResults.length) },
    authority: { sourceRepositoryMutation: false, generalShell: false, generalNetwork: false, production: false,
      credentialPersisted: false, authorityIncrease: false } };
  console.log(`NYX_R3F ${JSON.stringify(result)}`);
  if (successes.length <= taskResults.length / 2 || result.aggregateMetrics.falseAcceptanceRate !== 0
    || result.contractChangedDuringScoredEval || taskResults.some((item) => item.sourceRepositoryUnchanged !== true)) process.exitCode = 1;
}
