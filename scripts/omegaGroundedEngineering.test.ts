import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ReadOnlyRepositoryExecutor, validateExecutorAuditLog } from "../src/lib/codelab/executor/readOnlyExecutor";
import { GroundedRepairEvidence } from "../src/lib/codelab/repository/groundedRepairEvidence";
import type { NyxEvidenceRequest } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1 } from "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import { NYX_CONTEXT_TASKS, NYX_CONTEXT_MUTANTS, NYX_CONTEXT_EXPERIMENT,
  NYX_CONTEXT_REPAIR_FROZEN_CORE } from "./omega/nyx-context-experiment";

let passed = 0;
let failed = 0;
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
async function rejects(operation: () => Promise<unknown>, pattern: RegExp, label: string): Promise<void> {
  try { await operation(); check(false, label); } catch (error) { check(pattern.test(String(error)), label); }
}
const task = NYX_CONTEXT_TASKS[0];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
for (const [path, digest] of Object.entries(NYX_CONTEXT_REPAIR_FROZEN_CORE.files)) {
  check(hash((await readFile(path, "utf8")).replace(/\r\n/g, "\n")) === digest,
    `new diagnostic pins exact current core ${path}`);
  if (!path.endsWith("nyxNemotronEngineeringCognition.ts")) {
    const original = spawnSync("git", ["show", `f31d149d5c2e00a844aae178419ff614842783e2:${path}`], { encoding: "utf8" });
    check(original.status === 0 && hash(original.stdout.replace(/\r\n/g, "\n")) === digest,
      `feedback experiment preserves baseline provider, execution and independent acceptance ${path}`);
  }
}
const parent = await mkdtemp(join(tmpdir(), "nyx-grounded-engineering-"));
const parentIdentity = await realpath(parent);
const manifest = Object.keys(task.correctFiles);
async function materialize(name: string, files: Readonly<Record<string, string>>) {
  const root = join(parent, name);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  return root;
}
const request = (refs: readonly string[]): NyxEvidenceRequest => ({ requestedEvidenceRefs: refs,
  diagnosis: "Need current dependency contract", causalHypothesis: null, uncertainties: ["Current measurement semantics"],
  evidenceRefs: [], requestDigest: hash(JSON.stringify(refs)), authorityGranted: false });
