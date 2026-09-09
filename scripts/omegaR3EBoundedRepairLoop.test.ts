import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NyxNemotronEngineeringCognition, type NyxRepairHypothesis } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop, R3_E_BOUNDED_REPAIR_LOOP_STATUS, type OmegaPreparedRepairCandidate,
  type OmegaRepairEvidenceProvider } from "../src/lib/codelab/engine/r3BoundedRepairLoop";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition, type R3BExecutionRequest, type R3BExecutionResult } from "../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { GroundedRepositoryContext } from "../src/lib/codelab/repository/groundedRepositoryContext";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import { observeEngineeringExecution, type EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;
const NOW = Date.now();
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

const CORRECT_SOURCE = "export const answer = 4;";
const WRONG_SOURCE = "export const answer = 5;";
const OTHER_WRONG_SOURCE = "export const answer = 6;";
const VERIFY_SOURCE = `import { readFileSync } from "node:fs"; const value = readFileSync(new URL("../src/math.txt", import.meta.url), "utf8"); if (value.split(/\\r?\\n/, 1)[0] === "${CORRECT_SOURCE}") console.log("TEST_PASS math"); else { console.error("FAIL tests/math > expected exported answer 4"); process.exit(2); }`;
interface AppliedPack { readonly sourceRoot: string; readonly cloneRoot: string; readonly proposal: R2GPatchProposal;
  readonly applicator: R3ADisposablePatchApplicator; readonly application: Awaited<ReturnType<R3ADisposablePatchApplicator["apply"]>>; }

let sequence = 0;
const parent = await mkdtemp(join(tmpdir(), "omega-r3e-loop-"));

