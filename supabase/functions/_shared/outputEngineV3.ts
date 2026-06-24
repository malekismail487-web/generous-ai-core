// Output Engine v3 — Stage 9.
//
// Consumes the full adaptive bundle and turns it into an executable lesson
// recipe that the LLM (and any deterministic renderer) can follow verbatim.
//
//   Inputs:
//     - stateVector       (θ, SE, mastery, ensembleP — calibrated)
//     - regime            (mode + intensity + biases)
//     - baseTrajectory    (from buildTrajectory)
//     - bandit            (LinUCB-selected arm: strategy + difficulty, optional)
//     - reviewDues        (top-N high-priority FSRS due cards for this subject)
//     - prereqHints       (Hawkes-derived "warm but weak" prerequisite concepts)
//
//   Outputs:
//     - pacingMultiplier  (durations scale with 1 - ensembleP)
//     - segments          (ordered: optional review block → main trajectory → optional prereq quick-check)
//     - recipe            (per-step: kind, strategy, difficulty, focus, durationSec, mustVerify, rationale)
//     - totalDurationSec
//     - prompt fragments  (review block, prereq block) ready to inline into the system prompt
//
// Pure: no Date, no Math.random, no IO. All time inputs are explicit.

export type Difficulty = "low" | "medium" | "high";
export type Strategy = "worked_example" | "explanation" | "quiz" | "visual";
export type RegimeMode = "remediate" | "consolidate" | "advance" | "challenge";
export type StepKind =
  | "hook" | "explain" | "worked_example"
  | "check" | "practice" | "reflect"
  | "review" | "prereq_check";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface OutputV3StateVector {
  theta: number;
  standardError: number;
  mastery: number;
  ensembleP: number;
  fatigue: number;
}

export interface OutputV3Regime {
  mode: RegimeMode;
  intensity: number;
  abstractionBias: number;
  verificationBias: number;
}

export interface OutputV3Step {
  kind: StepKind;
  cognitiveLoad: number;
  expectedDurationSec: number;
  mustVerify: boolean;
}

export interface OutputV3BanditChoice {
  strategy: Strategy;
  difficulty: Difficulty;
}

export interface ReviewDue {
  conceptId: string;
  conceptName?: string;
  retrievability: number;   // 0..1 — lower = more urgent
  overdueDays: number;      // ≥ 0
  priority: number;         // pre-computed urgency score
  lapses: number;
  isLeech: boolean;
}

export interface PrereqHint {
  conceptId: string;
  conceptName?: string;
  /** Hawkes excitation contribution from this concept's recent events. */
  excitation: number;
  /** Most recent observed mastery for this prereq (0..1). 0.5 if unknown. */
  mastery: number;
}

export interface OutputV3Inputs {
  stateVector: OutputV3StateVector;
  regime: OutputV3Regime;
  baseTrajectory: { steps: OutputV3Step[]; totalDurationSec: number };
  bandit: OutputV3BanditChoice | null;
  reviewDues: ReviewDue[];
  prereqHints: PrereqHint[];
  /** Hard cap on total lesson duration in seconds (default 900s = 15 min). */
  maxDurationSec?: number;
}

export interface OutputV3Recipe {
  segment: "review" | "main" | "prereq_check";
  kind: StepKind;
  strategy: Strategy;
  difficulty: Difficulty;
  focus: string;          // human/LLM-facing focus line
  durationSec: number;
  mustVerify: boolean;
  rationale: string;      // why this step exists (auditable)
}

export interface OutputV3Bundle {
  pacingMultiplier: number;
  segments: {
    review: OutputV3Recipe[];
    main: OutputV3Recipe[];
    prereqCheck: OutputV3Recipe[];
  };
  recipe: OutputV3Recipe[];
  totalDurationSec: number;
  promptFragments: {
    reviewBlock: string | null;
    prereqBlock: string | null;
    recipeBlock: string;
  };
  audit: {
    reviewCount: number;
    prereqCount: number;
    truncated: boolean;
    fellBackToBase: boolean;
    chosenStrategy: Strategy;
    chosenDifficulty: Difficulty;
  };
}

// ────────────────────────────────────────────────────────────────────
// Pacing
// ────────────────────────────────────────────────────────────────────

/**
 * Pacing multiplier ∈ [0.75, 1.6]. Drives step durations.
 *
 *   - Low ensembleP (struggling student)  → stretch durations (≤ 1.6×)
 *   - High ensembleP (cruising)           → compress durations  (≥ 0.75×)
 *   - High fatigue                        → mild stretch
 *   - High SE (uncertain estimate)        → mild stretch
 *
 * Closed-form, monotone in each input, bounded.
 */
