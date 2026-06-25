// ============================================================================
//  POST /evaluate-models  — Stage 10 benchmarking harness.
// ----------------------------------------------------------------------------
//  Pulls labeled rows from `ensemble_predictions` (those where `outcome` is
//  populated by `attach_ensemble_outcome`) and scores every prediction
//  channel — p_2pl, p_elo, p_akt, p_dash, p_fsrs, p_hawkes, blended_p,
//  calibrated_p — with a full metric bundle: Brier, log-loss, ECE, AUC,
//  PR-AUC, Brier-skill score, Murphy decomposition, accuracy, plus
//  bootstrap CIs on AUC and Brier. Overall metrics are written, then a
//  second pass slices by `subject` and by `source` (e.g. `bandit` vs
//  `cold_start`).
//
//  Request body:
//    {
//      scope?: "global" | "subject" | "user",   // default "global"
//      scopeKey?: string,                       // subject code or user id
//      lookbackDays?: number,                   // default 30
//      maxRows?: number,                        // default 5000 cap 20000
//      minSliceSize?: number,                   // default 50
//      bootstrapIterations?: number,            // default 200, 0 to disable
//      notes?: string,
//    }
//
//  Auth:
//    - "global" / "subject" require `admin` role (via user_roles).
//    - "user"   allows the caller to evaluate their own predictions, or any
//      caller permitted by `can_view_student_mastery`.
//
//  Output: { runId, status, totals, overall, slices } JSON.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  computeMetrics, bootstrapCI, reliabilityBins, extractChannelEvents,
  PREDICTION_CHANNELS, type PredictionChannel, type RawPredictionRow,
} from "../_shared/evalHarness.ts";
import { brierScore, aucRoc } from "../_shared/calibration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin        = createClient(SUPABASE_URL, SERVICE_ROLE);

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_ROWS      = 5000;
const HARD_MAX_ROWS         = 20_000;
const DEFAULT_BOOTSTRAP     = 200;
const HARD_MAX_BOOTSTRAP    = 1000;
const DEFAULT_MIN_SLICE     = 50;
const ABS_MIN_FOR_RUN       = 30;

