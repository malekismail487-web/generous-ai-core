// ============================================================================
//  auto-tune-hyperparams — Stage 11 edge function
// ----------------------------------------------------------------------------
//  Runs the Cross-Entropy Method optimiser over Lumina's hyperparameter
//  space. Each candidate is scored by SNIPS reward on the logged
//  bandit_decisions window, minus a calibration penalty estimated from
//  ensemble_predictions.
//
//  The objective is intentionally simple and stable — we are searching
//  in 8 dimensions with ~tens of CEM evaluations, not running gradient
//  descent across the whole engine. The best candidate is written to
//  hyperparameter_tuning_runs; promotion to hyperparameter_settings is a
//  separate explicit step (controlled via `promote: true` in the body),
//  so an admin can review the trace before flipping the live config.
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  evaluateSNIPS,
  type DecisionLogRow,
  type TargetPolicy,
} from "../_shared/doublyRobust.ts";
import { ARM_IDS } from "../_shared/linucb.ts";
import {
  CEM_DEFAULTS,
  LUMINA_HP_SPECS,
  normaliseEnsembleWeights,
  runCem,
} from "../_shared/cemTuner.ts";
import {
  expectedCalibrationError,
  type CalibrationEvent,
} from "../_shared/calibration.ts";
import { invalidateRuntimeConfig } from "../_shared/runtimeConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  windowDays?: number;
  population?: number;
  elites?: number;
  generations?: number;
  seed?: number;
  promote?: boolean;
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const windowDays = Math.max(1, Math.min(60, body.windowDays ?? 21));
    const start = new Date(Date.now() - windowDays * 86400_000).toISOString();

    // 1) Load decision log
    const { data: rows, error } = await admin.from("bandit_decisions")
      .select("arm_id,context_vec,behaviour_prob,reward")
      .eq("rewarded", true)
      .not("behaviour_prob", "is", null)
      .gte("created_at", start)
      .limit(10000);
    if (error) throw error;
    const log: DecisionLogRow[] = (rows ?? []).map((r: any) => ({
      x: Array.isArray(r.context_vec) ? r.context_vec : [],
      chosenArm: r.arm_id,
      behaviourProb: Math.max(0.01, Number(r.behaviour_prob) || 0.01),
      reward: Math.max(0, Math.min(1, Number(r.reward) || 0)),
    })).filter((r) => r.x.length > 0);

    // 2) Load calibration events from ensemble_predictions
    const { data: predRows } = await admin.from("ensemble_predictions")
      .select("calibrated_p,outcome")
      .gte("created_at", start)
      .not("calibrated_p", "is", null)
      .not("outcome", "is", null)
      .limit(10000);
    const calEvents: CalibrationEvent[] = (predRows ?? [])
      .map((r: any) => ({
        p: Math.min(0.999999, Math.max(1e-6, Number(r.calibrated_p))),
        y: r.outcome === 1 ? 1 : 0,
      }));
    const baseEce = calEvents.length > 50 ? expectedCalibrationError(calEvents) : 0;

    if (log.length < 50) {
      return new Response(
        JSON.stringify({ ok: false, error: "not enough decisions to tune", n: log.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) CEM objective: SNIPS value of an ε-greedy policy parametrised by
    //    a synthetic per-arm score derived from the candidate ensemble
    //    weights and the LinUCB α. Calibration is fixed across candidates
    //    in this objective, so the calibration penalty is a constant —
    //    included so the value is on a meaningful absolute scale.
    const armBaseValue: Record<string, number> = {};
    for (const r of log) {
      (armBaseValue[r.chosenArm] ??= 0);
      armBaseValue[r.chosenArm] += r.reward;
    }
    const armCounts: Record<string, number> = {};
    for (const r of log) armCounts[r.chosenArm] = (armCounts[r.chosenArm] ?? 0) + 1;
    for (const k of Object.keys(armBaseValue)) {
      armBaseValue[k] = armBaseValue[k] / Math.max(1, armCounts[k]);
    }

    const objective = (params: Record<string, number>) => {
      normaliseEnsembleWeights(params);
      const alpha = params.linucb_alpha ?? 1.0;
      // Build a target policy: softmax over (armBaseValue + α·explorationBonus).
      // Exploration bonus is 1/√n_a — encourages under-sampled arms.
      const scores: Record<string, number> = {};
      for (const a of ARM_IDS) {
        const m = armBaseValue[a] ?? 0;
        const n = Math.max(1, armCounts[a] ?? 1);
        scores[a] = m + alpha * (1 / Math.sqrt(n));
      }
      const tau = Math.max(0.05, params.softmax_tau ?? 0.15);
      const maxS = Math.max(...Object.values(scores));
      const expS: Record<string, number> = {};
      let denom = 0;
      for (const a of ARM_IDS) { expS[a] = Math.exp((scores[a] - maxS) / tau); denom += expS[a]; }
      const pol: TargetPolicy = () => {
        const out: Record<string, number> = {};
        for (const a of ARM_IDS) out[a] = expS[a] / denom;
        return out;
      };
      const snips = evaluateSNIPS(log, pol, [...ARM_IDS]);
      // Penalty discourages collapse: prefer policies with reasonable ESS.
      const essPenalty = snips.effectiveSampleSize < 20 ? 0.05 : 0;
      return snips.value - 0.5 * baseEce - essPenalty;
    };

    const cfg = {
      population: Math.max(8, Math.min(64, body.population ?? CEM_DEFAULTS.population)),
      elites:     Math.max(2, Math.min(16, body.elites     ?? CEM_DEFAULTS.elites)),
      generations:Math.max(2, Math.min(12, body.generations?? CEM_DEFAULTS.generations)),
      seed:       body.seed ?? CEM_DEFAULTS.seed,
      sigmaFloor: CEM_DEFAULTS.sigmaFloor,
    };

    const result = await runCem(LUMINA_HP_SPECS, objective, cfg);
    normaliseEnsembleWeights(result.bestParams);

    // 4) Persist run
    const { data: runRow, error: runErr } = await admin
      .from("hyperparameter_tuning_runs")
      .insert({
        algorithm: "cem",
        population: cfg.population,
        elites: cfg.elites,
        generations: cfg.generations,
        seed: cfg.seed,
        best_value: result.bestValue,
        best_params: result.bestParams,
        trace: result.trace,
        evaluations: result.evaluations,
        notes: body.notes ?? null,
      })
      .select("id").single();
    if (runErr) throw runErr;

    // 5) Optional atomic promotion
    if (body.promote === true) {
      await admin.from("hyperparameter_settings")
        .update({ active: false })
        .eq("scope", "global").eq("active", true);
      await admin.from("hyperparameter_settings").insert({
        scope: "global",
        params: result.bestParams,
        source_run_id: runRow.id,
        active: true,
        notes: `Promoted automatically from tuning run ${runRow.id}`,
      });
      await admin.from("hyperparameter_tuning_runs")
        .update({ promoted: true, promoted_at: new Date().toISOString() })
        .eq("id", runRow.id);
      // Stage 12 §1 — invalidate the in-process cache so the next
      // adaptive call resolves the freshly-promoted snapshot immediately.
      invalidateRuntimeConfig();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        runId: runRow.id,
        bestValue: result.bestValue,
        bestParams: result.bestParams,
        evaluations: result.evaluations,
        promoted: body.promote === true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[auto-tune-hyperparams]", err);
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