export function computePacingMultiplier(v: OutputV3StateVector): number {
  const base = 1.0 + (0.55 - v.ensembleP) * 0.9;   // p=0.55 ⇒ 1.0; p=0.10 ⇒ 1.405; p=0.90 ⇒ 0.685
  const fatigueAdj = v.fatigue * 0.15;             // up to +0.15 when exhausted
  const seAdj = clamp(v.standardError - 0.5, 0, 1.5) * 0.1; // up to +0.15 when very uncertain
  return r2(clamp(base + fatigueAdj + seAdj, 0.75, 1.6));
}

// ────────────────────────────────────────────────────────────────────
// Review interleave (FSRS dues)
// ────────────────────────────────────────────────────────────────────

/**
 * Pick the top-K most urgent due cards for the front review block.
 * Caps total review wall-time at `maxReviewSec` so a flood of dues never
 * crowds out the lesson itself.
 */
export function selectReviewInterleave(
  dues: readonly ReviewDue[],
  opts: { maxCards: number; secPerCard: number; maxReviewSec: number },
): ReviewDue[] {
  if (!dues.length) return [];
  const ranked = [...dues].sort((a, b) => b.priority - a.priority);
  const out: ReviewDue[] = [];
  let total = 0;
  for (const d of ranked) {
    if (out.length >= opts.maxCards) break;
    if (total + opts.secPerCard > opts.maxReviewSec) break;
    out.push(d);
    total += opts.secPerCard;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Prereq refresh (Hawkes contributors with weak mastery)
// ────────────────────────────────────────────────────────────────────

/**
 * Keep prereq concepts that BOTH excited the candidate AND are themselves
 * weak (mastery < 0.7). Sorted by excitation × (1 - mastery) so the most
 * predictive weak link is surfaced first.
 */
export function selectPrereqRefresh(
  hints: readonly PrereqHint[],
  opts: { maxHints: number; masteryCeiling: number },
): PrereqHint[] {
  const filtered = hints.filter(
    (h) => h.excitation > 0 && h.mastery < opts.masteryCeiling,
  );
  filtered.sort(
    (a, b) =>
      b.excitation * (1 - b.mastery) - a.excitation * (1 - a.mastery),
  );
  return filtered.slice(0, opts.maxHints);
}

// ────────────────────────────────────────────────────────────────────
// Compose
// ────────────────────────────────────────────────────────────────────

const STRATEGY_FOCUS: Record<Strategy, string> = {
  worked_example: "Walk through a fully worked example, naming each move.",
  explanation: "Give a clean conceptual explanation grounded in the prior step.",
  quiz: "Pose a targeted question and require an answer before moving on.",
  visual: "Lead with a diagram or visual representation, then narrate it.",
};

const DIFFICULTY_FOCUS: Record<Difficulty, string> = {
  low: "Keep numbers/objects simple; emphasise the procedure.",
  medium: "Use a typical-grade-level instance; mix one twist.",
  high: "Push to a non-routine instance that forces transfer.",
};

function defaultStrategyFor(
  kind: StepKind,
  regime: OutputV3Regime,
  banditStrategy: Strategy,
): Strategy {
  // Bandit dominates only on practice/check/explain — leave structural
  // steps (hook, reflect, review, prereq_check) on their natural mode.
  switch (kind) {
    case "hook":
    case "reflect":
      return "explanation";
    case "review":
    case "prereq_check":
      return "quiz";
    case "worked_example":
      return "worked_example";
    case "explain":
      return regime.mode === "challenge" ? "explanation" : banditStrategy === "visual" ? "visual" : "explanation";
    case "check":
    case "practice":
      return banditStrategy;
  }
}

function stepRationale(
  kind: StepKind,
  regime: OutputV3Regime,
  state: OutputV3StateVector,
): string {
  switch (kind) {
    case "hook": return "Activate prior knowledge; lower entry friction.";
    case "explain": return `Regime=${regime.mode}: build the mental model before practice.`;
    case "worked_example": return "Demonstrate the procedure end-to-end (low intrinsic load).";
    case "check": return `Verify understanding (verificationBias=${regime.verificationBias}).`;
    case "practice": return `Independent practice at ensembleP=${r2(state.ensembleP)}.`;
    case "reflect": return "Consolidate gains; surface metacognitive summary.";
    case "review": return "FSRS-due card; surface before forgetting curve crosses threshold.";
    case "prereq_check": return "Hawkes flagged weak prerequisite; quick refresh before main step.";
  }
}

export function composeOutputV3(input: OutputV3Inputs): OutputV3Bundle {
  const maxDur = input.maxDurationSec ?? 900;
  const pacing = computePacingMultiplier(input.stateVector);

  // Bandit fallback if not supplied: pick from regime mode.
  const fallbackArm: OutputV3BanditChoice = {
    strategy:
      input.regime.mode === "remediate"   ? "worked_example" :
      input.regime.mode === "consolidate" ? "explanation"    :
      input.regime.mode === "advance"     ? "quiz"           :
                                            "quiz",
    difficulty:
      input.stateVector.ensembleP > 0.75 ? "low"  :
      input.stateVector.ensembleP < 0.45 ? "high" : "medium",
  };
  const arm = input.bandit ?? fallbackArm;
  const fellBackToBase = input.bandit === null;

  // ── Review interleave (front block, up to ~120s) ─────────────────
  const review = selectReviewInterleave(input.reviewDues, {
    maxCards: 3,
    secPerCard: 35,
    maxReviewSec: 120,
  });
  const reviewRecipe: OutputV3Recipe[] = review.map((d) => ({
    segment: "review",
    kind: "review",
    strategy: "quiz",
    difficulty: d.retrievability < 0.5 ? "low" : "medium",
    focus: `Recall: ${d.conceptName ?? d.conceptId} (R=${r2(d.retrievability)}, +${Math.round(d.overdueDays)}d overdue${d.isLeech ? ", leech" : ""}).`,
    durationSec: 35,
    mustVerify: true,
    rationale: stepRationale("review", input.regime, input.stateVector),
  }));

  // ── Prereq quick-check (tail block, up to ~90s) ──────────────────
  const prereq = selectPrereqRefresh(input.prereqHints, {
    maxHints: 2,
    masteryCeiling: 0.7,
  });
  const prereqRecipe: OutputV3Recipe[] = prereq.map((p) => ({
    segment: "prereq_check",
    kind: "prereq_check",
    strategy: "quiz",
    difficulty: "low",
    focus: `Prereq spot-check: ${p.conceptName ?? p.conceptId} (mastery=${r2(p.mastery)}, excitation=${r2(p.excitation)}).`,
    durationSec: 45,
    mustVerify: true,
    rationale: stepRationale("prereq_check", input.regime, input.stateVector),
  }));

  // ── Main trajectory, paced & arm-flavoured ───────────────────────
  const mainRecipe: OutputV3Recipe[] = input.baseTrajectory.steps.map((step) => {
    const strat = defaultStrategyFor(step.kind, input.regime, arm.strategy);
    const dur = Math.max(15, Math.round(step.expectedDurationSec * pacing));
    return {
      segment: "main",
      kind: step.kind,
      strategy: strat,
      difficulty: arm.difficulty,
      focus: `${STRATEGY_FOCUS[strat]} ${DIFFICULTY_FOCUS[arm.difficulty]}`.trim(),
      durationSec: dur,
      mustVerify: step.mustVerify,
      rationale: stepRationale(step.kind, input.regime, input.stateVector),
    };
  });

  // ── Total + truncation ──────────────────────────────────────────
  let recipe: OutputV3Recipe[] = [...reviewRecipe, ...mainRecipe, ...prereqRecipe];
  let total = recipe.reduce((s, r) => s + r.durationSec, 0);
  let truncated = false;
  if (total > maxDur) {
    // Trim from the tail (prereq → reflect) until under cap. Never drop hook
    // or the first main step.
    const keepFloorIdx = reviewRecipe.length + 1; // hook
    while (total > maxDur && recipe.length > keepFloorIdx + 1) {
      const dropped = recipe.pop()!;
      total -= dropped.durationSec;
      truncated = true;
    }
  }

  // ── Prompt fragments ────────────────────────────────────────────
  const reviewBlock = reviewRecipe.length
    ? [
        "=== REVIEW INTERLEAVE (do these first, briefly) ===",
        ...reviewRecipe.map((r, i) => `  R${i + 1}. ${r.focus}`),
        "Each review item: ask, wait, confirm, move on. Do not over-explain.",
      ].join("\n")
    : null;

  const prereqBlock = prereqRecipe.length
    ? [
        "=== PREREQ SPOT-CHECKS (insert before main practice if needed) ===",
        ...prereqRecipe.map((p, i) => `  P${i + 1}. ${p.focus}`),
      ].join("\n")
    : null;

  const recipeBlock = [
    "=== RECIPE (follow exactly, in this order) ===",
    ...recipe.map(
      (r, i) =>
        `  ${i + 1}. [${r.segment}/${r.kind}] strategy=${r.strategy} difficulty=${r.difficulty} ~${r.durationSec}s${r.mustVerify ? " (verify)" : ""} — ${r.focus}`,
    ),
    `Pacing multiplier: ${pacing} (budget=${total}s${truncated ? ", truncated" : ""}).`,
  ].join("\n");

  return {
    pacingMultiplier: pacing,
    segments: { review: reviewRecipe, main: mainRecipe, prereqCheck: prereqRecipe },
    recipe,
    totalDurationSec: total,
    promptFragments: { reviewBlock, prereqBlock, recipeBlock },
    audit: {
      reviewCount: reviewRecipe.length,
      prereqCount: prereqRecipe.length,
      truncated,
      fellBackToBase,
      chosenStrategy: arm.strategy,
      chosenDifficulty: arm.difficulty,
    },
  };
}
