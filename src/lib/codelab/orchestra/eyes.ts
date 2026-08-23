/**
 * ORCHESTRA O5 — Eyes Oversight
 * ----------------------------
 * The owner's "pairs of eyes" (blueprint §9): independent observers with
 * read-everything grants, write access to `chan:oversight` ONLY, and a
 * single execution power — the freeze motion (O2 family epoch bump).
 *
 * Doctrine encoded here:
 *   1. END-STATE evaluation first [A appendix]: the Delivery Gate judges
 *      final artifacts against goal + acceptance criteria via six
 *      human-style rubric dimensions. This is Design Law #6: nothing ships
 *      without a passing end-state assessment AND a passing verifier.
 *   2. Evidence packs mandatory: every finding cites refs. Vibes are
 *      inadmissible — detectors auto-cite their own artifact refs so even
 *      mechanical findings are auditable.
 *   3. Continuous sampling: deterministic anomaly detectors over swarm and
 *      deliberation state — budget runaway, escalation storms, spawn
 *      spikes, illegal-route rejection rates, ADP drift review flags.
 *   4. Freeze motions map onto O2 family epochs; Eyes never touch family
 *      channels directly (O0 law table enforces this structurally).
 *   5. Hard safety tripwires justify AUTOMATIC freeze; everything else is
 *      motion-pending-confirmation.
 *
 * Contract: PURE + TOTAL. Fixed thresholds published in EYES_THRESHOLDS;
 * fixed rejection tokens; content never echoed.
 */

import type { DriftReport } from "./adp";
import { isValidEvidenceRef } from "./adp";
import type { CapacityPlan } from "./capacity";
import type { FamilyState } from "./swarm";

// ---------------------------------------------------------------------------
// Published thresholds (frozen)
// ---------------------------------------------------------------------------

export const EYES_THRESHOLDS = Object.freeze({
  /** burned / estimated tokens crossing points. */
  budgetConcernX: 3,
  budgetUrgentX: 10,
  /** escalations per completed unit (once output exists). */
  stormRate: 0.5,
  /** escalations before ANY completed unit. */
  stormNoOutputMin: 3,
  /** spawned vs completed ratio that signals over-spawning [A]. */
  spawnSpikeRatio: 1000,
  minSpawnedForSpikeCheck: 100,
  /** rejected / total attempts on any ledger (illegal-route audits). */
  rejectionRate: 0.25,
  rejectionMinSample: 8,
  /** Every end-state dimension must clear this floor for sign-off. */
  endStateFloor: 0.7,
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export const FINDING_DIMENSIONS = Object.freeze([
  "correctness",
  "craft",
  "performance",
  "maintainability",
  "honesty",
  "goal_fidelity",
  "anomaly",
] as const);

export type FindingDimension = (typeof FINDING_DIMENSIONS)[number];

export type Severity = "info" | "concern" | "urgent";

export interface OversightFinding {
  readonly findingId: string;
  readonly observerId: string;
  readonly familyId?: string;
  readonly dimension: FindingDimension;
  readonly severity: Severity;
  readonly claim: string;
  /** MANDATORY. Detectors auto-cite their own artifact refs. */
  readonly evidenceRefs: readonly string[];
}

const CLAIM_MAX = 600;

type V<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: EyesReason };

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

export function validateFinding(raw: unknown): V<OversightFinding> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  if (!isIdLike(o.findingId) || !isIdLike(o.observerId)) return { ok: false, reason: "bad_id" };
  if (o.familyId !== undefined && !isIdLike(o.familyId)) return { ok: false, reason: "bad_id" };
  if (typeof o.dimension !== "string" || !(FINDING_DIMENSIONS as readonly string[]).includes(o.dimension)) {
    return { ok: false, reason: "bad_dimension" };
  }
  if (o.severity !== "info" && o.severity !== "concern" && o.severity !== "urgent") {
    return { ok: false, reason: "bad_severity" };
  }
  if (typeof o.claim !== "string" || o.claim.length === 0 || o.claim.length > CLAIM_MAX) {
    return { ok: false, reason: "bad_claim" };
  }
  if (!Array.isArray(o.evidenceRefs) || o.evidenceRefs.length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }
  if (!o.evidenceRefs.every((r) => isValidEvidenceRef(r))) {
    return { ok: false, reason: "bad_evidence_ref" };
  }
  return {
    ok: true,
    value: {
      findingId: o.findingId as string,
      observerId: o.observerId as string,
      ...(o.familyId !== undefined ? { familyId: o.familyId as string } : {}),
      dimension: o.dimension as FindingDimension,
      severity: o.severity as Severity,
      claim: o.claim,
      evidenceRefs: o.evidenceRefs as readonly string[],
    },
  };
}

// ---------------------------------------------------------------------------
// Anomaly detectors (continuous sampling, deterministic)
// ---------------------------------------------------------------------------

function detectorRef(kind: string, id: string): string {
  return `artifact://oversight/${kind}/${id}`;
}

