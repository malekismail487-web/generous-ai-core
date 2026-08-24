import {
  CONTROLLED_MUTATION_CRITICAL_PATH,
  OMEGA_R2_A_SPEC_EVAL_001,
  R2_A_ADVERSARIAL_CASES,
  assessR2AImplementationEligibility,
  validateR2ACleanupObservation,
  validateR2AIdentityObservation,
  validateR2AProvisioningRequest,
  validateR2ASpecification,
  type R2ACleanupObservation,
  type R2AIdentityObservation,
  type R2AProvisioningRequest,
  type R2ASandboxProvisioningSpec,
} from "../src/lib/codelab/executor/r2SandboxProvisioningSpec";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(label);
    console.error(`  x ${label}`);
  }
}

function spec(overrides: Partial<R2ASandboxProvisioningSpec> = {}): R2ASandboxProvisioningSpec {
  return { ...structuredClone(OMEGA_R2_A_SPEC_EVAL_001), ...overrides };
}

function request(overrides: Partial<R2AProvisioningRequest> = {}): R2AProvisioningRequest {
  return {
    schemaVersion: 1,
    requestId: "OMEGA-R2-A-REQUEST-001",
    authority: "WRITE_SANDBOX",
    issuer: "OMEGA-INSTITUTIONAL-AUTHORITY",
    auditIdentity: "OMEGA-AUDIT-R2-A-001",
    repositoryRoot: "C:/omega/repository",
    approvedSandboxRoot: "C:/omega-sandboxes",
    requestedSandboxName: "task-001",
    issuedAtEpochMs: 1_000,
    expiresAtEpochMs: 2_000,
    limits: {
      maxLifetimeMs: 1_000,
      maxNestingDepth: 2,
      maxEntries: 64,
      maxTotalBytes: 8_000_000,
    },
    readScopes: [],
    writeScopes: ["task-001"],
    ...overrides,
  };
}

function identity(overrides: Partial<R2AIdentityObservation> = {}): R2AIdentityObservation {
  return {
    requestId: "OMEGA-R2-A-REQUEST-001",
    canonicalRepositoryRoot: "C:/omega/repository",
    canonicalApprovedSandboxRoot: "C:/omega-sandboxes",
    canonicalSandboxPath: "C:/omega-sandboxes/task-001",
    targetIdentityAtValidation: "volume-7:file-42",
    targetIdentityAtUse: "volume-7:file-42",
    disjointFromRepository: true,
    evidenceReferences: ["OMEGA-EV-R2-A-IDENTITY"],
    ...overrides,
  };
}

function cleanup(overrides: Partial<R2ACleanupObservation> = {}): R2ACleanupObservation {
  return {
    requestId: "OMEGA-R2-A-REQUEST-001",
    existedBefore: false,
    existsAfterCleanup: false,
    directoryEntriesBefore: [],
    directoryEntriesAfter: [],
    relevantMetadataEquivalent: true,
    cleanupAttempted: true,
    cleanupSucceeded: true,
    evidenceReferences: ["OMEGA-EV-R2-A-CLEANUP"],
    ...overrides,
  };
}

