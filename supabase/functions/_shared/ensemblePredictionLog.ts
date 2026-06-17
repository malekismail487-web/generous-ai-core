// ============================================================================
//  ensemblePredictionLog.ts — persistence helper for Stage 7.
//
//  Logs every ensemble prediction made by teaching-generate / kt-predict
//  so retrain-ensemble has a labeled training set after outcomes attach.
//  Also wraps the attach_ensemble_outcome RPC used by ability-update.
//
//  Best-effort: a failure to log a prediction must NEVER break teaching.
// ============================================================================

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface PredictionLogInput {
  userId: string;
  subject: string;
  conceptId?: string | null;
  questionId?: string | null;
  banditDecisionId?: string | null;
  components: {
    p_2pl?: number; p_elo?: number; p_akt?: number;
    p_dash?: number; p_fsrs?: number; p_hawkes?: number;
  };
  blendedP?: number | null;
  calibratedP?: number | null;
  weightsUsed?: Record<string, number> | null;
  source?: string;
}

const r6 = (x: number | null | undefined) =>
  typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(6)) : null;

export async function logEnsemblePrediction(
  admin: SupabaseAdmin, input: PredictionLogInput,
): Promise<string | null> {
  try {
    const c = input.components ?? {};
    const { data, error } = await admin
      .from("ensemble_predictions")
      .insert({
        user_id: input.userId,
        subject: input.subject,
        concept_id: input.conceptId ?? null,
        question_id: input.questionId ?? null,
        bandit_decision_id: input.banditDecisionId ?? null,
        p_2pl:    r6(c.p_2pl),
        p_elo:    r6(c.p_elo),
        p_akt:    r6(c.p_akt),
        p_dash:   r6(c.p_dash),
        p_fsrs:   r6(c.p_fsrs),
        p_hawkes: r6(c.p_hawkes),
        blended_p:    r6(input.blendedP),
        calibrated_p: r6(input.calibratedP),
        weights_used: input.weightsUsed ?? null,
        source: input.source ?? "teaching-generate",
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("[ensemblePredictionLog] insert failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[ensemblePredictionLog] error:", e);
    return null;
  }
}

export async function attachEnsembleOutcome(
  admin: SupabaseAdmin, args: {
    userId: string; subject: string;
    conceptId?: string | null; isCorrect: boolean;
  },
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc("attach_ensemble_outcome", {
      p_user_id: args.userId,
      p_subject: args.subject,
      p_concept_id: args.conceptId ?? null,
      p_outcome: args.isCorrect ? 1 : 0,
    });
    if (error) {
      console.warn("[ensemblePredictionLog] attach rpc error:", error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("[ensemblePredictionLog] attach error:", e);
    return null;
  }
}
