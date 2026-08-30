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
import { R3BoundedRepairLoop, type OmegaPreparedRepairCandidate, type OmegaRepairEvidenceProvider,
  type R3BoundedRepairResult } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition,
  type R3BExecutionRequest } from "../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { observeEngineeringExecution, type EngineeringObservation } from "../../src/lib/codelab/observation/r3EngineeringObservation";
import { NYX_ENGINEERING_QUALITY_CONFIRMATION } from "./nyx-quality-confirmation-fixtures";
import { NYX_ENGINEERING_QUALITY_HOLDOUT, type NyxQualityHoldoutTask } from "./nyx-quality-holdout-fixtures";

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const SUITE_ID = process.env.NYX_QUALITY_SUITE?.trim() || "V1";
if (SUITE_ID !== "V1" && SUITE_ID !== "V2") throw new Error("unsupported_nyx_quality_suite");
const HOLDOUT = SUITE_ID === "V2" ? NYX_ENGINEERING_QUALITY_CONFIRMATION : NYX_ENGINEERING_QUALITY_HOLDOUT;
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const MAX_COGNITION_CYCLES_PER_TASK = 3;
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
  return values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}
function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000;
}
function cognitionEvidence(result: R3BoundedRepairResult): readonly NyxRepairCognitionEvidence[] {
  return [...result.iterations.map((item) => item.cognitionEvidence),
    ...result.evidenceAcquisitions.map((item) => item.cognitionEvidence),
    ...result.cognitionFailures.map((item) => item.cognitionEvidence),
    ...(result.lastCognitionEvidence ? [result.lastCognitionEvidence] : [])]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index);
}
function failureClass(result: R3BoundedRepairResult, hidden: string, quality: string): string {
  if (result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && hidden === "PASS" && quality === "ACCEPTED") return "NONE";
  if (hidden === "FAIL" || result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && hidden !== "PASS") return "VERIFICATION_FAILURE";
  if (quality === "REJECTED") return "QUALITY_ACCEPTANCE_FAILURE";
  if (result.reason === "repair_cognition_correction_budget_exhausted") return "MODEL_SCHEMA_COMPLIANCE_FAILURE";
  if (result.reason.includes("schema_invalid") || result.reason.includes("not_strict_json")) return "MODEL_SCHEMA_COMPLIANCE_FAILURE";
  if (result.reason.includes("no_action")) return "INSUFFICIENT_EVIDENCE";
  if (result.reason.includes("provider_") || result.reason.includes("credential_")) return "PROVIDER_FAILURE";
  if (result.reason.includes("provenance") || result.reason.includes("not_authorized") || result.reason.includes("outside_authorized")) {
    return "OMEGA_AUTHORIZATION_REJECTION";
  }
  if (result.outcome === "EXHAUSTED") return "RESOURCE_LIMIT_REACHED";
  if (result.outcome === "INFRASTRUCTURE_ERROR") return "INFRASTRUCTURE_FAILURE";
  if (result.outcome === "COGNITION_ERROR") return "MODEL_REASONING_FAILURE";
  return "MODEL_REPAIR_FAILURE";
}

