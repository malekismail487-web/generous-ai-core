// ============================================================================
//  ability-update edge function  —  Adaptive Intelligence v3.0 (Stage 1)
// ----------------------------------------------------------------------------
//  Server-side 2PL IRT update + parallel Elo fast-track, with:
//    • Per-item discrimination `a` (was implicit a=1 in v2.x).
//    • Fisher information weighted by quality (source trust × speed sanity ×
//      guess/slip detection) — preserves all v2 gating, now under 2PL.
//    • Probabilistic concept assignment (soft distribution, weighted updates).
//    • Hierarchical Bayesian coupling (concept theta pulled to subject theta).
//    • Per-answer drift correction on `b` (dynamic difficulty self-healing).
//    • Parallel Elo rating updates for student and item with adaptive K.
//      Elo settles new items in ~10 answers; 2PL converges over ~30. The two
//      coexist; downstream consumers can blend (Stage 2 ensemble).
//
//  All writes use the service role so students cannot tamper with their own
//  ability score by hitting the database directly.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  step2pl,
  eloStep,
  A_MIN,
  A_MAX,
  SE_INITIAL,
  SE_LOCK_IN,
  SE_FLOOR,
  ELO_INITIAL,
  clamp as clamp2,
  sigmoid as sigmoid2,
} from "../_shared/irt2pl.ts";
import { pushKtInteraction } from "../_shared/ktSequence.ts";
import { persistFsrsCard } from "../_shared/fsrsState.ts";
import { applyReward as applyBanditReward } from "../_shared/banditState.ts";
import { attachEnsembleOutcome } from "../_shared/ensemblePredictionLog.ts";
import { fetchHierarchicalPrior } from "../_shared/coldStart.ts";
import { getRuntimeConfig } from "../_shared/runtimeConfig.ts";
import { rtConfidenceWeight } from "../_shared/responseTime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── tunables ───────────────────────────────────────────────────────────────
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

