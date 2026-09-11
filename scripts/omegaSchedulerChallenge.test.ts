import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NYX_SCHEDULER_CHALLENGE as task, NYX_SCHEDULER_MUTANTS,
  NYX_SCHEDULER_FROZEN_CORE, NYX_SCHEDULER_EXPERIMENT } from "./omega/nyx-scheduler-challenge";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1 } from "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import { R3IsolatedHiddenEvaluator } from "../src/lib/codelab/assurance/r3EvaluatorIsolation";
import { OMEGA_CANDIDATE_RUNNER_SOURCE } from "./omega/verification-integrity-fixtures";

let passed = 0;
let failed = 0;
function check(value: unknown, label: string): void {
  if (value) { passed += 1; return; }
  failed += 1;
  console.error(`FAIL ${label}`);
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const parent = await mkdtemp(join(tmpdir(), "nyx-scheduler-assurance-"));
const parentIdentity = await realpath(parent);
async function materialize(name: string, files: Readonly<Record<string, string>>) {
  const root = join(parent, name);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source, "utf8");
  }
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "tools/verify-visible.mjs"), task.visibleVerifier, "utf8");
  return root;
}
// This test-only runner executes author-owned controls, never live model code.
const controlRunner = `import assert from "node:assert/strict";
import { simulate } from "./src/scheduler.mjs";
const cases = ${JSON.stringify(task.hiddenCases)};
const failures = [];
for (const test of cases) {
  const args = structuredClone(test.args);
  try {
    if (test.expectation.kind === "THROW") {
      assert.throws(() => simulate(...args), { name: test.expectation.errorName });
    } else {
      assert.deepEqual(simulate(...args), test.expectation.value);
      assert.deepEqual(args, test.args);
    }
  } catch { failures.push(test.caseId); }
}
console.log(JSON.stringify({ failures }));
`;
async function controlFailures(root: string): Promise<string[]> {
  await writeFile(join(root, "control.mjs"), controlRunner);
  const run = spawnSync(process.execPath, [join(root, "control.mjs")], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).failures;
}
try {
  const reference = await materialize("reference", task.correctFiles);
  const faulty = await materialize("faulty", { ...task.correctFiles, ...task.faultyFiles });
  check((await controlFailures(reference)).length === 0, "reference matches all 29 hand-derived state-table expectations");
  check((await controlFailures(faulty)).length > 5, "combined defects fail across multiple state-machine obligations");
  const visible = (root: string) => spawnSync(process.execPath, [join(root, "tools/verify-visible.mjs")], {
    cwd: root, encoding: "utf8", timeout: 10_000,
  });
  check(visible(reference).status === 0, "reference passes visible integration check");
  check(visible(faulty).status !== 0, "broken baseline produces a real visible failure");
  for (const mutant of NYX_SCHEDULER_MUTANTS) {
    const original = task.correctFiles[mutant.path];
    assert.equal(original.split(mutant.before).length, 2, `unambiguous mutation ${mutant.id}`);
    const root = await materialize(mutant.id, { ...task.correctFiles,
      [mutant.path]: original.replace(mutant.before, mutant.after) });
    check((await controlFailures(root)).length > 0, `independent expected-state cases detect ${mutant.id}`);
  }
  check(task.mutationPaths.length === 4 && task.initiallyAdmittedPaths.includes("src/contracts.mjs")
    && !task.mutationPaths.includes("src/contracts.mjs"), "schema validation remains visible but immutable");
  check(task.initiallyAdmittedPaths.every((path) => path.startsWith("src/"))
    && task.mutationPaths.every((path) => !path.startsWith("tools/")), "cognition cannot observe or edit expected answers");
  check(new Set(task.hiddenCases.map((test) => test.caseId)).size === 29, "case identities are unique and capped");
  const coreMatches = Object.entries(NYX_SCHEDULER_FROZEN_CORE.files).map(([path, digest]) => {
    const original = spawnSync("git", ["show", `${NYX_SCHEDULER_FROZEN_CORE.commit}:${path}`], { encoding: "utf8" });
    return original.status === 0 && hash(original.stdout.replace(/\r\n/g, "\n")) === digest;
  });
  check(coreMatches.every(Boolean), "historical scheduler epoch remains reproducible from its exact frozen baseline");
  check(NYX_SCHEDULER_EXPERIMENT.maxCognitionCycles === 4
    && NYX_SCHEDULER_EXPERIMENT.maxOutputTokensPerCall * 4 === NYX_SCHEDULER_EXPERIMENT.maxCumulativeOutputTokens,
  "paid experiment has a fixed four-call and generated-token envelope");
  for (const [name, policy] of [["challenge", task.qualityPolicy], ["existing admission", {
    ...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1, allowedChangedPaths: task.mutationPaths, readonlyPaths: ["src/contracts.mjs"],
  }]] as const) {
    const assessedPaths = name === "existing admission" ? task.mutationPaths : Object.keys(task.correctFiles);
    const baselineFiles = Object.fromEntries(assessedPaths.map((path) => [path, task.faultyFiles[path] ?? task.correctFiles[path]]));
    const candidateFiles = Object.fromEntries(assessedPaths.map((path) => [path, task.correctFiles[path]]));
    const quality = assessEngineeringQuality({ assessmentId: `REFERENCE-${name}`, evaluatorVersion: "challenge-selftest/1",
      baselineFiles, candidateFiles,
      changedPaths: task.mutationPaths, policy, functionalAcceptance: "PASS", regressionAcceptance: "PASS" });
    if (quality.decision !== "ACCEPTED") console.error(JSON.stringify({ name, quality }));
    check(quality.decision === "ACCEPTED", `reviewed reference satisfies ${name} quality before live scoring`);
  }
  // Exercise the same custody/permission mechanism used to judge live candidates.
  await writeFile(join(reference, "tools/candidate-runner.mjs"), OMEGA_CANDIDATE_RUNNER_SOURCE);
  const evaluatorRoot = join(parent, "evaluator");
  await mkdir(evaluatorRoot);
  const cases = `${JSON.stringify({ schemaVersion: 1, suiteId: task.taskId, cases: task.hiddenCases })}\n`;
  await writeFile(join(evaluatorRoot, "cases.json"), cases);
  const evaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "SCHEDULER-REFERENCE-ORACLE",
    evaluatorVersion: "scheduler-challenge/1", candidateRoot: reference, hiddenEvaluatorRoot: evaluatorRoot,
    hiddenCaseFile: "cases.json", expectedHiddenCaseFileSha256: hash(cases),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: hash(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: task.candidateModule, exportName: task.exportName, timeoutMsPerCase: 5_000,
    maxOutputBytesPerCase: 16_384, maxCases: 32 });
  const execution = await evaluator.evaluate();
  check(execution.outcome === "PASS" && execution.evidence.passedCases === 29,
    "existing isolated evaluator independently observes all reference return/throw/input-preservation expectations");
  check(execution.evidence.candidateAndEvaluatorScopesDisjoint && !execution.evidence.hiddenAssetsExposedToCandidate,
    "authoritative expected outcomes are outside candidate scope");
  // Exercise the actual report path without network or inherited credentials.
  // Provider transport is replaced before the driver loads; this is E3 simulation, not E4.
  const transportStub = join(parent, "offline-transport.mjs");
  await writeFile(transportStub, `globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "synthetic-unavailable" }), { status: 503 });\n`);
  const runOffline = (suite: string) => spawnSync(process.execPath, ["--experimental-strip-types", "--import", pathToFileURL(transportStub).href,
    "--import", pathToFileURL(resolve("scripts/w0rs/register-typescript-loader.mjs")).href,
    resolve("scripts/omega/nyx-quality-v4-live-eval.ts")], {
    cwd: resolve("."), encoding: "utf8", timeout: 20_000, maxBuffer: 1_000_000,
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: process.env.TEMP,
      TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, RUNNER_TEMP: parent,
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", NYX_QUALITY_SUITE: suite,
      NVIDIA_API_KEY: "synthetic-offline-not-a-credential" },
  });
  const historical = runOffline("CHALLENGE");
  check(historical.status === 1 && historical.stderr.includes("challenge_frozen_core_digest_mismatch")
    && !historical.stdout.includes("NYX_QUALITY_CHALLENGE_HOLDOUT"),
  "new cognition cannot silently rescore the old frozen scheduler epoch");
  const previousFeedbackEpoch = runOffline("CONTEXT_REPAIR");
  check(previousFeedbackEpoch.status === 1 && previousFeedbackEpoch.stderr.includes("context_repair_frozen_core_digest_mismatch"),
    "typed source experiment cannot silently rescore the previous measurement-feedback epoch");
  const previousLinesEpoch = runOffline("CONTEXT_LINES");
  check(previousLinesEpoch.status === 1 && previousLinesEpoch.stderr.includes("context_lines_frozen_core_digest_mismatch"),
    "configuration comparison cannot silently rescore the completed typed-source epoch");
  const previousComparison = runOffline("COMPARISON");
  check(previousComparison.status === 1 && previousComparison.stderr.includes("comparison_frozen_core_digest_mismatch"),
    "capacity status cannot silently rescore the completed configuration comparison");
  const offline = runOffline("CAPACITY_STATUS");
  const line = offline.stdout.split(/\r?\n/).find((item) => item.startsWith("NYX_QUALITY_CAPACITY_STATUS_HOLDOUT {"));
  if (!line) console.error(`OFFLINE_DRIVER_FAILURE ${offline.stderr.slice(-1500)}`);
  const report = line ? JSON.parse(line.slice("NYX_QUALITY_CAPACITY_STATUS_HOLDOUT ".length)) : null;
  check(offline.status === 1 && report?.evaluationDecision === "INSUFFICIENT_EVIDENCE"
    && report.tasks[0].modelCalls === 1 && report.tasks[0].candidates === 0,
  "simulated provider failure reaches the shared driver and stops without a fabricated candidate");
  check(report?.tasks.length === 3 && report?.tasks.every((item: { modelCalls: number; candidates: number }) => item.modelCalls === 1 && item.candidates === 0),
    "bounded comparison records each arm's single unsuccessful provider request without expanding repair budgets");
  check(report?.aggregateMetrics.falseAcceptanceRate === null && report?.aggregateMetrics.meanTokensPerTask === null
    && report?.aggregateMetrics.providerAdjustedTaskSuccessRate === null
    && report?.measurementCoverage.hiddenEvaluated === false,
  "unmeasured acceptance and unavailable token usage are null rather than false zero-risk evidence");
} finally {
  // Only this owned, unchanged temporary directory may be recursively removed.
  assert.equal(await realpath(parent), parentIdentity);
  assert.equal((await lstat(parent)).isSymbolicLink(), false);
  const containment = relative(await realpath(tmpdir()), parentIdentity);
  assert.ok(containment.startsWith("nyx-scheduler-assurance-") && !containment.includes(".."));
  await rm(parent, { recursive: true });
}
console.log(`Omega scheduler challenge tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exitCode = 1;