function proposal(sourceRoot: string, task: NyxQualityHoldoutTask, label: string,
  changes: readonly R2GProposedChange[]): R2GPatchProposal {
  if (changes.some((change) => !task.mutationPaths.includes(change.relativePath))) {
    throw new Error("holdout_mutation_outside_explicit_scope");
  }
  const base = { schemaVersion: 1 as const, proposalId: `NYX-QH-PROPOSAL-${task.taskId}-${label}`,
    requestId: `NYX-QH-PROPOSAL-REQUEST-${task.taskId}-${label}`, repositoryRoot: sourceRoot,
    baseCandidateCommit: CANDIDATE, changes: Object.freeze([...changes]), applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: sha256(canonical(base)) });
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, label: string, now: number): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `NYX-QH-PROVISION-${label}`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${label}`, repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot, issuedAtEpochMs: now, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_QUALITY_HOLDOUT result=BLOCKED failureClass=OMEGA_AUTHORIZATION_REJECTION reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}

const provider = NvidiaNimProvider.create({ providerId: "NYX-ENGINEERING-QUALITY-HOLDOUT-NEMOTRON", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 90_000 });
const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-ENGINEERING-QUALITY-HOLDOUT-COGNITION",
  provider, maxPromptBytes: 48_000, maxOutputTokens: 1_536 });
const parent = await mkdtemp(join(tmpdir(), "nyx-quality-holdout-"));
const taskResults: Record<string, unknown>[] = [];
let sequence = 0;

try {
  for (const task of HOLDOUT) {
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
          maxDirectoryEntries: 100, allowedExtensions: [".mjs"] }, issuer: "OMEGA-NYX-QUALITY-ISOLATED",
        auditIdentity: `R1-AUDIT-${label}` });
      const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-${label}`, candidateCommit: CANDIDATE,
        capabilityVersion: "r2-a/1", evaluatorVersion: "nyx-quality-holdout/1",
        environmentIdentity: `github-actions-${process.platform}-${process.arch}`,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: canonicalSource,
        approvedSandboxRoot: await realpath(sandboxRoot), capability: { capabilityId: `R2A-CAP-${label}`,
          issuer: "OMEGA-NYX-QUALITY-ISOLATED", auditIdentity: `R2A-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
          expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK } };
      const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, now);
      const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label, now), now);
      if (!provisioned.sandbox) throw new Error(`sandbox_failed:${provisioned.reason}`);
      const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
      await cp(canonicalSource, cloneRoot, { recursive: true, errorOnExist: true, force: false });
      const patch = proposal(canonicalSource, task, label, changes);
      const applicator = await R3ADisposablePatchApplicator.create({ executorId: `R3A-${label}`,
        candidateCommit: CANDIDATE, evaluatorVersion: "nyx-quality-holdout/1", environmentIdentity: lifecycleConfig.environmentIdentity,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: canonicalSource,
        sourceRepositoryExecutor: r1, disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle,
        proposal: patch, capability: { capabilityId: `R3A-CAP-${label}`, issuer: "OMEGA-NYX-QUALITY-ISOLATED",
          auditIdentity: `R3A-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
          expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK }, allowedExtensions: [".mjs"],
        maxChanges: task.maxChanges, maxPatchBytes: task.maxPatchBytes });
      const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `R3A-REQUEST-${label}`,
        applicationId: `R3A-APPLICATION-${label}`, proposalId: patch.proposalId, proposalDigest: patch.proposalDigest,
        disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
        capabilityId: `R3A-CAP-${label}`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
        issuer: "OMEGA-NYX-QUALITY-ISOLATED", auditIdentity: `R3A-AUDIT-${label}`, observedAtEpochMs: now };
      const application = await applicator.apply(applyRequest);
      if (application.decision !== "APPLIED") throw new Error(`apply_failed:${application.reason}`);
      return { sourceRoot: canonicalSource, cloneRoot, proposal: patch, applicator, application };
    };

    const verification = async (pack: AppliedPack, label: string, hidden = false) => {
      const now = Date.now();
      const toolId = hidden ? "HIDDEN_TEST" : "TEST";
      const entrypoint = hidden ? "tools/verify-hidden.mjs" : "tools/verify-visible.mjs";
      const definition: R3BEngineeringToolDefinition = { toolId, toolKind: "TEST",
        toolVersion: `nyx-quality-fixture/${task.taskId}/1`, entrypoint,
        expectedEntrypointSha256: sha256(await readFile(join(pack.cloneRoot, entrypoint))), arguments: [],
        workingDirectory: ".", timeoutMs: 5_000, maxOutputBytes: 16_384, allowedMutationPrefixes: [], allowChildProcesses: false };
      const environmentIdentity = `github-actions-${process.platform}-${process.arch}`;
      const executor = await R3BControlledEngineeringExecutor.create({ executorId: `R3B-${task.taskId}-${label}`,
        candidateCommit: CANDIDATE, evaluatorVersion: "nyx-quality-holdout/1", environmentIdentity,
        authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: pack.cloneRoot,
        disposableRepositoryId: pack.application.disposableRepositoryId, applicator: pack.applicator,
        appliedCandidate: pack.application, capability: { capabilityId: `R3B-CAP-${task.taskId}-${label}`,
          issuer: "OMEGA-NYX-QUALITY-ISOLATED", auditIdentity: `R3B-AUDIT-${task.taskId}-${label}`,
          issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS_PER_TASK }, tools: [definition],
        maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 10_000, maxOutputBytes: 100_000 });
      const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `R3B-REQUEST-${task.taskId}-${label}`,
        executionId: `R3B-EXECUTION-${task.taskId}-${label}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId,
        disposableRepositoryId: pack.application.disposableRepositoryId, applicationId: pack.application.applicationId,
        proposalDigest: pack.application.proposalDigest, capabilityId: `R3B-CAP-${task.taskId}-${label}`,
        issuer: "OMEGA-NYX-QUALITY-ISOLATED", auditIdentity: `R3B-AUDIT-${task.taskId}-${label}`,
        environmentIdentity, observedAtEpochMs: now };
      return { executor, request };
    };

    const initialChanges = Object.entries(task.faultyFiles).map(([path, content]) => ({ kind: "MODIFY" as const,
      relativePath: path, expectedBaseHash: sha256(task.correctFiles[path]), proposedContentHash: sha256(content),
      proposedContent: content, baselineEvidenceId: `evidence://nyx-quality/${task.taskId}/initial`,
      baselineObservationId: `observation://nyx-quality/${task.taskId}/initial`,
      sandboxArtifactId: `artifact://nyx-quality/${task.taskId}/initial` }));
    const initial = await applyChanges(sourceRoot, initialChanges, "initial-fault");
    const initialTool = await verification(initial, "initial-visible");
    const initialExecution = await initialTool.executor.execute(initialTool.request);
    const initialObserved = observeEngineeringExecution({ schemaVersion: 1,
      observationRequestId: `NYX-QH-OBSERVATION-${task.taskId}-INITIAL`, observerIdentity: "OMEGA-NYX-QUALITY-OBSERVER",
      evaluatorVersion: "nyx-quality-holdout/1", expected: { candidateCommit: initialExecution.evidence.candidateCommit,
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
    const admittedEvidencePaths = new Set(task.initiallyAdmittedPaths);
    const candidateBuilder = { builderIdentity: `OMEGA-NYX-QUALITY-BUILDER-${task.taskId}`,
      prepare: async (hypothesis: NyxRepairHypothesis, iteration: number): Promise<OmegaPreparedRepairCandidate> => {
        const changes = hypothesis.changes.map((change) => ({ kind: "MODIFY" as const, relativePath: change.relativePath,
          expectedBaseHash: change.expectedBaseHash, proposedContentHash: change.replacementContentHash,
          proposedContent: change.replacementContent, baselineEvidenceId: `evidence://nyx-quality/${task.taskId}/${iteration}`,
          baselineObservationId: `observation://nyx-quality/${task.taskId}/${iteration}`,
          sandboxArtifactId: `artifact://nyx-quality/${task.taskId}/${iteration}` }));
        const pack = await applyChanges(currentBaseRoot, changes, `repair-${iteration}`);
        const run = await verification(pack, `repair-${iteration}`);
        currentBaseRoot = pack.cloneRoot;
        finalPack = pack;
        const files = await Promise.all([...admittedEvidencePaths].map(async (relativePath) => {
          const content = await readFile(join(pack.cloneRoot, relativePath), "utf8");
          return { relativePath, content, contentSha256: sha256(content) };
        }));
        return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest,
          proposal: pack.proposal, application: pack.application,
          verifications: [{ toolId: "TEST", executor: run.executor, request: run.request }], files,
          omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: false,
          productionAuthorityGranted: false };
      } };
    const initialFiles = await Promise.all(task.initiallyAdmittedPaths.map(async (relativePath) => {
      const content = await readFile(join(initial.cloneRoot, relativePath), "utf8");
      return { relativePath, content, contentSha256: sha256(content) };
    }));
    const evidenceProvider: OmegaRepairEvidenceProvider = { providerIdentity: `OMEGA-NYX-QUALITY-R1-${task.taskId}`,
      acquire: async (request) => {
        const descriptors = request.requestedEvidenceRefs.map((ref) => task.availableEvidence.find((item) => item.evidenceRef === ref));
        if (descriptors.some((item) => !item)) throw new Error("unavailable_evidence_reference");
        for (const item of descriptors) admittedEvidencePaths.add(item!.relativePath);
        const files = await Promise.all(descriptors.map(async (item) => {
          const content = await readFile(join(currentBaseRoot, item!.relativePath), "utf8");
          return { relativePath: item!.relativePath, content, contentSha256: sha256(content) };
        }));
        return { requestedEvidenceRefs: request.requestedEvidenceRefs,
          evidenceIds: descriptors.map((item) => `R1-EVIDENCE-${task.taskId}-${sha256(item!.relativePath).slice(0, 16)}`), files,
          omegaAuthorityBoundary: "R1_ADMITTED_READ_ONLY_EVIDENCE" as const, authorityGranted: false as const };
      } };
    const loop = R3BoundedRepairLoop.create({ loopId: `NYX-QUALITY-LOOP-${task.taskId}`,
      evaluatorVersion: "nyx-quality-holdout/1", observerIdentity: "OMEGA-NYX-QUALITY-OBSERVER", cognition,
      candidateBuilder, evidenceProvider, maxIterations: MAX_COGNITION_CYCLES_PER_TASK,
      maxWallClockMs: MAX_WALL_CLOCK_MS_PER_TASK, maxChangesPerIteration: task.maxChanges,
      maxPatchBytesPerIteration: task.maxPatchBytes, maxDiagnosisCharacters: MAX_DIAGNOSIS_CHARACTERS });
    const loopResult = await loop.run({ schemaVersion: 1, repairRequestId: `NYX-QUALITY-REPAIR-${task.taskId}`,
      objective: task.objective, initialObservation, initialFiles, allowedMutationPaths: task.mutationPaths,
      availableEvidence: task.availableEvidence.map((item) => ({ ...item, kind: "FILE" as const })),
      allowedVerificationToolIds: ["TEST"], baselineExecutions: [{ toolId: "TEST", result: initialExecution }],
      observedAtEpochMs: Date.now() });

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
      const contents = await Promise.all(Object.keys(task.correctFiles).map(async (path) => ({ path,
        content: await readFile(join(finalPack!.cloneRoot, path), "utf8") })));
      const changedPaths = loopResult.iterations.flatMap((iteration) => iteration.hypothesis.changes.map((change) => change.relativePath));
      const forbidden = /(?:node:fs|child_process|\bprocess\b|\bfetch\s*\(|\beval\s*\(|\bFunction\s*\()/;
      const toolIntegrity = sha256(await readFile(join(finalPack.cloneRoot, "tools", "verify-visible.mjs"))) === sha256(task.visibleVerifier)
        && sha256(await readFile(join(finalPack.cloneRoot, "tools", "verify-hidden.mjs"))) === sha256(task.hiddenVerifier);
      const architectureFit = Object.entries(task.requiredArchitectureMarkers).every(([path, markers]) => {
        const content = contents.find((item) => item.path === path)?.content ?? "";
        return markers.every((marker) => content.includes(marker));
      });
      const readOnlyEvidencePreserved = task.availableEvidence.every((item) => {
        const content = contents.find((candidate) => candidate.path === item.relativePath)?.content;
        return content === task.correctFiles[item.relativePath] && !changedPaths.includes(item.relativePath);
      });
      quality = { evaluated: true, correctness: hiddenResult === "PASS",
        minimality: new Set(changedPaths).size <= task.maxChanges,
        boundedScope: changedPaths.every((path) => task.mutationPaths.includes(path)),
        regressionBehavior: hiddenResult === "PASS", maintainability: contents.every((item) => item.content.length <= task.maxPatchBytes
          && item.content.split(/\r?\n/).length <= 60), architectureFit,
        typeSafety: "NOT_APPLICABLE_PLAIN_ECMASCRIPT_FIXTURES", duplication: contents.every((item) => !/(.{25,})\n\1/.test(item.content)),
        unnecessaryScopeExpansion: changedPaths.every((path) => task.mutationPaths.includes(path)),
        security: contents.every((item) => !forbidden.test(item.content)), readability: contents.every((item) => item.content.includes("export function")),
        apiCompatibility: hiddenResult === "PASS", readOnlyEvidencePreserved, verifierIntegrity: toolIntegrity };
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
    const noActionActions = loopResult.reason.includes("no_action") ? 1 : 0;
    const semanticActions = loopResult.iterations.length + loopResult.evidenceAcquisitions.length + noActionActions;
    taskResults.push({ taskId: task.taskId, taskClass: task.taskClass, provenance: task.provenance,
      initialDefect: task.initialDefect, mutationScope: task.mutationPaths, initiallyAdmittedPaths: task.initiallyAdmittedPaths,
      availableEvidenceRefs: task.availableEvidence.map((item) => item.evidenceRef), contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
      contractDigest: CONTRACT_AT_START, modelId: MODEL, modelCalls: loopResult.modelCallCount, semanticActions,
      rejectedActions: Math.max(0, loopResult.modelCallCount - semanticActions), evidenceRequests: loopResult.evidenceAcquisitions.length,
      hypotheses: loopResult.iterations.length, hypothesisDispositions: loopResult.iterations.map((item) => item.hypothesisDisposition),
      cognitionFailures: loopResult.cognitionFailures.map((item) => ({ cycle: item.cognitionCycle, reason: item.reason,
        diagnostics: item.diagnostics.map((diagnostic) => ({ category: diagnostic.category, path: diagnostic.path })) })),
      candidates: loopResult.iterations.length, repairIterations: Math.max(0, loopResult.iterations.length - 1),
      verificationCount: 1 + loopResult.iterations.reduce((sum, item) => sum + item.verifications.length, 0)
        + (hiddenResult === "NOT_APPLICABLE" ? 0 : 1), deterministicVerification: loopResult.outcome,
      hiddenAcceptance: hiddenResult, engineeringQuality: qualityResult, quality, finalClassification: accepted ? "PASS" : "FAIL",
      firstCandidateSuccess: accepted && loopResult.iterations.length === 1,
      failureClass: failureClass(loopResult, hiddenResult, qualityResult), totalTokens: tokens,
      requestDigests: modelEvidence.map((item) => item.modelRequestDigest), responseDigests: modelEvidence.map((item) => item.modelResponseDigest),
      hiddenEvidenceId, sourceRepositoryUnchanged: sourceUnchanged, failedPredecessorUnchanged, contractPreserved,
      omegaAuthorityEnforcement: !loopResult.authorityGranted && !loopResult.sourceRepositoryWriteAuthority,
      durationMs: Date.now() - taskStarted });
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown_error";
  console.error(`NYX_QUALITY_HOLDOUT result=HARNESS_ABORTED failureClass=HARNESS_DEFECT reason=${reason.replace(/\s+/g, "_").slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await rm(parent, { recursive: true, force: true });
}

if (taskResults.length === HOLDOUT.length) {
  const successes = taskResults.filter((item) => item.finalClassification === "PASS");
  const modelCalls = taskResults.reduce((sum, item) => sum + Number(item.modelCalls), 0);
  const semanticActions = taskResults.reduce((sum, item) => sum + Number(item.semanticActions), 0);
  const rejectedActions = taskResults.reduce((sum, item) => sum + Number(item.rejectedActions), 0);
  const falseAcceptances = taskResults.filter((item) => item.deterministicVerification === "FUNCTIONALLY_REPAIRED_VERIFIED"
    && (item.hiddenAcceptance !== "PASS" || item.engineeringQuality !== "ACCEPTED"));
  const repairAttempted = taskResults.filter((item) => Number(item.repairIterations) > 0);
  const result = { schemaVersion: 1, chunkId: "NYX-ENGINEERING-QUALITY-DETOUR-001", suiteIdentity: SUITE_ID,
    candidateCommit: CANDIDATE,
    modelId: MODEL, contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION, contractDigest: CONTRACT_AT_START,
    contractChangedDuringScoredEval: taskResults.some((item) => item.contractPreserved !== true), tasks: taskResults,
    aggregateMetrics: { taskSuccessRate: rate(successes.length, taskResults.length),
      firstCandidateSuccessRate: rate(taskResults.filter((item) => item.firstCandidateSuccess === true).length, taskResults.length),
      boundedRepairSuccessRate: rate(repairAttempted.filter((item) => item.finalClassification === "PASS").length, repairAttempted.length),
      schemaComplianceRate: rate(semanticActions, modelCalls), actionComplianceRate: rate(semanticActions, modelCalls),
      falseAcceptanceRate: rate(falseAcceptances.length, taskResults.length),
      qualityAcceptanceRate: rate(taskResults.filter((item) => item.engineeringQuality === "ACCEPTED").length, taskResults.length),
      meanCallsPerTask: mean(taskResults.map((item) => Number(item.modelCalls))),
      meanTokensPerTask: mean(taskResults.map((item) => Number(item.totalTokens))),
      meanCandidatesPerTask: mean(taskResults.map((item) => Number(item.candidates))),
      meanVerificationRunsPerTask: mean(taskResults.map((item) => Number(item.verificationCount))),
      meanTimeMsPerTask: mean(taskResults.map((item) => Number(item.durationMs))),
      meanTokensPerAcceptedTask: mean(successes.map((item) => Number(item.totalTokens))) },
    budget: { maxCognitionCyclesPerTask: MAX_COGNITION_CYCLES_PER_TASK,
      maxWallClockMsPerTask: MAX_WALL_CLOCK_MS_PER_TASK, widenedFromR3F: false },
    authority: { sourceRepositoryMutation: false, generalShell: false, generalNetwork: false, production: false,
      credentialPersisted: false, authorityIncrease: false } };
  console.log(`NYX_QUALITY_HOLDOUT ${JSON.stringify(result)}`);
  if (successes.length <= taskResults.length / 2 || result.aggregateMetrics.falseAcceptanceRate !== 0
    || result.contractChangedDuringScoredEval || taskResults.some((item) => item.sourceRepositoryUnchanged !== true)) process.exitCode = 1;
}
