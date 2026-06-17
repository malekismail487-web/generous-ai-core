// ============================================================================
//  coldStart.ts  —  Stage 8: Hierarchical Empirical-Bayes warm-start helper
// ----------------------------------------------------------------------------
//  Replaces the historical "flat" cold-start defaults (θ=0, SE=1.5, mastery=0.5,
//  uniform ensemble weights) with the population posterior at the most specific
//  scope that has any data. The lookup ladder, from most → least specific:
//
//     concept_school  →  concept_global  →  subject_school
//                     →  subject_global  →  global
//                     →  hard-coded fallback ({θ=0, SE=1.5, …})
//
//  For each prior found we apply Empirical-Bayes shrinkage (James–Stein style):
//  the posterior mean is a precision-weighted blend of the specific prior and
//  the next-broader prior, where precision = n / σ². A scope with only 3
//  observations therefore *barely* moves a student off the global mean; a
//  scope with 5000 observations dominates.
//
//  Why precision-weighting (not just nearest-non-empty):
//    - Sparse scopes can be noisier than the global mean. Shrinking toward
//      the parent prevents a tiny class with one prodigy from teaching a new
//      student that everyone is at θ=+2.5.
//    - Variance pooling produces a *calibrated* SE seed, so the IRT step
//      doesn't lock in too quickly on a still-uncertain estimate.
//
//  This module is intentionally framework-agnostic: all DB I/O lives in
//  fetchHierarchicalPrior(); the pure math (`combinePrior`, `shrinkScalar`)
//  is exported so we can unit-test it without a live database.
// ============================================================================

import { ENSEMBLE_DEFAULTS, type EnsembleWeights } from "./ensemble.ts";

// SUPABASE_SERVICE_ROLE_KEY admin client (typed loosely on purpose — the
// generated Database type lives in src/, which edge functions cannot import.)
// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

// ── Public types ───────────────────────────────────────────────────────────

export interface ColdStartPrior {
  /** Posterior mean θ for the requested scope (after hierarchical shrinkage). */
  theta: number;
  /** Calibrated SE seed for a *new* ability_estimates row. Always ≥ 0.5. */
  se: number;
  /** Posterior mean mastery in [0, 1]. */
  mastery: number;
  /** Posterior ensemble weights (always returned; falls back to ENSEMBLE_DEFAULTS). */
  ensembleWeights: EnsembleWeights;
  /** Provenance trail — most-specific scope hit first; useful for diagnostics. */
  trace: Array<{
    scope: string;
    nTheta: number;
    nMastery: number;
    nWeights: number;
    thetaMean: number;
    masteryMean: number;
  }>;
  /** True when no row was found at any scope — caller fell back to defaults. */
  isFallback: boolean;
}

export interface ColdStartQuery {
  schoolId?: string | null;
  subject?: string | null;
  conceptId?: string | null;
}

interface PriorRow {
  scope: string;
  theta_mean: number;
  theta_var: number;
  se_seed: number;
  mastery_mean: number;
  mastery_var: number;
  ensemble_weights: EnsembleWeights | null;
  n_theta: number;
  n_mastery: number;
  n_weights: number;
}

// ── Tunables ───────────────────────────────────────────────────────────────

/** Hard-coded last-resort defaults — used iff every scope is empty. */
export const COLD_START_FALLBACK: Readonly<ColdStartPrior> = Object.freeze({
  theta: 0,
  se: 1.5,
  mastery: 0.5,
  ensembleWeights: ENSEMBLE_DEFAULTS,
  trace: [],
  isFallback: true,
});

/** Floor / ceiling on the seed SE so an extremely confident parent prior
 *  doesn't make a brand-new estimate "lock in" after one answer. */
const SE_SEED_FLOOR = 0.55;
const SE_SEED_CEILING = 1.8;

/** Floor on n to avoid divide-by-zero in precision math. */
const N_FLOOR = 1e-3;

// ── Pure math (unit-tested) ────────────────────────────────────────────────

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));

/**
 * Precision-weighted shrinkage of a child mean toward a parent mean.
 *
 *   τ_child  = n_child  / σ²_child
 *   τ_parent = n_parent / σ²_parent
 *   posterior = (τ_c·μ_c + τ_p·μ_p) / (τ_c + τ_p)
 *
 * The parent acts as a "pseudo-observation" with strength proportional to its
 * own sample size and inverse variance, exactly as Empirical-Bayes prescribes.
 */
