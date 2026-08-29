import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal } from "../src/lib/codelab/executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest, type R3AApplyResult } from "../src/lib/codelab/executor/r3DisposablePatchApplication";
import {
  R3_B_ISOLATED_CANDIDATE_STATUS,
  R3BControlledEngineeringExecutor,
  type R3BControlledExecutionConfig,
  type R3BEngineeringToolDefinition,
  type R3BExecutionRequest,
} from "../src/lib/codelab/executor/r3ControlledEngineeringExecution";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const NOW = Date.now();
function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

interface Harness {
  readonly label: string;
  readonly parent: string;
  readonly sourceRoot: string;
  readonly cloneRoot: string;
  readonly outsideFile: string;
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly applicator: R3ADisposablePatchApplicator;
  readonly applied: R3AApplyResult;
  readonly config: R3BControlledExecutionConfig;
}

const TOOL_SOURCES = Object.freeze({
  pass: `console.log("BUILD_OK");`,
  fail: `console.error("src/candidate.ts(3,7): error TS2322: candidate failure"); process.exit(2);`,
  output: `console.log("x".repeat(100000));`,
  timeout: `setInterval(() => {}, 1000);`,
  delayedPass: `setTimeout(() => console.log("DELAYED_PASS"), 250);`,
  secretOutput: `console.log("nvapi-" + "A".repeat(32));`,
  allowedMutation: `import { writeFileSync } from "node:fs"; writeFileSync(new URL("../generated/artifact.txt", import.meta.url), "artifact"); console.log("ARTIFACT_WRITTEN");`,
  unexpectedMutation: `import { writeFileSync } from "node:fs"; writeFileSync(new URL("../src/candidate.txt", import.meta.url), "unauthorized");`,
  childAttempt: `import { spawnSync } from "node:child_process"; try { const result = spawnSync(process.execPath, ["--eval", "process.exit(0)"]); console.log(result.error?.code === "ERR_ACCESS_DENIED" ? "CHILD_BLOCKED" : "CHILD_NOT_BLOCKED"); if (!result.error) process.exit(9); } catch (error) { console.log(error?.code === "ERR_ACCESS_DENIED" ? "CHILD_BLOCKED" : "CHILD_ERROR"); }`,
} as const);

function provisionRequest(config: R2AIsolatedLifecycleConfig, label: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId: `R3B-PROVISION-${label}`, capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX", requestedPath: `sandbox-${label}`, repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 300_000,
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

function patchProposal(sourceRoot: string): R2GPatchProposal {
  const changes = Object.freeze([{ kind: "MODIFY" as const, relativePath: "src/candidate.txt", expectedBaseHash: hash("base"),
    proposedContentHash: hash("candidate"), proposedContent: "candidate", baselineEvidenceId: "evidence://r3b/base",
    baselineObservationId: "observation://r3b/base", sandboxArtifactId: "artifact://r3b/candidate" }]);
  const base = { schemaVersion: 1 as const, proposalId: "R3B-REVIEWED-PROPOSAL", requestId: "R3B-PROPOSAL-REQUEST",
    repositoryRoot: sourceRoot, baseCandidateCommit: CANDIDATE, changes, applyAuthorized: false as const,
    rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: hash(canonical(base)) });
}