function proposal(sourceRoot: string, label: string, change: R2GProposedChange): R2GPatchProposal {
  const base = { schemaVersion: 1 as const, proposalId: `R3E-PROPOSAL-${label}`, requestId: `R3E-PROPOSAL-REQUEST-${label}`,
    repositoryRoot: sourceRoot, baseCandidateCommit: CANDIDATE, changes: Object.freeze([change]), applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: hash(canonical(base)) });
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, label: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `R3E-PROVISION-${label}`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${label}`, repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 500_000,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

async function applyChange(sourceInput: string, change: R2GProposedChange, prefix: string): Promise<AppliedPack> {
  sequence += 1; const label = `${prefix}-${sequence}`; const sourceRoot = await realpath(sourceInput);
  const sandboxRoot = join(parent, `sandboxes-${label}`); await mkdir(sandboxRoot);
  const r1 = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-R3E-${label}`, tokenId: `R1-R3E-TOKEN-${label}`,
    repositoryRoot: sourceRoot, resourceScopes: ["."], issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 600_000,
    constraints: { maxFileBytes: 100_000, maxDirectoryEntries: 100, allowedExtensions: [".txt", ".mjs"] },
    issuer: "OMEGA-R3E-TEST", auditIdentity: `R1-R3E-AUDIT-${label}` });
  const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-R3E-${label}`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "r3-e/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: sourceRoot, approvedSandboxRoot: await realpath(sandboxRoot),
    capability: { capabilityId: `R2A-R3E-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2A-R3E-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 550_000 } };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label), NOW);
  if (!provisioned.sandbox) throw new Error(`r3e_sandbox_failed:${provisioned.reason}`);
  const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
  await cp(sourceRoot, cloneRoot, { recursive: true, errorOnExist: true, force: false });
  const patch = proposal(sourceRoot, label, change);
  const applicator = await R3ADisposablePatchApplicator.create({ executorId: `R3A-R3E-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r3-e/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: sourceRoot, sourceRepositoryExecutor: r1,
    disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle, proposal: patch,
    capability: { capabilityId: `R3A-R3E-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R3A-R3E-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 525_000 },
    allowedExtensions: [".txt"], maxChanges: 2, maxPatchBytes: 10_000 });
  const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `R3A-R3E-REQUEST-${label}`,
    applicationId: `R3A-R3E-APPLICATION-${label}`, proposalId: patch.proposalId, proposalDigest: patch.proposalDigest,
    disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
    capabilityId: `R3A-R3E-CAP-${label}`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
    issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R3A-R3E-AUDIT-${label}`, observedAtEpochMs: NOW + 10_000 };
  const application = await applicator.apply(applyRequest);
  if (application.decision !== "APPLIED") throw new Error(`r3e_apply_failed:${application.reason}`);
  return { sourceRoot, cloneRoot, proposal: patch, applicator, application };
}

async function verification(pack: AppliedPack, label: string): Promise<{ executor: R3BControlledEngineeringExecutor; request: R3BExecutionRequest }> {
  const entrypoint = "tools/verify.mjs"; const definition: R3BEngineeringToolDefinition = { toolId: "TEST", toolKind: "TEST",
    toolVersion: "fixture/1", entrypoint, expectedEntrypointSha256: hash(await readFile(join(pack.cloneRoot, entrypoint))),
    arguments: [], workingDirectory: ".", timeoutMs: 2_000, maxOutputBytes: 16_384, allowedMutationPrefixes: [], allowChildProcesses: false };
  const environmentIdentity = `local-${process.platform}-${process.arch}`;
  const executor = await R3BControlledEngineeringExecutor.create({ executorId: `R3B-R3E-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r3-e/1", environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    disposableRepositoryRoot: pack.cloneRoot, disposableRepositoryId: pack.application.disposableRepositoryId,
    applicator: pack.applicator, appliedCandidate: pack.application,
    capability: { capabilityId: `R3B-R3E-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R3B-R3E-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 500_000 },
    tools: [definition], maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 5_000, maxOutputBytes: 100_000 });
  const request: R3BExecutionRequest = { schemaVersion: 1, requestId: `R3B-R3E-REQUEST-${label}`,
    executionId: `R3B-R3E-EXECUTION-${label}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId: "TEST",
    disposableRepositoryId: pack.application.disposableRepositoryId, applicationId: pack.application.applicationId,
    proposalDigest: pack.application.proposalDigest, capabilityId: `R3B-R3E-CAP-${label}`,
    issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R3B-R3E-AUDIT-${label}`,
    environmentIdentity, observedAtEpochMs: NOW + 20_000 };
  return { executor, request };
}

function cognition(transport: NvidiaNimTransport): NyxNemotronEngineeringCognition {
  const provider = NvidiaNimProvider.create({ providerId: `NYX-R3E-${sequence}`, model: "nvidia/nemotron-3-ultra",
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double:r3e", read: () => "test-only-credential-material" },
    maxPromptBytes: 100_000, maxOutputTokens: 2_048, timeoutMs: 1_000, transport });
  return NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-R3E-COGNITION", provider, maxPromptBytes: 50_000, maxOutputTokens: 1_024 });
}

const sourceRoot = join(parent, "source"); await mkdir(join(sourceRoot, "src"), { recursive: true }); await mkdir(join(sourceRoot, "tools"));
await writeFile(join(sourceRoot, "src", "math.txt"), CORRECT_SOURCE, "utf8");
await writeFile(join(sourceRoot, "src", "rule.txt"), "The accepted arithmetic answer is exported as 4.", "utf8");
await writeFile(join(sourceRoot, "tools", "verify.mjs"), VERIFY_SOURCE, "utf8");
const wrong = WRONG_SOURCE;
const OVERCOMPLEX_SOURCE = [
  CORRECT_SOURCE,
  "function overengineered(value) {",
  ...Array.from({ length: 13 }, (_, index) => `  if (value === ${index}) return value;`),
  "  return value;",
  "}",
].join("\n");
const initial = await applyChange(sourceRoot, { kind: "MODIFY", relativePath: "src/math.txt", expectedBaseHash: hash(CORRECT_SOURCE),
  proposedContentHash: hash(wrong), proposedContent: wrong, baselineEvidenceId: "evidence://initial", baselineObservationId: "observation://initial",
  sandboxArtifactId: "artifact://initial" }, "initial");
const initialVerification = await verification(initial, "initial");
const initialExecution = await initialVerification.executor.execute(initialVerification.request);
const initialObserved = observeEngineeringExecution({ schemaVersion: 1, observationRequestId: "R3E-INITIAL-OBSERVATION",
  observerIdentity: "OMEGA-R3E-OBSERVER", evaluatorVersion: "r3-e/1",
  expected: { candidateCommit: initialExecution.evidence.candidateCommit, disposableRepositoryId: initial.application.disposableRepositoryId,
    applicationId: initial.application.applicationId, proposalDigest: initial.application.proposalDigest, toolId: "TEST",
    toolKind: "TEST", toolIdentityDigest: initialExecution.evidence.toolIdentityDigest, environmentIdentity: initialExecution.evidence.environmentIdentity },
  candidate: initialExecution, baseline: null, observedAtEpochMs: Math.max(Date.now(), initialExecution.evidence.endedAtEpochMs) });
if (!initialObserved.observation || initialObserved.observation.state !== "TEST_FAIL") throw new Error("r3e_initial_failure_not_observed");
const initialObservation: EngineeringObservation = initialObserved.observation;

function modelResponse(replacement: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "The arithmetic fixture contains the wrong result.",
    causalHypothesis: "The stored arithmetic result contradicts the objective.",
    evidenceRefs: ["OBJECTIVE", "FILE:src/math.txt"], uncertainties: [], invariant: "The fixture must export answer 4.",
    failureInterpretation: "No prior candidate exists or the prior value remained incorrect.",
    expectedResult: "The repository-native test reports TEST_PASS.", counterexamples: ["The file contains any value other than 2+2=4."],
    requestedEvidenceRefs: [],
    assumptions: ["The verifier encodes intended behavior."], changes: [{ target: "src/math.txt", replacement }], confidence: 0.99,
    ...overrides });
}

function providerResponse(content: string, finishReason = "stop"): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }), { status: 200 });
}

function builder(tamper = false, additionalAdmittedPaths: () => readonly string[] = () => []) {
  let currentBaseRoot = initial.cloneRoot;
  return { builderIdentity: tamper ? "OMEGA-R3E-TAMPER-BUILDER" : "OMEGA-R3E-BUILDER",
    prepare: async (hypothesis: NyxRepairHypothesis, iteration: number): Promise<OmegaPreparedRepairCandidate> => {
      const change = hypothesis.changes[0];
      const pack = await applyChange(currentBaseRoot, { kind: "MODIFY", relativePath: change.relativePath,
        expectedBaseHash: change.expectedBaseHash, proposedContentHash: change.replacementContentHash,
        proposedContent: change.replacementContent, baselineEvidenceId: `evidence://repair/${iteration}`,
        baselineObservationId: `observation://repair/${iteration}`, sandboxArtifactId: `artifact://repair/${iteration}` }, `repair-${iteration}`);
      const run = await verification(pack, `repair-${iteration}-${sequence}`);
      currentBaseRoot = pack.cloneRoot;
      const relativePaths = ["src/math.txt", ...additionalAdmittedPaths()];
      const files = await Promise.all(relativePaths.map(async (relativePath) => {
        const content = await readFile(join(pack.cloneRoot, relativePath), "utf8");
        return { relativePath, content, contentSha256: hash(content) };
      }));
      return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest, proposal: pack.proposal,
        application: pack.application, verifications: [{ toolId: "TEST", executor: run.executor, request: run.request }],
        files,
        omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: tamper as unknown as false,
        productionAuthorityGranted: false };
    } };
}