try {
  const reference = await materialize("reference", task.correctFiles);
  const faulty = await materialize("faulty", { ...task.correctFiles, ...task.faultyFiles });
  const controller = `import assert from "node:assert/strict";
import { summarize } from "./src/summary.mjs";
const cases = ${JSON.stringify(task.hiddenCases)};
const failed = [];
for (const test of cases) {
  const args = structuredClone(test.args);
  try {
    if (test.expectation.kind === "THROW") assert.throws(() => summarize(...args), {name: test.expectation.errorName});
    else { assert.deepEqual(summarize(...args), test.expectation.value); assert.deepEqual(args, test.args); }
  } catch { failed.push(test.caseId); }
}
console.log(JSON.stringify(failed));
`;
  async function failures(root: string): Promise<string[]> {
    await writeFile(join(root, "control.mjs"), controller, "utf8");
    const run = spawnSync(process.execPath, [join(root, "control.mjs")], { encoding: "utf8", timeout: 10_000 });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  }
  check((await failures(reference)).length === 0, "reference satisfies 15 independently calculated expectations");
  check((await failures(faulty)).length >= 5, "combined baseline failures span measurement obligations");
  for (const mutant of NYX_CONTEXT_MUTANTS) {
    const original = task.correctFiles["src/summary.mjs"];
    assert.equal(original.split(mutant.before).length, 2);
    const root = await materialize(mutant.id, { ...task.correctFiles,
      "src/summary.mjs": original.replace(mutant.before, mutant.after) });
    check((await failures(root)).length > 0, `oracle rejects ${mutant.id}`);
  }
  for (const [name, root] of [["reference", reference], ["faulty", faulty]]) {
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "tools/visible.mjs"), task.visibleVerifier, "utf8");
    const run = spawnSync(process.execPath, [join(root, "tools/visible.mjs")], { timeout: 10_000 });
    check(name === "reference" ? run.status === 0 : run.status !== 0, `${name} visible outcome is correct`);
  }
  for (const [name, policy, paths] of [
    ["whole fixture", task.qualityPolicy, manifest],
    ["existing admission", { ...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1,
      allowedChangedPaths: task.mutationPaths, readonlyPaths: [] }, task.mutationPaths],
  ] as const) {
    const result = assessEngineeringQuality({ assessmentId: `REFERENCE-${name}`, evaluatorVersion: "context-test/1",
      baselineFiles: Object.fromEntries(paths.map((path) => [path, task.faultyFiles[path] ?? task.correctFiles[path]])),
      candidateFiles: Object.fromEntries(paths.map((path) => [path, task.correctFiles[path]])),
      changedPaths: task.mutationPaths, policy, functionalAcceptance: "PASS", regressionAcceptance: "PASS" });
    if (result.decision !== "ACCEPTED") console.error(JSON.stringify(result));
    check(result.decision === "ACCEPTED", `reference passes ${name} quality without changing the gate`);
  }

  let currentRoot = faulty;
  let candidate = "candidate-0";
  let sequence = 0;
  let clock = 10_000;
  let suppliedManifest = manifest;
  let suppliedEnvironment = "fixture-environment";
  let revoke = false;
  const executors: ReadOnlyRepositoryExecutor[] = [];
  const makeSession = (mode: "LEXICAL" | "DEPENDENCY_AUGMENTED" = "LEXICAL", maxSnapshots = 4,
    factoryHook?: () => Promise<void>) => GroundedRepairEvidence.create({ providerIdentity: "GROUNDING-TEST",
    manifest, maxSnapshots, query: { objective: task.objective, seedPaths: task.initiallyAdmittedPaths,
      mode, maxFiles: 2, maxBytes: 8000, maxDependencyDepth: 2 },
    observeCurrentCandidate: async () => {
      if (factoryHook) await factoryHook();
      const id = `REFRESH-${++sequence}`;
      const executor = await ReadOnlyRepositoryExecutor.create({ executorId: id, tokenId: `TOKEN-${id}`,
        repositoryRoot: currentRoot, resourceScopes: manifest, issuedAtEpochMs: 1, expiresAtEpochMs: 100_000,
        constraints: { maxFileBytes: 16_384, maxDirectoryEntries: 100, allowedExtensions: [".mjs"] },
        issuer: "OFFLINE-TEST", auditIdentity: `AUDIT-${id}` });
      executors.push(executor);
      if (revoke) executor.revoke(clock, "test revocation");
      return { sessionId: id, candidateId: candidate, environmentId: suppliedEnvironment, executor,
        manifest: suppliedManifest, maxSnapshotBytes: 48_000, maxReadOperations: 32, now: () => clock };
    } });
  const lexical = await makeSession();
  const graph = await makeSession("DEPENDENCY_AUGMENTED");
  check(lexical.initial.files.some((file) => file.relativePath === "src/presentation.mjs"), "lexical arm selects plausible distractor");
  check(graph.initial.files.some((file) => file.relativePath === "src/opaque.mjs"), "dependency arm selects imported contract");
  check(lexical.initial.files.length === 2 && graph.initial.files.length === 2, "context budgets match before scoring");
  const ref = lexical.initial.availableEvidence.find((item) => item.relativePath === "src/opaque.mjs")!.evidenceRef;
  const before = sequence;
  await rejects(() => lexical.acquire(request(["../../unissued"]), 1), /unissued/, "fabricated path is not authority");
  await rejects(() => lexical.acquire(request([ref, ref]), 1), /unissued/, "duplicate references rejected");
  await rejects(() => lexical.acquire(request([ref]), 0), /unissued/, "malformed cycle rejected");
  check(sequence === before, "invalid requests never invoke trusted scope resolver");
  currentRoot = await materialize("next-candidate", { ...task.correctFiles,
    "src/opaque.mjs": `${task.correctFiles["src/opaque.mjs"]}\n// refreshed candidate contract\n` });
  candidate = "candidate-1";
  const fresh = await lexical.acquire(request([ref]), 2);
  check(fresh.files[0].content.endsWith("// refreshed candidate contract\n"), "evidence observes current candidate not predecessor");
  check(fresh.evidenceIds.every((id) => id.startsWith(executors.at(-1)!.executorId)), "fresh evidence bound to actual R1 transaction");
  check(lexical.observations().at(-1)!.candidateId === "candidate-1"
    && lexical.observations()[0].snapshotDigest !== lexical.observations()[1].snapshotDigest,
  "candidate change produces distinct recorded snapshot identity");
  check(!fresh.authorityGranted && fresh.omegaAuthorityBoundary === "R1_ADMITTED_READ_ONLY_EVIDENCE", "refresh grants no authority");
  await rejects(() => lexical.acquire(request([ref]), 3), /unissued/, "consumed references cannot replay");
  const copy = lexical.observations() as unknown as { candidateId: string }[];
  copy[0].candidateId = "forged";
  check(lexical.observations()[0].candidateId === "candidate-0", "audit returned to caller cannot mutate internal observations");
  for (const [kind, change, reset, pattern] of [
    ["manifest widening", () => { suppliedManifest = [...manifest, "tools/visible.mjs"]; }, () => { suppliedManifest = manifest; }, /manifest_changed/],
    ["environment switch", () => { suppliedEnvironment = "other"; }, () => { suppliedEnvironment = "fixture-environment"; }, /environment_changed/],
    ["revoked R1", () => { revoke = true; }, () => { revoke = false; }, /context_authority_no_longer_live:TOKEN_REVOKED/],
    ["expired R1", () => { clock = 200_000; }, () => { clock = 10_000; }, /context_authority_no_longer_live:TOKEN_EXPIRED/],
  ] as const) {
    const session = await makeSession();
    const token = session.initial.availableEvidence[0].evidenceRef;
    change();
    await rejects(() => session.acquire(request([token]), 1), pattern, `${kind} fails closed`);
    check(session.snapshotAttempts === 2 && session.observations().length === 1, `${kind} consumes budget without fabricated observation`);
    reset();
  }
  const capped = await makeSession("LEXICAL", 1);
  await rejects(() => capped.acquire(request([capped.initial.availableEvidence[0].evidenceRef]), 1), /snapshot_budget/,
    "refresh budget cannot be enlarged by a model request");
  let unlock: (() => void) | undefined;
  let pause = false;
  const concurrent = await makeSession("LEXICAL", 4, async () => {
    if (pause) await new Promise<void>((resolve) => { unlock = resolve; });
  });
  const concurrencyRef = concurrent.initial.availableEvidence[0].evidenceRef;
  pause = true;
  const pending = concurrent.acquire(request([concurrencyRef]), 1);
  await rejects(() => concurrent.acquire(request([concurrencyRef]), 2), /concurrent/, "concurrent refresh cannot double-spend evidence");
  concurrent.close();
  unlock!();
  await rejects(() => pending, /closed/, "closing during refresh prevents evidence delivery");
  await rejects(() => concurrent.acquire(request([concurrencyRef]), 2), /closed/, "closed session cannot resume");
  check(executors.every((executor) => validateExecutorAuditLog(executor.auditLog()).ok), "all actual R1 observations have valid audit chains");

  // Exercise the exact production evaluation composition with a clearly synthetic transport.
  // This offline control is E3 integration evidence, never evidence of a live model's capability.
  const preload = `let calls = 0;
const correct = ${JSON.stringify(task.correctFiles["src/summary.mjs"])};
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://integrate.api.nvidia.com/v1/chat/completions") throw new Error("unexpected_test_network");
  calls++;
  if (calls > 6) throw new Error("test_call_budget");
  const prompt = JSON.parse(JSON.parse(init.body).messages[1].content);
  if (prompt.requiredCorrections.length) {
    const measurement = prompt.requiredCorrections.find((item) => item.sourceMeasurement)?.sourceMeasurement;
    if (!measurement || measurement.totalViolations !== 1 || measurement.lines.length !== 1
      || measurement.lines[0].length !== 132 || measurement.maxLineLength !== 120
      || measurement.replacementSha256.length !== 64) throw new Error("precise_measurement_missing_from_real_loop");
  }
  const missing = prompt.availableEvidence.find((item) => item.relativePath === "src/opaque.mjs");
  let intent;
  if (missing) intent = {decision: "REQUEST_EVIDENCE", diagnosis: "Need immutable measurement semantics",
    uncertainties: ["Variance units"], requestedEvidenceRefs: [missing.evidenceRef]};
  else intent = {decision: "PROPOSE_EDIT", diagnosis: "Mean and uncertainty have incorrect denominators",
    causalHypothesis: "Aggregation omitted normalization of independent measurements",
    evidenceRefs: ["OBJECTIVE", "FILE:src/summary.mjs", "FILE:src/opaque.mjs"],
    invariant: "The independent mean has variance equal to summed variance divided by squared sample count",
    expectedResult: "Visible calibration verification passes", counterexamples: ["Unequal noise, negative gain, single sample"],
    changes: [{target: "src/summary.mjs", replacement: correct + (prompt.requiredCorrections.length ? "" : "//" + "x".repeat(130))}]};
  return new Response(JSON.stringify({id: "SYNTHETIC-OFFLINE-ONLY", choices: [{message: {content: JSON.stringify(intent)},
    finish_reason: "stop"}], usage: {prompt_tokens: 100, completion_tokens: 100, total_tokens: 200}}), {status: 200});
};
`;
  const preloadPath = join(parent, "synthetic-only.mjs");
  await writeFile(preloadPath, preload, "utf8");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/w0rs/register-typescript-loader.mjs",
    "--import", pathToFileURL(preloadPath).href, "scripts/omega/nyx-quality-v4-live-eval.ts"], {
    cwd: resolve("."), encoding: "utf8", timeout: 90_000, maxBuffer: 5_000_000,
    env: { ...process.env, OMEGA_ALLOW_NVIDIA_NETWORK: "1", NVIDIA_API_KEY: "synthetic-offline-key-not-a-credential",
      NYX_QUALITY_SUITE: "CONTEXT_REPAIR", RUNNER_TEMP: parent },
  });
  if (run.status !== 0) console.error(run.stdout.slice(-15_000), run.stderr.slice(-2000));
  check(run.status === 0, "existing live driver closes both arms through R1/R2/R3 with synthetic transport");
  const reportName = (await readdir(parent)).find((name) => /^nyx-quality-context_repair-.*\.json$/.test(name));
  assert.ok(reportName, "integration control must emit a sanitized report");
  const report = JSON.parse(await readFile(join(parent, reportName), "utf8"));
  check(report.experiment.version === "nyx-context-repair/2" && report.cognitionContractVersion === "nyx-causal-engineering-intent/6"
    && report.experiment.comparisonBaselineRun === "34481454745" && report.frozenCorePreserved,
  "new experiment declares lineage without rescoring the historical failed run");
  check(report.tasks.length === 2 && report.tasks.every((item: { hiddenAcceptance: string }) => item.hiddenAcceptance === "PASS"),
    "candidate-blind deterministic acceptance succeeds in both synthetic control arms");
  check(report.tasks[0].modelCalls === 3 && report.tasks[1].modelCalls === 2,
    "synthetic control exercises evidence seeking then formatting rejection/repair within the fixed budget");
  check(report.tasks.every((item: { candidates: number; cognitionFailures: unknown[] }) => item.candidates === 1 && item.cognitionFailures.length === 1),
    "unreadable responses cannot execute; only corrected candidates reach mutation");
  check(report.tasks.every((item: { cognitionFailures: { diagnostics: { sourceMeasurement?: { totalViolations: number } }[] }[] }) =>
    item.cognitionFailures[0].diagnostics.some((diagnostic) => diagnostic.sourceMeasurement?.totalViolations === 1)),
  "sanitized report preserves measured rejection evidence rather than dropping new feedback fields");
  check(report.tasks.every((item: { sourceRepositoryUnchanged: boolean; omegaAuthorityEnforcement: boolean }) =>
    item.sourceRepositoryUnchanged && item.omegaAuthorityEnforcement), "source immutability and Omega authority survive integration");
  check(report.causalBenefitEstablished === false && report.broadGeneralizationAssessed === false,
    "single diagnostic cannot self-certify research hypothesis or broad intelligence");
  check(NYX_CONTEXT_EXPERIMENT.maxCognitionCycles * NYX_CONTEXT_EXPERIMENT.maxOutputTokensPerCall * 2
    === NYX_CONTEXT_EXPERIMENT.maxCumulativeOutputTokens, "paired experiment generation-token ceiling is explicit");
} finally {
  assert.equal(await realpath(parent), parentIdentity);
  assert.ok(relative(await realpath(tmpdir()), parentIdentity).startsWith("nyx-grounded-engineering-"));
  async function validateTree(path: string): Promise<void> {
    const stat = await lstat(path);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) for (const name of await readdir(path)) await validateTree(join(path, name));
  }
  await validateTree(parent);
  await rm(parent, { recursive: true });
}
console.log(`Omega grounded engineering tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
