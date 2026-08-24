import { isAbsolute, relative, resolve, sep } from "node:path";

export const R2_A_ADVERSARIAL_CASES = Object.freeze([
  "SANDBOX_ROOT_REDIRECTED_TO_REPOSITORY",
  "FILESYSTEM_ALIAS_ESCAPE",
  "DUPLICATE_SANDBOX_IDENTITY",
  "EXPIRED_REQUEST",
  "MALFORMED_PATH",
  "EXCESSIVE_NESTING",
  "CLEANUP_FAILURE",
  "OPEN_HANDLE_CONTENTION",
  "REPOSITORY_ROOT_AS_SANDBOX",
  "TARGET_IDENTITY_CHANGED_AFTER_VALIDATION",
] as const);
export type R2AAdversarialCase = (typeof R2_A_ADVERSARIAL_CASES)[number];

export const CONTROLLED_MUTATION_CRITICAL_PATH = Object.freeze([
  { chunkId: "OMEGA-SEC-003", status: "BLOCKED_EXTERNAL", blockedBy: [] },
  { chunkId: "OMEGA-R2-A-001", status: "BLOCKED_BY_SEC", blockedBy: ["OMEGA-SEC-003"] },
  { chunkId: "OMEGA-R2-B-001", status: "BLOCKED_BY_R2-A", blockedBy: ["OMEGA-R2-A-001"] },
  { chunkId: "OMEGA-R2-C-001", status: "BLOCKED_BY_R2-B", blockedBy: ["OMEGA-R2-B-001"] },
  { chunkId: "OMEGA-R2-D-001", status: "BLOCKED_BY_R2-C", blockedBy: ["OMEGA-R2-C-001"] },
  { chunkId: "OMEGA-R2-E-001", status: "BLOCKED_BY_R2-D", blockedBy: ["OMEGA-R2-D-001"] },
  { chunkId: "OMEGA-R2-F-001", status: "BLOCKED_BY_R2-E", blockedBy: ["OMEGA-R2-E-001"] },
  { chunkId: "OMEGA-R2-G-001", status: "BLOCKED_BY_R2-F", blockedBy: ["OMEGA-R2-F-001"] },
  {
    chunkId: "OMEGA-ASSURE-R2-001",
    status: "BLOCKED_BY_R2-A:G",
    blockedBy: [
      "OMEGA-R2-A-001",
      "OMEGA-R2-B-001",
      "OMEGA-R2-C-001",
      "OMEGA-R2-D-001",
      "OMEGA-R2-E-001",
      "OMEGA-R2-F-001",
      "OMEGA-R2-G-001",
    ],
  },
] as const);

export interface R2ASandboxProvisioningSpec {
  readonly schemaVersion: 1;
  readonly specificationId: "OMEGA-R2-A-SPEC-EVAL-001";
  readonly phase: "R2-A";
  readonly maturity: "SPECIFIED";
  readonly implementationState: "DESIGN_AND_EVALUATOR_ONLY";
  readonly operationalAuthority: "UNAVAILABLE";
  readonly filesystemAdapter: "NONE";
  readonly contentMutation: "FORBIDDEN_UNTIL_R2-B";
  readonly observationAuthorityLaw: {
    readonly statement: "MUTATION_AUTHORITY_NEVER_IMPLICITLY_EXPANDS_OBSERVATION_AUTHORITY";
    readonly explicitReadGrantRequired: true;
    readonly writeImpliesRead: false;
  };
  readonly provisionSequence: readonly [
    "REQUEST",
    "VALIDATE_AUTHORITY",
    "CREATE_BENEATH_APPROVED_ROOT",
    "PROVE_DISJOINTNESS",
    "RECORD_CANONICAL_IDENTITY",
    "ENFORCE_POLICY",
    "TERMINATE",
    "CLEAN",
    "VERIFY_CLEANUP",
  ];
  readonly threatModel: readonly string[];
  readonly adversarialCases: readonly R2AAdversarialCase[];
  readonly rollbackEquivalence: {
    readonly scopedDimensions: readonly ["EXISTENCE", "DIRECTORY_STRUCTURE", "RELEVANT_METADATA"];
    readonly futureRepositoryDimensions: readonly [
      "FILE_MODE",
      "RENAME_STATE",
      "GIT_INDEX_STATE",
      "LINE_ENDING_NORMALIZATION",
      "GENERATED_ARTIFACTS",
      "TOOL_SIDE_EFFECTS",
    ];
  };
  readonly tokenAuthenticity: {
    readonly currentBoundary: "PROCESS_LOCAL_DESIGN_ONLY";
    readonly cryptographicAuthenticityRequiredNow: false;
    readonly mandatoryBefore: readonly [
      "CROSS_PROCESS_AUTHORITY",
      "REMOTE_WORKERS",
      "PERSISTENT_CAPABILITIES",
      "NETWORK_EXECUTOR",
      "HIGH_IMPACT_REPOSITORY_AUTHORITY",
    ];
  };
  readonly evidenceLedgerClaim: "TAMPER_EVIDENT_NOT_SIGNED";
}

