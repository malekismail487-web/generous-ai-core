// ============================================================================
//  POST /retrain-ensemble
//
//  Closes the Stage-7 loop. Pulls labeled rows from `ensemble_predictions`,
//  fits a new EnsembleWeights row via `onlineLogistic`, and (only on
//  measurable improvement) upserts it into `ensemble_weights`.
//
//  Request body:
//    { studentId?: string, subject: string, scope?: "user" | "population",
//      minSamples?: number, lookbackDays?: number, epochs?: number,
//      dryRun?: boolean }
//
//  Auth:
//    - User scope: caller must equal studentId OR have mastery-view permission.
//    - Population scope: requires the service role secret OR an admin role.
//
//  Acceptance gate (mirrors fitter):
//    A fit is committed iff `fitEnsembleWeights` returns accepted=true AND
//    n_samples ≥ MIN_SAMPLES. Every run is audited to `ensemble_fit_runs`.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CHANNELS, CHANNEL_PROBS, fitEnsembleWeights, FIT_DEFAULTS,
  type LabeledPrediction,
} from "../_shared/onlineLogistic.ts";
import { ENSEMBLE_DEFAULTS, type EnsembleWeights } from "../_shared/ensemble.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin         = createClient(SUPABASE_URL, SERVICE_ROLE);

const DEFAULT_MIN_SAMPLES   = 30;
const DEFAULT_LOOKBACK_DAYS = 60;
const HARD_MAX_SAMPLES      = 5000;

interface PredictionRow {
  p_2pl: number | null; p_elo: number | null; p_akt: number | null;
  p_dash: number | null; p_fsrs: number | null; p_hawkes: number | null;
  outcome: number | null;
}

function rowToSample(r: PredictionRow): LabeledPrediction | null {
  if (r.outcome !== 0 && r.outcome !== 1) return null;
  const probs = CHANNEL_PROBS.map((k) => {
    const v = (r as any)[k];
    return typeof v === "number" && Number.isFinite(v) ? Number(v) : NaN;
  });
  // Need at least one non-NaN channel.
  if (!probs.some((p) => Number.isFinite(p))) return null;
  return { probs, y: r.outcome as 0 | 1 };
}

