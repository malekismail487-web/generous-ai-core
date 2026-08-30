import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NyxNemotronEngineeringCognition, type NyxRepairHypothesis } from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop, type OmegaPreparedRepairCandidate, type R3BoundedRepairResult } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition, type R3BExecutionRequest } from "../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { observeEngineeringExecution, type EngineeringObservation } from "../../src/lib/codelab/observation/r3EngineeringObservation";

const TASK_ID = "NYX-LIVE-R3E-001-NORMALIZE-TAGS";
const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const MAX_MODEL_CALLS = 2;
const MAX_WALL_CLOCK_MS = 240_000;
const MAX_PATCH_BYTES = 4_096;
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const STARTED_AT = Date.now();

const CORRECT_SOURCE = `export function normalizeTags(tags) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}
`;
const FAULTY_SOURCE = `export function normalizeTags(tags) {
  return [...new Set(tags.map((tag) => tag.trim()))];
}
`;
const OBJECTIVE = "Repair normalizeTags(tags) so it returns sorted, unique, lowercase, non-empty trimmed strings while preserving the ESM export and avoiding side effects.";
const VERIFIER_SOURCE = `import { normalizeTags } from "../src/normalize-tags.mjs";
const cases = [
  { input: [" Alpha ", "alpha", "", " BETA "], expected: ["alpha", "beta"] },
  { input: ["z", " A", "z", "a "], expected: ["a", "z"] },
  { input: [], expected: [] },
  { input: ["  ", "\\t"], expected: [] },
];
for (const [index, item] of cases.entries()) {
  const actual = normalizeTags(item.input);
  if (JSON.stringify(actual) !== JSON.stringify(item.expected)) {
    console.error(\`FAIL tests/normalize-tags case=\${index} expected=\${JSON.stringify(item.expected)} received=\${JSON.stringify(actual)}\`);
    process.exit(2);
  }
}
console.log("TEST_PASS normalize-tags");
`;

interface AppliedPack {
  readonly sourceRoot: string;
  readonly cloneRoot: string;
  readonly proposal: R2GPatchProposal;
  readonly applicator: R3ADisposablePatchApplicator;
  readonly application: Awaited<ReturnType<R3ADisposablePatchApplicator["apply"]>>;
}

