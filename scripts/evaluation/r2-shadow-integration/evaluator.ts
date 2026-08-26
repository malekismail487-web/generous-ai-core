import {
  OMEGA_AUTHORITY_GRAPH_001,
  analyzeAuthorityClosure,
  type AuthorityGraph,
} from "../../../src/lib/codelab/assurance/authorityGraph";
import {
  R2_A_NEGATIVE_CERTIFICATES,
  R2_A_REQUIRED_LIFECYCLE_EVENTS,
  assessR2ACandidatePackage,
  type CandidatePackageEvidence,
  type R2ACandidateEvidencePackage,
  type R2ALifecycleEvent,
  type R2ANegativeCertificate,
} from "../../../src/lib/codelab/assurance/r2CandidatePackage";
import { OMEGA_R1_TRACEABLE_BASELINE_COMMIT, OMEGA_R1_TRACEABLE_BASELINE_REF } from "../../../src/lib/codelab/registry/baselineGenealogy";
import { DIRECTIVE_009_PLAN_COVERAGE } from "../../../src/lib/codelab/registry/directive009Coverage";
import { reconstructR2AAudit, computeAuditEventHash, R2_A_AUDIT_OBLIGATIONS, type AdmittedAuditEvent, type AuditEventType } from "../audit-reconstruction/evaluator";
import { evaluateInstitutionalBaselineDiff, type DeltaClassification, type InstitutionalSnapshot } from "../baseline-diff/evaluator";
import { evaluatePlanCoverageGate } from "../plan-coverage-gate/evaluator";
import { evaluateR2ANegativeCapabilities } from "../r2-negative-capability/evaluator";
import { decideEvidenceReuse, collectVerificationTelemetry } from "../verification-cost/telemetry";
import { evaluateR2AssuranceVector } from "../r2-assurance/evaluator";
import { acceptablePackage, contextFor, FIXTURE_CANDIDATE, independentEvidence } from "../r2-assurance/fixtures";
import { ASSURANCE_CLAIMS, type AssuranceEvidenceVector, type KnownFailureVector } from "../r2-assurance/contracts";

export const R2_SHADOW_ADVERSARIAL_CASES = Object.freeze([
  "CANDIDATE_IDENTITY_MISMATCH",
  "MISSING_CLEANUP",
  "VALID_HASH_MISSING_SEMANTIC_EVENT",
  "UNDECLARED_AUTHORITY_IMPLICATION",
  "ADDITIONAL_FORBIDDEN_CAPABILITY",
  "STALE_BASELINE",
  "DELETED_SECURITY_EVIDENCE",
  "REUSED_BUT_STALE_EVIDENCE",
  "PLAN_MAPPING_MISSING_FOR_AUTHORITY_CHANGE",
  "SUPPRESSED_KNOWN_FAILURE",
  "REVOCATION_REPORTED_NOT_EVIDENCED",
  "ENVIRONMENT_IDENTITY_MISMATCH",
  "STRUCTURALLY_COMPLETE_INADEQUATE_CAPABILITY_EVIDENCE",
  "POSITIVE_TESTS_WITH_CRITICAL_FALSIFICATION",
] as const);
export type R2ShadowFault = (typeof R2_SHADOW_ADVERSARIAL_CASES)[number];
type ComponentDecision = "PASS" | "REJECT" | "INSUFFICIENT_EVIDENCE";

export interface R2ShadowIntegrationResult {
  readonly scenarioId: string;
  readonly faults: readonly R2ShadowFault[];
  readonly components: Readonly<Record<string, ComponentDecision>>;
  readonly shadowDecision: "SHADOW_COMPOSITION_VALIDATED" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly operationalCapabilityDecision: "INSUFFICIENT_EVIDENCE";
  readonly packageCompleteness: string;
  readonly assuranceDecision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly acceptedRejectedDivergences: readonly string[];
  readonly semanticContradictions: readonly string[];
  readonly reasons: readonly string[];
  readonly syntheticOnly: true;
  readonly filesystemMutationPerformed: false;
  readonly authorityGranted: false;
}

const ENVIRONMENT = FIXTURE_CANDIDATE.environmentIdentity;
const CAPABILITY_VERSION = FIXTURE_CANDIDATE.capabilityVersion;
const observedAtEpochMs = 9_000;
const hasFault = (faults: readonly R2ShadowFault[], fault: R2ShadowFault): boolean => faults.includes(fault);
const component = (decision: string, pass: readonly string[], reject: readonly string[]): ComponentDecision => reject.includes(decision) ? "REJECT" : pass.includes(decision) ? "PASS" : "INSUFFICIENT_EVIDENCE";

