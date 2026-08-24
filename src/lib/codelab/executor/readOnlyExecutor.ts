import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  AuthorizationDecision,
  CapabilityToken,
  ExecutorAuditValidation,
  ExecutorEvidenceRecord,
  ExecutorRequest,
  ExecutorTransaction,
  ReadConstraints,
  RepositoryObservation,
  RevocationRecord,
  ToolActionRecord,
} from "./types";

const READ_ACTIONS = new Set(["READ_METADATA", "READ_FILE", "LIST_DIRECTORY"]);

export interface RepositoryIo {
  canonicalize(path: string): Promise<string>;
  stat(path: string): Promise<Stats>;
  readUtf8(path: string): Promise<string>;
  list(path: string): Promise<readonly string[]>;
}

export const NODE_REPOSITORY_IO: RepositoryIo = Object.freeze({
  canonicalize: (path: string) => realpath(path),
  stat: (path: string) => lstat(path),
  readUtf8: (path: string) => readFile(path, "utf8"),
  list: async (path: string) => (await readdir(path)).sort((a, b) => a.localeCompare(b)),
});

export interface ReadOnlyExecutorConfig {
  readonly executorId: string;
  readonly tokenId: string;
  readonly repositoryRoot: string;
  readonly resourceScopes: readonly string[];
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly constraints: ReadConstraints;
  readonly issuer: string;
  readonly auditIdentity: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function normalizeRelativeResource(resource: unknown): string | null {
  if (!nonEmpty(resource) || resource.includes("\0") || isAbsolute(resource) || /^[A-Za-z]:/.test(resource)) return null;
  const unix = resource.replace(/\\/g, "/");
  if (unix.startsWith("/") || unix.includes("//")) return null;
  const segments = unix.split("/");
  if (segments.some((segment) => segment === ".." || segment.length === 0)) return null;
  const normalized = segments.filter((segment) => segment !== ".").join("/");
  return normalized.length === 0 ? "." : normalized;
}

function withinDeclaredScope(resource: string, scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope === "." || resource === scope || resource.startsWith(`${scope}/`));
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function deniedObservation(
  sequence: number,
  request: ExecutorRequest,
  decision: AuthorizationDecision,
): RepositoryObservation {
  return {
    observationId: `OBS-${sequence}`,
    requestId: request.requestId,
    actionId: null,
    status: "AUTHORIZATION_REJECTED",
    epistemicState: decision.code === "OUTSIDE_LEXICAL_SCOPE" ? "OUT_OF_SCOPE" : "INSUFFICIENT_EVIDENCE",
    resourcePath: decision.normalizedResource,
    resolvedPath: null,
    resourceKind: "UNKNOWN",
    content: null,
    contentSha256: null,
    sizeBytes: null,
    entries: null,
    detail: decision.reason,
  };
}

function evidenceFor(
  executorId: string,
  token: CapabilityToken,
  sequence: number,
  request: ExecutorRequest,
  decision: AuthorizationDecision,
  action: ToolActionRecord | null,
  observation: RepositoryObservation,
): ExecutorEvidenceRecord {
  return {
    evidenceId: `EVID-${sequence}`,
    evidenceClass: "E3",
    requestId: request.requestId,
    decisionId: decision.decisionId,
    actionId: action?.actionId ?? null,
    observationId: observation.observationId,
    claim: `Repository operation ${request.action} concluded with ${observation.status}.`,
    provenance: {
      executorId,
      tokenId: token.tokenId,
      auditIdentity: token.auditIdentity,
      issuer: token.issuer,
    },
  };
}

function validateConfig(config: ReadOnlyExecutorConfig): void {
  for (const [label, value] of [
    ["executorId", config.executorId],
    ["tokenId", config.tokenId],
    ["repositoryRoot", config.repositoryRoot],
    ["issuer", config.issuer],
    ["auditIdentity", config.auditIdentity],
  ] as const) {
    if (!nonEmpty(value)) throw new Error(`${label} is required`);
  }
  if (!isAbsolute(config.repositoryRoot)) throw new Error("repositoryRoot must be absolute");
  if (!Number.isFinite(config.issuedAtEpochMs) || !Number.isFinite(config.expiresAtEpochMs)) {
    throw new Error("Token lifetime must be finite");
  }
  if (config.expiresAtEpochMs <= config.issuedAtEpochMs) throw new Error("Token expiry must follow issuance");
  if (!Number.isSafeInteger(config.constraints.maxFileBytes) || config.constraints.maxFileBytes <= 0) {
    throw new Error("maxFileBytes must be a positive safe integer");
  }
  if (!Number.isSafeInteger(config.constraints.maxDirectoryEntries) || config.constraints.maxDirectoryEntries <= 0) {
    throw new Error("maxDirectoryEntries must be a positive safe integer");
  }
  if (!Array.isArray(config.constraints.allowedExtensions) || config.constraints.allowedExtensions.some(
    (extension) => !nonEmpty(extension) || !extension.startsWith(".") || extension.includes("/") || extension.includes("\\"),
  )) {
    throw new Error("allowedExtensions must contain normalized file extensions");
  }
}

export class ReadOnlyRepositoryExecutor {
  readonly token: CapabilityToken;
  readonly executorId: string;
  readonly #realRoot: string;
  readonly #io: RepositoryIo;
  readonly #transactions: ExecutorTransaction[] = [];
  readonly #revocations: RevocationRecord[] = [];
  #revoked = false;
  #terminated = false;

