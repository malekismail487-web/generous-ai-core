export const EXECUTOR_ACTIONS = Object.freeze([
  "READ_METADATA",
  "READ_FILE",
  "LIST_DIRECTORY",
  "WRITE_SANDBOX",
  "APPLY_PATCH",
  "RUN_BUILD",
  "RUN_TEST",
  "SCOPED_TERMINAL",
  "NETWORK_RETRIEVAL",
  "DEPLOY",
] as const);
export type ExecutorAction = (typeof EXECUTOR_ACTIONS)[number];

export interface ReadConstraints {
  readonly maxFileBytes: number;
  readonly maxDirectoryEntries: number;
  readonly allowedExtensions: readonly string[];
}

export interface CapabilityToken {
  readonly tokenId: string;
  readonly operation: "READ_REPOSITORY";
  readonly repositoryRoot: string;
  readonly resourceScopes: readonly string[];
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly constraints: ReadConstraints;
  readonly issuer: string;
  readonly auditIdentity: string;
}

export interface ExecutorRequest {
  readonly requestId: string;
  readonly tokenId: string;
  readonly action: ExecutorAction | string;
  readonly resourcePath: string;
  readonly observedAtEpochMs: number;
}

export type AuthorizationCode =
  | "AUTHORIZED"
  | "TOKEN_MISMATCH"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "EXECUTOR_TERMINATED"
  | "MALFORMED_REQUEST"
  | "UNSUPPORTED_OPERATION"
  | "OUTSIDE_LEXICAL_SCOPE";

export interface AuthorizationDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly allowed: boolean;
  readonly code: AuthorizationCode;
  readonly normalizedResource: string | null;
  readonly reason: string;
}

export interface ToolActionRecord {
  readonly actionId: string;
  readonly requestId: string;
  readonly decisionId: string;
  readonly action: "READ_METADATA" | "READ_FILE" | "LIST_DIRECTORY";
  readonly lexicalAbsolutePath: string;
}

export type ObservationStatus =
  | "OBSERVED"
  | "ABSENT"
  | "INACCESSIBLE"
  | "OUTSIDE_RESOLVED_SCOPE"
  | "RESOURCE_KIND_MISMATCH"
  | "CONSTRAINT_REJECTED"
  | "AUTHORIZATION_REJECTED";

export type ObservationEpistemicState = "SUPPORTED" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE" | "OUT_OF_SCOPE";

export interface RepositoryObservation {
  readonly observationId: string;
  readonly requestId: string;
  readonly actionId: string | null;
  readonly status: ObservationStatus;
  readonly epistemicState: ObservationEpistemicState;
  readonly resourcePath: string | null;
  readonly resolvedPath: string | null;
  readonly resourceKind: "FILE" | "DIRECTORY" | "OTHER" | "UNKNOWN";
  readonly content: string | null;
  readonly contentSha256: string | null;
  readonly sizeBytes: number | null;
  readonly entries: readonly string[] | null;
  readonly detail: string;
}

export interface ExecutorEvidenceRecord {
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly requestId: string;
  readonly decisionId: string;
  readonly actionId: string | null;
  readonly observationId: string;
  readonly claim: string;
  readonly provenance: {
    readonly executorId: string;
    readonly tokenId: string;
    readonly auditIdentity: string;
    readonly issuer: string;
  };
}

export interface ExecutorTransaction {
  readonly sequence: number;
  readonly request: ExecutorRequest;
  readonly authorization: AuthorizationDecision;
  readonly toolAction: ToolActionRecord | null;
  readonly observation: RepositoryObservation;
  readonly evidence: ExecutorEvidenceRecord;
}

export interface RevocationRecord {
  readonly revocationId: string;
  readonly tokenId: string;
  readonly revokedAtEpochMs: number;
  readonly reason: string;
  readonly terminal: boolean;
}

export interface ExecutorAuditValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}
