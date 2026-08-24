import {
  ASSURANCE_CLAIMS,
  OPERATIONAL_PHASES,
  type AssuranceEvaluationContext,
  type AssuranceEvaluationResult,
  type AssuranceEvidenceVector,
  type AssurancePackageVector,
  type CandidateVersion,
  type EvidenceClass,
} from "./contracts";

const CLASS_RANK: Readonly<Record<EvidenceClass, number>> = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 });
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function exactCommit(value: string): boolean { return /^[0-9a-f]{40}$/.test(value); }
function exactDigest(value: string): boolean { return /^[0-9a-f]{64}$/.test(value); }
function sameCandidate(left: CandidateVersion, right: CandidateVersion): boolean {
  return left.commit === right.commit
    && left.capabilityVersion === right.capabilityVersion
    && left.schemaVersion === right.schemaVersion
    && left.environmentIdentity === right.environmentIdentity;
}
function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }

function evidenceAdmitted(evidence: AssuranceEvidenceVector, context: AssuranceEvaluationContext): boolean {
  return context.admittedEvidenceDigests[evidence.evidenceId] === evidence.artifactDigest;
}

function independentlyAdmissible(evidence: AssuranceEvidenceVector, context: AssuranceEvaluationContext): boolean {
  return evidenceAdmitted(evidence, context)
    && sameCandidate(evidence.candidate, context.expectedCandidate)
    && CLASS_RANK[evidence.evidenceClass] >= CLASS_RANK.E3
    && evidence.evaluatorOwner !== "IMPLEMENTATION"
    && evidence.oracleOwner !== evidence.implementationOwner
    && !evidence.sharesImplementationHelpers
    && nonEmpty(evidence.independenceBasis)
    && nonEmpty(evidence.provenance)
    && exactDigest(evidence.artifactDigest)
    && evidence.observedAtEpochMs <= context.nowEpochMs
    && context.nowEpochMs - evidence.observedAtEpochMs <= context.maxEvidenceAgeMs;
}

export function evaluateR2AssuranceVector(
  pkg: AssurancePackageVector,
  context: AssuranceEvaluationContext,
): AssuranceEvaluationResult {
  const insufficient: string[] = [];
  const reject: string[] = [];
  if (pkg.schemaVersion !== 1 || pkg.evaluatorVersion !== "r2-assurance-eval/1") insufficient.push("unsupported_package_or_evaluator_version");
  if (!nonEmpty(pkg.packageId) || !exactCommit(pkg.candidate.commit) || !exactCommit(pkg.baselineR1Commit)) insufficient.push("malformed_package_identity");
  if (!sameCandidate(pkg.candidate, context.expectedCandidate)) insufficient.push("wrong_candidate_version");
  if (pkg.baselineR1Commit !== context.expectedBaselineR1Commit) insufficient.push("wrong_r1_baseline");
  if (unique(pkg.operationalPhases).length !== pkg.operationalPhases.length) insufficient.push("duplicate_operational_phase");
  const missingPhases = OPERATIONAL_PHASES.filter((phase) => !pkg.operationalPhases.includes(phase));
  if (missingPhases.length > 0) insufficient.push("operational_phase_evidence_incomplete");

  const ids = new Set<string>();
  for (const item of pkg.evidence) {
    if (!nonEmpty(item.evidenceId) || ids.has(item.evidenceId)) insufficient.push("malformed_or_duplicate_evidence_identity");
    ids.add(item.evidenceId);
    if (!sameCandidate(item.candidate, pkg.candidate)) insufficient.push("evidence_package_candidate_mismatch");
    if (!evidenceAdmitted(item, context)) insufficient.push("evidence_not_externally_admitted");
    if (!exactDigest(item.artifactDigest)) insufficient.push("malformed_evidence_digest");
  }

  const admittedCurrent = pkg.evidence.filter((item) => evidenceAdmitted(item, context) && sameCandidate(item.candidate, context.expectedCandidate));
  const rejectedEvidenceIds = admittedCurrent.filter((item) => item.result === "FAIL").map((item) => item.evidenceId);
  if (rejectedEvidenceIds.length > 0) reject.push("admitted_falsifying_evidence_present");
  for (const claim of ASSURANCE_CLAIMS) {
    const results = new Set(admittedCurrent.filter((item) => item.claim === claim).map((item) => item.result));
    if (results.has("PASS") && results.has("FAIL")) reject.push(`contradictory_admitted_evidence:${claim}`);
  }

  const permitted = new Set(context.permittedAddedAuthorities);
  if (pkg.capabilityDelta.addedAllowed.some((item) => !permitted.has(item))) reject.push("unexpected_authority_added");
  if (pkg.capabilityDelta.removedAllowed.length > 0) reject.push("baseline_authority_removed");
  if (pkg.capabilityDelta.removedForbidden.length > 0) reject.push("forbidden_authority_removed");
  for (const required of context.requiredForbiddenActions) {
    if (!pkg.capabilityDelta.currentForbidden.includes(required)) reject.push(`required_forbidden_action_missing:${required}`);
  }
  const admittedIds = new Set(admittedCurrent.map((item) => item.evidenceId));
  for (const failure of pkg.knownFailures) {
    if (!sameCandidate(failure.candidate, context.expectedCandidate)) insufficient.push("known_failure_wrong_candidate");
    if (!admittedIds.has(failure.evidenceId)) insufficient.push("known_failure_evidence_not_admitted");
    if (failure.status === "OPEN" && ["HIGH", "CRITICAL"].includes(failure.severity)) reject.push("open_high_impact_failure");
  }
  if (pkg.remainingUnknowns.some((item) => item.blocking)) insufficient.push("blocking_unknown_remains");

  const missingClaims = [] as (typeof ASSURANCE_CLAIMS)[number][];
  const acceptedEvidenceIds: string[] = [];
  for (const claim of ASSURANCE_CLAIMS) {
    const passing = pkg.evidence.filter((item) => item.claim === claim && item.result === "PASS" && independentlyAdmissible(item, context));
    if (passing.length === 0) missingClaims.push(claim);
    else acceptedEvidenceIds.push(...passing.map((item) => item.evidenceId));
  }
  if (missingClaims.length > 0) insufficient.push("independent_claim_evidence_incomplete");

  if (reject.length > 0) return {
    decision: "REJECT",
    reasons: unique(reject),
    acceptedEvidenceIds,
    rejectedEvidenceIds,
    missingClaims,
    missingPhases,
    certifiesCurrentOperationalR2: false,
  };
  if (insufficient.length > 0) return {
    decision: "INSUFFICIENT_EVIDENCE",
    reasons: unique(insufficient),
    acceptedEvidenceIds,
    rejectedEvidenceIds,
    missingClaims,
    missingPhases,
    certifiesCurrentOperationalR2: false,
  };
  return {
    decision: "ACCEPT",
    reasons: [],
    acceptedEvidenceIds,
    rejectedEvidenceIds,
    missingClaims,
    missingPhases,
    certifiesCurrentOperationalR2: false,
  };
}
