/**
 * ORCHESTRA O2 — Capacity Planner
 * ------------------------------
 * Owner amendment §0a.1: NO FIXED CEILINGS. Every lane/parent/worker count
 * this planner emits is DERIVED from the workload profile of a specific
 * plan — a 50M-line migration legitimately plans a proportionally-sized
 * swarm. There is no constant in this module that caps concurrency; the
 * only numeric parameters are the workload's own measured properties.
 *
 * Demand model (all integer math, deterministic):
 *
 *   concurrentUnits = max(1, round(taskUnits × parallelism))
 *   detUnits        = round(taskUnits × deterministicShare)
 *   t0Lanes         = round(concurrentUnits × deterministicShare)
 *   escalations     = ceil((concurrentUnits − t0Lanes) × escalationRate)
 *   t2Lanes         = escalations
 *   t1Lanes         = (concurrentUnits − t0Lanes) − t2Lanes
 *   workerCount     = max(0, taskUnits − detUnits)      // logical agents
 *   parentCount     = clamp(ceil(domainDiversity), 1, max(1, workerCount))
 *
 * Distribution of workers across families is even with the remainder
 * assigned to the earliest families — deterministic and replayable.
 *
 * Contract:
 *   - PURE + TOTAL: `planCapacity` validates its inputs and returns typed
 *     failures; never throws, never reads clocks or randomness.
 *   - LINEARITY is a pinned property: scaling taskUnits ×k scales worker
 *     and lane demand ~×k (asserted exactly-enough by the harness).
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface WorkloadProfile {
  /** Independent units of work the plan decomposed into. */
  readonly taskUnits: number;
  /** Fraction of units that can run concurrently (independence measure). */
  readonly parallelism: number; // (0..1]
  /** Fraction of units executable by deterministic executors (no model). */
  readonly deterministicShare: number; // [0..1]
  /** Fraction of model-lane work expected to escalate to frontier tier. */
  readonly escalationRate: number; // [0..1]
  /** Distinct expertises required → family (parent) count driver. */
  readonly domainDiversity: number; // ≥ 1
  /** Mean tool calls per unit. */
  readonly avgUnitToolCalls: number; // ≥ 0
  /** Mean token estimate per unit. */
  readonly avgUnitTokens: number; // ≥ 0
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface LaneDemand {
  readonly t0: number;
  readonly t1: number;
  readonly t2: number;
}

export interface CapacityPlan {
  readonly parentCount: number;
  readonly workerCount: number;
  /** Workers per family, index-aligned with family ordinal. */
  readonly workersPerFamily: readonly number[];
  readonly laneDemand: LaneDemand;
  readonly estimatedTokens: number;
  readonly estimatedToolCalls: number;
  /** Bounded human-readable derivation for the log/Eyes (≤400 chars). */
  readonly rationale: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type PlanReason =
  | "not_an_object"
  | "bad_task_units"
  | "bad_parallelism"
  | "bad_deterministic_share"
  | "bad_escalation_rate"
  | "bad_domain_diversity"
  | "bad_unit_metrics";

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateProfile(p: unknown): WorkloadProfile | PlanReason {
  if (typeof p !== "object" || p === null) return "not_an_object";
  const o = p as Record<string, unknown>;

  if (!isFiniteNum(o.taskUnits) || o.taskUnits < 1 || !Number.isInteger(o.taskUnits)) {
    return "bad_task_units";
  }
  if (!isFiniteNum(o.parallelism) || o.parallelism <= 0 || o.parallelism > 1) {
    return "bad_parallelism";
  }
  if (!isFiniteNum(o.deterministicShare) || o.deterministicShare < 0 || o.deterministicShare > 1) {
    return "bad_deterministic_share";
  }
  if (!isFiniteNum(o.escalationRate) || o.escalationRate < 0 || o.escalationRate > 1) {
    return "bad_escalation_rate";
  }
  if (!isFiniteNum(o.domainDiversity) || o.domainDiversity < 1) {
    return "bad_domain_diversity";
  }
  if (
    !isFiniteNum(o.avgUnitToolCalls) || o.avgUnitToolCalls < 0 ||
    !isFiniteNum(o.avgUnitTokens) || o.avgUnitTokens < 0
  ) {
    return "bad_unit_metrics";
  }

  return p as WorkloadProfile;
}

const RATIONALE_MAX = 400;

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export type CapacityResult =
  | { readonly ok: true; readonly plan: CapacityPlan }
  | { readonly ok: false; readonly reason: PlanReason };

/**
 * Compute the swarm's demanded shape from the workload itself. The ONLY
 * sanctioned source of lane/parent/worker numbers in ORCHESTRA (owner law:
 * computed demand, never fiat constants).
 */
export function planCapacity(profile: WorkloadProfile): CapacityResult {
  const v = validateProfile(profile);
  if (typeof v === "string") return { ok: false, reason: v };
  const p = v;

  const concurrentUnits = Math.max(1, Math.round(p.taskUnits * p.parallelism));

  const t0Lanes = Math.round(concurrentUnits * p.deterministicShare);
  const modelConcurrent = concurrentUnits - t0Lanes;
  const t2Lanes = Math.ceil(modelConcurrent * p.escalationRate);
  const t1Lanes = modelConcurrent - t2Lanes;

  const detUnits = Math.round(p.taskUnits * p.deterministicShare);
  const workerCount = Math.max(0, p.taskUnits - detUnits);
  const parentCount = Math.min(
    Math.max(1, Math.ceil(p.domainDiversity)),
    Math.max(1, workerCount),
  );

  // Even distribution; remainder to the earliest families.
  const base = parentCount === 0 ? 0 : Math.floor(workerCount / parentCount);
  const remainder = parentCount === 0 ? 0 : workerCount % parentCount;
  const workersPerFamily: number[] = [];
  for (let i = 0; i < parentCount; i++) {
    workersPerFamily.push(base + (i < remainder ? 1 : 0));
  }

  const estimatedTokens = Math.round(p.avgUnitTokens * p.taskUnits);
  const estimatedToolCalls = Math.round(p.avgUnitToolCalls * p.taskUnits);

  const rationale =
    `${p.taskUnits}u × ${p.parallelism} par ⇒ ${concurrentUnits} concurrent; ` +
    `det ${Math.round(p.deterministicShare * 100)}% ⇒ lanes T0:${t0Lanes}/T1:${t1Lanes}/T2:${t2Lanes}; ` +
    `workers ${workerCount} over ${parentCount} families; ` +
    `est ${estimatedTokens} tok / ${estimatedToolCalls} calls`.slice(0, RATIONALE_MAX);

  return {
    ok: true,
    plan: {
      parentCount,
      workerCount,
      workersPerFamily,
      laneDemand: { t0: t0Lanes, t1: t1Lanes, t2: t2Lanes },
      estimatedTokens,
      estimatedToolCalls,
      rationale,
    },
  };
}
