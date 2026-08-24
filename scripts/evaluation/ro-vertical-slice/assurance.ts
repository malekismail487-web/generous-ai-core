import { validateExecutorAuditLog } from "../../../src/lib/codelab/executor/readOnlyExecutor";
import { verifyAdmittedEvidence } from "../evidence-custody/custodian";
import type { JsonValue } from "../evidence-custody/contracts";
import type {
  ClaimReevaluationContext,
  MaterialRepositoryClaim,
  ReadOnlySliceAssuranceDecision,
  ReadOnlyVerticalSliceRun,
} from "./contracts";

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameCandidate(left: MaterialRepositoryClaim["candidate"], right: MaterialRepositoryClaim["candidate"]): boolean {
  return left.commit === right.commit && left.capabilityVersion === right.capabilityVersion
    && left.environmentIdentity === right.environmentIdentity && left.schemaVersion === right.schemaVersion;
}

function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

export function assureReadOnlyVerticalSlice(run: ReadOnlyVerticalSliceRun): ReadOnlySliceAssuranceDecision {
  const reject: string[] = [];
  const insufficient: string[] = [];
  const acceptedClaimIds: string[] = [];
  const rejectedClaimIds: string[] = [];
  const audit = validateExecutorAuditLog(run.executorAudit);
  if (!audit.ok) reject.push(...audit.errors.map((error) => `audit:${error}`));
  if (run.executorAudit.length === 0) insufficient.push("executor_audit_empty");
  if (run.executorAudit.some((item) => !["READ_METADATA", "READ_FILE", "LIST_DIRECTORY"].includes(String(item.request.action)))) reject.push("non_r1_request_present");
  const finalTransaction = run.executorAudit.at(-1);
  if (!run.revocation.terminal || finalTransaction?.authorization.code !== "EXECUTOR_TERMINATED" || finalTransaction.toolAction !== null) {
    reject.push("terminal_revocation_not_proven");
  }
  const registryRecordExists = [...run.registry.plans, ...run.registry.capabilities]
    .some((item) => item.canonicalId === run.registryAssociation.registryRecordId);
  if (!registryRecordExists) insufficient.push("registry_association_unknown");
  if (run.registryAssociation.maturityChanged !== false) reject.push("read_only_slice_attempted_maturity_change");

  const associationClaims = new Set(run.registryAssociation.claimIds);
  const associationRefs = new Set(run.registryAssociation.admissionRefs);
  for (const claim of run.claims) {
    const admission = run.custody.find((item) => item.record.admissionRef === claim.evidenceAdmissionRef);
    if (!admission) { insufficient.push(`claim_evidence_not_admitted:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue; }
    const verification = verifyAdmittedEvidence(admission.record, admission.artifact, run.admissionPolicy);
    if (!verification.ok) { reject.push(`claim_custody_invalid:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue; }
    const payload = admission.artifact.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)
      || payload.claimId !== claim.claimId || payload.observationId !== claim.observationId
      || payload.sourceContentSha256 !== claim.sourceContentSha256 || canonical(payload.value) !== canonical(claim.value)
      || payload.epistemicState !== claim.epistemicState) {
      reject.push(`claim_artifact_mismatch:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue;
    }
    if (!sameCandidate(claim.candidate, run.candidate) || admission.record.candidate.commit !== run.candidate.commit
      || claim.evaluatorVersion !== admission.record.evaluatorVersion) {
      reject.push(`claim_candidate_or_evaluator_mismatch:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue;
    }
    if (!associationClaims.has(claim.claimId) || !associationRefs.has(claim.evidenceAdmissionRef)
      || claim.registryRecordId !== run.registryAssociation.registryRecordId) {
      insufficient.push(`claim_registry_association_missing:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue;
    }
    if (claim.authorityScope.operation !== "READ_REPOSITORY") { reject.push(`claim_authority_scope_invalid:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue; }
    if (claim.epistemicState === "REFUTED") { reject.push(`claim_refuted:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue; }
    if (claim.epistemicState !== "SUPPORTED") { insufficient.push(`claim_not_supported:${claim.claimId}`); rejectedClaimIds.push(claim.claimId); continue; }
    acceptedClaimIds.push(claim.claimId);
  }
  for (const contradiction of run.knownContradictions) {
    if (!run.claims.some((claim) => claim.claimId === contradiction.claimId)) continue;
    if (contradiction.severity === "CRITICAL") reject.push(`critical_contradiction:${contradiction.contradictionId}`);
    else insufficient.push(`claim_conflicted:${contradiction.claimId}`);
  }
  if (run.knownUnknowns.length > 0) insufficient.push(...run.knownUnknowns.map((item) => `known_unknown:${item}`));
  if (run.claims.length === 0 || acceptedClaimIds.length !== run.claims.length) insufficient.push("material_claim_coverage_incomplete");

  if (reject.length > 0) return { decision: "REJECT", reasons: unique(reject), acceptedClaimIds, rejectedClaimIds: unique(rejectedClaimIds), authorityCeiling: "R1_READ_REPOSITORY", grantsAuthority: false };
  if (insufficient.length > 0) return { decision: "INSUFFICIENT_EVIDENCE", reasons: unique(insufficient), acceptedClaimIds, rejectedClaimIds: unique(rejectedClaimIds), authorityCeiling: "R1_READ_REPOSITORY", grantsAuthority: false };
  return { decision: "ACCEPT", reasons: [], acceptedClaimIds, rejectedClaimIds: [], authorityCeiling: "R1_READ_REPOSITORY", grantsAuthority: false };
}

export function reevaluateMaterialClaim(claim: MaterialRepositoryClaim, context: ClaimReevaluationContext): MaterialRepositoryClaim {
  const contradictions = context.contradictions.filter((item) => item.claimId === claim.claimId);
  if (contradictions.some((item) => item.severity === "CRITICAL")) return { ...claim, epistemicState: "REFUTED" };
  if (contradictions.length > 0) return { ...claim, epistemicState: "CONFLICTED" };
  if (!context.sourceAvailable) return { ...claim, epistemicState: "UNKNOWN" };
  if (!sameCandidate(claim.candidate, context.currentCandidate)
    || !context.compatibleEvaluatorVersions.includes(claim.evaluatorVersion)
    || claim.sourceContentSha256 !== context.currentSourceContentSha256) return { ...claim, epistemicState: "STALE" };
  return claim;
}
