import { immutableResearchValue } from "./researchPartyContracts";

export interface CoverageTransferArm {
  readonly taskId: string;
  readonly policy: "DERIVATION_ONLY" | "ROTATING_PARTITION";
  readonly assurance: { readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE" };
  readonly resourceUsage: { readonly modelCalls: number; readonly experiments: number;
    readonly totalTokens: number | null; readonly wallClockMs: number };
}

/** Predeclared tolerance is reported separately from exact equality, never as GPU equivalence. */
export const COVERAGE_TRANSFER_TOKEN_SPREAD_LIMIT = 0.10;

/** Descriptive paired analysis, not an assurance decision or significance claim. */
export function analyzeCoverageTransfer(taskIds: readonly string[], records: readonly CoverageTransferArm[]) {
  if (!Array.isArray(taskIds) || taskIds.length < 1 || taskIds.length > 3
    || taskIds.some(id => typeof id !== "string" || !/^NYX-TRANSFER-[A-Z]+$/.test(id))
    || new Set(taskIds).size !== taskIds.length || !Array.isArray(records) || records.length > taskIds.length * 2) {
    throw new Error("coverage_transfer_analysis_input_invalid");
  }
  const identities = new Set<string>();
  for (const record of records) {
    const usage = record?.resourceUsage;
    const identity = `${record?.taskId}:${record?.policy}`;
    if (!taskIds.includes(record?.taskId) || !["DERIVATION_ONLY", "ROTATING_PARTITION"].includes(record?.policy)
      || identities.has(identity) || !["ACCEPT", "REJECT", "INSUFFICIENT_EVIDENCE"].includes(record?.assurance?.decision)
      || !usage || !Number.isSafeInteger(usage.modelCalls) || usage.modelCalls < 0
      || !Number.isSafeInteger(usage.experiments) || usage.experiments < 0
      || !Number.isFinite(usage.wallClockMs) || usage.wallClockMs < 0
      || (usage.totalTokens !== null && (!Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0))) {
      throw new Error("coverage_transfer_analysis_record_invalid");
    }
    identities.add(identity);
  }
  const pairs = taskIds.map(taskId => {
    const baseline = records.find(record => record.taskId === taskId && record.policy === "DERIVATION_ONLY");
    const candidate = records.find(record => record.taskId === taskId && record.policy === "ROTATING_PARTITION");
    if (!baseline || !candidate) return { taskId, state: "INCOMPLETE" as const,
      outcome: null, exactRealizedComputeMatch: false, withinDeclaredTokenEnvelope: false,
      tokenSpreadFraction: null, baselineAccepted: baseline?.assurance.decision === "ACCEPT" ? true : baseline ? false : null,
      candidateAccepted: candidate?.assurance.decision === "ACCEPT" ? true : candidate ? false : null };
    const a = baseline.resourceUsage; const b = candidate.resourceUsage;
    const callsMatch = a.modelCalls > 0 && a.modelCalls === b.modelCalls;
    const experimentsMatch = a.experiments > 0 && a.experiments === b.experiments;
    const known = a.totalTokens !== null && b.totalTokens !== null;
    const largest = Math.max(a.totalTokens ?? 0, b.totalTokens ?? 0);
    const spread = known ? largest === 0 ? 0 : Math.abs(a.totalTokens! - b.totalTokens!) / largest : null;
    const baselineAccepted = baseline.assurance.decision === "ACCEPT";
    const candidateAccepted = candidate.assurance.decision === "ACCEPT";
    return { taskId, state: "COMPLETE" as const, baselineAccepted, candidateAccepted,
      outcome: baselineAccepted === candidateAccepted ? "TIE" as const : candidateAccepted ? "WIN" as const : "LOSS" as const,
      modelCallsMatched: callsMatch, experimentsMatched: experimentsMatch, tokenSpreadFraction: spread,
      exactRealizedComputeMatch: callsMatch && experimentsMatch && spread === 0,
      withinDeclaredTokenEnvelope: callsMatch && experimentsMatch && spread !== null
        && spread <= COVERAGE_TRANSFER_TOKEN_SPREAD_LIMIT,
      baselineUsage: a, candidateUsage: b,
      baselineAcceptedPerThousandTokens: a.totalTokens && baselineAccepted ? 1_000 / a.totalTokens : a.totalTokens ? 0 : null,
      candidateAcceptedPerThousandTokens: b.totalTokens && candidateAccepted ? 1_000 / b.totalTokens : b.totalTokens ? 0 : null };
  });
  return immutableResearchValue({ schemaVersion: 1, comparison: "IDENTICAL_DERIVATION_GUIDANCE_ALLOCATION_ABLATION",
    tokenSpreadLimit: COVERAGE_TRANSFER_TOKEN_SPREAD_LIMIT, pairs,
    requestedPairs: taskIds.length, completePairs: pairs.filter(pair => pair.state === "COMPLETE").length,
    wins: pairs.filter(pair => pair.outcome === "WIN").length,
    losses: pairs.filter(pair => pair.outcome === "LOSS").length,
    ties: pairs.filter(pair => pair.outcome === "TIE").length,
    computeComparableWins: pairs.filter(pair => pair.outcome === "WIN" && pair.withinDeclaredTokenEnvelope).length,
    descriptiveOnly: true, broadPromotion: false, grantsAuthority: false,
    gpuComputeMatched: "NOT_MEASURED", calibration: "NOT_ESTABLISHED" });
}
