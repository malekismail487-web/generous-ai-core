import { createHash } from "node:crypto";
import {
  OMEGA_R2_DESIGN_001,
  REQUIRED_R2_FORBIDDEN_ACTIONS,
  assessR2ImplementationEligibility,
  canonicalEvidenceJson,
  chainSessionEvidence,
  evaluateBaseState,
  validateSandboxMutationTransaction,
  validateSandboxWriteDesign,
  verifyRollbackProof,
  verifySessionEvidenceChain,
  type R2EligibilityEvidence,
  type RollbackProof,
  type SandboxMutationTransaction,
  type SandboxWriteDesign,
  type SessionEvidenceEvent,
} from "../src/lib/codelab/executor/r2Design";

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

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function design(overrides: Partial<SandboxWriteDesign> = {}): SandboxWriteDesign {
  return { ...structuredClone(OMEGA_R2_DESIGN_001), ...overrides };
}

const oldHash = digest("old-state");
const newHash = digest("new-state");
const removeHash = digest("remove-state");
const createHashValue = digest("created-state");

function transaction(overrides: Partial<SandboxMutationTransaction> = {}): SandboxMutationTransaction {
  return {
    schemaVersion: 1,
    transactionId: "OMEGA-R2-TX-001",
    authority: "WRITE_SANDBOX",
    authorizedRepository: OMEGA_R2_DESIGN_001.repositoryRoot,
    sandboxRoot: OMEGA_R2_DESIGN_001.sandboxRoot,
    authorizedPaths: ["src"],
    baseContentHashes: {
      "src/new.ts": null,
      "src/existing.ts": oldHash,
      "src/remove.json": removeHash,
    },
    proposedMutations: [
      { operation: "CREATE", path: "src/new.ts", expectedBaseSha256: null, proposedSha256: createHashValue, proposedBytes: 13 },
      { operation: "MODIFY", path: "src/existing.ts", expectedBaseSha256: oldHash, proposedSha256: newHash, proposedBytes: 17 },
      { operation: "DELETE", path: "src/remove.json", expectedBaseSha256: removeHash, proposedSha256: null, proposedBytes: 0 },
    ],
    preconditions: ["Observed base hashes still match."],
    expectedPostconditions: ["Only authorized sandbox paths change."],
    rollbackMaterial: [
      { path: "src/new.ts", beforeSha256: null },
      { path: "src/existing.ts", beforeSha256: oldHash },
      { path: "src/remove.json", beforeSha256: removeHash },
    ],
    evidenceReferences: ["Ω-EV-R2-DESIGN-TESTS"],
    expiresAtEpochMs: 20_000,
    authorizationIdentity: "OMEGA-INSTITUTIONAL-AUTHORITY",
    ...overrides,
  };
}

const validDesign = validateSandboxWriteDesign(OMEGA_R2_DESIGN_001);
assert(validDesign.ok, "reference R2 design satisfies its executable specification");
assert(OMEGA_R2_DESIGN_001.implementationState === "DESIGN_ONLY", "R2 remains design-only without operational authority");
assert(OMEGA_R2_DESIGN_001.phases.length === 7 && OMEGA_R2_DESIGN_001.phases.every((phase) => phase.maturity === "SPECIFIED"), "R2-A through R2-G are specified but not implemented");
assert(REQUIRED_R2_FORBIDDEN_ACTIONS.every((action) => OMEGA_R2_DESIGN_001.forbiddenActions.includes(action)), "all higher-authority negative capabilities are explicit");
assert(OMEGA_R2_DESIGN_001.forbiddenActions.includes("WRITE_REPOSITORY"), "repository writes remain forbidden");
assert(OMEGA_R2_DESIGN_001.threatModel.length >= 5, "R2 has an explicit multi-vector threat model");
assert(OMEGA_R2_DESIGN_001.tokenAuthenticity.status === "DESIGNED_NOT_IMPLEMENTED", "token authenticity is not misrepresented as implemented");
assert(!OMEGA_R2_DESIGN_001.tokenAuthenticity.customCryptographicProtocol, "R2 does not invent a custom cryptographic protocol");
assert(OMEGA_R2_DESIGN_001.tokenAuthenticity.establishedPrimitives.includes("HMAC-SHA256"), "design identifies an established MAC primitive");
assert(OMEGA_R2_DESIGN_001.evidenceLedger.securityClaim === "TAMPER_EVIDENT_NOT_SIGNED", "hash chain is not described as a signature");

