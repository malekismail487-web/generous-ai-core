export const R2_COMPOSITION_COMPONENTS = Object.freeze([
  "R1_REPOSITORY_READ",
  "R2_A_SANDBOX_PROVISIONING",
  "R2_B_SANDBOX_CONTENT_CREATION",
  "R2_C_SANDBOX_CONTENT_MODIFICATION",
  "R2_D_SANDBOX_CONTENT_DELETION",
  "R2_E_MUTATION_TRANSACTION",
  "R2_F_ROLLBACK",
  "R2_G_PATCH_PACKAGE",
  "AUDIT_LEDGER",
  "EVIDENCE_CUSTODY",
  "CAPABILITY_AUTHENTICATION",
  "ASSURANCE_KERNEL",
] as const);
export type R2CompositionComponent = (typeof R2_COMPOSITION_COMPONENTS)[number];

export const R2_COMPOSITION_SECURITY_DOMAINS = Object.freeze([
  "AUTHORITY_AMPLIFICATION",
  "CONFUSED_DEPUTY",
  "READ_WRITE_SCOPE_INTERACTION",
  "STALE_CAPABILITY_REUSE",
  "CROSS_COMPONENT_AUDIT_GAPS",
  "MULTI_OPERATION_ROLLBACK",
  "REVOCATION_PROPAGATION",
  "EVIDENCE_OWNERSHIP",
  "LIFECYCLE_RACES",
  "PARTIAL_FAILURE_CLEANUP",
  "CROSS_COMPONENT_TOCTOU",
  "FORBIDDEN_ACTION_EMERGENCE",
] as const);
export type R2CompositionSecurityDomain = (typeof R2_COMPOSITION_SECURITY_DOMAINS)[number];

export type CompositionEvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export interface R2CompositionSecuritySpecification {
  readonly schemaVersion: 1;
  readonly specificationId: "OMEGA-R2-COMPOSE-SEC-SPEC-001";
  readonly maturity: "SPECIFIED";
  readonly implementationState: "REVIEW_CONTRACT_ONLY";
  readonly grantsOperationalAuthority: false;
  readonly certifiesOperationalR2: false;
  readonly compositionLaw: "SECURE_COMPONENTS_DO_NOT_IMPLY_SECURE_COMPOSITION";
  readonly requiredComponents: readonly R2CompositionComponent[];
  readonly requiredDomains: readonly R2CompositionSecurityDomain[];
  readonly minimumIndependentEvidenceClass: "E3";
  readonly requiredForbiddenActions: readonly string[];
  readonly hashChainClaim: "TAMPER_EVIDENT_NOT_SIGNED";
}

export interface R2CompositionComponentBinding {
  readonly component: R2CompositionComponent;
  readonly version: string;
  readonly candidateCommit: string;
}

export interface R2CompositionObservation {
  readonly observationId: string;
  readonly domain: R2CompositionSecurityDomain;
  readonly result: "PASS" | "FAIL" | "UNOBSERVED";
  readonly evidenceClass: CompositionEvidenceClass;
  readonly provenance: string;
  readonly independenceBasis: string | null;
  readonly evaluatorOwner: string;
  readonly implementationOwner: string;
  readonly sharesImplementationHelpers: boolean;
  readonly candidateCommit: string;
  readonly environmentIdentity: string;
  readonly componentIds: readonly R2CompositionComponent[];
  readonly freshness: "CURRENT" | "STALE";
}

export interface R2CompositionAuthorityDelta {
  readonly addedAllowed: readonly string[];
  readonly removedAllowed: readonly string[];
  readonly removedForbidden: readonly string[];
  readonly currentForbidden: readonly string[];
}

export interface R2CompositionReviewPackage {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly candidateCommit: string;
  readonly environmentIdentity: string;
  readonly componentBindings: readonly R2CompositionComponentBinding[];
  readonly observations: readonly R2CompositionObservation[];
  readonly authorityDelta: R2CompositionAuthorityDelta;
  readonly permittedAddedAuthorities: readonly string[];
  readonly blockingUnknowns: readonly string[];
}

export interface R2CompositionReviewResult {
  readonly decision: "SATISFIES_REVIEW_CONTRACT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly missingComponents: readonly R2CompositionComponent[];
  readonly missingDomains: readonly R2CompositionSecurityDomain[];
  readonly rejectedObservationIds: readonly string[];
  readonly certifiesOperationalR2: false;
}

const CLASS_RANK: Readonly<Record<CompositionEvidenceClass, number>> = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 });
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function exactCommit(value: string): boolean { return /^[0-9a-f]{40}$/.test(value); }
function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }

export function validateR2CompositionSecuritySpecification(
  spec: R2CompositionSecuritySpecification,
): { readonly ok: boolean; readonly issues: readonly string[] } {
  const issues: string[] = [];
  if (spec.schemaVersion !== 1 || spec.specificationId !== "OMEGA-R2-COMPOSE-SEC-SPEC-001") issues.push("unsupported_or_wrong_specification");
  if (spec.maturity !== "SPECIFIED" || spec.implementationState !== "REVIEW_CONTRACT_ONLY") issues.push("specification_maturity_inflation");
  if (spec.grantsOperationalAuthority !== false || spec.certifiesOperationalR2 !== false) issues.push("specification_claims_operational_authority");
  if (spec.compositionLaw !== "SECURE_COMPONENTS_DO_NOT_IMPLY_SECURE_COMPOSITION") issues.push("composition_law_weakened");
  for (const component of R2_COMPOSITION_COMPONENTS) if (!spec.requiredComponents.includes(component)) issues.push(`missing_component:${component}`);
  for (const domain of R2_COMPOSITION_SECURITY_DOMAINS) if (!spec.requiredDomains.includes(domain)) issues.push(`missing_domain:${domain}`);
  if (spec.minimumIndependentEvidenceClass !== "E3") issues.push("independence_floor_weakened");
  if (spec.hashChainClaim !== "TAMPER_EVIDENT_NOT_SIGNED") issues.push("hash_chain_claim_inflated");
  for (const forbidden of ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]) {
    if (!spec.requiredForbiddenActions.includes(forbidden)) issues.push(`missing_forbidden_action:${forbidden}`);
  }
  return { ok: issues.length === 0, issues: unique(issues) };
}

