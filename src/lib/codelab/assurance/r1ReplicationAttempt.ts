import {
  OMEGA_R1_REPLICATION_SPEC_001,
  R1_REPLICATION_REQUIREMENTS,
  type R1ReplicationRequirement,
} from "./r1ReplicationSpec";

export type ReplicationOutcome = "REPLICATED" | "FAILED_REPLICATION" | "BLOCKED_ENVIRONMENT" | "INSUFFICIENT_EVIDENCE";
export type RequirementExecutionState = "EXECUTED_PASS" | "EXECUTED_FAIL" | "BLOCKED" | "SKIPPED_DEPENDENCY";

export interface ReplicationEnvironmentCandidate {
  readonly environmentId: string;
  readonly kind: "ACTIVE_WORKTREE" | "SEPARATE_GIT_CHECKOUT" | "NON_GIT_DEPENDENCY_SANDBOX";
  readonly observedCommit: string | null;
  readonly worktreeState: "CLEAN" | "DIRTY" | "NOT_APPLICABLE";
  readonly dependenciesPresent: boolean;
  readonly eligible: false;
  readonly rejectionReasons: readonly string[];
}

export interface R1ReplicationAttempt {
  readonly schemaVersion: 1;
  readonly attemptId: "OMEGA-R1-INDEPENDENT-REPLICATION-001";
  readonly targetCandidateCommit: string;
  readonly host: { readonly platform: "win32"; readonly architecture: "x64"; readonly node: "v24.19.0"; readonly npm: "11.17.0" };
  readonly environmentCandidates: readonly ReplicationEnvironmentCandidate[];
  readonly requirementOutcomes: Readonly<Record<R1ReplicationRequirement, RequirementExecutionState>>;
  readonly outcome: ReplicationOutcome;
  readonly independenceClassification: "NOT_ESTABLISHED";
  readonly evidenceClass: "E0";
  readonly executedRequirements: readonly R1ReplicationRequirement[];
  readonly failedRequirements: readonly R1ReplicationRequirement[];
  readonly blockedRequirements: readonly R1ReplicationRequirement[];
  readonly skippedRequirements: readonly R1ReplicationRequirement[];
  readonly packageInstallAttempted: false;
  readonly networkAttempted: false;
  readonly sourceOrEnvironmentMutated: false;
  readonly grantsAuthority: false;
}

const requirementOutcomes: Readonly<Record<R1ReplicationRequirement, RequirementExecutionState>> = Object.freeze({
  CLEAN_CHECKOUT: "BLOCKED",
  EXACT_CANDIDATE: "SKIPPED_DEPENDENCY",
  EXACT_SUITE_MANIFEST: "SKIPPED_DEPENDENCY",
  INDEPENDENT_ENVIRONMENT_IDENTITY: "BLOCKED",
  NO_LOCAL_DEVELOPER_STATE: "BLOCKED",
  READ_ONLY_AUTHORITY: "EXECUTED_PASS",
  R1_PRIVATE_EVALUATOR: "SKIPPED_DEPENDENCY",
  INTEGRATED_RO_VERTICAL_SLICE: "SKIPPED_DEPENDENCY",
  HOST_ALIAS_EQUIVALENT_WHERE_SUPPORTED: "SKIPPED_DEPENDENCY",
  EVIDENCE_CUSTODY: "SKIPPED_DEPENDENCY",
  OUTPUT_MANIFEST: "EXECUTED_PASS",
});