async function makeHarness(label: string): Promise<Harness> {
  const parent = await mkdtemp(join(tmpdir(), `omega-r3b-${label}-`));
  const sourceRoot = join(parent, "source repository");
  const sandboxRoot = join(parent, "approved sandboxes");
  const outsideFile = join(parent, "outside-canary.txt");
  await mkdir(join(sourceRoot, "src"), { recursive: true });
  await mkdir(join(sourceRoot, "tools"));
  await mkdir(join(sourceRoot, "generated"));
  await mkdir(sandboxRoot);
  await writeFile(join(sourceRoot, "src", "candidate.txt"), "base", "utf8");
  for (const [name, source] of Object.entries(TOOL_SOURCES)) await writeFile(join(sourceRoot, "tools", `${name}.mjs`), source, "utf8");
  await writeFile(join(sourceRoot, "tools", "outside.mjs"), `import { writeFileSync } from "node:fs"; try { writeFileSync(${JSON.stringify(outsideFile)}, "escape"); console.log("OUTSIDE_WRITTEN"); process.exit(8); } catch (error) { console.log(error?.code === "ERR_ACCESS_DENIED" ? "OUTSIDE_BLOCKED" : "OUTSIDE_ERROR"); }`, "utf8");
  const canonicalSource = await realpath(sourceRoot);
  const r1 = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-R3B-${label}`, tokenId: `R1-R3B-TOKEN-${label}`,
    repositoryRoot: canonicalSource, resourceScopes: ["."], issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 350_000,
    constraints: { maxFileBytes: 200_000, maxDirectoryEntries: 100, allowedExtensions: [".txt", ".mjs"] },
    issuer: "OMEGA-R3B-TEST", auditIdentity: `R1-R3B-AUDIT-${label}` });
  const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-R3B-${label}`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "r3-b-eval/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: canonicalSource, approvedSandboxRoot: await realpath(sandboxRoot),
    capability: { capabilityId: `R2A-R3B-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2A-R3B-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 340_000 } };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label), NOW);
  if (!provisioned.sandbox) throw new Error(`r3b_sandbox_provision_failed:${provisioned.reason}`);
  const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
  await cp(canonicalSource, cloneRoot, { recursive: true, errorOnExist: true, force: false });
  const proposal = patchProposal(canonicalSource);
  const applicator = await R3ADisposablePatchApplicator.create({ executorId: `R3A-R3B-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r3-b-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: canonicalSource, sourceRepositoryExecutor: r1,
    disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle, proposal,
    capability: { capabilityId: `R3A-R3B-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R3A-R3B-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 330_000 },
    allowedExtensions: [".txt"], maxChanges: 2, maxPatchBytes: 4096 });
  const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `R3A-R3B-REQUEST-${label}`,
    applicationId: `R3A-R3B-APPLICATION-${label}`, proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
    capabilityId: `R3A-R3B-CAP-${label}`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
    issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R3A-R3B-AUDIT-${label}`, observedAtEpochMs: NOW + 5_000 };
  const applied = await applicator.apply(applyRequest);
  if (applied.decision !== "APPLIED") throw new Error(`r3b_candidate_apply_failed:${applied.reason}`);
  const config: R3BControlledExecutionConfig = { executorId: `R3B-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r3-b-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: cloneRoot,
    disposableRepositoryId: applicator.disposableRepositoryId(), applicator, appliedCandidate: applied,
    capability: { capabilityId: `R3B-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R3B-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 320_000 },
    tools: [], maxRepositoryFiles: 100, maxRepositoryBytes: 500_000, maxTimeoutMs: 5_000, maxOutputBytes: 200_000 };
  return { label, parent, sourceRoot: canonicalSource, cloneRoot, outsideFile, sandbox: provisioned.sandbox, lifecycle,
    applicator, applied, config };
}

async function definition(h: Harness, name: keyof typeof TOOL_SOURCES | "outside", overrides: Partial<R3BEngineeringToolDefinition> = {}): Promise<R3BEngineeringToolDefinition> {
  const relativePath = `tools/${name}.mjs`;
  return { toolId: `TOOL-${name.toUpperCase()}`, toolKind: name === "pass" ? "BUILD" : "TEST", toolVersion: "fixture/1",
    entrypoint: relativePath, expectedEntrypointSha256: hash(await readFile(join(h.cloneRoot, relativePath))), arguments: [],
    workingDirectory: ".", timeoutMs: 2_000, maxOutputBytes: 16_384, allowedMutationPrefixes: [], allowChildProcesses: false,
    ...overrides };
}

async function executor(h: Harness, tool: R3BEngineeringToolDefinition): Promise<R3BControlledEngineeringExecutor> {
  return R3BControlledEngineeringExecutor.create({ ...h.config, tools: [tool] });
}