/** Budget burn far past plan estimate = runaway signal (never a stop — visibility only). */
export function detectBudgetRunaway(
  f: FamilyState,
  plan: Pick<CapacityPlan, "estimatedTokens">,
): OversightFinding | null {
  if (!plan || plan.estimatedTokens <= 0) return null; // no baseline ⇒ no judgment
  const ratio = f.tokensBurned / plan.estimatedTokens;
  let severity: Severity | null = null;
  if (ratio >= EYES_THRESHOLDS.budgetUrgentX) severity = "urgent";
  else if (ratio >= EYES_THRESHOLDS.budgetConcernX) severity = "concern";
  if (severity === null) return null;
  return {
    findingId: `eye-budget-${f.familyId}`,
    observerId: "eyes-auto",
    familyId: f.familyId,
    dimension: "anomaly",
    severity,
    claim: `budget burn ${Math.round(ratio)}x plan estimate`,
    evidenceRefs: [detectorRef("budget", f.familyId)],
  };
}

/** Escalation storm: climbing the ladder faster than producing output. */
export function detectEscalationStorm(f: FamilyState): OversightFinding | null {
  let storm = false;
  if (f.completedCount === 0) {
    storm = f.escalations >= EYES_THRESHOLDS.stormNoOutputMin;
  } else {
    storm = f.escalations / f.completedCount >= EYES_THRESHOLDS.stormRate;
  }
  if (!storm) return null;
  return {
    findingId: `eye-storm-${f.familyId}`,
    observerId: "eyes-auto",
    familyId: f.familyId,
    dimension: "anomaly",
    severity: "urgent",
    claim: `escalation storm: ${f.escalations} escalations / ${f.completedCount} completed`,
    evidenceRefs: [detectorRef("storm", f.familyId)],
  };
}

/** Over-spawning [A: "spawning 50 subagents for simple queries"]. */
export function detectSpawnSpike(f: FamilyState): OversightFinding | null {
  if (
    f.spawnedCount < EYES_THRESHOLDS.minSpawnedForSpikeCheck ||
    f.spawnedCount < f.completedCount * EYES_THRESHOLDS.spawnSpikeRatio
  ) {
    return null;
  }
  return {
    findingId: `eye-spawn-${f.familyId}`,
    observerId: "eyes-auto",
    familyId: f.familyId,
    dimension: "anomaly",
    severity: "concern",
    claim: `spawn spike: ${f.spawnedCount} spawned / ${f.completedCount} completed`,
    evidenceRefs: [detectorRef("spawn", f.familyId)],
  };
}

/** Illegal-route audit over ANY ledger's attempt counters. */
export function detectRejectionSpike(
  label: string,
  appliedCount: number,
  rejectedCount: number,
): OversightFinding | null {
  const total = appliedCount + rejectedCount;
  if (
    rejectedCount < EYES_THRESHOLDS.rejectionMinSample ||
    total === 0 ||
    rejectedCount / total < EYES_THRESHOLDS.rejectionRate
  ) {
    return null;
  }
  return {
    findingId: `eye-reject-${label}`,
    observerId: "eyes-auto",
    dimension: "anomaly",
    severity: "concern",
    claim: `rejection spike on ${label}: ${rejectedCount}/${total} attempts`,
    evidenceRefs: [detectorRef("rejects", label)],
  };
}

/** O4 contract #3: drift-review flags become AUTOMATIC urgent findings. */
export function detectDriftReview(
  drift: DriftReport,
  verdictId: string,
): OversightFinding | null {
  if (!drift.reviewRequired) return null;
  return {
    findingId: `eye-drift-${verdictId}`,
    observerId: "eyes-auto",
    dimension: "anomaly",
    severity: "urgent",
    claim: "ADP doctrine drift review required",
    evidenceRefs: [`artifact://adp/drift/${verdictId}`],
  };
}

// ---------------------------------------------------------------------------
// End-state assessment & THE DELIVERY GATE (Design Law #6)
// ---------------------------------------------------------------------------

export const RUBRIC_DIMENSIONS = Object.freeze([
  "correctness",
  "craft",
  "performance",
  "maintainability",
  "honesty",
  "goal_fidelity",
] as const);

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

export interface EndStateAssessment {
  readonly assessmentId: string;
  readonly observerId: string;
  readonly familyId: string;
  readonly goalRef: string;
  readonly artifactRef: string;
  /** Every dimension scored 0..1 by the observer. */
  readonly scores: Readonly<Record<RubricDimension, number>>;
  readonly evidenceRefs: readonly string[];
}

export type EyesReason =
  | "not_an_object"
  | "bad_id"
  | "bad_dimension"
  | "bad_severity"
  | "bad_claim"
  | "missing_evidence"
  | "bad_evidence_ref"
  | "bad_scores"
  | "below_floor";

/**
 * Validate + judge an end-state assessment. PASS requires EVERY dimension
 * ≥ EYES_THRESHOLDS.endStateFloor — one weak dimension fails the whole
 * assessment, exactly like a human reviewer would insist.
 */