export const OMEGA_R1_INDEPENDENT_REPLICATION_001 = Object.freeze<R1ReplicationAttempt>({
  schemaVersion: 1,
  attemptId: "OMEGA-R1-INDEPENDENT-REPLICATION-001",
  targetCandidateCommit: OMEGA_R1_REPLICATION_SPEC_001.candidateCommit,
  host: { platform: "win32", architecture: "x64", node: "v24.19.0", npm: "11.17.0" },
  environmentCandidates: [
    {
      environmentId: "CURRENT-GENEROUS-AI-CORE",
      kind: "ACTIVE_WORKTREE",
      observedCommit: "587b9888d95ca34833802f1f74f478c63900a1f0",
      worktreeState: "CLEAN",
      dependenciesPresent: true,
      eligible: false,
      rejectionReasons: ["active_worktree_not_independent", "candidate_differs_from_replication_spec"],
    },
    {
      environmentId: "CI-REPRO-6CBCB0C",
      kind: "SEPARATE_GIT_CHECKOUT",
      observedCommit: "6cbcb0c591cd3321175237af1cb0293c3f132166",
      worktreeState: "DIRTY",
      dependenciesPresent: false,
      eligible: false,
      rejectionReasons: ["candidate_mismatch", "worktree_not_clean", "dependencies_unavailable", "package_install_forbidden"],
    },
    {
      environmentId: "LUMINA-AUDIT-SANDBOX-0A91E36",
      kind: "NON_GIT_DEPENDENCY_SANDBOX",
      observedCommit: null,
      worktreeState: "NOT_APPLICABLE",
      dependenciesPresent: true,
      eligible: false,
      rejectionReasons: ["exact_source_identity_unprovable", "preexisting_dependency_cache_untrusted", "not_a_clean_git_checkout"],
    },
  ],
  requirementOutcomes,
  outcome: "BLOCKED_ENVIRONMENT",
  independenceClassification: "NOT_ESTABLISHED",
  evidenceClass: "E0",
  executedRequirements: R1_REPLICATION_REQUIREMENTS.filter((requirement) => requirementOutcomes[requirement] === "EXECUTED_PASS"),
  failedRequirements: R1_REPLICATION_REQUIREMENTS.filter((requirement) => requirementOutcomes[requirement] === "EXECUTED_FAIL"),
  blockedRequirements: R1_REPLICATION_REQUIREMENTS.filter((requirement) => requirementOutcomes[requirement] === "BLOCKED"),
  skippedRequirements: R1_REPLICATION_REQUIREMENTS.filter((requirement) => requirementOutcomes[requirement] === "SKIPPED_DEPENDENCY"),
  packageInstallAttempted: false,
  networkAttempted: false,
  sourceOrEnvironmentMutated: false,
  grantsAuthority: false,
});

export function validateR1ReplicationAttempt(attempt: R1ReplicationAttempt): readonly string[] {
  const issues: string[] = [];
  if (attempt.schemaVersion !== 1 || attempt.attemptId !== "OMEGA-R1-INDEPENDENT-REPLICATION-001") issues.push("wrong_replication_attempt_identity");
  if (attempt.targetCandidateCommit !== OMEGA_R1_REPLICATION_SPEC_001.candidateCommit) issues.push("wrong_replication_target");
  if (attempt.environmentCandidates.some((candidate) => candidate.eligible || candidate.rejectionReasons.length === 0)) issues.push("ineligible_environment_misclassified");
  const partition = [...attempt.executedRequirements, ...attempt.failedRequirements, ...attempt.blockedRequirements, ...attempt.skippedRequirements];
  if (partition.length !== R1_REPLICATION_REQUIREMENTS.length || new Set(partition).size !== R1_REPLICATION_REQUIREMENTS.length) issues.push("requirement_outcomes_not_partitioned");
  if (attempt.outcome !== "BLOCKED_ENVIRONMENT" || attempt.independenceClassification !== "NOT_ESTABLISHED") issues.push("replication_outcome_inflated");
  if (attempt.evidenceClass !== "E0") issues.push("blocked_attempt_evidence_inflated");
  if (attempt.packageInstallAttempted || attempt.networkAttempted || attempt.sourceOrEnvironmentMutated || attempt.grantsAuthority) issues.push("blocked_attempt_exceeded_authority");
  return Object.freeze([...new Set(issues)]);
}
