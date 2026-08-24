import { EvidenceCustodySession, computeAuthoritativeEvidenceDigest } from "./evaluation/evidence-custody/custodian";
import type { EvidenceAdmissionPolicy, EvidenceArtifact, EvidenceCandidateBinding, JsonValue } from "./evaluation/evidence-custody/contracts";
import type { CustodyAdmissionEnvelope } from "./evaluation/registry-evidence-bridge/bridge";
import type { Sec003ClosurePackage, Sec003ClosureState, Sec003ObservationKind } from "./evaluation/sec003-closure/contracts";
import { evaluateSec003Closure, projectSec003ClosureToReadiness } from "./evaluation/sec003-closure/evaluator";
import { CURRENT_R2_A_READINESS_DECISION } from "../src/lib/codelab/assurance/r2AReadiness";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const CANDIDATE: EvidenceCandidateBinding = Object.freeze({
  commit: "e".repeat(40), capabilityVersion: "sec003-closure-contract/1", schemaVersion: 1, environmentIdentity: "synthetic-authorized-management-fixture",
});
const PROJECT = "synthetic-project-ref";
const RECORD = "opaque-management-record-001";
let artifactSequence = 0;

function policy(): EvidenceAdmissionPolicy {
  return {
    schemaVersion: 1, policyId: "SEC003-CLOSURE-POLICY", custodianId: "SEC003-CLOSURE-CUSTODIAN", expectedCandidate: CANDIDATE,
    compatibleEvaluatorVersions: ["sec003-evaluator/1"], allowedEvidenceTypes: ["SEC003_MANAGEMENT", "SEC003_INTEGRATION", "SEC003_REMOTE_TIP", "SEC003_HISTORY"],
    admittedAtEpochMs: 10_000, maxEvidenceAgeMs: 10_000, maxFutureSkewMs: 0,
  };
}

function artifact(kind: Sec003ObservationKind, evidenceType: string, data: Record<string, JsonValue>, evidenceClass: "E3" | "E4" = "E3", overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  artifactSequence += 1;
  return {
    schemaVersion: 1, artifactId: `SEC003-EVIDENCE-${String(artifactSequence).padStart(3, "0")}`, evidenceType, source: `synthetic-authorized://${kind.toLowerCase()}`,
    candidate: CANDIDATE, evaluatorVersion: "sec003-evaluator/1", observedAtEpochMs: 6_000,
    independence: {
      evidenceClass, evidenceChannel: kind === "MANAGEMENT_CREDENTIAL" ? "management-plane" : "external-repository",
      producerOwner: "AUTHORIZED-OPERATOR", evaluatorOwner: "SEC003-EVALUATOR", oracleOwner: "EXTERNAL-SYSTEM",
      implementationOwner: "OMEGA-SEC003-CONTRACT", sharesImplementationHelpers: false,
      independenceBasis: "The synthetic fixture represents separately owned management or repository evidence and does not certify the real credential.",
    },
    payload: { schemaVersion: 1, closureId: "SEC003-CLOSURE-SYNTHETIC", projectRef: PROJECT, kind, secretMaterialIncluded: false, data },
    ...overrides,
  };
}

function admit(artifacts: readonly EvidenceArtifact[]): readonly CustodyAdmissionEnvelope[] {
  const admissionPolicy = policy();
  const session = new EvidenceCustodySession(admissionPolicy);
  return artifacts.map((item, index) => {
    const admitted = session.admit({ schemaVersion: 1, requestId: `SEC003-REQUEST-${index + 1}`, artifact: item, candidateClaimedDigest: computeAuthoritativeEvidenceDigest(item) });
    if (admitted.decision !== "ADMIT") throw new Error(`fixture rejected: ${admitted.issues.join(",")}`);
    return { record: admitted.record, artifact: item, policy: admissionPolicy };
  });
}

