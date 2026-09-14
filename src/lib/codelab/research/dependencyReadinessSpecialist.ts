import type { OmegaRepairVerification } from "../engine/r3BoundedRepairLoop";
import { TheoryNetwork } from "./theoryNetwork";
import { immutableTheoryValue, theoryDigest, type TheoryLease } from "./theoryContracts";

/**
 * A deliberately narrow native causal model, not an LLM persona.
 * Modeled family: either strict dependency readiness, or exactly one terminal/nonterminal
 * state incorrectly accepted as completion. Multiple faults and other mechanisms remain outside scope.
 */
export const READINESS_HYPOTHESES = Object.freeze([
  { id: "STRICT", admits: 0, mechanism: "Only completed prerequisites permit dispatch." },
  { id: "PENDING_AS_COMPLETE", admits: 1, mechanism: "An unfinished prerequisite is treated as completed." },
  { id: "FAILED_AS_COMPLETE", admits: 2, mechanism: "A failed prerequisite is treated as completed." },
  { id: "CANCELLED_AS_COMPLETE", admits: 4, mechanism: "A cancelled prerequisite is treated as completed." },
] as const);

// Each probe batches independent readiness questions, returning whether any blocked job dispatched.
// Ordering is also the fixed, non-adaptive baseline: inspect each state first, then combined probes.
export const READINESS_PROBES = Object.freeze([1, 2, 4, 3, 5, 6, 7].map((mask) =>
  Object.freeze({ toolId: `READINESS_${mask}`, mask, maxJobs: 3 })));

export interface ReadinessSpecialistLimits {
  readonly maxExperiments: number;
  readonly maxWallClockMs: number;
  readonly maxPredictionEvaluations: number;
}

export interface ReadinessInvestigationStep {
  readonly toolId: string;
  readonly forecasts: readonly { hypothesisId: string; predictsUnexpectedDispatch: boolean }[];
  readonly evidenceId: string;
  readonly evidenceDigest: string;
  readonly unexpectedDispatch: boolean;
  readonly survivingHypotheses: readonly string[];
  readonly counterexamples: readonly { hypothesisId: string; predictionId: string }[];
}

export interface ReadinessSpecialistResult {
  readonly decision: "IDENTIFIED_WITHIN_MODELED_FAMILY" | "INSUFFICIENT_EVIDENCE" | "BLOCKED";
  readonly reason: string;
  readonly mode: "ADAPTIVE" | "FIXED_ORDER_BASELINE";
  readonly hypothesisIds: readonly string[];
  readonly steps: readonly ReadinessInvestigationStep[];
  readonly resourceUsage: { readonly experiments: number; readonly predictionEvaluations: number;
    readonly wallClockMs: number; readonly modelCalls: 0; readonly modelTokens: 0 };
  readonly reasoningEngine: "NATIVE_FINITE_CAUSAL_MODEL_NOT_NEMOTRON";
  readonly calibratedConfidence: null;
  readonly grantsAuthority: false;
}

/**
 * An activation-local specialist reasons over competing mechanisms, chooses experiments,
 * precommits falsifiable forecasts, and revises its version space from real Omega observations.
 * Both comparison arms share predictions, evidence admission, stopping rules, and budgets.
 * The only ablated mechanism is adaptive minimax experiment selection.
 */
