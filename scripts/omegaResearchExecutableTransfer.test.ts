import { Script, createContext } from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkpointDigest, readFrontierCheckpoint, verifyFrontierCheckpoint } from "./omega/test-harness.mjs";
import { validResearchObjective } from "../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NYX_RESEARCH_TRANSFER_TASKS, NYX_RESEARCH_TRANSFER_CORPUS_DIGEST } from "./omega/nyx-research-transfer-fixtures";
import { NYX_HYPOTHESIS_COVERAGE_TASKS, NYX_HYPOTHESIS_COVERAGE_CORPUS_DIGEST }
  from "./omega/nyx-hypothesis-coverage-fixtures";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  checks += 1;
}
function run(source: string, toolId: string): string {
  const output: string[] = [];
  new Script(source).runInContext(createContext({
    process: { argv: ["node", "probe.mjs", toolId], exit: (status: number) => { throw new Error(`exit_${status}`); } },
    console: { log: (value: unknown) => output.push(String(value)) },
  }), { timeout: 500 });
  if (output.length !== 1) throw new Error("probe_output_cardinality");
  return output[0];
}
const candidate = "f".repeat(40);
const corpus = NYX_RESEARCH_TRANSFER_TASKS;
check(corpus.length === 3 && new Set(corpus.map(task => task.taskId)).size === 3, "three distinct frozen transfer tasks");
check(NYX_RESEARCH_TRANSFER_CORPUS_DIGEST === theoryDigest(corpus.map(task => task.oracleDigest)), "frozen corpus digest reconstructs");
check(NYX_HYPOTHESIS_COVERAGE_TASKS.length === 3 && NYX_HYPOTHESIS_COVERAGE_CORPUS_DIGEST
  === theoryDigest(NYX_HYPOTHESIS_COVERAGE_TASKS.map(task => task.oracleDigest)),
"new cross-domain development corpus has a reconstructable identity before live execution");
for (const override of [
  { OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "UNKNOWN-TASK" },
  { OMEGA_NYX_RESEARCH_CORPUS: "LEGACY" },
  { OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "1" },
  { OMEGA_NYX_RESEARCH_COMPARE_POLICY: "INVENTED_POLICY" },
  { OMEGA_NYX_RESEARCH_COMPARE_POLICY: "EXHAUST_PRECOMMITTED_FORECASTS", OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "" },
]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import",
    "./scripts/w0rs/register-typescript-loader.mjs", "scripts/omega/nyx-research-party-live-eval.ts"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, NVIDIA_API_KEY: "synthetic-test-only",
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NYX_RESEARCH_POLICY_COMPARISON: "1",
      OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "0", OMEGA_NYX_RESEARCH_CORPUS: "EXECUTABLE_TRANSFER_V1",
      OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: corpus[1].taskId, ...override },
  });
  check(result.status !== 0 && /research_(focused_task|focused_policy|corpus)_selection_invalid/.test(result.stderr),
    "invalid focused selection fails before provider construction or network dispatch");
  check(result.stdout === "" && !result.stderr.includes("synthetic-test-only"),
    "rejected selection neither emits a model result nor discloses credential injection");
}
for (const task of [...corpus, ...NYX_HYPOTHESIS_COVERAGE_TASKS]) {
  const objective = task.objective(candidate, 1_000);
  check(validResearchObjective(objective, 1_000), `${task.taskId}: strict objective contract`);
  check(task.probeSource !== undefined && !task.probeSource.includes("const outcomes"), `${task.taskId}: actual calculation, not answer lookup`);
  check(!JSON.stringify(objective).includes(task.oracleDigest) && !JSON.stringify(objective).includes(task.probeSource),
    `${task.taskId}: hidden oracle and selected program are not cognition inputs`);
  for (const experiment of objective.experimentCatalog) {
    const observed = run(task.probeSource, experiment.toolId);
    check(observed === task.outcome(experiment.experimentId), `${experiment.experimentId}: independent oracle agrees with actual program`);
    check(experiment.possibleOutcomes.includes(observed), `${experiment.experimentId}: computed result is in frozen outcome set`);
    check(run(task.probeSource, experiment.toolId) === observed, `${experiment.experimentId}: deterministic replay`);
  }
  for (const unknown of ["", "INVENTED-PROBE-0", `${task.taskId}-PROBE-3`, `${task.taskId}-PROBE-01`]) {
    try { run(task.probeSource, unknown); throw new Error("unknown_tool_accepted"); }
    catch (error) { check(String(error).includes("exit_3"), `${task.taskId}: malformed probe rejected`); }
  }
  try { task.outcome("UNKNOWN-EXPERIMENT"); throw new Error("unknown_oracle_accepted"); }
  catch (error) { check(/(?:transfer|coverage)_unknown_experiment/.test(String(error)), `${task.taskId}: oracle refuses unknown identity`); }
  const otherTime = task.objective(candidate, 500_000);
  check(otherTime.expiryEpochMs - 500_000 === objective.expiryEpochMs - 1_000,
    `${task.taskId}: independent arms have identical validity durations`);
  const clean = (value: typeof objective) => ({ ...value, expiryEpochMs: 0,
    admittedEvidence: value.admittedEvidence.map(item => ({ ...item, observedAtEpochMs: 0 })) });
  check(theoryDigest(clean(objective)) === theoryDigest(clean(otherTime)), `${task.taskId}: timestamps do not change problem semantics`);
}
for (const [task, original, replacement] of [
  [NYX_HYPOTHESIS_COVERAGE_TASKS[0], "queue = []", "queue.shift()"],
  [NYX_HYPOTHESIS_COVERAGE_TASKS[1], "f(g(inputs[i]))", "g(f(inputs[i]))"],
  [NYX_HYPOTHESIS_COVERAGE_TASKS[2], "x + ((v+velocity)/2)*dt", "x + v*dt"],
] as const) {
  // Queue's first 'queue = []' is its declaration; mutate the overflow branch only.
  const source = task === NYX_HYPOTHESIS_COVERAGE_TASKS[0]
    ? task.probeSource!.replace("if (queue.length === 2) queue = []", "if (queue.length === 2) queue.shift()")
    : task.probeSource!.replace(original, replacement);
  check(source !== task.probeSource && task.objective(candidate, 1_000).experimentCatalog.some(experiment =>
    run(source, experiment.toolId) !== task.outcome(experiment.experimentId)),
  "independent new-family oracle detects a syntactically valid wrong runtime implementation");
}

