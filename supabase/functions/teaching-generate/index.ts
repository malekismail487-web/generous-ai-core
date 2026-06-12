// POST /teaching/generate
// Unified Adaptation → Teaching Output V2 pipeline.
//   1. Auth + authorization (per-student RLS via can_view_student_mastery)
//   2. Load adaptive state (θ, SE, mastery, lecture mastery, visual pref)
//   3. buildTeachingStateVector → deriveTeachingRegime → buildTeachingTrajectory
//   4. buildPolicyPrompt → AI call (Lovable AI Gateway)
//   5. enforcePolicy → return { policy, regime, trajectory, stateVector, content, missingSteps, ... }
//
// REINFORCEMENT CLAUSE (mirrors src/lib/adaptive/teachingOutputV2.ts):
//   - Determinism: pure functions below have no Date/Math.random/IO.
//   - Isolation: state loads are scoped to the authorized studentId only.
//   - Single source of truth: this file MUST stay byte-equivalent in
//     behaviour to teachingOutputV2.ts. Drift is policed by
//     scripts/teachingOutputDeterminism.test.ts.
//   - No schema change. No cross-student reads.
//   - Backward-compat: `policy` field retained for existing callers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sigmoid as sig2pl, ELO_INITIAL } from "../_shared/irt2pl.ts";
import { aktPredict, AKT_DEFAULTS, type KtInteraction } from "../_shared/akt.ts";
import { dashPredictFromHistory, type DashInteraction } from "../_shared/dash.ts";
import { blendPredictions, eloProbability, ENSEMBLE_DEFAULTS, type EnsembleWeights } from "../_shared/ensemble.ts";
import { applyCalibration } from "../_shared/calibration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ════════════════════════════════════════════════════════════════════
// Inlined deterministic pipeline — MUST match src/lib/adaptive/teachingOutputV2.ts
// ════════════════════════════════════════════════════════════════════

type Difficulty = "low" | "medium" | "high";
type Pacing = "slow" | "normal" | "fast";
type Strategy = "worked_example" | "explanation" | "quiz" | "visual";
type RegimeMode = "remediate" | "consolidate" | "advance" | "challenge";
type StepKind =
  | "hook" | "explain" | "worked_example"
  | "check" | "practice" | "reflect";

