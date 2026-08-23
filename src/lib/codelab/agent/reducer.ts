/**
 * CodeLab Agent Core — Session State Reducer (Phase 0)
 * ---------------------------------------------------
 * A pure, deterministic fold over the `AgentEvent` log defined in
 * `./types.ts`. Mirrors the LSE A3 reducer contract (`lse/lessonReducer.ts`)
 * adapted for the agentic lifecycle (recon → plan → act → observe →
 * re-plan → verify) and abort generations.
 *
 * Contract:
 *   - PURE: `reduce(state, event)` never mutates its inputs. Collections are
 *     copied only when they change; frozen initial collections stay frozen.
 *   - TOTAL: every `AgentEventBody` kind is handled explicitly; the default
 *     branch keeps exhaustiveness honest via `assertNever`.
 *   - REPLAYABLE: `fold(sessionId, events)` is the sole constructor of a
 *     populated state; snapshots + tails compose via `foldFrom`.
 *   - ASSOCIATIVE: `fold(a ++ b) == foldFrom(fold(a), b)` for any split.
 *     Pinned by the property test over every split point.
 *   - ABORTABLE: every event carries an `epoch`. Events from a superseded
 *     generation (`epoch < state.epoch`) are counted and otherwise ignored —
 *     a deterministic drop, never a throw, because post-abort races are an
 *     expected runtime condition (plan §4).
 *   - DEFENSIVE ORDERING: non-increasing `seq` is rejected (counted), never
 *     silently folded — mirrors LSE's "caller feeds canonical order" while
 *     keeping replays corruption-free under duplicated delivery.
 *   - SLICE ISOLATION (directive 3): `verification` events mutate ONLY
 *     `state.verification`; actor fields are untouched and vice versa.
 *     Asserted explicitly by the test harness.
 *
 * Non-goals: I/O, clocks, randomness, tool execution, model calls. This
 * module is browser/edge/node-safe.
 */

import {
  LIMITS,
  type AgentEvent,
  type AgentPhase,
  type AgentSessionId,
  type ChannelEvidence,
  type Epoch,
  type FileDeltaEvent,
  type Plan,
  type PlanOp,
  type PlanStep,
  type PlanStepStatus,
  type Seq,
  type StatusEvent,
  type VerificationVerdict,
} from "./types";

// ---------------------------------------------------------------------------
// Public state types
// ---------------------------------------------------------------------------

/** Lifecycle of one tool call as seen purely from the log. */
export interface ToolCallRecord {
  readonly callId: string;
  readonly tool: string;
  readonly state: "open" | "ok" | "error";
  /** Set when the matching result closes the call. */
  readonly summary?: string;
}

/** Bounded summary of one verifier run retained in state. */
export interface VerificationRunSummary {
  readonly runId: string;
  readonly verdict: VerificationVerdict;
  readonly channels: readonly ChannelEvidence[];
  readonly assessment: string;
  readonly seq: Seq;
}

/**
 * The verifier's state slice (directive 3). Mutated exclusively by
 * `verification` events; actor code reads it, never writes it.
 */
export interface VerifierSlice {
  /** Newest last; capped at LIMITS.verificationRunsRetained. */
  readonly runs: readonly VerificationRunSummary[];
  readonly lastVerdict: VerificationVerdict | null;
  readonly totalRuns: number;
}

export interface AgentSessionState {
  readonly sessionId: AgentSessionId;
  /** Increments on EVERY reduce() call — including rejected/stale events. */
  readonly version: number;
  readonly appliedCount: number;
  readonly rejectedCount: number;
  /** Current abort generation. */
  readonly epoch: Epoch;
  readonly lastSeq: Seq | null;

  // Actor slice
  readonly goal: string | null;
  readonly acceptance: readonly string[];
  /** Latest status phase, or null before the first status event. */
  readonly phase: AgentPhase | null;
  readonly plan: Plan | null;
  /** Every tool call ever opened, with its terminal state once closed. */
  readonly calls: readonly ToolCallRecord[];
  /** Full delta log; projections (Phase 1 fs layer) derive current files. */
  readonly fileDeltas: readonly FileDeltaEvent[];
  readonly errorsCount: number;
  readonly doneSummary: string | null;
  readonly abortedReason: string | null;

  // Verifier slice (independent)
  readonly verification: VerifierSlice;

