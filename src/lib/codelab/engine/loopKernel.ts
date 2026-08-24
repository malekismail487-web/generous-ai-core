/**
 * ORCHESTRA O7a — Closed Loop Kernel (with Recovery Task protocol)
 * --------------------------------------------------------------
 * Event-sourced state machine for the generate→run→evidence→critique→repair
 * loop, implementing owner law §4.5 verbatim:
 *
 *   building ──(gates fail & repair budget spent)──▶ recovering
 *   recovering ──(hypotheses tested)──▶ back to building (new window)
 *   done        — latest evidence passed ALL gates
 *   exited      — ONLY after ≥1 tested hypothesis; literal impossibility;
 *                 expected RARE. Exiting without recovery is a violation.
 */

export const REPAIR_BUDGET = 6;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type AttemptKind = "initial" | "repair" | "recovery";

export type LoopEvent =
  | { readonly kind: "task_opened"; readonly taskId: string }
  | { readonly kind: "attempt_started"; readonly taskId: string; readonly cycle: number; readonly attemptKind: AttemptKind }
  | { readonly kind: "evidence_filed"; readonly taskId: string; readonly cycle: number; readonly passedGates: readonly string[]; readonly failedGates: readonly string[] }
  | { readonly kind: "repair_applied"; readonly taskId: string; readonly cycle: number; readonly editCount: number }
  | { readonly kind: "recovery_opened"; readonly taskId: string; readonly researchRefs: readonly string[] }
  | { readonly kind: "hypothesis_tested"; readonly taskId: string; readonly hypothesisId: string; readonly matchedEvidence: boolean }
  | { readonly kind: "task_completed"; readonly taskId: string; readonly finalCycle: number }
  | { readonly kind: "honest_exit"; readonly taskId: string; readonly impossibility: string };

export interface LoopTaskState {
  readonly phase: "building" | "recovering" | "done" | "exited";
  readonly currentCycle: number;
  readonly repairCyclesSpent: number;
  readonly recoveryRounds: number;
  readonly hypothesesTested: number;
  readonly lastFailedGateCount: number;
}

export interface LoopState {
  readonly version: number;
  readonly rejectedCount: number;
  readonly tasks: Readonly<Record<string, LoopTaskState>>;
}

export function initialLoop(): LoopState {
  return { version: 0, rejectedCount: 0, tasks: {} };
}

const EMPTY_TASK: Omit<LoopTaskState, never> = Object.freeze({
  phase: "building" as const,
  currentCycle: 0,
  repairCyclesSpent: 0,
  recoveryRounds: 0,
  hypothesesTested: 0,
  lastFailedGateCount: 0,
});

function rejected(state: LoopState): LoopState {
  return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
}

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

export function reduceLoop(state: LoopState, event: LoopEvent): LoopState {
  switch (event.kind) {
    case "task_opened": {
      if (!isIdLike(event.taskId)) return rejected(state);
      if (state.tasks[event.taskId]) return rejected(state);
      return {
        ...state,
        version: state.version + 1,
        tasks: { ...state.tasks, [event.taskId]: { ...EMPTY_TASK } },
      };
    }

    case "attempt_started": {
      const t = state.tasks[event.taskId];
      if (!t || (t.phase !== "building" && t.phase !== "recovering")) return rejected(state);
      if (event.attemptKind === "initial" && t.currentCycle !== 0) return rejected(state);
      if (event.attemptKind === "recovery" && t.phase !== "recovering") return rejected(state);
      // A recovery attempt opens a FRESH repair window.
      const next: LoopTaskState = {
        ...t,
        phase: "building",
        currentCycle: event.cycle,
        repairCyclesSpent: event.attemptKind === "recovery" ? 0 : t.repairCyclesSpent,
        recoveryRounds: t.recoveryRounds + (event.attemptKind === "recovery" ? 1 : 0),
      };
      return { ...state, version: state.version + 1, tasks: { ...state.tasks, [event.taskId]: next } };
    }

    case "evidence_filed": {
      const t = state.tasks[event.taskId];
      if (!t || t.phase !== "building" || event.cycle !== t.currentCycle) return rejected(state);
      const failed = event.failedGates.length;
      const spent = t.repairCyclesSpent + (failed > 0 ? 1 : 0);
      const next: LoopTaskState = {
        ...t,
        lastFailedGateCount: failed,
        repairCyclesSpent: failed > 0 ? spent : t.repairCyclesSpent,
      };
      // Auto-transition: gates clean ⇒ done; budget spent ⇒ recovering.
      if (failed === 0) {
        return {
          ...state,
          version: state.version + 1,
          tasks: { ...state.tasks, [event.taskId]: { ...next, phase: "done" } },
        };
      }
      if (spent >= REPAIR_BUDGET) {
        return {
          ...state,
          version: state.version + 1,
          tasks: { ...state.tasks, [event.taskId]: { ...next, phase: "recovering" } },
        };
      }
      return { ...state, version: state.version + 1, tasks: { ...state.tasks, [event.taskId]: next } };
    }

    case "repair_applied": {
      const t = state.tasks[event.taskId];
      if (!t || t.phase !== "building") return rejected(state);
      if (event.editCount < 0) return rejected(state);
      return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount };
    }

    case "recovery_opened": {
      const t = state.tasks[event.taskId];
      if (!t) return rejected(state);
      // Owner law: recovery ONLY after the budget is genuinely spent AND
      // real failing gates exist. Research citations are mandatory.
      if (t.phase !== "recovering") return rejected(state);
      if (!Array.isArray(event.researchRefs) || event.researchRefs.length === 0) return rejected(state);
      return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount };
    }

    case "hypothesis_tested": {
      const t = state.tasks[event.taskId];
      if (!t || t.phase !== "recovering") return rejected(state);
      if (!isIdLike(event.hypothesisId)) return rejected(state);
      return {
        ...state,
        version: state.version + 1,
        tasks: {
          ...state.tasks,
          [event.taskId]: { ...t, hypothesesTested: t.hypothesesTested + 1 },
        },
      };
    }

    case "task_completed": {
      const t = state.tasks[event.taskId];
      if (!t || t.phase !== "done") return rejected(state); // only from CLEAN gates
      return {
        ...state,
        version: state.version + 1,
        tasks: { ...state.tasks, [event.taskId]: { ...t, phase: "done", currentCycle: event.finalCycle } },
      };
    }

    case "honest_exit": {
      const t = state.tasks[event.taskId];
      // Owner law: an exit WITHOUT at least one TESTED hypothesis in a REAL
      // recovery round is structurally impossible. Rare by construction.
      if (!t || t.phase !== "recovering") return rejected(state);
      if (t.hypothesesTested < 1 || t.recoveryRounds < 1) return rejected(state);
      if (typeof event.impossibility !== "string" || event.impossibility.length === 0) return rejected(state);
      return {
        ...state,
        version: state.version + 1,
        tasks: { ...state.tasks, [event.taskId]: { ...t, phase: "exited" } },
      };
    }

    default:
      return rejected(state);
  }
}

export function foldLoop(events: readonly LoopEvent[]): LoopState {
  let s = initialLoop();
  for (const e of events) s = reduceLoop(s, e);
  return s;
}