  private constructor(config: ReadOnlyExecutorConfig, realRoot: string, scopes: readonly string[], io: RepositoryIo) {
    this.executorId = config.executorId;
    this.#realRoot = realRoot;
    this.#io = io;
    this.token = Object.freeze({
      tokenId: config.tokenId,
      operation: "READ_REPOSITORY",
      repositoryRoot: realRoot,
      resourceScopes: Object.freeze([...scopes]),
      issuedAtEpochMs: config.issuedAtEpochMs,
      expiresAtEpochMs: config.expiresAtEpochMs,
      constraints: Object.freeze({
        ...config.constraints,
        allowedExtensions: Object.freeze([...config.constraints.allowedExtensions.map((item) => item.toLowerCase())]),
      }),
      issuer: config.issuer,
      auditIdentity: config.auditIdentity,
    });
  }

  static async create(config: ReadOnlyExecutorConfig, io: RepositoryIo = NODE_REPOSITORY_IO): Promise<ReadOnlyRepositoryExecutor> {
    validateConfig(config);
    const realRoot = await io.canonicalize(resolve(config.repositoryRoot));
    const scopes = config.resourceScopes.map(normalizeRelativeResource);
    if (scopes.length === 0 || scopes.some((scope) => scope === null)) throw new Error("At least one valid resource scope is required");
    return new ReadOnlyRepositoryExecutor(config, realRoot, scopes as string[], io);
  }

