import { Script, createContext } from "node:vm";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkpointDigest, readFrontierCheckpoint, verifyFrontierCheckpoint } from "./omega/test-harness.mjs";
import { validResearchObjective } from "../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NYX_RESEARCH_TRANSFER_TASKS, NYX_RESEARCH_TRANSFER_CORPUS_DIGEST } from "./omega/nyx-research-transfer-fixtures";
import { NYX_HYPOTHESIS_COVERAGE_TASKS, NYX_HYPOTHESIS_COVERAGE_CORPUS_DIGEST }
  from "./omega/nyx-hypothesis-coverage-fixtures";
import { NYX_COVERAGE_TRANSFER_TASKS, NYX_COVERAGE_TRANSFER_CORPUS_DIGEST } from "./omega/nyx-coverage-transfer-fixtures";
import { NYX_COVERAGE_TRANSFER_V2_TASKS, NYX_COVERAGE_TRANSFER_V2_CORPUS_DIGEST } from "./omega/nyx-coverage-transfer-v2-fixtures";
import { NYX_COVERAGE_TRANSFER_V3_TASKS, NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST } from "./omega/nyx-coverage-transfer-v3-fixtures";
import { analyzeCoverageTransfer, type CoverageTransferArm } from "../src/lib/codelab/research/coverageTransferAnalysis";

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
check(NYX_COVERAGE_TRANSFER_CORPUS_DIGEST === theoryDigest(NYX_COVERAGE_TRANSFER_TASKS.map(task => task.oracleDigest))
  && new Set(NYX_COVERAGE_TRANSFER_TASKS.map(task => task.objective(candidate, 1_000).domain)).size === 3
  && NYX_COVERAGE_TRANSFER_TASKS.every(task => ![...corpus, ...NYX_HYPOTHESIS_COVERAGE_TASKS]
    .some(previous => previous.taskId === task.taskId || previous.oracleDigest === task.oracleDigest)),
"allocation transfer freezes three new domain families without rewriting inspected regression tasks");
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
      OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON: "0",
      OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "0", OMEGA_NYX_RESEARCH_CORPUS: "EXECUTABLE_TRANSFER_V1",
      OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: corpus[1].taskId, ...override },
  });
  check(result.status !== 0 && /research_(focused_task|focused_policy|corpus)_selection_invalid/.test(result.stderr),
    "invalid focused selection fails before provider construction or network dispatch");
  check(result.stdout === "" && !result.stderr.includes("synthetic-test-only"),
    "rejected selection neither emits a model result nor discloses credential injection");
}
for (const override of [
  { OMEGA_NYX_RESEARCH_CORPUS: "LEGACY" },
  { OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON: "0" },
  { OMEGA_NYX_RESEARCH_POLICY_COMPARISON: "0" },
  { OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "1" },
  { OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "NYX-COVERAGE-QUEUE" },
]) {
  const rejected = spawnSync(process.execPath, ["--experimental-strip-types", "--import",
    "./scripts/w0rs/register-typescript-loader.mjs", "scripts/omega/nyx-research-party-live-eval.ts"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, NVIDIA_API_KEY: "synthetic-test-only",
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NYX_RESEARCH_POLICY_COMPARISON: "1",
      OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON: "1", OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "0",
      OMEGA_NYX_RESEARCH_CORPUS: "HYPOTHESIS_COVERAGE_DEVELOPMENT_V1",
      OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "", OMEGA_NYX_RESEARCH_COMPARE_POLICY: "", ...override },
  });
  check(rejected.status !== 0 && /research_(allocation_comparison|corpus|focused_task)_selection_invalid/.test(rejected.stderr)
    && rejected.stdout === "" && !rejected.stderr.includes("synthetic-test-only"),
  "incompatible allocation/corpus/diagnostic selectors fail closed before any provider dispatch");
}
check(NYX_COVERAGE_TRANSFER_V2_TASKS.length === 3
  && new Set(NYX_COVERAGE_TRANSFER_V2_TASKS.map(task => task.objective(candidate, 1000).domain)).size === 3
  && NYX_COVERAGE_TRANSFER_V2_CORPUS_DIGEST === theoryDigest(NYX_COVERAGE_TRANSFER_V2_TASKS.map(task => task.oracleDigest))
  && NYX_COVERAGE_TRANSFER_V2_TASKS.every(task => ![...corpus, ...NYX_HYPOTHESIS_COVERAGE_TASKS,
    ...NYX_COVERAGE_TRANSFER_TASKS].some(old => old.taskId === task.taskId || old.oracleDigest === task.oracleDigest)),
  "fresh v2 corpus preserves inspected v1 tasks and spans three different mechanism families");