interface TeachingPolicy {
  difficulty: Difficulty; pacing: Pacing; strategy: Strategy;
  cognitiveLoad: number; remediationLevel: number;
  verificationFrequency: number; abstractionLevel: number;
}
interface TeachingStateVector {
  theta: number; standardError: number;
  mastery: number; lectureMastery: number;
  errorCount: number; conceptDifficulty: number;
  visualPreference: boolean; fatigue: number;
  // Stage 1 additions — the 2PL quartet.
  discrimination: number;
  expectedP: number;
  // Stage 2 addition — the calibrated ensemble probability of correct on the
  // next item. Equals `expectedP` when no KT context is available; otherwise
  // blends {2PL, Elo, AKT-lite, DASH}. The derive* functions prefer this when
  // present because it incorporates forgetting, sequence dynamics, and Elo
  // fast-drift that the 2PL scalar alone cannot see.
  ensembleP: number;
  ensembleComponents?: { p_2pl: number; p_elo: number; p_akt: number; p_dash: number };
}
interface TeachingRegime {
  mode: RegimeMode; intensity: number;
  abstractionBias: number; verificationBias: number;
}
interface TeachingStep {
  kind: StepKind; cognitiveLoad: number;
  expectedDurationSec: number; mustVerify: boolean;
}
interface TeachingTrajectory {
  steps: TeachingStep[]; totalDurationSec: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function buildStateVector(i: {
  theta?: number; standardError?: number; mastery?: number;
  lectureMastery?: number; errorCount?: number;
  conceptDifficulty?: number; visualPreference?: boolean; fatigue?: number;
  discrimination?: number; conceptMeanB?: number;
  ensembleP?: number;
  ensembleComponents?: { p_2pl: number; p_elo: number; p_akt: number; p_dash: number };
}): TeachingStateVector {
  const theta = Number.isFinite(i.theta) ? (i.theta as number) : 0;
  const discrimination = clamp(i.discrimination ?? 1.0, 0.3, 2.5);
  const conceptMeanB = clamp(i.conceptMeanB ?? 0, -3, 3);
  const expectedP = clamp(sigmoid(discrimination * (theta - conceptMeanB)), 0.01, 0.99);
  // Stage 2: ensembleP defaults to expectedP so the pipeline degrades
  // gracefully to pure 2PL when KT context is unavailable (cold start,
  // new subject, etc.). When the ensemble fires, it strictly dominates.
  const ensembleP = clamp(
    Number.isFinite(i.ensembleP) ? (i.ensembleP as number) : expectedP,
    0.01, 0.99,
  );
  return {
    theta,
    standardError: clamp(i.standardError ?? 1.0, 0, 3),
    mastery: clamp(i.mastery ?? 0.5, 0, 1),
    lectureMastery: clamp(i.lectureMastery ?? 0.5, 0, 1),
    errorCount: Math.max(0, Math.floor(i.errorCount ?? 0)),
    conceptDifficulty: clamp(i.conceptDifficulty ?? 1.0, 0, 3),
    visualPreference: !!i.visualPreference,
    fatigue: clamp(i.fatigue ?? 0, 0, 1),
    discrimination,
    expectedP,
    ensembleP,
    ensembleComponents: i.ensembleComponents,
  };
}

function derivePolicy(v: TeachingStateVector): TeachingPolicy {
  // Stage 2: drive policy off the ensemble probability, which incorporates
  // forgetting (DASH), sequence dynamics (AKT-lite), and fast Elo drift in
  // addition to the 2PL prior. The 0.45 / 0.75 breakpoints still align with
  // the 85% rule.
  const p = v.ensembleP;
  const difficulty: Difficulty = p > 0.75 ? "low" : p < 0.45 ? "high" : "medium";
  const pacing: Pacing =
    (v.standardError > 0.55 || v.errorCount >= 3 || v.mastery < 0.35) ? "slow" :
    (v.standardError < 0.30 && v.mastery > 0.75 && v.errorCount === 0) ? "fast" : "normal";
  let strategy: Strategy;
  if (v.mastery < 0.35 || v.errorCount >= 3) strategy = "worked_example";
  else if (v.mastery < 0.65) strategy = "explanation";
  else if (v.visualPreference && v.mastery < 0.85) strategy = "visual";
  else strategy = "quiz";
  return {
    difficulty, pacing, strategy,
    cognitiveLoad: r2(clamp(0.35 + v.mastery * 0.4 - v.errorCount * 0.05, 0.2, 0.85)),
    remediationLevel: r2(clamp((1 - v.mastery) * 0.8 + Math.min(v.errorCount, 5) * 0.05, 0, 1)),
    verificationFrequency: r2(clamp(0.25 + v.standardError * 0.4 + (1 - v.mastery) * 0.3, 0.2, 0.95)),
    abstractionLevel: r2(clamp(v.lectureMastery * 0.7 + v.mastery * 0.3, 0.1, 0.95)),
  };
}

function deriveRegime(v: TeachingStateVector): TeachingRegime {
  // Stage 2: regime selection anchors on the ensemble probability, with the
  // same 85%-rule breakpoints. Mastery + error-count remain hard overrides
  // so the regime never advances past a real performance failure regardless
  // of what the predictor says.
  const p = v.ensembleP;
  let mode: RegimeMode;
  if (v.mastery < 0.35 || v.errorCount >= 3) mode = "remediate";
  else if (p < 0.40)                         mode = "remediate";
  else if (p < 0.65)                         mode = "consolidate";
  else if (p < 0.85)                         mode = "advance";
  else                                       mode = "challenge";

  const intensity = clamp(
    0.4 + v.standardError * 0.35 + (1 - p) * 0.25
      - v.fatigue * 0.3 + (v.discrimination - 1.0) * 0.05,
    0.2, 1.0,
  );
  const abstractionBias = clamp(v.lectureMastery * 0.7 + v.mastery * 0.3, 0.1, 0.95);
  const verificationBias = clamp(
    0.25 + v.standardError * 0.4 + (1 - p) * 0.3, 0.2, 0.95,
  );
  return {
    mode,
    intensity: r2(intensity),
    abstractionBias: r2(abstractionBias),
    verificationBias: r2(verificationBias),
  };
}


function mkStep(kind: StepKind, cl: number, dur: number, v: boolean): TeachingStep {
  return { kind, cognitiveLoad: r2(cl), expectedDurationSec: dur, mustVerify: v };
}

function buildTrajectory(regime: TeachingRegime): TeachingTrajectory {
  const base: TeachingStep[] = [mkStep("hook", 0.2, 30, false)];
  switch (regime.mode) {
    case "remediate":
      base.push(mkStep("worked_example", 0.55, 90, true));
      base.push(mkStep("explain",        0.5,  75, false));
      base.push(mkStep("check",          0.4,  45, true));
      base.push(mkStep("worked_example", 0.55, 90, true));
      base.push(mkStep("practice",       0.5,  90, true));
      base.push(mkStep("reflect",        0.3,  45, false));
      break;
    case "consolidate":
      base.push(mkStep("explain",        0.5,  75, false));
      base.push(mkStep("worked_example", 0.55, 75, true));
      base.push(mkStep("check",          0.45, 45, true));
      base.push(mkStep("practice",       0.55, 90, true));
      base.push(mkStep("reflect",        0.35, 45, false));
      break;
    case "advance":
      base.push(mkStep("explain",  0.55, 75,  false));
      base.push(mkStep("check",    0.5,  45,  true));
      base.push(mkStep("practice", 0.65, 120, true));
      base.push(mkStep("reflect",  0.4,  45,  false));
      break;
    case "challenge":
      base.push(mkStep("explain",  0.6,  60,  false));
      base.push(mkStep("practice", 0.8,  150, true));
      base.push(mkStep("reflect",  0.5,  60,  false));
      break;
  }
  const keepCount = Math.max(3, Math.round(base.length * (0.6 + regime.intensity * 0.4)));
  let steps = base.slice(0, keepCount);
  if (regime.verificationBias >= 0.7) {
    steps = steps.map((s, idx) => idx === 0 ? s : { ...s, mustVerify: true });
  }
  const totalDurationSec = steps.reduce((sum, s) => sum + s.expectedDurationSec, 0);
  return { steps, totalDurationSec };
}

function buildPrompt(
  regime: TeachingRegime, trajectory: TeachingTrajectory,
  c: { conceptName?: string; lectureTitle?: string; context?: string } = {},
): string {
  const stepLines = trajectory.steps.map(
    (s, i) => `  ${i + 1}. ${s.kind} (load=${s.cognitiveLoad}, ~${s.expectedDurationSec}s${s.mustVerify ? ", verify" : ""})`,
  );
  return [
    "=== TEACHING REGIME (deterministic) ===",
    `Mode: ${regime.mode}`,
    `Intensity: ${regime.intensity}`,
    `Abstraction bias: ${regime.abstractionBias}`,
    `Verification bias: ${regime.verificationBias}`,
    "",
    "=== TEACHING TRAJECTORY (follow exactly, in order) ===",
    ...stepLines,
    `Total budget: ~${trajectory.totalDurationSec}s`,
    "",
    c.lectureTitle ? `Lecture: ${c.lectureTitle}` : "",
    c.conceptName  ? `Concept: ${c.conceptName}`  : "",
    c.context      ? `Additional context: ${c.context}` : "",
    "",
    "Generate the lesson strictly within these constraints. Each numbered",
    "step above MUST appear in the output in the same order, labelled with",
    "its step kind. Do not add steps not listed. Steps marked 'verify' must",
    "end with a comprehension check addressed to the student.",
  ].filter(Boolean).join("\n");
}

function enforce(content: string, regime: TeachingRegime, trajectory: TeachingTrajectory) {
  const lower = (content || "").toLowerCase();
  const missingSteps = trajectory.steps
    .filter((s) => !lower.includes(s.kind.replace("_", " ")) && !lower.includes(s.kind))
    .map((s) => s.kind);
  return {
    content,
    constrainedBy: {
      mode: regime.mode,
      intensity: regime.intensity,
      abstraction: regime.abstractionBias,
      verification: regime.verificationBias,
    },
    trajectory,
    missingSteps,
  };
}

// ════════════════════════════════════════════════════════════════════
// HTTP handler
// ════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const studentId: string = body.studentId || callerId;
    const lectureId: string | undefined = body.lectureId;
    const conceptId: string | undefined = body.conceptId;
    const context: string = (body.context || "").toString().slice(0, 2000);