function loop(nyx: NyxNemotronEngineeringCognition, candidateBuilder = builder(), maxIterations = 1,
  evidenceProvider?: OmegaRepairEvidenceProvider, maxWallClockMs = 30_000): R3BoundedRepairLoop {
  return R3BoundedRepairLoop.create({ loopId: `R3E-LOOP-${sequence}`, evaluatorVersion: "r3-e/1",
    observerIdentity: "OMEGA-R3E-OBSERVER", cognition: nyx, candidateBuilder, evidenceProvider, maxIterations, maxWallClockMs,
    maxChangesPerIteration: 1, maxPatchBytesPerIteration: 1_000, maxDiagnosisCharacters: 1_000 });
}

{
  let calls = 0;
  let correctionObserved = false;
  const nyx = cognition(async (_input, init) => {
    calls += 1;
    const prompt = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    if (calls === 1) return providerResponse(modelResponse(CORRECT_SOURCE, { decision: "RUN_SHELL" }));
    correctionObserved = prompt.requiredCorrections.some((item: { category: string; expected: string }) =>
      item.category === "UNKNOWN_CAPABILITY" && item.expected.includes("PROPOSE_EDIT") && !item.expected.includes("RUN_SHELL"));
    return providerResponse(modelResponse(CORRECT_SOURCE));
  });
  let preparations = 0;
  const allowedBuilder = builder();
  const guardedBuilder = { ...allowedBuilder, prepare: async (hypothesis: NyxRepairHypothesis, iteration: number) => {
    preparations += 1;
    return allowedBuilder.prepare(hypothesis, iteration);
  } };
  const result = await loop(nyx, guardedBuilder, 2).run(loopRequest());
  check(correctionObserved && result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.modelCallCount === 2,
    "Omega explains an unsupported intent and Nyx can replace it with an authorized proposal within the existing budget");
  check(preparations === 1 && result.cognitionFailures.length === 1 && !result.authorityGranted,
    "rejected shell intent never reaches actuation and subsequent correction grants no additional authority");
}

