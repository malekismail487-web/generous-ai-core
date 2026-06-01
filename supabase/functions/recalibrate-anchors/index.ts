// ============================================================================
//  recalibrate-anchors  —  Adaptive Intelligence v2.2  (Phase 5)
// ----------------------------------------------------------------------------
//  Nightly cron. For each subject that has anchor questions:
//    1. Recompute empirical difficulty (b) for each anchor from its true
//       success rate in graded_events (logit transform), using only anchors
//       so the reference population is stable.
//    2. Measure mean drift  =  avg(new_anchor_b − old_anchor_b).
//    3. Shift every NON-anchor difficulty_b in the same subject by that drift.
//       This corrects for system-wide pull (e.g. AI keeps generating easier
//       questions over time) without touching anchors themselves.
//    4. Write an audit row to anchor_recalibrations.
//
//  Anchors must have >= MIN_ANCHOR_RESPONSES total responses before being
//  trusted. Subjects with no qualifying anchors are silently skipped.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_ANCHOR_RESPONSES = 15;       // per anchor question
const MAX_NIGHTLY_SHIFT = 0.4;          // safety clamp on |mean_drift|
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Pull all anchors with their current b.
    const { data: anchors, error: anchorErr } = await admin
      .from("question_bank")
      .select("id, subject, difficulty_b")
      .eq("is_anchor", true);
    if (anchorErr) throw anchorErr;
    if (!anchors || !anchors.length) {
      return json({ ok: true, message: "no_anchors", subjects: 0 });
    }

    // Group anchors by subject.
    const bySubject = new Map<string, { id: string; b: number }[]>();
    for (const a of anchors) {
      const key = a.subject;
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push({ id: a.id, b: Number(a.difficulty_b) });
    }

    const report: Array<Record<string, unknown>> = [];

    for (const [subject, items] of bySubject) {
      const drifts: number[] = [];
      let qualifyingAnchors = 0;
      let totalResponses = 0;

      for (const anchor of items) {
        // Empirical success rate from graded_events for this anchor question.
        const { data: events, error: evErr } = await admin
          .from("graded_events")
          .select("was_correct")
          .eq("question_id", anchor.id);
        if (evErr) continue;
        if (!events || events.length < MIN_ANCHOR_RESPONSES) continue;

        const n = events.length;
        const correct = events.filter((e) => e.was_correct).length;
        const p = clamp(correct / n, 0.02, 0.98);
        const empiricalB = clamp(-Math.log(p / (1 - p)), -3.0, 3.0);
        drifts.push(empiricalB - anchor.b);
        qualifyingAnchors += 1;
        totalResponses += n;

        // Lock anchor at empirical b so it stays the reference.
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

      // Only shift non-anchors if the drift is meaningful — avoids stirring
      // perfectly-calibrated banks for tiny statistical wobble.
      let itemsShifted = 0;
      if (Math.abs(meanDrift) >= 0.05) {
        const { data: nonAnchors } = await admin
          .from("question_bank")
          .select("id, difficulty_b")
          .eq("subject", subject)
          .eq("is_anchor", false);

        if (nonAnchors && nonAnchors.length) {
          // Apply shift in batches.
          for (const q of nonAnchors) {
            const next = clamp(Number(q.difficulty_b) + meanDrift, -3.0, 3.0);
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

      report.push({
        subject,
        qualifyingAnchors,
        totalResponses,
        meanDrift: Number(meanDrift.toFixed(3)),
        itemsShifted,
      });
    }

    return json({ ok: true, subjects: report.length, report });
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