function management(state: Sec003ClosureState, overrides: Record<string, JsonValue> = {}): EvidenceArtifact {
  const action = state === "REVOKED_AND_VERIFIED" ? "REVOKE" : state === "ROTATED_AND_VERIFIED" ? "ROTATE" : "CONFIRM_INVALID";
  const resultingState = state === "REVOKED_AND_VERIFIED" ? "REVOKED" : state === "ROTATED_AND_VERIFIED" ? "ROTATED" : "INVALID";
  return artifact("MANAGEMENT_CREDENTIAL", "SEC003_MANAGEMENT", {
    managementAccess: "AUTHORIZED", managementContextRef: "management-context://synthetic", operatorIdentity: "authorized-operator-synthetic",
    credentialRecordIdentity: RECORD, credentialIdentityIsSecret: false, priorState: "ACTIVE",
    usageReview: "REVIEWED_NO_SUSPICIOUS_USE", usageEvidenceRef: "audit://synthetic/no-suspicious-use", incidentResponseRef: null,
    operatorAuthorizationRef: action === "CONFIRM_INVALID" ? null : "authorization://synthetic/destructive-action",
    action, actionAtEpochMs: 5_100, resultingState, verifiedAtEpochMs: 5_200, resultingStateEvidenceRef: "management://synthetic/resulting-state",
    ...overrides,
  }, "E4");
}

function completeArtifacts(state: Sec003ClosureState = "REVOKED_AND_VERIFIED", managementOverrides: Record<string, JsonValue> = {}): readonly EvidenceArtifact[] {
  return [
    management(state, managementOverrides),
    artifact("DEPENDENT_INTEGRATION", "SEC003_INTEGRATION", { integrationRequired: state === "ROTATED_AND_VERIFIED", status: state === "ROTATED_AND_VERIFIED" ? "ROTATED_AND_VERIFIED" : "NOT_REQUIRED", evidenceRef: "integration://synthetic/state" }),
    artifact("REMOTE_TIP", "SEC003_REMOTE_TIP", { tip: "origin/main", status: "REDACTED", evidenceRef: "git://synthetic/main-redaction" }),
    artifact("REMOTE_TIP", "SEC003_REMOTE_TIP", { tip: "origin/sol/w0-rs-1-truth-map", status: "REDACTED", evidenceRef: "git://synthetic/branch-redaction" }),
    artifact("HISTORY_POLICY", "SEC003_HISTORY", { decision: "NO_REWRITE_WITH_RATIONALE", decisionEvidenceRef: "governance://synthetic/history-policy" }),
  ];
}

function closure(state: Sec003ClosureState = "REVOKED_AND_VERIFIED", artifacts = completeArtifacts(state)): Sec003ClosurePackage {
  const admissions = admit(artifacts);
  return { schemaVersion: 1, closureId: "SEC003-CLOSURE-SYNTHETIC", expectedProjectRef: PROJECT, credentialRecordIdentity: RECORD, requestedClosureState: state, admissionRefs: admissions.map((item) => item.record.admissionRef), admissions };
}

const revoked = evaluateSec003Closure(closure());
assert(revoked.decision === "CLOSED" && revoked.closureState === "REVOKED_AND_VERIFIED", "complete exact-bound revoked evidence closes the synthetic contract");
assert(revoked.credentialContainment === "REVOKED_AND_VERIFIED", "credential containment is represented separately");
assert(revoked.repositoryExposureRemediation === "REMEDIATED", "remote-tip and history remediation is represented separately");
assert(revoked.substates.every((item) => item.status === "SUPPORTED"), "all mandatory closure substates are evidence-supported");
assert(projectSec003ClosureToReadiness(revoked) === "REVOKED_AND_VERIFIED", "only closed contract projects an accepted readiness state");
assert(revoked.grantsAuthority === false && revoked.containsSecretMaterial === false, "closure evidence contract grants no authority and contains no secret material");

const rotated = evaluateSec003Closure(closure("ROTATED_AND_VERIFIED"));
assert(rotated.decision === "CLOSED" && rotated.closureState === "ROTATED_AND_VERIFIED", "rotation path requires and accepts verified dependent integration rotation");
const invalid = evaluateSec003Closure(closure("CONFIRMED_INVALID"));
assert(invalid.decision === "CLOSED" && invalid.closureState === "CONFIRMED_INVALID", "authoritative invalid-state confirmation closes without destructive authorization");

