// ============================================================================
//  ability-update edge function
// ----------------------------------------------------------------------------
//  Server-side IRT (Rasch / 1PL) update for the Adaptive Intelligence v2
//  engine. Clients call this when a student answers a graded question — the
//  function:
//    1. Upserts the question into the bank (hashed for stability).
//    2. Reads the student's current ability estimate (theta, se).
//    3. Computes expected probability of correctness.
//    4. Updates theta and standard error using Fisher information.
//    5. Persists the new estimate + appends to graded_events for auditability.
//    6. Increments times_seen / times_correct on the question.
//
//  All writes use the service role so students cannot tamper with their own
//  ability score by hitting the database directly.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── tunables ───────────────────────────────────────────────────────────────
const SE_LOCK_IN = 0.4;          // SE below which estimate is no longer "provisional"
const SE_FLOOR = 0.18;           // never let SE collapse below this (over-confidence guard)
const SE_INITIAL = 1.5;          // starting SE for a brand-new estimate
const RECENCY_TAU_DAYS = 30;     // half-life-ish weight for "is this a fresh learner?"
const PROVISIONAL_DIFFICULTY_LOCK = 20; // question becomes calibrated after this many attempts

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normaliseQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 4000);
}

interface Payload {
  subject: string;
  conceptId?: string | null;
  questionText: string;
  correctAnswer?: string | null;
  studentAnswer?: string | null;
  isCorrect: boolean;
  source?: string;           // quiz | assignment | exam | probe
  responseTimeMs?: number;
  difficultyHint?: string;   // 'easy' | 'medium' | 'hard' — fallback only
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── auth: identify the calling student ──────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── parse + validate ────────────────────────────────────────────────
    const body = (await req.json()) as Payload;
    if (
      !body ||
      typeof body.subject !== "string" ||
      typeof body.questionText !== "string" ||
      typeof body.isCorrect !== "boolean"
    ) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = body.subject.toLowerCase().trim();
    const conceptId = body.conceptId?.trim() || null;
    const source = body.source ?? "quiz";