export function shrinkScalar(
  childMean: number,
  childVar: number,
  childN: number,
  parentMean: number,
  parentVar: number,
  parentN: number,
): { mean: number; variance: number; precision: number } {
  const cVar = Math.max(childVar, 1e-6);
  const pVar = Math.max(parentVar, 1e-6);
  const tauC = Math.max(childN, 0) / cVar;
  const tauP = Math.max(parentN, 0) / pVar;
  const tauSum = tauC + tauP;
  if (tauSum < N_FLOOR) {
    // No information either side — return the (possibly NaN-guarded) child.
    return { mean: childMean, variance: cVar, precision: 0 };
  }
  const mean = (tauC * childMean + tauP * parentMean) / tauSum;
  // Posterior variance under independent normals: 1 / (τ_c + τ_p).
  const variance = 1 / tauSum;
  return { mean, variance, precision: tauSum };
}

/**
 * Fold a parent prior into the running posterior. Mutates a copy and returns it.
 */
export function combinePrior(
  child: PriorRow | null,
  parent: PriorRow | null,
): PriorRow | null {
  if (!child) return parent;
  if (!parent) return child;

  const theta = shrinkScalar(
    child.theta_mean, child.theta_var, child.n_theta,
    parent.theta_mean, parent.theta_var, parent.n_theta,
  );
  const mastery = shrinkScalar(
    child.mastery_mean, child.mastery_var, child.n_mastery,
    parent.mastery_mean, parent.mastery_var, parent.n_mastery,
  );

  // Ensemble weights: precision-weighted blend of the *softplus inputs*.
  // We weight by n_weights directly (no variance proxy — weights are bounded).
  const w = blendEnsembleWeights(
    child.ensemble_weights, child.n_weights,
    parent.ensemble_weights, parent.n_weights,
  );

  return {
    scope: child.scope, // keep most-specific name for trace
    theta_mean: theta.mean,
    theta_var: Math.max(theta.variance, 1e-4),
    // se_seed: pick the *larger* of the two — never let the parent make us
    // more confident than we earned. Floor + ceiling enforced at extract time.
    se_seed: Math.max(child.se_seed, parent.se_seed),
    mastery_mean: clamp(mastery.mean, 0, 1),
    mastery_var: Math.max(mastery.variance, 1e-4),
    ensemble_weights: w.weights,
    n_theta: child.n_theta + parent.n_theta,
    n_mastery: child.n_mastery + parent.n_mastery,
    n_weights: w.n,
  };
}

function blendEnsembleWeights(
  childW: EnsembleWeights | null,
  childN: number,
  parentW: EnsembleWeights | null,
  parentN: number,
): { weights: EnsembleWeights; n: number } {
  if (!childW && !parentW) return { weights: ENSEMBLE_DEFAULTS, n: 0 };
  if (!childW) return { weights: parentW!, n: parentN };
  if (!parentW) return { weights: childW, n: childN };
  const nC = Math.max(childN, 0);
  const nP = Math.max(parentN, 0);
  const total = nC + nP;
  if (total < N_FLOOR) return { weights: childW, n: childN };
  const mix = (a: number | undefined, b: number | undefined, fallback: number) => {
    const av = Number.isFinite(a) ? (a as number) : fallback;
    const bv = Number.isFinite(b) ? (b as number) : fallback;
    return (nC * av + nP * bv) / total;
  };
  return {
    weights: {
      w_2pl:    mix(childW.w_2pl,    parentW.w_2pl,    ENSEMBLE_DEFAULTS.w_2pl),
      w_elo:    mix(childW.w_elo,    parentW.w_elo,    ENSEMBLE_DEFAULTS.w_elo),
      w_akt:    mix(childW.w_akt,    parentW.w_akt,    ENSEMBLE_DEFAULTS.w_akt),
      w_dash:   mix(childW.w_dash,   parentW.w_dash,   ENSEMBLE_DEFAULTS.w_dash),
      w_fsrs:   mix(childW.w_fsrs,   parentW.w_fsrs,   ENSEMBLE_DEFAULTS.w_fsrs ?? 0),
      w_hawkes: mix(childW.w_hawkes, parentW.w_hawkes, ENSEMBLE_DEFAULTS.w_hawkes ?? 0),
      bias:     mix(childW.bias,     parentW.bias,     ENSEMBLE_DEFAULTS.bias),
    },
    n: total,
  };
}