{
  let preparations = 0;
  const unusedBuilder = { builderIdentity: "NO-PROGRESS-UNUSED", prepare: async () => {
    preparations += 1; throw new Error("must_not_prepare");
  } };
  const invalid = JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "Still missing a hypothesis." });
  const result = await loop(cognition(async () => providerResponse(invalid)), unusedBuilder, 3).run(loopRequest());
  check(result.outcome === "EXHAUSTED" && result.reason === "repair_cognition_no_progress" && result.modelCallCount === 2,
    "identical invalid output after actionable feedback terminates without consuming a third call");
  check(result.cognitionFailures.length === 2 && preparations === 0,
    "no-progress termination retains both rejection observations without candidate mutation");
  const late = await loop(cognition(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return providerResponse(modelResponse(CORRECT_SOURCE));
  }), unusedBuilder, 2, undefined, 100).run(loopRequest());
  check(late.outcome === "EXHAUSTED" && late.reason === "repair_wall_clock_budget_exhausted"
    && late.modelCallCount === 1 && preparations === 0,
  "valid but late cognition cannot initiate mutation after the loop deadline");
}

{
  const responses = [modelResponse(OTHER_WRONG_SOURCE), modelResponse(CORRECT_SOURCE, {
    failureInterpretation: "The failed verification falsified the proposed value 2+2=6; the repository rule supports 2+2=4.",
  })];
  let calls = 0;
  const nyx = cognition(async () => providerResponse(responses[calls++]));
  const result = await loop(nyx, builder(), 2).run(loopRequest());
  check(result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.modelCallCount === 2 && result.iterations.length === 2,
    "failed verification drives a bounded revised candidate to verified success without a larger budget");
  check(result.iterations[0].hypothesisDisposition === "FALSIFIED" && result.iterations[1].hypothesisDisposition === "SUPPORTED"
    && result.iterations[1].hypothesis.parentHypothesisId === result.iterations[0].hypothesis.hypothesisId,
    "repair loop preserves causal hypothesis lineage and deterministic falsification disposition");
}

