// ============================================================================
//  cemTuner.ts — Stage 11
// ----------------------------------------------------------------------------
//  Cross-Entropy Method (Rubinstein 1997) for hyperparameter tuning. We use
//  it to search the joint space of:
//
//    • LinUCB α                            — exploration aggressiveness
//    • softmax temperature τ               — propensity-logging sharpness
//    • ensemble blend weights (5-simplex)  — 2PL / Elo / AKT / DASH / FSRS
//    • cold-start shrinkage strength       — Empirical-Bayes pseudo-counts
//
//  CEM is gradient-free and works directly on the replay objective:
//
//      J(θ) = V̂_SNIPS(π_θ on logged decisions)  − λ · ECE(π_θ)
//
//  i.e. expected reward under the candidate policy, penalised by miscalibration
//  measured on the held-out ensemble_predictions slice. λ defaults to 0.5.
//
//  Algorithm:
//      1. Sample N candidates from N(μ, Σ) (diagonal Σ for simplicity).
//      2. Evaluate J on each candidate via the user-supplied objective.
//      3. Keep the top-ρ fraction (elites), refit μ, Σ to them.
//      4. Repeat for K generations. Return the best-ever candidate.
//
//  All math is deterministic given a seed.  No external deps.
// ============================================================================

export interface CemParamSpec {
  name: string;
  /** Hard bounds — samples are clipped into [lo, hi]. */
  lo: number;
  hi: number;
  /** Initial mean. */
  mu0: number;
  /** Initial standard deviation. */
  sigma0: number;
}

export interface CemConfig {
  population: number;     // N
  elites: number;         // top-ρ count
  generations: number;    // K
  seed: number;
  /** Floor on σ so the distribution never collapses to a delta. */
  sigmaFloor: number;
}

export const CEM_DEFAULTS: CemConfig = {
  population: 32,
  elites: 8,
  generations: 6,
  seed: 1729,
  sigmaFloor: 0.01,
};

export type CemObjective = (params: Record<string, number>) => Promise<number> | number;

export interface CemTrace {
  generation: number;
  bestValue: number;
  bestParams: Record<string, number>;
  meanValue: number;
  mu: Record<string, number>;
  sigma: Record<string, number>;
}

export interface CemResult {
  bestValue: number;
  bestParams: Record<string, number>;
  trace: CemTrace[];
  evaluations: number;
}

// ─── RNG (mulberry32, seedable, deterministic) ──────────────────────────────

function mulberry32(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Box–Muller standard-normal sample from a uniform RNG. */
function gauss(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ─── main optimiser ─────────────────────────────────────────────────────────

export async function runCem(
  specs: CemParamSpec[],
  objective: CemObjective,
  cfg: Partial<CemConfig> = {},
): Promise<CemResult> {
  const C: CemConfig = { ...CEM_DEFAULTS, ...cfg };
  if (C.elites >= C.population) {
    throw new Error("cemTuner: elites must be < population");
  }
  const rng = mulberry32(C.seed);
  const mu: Record<string, number> = {};
  const sigma: Record<string, number> = {};
  for (const s of specs) { mu[s.name] = s.mu0; sigma[s.name] = s.sigma0; }

  const trace: CemTrace[] = [];
  let bestValue = -Infinity;
  let bestParams: Record<string, number> = { ...mu };
  let evaluations = 0;

  for (let g = 0; g < C.generations; g++) {
    // 1. sample population
    const candidates: { params: Record<string, number>; value: number }[] = [];
    for (let i = 0; i < C.population; i++) {
      const params: Record<string, number> = {};
      for (const s of specs) {
        const raw = mu[s.name] + sigma[s.name] * gauss(rng);
        params[s.name] = clip(raw, s.lo, s.hi);
      }
      // 2. evaluate
      const v = await objective(params);
      evaluations++;
      if (Number.isFinite(v)) {
        candidates.push({ params, value: v });
        if (v > bestValue) { bestValue = v; bestParams = { ...params }; }
      }
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => b.value - a.value);
    const elites = candidates.slice(0, Math.min(C.elites, candidates.length));

    // 3. refit μ, σ from elites
    for (const s of specs) {
      const xs = elites.map((c) => c.params[s.name]);
      const m = xs.reduce((a, x) => a + x, 0) / xs.length;
      const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
      mu[s.name] = m;
      sigma[s.name] = Math.max(C.sigmaFloor, Math.sqrt(v));
    }
    const meanValue =
      candidates.reduce((a, c) => a + c.value, 0) / candidates.length;
    trace.push({
      generation: g,
      bestValue,
      bestParams: { ...bestParams },
      meanValue,
      mu: { ...mu },
      sigma: { ...sigma },
    });
  }

  return { bestValue, bestParams, trace, evaluations };
}

// ─── canonical spec for Lumina's hyperparameter space ───────────────────────

export const LUMINA_HP_SPECS: CemParamSpec[] = [
  { name: "linucb_alpha",       lo: 0.2,  hi: 2.5,  mu0: 1.0,  sigma0: 0.3 },
  { name: "softmax_tau",        lo: 0.05, hi: 0.8,  mu0: 0.15, sigma0: 0.08 },
  { name: "ensemble_w_2pl",     lo: 0.0,  hi: 1.0,  mu0: 0.25, sigma0: 0.15 },
  { name: "ensemble_w_elo",     lo: 0.0,  hi: 1.0,  mu0: 0.20, sigma0: 0.15 },
  { name: "ensemble_w_akt",     lo: 0.0,  hi: 1.0,  mu0: 0.20, sigma0: 0.15 },
  { name: "ensemble_w_dash",    lo: 0.0,  hi: 1.0,  mu0: 0.15, sigma0: 0.10 },
  { name: "ensemble_w_fsrs",    lo: 0.0,  hi: 1.0,  mu0: 0.20, sigma0: 0.10 },
  { name: "coldstart_strength", lo: 0.1,  hi: 5.0,  mu0: 1.0,  sigma0: 0.5  },
];

/** Renormalise the 5 ensemble weights to a simplex. Mutates the input. */
export function normaliseEnsembleWeights(p: Record<string, number>): Record<string, number> {
  const keys = ["ensemble_w_2pl", "ensemble_w_elo", "ensemble_w_akt",
                "ensemble_w_dash", "ensemble_w_fsrs"];
  let s = 0;
  for (const k of keys) s += Math.max(0, p[k] ?? 0);
  if (s < 1e-6) {
    for (const k of keys) p[k] = 1 / keys.length;
  } else {
    for (const k of keys) p[k] = Math.max(0, p[k] ?? 0) / s;
  }
  return p;
}
