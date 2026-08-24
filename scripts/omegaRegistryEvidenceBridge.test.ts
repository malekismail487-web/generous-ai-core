import { EvidenceCustodySession, computeAuthoritativeEvidenceDigest } from "./evaluation/evidence-custody/custodian";
import type { EvidenceAdmissionPolicy, EvidenceArtifact, EvidenceCandidateBinding } from "./evaluation/evidence-custody/contracts";
import {
  deriveEvidenceBoundCriticalPath,
  evaluateEvidenceBoundTransition,
  invalidateEvidenceBoundState,
  type CustodyAdmissionEnvelope,
  type DependencyStateBinding,
  type RegistryEvidenceClaimPayload,
} from "./evaluation/registry-evidence-bridge/bridge";
import { analyzeInstitutionalCriticalPath } from "../src/lib/codelab/registry/criticalPath";
import { validateRegistry } from "../src/lib/codelab/registry/registry";
import { OMEGA_BASELINE_REGISTRY } from "../src/lib/codelab/registry/baseline";
import type { EvidenceBoundWorkState, InstitutionalCriticalPath, MaturityState, OmegaRegistry } from "../src/lib/codelab/registry/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const CANDIDATE: EvidenceCandidateBinding = Object.freeze({
  commit: "c".repeat(40), capabilityVersion: "registry-evidence-bridge/1", schemaVersion: 1, environmentIdentity: "deterministic-bridge-fixture",
});
const MATERIAL = Object.freeze({ subjectId: "OMEGA-REGISTRY", fingerprint: "registry-sha256-v1", changedAtEpochMs: 1_000 });
const DEPENDENCIES: readonly DependencyStateBinding[] = Object.freeze([{ dependencyId: "CUSTODY", fingerprint: "custody-v1" }]);

function policy(overrides: Partial<EvidenceAdmissionPolicy> = {}): EvidenceAdmissionPolicy {
  return {
    schemaVersion: 1, policyId: "BRIDGE-POLICY", custodianId: "BRIDGE-CUSTODIAN", expectedCandidate: CANDIDATE,
    compatibleEvaluatorVersions: ["bridge-evaluator/1"], allowedEvidenceTypes: ["REGISTRY_CLAIM"], admittedAtEpochMs: 2_000,
    maxEvidenceAgeMs: 2_000, maxFutureSkewMs: 0, ...overrides,
  };
}

function payload(overrides: Partial<RegistryEvidenceClaimPayload> = {}): RegistryEvidenceClaimPayload {
  return {
    schemaVersion: 1, claimId: "CLAIM-R2-READINESS-REPLICATED", registryRecordId: "Ω-PLAN-R2-A-READINESS-001",
    claim: "The R2-A readiness decision is independently replicated.", result: "SUPPORTS", targetMaturity: "INDEPENDENTLY_REPLICATED",
    completeness: "COMPLETE", critical: true, materialBinding: { subjectId: MATERIAL.subjectId, fingerprint: MATERIAL.fingerprint },
    dependencyBindings: DEPENDENCIES, ...overrides,
  };
}

let artifactSequence = 0;
function artifact(overrides: Partial<EvidenceArtifact> = {}, claimOverrides: Partial<RegistryEvidenceClaimPayload> = {}): EvidenceArtifact {
  artifactSequence += 1;
  return {
    schemaVersion: 1, artifactId: `BRIDGE-EVIDENCE-${String(artifactSequence).padStart(3, "0")}`, evidenceType: "REGISTRY_CLAIM",
    source: "heldout://registry-evidence-bridge", candidate: CANDIDATE, evaluatorVersion: "bridge-evaluator/1", observedAtEpochMs: 1_500,
    independence: {
      evidenceClass: "E3", evidenceChannel: "heldout-deterministic", producerOwner: "BRIDGE-PRODUCER", evaluatorOwner: "BRIDGE-EVALUATOR",
      oracleOwner: "BRIDGE-ORACLE", implementationOwner: "REGISTRY-BRIDGE", sharesImplementationHelpers: false,
      independenceBasis: "The deterministic oracle is separately implemented from the registry transition path.",
    },
    payload: payload(claimOverrides) as unknown as EvidenceArtifact["payload"], ...overrides,
  };
}