function packageEvidence(id: string, environmentIdentity = ENVIRONMENT): CandidatePackageEvidence {
  return Object.freeze({
    evidenceId: id,
    evidenceClass: "E3",
    result: "SUPPORTS",
    admittedEvidenceRef: `custody://shadow/${id}`,
    evaluatorVersion: "r2-shadow-evidence/1",
    environmentIdentity,
    observedAtEpochMs,
  });
}

function candidatePackage(faults: readonly R2ShadowFault[]): R2ACandidateEvidencePackage {
  const lifecycle = Object.fromEntries(R2_A_REQUIRED_LIFECYCLE_EVENTS.map((event) => [event, packageEvidence(`SHADOW-LIFECYCLE-${event}`)])) as Partial<Record<R2ALifecycleEvent, CandidatePackageEvidence>>;
  if (hasFault(faults, "MISSING_CLEANUP")) delete lifecycle.CLEANUP;
  if (hasFault(faults, "REVOCATION_REPORTED_NOT_EVIDENCED")) delete lifecycle.REVOCATION;
  const negatives = Object.fromEntries(R2_A_NEGATIVE_CERTIFICATES.map((certificate) => [certificate, packageEvidence(`SHADOW-NEGATIVE-${certificate}`)])) as Partial<Record<R2ANegativeCertificate, CandidatePackageEvidence>>;
  const environmentMismatch = hasFault(faults, "ENVIRONMENT_IDENTITY_MISMATCH");
  return {
    schemaVersion: 1,
    packageId: "OMEGA-R2-A-SHADOW-PACKAGE-001",
    candidate: {
      commit: hasFault(faults, "CANDIDATE_IDENTITY_MISMATCH") ? "2".repeat(40) : FIXTURE_CANDIDATE.commit,
      capabilityVersion: CAPABILITY_VERSION,
    },
    traceableInstitutionalBaselineRef: OMEGA_R1_TRACEABLE_BASELINE_REF,
    parentSandboxAuthority: "R2_A_AUTHORIZATION",
    requestedLeafIdentity: "shadow://sandbox/leaf-001",
    repositoryDisjointnessEvidence: packageEvidence("SHADOW-DISJOINTNESS"),
    createdObjectIdentityEvidence: packageEvidence("SHADOW-OBJECT-IDENTITY", environmentMismatch ? "MISMATCHED-ENVIRONMENT" : ENVIRONMENT),
    lifecycleTranscript: lifecycle,
    cleanupTranscript: hasFault(faults, "MISSING_CLEANUP") ? [] : [packageEvidence("SHADOW-CLEANUP-TRANSCRIPT")],
    cleanupResult: hasFault(faults, "MISSING_CLEANUP") ? "UNKNOWN" : "VERIFIED_CLEAN",
    revocationResult: "VERIFIED_REVOKED",
    negativeCapabilityCertificates: negatives,
    r1PreservationEvidence: packageEvidence("SHADOW-R1-PRESERVATION"),
    hostEvaluatorEvidence: packageEvidence("SHADOW-HOST-EVALUATOR"),
    evidenceCustodyRefs: ["custody://shadow/session-001"],
    auditChainRefs: ["audit://shadow/chain-001"],
    knownFailures: [],
    blockingUnknowns: [],
    environmentIdentity: ENVIRONMENT,
    toolVersions: { node: "v24.19.0", evaluator: "r2-shadow/1" },
    certifiesOperationalCapability: false,
  };
}

const auditResult = (event: AuditEventType): AdmittedAuditEvent["result"] => {
  if (event === "REQUEST" || event === "TERMINATION_REQUEST") return "REQUESTED";
  if (event === "AUTHORIZATION") return "AUTHORIZED";
  if (event === "POST_CLEANUP_OBSERVATION") return "OBSERVED_CLEAN";
  if (event === "REVOCATION") return "REVOKED";
  return "SUCCEEDED";
};

