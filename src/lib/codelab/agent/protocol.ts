/**
 * CodeLab Agent Core — Frame Transport Protocol (Phase 0)
 * ------------------------------------------------------
 * Sentinel-delimited JSON framing for the agent's streamed output, plus an
 * incremental, total parser. Mirrors the discipline of LSE A5
 * (`sessionInternals.ts`): a malformed frame must never tear down a stream.
 *
 * Wire format:
 *   @@AGENT_FRAME@@\n{...json...}\n@@/AGENT_FRAME@@
 *
 * Contract:
 *   - TOTAL: `push`/`flush` never throw. Malformed payloads surface as
 *     typed rejections with FIXED reason tokens (payload content is never
 *     echoed into results — directive 4: nothing CoT-like or user-content-
 *     bearing is persisted at the transport layer).
 *   - INCREMENTAL: frames split across arbitrary chunk boundaries are
 *     recovered; the property test exercises every byte-split offset.
 *   - BOUNDED: internal buffer and per-frame size are hard-capped; an
 *     unterminated oversized frame is discarded as one rejection and the
 *     stream continues.
 *   - DETERMINISTIC: same chunk sequence ⇒ same result sequence. No clock,
 *     no randomness, no I/O.
 *
 * Non-goals: envelope assignment (loop's job), reducer application,
 * any network access.
 */

import {
  LIMITS,
  validateDraft,
  type AgentEventDraft,
} from "./types";

// ---------------------------------------------------------------------------
// Sentinels & caps
// ---------------------------------------------------------------------------

export const AGENT_FRAME_OPEN = "@@AGENT_FRAME@@";
export const AGENT_FRAME_CLOSE = "@/AGENT_FRAME@@";

/** Hard cap for a single frame body (JSON text between sentinels). */
export const FRAME_MAX_CHARS = 65_536;

/** Hard cap for the parser's carry-over buffer across chunks. */
export const BUFFER_MAX_CHARS = 262_144;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Fixed rejection tokens — no payload content is ever embedded. */
export type FrameRejectReason =
  | "invalid_json"
  | "schema_rejected"
  | "oversize_frame"
  | "truncated_frame"
  | "buffer_overflow";

export interface RejectedFrame {
  readonly reason: FrameRejectReason;
  /** Approximate byte (UTF-16 code unit) footprint of the rejected payload. */
  readonly bytes: number;
}

export interface ParseResult {
  /** Valid drafts, in arrival order. */
  readonly frames: readonly AgentEventDraft[];
  /** Structured rejections, in arrival order. */
  readonly invalid: readonly RejectedFrame[];
  /**
   * Chars of non-frame model output (prose) observed and DISCARDED.
   * Counted only — never retained (directive 4).
   */
  readonly discardedProseChars: number;
}

export interface FrameParser {
  push(chunk: string): ParseResult;
  flush(): ParseResult;
  /** True while a frame body has been opened but not yet closed. */
  isInFrame(): boolean;
  reset(): void;
}

const EMPTY: ParseResult = Object.freeze({
  frames: Object.freeze([]),
  invalid: Object.freeze([]),
  discardedProseChars: 0,
});

