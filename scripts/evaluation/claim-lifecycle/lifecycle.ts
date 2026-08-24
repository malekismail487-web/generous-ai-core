import type { JsonValue } from "../evidence-custody/contracts";
import type { EvidenceDependencyBinding } from "../evidence-invalidation/engine";
import type { MaterialRepositoryClaim } from "../ro-vertical-slice/contracts";

export type ClaimLifecycleState = "UNKNOWN" | "SUPPORTED" | "STALE" | "CONFLICTED" | "REFUTED" | "SUPERSEDED";
export type ClaimLifecycleEventType = "SUPPORT" | "INVALIDATE" | "REVALIDATE" | "CONTRADICT" | "RESOLVE_CONFLICT" | "REFUTE" | "SUPERSEDE";

export interface ClaimLifecycleEvent {
  readonly eventId: string;
  readonly type: ClaimLifecycleEventType;
  readonly order: number;
  readonly evidenceAdmissionRefs: readonly string[];
  readonly reason: string;
  readonly dependencyBindings?: readonly EvidenceDependencyBinding[];
  readonly contradictionId?: string;
  readonly supersedingClaimId?: string;
}

export interface RepositoryClaimLifecycle {
  readonly schemaVersion: 1;
  readonly claimId: string;
  readonly subject: string;
  readonly predicate: string;
  readonly value: JsonValue;
  readonly sourceEvidenceRefs: readonly string[];
  readonly candidateRepositoryState: MaterialRepositoryClaim["candidate"];
  readonly state: ClaimLifecycleState;
  readonly createdAtOrder: number;
  readonly freshnessDependencies: readonly EvidenceDependencyBinding[];
  readonly contradictingEvidenceRefs: readonly string[];
  readonly contradictionIds: readonly string[];
  readonly supersedingClaimId: string | null;
  readonly history: readonly ClaimLifecycleEvent[];
}

export interface ClaimTransitionResult {
  readonly decision: "APPLIED" | "REJECTED";
  readonly issues: readonly string[];
  readonly claim: RepositoryClaimLifecycle;
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }
function sameDependencies(left: readonly EvidenceDependencyBinding[], right: readonly EvidenceDependencyBinding[]): boolean {
  if (left.length !== right.length) return false;
  const current = new Map(right.map((item) => [item.dependencyId, `${item.kind}:${item.fingerprint}`]));
  return left.every((item) => current.get(item.dependencyId) === `${item.kind}:${item.fingerprint}`);
}

export function initializeRepositoryClaimLifecycle(input: {
  readonly materialClaim: MaterialRepositoryClaim;
  readonly subject: string;
  readonly predicate: string;
  readonly createdAtOrder: number;
  readonly freshnessDependencies: readonly EvidenceDependencyBinding[];
}): RepositoryClaimLifecycle {
  if (!nonEmpty(input.subject) || !nonEmpty(input.predicate) || !Number.isSafeInteger(input.createdAtOrder) || input.createdAtOrder < 1) {
    throw new Error("Malformed repository claim lifecycle identity");
  }
  const sourceState: ClaimLifecycleState = input.materialClaim.epistemicState === "SUPPORTED" ? "SUPPORTED"
    : input.materialClaim.epistemicState === "REFUTED" ? "REFUTED"
      : input.materialClaim.epistemicState === "CONFLICTED" ? "CONFLICTED"
        : input.materialClaim.epistemicState === "STALE" ? "STALE" : "UNKNOWN";
  const initial: ClaimLifecycleEvent = Object.freeze({
    eventId: `${input.materialClaim.claimId}:INITIAL`, type: sourceState === "SUPPORTED" ? "SUPPORT" : sourceState === "REFUTED" ? "REFUTE" : sourceState === "CONFLICTED" ? "CONTRADICT" : sourceState === "STALE" ? "INVALIDATE" : "SUPPORT",
    order: input.createdAtOrder, evidenceAdmissionRefs: [input.materialClaim.evidenceAdmissionRef], reason: "Initialized from custody-admitted R1 material repository claim.",
  });
  return Object.freeze({
    schemaVersion: 1, claimId: input.materialClaim.claimId, subject: input.subject, predicate: input.predicate, value: input.materialClaim.value,
    sourceEvidenceRefs: Object.freeze([input.materialClaim.evidenceAdmissionRef]), candidateRepositoryState: Object.freeze({ ...input.materialClaim.candidate }),
    state: sourceState, createdAtOrder: input.createdAtOrder, freshnessDependencies: Object.freeze(input.freshnessDependencies.map((item) => Object.freeze({ ...item }))),
    contradictingEvidenceRefs: Object.freeze([]), contradictionIds: Object.freeze([]), supersedingClaimId: null, history: Object.freeze([initial]),
  });
}

