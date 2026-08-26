import { INHERITED_OMEGA_CONSTRAINTS, OMEGA_CORPUS_STATUS, OMEGA_COVERAGE_STATUS } from "./planCoverage";

export const CONTROLLED_MUTATION_CHAIN = Object.freeze([
  "OMEGA-R2-A-001",
  "OMEGA-R2-B-001",
  "OMEGA-R2-C-001",
  "OMEGA-R2-D-001",
  "OMEGA-R2-E-001",
  "OMEGA-R2-F-001",
  "OMEGA-R2-G-001",
  "OMEGA-ASSURE-R2-001",
] as const);
export type ControlledMutationChunkId = (typeof CONTROLLED_MUTATION_CHAIN)[number];

export interface R2NyxLineageEntry {
  readonly chunkId: ControlledMutationChunkId;
  readonly sequence: number;
  readonly capabilityObjective: string;
  readonly directPlanAncestry: readonly string[];
  readonly supportingPlans: readonly string[];
  readonly inheritedConstraints: typeof INHERITED_OMEGA_CONSTRAINTS;
  readonly securityDependencies: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly authorityDelta: { readonly added: readonly string[]; readonly preservedForbidden: readonly string[] };
  readonly deferredArchitecture: readonly string[];
  readonly knownConflicts: readonly string[];
  readonly supersededMechanisms: readonly string[];
  readonly futureNyxCapabilityUnlocked: string;
  readonly grantsAuthority: false;
}

const FORBIDDEN = Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]);
const base = (
  entry: Omit<R2NyxLineageEntry, "inheritedConstraints" | "grantsAuthority" | "authorityDelta"> & { readonly authorityAdded?: readonly string[] },
): R2NyxLineageEntry => {
  const { authorityAdded = [], ...lineage } = entry;
  return Object.freeze({
    ...lineage,
    inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS,
    authorityDelta: { added: authorityAdded, preservedForbidden: FORBIDDEN },
    grantsAuthority: false,
  });
};