let sequence = 0;
function admit(input = artifact(), admissionPolicy = policy()): CustodyAdmissionEnvelope {
  sequence += 1;
  const session = new EvidenceCustodySession(admissionPolicy);
  const result = session.admit({ schemaVersion: 1, requestId: `BRIDGE-REQUEST-${sequence}`, artifact: input, candidateClaimedDigest: computeAuthoritativeEvidenceDigest(input) });
  if (result.decision !== "ADMIT") throw new Error(`fixture admission rejected: ${result.issues.join(",")}`);
  return { record: result.record, artifact: input, policy: admissionPolicy };
}

function transition(envelope: CustodyAdmissionEnvelope, overrides: Partial<Parameters<typeof evaluateEvidenceBoundTransition>[0]> = {}) {
  return evaluateEvidenceBoundTransition({
    transitionId: "TRANSITION-BRIDGE-001", registry: OMEGA_BASELINE_REGISTRY, registryRecordId: "Ω-PLAN-R2-A-READINESS-001",
    requestedMaturity: "INDEPENDENTLY_REPLICATED", minimumEvidenceClass: "E2", admissionRefs: [envelope.record.admissionRef],
    admissions: [envelope], materialState: MATERIAL, dependencyState: DEPENDENCIES, ...overrides,
  });
}

const validEnvelope = admit();
const applied = transition(validEnvelope);
assert(applied.decision === "APPLIED", "custody-admitted exact-bound evidence applies the next maturity gate");
assert(applied.record?.maturity === "INDEPENDENTLY_REPLICATED", "applied transition reaches only the requested next gate");
assert(applied.record?.verificationState === "INDEPENDENTLY_REPLICATED" && applied.record.epistemicState === "SUPPORTED", "verification and epistemic states derive from admitted support");
assert(applied.record?.evidence.some((item) => item.artifactRef === validEnvelope.record.admissionRef), "registry evidence preserves the custody admission reference");
assert(validateRegistry(applied.registry).ok, "evidence-bound transitioned registry remains valid");
assert(OMEGA_BASELINE_REGISTRY.plans.find((item) => item.canonicalId === "Ω-PLAN-R2-A-READINESS-001")?.maturity === "VERIFIED", "bridge never mutates the input registry");

const noCustody = evaluateEvidenceBoundTransition({
  transitionId: "NO-CUSTODY", registry: OMEGA_BASELINE_REGISTRY, registryRecordId: "Ω-PLAN-R2-A-READINESS-001",
  requestedMaturity: "INDEPENDENTLY_REPLICATED", minimumEvidenceClass: "E2", admissionRefs: [], admissions: [], materialState: MATERIAL, dependencyState: DEPENDENCIES,
});
assert(noCustody.decision === "REJECTED" && noCustody.issues.includes("custody_admission_required"), "maturity cannot advance without custody admission");
assert(transition(validEnvelope, { admissionRefs: ["evidence://fake/ref"] }).issues.includes("admission_reference_not_found"), "fake admission reference is rejected");
assert(transition(validEnvelope, { requestedMaturity: "PRODUCTION_READY" }).issues.includes("claim_target_maturity_mismatch"), "direct maturity inflation is rejected");
const inflatedEnvelope = admit(artifact({}, { targetMaturity: "PRODUCTION_READY" }));
assert(transition(inflatedEnvelope, { requestedMaturity: "PRODUCTION_READY" }).issues.includes("maturity_transition_not_next_gate"), "matching self-asserted evidence still cannot skip an intermediate maturity gate");

const wrongPolicy = { ...validEnvelope, policy: policy({ expectedCandidate: { ...CANDIDATE, commit: "d".repeat(40) } }) };
assert(transition(wrongPolicy).issues.some((issue) => issue.includes("candidate_binding_changed")), "wrong candidate binding is rejected");
const staleEvaluator = { ...validEnvelope, record: { ...validEnvelope.record, evaluatorVersion: "obsolete-evaluator/0" } };
assert(transition(staleEvaluator).issues.some((issue) => issue.includes("evaluator_binding_changed")), "incompatible evaluator binding is rejected");
assert(transition(validEnvelope, { materialState: { ...MATERIAL, changedAtEpochMs: 1_600 } }).issues.includes("evidence_predates_material_change"), "evidence older than material change is stale");
assert(transition(validEnvelope, { dependencyState: [{ dependencyId: "CUSTODY", fingerprint: "custody-v2" }] }).issues.includes("dependency_fingerprint_changed"), "dependency change invalidates evidence");