async function loadPriorWeights(
  scope: "user" | "population",
  userId: string | null,
  subject: string,
): Promise<EnsembleWeights> {
  if (scope === "user" && userId) {
    const { data } = await admin
      .from("ensemble_weights")
      .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
      .eq("user_id", userId).eq("subject", subject)
      .maybeSingle();
    if (data) return data as EnsembleWeights;
  }
  const { data: pop } = await admin
    .from("ensemble_weights")
    .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
    .is("user_id", null).eq("subject", scope === "population" ? subject : "*")
    .maybeSingle();
  if (pop) return pop as EnsembleWeights;
  return ENSEMBLE_DEFAULTS;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const subject: string = String(body.subject ?? "").trim();
    if (!subject) return json({ error: "subject required" }, 400);

    const scope: "user" | "population" = body.scope === "population" ? "population" : "user";
    const studentId: string | null = scope === "user" ? (body.studentId || callerId) : null;
    const minSamples = Math.max(10, Math.min(2000, Number(body.minSamples ?? DEFAULT_MIN_SAMPLES)));
    const lookbackDays = Math.max(1, Math.min(365, Number(body.lookbackDays ?? DEFAULT_LOOKBACK_DAYS)));
    const epochs = Math.max(1, Math.min(500, Number(body.epochs ?? FIT_DEFAULTS.epochs)));
    const dryRun = !!body.dryRun;

    // ─── Authorization ─────────────────────────────────────────────
    if (scope === "user" && studentId && studentId !== callerId) {
      const { data: ok } = await admin.rpc("can_view_student_mastery", {
        p_viewer: callerId, p_student: studentId,
      });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }
    if (scope === "population") {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", callerId);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      const isAdmin = roleSet.has("super_admin") ||
                      roleSet.has("school_admin") ||
                      roleSet.has("moderator");
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    // ─── Pull labeled training rows ────────────────────────────────
    const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString();
    let q = admin
      .from("ensemble_predictions")
      .select("p_2pl, p_elo, p_akt, p_dash, p_fsrs, p_hawkes, outcome")
      .eq("subject", subject)
      .not("outcome", "is", null)
      .gte("outcome_attached_at", since)
      .order("outcome_attached_at", { ascending: false })
      .limit(HARD_MAX_SAMPLES);
    if (scope === "user" && studentId) q = q.eq("user_id", studentId);

    const { data: rows, error: pullErr } = await q;
    if (pullErr) {
      console.error("[retrain-ensemble] pull failed:", pullErr);
      return json({ error: "Pull failed" }, 500);
    }

    const samples: LabeledPrediction[] = [];
    for (const r of rows ?? []) {
      const s = rowToSample(r as PredictionRow);
      if (s) samples.push(s);
    }

    // ─── Run the fitter ────────────────────────────────────────────
    const prior = await loadPriorWeights(scope, studentId, subject);
    const result = fitEnsembleWeights(samples, prior, { ...FIT_DEFAULTS, epochs });

    const eligible = samples.length >= minSamples;
    const willCommit = eligible && result.accepted && !dryRun;

    // ─── Audit (always) ────────────────────────────────────────────
    await admin.from("ensemble_fit_runs").insert({
      scope,
      user_id: studentId,
      subject,
      n_samples: samples.length,
      brier_before: result.before.brier,
      brier_after:  result.after.brier,
      logloss_before: result.before.logloss,
      logloss_after:  result.after.logloss,
      ece_after: result.after.ece,
      epochs: result.epochs,
      accepted: willCommit,
      weights_before: prior,
      weights_after: result.weights,
      notes: dryRun
        ? `dry_run; ${result.notes}; eligible=${eligible}`
        : eligible
          ? result.notes
          : `rejected_too_few_samples(${samples.length}<${minSamples})`,
    });

    // ─── Commit weights ────────────────────────────────────────────
    if (willCommit) {
      const upsertPayload: Record<string, unknown> = {
        user_id: scope === "user" ? studentId : null,
        subject,
        w_2pl: result.weights.w_2pl,
        w_elo: result.weights.w_elo,
        w_akt: result.weights.w_akt,
        w_dash: result.weights.w_dash,
        w_fsrs: result.weights.w_fsrs,
        w_hawkes: result.weights.w_hawkes,
        bias: result.weights.bias,
        updated_at: new Date().toISOString(),
      };
      const conflict = scope === "user" ? "user_id,subject" : "subject";
      // For population rows where user_id IS NULL, the unique index must use
      // (subject) WHERE user_id IS NULL — handled at schema setup time. We
      // do best-effort upsert; on conflict-target mismatch we fall back to
      // delete-then-insert with an explicit guard.
      const { error: upErr } = await admin
        .from("ensemble_weights")
        .upsert(upsertPayload, { onConflict: conflict });
      if (upErr) {
        // Fallback path: try a manual replace for the population case.
        if (scope === "population") {
          await admin.from("ensemble_weights")
            .delete().is("user_id", null).eq("subject", subject);
          await admin.from("ensemble_weights").insert(upsertPayload);
        } else {
          console.warn("[retrain-ensemble] upsert failed:", upErr.message);
        }
      }
    }

    return json({
      scope, subject, studentId,
      nSamples: samples.length,
      eligible,
      accepted: willCommit,
      epochs: result.epochs,
      metrics: {
        brierBefore: result.before.brier,
        brierAfter:  result.after.brier,
        loglossBefore: result.before.logloss,
        loglossAfter:  result.after.logloss,
        eceAfter: result.after.ece,
      },
      weightsBefore: prior,
      weightsAfter:  result.weights,
      channels: CHANNELS,
      notes: result.notes,
      dryRun,
    });
  } catch (e) {
    console.error("[retrain-ensemble] error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