export interface R2AProvisioningRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly authority: "WRITE_SANDBOX";
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly repositoryRoot: string;
  readonly approvedSandboxRoot: string;
  readonly requestedSandboxName: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly limits: {
    readonly maxLifetimeMs: number;
    readonly maxNestingDepth: number;
    readonly maxEntries: number;
    readonly maxTotalBytes: number;
  };
  readonly readScopes: readonly string[];
  readonly writeScopes: readonly string[];
}

export interface R2AIdentityObservation {
  readonly requestId: string;
  readonly canonicalRepositoryRoot: string;
  readonly canonicalApprovedSandboxRoot: string;
  readonly canonicalSandboxPath: string;
  readonly targetIdentityAtValidation: string;
  readonly targetIdentityAtUse: string;
  readonly disjointFromRepository: boolean;
  readonly evidenceReferences: readonly string[];
}

export interface R2ACleanupObservation {
  readonly requestId: string;
  readonly existedBefore: false;
  readonly existsAfterCleanup: false;
  readonly directoryEntriesBefore: readonly [];
  readonly directoryEntriesAfter: readonly [];
  readonly relevantMetadataEquivalent: true;
  readonly cleanupAttempted: true;
  readonly cleanupSucceeded: true;
  readonly evidenceReferences: readonly string[];
}

export interface R2AValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface R2AEligibilityInput {
  readonly securityContainment: "REVOKED_AND_VERIFIED" | "ROTATED_AND_VERIFIED" | "CONFIRMED_INVALID" | "UNKNOWN";
  readonly r1Preserved: "VERIFIED" | "FAILED" | "UNVERIFIED";
  readonly specificationValid: "VERIFIED" | "FAILED" | "UNVERIFIED";
}