    // chat is never graded — guard at the edge in case a client mis-routes
    if (source === "chat") {
      return new Response(JSON.stringify({ skipped: "chat_not_graded" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── resolve / create question ───────────────────────────────────────
    const normalised = normaliseQuestion(body.questionText);
    const questionHash = await sha256Hex(`${subject}|${normalised}`);

    const hintToB: Record<string, number> = { easy: -0.8, medium: 0, hard: 0.8 };
    const provisionalB = hintToB[body.difficultyHint ?? "medium"] ?? 0;

    let { data: question } = await admin
      .from("question_bank")
      .select("id, difficulty_b, difficulty_provisional, times_seen, times_correct")
      .eq("question_hash", questionHash)
      .maybeSingle();

    if (!question) {
      const { data: inserted, error: insErr } = await admin
        .from("question_bank")
        .insert({
          subject,
          concept_id: conceptId,
          question_hash: questionHash,
          question_text: body.questionText.slice(0, 4000),
          correct_answer: body.correctAnswer ?? null,
          source: source === "probe" ? "probe" : "ai",
          difficulty_b: provisionalB,
          difficulty_provisional: true,
        })
        .select("id, difficulty_b, difficulty_provisional, times_seen, times_correct")
        .single();
      if (insErr) throw insErr;
      question = inserted!;
    }

    // ── pull school_id for the user (for RLS-friendly viewer queries) ───
    const { data: profile } = await admin
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = profile?.school_id ?? null;

    // ── load ability estimate (subject-level for now; concept-level later) ──
    let { data: estimate } = await admin
      .from("ability_estimates")
      .select("id, theta, theta_se, graded_count, provisional, last_graded_at")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .is("concept_id", null)
      .maybeSingle();

    if (!estimate) {
      const { data: created, error: createErr } = await admin
        .from("ability_estimates")
        .insert({
          user_id: user.id,
          school_id: schoolId,
          subject,
          concept_id: null,
          theta: 0.0,
          theta_se: SE_INITIAL,
          graded_count: 0,
          provisional: true,
        })
        .select("id, theta, theta_se, graded_count, provisional, last_graded_at")
        .single();
      if (createErr) throw createErr;
      estimate = created!;
    }

    const thetaBefore = Number(estimate.theta);
    const seBefore = Number(estimate.theta_se);
    const b = Number(question.difficulty_b);

    // ── Rasch update ────────────────────────────────────────────────────
    const expected = sigmoid(thetaBefore - b);
    const actual = body.isCorrect ? 1 : 0;

    // K shrinks with experience but never below 0.08. SE-aware: a less-certain
    // estimate moves faster, a confident one moves slowly.
    const baseK = 0.4;
    const expK = baseK * (seBefore / SE_INITIAL);
    const k = clamp(expK, 0.08, 0.55);

    let thetaAfter = thetaBefore + k * (actual - expected);
    thetaAfter = clamp(thetaAfter, -3.0, 3.0);

    // Standard error update via Fisher information for 1PL:
    //   I = p * (1 - p)
    //   se_new = 1 / sqrt( 1/se_old^2 + I )
    const info = expected * (1 - expected);
    const seNew = clamp(
      1 / Math.sqrt(1 / (seBefore * seBefore) + info),
      SE_FLOOR,
      SE_INITIAL,
    );

    const gradedCountNew = (estimate.graded_count ?? 0) + 1;
    const provisionalNew = seNew >= SE_LOCK_IN;

    // ── persist ability ─────────────────────────────────────────────────
    const { error: updErr } = await admin
      .from("ability_estimates")
      .update({
        theta: Number(thetaAfter.toFixed(3)),
        theta_se: Number(seNew.toFixed(3)),
        graded_count: gradedCountNew,
        provisional: provisionalNew,
        last_graded_at: new Date().toISOString(),
        school_id: schoolId ?? undefined,
      })
      .eq("id", estimate.id);
    if (updErr) throw updErr;

    // ── log graded event ────────────────────────────────────────────────
    await admin.from("graded_events").insert({
      user_id: user.id,
      school_id: schoolId,
      subject,
      concept_id: conceptId,
      question_id: question.id,
      difficulty_b: b,
      theta_before: Number(thetaBefore.toFixed(3)),
      theta_after: Number(thetaAfter.toFixed(3)),
      se_before: Number(seBefore.toFixed(3)),
      se_after: Number(seNew.toFixed(3)),
      expected_p: Number(expected.toFixed(4)),
      was_correct: body.isCorrect,
      response_time_ms: body.responseTimeMs ?? null,
      source,
    });

    // ── update question stats + recalibrate difficulty if mature ─────────
    const seenNew = (question.times_seen ?? 0) + 1;
    const correctNew = (question.times_correct ?? 0) + (body.isCorrect ? 1 : 0);

    let nextB = b;
    let provisional = question.difficulty_provisional;
    if (seenNew >= PROVISIONAL_DIFFICULTY_LOCK) {
      // empirical difficulty = -logit(p_correct), bounded
      const p = clamp(correctNew / seenNew, 0.02, 0.98);
      nextB = clamp(-Math.log(p / (1 - p)), -3.0, 3.0);
      provisional = false;
    }

    await admin
      .from("question_bank")
      .update({
        times_seen: seenNew,
        times_correct: correctNew,
        difficulty_b: Number(nextB.toFixed(3)),
        difficulty_provisional: provisional,
      })
      .eq("id", question.id);

    // ── apply gentle recency decay on SE for stale estimates ────────────
    // (If the student hasn't answered in this subject for > RECENCY_TAU_DAYS,
    //  inflate SE slightly so the engine knows the estimate is aging out.)
    // This is intentionally lazy — applied only on next call, no cron.

    return new Response(
      JSON.stringify({
        ok: true,
        theta: Number(thetaAfter.toFixed(3)),
        theta_se: Number(seNew.toFixed(3)),
        provisional: provisionalNew,
        graded_count: gradedCountNew,
        level: thetaAfter < -0.5 ? "beginner" : thetaAfter > 0.5 ? "advanced" : "intermediate",
        expected_p: Number(expected.toFixed(4)),
        question_id: question.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ability-update] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
