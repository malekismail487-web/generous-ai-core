import { z } from "zod";
import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import { ARMS, armSchema, campaignSchema, jsonValue, sumUsage, usageSchema, attemptContext,
  FAILURE_CLASSES, zeroUsage, type ArmSpec, type AttemptContext, type CampaignSpec, type Evaluation,
  type FailureClass, type Usage, type Arm } from "./contracts";
import { TaskExposureHistory, type PreparedTask } from "./tasks";
import { gradeExternalReport, type ExternalReport } from "./officialFormats";

const outputSchema = z.object({ artifact: z.unknown(), usage: usageSchema,
  // Adapter-owned trace measurements, not candidate-supplied acceptance authority.
  internalCandidateAttempts: z.number().int().nonnegative().max(1000).optional(),
  failure: z.enum(FAILURE_CLASSES).nullable(), confidence: z.number().min(0).max(1).nullable(),
  requestDigests: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(1000),
  responseDigests: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(1000),
}).strict();
export type AdapterOutput = z.infer<typeof outputSchema>;
export interface BenchmarkAdapter {
  readonly spec: ArmSpec;
  /** Real NYX adapters must compose existing NYX/Omega. A provider-only call is RAW_MODEL, not CURRENT_NYX. */
  readonly invoke: (request: { readonly input: Readonly<Record<string, unknown>>; readonly inputDigest: string;
    readonly attempt: number; readonly feedback: Readonly<{ state: string; quality: string; metric: string }> | null;
    readonly remaining: CampaignSpec["limits"]; readonly signal: AbortSignal }) => Promise<AdapterOutput>;
}
export interface TrustedEvaluator {
  readonly version: string;
  readonly sourceDigest: string;
  readonly evaluate: (task: PreparedTask, artifact: unknown, context: AttemptContext, signal: AbortSignal) => Promise<ExternalReport>;
}
export interface AttemptRecord {
  readonly internalCandidateAttempts: number | null;
  readonly attempt: number;
  readonly context: AttemptContext | null;
  readonly outcome: "ACCEPTED" | "REJECTED" | "NOT_VERIFIED" | "FAILED";
  readonly failure: FailureClass | null;
  readonly evaluation: Evaluation | null;
  readonly usage: Usage | null;
  readonly verifierUsage: Usage | null;
  readonly observedVerifierWallClockMs: number;
  readonly observedWallClockMs: number;
  readonly confidence: number | null;
  readonly requestDigests: readonly string[];
  readonly responseDigests: readonly string[];
}
export interface CampaignObservation {
  /** Stops subsequent requests, never changes an attempted candidate's verdict. */
  readonly maxConsecutiveProviderFailures?: number;
  /** Sanitized immutable records only: no candidate artifacts or hidden answers. */
  readonly onRun?: (run: TaskRun) => void | Promise<void>;
}
export interface TaskRun {
  readonly arm: Arm;
  readonly taskDigest: string;
  readonly tier: string;
  readonly state: "EXECUTED" | "BLOCKED_ENVIRONMENT" | "BLOCKED_AUTHORITY" | "RETIRED_FROM_UNBIASED_EVALUATION";
  readonly reason: string | null;
  readonly attempts: readonly AttemptRecord[];
}

/** Pair accounting only: failure before scoring is known zero scorer work, not unknown. */
export function matchedObservedAttempts(attempts: readonly AttemptRecord[], tolerance: number): boolean {
  if (attempts.length !== 2 || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.1) return false;
  if (attempts.some(a => !a || !usageSchema.safeParse(a.usage).success
    || a.verifierUsage !== null && !usageSchema.safeParse(a.verifierUsage).success)) return false;
  if (attempts.some(a => !a.usage || a.usage.physicalCalls < 1 || a.usage.unknownUsageCalls
    || a.usage.providerFailures || a.usage.retries || (a.context ? !a.verifierUsage
      || a.verifierUsage.unknownUsageCalls || a.verifierUsage.providerFailures || a.verifierUsage.retries
      : a.failure === null || a.evaluation !== null || a.verifierUsage !== null))) return false;
  return (["physicalCalls", "reportedTokens", "toolWorkUnits"] as const).every(key => {
    const values = attempts.map(a => a.usage![key] + (a.verifierUsage?.[key] ?? 0));
    return Math.max(...values) - Math.min(...values) <= Math.max(...values, 1) * tolerance;
  });
}

