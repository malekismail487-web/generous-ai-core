import type { CustodyAdmissionEnvelope } from "../registry-evidence-bridge/bridge";

export const ALE_RETIREMENT_MIGRATION_ID = "20260826000000_retire_legacy_ale_external_api";
export const ALE_RETIREMENT_GATEWAY_ARTIFACT = "supabase/functions/ale-api/index.ts";
export const ALE_RETIREMENT_HANDLER_ARTIFACT = "supabase/functions/ale-api/retirement.ts";
export const ALE_RETIREMENT_MIGRATION_ARTIFACT = `supabase/migrations/${ALE_RETIREMENT_MIGRATION_ID}.sql`;

export const SEC003_RETIREMENT_OBSERVATION_KINDS = Object.freeze([
  "LOVABLE_DEPLOYMENT",
  "DATABASE_RETIREMENT",
  "DEPENDENCY_PRESERVATION",
] as const);
export type Sec003RetirementObservationKind = (typeof SEC003_RETIREMENT_OBSERVATION_KINDS)[number];

export interface AleRetirementReleaseManifest {
  readonly schemaVersion: 1;
  readonly manifestId: "SEC003-ALE-RETIREMENT-RELEASE-001";
  readonly candidateCommit: string;
  readonly branch: "sol/omega-institutional-spine";
  readonly affectedArtifacts: readonly string[];
  readonly migrationIdentity: typeof ALE_RETIREMENT_MIGRATION_ID;
  readonly expectedLegacyVerifierState: "RETIRED_FAIL_CLOSED";
  readonly expectedDatabaseRetirementStates: readonly ["TABLE_PRESENT_ALL_INACTIVE", "TABLE_ABSENT"];
  readonly expectedLegacyCredentialOutcome: "REJECTED_RETIRED";
  readonly unchangedCredentialSystems: readonly ["LUMINA_API_GATEWAY", "LUMINA_EXTERNAL_CREDENTIAL_RECORDS"];
  readonly operatorAction: string;
  readonly requiredResultingEvidence: readonly string[];
  readonly sec003Evaluator: "scripts/evaluation/sec003-retirement/evaluator.ts";
  readonly deploymentOccurred: false;
  readonly containsSecretMaterial: false;
}

export interface Sec003RetirementPackage {
  readonly schemaVersion: 1;
  readonly closureId: string;
  readonly expectedProjectRef: string;
  readonly expectedCandidateCommit: string;
  readonly releaseManifest: AleRetirementReleaseManifest;
  readonly admissionRefs: readonly string[];
  readonly admissions: readonly CustodyAdmissionEnvelope[];
}

export interface Sec003RetirementDecision {
  readonly decision: "CLOSED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  readonly closureState: "CONFIRMED_INVALID" | null;
  readonly verifierRetirement: "VERIFIED" | "UNKNOWN";
  readonly databaseRetirement: "TABLE_PRESENT_ALL_INACTIVE" | "TABLE_ABSENT" | "UNKNOWN";
  readonly internalAdaptiveLearning: "PRESERVED" | "UNKNOWN";
  readonly dependentIntegration: "NOT_REQUIRED" | "UNKNOWN";
  readonly issues: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly grantsAuthority: false;
  readonly containsSecretMaterial: false;
}

function exactCommit(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

export function validateAleRetirementReleaseManifest(
  value: AleRetirementReleaseManifest,
  expectedCandidateCommit?: string,
): readonly string[] {
  const issues: string[] = [];
  if (value.schemaVersion !== 1 || value.manifestId !== "SEC003-ALE-RETIREMENT-RELEASE-001") issues.push("malformed_manifest_identity");
  if (!exactCommit(value.candidateCommit)) issues.push("malformed_candidate_commit");
  if (expectedCandidateCommit !== undefined && value.candidateCommit !== expectedCandidateCommit) issues.push("wrong_candidate_commit");
  if (value.branch !== "sol/omega-institutional-spine") issues.push("wrong_release_branch");
  const artifacts = new Set(value.affectedArtifacts);
  for (const required of [ALE_RETIREMENT_GATEWAY_ARTIFACT, ALE_RETIREMENT_HANDLER_ARTIFACT, ALE_RETIREMENT_MIGRATION_ARTIFACT]) {
    if (!artifacts.has(required)) issues.push(`missing_release_artifact:${required}`);
  }
  if (value.migrationIdentity !== ALE_RETIREMENT_MIGRATION_ID) issues.push("wrong_migration_identity");
  if (value.expectedLegacyVerifierState !== "RETIRED_FAIL_CLOSED" || value.expectedLegacyCredentialOutcome !== "REJECTED_RETIRED") issues.push("unsafe_expected_runtime_state");
  if (value.expectedDatabaseRetirementStates.join(",") !== "TABLE_PRESENT_ALL_INACTIVE,TABLE_ABSENT") issues.push("database_outcome_contract_changed");
  if (value.unchangedCredentialSystems.join(",") !== "LUMINA_API_GATEWAY,LUMINA_EXTERNAL_CREDENTIAL_RECORDS") issues.push("unrelated_credential_system_scope_changed");
  if (!value.operatorAction.trim() || value.requiredResultingEvidence.length < 3) issues.push("operator_handoff_incomplete");
  if (value.sec003Evaluator !== "scripts/evaluation/sec003-retirement/evaluator.ts") issues.push("wrong_sec003_evaluator");
  if (value.deploymentOccurred !== false) issues.push("manifest_falsely_claims_deployment");
  if (value.containsSecretMaterial !== false) issues.push("secret_material_prohibited");
  return Object.freeze([...new Set(issues)]);
}
