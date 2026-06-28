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
import { fsrsPredict, newFsrsCard, type FsrsCard } from "../_shared/fsrs.ts";
import { hawkesPredict, HAWKES_DEFAULTS } from "../_shared/hawkesKt.ts";
import { selectAndLog } from "../_shared/banditState.ts";
import { buildBanditContext, parseArmId } from "../_shared/linucb.ts";
import { logEnsemblePrediction } from "../_shared/ensemblePredictionLog.ts";
import { fetchHierarchicalPrior } from "../_shared/coldStart.ts";
import { composeOutputV3, type ReviewDue, type PrereqHint } from "../_shared/outputEngineV3.ts";
import { priorityScore } from "../_shared/fsrsScheduler.ts";
import { getRuntimeConfig } from "../_shared/runtimeConfig.ts";
import {
  analyseIntegrity, buildRepairPrompt, repairImproved,
  type IntegrityStep,
} from "../_shared/outputIntegrity.ts";
import { buildExplanation, type ExplainTrace } from "../_shared/explain.ts";
// Stage 13 — Ministry-Grade Deployment Readiness layers.
import {
  loadActiveOverrides, projectOverrides, applyOverridesToPolicy,
  type OverrideProfile,
} from "../_shared/teacherOverride.ts";
import { resolveBinding, recordLessonBinding, type BindingResult } from "../_shared/curriculumBinding.ts";
import { recordAudit, describeLessonAudit } from "../_shared/auditTrail.ts";


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

    // Stage 12 §1 — pull the live runtime config snapshot once per request.
    // Every downstream consumer reads from this object so all decisions
    // inside this request resolve against the same hyperparameter version.
    const runtimeCfg = await getRuntimeConfig(admin);

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

    // Stage 8: resolve student school once so cold-start lookups can scope
    // by (school, subject, concept). Best-effort — null falls back gracefully.
    const { data: studentProfile } = await admin
      .from("profiles").select("school_id").eq("id", studentId).maybeSingle();
    const studentSchoolId = (studentProfile?.school_id as string | null | undefined) ?? null;

    // Stage 8: hierarchical cold-start (subject scope). Used as the warm-start
    // for θ/SE/mastery whenever the per-student row hasn't been written yet.
    const subjectColdStart = subjectName
      ? await fetchHierarchicalPrior(admin, {
          schoolId: studentSchoolId, subject: subjectName, conceptId: null,
        })
      : null;

    let theta = subjectColdStart ? subjectColdStart.theta : 0;
    let se    = subjectColdStart ? subjectColdStart.se    : 1.5;
    if (subjectName) {
      const { data: subjAbil } = await admin
        .from("ability_estimates")
        .select("theta, theta_se")
        .eq("user_id", studentId)
        .eq("subject", subjectName)
        .is("concept_id", null)
        .maybeSingle();
      if (subjAbil) {
        theta = Number(subjAbil.theta ?? theta);
        se = Number(subjAbil.theta_se ?? se);
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
        } else {
          // Stage 8: concept-scoped cold start when no per-student row.
          const conceptCold = await fetchHierarchicalPrior(admin, {
            schoolId: studentSchoolId, subject: subjectName, conceptId: conceptRow.id,
          });
          if (!conceptCold.isFallback) {
            theta = conceptCold.theta;
            se = conceptCold.se;
          }
        }
      }
    }

    // Stage 8: mastery defaults likewise inherit the population posterior
    // (concept_school → concept_global → subject_*), not a flat 0.5.
    let conceptMastery = subjectColdStart?.mastery ?? 0.5;
    let lectureMastery = subjectColdStart?.mastery ?? 0.5;
    if (conceptRow) {
      const { data: cm } = await admin
        .from("concept_mastery").select("mastery_score")
        .eq("user_id", studentId).eq("concept_id", conceptRow.id).maybeSingle();
      if (cm) conceptMastery = Number(cm.mastery_score ?? conceptMastery);
      else {
        const conceptCold = subjectName
          ? await fetchHierarchicalPrior(admin, {
              schoolId: studentSchoolId, subject: subjectName, conceptId: conceptRow.id,
            })
          : null;
        if (conceptCold && !conceptCold.isFallback) conceptMastery = conceptCold.mastery;
      }
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

        // ─── Stage 4 — FSRS-v5 retention ────────────────────────────
        // Read the per-concept memory card (falls back to subject-level row,
        // then to a fresh card if neither exists). P_fsrs = current
        // retrievability under the power-law forgetting curve.
        let fsrsCard: FsrsCard = newFsrsCard();
        const fsrsConceptId = conceptRow?.id ?? null;
        if (fsrsConceptId) {
          const { data: cRow } = await admin
            .from("fsrs_card_state")
            .select("stability, difficulty, reps, lapses, last_review_at")
            .eq("user_id", studentId).eq("subject", subjectName).eq("concept_id", fsrsConceptId)
            .maybeSingle();
          if (cRow) fsrsCard = {
            S: Number(cRow.stability ?? 0), D: Number(cRow.difficulty ?? 0),
            reps: cRow.reps ?? 0, lapses: cRow.lapses ?? 0,
            lastReviewMs: cRow.last_review_at ? new Date(cRow.last_review_at).getTime() : 0,
          };
        }
        if (!fsrsCard.lastReviewMs) {
          const { data: subjFsrs } = await admin
            .from("fsrs_card_state")
            .select("stability, difficulty, reps, lapses, last_review_at")
            .eq("user_id", studentId).eq("subject", subjectName).is("concept_id", null)
            .maybeSingle();
          if (subjFsrs) fsrsCard = {
            S: Number(subjFsrs.stability ?? 0), D: Number(subjFsrs.difficulty ?? 0),
            reps: subjFsrs.reps ?? 0, lapses: subjFsrs.lapses ?? 0,
            lastReviewMs: subjFsrs.last_review_at ? new Date(subjFsrs.last_review_at).getTime() : 0,
          };
        }
        const p_fsrs = fsrsPredict(fsrsCard, Date.now());

        // ─── Stage 4 — HawkesKT cross-concept excitation ────────────
        // Curriculum link weight is resolved from the `concepts` table:
        // concepts that share a lecture excite each other at weight 0.5.
        // (Prerequisite edges are derived in `src/lib/adaptive/conceptGraph.ts`
        // and aren't yet materialised in the DB — when they are, this
        // resolver picks them up automatically.)
        const historyCids = Array.from(new Set(interactions.map((iv) => iv.cid)))
          .filter((c) => c && c !== "_subj");
        const lectureOf = new Map<string, string | null>();
        if (conceptRow && historyCids.length) {
          const all = Array.from(new Set(historyCids.concat(conceptRow.id)));
          const { data: linkRows } = await admin
            .from("concepts")
            .select("id, lecture_id")
            .in("id", all);
          for (const r of linkRows ?? []) lectureOf.set(r.id, r.lecture_id ?? null);
        }
        const linkResolver = (from: string, to: string): number => {
          if (from === to) return 1;
          const lf = lectureOf.get(from), lt = lectureOf.get(to);
          if (lf && lt && lf === lt) return 0.5;
          return 0;
        };
        const hawkes = conceptRow
          ? hawkesPredict(interactions, {
              conceptId: conceptRow.id, a, b, theta, nowMs: Date.now(),
            }, linkResolver, HAWKES_DEFAULTS)
          : { p: clamp(sig2pl(a * (theta - b)), 0.01, 0.99), intensity: 0, contributors: 0 };
        const p_hawkes = hawkes.p;

        // Stage 8: cold-start prior for ensemble weights when no per-user or
        // population row exists in `ensemble_weights`. Stage 12 §1: the
        // tuned weights from runtimeConfig take precedence over the
        // hardcoded defaults whenever neither user nor population row is
        // present (the cold-start prior, when available, still wins).
        let weights: EnsembleWeights = subjectColdStart
          ? subjectColdStart.ensembleWeights
          : runtimeCfg.ensembleWeights;
        const { data: userW } = await admin
          .from("ensemble_weights")
          .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
          .eq("user_id", studentId).eq("subject", subjectName)
          .maybeSingle();
        if (userW) weights = userW as EnsembleWeights;
        else {
          const { data: popW } = await admin
            .from("ensemble_weights")
            .select("w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
            .is("user_id", null).eq("subject", "*")
            .maybeSingle();
          if (popW) weights = popW as EnsembleWeights;
        }

        const blended = blendPredictions(
          { p_2pl, p_elo, p_akt: akt.p, p_dash, p_fsrs, p_hawkes }, weights,
        );
        ensembleComponents = { p_2pl, p_elo, p_akt: akt.p, p_dash } as any;
        (ensembleComponents as any).p_fsrs = p_fsrs;
        (ensembleComponents as any).p_hawkes = p_hawkes;

        // Stage 3: per-subject calibration. The blender is honest about
        // discrimination (AUC) but not necessarily about confidence.
        // Apply (temperature | platt | identity) before downstream use.
        let calFit = { method: "identity" as const, temperature: 1, platt_a: 1, platt_b: 0 };
        const { data: calRow } = await admin
          .from("calibration_state")
          .select("method, temperature, platt_a, platt_b")
          .eq("subject", subjectName)
          .maybeSingle();
        if (calRow) {
          calFit = {
            method: (calRow.method as any) ?? "identity",
            temperature: Number(calRow.temperature ?? 1),
            platt_a: Number(calRow.platt_a ?? 1),
            platt_b: Number(calRow.platt_b ?? 0),
          };
        } else {
          const { data: popCal } = await admin
            .from("calibration_state")
            .select("method, temperature, platt_a, platt_b")
            .eq("subject", "*").maybeSingle();
          if (popCal) calFit = {
            method: (popCal.method as any) ?? "identity",
            temperature: Number(popCal.temperature ?? 1),
            platt_a: Number(popCal.platt_a ?? 1),
            platt_b: Number(popCal.platt_b ?? 0),
          };
        }
        ensembleP = applyCalibration(blended.p, calFit);
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
    let policy = derivePolicy(stateVector);

    // ─── Stage 6 — LinUCB contextual bandit ────────────────────────
    // The deterministic `policy.strategy` / `policy.difficulty` are the
    // heuristic baseline. The bandit observes the same context vector and
    // can override either dimension with a learned choice; the deterministic
    // path is preserved on any failure. The decision is logged for reward
    // attribution from the next graded_event.
    let bandit:
      | {
          armId: string;
          strategy: string;
          difficulty: string;
          ucb: number;
          mean: number;
          bonus: number;
          decisionId: string | null;
          ranking: Array<{ armId: string; ucb: number; mean: number; bonus: number; n: number }>;
        }
      | null = null;
    if (subjectName) {
      const contextVec = buildBanditContext({
        theta: stateVector.theta,
        mastery: stateVector.mastery,
        lectureMastery: stateVector.lectureMastery,
        errorCount: stateVector.errorCount,
        fatigue: stateVector.fatigue,
        ensembleP: stateVector.ensembleP,
        visualPreference: stateVector.visualPreference,
      });
      const selection = await selectAndLog(admin, {
        userId: studentId,
        subject: subjectName,
        contextVec,
        conceptId: conceptRow?.id ?? null,
        lectureId: lectureRow?.id ?? null,
        ensembleP: ensembleP ?? null,
        source: "teaching-generate",
      });
      if (selection) {
        const parsed = parseArmId(selection.chosen.armId);
        if (parsed) {
          policy = { ...policy, strategy: parsed.strategy, difficulty: parsed.difficulty };
          bandit = {
            armId: selection.chosen.armId,
            strategy: parsed.strategy,
            difficulty: parsed.difficulty,
            ucb: selection.chosen.ucb,
            mean: selection.chosen.mean,
            bonus: selection.chosen.bonus,
            decisionId: selection.decisionId,
            ranking: selection.ranking.slice(0, 5).map((r) => ({
              armId: r.armId, ucb: r.ucb, mean: r.mean, bonus: r.bonus, n: r.n,
            })),
          };
        }
      }
    }



    // ─── Stage 13 §3.3 — Teacher Override / Human Control ────────────
    // Resolved AFTER the bandit so manual locks are the ultimate authority.
    // If `freezeProgression` is active, we additionally pin difficulty to
    // its current locked value (or "medium" baseline) and force pacing slow
    // so the adaptive engine does not advance the student.
    let overrideProfile: OverrideProfile = {
      freezeProgression: false, difficultyLock: null, pacingLock: null,
      strategyLock: null, manualLessonRef: null, curriculumPacingDayIndex: null,
      topicLocked: false, reasons: [], sourceIds: [],
    };
    if (studentSchoolId) {
      try {
        const { overrides, locks } = await loadActiveOverrides(admin, studentSchoolId);
        overrideProfile = projectOverrides(overrides, locks, {
          studentId,
          subject: subjectName ?? null,
          topic: conceptRow?.name ?? null,
        });
        if (overrideProfile.freezeProgression) {
          policy = applyOverridesToPolicy(policy, {
            ...overrideProfile,
            difficultyLock: overrideProfile.difficultyLock ?? policy.difficulty,
            pacingLock: overrideProfile.pacingLock ?? "slow",
          });
        } else {
          policy = applyOverridesToPolicy(policy, overrideProfile);
        }
      } catch (e) {
        console.warn("[teaching-generate] override projection failed (non-fatal):", e);
      }
    }

    if (overrideProfile.topicLocked) {
      // A locked topic must not be taught. Surface a clean, deterministic
      // response so the client can render a teacher-friendly notice rather
      // than burning AI credits on suppressed content.
      await recordAudit(admin, {
        action: "ai.lesson.generated", actorId: studentId, actorRole: "student",
        schoolId: studentSchoolId,
        targetType: "lesson", targetId: "topic_locked",
        payload: { subject: subjectName ?? null, topic: conceptRow?.name ?? null,
                   reasons: overrideProfile.reasons },
      });
      return json({
        version: 3, policy, regime, trajectory, stateVector,
        content: "", suppressed: true, suppression_reason: "topic_locked",
        override: overrideProfile,
      }, 200);
    }



    // ─── Stage 7 — log this prediction for ensemble retraining ────────
    // Fire-and-forget. We log even when the bandit short-circuits so the
    // training set isn't biased toward only-bandit-served sessions. Outcome
    // is attached later by `ability-update` via attach_ensemble_outcome.
    let predictionLogId: string | null = null;
    if (subjectName && ensembleComponents) {
      try {
        predictionLogId = await logEnsemblePrediction(admin, {
          userId: studentId,
          subject: subjectName,
          conceptId: conceptRow?.id ?? null,
          questionId: null,
          banditDecisionId: bandit?.decisionId ?? null,
          components: ensembleComponents as Record<string, number>,
          blendedP: ensembleP ?? null,
          calibratedP: ensembleP ?? null,
          weightsUsed: null,
          source: "teaching-generate",
        });
      } catch (e) {
        console.warn("[teaching-generate] prediction log failed (non-fatal):", e);
      }
    }

    // ─── Stage 9 — Output Engine v3 ────────────────────────────────
    // Consume the full adaptive bundle (regime + bandit + FSRS dues +
    // Hawkes contributors + ensembleP) into one executable recipe.
    // All loads are best-effort and scoped to this student.
    const nowMs = Date.now();
    let reviewDues: ReviewDue[] = [];
    let prereqHints: PrereqHint[] = [];
    if (subjectName) {
      try {
        const { data: dueRows } = await admin
          .from("fsrs_card_state")
          .select("concept_id, stability, difficulty, lapses, last_review_at, next_review_at, is_leech, suspended_until")
          .eq("user_id", studentId).eq("subject", subjectName)
          .not("next_review_at", "is", null)
          .lte("next_review_at", new Date(nowMs).toISOString())
          .limit(25);
        const dueList = (dueRows ?? []).filter(
          (r: any) => !r.suspended_until || new Date(r.suspended_until).getTime() <= nowMs,
        );
        const dueCids = Array.from(
          new Set(dueList.map((r: any) => r.concept_id).filter(Boolean)),
        );
        const nameMap = new Map<string, string>();
        if (dueCids.length) {
          const { data: nameRows } = await admin
            .from("concepts").select("id, name").in("id", dueCids);
          for (const n of nameRows ?? []) nameMap.set(n.id as string, n.name as string);
        }
        reviewDues = dueList.map((r: any) => {
          const S = Number(r.stability ?? 0);
          const lastMs = r.last_review_at ? new Date(r.last_review_at).getTime() : nowMs;
          const card: FsrsCard = {
            S, D: Number(r.difficulty ?? 0),
            reps: 0, lapses: Number(r.lapses ?? 0),
            lastReviewMs: lastMs,
          };
          const R = fsrsPredict(card, nowMs);
          const nextMs = r.next_review_at ? new Date(r.next_review_at).getTime() : nowMs;
          const overdueDays = Math.max(0, (nowMs - nextMs) / 86_400_000);
          return {
            conceptId: r.concept_id as string,
            conceptName: r.concept_id ? nameMap.get(r.concept_id as string) : undefined,
            retrievability: R,
            overdueDays,
            priority: priorityScore({
              retrievability: R, overdueDays, stability: S,
              difficulty: Number(r.difficulty ?? 5),
              lapses: Number(r.lapses ?? 0),
              isLeech: !!r.is_leech,
            }),
            lapses: Number(r.lapses ?? 0),
            isLeech: !!r.is_leech,
          } satisfies ReviewDue;
        });

        // Hawkes-style prereq hints: concepts the student recently
        // interacted with that share this lecture (curriculum neighbour)
        // and have weak per-student mastery. Mirrors the link resolver
        // used by hawkesPredict above.
        if (conceptRow?.lecture_id) {
          const { data: neighbours } = await admin
            .from("concepts")
            .select("id, name")
            .eq("lecture_id", conceptRow.lecture_id)
            .neq("id", conceptRow.id)
            .limit(20);
          const neighbourIds = (neighbours ?? []).map((n: any) => n.id as string);
          if (neighbourIds.length) {
            const { data: masteryRows } = await admin
              .from("concept_mastery")
              .select("concept_id, mastery_score")
              .eq("user_id", studentId)
              .in("concept_id", neighbourIds);
            const masteryMap = new Map<string, number>();
            for (const m of masteryRows ?? []) {
              masteryMap.set(m.concept_id as string, Number(m.mastery_score ?? 0.5));
            }
            // Excitation proxy: count of recent same-lecture events per cid.
            const { data: recentEvents } = await admin
              .from("graded_events")
              .select("concept_id, was_correct, created_at")
              .eq("user_id", studentId)
              .in("concept_id", neighbourIds)
              .order("created_at", { ascending: false })
              .limit(50);
            const excitationMap = new Map<string, number>();
            for (const ev of recentEvents ?? []) {
              const cid = ev.concept_id as string;
              const dtDays = Math.max(0, (nowMs - new Date(ev.created_at).getTime()) / 86_400_000);
              const decay = Math.exp(-0.25 * dtDays);
              const sign = ev.was_correct ? 0.4 : 1.0; // wrong answers excite more
              excitationMap.set(cid, (excitationMap.get(cid) ?? 0) + 0.5 * decay * sign);
            }
            prereqHints = (neighbours ?? []).map((n: any) => ({
              conceptId: n.id as string,
              conceptName: n.name as string,
              excitation: excitationMap.get(n.id as string) ?? 0,
              mastery: masteryMap.get(n.id as string) ?? 0.5,
            } satisfies PrereqHint));
          }
        }
      } catch (e) {
        console.warn("[teaching-generate] stage9 bundle load failed (non-fatal):", e);
      }
    }

    const outputV3 = composeOutputV3({
      stateVector: {
        theta: stateVector.theta,
        standardError: stateVector.standardError,
        mastery: stateVector.mastery,
        ensembleP: stateVector.ensembleP,
        fatigue: stateVector.fatigue,
      },
      regime,
      baseTrajectory: trajectory,
      bandit: bandit ? { strategy: bandit.strategy as any, difficulty: bandit.difficulty as any } : null,
      reviewDues,
      prereqHints,
    });

    const systemPrompt = [
      "You are Lumina, an adaptive tutor. Follow the recipe below verbatim.",
      buildPrompt(regime, trajectory, {
        conceptName: conceptRow?.name,
        lectureTitle: lectureRow?.title,
        context,
      }),
      outputV3.promptFragments.reviewBlock ?? "",
      outputV3.promptFragments.prereqBlock ?? "",
      outputV3.promptFragments.recipeBlock,
      "No meta-commentary about the regime/trajectory/recipe.",
    ].filter(Boolean).join("\n\n");

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
    let content: string = aiData?.choices?.[0]?.message?.content ?? "";

    // ─── Stage 12 §3 — True output enforcement ─────────────────────
    // The legacy `enforce()` reports missing steps; we now actively
    // attempt a single bounded repair pass before returning. If repair
    // fails to improve integrity, the original content is returned and
    // `enforcement.status` is set to "degraded" for downstream telemetry.
    const integritySteps: IntegrityStep[] = trajectory.steps.map((s) => ({
      kind: s.kind, mustVerify: s.mustVerify,
    }));
    let integrity = analyseIntegrity(content, integritySteps, {
      minMandatory: runtimeCfg.outputMinMandatorySteps,
    });
    let enforcementStatus: "ok" | "repaired" | "degraded" = integrity.ok ? "ok" : "degraded";
    if (!integrity.ok) {
      try {
        const repairPrompt = buildRepairPrompt(content, integritySteps, integrity);
        const repairResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You repair lessons to satisfy a deterministic teaching contract." },
              { role: "user", content: repairPrompt },
            ],
          }),
        });
        if (repairResp.ok) {
          const repairData = await repairResp.json();
          const repaired: string = repairData?.choices?.[0]?.message?.content ?? "";
          const afterReport = analyseIntegrity(repaired, integritySteps, {
            minMandatory: runtimeCfg.outputMinMandatorySteps,
          });
          if (repairImproved(integrity, afterReport)) {
            content = repaired;
            integrity = afterReport;
            enforcementStatus = afterReport.ok ? "repaired" : "degraded";
          }
        }
      } catch (e) {
        console.warn("[teaching-generate] repair pass failed (non-fatal):", e);
      }
    }
    const enforced = enforce(content, regime, trajectory);

    // ─── Stage 12 §5 — Runtime explainability ──────────────────────
    const topPrereq = prereqHints
      .filter((p) => p.mastery < 0.6)
      .sort((a, b) => b.excitation - a.excitation)[0] ?? null;
    const explanation: ExplainTrace = buildExplanation({
      studentId,
      subject: subjectName,
      conceptId: conceptRow?.id ?? null,
      lectureId: lectureRow?.id ?? null,
      theta, standardError: se,
      mastery: stateVector.mastery,
      lectureMastery: stateVector.lectureMastery,
      ensembleP: stateVector.ensembleP,
      ensembleComponents: (ensembleComponents as Record<string, number> | undefined) ?? null,
      regime: {
        mode: regime.mode, intensity: regime.intensity,
        verificationBias: regime.verificationBias, abstractionBias: regime.abstractionBias,
      },
      policy: { difficulty: policy.difficulty, pacing: policy.pacing, strategy: policy.strategy },
      bandit: bandit ? {
        armId: bandit.armId, strategy: bandit.strategy, difficulty: bandit.difficulty,
        ucb: bandit.ucb, mean: bandit.mean, bonus: bandit.bonus,
      } : null,
      reviewDueCount: reviewDues.length,
      topReviewPriority: reviewDues[0]?.priority,
      prereqHotspot: topPrereq ? {
        conceptName: topPrereq.conceptName, excitation: topPrereq.excitation, mastery: topPrereq.mastery,
      } : null,
      pacingMultiplier: outputV3.pacingMultiplier,
      totalDurationSec: outputV3.totalDurationSec,
      configSnapshotId: runtimeCfg.snapshotId,
    });

    // Best-effort persistence — adaptation must never block on telemetry.
    try {
      await admin.from("lesson_explanations").insert({
        user_id: studentId,
        subject: subjectName ?? null,
        concept_id: conceptRow?.id ?? null,
        lecture_id: lectureRow?.id ?? null,
        bandit_decision_id: bandit?.decisionId ?? null,
        prediction_log_id: predictionLogId,
        config_snapshot_id: runtimeCfg.snapshotId,
        enforcement_status: enforcementStatus,
        integrity_report: integrity,
        explanation,
      });
    } catch (e) {
      console.warn("[teaching-generate] explanation persist failed (non-fatal):", e);
    }

    // ─── Stage 13 §3.2 — Curriculum binding (audit-grade alignment) ──
    // Resolves the strongest (standard, objective) pair for the concept
    // being taught and stamps it onto lesson_objective_bindings so every
    // generated lesson carries a verifiable national-curriculum trace.
    let binding: BindingResult = { candidates: [], chosen: null, conceptKey: "" };
    try {
      if (subjectName) {
        binding = await resolveBinding(admin, {
          schoolId: studentSchoolId,
          subject: subjectName,
          topic: conceptRow?.name ?? null,
          conceptId: conceptRow?.id ?? null,
        });
        await recordLessonBinding(admin, {
          schoolId: studentSchoolId,
          studentId,
          subject: subjectName,
          topic: conceptRow?.name ?? null,
          lessonRef: predictionLogId ?? bandit?.decisionId ?? null,
          binding,
          trace: {
            policy_difficulty: policy.difficulty,
            policy_strategy: policy.strategy,
            regime_mode: regime.mode,
            override_reasons: overrideProfile.reasons,
          },
        });
      }
    } catch (e) {
      console.warn("[teaching-generate] curriculum binding failed (non-fatal):", e);
    }

    // ─── Stage 13 §3.4 — Governance audit trail entry ────────────────
    try {
      await recordAudit(admin, describeLessonAudit({
        studentId,
        schoolId: studentSchoolId,
        subject: subjectName ?? "unknown",
        topic: conceptRow?.name ?? null,
        policyHash: `${regime.mode}|${policy.difficulty}|${policy.strategy}|${policy.pacing}`,
        bindingStandardCode: binding.chosen?.standardCode ?? null,
        bindingObjectiveCode: binding.chosen?.objectiveCode ?? null,
        overrideReasons: overrideProfile.reasons,
      }));
    } catch (e) {
      console.warn("[teaching-generate] audit trail failed (non-fatal):", e);
    }



    return json({
      version: 3,
      policy,                      // legacy field — preserved
      regime,
      trajectory,
      stateVector,
      content: enforced.content,
      constrainedBy: enforced.constrainedBy,
      missingSteps: enforced.missingSteps,
      // Stage 12 §3 — explicit enforcement surface.
      enforcement: {
        status: enforcementStatus,
        integrity,
      },
      // Stage 12 §5 — runtime explainability trace (read-only).
      explanation,
      // Stage 12 §1 — provenance of the hyperparameter snapshot in effect.
      configSnapshotId: runtimeCfg.snapshotId,
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
      // Stage 6: contextual bandit selection (null when subject was unknown).
      bandit,
      // Stage 7: id of the row in `ensemble_predictions` awaiting an outcome.
      predictionLogId,
      // Stage 9: Output Engine v3 composed recipe + audit.
      outputV3: {
        pacingMultiplier: outputV3.pacingMultiplier,
        totalDurationSec: outputV3.totalDurationSec,
        recipe: outputV3.recipe,
        segments: outputV3.segments,
        audit: outputV3.audit,
      },
      // legacy compatibility
      theta, standardError: se, conceptMastery, lectureMastery,
      // Stage 13 — ministry-grade surfaces.
      curriculumBinding: {
        conceptKey: binding.conceptKey,
        standardCode: binding.chosen?.standardCode ?? null,
        objectiveCode: binding.chosen?.objectiveCode ?? null,
        framework: binding.chosen?.framework ?? null,
        textbookReference: binding.chosen?.textbookReference ?? null,
        alignmentStrength: binding.chosen?.alignmentStrength ?? null,
        candidateCount: binding.candidates.length,
      },
      teacherOverride: {
        active: overrideProfile.sourceIds.length > 0 || overrideProfile.topicLocked,
        freezeProgression: overrideProfile.freezeProgression,
        difficultyLock: overrideProfile.difficultyLock,
        pacingLock: overrideProfile.pacingLock,
        strategyLock: overrideProfile.strategyLock,
        manualLessonRef: overrideProfile.manualLessonRef,
        topicLocked: overrideProfile.topicLocked,
        reasons: overrideProfile.reasons,
      },
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
