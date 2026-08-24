/**
 * CodeLab Agent Core — Event & State Vocabulary (Phase 0)
 * ------------------------------------------------------
 * The single source of truth for the agentic coding engine's event log
 * vocabulary, bounded-size limits, and structural validation. Mirrors §2 of
 * `.lovable/codelab-agent-plan.md` (v2).
 *
 * Contract:
 *   - PURE DATA + TOTAL VALIDATORS only. No I/O, no `Date`, no
 *     `Math.random`, no React. Browser/edge/node-safe.
 *   - Every event is a discriminated union member carrying an envelope
 *     `(sessionId, seq, epoch)`. Producers (the loop controller, Phase 1)
 *     assign the envelope; streamed model output arrives as envelope-free
 *     `AgentEventDraft` values.
 *   - `validateDraft` is total: it returns a typed result instead of
 *     throwing, so a malformed frame can never tear down a stream or a
 *     replay. Reason strings are FIXED tokens — offending content is never
 *     echoed back into logs (no chain-of-thought / user-content leakage).
 *
 * Non-goals (deferred):
 *   - Concrete tool definitions and execution (Phase 1).
 *   - Reducer semantics (`./reducer.ts`), transport framing
 *     (`./protocol.ts`), verifier contracts (`../verifier/`).
 */

// ---------------------------------------------------------------------------
// Bounded-size limits
// ---------------------------------------------------------------------------

/**
 * Hard caps enforced by `validateDraft` and honored by the reducer's ring
 * buffers. Frozen: consumers may rely on these at module-init time.
 */
export const LIMITS = Object.freeze({
  /** Max length of a `status` rationale string. */
  rationaleMaxChars: 280,
  /** Max steps in a plan after any `plan_update`. */
  planStepsMax: 32,
  /** Max chars per plan step title. */
  planTitleMaxChars: 140,
  /** Max chars per goal string. */
  goalMaxChars: 4000,
  /** Max acceptance criteria entries per session. */
  acceptanceMaxItems: 16,
  /** Max serialized tool-call arguments, bytes (UTF-16 code units ≈ proxy). */
  argsJsonMaxBytes: 16_384,
  /** Max serialized tool-result payload, bytes. Full file bodies are banned. */
  resultJsonMaxBytes: 32_768,
  /** Max chars for one-shot summaries (tool_result.summary, done.summary). */
  summaryMaxChars: 2000,
  /** Max chars for a verification channel detail line. */
  evidenceDetailMaxChars: 1000,
  /** Max chars for the verifier's final goal assessment. */
  assessmentMaxChars: 2000,
  /** Reducer timeline ring capacity (applied events retained). */
  timelineCapacity: 256,
  /** Reducer status ring capacity. */
  statusRingCapacity: 64,
  /** Verifier run summaries retained in state (newest kept). */
  verificationRunsRetained: 16,
});

// ---------------------------------------------------------------------------
// Phase vocabulary (fixed — directive 4: structured status, never raw CoT)
// ---------------------------------------------------------------------------

export const AGENT_PHASES = Object.freeze([
  "recon",
  "planning",
  "editing",
  "running",
  "verifying",
  "failure_diagnosed",
  "complete",
] as const);

export type AgentPhase = (typeof AGENT_PHASES)[number];