const managementOnly = evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", [management("REVOKED_AND_VERIFIED")]));
assert(managementOnly.decision === "INSUFFICIENT_EVIDENCE" && managementOnly.credentialContainment === "REVOKED_AND_VERIFIED", "credential containment alone does not falsely close repository exposure remediation");
assert(managementOnly.repositoryExposureRemediation === "OPEN" && projectSec003ClosureToReadiness(managementOnly) === "OPEN", "partial security progress remains ineligible for readiness");

const wrongProjectArtifacts = completeArtifacts().map((item, index) => index === 0 ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), projectRef: "wrong-project" } } : item);
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", wrongProjectArtifacts)).issues.includes("wrong_supabase_project"), "wrong Supabase project is rejected");
const secretArtifacts = completeArtifacts().map((item, index) => index === 0 ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), secretMaterialIncluded: true } } : item);
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", secretArtifacts)).issues.includes("secret_material_prohibited"), "secret-bearing evidence is rejected without reproduction");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", completeArtifacts("REVOKED_AND_VERIFIED", { operatorAuthorizationRef: null }))).issues.includes("destructive_action_authorization_missing"), "destructive containment requires explicit operator authorization");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", completeArtifacts("REVOKED_AND_VERIFIED", { resultingState: "ACTIVE" }))).issues.includes("resulting_state_or_order_invalid"), "unverified resulting credential state is rejected");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", completeArtifacts("REVOKED_AND_VERIFIED", { verifiedAtEpochMs: 5_000 }))).issues.includes("resulting_state_or_order_invalid"), "verification ordering must follow the action");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", completeArtifacts("REVOKED_AND_VERIFIED", { usageReview: "NOT_REVIEWED" }))).issues.includes("usage_review_incomplete"), "unreviewed usage prevents closure");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", completeArtifacts("REVOKED_AND_VERIFIED", { usageReview: "REVIEWED_SUSPICIOUS_USE_ESCALATED", incidentResponseRef: null }))).issues.includes("suspicious_usage_without_incident_response"), "suspicious usage requires incident-response evidence");

const oneTipMissing = completeArtifacts().filter((item) => !(item.payload as Record<string, JsonValue>).data || ((item.payload as Record<string, JsonValue>).data as Record<string, JsonValue>).tip !== "origin/main");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", oneTipMissing)).issues.includes("remote_tip_remediation_incomplete"), "both named remote tips require redaction evidence");
const historyMissing = completeArtifacts().filter((item) => (item.payload as Record<string, JsonValue>).kind !== "HISTORY_POLICY");
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", historyMissing)).issues.includes("history_policy_undecided"), "history policy remains a separate required governance decision");
const dependencyPending = completeArtifacts().map((item) => (item.payload as Record<string, JsonValue>).kind === "DEPENDENT_INTEGRATION"
  ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), data: { integrationRequired: true, status: "PENDING", evidenceRef: "integration://pending" } } } : item);
assert(evaluateSec003Closure(closure("REVOKED_AND_VERIFIED", dependencyPending)).issues.includes("dependent_integration_unresolved"), "pending dependent integration cannot close containment");

const exact = closure();
const tampered = { ...exact, admissions: exact.admissions.map((item, index) => index === 0 ? { ...item, record: { ...item.record, evaluatorVersion: "wrong-evaluator" } } : item) };
assert(evaluateSec003Closure(tampered).issues.some((issue) => issue.includes("evaluator_binding_changed")), "tampered custody/evaluator binding is rejected");
assert(evaluateSec003Closure({ ...exact, admissionRefs: [] }).issues.includes("custody_admission_required"), "unadmitted closure claims remain insufficient");
assert(CURRENT_R2_A_READINESS_DECISION.decision === "INELIGIBLE" && CURRENT_R2_A_READINESS_DECISION.writeSandboxAvailable === false, "real current readiness remains ineligible and WRITE_SANDBOX unavailable");

console.log(`Omega SEC-003 closure evidence tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
