/**
 * ORCHESTRA O2 — Virtual Swarm Ledger & Wave Scheduler
 * ---------------------------------------------------
 * The heart of the owner's clone vision, made honest by identity ranges:
 *
 *   An agent identity is a LEDGER RECORD, not a process. Minting N logical
 *   workers appends exactly ONE `spawn_batch` event — O(1), microseconds,
 *   unbounded N (30,000,000 clones = one append; pinned by test). Worker
 *   ids are derived lazily and deterministically via `mintWorkerId`.
 *   This is the map-reduce/Kubernetes insight applied to agent swarms.
 *
 * Per-FAMILY epochs: an Eyes freeze bumps ONLY the frozen family's epoch;
 * sibling families continue unaffected. Pre-freeze traffic to that family
 * becomes stale and is deterministically dropped (Phase 0 abort semantics,
 * scoped down one level).
 *
 * Budget accounting is VISIBILITY-ONLY by owner decision (§0a.3): burn
 * totals are recorded and exposed as ratios; nothing here hard-stops a
 * family. Quality is protected by the DELIVERY LOCK, not by cost walls.
 *
 * Contract:
 *   - PURE fold over SwarmEvents: no clock, no random, no I/O.
 *   - Founding a family REQUIRES a valid activation certificate + charter:
 *     the gate runs inside `foundFamily` — there is no path around it.
 *   - Defensive rejections (unknown family, completion beyond minted count,
 *     stale epochs) are COUNTED, never thrown, never corrupting.
 */

import {
  activationGate,
  charterDigest,
  type ActivationCertificate,
} from "./certificate";
import type { ParentCharter } from "./charter";
import type { CapacityPlan } from "./capacity";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type FamilyId = string;

export interface FamilyFoundedEvent {
  readonly kind: "family_founded";
  readonly familyId: FamilyId;
  readonly parentAgentId: string;
  readonly certId: string;
  /** Digest of the charter that qualified this family's parent. */
  readonly charterDigest: string;
}
export interface SpawnBatchEvent {
  readonly kind: "spawn_batch";
  readonly familyId: FamilyId;
  readonly epoch: number;
  /** Mints logical workers [startIndex, startIndex + count). */
  readonly startIndex: number;
  readonly count: number;
}
export interface UnitCompletedEvent {
  readonly kind: "unit_completed";
  readonly familyId: FamilyId;
  readonly epoch: number;
  readonly units: number;
  readonly tier: "t0" | "t1" | "t2";
}
export interface EscalatedEvent {
  readonly kind: "escalated";
  readonly familyId: FamilyId;
  readonly epoch: number;
  readonly workerId: string;
  readonly fromTier: "t1" | "t2";
  readonly toTier: "t2" | "orchestrator";
  /** Fixed reason token: stuck | budget | quality_gate | unknown_domain. */
  readonly reason: string;
}
export interface BudgetBurnedEvent {
  readonly kind: "budget_burned";
  readonly familyId: FamilyId;
  readonly epoch: number;
  readonly tokens: number;
  readonly toolCalls: number;
}
export interface FamilyFrozenEvent {
  readonly kind: "family_frozen";
  readonly familyId: FamilyId;
  /** MUST equal family epoch + 1 (per-family generation bump). */
  readonly newEpoch: number;
  readonly movedBy: "eyes" | "orchestrator";
  readonly reason: string;
}
export interface FamilyResumedEvent {
  readonly kind: "family_resumed";
  readonly familyId: FamilyId;
  readonly newEpoch: number;
}
export interface FamilyClosedEvent {
  readonly kind: "family_closed";
  readonly familyId: FamilyId;
  readonly epoch: number;
  /** Artifact reference to the family's final report. */
  readonly summaryRef: string;
}

export type SwarmEvent =
  | FamilyFoundedEvent
  | SpawnBatchEvent
  | UnitCompletedEvent
  | EscalatedEvent
  | BudgetBurnedEvent
  | FamilyFrozenEvent
  | FamilyResumedEvent
  | FamilyClosedEvent;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface FamilyState {
  readonly familyId: FamilyId;
  readonly founded: boolean;
  readonly parentAgentId: string | null;
  readonly certId: string | null;
  readonly digest: string | null;
  readonly epoch: number;
  readonly spawnedCount: number;
  readonly completedCount: number;
  readonly completedByTier: { readonly t0: number; readonly t1: number; readonly t2: number };
  readonly escalations: number;
  readonly tokensBurned: number;
  readonly toolCallsBurned: number;
  readonly frozen: boolean;
  readonly closedSummaryRef: string | null;
}

export interface SwarmState {
  readonly version: number;
  readonly appliedCount: number;
  readonly rejectedCount: number;
  /** Keyed by familyId; iteration order = founding order (insertion). */
  readonly families: Readonly<Record<string, FamilyState>>;
}

export function initialSwarm(): SwarmState {
  return { version: 0, appliedCount: 0, rejectedCount: 0, families: {} };
}