function request(h: Harness, toolId: string, overrides: Partial<R3BExecutionRequest> = {}): R3BExecutionRequest {
  return { schemaVersion: 1, requestId: `R3B-REQUEST-${h.label}`, executionId: `R3B-EXECUTION-${h.label}`,
    authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId, disposableRepositoryId: h.config.disposableRepositoryId,
    applicationId: h.applied.applicationId, proposalDigest: h.applied.proposalDigest,
    capabilityId: h.config.capability.capabilityId, issuer: h.config.capability.issuer,
    auditIdentity: h.config.capability.auditIdentity, environmentIdentity: h.config.environmentIdentity,
    observedAtEpochMs: NOW + 10_000, ...overrides };
}

async function cleanup(h: Harness): Promise<void> { await rm(h.parent, { recursive: true, force: true }); }

{
  const h = await makeHarness("pass"); const tool = await definition(h, "pass"); const runner = await executor(h, tool);
  const result = await runner.execute(request(h, tool.toolId));
  check(result.outcome === "PASS" && result.evidence.exitCode === 0 && result.evidence.stdout.includes("BUILD_OK"), "reviewed build entrypoint executes and returns bounded PASS evidence");
  check(result.evidence.toolKind === "BUILD" && result.evidence.toolIdentityDigest.length === 64, "evidence binds the semantic tool kind and exact tool identity");
  check(result.evidence.prestateManifestDigest === result.evidence.poststateManifestDigest && result.evidence.changedPaths.length === 0, "read-only build proves repository state remained unchanged");
  check(result.evidence.environment.networkAllowed === false && result.evidence.environment.credentialEnvironmentForwarded === false, "execution evidence records denied network and credential inheritance");
  check(!("runCommand" in runner) && !("shell" in runner) && !("writeRepository" in runner), "executor exposes no arbitrary command, shell, or source-write method");
  const replay = await runner.execute(request(h, tool.toolId, { requestId: "REPLAY" }));
  check(replay.outcome === "BLOCKED" && replay.reason.includes("already_used"), "single-use execution capability rejects replay");
  check(await readFile(join(h.sourceRoot, "src", "candidate.txt"), "utf8") === "base", "source repository remains unchanged after process execution");
  await cleanup(h);
}

{
  const h = await makeHarness("failure"); const tool = await definition(h, "fail", { toolKind: "TYPECHECK" });
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "FAIL" && result.evidence.exitCode === 2 && result.evidence.stderr.includes("TS2322"), "nonzero typecheck result is preserved as FAIL with diagnostic evidence");
  check(result.evidence.toolKind === "TYPECHECK" && result.reason === "engineering_tool_failed", "tool failure is classified without becoming infrastructure failure");
  await cleanup(h);
}

{
  const h = await makeHarness("allowed-mutation"); const tool = await definition(h, "allowedMutation", { toolKind: "BUILD", allowedMutationPrefixes: ["generated"] });
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "PASS" && result.evidence.changedPaths.includes("generated/artifact.txt"), "authorized generated-artifact write executes inside declared mutation scope");
  check(result.evidence.unexpectedMutationPaths.length === 0 && await readFile(join(h.cloneRoot, "generated", "artifact.txt"), "utf8") === "artifact", "allowed artifact is observed without widening source authority");
  await cleanup(h);
}

{
  const h = await makeHarness("concurrent-mutation"); const tool = await definition(h, "delayedPass", { toolKind: "TEST" });
  const execution = (await executor(h, tool)).execute(request(h, tool.toolId));
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 75));
  await writeFile(join(h.cloneRoot, "src", "candidate.txt"), "concurrent-unowned-change", "utf8");
  const result = await execution;
  check(result.outcome === "BLOCKED" && result.reason === "unexpected_repository_mutation", "concurrent unowned mutation is detected even when the test process exits successfully");
  check(result.evidence.unexpectedMutationPaths.includes("src/candidate.txt"), "unexpected mutation evidence identifies the exact affected path");
  await cleanup(h);
}