const validSpec = validateR2ASpecification(OMEGA_R2_A_SPEC_EVAL_001);
assert(validSpec.ok, "reference R2-A specification satisfies its executable contract");
assert(OMEGA_R2_A_SPEC_EVAL_001.operationalAuthority === "UNAVAILABLE", "R2-A operational authority remains unavailable");
assert(OMEGA_R2_A_SPEC_EVAL_001.filesystemAdapter === "NONE", "R2-A specification exposes no filesystem adapter");
assert(OMEGA_R2_A_SPEC_EVAL_001.contentMutation === "FORBIDDEN_UNTIL_R2-B", "R2-A cannot mutate file content");
assert(OMEGA_R2_A_SPEC_EVAL_001.observationAuthorityLaw.writeImpliesRead === false, "write authority does not imply observation authority");
assert(OMEGA_R2_A_SPEC_EVAL_001.observationAuthorityLaw.explicitReadGrantRequired, "every read scope remains explicit");
assert(OMEGA_R2_A_SPEC_EVAL_001.evidenceLedgerClaim === "TAMPER_EVIDENT_NOT_SIGNED", "hash-chain terminology is preserved exactly");
assert(OMEGA_R2_A_SPEC_EVAL_001.tokenAuthenticity.cryptographicAuthenticityRequiredNow === false, "process-local design does not claim premature cryptographic authenticity");
assert(OMEGA_R2_A_SPEC_EVAL_001.tokenAuthenticity.mandatoryBefore.includes("CROSS_PROCESS_AUTHORITY"), "token authenticity is mandatory before cross-process authority");
assert(R2_A_ADVERSARIAL_CASES.length === 10, "all ten mandated R2-A adversarial families are represented");
assert(R2_A_ADVERSARIAL_CASES.every((item) => OMEGA_R2_A_SPEC_EVAL_001.adversarialCases.includes(item)), "reference specification includes every adversarial family");
assert(OMEGA_R2_A_SPEC_EVAL_001.rollbackEquivalence.scopedDimensions.includes("RELEVANT_METADATA"), "R2-A rollback equivalence includes metadata");
assert(OMEGA_R2_A_SPEC_EVAL_001.rollbackEquivalence.futureRepositoryDimensions.includes("GIT_INDEX_STATE"), "future repository rollback explicitly includes Git index state");
assert(!validateR2ASpecification(spec({ operationalAuthority: "AVAILABLE" as never })).ok, "operational authority inflation is rejected");
assert(!validateR2ASpecification(spec({ filesystemAdapter: "NODE_FS" as never })).ok, "filesystem adapter exposure is rejected");
assert(!validateR2ASpecification(spec({ contentMutation: "ALLOWED" as never })).ok, "content mutation in R2-A is rejected");
assert(!validateR2ASpecification(spec({ observationAuthorityLaw: { ...OMEGA_R2_A_SPEC_EVAL_001.observationAuthorityLaw, writeImpliesRead: true as never } })).ok, "implicit observation expansion is rejected");
assert(!validateR2ASpecification(spec({ adversarialCases: R2_A_ADVERSARIAL_CASES.slice(1) })).ok, "missing adversarial case is rejected");
assert(!validateR2ASpecification(spec({ evidenceLedgerClaim: "SIGNED" as never })).ok, "tamper evidence cannot be inflated into signing");

const validRequest = request();
assert(validateR2AProvisioningRequest(validRequest, 1_500).ok, "well-bounded future provisioning request satisfies the contract");
assert(validateR2AProvisioningRequest(request({ readScopes: [], writeScopes: ["task-001"] }), 1_500).ok, "write scope remains valid without implied read scope");
assert(!validateR2AProvisioningRequest(request({ approvedSandboxRoot: "C:/omega/repository/sandbox" }), 1_500).ok, "sandbox root inside repository is rejected");
assert(!validateR2AProvisioningRequest(request({ approvedSandboxRoot: "C:/omega" }), 1_500).ok, "sandbox root containing repository is rejected");
assert(!validateR2AProvisioningRequest(request({ requestedSandboxName: "../escape" }), 1_500).ok, "path traversal sandbox name is rejected");
assert(!validateR2AProvisioningRequest(request({ requestedSandboxName: "a/b/c" }), 1_500).ok, "excessive nesting is rejected");
assert(!validateR2AProvisioningRequest(request({ requestedSandboxName: "C:/omega/repository" }), 1_500).ok, "absolute sandbox name is rejected");
assert(!validateR2AProvisioningRequest(validRequest, 2_000).ok, "expired provisioning request is rejected");
assert(!validateR2AProvisioningRequest(request({ expiresAtEpochMs: 2_001 }), 1_500).ok, "request lifetime beyond its bound is rejected");
assert(!validateR2AProvisioningRequest(request({ writeScopes: [] }), 1_500).ok, "provisioning requires an explicit write scope");
assert(!validateR2AProvisioningRequest(request({ auditIdentity: "" }), 1_500).ok, "provisioning requires audit identity");
assert(!validateR2AProvisioningRequest(request({ limits: { ...validRequest.limits, maxEntries: 0 } }), 1_500).ok, "invalid resource bound is rejected");

