// ============================================================================
//  explain.ts — Stage 12 · §5 (Runtime explainability)
// ----------------------------------------------------------------------------
//  Every Lumina lesson is now accompanied by a structured *explanation
//  trace*: a transparent, deterministic justification of why that lesson
//  was selected. The trace is read-only — it never feeds back into the
//  adaptation engine — but it is the single most powerful audit surface
//  for administrators, researchers, and future debugging.
//
//  The trace captures contributions from every layer the user touched
//  during selection:
//      θ / SE          → ability layer
//      mastery         → concept layer
//      ensembleP       → calibrated forecast
//      FSRS review     → retention layer
//      Hawkes prereq   → cross-concept temporal layer
//      LinUCB bandit   → exploration layer
//      Cold-start      → hierarchical prior layer
//      Regime/policy   → deterministic mapping layer
//
//  The output is JSON-friendly so it can be (a) stored in `lesson_explanations`,
//  (b) rendered verbatim in admin tooling, and (c) parsed by downstream
//  evaluation pipelines.
// ============================================================================

export interface ExplainInputs {
  studentId: string;
  subject?: string;
  conceptId?: string | null;
  lectureId?: string | null;

  theta: number;
  standardError: number;
  mastery: number;
  lectureMastery: number;
  ensembleP: number;
  ensembleComponents?: Record<string, number> | null;

  regime: { mode: string; intensity: number; verificationBias: number; abstractionBias: number };
  policy: { difficulty: string; pacing: string; strategy: string };

  bandit?: {
    armId: string;
    strategy: string;
    difficulty: string;
    ucb: number;
    mean: number;
    bonus: number;
  } | null;

  reviewDueCount: number;
  topReviewPriority?: number;
  prereqHotspot?: { conceptName?: string; excitation: number; mastery: number } | null;

  pacingMultiplier?: number;
  totalDurationSec?: number;
  configSnapshotId: string;
}

export interface ExplainTrace {
  /** Single-sentence headline suitable for UI tooltips. */
  headline: string;
  /** Layered, ordered reasoning entries. */
  reasoning: Array<{ layer: string; signal: string; impact: string }>;
  /** Raw numbers for downstream re-analysis. */
  numbers: Record<string, number | string | null>;
  /** Stable identifier for this trace. */
  configSnapshotId: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildExplanation(i: ExplainInputs): ExplainTrace {
  const reasoning: ExplainTrace["reasoning"] = [];

  // Ability layer.
  reasoning.push({
    layer: "ability",
    signal: `θ=${r2(i.theta)} ± ${r2(i.standardError)}`,
    impact: i.standardError > 0.5
      ? "High uncertainty drives a slower pace and extra verification."
      : "Low uncertainty allows compact pacing.",
  });

  // Concept layer.
  reasoning.push({
    layer: "concept",
    signal: `mastery=${r2(i.mastery)}, lecture=${r2(i.lectureMastery)}`,
    impact: i.mastery < 0.35
      ? "Mastery below 0.35 forces remediate mode with worked examples."
      : i.mastery > 0.75
        ? "Strong mastery enables challenge-style practice."
        : "Mid-mastery selects consolidate/advance strategy.",
  });

  // Ensemble forecast.
  const components = i.ensembleComponents
    ? Object.entries(i.ensembleComponents)
        .map(([k, v]) => `${k}=${r2(Number(v))}`).join(", ")
    : "none";
  reasoning.push({
    layer: "ensemble",
    signal: `p̂=${r2(i.ensembleP)} (${components})`,
    impact: i.ensembleP < 0.45
      ? "Predicted < 45% chance correct — increase scaffold."
      : i.ensembleP > 0.85
        ? "Predicted > 85% — push difficulty up."
        : "In the optimal 45–85% learning band.",
  });

  // Retention.
  if (i.reviewDueCount > 0) {
    reasoning.push({
      layer: "retention (FSRS)",
      signal: `${i.reviewDueCount} due cards; top priority=${r2(i.topReviewPriority ?? 0)}`,
      impact: "Prepending review block to reinforce decaying memories before new material.",
    });
  }

  // Temporal cross-concept.
  if (i.prereqHotspot) {
    reasoning.push({
      layer: "prerequisite (Hawkes-style)",
      signal: `${i.prereqHotspot.conceptName ?? "neighbour"}: excitation=${r2(i.prereqHotspot.excitation)}, mastery=${r2(i.prereqHotspot.mastery)}`,
      impact: "Weak-but-excited neighbour appended for spot refresh.",
    });
  }

  // Bandit.
  if (i.bandit) {
    reasoning.push({
      layer: "bandit (LinUCB)",
      signal: `arm=${i.bandit.armId}; mean=${r2(i.bandit.mean)} + α·bonus=${r2(i.bandit.bonus)}`,
      impact: i.bandit.bonus > i.bandit.mean
        ? "Exploration bonus dominated — chosen primarily for information value."
        : "Exploitation dominated — chosen for expected reward.",
    });
  }

  // Deterministic regime mapping.
  reasoning.push({
    layer: "regime",
    signal: `${i.regime.mode} (intensity=${r2(i.regime.intensity)}, verify=${r2(i.regime.verificationBias)})`,
    impact: `Maps to policy: ${i.policy.difficulty}/${i.policy.pacing}/${i.policy.strategy}.`,
  });

  // Pacing.
  if (i.pacingMultiplier !== undefined) {
    reasoning.push({
      layer: "output engine V3",
      signal: `pace×${r2(i.pacingMultiplier)}, total=${i.totalDurationSec ?? 0}s`,
      impact: i.pacingMultiplier > 1.1
        ? "Stretching steps because forecast or fatigue requested it."
        : i.pacingMultiplier < 0.9
          ? "Compressing steps because the student is on a roll."
          : "Pacing at nominal.",
    });
  }

  const headline =
    `Lesson chosen ${i.policy.strategy}/${i.policy.difficulty} in ${i.regime.mode} regime ` +
    `(p̂=${r2(i.ensembleP)}, mastery=${r2(i.mastery)}, θ=${r2(i.theta)}±${r2(i.standardError)}).`;

  return {
    headline,
    reasoning,
    numbers: {
      theta: r2(i.theta),
      standardError: r2(i.standardError),
      mastery: r2(i.mastery),
      lectureMastery: r2(i.lectureMastery),
      ensembleP: r2(i.ensembleP),
      banditUcb: i.bandit ? r2(i.bandit.ucb) : null,
      banditMean: i.bandit ? r2(i.bandit.mean) : null,
      banditBonus: i.bandit ? r2(i.bandit.bonus) : null,
      reviewDueCount: i.reviewDueCount,
      pacingMultiplier: i.pacingMultiplier ?? null,
      totalDurationSec: i.totalDurationSec ?? null,
    },
    configSnapshotId: i.configSnapshotId,
  };
}