    if (studentId !== callerId) {
      const { data: ok } = await admin.rpc("can_view_student_mastery", {
        p_viewer: callerId, p_student: studentId,
      });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }

    // Load curriculum node (scoped read; no cross-student data)
    let conceptRow: any = null;
    let lectureRow: any = null;
    if (conceptId) {
      const { data } = await admin.from("concepts").select("*").eq("id", conceptId).maybeSingle();
      conceptRow = data;
      if (conceptRow?.lecture_id) {
        const { data: l } = await admin.from("lectures").select("*").eq("id", conceptRow.lecture_id).maybeSingle();
        lectureRow = l;
      }
    } else if (lectureId) {
      const { data: l } = await admin.from("lectures").select("*").eq("id", lectureId).maybeSingle();
      lectureRow = l;
    }

    // Adaptive state: θ, SE from ability_estimates (subject-level row, concept_id IS NULL).
    // NOTE: student_learning_profiles does NOT carry theta/standard_error — the previous
    // join was a silent bug that ran the whole pipeline with θ=0, SE=1.0 regardless of
    // the student's real ability. The canonical source is `ability_estimates`.
    const subjectName = lectureRow ? await resolveSubjectName(lectureRow.subject_id) : undefined;
    let theta = 0, se = 1.5;
    if (subjectName) {
      const { data: subjAbil } = await admin
        .from("ability_estimates")
        .select("theta, theta_se")
        .eq("user_id", studentId)
        .eq("subject", subjectName)
        .is("concept_id", null)
        .maybeSingle();
      if (subjAbil) {
        theta = Number(subjAbil.theta ?? 0);
        se = Number(subjAbil.theta_se ?? 1.5);
      }
      // Prefer the concept-level estimate when it exists (hierarchical override).
      if (conceptRow) {
        const { data: conceptAbil } = await admin
          .from("ability_estimates")
          .select("theta, theta_se")
          .eq("user_id", studentId)
          .eq("subject", subjectName)
          .eq("concept_id", conceptRow.id)
          .maybeSingle();
        if (conceptAbil) {
          theta = Number(conceptAbil.theta ?? theta);
          se = Number(conceptAbil.theta_se ?? se);
        }
      }
    }

