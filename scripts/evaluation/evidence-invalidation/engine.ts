export const EVIDENCE_NODE_STATES = Object.freeze(["SUPPORTS", "FALSIFIES", "INCONCLUSIVE", "STALE"] as const);
export type EvidenceNodeState = (typeof EVIDENCE_NODE_STATES)[number];
export type DerivedClaimState = "SUPPORTED" | "REFUTED" | "CONFLICTED" | "STALE" | "INSUFFICIENT_EVIDENCE";
export type DerivedCapabilityState = "VERIFIED" | "REQUIRES_REVALIDATION" | "REFUTED" | "CONFLICTED" | "UNVERIFIED";

export interface EvidenceDependencyBinding {
  readonly dependencyId: string;
  readonly fingerprint: string;
  readonly kind: "CANDIDATE" | "SOURCE" | "EVALUATOR" | "ENVIRONMENT" | "MATERIAL" | "AUTHORITY" | "EXTERNAL_STATE";
}

export interface EvidenceGraphNode {
  readonly evidenceId: string;
  readonly state: EvidenceNodeState;
  readonly supportsClaimIds: readonly string[];
  readonly dependencies: readonly EvidenceDependencyBinding[];
}

export interface ClaimGraphNode { readonly claimId: string; readonly evidenceIds: readonly string[]; }
export interface CapabilityGraphNode { readonly capabilityId: string; readonly requiredClaimIds: readonly string[]; }
export interface TransitionGraphNode { readonly transitionId: string; readonly requiredCapabilityIds: readonly string[]; }

export interface EvidenceInvalidationInput {
  readonly evidence: readonly EvidenceGraphNode[];
  readonly claims: readonly ClaimGraphNode[];
  readonly capabilities: readonly CapabilityGraphNode[];
  readonly transitions: readonly TransitionGraphNode[];
  readonly currentDependencies: readonly EvidenceDependencyBinding[];
}

export interface EvidenceInvalidationResult {
  readonly decision: "VALID" | "INVALID_GRAPH";
  readonly issues: readonly string[];
  readonly evidence: readonly (EvidenceGraphNode & { readonly invalidationReasons: readonly string[] })[];
  readonly claims: readonly (ClaimGraphNode & { readonly state: DerivedClaimState })[];
  readonly capabilities: readonly (CapabilityGraphNode & { readonly state: DerivedCapabilityState })[];
  readonly transitions: readonly (TransitionGraphNode & { readonly state: "ELIGIBLE" | "NOT_READY"; readonly reasons: readonly string[] })[];
  readonly invalidatedEvidenceIds: readonly string[];
  readonly preservedEvidenceIds: readonly string[];
}

function duplicateIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates];
}
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