{
  const h = await makeHarness("redaction"); const tool = await definition(h, "secretOutput", { toolKind: "TEST" });
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "PASS" && result.evidence.toolKind === "TEST", "reviewed test entrypoint executes through the same closed tool catalog");
  check(result.evidence.stdout.includes("[REDACTED_SECRET]") && !result.evidence.stdout.includes("nvapi-"), "secret-shaped process output is redacted before evidence admission");
  await cleanup(h);
}

{
  const h = await makeHarness("unexpected-mutation"); const tool = await definition(h, "unexpectedMutation");
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "FAIL" && result.evidence.stderr.includes("ERR_ACCESS_DENIED"), "permission seatbelt prevents undeclared source mutation before it occurs");
  check(await readFile(join(h.cloneRoot, "src", "candidate.txt"), "utf8") === "candidate", "denied mutation leaves applied candidate intact");
  await cleanup(h);
}

{
  const h = await makeHarness("outside"); const tool = await definition(h, "outside");
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "PASS" && result.evidence.stdout.includes("OUTSIDE_BLOCKED") && !existsSync(h.outsideFile), "real outside-path write is denied by the process permission boundary");
  await cleanup(h);
}

{
  const h = await makeHarness("output"); const tool = await definition(h, "output", { maxOutputBytes: 256 });
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "BLOCKED" && result.reason === "engineering_tool_output_limit_exceeded", "oversized output is bounded and blocks the execution");
  check(result.evidence.outputTruncated && Buffer.byteLength(result.evidence.stdout) + Buffer.byteLength(result.evidence.stderr) <= 256, "captured output never exceeds configured byte budget");
  await cleanup(h);
}

{
  const h = await makeHarness("timeout"); const tool = await definition(h, "timeout", { timeoutMs: 150 });
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "TIMEOUT" && result.evidence.processTreeTerminationAttempted, "timeout terminates the process tree and emits TIMEOUT evidence");
  await cleanup(h);
}

{
  const h = await makeHarness("child"); const tool = await definition(h, "childAttempt");
  const result = await (await executor(h, tool)).execute(request(h, tool.toolId));
  check(result.outcome === "PASS" && result.evidence.stdout.includes("CHILD_BLOCKED"), "child-process creation is denied and cannot leak a descendant process");
  let rejected = "";
  try { await R3BControlledEngineeringExecutor.create({ ...h.config, tools: [{ ...tool, allowChildProcesses: true }] }); }
  catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
  check(rejected === "engineering_tool_child_process_scope_not_supported", "catalog admission cannot enable child-process authority");
  await cleanup(h);
}

{
  const h = await makeHarness("requests"); const tool = await definition(h, "pass");
  const unknown = await (await executor(h, tool)).execute(request(h, "UNREGISTERED"));
  check(unknown.outcome === "BLOCKED" && unknown.reason.includes("unsupported_engineering_tool"), "unsupported tool request fails closed without command interpretation");
  const h2 = await makeHarness("environment-mismatch"); const tool2 = await definition(h2, "pass");
  const environmentMismatch = await (await executor(h2, tool2)).execute(request(h2, tool2.toolId, { environmentIdentity: "wrong-environment" }));
  check(environmentMismatch.outcome === "BLOCKED" && environmentMismatch.reason.includes("environment_mismatch"), "environment identity mismatch blocks execution");
  const h3 = await makeHarness("expired"); const tool3 = await definition(h3, "pass");
  const expired = await (await executor(h3, tool3)).execute(request(h3, tool3.toolId, { observedAtEpochMs: h3.config.capability.expiresAtEpochMs }));
  check(expired.outcome === "BLOCKED" && expired.reason.includes("capability_expired"), "expired process-local capability blocks execution");
  const h4 = await makeHarness("malformed"); const tool4 = await definition(h4, "pass");
  const malformed = await (await executor(h4, tool4)).execute({ ...request(h4, tool4.toolId), requestId: "" });
  check(malformed.outcome === "BLOCKED" && malformed.reason.includes("request_malformed"), "malformed request blocks execution");
  await cleanup(h); await cleanup(h2); await cleanup(h3); await cleanup(h4);
}

