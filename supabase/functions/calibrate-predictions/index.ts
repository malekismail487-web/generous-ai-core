// ============================================================================
//  calibrate-predictions  —  Stage 3 nightly calibrator
// ----------------------------------------------------------------------------
//  Per-subject fit of (temperature, Platt A/B) on the last 30 days of
//  `graded_events`. Picks whichever scaler gives the lowest NLL and writes
//  it back into `calibration_state` along with raw + calibrated Brier, ECE,
//  AUC for the admin diagnostics tile.
//
//  Run manually (POST) or wire into a daily cron.
//
//  Auth: only super_admin / admin (or service-role) may invoke; we never
//  want a student to be able to trigger this and spike DB load.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fitCalibration, type CalibrationEvent } from "../_shared/calibration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_EVENTS = 30;
const WINDOW_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Authz: caller must be super_admin or admin. Service role bypasses by
    // setting an explicit header.
    const isService = req.headers.get("x-service-role") === "1" && token === SERVICE_ROLE;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Invalid auth" }, 401);
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", userData.user.id);
      const allowed = (roles ?? []).some((r: any) =>
        r.role === "super_admin" || r.role === "admin");
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    // Group events by subject in JS (PostgREST has no GROUP BY here, but
    // 30-day volume is small enough — capped at 200k for safety).
    const { data: rows, error } = await admin
      .from("graded_events")
      .select("subject, expected_p, was_correct")
      .gte("created_at", since)
      .not("expected_p", "is", null)
      .limit(200_000);
    if (error) throw error;

    const bySubject = new Map<string, CalibrationEvent[]>();
    for (const r of rows ?? []) {
      const subj = (r as any).subject as string;
      const p = Number((r as any).expected_p);
      const y = (r as any).was_correct ? 1 : 0;
      if (!subj || !isFinite(p) || p <= 0 || p >= 1) continue;
      const arr = bySubject.get(subj) ?? [];
      arr.push({ p, y: y as 0 | 1 });
      bySubject.set(subj, arr);
    }

    const results: any[] = [];
    for (const [subject, events] of bySubject.entries()) {
      if (events.length < MIN_EVENTS) {
        results.push({ subject, skipped: true, n: events.length });
        continue;
      }
      const fit = fitCalibration(events);
      const upsert = {
        subject,
        method: fit.method,
        temperature: Number(fit.temperature.toFixed(4)),
        platt_a: Number(fit.platt_a.toFixed(4)),
        platt_b: Number(fit.platt_b.toFixed(4)),
        n_events: fit.n,
        brier_raw: Number(fit.raw.brier.toFixed(5)),
        brier_cal: Number(fit.calibrated.brier.toFixed(5)),
        ece_raw:   Number(fit.raw.ece.toFixed(5)),
        ece_cal:   Number(fit.calibrated.ece.toFixed(5)),
        auc_raw:   Number(fit.raw.auc.toFixed(5)),
        auc_cal:   Number(fit.calibrated.auc.toFixed(5)),
        fitted_at: new Date().toISOString(),
      };
      const { error: upErr } = await admin
        .from("calibration_state")
        .upsert(upsert, { onConflict: "subject" });
      if (upErr) {
        results.push({ subject, error: upErr.message });
      } else {
        results.push({ subject, ...upsert });
      }
    }

    return json({ ok: true, fitted: results.length, results });
  } catch (e) {
    console.error("[calibrate-predictions] error", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
