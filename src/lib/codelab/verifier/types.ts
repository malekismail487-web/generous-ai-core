/**
 * CodeLab Verifier — Independent Contracts (Phase 0)
 * -------------------------------------------------
 * The verifier is an architecturally INDEPENDENT component from day one
 * (plan §1.3 / §3): it evaluates `(original goal, resulting diff, evidence)`
 * and nothing else. Even while the same gateway model initially powers both
 * actor and verifier, this module boundary guarantees the evaluation role
 * can be swapped — stronger model, deterministic checker suite, human
 * review — without touching actor internals.
 *
 * What independence means concretely:
 *   - `VerifierInput` carries only session identity, goal text, a diff
 *     SUMMARY, and channel evidence. No rationale events, no scratch state,
 *     no tool transcripts.
 *   - `buildVerifierInput` is the ONLY sanctioned projection from agent
 *     session state into verifier space (plan §8.4).
 *   - Everything here is pure and deterministic; the async model-backed
 *     `evaluate()` arrives in Phase 4 behind these same types.
 *
 * Non-goals: prompt construction, network calls, reducer access beyond the
 * read-only projection.
 */

import {
  LIMITS,
  VERIFICATION_CHANNELS,
  type ChannelEvidence,
  type ChannelStatus,
  type Epoch,
  type VerificationChannel,
  type VerificationVerdict,
} from "../agent/types";

// ---------------------------------------------------------------------------
// The verifier's own view of a session (structural, import-free)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of one FS delta as seen across the verifier boundary.
 * Structural by design: the reducer's richer `FileDeltaEvent` satisfies this
 * without the verifier importing anything from the actor's reducer module.
 */
export interface FileDeltaLike {
  readonly path: string;
  readonly op: "write" | "delete";
  readonly contentAfter?: string;
}

/**
 * Everything the verifier may know about a session. `AgentSessionState`
 * satisfies this structurally — but note how little survives the boundary:
 * no plan, no calls, no status rationales, no timeline.
 */
export interface VerifierVisibleSession {
  readonly sessionId: string;
  readonly epoch: Epoch;
  readonly goal: string | null;
  readonly acceptance: readonly string[];
  readonly fileDeltas: readonly FileDeltaLike[];
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/** Summary line for one changed file. Content bodies never cross this edge. */
export interface DiffFileSummary {
  readonly path: string;
  readonly op: "write" | "delete";
  /** UTF-16 code-unit length of the content after the write (0 for delete). */
  readonly bytesAfter: number;
}

export interface VerifierInput {
  readonly sessionId: string;
  /** Abort generation the diff was produced under. */
  readonly epoch: Epoch;
  readonly goal: string;
  readonly acceptance: readonly string[];
  readonly diff: readonly DiffFileSummary[];
  /**
   * Evidence collected by the harness from the six runtime channels.
   * The verifier NEVER gathers evidence itself in Phase 0.
   */
  readonly evidence: readonly ChannelEvidence[];
}

export interface VerifierOutput {
  readonly runId: string;
  readonly verdict: VerificationVerdict;
  /** Normalized per-channel view the output must echo consistently. */
  readonly channels: readonly ChannelEvidence[];
  /** Bounded goal-vs-result assessment (≤ LIMITS.assessmentMaxChars). */
  readonly goalAssessment: string;
}

/**
 * The verifier's evaluation seam. Phase 4 will implement this with a model
 * call; deterministic checkers may implement it without one. Same contract,
 * swappable implementation — that is the entire point of directive 3.
 */
export interface Verifier {
  evaluate(input: VerifierInput): Promise<VerifierOutput>;
}

// ---------------------------------------------------------------------------
// Deterministic verdict aggregation
// ---------------------------------------------------------------------------

/**
 * Derive a verdict from channel evidence alone. Total and deterministic:
 *
 *   1. Any `fail`                ⇒ "fail"
 *   2. Any `error`               ⇒ "inconclusive"
 *   3. Empty evidence            ⇒ "inconclusive" (nothing verified ≠ pass)
 *   4. Otherwise                 ⇒ "pass"
 *
 * `expectedChannels` tightens rule 4 (missing coverage must not silently
 * pass — plan §5): when provided, any expected channel that is absent or
 * `skipped` downgrades the result to "inconclusive".
 */
export function aggregateVerdict(
  evidence: readonly ChannelEvidence[],
  expectedChannels?: readonly VerificationChannel[],
): VerificationVerdict {
  let sawError = false;

  for (const e of evidence) {
    if (e.status === "fail") return "fail";
    if (e.status === "error") sawError = true;
  }
  if (sawError) return "inconclusive";
  if (evidence.length === 0) return "inconclusive";

  if (expectedChannels !== undefined) {
    const byChannel = new Map<VerificationChannel, ChannelStatus>(
      evidence.map((e) => [e.channel, e.status]),
    );
    for (const ch of expectedChannels) {
      const status = byChannel.get(ch);
      if (status === undefined || status === "skipped") return "inconclusive";
    }
  }

  return "pass";
}

/**
 * All six channels with a given default status — used by harnesses to build
 * complete evidence sets quickly.
 */
export function uniformEvidence(
  status: ChannelStatus,
  detail = "",
): ChannelEvidence[] {
  return VERIFICATION_CHANNELS.map((channel) => ({ channel, status, detail }));
}

// ---------------------------------------------------------------------------
// Projection: agent state → verifier input (the ONLY sanctioned bridge)
// ---------------------------------------------------------------------------

function toDiffSummary(d: FileDeltaLike): DiffFileSummary {
  return {
    path: d.path,
    op: d.op,
    bytesAfter: d.contentAfter !== undefined ? d.contentAfter.length : 0,
  };
}

/**
 * Project a session into verifier input space. Pure. Read-only.
 *
 * Note what deliberately does NOT cross: status rationales, plan contents,
 * tool arguments/results, timeline events. The verifier judges outcomes,
 * not the actor's narration of them.
 */
export function buildVerifierInput(
  state: VerifierVisibleSession,
  evidence: readonly ChannelEvidence[] = [],
): VerifierInput {
  return {
    sessionId: state.sessionId,
    epoch: state.epoch,
    goal: state.goal ?? "",
    acceptance: state.acceptance,
    diff: state.fileDeltas.map(toDiffSummary),
    evidence,
  };
}

/** Guard used by Phase 4 implementations to keep assessments bounded. */
export function clampAssessment(text: string): string {
  return text.length <= LIMITS.assessmentMaxChars
    ? text
    : `${text.slice(0, LIMITS.assessmentMaxChars - 1)}…`;
}
