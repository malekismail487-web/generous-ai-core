export const R2_A_READINESS_REQUIREMENTS = Object.freeze([
  "SEC_003_AUTHORIZED_CLOSURE",
  "R1_BASELINE_PRESERVED",
  "PRE_R2_BASELINE_PRESERVED",
  "TYPESCRIPT_ZERO_DIAGNOSTICS",
  "SECRET_SCAN_CLEAN",
  "R2_A_SPEC_VERIFIED",
  "R2_A_HOST_EVALUATOR_READY",
  "R2_ASSURANCE_EVALUATOR_READY",
  "EVIDENCE_CUSTODY_AVAILABLE",
  "NEGATIVE_CAPABILITIES_INTACT",
] as const);
export type R2AReadinessRequirement = (typeof R2_A_READINESS_REQUIREMENTS)[number];

export const R2_A_ACCEPTED_SECURITY_CLOSURES = Object.freeze([
  "REVOKED_AND_VERIFIED",
  "ROTATED_AND_VERIFIED",
  "CONFIRMED_INVALID",
] as const);
export type R2ASecurityClosure = (typeof R2_A_ACCEPTED_SECURITY_CLOSURES)[number] | "OPEN" | "UNKNOWN";
export type ReadinessEvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export interface R2AReadinessCheck {
  readonly requirement: R2AReadinessRequirement;
  readonly result: "PASS" | "FAIL" | "UNKNOWN" | "STALE";
  readonly evidenceClass: ReadinessEvidenceClass;
  readonly evidenceRefs: readonly string[];
  readonly statement: string;
}

export interface R2AReadinessInput {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly candidateCommit: string;
  readonly r1BaselineCommit: string;
  readonly preR2BaselineCommit: string;
  readonly securityClosure: R2ASecurityClosure;
  readonly checks: readonly R2AReadinessCheck[];
  readonly currentAllowedAuthorities: readonly string[];
  readonly currentUnavailableAuthorities: readonly string[];
  readonly currentForbiddenAuthorities: readonly string[];
}

export interface R2AReadinessDecision {
  readonly decision: "ELIGIBLE" | "INELIGIBLE" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly failedRequirements: readonly R2AReadinessRequirement[];
  readonly unresolvedRequirements: readonly R2AReadinessRequirement[];
  readonly grantsAuthority: false;
  readonly writeSandboxAvailable: false;
}

export const OMEGA_R1_BASELINE_COMMIT = "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296";
export const OMEGA_PRE_R2_BASELINE_COMMIT = "331f389dc18eccf816631cf5e509cc96859de74d";
const REQUIRED_FORBIDDEN = Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]);
const REQUIRED_UNAVAILABLE = Object.freeze(["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"]);
const CLASS_RANK: Readonly<Record<ReadinessEvidenceClass, number>> = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 });
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function exactCommit(value: string): boolean { return /^[0-9a-f]{40}$/.test(value); }
function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }

