// ============================================================================
//  recalibrate-anchors  —  Adaptive Intelligence v3.0  (Stage 1)
// ----------------------------------------------------------------------------
//  Nightly cron. Two phases:
//
//  PHASE A — Anchor-driven drift correction (v2.2 behaviour, preserved):
//    1. Recompute empirical difficulty (b) for each anchor from its true
//       success rate in graded_events (logit transform).
//    2. Measure mean drift = avg(new_anchor_b − old_anchor_b).
//    3. Shift every non-anchor difficulty_b in the subject by that drift.
//
//  PHASE B — Joint (a, b) MLE for items with enough evidence (Stage 1 new):
//    1. For each non-anchor item with ≥ MIN_RESPONSES_FOR_A_FIT
//       contemporaneous responses, gather (θ_before, was_correct) pairs.
//    2. Fit (a, b) jointly via Newton-Raphson on the 2PL log-likelihood
//       (see _shared/irt2pl.ts).
//    3. Persist the new (a, b) and write a row to item_parameter_history
//       so drift is auditable.
//
//  Anchors are never refit on the joint MLE — they remain the calibration
//  reference. Their `a` stays at the default (1.0) unless manually set.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  fitItemParams2pl,
  logLikelihood2pl,
  MIN_RESPONSES_FOR_A_FIT,
  A_MIN,
  A_MAX,
  B_CLAMP,
  clamp,
} from "../_shared/irt2pl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_ANCHOR_RESPONSES = 15;       // per anchor question
const MAX_NIGHTLY_SHIFT = 0.4;          // safety clamp on |mean_drift|
const A_FIT_BATCH_LIMIT = 200;          // per subject per nightly run

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ── Phase A: anchor drift ────────────────────────────────────────────
    const { data: anchors, error: anchorErr } = await admin
      .from("question_bank")
      .select("id, subject, difficulty_b")
      .eq("is_anchor", true);
    if (anchorErr) throw anchorErr;

    const bySubject = new Map<string, { id: string; b: number }[]>();
    for (const a of anchors ?? []) {
      const key = a.subject;
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push({ id: a.id, b: Number(a.difficulty_b) });
    }

    const anchorReport: Array<Record<string, unknown>> = [];

    for (const [subject, items] of bySubject) {
      const drifts: number[] = [];
      let qualifyingAnchors = 0;
      let totalResponses = 0;

      for (const anchor of items) {
        const { data: events, error: evErr } = await admin
          .from("graded_events")
          .select("was_correct")
          .eq("question_id", anchor.id);
        if (evErr) continue;
        if (!events || events.length < MIN_ANCHOR_RESPONSES) continue;

        const n = events.length;
        const correct = events.filter((e) => e.was_correct).length;
        const p = clamp(correct / n, 0.02, 0.98);
        const empiricalB = clamp(-Math.log(p / (1 - p)), -B_CLAMP, B_CLAMP);
        drifts.push(empiricalB - anchor.b);
        qualifyingAnchors += 1;
        totalResponses += n;

        await admin
          .from("question_bank")
          .update({
            difficulty_b: Number(empiricalB.toFixed(3)),
            difficulty_provisional: false,
          })
          .eq("id", anchor.id);
      }

      if (!drifts.length) {
        await admin.from("anchor_recalibrations").insert({
          subject,
          anchor_count: items.length,
          responses_considered: totalResponses,
          mean_drift: 0,
          items_shifted: 0,
          notes: "no_qualifying_anchors",
        });
        continue;
      }

      const meanDrift = clamp(
        drifts.reduce((s, d) => s + d, 0) / drifts.length,
        -MAX_NIGHTLY_SHIFT,
        MAX_NIGHTLY_SHIFT,
      );

      let itemsShifted = 0;
      if (Math.abs(meanDrift) >= 0.05) {
        const { data: nonAnchors } = await admin
          .from("question_bank")
          .select("id, difficulty_b")
          .eq("subject", subject)
          .eq("is_anchor", false);

        if (nonAnchors && nonAnchors.length) {
          for (const q of nonAnchors) {
            const next = clamp(Number(q.difficulty_b) + meanDrift, -B_CLAMP, B_CLAMP);
            await admin
              .from("question_bank")
              .update({ difficulty_b: Number(next.toFixed(3)) })
              .eq("id", q.id);
          }
          itemsShifted = nonAnchors.length;
        }
      }

      await admin.from("anchor_recalibrations").insert({
        subject,
        anchor_count: qualifyingAnchors,
        responses_considered: totalResponses,
        mean_drift: Number(meanDrift.toFixed(3)),
        items_shifted: itemsShifted,
        notes: Math.abs(meanDrift) < 0.05 ? "drift_below_threshold" : "shift_applied",
      });

      anchorReport.push({
        subject, qualifyingAnchors, totalResponses,
        meanDrift: Number(meanDrift.toFixed(3)), itemsShifted,
      });
    }

    // ── Phase B: joint (a, b) MLE on high-evidence items ─────────────────
    // Pull subjects that have any non-anchor items at all. For each subject,
    // page through items ordered by times_seen desc and fit while we have
    // budget. This is intentionally simple — Stage 10's benchmark harness
    // will let us tune the schedule from real signal.
    const subjectsWithItems = new Set<string>();
    {
      const { data: subjRows } = await admin
        .from("question_bank")
        .select("subject")
        .eq("is_anchor", false)
        .gte("times_seen", MIN_RESPONSES_FOR_A_FIT)
        .limit(2000);
      for (const r of subjRows ?? []) subjectsWithItems.add(r.subject);
    }

    const fitReport: Array<Record<string, unknown>> = [];

    for (const subject of subjectsWithItems) {
      const { data: candidates } = await admin
        .from("question_bank")
        .select("id, difficulty_b, discrimination_a, times_seen")
        .eq("subject", subject)
        .eq("is_anchor", false)
        .gte("times_seen", MIN_RESPONSES_FOR_A_FIT)
        .order("times_seen", { ascending: false })
        .limit(A_FIT_BATCH_LIMIT);
      if (!candidates || !candidates.length) continue;

      let fitsApplied = 0;
      let fitsSkipped = 0;
      for (const q of candidates) {
        // Use theta_before from graded_events as the contemporaneous ability
        // — that's what the student actually had when answering this item.
        const { data: ev } = await admin
          .from("graded_events")
          .select("theta_before, was_correct")
          .eq("question_id", q.id)
          .limit(2000);
        if (!ev || ev.length < MIN_RESPONSES_FOR_A_FIT) { fitsSkipped++; continue; }

        const samples = ev.map((e) => ({
          theta: Number(e.theta_before),
          y: (e.was_correct ? 1 : 0) as 0 | 1,
        }));

        const prior = {
          a: clamp(Number(q.discrimination_a ?? 1.0), A_MIN, A_MAX),
          b: clamp(Number(q.difficulty_b ?? 0), -B_CLAMP, B_CLAMP),
        };
        const priorLL = logLikelihood2pl(samples, prior.a, prior.b);
        const fit = fitItemParams2pl(samples, prior);

        // Only accept the fit if it actually improved log-likelihood by a
        // non-trivial margin AND moved the parameter — otherwise persist the
        // history row but leave the item untouched.
        const improved = fit.logLikelihood - priorLL > 0.5;
        const moved =
          Math.abs(fit.a - prior.a) > 1e-3 ||
          Math.abs(fit.b - prior.b) > 1e-3;

        if (improved && moved) {
          await admin
            .from("question_bank")
            .update({
              discrimination_a: Number(fit.a.toFixed(3)),
              difficulty_b: Number(fit.b.toFixed(3)),
              difficulty_provisional: false,
            })
            .eq("id", q.id);
          fitsApplied++;
        } else {
          fitsSkipped++;
        }

        await admin.from("item_parameter_history").insert({
          question_id: q.id,
          subject,
          a_before: Number(prior.a.toFixed(3)),
          a_after: Number(fit.a.toFixed(3)),
          b_before: Number(prior.b.toFixed(3)),
          b_after: Number(fit.b.toFixed(3)),
          responses_used: samples.length,
          log_likelihood: Number(fit.logLikelihood.toFixed(3)),
          method: improved && moved ? "2pl_joint_newton" : "2pl_no_op",
        });
      }

      fitReport.push({ subject, candidates: candidates.length, fitsApplied, fitsSkipped });
    }

    return json({
      ok: true,
      anchor_phase: { subjects: anchorReport.length, report: anchorReport },
      joint_fit_phase: { subjects: fitReport.length, report: fitReport },
    });
  } catch (err) {
    console.error("[recalibrate-anchors] error:", err);
    return json({ error: (err as Error).message ?? "unknown" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
