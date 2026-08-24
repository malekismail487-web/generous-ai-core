import { createHash } from "node:crypto";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export const REQUIRED_R2_FORBIDDEN_ACTIONS = Object.freeze([
  "WRITE_REPOSITORY",
  "SHELL_EXECUTION",
  "NETWORK_ACCESS",
  "CREDENTIAL_ACQUISITION",
  "PACKAGE_INSTALLATION",
  "DEPLOYMENT",
] as const);
export type R2ForbiddenAction = (typeof REQUIRED_R2_FORBIDDEN_ACTIONS)[number];

export const R2_PHASE_IDS = Object.freeze([
  "R2-A",
  "R2-B",
  "R2-C",
  "R2-D",
  "R2-E",
  "R2-F",
  "R2-G",
] as const);
export type R2PhaseId = (typeof R2_PHASE_IDS)[number];

export interface SandboxWriteDesign {
  readonly schemaVersion: 1;
  readonly designId: string;
  readonly authority: "WRITE_SANDBOX";
  readonly implementationState: "DESIGN_ONLY";
  readonly repositoryRoot: string;
  readonly sandboxRoot: string;
  readonly disposable: true;
  readonly automaticCleanup: true;
  readonly limits: {
    readonly maxFiles: number;
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
    readonly maxLifetimeMs: number;
    readonly allowedExtensions: readonly string[];
  };
  readonly forbiddenActions: readonly R2ForbiddenAction[];
  readonly threatModel: readonly string[];
  readonly containmentMechanisms: readonly string[];
  readonly rollbackMechanisms: readonly string[];
  readonly phases: readonly {
    readonly phaseId: R2PhaseId;
    readonly title: string;
    readonly maturity: "SPECIFIED";
  }[];
  readonly tokenAuthenticity: {
    readonly status: "DESIGNED_NOT_IMPLEMENTED";
    readonly establishedPrimitives: readonly ("HMAC-SHA256" | "Ed25519")[];
    readonly customCryptographicProtocol: false;
    readonly requiredBefore: readonly ("CROSS_PROCESS_AUTHORITY" | "CREDENTIAL_ACCESS" | "R3_OR_HIGHER")[];
  };
  readonly evidenceLedger: {
    readonly mode: "APPEND_ONLY_SESSION_HASH_CHAIN";
    readonly canonicalSerialization: true;
    readonly securityClaim: "TAMPER_EVIDENT_NOT_SIGNED";
  };
}

export interface DesignValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export type SandboxMutationOperation = "CREATE" | "MODIFY" | "DELETE";

export interface SandboxMutation {
  readonly operation: SandboxMutationOperation;
  readonly path: string;
  readonly expectedBaseSha256: string | null;
  readonly proposedSha256: string | null;
  readonly proposedBytes: number;
}

export interface SandboxRollbackMaterial {
  readonly path: string;
  readonly beforeSha256: string | null;
}

export interface SandboxMutationTransaction {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly authority: "WRITE_SANDBOX";
  readonly authorizedRepository: string;
  readonly sandboxRoot: string;
  readonly authorizedPaths: readonly string[];
  readonly baseContentHashes: Readonly<Record<string, string | null>>;
  readonly proposedMutations: readonly SandboxMutation[];
  readonly preconditions: readonly string[];
  readonly expectedPostconditions: readonly string[];
  readonly rollbackMaterial: readonly SandboxRollbackMaterial[];
  readonly evidenceReferences: readonly string[];
  readonly expiresAtEpochMs: number;
  readonly authorizationIdentity: string;
}

export type BaseStateDecision =
  | { readonly decision: "BASE_STATE_MATCH"; readonly issues: readonly [] }
  | { readonly decision: "REJECT"; readonly issues: readonly string[] };

export interface RollbackProof {
  readonly transactionId: string;
  readonly beforeHashes: Readonly<Record<string, string | null>>;
  readonly afterMutationHashes: Readonly<Record<string, string | null>>;
  readonly afterRollbackHashes: Readonly<Record<string, string | null>>;
  readonly evidenceReferences: readonly string[];
}

