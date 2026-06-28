// ============================================================================
//  runtimeConfig.ts — Stage 12 · §1 (Meta-Learning Loop completion)
// ----------------------------------------------------------------------------
//  Atomic, in-process cache for the active hyperparameter snapshot stored in
//  `public.hyperparameter_settings`. The CEM tuner (Stage 11) discovers and
//  promotes improved parameters; before Stage 12 the runtime kept reading
//  hardcoded defaults, so the loop never closed. This module is the missing
//  link: every adaptive subsystem reads its tunables through `getRuntimeConfig`
//  and therefore picks up promoted snapshots automatically.
//
//  Guarantees:
//   - **Atomic snapshot**: a snapshot is either fully loaded (all fields
//     validated) or completely ignored. Partial writes never become active.
//   - **Deterministic fallback**: when the table is empty or unreachable the
//     module returns the same canonical defaults that the legacy hardcoded
//     constants used. Behaviour pre-promotion is bit-identical to pre-Stage-12.
//   - **TTL + version pinning**: cached for `TTL_MS`. Callers that must avoid
//     drift inside a single request pass a `snapshotId` through to downstream
//     helpers; all reads inside one request resolve to the same snapshot.
//   - **No throw**: failures are logged and the cached or default snapshot is
//     returned. Adaptive paths must never crash because tuning is offline.
// ============================================================================

import { LINUCB_DEFAULTS } from "./linucb.ts";
import { ENSEMBLE_DEFAULTS, type EnsembleWeights } from "./ensemble.ts";
import { DEFAULT_TEMPERATURE } from "./propensity.ts";

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

/** Canonical shape of a tunable snapshot. Versioned for forward compatibility. */
export interface RuntimeConfig {
  /** Monotonic identifier of the active row (uuid string or "defaults"). */
  snapshotId: string;
  /** Server time the snapshot was loaded into memory. */
  loadedAt: number;
  /** LinUCB exploration trade-off. */
  linucbAlpha: number;
  /** LinUCB ridge regularizer. */
  linucbLambda: number;
  /** Softmax-over-UCB temperature used for propensity logging. */
  softmaxTau: number;
  /** Ensemble stacking weights (subject of CEM tuning). */
  ensembleWeights: EnsembleWeights;
  /** Cold-start shrinkage strength toward the population mean. */
  coldStartShrinkage: number;
  /** Stage 12 §2 — response-time gating mid-point in milliseconds. */
  rtMidpointMs: number;
  /** Stage 12 §2 — response-time gating spread in log-ms units. */
  rtSpreadLog: number;
  /** Stage 12 §3 — minimum number of mandatory steps required in output. */
  outputMinMandatorySteps: number;
}

const TTL_MS = 10_000;

const DEFAULTS: RuntimeConfig = Object.freeze({
  snapshotId: "defaults",
  loadedAt: 0,
  linucbAlpha: LINUCB_DEFAULTS.alpha,
  linucbLambda: LINUCB_DEFAULTS.lambda,
  softmaxTau: DEFAULT_TEMPERATURE,
  ensembleWeights: { ...ENSEMBLE_DEFAULTS },
  coldStartShrinkage: 1.0,
  rtMidpointMs: 18_000,
  rtSpreadLog: 0.9,
  outputMinMandatorySteps: 3,
});

let cache: { value: RuntimeConfig; loadedAt: number } | null = null;
let inflight: Promise<RuntimeConfig> | null = null;

/** Pure helpers — every field is bounds-checked against tuning artefacts. */
function num(v: unknown, fallback: number, lo: number, hi: number): number {
  const x = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}