export const R2_TO_NYX_CAPABILITY_LINEAGE = Object.freeze<readonly R2NyxLineageEntry[]>([
  base({ chunkId: "OMEGA-R2-A-001", sequence: 1, capabilityObjective: "Disposable isolated mutation domain", directPlanAncestry: ["OMEGA-R2-DESIGN-001", "PLAN-XX", "PLAN-DCCLXXX"], supportingPlans: ["PLAN-CDLXIX", "PLAN-DXIV"], securityDependencies: ["OMEGA-SEC-003", "R1_PRESERVATION", "RUNTIME_AUTHORITY_OBSERVATION"], evidenceRequirements: ["E4_SANDBOX_PROVISION", "SEMANTIC_LIFECYCLE", "CLEANUP", "REVOCATION", "NEGATIVE_CAPABILITY_DELTA"], authorityAdded: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"], deferredArchitecture: ["CONTENT_MUTATION", "REPOSITORY_PATCH_APPLY", "CROSS_PROCESS_TOKENS"], knownConflicts: ["WRITE_MUST_NOT_EXPAND_READ", "TOCTOU_TARGET_IDENTITY"], supersededMechanisms: ["UNSCOPED_TEMP_DIRECTORY"], futureNyxCapabilityUnlocked: "CONTROLLED_MUTATION_DOMAIN_FOR_VERIFIED_CODING_ACTION" }),
  base({ chunkId: "OMEGA-R2-B-001", sequence: 2, capabilityObjective: "Create a new bounded sandbox file", directPlanAncestry: ["OMEGA-R2-DESIGN-001", "PLAN-CDLI", "PLAN-CDLII"], supportingPlans: ["PLAN-DLXXXIII", "PLAN-DLXXXIV"], securityDependencies: ["OMEGA-R2-A-001", "EXTENSION_AND_VOLUME_POLICY"], evidenceRequirements: ["NEW_FILE_PRECONDITION", "CONTENT_HASH", "AUDIT_EVENT", "NEGATIVE_REPOSITORY_WRITE"], authorityAdded: ["WRITE_SANDBOX_CONTENT"], deferredArchitecture: ["MODIFY_EXISTING_FILE", "DELETE", "TRANSACTION"], knownConflicts: ["CONTENT_WRITE_VS_RESOURCE_BOUNDS"], supersededMechanisms: ["ARBITRARY_FILESYSTEM_WRITE"], futureNyxCapabilityUnlocked: "VERIFIED_NEW_ARTIFACT_CREATION" }),
  base({ chunkId: "OMEGA-R2-C-001", sequence: 3, capabilityObjective: "Modify an existing sandbox file with stale-base rejection", directPlanAncestry: ["PLAN-CDLI", "PLAN-CDLII", "PLAN-DCXLIV"], supportingPlans: ["PLAN-DXIV", "PLAN-DXV"], securityDependencies: ["OMEGA-R2-B-001", "BASE_HASH_BINDING"], evidenceRequirements: ["EXPECTED_BASE_HASH", "POSTCONDITION_HASH", "STALE_STATE_REJECTION"], deferredArchitecture: ["DELETE", "MULTI_FILE_ATOMICITY"], knownConflicts: ["CONCURRENT_EDIT_VS_STALE_PLAN"], supersededMechanisms: ["BLIND_OVERWRITE"], futureNyxCapabilityUnlocked: "VERIFIED_LOCAL_CODE_TRANSFORMATION" }),
  base({ chunkId: "OMEGA-R2-D-001", sequence: 4, capabilityObjective: "Delete an owned sandbox artifact reversibly", directPlanAncestry: ["PLAN-CDLV", "PLAN-CDLIV", "PLAN-CDLI"], supportingPlans: ["PLAN-DLXV", "PLAN-DLXXIX"], securityDependencies: ["OMEGA-R2-C-001", "OWNERSHIP_PROOF"], evidenceRequirements: ["EXACT_TARGET_IDENTITY", "ROLLBACK_MATERIAL", "POST_DELETE_OBSERVATION"], deferredArchitecture: ["MULTI_FILE_TRANSACTION"], knownConflicts: ["DEAD_CODE_REMOVAL_VS_SURVIVING_INTENT"], supersededMechanisms: ["UNVERIFIED_DELETE"], futureNyxCapabilityUnlocked: "VERIFIED_REVERSIBLE_ARTIFACT_REMOVAL" }),
  base({ chunkId: "OMEGA-R2-E-001", sequence: 5, capabilityObjective: "Atomic bounded sandbox mutation transaction", directPlanAncestry: ["PLAN-CDLI", "PLAN-CDLII", "PLAN-DLXVIII"], supportingPlans: ["PLAN-DCLXXXI", "PLAN-DCLXXXII"], securityDependencies: ["OMEGA-R2-D-001", "ATOMIC_COMMIT_BOUNDARY"], evidenceRequirements: ["TRANSACTION_ID", "ALL_PRECONDITIONS", "ATOMIC_POSTSTATE", "FAIL_CLOSED"], deferredArchitecture: ["REPOSITORY_TRANSACTION"], knownConflicts: ["ATOMICITY_VS_HOST_FILESYSTEM_SEMANTICS"], supersededMechanisms: ["PARTIAL_MULTI_FILE_MUTATION"], futureNyxCapabilityUnlocked: "TRANSACTIONAL_ENGINEERING_ACTION" }),
  base({ chunkId: "OMEGA-R2-F-001", sequence: 6, capabilityObjective: "Restore protected scoped state after failed mutation", directPlanAncestry: ["PLAN-DLXV", "PLAN-DLXVI", "PLAN-DCXLVI"], supportingPlans: ["PLAN-CDXIV", "PLAN-DCLXXXVII"], securityDependencies: ["OMEGA-R2-E-001", "ROLLBACK_EQUIVALENCE_DEFINITION"], evidenceRequirements: ["PRESTATE_CAPTURE", "ROLLBACK_EXECUTION", "STRUCTURAL_EQUIVALENCE", "SIDE_EFFECT_ACCOUNTING"], deferredArchitecture: ["CROSS_TOOL_SIDE_EFFECT_ROLLBACK"], knownConflicts: ["CONTENT_EQUIVALENCE_VS_METADATA_EQUIVALENCE"], supersededMechanisms: ["BEST_EFFORT_RECOVERY"], futureNyxCapabilityUnlocked: "RECOVERABLE_LONG_HORIZON_ENGINEERING" }),
  base({ chunkId: "OMEGA-R2-G-001", sequence: 7, capabilityObjective: "Generate a candidate-bound patch object without applying it", directPlanAncestry: ["PLAN-CDLI", "PLAN-CDLII", "PLAN-CDLIV"], supportingPlans: ["PLAN-DLXIII", "PLAN-DLXVII"], securityDependencies: ["OMEGA-R2-F-001", "PROPOSAL_AUTHORIZATION_SEPARATION"], evidenceRequirements: ["PATCH_BASE_HASHES", "PRECONDITIONS", "POSTCONDITIONS", "ROLLBACK_REQUIREMENTS", "NO_AUTO_APPLY"], deferredArchitecture: ["REPOSITORY_PATCH_APPLICATION", "BUILD_EXECUTION"], knownConflicts: ["PLAN_REQUESTS_AUTHORITY_BUT_CANNOT_GRANT_IT"], supersededMechanisms: ["DIRECT_UNREVIEWED_REPOSITORY_EDIT"], futureNyxCapabilityUnlocked: "VERIFIABLE_CHANGE_PROPOSAL_AND_TOOL_CONSTRUCTION" }),
  base({ chunkId: "OMEGA-ASSURE-R2-001", sequence: 8, capabilityObjective: "Independent controlled-mutation promotion decision", directPlanAncestry: ["PLAN-D", "PLAN-DCCLXXX", "PLAN-IV"], supportingPlans: ["PLAN-DI", "PLAN-DII", "PLAN-DIII"], securityDependencies: ["OMEGA-R2-A-001", "OMEGA-R2-B-001", "OMEGA-R2-C-001", "OMEGA-R2-D-001", "OMEGA-R2-E-001", "OMEGA-R2-F-001", "OMEGA-R2-G-001"], evidenceRequirements: ["EXTERNAL_CUSTODY", "E4_OPERATIONAL_EVIDENCE", "NEGATIVE_CAPABILITY_EVIDENCE", "BASELINE_DELTA", "PLAN_COVERAGE", "NO_BLOCKING_UNKNOWNS"], deferredArchitecture: ["MODEL_BACKED_AUTONOMY", "NETWORK", "DEPLOYMENT"], knownConflicts: ["SELF_CERTIFICATION", "CORRELATED_VERIFIER_ACCEPTANCE"], supersededMechanisms: ["GENERATOR_SELF_APPROVAL"], futureNyxCapabilityUnlocked: "TRUSTED_MUTATION_SUBSTRATE_FOR_NYX_SOFTWARE_RESEARCH" }),
]);

export const R2_NYX_LINEAGE_COVERAGE = Object.freeze({
  corpusStatus: OMEGA_CORPUS_STATUS,
  coverageStatus: OMEGA_COVERAGE_STATUS,
  conceptualPath: Object.freeze([
    "CONTROLLED_MUTATION",
    "VERIFIED_CODING_ACTION",
    "LONG_HORIZON_ENGINEERING",
    "TOOL_CONSTRUCTION",
    "RESEARCH_ENGINEERING",
    "ΝΥΞ",
  ]),
  grantsAuthority: false,
});

export function validateR2NyxLineage(entries: readonly R2NyxLineageEntry[] = R2_TO_NYX_CAPABILITY_LINEAGE): readonly string[] {
  const issues: string[] = [];
  if (entries.length !== CONTROLLED_MUTATION_CHAIN.length) issues.push("controlled_mutation_chain_incomplete");
  entries.forEach((entry, index) => {
    if (entry.chunkId !== CONTROLLED_MUTATION_CHAIN[index] || entry.sequence !== index + 1) issues.push(`lineage_order_invalid:${entry.chunkId}`);
    if (!entry.capabilityObjective.trim() || entry.directPlanAncestry.length === 0 || entry.supportingPlans.length === 0) issues.push(`plan_ancestry_incomplete:${entry.chunkId}`);
    if (entry.securityDependencies.length === 0 || entry.evidenceRequirements.length === 0 || entry.deferredArchitecture.length === 0) issues.push(`institutional_fields_incomplete:${entry.chunkId}`);
    if (entry.inheritedConstraints.length !== INHERITED_OMEGA_CONSTRAINTS.length) issues.push(`inherited_constraints_incomplete:${entry.chunkId}`);
    if (entry.grantsAuthority) issues.push(`lineage_attempts_authority_grant:${entry.chunkId}`);
    if (!entry.futureNyxCapabilityUnlocked.trim()) issues.push(`nyx_capability_missing:${entry.chunkId}`);
  });
  if (entries[0]?.authorityDelta.added.join(",") !== "PROVISION_SANDBOX,TERMINATE_SANDBOX") issues.push("r2_a_authority_delta_not_minimal");
  if (entries.slice(2).some((entry) => entry.authorityDelta.added.length > 0)) issues.push("later_capability_silently_expands_authority");
  if (R2_NYX_LINEAGE_COVERAGE.coverageStatus !== OMEGA_COVERAGE_STATUS || R2_NYX_LINEAGE_COVERAGE.corpusStatus !== OMEGA_CORPUS_STATUS) issues.push("lineage_overclaims_corpus_coverage");
  return Object.freeze([...new Set(issues)]);
}