export interface R2AEligibilityDecision {
  readonly decision: "ELIGIBLE_FOR_R2_A_IMPLEMENTATION" | "INELIGIBLE";
  readonly blockers: readonly string[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(resolve(root), resolve(candidate));
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function disjoint(left: string, right: string): boolean {
  return !within(left, right) && !within(right, left);
}

function validSandboxName(value: string, maxNestingDepth: number): boolean {
  if (!nonEmpty(value) || value.includes("\0") || isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("//")) return false;
  const segments = normalized.split("/");
  return segments.length <= maxNestingDepth
    && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function validateR2ASpecification(spec: R2ASandboxProvisioningSpec): R2AValidation {
  const issues: string[] = [];
  if (spec.schemaVersion !== 1) issues.push("unsupported_schema_version");
  if (spec.specificationId !== "OMEGA-R2-A-SPEC-EVAL-001" || spec.phase !== "R2-A") issues.push("wrong_specification_identity");
  if (spec.maturity !== "SPECIFIED" || spec.implementationState !== "DESIGN_AND_EVALUATOR_ONLY") issues.push("specification_maturity_inflation");
  if (spec.operationalAuthority !== "UNAVAILABLE" || spec.filesystemAdapter !== "NONE") issues.push("operational_authority_exposed");
  if (spec.contentMutation !== "FORBIDDEN_UNTIL_R2-B") issues.push("content_mutation_exposed_in_r2_a");
  if (spec.observationAuthorityLaw.explicitReadGrantRequired !== true || spec.observationAuthorityLaw.writeImpliesRead !== false) issues.push("mutation_expands_observation_authority");
  if (spec.provisionSequence.length !== 9 || spec.provisionSequence[0] !== "REQUEST" || spec.provisionSequence[8] !== "VERIFY_CLEANUP") issues.push("incomplete_provision_sequence");
  if (spec.threatModel.length < 6) issues.push("incomplete_threat_model");
  for (const required of R2_A_ADVERSARIAL_CASES) {
    if (!spec.adversarialCases.includes(required)) issues.push(`missing_adversarial_case:${required}`);
  }
  if (spec.rollbackEquivalence.scopedDimensions.length !== 3 || spec.rollbackEquivalence.futureRepositoryDimensions.length !== 6) issues.push("incomplete_rollback_equivalence");
  if (spec.tokenAuthenticity.cryptographicAuthenticityRequiredNow !== false || spec.tokenAuthenticity.currentBoundary !== "PROCESS_LOCAL_DESIGN_ONLY") issues.push("token_authenticity_scope_misrepresented");
  if (spec.evidenceLedgerClaim !== "TAMPER_EVIDENT_NOT_SIGNED") issues.push("inflated_evidence_ledger_claim");
  return { ok: issues.length === 0, issues };
}

export function validateR2AProvisioningRequest(request: R2AProvisioningRequest, nowEpochMs: number): R2AValidation {
  const issues: string[] = [];
  if (request.schemaVersion !== 1) issues.push("unsupported_request_schema");
  if (!nonEmpty(request.requestId) || !nonEmpty(request.issuer) || !nonEmpty(request.auditIdentity)) issues.push("missing_request_identity");
  if (request.authority !== "WRITE_SANDBOX") issues.push("wrong_authority");
  if (!isAbsolute(request.repositoryRoot) || !isAbsolute(request.approvedSandboxRoot)) issues.push("roots_must_be_absolute");
  else if (!disjoint(request.repositoryRoot, request.approvedSandboxRoot)) issues.push("sandbox_root_not_disjoint_from_repository");
  if (!positiveSafeInteger(request.limits.maxLifetimeMs)
    || !positiveSafeInteger(request.limits.maxNestingDepth)
    || !positiveSafeInteger(request.limits.maxEntries)
    || !positiveSafeInteger(request.limits.maxTotalBytes)) issues.push("invalid_resource_limits");
  if (positiveSafeInteger(request.limits.maxNestingDepth) && !validSandboxName(request.requestedSandboxName, request.limits.maxNestingDepth)) issues.push("invalid_sandbox_name");
  if (!Number.isFinite(nowEpochMs)
    || !Number.isFinite(request.issuedAtEpochMs)
    || !Number.isFinite(request.expiresAtEpochMs)
    || nowEpochMs < request.issuedAtEpochMs
    || nowEpochMs >= request.expiresAtEpochMs
    || request.expiresAtEpochMs - request.issuedAtEpochMs > request.limits.maxLifetimeMs) issues.push("expired_or_invalid_lifetime");
  if (!Array.isArray(request.readScopes) || !Array.isArray(request.writeScopes) || request.writeScopes.length === 0) issues.push("invalid_authority_scopes");
  if (request.readScopes.some((scope) => !nonEmpty(scope)) || request.writeScopes.some((scope) => !nonEmpty(scope))) issues.push("invalid_authority_scope_entry");
  if (request.readScopes.some((scope) => !request.writeScopes.includes(scope))) {
    // Separate read scopes are permitted, but they must be explicit; no implication is inferred.
  }
  return { ok: issues.length === 0, issues };
}

export function validateR2AIdentityObservation(
  request: R2AProvisioningRequest,
  observation: R2AIdentityObservation,
): R2AValidation {
  const issues: string[] = [];
  if (observation.requestId !== request.requestId) issues.push("request_identity_mismatch");
  if (!isAbsolute(observation.canonicalRepositoryRoot)
    || !isAbsolute(observation.canonicalApprovedSandboxRoot)
    || !isAbsolute(observation.canonicalSandboxPath)) issues.push("canonical_paths_must_be_absolute");
  if (resolve(observation.canonicalRepositoryRoot) !== resolve(request.repositoryRoot)) issues.push("repository_identity_mismatch");
  if (resolve(observation.canonicalApprovedSandboxRoot) !== resolve(request.approvedSandboxRoot)) issues.push("sandbox_root_identity_mismatch");
  if (!within(observation.canonicalApprovedSandboxRoot, observation.canonicalSandboxPath)) issues.push("sandbox_path_outside_approved_root");
  if (!disjoint(observation.canonicalRepositoryRoot, observation.canonicalSandboxPath) || observation.disjointFromRepository !== true) issues.push("sandbox_not_disjoint_from_repository");
  if (!nonEmpty(observation.targetIdentityAtValidation)
    || observation.targetIdentityAtValidation !== observation.targetIdentityAtUse) issues.push("target_identity_changed_after_validation");
  if (observation.evidenceReferences.length === 0 || observation.evidenceReferences.some((item) => !nonEmpty(item))) issues.push("missing_identity_evidence");
  return { ok: issues.length === 0, issues };
}

export function validateR2ACleanupObservation(observation: R2ACleanupObservation): R2AValidation {
  const issues: string[] = [];
  if (!nonEmpty(observation.requestId)) issues.push("missing_request_identity");
  if (observation.existedBefore !== false || observation.existsAfterCleanup !== false) issues.push("sandbox_existence_not_restored");
  if (observation.directoryEntriesBefore.length !== 0 || observation.directoryEntriesAfter.length !== 0) issues.push("directory_structure_not_restored");
  if (observation.relevantMetadataEquivalent !== true) issues.push("metadata_not_equivalent");
  if (observation.cleanupAttempted !== true || observation.cleanupSucceeded !== true) issues.push("cleanup_not_verified");
  if (observation.evidenceReferences.length === 0 || observation.evidenceReferences.some((item) => !nonEmpty(item))) issues.push("missing_cleanup_evidence");
  return { ok: issues.length === 0, issues };
}

export function assessR2AImplementationEligibility(input: R2AEligibilityInput): R2AEligibilityDecision {
  const blockers: string[] = [];
  if (!new Set(["REVOKED_AND_VERIFIED", "ROTATED_AND_VERIFIED", "CONFIRMED_INVALID"]).has(input.securityContainment)) blockers.push("credential_containment_unresolved");
  if (input.r1Preserved !== "VERIFIED") blockers.push("r1_not_preserved");
  if (input.specificationValid !== "VERIFIED") blockers.push("r2_a_specification_not_verified");
  return blockers.length === 0
    ? { decision: "ELIGIBLE_FOR_R2_A_IMPLEMENTATION", blockers }
    : { decision: "INELIGIBLE", blockers };
}

export const OMEGA_R2_A_SPEC_EVAL_001 = Object.freeze<R2ASandboxProvisioningSpec>({
  schemaVersion: 1,
  specificationId: "OMEGA-R2-A-SPEC-EVAL-001",
  phase: "R2-A",
  maturity: "SPECIFIED",
  implementationState: "DESIGN_AND_EVALUATOR_ONLY",
  operationalAuthority: "UNAVAILABLE",
  filesystemAdapter: "NONE",
  contentMutation: "FORBIDDEN_UNTIL_R2-B",
  observationAuthorityLaw: {
    statement: "MUTATION_AUTHORITY_NEVER_IMPLICITLY_EXPANDS_OBSERVATION_AUTHORITY",
    explicitReadGrantRequired: true,
    writeImpliesRead: false,
  },
  provisionSequence: [
    "REQUEST",
    "VALIDATE_AUTHORITY",
    "CREATE_BENEATH_APPROVED_ROOT",
    "PROVE_DISJOINTNESS",
    "RECORD_CANONICAL_IDENTITY",
    "ENFORCE_POLICY",
    "TERMINATE",
    "CLEAN",
    "VERIFY_CLEANUP",
  ],
  threatModel: [
    "Approved sandbox root is redirected into the repository.",
    "A symlink, junction, or reparse point escapes the approved root.",
    "Filesystem target identity changes between validation and use.",
    "A duplicate sandbox identity aliases another active session.",
    "Expired or malformed requests allocate resources.",
    "Cleanup fails or is blocked by an open handle.",
    "Write authority is misread as broad observation authority.",
    "R2-A is misrepresented as permission to mutate file content.",
  ],
  adversarialCases: R2_A_ADVERSARIAL_CASES,
  rollbackEquivalence: {
    scopedDimensions: ["EXISTENCE", "DIRECTORY_STRUCTURE", "RELEVANT_METADATA"],
    futureRepositoryDimensions: [
      "FILE_MODE",
      "RENAME_STATE",
      "GIT_INDEX_STATE",
      "LINE_ENDING_NORMALIZATION",
      "GENERATED_ARTIFACTS",
      "TOOL_SIDE_EFFECTS",
    ],
  },
  tokenAuthenticity: {
    currentBoundary: "PROCESS_LOCAL_DESIGN_ONLY",
    cryptographicAuthenticityRequiredNow: false,
    mandatoryBefore: [
      "CROSS_PROCESS_AUTHORITY",
      "REMOTE_WORKERS",
      "PERSISTENT_CAPABILITIES",
      "NETWORK_EXECUTOR",
      "HIGH_IMPACT_REPOSITORY_AUTHORITY",
    ],
  },
  evidenceLedgerClaim: "TAMPER_EVIDENT_NOT_SIGNED",
});