{
  const invalidIntent = JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "Incomplete retry." });
  const responses = [modelResponse(OTHER_WRONG_SOURCE), invalidIntent, modelResponse(CORRECT_SOURCE, {
    failureInterpretation: "The first candidate was falsified and the intervening intent violated the semantic contract.",
  })];
  let calls = 0;
  const nyx = cognition(async () => providerResponse(responses[calls++]));
  const result = await loop(nyx, builder(), 3).run(loopRequest());
  check(result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.modelCallCount === 3
    && result.iterations.length === 2 && result.cognitionFailures.length === 1,
    "one schema-invalid revision consumes an existing cognition cycle and can still converge without a larger budget");
  check(result.cognitionFailures[0].reason === "SCHEMA_INVALID"
    && result.cognitionFailures[0].diagnostics.some((item) => item.category === "MISSING_REQUIRED_FIELD")
    && result.iterations[0].hypothesisDisposition === "FALSIFIED" && result.iterations[1].hypothesisDisposition === "SUPPORTED",
    "bounded correction preserves sanitized diagnostics alongside falsified-to-supported hypothesis lineage");
}

{
  const evidenceExecutor = await ReadOnlyRepositoryExecutor.create({ executorId: "R1-R3E-CONTEXT",
    tokenId: "R1-R3E-CONTEXT-TOKEN", repositoryRoot: initial.cloneRoot,
    resourceScopes: ["src/math.txt", "src/rule.txt"], issuedAtEpochMs: NOW - 1_000,
    expiresAtEpochMs: NOW + 500_000, constraints: { maxFileBytes: 100_000,
      maxDirectoryEntries: 10, allowedExtensions: [".txt"] }, issuer: "OMEGA-R3E-TEST", auditIdentity: "R1-CONTEXT-AUDIT" });
  const groundedContext = await GroundedRepositoryContext.create({ sessionId: "R3E-INTEGRATION",
    candidateId: CANDIDATE, environmentId: `local-${process.platform}`, executor: evidenceExecutor,
    manifest: ["src/math.txt", "src/rule.txt"], maxSnapshotBytes: 100_000, maxReadOperations: 8, now: () => NOW });
  const contextPack = await groundedContext.retrieve({ objective: "Repair arithmetic result", seedPaths: ["src/math.txt"],
    mode: "DEPENDENCY_AUGMENTED", maxFiles: 1, maxBytes: 10_000, maxDependencyDepth: 1 });
  const evidenceIntent = JSON.stringify({ decision: "REQUEST_EVIDENCE", diagnosis: "The observed value is wrong but the intended identity needs confirmation.",
    causalHypothesis: "The stored result violates the repository arithmetic rule.", evidenceRefs: ["OBJECTIVE", "FILE:src/math.txt"],
    uncertainties: ["The authoritative arithmetic rule has not yet been admitted."], invariant: "The stored expression must equal the repository rule.",
    failureInterpretation: "No prior candidate exists.", expectedResult: "Admitting the rule will discriminate the correct replacement.",
    counterexamples: [], requestedEvidenceRefs: [contextPack.availableEvidence[0].evidenceRef], assumptions: [], changes: [], confidence: 0.7 });
  const invalidIntent = JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "Incomplete post-evidence intent." });
  const responses = [evidenceIntent, invalidIntent,
    modelResponse(CORRECT_SOURCE, { evidenceRefs: ["OBJECTIVE", "FILE:src/math.txt", "FILE:src/rule.txt"] })];
  let calls = 0;
  const nyx = cognition(async () => providerResponse(responses[calls++]));
  let ruleAdmitted = false;
  const evidenceProvider: OmegaRepairEvidenceProvider = { providerIdentity: "OMEGA-R3E-READ-ONLY-EVIDENCE",
    acquire: async (request, cycle) => {
      const evidence = await groundedContext.acquire(request, cycle);
      ruleAdmitted = true;
      return evidence;
    } };
  const result = await loop(nyx, builder(false, () => ruleAdmitted ? ["src/rule.txt"] : []), 3, evidenceProvider)
    .run(loopRequest({ availableEvidence: contextPack.availableEvidence, initialFiles: contextPack.files }));
  check(result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.modelCallCount === 3
    && result.evidenceAcquisitions.length === 1 && result.cognitionFailures.length === 1 && result.iterations.length === 1,
    "Νύξ can acquire evidence, correct one invalid intent, and verify a repair within the unchanged three-cycle budget");
  check(result.evidenceAcquisitions[0].authorityGranted === false
    && result.evidenceAcquisitions[0].admittedPaths.join() === "src/rule.txt"
    && result.evidenceAcquisitions[0].cognitionEvidence.modelUsage.totalTokens !== undefined,
    "evidence acquisition remains attributable, read-only, authority-neutral, and resource-accounted");
  check(groundedContext.readOperations === 4 && evidenceExecutor.auditLog().length === 4
    && result.evidenceAcquisitions[0].admittedEvidenceIds[0].startsWith("R1-R3E-CONTEXT:"),
    "existing bounded repair consumes real R1 context evidence without a parallel cognition or execution stack");
}