  // Bounded observation rings
  readonly timeline: readonly AgentEvent[];
  readonly statusRing: readonly StatusEvent[];
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function initialState(
  sessionId: AgentSessionId,
  epoch: Epoch = 0,
): AgentSessionState {
  return {
    sessionId,
    version: 0,
    appliedCount: 0,
    rejectedCount: 0,
    epoch,
    lastSeq: null,
    goal: null,
    acceptance: Object.freeze([]) as readonly string[],
    phase: null,
    plan: null,
    calls: Object.freeze([]) as readonly ToolCallRecord[],
    fileDeltas: Object.freeze([]) as readonly FileDeltaEvent[],
    errorsCount: 0,
    doneSummary: null,
    abortedReason: null,
    verification: {
      runs: Object.freeze([]) as readonly VerificationRunSummary[],
      lastVerdict: null,
      totalRuns: 0,
    },
    timeline: Object.freeze([]) as readonly AgentEvent[],
    statusRing: Object.freeze([]) as readonly StatusEvent[],
  };
}

// ---------------------------------------------------------------------------
// Ring helpers (drop-oldest, copy-on-write)
// ---------------------------------------------------------------------------

function ringAppend<T>(ring: readonly T[], item: T, capacity: number): readonly T[] {
  if (ring.length < capacity) return [...ring, item];
  return [...ring.slice(ring.length - (capacity - 1)), item];
}

// ---------------------------------------------------------------------------
// Plan application (directive 1: mutable plan via explicit ops)
// ---------------------------------------------------------------------------

interface PlanApplyResult {
  readonly plan: Plan;
  readonly changed: boolean;
}

const EMPTY_PLAN_STEPS: readonly PlanStep[] = Object.freeze([]);

function stepSeedsToSteps(seeds: readonly { id: string; title: string }[]): PlanStep[] {
  return seeds.map((s) => ({ id: s.id, title: s.title, status: "pending" as const }));
}

/**
 * Apply ops sequentially to a (possibly null) plan. Ops that reference
 * unknown steps, duplicate ids, violate the step cap, or attempt a
 * non-permutation reorder are skipped INDIVIDUALLY — deterministic and
 * forgiving, mirroring the frame-parser philosophy. `changed` reports
 * whether ≥ 1 op took effect (only then does the revision bump).
 *
 * Semantics pinned here (and by tests):
 *   - `replace` defines/resets the whole plan; steps start `pending`.
 *   - `add_step` appends when `afterStepId` is null; inserts after the named
 *     step otherwise; skips if the id already exists or the target is
 *     unknown, or if it would exceed LIMITS.planStepsMax.
 *   - `set_status` / `remove_step` skip silently on unknown ids.
 *   - `reorder` requires an exact permutation of current ids.
 *   - Ops against a null plan other than `replace` are skipped.
 */
export function applyPlanOps(
  plan: Plan | null,
  ops: readonly PlanOp[],
): PlanApplyResult {
  let steps: PlanStep[] =
    plan === null ? [...EMPTY_PLAN_STEPS] : [...plan.steps];
  let revision = plan?.revision ?? 0;
  let changed = false;

  for (const op of ops) {
    switch (op.op) {
      case "replace": {
        steps = stepSeedsToSteps(op.steps);
        changed = true;
        break;
      }
      case "add_step": {
        if (steps.some((s) => s.id === op.step.id)) break; // duplicate id
        if (steps.length >= LIMITS.planStepsMax) break; // cap
        const next: PlanStep = { id: op.step.id, title: op.step.title, status: "pending" };
        if (op.afterStepId === null) {
          steps = [...steps, next];
          changed = true;
          break;
        }
        const idx = steps.findIndex((s) => s.id === op.afterStepId);
        if (idx === -1) break; // unknown anchor
        steps = [...steps.slice(0, idx + 1), next, ...steps.slice(idx + 1)];
        changed = true;
        break;
      }
      case "remove_step": {
        const idx = steps.findIndex((s) => s.id === op.stepId);
        if (idx === -1) break;
        steps = steps.filter((s) => s.id !== op.stepId);
        changed = true;
        break;
      }
      case "set_status": {
        const idx = steps.findIndex((s) => s.id === op.stepId);
        if (idx === -1) break;
        if (steps[idx].status === op.status) break; // no-op change
        steps = steps.map((s) =>
          s.id === op.stepId ? { ...s, status: op.status as PlanStepStatus } : s,
        );
        changed = true;
        break;
      }
      case "reorder": {
        if (op.order.length !== steps.length) break; // not a permutation (length)
        const currentIds = new Set(steps.map((s) => s.id));
        let permutation = true;
        for (const id of op.order) {
          if (!currentIds.has(id)) {
            permutation = false;
            break;
          }
        }
        if (!permutation) break;
        const byId = new Map(steps.map((s) => [s.id, s]));
        const reordered = op.order.map((id) => byId.get(id)!);
        if (reordered.every((s, i) => s.id === steps[i].id)) break; // identical order
        steps = reordered;
        changed = true;
        break;
      }
      default:
        break;
    }
  }

  if (!changed && plan !== null) {
    return { plan, changed };
  }
  return { plan: { steps, revision: changed ? revision + 1 : revision }, changed };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Apply a single event. Pure. Total over well-typed events. Deterministic.
 *
 * Throwing is reserved for cross-session contamination only (LSE parity):
 * every other fault — stale epochs, duplicated delivery, malformed aborts,
 * orphaned results — is counted and folded as a rejection so that replays
 * remain deterministic and streams never tear down.
 */
export function reduce(state: AgentSessionState, event: AgentEvent): AgentSessionState {
  if (event.sessionId !== state.sessionId) {
    throw new Error(
      `agent.reduce: sessionId mismatch (state=${state.sessionId} event=${event.sessionId})`,
    );
  }

  // Stale generation: counted, ignored (plan §4).
  if (event.epoch < state.epoch) {
    return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
  }

  // Canonical ordering guard: strictly increasing seq required.
  if (state.lastSeq !== null && event.seq <= state.lastSeq) {
    return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
  }

  const appliedBase = {
    ...state,
    version: state.version + 1,
    appliedCount: state.appliedCount + 1,
    lastSeq: event.seq,
    timeline: ringAppend(state.timeline, event, LIMITS.timelineCapacity),
  };

  switch (event.kind) {
    case "goal_set": {
      return {
        ...appliedBase,
        goal: event.goal,
        acceptance: event.acceptance ?? (Object.freeze([]) as readonly string[]),
      };
    }

    case "status": {
      return {
        ...appliedBase,
        phase: event.phase,
        statusRing: ringAppend(state.statusRing, event as StatusEvent, LIMITS.statusRingCapacity),
      };
    }

    case "plan_update": {
      const { plan, changed } = applyPlanOps(state.plan, event.ops);
      return {
        ...appliedBase,
        plan: changed ? plan : state.plan,
      };
    }

    case "tool_call": {
      // Reject duplicate ids against OPEN calls (deterministic strictness);
      // reuse of a CLOSED id is tolerated — result matching only consults
      // open calls.
      const dupOpen = state.calls.some(
        (c) => c.callId === event.callId && c.state === "open",
      );
      if (dupOpen) {
        return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
      }
      const record: ToolCallRecord = {
        callId: event.callId,
        tool: event.tool,
        state: "open",
      };
      return { ...appliedBase, calls: [...state.calls, record] };
    }

    case "tool_result": {
      const idx = state.calls.findIndex(
        (c) => c.callId === event.callId && c.state === "open",
      );
      if (idx === -1) {
        // Orphaned result (never opened, already closed, or stale epoch race
        // that passed the epoch check) — counted, never corrupting.
        return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
      }
      const closed: ToolCallRecord = {
        ...state.calls[idx],
        state: event.ok ? "ok" : "error",
        summary: event.summary,
      };
      const calls = [...state.calls];
      calls[idx] = closed;
      return { ...appliedBase, calls };
    }

    case "file_delta": {
      return { ...appliedBase, fileDeltas: [...state.fileDeltas, event] };
    }

    case "verification": {
      // SLICE ISOLATION: actor fields above are untouched (asserted by tests).
      const summary: VerificationRunSummary = {
        runId: event.runId,
        verdict: event.verdict,
        channels: event.channels,
        assessment: event.assessment,
        seq: event.seq,
      };
      return {
        ...appliedBase,
        verification: {
          runs: ringAppend(
            state.verification.runs,
            summary,
            LIMITS.verificationRunsRetained,
          ),
          lastVerdict: event.verdict,
          totalRuns: state.verification.totalRuns + 1,
        },
      };
    }

    case "error": {
      return { ...appliedBase, errorsCount: state.errorsCount + 1 };
    }

    case "done": {
      // First `done` wins; later ones apply (timeline/version) but do not
      // overwrite the terminal summary.
      return {
        ...appliedBase,
        doneSummary: state.doneSummary ?? event.summary,
      };
    }

    case "aborted": {
      // Malformed abort payload (not exactly next-generation) is rejected.
      if (event.newEpoch !== state.epoch + 1) {
        return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
      }
      return {
        ...appliedBase,
        epoch: event.newEpoch,
        abortedReason: event.reason,
      };
    }

    default:
      return assertNever(event, appliedBase);
  }
}

function assertNever(
  event: never,
  base: AgentSessionState,
): AgentSessionState {
  void event;
  return base;
}

// ---------------------------------------------------------------------------
// Folds
// ---------------------------------------------------------------------------

export function fold(
  sessionId: AgentSessionId,
  events: readonly AgentEvent[],
  epoch: Epoch = 0,
): AgentSessionState {
  let state = initialState(sessionId, epoch);
  for (const event of events) {
    state = reduce(state, event);
  }
  return state;
}

export function foldFrom(
  state: AgentSessionState,
  events: readonly AgentEvent[],
): AgentSessionState {
  let s = state;
  for (const event of events) {
    s = reduce(s, event);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Helpers exported for the loop controller (Phase 1) and diagnostics
// ---------------------------------------------------------------------------

/** True when this event belongs to a superseded abort generation. */
export function isStaleEpoch(event: AgentEvent, currentEpoch: Epoch): boolean {
  return event.epoch < currentEpoch;
}

/** Number of tool calls currently awaiting results. */
export function openCallCount(state: AgentSessionState): number {
  let n = 0;
  for (const c of state.calls) if (c.state === "open") n++;
  return n;
}

// ---------------------------------------------------------------------------
// Structural equality (tests + snapshot/tail-replay recovery)
// ---------------------------------------------------------------------------

export function statesEqual(a: AgentSessionState, b: AgentSessionState): boolean {
  if (a === b) return true;
  return (
    a.sessionId === b.sessionId &&
    a.version === b.version &&
    a.appliedCount === b.appliedCount &&
    a.rejectedCount === b.rejectedCount &&
    a.epoch === b.epoch &&
    a.lastSeq === b.lastSeq &&
    a.goal === b.goal &&
    arraysEqual(a.acceptance, b.acceptance) &&
    a.phase === b.phase &&
    plansEqual(a.plan, b.plan) &&
    callsEqual(a.calls, b.calls) &&
    deltasEqual(a.fileDeltas, b.fileDeltas) &&
    a.errorsCount === b.errorsCount &&
    a.doneSummary === b.doneSummary &&
    a.abortedReason === b.abortedReason &&
    verifierEqual(a.verification, b.verification) &&
    seqsEqual(a.timeline, b.timeline) &&
    statusesEqual(a.statusRing, b.statusRing)
  );
}

function arraysEqual(x: readonly string[], y: readonly string[]): boolean {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function plansEqual(a: Plan | null, b: Plan | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.revision !== b.revision || a.steps.length !== b.steps.length) return false;
  for (let i = 0; i < a.steps.length; i++) {
    if (
      a.steps[i].id !== b.steps[i].id ||
      a.steps[i].title !== b.steps[i].title ||
      a.steps[i].status !== b.steps[i].status
    ) {
      return false;
    }
  }
  return true;
}

function callsEqual(
  a: readonly ToolCallRecord[],
  b: readonly ToolCallRecord[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].callId !== b[i].callId ||
      a[i].tool !== b[i].tool ||
      a[i].state !== b[i].state ||
      a[i].summary !== b[i].summary
    ) {
      return false;
    }
  }
  return true;
}

function deltasEqual(
  a: readonly FileDeltaEvent[],
  b: readonly FileDeltaEvent[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].path !== b[i].path ||
      a[i].op !== b[i].op ||
      (a[i].contentAfter ?? null) !== (b[i].contentAfter ?? null)
    ) {
      return false;
    }
  }
  return true;
}

