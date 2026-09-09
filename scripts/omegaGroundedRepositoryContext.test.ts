import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { NODE_REPOSITORY_IO, ReadOnlyRepositoryExecutor, validateExecutorAuditLog } from "../src/lib/codelab/executor/readOnlyExecutor";
import { GroundedRepositoryContext, type RepositoryContextQuery } from "../src/lib/codelab/repository/groundedRepositoryContext";
import { parseStaticModule, resolveObservedModule } from "../src/lib/codelab/repository/staticModuleRelations";
import type { NyxEvidenceRequest } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";

let passed = 0;
let failed = 0;
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
async function rejects(action: () => Promise<unknown>, pattern: RegExp, label: string): Promise<void> {
  try { await action(); check(false, label); } catch (error) { check(pattern.test(String(error)), label); }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const parent = await mkdtemp(join(tmpdir(), "nyx-grounded-context-"));
const parentIdentity = await realpath(parent);
const root = join(parent, "repository with spaces");
await mkdir(root);
let clock = 10_000;
let sequence = 0;
const sources: Record<string, string> = {
  "src/scheduler.ts": "import { canCommit } from './opaque';\nexport const schedule = canCommit;",
  "src/opaque.ts": "export const canCommit = (lease: number, current: number) => lease === current;",
  "src/decoy.ts": "// scheduler lease stale cancellation priority quota tenant budget\nexport const theme = 1;",
  "src/barrel.ts": "export { canCommit } from './opaque';",
  "src/dynamic.ts": "const x = import('./opaque'); const y = require('./opaque'); export {x,y};",
  "src/unknown.ts": "import x from 'unknown-package'; import y from '../outside'; export {x,y};",
  "src/cycle-a.ts": "import './cycle-b'; export const a = 1;",
  "src/cycle-b.ts": "import './cycle-a'; export const b = 1;",
  "src/κώδικας.ts": "export const μήνυμα = 'γειά';",
  "src/invalid.ts": "export const = ;",
  "src/notes.txt": "import './opaque'; this is documentation, not a module",
  "src/presentation.ts": "import './opaque'; export const display = 2;",
};
const manifest = Object.keys(sources);
async function put(path: string, source: string): Promise<void> {
  const target = join(root, path);
  assert.ok(relative(root, target) && !relative(root, target).startsWith(".."));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}
async function executor(paths = manifest, repositoryRoot = root) {
  sequence += 1;
  return ReadOnlyRepositoryExecutor.create({ executorId: `R1-CONTEXT-${sequence}`, tokenId: `TOKEN-${sequence}`,
    repositoryRoot, resourceScopes: paths, issuedAtEpochMs: 1, expiresAtEpochMs: 100_000,
    constraints: { maxFileBytes: 100_000, maxDirectoryEntries: 100, allowedExtensions: [".ts", ".txt"] },
    issuer: "OFFLINE-EVALUATOR", auditIdentity: `AUDIT-${sequence}` });
}
async function session(paths = manifest, overrides: Partial<Parameters<typeof GroundedRepositoryContext.create>[0]> = {}) {
  const r1 = overrides.executor ?? await executor(paths);
  const context = await GroundedRepositoryContext.create({ sessionId: `SESSION-${sequence}`, candidateId: "controlled-fixture-v1",
    environmentId: `${process.platform}-${process.arch}`, executor: r1, manifest: paths,
    maxSnapshotBytes: 100_000, maxReadOperations: 200, now: () => clock, ...overrides });
  return { r1, context };
}
const query: RepositoryContextQuery = { objective: "scheduler lease stale cancellation priority quota tenant budget",
  seedPaths: ["src/scheduler.ts"], mode: "DEPENDENCY_AUGMENTED", maxFiles: 2, maxBytes: 10_000, maxDependencyDepth: 1 };
function request(refs: readonly string[]): NyxEvidenceRequest {
  return { requestedEvidenceRefs: refs, diagnosis: "Need dependency evidence", causalHypothesis: null,
    uncertainties: ["Need observed implementation"], evidenceRefs: [], requestDigest: hash(JSON.stringify(refs)),
    authorityGranted: false };
}
try {
  for (const [path, source] of Object.entries(sources)) await put(path, source);
  const { context, r1 } = await session();
  const lexical = await context.retrieve({ ...query, mode: "LEXICAL" });
  const graph = await context.retrieve(query);
  const lexicalPaths = lexical.files.map((file) => file.relativePath);
  const graphPaths = graph.files.map((file) => file.relativePath);
  check(lexicalPaths.join() === "src/scheduler.ts,src/decoy.ts", "lexical ablation selects keyword distractor at two-file budget");
  check(graphPaths.join() === "src/scheduler.ts,src/opaque.ts", "dependency retrieval finds the behavior-bearing dependency at same budget");
  const irrelevantEdge = { ...query, seedPaths: ["src/presentation.ts"], objective: "theme" };
  const lexicalCounterexample = await context.retrieve({ ...irrelevantEdge, mode: "LEXICAL" });
  const graphCounterexample = await context.retrieve(irrelevantEdge);
  check(lexicalCounterexample.files.some((file) => file.relativePath === "src/decoy.ts")
    && !graphCounterexample.files.some((file) => file.relativePath === "src/decoy.ts"),
    "negative-transfer control: graph expansion can lose relevant lexical evidence when an import is irrelevant");
  check(graph.relations.length === 1 && graph.relations[0].resolution.target === "src/opaque.ts",
    "relative module relation is grounded in both observed files");
  check(graph.relations[0].evidenceIds.length === 2 && graph.relations[0].freshnessDependencies.length === 2,
    "each relationship carries exact content dependencies and R1 evidence identities");
  check(graph.files.every((file) => hash(file.content) === file.contentSha256)
    && graph.bytes === graph.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
    "returned bytes and content hashes match actual UTF-8 observations");
  check(graph.authorityGranted === false && graph.observationState === "INDIVIDUALLY_REOBSERVED_NOT_ATOMIC",
    "context grants no authority and does not claim an atomic snapshot");
  check(validateExecutorAuditLog(r1.auditLog()).ok && r1.auditLog().every((item) => item.request.action === "READ_FILE"),
    "index and retrieval use only auditable R1 file observations");
  const rule = graph.availableEvidence.find((item) => item.relativePath === "src/barrel.ts")!;
  const acquired = await context.acquire(request([rule.evidenceRef]), 1);
  check(acquired.files[0].content === sources["src/barrel.ts"] && acquired.evidenceIds[0].startsWith(r1.executorId)
    && acquired.omegaAuthorityBoundary === "R1_ADMITTED_READ_ONLY_EVIDENCE", "existing repair protocol receives fresh source and provenance");
  const readCount = context.readOperations;
  await rejects(() => context.acquire(request([rule.evidenceRef]), 2), /unissued/, "consumed evidence request cannot be replayed");
  await rejects(() => context.acquire(request(["AVAILABLE:../../secrets"]), 2), /unissued/, "fabricated evidence reference grants no path access");
  check(context.readOperations === readCount, "invalid evidence requests perform no filesystem observation");
  await rejects(() => context.retrieve({ ...query, seedPaths: ["../secret"] }), /invalid_query/, "unknown or traversing seed rejected");
  await rejects(() => context.retrieve({ ...query, maxFiles: 0 }), /invalid_query/, "zero file budget rejected");
  await rejects(() => context.retrieve({ ...query, maxBytes: 1 }), /output_budget/, "too-small seed budget fails rather than silently dropping seed");
  await rejects(() => context.retrieve({ ...query, maxDependencyDepth: 9 }), /invalid_query/, "excessive graph depth rejected");
  const narrow = await context.retrieve({ ...query, maxFiles: 1 });
  check(narrow.relations.length === 0, "relationship lacking fresh target evidence is not emitted as currently supported");
  const unicode = await context.retrieve({ ...query, seedPaths: ["src/κώδικας.ts"], maxFiles: 1 });
  check(unicode.files[0].content.includes("γειά"), "Unicode paths and roots with spaces survive observation and retrieval");
  const cyclic = await context.retrieve({ ...query, seedPaths: ["src/cycle-a.ts"], maxDependencyDepth: 8 });
  check(cyclic.files.length === 2 && cyclic.relations.length === 2, "cycles terminate and do not duplicate observations");
  const barrel = await context.retrieve({ ...query, seedPaths: ["src/barrel.ts"] });
  check(barrel.files.some((file) => file.relativePath === "src/opaque.ts"), "re-export traversal reaches source dependency");
  const dynamic = await context.retrieve({ ...query, seedPaths: ["src/dynamic.ts"], maxFiles: 1 });
  check(dynamic.relations.length === 2 && dynamic.relations.every((edge) => edge.resolution.state === "UNRESOLVED"),
    "dynamic/CommonJS references stay explicitly unresolved");
  const unknown = await context.retrieve({ ...query, seedPaths: ["src/unknown.ts"], maxFiles: 1 });
  check(unknown.relations.every((edge) => edge.resolution.state === "UNRESOLVED"),
    "package and missing references are not imagined or fetched outside the manifest");
  check(parseStaticModule("x.ts", sources["src/invalid.ts"]).parseState === "SYNTAX_INVALID",
    "invalid syntax produces no invented graph edges");
  check(parseStaticModule("x.txt", sources["src/notes.txt"]).parseState === "UNSUPPORTED_LANGUAGE",
    "unsupported source is not interpreted as TypeScript");
  const invalidPack = await context.retrieve({ ...query, seedPaths: ["src/invalid.ts"], maxFiles: 1 });
  check(invalidPack.parseStates[0].state === "SYNTAX_INVALID", "context exposes missing parser coverage instead of implying no dependencies");
  check(parseStaticModule("x.ts", "// import './fake';\nconst text = \"export * from './fake'\";").references.length === 0,
    "comments and strings cannot inject static relationships");
  const ref = { specifier: "./x", kind: "IMPORT" as const, line: 1 };
  check(resolveObservedModule("src/a.ts", ref, new Set(["src/x.ts", "src/x.js"])).state === "UNRESOLVED",
    "ambiguous source resolution is not guessed");
  check(resolveObservedModule("src/a.ts", { ...ref, specifier: "./x.js" }, new Set(["src/x.ts"])).state === "UNRESOLVED",
    "runtime extension substitution is not falsely certified");
  check(resolveObservedModule("src/a.ts", { ...ref, specifier: "../../escape.ts" }, new Set()).state === "UNRESOLVED",
    "out-of-root static reference does not expand scope");
  const beforeChange = graph.snapshotDigest;
  await put("src/decoy.ts", "export const unrelated = 2;");
  const unaffected = await context.retrieve(query);
  check(unaffected.snapshotDigest === beforeChange && unaffected.files.length === 2,
    "unselected file change does not invalidate selected-file evidence; ranking remains explicitly snapshot-based");
  await put("src/opaque.ts", "export const canCommit = () => true;");
  await rejects(() => context.retrieve(query), /requires_revalidation:src\/opaque.ts/,
    "changed relevant dependency requires revalidation, not a false refutation or stale context delivery");
  await put("src/opaque.ts", sources["src/opaque.ts"]);
  await put("src/decoy.ts", sources["src/decoy.ts"]);
  const held = await context.retrieve({ ...query, maxFiles: 1 });
  const heldRef = held.availableEvidence.find((item) => item.relativePath === "src/opaque.ts")!.evidenceRef;
  r1.revoke(clock, "adversarial revocation");
  await rejects(() => context.retrieve(query), /TOKEN_REVOKED/, "cached source cannot bypass revoked executor");
  await rejects(() => context.acquire(request([heldRef]), 3), /TOKEN_REVOKED/, "previously issued reference does not survive revocation");
  const expired = await session();
  clock = 100_000;
  await rejects(() => expired.context.retrieve(query), /TOKEN_EXPIRED/, "expiry uses fresh trusted host clock, not model timestamp");
  clock = 10_000;
  const terminated = await session();
  terminated.r1.terminate(clock, "finished");
  await rejects(() => terminated.context.retrieve(query), /EXECUTOR_TERMINATED/, "termination prevents further observations");
  const bounded = await session(["src/scheduler.ts"], { maxReadOperations: 1 });
  await rejects(() => bounded.context.retrieve({ ...query, maxFiles: 1 }), /read_budget_exhausted/, "lifetime read-operation budget enforced");
  await rejects(() => session(["src/scheduler.ts"], { maxSnapshotBytes: 10 }), /byte_budget/, "snapshot byte budget enforced");
  await rejects(() => session(["src/missing.ts"]), /ABSENT/, "missing file is absent, not an empty fabricated source");
  const restricted = await executor(["src/scheduler.ts"]);
  await rejects(() => session(["src/opaque.ts"], { executor: restricted }), /OUTSIDE_LEXICAL_SCOPE/,
    "manifest membership alone cannot grant read access");
  await rejects(() => session(["src/scheduler.ts", "src/scheduler.ts"]), /invalid_configuration/, "duplicate paths rejected");
  await rejects(() => session(["src/../outside.ts"], { executor: restricted }), /invalid_configuration/,
    "noncanonical manifest rejected before reads");
  const peerA = await session();
  const peerB = await session();
  const peerPack = await peerA.context.retrieve({ ...query, maxFiles: 1 });
  await peerB.context.retrieve({ ...query, maxFiles: 1 });
  await rejects(() => peerB.context.acquire(request([peerPack.availableEvidence[0].evidenceRef]), 1), /unissued/,
    "evidence references are session-bound, not transferable authority");
  const parallel = await session();
  const inFlight = parallel.context.retrieve(query);
  await rejects(() => parallel.context.retrieve(query), /concurrent_operation/, "concurrent session operations fail closed");
  await inFlight;
  const inFlightR1 = await ReadOnlyRepositoryExecutor.create({ executorId: "R1-IN-FLIGHT",
    tokenId: "TOKEN-IN-FLIGHT", repositoryRoot: root, resourceScopes: ["src/scheduler.ts"],
    issuedAtEpochMs: 1, expiresAtEpochMs: 100_000, constraints: { maxFileBytes: 100_000,
      maxDirectoryEntries: 100, allowedExtensions: [".ts"] }, issuer: "OFFLINE-EVALUATOR", auditIdentity: "IN-FLIGHT-AUDIT" },
  { ...NODE_REPOSITORY_IO, readUtf8: async (path) => {
    const content = await NODE_REPOSITORY_IO.readUtf8(path);
    inFlightR1.revoke(clock, "revoked during admitted read");
    return content;
  } });
  await rejects(() => session(["src/scheduler.ts"], { executor: inFlightR1 }), /authority_no_longer_live/,
    "authority withdrawn during an admitted read prevents content delivery");

  const external = join(parent, "external");
  await mkdir(external);
  await writeFile(join(external, "outside.ts"), "export const outside = true;", "utf8");
  const alias = join(root, "alias");
  await symlink(external, alias, process.platform === "win32" ? "junction" : "dir");
  try {
    await rejects(() => session(["alias/outside.ts"]), /OUTSIDE_RESOLVED_SCOPE/,
      "real host junction/symlink cannot escape R1 via a manifest entry");
  } finally {
    assert.equal((await lstat(alias)).isSymbolicLink(), true);
    await unlink(alias);
  }

  // Reproduce a real relationship in this repository without executing or changing its source.
  const livePaths = ["src/lib/codelab/engine/r3BoundedRepairLoop.ts",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts"];
  const liveRoot = resolve(".");
  const priorHashes = await Promise.all(livePaths.map(async (path) => hash(await readFile(join(liveRoot, path), "utf8"))));
  const live = await session(livePaths, { executor: await executor(livePaths, liveRoot), candidateId: "working-tree-read-only-demonstration" });
  const livePack = await live.context.retrieve({ ...query, seedPaths: [livePaths[0]], maxBytes: 100_000 });
  check(livePack.relations.some((edge) => edge.source === livePaths[0] && edge.resolution.target === livePaths[1]),
    "real Omega repair loop dependency on NYX cognition is retrieved with R1 evidence");
  check(JSON.stringify(priorHashes) === JSON.stringify(await Promise.all(livePaths.map(async (path) =>
    hash(await readFile(join(liveRoot, path), "utf8"))))), "actual repository source remains unchanged");
  console.log(`NYX_RETRIEVAL_ABLATION ${JSON.stringify({ fixture: "keyword-decoy-v1", taskCount: 1,
    fileBudget: 2, byteBudget: query.maxBytes, requiredDependency: "src/opaque.ts",
    lexicalRecall: Number(lexicalPaths.includes("src/opaque.ts")), graphRecall: Number(graphPaths.includes("src/opaque.ts")),
    negativeTransferControl: { relevantFile: "src/decoy.ts",
      lexicalRecall: Number(lexicalCounterexample.files.some((file) => file.relativePath === "src/decoy.ts")),
      graphRecall: Number(graphCounterexample.files.some((file) => file.relativePath === "src/decoy.ts")) },
    lexicalBytes: lexical.bytes, graphBytes: graph.bytes, corpusBytes: manifest.reduce((n, path) =>
      n + Buffer.byteLength(sources[path]), 0), scope: "CONSTRUCTED_DIAGNOSTIC_NOT_GENERALIZATION",
    modelCalls: 0, authorityGranted: false })}`);
} finally {
  assert.equal(await realpath(parent), parentIdentity);
  assert.equal((await lstat(parent)).isSymbolicLink(), false);
  assert.ok(relative(await realpath(tmpdir()), parentIdentity).startsWith("nyx-grounded-context-"));
  async function rejectLinks(directory: string): Promise<void> {
    for (const name of await readdir(directory)) {
      const entry = join(directory, name);
      const stat = await lstat(entry);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) await rejectLinks(entry);
    }
  }
  await rejectLinks(parent);
  await rm(parent, { recursive: true });
}
console.log(`Omega grounded repository context tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