export function transitionRepositoryClaim(claim: RepositoryClaimLifecycle, event: ClaimLifecycleEvent): ClaimTransitionResult {
  const issues: string[] = [];
  if (!nonEmpty(event.eventId) || !nonEmpty(event.reason) || !Number.isSafeInteger(event.order)) issues.push("malformed_event");
  if (claim.history.some((item) => item.eventId === event.eventId)) issues.push("duplicate_event_identity");
  if (event.order <= (claim.history.at(-1)?.order ?? claim.createdAtOrder)) issues.push("non_monotonic_event_order");
  if (event.evidenceAdmissionRefs.length === 0) issues.push("evidence_required");
  if (claim.state === "REFUTED" || claim.state === "SUPERSEDED") issues.push("terminal_claim_state");

  let nextState = claim.state;
  let contradicting = [...claim.contradictingEvidenceRefs];
  let contradictionIds = [...claim.contradictionIds];
  let supersedingClaimId = claim.supersedingClaimId;
  switch (event.type) {
    case "SUPPORT":
      if (claim.state !== "UNKNOWN") issues.push("support_requires_unknown");
      else nextState = "SUPPORTED";
      break;
    case "INVALIDATE":
      if (claim.state !== "SUPPORTED") issues.push("invalidation_requires_supported");
      else nextState = "STALE";
      break;
    case "REVALIDATE":
      if (claim.state !== "STALE") issues.push("revalidation_requires_stale");
      else if (!event.dependencyBindings || !sameDependencies(event.dependencyBindings, claim.freshnessDependencies)) issues.push("revalidation_dependency_mismatch");
      else nextState = "SUPPORTED";
      break;
    case "CONTRADICT":
      if (claim.state !== "SUPPORTED") issues.push("contradiction_requires_supported");
      else if (!nonEmpty(event.contradictionId)) issues.push("contradiction_identity_required");
      else {
        nextState = "CONFLICTED";
        contradictionIds = [...contradictionIds, event.contradictionId];
        contradicting = [...contradicting, ...event.evidenceAdmissionRefs];
      }
      break;
    case "RESOLVE_CONFLICT":
      if (claim.state !== "CONFLICTED") issues.push("resolution_requires_conflict");
      else { nextState = "SUPPORTED"; contradictionIds = []; contradicting = []; }
      break;
    case "REFUTE":
      if (!['SUPPORTED', 'CONFLICTED', 'STALE'].includes(claim.state)) issues.push("refutation_requires_nonterminal_claim");
      else nextState = "REFUTED";
      break;
    case "SUPERSEDE":
      if (claim.state !== "SUPPORTED") issues.push("supersession_requires_supported");
      else if (!nonEmpty(event.supersedingClaimId) || event.supersedingClaimId === claim.claimId) issues.push("valid_superseding_claim_required");
      else { nextState = "SUPERSEDED"; supersedingClaimId = event.supersedingClaimId; }
      break;
  }
  if (issues.length > 0) return { decision: "REJECTED", issues: unique(issues), claim };
  return {
    decision: "APPLIED", issues: [], claim: Object.freeze({ ...claim, state: nextState, contradictingEvidenceRefs: Object.freeze(unique(contradicting)),
      contradictionIds: Object.freeze(unique(contradictionIds)), supersedingClaimId, history: Object.freeze([...claim.history, Object.freeze({ ...event })]) }),
  };
}