export function assessEndState(raw: unknown): V<EndStateAssessment & { readonly passed: boolean; readonly meanScore: number }> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  for (const k of ["assessmentId", "observerId", "familyId", "goalRef", "artifactRef"]) {
    if (!isIdLike(o[k])) return { ok: false, reason: "bad_id" };
  }
  if (
    typeof o.goalRef !== "string" || o.goalRef.length === 0 ||
    typeof o.artifactRef !== "string" || o.artifactRef.length === 0
  ) {
    return { ok: false, reason: "missing_evidence" };
  }
  const scores = o.scores;
  if (typeof scores !== "object" || scores === null) return { ok: false, reason: "bad_scores" };
  const s = scores as Record<string, unknown>;
  let sum = 0;
  for (const dim of RUBRIC_DIMENSIONS) {
    const v = s[dim];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      return { ok: false, reason: "bad_scores" };
    }
    sum += v;
  }
  if (!Array.isArray(o.evidenceRefs) || o.evidenceRefs.length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }
  if (!o.evidenceRefs.every((r) => isValidEvidenceRef(r))) return { ok: false, reason: "bad_evidence_ref" };

  const scoreRecord = s as unknown as Readonly<Record<RubricDimension, number>>;
  const belowFloor = RUBRIC_DIMENSIONS.some((dim) => scoreRecord[dim] < EYES_THRESHOLDS.endStateFloor);
  const value: EndStateAssessment & { passed: boolean; meanScore: number } = {
    assessmentId: o.assessmentId as string,
    observerId: o.observerId as string,
    familyId: o.familyId as string,
    goalRef: o.goalRef as string,
    artifactRef: o.artifactRef as string,
    scores: scoreRecord,
    evidenceRefs: o.evidenceRefs as readonly string[],
    passed: !belowFloor,
    meanScore: sum / RUBRIC_DIMENSIONS.length,
  };
  return { ok: true, value };
}

export type GateReason =
  | "no_assessment"
  | "assessment_failed"
  | "verifier_not_pass"
  | "invalid_assessment";

/**
 * DESIGN LAW #6 — THE DELIVERY GATE. Nothing reaches the user unless BOTH
 * the verifier passed AND Eyes signed off the end state. Mirrors the O1
 * activationGate pattern: absent/failed components are hard denials.
 */
export function deliveryGate(
  assessment: unknown,
  verifierVerdict: "pass" | "fail" | "inconclusive",
): { readonly allowed: true } | { readonly allowed: false; readonly reason: GateReason } {
  const v = assessEndState(assessment);
  if (!v.ok) return { allowed: false, reason: "invalid_assessment" };
  if (!v.value.passed) return { allowed: false, reason: "assessment_failed" };
  if (verifierVerdict !== "pass") return { allowed: false, reason: "verifier_not_pass" };
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Freeze motions (the single execution power)
// ---------------------------------------------------------------------------

export const FREEZE_REASONS = Object.freeze([
  "safety_tripwire",
  "drift_review",
  "anomaly_pattern",
  "budget_runaway",
] as const);

export type FreezeReason = (typeof FREEZE_REASONS)[number];

export type MotionResult =
  | {
      readonly ok: true;
      /** Ready-to-append O2 event. newEpoch = currentEpoch + 1 ALWAYS. */
      readonly event: {
        readonly kind: "family_frozen";
        readonly familyId: string;
        readonly newEpoch: number;
        readonly movedBy: "eyes";
        readonly reason: FreezeReason;
      };
      readonly automatic: boolean;
    }
  | { readonly ok: false; readonly reason: EyesReason | "bad_reason" | "bad_epoch" };

/**
 * File a freeze motion against a family. Produces the exact O2 event —
 * Eyes never mutate family state themselves; the swarm ledger applies it.
 *
 * Automatic (no orchestrator confirmation needed) ⇔ hard safety tripwire.
 */
export function fileFreezeMotion(params: {
  readonly motionId: string;
  readonly familyId: string;
  readonly currentEpoch: number;
  readonly reason: FreezeReason;
  readonly evidenceRefs: readonly string[];
}): MotionResult {
  if (!isIdLike(params.motionId) || !isIdLike(params.familyId)) return { ok: false, reason: "bad_id" };
  if (!(FREEZE_REASONS as readonly string[]).includes(params.reason)) {
    return { ok: false, reason: "bad_reason" };
  }
  if (
    typeof params.currentEpoch !== "number" ||
    !Number.isInteger(params.currentEpoch) ||
    params.currentEpoch < 0
  ) {
    return { ok: false, reason: "bad_epoch" };
  }
  if (!Array.isArray(params.evidenceRefs) || params.evidenceRefs.length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }
  if (!params.evidenceRefs.every((r) => isValidEvidenceRef(r))) {
    return { ok: false, reason: "bad_evidence_ref" };
  }
  return {
    ok: true,
    automatic: params.reason === "safety_tripwire",
    event: {
      kind: "family_frozen",
      familyId: params.familyId,
      newEpoch: params.currentEpoch + 1,
      movedBy: "eyes",
      reason: params.reason,
    },
  };
}