{
  const h = await makeHarness("stale"); const tool = await definition(h, "pass"); const runner = await executor(h, tool);
  await writeFile(join(h.cloneRoot, "stale.txt"), "external-change", "utf8");
  const stale = await runner.execute(request(h, tool.toolId));
  check(stale.outcome === "BLOCKED" && stale.reason.includes("stale_or_replaced"), "unobserved repository-state change blocks stale candidate execution");
  await cleanup(h);
}

{
  const h = await makeHarness("tool-substitution"); const tool = await definition(h, "pass"); const runner = await executor(h, tool);
  await writeFile(join(h.cloneRoot, tool.entrypoint), "console.log('substituted')", "utf8");
  const changed = await runner.execute(request(h, tool.toolId));
  check(changed.outcome === "BLOCKED" && changed.reason.includes("engineering_tool_identity_changed"), "entrypoint substitution after admission blocks execution");
  await cleanup(h);
}

{
  const h = await makeHarness("replacement"); const tool = await definition(h, "pass"); const runner = await executor(h, tool);
  const original = `${h.cloneRoot}-original`; await rename(h.cloneRoot, original); await mkdir(h.cloneRoot);
  const replacement = await runner.execute(request(h, tool.toolId));
  check(replacement.outcome === "BLOCKED" && (replacement.reason.includes("stale_or_replaced") || replacement.reason.includes("preflight_observation_failed")), "repository replacement between admission and use blocks execution");
  await cleanup(h);
}

{
  const h = await makeHarness("definition"); const tool = await definition(h, "pass");
  let wrongHash = ""; try { await R3BControlledEngineeringExecutor.create({ ...h.config, tools: [{ ...tool, expectedEntrypointSha256: "0".repeat(64) }] }); }
  catch (error) { wrongHash = error instanceof Error ? error.message : "unknown"; }
  check(wrongHash === "engineering_tool_identity_mismatch", "catalog rejects executable identity mismatch");
  let cwdEscape = ""; try { await R3BControlledEngineeringExecutor.create({ ...h.config, tools: [{ ...tool, workingDirectory: ".." }] }); }
  catch (error) { cwdEscape = error instanceof Error ? error.message : "unknown"; }
  check(cwdEscape === "engineering_tool_definition_invalid", "catalog rejects working-directory traversal");
  let unsupportedMutation = ""; try { await R3BControlledEngineeringExecutor.create({ ...h.config, tools: [{ ...tool, allowedMutationPrefixes: ["missing"] }] }); }
  catch (error) { unsupportedMutation = error instanceof Error ? error.message : "unknown"; }
  check(unsupportedMutation === "engineering_tool_mutation_scope_invalid", "catalog rejects nonexistent mutation scope");
  await cleanup(h);
}

assert(R3_B_ISOLATED_CANDIDATE_STATUS.newCapability === "CONTROLLED_BUILD_TEST_EXECUTION", "chunk reports exact R3-B capability gain");
assert(R3_B_ISOLATED_CANDIDATE_STATUS.isolation === "PROCESS_LOCAL_NODE_PERMISSION_SEATBELT_NOT_HOSTILE_CODE_SANDBOX", "isolation claim explicitly avoids hostile-code sandbox overstatement");
assert(R3_B_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R3_B_ISOLATED_CANDIDATE_STATUS.productionEligible, "R3-B remains implemented and verified only in isolation");
assert(R3_B_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("GENERAL_SHELL")
  && R3_B_ISOLATED_CANDIDATE_STATUS.forbiddenCapabilities.includes("NETWORK"), "general shell and network authority remain unavailable");

console.log(`Omega R3-B controlled execution tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
