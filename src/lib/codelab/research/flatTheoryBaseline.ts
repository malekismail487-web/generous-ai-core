import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import { validResearchLimits, validResearchObjective, type ResearchPartyLimits, type ResearchPartyObjective,
  type TheoryCognitionEvidence, type TheoryCognitionIntent } from "./researchPartyContracts";
import type { TheoryCognitionEngine } from "./theoryResearchParty";

export interface FlatTheoryBaselineResult {
  readonly researchId: string;
  readonly decision: "SELECTED_BY_PLURALITY" | "NO_UNIQUE_SELECTION" | "BLOCKED";
  readonly selectedMechanismId: string | null;
  readonly reason: string;
  readonly intents: readonly TheoryCognitionIntent[];
  readonly cognitionEvidence: readonly TheoryCognitionEvidence[];
  readonly voteCounts: Readonly<Record<string, number>>;
  readonly resourceUsage: {
    readonly modelCalls: number;
    readonly promptTokens: number | null;
    readonly completionTokens: number | null;
    readonly totalTokens: number | null;
    readonly wallClockMs: number;
  };
  readonly experiments: 0;
  readonly counterexampleRevision: false;
  readonly evidenceGraph: false;
  readonly authorityGranted: false;
}

/**
 * Compute-matched flat sampling baseline. It deliberately has no guardians,
 * experiment feedback, evidence graph, or peer debate. More samples alone must
 * not be confused with the structured research-party mechanism.
 */
export async function runFlatTheoryBaseline(input: {
  readonly baselineId: string;
  readonly cognition: TheoryCognitionEngine;
  readonly objective: ResearchPartyObjective;
  readonly limits: ResearchPartyLimits;
  readonly now: () => number;
  readonly signal?: AbortSignal;
}): Promise<FlatTheoryBaselineResult> {
  const started = input.now();
  const intents: TheoryCognitionIntent[] = [];
  const cognitionEvidence: TheoryCognitionEvidence[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let usageComplete = true;
  let modelCalls = 0;
  let reason = "flat_sampling_finished";
  const deadline = Math.min(input.objective.expiryEpochMs, started + input.limits.maxWallClockMs);
  if (!validResearchLimits(input.limits) || !validResearchObjective(input.objective, started)) {
    return immutableTheoryValue({ researchId: input.objective.researchId ?? "MALFORMED", decision: "BLOCKED",
      selectedMechanismId: null, reason: "flat_baseline_input_invalid", intents, cognitionEvidence, voteCounts: {},
      resourceUsage: { modelCalls, promptTokens: 0, completionTokens: 0, totalTokens: 0,
        wallClockMs: Math.max(0, input.now() - started) }, experiments: 0, counterexampleRevision: false,
      evidenceGraph: false, authorityGranted: false });
  }
  const signal = input.signal ?? new AbortController().signal;
  for (let index = 0; index < input.limits.maxModelCalls; index += 1) {
    if (signal.aborted || input.now() >= deadline
      || (index + 1) * input.limits.maxOutputTokensPerCall > input.limits.maxTotalOutputTokens) {
      reason = signal.aborted ? "flat_baseline_cancelled" : "flat_baseline_budget_exhausted"; break;
    }
    const theoryId = `${input.baselineId}:theory:${index}`;
    const result = await input.cognition.think({ schemaVersion: 1,
      requestId: `${input.baselineId}-${index}-${theoryDigest([input.objective.researchId, index]).slice(0, 16)}`,
      role: "INVESTIGATOR", theoryId, guardianId: `${input.baselineId}:none:${index}`,
      objective: input.objective, privatePriorContributions: [], peerContributions: [], experimentObservations: [],
      predictionFeedback: [],
      instruction: "Independently select the most likely causal mechanism and predict every catalogued experiment. This flat baseline receives no peer discussion or experimental feedback.",
      maxOutputTokens: input.limits.maxOutputTokensPerCall, observedAtEpochMs: input.now(),
      deadlineEpochMs: deadline, signal });
    modelCalls += 1; cognitionEvidence.push(result.evidence);
    if (result.evidence.promptTokens === null || result.evidence.completionTokens === null
      || result.evidence.totalTokens === null) usageComplete = false;
    else { promptTokens += result.evidence.promptTokens; completionTokens += result.evidence.completionTokens;
      totalTokens += result.evidence.totalTokens; }
    if (result.decision === "CONTRIBUTION" && result.intent?.decision === "PROPOSE_HYPOTHESIS") intents.push(result.intent);
    else if (["BLOCKED", "WAITING_FOR_CAPACITY"].includes(result.decision)) { reason = result.reason; break; }
  }
  const votes = new Map<string, number>();
  for (const intent of intents) if (intent.mechanismId) votes.set(intent.mechanismId, (votes.get(intent.mechanismId) ?? 0) + 1);
  const sorted = [...votes].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const selected = sorted.length > 0 && (sorted.length === 1 || sorted[0][1] > sorted[1][1]) ? sorted[0][0] : null;
  return immutableTheoryValue({ researchId: input.objective.researchId,
    decision: selected ? "SELECTED_BY_PLURALITY" : "NO_UNIQUE_SELECTION", selectedMechanismId: selected,
    reason, intents, cognitionEvidence, voteCounts: Object.fromEntries(sorted), resourceUsage: { modelCalls,
      promptTokens: usageComplete ? promptTokens : null, completionTokens: usageComplete ? completionTokens : null,
      totalTokens: usageComplete ? totalTokens : null, wallClockMs: Math.max(0, input.now() - started) },
    experiments: 0, counterexampleRevision: false, evidenceGraph: false, authorityGranted: false });
}
