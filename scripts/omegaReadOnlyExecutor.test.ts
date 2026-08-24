import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NODE_REPOSITORY_IO,
  ReadOnlyRepositoryExecutor,
  validateExecutorAuditLog,
  validateExecutorTransaction,
  type RepositoryIo,
} from "../src/lib/codelab/executor/readOnlyExecutor";
import type { ExecutorRequest, ExecutorTransaction } from "../src/lib/codelab/executor/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(label);
    console.error(`  x ${label}`);
  }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const issuedAt = 1_000_000;
const expiresAt = 2_000_000;

function config(overrides: Partial<Parameters<typeof ReadOnlyRepositoryExecutor.create>[0]> = {}) {
  return {
    executorId: "OMEGA-VS-EXECUTOR-001",
    tokenId: "OMEGA-R1-TOKEN-001",
    repositoryRoot,
    resourceScopes: ["package.json", "src/lib/codelab"],
    issuedAtEpochMs: issuedAt,
    expiresAtEpochMs: expiresAt,
    constraints: {
      maxFileBytes: 1_000_000,
      maxDirectoryEntries: 100,
      allowedExtensions: [".json", ".ts"],
    },
    issuer: "OMEGA-INSTITUTIONAL-AUTHORITY",
    auditIdentity: "OMEGA-VS-001A-AUDIT",
    ...overrides,
  };
}

let requestSequence = 0;
function request(overrides: Partial<ExecutorRequest> = {}): ExecutorRequest {
  requestSequence += 1;
  return {
    requestId: `REQ-${requestSequence}`,
    tokenId: "OMEGA-R1-TOKEN-001",
    action: "READ_FILE",
    resourcePath: "package.json",
    observedAtEpochMs: issuedAt + 1_000,
    ...overrides,
  };
}

const executor = await ReadOnlyRepositoryExecutor.create(config());
assert(executor.token.operation === "READ_REPOSITORY", "token grants only READ_REPOSITORY");
assert(Object.isFrozen(executor.token), "issued capability token is immutable");
assert(executor.token.resourceScopes.length === 2, "token carries explicit resource scopes");

const liveRead = await executor.execute(request());
assert(liveRead.authorization.allowed, "authorized live repository read succeeds");
assert(liveRead.observation.status === "OBSERVED" && liveRead.observation.resourceKind === "FILE", "live package file is genuinely observed");
assert(liveRead.observation.content?.includes('"name"') === true, "live observation contains actual package metadata");
assert(/^[a-f0-9]{64}$/.test(liveRead.observation.contentSha256 ?? ""), "file observation carries SHA-256 evidence");
assert(validateExecutorTransaction(liveRead).ok, "live transaction has a complete attributable chain");
assert(liveRead.evidence.actionId === liveRead.toolAction?.actionId, "evidence links the actual tool action");

const metadata = await executor.execute(request({ action: "READ_METADATA", resourcePath: "src/lib/codelab" }));
assert(metadata.observation.status === "OBSERVED" && metadata.observation.resourceKind === "DIRECTORY", "repository directory metadata is observed");
const listing = await executor.execute(request({ action: "LIST_DIRECTORY", resourcePath: "src/lib/codelab/registry" }));
assert(listing.observation.entries?.includes("registry.ts") === true, "authorized directory listing returns real entries");

const outside = await executor.execute(request({ resourcePath: "vite.config.ts" }));
assert(!outside.authorization.allowed && outside.authorization.code === "OUTSIDE_LEXICAL_SCOPE", "read outside declared scope is rejected");
assert(outside.toolAction === null, "unauthorized request performs no tool action");
const traversal = await executor.execute(request({ resourcePath: "../package.json" }));
assert(!traversal.authorization.allowed && traversal.authorization.code === "MALFORMED_REQUEST", "repository traversal attempt is rejected");
const malformed = await executor.execute(request({ resourcePath: "" }));
assert(!malformed.authorization.allowed && malformed.observation.status === "AUTHORIZATION_REJECTED", "malformed resource request is rejected");
const forged = await executor.execute(request({ tokenId: "FORGED-TOKEN" }));
assert(!forged.authorization.allowed && forged.authorization.code === "TOKEN_MISMATCH", "foreign capability token is rejected");
const upgrade = await executor.execute(request({ action: "SCOPED_TERMINAL" }));
assert(!upgrade.authorization.allowed && upgrade.authorization.code === "UNSUPPORTED_OPERATION", "privilege upgrade request is rejected");