function loopRequest(overrides: Partial<Parameters<R3BoundedRepairLoop["run"]>[0]> = {}): Parameters<R3BoundedRepairLoop["run"]>[0] {
  return { schemaVersion: 1, repairRequestId: `R3E-REPAIR-${sequence}`,
    objective: "Repair the arithmetic fixture so the repository-native test passes.", initialObservation,
    initialFiles: [{ relativePath: "src/math.txt", content: wrong, contentSha256: hash(wrong) }],
    allowedMutationPaths: ["src/math.txt"],
    availableEvidence: [],
    allowedVerificationToolIds: ["TEST"], baselineExecutions: [{ toolId: "TEST", result: initialExecution }],
    observedAtEpochMs: NOW + 30_000, ...overrides };
}

{
  const nyx = cognition(async () => providerResponse(modelResponse(CORRECT_SOURCE)));
  const result = await loop(nyx).run(loopRequest());
  check(result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.iterations.length === 1, "bounded loop closes a real fail-diagnose-repair-retest cycle in one iteration");
  check(result.iterations[0].applicationDecision === "APPLIED" && result.iterations[0].passed, "Νύξ hypothesis is applied only through R3-A and verified through R3-B");
  check(result.iterations[0].verifications[0].execution.outcome === "PASS"
    && result.iterations[0].verifications[0].observation.state === "TEST_PASS", "real repository-native verification transitions from TEST_FAIL to TEST_PASS");
  check(result.iterations[0].verifications[0].observation.baselineComparison === "RESOLVED", "R3-C identifies the candidate as resolving the baseline failure");
  check(result.iterations[0].hypothesis.applyAuthorized === false && result.authorityGranted === false
    && result.sourceRepositoryWriteAuthority === false && result.productionAuthority === false, "successful loop never converts cognition or isolated action into broader authority");
  check(result.functionalAcceptance === "ACCEPTED" && result.engineeringQualityAcceptance === "NOT_EVALUATED",
    "functional repair success remains explicitly separate from engineering-quality acceptance");
  check(await readFile(join(initial.cloneRoot, "src", "math.txt"), "utf8") === wrong
    && await readFile(join(sourceRoot, "src", "math.txt"), "utf8") === CORRECT_SOURCE, "repair candidate leaves both source and failed predecessor repositories unchanged");
  check(result.evidenceId.startsWith("R3E-EVIDENCE-") && result.iterations[0].cognitionEvidenceId.startsWith("NYX-COGNITION-"), "loop evidence preserves cognition, proposal, application, execution, and observation genealogy");
  check(result.iterations[0].cognitionEvidence.evidenceClass === "E3"
    && result.iterations[0].cognitionEvidence.modelRequestDigest !== null, "loop retains sanitized cognition evidence without granting authority");
  check(result.modelCallCount === 1 && result.lastCognitionEvidence?.evidenceId === result.iterations[0].cognitionEvidenceId,
    "loop counts model calls and preserves the latest sanitized cognition evidence");
}

