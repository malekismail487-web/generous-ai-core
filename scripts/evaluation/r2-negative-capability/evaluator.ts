export const EXPECTED_R2_A_ADDED_AUTHORITIES = Object.freeze(["PROVISION_SANDBOX", "TERMINATE_SANDBOX"] as const);
export const REQUIRED_R2_A_UNAVAILABLE = Object.freeze(["WRITE_SANDBOX", "WRITE_SANDBOX_CONTENT"] as const);
export const REQUIRED_R2_A_FORBIDDEN = Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const);
export interface NegativeCapabilityEvaluationInput {
  readonly schemaVersion: 1;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly baselineAllowed: readonly string[];
  readonly candidateAllowed: readonly string[];
  readonly candidateUnavailable: readonly string[];
  readonly candidateForbidden: readonly string[];
  readonly baselineReadScopes: readonly string[];
  readonly candidateReadScopes: readonly string[];
  readonly persistentCapabilitiesAfterRevocation: readonly string[];
  readonly evidenceRefs: readonly string[];
}
export interface NegativeCapabilityEvaluation {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly addedAuthorities: readonly string[];
  readonly unexpectedAuthorities: readonly string[];
  readonly certifiesOperationalCapability: false;
  readonly grantsAuthority: false;
}
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)].sort(); }
function exact(values: readonly string[], expected: readonly string[]): boolean { return unique(values).join("\n") === unique(expected).join("\n"); }
export function evaluateR2ANegativeCapabilities(input: NegativeCapabilityEvaluationInput): NegativeCapabilityEvaluation {
  const insufficient: string[] = [];
  const reject: string[] = [];
  if (input.schemaVersion !== 1 || !/^[0-9a-f]{40}$/.test(input.candidateCommit) || !input.evaluatorVersion.trim() || input.evidenceRefs.length === 0) insufficient.push("malformed_or_unevidenced_evaluation");
  if (!exact(input.baselineAllowed, ["READ_REPOSITORY"])) insufficient.push("unexpected_baseline_authority");
  const added = unique(input.candidateAllowed.filter((authority) => !input.baselineAllowed.includes(authority)));
  const unexpected = added.filter((authority) => !EXPECTED_R2_A_ADDED_AUTHORITIES.includes(authority as (typeof EXPECTED_R2_A_ADDED_AUTHORITIES)[number]));
  if (!exact(added, EXPECTED_R2_A_ADDED_AUTHORITIES)) reject.push("authority_delta_not_exact_r2_a");
  if (unexpected.length > 0) reject.push("unexpected_added_authority");
  for (const authority of REQUIRED_R2_A_UNAVAILABLE) if (!input.candidateUnavailable.includes(authority)) reject.push(`unavailable_authority_exposed:${authority}`);
  for (const authority of REQUIRED_R2_A_FORBIDDEN) if (!input.candidateForbidden.includes(authority) || input.candidateAllowed.includes(authority)) reject.push(`forbidden_authority_exposed:${authority}`);
  if (!exact(input.candidateReadScopes, input.baselineReadScopes)) reject.push("read_scope_expanded_or_changed");
  if (input.persistentCapabilitiesAfterRevocation.length > 0) reject.push("persistent_capability_after_revocation");
  return Object.freeze({ decision: reject.length > 0 ? "REJECT" : insufficient.length > 0 ? "INSUFFICIENT_EVIDENCE" : "ACCEPT", reasons: unique([...reject, ...insufficient]), addedAuthorities: added, unexpectedAuthorities: unexpected, certifiesOperationalCapability: false, grantsAuthority: false });
}