const missing = await executor.execute(request({ resourcePath: "src/lib/codelab/does-not-exist.ts" }));
assert(missing.observation.status === "ABSENT", "missing file is represented as absent");
assert(missing.observation.epistemicState === "UNKNOWN" && missing.observation.content === null, "missing file is not hallucinated");

const expiredExecutor = await ReadOnlyRepositoryExecutor.create(config({ tokenId: "EXPIRED-TOKEN" }));
const expired = await expiredExecutor.execute(request({ tokenId: "EXPIRED-TOKEN", observedAtEpochMs: expiresAt }));
assert(!expired.authorization.allowed && expired.authorization.code === "TOKEN_EXPIRED", "expired authority is rejected at the boundary");

const inaccessibleIo: RepositoryIo = {
  ...NODE_REPOSITORY_IO,
  canonicalize: async (path) => {
    if (path.toLowerCase().endsWith("package.json")) throw Object.assign(new Error("denied"), { code: "EACCES" });
    return NODE_REPOSITORY_IO.canonicalize(path);
  },
};
const inaccessibleExecutor = await ReadOnlyRepositoryExecutor.create(config({ tokenId: "INACCESSIBLE-TOKEN" }), inaccessibleIo);
const inaccessible = await inaccessibleExecutor.execute(request({ tokenId: "INACCESSIBLE-TOKEN" }));
assert(inaccessible.observation.status === "INACCESSIBLE", "inaccessible file is represented explicitly");
assert(inaccessible.observation.epistemicState === "INSUFFICIENT_EVIDENCE" && inaccessible.observation.content === null, "inaccessible file produces no fabricated claim");

let firstCanonicalization = true;
const escapeIo: RepositoryIo = {
  ...NODE_REPOSITORY_IO,
  canonicalize: async (path) => {
    if (firstCanonicalization) {
      firstCanonicalization = false;
      return NODE_REPOSITORY_IO.canonicalize(path);
    }
    return resolve(repositoryRoot, "..");
  },
};
const escapeExecutor = await ReadOnlyRepositoryExecutor.create(config({ tokenId: "ESCAPE-TOKEN" }), escapeIo);
const escape = await escapeExecutor.execute(request({ tokenId: "ESCAPE-TOKEN" }));
assert(escape.observation.status === "OUTSIDE_RESOLVED_SCOPE", "resolved-path escape is rejected after canonicalization");
assert(escape.observation.epistemicState === "OUT_OF_SCOPE", "resolved escape cannot become repository evidence");

const audit = executor.auditLog();
assert(audit.length === 9, "every executor request is present in the append-only audit view");
assert(validateExecutorAuditLog(audit).ok, "complete operation log validates");
const tampered = structuredClone(audit) as ExecutorTransaction[];
tampered[0] = { ...tampered[0], toolAction: null };
assert(!validateExecutorAuditLog(tampered).ok, "audit validator detects silently omitted tool action");
const duplicate = structuredClone(audit) as ExecutorTransaction[];
duplicate[1] = { ...duplicate[1], request: { ...duplicate[1].request, requestId: duplicate[0].request.requestId } };
assert(!validateExecutorAuditLog(duplicate).ok, "audit validator detects duplicated request identity");

const terminal = await ReadOnlyRepositoryExecutor.create(config({ tokenId: "TERMINAL-TOKEN" }));
const revocation = terminal.terminate(issuedAt + 2_000, "Defined R1 session ended");
assert(revocation.terminal && terminal.revocationLog().length === 1, "executor termination is audited");
const afterTermination = await terminal.execute(request({ tokenId: "TERMINAL-TOKEN" }));
assert(!afterTermination.authorization.allowed && afterTermination.authorization.code === "EXECUTOR_TERMINATED", "terminated executor loses authority cleanly");
assert(afterTermination.toolAction === null, "terminated executor performs no tool action");
assert(validateExecutorAuditLog(terminal.auditLog()).ok, "post-termination denial remains structurally auditable");

const bounded = await ReadOnlyRepositoryExecutor.create(config({
  tokenId: "BOUNDED-TOKEN",
  resourceScopes: ["package.json"],
  constraints: { maxFileBytes: 8, maxDirectoryEntries: 1, allowedExtensions: [".json"] },
}));
const boundedRead = await bounded.execute(request({ tokenId: "BOUNDED-TOKEN" }));
assert(boundedRead.observation.status === "CONSTRAINT_REJECTED", "read authority remains bounded by file-size constraints");
assert(boundedRead.observation.content === null, "constraint rejection exposes no file content");

console.log(`Omega read-only executor tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