const EMPTY_FAMILY: Omit<FamilyState, "familyId"> = Object.freeze({
  founded: false,
  parentAgentId: null,
  certId: null,
  digest: null,
  epoch: 0,
  spawnedCount: 0,
  completedCount: 0,
  completedByTier: Object.freeze({ t0: 0, t1: 0, t2: 0 }),
  escalations: 0,
  tokensBurned: 0,
  toolCallsBurned: 0,
  frozen: false,
  closedSummaryRef: null,
});

// ---------------------------------------------------------------------------
// Identity minting
// ---------------------------------------------------------------------------

/** Deterministic worker id: same inputs ⇒ same id across every replay. */
export function mintWorkerId(familyId: FamilyId, index: number): string {
  return `${familyId}#w${index}`;
}

// ---------------------------------------------------------------------------
// Genesis-gated founding
// ---------------------------------------------------------------------------

export type FoundReason =
  | "gate_no_certificate"
  | "gate_digest_mismatch"
  | "gate_identity_mismatch"
  | "already_founded";

export type FoundResult =
  | { readonly ok: true; readonly event: FamilyFoundedEvent }
  | { readonly ok: false; readonly reason: FoundReason };

/**
 * Found a family THROUGH the activation gate. There is deliberately no
 * way to construct a FamilyFoundedEvent that bypasses this check.
 */
export function foundFamily(params: {
  readonly familyId: FamilyId;
  readonly cert: ActivationCertificate | null | undefined;
  readonly charter: ParentCharter;
}): FoundResult {
  const gate = activationGate(params.cert, params.charter);
  if (!gate.allowed) {
    return {
      ok: false,
      reason:
        gate.reason === "no_certificate"
          ? "gate_no_certificate"
          : gate.reason === "digest_mismatch"
            ? "gate_digest_mismatch"
            : "gate_identity_mismatch",
    };
  }
  const cert = params.cert as ActivationCertificate;
  return {
    ok: true,
    event: {
      kind: "family_founded",
      familyId: params.familyId,
      parentAgentId: cert.agentId,
      certId: cert.certId,
      charterDigest: charterDigest(params.charter),
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function ensureFamily(state: SwarmState, familyId: FamilyId): FamilyState {
  return state.families[familyId] ?? { ...EMPTY_FAMILY, familyId };
}

/**
 * Apply one swarm event. Pure. Total over well-typed events. Faults are
 * counted as rejections — replays stay deterministic under any delivery.
 */
export function reduceSwarm(state: SwarmState, event: SwarmEvent): SwarmState {
  const base = {
    version: state.version + 1,
    appliedCount: state.appliedCount,
    rejectedCount: state.rejectedCount,
    families: state.families,
  };

  // Founding: creates the family slot. Double-founding is rejected.
  if (event.kind === "family_founded") {
    const existing = state.families[event.familyId];
    if (existing?.founded) {
      return { ...base, version: base.version, rejectedCount: base.rejectedCount + 1 };
    }
    return {
      ...base,
      appliedCount: base.appliedCount + 1,
      families: {
        ...state.families,
        [event.familyId]: {
          ...EMPTY_FAMILY,
          familyId: event.familyId,
          founded: true,
          parentAgentId: event.parentAgentId,
          certId: event.certId,
          digest: event.charterDigest,
        },
      },
    };
  }

  const fam = state.families[event.familyId];

  // Unknown or unfounded family → counted rejection (except founding above).
  if (!fam || !fam.founded) {
    return { ...base, rejectedCount: base.rejectedCount + 1 };
  }

  // Stale per-family epochs: counted, ignored.
  const needsCurrentEpoch =
    event.kind !== "family_frozen" && event.kind !== "family_resumed";
  if (needsCurrentEpoch && event.epoch !== fam.epoch) {
    return { ...base, rejectedCount: base.rejectedCount + 1 };
  }

  switch (event.kind) {
    case "spawn_batch": {
      if (fam.closedSummaryRef !== null || event.count < 0 || event.startIndex < 0 ||
          event.startIndex !== fam.spawnedCount) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: { ...fam, spawnedCount: fam.spawnedCount + event.count },
        },
      };
    }

    case "unit_completed": {
      if (
        event.units < 1 ||
        fam.completedCount + event.units > fam.spawnedCount ||
        fam.closedSummaryRef !== null
      ) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: {
            ...fam,
            completedCount: fam.completedCount + event.units,
            completedByTier: {
              t0: fam.completedByTier.t0 + (event.tier === "t0" ? event.units : 0),
              t1: fam.completedByTier.t1 + (event.tier === "t1" ? event.units : 0),
              t2: fam.completedByTier.t2 + (event.tier === "t2" ? event.units : 0),
            },
          },
        },
      };
    }

    case "escalated": {
      if (fam.closedSummaryRef !== null) return { ...base, rejectedCount: base.rejectedCount + 1 };
      const ladderOk =
        (event.fromTier === "t1" && event.toTier === "t2") ||
        (event.fromTier === "t2" && event.toTier === "orchestrator");
      if (!ladderOk) return { ...base, rejectedCount: base.rejectedCount + 1 };
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: { ...fam, escalations: fam.escalations + 1 },
        },
      };
    }

    case "budget_burned": {
      if (event.tokens < 0 || event.toolCalls < 0 || fam.closedSummaryRef !== null) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: {
            ...fam,
            tokensBurned: fam.tokensBurned + event.tokens,
            toolCallsBurned: fam.toolCallsBurned + event.toolCalls,
          },
        },
      };
    }

    case "family_frozen": {
      if (event.newEpoch !== fam.epoch + 1 || fam.frozen) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: { ...fam, epoch: event.newEpoch, frozen: true },
        },
      };
    }

    case "family_resumed": {
      if (!fam.frozen || event.newEpoch !== fam.epoch + 1) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: { ...fam, epoch: event.newEpoch, frozen: false },
        },
      };
    }

    case "family_closed": {
      if (fam.closedSummaryRef !== null || event.summaryRef.length === 0 ||
          event.summaryRef.length > 512 || /\s/.test(event.summaryRef)) {
        return { ...base, rejectedCount: base.rejectedCount + 1 };
      }
      return {
        ...base,
        appliedCount: base.appliedCount + 1,
        families: {
          ...state.families,
          [event.familyId]: { ...fam, closedSummaryRef: event.summaryRef },
        },
      };
    }

    default:
      return { ...base, rejectedCount: base.rejectedCount + 1 };
  }
}

