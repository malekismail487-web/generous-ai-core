export interface ColdStartGateInput {
  answerCount: number;
  behaviorDataPoints: number;
  hadExplicitLevelOverride: boolean;
}

/** Pure eligibility rule kept independent from Supabase initialization. */
export function shouldApplyColdStart(opts: ColdStartGateInput): boolean {
  if (opts.hadExplicitLevelOverride) return false;
  return opts.answerCount < 5 && opts.behaviorDataPoints < 20;
}