function verifierEqual(x: VerifierSlice, y: VerifierSlice): boolean {
  if (x.totalRuns !== y.totalRuns || x.lastVerdict !== y.lastVerdict) return false;
  if (x.runs.length !== y.runs.length) return false;
  for (let i = 0; i < x.runs.length; i++) {
    const r1 = x.runs[i];
    const r2 = y.runs[i];
    if (
      r1.runId !== r2.runId ||
      r1.verdict !== r2.verdict ||
      r1.seq !== r2.seq ||
      r1.assessment !== r2.assessment ||
      r1.channels.length !== r2.channels.length
    ) {
      return false;
    }
    for (let j = 0; j < r1.channels.length; j++) {
      if (
        r1.channels[j].channel !== r2.channels[j].channel ||
        r1.channels[j].status !== r2.channels[j].status ||
        r1.channels[j].detail !== r2.channels[j].detail
      ) {
        return false;
      }
    }
  }
  return true;
}

function seqsEqual(a: readonly AgentEvent[], b: readonly AgentEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].seq !== b[i].seq) return false;
  return true;
}

function statusesEqual(a: readonly StatusEvent[], b: readonly StatusEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].phase !== b[i].phase ||
      a[i].rationale !== b[i].rationale
    ) {
      return false;
    }
  }
  return true;
}