export function isAgentPhase(v: unknown): v is AgentPhase {
  return typeof v === "string" && (AGENT_PHASES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Plans (mutable via plan_update ops — directive 1)
// ---------------------------------------------------------------------------

export type PlanStepStatus = "pending" | "in_progress" | "done" | "dropped";

export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly status: PlanStepStatus;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
  /** Increments once per plan_update event that applied ≥ 1 op. */
  readonly revision: number;
}

export interface PlanStepSeed {
  readonly id: string;
  readonly title: string;
}

export type PlanOp =
  | { op: "replace"; steps: readonly PlanStepSeed[] }
  | { op: "add_step"; afterStepId: string | null; step: PlanStepSeed }
  | { op: "remove_step"; stepId: string }
  | { op: "set_status"; stepId: string; status: PlanStepStatus }
  | { op: "reorder"; order: readonly string[] };

// ---------------------------------------------------------------------------
// Verification vocabulary (directive 5) — shared by actor log and verifier
// ---------------------------------------------------------------------------

export const VERIFICATION_CHANNELS = Object.freeze([
  "syntax",
  "types",
  "unit",
  "integration",
  "runtime",
  "behavioral",
] as const);

export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export type ChannelStatus = "pass" | "fail" | "skipped" | "error";

export interface ChannelEvidence {
  readonly channel: VerificationChannel;
  readonly status: ChannelStatus;
  readonly detail: string;
}

export type VerificationVerdict = "pass" | "fail" | "inconclusive";

// ---------------------------------------------------------------------------
// Event bodies
// ---------------------------------------------------------------------------

export interface GoalSetEvent {
  readonly kind: "goal_set";
  readonly goal: string;
  /** Optional student/agent-authored acceptance criteria for the session. */
  readonly acceptance?: readonly string[];
}

export interface StatusEvent {
  readonly kind: "status";
  readonly phase: AgentPhase;
  /** Concise, human-facing rationale. NOT chain-of-thought (directive 4). */
  readonly rationale: string;
}

export interface PlanUpdateEvent {
  readonly kind: "plan_update";
  readonly ops: readonly PlanOp[];
}

export interface ToolCallEvent {
  readonly kind: "tool_call";
  /** Model-assigned correlation id; unique among currently-open calls. */
  readonly callId: string;
  readonly tool: string;
  /** JSON-stringified arguments object (validated upstream, size-capped). */
  readonly argsJson: string;
}

export interface ToolResultEvent {
  readonly kind: "tool_result";
  readonly callId: string;
  readonly ok: boolean;
  /** Bounded observation summary fed back to the model. */
  readonly summary: string;
  /** Optional JSON-stringified structured payload, size-capped. */
  readonly resultJson?: string;
}

/** The ONLY sanctioned record of a virtual-FS mutation (plan §8.3). */
export interface FileDeltaEvent {
  readonly kind: "file_delta";
  readonly path: string;
  readonly op: "write" | "delete";
  /** Full content after a write; absent for deletes. */
  readonly contentAfter?: string;
}

export interface VerificationEvent {
  readonly kind: "verification";
  readonly runId: string;
  readonly verdict: VerificationVerdict;
  readonly channels: readonly ChannelEvidence[];
  /** Bounded goal-vs-result assessment authored by the verifier. */
  readonly assessment: string;
}

export interface ErrorEvent {
  readonly kind: "error";
  /** Fixed scope token, e.g. "loop", "tool:run_js", "transport". */
  readonly scope: string;
  readonly message: string;
}

export interface DoneEvent {
  readonly kind: "done";
  readonly summary: string;
}

export interface AbortedEvent {
  readonly kind: "aborted";
  /** MUST equal the reducing state's epoch + 1; otherwise rejected. */
  readonly newEpoch: number;
  readonly reason: string;
}

export type AgentEventBody =
  | GoalSetEvent
  | StatusEvent
  | PlanUpdateEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileDeltaEvent
  | VerificationEvent
  | ErrorEvent
  | DoneEvent
  | AbortedEvent;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export type AgentSessionId = string;
export type Seq = number;
export type Epoch = number;

export interface AgentEventEnvelope {
  readonly sessionId: AgentSessionId;
  readonly seq: Seq;
  readonly epoch: Epoch;
}

/** A fully-addressable event as stored in the log. */
export type AgentEvent = AgentEventBody & AgentEventEnvelope;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Envelope-free event produced by the protocol parser. The loop assigns
 * `(sessionId, seq, epoch)` when appending to the log (plan §8.2).
 */
export type AgentEventDraft = DistributiveOmit<AgentEvent, keyof AgentEventEnvelope>;

// ---------------------------------------------------------------------------
// Validation (total, non-throwing, leak-safe reason tokens)
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ValidationReason };

/** Fixed rejection tokens — never embed payload content. */
export type ValidationReason =
  | "not_an_object"
  | "unknown_kind"
  | "missing_field"
  | "bad_type"
  | "too_long"
  | "too_many"
  | "bad_json_string"
  | "bad_uuidish"
  | "bad_path";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(
  o: Record<string, unknown>,
  k: string,
  max: number,
): { err?: "missing_field" | "bad_type" | "too_long"; val?: string } {
  const raw = o[k];
  if (raw === undefined) return { err: "missing_field" };
  if (typeof raw !== "string") return { err: "bad_type" };
  if (raw.length > max) return { err: "too_long" };
  return { val: raw };
}

function strArray(
  v: unknown,
  maxItems: number,
  maxLen: number,
): { err?: "bad_type" | "too_many" | "too_long"; val?: readonly string[] } {
  if (!Array.isArray(v)) return { err: "bad_type" };
  if (v.length > maxItems) return { err: "too_many" };
  for (const item of v) {
    if (typeof item !== "string") return { err: "bad_type" };
    if (item.length > maxLen) return { err: "too_long" };
  }
  return { val: v as string[] };
}

function jsonStr(v: unknown, maxBytes: number): boolean {
  if (typeof v !== "string") return false;
  if (v.length > maxBytes) return false;
  try {
    const parsed: unknown = JSON.parse(v);
    return isPlainObject(parsed);
  } catch {
    return false;
  }
}