class Deadline extends Error {}
async function bounded<T>(body: (signal: AbortSignal) => Promise<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw new Deadline();
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new Deadline());
  }, Math.max(1, milliseconds)); });
  try { return await Promise.race([Promise.resolve().then(() => body(controller.signal)), timeout]); }
  finally { clearTimeout(timer!); controller.abort(); }
}
function withinUsage(usage: Usage, limits: CampaignSpec["limits"]): boolean {
  return usage.logicalCalls <= limits.maxCallsPerTask && usage.physicalCalls <= limits.maxCallsPerTask
    && usage.reportedTokens <= limits.maxReportedTokensPerTask && usage.toolCalls <= limits.maxToolCallsPerTask
    && usage.toolWorkUnits <= limits.maxToolWorkUnitsPerTask && usage.wallClockMs <= limits.maxWallClockMsPerTask;
}

/** Data-only experiment coordinator. It holds neither filesystem/terminal authority nor model credentials. */
export async function runCampaign(rawSpec: CampaignSpec, tasks: readonly PreparedTask[],
  adapters: readonly BenchmarkAdapter[], evaluator: TrustedEvaluator | null,
  exposure = new TaskExposureHistory(), now: () => number = Date.now, observation: CampaignObservation = {}) {
  const stopAfter = observation.maxConsecutiveProviderFailures ?? null;
  if (stopAfter !== null && (!Number.isInteger(stopAfter) || stopAfter < 1 || stopAfter > 10))
    throw Error("benchmark_provider_circuit_threshold");
  let consecutiveProviderFailures = 0;
  const spec = immutableTheoryValue(campaignSchema.parse(jsonValue(rawSpec)));
  if (spec.frozenAtEpochMs > now() || now() >= spec.expiresAtEpochMs) throw Error("benchmark_campaign_expired_or_not_frozen");
  if (theoryDigest(tasks.map(task => task.manifest.taskDigest)) !== theoryDigest(spec.taskDigests))
    throw Error("benchmark_frozen_task_population");
  if (new Set(tasks.map(task => task.manifest.inputDigest)).size !== tasks.length)
    throw Error("benchmark_duplicate_input_population");
  if (adapters.length > ARMS.length || new Set(adapters.map(adapter => adapter.spec.arm)).size !== adapters.length)
    throw Error("benchmark_duplicate_arm");
  const armSpecs = adapters.map(adapter => immutableTheoryValue(armSchema.parse(jsonValue(adapter.spec))));
  for (const arm of armSpecs) {
    if (arm.model !== spec.model || arm.modelConfigDigest !== spec.modelConfigDigest || arm.authorityDigest !== spec.authorityDigest
      || (arm.arm !== "RAW_MODEL" && arm.toolEnvelopeDigest !== spec.toolEnvelopeDigest)) throw Error("benchmark_unmatched_conditions");
    if (arm.sourceDigest === spec.verifierSourceDigest) throw Error("benchmark_candidate_cannot_be_its_verifier");
  }
  if (evaluator && (evaluator.version !== spec.verifierVersion || evaluator.sourceDigest !== spec.verifierSourceDigest))
    throw Error("benchmark_evaluator_version");
  const began = now(); const deadline = Math.min(spec.expiresAtEpochMs, began + spec.limits.maxWallClockMs);
  const runs: TaskRun[] = [];
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const task = tasks[taskIndex];
    // Balanced fixed order; failures do not selectively remove inconvenient tasks.
    for (let armOffset = 0; armOffset < ARMS.length; armOffset++) {
      const arm = ARMS[(taskIndex + armOffset) % ARMS.length];
      const adapterIndex = adapters.findIndex(adapter => adapter.spec.arm === arm);
      const adapter = adapters[adapterIndex]; const armSpec = armSpecs[adapterIndex];
      let reason: string | null = null; let state: TaskRun["state"] = "EXECUTED";
      if (!exposure.eligible(task.manifest)) { state = "RETIRED_FROM_UNBIASED_EVALUATION"; reason = "TASK_INFLUENCED_DESIGN"; }
      else if (!adapter) { state = "BLOCKED_ENVIRONMENT"; reason = "ACTUAL_ARM_ADAPTER_NOT_INSTALLED"; }
      else if (task.manifest.requiredCapabilities.some(capability => !armSpec.supportedCapabilities.includes(capability))) {
        state = "BLOCKED_AUTHORITY"; reason = "REQUIRED_CAPABILITY_UNAVAILABLE";
      } else if (!task.scoreArc && !evaluator) { state = "BLOCKED_ENVIRONMENT"; reason = "INDEPENDENT_VERIFIER_UNAVAILABLE"; }
      else if (stopAfter !== null && consecutiveProviderFailures >= stopAfter) {
        state = "BLOCKED_ENVIRONMENT"; reason = "PROVIDER_FAILURE_CIRCUIT_OPEN";
      }
      else if (now() >= deadline) { state = "BLOCKED_ENVIRONMENT"; reason = "CAMPAIGN_DEADLINE"; }
      const attempts: AttemptRecord[] = [];
      if (state === "EXECUTED") {
        const taskBegan = now();
        const taskDeadline = Math.min(deadline, taskBegan + spec.limits.maxWallClockMsPerTask);
        let feedback: { state: string; quality: string; metric: string } | null = null;
        const maxAttempts = task.manifest.tier === "SEALED" ? 1 : spec.limits.maxAttemptsPerTask;
        for (let attempt = 1; attempt <= maxAttempts && now() < taskDeadline; attempt++) {
          const started = now(); const usageBefore = sumUsage(attempts.flatMap(item => item.usage ? [item.usage] : []));
          const remaining = { ...spec.limits, maxCallsPerTask: spec.limits.maxCallsPerTask - usageBefore.physicalCalls,
            maxReportedTokensPerTask: spec.limits.maxReportedTokensPerTask - usageBefore.reportedTokens,
            maxToolCallsPerTask: spec.limits.maxToolCallsPerTask - usageBefore.toolCalls,
            maxToolWorkUnitsPerTask: spec.limits.maxToolWorkUnitsPerTask - usageBefore.toolWorkUnits,
            maxWallClockMsPerTask: Math.max(0, taskDeadline - now()) };
          if (remaining.maxCallsPerTask <= 0 || remaining.maxReportedTokensPerTask <= 0) break;
          let output: AdapterOutput | null = null; let context: AttemptContext | null = null;
          let observedUsage: Usage | null = null; let verifierUsage: Usage | null = null; let verifierElapsedMs = 0;
          let evaluation: Evaluation | null = null; let failure: FailureClass | null = null;
          let phase: "INVOKE" | "PARSE" | "VERIFY" = "INVOKE";
          try {
            const result = await bounded(signal => adapter.invoke({ input: task.input, inputDigest: task.manifest.inputDigest,
              attempt, feedback: feedback && immutableTheoryValue(feedback), remaining: immutableTheoryValue(remaining), signal }),
            taskDeadline - now());
            phase = "PARSE";
            const parsedUsage = usageSchema.safeParse(result?.usage);
            if (parsedUsage.success) observedUsage = parsedUsage.data;
            output = outputSchema.parse(jsonValue(result));
            failure = output.failure;
            if (!withinUsage(sumUsage([usageBefore, output.usage]), spec.limits)) failure = "RESOURCE_EXHAUSTION";
            if (!failure) {
              context = attemptContext(spec, task.manifest, armSpec, attempt, output.artifact);
              phase = "VERIFY";
              const verifierBegan = now();
              if (task.scoreArc) {
                evaluation = task.scoreArc(output.artifact);
                // This unit counts tested outputs only, not CPU cycles or all hashing/validation overhead.
                verifierUsage = { ...zeroUsage(), toolCalls: 1, toolWorkUnits: evaluation.total,
                  wallClockMs: Math.max(0, now() - verifierBegan) };
              } else {
                const external = await bounded(signal => evaluator!.evaluate(task, output!.artifact, context!, signal), taskDeadline - now());
                if (external.usage) verifierUsage = usageSchema.parse(external.usage);
                evaluation = gradeExternalReport(task, external, context, spec);
              }
              verifierElapsedMs = Math.max(0, now() - verifierBegan);
              if (evaluation.state === "FAIL") failure = evaluation.quality === "REJECT" ? "QUALITY_REJECTION" : "FUNCTIONAL_FAILURE";
              else if (evaluation.state === "INSUFFICIENT_EVIDENCE") failure = "VERIFIER_FAILURE";
            }
          } catch (error) {
            failure = error instanceof Deadline ? "RESOURCE_EXHAUSTION" : phase === "INVOKE" ? "INFRASTRUCTURE_FAILURE"
              : phase === "PARSE" || task.scoreArc ? "SCHEMA_FAILURE" : "VERIFIER_FAILURE";
          }
          const record: AttemptRecord = immutableTheoryValue({ attempt, context,
            internalCandidateAttempts: output?.internalCandidateAttempts ?? null,
            outcome: evaluation?.state === "PASS" && !failure ? "ACCEPTED" : evaluation?.state === "FAIL" ? "REJECTED"
              : evaluation?.state === "INSUFFICIENT_EVIDENCE" ? "NOT_VERIFIED" : "FAILED",
            failure, evaluation, usage: observedUsage, verifierUsage, observedVerifierWallClockMs: verifierElapsedMs,
            observedWallClockMs: Math.max(0, now() - started),
            confidence: output?.confidence ?? null, requestDigests: output?.requestDigests ?? [], responseDigests: output?.responseDigests ?? [] });
          attempts.push(record);
          if (record.outcome === "ACCEPTED") break;
          // Unknown in-flight usage, provider trouble, and resource exhaustion are not invitations to silently spend more.
          if (!record.usage || ["PROVIDER_FAILURE", "RESOURCE_EXHAUSTION", "INFRASTRUCTURE_FAILURE", "VERIFIER_FAILURE"].includes(failure!)) break;
          feedback = evaluation ? { state: evaluation.state, quality: evaluation.quality, metric: evaluation.metric }
            : { state: failure!, quality: "NOT_EVALUATED", metric: "NO_FUNCTIONAL_ORACLE_REACHED" };
        }
      }
      const record = immutableTheoryValue({ arm, taskDigest: task.manifest.taskDigest, tier: task.manifest.tier, state, reason, attempts });
      runs.push(record);
      if (attempts.some(a => a.failure === "PROVIDER_FAILURE" || (a.usage?.providerFailures ?? 0) > 0))
        consecutiveProviderFailures++;
      else if (attempts.some(a => (a.usage?.physicalCalls ?? 0) > 0)) consecutiveProviderFailures = 0;
      await observation.onRun?.(record);
    }
  }
  const summaries = ARMS.map(arm => {
    const selected = runs.filter(run => run.arm === arm); const attempts = selected.flatMap(run => run.attempts);
    const incomplete = selected.some(run => run.state !== "EXECUTED" || !run.attempts.length || run.attempts.some(a => !a.usage));
    const usage = sumUsage(attempts.flatMap(a => a.usage ? [a.usage] : []));
    const verifierUsage = sumUsage(attempts.flatMap(a => a.verifierUsage ? [a.verifierUsage] : []));
    const unknownVerifierUsage = attempts.filter(a => a.context && !a.verifierUsage).length;
    const judged = attempts.filter(a => a.evaluation && a.evaluation.state !== "INSUFFICIENT_EVIDENCE" && a.confidence !== null);
    return { arm, tasks: selected.length, executedTasks: selected.filter(r => r.attempts.length).length,
      firstAttemptAccepted: selected.filter(r => r.attempts[0]?.outcome === "ACCEPTED"
        && (r.attempts[0].internalCandidateAttempts ?? 1) === 1 && r.attempts[0].usage?.logicalCalls === 1).length,
      repairedAccepted: selected.filter(r => r.attempts.at(-1)?.outcome === "ACCEPTED"
        && (r.attempts.length > 1 || (r.attempts[0].internalCandidateAttempts ?? 1) > 1
          || (r.attempts[0].usage?.logicalCalls ?? 0) > 1)).length,
      finalAccepted: selected.filter(r => r.attempts.at(-1)?.outcome === "ACCEPTED").length,
      qualityAccepted: selected.filter(r => r.attempts.at(-1)?.evaluation?.quality === "ACCEPT").length,
      qualityNotEvaluated: selected.filter(r => r.attempts.at(-1)?.evaluation?.quality === "NOT_EVALUATED").length,
      falseAcceptances: null as number | null, falseAcceptanceAudit: "INDEPENDENT_AUDIT_NOT_EXECUTED",
      repairAttempts: attempts.filter(a => a.attempt > 1).length,
      failureCounts: Object.fromEntries(FAILURE_CLASSES.map(f => [f, attempts.filter(a => a.failure === f).length])),
      usage, verifierUsage, unknownVerifierUsage, verifierWorkUnitForLocalArc: "TEST_OUTPUT_CHECKS_NOT_CPU_CYCLES",
      unknownAttemptUsage: attempts.filter(a => !a.usage).length,
      complete: !incomplete, providerStable: !incomplete && usage.providerFailures === 0 && usage.retries === 0
        && verifierUsage.providerFailures === 0 && verifierUsage.retries === 0,
      calibration: { metric: "BINARY_BRIER_NOT_OFFICIAL_HLE_CALIBRATION", population: judged.length,
        value: judged.length ? judged.reduce((sum, a) => sum + ((a.confidence!) - (a.evaluation!.state === "PASS" ? 1 : 0)) ** 2, 0) / judged.length : null },
      // Missing environment/authority is not zero cognitive ability. No guessed benchmark percentage.
      benchmarkScorePercent: null as number | null,
    };
  });
  for (const summary of summaries) {
    const selected = runs.filter(r => r.arm === summary.arm);
    const graded = selected.map(r => r.attempts.at(-1)?.evaluation);
    if (summary.complete && graded.every(e => e && e.state !== "INSUFFICIENT_EVIDENCE")) {
      const total = graded.reduce((sum, e) => sum + e!.total, 0);
      summary.benchmarkScorePercent = total ? 100 * graded.reduce((sum, e) => sum + e!.correct, 0) / total : null;
    }
  }
  const configuredControls = new Set(armSpecs.filter(arm => arm.arm !== "RAW_MODEL").map(arm => arm.arm));
  const controls = summaries.filter(s => configuredControls.has(s.arm));
  const withinTolerance = (values: readonly number[]) =>
    Math.max(...values) - Math.min(...values) <= Math.max(...values, 1) * spec.realizedComputeTolerance;
  const computeKeys = ["physicalCalls", "reportedTokens", "toolWorkUnits"] as const;
  const matched = controls.length >= 2 && controls.every(s => s.complete && s.usage.unknownUsageCalls === 0 && s.providerStable
    && s.unknownVerifierUsage === 0 && s.verifierUsage.unknownUsageCalls === 0)
    && computeKeys.every(key => withinTolerance(controls.map(s => s.usage[key] + s.verifierUsage[key])))
    // Equal campaign totals must not hide opposite per-task budget imbalances.
    && tasks.every(task => {
      const byArm = controls.map(control => runs.find(run => run.taskDigest === task.manifest.taskDigest && run.arm === control.arm)!.attempts);
      if (byArm.some(attempts => attempts.some(attempt => !attempt.usage || attempt.usage.physicalCalls < 1))) return false;
      return computeKeys.every(key => withinTolerance(byArm.map(attempts =>
        attempts.reduce((sum, attempt) => sum + attempt.usage![key] + (attempt.verifierUsage?.[key] ?? 0), 0))));
    });
  const body = { schemaVersion: 1, campaign: spec, campaignDigest: theoryDigest(spec), arms: armSpecs,
    providerFailureCircuit: { stopAfter, consecutiveProviderFailures,
      open: stopAfter !== null && consecutiveProviderFailures >= stopAfter },
    tasks: tasks.map(t => t.manifest), runs, summaries, matchedRealizedCompute: matched,
    comparisonScope: "EQUAL_TOOL_ENVELOPE_NON_RAW_ARMS_ONLY",
    computeMatchScope: "CONFIGURED_NON_RAW_ARMS_GLOBAL_AND_EACH_TASK_MINIMUM_TWO_CONTROLS",
    capabilityGaps: runs.flatMap(run => run.attempts.filter(a => a.failure).map(a => ({
      gapId: `NYX-GAP-${theoryDigest({ task: run.taskDigest, arm: run.arm, attempt: a.attempt }).slice(0, 20)}`,
      failureClass: a.failure, evidenceDigest: theoryDigest(a),
      taskDigest: run.taskDigest, tier: run.tier, state: "OBSERVED_REQUIRES_INDEPENDENT_DEVELOPMENT_REPRODUCTION",
      benchmarkReevaluationEligible: false,
    }))),
    officialLeaderboardClaim: false, broadPromotion: false, grantsAuthority: false,
    rawModelComputeParitied: false, integrity: "TAMPER_EVIDENT_NOT_SIGNED",
    observedWallClockMs: Math.max(0, now() - began), exposureHistory: exposure.snapshot() };
  return immutableTheoryValue({ ...body, reportDigest: theoryDigest(body) });
}
