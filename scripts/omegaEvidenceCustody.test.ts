import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EvidenceCustodySession,
  canonicalizeEvidenceArtifact,
  computeAuthoritativeEvidenceDigest,
  verifyAdmittedEvidence,
} from "./evaluation/evidence-custody/custodian";
import type {
  EvidenceAdmissionPolicy,
  EvidenceAdmissionRequest,
  EvidenceArtifact,
} from "./evaluation/evidence-custody/contracts";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const CANDIDATE = Object.freeze({
  commit: "331f389dc18eccf816631cf5e509cc96859de74d",
  capabilityVersion: "r2-evidence/1",
  schemaVersion: 1 as const,
  environmentIdentity: "windows-node24-fixture",
});

function artifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    schemaVersion: 1,
    artifactId: "R2-EVIDENCE-001",
    evidenceType: "R2_ASSURANCE_OBSERVATION",
    source: "heldout-evaluator://r2/vector-001",
    candidate: CANDIDATE,
    evaluatorVersion: "r2-heldout-eval/1",
    observedAtEpochMs: 9_000,
    independence: {
      evidenceClass: "E3",
      evidenceChannel: "heldout-deterministic",
      producerOwner: "R2-HOST-EVALUATOR",
      evaluatorOwner: "R2-ASSURANCE-EVALUATOR",
      oracleOwner: "R2-INDEPENDENT-ORACLE",
      implementationOwner: "R2-IMPLEMENTATION",
      sharesImplementationHelpers: false,
      independenceBasis: "Admission, evaluator, and oracle are external to the implementation path.",
    },
    payload: { claim: "SANDBOX_BOUNDARY_CONFINEMENT", result: "PASS", observations: [1, 2, 3] },
    ...overrides,
  };
}

function policy(overrides: Partial<EvidenceAdmissionPolicy> = {}): EvidenceAdmissionPolicy {
  return {
    schemaVersion: 1,
    policyId: "OMEGA-EVIDENCE-CUSTODY-POLICY-001",
    custodianId: "OMEGA-EVIDENCE-CUSTODIAN",
    expectedCandidate: CANDIDATE,
    compatibleEvaluatorVersions: ["r2-heldout-eval/1"],
    allowedEvidenceTypes: ["R2_ASSURANCE_OBSERVATION"],
    admittedAtEpochMs: 10_000,
    maxEvidenceAgeMs: 5_000,
    maxFutureSkewMs: 50,
    ...overrides,
  };
}

function request(overrides: Partial<EvidenceAdmissionRequest> = {}): EvidenceAdmissionRequest {
  return { schemaVersion: 1, requestId: "ADMIT-REQUEST-001", artifact: artifact(), candidateClaimedDigest: null, ...overrides };
}

const source = readFileSync(fileURLToPath(new URL("./evaluation/evidence-custody/custodian.ts", import.meta.url)), "utf8");
assert(!source.includes("node:fs"), "custodian has no filesystem authority");
assert(!source.includes("node:child_process"), "custodian has no process authority");
assert(!source.includes("fetch("), "custodian has no network authority");

const canonicalA = canonicalizeEvidenceArtifact(artifact({ payload: { z: 1, a: 2 } }));
const canonicalB = canonicalizeEvidenceArtifact(artifact({ payload: { a: 2, z: 1 } }));
assert(canonicalA === canonicalB, "canonicalization is stable across object key order");
assert(computeAuthoritativeEvidenceDigest(artifact()).length === 64, "authoritative digest is exact SHA-256 hex");

