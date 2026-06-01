/**
 * catSelector.ts — Computerized Adaptive Testing next-question selector.
 *
 * Fisher information for a 1PL/Rasch item is maximised when difficulty (b)
 * equals the student's current ability (theta). So when an AI feature is
 * about to generate or pick the next question, we tell it the target band
 * that will give the most calibration signal per answer.
 *
 * Returns a target b plus a tight band the question generator should land in.
 * We deliberately widen the band when SE is still high (provisional) so the
 * student isn't forced through a narrow corridor before we trust the estimate.
 */

export interface CatTarget {
  targetB: number;
  bandLow: number;
  bandHigh: number;
  band: "easy" | "medium" | "hard";
  rationale: string;
}

export function selectNextDifficulty(
  theta: number,
  thetaSe: number,
  opts: { provisional?: boolean; jitter?: boolean } = {},
): CatTarget {
  const safeTheta = Number.isFinite(theta) ? clamp(theta, -3, 3) : 0;
  const safeSe = Number.isFinite(thetaSe) ? clamp(thetaSe, 0.15, 1.5) : 0.6;

  // Widen the band proportional to SE — when we're unsure, sample more broadly
  // so a single lucky/unlucky question doesn't dominate.
  const halfWidth = Math.max(0.25, opts.provisional ? safeSe * 0.9 : safeSe * 0.6);

  // Tiny jitter (±0.1) prevents the generator from producing literally the
  // same difficulty repeatedly and stagnating.
  const jitter = opts.jitter === false ? 0 : (Math.random() - 0.5) * 0.2;
  const targetB = clamp(safeTheta + jitter, -3, 3);

  const bandLow = clamp(targetB - halfWidth, -3, 3);
  const bandHigh = clamp(targetB + halfWidth, -3, 3);

  let band: "easy" | "medium" | "hard";
  if (targetB < -0.5) band = "easy";
  else if (targetB > 0.5) band = "hard";
  else band = "medium";

  return {
    targetB: Number(targetB.toFixed(2)),
    bandLow: Number(bandLow.toFixed(2)),
    bandHigh: Number(bandHigh.toFixed(2)),
    band,
    rationale: opts.provisional
      ? `Provisional theta ${safeTheta.toFixed(2)} ±${safeSe.toFixed(2)} — sample wider to converge.`
      : `Calibrated theta ${safeTheta.toFixed(2)} — target b≈${targetB.toFixed(2)} for maximum info.`,
  };
}

/** Short fragment for prompt injection — tells the model what difficulty to author at. */
export function buildCatPromptFragment(target: CatTarget): string {
  return `Next question should target difficulty b≈${target.targetB} (${target.band} band, ${target.bandLow}–${target.bandHigh}). ${target.rationale}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
