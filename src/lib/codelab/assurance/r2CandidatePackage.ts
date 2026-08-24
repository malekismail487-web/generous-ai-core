import { OMEGA_R1_TRACEABLE_BASELINE_REF } from "../registry/baselineGenealogy";

export const R2_A_PACKAGE_COMPLETENESS_STATES = Object.freeze([
  "COMPLETE_FOR_EVALUATION", "INCOMPLETE", "STALE", "WRONG_CANDIDATE", "CONTRADICTED",
] as const);
export type R2ACandidatePackageCompleteness = (typeof R2_A_PACKAGE_COMPLETENESS_STATES)[number];
export type CandidateEvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export const R2_A_REQUIRED_LIFECYCLE_EVENTS = Object.freeze([
  "REQUEST", "AUTHORIZATION", "PARENT_IDENTITY_VALIDATION", "DISJOINTNESS_VALIDATION", "PROVISION",
  "CREATED_OBJECT_IDENTITY", "TERMINATION_REQUEST", "CLEANUP", "POST_CLEANUP_OBSERVATION", "REVOCATION",
] as const);
export type R2ALifecycleEvent = (typeof R2_A_REQUIRED_LIFECYCLE_EVENTS)[number];

export const R2_A_NEGATIVE_CERTIFICATES = Object.freeze([
  "WRITE_SANDBOX_CONTENT", "READ_SCOPE_EXPANSION", "WRITE_REPOSITORY", "SHELL", "NETWORK",
  "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT", "PERSISTENT_UNAUTHORIZED_CAPABILITY",
] as const);
export type R2ANegativeCertificate = (typeof R2_A_NEGATIVE_CERTIFICATES)[number];

export interface CandidatePackageEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: CandidateEvidenceClass;
  readonly result: "SUPPORTS" | "FALSIFIES" | "INCONCLUSIVE";
  readonly admittedEvidenceRef: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly observedAtEpochMs: number;
}

export interface R2ACandidateEvidencePackage {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly candidate: { readonly commit: string; readonly capabilityVersion: string };
  readonly traceableInstitutionalBaselineRef: "baseline://OMEGA-R1-TRACEABLE-INSTITUTIONAL-BASELINE/68717200b669a8e7644e01f717f158ea44899820";
  readonly parentSandboxAuthority: "R2_A_AUTHORIZATION";
  readonly requestedLeafIdentity: string;
  readonly repositoryDisjointnessEvidence: CandidatePackageEvidence | null;
  readonly createdObjectIdentityEvidence: CandidatePackageEvidence | null;
  readonly lifecycleTranscript: Readonly<Partial<Record<R2ALifecycleEvent, CandidatePackageEvidence>>>;
  readonly cleanupTranscript: readonly CandidatePackageEvidence[];
  readonly cleanupResult: "VERIFIED_CLEAN" | "FAILED" | "UNKNOWN";
  readonly revocationResult: "VERIFIED_REVOKED" | "FAILED" | "UNKNOWN";
  readonly negativeCapabilityCertificates: Readonly<Partial<Record<R2ANegativeCertificate, CandidatePackageEvidence>>>;
  readonly r1PreservationEvidence: CandidatePackageEvidence | null;
  readonly hostEvaluatorEvidence: CandidatePackageEvidence | null;
  readonly evidenceCustodyRefs: readonly string[];
  readonly auditChainRefs: readonly string[];
  readonly knownFailures: readonly { readonly failureId: string; readonly open: boolean; readonly evidenceRef: string }[];
  readonly blockingUnknowns: readonly { readonly unknownId: string; readonly statement: string }[];
  readonly environmentIdentity: string;
  readonly toolVersions: Readonly<Record<string, string>>;
  readonly certifiesOperationalCapability: false;
}

export interface CandidatePackageAssessment {
  readonly completeness: R2ACandidatePackageCompleteness;
  readonly reasons: readonly string[];
  readonly missingItems: readonly string[];
  readonly capabilityAcceptance: "NOT_EVALUATED";
  readonly grantsAuthority: false;
}

const CLASS_RANK: Readonly<Record<CandidateEvidenceClass, number>> = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 });
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function exactCommit(value: string): boolean { return /^[0-9a-f]{40}$/.test(value); }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

