// ============================================================================
//  LinUCB — disjoint contextual bandit (Li, Chu, Langford, Schapire 2010).
//
//  Each arm `a` maintains its own ridge-regression model:
//
//        A_a  := λI + Σ x_t x_tᵀ          (d × d, symmetric positive-definite)
//        b_a  := Σ r_t x_t                  (d × 1)
//        θ_a  := A_a⁻¹ b_a                  (point estimate)
//
//  Upper-confidence bound for context x:
//
//        UCB_a(x) := xᵀ θ_a + α · √(xᵀ A_a⁻¹ x)
//
//  Selection picks argmax UCB; updates are O(d²) using the Sherman–Morrison
//  rank-1 inverse:
//
//        A_inv ← A_inv - (A_inv x)(A_inv x)ᵀ / (1 + xᵀ A_inv x)
//
//  Design notes:
//   - α (exploration) is calibrated to be conservative early
//     (α = 1.0 ≈ 84% confidence band) and tunable per-deployment.
//   - λ (ridge) defaults to 1.0 — guarantees A is invertible from the first
//     decision and bounds the early exploration radius.
//   - All math is plain TypeScript with no BLAS dep. d is small (≤ 16 here),
//     so O(d²) per update / O(d²·K) per decision is negligible (microseconds).
//   - Numerically stable: every matrix op runs through clamp/finite guards;
//     a malformed A_inv falls back to (1/λ)·I rather than NaN-propagating.
//
//  Backward-compat: state objects are plain arrays so they JSON-serialize to
//  jsonb columns and round-trip without precision loss for d ≤ 16.
// ============================================================================

export interface LinUcbArmState {
  /** A⁻¹ in row-major flat form, length d*d. */
  A_inv: number[];
  /** b vector, length d. */
  b: number[];
  /** Number of updates seen by this arm (for diagnostics + cold-start logic). */
  n: number;
  /** Dimensionality. Validated on every op. */
  d: number;
}

export interface LinUcbConfig {
  /** Exploration trade-off. Larger → more exploration. */
  alpha: number;
  /** Ridge regularizer. Must be > 0. */
  lambda: number;
  /** Dimensionality of the context vector. */
  d: number;
}

export const LINUCB_DEFAULTS: LinUcbConfig = {
  alpha: 1.0,
  lambda: 1.0,
  d: 8,
};

const isFiniteNum = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ─── matrix helpers (row-major flat arrays) ─────────────────────────────────

function eye(d: number, scale = 1): number[] {
  const m = new Array(d * d).fill(0);
  for (let i = 0; i < d; i++) m[i * d + i] = scale;
  return m;
}

function matVec(A: number[], x: number[], d: number): number[] {
  const y = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    let s = 0;
    for (let j = 0; j < d; j++) s += A[i * d + j] * x[j];
    y[i] = s;
  }
  return y;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ─── state lifecycle ────────────────────────────────────────────────────────

export function newArmState(cfg: LinUcbConfig = LINUCB_DEFAULTS): LinUcbArmState {
  const d = Math.max(1, Math.floor(cfg.d));
  const lambda = cfg.lambda > 0 ? cfg.lambda : 1.0;
  return {
    // A = λI  →  A⁻¹ = (1/λ)·I
    A_inv: eye(d, 1 / lambda),
    b: new Array(d).fill(0),
    n: 0,
    d,
  };
}

/** Defensive normalization: any malformed jsonb row collapses to a fresh state. */
export function hydrateArmState(
  raw: unknown,
  cfg: LinUcbConfig = LINUCB_DEFAULTS,
): LinUcbArmState {
  const r = raw as Partial<LinUcbArmState> | null | undefined;
  if (!r || !Array.isArray(r.A_inv) || !Array.isArray(r.b)) return newArmState(cfg);
  const d = Number.isInteger(r.d) ? (r.d as number) : cfg.d;
  if (r.A_inv.length !== d * d || r.b.length !== d) return newArmState({ ...cfg, d });
  if (!r.A_inv.every(isFiniteNum) || !r.b.every(isFiniteNum)) return newArmState({ ...cfg, d });
  return {
    A_inv: r.A_inv.slice(),
    b: r.b.slice(),
    n: Number.isInteger(r.n) ? (r.n as number) : 0,
    d,
  };
}

// ─── score / select / update ────────────────────────────────────────────────

export interface ArmScore {
  armId: string;
  mean: number;       // xᵀθ — predicted reward
  bonus: number;      // α · √(xᵀ A⁻¹ x) — exploration term
  ucb: number;        // mean + bonus
  n: number;          // updates seen by the arm
}

/** Compute UCB for a single arm under a given context vector. */
export function scoreArm(
  state: LinUcbArmState,
  x: number[],
  cfg: LinUcbConfig = LINUCB_DEFAULTS,
): { mean: number; bonus: number; ucb: number } {
  if (x.length !== state.d) {
    throw new Error(`linucb.scoreArm: dim mismatch ${x.length} vs ${state.d}`);
  }
  const theta = matVec(state.A_inv, state.b, state.d);  // θ = A⁻¹ b
  const mean = dot(x, theta);
  const Ainv_x = matVec(state.A_inv, x, state.d);
  const quad = Math.max(0, dot(x, Ainv_x));             // ≥ 0 in exact arith
  const bonus = cfg.alpha * Math.sqrt(quad);
  const meanC = isFiniteNum(mean) ? mean : 0;
  const bonusC = isFiniteNum(bonus) ? bonus : cfg.alpha;
  return { mean: meanC, bonus: bonusC, ucb: meanC + bonusC };
}