    let conceptMastery = 0.5, lectureMastery = 0.5;
    if (conceptRow) {
      const { data: cm } = await admin
        .from("concept_mastery").select("mastery_score")
        .eq("user_id", studentId).eq("concept_id", conceptRow.id).maybeSingle();
      if (cm) conceptMastery = Number(cm.mastery_score ?? 0.5);
    }
    if (lectureRow) {
      const { data: lc } = await admin.from("concepts").select("id").eq("lecture_id", lectureRow.id);
      const ids = (lc || []).map((c: any) => c.id);
      if (ids.length) {
        const { data: rows } = await admin
          .from("concept_mastery").select("mastery_score")
          .eq("user_id", studentId).in("concept_id", ids);
        if (rows && rows.length) {
          lectureMastery = rows.reduce((s: number, r: any) => s + Number(r.mastery_score ?? 0.5), 0) / rows.length;
        }
      }
    }

    // Recent error count from graded_events (last 20 on this subject).
    // FIX: column is `was_correct`, not `is_correct`. Previously this always returned 0,
    // so the pipeline never knew the student was struggling.
    let recentErrorCount = 0;
    if (subjectName) {
      const { data: ge } = await admin
        .from("graded_events").select("was_correct")
        .eq("user_id", studentId).eq("subject", subjectName)
        .order("created_at", { ascending: false }).limit(20);
      if (ge) recentErrorCount = ge.filter((r: any) => r.was_correct === false).length;
    }