// Oracle destruction tests: different valid implementations must not inherit the
// reviewed answer merely because they share task identity or output shape.
const anti = corpus[0];
const brokenAnti = anti.probeSource!.replace("Object.is(key,excluded)", "Object.is(key ?? 0,excluded ?? 0)");
check(brokenAnti !== anti.probeSource, "anti-join sentinel mutation actually changes program");
check(run(brokenAnti, `${anti.taskId}-PROBE-0`) !== anti.outcome(`${anti.taskId}-EXP-A`),
  "independent oracle detects null/zero conflation");
const sum = corpus[1];
const brokenSum = sum.probeSource!.replace("let position = inputs[index].length - 1; position >= 0; position--",
  "let position = 0; position < inputs[index].length; position++");
check(brokenSum !== sum.probeSource, "reduction-order mutation actually changes program");
check(run(brokenSum, `${sum.taskId}-PROBE-1`) !== sum.outcome(`${sum.taskId}-EXP-B`),
  "independent oracle detects valid syntax with wrong reduction order");
const diffusion = corpus[2];
const brokenDiffusion = diffusion.probeSource!.replace("position < 0 ? -position : position >= old.length ? 2*old.length-2-position : position",
  "Math.max(0,Math.min(old.length-1,position))");
check(brokenDiffusion !== diffusion.probeSource, "boundary mutation actually changes program");
check(run(brokenDiffusion, `${diffusion.taskId}-PROBE-0`) !== diffusion.outcome(`${diffusion.taskId}-EXP-A`),
  "independent oracle detects incorrect boundary operator");
check(new Set(corpus.map(task => task.objective(candidate, 1_000).domain)).size === 3,
  "software, mathematics, and simulated science remain distinct transfer families");

// Archive checks cannot certify cognition; they prevent rewriting failed runs as successes.
const archiveRoot = "scripts/omega/checkpoints/frontier-ceiling/";
const checkpoint = JSON.parse(readFileSync(`${archiveRoot}checkpoint.json`, "utf8"));
const gaps = JSON.parse(readFileSync(`${archiveRoot}capability-gaps.json`, "utf8"));
const reports = Object.fromEntries(checkpoint.reports.map((item: { file: string }) =>
  [item.file, JSON.parse(readFileSync(`${archiveRoot}${item.file}`, "utf8"))]));
const verifyArchive = (state = checkpoint, registry = gaps, reportMap = reports,
  source = (path: string) => execFileSync("git", ["show", `${checkpoint.runtimeBaselineCommit}:${path}`],
    { encoding: "utf8", timeout: 10_000 })) => verifyFrontierCheckpoint(
  state, registry, (file: string) => reportMap[file], source);
check(readFrontierCheckpoint(undefined, "HISTORICAL_BASELINE").decision === "ACCEPT",
  "complete sanitized archive reconstructs against its immutable historical source, not a future candidate");
const currentCheckpoint = readFrontierCheckpoint();
check(currentCheckpoint.decision === "REJECT" && currentCheckpoint.findings.some((item: string) =>
  item.startsWith("RUNTIME_SOURCE_CHANGED:")) && currentCheckpoint.certifiesCurrentRuntime === false,
"changed runtime cannot inherit historical capability evidence; current candidate requires fresh revalidation");
check(verifyArchive().scope === "ARCHIVE_RECONSTRUCTION_NOT_CAPABILITY_CERTIFICATION"
  && verifyArchive().grantsAuthority === false, "archive integrity never grants authority or frontier certification");