{
  const responses = [modelResponse(OVERCOMPLEX_SOURCE, {
    causalHypothesis: "Returning the correct export plus extra branching will satisfy the visible arithmetic check.",
    expectedResult: "The repository-native test passes, after which static candidate admission evaluates engineering quality.",
    counterexamples: ["The extra branching violates the public complexity bound even if the arithmetic check passes."],
  }), modelResponse(CORRECT_SOURCE, {
    causalHypothesis: "The correct export alone satisfies behavior without the rejected unnecessary branching.",
    failureInterpretation: "Functional execution passed, but candidate admission rejected the prior strategy for excessive complexity.",
    expectedResult: "Both repository-native verification and public static candidate admission pass.",
    counterexamples: ["Any retained unnecessary branching would repeat the candidate-admission failure."],
  })];
  let calls = 0;
  const result = await loop(cognition(async () => providerResponse(responses[calls++])), builder(), 2).run(loopRequest());
  check(result.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" && result.modelCallCount === 2 && result.iterations.length === 2,
    "functionally passing but statically rejected candidate receives one bounded quality-driven repair and converges");
  check(result.iterations[0].functionallyPassed && !result.iterations[0].passed
    && result.iterations[0].hypothesisDisposition === "PARTIALLY_SUPPORTED"
    && result.iterations[0].candidateAdmission?.decision === "REJECTED"
    && result.iterations[0].candidateAdmission.findings.some((finding) => finding.dimension === "MAINTAINABILITY"
      && finding.code === "COMPLEXITY_LIMIT"),
  "candidate admission preserves functional success while rejecting excessive complexity with public E3 evidence");
  check(result.iterations[1].functionallyPassed && result.iterations[1].passed
    && result.iterations[1].candidateAdmission?.decision === "ADMITTED"
    && result.iterations[1].hypothesis.parentHypothesisId === result.iterations[0].hypothesis.hypothesisId,
  "quality repair preserves hypothesis lineage and admits the exact revised candidate");
  check(result.candidateAdmissionAcceptance === "ACCEPTED" && result.engineeringQualityAcceptance === "NOT_EVALUATED"
    && !result.authorityGranted && !result.sourceRepositoryWriteAuthority && !result.productionAuthority,
  "final admitted candidate is accepted without conflating public admission with independent quality or broader authority");
}

{
  let prepares = 0;
  const truncated = cognition(async () => providerResponse(modelResponse(CORRECT_SOURCE), "length"));
  const candidateBuilder = { builderIdentity: "OMEGA-R3E-TRUNCATION-GUARD",
    prepare: async () => { prepares += 1; throw new Error("must_not_run"); } };
  const result = await loop(truncated, candidateBuilder, 1).run(loopRequest());
  check(result.outcome === "EXHAUSTED" && result.reason === "repair_cognition_correction_budget_exhausted"
    && result.cognitionFailures.length === 1 && result.cognitionFailures[0].reason === "OUTPUT_TRUNCATED" && prepares === 0,
  "length-truncated model output is classified explicitly and never reaches Omega actuation");
  check(result.lastCognitionEvidence?.modelFinishReason === "length" && result.candidateAdmissionAcceptance === "NOT_EVALUATED",
    "truncation and unevaluated admission remain visible in sanitized loop evidence");
}

{
  const validBuilder = builder();
  const admissionTamperBuilder = { builderIdentity: "OMEGA-R3E-ADMISSION-PROVENANCE-TAMPER",
    prepare: async (hypothesis: NyxRepairHypothesis, iteration: number) => {
      const prepared = await validBuilder.prepare(hypothesis, iteration);
      return { ...prepared, application: { ...prepared.application,
        events: prepared.application.events.slice(0, -1) } };
    } };
  const result = await loop(cognition(async () => providerResponse(modelResponse(CORRECT_SOURCE))),
    admissionTamperBuilder, 1).run(loopRequest());
  check(result.outcome === "BLOCKED" && result.reason === "candidate_admission_evidence_insufficient"
    && result.iterations.length === 1 && result.iterations[0].functionallyPassed
    && result.iterations[0].hypothesisDisposition === "INSUFFICIENT_EVIDENCE"
    && result.iterations[0].candidateAdmission?.decision === "INSUFFICIENT_EVIDENCE",
  "candidate-admission provenance failure preserves the already executed and verified attempt in loop evidence");
  check(result.functionalAcceptance === "ACCEPTED" && result.candidateAdmissionAcceptance === "INSUFFICIENT_EVIDENCE"
    && result.evidenceId.startsWith("R3E-EVIDENCE-"),
  "functional evidence remains distinct from an insufficient static-admission evidence package");
}