const incomplete = admit(artifact({}, { completeness: "PARTIAL" }));
assert(transition(incomplete).issues.includes("incomplete_claim_evidence"), "incomplete evidence cannot advance maturity");
const correlatedArtifact = artifact({ independence: {
  evidenceClass: "E1", evidenceChannel: "same-family", producerOwner: "REGISTRY-BRIDGE", evaluatorOwner: "REGISTRY-BRIDGE",
  oracleOwner: "REGISTRY-BRIDGE", implementationOwner: "REGISTRY-BRIDGE", sharesImplementationHelpers: true, independenceBasis: null,
} });
const correlated = admit(correlatedArtifact);
assert(transition(correlated).issues.includes("evidence_independence_below_requirement"), "correlated evidence cannot satisfy an independent transition");

const falsifying = admit(artifact({}, { result: "FALSIFIES", targetMaturity: "REJECTED_EXPERIMENTALLY", claim: "A critical adversarial fixture falsifies readiness integrity." }));
const falsified = transition(falsifying, { requestedMaturity: "REJECTED_EXPERIMENTALLY" });
assert(falsified.decision === "PRESERVED_FALSIFICATION", "critical falsification dominates transition support");
assert(falsified.record?.maturity === "REJECTED_EXPERIMENTALLY" && falsified.record.epistemicState === "REFUTED", "falsified hypothesis remains preserved in registry state");
assert(falsified.record?.evidence.some((item) => item.result === "FALSIFIES"), "falsification evidence is retained rather than deleted");
assert(validateRegistry(falsified.registry).ok, "falsification-preserving registry remains valid");

const path: InstitutionalCriticalPath = {
  pathId: "Ω-PATH-BRIDGE-FIXTURE", title: "Evidence-bound path", targetWorkItemId: "Ω-WORK-CHILD",
  workItems: [
    { workItemId: "Ω-WORK-ROOT", title: "Root", state: "SATISFIED", registryRecordId: null, dependencies: [], blockingReasons: [] },
    { workItemId: "Ω-WORK-CHILD", title: "Child", state: "SATISFIED", registryRecordId: null, dependencies: ["Ω-WORK-ROOT"], blockingReasons: [] },
  ],
};
const blockedBindings: readonly EvidenceBoundWorkState[] = [
  { workItemId: "Ω-WORK-ROOT", administrativeState: "BLOCKED_EXTERNAL", evidentiaryState: "UNKNOWN", evidenceAdmissionRefs: [], blockingReasons: ["AUTHORIZED_OPERATOR_REQUIRED"] },
  { workItemId: "Ω-WORK-CHILD", administrativeState: "QUEUED", evidentiaryState: "UNVERIFIED", evidenceAdmissionRefs: [], blockingReasons: [] },
];
const blocked = analyzeInstitutionalCriticalPath(deriveEvidenceBoundCriticalPath(path, blockedBindings));
assert(blocked.controllingBlockers[0]?.workItemId === "Ω-WORK-ROOT", "known external blocker cannot be suppressed by template labels");
assert(blocked.nextEligibleWorkItems.length === 0, "downstream work stays ineligible behind evidence-bound external blocker");
const verifiedBindings: readonly EvidenceBoundWorkState[] = [
  { ...blockedBindings[0], administrativeState: "AUTHORIZED", evidentiaryState: "VERIFIED", evidenceAdmissionRefs: [validEnvelope.record.admissionRef], blockingReasons: [] },
  blockedBindings[1],
];
const advanced = analyzeInstitutionalCriticalPath(deriveEvidenceBoundCriticalPath(path, verifiedBindings));
assert(advanced.nextEligibleWorkItems[0]?.workItemId === "Ω-WORK-CHILD", "admitted root verification makes only its immediate dependent eligible");
const stale = invalidateEvidenceBoundState(verifiedBindings[0], DEPENDENCIES, [{ dependencyId: "CUSTODY", fingerprint: "custody-v2" }], 1_500, 1_000);
assert(stale.evidentiaryState === "REQUIRES_REVALIDATION", "dependency-aware invalidation preserves history but requires revalidation");
const stalePath = analyzeInstitutionalCriticalPath(deriveEvidenceBoundCriticalPath(path, [stale, blockedBindings[1]]));
assert(stalePath.controllingBlockers[0]?.workItemId === "Ω-WORK-ROOT" && stalePath.unknownWorkItems.some((item) => item.workItemId === "Ω-WORK-ROOT"), "stale evidence re-closes the dependent critical path");

console.log(`Omega registry evidence bridge tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
