export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type CustodyEvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export interface EvidenceCandidateBinding {
  readonly commit: string;
  readonly capabilityVersion: string;
  readonly schemaVersion: 1;
  readonly environmentIdentity: string;
}

export interface EvidenceIndependenceMetadata {
  readonly evidenceClass: CustodyEvidenceClass;
  readonly evidenceChannel: string;
  readonly producerOwner: string;
  readonly evaluatorOwner: string;
  readonly oracleOwner: string;
  readonly implementationOwner: string;
  readonly sharesImplementationHelpers: boolean;
  readonly independenceBasis: string | null;
}

export interface EvidenceArtifact {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly evidenceType: string;
  readonly source: string;
  readonly candidate: EvidenceCandidateBinding;
  readonly evaluatorVersion: string;
  readonly observedAtEpochMs: number;
  readonly independence: EvidenceIndependenceMetadata;
  readonly payload: JsonValue;
}

export interface EvidenceAdmissionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly artifact: EvidenceArtifact;
  /** Optional candidate assertion. It is never authoritative and is checked against the recomputed digest. */
  readonly candidateClaimedDigest: string | null;
}

export interface EvidenceAdmissionPolicy {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly custodianId: string;
  readonly expectedCandidate: EvidenceCandidateBinding;
  readonly compatibleEvaluatorVersions: readonly string[];
  readonly allowedEvidenceTypes: readonly string[];
  readonly admittedAtEpochMs: number;
  readonly maxEvidenceAgeMs: number;
  readonly maxFutureSkewMs: number;
}

export interface AdmittedEvidenceRecord {
  readonly schemaVersion: 1;
  readonly admissionId: string;
  readonly admissionRef: string;
  readonly admissionOrder: number;
  readonly requestId: string;
  readonly artifactId: string;
  readonly evidenceType: string;
  readonly source: string;
  readonly candidate: EvidenceCandidateBinding;
  readonly evaluatorVersion: string;
  readonly observedAtEpochMs: number;
  readonly admittedAtEpochMs: number;
  readonly authoritativeDigest: string;
  readonly candidateClaimedDigest: string | null;
  readonly candidateDigestMatched: boolean | null;
  readonly canonicalByteLength: number;
  readonly independence: EvidenceIndependenceMetadata;
  readonly custody: {
    readonly policyId: string;
    readonly custodianId: string;
    readonly mechanism: "EXTERNAL_RECOMPUTE_SHA256";
  };
}

export type EvidenceAdmissionResult =
  | { readonly decision: "ADMIT"; readonly record: AdmittedEvidenceRecord; readonly issues: readonly [] }
  | { readonly decision: "REJECT"; readonly record: null; readonly issues: readonly string[] };

export interface EvidenceAdmissionVerification {
  readonly ok: boolean;
  readonly issues: readonly string[];
}