export async function investigateDependencyReadiness(options: {
  readonly network: TheoryNetwork;
  readonly coordinator: object;
  readonly lease: TheoryLease;
  readonly mode: ReadinessSpecialistResult["mode"];
  readonly limits: ReadinessSpecialistLimits;
  readonly experiments: readonly OmegaRepairVerification[];
}): Promise<ReadinessSpecialistResult> {
  const { network, coordinator, lease, mode, limits } = options;
  const started = Date.now();
  const steps: ReadinessInvestigationStep[] = [];
  let hypotheses = [...READINESS_HYPOTHESES];
  let predictionEvaluations = 0;
  let executions = 0;
  const used = new Set<string>();
  const finish = (decision: ReadinessSpecialistResult["decision"], reason: string): ReadinessSpecialistResult =>
    immutableTheoryValue({ decision, reason, mode, hypothesisIds: hypotheses.map((item) => item.id), steps,
      resourceUsage: { experiments: executions, predictionEvaluations, wallClockMs: Date.now() - started,
        modelCalls: 0, modelTokens: 0 }, reasoningEngine: "NATIVE_FINITE_CAUSAL_MODEL_NOT_NEMOTRON",
      calibratedConfidence: null, grantsAuthority: false });
  if (!["ADAPTIVE", "FIXED_ORDER_BASELINE"].includes(mode)
    || !Number.isSafeInteger(limits.maxExperiments) || limits.maxExperiments < 1 || limits.maxExperiments > 7
    || !Number.isSafeInteger(limits.maxWallClockMs) || limits.maxWallClockMs < 1 || limits.maxWallClockMs > 60_000
    || !Number.isSafeInteger(limits.maxPredictionEvaluations) || limits.maxPredictionEvaluations < 1
    || limits.maxPredictionEvaluations > 1_000) return finish("BLOCKED", "specialist_budget_invalid");
  let context;
  try { context = network.context(coordinator, lease); }
  catch { return finish("BLOCKED", "specialist_activation_not_owned"); }
  if (context.assignment.domain !== "SOFTWARE") return finish("BLOCKED", "specialist_domain_mismatch");
  const experiments = new Map(options.experiments.map((item) => [item.toolId, item]));
  const binding = options.experiments[0]?.request;
  if (experiments.size !== 7 || options.experiments.length !== 7 || !binding
    || READINESS_PROBES.some((probe) => !experiments.has(probe.toolId))
    || options.experiments.some((item) => item.request.toolId !== item.toolId
      || item.request.disposableRepositoryId !== binding.disposableRepositoryId
      || item.request.applicationId !== binding.applicationId || item.request.proposalDigest !== binding.proposalDigest)) {
    return finish("BLOCKED", "specialist_experiment_catalog_invalid");
  }
  while (executions < limits.maxExperiments && hypotheses.length > 1) {
    if (Date.now() - started >= limits.maxWallClockMs) return finish("INSUFFICIENT_EVIDENCE", "specialist_time_budget_exhausted");
    try { network.assertActive(coordinator, lease); }
    catch { return finish("BLOCKED", "specialist_activation_revoked_or_expired"); }
    const available = READINESS_PROBES.filter((probe) => !used.has(probe.toolId));
    const evaluationCost = available.length * hypotheses.length;
    if (predictionEvaluations + evaluationCost > limits.maxPredictionEvaluations) {
      return finish("INSUFFICIENT_EVIDENCE", "specialist_prediction_budget_exhausted");
    }
    // Equal prediction-table compute in both arms isolates selection from extra model/compute access.
    predictionEvaluations += evaluationCost;
    const partitions = available.map((probe) => {
      const forecasts = hypotheses.map((hypothesis) => ({ hypothesis,
        predictsUnexpectedDispatch: (hypothesis.admits & probe.mask) !== 0 }));
      const positives = forecasts.filter((item) => item.predictsUnexpectedDispatch).length;
      return { probe, forecasts, worstCaseSurvivors: Math.max(positives, forecasts.length - positives) };
    });
    const selected = mode === "FIXED_ORDER_BASELINE" ? partitions[0]
      : [...partitions].sort((left, right) => left.worstCaseSurvivors - right.worstCaseSurvivors)[0];
    const experiment = experiments.get(selected.probe.toolId)!;
    const predictions = selected.forecasts.map((forecast) => {
      const predictionId = `${lease.activationId}:${executions}:${forecast.hypothesis.id}`;
      const candidateDigest = theoryDigest({ hypothesis: forecast.hypothesis.id, experiment: experiment.request,
        predictsUnexpectedDispatch: forecast.predictsUnexpectedDispatch });
      return { ...forecast, predictionId, candidateDigest };
    });
    try {
      for (const prediction of predictions) network.commitPrediction(coordinator, lease, {
        predictionId: prediction.predictionId, statement: prediction.hypothesis.mechanism,
        expectedResult: prediction.predictsUnexpectedDispatch ? "Probe reports unexpected dispatch." : "Probe reports no unexpected dispatch.",
        candidateDigest: prediction.candidateDigest, evidenceRefs: [`EXPERIMENT:${experiment.request.requestId}`],
        assumptions: ["The implementation belongs to the explicitly modeled single-fault family."],
        uncertainties: ["Faults outside this finite model are not ruled out."],
        proposedCounterexamples: ["A probe result that contradicts this mechanism."],
        expectedPassingTools: [selected.probe.toolId], modelEstimate: null,
      });
    } catch { return finish("BLOCKED", "specialist_prediction_not_admitted"); }
    let execution;
    try { executions += 1; execution = await experiment.executor.execute(experiment.request); }
    catch { return finish("BLOCKED", "specialist_experiment_infrastructure_failure"); }
    const evidence = execution.evidence;
    if (evidence.candidateCommit !== context.assignment.candidateBinding
      || evidence.disposableRepositoryId !== binding.disposableRepositoryId || evidence.applicationId !== binding.applicationId
      || evidence.proposalDigest !== binding.proposalDigest || evidence.executionId !== experiment.request.executionId
      || evidence.toolId !== selected.probe.toolId || evidence.environmentIdentity !== experiment.request.environmentIdentity
      || evidence.evidenceClass !== "E3" || evidence.outcome !== execution.outcome
      || evidence.outputTruncated || evidence.unexpectedMutationPaths.length > 0 || evidence.changedPaths.length > 0
      || execution.authorityGranted || execution.networkAuthority || execution.productionAuthority
      || !((execution.outcome === "PASS" && evidence.exitCode === 0 && evidence.stdout.trim() === "UNEXPECTED_DISPATCH")
        || (execution.outcome === "FAIL" && evidence.exitCode === 2 && evidence.stdout.trim() === "NO_UNEXPECTED_DISPATCH"))) {
      return finish("BLOCKED", "specialist_experiment_evidence_not_admitted");
    }
    const unexpectedDispatch = execution.outcome === "PASS";
    const counterexamples = predictions.filter((prediction) => prediction.predictsUnexpectedDispatch !== unexpectedDispatch);
    try {
      for (const prediction of predictions) network.observe(coordinator, lease, {
        evidenceId: `DERIVED-${theoryDigest([evidence.evidenceId, prediction.predictionId])}`,
        predictionId: prediction.predictionId, candidateDigest: prediction.candidateDigest,
        toolId: selected.probe.toolId,
        // E3 comparison of frozen forecast with observed output, not a claim that the test itself passed.
        result: prediction.predictsUnexpectedDispatch === unexpectedDispatch ? "PASS" : "FAIL",
        evidenceClass: "E3", environmentIdentity: evidence.environmentIdentity,
        provenanceRoot: evidence.evidenceId,
      });
    } catch { return finish("BLOCKED", "specialist_observation_not_admitted"); }
    hypotheses = hypotheses.filter((hypothesis) => !counterexamples.some((item) => item.hypothesis.id === hypothesis.id));
    used.add(selected.probe.toolId);
    steps.push(immutableTheoryValue({ toolId: selected.probe.toolId,
      forecasts: predictions.map((item) => ({ hypothesisId: item.hypothesis.id, predictsUnexpectedDispatch: item.predictsUnexpectedDispatch })),
      evidenceId: evidence.evidenceId, evidenceDigest: theoryDigest(evidence), unexpectedDispatch,
      survivingHypotheses: hypotheses.map((item) => item.id), counterexamples: counterexamples.map((item) => ({
        hypothesisId: item.hypothesis.id, predictionId: item.predictionId })),
    }));
    if (Date.now() - started >= limits.maxWallClockMs) return finish("INSUFFICIENT_EVIDENCE", "specialist_time_budget_exhausted");
    if (hypotheses.length === 0) return finish("INSUFFICIENT_EVIDENCE", "observations_refute_modeled_family");
  }
  return hypotheses.length === 1 ? finish("IDENTIFIED_WITHIN_MODELED_FAMILY", "one_mechanism_survives_observed_counterexamples")
    : finish("INSUFFICIENT_EVIDENCE", "specialist_experiment_budget_exhausted");
}
