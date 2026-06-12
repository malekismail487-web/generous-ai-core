/**
 * Teaching Output Engine V2 — Canonical Pure Module
 * ==================================================
 *
 * REINFORCEMENT CLAUSE (do not violate):
 *   1. Determinism: every export here is a pure function. No Date.now(),
 *      no Math.random(), no IO. Same input → byte-identical output.
 *   2. Isolation: this module never touches the DB. Callers MUST pass in
 *      preloaded, student-scoped data. No implicit schoolId / userId.
 *   3. Adaptation outputs are inputs here, never recomputed. Trajectory
 *      is a pure function of TeachingRegime, which is a pure function
 *      of TeachingStateVector. No back-channel to IRT / mastery logic.
 *   4. Policy schema is additive-only. Do not rename / remove fields.
 *   5. No cross-student leakage: function inputs are scalars/flags only.
 *
 * This is the single source of truth for the
 *   StateVector → Regime → Trajectory
 * cascade. The edge function `teaching-generate` MUST mirror this logic
 * verbatim (Deno cannot import from src/); `scripts/teachingOutputDeterminism.test.ts`
 * pins both implementations to identical fixtures to catch any drift.
 */

import { deriveTeachingPolicy, type TeachingPolicy } from "./teachingPolicy";

// ─── Types ────────────────────────────────────────────────────────────

export interface TeachingStateVectorInput {
  theta?: number;
  standardError?: number;
  mastery?: number;          // concept mastery 0..1
  lectureMastery?: number;   // 0..1
  errorCount?: number;
  conceptDifficulty?: number;
  visualPreference?: boolean;
  fatigue?: number;          // 0..1 optional
}

export interface TeachingStateVector {
  theta: number;
  standardError: number;
  mastery: number;
  lectureMastery: number;
  errorCount: number;
  conceptDifficulty: number;
  visualPreference: boolean;
  fatigue: number;
}

export type RegimeMode = "remediate" | "consolidate" | "advance" | "challenge";

export interface TeachingRegime {
  mode: RegimeMode;
  intensity: number;        // 0..1 — how many micro-steps to schedule
  abstractionBias: number;  // 0..1
  verificationBias: number; // 0..1
}

export type StepKind =
  | "hook" | "explain" | "worked_example"
  | "check" | "practice" | "reflect";

export interface TeachingStep {
  kind: StepKind;
  cognitiveLoad: number;       // 0..1
  expectedDurationSec: number; // integer
  mustVerify: boolean;
}

export interface TeachingTrajectory {
  steps: TeachingStep[];
  totalDurationSec: number;
}

/** Stable DTO returned to clients. Version-boundary for UI. */
export interface TeachingTrajectoryDTO {
  version: 1;
  regime: TeachingRegime;
  trajectory: TeachingTrajectory;
  policy: TeachingPolicy;
  stateVector: TeachingStateVector;
}

// ─── Helpers ──────────────────────────────────────────────────────────

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

// ─── 1. State vector ─────────────────────────────────────────────────

export function buildTeachingStateVector(
  i: TeachingStateVectorInput,
): TeachingStateVector {
  return {
    theta: Number.isFinite(i.theta) ? (i.theta as number) : 0,
    standardError: clamp(i.standardError ?? 1.0, 0, 3),
    mastery: clamp(i.mastery ?? 0.5, 0, 1),
    lectureMastery: clamp(i.lectureMastery ?? 0.5, 0, 1),
    errorCount: Math.max(0, Math.floor(i.errorCount ?? 0)),
    conceptDifficulty: clamp(i.conceptDifficulty ?? 1.0, 0, 3),
    visualPreference: !!i.visualPreference,
    fatigue: clamp(i.fatigue ?? 0, 0, 1),
  };
}

// ─── 2. Regime (pure cascade from vector) ────────────────────────────

export function deriveTeachingRegime(v: TeachingStateVector): TeachingRegime {
  const effective =
    v.theta + (v.mastery - 0.5) * 1.5 - (v.conceptDifficulty - 1.0) * 0.4;

  let mode: RegimeMode;
  if (v.mastery < 0.35 || v.errorCount >= 3)      mode = "remediate";
  else if (effective < -0.1 || v.mastery < 0.6)   mode = "consolidate";
  else if (effective < 0.6)                       mode = "advance";
  else                                            mode = "challenge";

  // intensity: more steps when uncertain or struggling, capped by fatigue
  const intensityRaw =
    0.4 + v.standardError * 0.35 + (1 - v.mastery) * 0.25 - v.fatigue * 0.3;
  const intensity = clamp(intensityRaw, 0.2, 1.0);

  const abstractionBias = clamp(
    v.lectureMastery * 0.7 + v.mastery * 0.3,
    0.1, 0.95,
  );

  const verificationBias = clamp(
    0.25 + v.standardError * 0.4 + (1 - v.mastery) * 0.3,
    0.2, 0.95,
  );

  return {
    mode,
    intensity: r2(intensity),
    abstractionBias: r2(abstractionBias),
    verificationBias: r2(verificationBias),
  };
}

// ─── 3. Trajectory (pure function of regime only) ────────────────────

/**
 * Pure derivation of an ordered step list from regime. Deliberately does
 * NOT read the state vector — that would create a second adaptation path.
 * All adaptation signal MUST flow through `regime`.
 */
