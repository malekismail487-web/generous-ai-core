import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  NODE_REPOSITORY_IO,
  ReadOnlyRepositoryExecutor,
  type RepositoryIo,
} from "../../src/lib/codelab/executor/readOnlyExecutor";
import type { ExecutorRequest, ExecutorTransaction } from "../../src/lib/codelab/executor/types";

type CertificateId = "R1-A" | "R1-B" | "R1-C" | "R1-D" | "R1-E" | "R1-F" | "R1-G" | "R1-H" | "R1-I" | "R1-J";
type CertificateStatus = "VERIFIED" | "PARTIAL" | "FAILED";

interface CertificateResult {
  readonly id: CertificateId;
  readonly title: string;
  status: CertificateStatus;
  passed: number;
  failed: number;
  readonly observations: string[];
}

const certificates = new Map<CertificateId, CertificateResult>([
  ["R1-A", { id: "R1-A", title: "Authorized file observation", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-B", { id: "R1-B", title: "Directory observation", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-C", { id: "R1-C", title: "Metadata observation", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-D", { id: "R1-D", title: "Scope confinement", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-E", { id: "R1-E", title: "Canonical-path confinement", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-F", { id: "R1-F", title: "Revocation", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-G", { id: "R1-G", title: "Audit completeness", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-H", { id: "R1-H", title: "Epistemic failure handling", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-I", { id: "R1-I", title: "Resource-bound enforcement", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
  ["R1-J", { id: "R1-J", title: "Host-filesystem edge cases", status: "VERIFIED", passed: 0, failed: 0, observations: [] }],
]);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(certificateId: CertificateId, condition: unknown, label: string): void {
  const certificate = certificates.get(certificateId)!;
  if (condition) {
    passed += 1;
    certificate.passed += 1;
  } else {
    failed += 1;
    certificate.failed += 1;
    certificate.status = "FAILED";
    failures.push(`${certificateId}: ${label}`);
    console.error(`  x ${certificateId}: ${label}`);
  }
}

function independentAuditOracle(transactions: readonly ExecutorTransaction[]): boolean {
  if (transactions.length === 0) return false;
  const requestIds = new Set<string>();
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    if (transaction.sequence !== index + 1) return false;
    if (requestIds.has(transaction.request.requestId)) return false;
    requestIds.add(transaction.request.requestId);
    const requestId = transaction.request.requestId;
    if (transaction.authorization.requestId !== requestId || transaction.observation.requestId !== requestId || transaction.evidence.requestId !== requestId) return false;
    if (transaction.authorization.allowed !== (transaction.toolAction !== null)) return false;
    const actionId = transaction.toolAction?.actionId ?? null;
    if (transaction.observation.actionId !== actionId || transaction.evidence.actionId !== actionId) return false;
    if (transaction.evidence.observationId !== transaction.observation.observationId) return false;
  }
  return true;
}

function safeCleanupTarget(capsule: string): boolean {
  const parent = resolve(tmpdir());
  const delta = relative(parent, resolve(capsule));
  return delta.startsWith("omega-r1-private-") && !delta.includes("..") && !delta.includes("/") && !delta.includes("\\");
}

const capsule = await mkdtemp(join(tmpdir(), "omega-r1-private-"));
const repositoryRoot = join(capsule, "repository root with spaces");
const externalRoot = join(capsule, "external target");
let requestSequence = 0;

function makeRequest(overrides: Partial<ExecutorRequest> = {}): ExecutorRequest {
  requestSequence += 1;
  return {
    requestId: `PRIVATE-REQ-${requestSequence}`,
    tokenId: "PRIVATE-R1-TOKEN",
    action: "READ_FILE",
    resourcePath: "src/ordinary/nested.json",
    observedAtEpochMs: 20_000,
    ...overrides,
  };
}

try {
  await mkdir(join(repositoryRoot, "src", "ordinary"), { recursive: true });
  await mkdir(join(repositoryRoot, "ignored"), { recursive: true });
  await mkdir(join(repositoryRoot, "generated", "artifacts"), { recursive: true });
  await mkdir(join(repositoryRoot, "nested", ".git"), { recursive: true });
  await mkdir(externalRoot, { recursive: true });

  const ordinaryContent = JSON.stringify({ heldOut: true, depth: 3, nonce: "fresh-private-case" });
  const unicodeName = "Ω-مرحبا-文件.ts";
  const unicodeContent = "export const privateUnicodeFixture = 'verified';\n";
  await writeFile(join(repositoryRoot, "src", "ordinary", "nested.json"), ordinaryContent, "utf8");
  await writeFile(join(repositoryRoot, "src", unicodeName), unicodeContent, "utf8");
  await writeFile(join(repositoryRoot, ".gitignore"), "ignored/\ngenerated/\n", "utf8");
  await writeFile(join(repositoryRoot, "ignored", "private.json"), "{\"ignored\":true}", "utf8");
  await writeFile(join(repositoryRoot, "generated", "artifacts", "result.json"), "{\"generated\":true}", "utf8");
  await writeFile(join(repositoryRoot, "nested", ".git", "HEAD"), "ref: refs/heads/private\n", "utf8");
  await writeFile(join(repositoryRoot, "oversized.txt"), "L".repeat(4_096), "utf8");
  await writeFile(join(repositoryRoot, "blocked.bin"), "binary-like-private-fixture", "utf8");
  await writeFile(join(externalRoot, "outside.json"), "{\"mustNeverBeRead\":true}", "utf8");

  const executor = await ReadOnlyRepositoryExecutor.create({
    executorId: "PRIVATE-R1-EVALUATOR-EXECUTOR",
    tokenId: "PRIVATE-R1-TOKEN",
    repositoryRoot,
    resourceScopes: ["."],
    issuedAtEpochMs: 10_000,
    expiresAtEpochMs: 90_000,
    constraints: { maxFileBytes: 16_384, maxDirectoryEntries: 50, allowedExtensions: [] },
    issuer: "OMEGA-PRIVATE-EVALUATION",
    auditIdentity: "OMEGA-EVAL-R1-001",
  });

  check("R1-J", executor.token.repositoryRoot.includes("repository root with spaces"), "repository root containing spaces is retained canonically");
  const ordinary = await executor.execute(makeRequest());
  check("R1-A", ordinary.observation.status === "OBSERVED" && ordinary.observation.content === ordinaryContent, "fresh ordinary nested file is read exactly");
  const independentHash = createHash("sha256").update(ordinaryContent, "utf8").digest("hex");
  check("R1-A", ordinary.observation.contentSha256 === independentHash, "file digest matches evaluator-computed oracle");

  const ignored = await executor.execute(makeRequest({ resourcePath: "ignored/private.json" }));
  check("R1-J", ignored.observation.status === "OBSERVED" && ignored.observation.content === "{\"ignored\":true}", "ignored file remains observable when explicitly authorized");
  const unicode = await executor.execute(makeRequest({ resourcePath: `src/${unicodeName}` }));
  check("R1-J", unicode.observation.status === "OBSERVED" && unicode.observation.content === unicodeContent, "Unicode filename and content survive observation");

  const generated = await executor.execute(makeRequest({ action: "LIST_DIRECTORY", resourcePath: "generated/artifacts" }));
  check("R1-B", generated.observation.entries?.length === 1 && generated.observation.entries[0] === "result.json", "generated directory listing matches direct fixture definition");
  const metadata = await executor.execute(makeRequest({ action: "READ_METADATA", resourcePath: "nested/.git" }));
  check("R1-C", metadata.observation.status === "OBSERVED" && metadata.observation.resourceKind === "DIRECTORY", "nested Git metadata directory is observed as a directory");
  const nestedHead = await executor.execute(makeRequest({ resourcePath: "nested/.git/HEAD" }));
  check("R1-J", nestedHead.observation.content === "ref: refs/heads/private\n", "nested Git repository file is read without assuming top-level ownership");

  const slashNormalized = await executor.execute(makeRequest({ resourcePath: "src\\ordinary\\nested.json" }));
  check("R1-J", slashNormalized.observation.content === ordinaryContent, "host separator normalization preserves scoped resource identity");
  const dotNormalized = await executor.execute(makeRequest({ resourcePath: "./src/./ordinary/nested.json" }));
  check("R1-J", dotNormalized.observation.content === ordinaryContent, "dot-segment normalization preserves scoped resource identity");

  const absolute = await executor.execute(makeRequest({ resourcePath: resolve(externalRoot, "outside.json") }));
  check("R1-D", !absolute.authorization.allowed && absolute.toolAction === null, "absolute outside path is denied before tool action");
  const traversal = await executor.execute(makeRequest({ resourcePath: "../external target/outside.json" }));
  check("R1-D", !traversal.authorization.allowed && traversal.observation.content === null, "parent traversal is denied without content");

  const missing = await executor.execute(makeRequest({ resourcePath: "src/ordinary/missing.json" }));
  check("R1-H", missing.observation.status === "ABSENT" && missing.observation.epistemicState === "UNKNOWN", "missing resource produces UNKNOWN rather than fabricated evidence");
  const directoryAsFile = await executor.execute(makeRequest({ resourcePath: "src/ordinary" }));
  check("R1-H", directoryAsFile.observation.status === "RESOURCE_KIND_MISMATCH" && directoryAsFile.observation.content === null, "directory requested as file fails epistemically closed");
  const fileAsDirectory = await executor.execute(makeRequest({ action: "LIST_DIRECTORY", resourcePath: "src/ordinary/nested.json" }));
  check("R1-H", fileAsDirectory.observation.status === "RESOURCE_KIND_MISMATCH" && fileAsDirectory.observation.entries === null, "file requested as directory fails epistemically closed");

  const faultIo: RepositoryIo = {
    ...NODE_REPOSITORY_IO,
    canonicalize: async (path) => {
      if (path.endsWith("nested.json")) throw Object.assign(new Error("private evaluator access denial"), { code: "EACCES" });
      return NODE_REPOSITORY_IO.canonicalize(path);
    },
  };
  const inaccessibleExecutor = await ReadOnlyRepositoryExecutor.create({
    executorId: "PRIVATE-R1-INACCESSIBLE",
    tokenId: "PRIVATE-R1-INACCESSIBLE-TOKEN",
    repositoryRoot,
    resourceScopes: ["src/ordinary/nested.json"],
    issuedAtEpochMs: 10_000,
    expiresAtEpochMs: 90_000,
    constraints: { maxFileBytes: 1_024, maxDirectoryEntries: 5, allowedExtensions: [".json"] },
    issuer: "OMEGA-PRIVATE-EVALUATION",
    auditIdentity: "OMEGA-EVAL-R1-001-INACCESSIBLE",
  }, faultIo);
  const inaccessible = await inaccessibleExecutor.execute(makeRequest({ tokenId: "PRIVATE-R1-INACCESSIBLE-TOKEN" }));
  check("R1-H", inaccessible.observation.status === "INACCESSIBLE" && inaccessible.observation.epistemicState === "INSUFFICIENT_EVIDENCE", "independently injected access denial remains honest");

  const bounded = await ReadOnlyRepositoryExecutor.create({
    executorId: "PRIVATE-R1-BOUNDS",
    tokenId: "PRIVATE-R1-BOUNDS-TOKEN",
    repositoryRoot,
    resourceScopes: ["."],
    issuedAtEpochMs: 10_000,
    expiresAtEpochMs: 90_000,
    constraints: { maxFileBytes: 100, maxDirectoryEntries: 2, allowedExtensions: [".json", ".ts"] },
    issuer: "OMEGA-PRIVATE-EVALUATION",
    auditIdentity: "OMEGA-EVAL-R1-001-BOUNDS",
  });
  const oversized = await bounded.execute(makeRequest({ tokenId: "PRIVATE-R1-BOUNDS-TOKEN", resourcePath: "oversized.txt" }));
  check("R1-I", oversized.observation.status === "CONSTRAINT_REJECTED" && oversized.observation.content === null, "large file is rejected before content observation");
  const extension = await bounded.execute(makeRequest({ tokenId: "PRIVATE-R1-BOUNDS-TOKEN", resourcePath: "blocked.bin" }));
  check("R1-I", extension.observation.status === "CONSTRAINT_REJECTED" && extension.observation.content === null, "extension restriction blocks disallowed type");
  const directoryBound = await bounded.execute(makeRequest({ tokenId: "PRIVATE-R1-BOUNDS-TOKEN", action: "LIST_DIRECTORY", resourcePath: "." }));
  check("R1-I", directoryBound.observation.status === "CONSTRAINT_REJECTED" && directoryBound.observation.entries === null, "directory entry bound blocks oversized listing");

  const scoped = await ReadOnlyRepositoryExecutor.create({
    executorId: "PRIVATE-R1-SCOPE",
    tokenId: "PRIVATE-R1-SCOPE-TOKEN",
    repositoryRoot,
    resourceScopes: ["src/ordinary"],
    issuedAtEpochMs: 10_000,
    expiresAtEpochMs: 90_000,
    constraints: { maxFileBytes: 1_024, maxDirectoryEntries: 5, allowedExtensions: [".json"] },
    issuer: "OMEGA-PRIVATE-EVALUATION",
    auditIdentity: "OMEGA-EVAL-R1-001-SCOPE",
  });
  const scopeDenied = await scoped.execute(makeRequest({ tokenId: "PRIVATE-R1-SCOPE-TOKEN", resourcePath: "ignored/private.json" }));
  check("R1-D", scopeDenied.authorization.code === "OUTSIDE_LEXICAL_SCOPE" && scopeDenied.toolAction === null, "authorized root does not imply unrestricted resource scope");
  const scopeAllowed = await scoped.execute(makeRequest({ tokenId: "PRIVATE-R1-SCOPE-TOKEN" }));
  check("R1-D", scopeAllowed.authorization.allowed && scopeAllowed.observation.content === ordinaryContent, "declared nested scope remains usable");

  const expired = await executor.execute(makeRequest({ observedAtEpochMs: 90_000 }));
  check("R1-F", expired.authorization.code === "TOKEN_EXPIRED" && expired.toolAction === null, "expiry removes authority without tool action");
  const revokedExecutor = await ReadOnlyRepositoryExecutor.create({
    executorId: "PRIVATE-R1-REVOKED",
    tokenId: "PRIVATE-R1-REVOKED-TOKEN",
    repositoryRoot,
    resourceScopes: ["src"],
    issuedAtEpochMs: 10_000,
    expiresAtEpochMs: 90_000,
    constraints: { maxFileBytes: 1_024, maxDirectoryEntries: 10, allowedExtensions: [] },
    issuer: "OMEGA-PRIVATE-EVALUATION",
    auditIdentity: "OMEGA-EVAL-R1-001-REVOKED",
  });
  revokedExecutor.revoke(15_000, "private evaluation revocation");
  const revoked = await revokedExecutor.execute(makeRequest({ tokenId: "PRIVATE-R1-REVOKED-TOKEN" }));
  check("R1-F", revoked.authorization.code === "TOKEN_REVOKED" && revoked.toolAction === null, "revocation removes authority without tool action");

  const malformed = await executor.execute(makeRequest({ observedAtEpochMs: Number.NaN }));
  check("R1-C", malformed.authorization.code === "MALFORMED_REQUEST" && malformed.toolAction === null, "malformed observation time cannot become metadata evidence");
  const forged = await executor.execute(makeRequest({ tokenId: "PRIVATE-FORGED-TOKEN" }));
  check("R1-D", forged.authorization.code === "TOKEN_MISMATCH" && forged.toolAction === null, "foreign token cannot borrow repository scope");
  const shell = await executor.execute(makeRequest({ action: "SCOPED_TERMINAL" }));
  check("R1-D", shell.authorization.code === "UNSUPPORTED_OPERATION" && shell.toolAction === null, "evaluation confirms shell remains forbidden");

  let aliasCreated = false;
  let aliasBlocked = false;
  let aliasTargetHidden = false;
  try {
    const aliasPath = join(repositoryRoot, "generated", "external-alias");
    await symlink(externalRoot, aliasPath, process.platform === "win32" ? "junction" : "dir");
    aliasCreated = true;
    const aliasEscape = await executor.execute(makeRequest({ resourcePath: "generated/external-alias/outside.json" }));
    aliasBlocked = aliasEscape.observation.status === "OUTSIDE_RESOLVED_SCOPE" && aliasEscape.observation.content === null;
    aliasTargetHidden = aliasEscape.observation.resolvedPath === null;
    certificates.get("R1-J")!.observations.push(`real ${process.platform === "win32" ? "junction" : "symlink"} fixture created and blocked`);
  } catch (error) {
    certificates.get("R1-E")!.status = "PARTIAL";
    certificates.get("R1-J")!.status = "PARTIAL";
    certificates.get("R1-E")!.observations.push(`real alias fixture unavailable: ${error instanceof Error ? error.name : "unknown error"}`);
    certificates.get("R1-J")!.observations.push("host alias behavior not exercised; simulated unit evidence remains separate");
  }
  check("R1-E", aliasCreated ? aliasBlocked : certificates.get("R1-E")!.status === "PARTIAL", "real filesystem alias is blocked or host limitation is explicitly partial");
  check("R1-J", aliasCreated ? aliasTargetHidden : certificates.get("R1-J")!.status === "PARTIAL", "alias target stays hidden or unsupported host behavior remains explicitly partial");

  const audit = executor.auditLog();
  check("R1-G", independentAuditOracle(audit), "independent audit oracle finds a complete evidence chain");
  check("R1-G", audit.length === requestSequence - 7, "main executor log contains exactly its issued requests");
  check("R1-G", audit.every((transaction) => transaction.evidence.provenance.auditIdentity === "OMEGA-EVAL-R1-001"), "audit provenance remains bound to evaluator identity");

  for (const certificate of certificates.values()) {
    if (certificate.failed > 0) certificate.status = "FAILED";
    console.log(`R1_CERTIFICATE id=${certificate.id} status=${certificate.status} passed=${certificate.passed} failed=${certificate.failed} title=${JSON.stringify(certificate.title)}`);
    for (const observation of certificate.observations) console.log(`R1_CERTIFICATE_OBSERVATION id=${certificate.id} detail=${JSON.stringify(observation)}`);
  }
} finally {
  if (!safeCleanupTarget(capsule)) throw new Error("Refusing cleanup outside evaluator-owned temporary capsule");
  await rm(capsule, { recursive: true, force: false });
}

console.log(`Omega R1 private evaluation - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