    let visual = false;
    const { data: ls } = await admin
      .from("user_learning_styles" as any).select("dominant_style")
      .eq("user_id", studentId).maybeSingle();
    if (ls && (ls as any).dominant_style === "visual") visual = true;

    // Client-supplied affect signal: fatigue in 0..1 (cognitiveModel.ts normalizes
    // its 0..100 fatigueLevel into this range before invoking the function).
    // Previously hard-zero: the cognitive/emotional engines never reached the
    // deterministic teaching pipeline.
    const clientFatigue = clamp(Number(body.fatigue ?? 0), 0, 1);

    // Stage 1: pull the concept's mean (a, b) from question_bank so the
    // state vector carries a real 2PL signal (`expectedP` and `discrimination`).
    // We use means rather than picking a single representative item because
    // the actual next item hasn't been chosen yet — that's a Stage 6 (bandit)
    // responsibility. Until then, mean(a, b) is the best estimator of what
    // the next interaction will feel like.
    let conceptMeanA = 1.0, conceptMeanB = 0.0, conceptItemCount = 0;
    if (conceptRow) {
      const { data: items } = await admin
        .from("question_bank")
        .select("discrimination_a, difficulty_b")
        .eq("concept_id", conceptRow.id);
      if (items && items.length) {
        conceptItemCount = items.length;
        conceptMeanA = items.reduce((s: number, r: any) => s + Number(r.discrimination_a ?? 1.0), 0) / items.length;
        conceptMeanB = items.reduce((s: number, r: any) => s + Number(r.difficulty_b ?? 0), 0) / items.length;
      }
    }

    // ─── Stage 2: ensemble prediction ──────────────────────────────
    // Compose four component predictors {2PL, Elo, AKT-lite, DASH} and blend
    // them with user-specific (or population) weights from `ensemble_weights`.
    // The ensemble drives regime / policy via `stateVector.ensembleP`; pure
    // 2PL `expectedP` is preserved as a fallback when KT context is missing.
    let ensembleP: number | undefined;
    let ensembleComponents:
      | { p_2pl: number; p_elo: number; p_akt: number; p_dash: number }
      | undefined;
    if (subjectName) {
      try {
        let studentElo = ELO_INITIAL;
        const { data: subjElo } = await admin
          .from("ability_estimates")
          .select("elo_rating")
          .eq("user_id", studentId).eq("subject", subjectName).is("concept_id", null)
          .maybeSingle();
        if (subjElo) studentElo = Number(subjElo.elo_rating ?? ELO_INITIAL);

        let itemElo = ELO_INITIAL;
        if (conceptRow) {
          const { data: itemsElo } = await admin
            .from("question_bank")
            .select("elo_rating")
            .eq("concept_id", conceptRow.id);
          if (itemsElo && itemsElo.length) {
            itemElo = itemsElo.reduce(
              (s: number, r: any) => s + Number(r.elo_rating ?? ELO_INITIAL), 0,
            ) / itemsElo.length;
          }
        }

        const a = conceptMeanA, b = conceptMeanB;
        const p_2pl = clamp(sig2pl(a * (theta - b)), 0.01, 0.99);
        const p_elo = clamp(eloProbability(studentElo, itemElo), 0.01, 0.99);

        const { data: seqRow } = await admin
          .from("kt_sequence_state")
          .select("interactions")
          .eq("user_id", studentId).eq("subject", subjectName)
          .maybeSingle();
        const interactions: KtInteraction[] = Array.isArray(seqRow?.interactions)
          ? (seqRow!.interactions as KtInteraction[]) : [];
        const cidKey = conceptRow?.id ?? "_subj";
        const akt = aktPredict(
          interactions, { conceptId: cidKey, a, b, theta }, AKT_DEFAULTS,
        );
        const dashHist: DashInteraction[] = interactions.map(
          (iv) => ({ ts: iv.ts, c: iv.c, cid: iv.cid }),
        );
        const p_dash = dashPredictFromHistory(
          dashHist, Date.now(), theta, b, conceptRow?.id,
        );

        let weights: EnsembleWeights = ENSEMBLE_DEFAULTS;
        const { data: userW } = await admin
          .from("ensemble_weights")
          .select("w_2pl, w_elo, w_akt, w_dash, bias")
          .eq("user_id", studentId).eq("subject", subjectName)
          .maybeSingle();
        if (userW) weights = userW as EnsembleWeights;
        else {
          const { data: popW } = await admin
            .from("ensemble_weights")
            .select("w_2pl, w_elo, w_akt, w_dash, bias")
            .is("user_id", null).eq("subject", "*")
            .maybeSingle();
          if (popW) weights = popW as EnsembleWeights;
        }

        const blended = blendPredictions(
          { p_2pl, p_elo, p_akt: akt.p, p_dash }, weights,
        );
        ensembleP = blended.p;
        ensembleComponents = { p_2pl, p_elo, p_akt: akt.p, p_dash };
      } catch (e) {
        // Ensemble is best-effort: a failure must never break teaching.
        console.error("[teaching-generate] ensemble failed, falling back to 2PL:", e);
      }
    }

