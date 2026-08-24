/**
 * ORCHESTRA O3 — MiniAgent Duplication Law & Registry
 * --------------------------------------------------
 * Blueprint §7: a worker may self-duplicate EXACTLY ONCE per task unit.
 * The duplicate (mini) evaluates its creator, does independent web
 * research, and proposes UP through the chain — never sideways.
 *
 * This module owns the ONE-TIME law as state: the MiniRegistry is a pure,
 * event-sourced fold that makes double-issuance structurally impossible —
 * a second `mini_spawned` for the same (workerId, taskUnitId) is a counted
 * rejection, never a second mini.
 *
 * Identity derivation follows O2 contract #1: minis hold `roles:['mini']`,
 * their creator's parent as parentId (proposals flow UP there), and
 * creatorId for dossier access and audit.
 *
 * Contract: PURE + TOTAL. Epochs are per-family (O2); stale events are
 * counted and dropped. Folds are deterministic and associative.
 */

import type { AgentIdentity } from "./capabilities";

// ---------------------------------------------------------------------------
// Mini identity
// ---------------------------------------------------------------------------

/**
 * Derive a mini's identity from its creator. The mini sits in the SAME
 * family slot as the worker (same parent ⇒ same family channel), with the
 * creator link carried for dossier access and audit.
 */
export function deriveMiniIdentity(worker: AgentIdentity, miniId: string): AgentIdentity {
  return {
    agentId: miniId,
    parentId: worker.parentId,
    creatorId: worker.agentId,
    roles: ["mini"],
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type MiniOutcome = "proposal_filed" | "timeout" | "no_finding";

export interface MiniSpawnedEvent {
  readonly kind: "mini_spawned";
  readonly miniId: string;
  readonly workerId: string;
  readonly familyId: string;
  readonly taskUnitId: string;
  readonly epoch: number;
}

export interface MiniRetiredEvent {
  readonly kind: "mini_retired";
  readonly miniId: string;
  readonly outcome: MiniOutcome;
  readonly epoch: number;
}

export type MiniEvent = MiniSpawnedEvent | MiniRetiredEvent;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface MiniRecord {
  readonly miniId: string;
  readonly workerId: string;
  readonly familyId: string;
  readonly taskUnitId: string;
  readonly state: "active" | "retired";
  readonly outcome?: MiniOutcome;
  readonly epoch: number;
}

export interface MiniRegistryState {
  readonly version: number;
  readonly appliedCount: number;
  readonly rejectedCount: number;
  /** Keyed by miniId. */
  readonly minis: Readonly<Record<string, MiniRecord>>;
  /** Issuance ledger: `${workerId}|${taskUnitId}` consumed keys. */
  readonly issuedByUnit: Readonly<Record<string, true>>;
}

export function initialMiniRegistry(): MiniRegistryState {
  return { version: 0, appliedCount: 0, rejectedCount: 0, minis: {}, issuedByUnit: {} };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduceMini(state: MiniRegistryState, event: MiniEvent): MiniRegistryState {
  if (event.kind === "mini_spawned") {
    const unitKey = `${event.workerId}|${event.taskUnitId}`;
    // THE ONE-TIME LAW + id-collision guard:
    if (state.issuedByUnit[unitKey] || state.minis[event.miniId]) {
      return {
        version: state.version + 1,
        appliedCount: state.appliedCount,
        rejectedCount: state.rejectedCount + 1,
        minis: state.minis,
        issuedByUnit: state.issuedByUnit,
      };
    }
    const rec: MiniRecord = {
      miniId: event.miniId,
      workerId: event.workerId,
      familyId: event.familyId,
      taskUnitId: event.taskUnitId,
      state: "active",
      epoch: event.epoch,
    };
    return {
      version: state.version + 1,
      appliedCount: state.appliedCount + 1,
      rejectedCount: state.rejectedCount,
      minis: { ...state.minis, [event.miniId]: rec },
      issuedByUnit: { ...state.issuedByUnit, [unitKey]: true },
    };
  }

  // mini_retired: unknown ids, already-retired minis, and stale epochs are
  // all counted rejections — never corruption.
  const rec = state.minis[event.miniId];
  if (!rec || rec.state !== "active" || rec.epoch !== event.epoch) {
    return {
      version: state.version + 1,
      appliedCount: state.appliedCount,
      rejectedCount: state.rejectedCount + 1,
      minis: state.minis,
      issuedByUnit: state.issuedByUnit,
    };
  }
  return {
    version: state.version + 1,
    appliedCount: state.appliedCount + 1,
    rejectedCount: state.rejectedCount,
    minis: {
      ...state.minis,
      [event.miniId]: { ...rec, state: "retired", outcome: event.outcome },
    },
    issuedByUnit: state.issuedByUnit,
  };
}

// ---------------------------------------------------------------------------
// Folds
// ---------------------------------------------------------------------------

export function foldMinis(events: readonly MiniEvent[]): MiniRegistryState {
  let s = initialMiniRegistry();
  for (const e of events) s = reduceMini(s, e);
  return s;
}

export function foldMinisFrom(state: MiniRegistryState, events: readonly MiniEvent[]): MiniRegistryState {
  let s = state;
  for (const e of events) s = reduceMini(s, e);
  return s;
}
