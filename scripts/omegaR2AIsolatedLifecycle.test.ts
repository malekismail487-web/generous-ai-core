import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, realpath, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { reconstructR2AAudit } from "./evaluation/audit-reconstruction/evaluator";
import { evaluateR2ANegativeCapabilities } from "./evaluation/r2-negative-capability/evaluator";
import {
  R2_A_ISOLATED_CANDIDATE_STATUS,
  R2AIsolatedSandboxLifecycle,
  type R2AIsolatedLifecycleConfig,
  type R2ATerminationRequest,
} from "../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const REPOSITORY = await realpath(resolve("."));
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY, encoding: "utf8" }).trim();
const NOW = Date.now();

async function harness(label: string): Promise<{ root: string; config: R2AIsolatedLifecycleConfig }> {
  const root = await mkdtemp(join(tmpdir(), `omega-r2a-${label}-`));
  const config: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1",
    evaluatorVersion: "r2-a-isolated-eval/1",
    environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: REPOSITORY,
    approvedSandboxRoot: await realpath(root),
    capability: {
      capabilityId: `CAP-${label}`,
      issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000,
      expiresAtEpochMs: NOW + 60_000,
    },
  };
  return { root, config };
}

function provision(config: R2AIsolatedLifecycleConfig, requestId: string, requestedPath = `sandbox-${requestId}`, overrides: Partial<SandboxProvisionRequest> = {}): SandboxProvisionRequest {
  return {
    schemaVersion: 1,
    requestId,
    capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX",
    requestedPath,
    repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 30_000,
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    candidateBinding: {
      commit: config.candidateCommit,
      capabilityVersion: config.capabilityVersion,
      schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion,
      environmentIdentity: config.environmentIdentity,
    },
    ...overrides,
  };
}

function terminate(config: R2AIsolatedLifecycleConfig, requestId: string, overrides: Partial<R2ATerminationRequest> = {}): R2ATerminationRequest {
  return {
    schemaVersion: 1,
    requestId,
    capabilityId: config.capability.capabilityId,
    authority: "TERMINATE_SANDBOX",
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 2_000,
    ...overrides,
  };
}

{
  const { root, config } = await harness("lifecycle");
  const manager = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  const created = await manager.provision(provision(config, "REQ-LIFECYCLE"), NOW);
  assert(created.decision === "PROVISIONED" && created.sandbox !== null, "real empty sandbox is provisioned");
  assert(created.sandbox !== null && existsSync(created.sandbox.canonicalPath), "provisioned sandbox exists on the host filesystem");
  assert(created.sandbox !== null && (await readdir(created.sandbox.canonicalPath)).length === 0, "R2-A sandbox begins empty");
  assert(created.events.length === 6, "provisioning emits all six pre-termination semantic events");
  const removed = await manager.terminate(terminate(config, "REQ-LIFECYCLE"));
  assert(removed.decision === "TERMINATED", "authorized termination succeeds");
  assert(created.sandbox !== null && !existsSync(created.sandbox.canonicalPath), "termination removes the exact sandbox object");
  assert((await readdir(root)).length === 0, "approved root is restored to its empty base state");
  const reconstructed = reconstructR2AAudit(removed.events);
  assert(reconstructed.decision === "COMPLETE", "hash-chained lifecycle reconstructs from all mandatory events");
  assert(reconstructed.authorityAfterward === "REVOKED", "single-use capability is revoked after cleanup");
  assert(manager.capabilityProfile().revoked && manager.capabilityProfile().activeSandboxes === 0, "manager exposes terminal revoked state");
  assert(removed.evidenceClass === "E3" && removed.authorityGranted === false, "local host evidence is E3 and grants no institutional authority");
  assert(!("writeFile" in manager) && !("executeShell" in manager) && !("fetch" in manager), "candidate exposes no content, shell, or network operation");
  assert((await manager.provision(provision(config, "REQ-AFTER-REVOKE"), NOW + 3_000)).reason.includes("capability_revoked"), "provisioning after revocation fails closed");
  assert((await manager.terminate(terminate(config, "UNKNOWN"))).reason === "unknown_or_stale_sandbox", "unknown termination is rejected");
  await rmdir(root);
}

{
  const { root, config } = await harness("adversarial");
  const manager = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  assert((await manager.provision(provision(config, "REQ-TRAVERSAL", "../escape"), NOW)).decision === "REJECTED", "path traversal is rejected without mutation");
  assert((await manager.provision(provision(config, "REQ-ABSOLUTE", REPOSITORY), NOW)).decision === "REJECTED", "absolute repository target is rejected");
  assert((await manager.provision(provision(config, "REQ-WRONG-CAP", "wrong-cap", { capabilityId: "UNAUTHORIZED" }), NOW)).decision === "REJECTED", "unauthorized capability identity is rejected");
  assert((await manager.provision(provision(config, "REQ-EXPIRED", "expired", { expiresAtEpochMs: NOW }), NOW)).decision === "REJECTED", "expired request is rejected");
  assert((await readdir(root)).length === 0, "rejected requests create no filesystem objects");
  await rmdir(root);
}

