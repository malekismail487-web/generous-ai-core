/**
 * ORCHESTRA O0 — Capability Matrix & Structural Channel Laws
 * ---------------------------------------------------------
 * Encodes blueprint §6 as executable law: WHO may read/write WHICH channel,
 * derived from an agent's identity (species + position in the tree).
 *
 * THE LAW TABLE (default grants; genesis MAY extend, never shrink — §extend):
 *
 *   | role         | public r | public w | family(host) rw | family(parent) rw | private(self) rw | private(other) | oversight w |
 *   |--------------|----------|----------|-----------------|-------------------|------------------|----------------|-------------|
 *   | worker       | ✓        | ✗        | ✗               | ✓                 | ✓                | ✗              | ✗           |
 *   | parent       | ✓        | ✗        | ✓               | ✗*                | ✓                | ✗              | ✗           |
 *   | mini         | ✓        | ✗        | ✗               | ✓†                | ✗ (creator's: rw) | creator-only  | ✗           |
 *   | orchestrator | ✓        | ✓        | ✗‡              | ✗‡                | ✓                | ✗              | read-only   |
 *   | eyes         | ✓        | ✗        | read-all        | read-all          | read-all          | read-all      | ✓           |
 *
 *   * a parent hosts exactly its own family channel; cross-family contact
 *     is structurally impossible.
 *   † the mini proposes UP into the family of its creator's parent — never
 *     sideways, never to the worker directly (blueprint §7).
 *   ‡ genesis may grant the orchestrator explicit write access to specific
 *     family channels for direct dispatch orders; this is an ADDED grant,
 *     not a default (least privilege).
 *
 * Contract:
 *   - PURE + TOTAL. `canRead`/`canWrite` are total functions over
 *     (grants, address) and NEVER throw on malformed addresses — they
 *     simply deny. Malformed addresses are router-rejected upstream with a
 *     distinct reason so attempts remain auditable.
 *   - Enforcement here is the SINGLE SOURCE OF TRUTH. The router (O0) and
 *     any future transport MUST delegate to these functions rather than
 *     re-implementing the table.
 */

import {
  channelsEqual,
  formatChannel,
  parseChannel,
  type ChannelAddress,
} from "./channels";

// ---------------------------------------------------------------------------
// Identity & roles
// ---------------------------------------------------------------------------

/** The ONE runtime species; charters differentiate, roles position. */
export type AgentRole = "worker" | "parent" | "mini" | "orchestrator" | "eyes";

export interface AgentIdentity {
  readonly agentId: string;
  /** Parent that owns this agent's family slot; null for top-level roles. */
  readonly parentId: string | null;
  /** For minis only: the worker it was duplicated from. */
  readonly creatorId?: string;
  readonly roles: readonly AgentRole[];
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export interface ChannelGrants {
  readonly read: readonly string[]; // wire-form addresses
  readonly write: readonly string[];
  /**
   * Eyes-class omniscient read: supersedes the `read` list. Never set for
   * non-eyes agents; `defaultGrantsFor` refuses to emit it for them.
   */
  readonly readEverything?: true;
}

function has(grants: readonly string[], addr: string): boolean {
  return grants.some((g) => {
    const ga = parseChannel(g);
    const ta = parseChannel(addr);
    return ga !== null && ta !== null && channelsEqual(ga, ta);
  });
}

export function canRead(grants: ChannelGrants, addr: unknown): boolean {
  if (grants.readEverything === true) return true;
  const wire = typeof addr === "string" ? addr : formatChannelSafe(addr);
  if (wire === null) return false; // malformed ⇒ deny (router reports why)
  return has(grants.read, wire);
}

export function canWrite(grants: ChannelGrants, addr: unknown): boolean {
  const wire = typeof addr === "string" ? addr : formatChannelSafe(addr);
  if (wire === null) return false;
  return has(grants.write, wire);
}

function formatChannelSafe(addr: unknown): string | null {
  // Local guard: only accept shapes this module produced.
  if (typeof addr !== "object" || addr === null) return null;
  const kind = (addr as { kind?: unknown }).kind;
  if (
    kind !== "public" && kind !== "family" &&
    kind !== "private" && kind !== "oversight"
  ) {
    return null;
  }
  return formatChannel(addr as ChannelAddress);
}

// ---------------------------------------------------------------------------
// Default derivation (the law table)
// ---------------------------------------------------------------------------

/**
 * Structural defaults for an agent. Least-privilege by construction:
 * everything not granted here requires an explicit genesis extension.
 */
export function defaultGrantsFor(id: AgentIdentity): ChannelGrants {
  const self = `chan:private:${id.agentId}`;
  const read: string[] = ["chan:public", self];
  const write: string[] = [self];

  for (const role of id.roles) {
    switch (role) {
      case "worker": {
        // Worker talks within its parent's family channel.
        if (id.parentId !== null) {
          const fam = `chan:family:${id.parentId}`;
          push(read, fam);
          push(write, fam);
        }
        break;
      }
      case "parent": {
        // Parent HOSTS its own family channel.
        push(read, `chan:family:${id.agentId}`);
        push(write, `chan:family:${id.agentId}`);
        break;
      }
      case "mini": {
        // Proposes UP to the family of its creator's parent; reads and
        // appends to its creator's private log (dossier archive).
        if (id.creatorId !== undefined) {
          push(read, `chan:private:${id.creatorId}`);
          push(write, `chan:private:${id.creatorId}`);
        }
        // parentId of a mini = creator's parent (set at spawn time).
        if (id.parentId !== null) {
          const fam = `chan:family:${id.parentId}`;
          push(read, fam);
          push(write, fam);
        }
        break;
      }
      case "orchestrator": {
        // Governance writer of PUBLIC doctrine.
        push(write, "chan:public");
        // Reads oversight findings; cannot write them.
        push(read, "chan:oversight");
        break;
      }
      case "eyes": {
        // Omniscient read, single-channel write.
        return { read: [], write: ["chan:oversight"], readEverything: true };
      }
    }
  }

  return { read: dedupe(read), write: dedupe(write) };
}

// ---------------------------------------------------------------------------
// Genesis extension (additive-only)
// ---------------------------------------------------------------------------

export class GrantExtensionError extends Error {}

/**
 * Extend grants ADDITIVELY. Removal is structurally impossible through
 * this API — charter authors can widen access, never narrow it below the
 * structural defaults (a parent stripped of its family channel would break
 * the tree contract; narrowing belongs in the law table via governance).
 *
 * Eyes' `readEverything` flag is non-transferable: attempting to extend a
 * non-eyes grant set with it throws.
 */
export function extendGrants(
  base: ChannelGrants,
  extra: { readonly read?: readonly string[]; readonly write?: readonly string[] },
): ChannelGrants {
  for (const wire of [...(extra.read ?? []), ...(extra.write ?? [])]) {
    if (parseChannel(wire) === null) {
      throw new GrantExtensionError(`invalid channel address in extension: ${wire.slice(0, 24)}`);
    }
  }
  const nextRead = dedupe([...base.read, ...(extra.read ?? [])]);
  const nextWrite = dedupe([...base.write, ...(extra.write ?? [])]);
  return base.readEverything === true
    ? { read: nextRead, write: nextWrite, readEverything: true }
    : { read: nextRead, write: nextWrite };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function push(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

function dedupe(arr: readonly string[]): string[] {
  return Array.from(new Set(arr));
}