    // ─── Pure deterministic cascade ────────────────────────────────
    const stateVector = buildStateVector({
      theta, standardError: se,
      mastery: conceptMastery, lectureMastery,
      errorCount: recentErrorCount,
      conceptDifficulty: conceptRow ? Number(conceptRow.difficulty_weight ?? 1.0) : 1.0,
      visualPreference: visual,
      fatigue: clientFatigue,
      discrimination: conceptMeanA,
      conceptMeanB: conceptMeanB,
      ensembleP,
      ensembleComponents,
    });
    const regime = deriveRegime(stateVector);
    const trajectory = buildTrajectory(regime);
    const policy = derivePolicy(stateVector);

    const systemPrompt = [
      "You are Lumina, an adaptive tutor. Follow the regime and trajectory below verbatim.",
      buildPrompt(regime, trajectory, {
        conceptName: conceptRow?.name,
        lectureTitle: lectureRow?.title,
        context,
      }),
      "No meta-commentary about the regime/trajectory.",
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context || "Teach me this concept now." },
        ],
      }),
    });

    if (!aiResp.ok) {
      const code = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      return json({
        error: "AI generation failed",
        version: 2, policy, regime, trajectory, stateVector,
      }, code);
    }
    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content ?? "";
    const enforced = enforce(content, regime, trajectory);

    return json({
      version: 2,
      policy,                      // legacy field — preserved
      regime,
      trajectory,
      stateVector,
      content: enforced.content,
      constrainedBy: enforced.constrainedBy,
      missingSteps: enforced.missingSteps,
      // Stage 1: 2PL summary
      irt: {
        theta, standardError: se,
        discrimination: stateVector.discrimination,
        expectedP: stateVector.expectedP,
        conceptItemCount,
      },
      // Stage 2: ensemble surface (null when KT context was unavailable).
      ensemble: ensembleComponents
        ? { p: ensembleP, components: ensembleComponents }
        : null,
      // legacy compatibility
      theta, standardError: se, conceptMastery, lectureMastery,
    });
  } catch (e) {
    console.error("teaching-generate error", e);
    return json({ error: "Internal error" }, 500);
  }
});

async function resolveSubjectName(subjectId: string): Promise<string | undefined> {
  const { data } = await admin.from("subjects").select("name").eq("id", subjectId).maybeSingle();
  return data?.name as string | undefined;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
