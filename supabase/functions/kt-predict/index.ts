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
  aktLitePredict,
  AKT_DEFAULTS,
  type KtInteraction,
} from "../_shared/aktLite.ts";
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

    // ── Load (θ, SE, Elo) at subject scope, override at concept scope ────
    const { data: subjAbil } = await admin
      .from("ability_estimates")
      .select("theta, theta_se, elo_rating")
      .eq("user_id", studentId).eq("subject", subject).is("concept_id", null)
      .maybeSingle();
    let theta = subjAbil ? Number(subjAbil.theta) : 0;
    let se    = subjAbil ? Number(subjAbil.theta_se) : 1.5;
    const studentElo = subjAbil ? Number(subjAbil.elo_rating ?? ELO_INITIAL) : ELO_INITIAL;

    if (body.conceptId) {
      const { data: cAbil } = await admin
        .from("ability_estimates")
        .select("theta, theta_se")
        .eq("user_id", studentId).eq("subject", subject).eq("concept_id", body.conceptId)
        .maybeSingle();
      if (cAbil) { theta = Number(cAbil.theta); se = Number(cAbil.theta_se); }
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
    const akt   = aktLitePredict(interactions, { conceptId: body.conceptId ?? "_subj", a, b, theta }, AKT_DEFAULTS);
    const p_akt = akt.p;
    const dashHistory: DashInteraction[] = interactions.map((iv) => ({ ts: iv.ts, c: iv.c, cid: iv.cid }));
    const p_dash = dashPredictFromHistory(dashHistory, Date.now(), theta, b, body.conceptId);

    // ── Load ensemble weights (user-specific → population fallback) ─────
    let weights: EnsembleWeights = ENSEMBLE_DEFAULTS;
    const { data: userW } = await admin
      .from("ensemble_weights")
      .select("w_2pl, w_elo, w_akt, w_dash, bias")
      .eq("user_id", studentId).eq("subject", subject)
      .maybeSingle();
    if (userW) {
      weights = userW as EnsembleWeights;
    } else {
      const { data: popW } = await admin
        .from("ensemble_weights")
        .select("w_2pl, w_elo, w_akt, w_dash, bias")
        .is("user_id", null).eq("subject", "*")
        .maybeSingle();
      if (popW) weights = popW as EnsembleWeights;
    }

    const blended = blendPredictions({ p_2pl, p_elo, p_akt, p_dash }, weights);

    return json({
      ok: true,
      p: blended.p,
      logit: blended.logit,
      components: { p_2pl, p_elo, p_akt, p_dash },
      weights: blended.weights,
      context: {
        theta, se, a, b, studentElo, itemElo,
        seqLen: interactions.length,
        attentionMass: akt.attentionMass,
        residual: akt.residual,
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