export interface SessionEvidenceEvent {
  readonly sequence: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ChainedEvidenceEvent {
  readonly sequence: number;
  readonly event: SessionEvidenceEvent;
  readonly previousHash: string;
  readonly eventHash: string;
}

export type SecurityContainmentState =
  | "REVOKED_AND_VERIFIED"
  | "ROTATED_AND_VERIFIED"
  | "CONFIRMED_INVALID"
  | "UNKNOWN";

export interface R2EligibilityEvidence {
  readonly securityContainment: SecurityContainmentState;
  readonly r1PrivateEvaluation: "VERIFIED" | "PARTIAL" | "FAILED";
  readonly realAliasConfinement: "VERIFIED" | "PARTIAL" | "FAILED";
  readonly transactionContracts: "VERIFIED" | "UNVERIFIED";
  readonly rollbackDemonstration: "VERIFIED" | "UNVERIFIED";
  readonly negativeCapabilityPreservation: "VERIFIED" | "UNVERIFIED";
  readonly threatModel: "VERIFIED" | "UNVERIFIED";
}

export interface R2EligibilityDecision {
  readonly decision: "ELIGIBLE_FOR_ISOLATED_IMPLEMENTATION" | "INELIGIBLE";
  readonly blockers: readonly string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const INITIAL_CHAIN_HASH = "0".repeat(64);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(resolve(root), resolve(candidate));
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function rootsAreDisjoint(left: string, right: string): boolean {
  return !within(left, right) && !within(right, left);
}

function normalizeRelativePath(value: unknown): string | null {
  if (!nonEmpty(value) || value.includes("\0") || isAbsolute(value) || /^[A-Za-z]:/.test(value)) return null;
  const unix = value.replace(/\\/g, "/");
  if (unix.startsWith("/") || unix.includes("//")) return null;
  const segments = unix.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "..")) return null;
  const normalized = segments.filter((segment) => segment !== ".").join("/");
  return normalized.length > 0 ? normalized : null;
}