const sigmoid = sigmoid2;
const clamp = clamp2;


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
      .select(
        "id, difficulty_b, discrimination_a, difficulty_provisional, times_seen, times_correct, confidence, elo_rating, elo_count",
      )
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
          // discrimination_a defaults to 1.000 (Rasch-equivalent until the
          // nightly recalibrator has ≥50 responses to fit a real value).
          // elo_rating defaults to 1500.
        })
        .select(
          "id, difficulty_b, discrimination_a, difficulty_provisional, times_seen, times_correct, confidence, elo_rating, elo_count",
        )
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

    // Stage 12 §2 — smooth, log-normal response-time weighting. Replaces the
    // legacy <1.5s binary penalty. The hard guess/slip detector below still
    // applies for the extreme tails; the smooth weight removes the
    // discontinuity at the threshold and reduces variance everywhere else.
    const runtimeCfg = await getRuntimeConfig(admin);
    const rtWeight = rtConfidenceWeight(
      body.responseTimeMs ?? null,
      body.isCorrect,
      { rtMidpointMs: runtimeCfg.rtMidpointMs, rtSpreadLog: runtimeCfg.rtSpreadLog },
    );

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
      .select("theta, elo_rating, elo_count")
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

    // Stage 12 §2 — replace the binary speedPenalty with the smooth weight,
    // composed multiplicatively with source trust and the guess/slip signal.
    const baseResponseConfidence = srcTrust * rtWeight.weight * guessSlipPenalty;

    // ── 2PL update helpers ─────────────────────────────────────────────
    interface EstimateRow {
      id: string;
      theta: number;
      theta_se: number;
      graded_count: number;
      provisional: boolean;
      elo_rating: number;
      elo_count: number;
    }

    async function loadOrSeedEstimate(
      conceptKey: string | null,
      seed: { theta: number; se: number },
    ): Promise<EstimateRow> {
      let query = admin
        .from("ability_estimates")
        .select("id, theta, theta_se, graded_count, provisional, elo_rating, elo_count")
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
          elo_rating: Number(existing.elo_rating ?? ELO_INITIAL),
          elo_count: existing.elo_count ?? 0,
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
          elo_rating: ELO_INITIAL,
          elo_count: 0,
        })
        .select("id, theta, theta_se, graded_count, provisional, elo_rating, elo_count")
        .single();
      if (createErr) throw createErr;
      return {
        id: created!.id,
        theta: Number(created!.theta),
        theta_se: Number(created!.theta_se),
        graded_count: created!.graded_count ?? 0,
        provisional: Boolean(created!.provisional),
        elo_rating: Number(created!.elo_rating ?? ELO_INITIAL),
        elo_count: created!.elo_count ?? 0,
      };
    }

    interface IrtResult {
      thetaAfter: number;
      seAfter: number;
      gradedCount: number;
      provisional: boolean;
      expected: number;
      kEffective: number;
    }

    /**
     * One online 2PL step with gating. Delegates to the shared `step2pl`,
     * then adapts the result to this function's persistence model.
     *
     * `quality` ∈ [0,1] folds source trust, speed sanity, guess/slip into
     * the Fisher-information weight so a low-confidence response can never
     * collapse SE prematurely.
     */
    function runIrt(prior: EstimateRow, a: number, b: number, quality: number): IrtResult {
      const step = step2pl(
        { theta: prior.theta, thetaSe: prior.theta_se, gradedCount: prior.graded_count },
        a,
        b,
        body.isCorrect,
        quality,
        K_BASE,
      );
      return {
        thetaAfter: step.thetaAfter,
        seAfter: step.seAfter,
        gradedCount: prior.graded_count + 1,
        provisional: step.seAfter >= SE_LOCK_IN,
        expected: step.expected,
        kEffective: step.kEffective,
      };
    }

    async function persistEstimate(
      row: EstimateRow,
      next: IrtResult,
      eloAfter?: { rating: number; count: number },
    ) {
      const update: Record<string, unknown> = {
        theta: Number(next.thetaAfter.toFixed(3)),
        theta_se: Number(next.seAfter.toFixed(3)),
        graded_count: next.gradedCount,
        provisional: next.provisional,
        last_graded_at: new Date().toISOString(),
        school_id: schoolId ?? undefined,
      };
      if (eloAfter) {
        update.elo_rating = Number(eloAfter.rating.toFixed(2));
        update.elo_count = eloAfter.count;
      }
      const { error: updErr } = await admin
        .from("ability_estimates")
        .update(update)
        .eq("id", row.id);
      if (updErr) throw updErr;
    }

    const b = Number(question.difficulty_b);
    const a = clamp(Number(question.discrimination_a ?? 1.0), A_MIN, A_MAX);
    const itemEloIn = Number(question.elo_rating ?? ELO_INITIAL);
    const itemEloCountIn = question.elo_count ?? 0;

    // ── subject-level update (always, weight = 1.0) ────────────────────
    const subjectQuality = clamp(1.0 * questionConfidence * baseResponseConfidence, 0.15, 1.0);

    // Stage 8: warm-start the subject row from the population posterior
    // instead of flat (θ=0, SE=SE_INITIAL). Best-effort; on any failure
    // we fall back to the historical flat seed so grading never blocks.
    const subjectColdStart = await fetchHierarchicalPrior(admin, {
      schoolId, subject, conceptId: null,
    });
    const subjectPrior = await loadOrSeedEstimate(null, {
      theta: subjectColdStart.theta,
      se: subjectColdStart.se,
    });
    const subjectNext = runIrt(subjectPrior, a, b, subjectQuality);

    // Parallel Elo update (subject-level only — Elo is a global skill rating,
    // not a per-concept signal). Item Elo is shared across all students who
    // touch this question.
    const eloOut = eloStep(
      {
        studentR: subjectPrior.elo_rating,
        itemR: itemEloIn,
        studentCount: subjectPrior.elo_count,
        itemCount: itemEloCountIn,
      },
      body.isCorrect,
    );
    await persistEstimate(subjectPrior, subjectNext, {
      rating: eloOut.studentR,
      count: subjectPrior.elo_count + 1,
    });

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
      // Stage 8: per-concept cold start (concept_school → concept_global →
      // subject_* → global). Falls back to the subject prior + shrinkage we
      // used pre-Stage-8 when the priors table is empty for this concept.
      const conceptColdStart = await fetchHierarchicalPrior(admin, {
        schoolId, subject, conceptId: cw.conceptId,
      });
      const seedSe = conceptColdStart.isFallback
        ? Math.max(SE_LOCK_IN + 0.1, Math.min(SE_INITIAL, subjectPrior.theta_se * 0.85))
        : conceptColdStart.se;
      const seedTheta = conceptColdStart.isFallback
        ? subjectPrior.theta
        : conceptColdStart.theta;
      const conceptRow = await loadOrSeedEstimate(cw.conceptId, {
        theta: seedTheta,
        se: seedSe,
      });
      const conceptStep = runIrt(conceptRow, a, b, quality);

      // Hierarchical Bayesian coupling: pull concept theta gently toward the
      // updated subject theta so single-concept noise doesn't fly away.
      const coupled = clamp(
        conceptStep.thetaAfter + COUPLING_LAMBDA * (subjectNext.thetaAfter - conceptStep.thetaAfter),
        -3.0,
        3.0,
      );
      const coupledNext: IrtResult = { ...conceptStep, thetaAfter: coupled };
      // Concept rows don't get Elo (subject-level only) — keep it clean.
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
    // a wildly mis-tagged question starts converging immediately. We use the
    // 2PL expected probability (which incorporates `a`) so a high-`a` item
    // converges faster than a flat one — that's the desired behaviour.
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
        elo_rating: Number(eloOut.itemR.toFixed(2)),
        elo_count: itemEloCountIn + 1,
      })
      .eq("id", question.id);

    // ── Stage 2: append to the rolling KT sequence so kt-predict has fresh
    // context next time. Non-fatal: a KT write failure must NEVER bubble up
    // and fail an otherwise-valid grade.
    await pushKtInteraction(admin, {
      userId: user.id,
      schoolId,
      subject,
      interaction: {
        cid: dominantConcept ?? "_subj",
        qid: question.id,
        c: body.isCorrect ? 1 : 0,
        ts: Date.now(),
        rt: body.responseTimeMs ?? undefined,
        a: Number(a.toFixed(3)),
        b: Number(nextB.toFixed(3)),
      },
    });

    // ── Stage 4: roll the FSRS-v5 card state forward. We touch one row per
    // (user, subject, concept) so every concept the answer touched gets a
    // refreshed retention curve. Subject-level row (concept_id=null) tracks
    // global subject retention for cold-start prediction.
    const fast = typeof body.responseTimeMs === "number"
      && body.responseTimeMs > 0 && body.responseTimeMs < 4000;
    await persistFsrsCard(admin, {
      userId: user.id, schoolId, subject, conceptId: null,
      isCorrect: body.isCorrect, fastResponse: fast,
    });
    for (const cw of distribution) {
      await persistFsrsCard(admin, {
        userId: user.id, schoolId, subject, conceptId: cw.conceptId,
        isCorrect: body.isCorrect, fastResponse: fast,
      });
    }

    // ── Stage 6: attach the graded outcome as the LinUCB reward signal for
    // the most-recent unrewarded teaching-generate decision on this
    // (user, subject, dominant-concept). Best-effort — a failure here must
    // never bubble up and break grading.
    try {
      await applyBanditReward(admin, {
        userId: user.id,
        subject,
        conceptId: dominantConcept,
        isCorrect: body.isCorrect,
      });
    } catch (e) {
      console.warn("[ability-update] bandit reward attach failed:", e);
    }

    // ── Stage 7: attach the observed correctness to the most-recent
    // unrewarded `ensemble_predictions` row so retrain-ensemble has a
    // labeled training set. Best-effort — same isolation contract as bandit.
    try {
      await attachEnsembleOutcome(admin, {
        userId: user.id,
        subject,
        conceptId: dominantConcept,
        isCorrect: body.isCorrect,
      });
    } catch (e) {
      console.warn("[ability-update] ensemble outcome attach failed:", e);
    }




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
        // Stage 1 additions: 2PL discrimination + Elo fast-track results.
        discrimination_a: Number(a.toFixed(3)),
        elo: {
          student_rating: Number(eloOut.studentR.toFixed(2)),
          item_rating: Number(eloOut.itemR.toFixed(2)),
          expected: Number(eloOut.expected.toFixed(4)),
          k: eloOut.k,
        },
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
