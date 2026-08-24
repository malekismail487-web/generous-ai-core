import { invalidateEvidenceDependencies, type EvidenceInvalidationInput } from "./evaluation/evidence-invalidation/engine";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

const base: EvidenceInvalidationInput = {
  evidence: [
    { evidenceId: "E-EXECUTOR", state: "SUPPORTS", supportsClaimIds: ["CLAIM-R1"], dependencies: [
      { dependencyId: "EXECUTOR_SOURCE", fingerprint: "executor-v1", kind: "SOURCE" }, { dependencyId: "NODE", fingerprint: "node-24", kind: "ENVIRONMENT" },
    ] },
    { evidenceId: "E-TSC", state: "SUPPORTS", supportsClaimIds: ["CLAIM-TSC"], dependencies: [
      { dependencyId: "TS_VERSION", fingerprint: "5.8.3", kind: "EVALUATOR" }, { dependencyId: "TS_SOURCE", fingerprint: "ts-source-v1", kind: "SOURCE" },
    ] },
  ],
  claims: [{ claimId: "CLAIM-R1", evidenceIds: ["E-EXECUTOR"] }, { claimId: "CLAIM-TSC", evidenceIds: ["E-TSC"] }],
  capabilities: [{ capabilityId: "CAP-R1", requiredClaimIds: ["CLAIM-R1"] }, { capabilityId: "CAP-TSC", requiredClaimIds: ["CLAIM-TSC"] }],
  transitions: [{ transitionId: "R2-ELIGIBILITY", requiredCapabilityIds: ["CAP-R1", "CAP-TSC"] }],
  currentDependencies: [
    { dependencyId: "EXECUTOR_SOURCE", fingerprint: "executor-v1", kind: "SOURCE" }, { dependencyId: "NODE", fingerprint: "node-24", kind: "ENVIRONMENT" },
    { dependencyId: "TS_VERSION", fingerprint: "5.8.3", kind: "EVALUATOR" }, { dependencyId: "TS_SOURCE", fingerprint: "ts-source-v1", kind: "SOURCE" },
    { dependencyId: "UNRELATED_DOC", fingerprint: "doc-v2", kind: "SOURCE" },
  ],
};

const current = invalidateEvidenceDependencies(base);
assert(current.decision === "VALID", "well-formed evidence dependency graph validates");
assert(current.capabilities.every((item) => item.state === "VERIFIED"), "current supporting claims preserve verified capabilities");
assert(current.transitions[0].state === "ELIGIBLE", "all verified capability dependencies can enable a transition");
assert(current.invalidatedEvidenceIds.length === 0, "unrelated documentation does not invalidate evidence that did not depend on it");

const executorChanged = invalidateEvidenceDependencies({ ...base, currentDependencies: base.currentDependencies.map((item) => item.dependencyId === "EXECUTOR_SOURCE" ? { ...item, fingerprint: "executor-v2" } : item) });
assert(executorChanged.invalidatedEvidenceIds.length === 1 && executorChanged.invalidatedEvidenceIds[0] === "E-EXECUTOR", "source change invalidates only evidence bound to that source");
assert(executorChanged.claims.find((item) => item.claimId === "CLAIM-R1")?.state === "STALE", "affected claim becomes stale rather than refuted");
assert(executorChanged.capabilities.find((item) => item.capabilityId === "CAP-R1")?.state === "REQUIRES_REVALIDATION", "formerly verified affected capability requires revalidation");
assert(executorChanged.capabilities.find((item) => item.capabilityId === "CAP-TSC")?.state === "VERIFIED", "unaffected capability remains verified");
assert(executorChanged.transitions[0].state === "NOT_READY", "upstream revalidation removes dependent transition eligibility");

const compilerChanged = invalidateEvidenceDependencies({ ...base, currentDependencies: base.currentDependencies.map((item) => item.dependencyId === "TS_VERSION" ? { ...item, fingerprint: "5.9.0" } : item) });
assert(compilerChanged.invalidatedEvidenceIds[0] === "E-TSC", "compiler version change invalidates compiler evidence");
assert(compilerChanged.capabilities.find((item) => item.capabilityId === "CAP-R1")?.state === "VERIFIED", "compiler change does not invalidate executor evidence");
const missingEnvironment = invalidateEvidenceDependencies({ ...base, currentDependencies: base.currentDependencies.filter((item) => item.dependencyId !== "NODE") });
assert(missingEnvironment.evidence.find((item) => item.evidenceId === "E-EXECUTOR")?.invalidationReasons.includes("dependency_missing:NODE"), "missing declared environment dependency is explicit");

const falsified = invalidateEvidenceDependencies({ ...base, evidence: [...base.evidence, { evidenceId: "E-R1-FAIL", state: "FALSIFIES", supportsClaimIds: ["CLAIM-R1"], dependencies: base.evidence[0].dependencies }], claims: base.claims.map((item) => item.claimId === "CLAIM-R1" ? { ...item, evidenceIds: [...item.evidenceIds, "E-R1-FAIL"] } : item) });
assert(falsified.claims.find((item) => item.claimId === "CLAIM-R1")?.state === "CONFLICTED", "current supporting and falsifying evidence creates conflict");
assert(falsified.capabilities.find((item) => item.capabilityId === "CAP-R1")?.state === "CONFLICTED", "claim conflict propagates to capability state");
const refuted = invalidateEvidenceDependencies({ ...base, evidence: base.evidence.map((item) => item.evidenceId === "E-EXECUTOR" ? { ...item, state: "FALSIFIES" as const } : item) });
assert(refuted.claims.find((item) => item.claimId === "CLAIM-R1")?.state === "REFUTED", "current falsification refutes rather than stales a claim");
assert(refuted.capabilities.find((item) => item.capabilityId === "CAP-R1")?.state === "REFUTED", "refutation propagates to capability state");

const malformed = invalidateEvidenceDependencies({ ...base, claims: [{ claimId: "CLAIM-R1", evidenceIds: ["MISSING"] }, ...base.claims] });
assert(malformed.decision === "INVALID_GRAPH" && malformed.issues.some((item) => item.startsWith("duplicate_claim:")), "duplicate graph identities are rejected");
assert(malformed.issues.some((item) => item.startsWith("unknown_evidence:")), "unknown evidence references are rejected");

console.log(`Omega evidence invalidation tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