export function invalidateEvidenceDependencies(input: EvidenceInvalidationInput): EvidenceInvalidationResult {
  const issues: string[] = [];
  const evidenceIds = new Set(input.evidence.map((item) => item.evidenceId));
  const claimIds = new Set(input.claims.map((item) => item.claimId));
  const capabilityIds = new Set(input.capabilities.map((item) => item.capabilityId));
  for (const id of duplicateIds(input.evidence.map((item) => item.evidenceId))) issues.push(`duplicate_evidence:${id}`);
  for (const id of duplicateIds(input.claims.map((item) => item.claimId))) issues.push(`duplicate_claim:${id}`);
  for (const id of duplicateIds(input.capabilities.map((item) => item.capabilityId))) issues.push(`duplicate_capability:${id}`);
  for (const id of duplicateIds(input.transitions.map((item) => item.transitionId))) issues.push(`duplicate_transition:${id}`);
  for (const id of duplicateIds(input.currentDependencies.map((item) => item.dependencyId))) issues.push(`duplicate_current_dependency:${id}`);
  for (const claim of input.claims) for (const id of claim.evidenceIds) if (!evidenceIds.has(id)) issues.push(`unknown_evidence:${claim.claimId}:${id}`);
  for (const item of input.evidence) for (const id of item.supportsClaimIds) if (!claimIds.has(id)) issues.push(`unknown_claim:${item.evidenceId}:${id}`);
  for (const capability of input.capabilities) for (const id of capability.requiredClaimIds) if (!claimIds.has(id)) issues.push(`unknown_capability_claim:${capability.capabilityId}:${id}`);
  for (const transition of input.transitions) for (const id of transition.requiredCapabilityIds) if (!capabilityIds.has(id)) issues.push(`unknown_transition_capability:${transition.transitionId}:${id}`);

  const current = new Map(input.currentDependencies.map((item) => [item.dependencyId, item]));
  const evidence = input.evidence.map((item) => {
    const invalidationReasons = item.dependencies.flatMap((dependency) => {
      const observed = current.get(dependency.dependencyId);
      if (!observed) return [`dependency_missing:${dependency.dependencyId}`];
      if (observed.kind !== dependency.kind) return [`dependency_kind_changed:${dependency.dependencyId}`];
      if (observed.fingerprint !== dependency.fingerprint) return [`dependency_fingerprint_changed:${dependency.dependencyId}`];
      return [];
    });
    return Object.freeze({ ...item, state: invalidationReasons.length > 0 ? "STALE" as const : item.state, invalidationReasons: Object.freeze(invalidationReasons) });
  });
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const claims = input.claims.map((claim) => {
    const claimEvidence = claim.evidenceIds.map((id) => evidenceById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const supports = claimEvidence.some((item) => item.state === "SUPPORTS");
    const falsifies = claimEvidence.some((item) => item.state === "FALSIFIES");
    const stale = claimEvidence.some((item) => item.state === "STALE");
    const state: DerivedClaimState = supports && falsifies ? "CONFLICTED" : falsifies ? "REFUTED" : supports ? "SUPPORTED" : stale ? "STALE" : "INSUFFICIENT_EVIDENCE";
    return Object.freeze({ ...claim, state });
  });
  const claimsById = new Map(claims.map((item) => [item.claimId, item]));
  const capabilities = input.capabilities.map((capability) => {
    const required = capability.requiredClaimIds.map((id) => claimsById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const states = required.map((item) => item.state);
    const state: DerivedCapabilityState = states.includes("REFUTED") ? "REFUTED" : states.includes("CONFLICTED") ? "CONFLICTED"
      : states.includes("STALE") ? "REQUIRES_REVALIDATION"
        : states.length === capability.requiredClaimIds.length && states.length > 0 && states.every((item) => item === "SUPPORTED") ? "VERIFIED" : "UNVERIFIED";
    return Object.freeze({ ...capability, state });
  });
  const capabilitiesById = new Map(capabilities.map((item) => [item.capabilityId, item]));
  const transitions = input.transitions.map((transition) => {
    const required = transition.requiredCapabilityIds.map((id) => capabilitiesById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const eligible = required.length === transition.requiredCapabilityIds.length && required.length > 0 && required.every((item) => item.state === "VERIFIED");
    const reasons = eligible ? [] : required.map((item) => `${item.capabilityId}:${item.state}`);
    return Object.freeze({ ...transition, state: eligible ? "ELIGIBLE" as const : "NOT_READY" as const, reasons: Object.freeze(unique(reasons)) });
  });
  const invalidatedEvidenceIds = evidence.filter((item) => item.invalidationReasons.length > 0).map((item) => item.evidenceId);
  const preservedEvidenceIds = evidence.filter((item) => item.invalidationReasons.length === 0).map((item) => item.evidenceId);
  return Object.freeze({ decision: issues.length === 0 ? "VALID" : "INVALID_GRAPH", issues: Object.freeze(unique(issues)), evidence: Object.freeze(evidence),
    claims: Object.freeze(claims), capabilities: Object.freeze(capabilities), transitions: Object.freeze(transitions),
    invalidatedEvidenceIds: Object.freeze(invalidatedEvidenceIds), preservedEvidenceIds: Object.freeze(preservedEvidenceIds) });
}
