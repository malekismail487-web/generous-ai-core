/**
 * Deterministic Teaching Policy Engine
 * ------------------------------------
 * Pure function: same student state + concept context → same TeachingPolicy.
 * No randomness, no clocks, no external IO. This is the contract the spec
 * calls the "Deterministic Policy Rule".
 *
 * Inputs are normalized so callers can pass partial profiles safely.
 */

export type Difficulty = 'low' | 'medium' | 'high';
export type Pacing = 'slow' | 'normal' | 'fast';
export type Strategy = 'worked_example' | 'explanation' | 'quiz' | 'visual';

export interface PolicyInput {
  /** Subject-level ability estimate, logits. Default 0. */
  theta?: number;
  /** Standard error on theta. Default 1.0. */
  standardError?: number;
  /** Concept mastery [0..1]. Default 0.5. */
  conceptMastery?: number;
  /** Lecture mastery [0..1]. Default 0.5. */
  lectureMastery?: number;
  /** Concept's intrinsic difficulty weight [0..3]. Default 1.0. */
  conceptDifficulty?: number;
  /** Count of recent errors on related concepts. Default 0. */
  recentErrorCount?: number;
  /** Whether dominant learning style is visual (deterministic flag). */
  visualPreference?: boolean;
}

export interface TeachingPolicy {
  difficulty: Difficulty;
  pacing: Pacing;
  strategy: Strategy;
  cognitiveLoad: number;        // 0..1 target load
  remediationLevel: number;     // 0..1, higher = more scaffolding
  verificationFrequency: number;// 0..1, fraction of steps that should be checked
  abstractionLevel: number;     // 0..1, low = concrete, high = abstract
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Deterministic policy derivation. Pure function.
 */
export function deriveTeachingPolicy(input: PolicyInput): TeachingPolicy {
  const theta = input.theta ?? 0;
  const se = input.standardError ?? 1.0;
  const concept = clamp(input.conceptMastery ?? 0.5, 0, 1);
  const lecture = clamp(input.lectureMastery ?? 0.5, 0, 1);
  const cDiff = clamp(input.conceptDifficulty ?? 1.0, 0, 3);
  const errs = Math.max(0, input.recentErrorCount ?? 0);
  const visual = !!input.visualPreference;

  // -- Difficulty: blend subject theta and concept mastery, offset by concept's difficulty weight.
  const effectiveAbility = theta + (concept - 0.5) * 1.5 - (cDiff - 1.0) * 0.4;
  const difficulty: Difficulty =
    effectiveAbility < -0.4 ? 'low' :
    effectiveAbility > 0.5 ? 'high' : 'medium';

  // -- Pacing: high SE or many recent errors → slow; very confident & high mastery → fast.
  const pacing: Pacing =
    (se > 0.55 || errs >= 3 || concept < 0.35) ? 'slow' :
    (se < 0.30 && concept > 0.75 && errs === 0) ? 'fast' : 'normal';

  // -- Strategy: deterministic priority cascade.
  let strategy: Strategy;
  if (concept < 0.35 || errs >= 3)        strategy = 'worked_example';
  else if (concept < 0.65)                strategy = 'explanation';
  else if (visual && concept < 0.85)      strategy = 'visual';
  else                                    strategy = 'quiz';

  // -- Cognitive load target: keep below capacity. Lower mastery → lower target.
  const cognitiveLoad = clamp(0.35 + concept * 0.4 - errs * 0.05, 0.2, 0.85);

  // -- Remediation: inverse of mastery, boosted by recent errors.
  const remediationLevel = clamp((1 - concept) * 0.8 + Math.min(errs, 5) * 0.05, 0, 1);

  // -- Verification: check often when SE high or mastery low.
  const verificationFrequency = clamp(0.25 + se * 0.4 + (1 - concept) * 0.3, 0.2, 0.95);

  // -- Abstraction: lecture mastery drives this. Beginners get concrete examples.
  const abstractionLevel = clamp(lecture * 0.7 + concept * 0.3, 0.1, 0.95);

  return {
    difficulty,
    pacing,
    strategy,
    cognitiveLoad: round2(cognitiveLoad),
    remediationLevel: round2(remediationLevel),
    verificationFrequency: round2(verificationFrequency),
    abstractionLevel: round2(abstractionLevel),
  };
}

function round2(x: number) { return Math.round(x * 100) / 100; }

/**
 * Render a policy as a compact prompt fragment for AI generation.
 */
export function policyToPromptFragment(p: TeachingPolicy): string {
  return [
    '=== TEACHING POLICY (deterministic) ===',
    `Difficulty: ${p.difficulty}`,
    `Pacing: ${p.pacing}`,
    `Strategy: ${p.strategy}`,
    `Target cognitive load: ${p.cognitiveLoad} (keep new info under this)`,
    `Remediation level: ${p.remediationLevel} (higher = more scaffolding / micro-steps)`,
    `Verification frequency: ${p.verificationFrequency} (fraction of steps that should ask the student to confirm understanding)`,
    `Abstraction level: ${p.abstractionLevel} (0 = concrete examples, 1 = abstract/general)`,
    'Generate the lesson strictly within these constraints.',
  ].join('\n');
}