export function assessR2ACandidatePackage(
  pkg: R2ACandidateEvidencePackage,
  expected: { readonly commit: string; readonly capabilityVersion: string; readonly nowEpochMs: number; readonly maxEvidenceAgeMs: number },
): CandidatePackageAssessment {
  const missing: string[] = [];
  const reasons: string[] = [];
  if (pkg.schemaVersion !== 1 || !nonEmpty(pkg.packageId) || !exactCommit(pkg.candidate.commit) || !nonEmpty(pkg.candidate.capabilityVersion)) missing.push("package_or_candidate_identity");
  if (!nonEmpty(pkg.requestedLeafIdentity) || !nonEmpty(pkg.environmentIdentity) || Object.keys(pkg.toolVersions).length === 0) missing.push("object_environment_or_tool_identity");
  if (pkg.traceableInstitutionalBaselineRef !== OMEGA_R1_TRACEABLE_BASELINE_REF) missing.push("wrong_traceable_institutional_baseline");
  if (pkg.parentSandboxAuthority !== "R2_A_AUTHORIZATION") missing.push("wrong_parent_sandbox_authority");
  if (pkg.certifiesOperationalCapability !== false) reasons.push("package_attempts_capability_certification");
  if (pkg.candidate.commit !== expected.commit || pkg.candidate.capabilityVersion !== expected.capabilityVersion) {
    return Object.freeze({ completeness: "WRONG_CANDIDATE", reasons: ["candidate_binding_mismatch"], missingItems: [], capabilityAcceptance: "NOT_EVALUATED", grantsAuthority: false });
  }

  const requiredEvidence: CandidatePackageEvidence[] = [];
  for (const event of R2_A_REQUIRED_LIFECYCLE_EVENTS) {
    const evidence = pkg.lifecycleTranscript[event];
    if (!evidence) missing.push(`lifecycle_event:${event}`); else requiredEvidence.push(evidence);
  }
  for (const certificate of R2_A_NEGATIVE_CERTIFICATES) {
    const evidence = pkg.negativeCapabilityCertificates[certificate];
    if (!evidence) missing.push(`negative_certificate:${certificate}`); else requiredEvidence.push(evidence);
  }
  for (const [name, evidence] of [
    ["repository_disjointness", pkg.repositoryDisjointnessEvidence], ["created_object_identity", pkg.createdObjectIdentityEvidence],
    ["r1_preservation", pkg.r1PreservationEvidence], ["host_evaluator", pkg.hostEvaluatorEvidence],
  ] as const) {
    if (!evidence) missing.push(`evidence:${name}`); else requiredEvidence.push(evidence);
  }
  requiredEvidence.push(...pkg.cleanupTranscript);
  if (pkg.cleanupTranscript.length === 0) missing.push("cleanup_transcript");
  if (pkg.evidenceCustodyRefs.length === 0) missing.push("evidence_custody_refs");
  if (pkg.auditChainRefs.length === 0) missing.push("audit_chain_refs");
  if (pkg.cleanupResult === "UNKNOWN" || pkg.revocationResult === "UNKNOWN") missing.push("cleanup_or_revocation_result");

  for (const evidence of requiredEvidence) {
    if (!nonEmpty(evidence.evidenceId) || !nonEmpty(evidence.admittedEvidenceRef) || !nonEmpty(evidence.evaluatorVersion) || !nonEmpty(evidence.environmentIdentity)) missing.push("malformed_evidence_identity");
    if (evidence.environmentIdentity !== pkg.environmentIdentity) missing.push(`evidence_environment_mismatch:${evidence.evidenceId}`);
    if (CLASS_RANK[evidence.evidenceClass] < CLASS_RANK.E3) missing.push(`evidence_below_e3:${evidence.evidenceId}`);
    if (evidence.result === "FALSIFIES") reasons.push(`falsifying_evidence:${evidence.evidenceId}`);
    if (evidence.result === "INCONCLUSIVE") missing.push(`inconclusive_evidence:${evidence.evidenceId}`);
    if (expected.nowEpochMs - evidence.observedAtEpochMs > expected.maxEvidenceAgeMs) reasons.push(`stale_evidence:${evidence.evidenceId}`);
  }
  if (pkg.knownFailures.some((failure) => failure.open)) reasons.push("open_known_failure");
  if (pkg.blockingUnknowns.length > 0) missing.push("blocking_unknowns");
  if (pkg.cleanupResult === "FAILED" || pkg.revocationResult === "FAILED" || reasons.includes("open_known_failure") || reasons.some((reason) => reason.startsWith("falsifying_evidence:"))) {
    return Object.freeze({ completeness: "CONTRADICTED", reasons: unique(reasons), missingItems: unique(missing), capabilityAcceptance: "NOT_EVALUATED", grantsAuthority: false });
  }
  if (reasons.some((reason) => reason.startsWith("stale_evidence:"))) {
    return Object.freeze({ completeness: "STALE", reasons: unique(reasons), missingItems: unique(missing), capabilityAcceptance: "NOT_EVALUATED", grantsAuthority: false });
  }
  if (missing.length > 0 || reasons.length > 0) {
    return Object.freeze({ completeness: "INCOMPLETE", reasons: unique(reasons), missingItems: unique(missing), capabilityAcceptance: "NOT_EVALUATED", grantsAuthority: false });
  }
  return Object.freeze({ completeness: "COMPLETE_FOR_EVALUATION", reasons: [], missingItems: [], capabilityAcceptance: "NOT_EVALUATED", grantsAuthority: false });
}