assert(!validateSandboxWriteDesign(design({ sandboxRoot: OMEGA_R2_DESIGN_001.repositoryRoot })).ok, "sandbox root cannot overlap the repository");
assert(validateSandboxWriteDesign(design({ implementationState: "OPERATIONAL" as never })).issues.includes("r2_authority_must_not_be_operational"), "design validator rejects premature operational authority");
assert(!validateSandboxWriteDesign(design({ forbiddenActions: REQUIRED_R2_FORBIDDEN_ACTIONS.slice(1) })).ok, "missing negative capability is rejected");
assert(!validateSandboxWriteDesign(design({ limits: { ...OMEGA_R2_DESIGN_001.limits, allowedExtensions: [] } })).ok, "empty extension allowlist is rejected");
assert(!validateSandboxWriteDesign(design({ limits: { ...OMEGA_R2_DESIGN_001.limits, maxTotalBytes: 1 } })).ok, "total byte limit cannot be smaller than per-file limit");
assert(!validateSandboxWriteDesign(design({ phases: OMEGA_R2_DESIGN_001.phases.slice(0, 6) })).ok, "incomplete R2 phase progression is rejected");

const validTransaction = transaction();
assert(validateSandboxMutationTransaction(validTransaction, OMEGA_R2_DESIGN_001, 10_000).ok, "complete sandbox mutation transaction is accepted as a proposal");
assert(validTransaction.proposedMutations.length === 3, "create, modify, and delete operations are represented transactionally");
assert(!validateSandboxMutationTransaction(transaction({ authorizedPaths: ["other"] }), OMEGA_R2_DESIGN_001, 10_000).ok, "mutation outside authorized sandbox paths is rejected");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[0], path: "../escape.ts" }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "mutation traversal path is rejected");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[0], path: "src/new.exe" }], baseContentHashes: { "src/new.exe": null }, rollbackMaterial: [{ path: "src/new.exe", beforeSha256: null }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "disallowed mutation extension is rejected");
assert(!validateSandboxMutationTransaction(validTransaction, design({ limits: { ...OMEGA_R2_DESIGN_001.limits, maxFiles: 2 } }), 10_000).ok, "file-count bound is enforced");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[0], proposedBytes: OMEGA_R2_DESIGN_001.limits.maxFileBytes + 1 }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "per-file byte bound is enforced");
assert(!validateSandboxMutationTransaction(validTransaction, design({ limits: { ...OMEGA_R2_DESIGN_001.limits, maxFileBytes: 20, maxTotalBytes: 20 } }), 10_000).ok, "transaction total-byte bound is enforced");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[0], expectedBaseSha256: oldHash }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "create requires an absent base state");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[1], expectedBaseSha256: null }], baseContentHashes: { "src/existing.ts": null }, rollbackMaterial: [{ path: "src/existing.ts", beforeSha256: null }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "modify requires a base hash");
assert(!validateSandboxMutationTransaction(transaction({ proposedMutations: [{ ...validTransaction.proposedMutations[2], proposedSha256: newHash }] }), OMEGA_R2_DESIGN_001, 10_000).ok, "delete requires an absent post-state");
assert(!validateSandboxMutationTransaction(transaction({ baseContentHashes: { ...validTransaction.baseContentHashes, "src/existing.ts": newHash } }), OMEGA_R2_DESIGN_001, 10_000).ok, "base-hash mapping must match mutation precondition");
assert(!validateSandboxMutationTransaction(transaction({ rollbackMaterial: validTransaction.rollbackMaterial.slice(0, 2) }), OMEGA_R2_DESIGN_001, 10_000).ok, "rollback material is an R2 prerequisite");
assert(!validateSandboxMutationTransaction(validTransaction, OMEGA_R2_DESIGN_001, 20_000).ok, "expired mutation transaction fails closed");
assert(!validateSandboxMutationTransaction(transaction({ sandboxRoot: OMEGA_R2_DESIGN_001.repositoryRoot }), OMEGA_R2_DESIGN_001, 10_000).ok, "transaction cannot substitute repository root for sandbox root");
assert(!validateSandboxMutationTransaction(transaction({ authorizationIdentity: "" }), OMEGA_R2_DESIGN_001, 10_000).ok, "transaction requires authorization identity");
assert(!validateSandboxMutationTransaction(transaction({ evidenceReferences: [] }), OMEGA_R2_DESIGN_001, 10_000).ok, "transaction requires evidence references");

assert(evaluateBaseState(validTransaction, validTransaction.baseContentHashes).decision === "BASE_STATE_MATCH", "matching observed base state permits proposal review");
assert(evaluateBaseState(validTransaction, { ...validTransaction.baseContentHashes, "src/existing.ts": newHash }).decision === "REJECT", "changed base hash rejects stale transaction");
assert(evaluateBaseState(validTransaction, { "src/new.ts": null }).decision === "REJECT", "missing base observation rejects transaction");