check(checkpointDigest({ b: 2, a: [1, 3] }) === checkpointDigest({ a: [1, 3], b: 2 })
  && checkpointDigest({ a: [1, 3] }) !== checkpointDigest({ a: [3, 1] }),
"canonical digest ignores object ordering but preserves evidence sequence");
for (const mutation of [
  (value: typeof checkpoint) => { value.schemaVersion = 2; },
  (value: typeof checkpoint) => { value.highConfidenceFrontierReadiness = true; },
  (value: typeof checkpoint) => { value.authorityIncrease = true; },
  (value: typeof checkpoint) => { value.comparison.realizedComputeMatched = true; },
  (value: typeof checkpoint) => { value.evaluationTiers[0].tier = "SEALED_FINAL"; },
  (value: typeof checkpoint) => { value.reports[0].file = "../../credentials.json"; },
  (value: typeof checkpoint) => { value.reports[0].artifactDigestMeaning = "SIGNED_E4_CUSTODY"; },
  (value: typeof checkpoint) => { value.reports.splice(value.reports.findIndex((r: { reportId: string }) => r.reportId === "DEADLINE-COMPARISON"), 1); },
  (value: typeof checkpoint) => { value.runtimeSourceHashes = {}; },
]) {
  const altered = structuredClone(checkpoint); mutation(altered);
  check(verifyArchive(altered).decision === "REJECT", "scope, version, custody and historical-failure mutations fail closed");
}
const alteredGaps = structuredClone(gaps); delete alteredGaps.gaps[0].alternativeExplanations;
check(verifyArchive(checkpoint, alteredGaps).decision === "REJECT", "registry tampering and missing competing explanations are detected");
const alteredGapBinding = { ...checkpoint, registryDigest: checkpointDigest(alteredGaps) };
check(verifyArchive(alteredGapBinding, alteredGaps).decision === "REJECT", "rehashed registry still requires competing explanations");
for (const mutation of [
  (report: typeof reports[string]) => { report.completedArms += 1; },
  (report: typeof reports[string]) => { report.matchedLimits.maxModelCalls += 1; },
  (report: typeof reports[string]) => { report.records[0].resourceUsage.totalTokens = 0; },
  (report: typeof reports[string]) => { report.records[0].resourceUsage.modelCalls += 1; },
]) {
  const alteredReports = structuredClone(reports); const altered = structuredClone(checkpoint);
  mutation(alteredReports["recovery-attempt-1.json"]);
  const ref = altered.reports.find((r: { file: string }) => r.file === "recovery-attempt-1.json");
  ref.canonicalReportSha256 = checkpointDigest(alteredReports[ref.file]);
  check(verifyArchive(altered, gaps, alteredReports).decision === "REJECT",
    "even a recomputed self-manifest cannot hide limits, missing usage or call-count inconsistencies");
}
const changedOracle = structuredClone(reports); const changedBinding = structuredClone(checkpoint);
changedOracle["counterexample-math-regression.json"].records.forEach((r: typeof reports[string]) => {
  r.assurance.evaluatorDigest = "0".repeat(64);
});
changedBinding.reports.find((r: { file: string }) => r.file === "counterexample-math-regression.json").canonicalReportSha256 =
  checkpointDigest(changedOracle["counterexample-math-regression.json"]);
check(verifyArchive(changedBinding, gaps, changedOracle).decision === "REJECT", "changed math oracle cannot masquerade as the preserved regression");
check(verifyArchive(checkpoint, gaps, reports, () => "altered runtime source").decision === "REJECT",
  "runtime dependency changes require checkpoint revalidation");
const erasedFailure = structuredClone(reports); const erasedFailureBinding = structuredClone(checkpoint);
erasedFailure["science-unexecuted-arm.json"].verdict = "BOUNDED_LIVE_COMPARISON_ONLY";
const erasedRef = erasedFailureBinding.reports.find((r: { file: string }) => r.file === "science-unexecuted-arm.json");
erasedRef.verdict = erasedFailure[erasedRef.file].verdict;
erasedRef.canonicalReportSha256 = checkpointDigest(erasedFailure[erasedRef.file]);
check(verifyArchive(erasedFailureBinding, gaps, erasedFailure).decision === "REJECT",
  "rehashed artifact metadata cannot erase the final science negative finding");
console.log(`NYX_EXECUTABLE_TRANSFER_PREFLIGHT ${JSON.stringify({ schemaVersion: 1,
  corpusDigest: NYX_RESEARCH_TRANSFER_CORPUS_DIGEST, actualCognition: "NOT_EXECUTED",
  oracleMutantsRejected: 3, evidenceClass: "E3", broadPromotion: false, authorityGranted: false })}`);
console.log(`OMEGA_RESEARCH_EXECUTABLE_TRANSFER_TEST_SUMMARY passed: ${checks}, failed: 0`);
