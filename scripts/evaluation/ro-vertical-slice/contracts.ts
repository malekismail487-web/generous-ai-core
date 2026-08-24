import type { EvidenceAdmissionPolicy, EvidenceArtifact, EvidenceCandidateBinding, JsonValue, AdmittedEvidenceRecord } from "../evidence-custody/contracts";
import type { ExecutorRequest, ExecutorTransaction, RevocationRecord } from "../../../src/lib/codelab/executor/types";
import type { OmegaRegistry } from "../../../src/lib/codelab/registry/types";

export type ObservationClaimSelector =
  | { readonly kind: "RESOURCE_STATUS" }
  | { readonly kind: "FILE_SHA256" }
  | { readonly kind: "JSON_FIELD"; readonly path: readonly string[] };

export interface ReadOnlyObjectiveRequest {
  readonly requestId: string;
  readonly action: ExecutorRequest["action"];
  readonly resourcePath: string;
  readonly observedAtEpochMs: number;
}

export interface ReadOnlyObjectiveClaim {
  readonly claimId: string;
  readonly sourceRequestId: string;
  readonly selector: ObservationClaimSelector;
}

export interface ReadOnlyInstitutionalObjective {
  readonly objectiveId: string;
  readonly statement: string;
  readonly registryRecordId: string;
  readonly requests: readonly ReadOnlyObjectiveRequest[];
  readonly claims: readonly ReadOnlyObjectiveClaim[];
}

export interface ReadOnlyVerticalSliceInput {
  readonly schemaVersion: 1;
  readonly candidate: EvidenceCandidateBinding;
  readonly evaluatorVersion: string;
  readonly objective: ReadOnlyInstitutionalObjective;
  readonly registry: OmegaRegistry;
  readonly executor: {
    readonly executorId: string;
    readonly tokenId: string;
    readonly repositoryRoot: string;
    readonly resourceScopes: readonly string[];
    readonly issuedAtEpochMs: number;
    readonly expiresAtEpochMs: number;
    readonly constraints: { readonly maxFileBytes: number; readonly maxDirectoryEntries: number; readonly allowedExtensions: readonly string[] };
    readonly issuer: string;
    readonly auditIdentity: string;
  };
  readonly admissionPolicy: EvidenceAdmissionPolicy;
  readonly terminatedAtEpochMs: number;
  readonly knownContradictions: readonly KnownClaimContradiction[];
  readonly knownUnknowns: readonly string[];
}

export interface MaterialRepositoryClaim {
  readonly claimId: string;
  readonly statement: string;
  readonly value: JsonValue;
  readonly epistemicState: "SUPPORTED" | "REFUTED" | "CONFLICTED" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE" | "STALE";
  readonly observationId: string;
  readonly sourceRequestId: string;
  readonly sourceResource: string;
  readonly sourceContentSha256: string | null;
  readonly repositoryFingerprint: string;
  readonly evaluatorVersion: string;
  readonly candidate: EvidenceCandidateBinding;
  readonly authorityScope: { readonly repositoryRoot: string; readonly resourceScopes: readonly string[]; readonly operation: "READ_REPOSITORY" };
  readonly evidenceAdmissionRef: string;
  readonly evidenceArtifactId: string;
  readonly registryRecordId: string;
}

export interface RegistryEvidenceAssociation {
  readonly registryRecordId: string;
  readonly claimIds: readonly string[];
  readonly admissionRefs: readonly string[];
  readonly maturityChanged: false;
}

export interface KnownClaimContradiction {
  readonly contradictionId: string;
  readonly claimId: string;
  readonly severity: "NONCRITICAL" | "CRITICAL";
  readonly evidenceAdmissionRef: string;
}

export interface ReadOnlyVerticalSliceRun {
  readonly schemaVersion: 1;
  readonly objective: ReadOnlyInstitutionalObjective;
  readonly candidate: EvidenceCandidateBinding;
  readonly evaluatorVersion: string;
  readonly registry: OmegaRegistry;
  readonly executorAudit: readonly ExecutorTransaction[];
  readonly revocation: RevocationRecord;
  readonly custody: readonly { readonly record: AdmittedEvidenceRecord; readonly artifact: EvidenceArtifact }[];
  readonly admissionPolicy: EvidenceAdmissionPolicy;
  readonly claims: readonly MaterialRepositoryClaim[];
  readonly registryAssociation: RegistryEvidenceAssociation;
  readonly knownContradictions: readonly KnownClaimContradiction[];
  readonly knownUnknowns: readonly string[];
}

export interface ReadOnlySliceAssuranceDecision {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly acceptedClaimIds: readonly string[];
  readonly rejectedClaimIds: readonly string[];
  readonly authorityCeiling: "R1_READ_REPOSITORY";
  readonly grantsAuthority: false;
}

export interface ReadOnlyVerticalSliceResult {
  readonly run: ReadOnlyVerticalSliceRun;
  readonly assurance: ReadOnlySliceAssuranceDecision;
  readonly final: {
    readonly objectiveId: string;
    readonly decision: ReadOnlySliceAssuranceDecision["decision"];
    readonly evidenceLinkedClaims: readonly MaterialRepositoryClaim[];
    readonly statement: string;
  };
}

export interface ClaimReevaluationContext {
  readonly currentCandidate: EvidenceCandidateBinding;
  readonly sourceAvailable: boolean;
  readonly currentSourceContentSha256: string | null;
  readonly compatibleEvaluatorVersions: readonly string[];
  readonly contradictions: readonly KnownClaimContradiction[];
}