{
  const nyx = cognition(async () => providerResponse(modelResponse(OTHER_WRONG_SOURCE)));
  const result = await loop(nyx, builder(), 1).run(loopRequest());
  check(result.outcome === "EXHAUSTED" && result.reason === "repair_iteration_budget_exhausted" && result.iterations.length === 1,
    "unsuccessful repair stops exactly at the iteration budget");
  check(result.iterations[0].verifications[0].observation.state === "TEST_FAIL" && !result.iterations[0].passed,
    "failed repair generation is preserved with its execution and observation evidence");
}

{
  const nyx = cognition(async () => providerResponse(modelResponse(CORRECT_SOURCE)));
  const result = await loop(nyx, builder(true), 1).run(loopRequest());
  check(result.outcome === "BLOCKED" && result.reason === "omega_prepared_candidate_provenance_invalid" && result.iterations.length === 0,
    "candidate claiming source mutation is rejected before verification execution");
}

{
  let prepares = 0;
  const nyx = cognition(async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
  const candidateBuilder = { builderIdentity: "OMEGA-R3E-UNUSED", prepare: async () => { prepares += 1; throw new Error("must_not_run"); } };
  const result = await loop(nyx, candidateBuilder, 1).run(loopRequest());
  check(result.outcome === "COGNITION_ERROR" && result.reason.includes("nvidia_provider_http_503") && prepares === 0,
    "cognition failure stops before Omega candidate preparation");
  check(result.modelCallCount === 1 && result.lastCognitionEvidence?.modelEvidenceId.startsWith("NVIDIA-NIM-"),
    "failed cognition remains attributable instead of disappearing from the evidence record");
  const invalid = await loop(cognition(async () => new Response("{}")), candidateBuilder, 1).run(loopRequest({ initialObservation: {
    ...initialObservation, state: "TEST_PASS" } }));
  check(invalid.outcome === "BLOCKED" && invalid.reason === "bounded_repair_request_invalid", "repair loop rejects non-failing initial state");
  const missingMutationScope = await loop(cognition(async () => new Response("{}")), candidateBuilder, 1).run({
    ...loopRequest(), allowedMutationPaths: undefined,
  } as unknown as Parameters<R3BoundedRepairLoop["run"]>[0]);
  check(missingMutationScope.outcome === "BLOCKED" && missingMutationScope.reason === "bounded_repair_request_invalid",
    "repair loop fails closed when explicit mutation scope is absent");
}

let configRejected = "";
try { R3BoundedRepairLoop.create({ loopId: "BAD", evaluatorVersion: "1", observerIdentity: "observer",
  cognition: cognition(async () => new Response("{}")), candidateBuilder: builder(), maxIterations: 0, maxWallClockMs: 100,
  maxChangesPerIteration: 1, maxPatchBytesPerIteration: 1, maxDiagnosisCharacters: 1 }); }
catch (error) { configRejected = error instanceof Error ? error.message : "unknown"; }
check(configRejected === "bounded_repair_loop_configuration_invalid", "zero/unbounded iteration configuration is rejected");

assert(R3_E_BOUNDED_REPAIR_LOOP_STATUS.newCapability === "BOUNDED_OBSERVE_DIAGNOSE_REPAIR_RETEST_LOOP", "chunk reports the first closed-loop engineering capability");
assert(R3_E_BOUNDED_REPAIR_LOOP_STATUS.cognition === "NYX_NVIDIA_NEMOTRON_3_ULTRA"
  && R3_E_BOUNDED_REPAIR_LOOP_STATUS.actuation === "OMEGA_R3_A_R3_B", "loop preserves Νύξ cognition and Omega actuation separation");
assert(!R3_E_BOUNDED_REPAIR_LOOP_STATUS.unboundedAutonomy && !R3_E_BOUNDED_REPAIR_LOOP_STATUS.authorityGranted,
  "repair loop is bounded and grants no production/source authority");

await rm(parent, { recursive: true, force: true });
console.log(`Omega R3-E bounded repair loop tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
