/**
 * ORCHESTRA O7a — Seeded Deterministic PRNG
 * ----------------------------------------
 * Rapier's determinism guide warns: Math.sin/cos and friends are NOT
 * cross-platform deterministic. All generated-world initial conditions must
 * therefore flow through INTEGER-ONLY hash mixing (this module) — never
 * floating-point trig at init time, never Math.random.
 *
 * xmur3 string seeding + mulberry32 stream. Integer arithmetic only;
 * outputs are uniform [0,1) floats derived by division (safe post-mixing).
 */

/** xmur3 — 32-bit string hash; deterministic across platforms (integer ops). */
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Deterministic re-derivation of the current state id (for manifests). */
  peek(): number;
}

export function makeRng(seed: string): Rng {
  let a = hashSeed(seed);
  const next32 = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    next: () => next32() / 4294967296,
    int: (min, max) => min + (next32() % (max - min + 1)),
    range: (min, max) => min + (next32() / 4294967296) * (max - min),
    peek: () => a,
  };
}