function auditEvents(faults: readonly R2ShadowFault[]): readonly AdmittedAuditEvent[] {
  const omitted = new Set<AuditEventType>();
  if (hasFault(faults, "VALID_HASH_MISSING_SEMANTIC_EVENT")) omitted.add("DISJOINTNESS_VALIDATION");
  if (hasFault(faults, "MISSING_CLEANUP")) omitted.add("CLEANUP");
  if (hasFault(faults, "REVOCATION_REPORTED_NOT_EVIDENCED")) omitted.add("REVOCATION");
  let previousHash = "GENESIS";
  return R2_A_AUDIT_OBLIGATIONS.filter((event) => !omitted.has(event)).map((event, index) => {
    const withoutHash = {
      schemaVersion: 1 as const,
      eventId: `SHADOW-AUDIT-${String(index + 1).padStart(2, "0")}`,
      eventType: event,
      requestId: "SHADOW-REQUEST-001",
      actorIdentity: "SHADOW-EVALUATOR",
      authority: "R2_A_AUTHORIZATION",
      resourceIdentity: "shadow://sandbox-root",
      objectIdentity: ["PROVISION", "CREATED_OBJECT_IDENTITY", "TERMINATION_REQUEST", "CLEANUP", "POST_CLEANUP_OBSERVATION", "REVOCATION"].includes(event) ? "shadow-object-001" : null,
      result: auditResult(event),
      evidenceRef: `custody://shadow/audit/${event}`,
      previousHash,
    };
    const record = Object.freeze({ ...withoutHash, eventHash: computeAuditEventHash(withoutHash) });
    previousHash = record.eventHash;
    return record;
  });
}