for (const task of [...corpus, ...NYX_HYPOTHESIS_COVERAGE_TASKS, ...NYX_COVERAGE_TRANSFER_TASKS, ...NYX_COVERAGE_TRANSFER_V2_TASKS]) {
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
for (const [task, before, after] of [
  [NYX_COVERAGE_TRANSFER_V2_TASKS[0], "if(alive) lastSuccessfulTouch=t", "if(false) lastSuccessfulTouch=t"],
  [NYX_COVERAGE_TRANSFER_V2_TASKS[1], "[p,q]", "[q,p]"],
  [NYX_COVERAGE_TRANSFER_V2_TASKS[2], "for(const reaction of reactions)", "for(const reaction of [...reactions].reverse())"],
] as const) {
  const altered = task.probeSource!.replace(before, after);
  check(altered !== task.probeSource && task.objective(candidate, 1000).experimentCatalog.some(experiment =>
    run(altered, experiment.toolId) !== task.outcome(experiment.experimentId)),
    "fresh manual oracle rejects plausible wrong lifetime, mapping order and shared-resource semantics");
}
for (const [task, original, replacement] of [
  [NYX_COVERAGE_TRANSFER_TASKS[0], "firstProposal + secondProposal - s", "secondProposal"],
  [NYX_COVERAGE_TRANSFER_TASKS[1], "let row=1;row>=0;row--", "let row=0;row<2;row++"],
  [NYX_COVERAGE_TRANSFER_TASKS[2], "Math.min(a,raw) : -Math.min(b,-raw)", "Math.min(b,raw) : -Math.min(a,-raw)"],
] as const) {
  const altered = task.probeSource!.replace(original, replacement);
  check(altered !== task.probeSource && task.objective(candidate, 1_000).experimentCatalog.some(experiment =>
    run(altered, experiment.toolId) !== task.outcome(experiment.experimentId)),
  "transfer oracle detects plausible wrong transaction, recurrence or flux semantics without relaxing syntax");
}

const transferIds = NYX_COVERAGE_TRANSFER_TASKS.map(task => task.taskId);
const analysisArm = (taskId: string, policy: CoverageTransferArm["policy"], accepted: boolean,
  tokens: number | null = 1000): CoverageTransferArm => ({ taskId, policy,
    assurance: { decision: accepted ? "ACCEPT" : "INSUFFICIENT_EVIDENCE" },
    resourceUsage: { modelCalls: 8, experiments: 3, totalTokens: tokens, wallClockMs: 100 } });
const analysisRecords = transferIds.flatMap((id, index) => [analysisArm(id, "DERIVATION_ONLY", index !== 0),
  analysisArm(id, "ROTATING_PARTITION", index !== 1)]);
const paired = analyzeCoverageTransfer(transferIds, analysisRecords);
check(paired.completePairs === 3 && paired.wins === 1 && paired.losses === 1 && paired.ties === 1,
  "paired analysis preserves wins, losses and ties rather than selecting successful arms");
check(paired.pairs.every(pair => pair.exactRealizedComputeMatch) && paired.computeComparableWins === 1
  && !paired.broadPromotion && !paired.grantsAuthority && paired.calibration === "NOT_ESTABLISHED",
"matched descriptive evidence cannot certify broad cognition, calibration or authority");
const incomplete = analyzeCoverageTransfer(transferIds, analysisRecords.slice(0, 1));
check(incomplete.completePairs === 0 && incomplete.wins === 0
  && incomplete.pairs.every(pair => !pair.exactRealizedComputeMatch && !pair.withinDeclaredTokenEnvelope),
"missing arms remain incomplete, never matched successes");
for (const tokens of [null, 0, 1300, 1090]) {
  const value = analyzeCoverageTransfer([transferIds[0]], [analysisArm(transferIds[0], "DERIVATION_ONLY", false),
    analysisArm(transferIds[0], "ROTATING_PARTITION", true, tokens)]);
  check(value.pairs[0].exactRealizedComputeMatch === false
    && value.computeComparableWins === (tokens === 1090 ? 1 : 0),
  "unknown, zero and excess usage differ from the predeclared ten-percent token envelope; none claims exact equality");
}
const unequalCalls = analyzeCoverageTransfer([transferIds[0]], [analysisRecords[0],
  { ...analysisRecords[1], resourceUsage: { ...analysisRecords[1].resourceUsage, modelCalls: 11 } }]);
check(unequalCalls.wins === 1 && unequalCalls.computeComparableWins === 0,
  "extra model calls cannot masquerade as a compute-comparable win");
for (const altered of [
  [analysisRecords[0], analysisRecords[0]],
  [{ ...analysisRecords[0], taskId: "UNKNOWN" }],
  [{ ...analysisRecords[0], resourceUsage: { ...analysisRecords[0].resourceUsage, totalTokens: -1 } }],
  [{ ...analysisRecords[0], assurance: { decision: "PASSED" } }],
]) {
  try { analyzeCoverageTransfer(transferIds, altered as CoverageTransferArm[]); throw new Error("analysis_accepted_invalid"); }
  catch (error) { check(String(error).includes("coverage_transfer_analysis_record_invalid"),
    "duplicate, foreign, invalid usage and dishonest acceptance-state records fail closed"); }
}
for (const override of [{ OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON: "0" },
  { OMEGA_NYX_RESEARCH_COMPARE_TASKS: "9" }, { OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: transferIds[0] }]) {
  const invalid = spawnSync(process.execPath, ["--experimental-strip-types", "--import",
    "./scripts/w0rs/register-typescript-loader.mjs", "scripts/omega/nyx-research-party-live-eval.ts"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, NVIDIA_API_KEY: "synthetic-test-only",
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NYX_RESEARCH_POLICY_COMPARISON: "1",
      OMEGA_NYX_HYPOTHESIS_ALLOCATION_COMPARISON: "1", OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "0",
      OMEGA_NYX_RESEARCH_CORPUS: "COVERAGE_TRANSFER_V1", OMEGA_NYX_RESEARCH_COMPARE_TASKS: "3",
      OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "", OMEGA_NYX_RESEARCH_COMPARE_POLICY: "", ...override },
  });
  check(invalid.status !== 0 && /research_(allocation_comparison|task_count|focused_task)_selection_invalid/.test(invalid.stderr)
    && invalid.stdout === "", "invalid transfer selection fails before provider construction and network");
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
// Preserve the observed negative arm and simpler-control tie, not just green CI.
// This reconstructs historical evidence; it never certifies a later candidate.
const coverageRoot = "scripts/omega/checkpoints/hypothesis-coverage/";
const coverageCheckpoint = JSON.parse(readFileSync(`${coverageRoot}checkpoint.json`, "utf8"));
const coverageReport = JSON.parse(readFileSync(`${coverageRoot}comparison.json`, "utf8"));
check(coverageCheckpoint.schemaVersion === 1 && coverageCheckpoint.reportFile === "comparison.json"
  && checkpointDigest(coverageReport) === coverageCheckpoint.canonicalReportSha256,
"sanitized coverage report retains canonical integrity and explicit schema");
check(coverageReport.candidateCommit === coverageCheckpoint.runtimeBaselineCommit
  && /^[a-f0-9]{40}$/.test(coverageCheckpoint.runtimeBaselineCommit), "coverage evidence binds an exact historical candidate");
for (const [path, expected] of Object.entries(coverageCheckpoint.runtimeSourceHashes)) {
  check(/^(src|scripts)\/[A-Za-z0-9_./-]+\.(ts|mjs)$/.test(path) && !path.split("/").includes(".."),
    "historical runtime paths are bounded source identities, not arbitrary reads");
  const source = execFileSync("git", ["show", `${coverageCheckpoint.runtimeBaselineCommit}:${path}`],
    { encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
  check(createHash("sha256").update(source).digest("hex") === expected,
    "coverage checkpoint reconstructs against its actually exercised source");
}
check(coverageReport.records.length === 3 && coverageReport.records.map((r: { policy: string }) => r.policy).join(",")
  === "INDEPENDENT,ROTATING_PARTITION,COVERAGE_AWARE", "all three distinct live arms remain preserved");
check(coverageReport.records[0].assurance.decision === "INSUFFICIENT_EVIDENCE"
  && coverageReport.records[0].cognitionOutcomeCounts.MODEL_OUTPUT_REJECTION === 1
  && coverageReport.records.slice(1).every((r: { assurance: { decision: string } }) => r.assurance.decision === "ACCEPT"),
"baseline prediction/schema failure is not erased by both guided-arm successes");
check(coverageReport.records.every((r: { resourceUsage: { modelCalls: number; experiments: number } }) =>
  r.resourceUsage.modelCalls === 8 && r.resourceUsage.experiments === 3)
  && coverageReport.realizedComputeMatched === false && coverageReport.realizedCompute[0].tokenSpreadFraction > 0,
"matched call/experiment counts are not misrepresented as matched realized tokens");
check(coverageReport.records.every((r: { providerFailures: number; sourceRepositoryUnchanged: boolean;
  authorityGranted: boolean; evidenceChainComplete: boolean }) => r.providerFailures === 0
  && r.sourceRepositoryUnchanged && !r.authorityGranted && r.evidenceChainComplete),
"live coverage record preserves functioning transport, custody, and unchanged source authority");
check(coverageCheckpoint.promotionDecision === "NOT_PROMOTED_OVER_SIMPLER_CONTROL"
  && coverageCheckpoint.certifiesCurrentRuntime === false && coverageCheckpoint.authorityIncrease === false
  && coverageReport.broadPromotion === false && coverageReport.freshHeldoutClaim === false
  && coverageReport.defaultPolicyChanged === false, "one development result cannot promote default cognition or authority");
check(coverageCheckpoint.integrityClassification === "SELF_CONTAINED_HASH_MANIFEST_NOT_SIGNED_CUSTODY"
  && coverageReport.evidence.cognition === "E4" && coverageReport.evidence.experimentsAndOracle === "E3"
  && coverageReport.evidence.independentInstitutionalReplication === false,
"self-contained reconstruction remains distinct from signed custody and institutional replication");
// A successful partial arm must not wash away a failed, unpaired campaign.
const transferRoot = "scripts/omega/checkpoints/coverage-transfer/";
const transferCheckpoint = JSON.parse(readFileSync(`${transferRoot}checkpoint.json`, "utf8"));
const transferReport = JSON.parse(readFileSync(`${transferRoot}comparison.json`, "utf8"));
check(transferCheckpoint.schemaVersion === 1 && transferCheckpoint.reportFile === "comparison.json"
  && checkpointDigest(transferReport) === transferCheckpoint.canonicalReportSha256,
"transfer archive retains the complete sanitized report, not just its successful first arm");
check(transferReport.candidateCommit === transferCheckpoint.runtimeBaselineCommit
  && /^[a-f0-9]{40}$/.test(transferCheckpoint.runtimeBaselineCommit)
  && transferReport.corpusDigest === NYX_COVERAGE_TRANSFER_CORPUS_DIGEST,
"failed campaign is bound to the exact exercised candidate and frozen development corpus");
for (const [path, expected] of Object.entries(transferCheckpoint.runtimeSourceHashes)) {
  check(/^(src|scripts)\/[A-Za-z0-9_./-]+\.(ts|mjs)$/.test(path) && !path.split("/").includes(".."),
    "transfer historical reconstruction cannot request arbitrary paths");
  const source = execFileSync("git", ["show", `${transferCheckpoint.runtimeBaselineCommit}:${path}`],
    { encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
  check(createHash("sha256").update(source).digest("hex") === expected,
    "transfer evidence reconstructs against the historical source, not an unexercised later runtime");
}
const dispatchSource = execFileSync("git", ["show", `${transferCheckpoint.runtimeBaselineCommit}:.github/workflows/omega-nyx-research-party-live-eval.yml`],
  { encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
check(createHash("sha256").update(dispatchSource).digest("hex") === transferCheckpoint.dispatchWorkflowSha256,
  "historical dispatch configuration remains reconstructable after restoring manual-only operation");
check(transferReport.requestedArms === 6 && transferReport.completedArms === 1
  && transferReport.records.length === 1 && transferCheckpoint.incompleteArms.length === 5,
"unexecuted arms stay visibly missing rather than becoming negative or positive model results");
check(transferReport.records[0].policy === "DERIVATION_ONLY"
  && transferReport.records[0].assurance.decision === "ACCEPT"
  && transferReport.providerBlocked && transferReport.verdict === "INCONCLUSIVE_PROVIDER_FAILURE",
"first-arm correctness cannot turn provider interruption into comparative success");
check(transferReport.records[0].cognitionOutcomeCounts.PROVIDER_FAILURE === 1
  && transferReport.records[0].cognitionOutcomeCounts.MODEL_OUTPUT_REJECTION === 1
  && transferReport.records[0].cognitionOutcomeCounts.OUTPUT_TRUNCATION === 0,
"HTTP failure, model scalar rejection and truncation remain distinct empirical classes");
check(transferReport.records[0].resourceUsage.totalTokens === null
  && transferCheckpoint.resourceSummary.completeTokenTotal === null
  && transferCheckpoint.resourceSummary.reportedTokenLowerBound === 11190,
"partial reported usage is a lower bound, not an invented complete token total");
check(checkpointDigest(analyzeCoverageTransfer(transferReport.selectedTaskIds, transferReport.records))
  === checkpointDigest(transferReport.pairedAnalysis)
  && transferReport.pairedAnalysis.completePairs === 0 && !transferReport.realizedComputeMatched,
"recomputed analysis preserves zero completed pairs and no realized compute match");
check(transferCheckpoint.promotionDecision === "NOT_PROMOTED_INCOMPLETE_COMPARISON"
  && transferCheckpoint.certifiesCurrentRuntime === false && transferCheckpoint.authorityIncrease === false
  && !transferReport.broadPromotion && !transferReport.defaultPolicyChanged
  && transferReport.acceptanceViolations === 0 && transferReport.records[0].sourceRepositoryUnchanged,
"archived failure neither promotes allocation nor weakens the preserved source and authority boundaries");
// Preserve recovery failures, incomparable resource use, and the rejected arm.
// Replaying an archive is not live certification of the subsequent lease repair.
const recoveryRoot = "scripts/omega/checkpoints/coverage-recovery/";
const recoveryCheckpoint = JSON.parse(readFileSync(`${recoveryRoot}checkpoint.json`, "utf8"));
const recoveryReport = JSON.parse(readFileSync(`${recoveryRoot}comparison.json`, "utf8"));
check(recoveryCheckpoint.schemaVersion === 1 && recoveryCheckpoint.reportFile === "comparison.json"
  && checkpointDigest(recoveryReport) === recoveryCheckpoint.canonicalReportSha256
  && recoveryCheckpoint.canonicalReportSha256 === "1d338a923f0b88cbeb06f58dcf0d6f74029dd0801391ef319daa3347388b5934",
"recovery archive preserves the full sanitized observed report, including its negative finding");
check(recoveryReport.candidateCommit === recoveryCheckpoint.runtimeBaselineCommit
  && recoveryReport.candidateCommit === "b3d722494478ebaa24caffa4cc8821b2682df87f"
  && recoveryReport.corpusDigest === transferReport.corpusDigest,
"recovery evidence binds its exact revised candidate without replacing the preceding run or task corpus");
for (const [path, expected] of Object.entries(recoveryCheckpoint.runtimeSourceHashes)) {
  check(/^(src|scripts)\/[A-Za-z0-9_./-]+\.(ts|mjs)$/.test(path) && !path.split("/").includes(".."),
    "recovery reconstruction is confined to enumerated source paths");
  const historical = execFileSync("git", ["show", `${recoveryCheckpoint.runtimeBaselineCommit}:${path}`],
    { encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
  check(createHash("sha256").update(historical).digest("hex") === expected,
    "retry and scalar-diagnostic revision is reconstructed against the actual exercised runtime");
}
const recoveryDispatch = execFileSync("git", ["show",
  `${recoveryCheckpoint.runtimeBaselineCommit}:.github/workflows/omega-nyx-research-party-live-eval.yml`],
{ encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
check(createHash("sha256").update(recoveryDispatch).digest("hex") === recoveryCheckpoint.dispatchWorkflowSha256,
  "recovery dispatch remains attributable after returning the live workflow to manual-only");
check(recoveryReport.completedArms === 2 && recoveryReport.requestedArms === 6
  && recoveryReport.records.length === 2 && recoveryCheckpoint.incompleteArms.length === 4,
"four unexecuted arms remain missing, not invented outcomes or hidden successes");
const [recoveryControl, recoveryAllocated] = recoveryReport.records;
check(recoveryControl.policy === "DERIVATION_ONLY" && recoveryControl.assurance.decision === "REJECT"
  && recoveryControl.decision.reason === "research_party_prediction_not_precommitted"
  && recoveryControl.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 1
  && !recoveryControl.evidenceChainComplete,
"the rejected control retains its truncation and incomplete precommit chain despite a successful sibling arm");
check(recoveryAllocated.policy === "ROTATING_PARTITION" && recoveryAllocated.assurance.decision === "ACCEPT"
  && recoveryAllocated.cognitionOutcomeCounts.PROVIDER_FAILURE === 1
  && recoveryAllocated.cognitionEvidence.some((item: { statusCode: number; delivery: { httpAttempts: number } }) =>
    item.statusCode === 503 && item.delivery.httpAttempts === 2),
"oracle acceptance is distinct from the persistent provider failure that stopped the paired campaign");
check(recoveryReport.records.every((record: typeof recoveryControl) => record.resourceUsage.totalTokens === null)
  && recoveryReport.records.reduce((sum: number, record: typeof recoveryControl) =>
    sum + record.cognitionEvidence.reduce((subtotal: number, item: { totalTokens: number | null }) =>
      subtotal + (item.totalTokens ?? 0), 0), 0) === recoveryCheckpoint.resourceSummary.reportedTokenLowerBound
  && recoveryCheckpoint.resourceSummary.reportedTokenLowerBound === 61580,
"final-response usage remains a lower bound rather than full compute accounting for discarded attempts");
check(recoveryReport.records.reduce((sum: number, record: typeof recoveryControl) =>
  sum + record.resourceUsage.modelCalls, 0) === 15
  && recoveryReport.records.reduce((sum: number, record: typeof recoveryControl) =>
    sum + record.transport.httpAttempts, 0) === 22
  && recoveryReport.records.reduce((sum: number, record: typeof recoveryControl) =>
    sum + record.resourceUsage.experiments, 0) === 5,
"logical calls, actual HTTP attempts and authorized experiments remain separate resource dimensions");
check(checkpointDigest(analyzeCoverageTransfer(recoveryReport.selectedTaskIds, recoveryReport.records))
  === checkpointDigest(recoveryReport.pairedAnalysis)
  && recoveryReport.pairedAnalysis.completePairs === 1 && recoveryReport.pairedAnalysis.wins === 1
  && recoveryReport.pairedAnalysis.computeComparableWins === 0 && !recoveryReport.realizedComputeMatched,
"a descriptive one-pair win at unequal calls and experiments cannot become a compute-matched advantage");
check(recoveryCheckpoint.certifiesCurrentRuntime === false && recoveryCheckpoint.authorityIncrease === false
  && recoveryCheckpoint.frontierBenchmarkReadinessProbability === null
  && !recoveryReport.broadPromotion && !recoveryReport.defaultPolicyChanged
  && recoveryReport.acceptanceViolations === 0
  && recoveryReport.records.every((record: typeof recoveryControl) => record.sourceRepositoryUnchanged
    && !record.authorityGranted),
"partial development evidence grants neither authority, default promotion, nor broad benchmark confidence");
check(recoveryCheckpoint.correctiveFinding.maturity === "LOCALLY_VERIFIED_E3_NOT_LIVE_REVALIDATED"
  && recoveryCheckpoint.correctiveFinding.authorityRenewed === false
  && recoveryCheckpoint.correctiveFinding.oracleChanged === false
  && recoveryCheckpoint.correctiveFinding.resourceCeilingsIncreased === false,
"specifying and locally testing the lease repair cannot retroactively repair the observed live failure");
check(recoveryCheckpoint.integrityClassification === "SELF_CONTAINED_HASH_MANIFEST_NOT_SIGNED_CUSTODY"
  && recoveryReport.evidence.cognition === "E4" && recoveryReport.evidence.experimentsAndOracle === "E3"
  && !recoveryReport.evidence.independentInstitutionalReplication,
"archive replay and E3 oracle independence remain weaker than institutional replication or signed custody");
// A new delivery configuration and fresh corpus do not erase earlier failures.
const boundedRoot = "scripts/omega/checkpoints/bounded-output/";
const boundedCheckpoint = JSON.parse(readFileSync(`${boundedRoot}checkpoint.json`, "utf8"));
const boundedReport = JSON.parse(readFileSync(`${boundedRoot}comparison.json`, "utf8"));
check(boundedCheckpoint.schemaVersion === 1 && boundedCheckpoint.reportFile === "comparison.json"
  && checkpointDigest(boundedReport) === boundedCheckpoint.canonicalReportSha256
  && boundedCheckpoint.canonicalReportSha256 === "050dcd1780a5e6a75fbe00f7fc703253d0754d54d59a4cc642a88acb1cab2c3d",
  "bounded-output archive preserves the exact negative E4 report rather than regenerating a successful one");
check(boundedReport.candidateCommit === boundedCheckpoint.runtimeBaselineCommit
  && boundedReport.candidateCommit === "05e92b46db43e2d72e8ad93cfa9ac99e5d48df3d"
  && boundedReport.corpus === "COVERAGE_TRANSFER_V2"
  && boundedReport.corpusDigest === NYX_COVERAGE_TRANSFER_V2_CORPUS_DIGEST
  && boundedReport.corpusDigest !== recoveryReport.corpusDigest,
  "fresh runtime and corpus identities cannot be conflated with the inspected recovery pair");
for (const [path, expected] of Object.entries(boundedCheckpoint.runtimeSourceHashes)) {
  check(/^(src|scripts)\/[A-Za-z0-9_./-]+\.(ts|mjs)$/.test(path) && !path.split("/").includes(".."),
    "bounded-output source reconstruction is confined to enumerated dependencies");
  const source = execFileSync("git", ["show", `${boundedReport.candidateCommit}:${path}`],
    { encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
  check(createHash("sha256").update(source).digest("hex") === expected,
    "output configuration, lease settlement, graph, oracle and fresh task source bind to the exercised candidate");
}
const dispatch = execFileSync("git", ["show",
  `${boundedReport.candidateCommit}:.github/workflows/omega-nyx-research-party-live-eval.yml`],
{ encoding: "utf8", timeout: 10_000 }).replace(/\r\n/g, "\n");
check(createHash("sha256").update(dispatch).digest("hex") === boundedCheckpoint.dispatchWorkflowSha256,
  "live dispatch attribution survives removal of its one-off push trigger");
check(boundedReport.completedArms === 1 && boundedReport.requestedArms === 6
  && boundedReport.records.length === 1 && boundedCheckpoint.incompleteArms.length === 5
  && boundedCheckpoint.incompleteArms.every((arm: { taskId: string; policy: string; state: string }) =>
    arm.state === "NOT_EXECUTED" && !boundedReport.records.some((r: { taskId: string; policy: string }) =>
      r.taskId === arm.taskId && r.policy === arm.policy)),
  "five missing arms are neither fabricated results nor hidden successful samples");
const boundedControl = boundedReport.records[0];
check(boundedControl.assurance.decision === "INSUFFICIENT_EVIDENCE"
  && boundedControl.assurance.evidenceIntegrityAcceptance && boundedControl.assurance.authorityBoundaryAcceptance
  && boundedControl.cognitionOutcomeCounts.PROVIDER_FAILURE === 2
  && boundedControl.cognitionEvidence.filter((e: { statusCode: number; delivery: { httpAttempts: number } }) =>
    e.statusCode === 503 && e.delivery.httpAttempts === 2).length === 2,
  "two exhausted provider retries remain external delivery failures rather than reasoning scores");
check(boundedControl.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 0
  && boundedControl.cognitionOutcomeCounts.MODEL_OUTPUT_REJECTION === 1
  && boundedControl.cognitionOutcomes.some((outcome: { diagnostics: string[] }) =>
    outcome.diagnostics.includes("intent_scalar_thesis_invalid"))
  && boundedCheckpoint.reliabilityObservation.causalTruncationReductionEstablished === false,
  "no observed truncation in five deliveries is limited evidence, not a causal fix or absence of scalar errors");
check(boundedControl.decision.state === "REFUTED_MODELED_FAMILY"
  && boundedControl.decision.assessments.some((assessment: { mechanismId: string; falsifyingObservationIds: string[] }) =>
    assessment.mechanismId === "READ_SLIDING" && assessment.falsifyingObservationIds.length > 0),
  "selecting the correct mechanism name does not override independently falsified forecasts");
check(boundedControl.resourceUsage.totalTokens === null && boundedControl.transport.httpAttempts === 9
  && boundedControl.resourceUsage.modelCalls === 7 && boundedControl.resourceUsage.experiments === 2
  && boundedControl.cognitionEvidence.reduce((sum: number, item: { totalTokens: number | null }) =>
    sum + (item.totalTokens ?? 0), 0) === 17857
  && boundedCheckpoint.resourceSummary.reportedTokenLowerBound === 17857,
  "seven calls, nine HTTP attempts, two experiments and incomplete token consumption stay distinct");
check(checkpointDigest(analyzeCoverageTransfer(boundedReport.selectedTaskIds, boundedReport.records))
  === checkpointDigest(boundedReport.pairedAnalysis) && boundedReport.pairedAnalysis.completePairs === 0
  && boundedReport.pairedAnalysis.computeComparableWins === 0 && !boundedReport.realizedComputeMatched,
  "an incomplete epoch cannot establish matched compute or a cognitive gain");
check(boundedReport.matchedLimits.maxOutputTokensPerCall === recoveryReport.matchedLimits.maxOutputTokensPerCall
  && checkpointDigest(boundedReport.matchedLimits) === checkpointDigest(recoveryReport.matchedLimits)
  && boundedReport.emissionPolicy.sharedAcrossArms && !boundedReport.emissionPolicy.localParserChanged
  && !boundedReport.emissionPolicy.hardThinkingTokenLimit,
  "emission experiment preserves common budgets and does not claim a server-enforced thinking cap");
const parser = (source: string) => source.split("  #parseIntent(")[1].split("  #result(")[0];
check(parser(execFileSync("git", ["show", `${boundedReport.candidateCommit}:src/lib/codelab/research/nyxNemotronTheoryCognition.ts`], { encoding: "utf8" })) === parser(execFileSync("git", ["show",
  `${boundedCheckpoint.previousRuntimeReference}:src/lib/codelab/research/nyxNemotronTheoryCognition.ts`], { encoding: "utf8" })),
  "historical output repair preserved its authoritative parser; later revisions cannot rewrite that evidence");
check(boundedReport.verdict === "INCONCLUSIVE_PROVIDER_FAILURE" && boundedReport.providerBlocked
  && !boundedReport.executionBlocked && boundedReport.acceptanceViolations === 0
  && !boundedReport.broadPromotion && !boundedReport.defaultPolicyChanged
  && !boundedCheckpoint.authorityIncrease && !boundedCheckpoint.capabilityImprovementDemonstrated
  && !boundedCheckpoint.certifiesCurrentRuntime && boundedControl.sourceRepositoryUnchanged,
  "infrastructure work and preserved trust remain supporting progress, not frontier capability certification");

check(NYX_COVERAGE_TRANSFER_V3_TASKS.length === 3 && NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST
  === theoryDigest(NYX_COVERAGE_TRANSFER_V3_TASKS.map(task => task.oracleDigest))
  && NYX_COVERAGE_TRANSFER_V3_TASKS.every(task => ![...NYX_COVERAGE_TRANSFER_V2_TASKS, ...NYX_COVERAGE_TRANSFER_TASKS]
    .some(previous => task.taskId === previous.taskId || task.oracleDigest === previous.oracleDigest)),
"fresh contract-recovery corpus is frozen independently of previously observed answers");
for (const task of NYX_COVERAGE_TRANSFER_V3_TASKS) {
  const objective = task.objective(candidate, 1_000);
  check(validResearchObjective(objective, 1_000) && !JSON.stringify(objective).includes(task.oracleDigest),
    "fresh objective carries neither selected implementation nor manual hidden oracle");
  for (const experiment of objective.experimentCatalog) {
    const observed = run(task.probeSource, experiment.toolId);
    check(observed === task.outcome(experiment.experimentId) && experiment.possibleOutcomes.includes(observed),
      "fresh executable observation agrees with the independently represented exact acceptance oracle");
  }
  const mutant = task.taskId.endsWith("EVENTLOG") ? task.probeSource.replace("event[1]>selected[1]", "event[1]>=selected[1]")
    : task.taskId.endsWith("QUOTIENT") ? task.probeSource.replace("Math.round", "Math.trunc")
      : task.probeSource.replace("[1,0]", "[0,1]");
  check(mutant !== task.probeSource && objective.experimentCatalog.some(experiment =>
    run(mutant, experiment.toolId) !== task.outcome(experiment.experimentId)),
  "unchanged independent outcomes reject tie, rounding, and ordering mutants instead of certifying their own implementation");
}
const custodyRoot = "scripts/omega/checkpoints/prediction-custody/";
const custodyCheckpoint = JSON.parse(readFileSync(`${custodyRoot}checkpoint.json`, "utf8"));
const custodyReport = JSON.parse(readFileSync(`${custodyRoot}comparison.json`, "utf8"));
check(checkpointDigest(custodyReport) === custodyCheckpoint.canonicalReportSha256
  && custodyReport.candidateCommit === "f68d0158e860c94ba4fd88e63e9a5b9d0e523cbd"
  && custodyReport.candidateCommit === custodyCheckpoint.candidateCommit,
"custody recovery archive binds the exact partial E4 report to its exercised candidate, not later repairs");
for (const [path, expected] of Object.entries(custodyCheckpoint.candidateSourceDigests)) {
  check(/^(?:src|scripts|\.github\/workflows)\/[A-Za-z0-9_./-]+\.(?:ts|mjs|yml)$/.test(path)
    && !path.split("/").includes(".."), "reconstruction reads only bounded enumerated source paths");
  const source = execFileSync("git", ["show", `${custodyReport.candidateCommit}:${path}`], { encoding: "utf8", timeout: 10_000 });
  check(createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex") === expected,
    "custody recovery reproduces actual model, executor, assurance, and one-time dispatch sources");
}
check(custodyReport.corpusDigest === NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST && custodyReport.completedArms === 4
  && custodyReport.requestedArms === 6 && custodyCheckpoint.missingArms.length === 1
  && custodyCheckpoint.missingArms[0].policies.length === 2,
"two science arms remain explicitly unexecuted rather than converted into success or reasoning failure");
check(custodyReport.records.filter((record: { assurance: { decision: string } }) => record.assurance.decision === "ACCEPT").length === 2
  && custodyCheckpoint.acceptedArms === 2 && custodyReport.records.every((record: { sourceRepositoryUnchanged: boolean; authorityGranted: boolean }) =>
    record.sourceRepositoryUnchanged && !record.authorityGranted) && custodyReport.acceptanceViolations === 0,
"two independently oracle-accepted development successes preserve their narrow scope and all negative boundaries");
const quotient = custodyReport.records.find((record: { taskId: string; policy: string }) =>
  record.taskId === "NYX-TRANSFER-QUOTIENT" && record.policy === "ROTATING_PARTITION");
check(quotient.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 1 && quotient.cognitionOutcomeCounts.PROVIDER_FAILURE === 0
  && quotient.cognitionOutcomeCounts.MODEL_OUTPUT_REJECTION === 0 && quotient.resourceUsage.totalTokens === 28725
  && quotient.assurance.decision === "INSUFFICIENT_EVIDENCE",
"one delivery truncation and a valid-output exploration failure remain distinct with fully measured tokens in that arm");
check(quotient.forecastAudit.filter((claim: { role: string }) => claim.role === "REVISER").every((claim: { mechanismId: string }) =>
  claim.mechanismId === "TOWARD_ZERO") && quotient.hypothesisAllocations.filter((allocation: { phaseOrdinal: number }) =>
    allocation.phaseOrdinal === 1).every((allocation: { theoryId: string; cohortTheoryIds: string[]; preferredMechanismIds: string[] }) =>
      allocation.cohortTheoryIds.length === 3 && !allocation.preferredMechanismIds.includes("NEAREST")),
"the historical missing repair slot is preserved; corrected scheduling must not retroactively recertify the failed run");
const stopped = custodyReport.records.at(-1);
check(stopped.decision.reason === "research_party_provider_unavailable" && stopped.resourceUsage.modelCalls === 2
  && stopped.resourceUsage.experiments === 0 && stopped.cognitionOutcomes.at(-1).reason === "nvidia_provider_http_503"
  && stopped.resourceUsage.totalTokens === null && custodyReport.verdict === "INCONCLUSIVE_PROVIDER_FAILURE",
"bounded provider exhaustion terminates the epoch without pretending that failed attempt compute is known");
check(custodyReport.records.reduce((sum: number, record: { cognitionEvidence: { totalTokens: number | null }[] }) =>
  sum + record.cognitionEvidence.reduce((subtotal, item) => subtotal + (item.totalTokens ?? 0), 0), 0) === 65575
  && custodyCheckpoint.resourceSummary.reportedTokenLowerBound === 65575
  && custodyCheckpoint.resourceSummary.logicalModelCalls === 19 && custodyCheckpoint.resourceSummary.httpAttempts === 25,
"call count, HTTP attempts, reported lower-bound tokens, and unknown complete consumption are separate accounting facts");
check(checkpointDigest(analyzeCoverageTransfer(custodyReport.selectedTaskIds, custodyReport.records))
  === checkpointDigest(custodyReport.pairedAnalysis) && custodyReport.pairedAnalysis.computeComparableWins === 0
  && !custodyReport.realizedComputeMatched && !custodyCheckpoint.result.capabilityImprovementDemonstrated
  && !custodyCheckpoint.result.certifiesCurrentRuntime && !custodyCheckpoint.result.broadPromotion,
"positive instances and E3 repairs cannot fabricate a matched-compute gain or certify a later runtime");
check(custodyCheckpoint.planCoverage.status === "PARTIAL / JUST-IN-TIME"
  && custodyCheckpoint.safeguards.manualOnlyLiveWorkflowRestored && !custodyCheckpoint.safeguards.acceptanceOracleWeakened,
"available plan alignment and preserved trust are recorded without claiming complete corpus coverage");
const answerDiagnosis = JSON.parse(readFileSync("scripts/omega/checkpoints/answer-configuration/diagnosis.json", "utf8"));
check(checkpointDigest(answerDiagnosis) === "46cdbde90f5260a21165cf8e4ce6ff3882e398011970d1559330dc7fcc1936ab",
  "configuration evidence binds immutable sanitized failed attempts and successful probe controls");
check(answerDiagnosis.earliestAttempt.taskArmsAttempted === 0 && answerDiagnosis.earliestAttempt.smokeStatus === 503,
  "an unavailable smoke check is not an executed task or a reasoning failure");
for (const entry of [answerDiagnosis.topLevelBudget, answerDiagnosis.templateBudget]) {
  const report = entry.report;
  const arm = report.records[0];
  check(report.requestedArms === 6 && report.completedArms === 1 && report.verdict === "INCONCLUSIVE_PROVIDER_FAILURE"
    && report.corpusDigest === NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST,
  "both rejected request placements retain the frozen corpus and five unexecuted arms");
  check(arm.resourceUsage.modelCalls === 1 && arm.resourceUsage.experiments === 0
    && arm.cognitionEvidence[0].statusCode === 400 && arm.cognitionEvidence[0].totalTokens === null
    && arm.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 0 && arm.cognitionOutcomeCounts.CONTRIBUTION === 0,
  "HTTP 400 before useful inference is configuration rejection, not failed hidden reasoning or zero-cost success");
  check(arm.sourceRepositoryUnchanged && !arm.authorityGranted && !report.broadPromotion
    && !report.realizedComputeMatched && report.acceptanceViolations === 0,
  "a failed configuration experiment cannot bypass preserved authority or establish a compute-matched gain");
}
const controls = answerDiagnosis.threeSettingProbe.report;
check(controls.records.map((item: { variant: string }) => item.variant).join() === "MEDIUM_REASONING,BUDGETED_REASONING,DIRECT_JSON"
  && controls.records.map((item: { evidence: { statusCode: number } }) => item.evidence.statusCode).join() === "200,400,200",
  "the actual hosted probe isolates an unsupported budget from a dead endpoint or absent credential");
check(controls.records[0].exactSyntheticAnswer && controls.records[2].exactSyntheticAnswer
  && controls.maximumModelCalls === 3 && controls.maxOutputTokensPerCall === 1536
  && !controls.capabilityPromotion && !controls.rawContentPersisted && !controls.authorityIncrease,
  "synthetic response compatibility establishes neither task intelligence nor increased authority");
check(answerDiagnosis.interpretation.reasoningBudgetOnThisHostedEndpoint === "REJECTED_HTTP_400"
  && !answerDiagnosis.interpretation.defaultPromoted && !answerDiagnosis.interpretation.oracleWeakened,
  "an opt-in transport setting stays experimentally rejected rather than falsely promoted");
const directEmission = JSON.parse(readFileSync("scripts/omega/checkpoints/direct-emission/comparison.json", "utf8"));
check(checkpointDigest(directEmission) === "f8a48f411d3628596d45e976a06d5fb6bb09ed5c7efc36a17839455475f5e671",
  "direct-emission archive preserves both real failed attempts without rewriting historical evidence");
check(directEmission.candidateCommit === "e4f642c272ad159882aaa913e6ba1d64bd59dacc"
  && directEmission.runs.length === 2 && directEmission.runs[0].jobId === 110883250442
  && directEmission.runs[1].jobId === 110888280889 && directEmission.runs.every((run: { runId: number }) => run.runId === 37020856344),
  "one candidate and one controlled rerun retain exact hosted execution identities");
for (const [path, expected] of Object.entries(directEmission.candidateSourceDigests)) {
  check(/^(?:src|scripts|\.github\/workflows)\/[A-Za-z0-9_./-]+\.(?:ts|mjs|yml)$/.test(path)
    && !path.split("/").includes(".."), "direct-emission reconstruction is limited to enumerated implementation and evaluator sources");
  const source = execFileSync("git", ["show", `${directEmission.candidateCommit}:${path}`], { encoding: "utf8", timeout: 10_000 });
  check(createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex") === expected,
    "model adapter, executor, independent oracle, and dispatched workflow remain bound to the actual candidate");
}
const directReports = directEmission.runs.map((run: { report: typeof custodyReport }) => run.report);
for (const report of directReports) {
  const arm = report.records[0];
  check(report.candidateCommit === directEmission.candidateCommit && report.corpusDigest === NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST
    && report.requestedArms === 6 && report.completedArms === 1 && report.records.length === 1,
    "both attempts preserve five genuinely unexecuted arms, not hidden successful or failed task scores");
  check(report.emissionPolicy.emissionMode === "CONSTRAINED_JSON" && report.emissionPolicy.sharedAcrossArms
    && report.emissionPolicy.requestedThinkingBudgetTokens === null && !report.emissionPolicy.outputTokenCeilingChanged
    && checkpointDigest(report.matchedLimits) === checkpointDigest(directReports[0].matchedLimits),
    "both attempts use the explicitly supported emission configuration with unchanged common resource ceilings");
  check(arm.cognitionOutcomeCounts.PROVIDER_FAILURE === 1 && arm.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 0
    && arm.cognitionOutcomeCounts.MODEL_OUTPUT_REJECTION === 0 && arm.resourceUsage.totalTokens === null
    && report.verdict === "INCONCLUSIVE_PROVIDER_FAILURE" && report.providerBlocked && !report.executionBlocked,
    "delivery timeout and 503 remain separate from malformed output, truncation, and demonstrated reasoning failure");
  check(checkpointDigest(analyzeCoverageTransfer(report.selectedTaskIds, report.records)) === checkpointDigest(report.pairedAnalysis)
    && report.pairedAnalysis.completePairs === 0 && !report.realizedComputeMatched && !report.broadPromotion
    && report.acceptanceViolations === 0 && arm.sourceRepositoryUnchanged && !arm.authorityGranted,
    "partial E4 observations cannot establish matched-compute gains or grant authority");
}
const firstDirect = directReports[0].records[0];
check(firstDirect.cognitionOutcomeCounts.CONTRIBUTION === 4 && firstDirect.resourceUsage.experiments === 3
  && firstDirect.resourceUsage.modelCalls === 5 && firstDirect.transport.httpAttempts === 9
  && firstDirect.transport.timedOutAttempts === 3 && firstDirect.transport.capacityWaitMs === 240004
  && firstDirect.assurance.decision === "REJECT" && firstDirect.assurance.findings.includes("EVIDENCE_CHAIN_INCOMPLETE"),
  "real useful contributions and local experiments do not override the missing review and rejected evidence chain");
check(firstDirect.cognitionEvidence.reduce((sum: number, item: { totalTokens: number | null }) => sum + (item.totalTokens ?? 0), 0) === 11473
  && directEmission.interpretation.firstAttempt.reportedTokenLowerBound === 11473,
  "delivered tokens form only a measured lower bound when timeout consumption is unknown");
const repeatDirect = directReports[1].records[0];
check(repeatDirect.cognitionOutcomeCounts.CONTRIBUTION === 0 && repeatDirect.resourceUsage.experiments === 0
  && repeatDirect.resourceUsage.modelCalls === 1 && repeatDirect.transport.httpAttempts === 2
  && repeatDirect.cognitionEvidence[0].statusCode === 503 && repeatDirect.transport.timedOutAttempts === 0,
  "one bounded rerun exhausts provider recovery before any useful task work, rather than fabricating capability evidence");
check(!directEmission.interpretation.capabilityImprovementDemonstrated && !directEmission.interpretation.certifiesCurrentRuntime
  && !directEmission.interpretation.defaultPromoted && !directEmission.interpretation.truncationReductionCausallyEstablished
  && directEmission.planCoverage.status === "PARTIAL / JUST-IN-TIME",
  "supporting reliability progress preserves honest maturity and incomplete corpus coverage");
const phaseComparison = JSON.parse(readFileSync("scripts/omega/checkpoints/phase-scheduling/comparison.json", "utf8"));
check(checkpointDigest(phaseComparison) === "9cb9b6909ac375acf585550e96551e3666b723c1e67e08233b8f6cdc96531404"
  && phaseComparison.integrityClassification === "SELF_CONTAINED_HASH_MANIFEST_NOT_SIGNED_CUSTODY",
  "stable comparison retains its complete sanitized report without claiming signed custody");
check(phaseComparison.candidateCommit === "84aad2995385cb72badbf1aea078bf8487aded5a"
  && phaseComparison.runId === 37057265859 && phaseComparison.jobId === 111004911993,
  "stable observations are bound to the exact evaluated source and actual hosted execution");
for (const [path, expected] of Object.entries(phaseComparison.candidateSourceDigests)) {
  check(/^(?:src|scripts|\.github\/workflows)\/[A-Za-z0-9_./-]+\.(?:ts|mjs|yml)$/.test(path)
    && !path.split("/").includes(".."), "stable comparison source reconstruction uses only enumerated non-secret paths");
  const source = execFileSync("git", ["show", `${phaseComparison.candidateCommit}:${path}`], { encoding: "utf8", timeout: 10_000 });
  check(createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex") === expected,
    "stable comparison preserves implementation, evaluator and workflow identities rather than certifying changed code");
}
const phaseReport = phaseComparison.report;
check(phaseReport.candidateCommit === phaseComparison.candidateCommit
  && phaseReport.corpusDigest === NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST
  && phaseReport.completedArms === 6 && phaseReport.requestedArms === 6
  && !phaseReport.providerBlocked && !phaseReport.executionBlocked,
  "all requested arms actually ran with a functioning provider and experiment substrate");
check(phaseReport.records.every((arm: typeof firstDirect) => arm.providerFailures === 0
  && arm.transport.httpAttempts === arm.resourceUsage.modelCalls
  && arm.cognitionOutcomeCounts.OUTPUT_TRUNCATION === 0 && arm.evidenceChainComplete
  && arm.sourceRepositoryUnchanged && !arm.authorityGranted),
  "stable reasoning failures are not relabeled as delivery failures or increased authority");
check(phaseReport.records.reduce((sum: number, arm: typeof firstDirect) => sum + arm.resourceUsage.modelCalls, 0) === 37
  && phaseReport.records.reduce((sum: number, arm: typeof firstDirect) => sum + arm.resourceUsage.totalTokens, 0) === 155601
  && phaseReport.records.filter((arm: typeof firstDirect) => arm.assurance.decision === "ACCEPT"
    && arm.policy === "DERIVATION_ONLY").length === 2
  && phaseReport.records.filter((arm: typeof firstDirect) => arm.assurance.decision === "ACCEPT"
    && arm.policy === "ROTATING_PARTITION").length === 1,
  "actual compute and unfavorable candidate outcomes survive archival rather than selective reporting");
check(checkpointDigest(analyzeCoverageTransfer(phaseReport.selectedTaskIds, phaseReport.records))
  === checkpointDigest(phaseReport.pairedAnalysis)
  && phaseReport.pairedAnalysis.wins === 0 && phaseReport.pairedAnalysis.losses === 1
  && phaseReport.pairedAnalysis.completePairs === 3 && !phaseReport.realizedComputeMatched
  && phaseReport.acceptanceViolations === 0,
  "independent paired analysis reproduces no gain and unequal realized compute without weakening the oracle");
check(!phaseComparison.interpretation.reasoningGainDemonstrated
  && !phaseComparison.interpretation.allocationPolicyPromoted && !phaseComparison.interpretation.certifiesCurrentRuntime
  && !phaseReport.broadPromotion && !phaseReport.freshHeldoutClaim
  && phaseComparison.planCoverage.status === "PARTIAL / JUST-IN-TIME",
  "complete infrastructure execution is not converted into cognition, held-out or broad frontier certification");
console.log(`NYX_EXECUTABLE_TRANSFER_PREFLIGHT ${JSON.stringify({ schemaVersion: 1,
  corpusDigest: NYX_RESEARCH_TRANSFER_CORPUS_DIGEST, actualCognition: "NOT_EXECUTED",
  oracleMutantsRejected: 3, evidenceClass: "E3", broadPromotion: false, authorityGranted: false })}`);
console.log(`OMEGA_RESEARCH_EXECUTABLE_TRANSFER_TEST_SUMMARY passed: ${checks}, failed: 0`);