function independentlyAdmissible(observation: R2CompositionObservation, candidateCommit: string): boolean {
  return observation.result === "PASS"
    && observation.candidateCommit === candidateCommit
    && CLASS_RANK[observation.evidenceClass] >= CLASS_RANK.E3
    && nonEmpty(observation.provenance)
    && nonEmpty(observation.independenceBasis)
    && observation.evaluatorOwner !== observation.implementationOwner
    && observation.sharesImplementationHelpers === false
    && observation.componentIds.length >= 2
    && unique(observation.componentIds).length === observation.componentIds.length
    && observation.freshness === "CURRENT";
}

export function assessR2CompositionReview(
  pkg: R2CompositionReviewPackage,
  spec: R2CompositionSecuritySpecification = OMEGA_R2_COMPOSE_SEC_SPEC_001,
): R2CompositionReviewResult {
  const insufficient = [...validateR2CompositionSecuritySpecification(spec).issues];
  const reject: string[] = [];
  if (pkg.schemaVersion !== 1 || !nonEmpty(pkg.packageId) || !exactCommit(pkg.candidateCommit) || !nonEmpty(pkg.environmentIdentity)) insufficient.push("malformed_package_identity");
  const bindingKeys = pkg.componentBindings.map((item) => item.component);
  if (unique(bindingKeys).length !== bindingKeys.length) insufficient.push("duplicate_component_binding");
  for (const binding of pkg.componentBindings) {
    if (!nonEmpty(binding.version) || binding.candidateCommit !== pkg.candidateCommit) insufficient.push(`invalid_component_binding:${binding.component}`);
  }
  const missingComponents = R2_COMPOSITION_COMPONENTS.filter((component) => !bindingKeys.includes(component));
  if (missingComponents.length > 0) insufficient.push("component_composition_incomplete");

  const observationIds = new Set<string>();
  for (const observation of pkg.observations) {
    if (!nonEmpty(observation.observationId) || observationIds.has(observation.observationId)) insufficient.push("malformed_or_duplicate_observation_identity");
    observationIds.add(observation.observationId);
    if (observation.result === "FAIL") reject.push(`composition_failure:${observation.domain}`);
  }
  const rejectedObservationIds = pkg.observations.filter((item) => item.result === "FAIL").map((item) => item.observationId);
  const missingDomains = R2_COMPOSITION_SECURITY_DOMAINS.filter((domain) => !pkg.observations.some((item) => item.domain === domain && independentlyAdmissible(item, pkg.candidateCommit)));
  if (missingDomains.length > 0) insufficient.push("independent_composition_evidence_incomplete");

  const permitted = new Set(pkg.permittedAddedAuthorities);
  if (pkg.authorityDelta.addedAllowed.some((item) => !permitted.has(item))) reject.push("composition_added_unpermitted_authority");
  if (pkg.authorityDelta.removedAllowed.length > 0) reject.push("composition_removed_baseline_authority");
  if (pkg.authorityDelta.removedForbidden.length > 0) reject.push("composition_removed_forbidden_authority");
  for (const forbidden of spec.requiredForbiddenActions) {
    if (!pkg.authorityDelta.currentForbidden.includes(forbidden)) reject.push(`composition_missing_forbidden_action:${forbidden}`);
  }
  if (pkg.blockingUnknowns.length > 0) insufficient.push("blocking_composition_unknowns_remain");

  if (reject.length > 0) return {
    decision: "REJECT",
    reasons: unique(reject),
    missingComponents,
    missingDomains,
    rejectedObservationIds,
    certifiesOperationalR2: false,
  };
  if (insufficient.length > 0) return {
    decision: "INSUFFICIENT_EVIDENCE",
    reasons: unique(insufficient),
    missingComponents,
    missingDomains,
    rejectedObservationIds,
    certifiesOperationalR2: false,
  };
  return {
    decision: "SATISFIES_REVIEW_CONTRACT",
    reasons: [],
    missingComponents,
    missingDomains,
    rejectedObservationIds,
    certifiesOperationalR2: false,
  };
}

export const OMEGA_R2_COMPOSE_SEC_SPEC_001 = Object.freeze<R2CompositionSecuritySpecification>({
  schemaVersion: 1,
  specificationId: "OMEGA-R2-COMPOSE-SEC-SPEC-001",
  maturity: "SPECIFIED",
  implementationState: "REVIEW_CONTRACT_ONLY",
  grantsOperationalAuthority: false,
  certifiesOperationalR2: false,
  compositionLaw: "SECURE_COMPONENTS_DO_NOT_IMPLY_SECURE_COMPOSITION",
  requiredComponents: R2_COMPOSITION_COMPONENTS,
  requiredDomains: R2_COMPOSITION_SECURITY_DOMAINS,
  minimumIndependentEvidenceClass: "E3",
  requiredForbiddenActions: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
  hashChainClaim: "TAMPER_EVIDENT_NOT_SIGNED",
});
