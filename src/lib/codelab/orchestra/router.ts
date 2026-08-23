/**
 * ORCHESTRA O0 — Router
 * --------------------
 * The single delivery checkpoint of the Channel Fabric. Every message in
 * the system passes `route()`; there is no other code path to a channel
 * (blueprint §6: enforcement is structural, not prompt-polite).
 *
 * Contract:
 *   - TOTAL: `validateEnvelope` and `route` never throw on untrusted input.
 *     All faults surface as fixed rejection tokens (payload content is
 *     never echoed into reasons — Phase 0 leak-safety discipline).
 *   - DETERMINISTIC: identical (envelope, grants) ⇒ identical decision.
 *   - AUDITABLE: every attempt — delivered or not — yields a
 *     `RouteAttemptRecord`. Eyes consume these: an illegal ATTEMPT is a
 *     finding even though delivery is impossible (blueprint §9).
 *
 * Non-goals: ledger persistence (O2), transport sockets, body transport
 * (messages carry artifact REFERENCES, never payloads [A: telephone-game
 * mitigation]).
 */

import {
  parseChannel,
  type ChannelAddress,
} from "./channels";
import {
  canRead,
  canWrite,
  type ChannelGrants,
} from "./capabilities";

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

export const MESSAGE_KINDS = Object.freeze([
  "dispatch", // orchestrator → parent work order
  "report", // child → family result summary
  "proposal", // mini → family up-chain finding (blueprint §7)
  "policy", // governance broadcast (PUBLIC doctrine)
  "finding", // eyes → oversight observation
  "freeze_motion", // eyes emergency pause request
  "chat", // ordinary in-family traffic
] as const);

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface MessageEnvelope {
  /** Unique, id-like (printable, whitespace-free, ≤128 chars). */
  readonly messageId: string;
  readonly fromAgentId: string;
  /** Wire-form destination address (`chan:*`). */
  readonly toChannel: string;
  readonly kind: MessageKind;
  /**
   * Artifact reference (≤512 chars). Payloads NEVER ride inside messages;
   * they live in the artifact store and are exchanged by reference.
   */
  readonly bodyRef: string;
  /** Abort generation the sender operates under. */
  readonly epoch: number;
}

export type EnvelopeReason =
  | "not_an_object"
  | "missing_field"
  | "bad_type"
  | "bad_id"
  | "unknown_kind"
  | "bad_channel"
  | "ref_too_long"
  | "bad_epoch";

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: EnvelopeReason };

const REF_MAX_CHARS = 512;

function isIdLike(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 1 &&
    v.length <= 128 &&
    !/\s/.test(v)
  );
}

/** Total validation. Fixed tokens only; content never echoed. */
export function validateEnvelope(raw: unknown): ValidationResult<MessageEnvelope> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  const o = raw as Record<string, unknown>;

  if (!isIdLike(o.messageId)) return { ok: false, reason: "bad_id" };
  if (!isIdLike(o.fromAgentId)) return { ok: false, reason: "bad_id" };

  if (typeof o.toChannel !== "string") return { ok: false, reason: "bad_type" };
  if (parseChannel(o.toChannel) === null) return { ok: false, reason: "bad_channel" };

  if (
    typeof o.kind !== "string" ||
    !(MESSAGE_KINDS as readonly string[]).includes(o.kind)
  ) {
    return { ok: false, reason: "unknown_kind" };
  }

  if (typeof o.bodyRef !== "string") return { ok: false, reason: "bad_type" };
  if (o.bodyRef.length > REF_MAX_CHARS) return { ok: false, reason: "ref_too_long" };
  if (/\s/.test(o.bodyRef) && o.bodyRef.length > 0) return { ok: false, reason: "bad_id" };

  if (typeof o.epoch !== "number" || !Number.isInteger(o.epoch) || o.epoch < 0) {
    return { ok: false, reason: "bad_epoch" };
  }

  return {
    ok: true,
    value: {
      messageId: o.messageId,
      fromAgentId: o.fromAgentId,
      toChannel: o.toChannel,
      kind: o.kind as MessageKind,
      bodyRef: o.bodyRef,
      epoch: o.epoch,
    },
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RouteRejectReason =
  | "unroutable_address" // destination failed to parse
  | "no_write_grant" // sender lacks write access (THE structural law)
  ;

export type RouteDecision =
  | { readonly ok: true; readonly channel: ChannelAddress }
  | { readonly ok: false; readonly reason: RouteRejectReason };

/**
 * The delivery decision. Structural law in one place:
 * deliverable ⇔ destination parses AND sender holds a write grant.
 */
export function route(msg: MessageEnvelope, senderGrants: ChannelGrants): RouteDecision {
  const dest = parseChannel(msg.toChannel);
  if (dest === null) return { ok: false, reason: "unroutable_address" };
  if (!canWrite(senderGrants, msg.toChannel)) {
    return { ok: false, reason: "no_write_grant" };
  }
  return { ok: true, channel: dest };
}

// ---------------------------------------------------------------------------
// Audit records (Eyes' raw material)
// ---------------------------------------------------------------------------

export interface RouteAttemptRecord {
  readonly messageId: string;
  readonly fromAgentId: string;
  readonly toChannel: string;
  readonly kind: MessageKind;
  readonly epoch: number;
  readonly delivered: boolean;
  /** Absent when delivered. Fixed token — no payload echo. */
  readonly rejectReason?: RouteRejectReason;
}

/**
 * Build the audit record for an attempt. Pure constructor so callers can't
 * forget to log, and logs can't disagree with decisions.
 */
export function attemptRecord(
  msg: MessageEnvelope,
  decision: RouteDecision,
): RouteAttemptRecord {
  return decision.ok
    ? {
        messageId: msg.messageId,
        fromAgentId: msg.fromAgentId,
        toChannel: msg.toChannel,
        kind: msg.kind,
        epoch: msg.epoch,
        delivered: true,
      }
    : {
        messageId: msg.messageId,
        fromAgentId: msg.fromAgentId,
        toChannel: msg.toChannel,
        kind: msg.kind,
        epoch: msg.epoch,
        delivered: false,
        rejectReason: decision.reason,
      };
}

// Re-exports so downstream modules import the fabric from one door.
export { canRead, canWrite } from "./capabilities";
export { parseChannel, formatChannel } from "./channels";