function result(
  frames: AgentEventDraft[],
  invalid: RejectedFrame[],
  discardedProseChars: number,
): ParseResult {
  return {
    frames,
    invalid,
    discardedProseChars,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serialize one validated draft into its wire representation. The input MUST
 * already be schema-valid (callers pass values produced by `validateDraft`
 * or constructed literally in trusted code); this function does not
 * re-validate. Throws on JSON.stringify failure (cyclic structures), which
 * indicates a programmer error rather than a stream condition.
 */
export function serializeFrame(draft: AgentEventDraft): string {
  return `${AGENT_FRAME_OPEN}\n${JSON.stringify(draft)}\n${AGENT_FRAME_CLOSE}`;
}

/** Serialize a batch in order. */
export function serializeFrames(drafts: readonly AgentEventDraft[]): string {
  return drafts.map(serializeFrame).join("");
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser implements FrameParser {
  private buffer = "";
  private open = false;

  isInFrame(): boolean {
    return this.open;
  }

  reset(): void {
    this.buffer = "";
    this.open = false;
  }

  push(chunk: string): ParseResult {
    if (chunk.length === 0) return EMPTY;

    // Boundedness: if accepting the chunk would exceed the cap while no
    // frame is open, shed weight deterministically: keep only a suffix of
    // the old buffer large enough to hold a partial OPEN sentinel plus a
    // suffix of the chunk, then report one rejection. Pre-frame bytes are
    // counted as discarded prose.
    if (!this.open && this.buffer.length + chunk.length > BUFFER_MAX_CHARS) {
      const keepOld = Math.min(this.buffer.length, AGENT_FRAME_OPEN.length - 1);
      const keepNew = Math.min(chunk.length, BUFFER_MAX_CHARS / 2);
      const oldKept = this.buffer.slice(this.buffer.length - keepOld);
      const newKept = chunk.slice(chunk.length - keepNew);
      const proseDropped =
        this.buffer.length - keepOld + (chunk.length - keepNew);
      this.buffer = oldKept + newKept;
      return result(
        [],
        [{ reason: "buffer_overflow", bytes: keepOld + keepNew }],
        proseDropped,
      );
    }

    this.buffer += chunk;
    const frames: AgentEventDraft[] = [];
    const invalid: RejectedFrame[] = [];
    let prose = 0;

    for (;;) {
      if (!this.open) {
        const openIdx = this.buffer.indexOf(AGENT_FRAME_OPEN);
        if (openIdx === -1) {
          // Everything except a possible partial-suffix of the OPEN sentinel
          // is prose. Keep at most OPEN.length-1 trailing chars as candidate.
          const keepMax = AGENT_FRAME_OPEN.length - 1;
          if (this.buffer.length > keepMax) {
            prose += this.buffer.length - keepMax;
            this.buffer = this.buffer.slice(this.buffer.length - keepMax);
          }
          break;
        }
        prose += openIdx;
        this.buffer = this.buffer.slice(openIdx + AGENT_FRAME_OPEN.length);
        this.open = true;
        continue;
      }

      // In-frame: look for CLOSE.
      const closeIdx = this.buffer.indexOf(AGENT_FRAME_CLOSE);
      if (closeIdx === -1) {
        if (this.buffer.length > FRAME_MAX_CHARS) {
          const bytes = this.buffer.length;
          this.reset();
          invalid.push({ reason: "oversize_frame", bytes });
          continue;
        }
        break;
      }

      let body = this.buffer.slice(0, closeIdx);
      this.buffer = this.buffer.slice(closeIdx + AGENT_FRAME_CLOSE.length);
      this.open = false;

      // Trim the newlines written by serializeFrame; tolerate other
      // surrounding whitespace from hand-rolled producers.
      body = body.trim();
      if (body.length > FRAME_MAX_CHARS) {
        invalid.push({ reason: "oversize_frame", bytes: body.length });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        invalid.push({ reason: "invalid_json", bytes: body.length });
        continue;
      }

      const checked = validateDraft(parsed);
      if (checked.ok) {
        frames.push(checked.value);
      } else {
        // Schema rejection: reason token comes from the fixed vocabulary.
        invalid.push({ reason: "schema_rejected", bytes: body.length });
      }
    }

    return result(frames, invalid, prose);
  }

  flush(): ParseResult {
    if (!this.open && this.buffer.length === 0) return EMPTY;

    const invalid: RejectedFrame[] = [];
    let prose = 0;

    if (this.open) {
      // Unterminated frame at end-of-stream.
      const bytes = this.buffer.length;
      invalid.push({ reason: "truncated_frame", bytes });
    } else {
      // No open frame: residual buffer can only be a partial OPEN sentinel
      // candidate (or empty). Treat as prose tail.
      prose += this.buffer.length;
    }

    this.reset();
    return result([], invalid, prose);
  }
}

export function createFrameParser(): FrameParser {
  return new Parser();
}

// ---------------------------------------------------------------------------
// Convenience: parse a complete string in one shot (tests, tools)
// ---------------------------------------------------------------------------

export function parseAll(input: string): ParseResult {
  const p = createFrameParser();
  const a = p.push(input);
  const b = p.flush();
  return {
    frames: [...a.frames, ...b.frames],
    invalid: [...a.invalid, ...b.invalid],
    discardedProseChars: a.discardedProseChars + b.discardedProseChars,
  };
}