export function decideR2AReadiness(input: R2AReadinessInput): R2AReadinessDecision {
  const ineligible: string[] = [];
  const insufficient: string[] = [];
  if (input.schemaVersion !== 1 || !nonEmpty(input.decisionId) || !exactCommit(input.candidateCommit)) insufficient.push("malformed_readiness_identity");
  if (input.r1BaselineCommit !== OMEGA_R1_BASELINE_COMMIT) insufficient.push("wrong_r1_baseline");
  if (input.preR2BaselineCommit !== OMEGA_PRE_R2_BASELINE_COMMIT) insufficient.push("wrong_pre_r2_baseline");
  if (!R2_A_ACCEPTED_SECURITY_CLOSURES.includes(input.securityClosure as (typeof R2_A_ACCEPTED_SECURITY_CLOSURES)[number])) {
    ineligible.push("omega_sec_003_not_authoritatively_closed");
  }

  const requirementKeys = input.checks.map((item) => item.requirement);
  if (unique(requirementKeys).length !== requirementKeys.length) insufficient.push("duplicate_readiness_requirement");
  const missing = R2_A_READINESS_REQUIREMENTS.filter((requirement) => !requirementKeys.includes(requirement));
  if (missing.length > 0) insufficient.push("readiness_requirements_missing");
  const failedRequirements: R2AReadinessRequirement[] = [];
  const unresolvedRequirements: R2AReadinessRequirement[] = [...missing];
  for (const check of input.checks) {
    if (!nonEmpty(check.statement)) insufficient.push(`missing_check_statement:${check.requirement}`);
    if (check.result === "FAIL") failedRequirements.push(check.requirement);
    if (check.result === "UNKNOWN" || check.result === "STALE") unresolvedRequirements.push(check.requirement);
    if (check.result === "PASS" && check.evidenceRefs.length === 0) {
      insufficient.push(`passing_check_without_evidence:${check.requirement}`);
      unresolvedRequirements.push(check.requirement);
    }
    if (check.requirement === "SEC_003_AUTHORIZED_CLOSURE" && check.result === "PASS" && CLASS_RANK[check.evidenceClass] < CLASS_RANK.E4) {
      insufficient.push("security_closure_evidence_below_e4");
      unresolvedRequirements.push(check.requirement);
    }
  }
  if (failedRequirements.length > 0) ineligible.push("explicit_readiness_failure");
  if (unresolvedRequirements.length > 0) insufficient.push("readiness_evidence_unresolved");

  if (!input.currentAllowedAuthorities.includes("READ_REPOSITORY")) ineligible.push("r1_read_authority_not_preserved");
  for (const authority of REQUIRED_UNAVAILABLE) {
    if (!input.currentUnavailableAuthorities.includes(authority)) ineligible.push(`unavailable_authority_changed:${authority}`);
  }
  for (const authority of REQUIRED_FORBIDDEN) {
    if (!input.currentForbiddenAuthorities.includes(authority)) ineligible.push(`forbidden_authority_changed:${authority}`);
  }
  if (input.currentAllowedAuthorities.some((authority) => authority !== "READ_REPOSITORY")) ineligible.push("unexpected_current_authority");

  if (ineligible.length > 0) return {
    decision: "INELIGIBLE",
    reasons: unique(ineligible),
    failedRequirements: unique(failedRequirements),
    unresolvedRequirements: unique(unresolvedRequirements),
    grantsAuthority: false,
    writeSandboxAvailable: false,
  };
  if (insufficient.length > 0) return {
    decision: "INSUFFICIENT_EVIDENCE",
    reasons: unique(insufficient),
    failedRequirements: unique(failedRequirements),
    unresolvedRequirements: unique(unresolvedRequirements),
    grantsAuthority: false,
    writeSandboxAvailable: false,
  };
  return {
    decision: "ELIGIBLE",
    reasons: [],
    failedRequirements: [],
    unresolvedRequirements: [],
    grantsAuthority: false,
    writeSandboxAvailable: false,
  };
}

export const CURRENT_R2_A_READINESS_INPUT = Object.freeze<R2AReadinessInput>({
  schemaVersion: 1,
  decisionId: "OMEGA-R2-A-READINESS-CURRENT",
  candidateCommit: OMEGA_PRE_R2_BASELINE_COMMIT,
  r1BaselineCommit: OMEGA_R1_BASELINE_COMMIT,
  preR2BaselineCommit: OMEGA_PRE_R2_BASELINE_COMMIT,
  securityClosure: "OPEN",
  checks: R2_A_READINESS_REQUIREMENTS.map((requirement) => ({
    requirement,
    result: requirement === "SEC_003_AUTHORIZED_CLOSURE" ? "FAIL" : "STALE",
    evidenceClass: requirement === "SEC_003_AUTHORIZED_CLOSURE" ? "E0" : "E3",
    evidenceRefs: [],
    statement: requirement === "SEC_003_AUTHORIZED_CLOSURE"
      ? "Ω-SEC-003 remains blocked on authorized management-plane evidence."
      : "Fresh pre-implementation rerun is required after Ω-SEC-003 closure.",
  })),
  currentAllowedAuthorities: ["READ_REPOSITORY"],
  currentUnavailableAuthorities: ["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"],
  currentForbiddenAuthorities: REQUIRED_FORBIDDEN,
});

export const CURRENT_R2_A_READINESS_DECISION = Object.freeze(decideR2AReadiness(CURRENT_R2_A_READINESS_INPUT));
