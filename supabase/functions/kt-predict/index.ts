// ============================================================================
//  kt-predict  —  Stage 2 ensemble predictor
// ----------------------------------------------------------------------------
//  Returns the ensemble P(correct) for a (student, subject, candidate item)
//  triple, plus the four component predictions for diagnostics and so
//  downstream callers (the output engine) can reason about disagreement.
//
//  Auth: bearer JWT; callers may only request predictions for themselves OR
//  for students they can supervise via `can_view_student_mastery`. The
//  function NEVER returns another student's sequence state — only the
//  scalar probability and the four component breakdowns.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sigmoid as sig2pl, ELO_INITIAL } from "../_shared/irt2pl.ts";
import {
  aktPredict,
  AKT_DEFAULTS,
  type KtInteraction,
} from "../_shared/akt.ts";
import {
  dashPredictFromHistory,
  type DashInteraction,
} from "../_shared/dash.ts";
import {
  blendPredictions,
  eloProbability,
  ENSEMBLE_DEFAULTS,
  type EnsembleWeights,
} from "../_shared/ensemble.ts";
import { applyCalibration } from "../_shared/calibration.ts";
import { fsrsPredict, newFsrsCard, type FsrsCard } from "../_shared/fsrs.ts";
import { hawkesPredict, HAWKES_DEFAULTS } from "../_shared/hawkesKt.ts";
import { fetchHierarchicalPrior } from "../_shared/coldStart.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PredictPayload {
  studentId?: string;     // optional — defaults to caller
  subject: string;
  conceptId?: string;
  /** Optional candidate item; if omitted we use concept mean (a, b). */
  questionId?: string;
  /** Override candidate IRT params (used by simulators). */
  a?: number;
  b?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as PredictPayload;
    if (!body || typeof body.subject !== "string" || body.subject.length === 0) {
      return json({ error: "Invalid payload" }, 400);
    }
    const subject = body.subject.toLowerCase().trim();
    const studentId = body.studentId || callerId;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    if (studentId !== callerId) {
      const { data: ok } = await admin.rpc("can_view_student_mastery", {
        p_viewer: callerId, p_student: studentId,
      });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }

    // ── Resolve student school for cold-start scoping ───────────────────
    const { data: studentProfile } = await admin
      .from("profiles").select("school_id").eq("id", studentId).maybeSingle();
    const studentSchoolId = studentProfile?.school_id ?? null;

    // ── Stage 8: hierarchical cold-start prior (subject scope) ──────────
    // Used both as a θ/SE warm-start when ability_estimates has no row, and
    // as an ensemble-weight prior when ensemble_weights is empty for the user.
    const subjectColdStart = await fetchHierarchicalPrior(admin, {
      schoolId: studentSchoolId, subject, conceptId: null,
    });

    // ── Load (θ, SE, Elo) at subject scope, override at concept scope ────
    const { data: subjAbil } = await admin
      .from("ability_estimates")
      .select("theta, theta_se, elo_rating")
      .eq("user_id", studentId).eq("subject", subject).is("concept_id", null)
      .maybeSingle();
    let theta = subjAbil ? Number(subjAbil.theta) : subjectColdStart.theta;
    let se    = subjAbil ? Number(subjAbil.theta_se) : subjectColdStart.se;
    const studentElo = subjAbil ? Number(subjAbil.elo_rating ?? ELO_INITIAL) : ELO_INITIAL;

    if (body.conceptId) {
      const { data: cAbil } = await admin
        .from("ability_estimates")
        .select("theta, theta_se")
        .eq("user_id", studentId).eq("subject", subject).eq("concept_id", body.conceptId)
        .maybeSingle();
      if (cAbil) { theta = Number(cAbil.theta); se = Number(cAbil.theta_se); }
      else {
        // Concept-scoped cold start (narrower than subject when available).
        const conceptCold = await fetchHierarchicalPrior(admin, {
          schoolId: studentSchoolId, subject, conceptId: body.conceptId,
        });
        if (!conceptCold.isFallback) { theta = conceptCold.theta; se = conceptCold.se; }
      }
    }

    // ── Resolve candidate item params (a, b, item Elo) ───────────────────
    let a = body.a ?? 1.0, b = body.b ?? 0.0, itemElo = ELO_INITIAL;
    if (body.questionId) {
      const { data: q } = await admin
        .from("question_bank")
        .select("discrimination_a, difficulty_b, elo_rating")
        .eq("id", body.questionId).maybeSingle();
      if (q) {
        a = Number(q.discrimination_a ?? 1.0);
        b = Number(q.difficulty_b ?? 0);
        itemElo = Number(q.elo_rating ?? ELO_INITIAL);
      }
    } else if (body.conceptId) {
      const { data: items } = await admin
        .from("question_bank")
        .select("discrimination_a, difficulty_b, elo_rating")
        .eq("concept_id", body.conceptId);
      if (items && items.length) {
        a = items.reduce((s, r) => s + Number(r.discrimination_a ?? 1.0), 0) / items.length;
        b = items.reduce((s, r) => s + Number(r.difficulty_b ?? 0), 0) / items.length;
        itemElo = items.reduce((s, r) => s + Number(r.elo_rating ?? ELO_INITIAL), 0) / items.length;
      }
    }

    // ── Load KT sequence ────────────────────────────────────────────────
    const { data: seqRow } = await admin
      .from("kt_sequence_state")
      .select("interactions, seq_len")
      .eq("user_id", studentId).eq("subject", subject)
      .maybeSingle();
    const interactions: KtInteraction[] = Array.isArray(seqRow?.interactions)
      ? (seqRow!.interactions as KtInteraction[])
      : [];

    // ── Component predictions ───────────────────────────────────────────
    const p_2pl = clamp01(sig2pl(a * (theta - b)));
    const p_elo = clamp01(eloProbability(studentElo, itemElo));
    const akt   = aktPredict(interactions, { conceptId: body.conceptId ?? "_subj", a, b, theta }, AKT_DEFAULTS);
    const p_akt = akt.p;
    const dashHistory: DashInteraction[] = interactions.map((iv) => ({ ts: iv.ts, c: iv.c, cid: iv.cid }));
    const p_dash = dashPredictFromHistory(dashHistory, Date.now(), theta, b, body.conceptId);

    // ─── Stage 4 — FSRS-v5 retrievability ────────────────────────────
    let fsrsCard: FsrsCard = newFsrsCard();
    if (body.conceptId) {
      const { data: cRow } = await admin
        .from("fsrs_card_state")
        .select("stability, difficulty, reps, lapses, last_review_at")
        .eq("user_id", studentId).eq("subject", subject).eq("concept_id", body.conceptId)
        .maybeSingle();
      if (cRow) fsrsCard = {
        S: Number(cRow.stability ?? 0), D: Number(cRow.difficulty ?? 0),
        reps: cRow.reps ?? 0, lapses: cRow.lapses ?? 0,
        lastReviewMs: cRow.last_review_at ? new Date(cRow.last_review_at).getTime() : 0,
      };
    }
    if (!fsrsCard.lastReviewMs) {
      const { data: sRow } = await admin
        .from("fsrs_card_state")
        .select("stability, difficulty, reps, lapses, last_review_at")
        .eq("user_id", studentId).eq("subject", subject).is("concept_id", null)
        .maybeSingle();
      if (sRow) fsrsCard = {
        S: Number(sRow.stability ?? 0), D: Number(sRow.difficulty ?? 0),
        reps: sRow.reps ?? 0, lapses: sRow.lapses ?? 0,
        lastReviewMs: sRow.last_review_at ? new Date(sRow.last_review_at).getTime() : 0,
      };
    }
    const p_fsrs = fsrsPredict(fsrsCard, Date.now());

    // ─── Stage 4 — HawkesKT cross-concept excitation ────────────
    const historyCids = Array.from(new Set(interactions.map((iv) => iv.cid)))
      .filter((c) => c && c !== "_subj");
    const lectureOf = new Map<string, string | null>();
    if (body.conceptId && historyCids.length) {
      const all = Array.from(new Set(historyCids.concat(body.conceptId)));
      const { data: linkRows } = await admin
        .from("concepts").select("id, lecture_id").in("id", all);
      for (const r of linkRows ?? []) lectureOf.set(r.id, r.lecture_id ?? null);
    }
    const linkResolver = (from: string, to: string): number => {
      if (from === to) return 1;
      const lf = lectureOf.get(from), lt = lectureOf.get(to);
      if (lf && lt && lf === lt) return 0.5;
      return 0;
    };
    const hawkes = body.conceptId
      ? hawkesPredict(interactions,
          { conceptId: body.conceptId, a, b, theta, nowMs: Date.now() },
          linkResolver, HAWKES_DEFAULTS)
      : { p: p_2pl, intensity: 0, contributors: 0 };
    const p_hawkes = hawkes.p;

    // ── Load ensemble weights (user-specific → population fallback) ─────
    // Stage 8: when neither user nor stored population row exists, fall
    // back to the hierarchical cold-start prior we already fetched above.
    let weights: EnsembleWeights = subjectColdStart.ensembleWeights;
    const { data: userW } = await admin
      .from("ensemble_weights")
      .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
      .eq("user_id", studentId).eq("subject", subject)
      .maybeSingle();
    if (userW) {
      weights = userW as EnsembleWeights;
    } else {
      const { data: popW } = await admin
        .from("ensemble_weights")
        .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
        .is("user_id", null).eq("subject", "*")
        .maybeSingle();
      if (popW) weights = popW as EnsembleWeights;
    }

    const blended = blendPredictions(
      { p_2pl, p_elo, p_akt, p_dash, p_fsrs, p_hawkes }, weights,
    );

    // Stage 3: subject-level calibration. Apply (temperature | platt | identity).
    let calFit = { method: "identity" as const, temperature: 1, platt_a: 1, platt_b: 0 };
    const { data: calRow } = await admin
      .from("calibration_state").select("method, temperature, platt_a, platt_b")
      .eq("subject", subject).maybeSingle();
    if (calRow) calFit = {
      method: (calRow.method as any) ?? "identity",
      temperature: Number(calRow.temperature ?? 1),
      platt_a: Number(calRow.platt_a ?? 1),
      platt_b: Number(calRow.platt_b ?? 0),
    };
    else {
      const { data: popCal } = await admin
        .from("calibration_state").select("method, temperature, platt_a, platt_b")
        .eq("subject", "*").maybeSingle();
      if (popCal) calFit = {
        method: (popCal.method as any) ?? "identity",
        temperature: Number(popCal.temperature ?? 1),
        platt_a: Number(popCal.platt_a ?? 1),
        platt_b: Number(popCal.platt_b ?? 0),
      };
    }
    const pCalibrated = applyCalibration(blended.p, calFit);

    return json({
      ok: true,
      p: pCalibrated,
      p_raw: blended.p,
      logit: blended.logit,
      components: { p_2pl, p_elo, p_akt, p_dash, p_fsrs, p_hawkes },
      weights: blended.weights,
      calibration: calFit,
      context: {
        theta, se, a, b, studentElo, itemElo,
        seqLen: interactions.length,
        attentionMass: akt.attentionMass,
        residual: akt.residual,
        fsrs: { S: fsrsCard.S, D: fsrsCard.D, reps: fsrsCard.reps, lapses: fsrsCard.lapses },
        hawkes: { intensity: hawkes.intensity, contributors: hawkes.contributors },
      },
    });
  } catch (err) {
    console.error("[kt-predict] error", err);
    return json({ error: (err as Error).message ?? "Unknown error" }, 500);
  }
});

function clamp01(x: number): number {
  return Math.min(0.99, Math.max(0.01, x));
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
