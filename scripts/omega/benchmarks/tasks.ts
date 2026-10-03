import { z } from "zod";
import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import { sourceSchema, jsonValue, type Family, type TaskManifest, type TaskSource, type Tier, type Evaluation } from "./contracts";

const grid = z.array(z.array(z.number().int().min(0).max(9)).min(1).max(30)).min(1).max(30)
  .refine(rows => rows.every(row => row.length === rows[0].length), "ragged_grid");
const pair = z.object({ input: grid, output: grid }).strict();
const arcTask = z.object({ train: z.array(pair).min(1).max(100), test: z.array(pair).min(1).max(100) }).strict();
export const arcPredictionSchema = z.array(z.object({ attempt_1: grid, attempt_2: grid }).strict()).min(1).max(100);
const text = z.string().min(1).max(500_000);
export interface PreparedTask {
  readonly manifest: TaskManifest;
  readonly input: Readonly<Record<string, unknown>>;
  /** Private expected values are captured in this closure, not exposed to the cognition adapter. */
  readonly scoreArc: ((artifact: unknown) => Evaluation) | null;
}

export function prepareTask(family: Family, taskId: string, tier: Tier,
  source: TaskSource, raw: unknown): PreparedTask {
  const checkedSource = sourceSchema.parse(source);
  if (!taskId.trim() || taskId.length > 200 || !["DEVELOPMENT", "VALIDATION", "SEALED"].includes(tier))
    throw Error("benchmark_task_identity");
  const body = jsonValue(raw) as Record<string, unknown>;
  if (checkedSource.contentDigest !== theoryDigest(body)) throw Error("benchmark_source_digest");
  if (checkedSource.kind !== "DATASET_TASK" && tier !== "DEVELOPMENT") throw Error("benchmark_sample_not_sealed");
  if (tier === "SEALED" && !["PROTECTED", "INDEPENDENT_PRIVATE"].includes(checkedSource.visibility))
    throw Error("benchmark_public_not_sealed");
  let input: Record<string, unknown>; let oracle: unknown; let capabilities: string[];
  let scoreArc: PreparedTask["scoreArc"] = null;
  switch (family) {
    case "ARC_AGI": {
      const task = arcTask.parse(body);
      input = { train: task.train, test: task.test.map(item => ({ input: item.input })) };
      oracle = task.test.map(item => item.output); capabilities = ["JSON_GRID_OUTPUT"];
      const expected = immutableTheoryValue(task.test.map(item => item.output));
      scoreArc = artifact => {
        const predictions = arcPredictionSchema.parse(jsonValue(artifact));
        if (predictions.length !== expected.length) throw Error("benchmark_arc_prediction_count");
        const correct = predictions.filter((p, index) =>
          theoryDigest(p.attempt_1) === theoryDigest(expected[index]) || theoryDigest(p.attempt_2) === theoryDigest(expected[index])).length;
        return immutableTheoryValue({ state: correct === expected.length ? "PASS" : "FAIL", correct,
          total: expected.length, quality: "NOT_APPLICABLE", metric: "ARC_EXACT_TWO_PREDICTIONS_PER_TEST_OUTPUT",
          evidenceDigest: theoryDigest({ predictions, expected }), confidence: null });
      };
      break;
    }
    case "SWE_BENCH": {
      const task = z.object({ instance_id: text, repo: text, base_commit: z.string().regex(/^[a-f0-9]{40}$/),
        problem_statement: text }).passthrough().parse(body);
      if (task.instance_id !== taskId) throw Error("benchmark_swe_task_identity");
      // Intentionally excludes gold patch, test_patch, FAIL_TO_PASS, PASS_TO_PASS, hints and all arbitrary fields.
      input = { repo: task.repo, base_commit: task.base_commit, problem_statement: task.problem_statement };
      oracle = { base: task.base_commit, test_patch: body.test_patch ?? null,
        FAIL_TO_PASS: body.FAIL_TO_PASS ?? null, PASS_TO_PASS: body.PASS_TO_PASS ?? null };
      capabilities = ["READ_DISPOSABLE_REPOSITORY", "PROPOSE_PATCH", "ISOLATED_OFFICIAL_DOCKER_VERIFIER"];
      break;
    }
    case "TERMINAL_BENCH": {
      const task = z.object({ task_name: text, instruction: text, task_checksum: text }).passthrough().parse(body);
      if (task.task_name !== taskId) throw Error("benchmark_terminal_task_identity");
      input = { instruction: task.instruction };
      oracle = { task_checksum: task.task_checksum };
      capabilities = ["HARBOR_ISOLATED_AGENT", "HARBOR_INDEPENDENT_VERIFIER"];
      break;
    }
    case "HLE": {
      const task = z.object({ id: text, question: text, image: z.string().max(2_000_000), answer: text }).passthrough().parse(body);
      if (task.id !== taskId) throw Error("benchmark_hle_task_identity");
      input = { question: task.question, image: task.image };
      oracle = task.answer; capabilities = ["TEXT_ANSWER", "INDEPENDENT_HLE_JUDGE"];
      if (task.image) capabilities.push("AUTHORIZED_MULTIMODAL_INPUT");
      break;
    }
    case "FRONTIER_MATH": {
      const task = z.object({ problem: text }).passthrough().parse(body);
      input = { problem: task.problem }; oracle = body.answer ?? null;
      capabilities = ["TEXT_ANSWER", "AUTHORIZED_FRONTIERMATH_VERIFIER"];
      break;
    }
    default: throw Error("benchmark_unsupported_family");
  }
  const manifestBody = { schemaVersion: 1 as const, taskId, family, tier, source: checkedSource,
    inputDigest: theoryDigest(input), privateOracleDigest: theoryDigest(oracle), requiredCapabilities: capabilities };
  const manifest = immutableTheoryValue({ ...manifestBody, taskDigest: theoryDigest(manifestBody) });
  // Do not structuredClone the scorer closure; it remains evaluator-only.
  return Object.freeze({ manifest, input: immutableTheoryValue(input), scoreArc });
}

export interface Exposure { readonly inputDigest: string; readonly purpose: "DEVELOPMENT" | "DESIGN_INFLUENCE";
  readonly evidenceDigest: string; }
/** Append-only caller-owned exposure history; retirement cannot be undone by replacing a tier label. */
export class TaskExposureHistory {
  readonly #events: Exposure[] = [];
  constructor(previous: readonly Exposure[] = []) {
    const events = z.array(z.object({ inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      purpose: z.enum(["DEVELOPMENT", "DESIGN_INFLUENCE"]), evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
      .max(100000).parse(jsonValue(previous, 20_000_000));
    this.#events.push(...immutableTheoryValue(events.map(event => ({ inputDigest: event.inputDigest,
      purpose: event.purpose, evidenceDigest: event.evidenceDigest }))));
  }
  record(task: TaskManifest, purpose: Exposure["purpose"], evidence: unknown): void {
    if (!["DEVELOPMENT", "DESIGN_INFLUENCE"].includes(purpose)) throw Error("benchmark_exposure_kind");
    this.#events.push(immutableTheoryValue({ inputDigest: task.inputDigest, purpose,
      evidenceDigest: theoryDigest(jsonValue(evidence)) }));
  }
  eligible(task: TaskManifest): boolean {
    return task.tier === "DEVELOPMENT" || !this.#events.some(event => event.inputDigest === task.inputDigest);
  }
  snapshot(): readonly Exposure[] { return immutableTheoryValue(this.#events); }
}
