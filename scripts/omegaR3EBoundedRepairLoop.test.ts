import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NyxNemotronEngineeringCognition, type NyxRepairHypothesis } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop, R3_E_BOUNDED_REPAIR_LOOP_STATUS, type OmegaPreparedRepairCandidate } from "../src/lib/codelab/engine/r3BoundedRepairLoop";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition, type R3BExecutionRequest, type R3BExecutionResult } from "../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
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

const VERIFY_SOURCE = `import { readFileSync } from "node:fs"; const value = readFileSync(new URL("../src/math.txt", import.meta.url), "utf8"); if (value === "2+2=4") console.log("TEST_PASS math"); else { console.error("FAIL tests/math > expected 2+2=4"); process.exit(2); }`;
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
await writeFile(join(sourceRoot, "src", "math.txt"), "2+2=4", "utf8"); await writeFile(join(sourceRoot, "tools", "verify.mjs"), VERIFY_SOURCE, "utf8");
const wrong = "2+2=5";
const initial = await applyChange(sourceRoot, { kind: "MODIFY", relativePath: "src/math.txt", expectedBaseHash: hash("2+2=4"),
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

function modelResponse(replacement: string): string {
  return JSON.stringify({ diagnosis: "The arithmetic fixture contains the wrong result.", assumptions: ["The verifier encodes intended behavior."],
    changes: [{ kind: "MODIFY", relativePath: "src/math.txt", expectedBaseHash: hash(wrong), replacementContent: replacement }],
    verificationToolIds: ["TEST"], confidence: 0.99 });
}

function builder(tamper = false) {
  return { builderIdentity: tamper ? "OMEGA-R3E-TAMPER-BUILDER" : "OMEGA-R3E-BUILDER",
    prepare: async (hypothesis: NyxRepairHypothesis, iteration: number): Promise<OmegaPreparedRepairCandidate> => {
      const change = hypothesis.changes[0];
      const pack = await applyChange(initial.cloneRoot, { kind: "MODIFY", relativePath: change.relativePath,
        expectedBaseHash: change.expectedBaseHash, proposedContentHash: change.replacementContentHash,
        proposedContent: change.replacementContent, baselineEvidenceId: `evidence://repair/${iteration}`,
        baselineObservationId: `observation://repair/${iteration}`, sandboxArtifactId: `artifact://repair/${iteration}` }, `repair-${iteration}`);
      const run = await verification(pack, `repair-${iteration}-${sequence}`);
      const content = await readFile(join(pack.cloneRoot, "src", "math.txt"), "utf8");
      return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest, proposal: pack.proposal,
        application: pack.application, verifications: [{ toolId: "TEST", executor: run.executor, request: run.request }],
        files: [{ relativePath: "src/math.txt", content, contentSha256: hash(content) }],
        omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: tamper as unknown as false,
        productionAuthorityGranted: false };
    } };
}

function loop(nyx: NyxNemotronEngineeringCognition, candidateBuilder = builder(), maxIterations = 1): R3BoundedRepairLoop {
  return R3BoundedRepairLoop.create({ loopId: `R3E-LOOP-${sequence}`, evaluatorVersion: "r3-e/1",
    observerIdentity: "OMEGA-R3E-OBSERVER", cognition: nyx, candidateBuilder, maxIterations, maxWallClockMs: 30_000,
    maxChangesPerIteration: 1, maxPatchBytesPerIteration: 1_000, maxDiagnosisCharacters: 1_000 });
}

function loopRequest(overrides: Partial<Parameters<R3BoundedRepairLoop["run"]>[0]> = {}): Parameters<R3BoundedRepairLoop["run"]>[0] {
  return { schemaVersion: 1, repairRequestId: `R3E-REPAIR-${sequence}`,
    objective: "Repair the arithmetic fixture so the repository-native test passes.", initialObservation,
    initialFiles: [{ relativePath: "src/math.txt", content: wrong, contentSha256: hash(wrong) }],
    allowedVerificationToolIds: ["TEST"], baselineExecutions: [{ toolId: "TEST", result: initialExecution }],
    observedAtEpochMs: NOW + 30_000, ...overrides };
}

{
  const nyx = cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelResponse("2+2=4") }, finish_reason: "stop" }] }), { status: 200 }));
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
    && await readFile(join(sourceRoot, "src", "math.txt"), "utf8") === "2+2=4", "repair candidate leaves both source and failed predecessor repositories unchanged");
  check(result.evidenceId.startsWith("R3E-EVIDENCE-") && result.iterations[0].cognitionEvidenceId.startsWith("NYX-COGNITION-"), "loop evidence preserves cognition, proposal, application, execution, and observation genealogy");
  check(result.iterations[0].cognitionEvidence.evidenceClass === "E3"
    && result.iterations[0].cognitionEvidence.modelRequestDigest !== null, "loop retains sanitized cognition evidence without granting authority");
  check(result.modelCallCount === 1 && result.lastCognitionEvidence?.evidenceId === result.iterations[0].cognitionEvidenceId,
    "loop counts model calls and preserves the latest sanitized cognition evidence");
}

{
  const nyx = cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelResponse("2+2=6") } }] }), { status: 200 }));
  const result = await loop(nyx, builder(), 1).run(loopRequest());
  check(result.outcome === "EXHAUSTED" && result.reason === "repair_iteration_budget_exhausted" && result.iterations.length === 1,
    "unsuccessful repair stops exactly at the iteration budget");
  check(result.iterations[0].verifications[0].observation.state === "TEST_FAIL" && !result.iterations[0].passed,
    "failed repair generation is preserved with its execution and observation evidence");
}

{
  const nyx = cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelResponse("2+2=4") } }] }), { status: 200 }));
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
