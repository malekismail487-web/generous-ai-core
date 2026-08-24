import { createHash } from "node:crypto";
import type {
  AdmittedEvidenceRecord,
  EvidenceAdmissionPolicy,
  EvidenceAdmissionRequest,
  EvidenceAdmissionResult,
  EvidenceAdmissionVerification,
  EvidenceArtifact,
  EvidenceCandidateBinding,
  JsonValue,
} from "./contracts";

const EVIDENCE_CLASS_RANK = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 } as const);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function exactCommit(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function exactDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function sameCandidate(left: EvidenceCandidateBinding, right: EvidenceCandidateBinding): boolean {
  return left.commit === right.commit
    && left.capabilityVersion === right.capabilityVersion
    && left.schemaVersion === right.schemaVersion
    && left.environmentIdentity === right.environmentIdentity;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function canonicalizeEvidenceArtifact(artifact: EvidenceArtifact): string {
  return canonicalJson(artifact as unknown as JsonValue);
}

export function computeAuthoritativeEvidenceDigest(artifact: EvidenceArtifact): string {
  return createHash("sha256").update(canonicalizeEvidenceArtifact(artifact), "utf8").digest("hex");
}

function validateRequest(request: EvidenceAdmissionRequest, policy: EvidenceAdmissionPolicy): string[] {
  const issues: string[] = [];
  const artifact = request.artifact;
  if (request.schemaVersion !== 1 || artifact.schemaVersion !== 1 || policy.schemaVersion !== 1) issues.push("unsupported_schema_version");
  for (const [label, value] of [
    ["request_id", request.requestId],
    ["artifact_id", artifact.artifactId],
    ["evidence_type", artifact.evidenceType],
    ["source", artifact.source],
    ["evaluator_version", artifact.evaluatorVersion],
    ["policy_id", policy.policyId],
    ["custodian_id", policy.custodianId],
  ] as const) {
    if (!nonEmpty(value)) issues.push(`missing_${label}`);
  }
  if (!exactCommit(artifact.candidate.commit)) issues.push("malformed_candidate_commit");
  if (!sameCandidate(artifact.candidate, policy.expectedCandidate)) issues.push("candidate_binding_mismatch");
  if (!policy.compatibleEvaluatorVersions.includes(artifact.evaluatorVersion)) issues.push("incompatible_evaluator_version");
  if (!policy.allowedEvidenceTypes.includes(artifact.evidenceType)) issues.push("evidence_type_not_allowed");
  if (!Number.isSafeInteger(artifact.observedAtEpochMs) || artifact.observedAtEpochMs < 0) issues.push("invalid_observation_time");
  if (!Number.isSafeInteger(policy.admittedAtEpochMs) || policy.admittedAtEpochMs < 0) issues.push("invalid_admission_time");
  if (artifact.observedAtEpochMs > policy.admittedAtEpochMs + policy.maxFutureSkewMs) issues.push("observation_from_future");
  if (policy.admittedAtEpochMs - artifact.observedAtEpochMs > policy.maxEvidenceAgeMs) issues.push("stale_evidence");
  if (request.candidateClaimedDigest !== null && !exactDigest(request.candidateClaimedDigest)) issues.push("malformed_candidate_digest");
  const independence = artifact.independence;
  for (const [label, value] of [
    ["evidence_channel", independence.evidenceChannel],
    ["producer_owner", independence.producerOwner],
    ["evaluator_owner", independence.evaluatorOwner],
    ["oracle_owner", independence.oracleOwner],
    ["implementation_owner", independence.implementationOwner],
  ] as const) {
    if (!nonEmpty(value)) issues.push(`missing_${label}`);
  }
  if (EVIDENCE_CLASS_RANK[independence.evidenceClass] >= EVIDENCE_CLASS_RANK.E2 && !nonEmpty(independence.independenceBasis)) {
    issues.push("independence_basis_required");
  }
  if (EVIDENCE_CLASS_RANK[independence.evidenceClass] < EVIDENCE_CLASS_RANK.E2 && independence.independenceBasis !== null) {
    issues.push("correlated_evidence_claims_independence");
  }
  return [...new Set(issues)];
}

export class EvidenceCustodySession {
  readonly #policy: EvidenceAdmissionPolicy;
  readonly #records: AdmittedEvidenceRecord[] = [];
  readonly #requestIds = new Set<string>();
  readonly #artifactIds = new Set<string>();

  constructor(policy: EvidenceAdmissionPolicy) {
    this.#policy = deepFreeze(structuredClone(policy));
  }

  admit(request: EvidenceAdmissionRequest): EvidenceAdmissionResult {
    const issues = validateRequest(request, this.#policy);
    if (this.#requestIds.has(request.requestId)) issues.push("duplicate_admission_request");
    if (this.#artifactIds.has(request.artifact.artifactId)) issues.push("duplicate_artifact_identity");
    const authoritativeDigest = computeAuthoritativeEvidenceDigest(request.artifact);
    if (request.candidateClaimedDigest !== null && request.candidateClaimedDigest !== authoritativeDigest) {
      issues.push("candidate_digest_mismatch");
    }
    if (issues.length > 0) return deepFreeze({ decision: "REJECT", record: null, issues: [...new Set(issues)] });

    const order = this.#records.length + 1;
    const admissionId = `ADMISSION-${String(order).padStart(6, "0")}-${request.artifact.artifactId}`;
    const record = deepFreeze<AdmittedEvidenceRecord>({
      schemaVersion: 1,
      admissionId,
      admissionRef: `evidence://${this.#policy.custodianId}/${admissionId}/${authoritativeDigest}`,
      admissionOrder: order,
      requestId: request.requestId,
      artifactId: request.artifact.artifactId,
      evidenceType: request.artifact.evidenceType,
      source: request.artifact.source,
      candidate: structuredClone(request.artifact.candidate),
      evaluatorVersion: request.artifact.evaluatorVersion,
      observedAtEpochMs: request.artifact.observedAtEpochMs,
      admittedAtEpochMs: this.#policy.admittedAtEpochMs,
      authoritativeDigest,
      candidateClaimedDigest: request.candidateClaimedDigest,
      candidateDigestMatched: request.candidateClaimedDigest === null ? null : true,
      canonicalByteLength: Buffer.byteLength(canonicalizeEvidenceArtifact(request.artifact), "utf8"),
      independence: structuredClone(request.artifact.independence),
      custody: {
        policyId: this.#policy.policyId,
        custodianId: this.#policy.custodianId,
        mechanism: "EXTERNAL_RECOMPUTE_SHA256",
      },
    });
    this.#requestIds.add(request.requestId);
    this.#artifactIds.add(request.artifact.artifactId);
    this.#records.push(record);
    return deepFreeze({ decision: "ADMIT", record, issues: [] });
  }

  records(): readonly AdmittedEvidenceRecord[] {
    return deepFreeze([...this.#records]);
  }
}

export function verifyAdmittedEvidence(
  record: AdmittedEvidenceRecord,
  artifact: EvidenceArtifact,
  policy: EvidenceAdmissionPolicy,
): EvidenceAdmissionVerification {
  const issues: string[] = [];
  const authoritativeDigest = computeAuthoritativeEvidenceDigest(artifact);
  if (record.authoritativeDigest !== authoritativeDigest) issues.push("artifact_digest_changed");
  if (record.artifactId !== artifact.artifactId) issues.push("artifact_identity_changed");
  if (!sameCandidate(record.candidate, artifact.candidate) || !sameCandidate(record.candidate, policy.expectedCandidate)) issues.push("candidate_binding_changed");
  if (record.evaluatorVersion !== artifact.evaluatorVersion || !policy.compatibleEvaluatorVersions.includes(record.evaluatorVersion)) issues.push("evaluator_binding_changed");
  if (record.evidenceType !== artifact.evidenceType || !policy.allowedEvidenceTypes.includes(record.evidenceType)) issues.push("evidence_type_changed");
  if (record.source !== artifact.source) issues.push("source_changed");
  if (record.custody.policyId !== policy.policyId || record.custody.custodianId !== policy.custodianId) issues.push("custody_binding_changed");
  if (record.custody.mechanism !== "EXTERNAL_RECOMPUTE_SHA256") issues.push("unsupported_custody_mechanism");
  if (!record.admissionRef.endsWith(`/${record.authoritativeDigest}`)) issues.push("admission_reference_changed");
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
