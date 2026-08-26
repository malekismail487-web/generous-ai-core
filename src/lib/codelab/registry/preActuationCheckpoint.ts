import { DIRECTIVE_009_PLAN_COVERAGE, DIRECTIVE_009_WORKSTREAM_IDS } from "./directive009Coverage";
import { OMEGA_R1_BASELINE_GENEALOGY, validateInstitutionalBaselineGenealogy } from "./baselineGenealogy";

export const OMEGA_PREACTUATION_CHECKPOINT_COMMIT = "587b9888d95ca34833802f1f74f478c63900a1f0";

export interface PreActuationCheckpoint {
  readonly schemaVersion: 1;
  readonly checkpointId: "OMEGA-PREACTUATION-CHECKPOINT-001";
  readonly candidateCommit: typeof OMEGA_PREACTUATION_CHECKPOINT_COMMIT;
  readonly description: "VERIFIED_PRE_ACTUATION_ARCHITECTURE_CHECKPOINT";
  readonly authority: {
    readonly available: readonly ["READ_REPOSITORY"];
    readonly unavailable: readonly ["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"];
    readonly forbidden: readonly ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"];
  };
  readonly security: { readonly sec003: "BLOCKED_EXTERNAL"; readonly g1: "OPEN"; readonly g2: "NOT_ACHIEVED"; readonly preR2: "NOT_READY" };
  readonly suiteManifest: { readonly suiteVersion: "omega-institutional-suite/13"; readonly manifestDigest: string; readonly suiteCount: 45; readonly passedChecks: 1357; readonly semanticDefinitions: 1306 };
  readonly typescript: { readonly version: "5.8.3"; readonly baseline: 0; readonly current: 0; readonly added: 0 };
  readonly secretScan: { readonly state: "PASS"; readonly findings: 0 };
  readonly productionBuild: { readonly state: "PASS" };
  readonly w0: { readonly nodeStatic: "PASS"; readonly deno: "BLOCKED_ENVIRONMENT"; readonly network: "BLOCKED_AUTHORITY" };
  readonly planCoverage: "PARTIAL_JUST_IN_TIME";
  readonly evidenceCustody: "VERIFIED_LOCAL_E3";
  readonly baselineGenealogy: typeof OMEGA_R1_BASELINE_GENEALOGY;
  readonly directive009Workstreams: typeof DIRECTIVE_009_WORKSTREAM_IDS;
  readonly directive009CapabilityIds: readonly string[];
  readonly grantsAuthority: false;
  readonly isR2: false;
  readonly independentlyReplicated: false;
  readonly operationallySafeForMutation: false;
}

export const OMEGA_PREACTUATION_CHECKPOINT_001 = Object.freeze<PreActuationCheckpoint>({
  schemaVersion: 1,
  checkpointId: "OMEGA-PREACTUATION-CHECKPOINT-001",
  candidateCommit: OMEGA_PREACTUATION_CHECKPOINT_COMMIT,
  description: "VERIFIED_PRE_ACTUATION_ARCHITECTURE_CHECKPOINT",
  authority: {
    available: ["READ_REPOSITORY"],
    unavailable: ["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"],
    forbidden: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
  },
  security: { sec003: "BLOCKED_EXTERNAL", g1: "OPEN", g2: "NOT_ACHIEVED", preR2: "NOT_READY" },
  suiteManifest: {
    suiteVersion: "omega-institutional-suite/13",
    manifestDigest: "3342b852fe88a2806fed1618e42b4ca8d6d9ff71c5cfd1d557152c565b1f5de9",
    suiteCount: 45,
    passedChecks: 1357,
    semanticDefinitions: 1306,
  },
  typescript: { version: "5.8.3", baseline: 0, current: 0, added: 0 },
  secretScan: { state: "PASS", findings: 0 },
  productionBuild: { state: "PASS" },
  w0: { nodeStatic: "PASS", deno: "BLOCKED_ENVIRONMENT", network: "BLOCKED_AUTHORITY" },
  planCoverage: "PARTIAL_JUST_IN_TIME",
  evidenceCustody: "VERIFIED_LOCAL_E3",
  baselineGenealogy: OMEGA_R1_BASELINE_GENEALOGY,
  directive009Workstreams: DIRECTIVE_009_WORKSTREAM_IDS,
  directive009CapabilityIds: DIRECTIVE_009_PLAN_COVERAGE.map((record) => record.capabilityObjectiveId),
  grantsAuthority: false,
  isR2: false,
  independentlyReplicated: false,
  operationallySafeForMutation: false,
});

export function validatePreActuationCheckpoint(checkpoint: PreActuationCheckpoint): readonly string[] {
  const issues: string[] = [];
  if (checkpoint.schemaVersion !== 1 || checkpoint.checkpointId !== "OMEGA-PREACTUATION-CHECKPOINT-001") issues.push("wrong_checkpoint_identity");
  if (checkpoint.candidateCommit !== OMEGA_PREACTUATION_CHECKPOINT_COMMIT) issues.push("wrong_candidate_commit");
  if (checkpoint.description !== "VERIFIED_PRE_ACTUATION_ARCHITECTURE_CHECKPOINT") issues.push("checkpoint_description_inflated");
  if (checkpoint.authority.available.join(",") !== "READ_REPOSITORY") issues.push("authority_ceiling_changed");
  if (!checkpoint.authority.unavailable.includes("WRITE_SANDBOX")) issues.push("write_sandbox_not_unavailable");
  if (checkpoint.security.sec003 !== "BLOCKED_EXTERNAL" || checkpoint.security.preR2 !== "NOT_READY") issues.push("security_or_gate_state_inflated");
  if (checkpoint.security.g1 !== "OPEN" || checkpoint.security.g2 !== "NOT_ACHIEVED") issues.push("institutional_gate_state_inflated");
  if (checkpoint.suiteManifest.suiteCount !== 45 || checkpoint.suiteManifest.passedChecks !== 1357 || checkpoint.suiteManifest.semanticDefinitions !== 1306) issues.push("accepted_suite_manifest_binding_changed");
  if (checkpoint.typescript.baseline !== 0 || checkpoint.typescript.current !== 0 || checkpoint.typescript.added !== 0) issues.push("typescript_zero_binding_changed");
  if (checkpoint.secretScan.state !== "PASS" || checkpoint.secretScan.findings !== 0 || checkpoint.productionBuild.state !== "PASS") issues.push("accepted_security_or_build_state_changed");
  if (checkpoint.planCoverage !== "PARTIAL_JUST_IN_TIME") issues.push("dishonest_total_plan_coverage");
  if (checkpoint.directive009Workstreams.length !== DIRECTIVE_009_WORKSTREAM_IDS.length || checkpoint.directive009CapabilityIds.length !== DIRECTIVE_009_WORKSTREAM_IDS.length) issues.push("directive009_identity_binding_incomplete");
  if (validateInstitutionalBaselineGenealogy(checkpoint.baselineGenealogy).length > 0) issues.push("baseline_genealogy_invalid");
  if (checkpoint.grantsAuthority || checkpoint.isR2 || checkpoint.independentlyReplicated || checkpoint.operationallySafeForMutation) issues.push("checkpoint_claims_operational_capability");
  return Object.freeze([...new Set(issues)]);
}