/** Score every arm and return them sorted by UCB descending. */
export function selectArm(
  arms: Record<string, LinUcbArmState>,
  x: number[],
  cfg: LinUcbConfig = LINUCB_DEFAULTS,
): { chosen: ArmScore; ranking: ArmScore[] } {
  const ids = Object.keys(arms);
  if (ids.length === 0) throw new Error("linucb.selectArm: no arms supplied");
  const ranking: ArmScore[] = ids.map((armId) => {
    const s = scoreArm(arms[armId], x, cfg);
    return { armId, mean: s.mean, bonus: s.bonus, ucb: s.ucb, n: arms[armId].n };
  }).sort((a, b) => {
    if (b.ucb !== a.ucb) return b.ucb - a.ucb;
    // Deterministic tiebreaker: prefer the under-sampled arm, then alpha id.
    if (a.n !== b.n) return a.n - b.n;
    return a.armId < b.armId ? -1 : 1;
  });
  return { chosen: ranking[0], ranking };
}

/**
 * Sherman–Morrison rank-1 update:
 *   A ← A + x xᵀ
 *   A_inv ← A_inv - (A_inv x)(A_inv x)ᵀ / (1 + xᵀ A_inv x)
 *   b ← b + r · x
 * Falls back to a ridge reset if denominator collapses (catastrophic cancellation).
 */
export function updateArm(
  state: LinUcbArmState,
  x: number[],
  reward: number,
  cfg: LinUcbConfig = LINUCB_DEFAULTS,
): LinUcbArmState {
  if (x.length !== state.d) {
    throw new Error(`linucb.updateArm: dim mismatch ${x.length} vs ${state.d}`);
  }
  const r = clamp(isFiniteNum(reward) ? reward : 0, -1, 1);
  const d = state.d;
  const A_inv = state.A_inv.slice();
  const u = matVec(A_inv, x, d);            // A_inv · x  (d)
  const denom = 1 + dot(x, u);
  if (!isFiniteNum(denom) || Math.abs(denom) < 1e-12) {
    // Pathological denominator — reseed A_inv to ridge prior but still apply
    // the b update so we don't drop the reward signal.
    const fresh = newArmState({ ...cfg, d });
    const b = state.b.map((bi, i) => bi + r * x[i]);
    return { A_inv: fresh.A_inv, b, n: state.n + 1, d };
  }
  // outer product u uᵀ / denom, subtracted from A_inv
  for (let i = 0; i < d; i++) {
    const ui_over = u[i] / denom;
    for (let j = 0; j < d; j++) {
      A_inv[i * d + j] = A_inv[i * d + j] - ui_over * u[j];
    }
  }
  // Symmetrize against floating-point drift.
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const avg = 0.5 * (A_inv[i * d + j] + A_inv[j * d + i]);
      A_inv[i * d + j] = avg;
      A_inv[j * d + i] = avg;
    }
  }
  const b = state.b.map((bi, i) => bi + r * x[i]);
  return { A_inv, b, n: state.n + 1, d };
}

// ─── context vector builder ─────────────────────────────────────────────────

/**
 * Canonical 8-dim feature vector used by every bandit arm in the platform.
 * Order is FROZEN — changing it invalidates every stored A_inv / b row.
 *
 *   x[0] = 1                            (bias)
 *   x[1] = clamp(theta / 3, -1, 1)      (normalized ability)
 *   x[2] = mastery in [0, 1]
 *   x[3] = lectureMastery in [0, 1]
 *   x[4] = min(errorCount, 5) / 5
 *   x[5] = fatigue in [0, 1]
 *   x[6] = ensembleP in [0, 1]
 *   x[7] = visualPreference (0 or 1)
 */
export interface BanditContextInputs {
  theta?: number;
  mastery?: number;
  lectureMastery?: number;
  errorCount?: number;
  fatigue?: number;
  ensembleP?: number;
  visualPreference?: boolean;
}

export const BANDIT_CONTEXT_DIM = 8;

export function buildBanditContext(i: BanditContextInputs): number[] {
  return [
    1,
    clamp((Number.isFinite(i.theta) ? (i.theta as number) : 0) / 3, -1, 1),
    clamp(i.mastery ?? 0.5, 0, 1),
    clamp(i.lectureMastery ?? 0.5, 0, 1),
    Math.min(Math.max(0, Math.floor(i.errorCount ?? 0)), 5) / 5,
    clamp(i.fatigue ?? 0, 0, 1),
    clamp(i.ensembleP ?? 0.5, 0, 1),
    i.visualPreference ? 1 : 0,
  ];
}

// ─── arm taxonomy ───────────────────────────────────────────────────────────

export type ArmStrategy = "worked_example" | "explanation" | "quiz" | "visual";
export type ArmDifficulty = "low" | "medium" | "high";

/** 12 disjoint arms: 4 strategies × 3 difficulties. */
export const ARM_IDS: readonly string[] = (() => {
  const out: string[] = [];
  for (const s of ["worked_example", "explanation", "quiz", "visual"] as const) {
    for (const d of ["low", "medium", "high"] as const) out.push(`${s}:${d}`);
  }
  return out;
})();

export function parseArmId(armId: string): { strategy: ArmStrategy; difficulty: ArmDifficulty } | null {
  const [s, d] = armId.split(":");
  const strategies = new Set(["worked_example", "explanation", "quiz", "visual"]);
  const difficulties = new Set(["low", "medium", "high"]);
  if (!strategies.has(s) || !difficulties.has(d)) return null;
  return { strategy: s as ArmStrategy, difficulty: d as ArmDifficulty };
}
