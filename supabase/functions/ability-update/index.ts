// ============================================================================
//  ability-update edge function  —  Adaptive Intelligence v2.1
// ----------------------------------------------------------------------------
//  Server-side IRT (Rasch / 1PL) update with:
//    • Probabilistic concept assignment (soft distribution, weighted updates)
//    • Hierarchical Bayesian coupling   (concept theta gently pulled to subject)
//    • Dynamic difficulty self-healing  (b nudge on every answer)
//    • Uncertainty-aware update gating  (K scaled by signal quality)
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
const SE_LOCK_IN = 0.4;
const SE_FLOOR = 0.18;
const SE_INITIAL = 1.5;
const PROVISIONAL_DIFFICULTY_LOCK = 20;
const DYNAMIC_B_ALPHA = 0.02;         // per-answer drift correction for difficulty_b
const COUPLING_LAMBDA = 0.05;         // concept→subject pull strength
const K_BASE = 0.4;                   // base Rasch step before gating

// gating: response-source trust
const SOURCE_TRUST: Record<string, number> = {
  exam: 1.0,
  assignment: 0.95,
  quiz: 0.9,
  probe: 0.85,
  ai_practice: 0.7,
  self_graded: 0.4,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

interface ConceptWeightIn {
  conceptId: string;
  weight: number;
}

interface Payload {
  subject: string;
  conceptId?: string | null;                    // legacy single-concept
  conceptDistribution?: ConceptWeightIn[];      // v2.1 soft distribution
  questionText: string;
  correctAnswer?: string | null;
  studentAnswer?: string | null;
  isCorrect: boolean;
  source?: string;
  responseTimeMs?: number;
  difficultyHint?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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
    const source = body.source ?? "quiz";

    if (source === "chat") {
      return new Response(JSON.stringify({ skipped: "chat_not_graded" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── normalise concept distribution ─────────────────────────────────
    // Accept either v2.1 distribution OR legacy single conceptId.
    let distribution: ConceptWeightIn[] = [];
    if (Array.isArray(body.conceptDistribution) && body.conceptDistribution.length) {
      const sum = body.conceptDistribution.reduce((s, c) => s + Math.max(0, c.weight || 0), 0);
      if (sum > 0) {
        distribution = body.conceptDistribution
          .filter((c) => c.conceptId && c.weight > 0)
          .map((c) => ({ conceptId: c.conceptId.trim(), weight: c.weight / sum }))
          .slice(0, 4);
      }
    } else if (body.conceptId) {
      distribution = [{ conceptId: body.conceptId.trim(), weight: 1.0 }];
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── resolve / create question ──────────────────────────────────────
    const normalised = normaliseQuestion(body.questionText);
    const questionHash = await sha256Hex(`${subject}|${normalised}`);

    const hintToB: Record<string, number> = { easy: -0.8, medium: 0, hard: 0.8 };
    const provisionalB = hintToB[body.difficultyHint ?? "medium"] ?? 0;
    const dominantConcept = distribution[0]?.conceptId ?? null;

    let { data: question } = await admin
      .from("question_bank")
      .select("id, difficulty_b, difficulty_provisional, times_seen, times_correct, confidence")
      .eq("question_hash", questionHash)
      .maybeSingle();

    if (!question) {
      const { data: inserted, error: insErr } = await admin
        .from("question_bank")
        .insert({
          subject,
          concept_id: dominantConcept,
          question_hash: questionHash,
          question_text: body.questionText.slice(0, 4000),
          correct_answer: body.correctAnswer ?? null,
          source: source === "probe" ? "probe" : "ai",
          difficulty_b: provisionalB,
          difficulty_provisional: true,
        })
        .select("id, difficulty_b, difficulty_provisional, times_seen, times_correct, confidence")
        .single();
      if (insErr) throw insErr;
      question = inserted!;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = profile?.school_id ?? null;

    // ── gating: compute K quality factor ───────────────────────────────
    const seenCurrent = question.times_seen ?? 0;
    const questionConfidence = clamp(seenCurrent / 20, 0.25, 1.0);
    const srcTrust = SOURCE_TRUST[source] ?? 0.7;
    const speedPenalty =
      typeof body.responseTimeMs === "number" &&
      body.responseTimeMs > 0 &&
      body.responseTimeMs < 1500
        ? 0.7
        : 1.0;

    // ── guess / slip detection (3PL-lite) ──────────────────────────────
    // A "guess" = correct answer on a question far above the student's
    // current ability with a suspiciously fast response time.
    // A "slip"  = wrong answer on a question well below the student's
    // current ability after a recent run of correct answers (fatigue/click).
    // Both signals get dampened so a single anomalous event doesn't yank theta.
    const bForGuess = Number(question.difficulty_b);
    let guessSlipPenalty = 1.0;
    // We need the prior subject theta to judge guess/slip, so peek now.
    const { data: priorSubject } = await admin
      .from("ability_estimates")
      .select("theta")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .is("concept_id", null)
      .maybeSingle();
    const priorTheta = priorSubject ? Number(priorSubject.theta) : 0;
    const rt = body.responseTimeMs ?? null;
    if (body.isCorrect && bForGuess - priorTheta >= 1.2 && rt !== null && rt > 0 && rt < 4000) {
      guessSlipPenalty = 0.45; // very likely a guess
    } else if (!body.isCorrect && priorTheta - bForGuess >= 1.2) {
      // Slip — check if the last 3 events on this subject were correct.
      const { data: recent } = await admin
        .from("graded_events")
        .select("was_correct")
        .eq("user_id", user.id)
        .eq("subject", subject)
        .order("created_at", { ascending: false })
        .limit(3);
      const lastThreeRight = (recent ?? []).filter((r) => r.was_correct).length >= 3;
      if (lastThreeRight) guessSlipPenalty = 0.5;
    }

    const baseResponseConfidence = srcTrust * speedPenalty * guessSlipPenalty;

    // ── Rasch update helpers ───────────────────────────────────────────
    interface EstimateRow {
      id: string;
      theta: number;
      theta_se: number;
      graded_count: number;
      provisional: boolean;
    }

    async function loadOrSeedEstimate(
      conceptKey: string | null,
      seed: { theta: number; se: number },
    ): Promise<EstimateRow> {
      let query = admin
        .from("ability_estimates")
        .select("id, theta, theta_se, graded_count, provisional")
        .eq("user_id", user.id)
        .eq("subject", subject);
      query = conceptKey === null
        ? query.is("concept_id", null)
        : query.eq("concept_id", conceptKey);

      const { data: existing } = await query.maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          theta: Number(existing.theta),
          theta_se: Number(existing.theta_se),
          graded_count: existing.graded_count ?? 0,
          provisional: Boolean(existing.provisional),
        };
      }

      const { data: created, error: createErr } = await admin
        .from("ability_estimates")
        .insert({
          user_id: user.id,
          school_id: schoolId,
          subject,
          concept_id: conceptKey,
          theta: Number(seed.theta.toFixed(3)),
          theta_se: Number(seed.se.toFixed(3)),
          graded_count: 0,
          provisional: true,
        })
        .select("id, theta, theta_se, graded_count, provisional")
        .single();
      if (createErr) throw createErr;
      return {
        id: created!.id,
        theta: Number(created!.theta),
        theta_se: Number(created!.theta_se),
        graded_count: created!.graded_count ?? 0,
        provisional: Boolean(created!.provisional),
      };
    }

    interface RaschResult {
      thetaAfter: number;
      seAfter: number;
      gradedCount: number;
      provisional: boolean;
      expected: number;
      kEffective: number;
    }

    /**
     * One Rasch step with gating. `quality` ∈ [0,1] scales the step:
     *   K_effective = K_base * SE_ratio * quality
     */
    function runRasch(prior: EstimateRow, b: number, quality: number): RaschResult {
      const expected = sigmoid(prior.theta - b);
      const actual = body.isCorrect ? 1 : 0;
      const expK = K_BASE * (prior.theta_se / SE_INITIAL);
      const k = clamp(expK * quality, 0.02, 0.55);
      const thetaAfter = clamp(prior.theta + k * (actual - expected), -3.0, 3.0);
      const info = expected * (1 - expected) * quality; // weighted Fisher info
      const seAfter = clamp(
        1 / Math.sqrt(1 / (prior.theta_se * prior.theta_se) + info),
        SE_FLOOR,
        SE_INITIAL,
      );
      const gradedCount = prior.graded_count + 1;
      return {
        thetaAfter,
        seAfter,
        gradedCount,
        provisional: seAfter >= SE_LOCK_IN,
        expected,
        kEffective: k,
      };
    }

    async function persistEstimate(row: EstimateRow, next: RaschResult) {
      const { error: updErr } = await admin
        .from("ability_estimates")
        .update({
          theta: Number(next.thetaAfter.toFixed(3)),
          theta_se: Number(next.seAfter.toFixed(3)),
          graded_count: next.gradedCount,
          provisional: next.provisional,
          last_graded_at: new Date().toISOString(),
          school_id: schoolId ?? undefined,
        })
        .eq("id", row.id);
      if (updErr) throw updErr;
    }

    const b = Number(question.difficulty_b);

    // ── subject-level update (always, weight = 1.0) ────────────────────
    const subjectQuality = clamp(1.0 * questionConfidence * baseResponseConfidence, 0.15, 1.0);
    const subjectPrior = await loadOrSeedEstimate(null, { theta: 0, se: SE_INITIAL });
    const subjectNext = runRasch(subjectPrior, b, subjectQuality);
    await persistEstimate(subjectPrior, subjectNext);

    // ── concept-level updates (weighted, one row per concept in dist) ──
    const conceptResults: Array<{
      concept_id: string;
      weight: number;
      theta: number;
      theta_se: number;
      provisional: boolean;
      graded_count: number;
      k_effective: number;
    }> = [];

    for (const cw of distribution) {
      const quality = clamp(cw.weight * questionConfidence * baseResponseConfidence, 0.15, 1.0);
      const seedSe = Math.max(
        SE_LOCK_IN + 0.1,
        Math.min(SE_INITIAL, subjectPrior.theta_se * 0.85),
      );
      const conceptRow = await loadOrSeedEstimate(cw.conceptId, {
        theta: subjectPrior.theta,
        se: seedSe,
      });
      const conceptStep = runRasch(conceptRow, b, quality);

      // Hierarchical Bayesian coupling: pull concept theta gently toward the
      // updated subject theta so single-concept noise doesn't fly away.
      const coupled = clamp(
        conceptStep.thetaAfter + COUPLING_LAMBDA * (subjectNext.thetaAfter - conceptStep.thetaAfter),
        -3.0,
        3.0,
      );
      const coupledNext: RaschResult = { ...conceptStep, thetaAfter: coupled };
      await persistEstimate(conceptRow, coupledNext);

      conceptResults.push({
        concept_id: cw.conceptId,
        weight: cw.weight,
        theta: Number(coupled.toFixed(3)),
        theta_se: Number(coupledNext.seAfter.toFixed(3)),
        provisional: coupledNext.provisional,
        graded_count: coupledNext.gradedCount,
        k_effective: Number(coupledNext.kEffective.toFixed(3)),
      });
    }

    // ── audit: graded_events (with gating + concept weight) ────────────
    await admin.from("graded_events").insert({
      user_id: user.id,
      school_id: schoolId,
      subject,
      concept_id: dominantConcept,
      question_id: question.id,
      difficulty_b: b,
      theta_before: Number(subjectPrior.theta.toFixed(3)),
      theta_after: Number(subjectNext.thetaAfter.toFixed(3)),
      se_before: Number(subjectPrior.theta_se.toFixed(3)),
      se_after: Number(subjectNext.seAfter.toFixed(3)),
      expected_p: Number(subjectNext.expected.toFixed(4)),
      was_correct: body.isCorrect,
      response_time_ms: body.responseTimeMs ?? null,
      source,
      concept_weight: distribution[0]?.weight ?? null,
      k_effective: Number(subjectNext.kEffective.toFixed(3)),
    });

    // ── dynamic difficulty self-healing + empirical lock-in ────────────
    const seenNew = seenCurrent + 1;
    const correctNew = (question.times_correct ?? 0) + (body.isCorrect ? 1 : 0);
    const actual = body.isCorrect ? 1 : 0;

    let nextB = b;
    let provisional = question.difficulty_provisional;

    // Per-answer drift correction — fires from the very first answer so that
    // a wildly mis-tagged question starts converging immediately.
    nextB = clamp(nextB + DYNAMIC_B_ALPHA * (actual - subjectNext.expected) * -1, -3.0, 3.0);
    // ↑ Note the −1: if the student got it right but we expected a miss, the
    // question was easier than tagged → b should *decrease*. (Observed > expected
    // success rate ⇒ b too high.)

    if (seenNew >= PROVISIONAL_DIFFICULTY_LOCK) {
      const p = clamp(correctNew / seenNew, 0.02, 0.98);
      nextB = clamp(-Math.log(p / (1 - p)), -3.0, 3.0);
      provisional = false;
    }

    const newConfidence = clamp(seenNew / 30, 0, 1);

    await admin
      .from("question_bank")
      .update({
        times_seen: seenNew,
        times_correct: correctNew,
        difficulty_b: Number(nextB.toFixed(3)),
        difficulty_provisional: provisional,
        confidence: Number(newConfidence.toFixed(3)),
      })
      .eq("id", question.id);

    return new Response(
      JSON.stringify({
        ok: true,
        theta: Number(subjectNext.thetaAfter.toFixed(3)),
        theta_se: Number(subjectNext.seAfter.toFixed(3)),
        provisional: subjectNext.provisional,
        graded_count: subjectNext.gradedCount,
        level:
          subjectNext.thetaAfter < -0.5
            ? "beginner"
            : subjectNext.thetaAfter > 0.5
              ? "advanced"
              : "intermediate",
        expected_p: Number(subjectNext.expected.toFixed(4)),
        question_id: question.id,
        // Back-compat: dominant concept under `concept`, full breakdown under `concepts`
        concept: conceptResults[0] ?? null,
        concepts: conceptResults,
        gating: {
          question_confidence: Number(questionConfidence.toFixed(3)),
          response_confidence: Number(baseResponseConfidence.toFixed(3)),
        },
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