function isAuthorizedPath(path: string, scopes: readonly string[]): boolean {
  return scopes.some((scope) => path === scope || path.startsWith(`${scope}/`));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalEvidenceJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function validateSandboxWriteDesign(design: SandboxWriteDesign): DesignValidation {
  const issues: string[] = [];
  if (design.schemaVersion !== 1) issues.push("unsupported_schema_version");
  if (!nonEmpty(design.designId)) issues.push("missing_design_id");
  if (design.authority !== "WRITE_SANDBOX") issues.push("authority_must_be_write_sandbox");
  if (design.implementationState !== "DESIGN_ONLY") issues.push("r2_authority_must_not_be_operational");
  if (!isAbsolute(design.repositoryRoot) || !isAbsolute(design.sandboxRoot)) issues.push("roots_must_be_absolute");
  else if (!rootsAreDisjoint(design.repositoryRoot, design.sandboxRoot)) issues.push("sandbox_and_repository_must_be_disjoint");
  if (design.disposable !== true || design.automaticCleanup !== true) issues.push("sandbox_must_be_disposable_with_cleanup");
  if (!positiveInteger(design.limits.maxFiles)) issues.push("invalid_max_files");
  if (!positiveInteger(design.limits.maxFileBytes)) issues.push("invalid_max_file_bytes");
  if (!positiveInteger(design.limits.maxTotalBytes) || design.limits.maxTotalBytes < design.limits.maxFileBytes) issues.push("invalid_max_total_bytes");
  if (!positiveInteger(design.limits.maxLifetimeMs)) issues.push("invalid_max_lifetime");
  if (design.limits.allowedExtensions.length === 0 || design.limits.allowedExtensions.some((extension) => !/^\.[a-z0-9]+$/i.test(extension))) issues.push("invalid_allowed_extensions");
  for (const forbidden of REQUIRED_R2_FORBIDDEN_ACTIONS) {
    if (!design.forbiddenActions.includes(forbidden)) issues.push(`missing_forbidden_action:${forbidden}`);
  }
  if (design.threatModel.length === 0) issues.push("missing_threat_model");
  if (design.containmentMechanisms.length === 0) issues.push("missing_containment");
  if (design.rollbackMechanisms.length === 0) issues.push("missing_rollback_design");
  if (design.phases.length !== R2_PHASE_IDS.length || design.phases.some((phase, index) => phase.phaseId !== R2_PHASE_IDS[index] || phase.maturity !== "SPECIFIED")) issues.push("invalid_phase_progression");
  if (design.tokenAuthenticity.status !== "DESIGNED_NOT_IMPLEMENTED" || design.tokenAuthenticity.customCryptographicProtocol !== false) issues.push("invalid_token_authenticity_design");
  if (!design.tokenAuthenticity.establishedPrimitives.includes("HMAC-SHA256") && !design.tokenAuthenticity.establishedPrimitives.includes("Ed25519")) issues.push("missing_established_authenticity_primitive");
  if (design.evidenceLedger.mode !== "APPEND_ONLY_SESSION_HASH_CHAIN" || design.evidenceLedger.canonicalSerialization !== true || design.evidenceLedger.securityClaim !== "TAMPER_EVIDENT_NOT_SIGNED") issues.push("invalid_evidence_ledger_claim");
  return { ok: issues.length === 0, issues };
}

export function validateSandboxMutationTransaction(
  transaction: SandboxMutationTransaction,
  design: SandboxWriteDesign,
  nowEpochMs: number,
): DesignValidation {
  const issues = [...validateSandboxWriteDesign(design).issues];
  if (transaction.schemaVersion !== 1) issues.push("unsupported_transaction_schema");
  if (!nonEmpty(transaction.transactionId)) issues.push("missing_transaction_id");
  if (transaction.authority !== "WRITE_SANDBOX") issues.push("transaction_authority_mismatch");
  if (resolve(transaction.authorizedRepository) !== resolve(design.repositoryRoot)) issues.push("authorized_repository_mismatch");
  if (resolve(transaction.sandboxRoot) !== resolve(design.sandboxRoot)) issues.push("sandbox_root_mismatch");
  if (!Number.isFinite(nowEpochMs) || !Number.isFinite(transaction.expiresAtEpochMs) || nowEpochMs >= transaction.expiresAtEpochMs) issues.push("transaction_expired_or_invalid_time");
  if (!nonEmpty(transaction.authorizationIdentity)) issues.push("missing_authorization_identity");
  if (transaction.evidenceReferences.length === 0 || transaction.evidenceReferences.some((reference) => !nonEmpty(reference))) issues.push("missing_evidence_reference");
  if (transaction.preconditions.length === 0 || transaction.preconditions.some((condition) => !nonEmpty(condition))) issues.push("missing_preconditions");
  if (transaction.expectedPostconditions.length === 0 || transaction.expectedPostconditions.some((condition) => !nonEmpty(condition))) issues.push("missing_postconditions");

  const normalizedScopes = transaction.authorizedPaths.map(normalizeRelativePath);
  if (normalizedScopes.length === 0 || normalizedScopes.some((scope) => scope === null)) issues.push("invalid_authorized_paths");
  const scopes = normalizedScopes.filter((scope): scope is string => scope !== null);
  if (transaction.proposedMutations.length === 0 || transaction.proposedMutations.length > design.limits.maxFiles) issues.push("mutation_count_out_of_bounds");

  let totalBytes = 0;
  const mutationPaths = new Set<string>();
  for (const mutation of transaction.proposedMutations) {
    const normalized = normalizeRelativePath(mutation.path);
    if (normalized === null) {
      issues.push("invalid_mutation_path");
      continue;
    }
    if (!isAuthorizedPath(normalized, scopes)) issues.push(`mutation_outside_scope:${normalized}`);
    if (mutationPaths.has(normalized)) issues.push(`duplicate_mutation_path:${normalized}`);
    mutationPaths.add(normalized);
    const extension = extname(normalized).toLowerCase();
    if (!design.limits.allowedExtensions.map((item) => item.toLowerCase()).includes(extension)) issues.push(`extension_not_allowed:${normalized}`);
    if (!Number.isSafeInteger(mutation.proposedBytes) || mutation.proposedBytes < 0 || mutation.proposedBytes > design.limits.maxFileBytes) issues.push(`file_size_out_of_bounds:${normalized}`);
    totalBytes += mutation.proposedBytes;
    const baseHashValid = mutation.expectedBaseSha256 === null || SHA256.test(mutation.expectedBaseSha256);
    const proposedHashValid = mutation.proposedSha256 === null || SHA256.test(mutation.proposedSha256);
    if (!baseHashValid || !proposedHashValid) issues.push(`invalid_mutation_hash:${normalized}`);
    if (mutation.operation === "CREATE" && mutation.expectedBaseSha256 !== null) issues.push(`create_requires_absent_base:${normalized}`);
    if (mutation.operation !== "CREATE" && mutation.expectedBaseSha256 === null) issues.push(`existing_mutation_requires_base_hash:${normalized}`);
    if (mutation.operation === "DELETE" && (mutation.proposedSha256 !== null || mutation.proposedBytes !== 0)) issues.push(`delete_requires_absent_poststate:${normalized}`);
    if (mutation.operation !== "DELETE" && mutation.proposedSha256 === null) issues.push(`write_requires_proposed_hash:${normalized}`);
    if (!(normalized in transaction.baseContentHashes) || transaction.baseContentHashes[normalized] !== mutation.expectedBaseSha256) issues.push(`base_hash_mapping_mismatch:${normalized}`);
    const rollback = transaction.rollbackMaterial.find((item) => normalizeRelativePath(item.path) === normalized);
    if (!rollback || rollback.beforeSha256 !== mutation.expectedBaseSha256) issues.push(`missing_or_invalid_rollback:${normalized}`);
  }
  if (totalBytes > design.limits.maxTotalBytes) issues.push("total_bytes_out_of_bounds");
  return { ok: issues.length === 0, issues };
}

export function evaluateBaseState(
  transaction: SandboxMutationTransaction,
  observedHashes: Readonly<Record<string, string | null | undefined>>,
): BaseStateDecision {
  const issues: string[] = [];
  for (const mutation of transaction.proposedMutations) {
    const normalized = normalizeRelativePath(mutation.path);
    if (normalized === null) {
      issues.push("invalid_mutation_path");
      continue;
    }
    if (!(normalized in observedHashes)) issues.push(`missing_observation:${normalized}`);
    else if (observedHashes[normalized] !== mutation.expectedBaseSha256) issues.push(`base_hash_mismatch:${normalized}`);
  }
  return issues.length === 0 ? { decision: "BASE_STATE_MATCH", issues: [] } : { decision: "REJECT", issues };
}

export function verifyRollbackProof(transaction: SandboxMutationTransaction, proof: RollbackProof): DesignValidation {
  const issues: string[] = [];
  if (proof.transactionId !== transaction.transactionId) issues.push("rollback_transaction_mismatch");
  if (proof.evidenceReferences.length === 0) issues.push("rollback_evidence_missing");
  for (const mutation of transaction.proposedMutations) {
    const normalized = normalizeRelativePath(mutation.path);
    if (normalized === null) {
      issues.push("invalid_mutation_path");
      continue;
    }
    if (!(normalized in proof.afterMutationHashes)) issues.push(`mutation_state_unobserved:${normalized}`);
    else if (proof.afterMutationHashes[normalized] !== mutation.proposedSha256) issues.push(`mutation_state_mismatch:${normalized}`);
    if (!(normalized in proof.beforeHashes) || !(normalized in proof.afterRollbackHashes)) issues.push(`rollback_state_unobserved:${normalized}`);
    else if (proof.beforeHashes[normalized] !== proof.afterRollbackHashes[normalized]) issues.push(`rollback_not_equivalent:${normalized}`);
  }
  return { ok: issues.length === 0, issues };
}

export function chainSessionEvidence(events: readonly SessionEvidenceEvent[]): readonly ChainedEvidenceEvent[] {
  let previousHash = INITIAL_CHAIN_HASH;
  return events.map((event) => {
    const eventHash = createHash("sha256").update(previousHash + canonicalEvidenceJson(event), "utf8").digest("hex");
    const chained = { sequence: event.sequence, event, previousHash, eventHash };
    previousHash = eventHash;
    return chained;
  });
}

export function verifySessionEvidenceChain(chain: readonly ChainedEvidenceEvent[]): DesignValidation {
  const issues: string[] = [];
  let previousHash = INITIAL_CHAIN_HASH;
  for (let index = 0; index < chain.length; index += 1) {
    const item = chain[index];
    if (item.sequence !== index + 1 || item.event.sequence !== item.sequence) issues.push(`invalid_sequence:${index + 1}`);
    if (item.previousHash !== previousHash) issues.push(`previous_hash_mismatch:${index + 1}`);
    const expected = createHash("sha256").update(previousHash + canonicalEvidenceJson(item.event), "utf8").digest("hex");
    if (item.eventHash !== expected) issues.push(`event_hash_mismatch:${index + 1}`);
    previousHash = item.eventHash;
  }
  return { ok: issues.length === 0, issues };
}

export function assessR2ImplementationEligibility(evidence: R2EligibilityEvidence): R2EligibilityDecision {
  const blockers: string[] = [];
  const resolvedSecurityStates = new Set<SecurityContainmentState>(["REVOKED_AND_VERIFIED", "ROTATED_AND_VERIFIED", "CONFIRMED_INVALID"]);
  if (!resolvedSecurityStates.has(evidence.securityContainment)) blockers.push("credential_containment_unresolved");
  if (evidence.r1PrivateEvaluation !== "VERIFIED") blockers.push("r1_private_evaluation_not_verified");
  if (evidence.realAliasConfinement !== "VERIFIED") blockers.push("real_alias_confinement_not_verified");
  if (evidence.transactionContracts !== "VERIFIED") blockers.push("transaction_contracts_not_verified");
  if (evidence.rollbackDemonstration !== "VERIFIED") blockers.push("rollback_not_demonstrated");
  if (evidence.negativeCapabilityPreservation !== "VERIFIED") blockers.push("negative_capabilities_not_verified");
  if (evidence.threatModel !== "VERIFIED") blockers.push("threat_model_not_verified");
  return blockers.length === 0
    ? { decision: "ELIGIBLE_FOR_ISOLATED_IMPLEMENTATION", blockers }
    : { decision: "INELIGIBLE", blockers };
}

export const OMEGA_R2_DESIGN_001 = Object.freeze<SandboxWriteDesign>({
  schemaVersion: 1,
  designId: "OMEGA-R2-DESIGN-001",
  authority: "WRITE_SANDBOX",
  implementationState: "DESIGN_ONLY",
  repositoryRoot: resolve("C:/omega/authorized-repository"),
  sandboxRoot: resolve("C:/omega-disposable/sandbox-session"),
  disposable: true,
  automaticCleanup: true,
  limits: {
    maxFiles: 64,
    maxFileBytes: 1_000_000,
    maxTotalBytes: 8_000_000,
    maxLifetimeMs: 3_600_000,
    allowedExtensions: [".ts", ".tsx", ".js", ".json", ".md", ".txt"],
  },
  forbiddenActions: REQUIRED_R2_FORBIDDEN_ACTIONS,
  threatModel: [
    "Path traversal or filesystem aliases escape the disposable root.",
    "A stale transaction overwrites state that was not inspected.",
    "Rollback material is incomplete or points outside transaction scope.",
    "Audit events are omitted or modified after the operation.",
    "Sandbox authority is confused with repository, shell, network, credential, or deployment authority.",
  ],
  containmentMechanisms: [
    "Repository and sandbox roots are absolute and disjoint.",
    "Every mutation is path-, extension-, count-, byte-, and lifetime-bounded.",
    "Base hashes fail closed on missing or changed observations.",
    "Forbidden higher-authority actions remain explicit negative capabilities.",
  ],
  rollbackMechanisms: [
    "Every mutation carries before-state rollback material.",
    "Rollback proof compares the complete scoped before and restored state.",
  ],
  phases: [
    { phaseId: "R2-A", title: "Create disposable sandbox", maturity: "SPECIFIED" },
    { phaseId: "R2-B", title: "Write new sandbox file", maturity: "SPECIFIED" },
    { phaseId: "R2-C", title: "Modify existing sandbox file", maturity: "SPECIFIED" },
    { phaseId: "R2-D", title: "Delete sandbox artifact", maturity: "SPECIFIED" },
    { phaseId: "R2-E", title: "Atomic sandbox transaction", maturity: "SPECIFIED" },
    { phaseId: "R2-F", title: "Rollback", maturity: "SPECIFIED" },
    { phaseId: "R2-G", title: "Patch-object generation", maturity: "SPECIFIED" },
  ],
  tokenAuthenticity: {
    status: "DESIGNED_NOT_IMPLEMENTED",
    establishedPrimitives: ["HMAC-SHA256", "Ed25519"],
    customCryptographicProtocol: false,
    requiredBefore: ["CROSS_PROCESS_AUTHORITY", "CREDENTIAL_ACCESS", "R3_OR_HIGHER"],
  },
  evidenceLedger: {
    mode: "APPEND_ONLY_SESSION_HASH_CHAIN",
    canonicalSerialization: true,
    securityClaim: "TAMPER_EVIDENT_NOT_SIGNED",
  },
});