type Scope = "global" | "subject" | "user";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: unknown, def: number, lo: number, hi: number) {
  const n = Math.floor(Number(v ?? def));
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

interface BodyShape {
  scope?: Scope;
  scopeKey?: string;
  lookbackDays?: number;
  maxRows?: number;
  minSliceSize?: number;
  bootstrapIterations?: number;
  notes?: string;
}

async function isAdmin(callerId: string): Promise<boolean> {
  const { data } = await admin
    .from("user_roles").select("role").eq("user_id", callerId);
  if (!data) return false;
  return data.some((r: { role: string }) => r.role === "admin");
}

async function buildMetricRows(
  runId: string,
  rows: RawPredictionRow[],
  bootstrapIterations: number,
  minSliceSize: number,
): Promise<{ overall: Record<string, unknown>[]; sliced: Record<string, unknown>[] }> {
  const overall: Record<string, unknown>[] = [];
  const sliced:  Record<string, unknown>[] = [];

  for (const channel of PREDICTION_CHANNELS) {
    const ev = extractChannelEvents(rows, channel as PredictionChannel);
    if (ev.length === 0) continue;
    const m = computeMetrics(ev);
    let ciAuc = { lo: null as number | null, hi: null as number | null };
    let ciBr  = { lo: null as number | null, hi: null as number | null };
    if (bootstrapIterations > 0 && ev.length >= 30) {
      const a = bootstrapCI(ev, aucRoc,     { iterations: bootstrapIterations, seed: 7 });
      const b = bootstrapCI(ev, brierScore, { iterations: bootstrapIterations, seed: 11 });
      ciAuc = { lo: a.lo, hi: a.hi };
      ciBr  = { lo: b.lo, hi: b.hi };
    }
    overall.push({
      run_id: runId, channel, slice_kind: "overall", slice_key: null,
      n: m.n, base_rate: m.baseRate, brier: m.brier, log_loss: m.logLoss,
      ece: m.ece, auc: m.auc, pr_auc: m.prAuc, brier_skill: m.brierSkill,
      reliability: m.reliability, resolution: m.resolution,
      uncertainty: m.uncertainty, accuracy: m.accuracy,
      ci_auc_lo: ciAuc.lo, ci_auc_hi: ciAuc.hi,
      ci_brier_lo: ciBr.lo, ci_brier_hi: ciBr.hi,
      reliability_bins: reliabilityBins(ev, 10),
    });
  }

  // Slice by subject and by source — applied to calibrated_p (the production
  // probability) so the dashboard shows where the deployed model is weak.
  const focusChannel: PredictionChannel = "calibrated_p";
  const evFocusAll = extractChannelEvents(rows, focusChannel);
  if (evFocusAll.length === 0) return { overall, sliced };

  const sliceDims: Array<["subject" | "source", (r: RawPredictionRow) => string | null]> = [
    ["subject", (r) => r.subject ?? null],
    ["source",  (r) => r.source  ?? null],
  ];

  for (const [kind, getter] of sliceDims) {
    const buckets = new Map<string, RawPredictionRow[]>();
    for (const r of rows) {
      const k = getter(r);
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    for (const [key, subset] of buckets) {
      const ev = extractChannelEvents(subset, focusChannel);
      if (ev.length < minSliceSize) continue;
      const m = computeMetrics(ev);
      sliced.push({
        run_id: runId, channel: focusChannel,
        slice_kind: kind, slice_key: key,
        n: m.n, base_rate: m.baseRate, brier: m.brier, log_loss: m.logLoss,
        ece: m.ece, auc: m.auc, pr_auc: m.prAuc, brier_skill: m.brierSkill,
        reliability: m.reliability, resolution: m.resolution,
        uncertainty: m.uncertainty, accuracy: m.accuracy,
        ci_auc_lo: null, ci_auc_hi: null, ci_brier_lo: null, ci_brier_hi: null,
        reliability_bins: null,
      });
    }
  }
  return { overall, sliced };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const t0 = Date.now();
  try {
    // ─── Auth ───────────────────────────────────────────────────────
    const token = (req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as BodyShape;
    const scope: Scope = (["global", "subject", "user"] as const).includes(
      body.scope as Scope,
    ) ? (body.scope as Scope) : "global";
    const scopeKey = typeof body.scopeKey === "string" ? body.scopeKey.trim() : null;
    const lookbackDays = clampInt(body.lookbackDays, DEFAULT_LOOKBACK_DAYS, 1, 365);
    const maxRows      = clampInt(body.maxRows,      DEFAULT_MAX_ROWS,     100, HARD_MAX_ROWS);
    const minSliceSize = clampInt(body.minSliceSize, DEFAULT_MIN_SLICE,    10,  10_000);
    const bootstrapIterations = clampInt(
      body.bootstrapIterations, DEFAULT_BOOTSTRAP, 0, HARD_MAX_BOOTSTRAP,
    );
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;

    if (scope === "subject" && !scopeKey) {
      return json({ error: "scopeKey (subject) required" }, 400);
    }
    if (scope === "user" && !scopeKey) {
      return json({ error: "scopeKey (userId) required" }, 400);
    }

    // ─── Authorization ──────────────────────────────────────────────
    if (scope === "global" || scope === "subject") {
      if (!(await isAdmin(callerId))) return json({ error: "Forbidden" }, 403);
    } else if (scope === "user" && scopeKey !== callerId) {
      const { data: ok } = await admin.rpc("can_view_student_mastery", {
        p_viewer: callerId, p_student: scopeKey,
      });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }

    // ─── Pull labeled rows ──────────────────────────────────────────
    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd.getTime() - lookbackDays * 86400_000);
    let q = admin
      .from("ensemble_predictions")
      .select(
        "subject, source, outcome, p_2pl, p_elo, p_akt, p_dash, p_fsrs, p_hawkes, blended_p, calibrated_p",
      )
      .not("outcome", "is", null)
      .gte("outcome_attached_at", windowStart.toISOString())
      .lte("outcome_attached_at", windowEnd.toISOString())
      .order("outcome_attached_at", { ascending: false })
      .limit(maxRows);

    if (scope === "subject") q = q.eq("subject", scopeKey);
    if (scope === "user")    q = q.eq("user_id", scopeKey);

    const { data: rawRows, error: pullErr } = await q;
    if (pullErr) {
      console.error("[evaluate-models] pull failed:", pullErr);
      return json({ error: "Pull failed" }, 500);
    }
    const rows = (rawRows ?? []) as RawPredictionRow[];

    // ─── Insert run header ─────────────────────────────────────────
    const baseRate = rows.length === 0
      ? null
      : rows.reduce((s, r) => s + (r.outcome === 1 ? 1 : 0), 0) / rows.length;

    const status = rows.length < ABS_MIN_FOR_RUN ? "insufficient_data" : "ok";

    const { data: runRow, error: runErr } = await admin
      .from("model_evaluation_runs")
      .insert({
        triggered_by: callerId,
        scope, scope_key: scopeKey,
        window_start: windowStart.toISOString(),
        window_end:   windowEnd.toISOString(),
        n_predictions: rows.length,
        n_with_outcome: rows.length,
        base_rate: baseRate,
        bootstrap_iterations: bootstrapIterations,
        notes,
        status,
        duration_ms: null,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      console.error("[evaluate-models] run insert failed:", runErr);
      return json({ error: "Run insert failed" }, 500);
    }
    const runId: string = runRow.id;

    if (status === "insufficient_data") {
      await admin.from("model_evaluation_runs").update({
        duration_ms: Date.now() - t0,
      }).eq("id", runId);
      return json({
        runId, status, totals: { n: rows.length, baseRate },
        overall: [], slices: [],
        message: `Need ≥ ${ABS_MIN_FOR_RUN} labeled rows, got ${rows.length}`,
      });
    }

    // ─── Compute metrics ───────────────────────────────────────────
    const { overall, sliced } = await buildMetricRows(
      runId, rows, bootstrapIterations, minSliceSize,
    );

    if (overall.length > 0) {
      const { error: insErr } = await admin
        .from("model_evaluation_metrics").insert(overall);
      if (insErr) console.warn("[evaluate-models] overall insert:", insErr.message);
    }
    if (sliced.length > 0) {
      const { error: insErr } = await admin
        .from("model_evaluation_metrics").insert(sliced);
      if (insErr) console.warn("[evaluate-models] slice insert:", insErr.message);
    }

    await admin.from("model_evaluation_runs").update({
      duration_ms: Date.now() - t0,
    }).eq("id", runId);

    return json({
      runId, status,
      totals: { n: rows.length, baseRate, lookbackDays },
      overall, slices: sliced,
      channels: PREDICTION_CHANNELS,
    });
  } catch (e) {
    console.error("[evaluate-models] error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