/** Cheap identifier sanity: printable, no whitespace, 1–128 chars. */
function isIdLike(v: string): boolean {
  return v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

/** Virtual-FS path sanity: relative, POSIX separators, no traversal. */
export function isValidFsPath(v: string): boolean {
  if (v.length === 0 || v.length > 512) return false;
  if (v.includes("\\")) return false;
  if (v.startsWith("/")) return false;
  if (v.includes("..")) return false;
  if (/[\u0000-\u001f]/.test(v)) return false;
  return true;
}

const PLAN_STEP_STATUSES: readonly PlanStepStatus[] = [
  "pending", "in_progress", "done", "dropped",
];

function validatePlanOp(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  switch (raw.op) {
    case "replace": {
      const steps = raw.steps;
      if (!Array.isArray(steps)) return false;
      if (steps.length > LIMITS.planStepsMax) return false;
      for (const s of steps) {
        if (!isPlainObject(s)) return false;
        if (typeof s.id !== "string" || !isIdLike(s.id)) return false;
        if (typeof s.title !== "string") return false;
        if (s.title.length > LIMITS.planTitleMaxChars) return false;
      }
      return true;
    }
    case "add_step": {
      if (raw.afterStepId !== null && typeof raw.afterStepId !== "string") return false;
      const step = raw.step;
      if (!isPlainObject(step)) return false;
      if (typeof step.id !== "string" || !isIdLike(step.id)) return false;
      if (typeof step.title !== "string") return false;
      if (step.title.length > LIMITS.planTitleMaxChars) return false;
      return true;
    }
    case "remove_step":
      return typeof raw.stepId === "string" && isIdLike(raw.stepId);

    case "set_status":
      return (
        typeof raw.stepId === "string" &&
        isIdLike(raw.stepId) &&
        typeof raw.status === "string" &&
        PLAN_STEP_STATUSES.includes(raw.status as PlanStepStatus)
      );

    case "reorder": {
      if (!Array.isArray(raw.order)) return false;
      if (raw.order.length > LIMITS.planStepsMax) return false;
      for (const id of raw.order) {
        if (typeof id !== "string" || !isIdLike(id)) return false;
      }
      return true;
    }

    default:
      return false;
  }
}

function validateChannelEvidence(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (
    typeof raw.channel !== "string" ||
    !(VERIFICATION_CHANNELS as readonly string[]).includes(raw.channel)
  ) {
    return false;
  }
  if (
    typeof raw.status !== "string" ||
    !["pass", "fail", "skipped", "error"].includes(raw.status)
  ) {
    return false;
  }
  return typeof raw.detail === "string" && raw.detail.length <= LIMITS.evidenceDetailMaxChars;
}

/**
 * Validate an untrusted draft (e.g. freshly JSON.parsed frame body).
 * Total: returns `{ok:false, reason}` instead of throwing.
 */
export function validateDraft(raw: unknown): ValidationResult<AgentEventDraft> {
  if (!isPlainObject(raw)) return { ok: false, reason: "not_an_object" };
  const kind = raw.kind;

  switch (kind) {
    case "goal_set": {
      const g = str(raw, "goal", LIMITS.goalMaxChars);
      if (g.err) return { ok: false, reason: g.err };
      let acceptance: readonly string[] = [];
      if (raw.acceptance !== undefined) {
        const a = strArray(raw.acceptance, LIMITS.acceptanceMaxItems, 500);
        if (a.err) return { ok: false, reason: a.err };
        acceptance = a.val!;
      }
      return {
        ok: true,
        value: {
          kind: "goal_set",
          goal: g.val!,
          ...(acceptance.length > 0 ? { acceptance } : {}),
        },
      };
    }

    case "status": {
      if (!isAgentPhase(raw.phase)) return { ok: false, reason: "bad_type" };
      const r = str(raw, "rationale", LIMITS.rationaleMaxChars);
      if (r.err) return { ok: false, reason: r.err };
      return { ok: true, value: { kind: "status", phase: raw.phase, rationale: r.val! } };
    }

    case "plan_update": {
      const ops = raw.ops;
      if (!Array.isArray(ops)) return { ok: false, reason: "bad_type" };
      if (ops.length > LIMITS.planStepsMax * 2) return { ok: false, reason: "too_many" };
      for (const op of ops) {
        if (!validatePlanOp(op)) return { ok: false, reason: "bad_type" };
      }
      return { ok: true, value: { kind: "plan_update", ops: ops as readonly PlanOp[] } };
    }

    case "tool_call": {
      const callId = str(raw, "callId", 128);
      if (callId.err) return { ok: false, reason: callId.err };
      if (!isIdLike(callId.val!)) return { ok: false, reason: "bad_uuidish" };
      const tool = str(raw, "tool", 64);
      if (tool.err) return { ok: false, reason: tool.err };
      if (!isIdLike(tool.val!)) return { ok: false, reason: "bad_uuidish" };
      if (typeof raw.argsJson !== "string") return { ok: false, reason: "bad_type" };
      if (!jsonStr(raw.argsJson, LIMITS.argsJsonMaxBytes)) {
        return { ok: false, reason: "bad_json_string" };
      }
      return {
        ok: true,
        value: {
          kind: "tool_call",
          callId: callId.val!,
          tool: tool.val!,
          argsJson: raw.argsJson,
        },
      };
    }

    case "tool_result": {
      const callId = str(raw, "callId", 128);
      if (callId.err) return { ok: false, reason: callId.err };
      if (!isIdLike(callId.val!)) return { ok: false, reason: "bad_uuidish" };
      if (typeof raw.ok !== "boolean") return { ok: false, reason: "bad_type" };
      const s = str(raw, "summary", LIMITS.summaryMaxChars);
      if (s.err) return { ok: false, reason: s.err };
      const resultJson = raw.resultJson;
      if (resultJson !== undefined) {
        if (
          typeof resultJson !== "string" ||
          !jsonStr(resultJson, LIMITS.resultJsonMaxBytes)
        ) {
          return { ok: false, reason: "bad_json_string" };
        }
      }
      return {
        ok: true,
        value: {
          kind: "tool_result",
          callId: callId.val!,
          ok: raw.ok,
          summary: s.val!,
          ...(typeof resultJson === "string" ? { resultJson } : {}),
        },
      };
    }

    case "file_delta": {
      if (raw.op !== "write" && raw.op !== "delete") return { ok: false, reason: "bad_type" };
      const p = str(raw, "path", 512);
      if (p.err) return { ok: false, reason: p.err };
      if (!isValidFsPath(p.val!)) return { ok: false, reason: "bad_path" };
      const contentAfter = raw.contentAfter;
      if (contentAfter !== undefined) {
        if (typeof contentAfter !== "string") return { ok: false, reason: "bad_type" };
        if (raw.op === "delete") return { ok: false, reason: "bad_type" };
        if (contentAfter.length > LIMITS.resultJsonMaxBytes) {
          return { ok: false, reason: "too_long" };
        }
      } else if (raw.op === "write") {
        return { ok: false, reason: "missing_field" };
      }
      return {
        ok: true,
        value: {
          kind: "file_delta",
          path: p.val!,
          op: raw.op,
          ...(typeof contentAfter === "string" ? { contentAfter } : {}),
        },
      };
    }

    case "verification": {
      const runId = str(raw, "runId", 128);
      if (runId.err) return { ok: false, reason: runId.err };
      if (!isIdLike(runId.val!)) return { ok: false, reason: "bad_uuidish" };
      if (
        typeof raw.verdict !== "string" ||
        !["pass", "fail", "inconclusive"].includes(raw.verdict)
      ) {
        return { ok: false, reason: "bad_type" };
      }
      const channels = raw.channels;
      if (!Array.isArray(channels)) return { ok: false, reason: "bad_type" };
      if (channels.length > VERIFICATION_CHANNELS.length * 2) {
        return { ok: false, reason: "too_many" };
      }
      for (const c of channels) {
        if (!validateChannelEvidence(c)) return { ok: false, reason: "bad_type" };
      }
      const a = str(raw, "assessment", LIMITS.assessmentMaxChars);
      if (a.err) return { ok: false, reason: a.err };
      return {
        ok: true,
        value: {
          kind: "verification",
          runId: runId.val!,
          verdict: raw.verdict as VerificationVerdict,
          channels: channels as readonly ChannelEvidence[],
          assessment: a.val!,
        },
      };
    }

    case "error": {
      const scope = str(raw, "scope", 64);
      if (scope.err) return { ok: false, reason: scope.err };
      if (!isIdLike(scope.val!.split(/[:.]/).join("_"))) return { ok: false, reason: "bad_uuidish" };
      const m = str(raw, "message", LIMITS.summaryMaxChars);
      if (m.err) return { ok: false, reason: m.err };
      return { ok: true, value: { kind: "error", scope: scope.val!, message: m.val! } };
    }

    case "done": {
      const s = str(raw, "summary", LIMITS.summaryMaxChars);
      if (s.err) return { ok: false, reason: s.err };
      return { ok: true, value: { kind: "done", summary: s.val! } };
    }

    case "aborted": {
      if (typeof raw.newEpoch !== "number" || !Number.isInteger(raw.newEpoch) || raw.newEpoch < 1) {
        return { ok: false, reason: "bad_type" };
      }
      const r = str(raw, "reason", 500);
      if (r.err) return { ok: false, reason: r.err };
      return { ok: true, value: { kind: "aborted", newEpoch: raw.newEpoch, reason: r.val! } };
    }

    default:
      return { ok: false, reason: "unknown_kind" };
  }
}