function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function proposal(sourceRoot: string, label: string, change: R2GProposedChange): R2GPatchProposal {
  const base = { schemaVersion: 1 as const, proposalId: `NYX-LIVE-PROPOSAL-${label}`,
    requestId: `NYX-LIVE-PROPOSAL-REQUEST-${label}`, repositoryRoot: sourceRoot,
    baseCandidateCommit: CANDIDATE, changes: Object.freeze([change]), applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: hash(canonical(base)) });
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, label: string, now: number): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `NYX-LIVE-PROVISION-${label}`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${label}`, repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot, issuedAtEpochMs: now, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

function failureClass(result: R3BoundedRepairResult): string {
  if (result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED") return "NONE";
  if (result.reason.includes("provider_http") || result.reason.includes("provider_timeout")
    || result.reason.includes("transport_failure") || result.reason.includes("credential_unavailable")) return "INFRASTRUCTURE_FAILURE";
  if (result.reason.includes("not_authorized") || result.reason.includes("outside_authorized")
    || result.reason.includes("base_hash") || result.reason.includes("provenance_invalid")) return "OMEGA_AUTHORIZATION_FAILURE";
  if (result.outcome === "EXHAUSTED" || result.outcome === "COGNITION_ERROR") return "MODEL_CAPABILITY_FAILURE";
  if (result.outcome === "INFRASTRUCTURE_ERROR") return "INTEGRATION_FAILURE";
  return "VERIFICATION_FAILURE";
}

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_LIVE_R3E result=BLOCKED failureClass=OMEGA_AUTHORIZATION_FAILURE reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}

let sequence = 0;
const parent = await mkdtemp(join(tmpdir(), "nyx-live-r3e-"));
let finalCandidateRoot: string | null = null;

try {
  const applyChange = async (sourceInput: string, change: R2GProposedChange, prefix: string): Promise<AppliedPack> => {
    sequence += 1;
    const now = Date.now();
    const label = `${prefix}-${sequence}`;
    const sourceRoot = await realpath(sourceInput);
    const sandboxRoot = join(parent, `sandboxes-${label}`);
    await mkdir(sandboxRoot);
    const r1 = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-NYX-LIVE-${label}`,
      tokenId: `R1-NYX-LIVE-TOKEN-${label}`, repositoryRoot: sourceRoot, resourceScopes: ["."],
      issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS,
      constraints: { maxFileBytes: 100_000, maxDirectoryEntries: 100, allowedExtensions: [".mjs"] },
      issuer: "OMEGA-NYX-LIVE-ISOLATED", auditIdentity: `R1-NYX-LIVE-AUDIT-${label}` });
    const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-NYX-LIVE-${label}`,
      candidateCommit: CANDIDATE, capabilityVersion: "r2-a/1", evaluatorVersion: "nyx-live-r3e/1",
      environmentIdentity: `github-actions-${process.platform}-${process.arch}`, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
      repositoryRoot: sourceRoot, approvedSandboxRoot: await realpath(sandboxRoot),
      capability: { capabilityId: `R2A-NYX-LIVE-CAP-${label}`, issuer: "OMEGA-NYX-LIVE-ISOLATED",
        auditIdentity: `R2A-NYX-LIVE-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
        expiresAtEpochMs: now + MAX_WALL_CLOCK_MS } };
    const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, now);
    const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label, now), now);
    if (!provisioned.sandbox) throw new Error(`live_sandbox_failed:${provisioned.reason}`);
    const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
    await cp(sourceRoot, cloneRoot, { recursive: true, errorOnExist: true, force: false });
    const patch = proposal(sourceRoot, label, change);
    const applicator = await R3ADisposablePatchApplicator.create({ executorId: `R3A-NYX-LIVE-${label}`,
      candidateCommit: CANDIDATE, evaluatorVersion: "nyx-live-r3e/1", environmentIdentity: lifecycleConfig.environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: sourceRoot,
      sourceRepositoryExecutor: r1, disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle,
      proposal: patch, capability: { capabilityId: `R3A-NYX-LIVE-CAP-${label}`, issuer: "OMEGA-NYX-LIVE-ISOLATED",
        auditIdentity: `R3A-NYX-LIVE-AUDIT-${label}`, issuedAtEpochMs: now - 1_000,
        expiresAtEpochMs: now + MAX_WALL_CLOCK_MS }, allowedExtensions: [".mjs"], maxChanges: 1,
      maxPatchBytes: MAX_PATCH_BYTES });
    const request: R3AApplyRequest = { schemaVersion: 1, requestId: `R3A-NYX-LIVE-REQUEST-${label}`,
      applicationId: `R3A-NYX-LIVE-APPLICATION-${label}`, proposalId: patch.proposalId,
      proposalDigest: patch.proposalDigest, disposableRepositoryId: applicator.disposableRepositoryId(),
      sandboxId: provisioned.sandbox.sandboxId, capabilityId: `R3A-NYX-LIVE-CAP-${label}`,
      authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY", issuer: "OMEGA-NYX-LIVE-ISOLATED",
      auditIdentity: `R3A-NYX-LIVE-AUDIT-${label}`, observedAtEpochMs: now };
    const application = await applicator.apply(request);
    if (application.decision !== "APPLIED") throw new Error(`live_apply_failed:${application.reason}`);
    return { sourceRoot, cloneRoot, proposal: patch, applicator, application };
  };

  const verification = async (pack: AppliedPack, label: string) => {
    const now = Date.now();
    const entrypoint = "tools/verify.mjs";
    const definition: R3BEngineeringToolDefinition = { toolId: "TEST", toolKind: "TEST", toolVersion: "nyx-live-fixture/1",
      entrypoint, expectedEntrypointSha256: hash(await readFile(join(pack.cloneRoot, entrypoint))), arguments: [],
      workingDirectory: ".", timeoutMs: 5_000, maxOutputBytes: 16_384, allowedMutationPrefixes: [],
      allowChildProcesses: false };
    const environmentIdentity = `github-actions-${process.platform}-${process.arch}`;
    const executor = await R3BControlledEngineeringExecutor.create({ executorId: `R3B-NYX-LIVE-${label}`,
      candidateCommit: CANDIDATE, evaluatorVersion: "nyx-live-r3e/1", environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: pack.cloneRoot,
      disposableRepositoryId: pack.application.disposableRepositoryId, applicator: pack.applicator,
      appliedCandidate: pack.application, capability: { capabilityId: `R3B-NYX-LIVE-CAP-${label}`,
        issuer: "OMEGA-NYX-LIVE-ISOLATED", auditIdentity: `R3B-NYX-LIVE-AUDIT-${label}`,
        issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + MAX_WALL_CLOCK_MS }, tools: [definition],
      maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 10_000, maxOutputBytes: 100_000 });
    const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `R3B-NYX-LIVE-REQUEST-${label}`,
      executionId: `R3B-NYX-LIVE-EXECUTION-${label}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId: "TEST",
      disposableRepositoryId: pack.application.disposableRepositoryId, applicationId: pack.application.applicationId,
      proposalDigest: pack.application.proposalDigest, capabilityId: `R3B-NYX-LIVE-CAP-${label}`,
      issuer: "OMEGA-NYX-LIVE-ISOLATED", auditIdentity: `R3B-NYX-LIVE-AUDIT-${label}`,
      environmentIdentity, observedAtEpochMs: now };
    return { executor, request };
  };

  const sourceRoot = join(parent, "authoritative-source");
  await mkdir(join(sourceRoot, "src"), { recursive: true });
  await mkdir(join(sourceRoot, "tools"));
  await writeFile(join(sourceRoot, "src", "normalize-tags.mjs"), CORRECT_SOURCE, "utf8");
  await writeFile(join(sourceRoot, "tools", "verify.mjs"), VERIFIER_SOURCE, "utf8");

  const initial = await applyChange(sourceRoot, { kind: "MODIFY", relativePath: "src/normalize-tags.mjs",
    expectedBaseHash: hash(CORRECT_SOURCE), proposedContentHash: hash(FAULTY_SOURCE), proposedContent: FAULTY_SOURCE,
    baselineEvidenceId: "evidence://nyx-live/initial", baselineObservationId: "observation://nyx-live/initial",
    sandboxArtifactId: "artifact://nyx-live/initial" }, "initial-fault");
  const initialVerification = await verification(initial, "initial-fault");
  const initialExecution = await initialVerification.executor.execute(initialVerification.request);
  const initialObserved = observeEngineeringExecution({ schemaVersion: 1,
    observationRequestId: "NYX-LIVE-R3E-INITIAL-OBSERVATION", observerIdentity: "OMEGA-NYX-LIVE-OBSERVER",
    evaluatorVersion: "nyx-live-r3e/1", expected: { candidateCommit: initialExecution.evidence.candidateCommit,
      disposableRepositoryId: initial.application.disposableRepositoryId, applicationId: initial.application.applicationId,
      proposalDigest: initial.application.proposalDigest, toolId: "TEST", toolKind: "TEST",
      toolIdentityDigest: initialExecution.evidence.toolIdentityDigest,
      environmentIdentity: initialExecution.evidence.environmentIdentity }, candidate: initialExecution, baseline: null,
    observedAtEpochMs: Math.max(Date.now(), initialExecution.evidence.endedAtEpochMs) });
  if (!initialObserved.observation || initialObserved.observation.state !== "TEST_FAIL") {
    throw new Error("live_initial_failure_not_observed");
  }
  const initialObservation: EngineeringObservation = initialObserved.observation;

  const provider = NvidiaNimProvider.create({ providerId: "NYX-LIVE-R3E-NEMOTRON", model: MODEL,
    authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 90_000 });
  const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-LIVE-R3E-COGNITION", provider,
    maxPromptBytes: 48_000, maxOutputTokens: 2_048 });

  let currentBaseRoot = initial.cloneRoot;
  const candidateBuilder = { builderIdentity: "OMEGA-NYX-LIVE-R3E-BUILDER",
    prepare: async (hypothesis: NyxRepairHypothesis, iteration: number): Promise<OmegaPreparedRepairCandidate> => {
      if (hypothesis.changes.length !== 1) throw new Error("live_change_count_outside_bound");
      const change = hypothesis.changes[0];
      const pack = await applyChange(currentBaseRoot, { kind: "MODIFY", relativePath: change.relativePath,
        expectedBaseHash: change.expectedBaseHash, proposedContentHash: change.replacementContentHash,
        proposedContent: change.replacementContent, baselineEvidenceId: `evidence://nyx-live/repair/${iteration}`,
        baselineObservationId: `observation://nyx-live/repair/${iteration}`,
        sandboxArtifactId: `artifact://nyx-live/repair/${iteration}` }, `repair-${iteration}`);
      const run = await verification(pack, `repair-${iteration}`);
      currentBaseRoot = pack.cloneRoot;
      finalCandidateRoot = pack.cloneRoot;
      const content = await readFile(join(pack.cloneRoot, "src", "normalize-tags.mjs"), "utf8");
      return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest,
        proposal: pack.proposal, application: pack.application,
        verifications: [{ toolId: "TEST", executor: run.executor, request: run.request }],
        files: [{ relativePath: "src/normalize-tags.mjs", content, contentSha256: hash(content) }],
        omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: false,
        productionAuthorityGranted: false };
    } };

  const loop = R3BoundedRepairLoop.create({ loopId: "NYX-LIVE-R3E-LOOP", evaluatorVersion: "nyx-live-r3e/1",
    observerIdentity: "OMEGA-NYX-LIVE-OBSERVER", cognition, candidateBuilder, maxIterations: MAX_MODEL_CALLS,
    maxWallClockMs: MAX_WALL_CLOCK_MS, maxChangesPerIteration: 1, maxPatchBytesPerIteration: MAX_PATCH_BYTES,
    maxDiagnosisCharacters: 1_500 });
  const result = await loop.run({ schemaVersion: 1, repairRequestId: "NYX-LIVE-R3E-REPAIR", objective: OBJECTIVE,
    initialObservation, initialFiles: [{ relativePath: "src/normalize-tags.mjs", content: FAULTY_SOURCE,
      contentSha256: hash(FAULTY_SOURCE) }], allowedVerificationToolIds: ["TEST"],
    baselineExecutions: [{ toolId: "TEST", result: initialExecution }], observedAtEpochMs: Date.now() });

  const sourceUnchanged = await readFile(join(sourceRoot, "src", "normalize-tags.mjs"), "utf8") === CORRECT_SOURCE;
  const failedPredecessorUnchanged = await readFile(join(initial.cloneRoot, "src", "normalize-tags.mjs"), "utf8") === FAULTY_SOURCE;
  let functionalAcceptance = false;
  let engineeringQualityAcceptance = false;
  let quality: Record<string, string | boolean | number> = { evaluated: false };
  if (result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && finalCandidateRoot) {
    const candidatePath = join(finalCandidateRoot, "src", "normalize-tags.mjs");
    const candidateContent = await readFile(candidatePath, "utf8");
    const loaded = await import(`${pathToFileURL(candidatePath).href}?acceptance=${Date.now()}`) as Record<string, unknown>;
    const normalizeTags = loaded.normalizeTags;
    const hiddenCases = [
      { input: [" Delta", "delta ", "CHARLIE", ""], expected: ["charlie", "delta"] },
      { input: [" one ", "TWO", "One", "three"], expected: ["one", "three", "two"] },
    ];
    const hiddenBehavior = typeof normalizeTags === "function" && hiddenCases.every((item) => {
      try { return JSON.stringify((normalizeTags as (tags: string[]) => unknown)(item.input)) === JSON.stringify(item.expected); }
      catch { return false; }
    });
    const forbiddenConstructs = /(?:node:fs|child_process|\bprocess\b|\bfetch\s*\(|\beval\s*\(|\bFunction\s*\()/;
    const lastIteration = result.iterations.at(-1);
    quality = {
      evaluated: true,
      correctness: hiddenBehavior,
      changeMinimality: lastIteration?.applicationDecision === "APPLIED"
        && lastIteration.hypothesis.changes.length === 1
        && lastIteration.hypothesis.changes[0].relativePath === "src/normalize-tags.mjs",
      architectureFit: typeof normalizeTags === "function",
      typeSafety: "NOT_APPLICABLE_PLAIN_ECMASCRIPT_FIXTURE",
      duplication: (candidateContent.match(/function\s+normalizeTags/g) ?? []).length === 1,
      maintainability: Buffer.byteLength(candidateContent, "utf8") <= MAX_PATCH_BYTES
        && candidateContent.split(/\r?\n/).length <= 30,
      regressionBehavior: hiddenBehavior,
      security: !forbiddenConstructs.test(candidateContent),
    };
    engineeringQualityAcceptance = Object.entries(quality)
      .filter(([key]) => !["evaluated", "typeSafety"].includes(key)).every(([, value]) => value === true);
    functionalAcceptance = result.functionalAcceptance === "ACCEPTED" && hiddenBehavior;
  }

  const cognitionEvidence = [...result.iterations.map((item) => item.cognitionEvidence),
    ...(result.lastCognitionEvidence ? [result.lastCognitionEvidence] : [])]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index);
  const modelTokens = cognitionEvidence.reduce((sum, item) => sum + (item.modelUsage.totalTokens ?? 0), 0);
  const summary = {
    schemaVersion: 1, chunkId: "NYX-LIVE-R3E-001", taskId: TASK_ID, candidateCommit: CANDIDATE, model: MODEL,
    result: functionalAcceptance && engineeringQualityAcceptance ? "VERIFIED_IN_ISOLATION" : "EMPIRICALLY_NOT_YET_VERIFIED",
    failureClass: functionalAcceptance && engineeringQualityAcceptance ? "NONE" : failureClass(result),
    loopOutcome: result.outcome, loopReason: result.reason, iterations: result.iterations.length,
    modelCalls: result.modelCallCount, modelCallLimit: MAX_MODEL_CALLS, modelTokens,
    modelRequestDigests: cognitionEvidence.map((item) => item.modelRequestDigest),
    modelResponseDigests: cognitionEvidence.map((item) => item.modelResponseDigest),
    cognitionEvidenceClasses: cognitionEvidence.map((item) => item.evidenceClass),
    cognitionEvidenceIds: cognitionEvidence.map((item) => item.evidenceId),
    proposalDigests: result.iterations.map((item) => item.proposalDigest),
    applicationDecisions: result.iterations.map((item) => item.applicationDecision),
    verificationOutcomes: result.iterations.flatMap((item) => item.verifications.map((entry) => entry.execution.outcome)),
    verificationEvidenceIds: result.iterations.flatMap((item) => item.verifications.map((entry) => entry.execution.evidence.evidenceId)),
    functionalAcceptance: functionalAcceptance ? "ACCEPTED" : "NOT_ACCEPTED",
    engineeringQualityAcceptance: engineeringQualityAcceptance ? "ACCEPTED" : "NOT_ACCEPTED",
    quality, sourceRepositoryUnchanged: sourceUnchanged, failedPredecessorUnchanged,
    omegaAuthorityEnforcement: result.authorityGranted === false && result.sourceRepositoryWriteAuthority === false,
    disposableRepositoryOnly: true, generalShellAuthority: false, generalNetworkAuthority: false,
    productionAuthority: false, credentialPersisted: false, durationMs: Date.now() - STARTED_AT,
    evidenceId: result.evidenceId,
  };
  console.log(`NYX_LIVE_R3E ${JSON.stringify(summary)}`);
  if (summary.result !== "VERIFIED_IN_ISOLATION" || !sourceUnchanged || !failedPredecessorUnchanged
    || summary.cognitionEvidenceClasses.some((value) => value !== "E4")) process.exitCode = 1;
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown_error";
  console.error(`NYX_LIVE_R3E result=EMPIRICALLY_NOT_YET_VERIFIED failureClass=INTEGRATION_FAILURE reason=${reason.replace(/\s+/g, "_").slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await rm(parent, { recursive: true, force: true });
}
