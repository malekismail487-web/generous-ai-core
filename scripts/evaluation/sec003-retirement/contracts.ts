import type { CustodyAdmissionEnvelope } from "../registry-evidence-bridge/bridge";

export const ALE_RETIREMENT_MIGRATION_ID = "20260826000000_retire_legacy_ale_external_api";
export const ALE_RETIREMENT_GATEWAY_ARTIFACT = "supabase/functions/ale-api/index.ts";
export const ALE_RETIREMENT_HANDLER_ARTIFACT = "supabase/functions/ale-api/retirement.ts";
export const ALE_RETIREMENT_MIGRATION_ARTIFACT = `supabase/migrations/${ALE_RETIREMENT_MIGRATION_ID}.sql`;
export const ALE_RETIREMENT_CONFIG_ARTIFACT = "supabase/config.toml";
export const REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT = "c75f484c063b801b1843f4f0ea53bdc7edcfb9a0";

export const REVIEWED_ALE_RETIREMENT_ARTIFACTS = Object.freeze([
  Object.freeze({ path: ALE_RETIREMENT_GATEWAY_ARTIFACT, sha256: "8d0b91fac30f4012d0901e7863f9dfa0e800ed80de976cd3f3a7317532a95d67" }),
  Object.freeze({ path: ALE_RETIREMENT_HANDLER_ARTIFACT, sha256: "a947790f477c09a7a7ce9262516d5e5e4043f5734ad04acf512f77b603ca47c8" }),
  Object.freeze({ path: ALE_RETIREMENT_MIGRATION_ARTIFACT, sha256: "5a2c8bd2f5921569d5551c5682d836ac6f232915f55b2d83e616ad93e26f68ec" }),
  Object.freeze({ path: ALE_RETIREMENT_CONFIG_ARTIFACT, sha256: "9046869d6508c166f95bdb689e08f58cd13490d4918951340cc04e90f9ba9328" }),
] as const);

export const SEC003_RETIREMENT_OBSERVATION_KINDS = Object.freeze([
  "DEPLOYMENT_IDENTITY",
  "LOVABLE_DEPLOYMENT",
  "DATABASE_RETIREMENT",
  "DEPENDENCY_PRESERVATION",
] as const);
export type Sec003RetirementObservationKind = (typeof SEC003_RETIREMENT_OBSERVATION_KINDS)[number];

export interface AleRetirementReleaseManifest {
  readonly schemaVersion: 2;
  readonly manifestId: "SEC003-ALE-RETIREMENT-RELEASE-002";
  readonly reviewedImplementationCommit: typeof REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT;
  readonly branch: "sol/omega-institutional-spine";
  readonly affectedArtifacts: readonly string[];
  readonly reviewedArtifacts: readonly Readonly<{ path: string; sha256: string }>[];
  readonly deploymentIdentityPolicy: "EXACT_DESIGNATED_COMMIT_PLUS_REVIEWED_ARTIFACTS";
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
  readonly schemaVersion: 2;
  readonly closureId: string;
  readonly expectedProjectRef: string;
  readonly expectedDeploymentCommit: string;
  readonly releaseManifest: AleRetirementReleaseManifest;
  readonly admissionRefs: readonly string[];
  readonly admissions: readonly CustodyAdmissionEnvelope[];
}

export interface Sec003RetirementDecision {
  readonly decision: "CLOSED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  readonly closureState: "CONFIRMED_INVALID" | null;
  readonly deploymentIdentity: "VERIFIED" | "UNKNOWN";
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
): readonly string[] {
  const issues: string[] = [];
  if (value.schemaVersion !== 2 || value.manifestId !== "SEC003-ALE-RETIREMENT-RELEASE-002") issues.push("malformed_manifest_identity");
  if (!exactCommit(value.reviewedImplementationCommit)) issues.push("malformed_reviewed_implementation_commit");
  if (value.reviewedImplementationCommit !== REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT) issues.push("wrong_reviewed_implementation_commit");
  if (value.branch !== "sol/omega-institutional-spine") issues.push("wrong_release_branch");
  const artifacts = new Set(value.affectedArtifacts);
  for (const required of [ALE_RETIREMENT_GATEWAY_ARTIFACT, ALE_RETIREMENT_HANDLER_ARTIFACT, ALE_RETIREMENT_MIGRATION_ARTIFACT]) {
    if (!artifacts.has(required)) issues.push(`missing_release_artifact:${required}`);
  }
  const reviewed = new Map(value.reviewedArtifacts.map((artifact) => [artifact.path, artifact.sha256]));
  for (const required of REVIEWED_ALE_RETIREMENT_ARTIFACTS) {
    if (reviewed.get(required.path) !== required.sha256) issues.push(`reviewed_artifact_identity_changed:${required.path}`);
  }
  if (reviewed.size !== REVIEWED_ALE_RETIREMENT_ARTIFACTS.length) issues.push("reviewed_artifact_set_changed");
  if (value.deploymentIdentityPolicy !== "EXACT_DESIGNATED_COMMIT_PLUS_REVIEWED_ARTIFACTS") issues.push("unsafe_deployment_identity_policy");
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