const session = new EvidenceCustodySession(policy());
const admitted = session.admit(request());
assert(admitted.decision === "ADMIT", "valid exact-bound evidence is admitted");
if (admitted.decision === "ADMIT") {
  assert(admitted.record.authoritativeDigest === computeAuthoritativeEvidenceDigest(artifact()), "custodian recomputes the authoritative artifact digest");
  assert(admitted.record.candidateClaimedDigest === null && admitted.record.candidateDigestMatched === null, "candidate digest is optional and never manufactured");
  assert(admitted.record.candidate.commit === CANDIDATE.commit, "candidate commit survives admission");
  assert(admitted.record.candidate.capabilityVersion === CANDIDATE.capabilityVersion, "capability version survives admission");
  assert(admitted.record.evaluatorVersion === "r2-heldout-eval/1", "evaluator version survives admission");
  assert(admitted.record.source === artifact().source, "source provenance survives admission");
  assert(admitted.record.independence.evidenceClass === "E3", "independence class survives admission");
  assert(admitted.record.custody.mechanism === "EXTERNAL_RECOMPUTE_SHA256", "digest ownership mechanism is explicit");
  assert(admitted.record.admissionOrder === 1, "first admission has deterministic order one");
  assert(admitted.record.admissionRef.endsWith(admitted.record.authoritativeDigest), "immutable evidence reference binds authoritative digest");
  assert(Object.isFrozen(admitted.record) && Object.isFrozen(admitted.record.candidate), "admitted record and nested binding are frozen");
  assert(verifyAdmittedEvidence(admitted.record, artifact(), policy()).ok, "fresh artifact verifies against custody record");
  assert(!verifyAdmittedEvidence(admitted.record, artifact({ payload: { claim: "CHANGED" } }), policy()).ok, "payload tampering invalidates custody verification");
  assert(!verifyAdmittedEvidence({ ...admitted.record, admissionRef: "evidence://tampered" }, artifact(), policy()).ok, "reference tampering invalidates custody verification");
}
assert(session.records().length === 1 && Object.isFrozen(session.records()), "session exposes a frozen append-only snapshot");
assert(session.admit(request()).decision === "REJECT", "duplicate request and artifact identities are rejected");

const claimed = artifact({ artifactId: "R2-EVIDENCE-CLAIMED" });
const claimedDigest = computeAuthoritativeEvidenceDigest(claimed);
const claimedResult = new EvidenceCustodySession(policy()).admit(request({ requestId: "ADMIT-REQUEST-CLAIMED", artifact: claimed, candidateClaimedDigest: claimedDigest }));
assert(claimedResult.decision === "ADMIT", "matching candidate digest may accompany independently recomputed admission");
assert(claimedResult.decision === "ADMIT" && claimedResult.record.candidateDigestMatched === true, "matching candidate digest is recorded only as a checked assertion");
assert(new EvidenceCustodySession(policy()).admit(request({ candidateClaimedDigest: "f".repeat(64) })).decision === "REJECT", "candidate digest mismatch rejects rather than becoming authoritative");
assert(new EvidenceCustodySession(policy()).admit(request({ candidateClaimedDigest: "short" })).decision === "REJECT", "malformed candidate digest rejects");

const otherCandidate = { ...CANDIDATE, commit: "2".repeat(40) };
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ candidate: otherCandidate }) })).decision === "REJECT", "wrong candidate commit is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ candidate: { ...CANDIDATE, capabilityVersion: "r2-evidence/2" } }) })).decision === "REJECT", "wrong capability version is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ candidate: { ...CANDIDATE, environmentIdentity: "other-host" } }) })).decision === "REJECT", "wrong environment identity is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ evaluatorVersion: "r2-heldout-eval/2" }) })).decision === "REJECT", "incompatible evaluator version is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ evidenceType: "UNAPPROVED" }) })).decision === "REJECT", "unapproved evidence type is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ observedAtEpochMs: 1_000 }) })).decision === "REJECT", "stale evidence is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ observedAtEpochMs: 10_051 }) })).decision === "REJECT", "evidence beyond future-skew allowance is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ source: "" }) })).decision === "REJECT", "missing source provenance is rejected");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ independence: { ...artifact().independence, independenceBasis: null } }) })).decision === "REJECT", "E3 evidence requires an independence basis");
assert(new EvidenceCustodySession(policy()).admit(request({ artifact: artifact({ independence: { ...artifact().independence, evidenceClass: "E1", independenceBasis: "false independence" } }) })).decision === "REJECT", "correlated evidence cannot claim independent status");

const sequence = new EvidenceCustodySession(policy());
const first = sequence.admit(request({ requestId: "SEQ-1", artifact: artifact({ artifactId: "SEQ-A" }) }));
const secondArtifact = artifact({ artifactId: "SEQ-B", payload: { result: "FAIL" } });
const second = sequence.admit(request({ requestId: "SEQ-2", artifact: secondArtifact }));
assert(first.decision === "ADMIT" && second.decision === "ADMIT", "distinct artifacts append successfully");
assert(second.decision === "ADMIT" && second.record.admissionOrder === 2, "admission order advances monotonically");
assert(sequence.records().map((item) => item.artifactId).join(",") === "SEQ-A,SEQ-B", "custody snapshot preserves admission order and failing artifacts");

console.log(`Omega evidence custody tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