const validRollback: RollbackProof = {
  transactionId: validTransaction.transactionId,
  beforeHashes: validTransaction.baseContentHashes,
  afterMutationHashes: { "src/new.ts": createHashValue, "src/existing.ts": newHash, "src/remove.json": null },
  afterRollbackHashes: validTransaction.baseContentHashes,
  evidenceReferences: ["Ω-EV-R2-ROLLBACK-DEMONSTRATION"],
};
assert(verifyRollbackProof(validTransaction, validRollback).ok, "rollback proof establishes scoped A-prime equivalence to A");
assert(!verifyRollbackProof(validTransaction, { ...validRollback, afterRollbackHashes: { ...validRollback.afterRollbackHashes, "src/existing.ts": newHash } }).ok, "non-equivalent rollback is rejected");
assert(!verifyRollbackProof(validTransaction, { ...validRollback, afterMutationHashes: { "src/new.ts": createHashValue } }).ok, "rollback proof requires complete mutation-state observation");
assert(!verifyRollbackProof(validTransaction, { ...validRollback, afterMutationHashes: { ...validRollback.afterMutationHashes, "src/existing.ts": oldHash } }).ok, "rollback proof rejects a post-mutation state that differs from the proposal");

const eventA: SessionEvidenceEvent = { sequence: 1, eventId: "EVENT-1", eventType: "PROPOSAL", payload: { beta: 2, alpha: 1 } };
const eventB: SessionEvidenceEvent = { sequence: 2, eventId: "EVENT-2", eventType: "DECISION", payload: { accepted: false } };
assert(canonicalEvidenceJson(eventA) === canonicalEvidenceJson({ eventType: "PROPOSAL", payload: { alpha: 1, beta: 2 }, eventId: "EVENT-1", sequence: 1 }), "canonical evidence serialization is key-order independent");
const chain = chainSessionEvidence([eventA, eventB]);
assert(verifySessionEvidenceChain(chain).ok, "session evidence hash chain validates");
assert(chainSessionEvidence([eventA, eventB])[1].eventHash === chain[1].eventHash, "session evidence hash chain is deterministic");
const tamperedChain = chain.map((item, index) => index === 0
  ? { ...item, event: { ...item.event, payload: { ...item.event.payload, alpha: 99 } } }
  : item);
assert(!verifySessionEvidenceChain(tamperedChain).ok, "post-hoc event payload modification is detected");
const reorderedChain = [chain[1], chain[0]];
assert(!verifySessionEvidenceChain(reorderedChain).ok, "event reordering is detected");
assert(OMEGA_R2_DESIGN_001.evidenceLedger.securityClaim !== ("CRYPTOGRAPHIC_SIGNATURE" as string), "tamper evidence is not inflated to independent durable authority");

const currentEvidence: R2EligibilityEvidence = {
  securityContainment: "UNKNOWN",
  r1PrivateEvaluation: "VERIFIED",
  realAliasConfinement: "VERIFIED",
  transactionContracts: "VERIFIED",
  rollbackDemonstration: "UNVERIFIED",
  negativeCapabilityPreservation: "UNVERIFIED",
  threatModel: "VERIFIED",
};
const currentEligibility = assessR2ImplementationEligibility(currentEvidence);
assert(currentEligibility.decision === "INELIGIBLE", "current institutional state is ineligible for R2 implementation");
assert(currentEligibility.blockers.includes("credential_containment_unresolved"), "unresolved credential containment is an explicit blocker");
assert(currentEligibility.blockers.includes("rollback_not_demonstrated"), "undemonstrated rollback is an explicit blocker");
const idealEligibility = assessR2ImplementationEligibility({
  ...currentEvidence,
  securityContainment: "REVOKED_AND_VERIFIED",
  rollbackDemonstration: "VERIFIED",
  negativeCapabilityPreservation: "VERIFIED",
});
assert(idealEligibility.decision === "ELIGIBLE_FOR_ISOLATED_IMPLEMENTATION", "only a fully evidenced gate becomes eligible for isolated implementation");
assert(assessR2ImplementationEligibility({ ...currentEvidence, securityContainment: "UNKNOWN", rollbackDemonstration: "VERIFIED", negativeCapabilityPreservation: "VERIFIED" }).decision === "INELIGIBLE", "UNKNOWN security state can never close the gate");

console.log(`Omega R2 design tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