// ---------------------------------------------------------------------------
// Folds
// ---------------------------------------------------------------------------

export function foldSwarm(events: readonly SwarmEvent[]): SwarmState {
  let s = initialSwarm();
  for (const e of events) s = reduceSwarm(s, e);
  return s;
}

export function foldSwarmFrom(state: SwarmState, events: readonly SwarmEvent[]): SwarmState {
  let s = state;
  for (const e of events) s = reduceSwarm(s, e);
  return s;
}

/** Founding-order list of active (founded, not closed) families. */
export function activeFamilies(state: SwarmState): readonly FamilyState[] {
  const out: FamilyState[] = [];
  for (const id of Object.keys(state.families)) {
    const f = state.families[id];
    if (f.founded && f.closedSummaryRef === null) out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wave scheduling (pure fairness kernel)
// ---------------------------------------------------------------------------

export interface LaneSpec {
  readonly laneId: string;
  readonly tier: "t0" | "t1" | "t2";
  /** Units this lane can drain in one wave. */
  readonly capacity: number;
}

export interface WaveAssignment {
  readonly laneId: string;
  readonly familyId: FamilyId;
  readonly tier: "t0" | "t1" | "t2";
  readonly units: number;
}

/**
 * Distribute ONE wave of lane capacities across pending work, oldest-founded
 * family first, round-robin — the pure fairness kernel behind the runtime
 * executor pool (which lands with the UI phases).
 *
 * Guarantees (pinned by tests):
 *   - A non-frozen family with pending units never starves while lanes remain.
 *   - Frozen/closed families receive ZERO assignments.
 *   - Lane capacities are respected exactly (never exceeded).
 *   - Deterministic: identical state+lanes ⇒ identical assignment list.
 */
export function scheduleWave(state: SwarmState, lanes: readonly LaneSpec[]): readonly WaveAssignment[] {
  const pendingOf = (f: FamilyState): number =>
    Math.max(0, f.spawnedCount - f.completedCount);

  // Eligible: founded, not frozen, not closed, has pending work.
  const eligible: FamilyState[] = activeFamilies(state).filter(
    (f) => !f.frozen && pendingOf(f) > 0,
  );

  const remaining = new Map<string, number>(
    eligible.map((f) => [f.familyId, pendingOf(f)]),
  );
  const assignments: WaveAssignment[] = [];

  for (const lane of lanes) {
    let left = lane.capacity;
    if (left <= 0 || eligible.length === 0) continue;
    // Round-robin passes over eligible families in founding order, each
    // taking at most a fair-share quantum per pass: q = ceil(left / n).
    // This is what makes the no-starvation guarantee REAL rather than
    // aspirational — a large first family cannot drain a lane whole.
    let progressed = true;
    while (left > 0 && progressed) {
      progressed = false;
      const quantum = Math.max(1, Math.ceil(left / eligible.length));
      for (const f of eligible) {
        if (left === 0) break;
        const rem = remaining.get(f.familyId) ?? 0;
        if (rem <= 0) continue;
        const take = Math.min(rem, left, quantum);
        remaining.set(f.familyId, rem - take);
        left -= take;
        progressed = true;
        assignments.push({
          laneId: lane.laneId,
          familyId: f.familyId,
          tier: lane.tier,
          units: take,
        });
      }
    }
  }

  return assignments;
}
