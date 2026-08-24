/**
 * ORCHESTRA O0 — Channel Addressing
 * ---------------------------------
 * Wire forms and total parsing for the three-and-one channel families of
 * the Channel Fabric (blueprint §6):
 *
 *   chan:public            broadcast doctrine (governance-written)
 *   chan:family:<parentId> one family tree (parent + direct children)
 *   chan:private:<agentId> one agent's engraved memory (+ its mini)
 *   chan:oversight         Eyes observers' findings channel
 *
 * Contract:
 *   - TOTAL: `parseChannel` returns null for any malformed address instead
 *     of throwing — mirrors LSE A5 payload handling. A malformed address is
 *     data, not an exceptional condition.
 *   - PURE: no clock, no random, no I/O. Browser/edge/node-safe.
 *   - Addresses are case-sensitive; ids obey the same id-rule as Phase 0
 *     event vocabulary (printable, whitespace-free, ≤128 chars).
 */

// ---------------------------------------------------------------------------
// Address model
// ---------------------------------------------------------------------------

export type ChannelAddress =
  | { readonly kind: "public" }
  | { readonly kind: "family"; readonly parentId: string }
  | { readonly kind: "private"; readonly agentId: string }
  | { readonly kind: "oversight" };

export const CHANNEL_PREFIX = "chan:";

/** Same id rule as Phase 0 `types.ts`: printable, no whitespace, 1–128. */
export function isChannelId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 1 &&
    v.length <= 128 &&
    !/\s/.test(v)
  );
}

/**
 * Canonical wire form. Deterministic: identical addresses always produce
 * identical strings (pinned by round-trip tests).
 */
export function formatChannel(a: ChannelAddress): string {
  switch (a.kind) {
    case "public":
      return `${CHANNEL_PREFIX}public`;
    case "oversight":
      return `${CHANNEL_PREFIX}oversight`;
    case "family":
      return `${CHANNEL_PREFIX}family:${a.parentId}`;
    case "private":
      return `${CHANNEL_PREFIX}private:${a.agentId}`;
  }
}

/**
 * Parse a wire-form channel address. Returns null on ANY malformation:
 * wrong prefix, unknown kind, missing/invalid id, trailing garbage,
 * non-string input. Never throws.
 */
export function parseChannel(raw: unknown): ChannelAddress | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith(CHANNEL_PREFIX)) return null;

  const rest = raw.slice(CHANNEL_PREFIX.length);

  if (rest === "public") return { kind: "public" };
  if (rest === "oversight") return { kind: "oversight" };

  if (rest.startsWith("family:")) {
    const parentId = rest.slice("family:".length);
    if (!isChannelId(parentId)) return null;
    return { kind: "family", parentId };
  }

  if (rest.startsWith("private:")) {
    const agentId = rest.slice("private:".length);
    if (!isChannelId(agentId)) return null;
    return { kind: "private", agentId };
  }

  return null;
}

/** Structural equality on parsed addresses. */
export function channelsEqual(
  a: ChannelAddress,
  b: ChannelAddress,
): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "public":
    case "oversight":
      return true;
    case "family":
      return a.parentId === (b as typeof a & { kind: "family" }).parentId;
    case "private":
      return a.agentId === (b as typeof a & { kind: "private" }).agentId;
  }
}

/** True when the address belongs to the named channel FAMILY partition. */
export function isFamilyOf(a: ChannelAddress, parentId: string): boolean {
  return a.kind === "family" && a.parentId === parentId;
}

/** True when the address is the named agent's PRIVATE channel. */
export function isPrivateOf(a: ChannelAddress, agentId: string): boolean {
  return a.kind === "private" && a.agentId === agentId;
}