function shadowAuthorityGraph(): AuthorityGraph {
  return {
    ...OMEGA_AUTHORITY_GRAPH_001,
    graphId: "OMEGA-R2-A-SHADOW-AUTHORITY-GRAPH",
    nodes: OMEGA_AUTHORITY_GRAPH_001.nodes.map((node) => ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"].includes(node.nodeId) ? { ...node, currentState: "VERIFIED" as const } : node),
  };
}

function snapshot(commit: string): InstitutionalSnapshot {
  return {
    candidateCommit: commit,
    capabilities: ["READ_REPOSITORY"],
    authorities: ["READ_REPOSITORY"],
    tests: ["R1_EXECUTOR", "R1_PRIVATE"],
    evidence: ["R1_EVIDENCE", "SECRET_SCAN"],
    securityInvariants: ["NO_REPOSITORY_WRITE", "NO_NETWORK", "NO_CREDENTIAL_ACCESS"],
    environmentAssumptions: ["WINDOWS_HOST"],
    registryMappings: ["CAPABILITY-R1"],
    evaluators: ["R1_PRIVATE_EVAL"],
    evidenceRequirements: ["E3_R1"],
  };
}

function baselineEvaluation(faults: readonly R2ShadowFault[]) {
  const baseline = snapshot(hasFault(faults, "STALE_BASELINE") ? "0".repeat(40) : OMEGA_R1_TRACEABLE_BASELINE_COMMIT);
  const candidate: InstitutionalSnapshot = {
    ...snapshot(FIXTURE_CANDIDATE.commit),
    capabilities: ["READ_REPOSITORY", "PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
    authorities: ["READ_REPOSITORY", "PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
    evidence: hasFault(faults, "DELETED_SECURITY_EVIDENCE") ? ["R1_EVIDENCE"] : ["R1_EVIDENCE", "SECRET_SCAN"],
  };
  const classifications: DeltaClassification[] = [
    "CAPABILITIES:ADDED:PROVISION_SANDBOX", "CAPABILITIES:ADDED:TERMINATE_SANDBOX",
    "AUTHORITIES:ADDED:PROVISION_SANDBOX", "AUTHORITIES:ADDED:TERMINATE_SANDBOX",
  ].map((deltaId) => ({ deltaId, classification: "INTENTIONAL_SUPERSESSION", rationale: "Synthetic exact R2-A authority delta", evidenceRefs: ["evidence://shadow/authority-delta"] }));
  if (hasFault(faults, "DELETED_SECURITY_EVIDENCE")) classifications.push({ deltaId: "EVIDENCE:REMOVED:SECRET_SCAN", classification: "UNKNOWN", rationale: "Candidate removed security evidence", evidenceRefs: ["evidence://shadow/deletion"] });
  return evaluateInstitutionalBaselineDiff(baseline, candidate, classifications);
}

function assuranceEvaluation(faults: readonly R2ShadowFault[]) {
  const baseEvidence: AssuranceEvidenceVector[] = ASSURANCE_CLAIMS.map((_, index) => independentEvidence(index));
  if (hasFault(faults, "POSITIVE_TESTS_WITH_CRITICAL_FALSIFICATION")) {
    baseEvidence.push(independentEvidence(10, { evidenceId: "R2-SHADOW-CRITICAL-FALSIFICATION", result: "FAIL" }));
  }
  const forbidden = hasFault(faults, "ADDITIONAL_FORBIDDEN_CAPABILITY");
  const pkg = acceptablePackage({
    baselineR1Commit: OMEGA_R1_TRACEABLE_BASELINE_COMMIT,
    evidence: baseEvidence,
    capabilityDelta: {
      addedAllowed: forbidden ? ["PROVISION_SANDBOX", "TERMINATE_SANDBOX", "SHELL"] : ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
      removedAllowed: [],
      removedForbidden: forbidden ? ["SHELL"] : [],
      currentForbidden: forbidden ? ["WRITE_REPOSITORY", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] : ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    },
  });
  const suppressedFailure: KnownFailureVector = {
    failureId: "SHADOW-EXTERNAL-CRITICAL-FAILURE",
    status: "OPEN",
    severity: "CRITICAL",
    candidate: FIXTURE_CANDIDATE,
    evidenceId: baseEvidence[0].evidenceId,
  };
  const context = contextFor(pkg, {
    expectedBaselineR1Commit: OMEGA_R1_TRACEABLE_BASELINE_COMMIT,
    externalKnownFailures: hasFault(faults, "SUPPRESSED_KNOWN_FAILURE") ? [suppressedFailure] : [],
  });
  return { result: evaluateR2AssuranceVector(pkg, context), custodyRecordCount: Object.keys(context.admittedEvidence).length, submittedEvidenceCount: pkg.evidence.length };
}

export function evaluateR2AShadowIntegration(faults: readonly R2ShadowFault[] = []): R2ShadowIntegrationResult {
  const packageAssessment = assessR2ACandidatePackage(candidatePackage(faults), {
    commit: FIXTURE_CANDIDATE.commit,
    capabilityVersion: CAPABILITY_VERSION,
    nowEpochMs: 10_000,
    maxEvidenceAgeMs: 5_000,
  });
  const observedAuthorities = ["READ_REPOSITORY", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", ...(hasFault(faults, "UNDECLARED_AUTHORITY_IMPLICATION") ? ["WRITE_SANDBOX_CONTENT"] : [])];
  const authority = analyzeAuthorityClosure(shadowAuthorityGraph(), ["READ_REPOSITORY", "PROVISION_SANDBOX", "TERMINATE_SANDBOX"], ["R2_A_AUTHORIZATION", "APPROVED_SANDBOX_ROOT", "OWNED_SANDBOX_IDENTITY", "CAPABILITY_LIFETIME"]);
  const undeclared = observedAuthorities.filter((item) => !authority.effectiveAuthorities.includes(item));
  const audit = reconstructR2AAudit(auditEvents(faults));
  const negative = evaluateR2ANegativeCapabilities({
    schemaVersion: 1,
    candidateCommit: FIXTURE_CANDIDATE.commit,
    evaluatorVersion: "r2-shadow-negative/1",
    baselineAllowed: ["READ_REPOSITORY"],
    candidateAllowed: hasFault(faults, "ADDITIONAL_FORBIDDEN_CAPABILITY") ? [...observedAuthorities, "SHELL"] : observedAuthorities,
    candidateUnavailable: ["WRITE_SANDBOX", "WRITE_SANDBOX_CONTENT"],
    candidateForbidden: hasFault(faults, "ADDITIONAL_FORBIDDEN_CAPABILITY") ? ["WRITE_REPOSITORY", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] : ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    baselineReadScopes: ["repo://approved"],
    candidateReadScopes: ["repo://approved"],
    persistentCapabilitiesAfterRevocation: [],
    evidenceRefs: ["evidence://shadow/negative-capabilities"],
  });
  const baseline = baselineEvaluation(faults);
  const coverageRecord = hasFault(faults, "PLAN_MAPPING_MISSING_FOR_AUTHORITY_CHANGE") ? { ...DIRECTIVE_009_PLAN_COVERAGE[0], directlyImplemented: [] } : DIRECTIVE_009_PLAN_COVERAGE[0];
  const coverage = evaluatePlanCoverageGate({
    schemaVersion: 1,
    submissionId: "OMEGA-R2-A-SHADOW-COVERAGE-001",
    workstream: coverageRecord,
    authorityChangingCandidate: true,
    authorityImplications: hasFault(faults, "PLAN_MAPPING_MISSING_FOR_AUTHORITY_CHANGE") ? [] : [
      { from: "R2_A_AUTHORIZATION", relation: "REQUIRES", to: "PROVISION_SANDBOX", evidenceRefs: ["evidence://shadow/authority-map"] },
      { from: "R2_A_AUTHORIZATION", relation: "REQUIRES", to: "TERMINATE_SANDBOX", evidenceRefs: ["evidence://shadow/authority-map"] },
    ],
    candidateEvidenceRefs: ["evidence://shadow/candidate"],
  });
  const telemetry = collectVerificationTelemetry(FIXTURE_CANDIDATE.commit, [{ suiteId: "OMEGA-R2-A-SHADOW-INTEGRATION", status: "PASSED", durationMs: 1, passedChecks: 1, failedChecks: 0, semanticTestDefinitions: 1, criticality: "CRITICAL_GATE" }], {});
  const reuse = decideEvidenceReuse({
    previousState: "FRESH_PASS",
    previousCandidateCommit: FIXTURE_CANDIDATE.commit,
    currentCandidateCommit: FIXTURE_CANDIDATE.commit,
    previousDependencies: { source: "v1" },
    currentDependencies: { source: hasFault(faults, "REUSED_BUT_STALE_EVIDENCE") ? "v2" : "v1" },
    candidateChangeClass: "IDENTICAL",
    candidateBindingPolicy: "SEMANTIC_EQUIVALENCE_ALLOWED",
  });
  const assurance = assuranceEvaluation(faults);
  const components: Record<string, ComponentDecision> = {
    CANDIDATE_PACKAGE: component(packageAssessment.completeness, ["COMPLETE_FOR_EVALUATION"], ["CONTRADICTED", "WRONG_CANDIDATE"]),
    AUTHORITY_GRAPH: authority.decision === "ACCEPT" && undeclared.length === 0 ? "PASS" : authority.decision === "REJECT" || undeclared.length > 0 ? "REJECT" : "INSUFFICIENT_EVIDENCE",
    EVIDENCE_CUSTODY: assurance.custodyRecordCount === assurance.submittedEvidenceCount ? "PASS" : "INSUFFICIENT_EVIDENCE",
    AUDIT_RECONSTRUCTION: component(audit.decision, ["COMPLETE"], ["REJECT"]),
    NEGATIVE_CAPABILITY: component(negative.decision, ["ACCEPT"], ["REJECT"]),
    BASELINE_DIFF: component(baseline.decision, ["ACCEPT"], ["REJECT"]),
    PLAN_COVERAGE: component(coverage.decision, ["ELIGIBLE_FOR_ASSURANCE_REVIEW"], ["NOT_ELIGIBLE"]),
    VERIFICATION_COST: reuse.state === "REUSED_VALID" && telemetry.length === 1 ? "PASS" : "INSUFFICIENT_EVIDENCE",
    R2_ASSURANCE: component(assurance.result.decision, ["ACCEPT"], ["REJECT"]),
  };
  const componentEntries = Object.entries(components);
  const rejected = componentEntries.filter(([, decision]) => decision === "REJECT").map(([name]) => name);
  const insufficient = componentEntries.filter(([, decision]) => decision === "INSUFFICIENT_EVIDENCE").map(([name]) => name);
  const operationalEvidenceAdequate = false;
  const operationalRequest = hasFault(faults, "STRUCTURALLY_COMPLETE_INADEQUATE_CAPABILITY_EVIDENCE");
  const shadowDecision = rejected.length > 0
    ? "REJECT"
    : insufficient.length > 0 || (operationalRequest && !operationalEvidenceAdequate)
      ? "INSUFFICIENT_EVIDENCE"
      : "SHADOW_COMPOSITION_VALIDATED";
  const accepted = componentEntries.filter(([, decision]) => decision === "PASS").map(([name]) => name);
  const divergences = (rejected.length > 0 || insufficient.length > 0) && accepted.length > 0
    ? [`accepted=${accepted.join(",")};non_accepting=${[...rejected, ...insufficient].join(",")}`]
    : [];
  return Object.freeze({
    scenarioId: faults.length === 0 ? "OMEGA-R2-A-SHADOW-BASELINE" : `OMEGA-R2-A-SHADOW-${faults.join("+")}`,
    faults: Object.freeze([...faults]),
    components: Object.freeze(components),
    shadowDecision,
    operationalCapabilityDecision: "INSUFFICIENT_EVIDENCE",
    packageCompleteness: packageAssessment.completeness,
    assuranceDecision: assurance.result.decision,
    acceptedRejectedDivergences: Object.freeze(divergences),
    semanticContradictions: Object.freeze([]),
    reasons: Object.freeze([
      ...rejected.map((item) => `component_rejected:${item}`),
      ...insufficient.map((item) => `component_insufficient:${item}`),
      ...(operationalRequest && !operationalEvidenceAdequate ? ["operational_e4_evidence_absent"] : []),
      ...(undeclared.length > 0 ? undeclared.map((item) => `undeclared_authority:${item}`) : []),
    ]),
    syntheticOnly: true,
    filesystemMutationPerformed: false,
    authorityGranted: false,
  });
}
