/**
 * ORCHESTRA O1 — Activation Certificates (Genesis Pipeline, step 4)
 * ----------------------------------------------------------------
 * "No certificate, no execution rights. Ever." (blueprint §4.4)
 *
 * A certificate is the signed record that a candidate parent passed its
 * gauntlet. It binds: certId ↔ agent identity ↔ charter content digest.
 * Any later mutation of the charter voids verification — the scheduler
 * (O2) MUST consult `activationGate` before granting execution.
 *
 * Integrity note: the digest is a deterministic FNV-1a hash over canonical
 * JSON. It provides TAMPER EVIDENCE within the event-sourced log (the log
 * itself is the system of record), NOT adversarial cryptography. Threat
 * model: accidental drift / inconsistent charters across replays — not a
 * malicious host with write access to the ledger.
 *
 * Contract:
 *   - PURE + DETERMINISTIC: same charter ⇒ same digest, always (pinned).
 *   - No random ids: callers supply `certId` (id-like); issuance is total
 *     and returns typed results.
 */

import type { AgentIdentity, AgentRole } from "./capabilities";
import type { ParentCharter } from "./charter";

// ---------------------------------------------------------------------------
// Canonical serialization & digest
// ---------------------------------------------------------------------------

/** Recursive key-sorted JSON. Deterministic across insertion orders. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** FNV-1a 32-bit, hex-encoded. Log-integrity grade (see header note). */
export function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function charterDigest(charter: ParentCharter): string {
  return fnv1a32(canonicalJson(charter));
}

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

export interface ActivationCertificate {
  readonly certId: string;
  readonly agentId: string;
  readonly roles: readonly AgentRole[];
  /** Digest of the EXACT charter that qualified. */
  readonly charterDigest: string;
  /** Abort generation under which activation was granted. */
  readonly issuedAtEpoch: number;
  readonly issuerId: string;
}

export type IssueReason =
  | "bad_cert_id"
  | "bad_issuer"
  | "bad_epoch";

export type IssueResult =
  | { readonly ok: true; readonly certificate: ActivationCertificate }
  | { readonly ok: false; readonly reason: IssueReason };

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

/**
 * Issue an activation certificate. Caller attests the gauntlet PASSED —
 * issuance itself does not re-run probes (separation of duties: the
 * runner reports; genesis records). Total, non-throwing.
 */
export function issueActivation(params: {
  readonly certId: string;
  readonly charter: ParentCharter;
  readonly issuerId: string;
  readonly epoch: number;
}): IssueResult {
  if (!isIdLike(params.certId)) return { ok: false, reason: "bad_cert_id" };
  if (!isIdLike(params.issuerId)) return { ok: false, reason: "bad_issuer" };
  if (
    typeof params.epoch !== "number" ||
    !Number.isInteger(params.epoch) ||
    params.epoch < 0
  ) {
    return { ok: false, reason: "bad_epoch" };
  }

  const id: AgentIdentity = params.charter.identity;
  return {
    ok: true,
    certificate: {
      certId: params.certId,
      agentId: id.agentId,
      roles: [...id.roles],
      charterDigest: charterDigest(params.charter),
      issuedAtEpoch: params.epoch,
      issuerId: params.issuerId,
    },
  };
}

// ---------------------------------------------------------------------------
// Verification & the activation gate
// ---------------------------------------------------------------------------

export type GateReason =
  | "no_certificate"
  | "digest_mismatch"
  | "identity_mismatch";

export type GateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: GateReason };

/** Recompute-and-compare verification against a live charter. */
export function verifyActivation(
  cert: ActivationCertificate,
  charter: ParentCharter,
): GateDecision {
  if (cert.agentId !== charter.identity.agentId || rolesDiffer(cert.roles, charter.identity.roles)) {
    return { allowed: false, reason: "identity_mismatch" };
  }
  if (cert.charterDigest !== charterDigest(charter)) {
    return { allowed: false, reason: "digest_mismatch" };
  }
  return { allowed: true };
}

function rolesDiffer(a: readonly AgentRole[], b: readonly AgentRole[]): boolean {
  if (a.length !== b.length) return true;
  const set = new Set(b);
  for (const r of a) if (!set.has(r)) return true;
  return false;
}

/**
 * THE EXECUTION GATE. O2's scheduler must call this before any family it
 * is about to run. Absent/mutated certificates are hard denials.
 */
export function activationGate(
  cert: ActivationCertificate | null | undefined,
  charter: ParentCharter,
): GateDecision {
  if (cert === null || cert === undefined) return { allowed: false, reason: "no_certificate" };
  return verifyActivation(cert, charter);
}
