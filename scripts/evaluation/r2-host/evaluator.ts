import {
  R2_HOST_ATTACK_FAMILIES,
  type ExpectedHostCandidate,
  type HostBoundaryDecision,
  type HostEvaluationCoverage,
  type HostMutationBoundaryObservation,
  type HostObjectIdentity,
} from "./contracts";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identityKey(value: HostObjectIdentity): string {
  return `${value.scheme}:${value.volumeOrDevice}:${value.objectId}`;
}

function candidateMatches(observation: HostMutationBoundaryObservation, expected: ExpectedHostCandidate): boolean {
  const candidate = observation.candidate;
  return candidate.commit === expected.commit
    && candidate.capabilityVersion === expected.capabilityVersion
    && candidate.schemaVersion === expected.schemaVersion
    && candidate.evaluatorVersion === expected.evaluatorVersion
    && candidate.environmentIdentity === expected.environmentIdentity;
}

export function evaluateHostMutationBoundary(
  observation: HostMutationBoundaryObservation,
  expected: ExpectedHostCandidate,
): HostBoundaryDecision {
  const insufficient: string[] = [];
  const reject: string[] = [];
  const bound = candidateMatches(observation, expected);
  const claimsRealHost = observation.evidenceKind === "REAL_HOST_OBSERVATION";
  const realHost = claimsRealHost && expected.admittedRealHostObservationIds.includes(observation.observationId);

  if (observation.schemaVersion !== 1
    || observation.candidate.schemaVersion !== 1
    || observation.observerOwner !== "R2_HOST_EVALUATOR"
    || observation.capability !== "PROVISION_SANDBOX"
    || observation.requestedOperation !== "PROVISION_EMPTY_SANDBOX") insufficient.push("malformed_or_unsupported_observation");
  if (![observation.observationId, observation.adapterOwner, observation.canonicalApprovedRoot, observation.canonicalParent, observation.canonicalTarget, observation.resolvedTarget].every(nonEmpty)) {
    insufficient.push("observation_identity_missing");
  }
  if (!/^[0-9a-f]{40}$/.test(observation.candidate.commit) || !bound) insufficient.push("wrong_candidate_binding");
  if (!Number.isFinite(observation.observedAtEpochMs)
    || observation.observedAtEpochMs > expected.nowEpochMs
    || expected.nowEpochMs - observation.observedAtEpochMs > expected.maxEvidenceAgeMs) insufficient.push("stale_or_invalid_observation_time");
  if (!claimsRealHost) insufficient.push("synthetic_vector_not_host_evidence");
  else if (!realHost) insufficient.push("real_host_claim_not_externally_admitted");
  if (claimsRealHost && observation.adapterOwner === "R2_IMPLEMENTATION") insufficient.push("implementation_owned_host_observation");
  if (observation.eventReferences.length === 0 || observation.eventReferences.some((item) => !nonEmpty(item))) insufficient.push("event_provenance_missing");
  if (!Number.isInteger(observation.semanticEventCount) || observation.semanticEventCount < 5) reject.push("semantically_incomplete_audit");
  if (!observation.hashChainValid) reject.push("audit_hash_chain_invalid");

  if (observation.forbiddenActionsObserved.length > 0) reject.push("forbidden_authority_observed");
  if (!observation.resolvedInsideApprovedRoot && observation.authorizationDecision !== "REJECTED") reject.push("boundary_escape_not_rejected");
  if (observation.authorizationDecision === "REJECTED") {
    if (observation.mutationAttempted || observation.actualChange !== "NONE") reject.push("mutation_after_rejection");
    if (!observation.authorityRevoked) reject.push("rejected_authority_not_revoked");
  } else {
    if (!observation.mutationAttempted) insufficient.push("allowed_operation_not_exercised");
    if (observation.parentIdentityAtUse === null
      || identityKey(observation.parentIdentityAtUse) !== identityKey(observation.authorizedParentIdentity)) reject.push("parent_identity_changed");
    if (observation.createdObjectIdentity === null || observation.objectIdentityAtUse === null) insufficient.push("mutated_object_identity_unobserved");
    else {
      if (identityKey(observation.createdObjectIdentity) !== identityKey(observation.objectIdentityAtUse)) reject.push("target_identity_changed");
      if (identityKey(observation.createdObjectIdentity) === identityKey(observation.repositoryIdentity)) reject.push("repository_object_mutated");
    }
    if (observation.actualChange !== "EMPTY_DIRECTORY_CREATED") reject.push("unexpected_or_unknown_actual_change");
    if (observation.cleanupOutcome !== "SUCCESS"
      || observation.terminalObjectExists !== false
      || !observation.authorityRevoked
      || observation.reusable) reject.push("cleanup_not_verified_or_reusable");
  }

  if (reject.length > 0) return { decision: "REJECT", reasons: [...new Set(reject)], candidateBound: bound, realHostEvidence: realHost, operationalAuthorityGranted: false };
  if (insufficient.length > 0) return { decision: "INSUFFICIENT_EVIDENCE", reasons: [...new Set(insufficient)], candidateBound: bound, realHostEvidence: realHost, operationalAuthorityGranted: false };
  return { decision: "ACCEPT", reasons: [], candidateBound: true, realHostEvidence: true, operationalAuthorityGranted: false };
}

export function summarizeHostEvaluationCoverage(
  observations: readonly HostMutationBoundaryObservation[],
): HostEvaluationCoverage {
  const syntheticFamilies = [...new Set(observations.filter((item) => item.evidenceKind === "SYNTHETIC_VECTOR").map((item) => item.attackFamily))];
  const realHostFamilies = [...new Set(observations.filter((item) => item.evidenceKind === "REAL_HOST_OBSERVATION").map((item) => item.attackFamily))];
  return {
    syntheticFamilies,
    realHostFamilies,
    missingSyntheticFamilies: R2_HOST_ATTACK_FAMILIES.filter((family) => !syntheticFamilies.includes(family)),
    operationalAuthority: "UNAVAILABLE",
  };
}