{
  const { root, config } = await harness("duplicate");
  const manager = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  const first = await manager.provision(provision(config, "REQ-DUP-1", "duplicate"), NOW);
  const duplicate = await manager.provision(provision(config, "REQ-DUP-2", "duplicate"), NOW + 1);
  assert(first.decision === "PROVISIONED" && duplicate.decision === "REJECTED", "duplicate/parallel sandbox identity is rejected");
  await manager.terminate(terminate(config, "REQ-DUP-1"));
  await rmdir(root);
}

{
  const { root, config } = await harness("existing");
  const preexisting = join(root, "occupied");
  await mkdir(preexisting);
  const managerPromise = R2AIsolatedSandboxLifecycle.create(config, NOW);
  await assertRejects(managerPromise, "nonempty approved root is rejected at manager creation");
  await rmdir(preexisting);
  await rmdir(root);
}

{
  const { root, config } = await harness("alias");
  const outside = await mkdtemp(join(tmpdir(), "omega-r2a-outside-"));
  const alias = join(root, "alias");
  let aliasSupported = true;
  try { await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir"); }
  catch { aliasSupported = false; }
  if (aliasSupported) {
    const managerPromise = R2AIsolatedSandboxLifecycle.create(config, NOW);
    await assertRejects(managerPromise, "filesystem alias in approved root prevents manager admission");
    await unlink(alias);
    assert(existsSync(outside), "alias rejection does not mutate its external target");
  } else {
    assert(true, "filesystem alias fixture is explicitly unsupported by this host");
  }
  await rmdir(outside);
  await rmdir(root);
}

{
  const { root, config } = await harness("identity");
  const manager = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  const created = await manager.provision(provision(config, "REQ-IDENTITY"), NOW);
  const path = created.sandbox!.canonicalPath;
  await rmdir(path);
  await mkdir(path);
  const result = await manager.terminate(terminate(config, "REQ-IDENTITY"));
  assert(result.decision === "QUARANTINED" && result.reason === "target_identity_changed", "target replacement is detected and quarantined");
  assert(existsSync(path), "identity mismatch is not followed by destructive cleanup");
  await rmdir(path);
  await rmdir(root);
}

{
  const { root, config } = await harness("contention");
  const manager = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  const created = await manager.provision(provision(config, "REQ-CONTENTION"), NOW);
  const path = created.sandbox!.canonicalPath;
  const foreign = join(path, "foreign.txt");
  await writeFile(foreign, "external test harness mutation", "utf8");
  const result = await manager.terminate(terminate(config, "REQ-CONTENTION"));
  assert(result.decision === "QUARANTINED" && result.reason.includes("sandbox_not_empty"), "nonempty cleanup fails closed instead of recursively deleting content");
  assert(existsSync(foreign), "candidate never deletes externally introduced content");
  await unlink(foreign);
  await rmdir(path);
  await rmdir(root);
}

{
  const { root, config } = await harness("repo-root");
  await rmdir(root);
  await assertRejects(R2AIsolatedSandboxLifecycle.create({ ...config, approvedSandboxRoot: REPOSITORY }, NOW), "repository root cannot become approved sandbox root");
}

const negative = evaluateR2ANegativeCapabilities({
  schemaVersion: 1,
  candidateCommit: CANDIDATE,
  evaluatorVersion: "r2-a-isolated-negative/1",
  baselineAllowed: ["READ_REPOSITORY"],
  candidateAllowed: ["READ_REPOSITORY", "PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
  candidateUnavailable: ["WRITE_SANDBOX", "WRITE_SANDBOX_CONTENT"],
  candidateForbidden: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
  baselineReadScopes: ["repository://approved"],
  candidateReadScopes: ["repository://approved"],
  persistentCapabilitiesAfterRevocation: [],
  evidenceRefs: ["r2a-local://negative-capability-boundary"],
});
assert(negative.decision === "ACCEPT", "independent negative-capability evaluator accepts the exact isolated R2-A delta");
assert(negative.certifiesOperationalCapability === false && negative.grantsAuthority === false, "negative evaluation cannot promote production authority");
assert(R2_A_ISOLATED_CANDIDATE_STATUS.maturity === "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION", "candidate maturity remains isolation-scoped");
assert(R2_A_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_A_ISOLATED_CANDIDATE_STATUS.productionEligible, "blocked SEC-003 keeps authority and production promotion false");

async function assertRejects(promise: Promise<unknown>, label: string): Promise<void> {
  try { await promise; assert(false, label); }
  catch { assert(true, label); }
}

console.log(`Omega R2-A isolated lifecycle tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
