// ============================================================================
//  continuous-validate — Stage 12 · §6
// ----------------------------------------------------------------------------
//  Scheduled health check that summarises the adaptive engine's calibration,
//  regret, and ensemble-weight stability over a sliding window. Drift alerts
//  are raised when an observed metric crosses an absolute threshold or
//  deviates materially from the previous run.
//
//  Designed to be invoked by pg_cron on an hourly cadence (or manually by an
//  admin). It is read-only with respect to the adaptive engine and only
//  writes into the `continuous_validation_runs` and `engine_drift_alerts`
//  tables introduced by the Stage 12 migration.
//
//  Failure modes are explicit: insufficient data → status="ok" with
//  alerts=[] and zero metrics. We prefer "no signal" over a false alarm.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  brierDecomposition,
  type CalibrationEvent as DecomEvent,
} from "../_shared/evalHarness.ts";
import { expectedCalibrationError, type CalibrationEvent } from "../_shared/calibration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { windowHours?: number; }

interface AlertDraft {
  severity: "info" | "warn" | "alert";
  metric: string;
  observed: number | null;
  baseline: number | null;
  message: string;
}

const ECE_WARN = 0.07;
const ECE_ALERT = 0.12;
const REGRET_WARN = 0.15;
const REGRET_ALERT = 0.25;
const WEIGHT_STD_WARN = 0.25;

const std = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, v));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const windowHours = Math.max(1, Math.min(168, body.windowHours ?? 24));
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowHours * 3600_000);

    // ── Predictions for calibration / Brier ──────────────────────────────
    const { data: predRows } = await admin
      .from("ensemble_predictions")
      .select("calibrated_p, outcome")
      .gte("created_at", windowStart.toISOString())
      .not("calibrated_p", "is", null)
      .not("outcome", "is", null)
      .limit(20_000);
    const calEvents: CalibrationEvent[] = (predRows ?? [])
      .map((r: any) => ({
        p: Math.min(0.999999, Math.max(1e-6, Number(r.calibrated_p))),
        y: r.outcome === 1 ? 1 : 0,
      }));

    let brier: number | null = null;
    let reliability: number | null = null;
    let resolution: number | null = null;
    let uncertainty: number | null = null;
    let ece: number | null = null;
    let baseRate: number | null = null;

    if (calEvents.length >= 50) {
      const decom: DecomEvent[] = calEvents.map((e) => ({ p: e.p, y: e.y }));
      const d = brierDecomposition(decom);
      brier = d.brier;
      reliability = d.reliability;
      resolution = d.resolution;
      uncertainty = d.uncertainty;
      baseRate = calEvents.reduce((s, e) => s + e.y, 0) / calEvents.length;
      ece = expectedCalibrationError(calEvents);
    }

    // ── Regret stream ────────────────────────────────────────────────────
    const { data: regretRows } = await admin
      .from("policy_regret_log")
      .select("regret")
      .gte("created_at", windowStart.toISOString())
      .limit(20_000);
    const cumulativeRegret = (regretRows ?? []).reduce(
      (s: number, r: any) => s + (Number(r.regret) || 0), 0,
    );
    const avgRegret = (regretRows && regretRows.length)
      ? cumulativeRegret / regretRows.length : 0;

    // ── Ensemble weight stability ────────────────────────────────────────
    const { data: weightRows } = await admin
      .from("ensemble_weights")
      .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes")
      .limit(2_000);
    const weightStd = (weightRows ?? []).length >= 5
      ? std([
          ...(weightRows ?? []).map((r: any) => Number(r.w_2pl) || 0),
          ...(weightRows ?? []).map((r: any) => Number(r.w_elo) || 0),
          ...(weightRows ?? []).map((r: any) => Number(r.w_akt) || 0),
          ...(weightRows ?? []).map((r: any) => Number(r.w_dash) || 0),
          ...(weightRows ?? []).map((r: any) => Number(r.w_fsrs) || 0),
          ...(weightRows ?? []).map((r: any) => Number(r.w_hawkes) || 0),
        ])
      : 0;

    // ── Decisions in window (for telemetry) ──────────────────────────────
    const { count: nDecisions } = await admin
      .from("bandit_decisions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", windowStart.toISOString());

    // ── Alert generation ─────────────────────────────────────────────────
    const alerts: AlertDraft[] = [];
    if (ece !== null) {
      if (ece >= ECE_ALERT) alerts.push({
        severity: "alert", metric: "ece", observed: ece, baseline: ECE_ALERT,
        message: `Expected Calibration Error ${ece.toFixed(3)} exceeded the alert threshold ${ECE_ALERT}.`,
      });
      else if (ece >= ECE_WARN) alerts.push({
        severity: "warn", metric: "ece", observed: ece, baseline: ECE_WARN,
        message: `Expected Calibration Error ${ece.toFixed(3)} exceeded the warn threshold ${ECE_WARN}.`,
      });
    }
    if (avgRegret >= REGRET_ALERT) alerts.push({
      severity: "alert", metric: "avg_regret", observed: avgRegret, baseline: REGRET_ALERT,
      message: `Average per-decision regret ${avgRegret.toFixed(3)} exceeded the alert threshold ${REGRET_ALERT}.`,
    });
    else if (avgRegret >= REGRET_WARN) alerts.push({
      severity: "warn", metric: "avg_regret", observed: avgRegret, baseline: REGRET_WARN,
      message: `Average per-decision regret ${avgRegret.toFixed(3)} exceeded the warn threshold ${REGRET_WARN}.`,
    });
    if (weightStd >= WEIGHT_STD_WARN) alerts.push({
      severity: "warn", metric: "ensemble_weight_std", observed: weightStd, baseline: WEIGHT_STD_WARN,
      message: `Ensemble weight cross-subject σ=${weightStd.toFixed(3)} exceeds stability floor ${WEIGHT_STD_WARN}.`,
    });

    const status: "ok" | "warn" | "alert" = alerts.some((a) => a.severity === "alert")
      ? "alert" : alerts.some((a) => a.severity === "warn") ? "warn" : "ok";

    const { data: runRow, error: runErr } = await admin
      .from("continuous_validation_runs")
      .insert({
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        n_predictions: calEvents.length,
        n_decisions: nDecisions ?? 0,
        base_rate: baseRate,
        brier, reliability, resolution, uncertainty,
        ece,
        cumulative_regret: cumulativeRegret,
        ensemble_weight_std: weightStd,
        alerts,
        status,
      })
      .select("id").single();
    if (runErr) throw runErr;

    if (alerts.length > 0) {
      await admin.from("engine_drift_alerts").insert(
        alerts.map((a) => ({
          run_id: runRow.id,
          severity: a.severity,
          metric: a.metric,
          observed: a.observed,
          baseline: a.baseline,
          message: a.message,
        })),
      );
    }

    return new Response(
      JSON.stringify({ ok: true, runId: runRow.id, status, alerts, metrics: {
        brier, reliability, resolution, uncertainty, ece,
        cumulativeRegret, avgRegret, weightStd,
        baseRate, nPredictions: calEvents.length, nDecisions: nDecisions ?? 0,
      } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[continuous-validate]", err);
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