  auditLog(): readonly ExecutorTransaction[] {
    return structuredClone(this.#transactions);
  }

  revocationLog(): readonly RevocationRecord[] {
    return structuredClone(this.#revocations);
  }

  revoke(revokedAtEpochMs: number, reason: string, terminal = false): RevocationRecord {
    if (!Number.isFinite(revokedAtEpochMs) || !nonEmpty(reason)) throw new Error("Revocation time and reason are required");
    this.#revoked = true;
    this.#terminated ||= terminal;
    const record: RevocationRecord = Object.freeze({
      revocationId: `REVOKE-${this.#revocations.length + 1}`,
      tokenId: this.token.tokenId,
      revokedAtEpochMs,
      reason,
      terminal,
    });
    this.#revocations.push(record);
    return record;
  }

  terminate(terminatedAtEpochMs: number, reason: string): RevocationRecord {
    return this.revoke(terminatedAtEpochMs, reason, true);
  }

  async execute(request: ExecutorRequest): Promise<ExecutorTransaction> {
    const sequence = this.#transactions.length + 1;
    const authorization = this.#authorize(request, sequence);
    let toolAction: ToolActionRecord | null = null;
    let observation: RepositoryObservation;

    if (!authorization.allowed || authorization.normalizedResource === null) {
      observation = deniedObservation(sequence, request, authorization);
    } else {
      const lexicalAbsolutePath = resolve(this.#realRoot, authorization.normalizedResource === "." ? "" : authorization.normalizedResource);
      toolAction = {
        actionId: `ACTION-${sequence}`,
        requestId: request.requestId,
        decisionId: authorization.decisionId,
        action: request.action as ToolActionRecord["action"],
        lexicalAbsolutePath,
      };
      observation = await this.#observe(sequence, request, authorization.normalizedResource, toolAction);
    }

    const evidence = evidenceFor(this.executorId, this.token, sequence, request, authorization, toolAction, observation);
    const transaction: ExecutorTransaction = Object.freeze({
      sequence,
      request: structuredClone(request),
      authorization,
      toolAction,
      observation,
      evidence,
    });
    this.#transactions.push(transaction);
    return structuredClone(transaction);
  }

  #authorize(request: ExecutorRequest, sequence: number): AuthorizationDecision {
    const normalized = normalizeRelativeResource(request.resourcePath);
    const base = { decisionId: `AUTH-${sequence}`, requestId: request.requestId };
    if (this.#terminated) return { ...base, allowed: false, code: "EXECUTOR_TERMINATED", normalizedResource: normalized, reason: "Executor is terminated." };
    if (this.#revoked) return { ...base, allowed: false, code: "TOKEN_REVOKED", normalizedResource: normalized, reason: "Capability token is revoked." };
    if (!nonEmpty(request.requestId) || !nonEmpty(request.tokenId) || !nonEmpty(request.action) || normalized === null || !Number.isFinite(request.observedAtEpochMs)) {
      return { ...base, allowed: false, code: "MALFORMED_REQUEST", normalizedResource: null, reason: "Request fields or resource path are malformed." };
    }
    if (request.tokenId !== this.token.tokenId) return { ...base, allowed: false, code: "TOKEN_MISMATCH", normalizedResource: normalized, reason: "Request token does not match executor capability." };
    if (request.observedAtEpochMs < this.token.issuedAtEpochMs || request.observedAtEpochMs >= this.token.expiresAtEpochMs) {
      return { ...base, allowed: false, code: "TOKEN_EXPIRED", normalizedResource: normalized, reason: "Capability is outside its valid lifetime." };
    }
    if (!READ_ACTIONS.has(request.action)) return { ...base, allowed: false, code: "UNSUPPORTED_OPERATION", normalizedResource: normalized, reason: "R1 permits repository reads only; privilege upgrade denied." };
    if (!withinDeclaredScope(normalized, this.token.resourceScopes)) {
      return { ...base, allowed: false, code: "OUTSIDE_LEXICAL_SCOPE", normalizedResource: normalized, reason: "Resource is outside the declared capability scope." };
    }
    return { ...base, allowed: true, code: "AUTHORIZED", normalizedResource: normalized, reason: "R1 read authorized within declared lexical scope." };
  }

  async #observe(
    sequence: number,
    request: ExecutorRequest,
    resource: string,
    action: ToolActionRecord,
  ): Promise<RepositoryObservation> {
    const base = {
      observationId: `OBS-${sequence}`,
      requestId: request.requestId,
      actionId: action.actionId,
      resourcePath: resource,
      content: null,
      contentSha256: null,
      sizeBytes: null,
      entries: null,
    } as const;
    let resolvedPath: string;
    try {
      resolvedPath = await this.#io.canonicalize(action.lexicalAbsolutePath);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") return { ...base, status: "ABSENT", epistemicState: "UNKNOWN", resolvedPath: null, resourceKind: "UNKNOWN", detail: "Resource does not exist." };
      return { ...base, status: "INACCESSIBLE", epistemicState: "INSUFFICIENT_EVIDENCE", resolvedPath: null, resourceKind: "UNKNOWN", detail: `Resource could not be accessed (${code ?? "UNKNOWN_IO_ERROR"}).` };
    }
    if (!within(this.#realRoot, resolvedPath)) {
      return { ...base, status: "OUTSIDE_RESOLVED_SCOPE", epistemicState: "OUT_OF_SCOPE", resolvedPath: null, resourceKind: "UNKNOWN", detail: "Resolved resource escapes repository root." };
    }
    const rawResolvedRelative = relative(this.#realRoot, resolvedPath);
    const resolvedRelative = rawResolvedRelative === "" ? "." : normalizeRelativeResource(rawResolvedRelative);
    if (resolvedRelative === null || !withinDeclaredScope(resolvedRelative, this.token.resourceScopes)) {
      return { ...base, status: "OUTSIDE_RESOLVED_SCOPE", epistemicState: "OUT_OF_SCOPE", resolvedPath: null, resourceKind: "UNKNOWN", detail: "Resolved resource escapes declared scope." };
    }

    try {
      const stat = await this.#io.stat(resolvedPath);
      const kind = stat.isFile() ? "FILE" : stat.isDirectory() ? "DIRECTORY" : "OTHER";
      if (request.action === "READ_METADATA") {
        return { ...base, status: "OBSERVED", epistemicState: "SUPPORTED", resolvedPath, resourceKind: kind, sizeBytes: stat.size, detail: "Repository metadata observed." };
      }
      if (request.action === "READ_FILE") {
        if (!stat.isFile()) return { ...base, status: "RESOURCE_KIND_MISMATCH", epistemicState: "INSUFFICIENT_EVIDENCE", resolvedPath, resourceKind: kind, detail: "Requested resource is not a file." };
        const extension = extname(resolvedPath).toLowerCase();
        if (stat.size > this.token.constraints.maxFileBytes || (this.token.constraints.allowedExtensions.length > 0 && !this.token.constraints.allowedExtensions.includes(extension))) {
          return { ...base, status: "CONSTRAINT_REJECTED", epistemicState: "OUT_OF_SCOPE", resolvedPath, resourceKind: "FILE", sizeBytes: stat.size, detail: "File violates token size or extension constraints." };
        }
        const content = await this.#io.readUtf8(resolvedPath);
        return {
          ...base,
          status: "OBSERVED",
          epistemicState: "SUPPORTED",
          resolvedPath,
          resourceKind: "FILE",
          content,
          contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
          sizeBytes: Buffer.byteLength(content, "utf8"),
          detail: "UTF-8 file content observed within capability constraints.",
        };
      }
      if (!stat.isDirectory()) return { ...base, status: "RESOURCE_KIND_MISMATCH", epistemicState: "INSUFFICIENT_EVIDENCE", resolvedPath, resourceKind: kind, detail: "Requested resource is not a directory." };
      const entries = await this.#io.list(resolvedPath);
      if (entries.length > this.token.constraints.maxDirectoryEntries) {
        return { ...base, status: "CONSTRAINT_REJECTED", epistemicState: "OUT_OF_SCOPE", resolvedPath, resourceKind: "DIRECTORY", detail: "Directory exceeds token entry constraint." };
      }
      return { ...base, status: "OBSERVED", epistemicState: "SUPPORTED", resolvedPath, resourceKind: "DIRECTORY", entries, sizeBytes: entries.length, detail: "Directory entries observed within capability constraints." };
    } catch (error) {
      return { ...base, status: "INACCESSIBLE", epistemicState: "INSUFFICIENT_EVIDENCE", resolvedPath, resourceKind: "UNKNOWN", detail: `Resource operation failed (${errorCode(error) ?? "UNKNOWN_IO_ERROR"}).` };
    }
  }
}

export function validateExecutorTransaction(transaction: ExecutorTransaction): ExecutorAuditValidation {
  const errors: string[] = [];
  if (transaction.sequence < 1 || !Number.isSafeInteger(transaction.sequence)) errors.push("invalid sequence");
  if (transaction.authorization.requestId !== transaction.request.requestId) errors.push("authorization request mismatch");
  if (transaction.observation.requestId !== transaction.request.requestId) errors.push("observation request mismatch");
  if (transaction.evidence.requestId !== transaction.request.requestId) errors.push("evidence request mismatch");
  if (transaction.evidence.decisionId !== transaction.authorization.decisionId) errors.push("evidence decision mismatch");
  if (transaction.evidence.observationId !== transaction.observation.observationId) errors.push("evidence observation mismatch");
  if (transaction.authorization.allowed && transaction.toolAction === null) errors.push("authorized request omitted tool action");
  if (!transaction.authorization.allowed && transaction.toolAction !== null) errors.push("denied request contains tool action");
  if ((transaction.toolAction?.actionId ?? null) !== transaction.observation.actionId) errors.push("observation action mismatch");
  if ((transaction.toolAction?.actionId ?? null) !== transaction.evidence.actionId) errors.push("evidence action mismatch");
  return { ok: errors.length === 0, errors };
}

export function validateExecutorAuditLog(transactions: readonly ExecutorTransaction[]): ExecutorAuditValidation {
  const errors: string[] = [];
  transactions.forEach((transaction, index) => {
    if (transaction.sequence !== index + 1) errors.push(`sequence gap at ${index + 1}`);
    errors.push(...validateExecutorTransaction(transaction).errors.map((error) => `transaction ${index + 1}: ${error}`));
  });
  const requestIds = new Set(transactions.map((transaction) => transaction.request.requestId));
  if (requestIds.size !== transactions.length) errors.push("duplicate request ID");
  const actionCount = transactions.filter((transaction) => transaction.toolAction !== null).length;
  const authorizedCount = transactions.filter((transaction) => transaction.authorization.allowed).length;
  if (actionCount !== authorizedCount) errors.push("tool action count does not match authorized requests");
  return { ok: errors.length === 0, errors };
}
