import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { sourceSchema, campaignSchema, armSchema, usageSchema, jsonValue, type Family } from "./benchmarks/contracts";
import { prepareTask, TaskExposureHistory, type Exposure } from "./benchmarks/tasks";
import { exportPrediction } from "./benchmarks/officialFormats";
import { runCampaign, type BenchmarkAdapter } from "./benchmarks/campaign";

function readJson(path: string): unknown {
  if (!path || statSync(path).size > 20_000_000 || !statSync(path).isFile()) throw Error("benchmark_input_file_required_or_too_large");
  return jsonValue(JSON.parse(readFileSync(path, "utf8")), 20_000_000);
}
function option(name: string): string {
  const args = process.argv.slice(3); const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw Error("benchmark_required_option");
  return args[index + 1];
}
const taskInput = z.object({ family: z.enum(["SWE_BENCH", "TERMINAL_BENCH", "ARC_AGI", "HLE", "FRONTIER_MATH"]),
  taskId: z.string(), tier: z.enum(["DEVELOPMENT", "VALIDATION", "SEALED"]), source: sourceSchema,
  record: z.unknown() }).strict();
function prepared(value: unknown) {
  const t = taskInput.parse(value); return prepareTask(t.family as Family, t.taskId, t.tier, t.source, t.record);
}
async function main() {
  const command = process.argv[2] ?? "help";
  if (["help", "--help"].includes(command)) {
    console.log("NYX benchmark data harness — no model, terminal, deployment or network authority\n"
      + "  score-arc --task <task-envelope.json> --prediction <grids.json>\n"
      + "  export-prediction --task <task-envelope.json> --artifact <artifact.json> --model <model-id>\n"
      + "  replay --campaign <frozen-spec.json> --tasks <envelopes.json> --transcripts <arms.json> --reports <reports.json> [--exposure <history.json>]\n"
      + "Replay imports recorded inference; it does not perform live inference or certify custody.\n"
      + "Task envelope: {family,taskId,tier,source:{dataset,revision,contentDigest,visibility,kind,provenance},record}.\n"
      + "contentDigest = SHA256 of recursively key-sorted JSON, via existing theoryDigest.\n"
      + "Private task envelopes/oracles must stay outside model inputs and outside the tracked repository.");
    return;
  }
  if (command === "score-arc") {
    const task = prepared(readJson(option("--task")));
    if (!task.scoreArc) throw Error("benchmark_arc_task_required");
    console.log(JSON.stringify({ executionMode: "IMPORTED_PREDICTION_LOCAL_EXACT_SCORING",
      task: task.manifest, result: task.scoreArc(readJson(option("--prediction"))), officialLeaderboardClaim: false }, null, 2));
    return;
  }
  if (command === "export-prediction") {
    console.log(JSON.stringify(exportPrediction(prepared(readJson(option("--task"))),
      readJson(option("--artifact")), option("--model"))));
    return;
  }
  if (command !== "replay") throw Error("benchmark_unknown_command");
  const spec = campaignSchema.parse(readJson(option("--campaign")));
  const tasks = z.array(taskInput).parse(readJson(option("--tasks"))).map(prepared);
  const transcripts = z.array(z.object({ spec: armSchema, records: z.array(z.object({ inputDigest: z.string(),
    attempt: z.number().int().positive(), output: z.unknown() }).strict()) }).strict()).parse(readJson(option("--transcripts")));
  if (transcripts.some(t => t.spec.inferenceMode !== "IMPORTED_TRANSCRIPT")) throw Error("benchmark_replay_is_not_live_inference");
  const history = process.argv.includes("--exposure")
    ? new TaskExposureHistory(readJson(option("--exposure")) as Exposure[]) : new TaskExposureHistory();
  const seen = new Set<string>();
  let replayClock = spec.frozenAtEpochMs;
  const adapters: BenchmarkAdapter[] = transcripts.map(t => ({ spec: t.spec, invoke: async request => {
    const key = `${t.spec.arm}:${request.inputDigest}:${request.attempt}`;
    const matches = t.records.filter(r => r.inputDigest === request.inputDigest && r.attempt === request.attempt);
    if (seen.has(key) || matches.length !== 1) throw Error("benchmark_ambiguous_or_missing_transcript");
    seen.add(key);
    const output = matches[0].output as Awaited<ReturnType<BenchmarkAdapter["invoke"]>>;
    if (Number.isSafeInteger(output?.usage?.wallClockMs) && output.usage.wallClockMs >= 0) replayClock += output.usage.wallClockMs;
    return output;
  } }));
  const reports = z.record(z.object({ receipt: z.unknown(), report: z.unknown(), usage: usageSchema.nullable().optional() }).strict()).parse(readJson(option("--reports")));
  const report = await runCampaign(spec, tasks, adapters, { version: spec.verifierVersion,
    sourceDigest: spec.verifierSourceDigest, evaluate: async (_task, _artifact, context) => {
      if (!reports[context.evaluationRunId]) throw Error("benchmark_independent_report_missing");
      const supplied = reports[context.evaluationRunId];
      return { receipt: supplied.receipt, report: supplied.report, usage: supplied.usage };
    } }, history, () => replayClock);
  const body = { executionMode: "IMPORTED_TRANSCRIPT_REPLAY_NOT_LIVE_INFERENCE", report,
    custody: "CALLER_ATTESTED_NOT_AUTHENTICATED", liveModelExecuted: false, wallClockSource: "IMPORTED_NOT_NEWLY_OBSERVED" };
  console.log(JSON.stringify({ ...body, replayDigest: theoryDigest(body) }, null, 2));
}
main().catch(() => { console.error("NYX_BENCHMARK_INPUT_OR_CONTRACT_REJECTED; raw inputs and secrets are not logged"); process.exitCode = 1; });