assert(validateR2AIdentityObservation(validRequest, identity()).ok, "stable canonical target identity satisfies the future evidence contract");
assert(!validateR2AIdentityObservation(validRequest, identity({ canonicalSandboxPath: "C:/omega/repository" })).ok, "repository root cannot become sandbox identity");
assert(!validateR2AIdentityObservation(validRequest, identity({ canonicalSandboxPath: "C:/outside/task-001" })).ok, "sandbox outside approved root is rejected");
assert(!validateR2AIdentityObservation(validRequest, identity({ targetIdentityAtUse: "volume-7:file-99" })).ok, "TOCTOU target identity change is rejected");
assert(!validateR2AIdentityObservation(validRequest, identity({ evidenceReferences: [] })).ok, "canonical identity requires attributable evidence");
assert(!validateR2AIdentityObservation(validRequest, identity({ disjointFromRepository: false })).ok, "negative disjointness observation is rejected");

assert(validateR2ACleanupObservation(cleanup()).ok, "complete cleanup observation establishes scoped equivalence");
assert(!validateR2ACleanupObservation(cleanup({ existsAfterCleanup: true as never })).ok, "remaining sandbox fails cleanup equivalence");
assert(!validateR2ACleanupObservation(cleanup({ directoryEntriesAfter: ["orphan"] as never })).ok, "orphan entry fails cleanup equivalence");
assert(!validateR2ACleanupObservation(cleanup({ relevantMetadataEquivalent: false as never })).ok, "metadata divergence fails cleanup equivalence");
assert(!validateR2ACleanupObservation(cleanup({ cleanupSucceeded: false as never })).ok, "cleanup failure is rejected");
assert(!validateR2ACleanupObservation(cleanup({ evidenceReferences: [] })).ok, "cleanup claim requires evidence");

const currentEligibility = assessR2AImplementationEligibility({
  securityContainment: "UNKNOWN",
  r1Preserved: "VERIFIED",
  specificationValid: "VERIFIED",
});
assert(currentEligibility.decision === "INELIGIBLE", "current R2-A implementation eligibility remains INELIGIBLE");
assert(currentEligibility.blockers.includes("credential_containment_unresolved"), "credential containment remains the controlling blocker");
assert(assessR2AImplementationEligibility({ securityContainment: "REVOKED_AND_VERIFIED", r1Preserved: "FAILED", specificationValid: "VERIFIED" }).decision === "INELIGIBLE", "later authority cannot bypass an R1 regression");
assert(assessR2AImplementationEligibility({ securityContainment: "REVOKED_AND_VERIFIED", r1Preserved: "VERIFIED", specificationValid: "UNVERIFIED" }).decision === "INELIGIBLE", "unverified R2-A specification blocks implementation");
assert(assessR2AImplementationEligibility({ securityContainment: "REVOKED_AND_VERIFIED", r1Preserved: "VERIFIED", specificationValid: "VERIFIED" }).decision === "ELIGIBLE_FOR_R2_A_IMPLEMENTATION", "only the fully satisfied prerequisite gate is eligible");

assert(CONTROLLED_MUTATION_CRITICAL_PATH[0].status === "BLOCKED_EXTERNAL", "critical path records SEC-003 as externally blocked");
assert(CONTROLLED_MUTATION_CRITICAL_PATH.find((item) => item.chunkId === "OMEGA-R2-A-001")?.blockedBy.includes("OMEGA-SEC-003"), "R2-A is blocked by SEC-003");
assert(CONTROLLED_MUTATION_CRITICAL_PATH.find((item) => item.chunkId === "OMEGA-ASSURE-R2-001")?.blockedBy.length === 7, "R2 assurance remains blocked by operational R2-A through R2-G");

console.log(`Omega R2-A spec/eval tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