export function buildTeachingTrajectory(
  regime: TeachingRegime,
): TeachingTrajectory {
  const baseSteps: TeachingStep[] = [];

  // Hook is always present
  baseSteps.push(step("hook", 0.2, 30, false));

  switch (regime.mode) {
    case "remediate":
      baseSteps.push(step("worked_example", 0.55, 90, true));
      baseSteps.push(step("explain",        0.5,  75, false));
      baseSteps.push(step("check",          0.4,  45, true));
      baseSteps.push(step("worked_example", 0.55, 90, true));
      baseSteps.push(step("practice",       0.5,  90, true));
      baseSteps.push(step("reflect",        0.3,  45, false));
      break;
    case "consolidate":
      baseSteps.push(step("explain",        0.5,  75, false));
      baseSteps.push(step("worked_example", 0.55, 75, true));
      baseSteps.push(step("check",          0.45, 45, true));
      baseSteps.push(step("practice",       0.55, 90, true));
      baseSteps.push(step("reflect",        0.35, 45, false));
      break;
    case "advance":
      baseSteps.push(step("explain",  0.55, 75,  false));
      baseSteps.push(step("check",    0.5,  45,  true));
      baseSteps.push(step("practice", 0.65, 120, true));
      baseSteps.push(step("reflect",  0.4,  45,  false));
      break;
    case "challenge":
      baseSteps.push(step("explain",  0.6,  60,  false));
      baseSteps.push(step("practice", 0.8,  150, true));
      baseSteps.push(step("reflect",  0.5,  60,  false));
      break;
  }

  // intensity scales the step count deterministically
  const keepCount = Math.max(
    3,
    Math.round(baseSteps.length * (0.6 + regime.intensity * 0.4)),
  );
  let steps = baseSteps.slice(0, keepCount);

  // verificationBias: when high, every non-hook step must verify
  if (regime.verificationBias >= 0.7) {
    steps = steps.map((s, idx) =>
      idx === 0 ? s : { ...s, mustVerify: true },
    );
  }

  const totalDurationSec = steps.reduce(
    (sum, s) => sum + s.expectedDurationSec, 0,
  );

  return { steps, totalDurationSec };
}

function step(
  kind: StepKind, cognitiveLoad: number,
  expectedDurationSec: number, mustVerify: boolean,
): TeachingStep {
  return { kind, cognitiveLoad: r2(cognitiveLoad), expectedDurationSec, mustVerify };
}

// ─── 4. Prompt fragment ──────────────────────────────────────────────

export function buildPolicyPrompt(
  regime: TeachingRegime,
  trajectory: TeachingTrajectory,
  curriculum?: { conceptName?: string; lectureTitle?: string },
): string {
  const stepLines = trajectory.steps.map(
    (s, i) =>
      `  ${i + 1}. ${s.kind} (load=${s.cognitiveLoad}, ~${s.expectedDurationSec}s${s.mustVerify ? ", verify" : ""})`,
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
    curriculum?.lectureTitle ? `Lecture: ${curriculum.lectureTitle}` : "",
    curriculum?.conceptName  ? `Concept: ${curriculum.conceptName}` : "",
    "",
    "Generate the lesson strictly within these constraints. Each numbered",
    "step above MUST appear in the output in the same order, labelled with",
    "its step kind. Do not add steps not listed. Do not skip steps marked",
    "'verify' — those must end with a comprehension check addressed to the",
    "student.",
  ].filter(Boolean).join("\n");
}

// ─── 5. Output enforcement ───────────────────────────────────────────

export interface EnforcedOutput {
  content: string;
  constrainedBy: {
    mode: RegimeMode;
    intensity: number;
    abstraction: number;
    verification: number;
  };
  trajectory: TeachingTrajectory;
  /** Names of steps that appeared to be missing in the rendered content. */
  missingSteps: StepKind[];
}

export function enforcePolicy(
  content: string,
  regime: TeachingRegime,
  trajectory: TeachingTrajectory,
): EnforcedOutput {
  const lower = (content || "").toLowerCase();
  const missingSteps = trajectory.steps
    .filter((s) => !lower.includes(s.kind.replace("_", " ")) &&
                    !lower.includes(s.kind))
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

// ─── 6. Full pipeline (client-side convenience) ──────────────────────

/**
 * Pure pipeline: vector input → policy + regime + trajectory.
 * No AI call — that lives in the edge function. Use this on the client
 * for the admin simulator and any preview surfaces.
 */
export function deriveTeachingPlan(
  input: TeachingStateVectorInput,
): Omit<TeachingTrajectoryDTO, "version"> & { version: 1 } {
  const stateVector = buildTeachingStateVector(input);
  const regime = deriveTeachingRegime(stateVector);
  const trajectory = buildTeachingTrajectory(regime);
  const policy = deriveTeachingPolicy({
    theta: stateVector.theta,
    standardError: stateVector.standardError,
    conceptMastery: stateVector.mastery,
    lectureMastery: stateVector.lectureMastery,
    conceptDifficulty: stateVector.conceptDifficulty,
    recentErrorCount: stateVector.errorCount,
    visualPreference: stateVector.visualPreference,
  });
  return { version: 1, stateVector, regime, trajectory, policy };
}
