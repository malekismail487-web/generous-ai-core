import { Script, createContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { validResearchObjective } from "../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NYX_RESEARCH_TRANSFER_TASKS, NYX_RESEARCH_TRANSFER_CORPUS_DIGEST } from "./omega/nyx-research-transfer-fixtures";

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
for (const override of [
  { OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: "UNKNOWN-TASK" },
  { OMEGA_NYX_RESEARCH_CORPUS: "LEGACY" },
  { OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "1" },
]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import",
    "./scripts/w0rs/register-typescript-loader.mjs", "scripts/omega/nyx-research-party-live-eval.ts"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, NVIDIA_API_KEY: "synthetic-test-only",
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NYX_RESEARCH_POLICY_COMPARISON: "1",
      OMEGA_NYX_RESEARCH_DIAGNOSTIC_ONLY: "0", OMEGA_NYX_RESEARCH_CORPUS: "EXECUTABLE_TRANSFER_V1",
      OMEGA_NYX_RESEARCH_COMPARE_TASK_ID: corpus[1].taskId, ...override },
  });
  check(result.status !== 0 && /research_(focused_task|corpus)_selection_invalid/.test(result.stderr),
    "invalid focused selection fails before provider construction or network dispatch");
  check(result.stdout === "" && !result.stderr.includes("synthetic-test-only"),
    "rejected selection neither emits a model result nor discloses credential injection");
}
for (const task of corpus) {
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
  catch (error) { check(String(error).includes("transfer_unknown_experiment"), `${task.taskId}: oracle refuses unknown identity`); }
  const otherTime = task.objective(candidate, 500_000);
  check(otherTime.expiryEpochMs - 500_000 === objective.expiryEpochMs - 1_000,
    `${task.taskId}: independent arms have identical validity durations`);
  const clean = (value: typeof objective) => ({ ...value, expiryEpochMs: 0,
    admittedEvidence: value.admittedEvidence.map(item => ({ ...item, observedAtEpochMs: 0 })) });
  check(theoryDigest(clean(objective)) === theoryDigest(clean(otherTime)), `${task.taskId}: timestamps do not change problem semantics`);
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
console.log(`NYX_EXECUTABLE_TRANSFER_PREFLIGHT ${JSON.stringify({ schemaVersion: 1,
  corpusDigest: NYX_RESEARCH_TRANSFER_CORPUS_DIGEST, actualCognition: "NOT_EXECUTED",
  oracleMutantsRejected: 3, evidenceClass: "E3", broadPromotion: false, authorityGranted: false })}`);
console.log(`OMEGA_RESEARCH_EXECUTABLE_TRANSFER_TEST_SUMMARY passed: ${checks}, failed: 0`);