/**
 * Compose the final ColdStartPrior from a stack of priors, most-specific first.
 * Pure, exported for unit tests.
 */
export function composePriorStack(stack: PriorRow[]): ColdStartPrior {
  if (stack.length === 0) return { ...COLD_START_FALLBACK };

  let acc: PriorRow | null = null;
  const trace: ColdStartPrior["trace"] = [];
  for (const row of stack) {
    trace.push({
      scope: row.scope,
      nTheta: row.n_theta,
      nMastery: row.n_mastery,
      nWeights: row.n_weights,
      thetaMean: row.theta_mean,
      masteryMean: row.mastery_mean,
    });
    acc = combinePrior(acc, row);
  }
  const r = acc!;
  return {
    theta: clamp(r.theta_mean, -3, 3),
    se: clamp(r.se_seed, SE_SEED_FLOOR, SE_SEED_CEILING),
    mastery: clamp(r.mastery_mean, 0.05, 0.95),
    ensembleWeights: r.ensemble_weights ?? ENSEMBLE_DEFAULTS,
    trace,
    isFallback: false,
  };
}

// ── Database lookup ────────────────────────────────────────────────────────

/**
 * Fetch the hierarchical cold-start prior for (school, subject, concept).
 *
 * Returns a fully resolved ColdStartPrior. NEVER throws — on DB failure we
 * log and return COLD_START_FALLBACK so a misconfigured priors table can
 * never break grading/teaching/prediction.
 */
export async function fetchHierarchicalPrior(
  admin: SupabaseAdmin,
  q: ColdStartQuery,
): Promise<ColdStartPrior> {
  try {
    const subject = q.subject ? q.subject.toLowerCase().trim() : null;
    const conceptId = q.conceptId ?? null;
    const schoolId = q.schoolId ?? null;

    // Collect scopes in most-specific-first order; we'll fold parent into child.
    // The hierarchy order is intentional: concept-level priors are more
    // specific than subject-level, school-scoped is more specific than global.
    const orFilters: string[] = [];
    // global is unconditional.
    orFilters.push(`scope.eq.global`);
    if (subject) {
      orFilters.push(`and(scope.eq.subject_global,subject.eq.${escapeOr(subject)})`);
    }
    if (subject && schoolId) {
      orFilters.push(
        `and(scope.eq.subject_school,subject.eq.${escapeOr(subject)},school_id.eq.${schoolId})`,
      );
    }
    if (conceptId) {
      orFilters.push(`and(scope.eq.concept_global,concept_id.eq.${conceptId})`);
    }
    if (conceptId && schoolId) {
      orFilters.push(
        `and(scope.eq.concept_school,concept_id.eq.${conceptId},school_id.eq.${schoolId})`,
      );
    }

    const { data, error } = await admin
      .from("population_priors")
      .select(
        "scope, theta_mean, theta_var, se_seed, mastery_mean, mastery_var, " +
        "ensemble_weights, n_theta, n_mastery, n_weights, school_id, subject, concept_id",
      )
      .or(orFilters.join(","));

    if (error) {
      console.warn("[coldStart] prior fetch error:", error.message);
      return { ...COLD_START_FALLBACK };
    }
    if (!Array.isArray(data) || data.length === 0) {
      return { ...COLD_START_FALLBACK };
    }

    // Order most-specific → least-specific so combinePrior shrinks correctly.
    const rank: Record<string, number> = {
      concept_school: 0, concept_global: 1,
      subject_school: 2, subject_global: 3,
      global: 4,
    };
    const sorted: PriorRow[] = (data as PriorRow[])
      .slice()
      .sort((a, b) => (rank[a.scope] ?? 99) - (rank[b.scope] ?? 99));

    return composePriorStack(sorted);
  } catch (e) {
    console.warn("[coldStart] unexpected error:", (e as Error).message);
    return { ...COLD_START_FALLBACK };
  }
}

/** PostgREST `or()` filter values cannot contain commas or parentheses; subjects
 *  are lowercase ASCII in practice, but we guard anyway. */
function escapeOr(s: string): string {
  return s.replace(/[(),"]/g, "");
}