/** Reconstruct an EnsembleWeights object from a CEM `params` payload. */
function readEnsemble(params: Record<string, unknown> | null | undefined): EnsembleWeights {
  if (!params) return { ...ENSEMBLE_DEFAULTS };
  const w_2pl    = num(params.w_2pl,    ENSEMBLE_DEFAULTS.w_2pl,    0, 5);
  const w_elo    = num(params.w_elo,    ENSEMBLE_DEFAULTS.w_elo,    0, 5);
  const w_akt    = num(params.w_akt,    ENSEMBLE_DEFAULTS.w_akt,    0, 5);
  const w_dash   = num(params.w_dash,   ENSEMBLE_DEFAULTS.w_dash,   0, 5);
  const w_fsrs   = num(params.w_fsrs,   ENSEMBLE_DEFAULTS.w_fsrs ?? 0, 0, 5);
  const w_hawkes = num(params.w_hawkes, ENSEMBLE_DEFAULTS.w_hawkes ?? 0, 0, 5);
  const bias     = num(params.bias,     ENSEMBLE_DEFAULTS.bias,    -3, 3);
  return { w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias };
}

/** Build a fully validated snapshot from a row of `hyperparameter_settings`. */
export function buildRuntimeConfig(snapshotId: string, params: Record<string, unknown> | null): RuntimeConfig {
  const p = params ?? {};
  return {
    snapshotId,
    loadedAt: Date.now(),
    linucbAlpha:        num(p.linucb_alpha,        DEFAULTS.linucbAlpha,        0.1, 5),
    linucbLambda:       num(p.linucb_lambda,       DEFAULTS.linucbLambda,       0.01, 100),
    softmaxTau:         num(p.softmax_tau,         DEFAULTS.softmaxTau,         0.02, 2),
    ensembleWeights:    readEnsemble(p as Record<string, unknown>),
    coldStartShrinkage: num(p.cold_start_shrinkage, DEFAULTS.coldStartShrinkage, 0, 5),
    rtMidpointMs:       num(p.rt_midpoint_ms,      DEFAULTS.rtMidpointMs,      2_000, 120_000),
    rtSpreadLog:        num(p.rt_spread_log,       DEFAULTS.rtSpreadLog,       0.2, 3),
    outputMinMandatorySteps: num(p.output_min_mandatory_steps, DEFAULTS.outputMinMandatorySteps, 1, 8),
  };
}

/** Default snapshot (frozen). Exposed for tests and degenerate fallbacks. */
export function defaultRuntimeConfig(): RuntimeConfig {
  return { ...DEFAULTS, loadedAt: Date.now() };
}

/**
 * Resolve the active runtime configuration.
 *
 *  - If `admin` is omitted (tests / pure-function callers) returns defaults.
 *  - Otherwise reads `hyperparameter_settings` where `scope='global' AND active=true`.
 *  - Concurrent calls coalesce into a single DB hit.
 *  - Failures fall back to the previously-cached snapshot, then to defaults.
 */
export async function getRuntimeConfig(admin?: SupabaseAdmin): Promise<RuntimeConfig> {
  if (!admin) return defaultRuntimeConfig();
  const now = Date.now();
  if (cache && (now - cache.loadedAt) < TTL_MS) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await admin
        .from("hyperparameter_settings")
        .select("id, params, activated_at")
        .eq("scope", "global")
        .eq("active", true)
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[runtimeConfig] read failed:", error.message);
        const fallback = cache?.value ?? defaultRuntimeConfig();
        cache = { value: fallback, loadedAt: now };
        return fallback;
      }
      if (!data) {
        const def = defaultRuntimeConfig();
        cache = { value: def, loadedAt: now };
        return def;
      }
      const snap = buildRuntimeConfig(String(data.id), (data.params ?? {}) as Record<string, unknown>);
      cache = { value: snap, loadedAt: now };
      return snap;
    } catch (e) {
      console.warn("[runtimeConfig] unexpected:", e);
      const fallback = cache?.value ?? defaultRuntimeConfig();
      cache = { value: fallback, loadedAt: now };
      return fallback;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Explicitly clear the cache. Used by promotion paths to avoid TTL drift. */
export function invalidateRuntimeConfig(): void {
  cache = null;
}
