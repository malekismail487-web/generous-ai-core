/**
 * catSelector.ts — Computerised Adaptive Testing next-question selector.
 *
 * Stage 1 upgrade: Fisher information under 2PL.
 *
 *   I(θ; a, b) = a² · P · (1 − P)         with P = σ(a(θ − b))
 *
 * Information peaks at b = θ and grows quadratically with discrimination `a`.
 * That means, given a candidate pool, the best item is **not** the one
 * nearest θ — it's the one with the highest a² · P(1−P). A slightly-off-b
 * item with high `a` beats a perfectly-targeted Rasch item every time.
 *
 * Backwards compatibility: callers that only know θ and SE can still get a
 * target b and an "easy/medium/hard" band via `selectNextDifficulty`. New
 * callers with access to a candidate pool should use `pickBestItem2pl`.
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

/** 2PL probability of correctness at ability θ for an (a, b) item. */
export function p2pl(theta: number, a: number, b: number): number {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Fisher information for a 2PL item at ability θ:
 *   I(θ) = a² · P · (1 − P)
 *
 * The single number that ranks candidate items for an adaptive test.
 */
export function fisherInfo2pl(theta: number, a: number, b: number): number {
  const p = p2pl(theta, a, b);
  return a * a * p * (1 - p);
}

export interface CandidateItem {
  id: string;
  a: number;        // discrimination
  b: number;        // difficulty
  /** Items already shown this session — used to apply an exposure penalty. */
  recentlyShown?: boolean;
}

export interface PickedItem extends CandidateItem {
  info: number;
  expectedP: number;
  rationale: string;
}

/**
 * Pick the best item from a candidate pool for ability θ. Uses Fisher info
 * under 2PL. The `eightyFiveRule` flag (default ON) filters the pool to
 * items where expected P(correct) ∈ [0.65, 0.92] — Wilson et al.'s
 * "85% rule" maximum-learning band — before ranking by info. If the filter
 * eliminates every candidate we fall back to the closest items so the
 * student is never stuck without an item.
 */
export function pickBestItem2pl(
  theta: number,
  candidates: CandidateItem[],
  opts: { eightyFiveRule?: boolean; exposurePenalty?: number } = {},
): PickedItem | null {
  if (!candidates.length) return null;
  const eightyFive = opts.eightyFiveRule !== false;
  const exposurePenalty = opts.exposurePenalty ?? 0.5;

  const scored = candidates.map((c) => {
    const p = p2pl(theta, c.a, c.b);
    let info = fisherInfo2pl(theta, c.a, c.b);
    if (c.recentlyShown) info *= exposurePenalty;
    return { c, p, info };
  });

  let pool = eightyFive
    ? scored.filter((s) => s.p >= 0.65 && s.p <= 0.92)
    : scored;
  if (!pool.length) pool = scored;  // graceful fallback

  pool.sort((a, b) => b.info - a.info);
  const top = pool[0];
  return {
    ...top.c,
    info: Number(top.info.toFixed(4)),
    expectedP: Number(top.p.toFixed(4)),
    rationale:
      `Picked item (a=${top.c.a.toFixed(2)}, b=${top.c.b.toFixed(2)}) — ` +
      `Fisher info ${top.info.toFixed(3)}, expected P(correct)=${top.p.toFixed(2)}.`,
  };
}

/** Short fragment for prompt injection — tells the model what difficulty to author at. */
export function buildCatPromptFragment(target: CatTarget, opts: { preferHighDiscrimination?: boolean } = {}): string {
  const base = `Next question should target difficulty b≈${target.targetB} (${target.band} band, ${target.bandLow}–${target.bandHigh}). ${target.rationale}`;
  if (opts.preferHighDiscrimination) {
    return `${base} Prefer a sharply diagnostic question (one where strong and weak students give clearly different answers).`;
  }
  return base;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
