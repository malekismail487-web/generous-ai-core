/**
 * ORCHESTRA O1 — Charter Schema & Composition (Genesis Pipeline, step 1–2)
 * -----------------------------------------------------------------------
 * A charter is a parent's DNA: identity, mission, doctrine, model tiers,
 * budget envelope, and qualification requirements. The schema constrains
 * SHAPE, never CONTENT — mission and doctrine are freeform within size
 * bounds, because parents are bespoke by design (blueprint §4.1).
 *
 * Composition law:
 *   - Channel access ALWAYS starts from the O0 law table
 *     (`defaultGrantsFor`) and can only widen through `extendGrants`.
 *   - Genesis extensions are further constrained by the EXTENSION LAW
 *     (blueprint §6 note ‡): only the orchestrator may be granted
 *     family-channel access (direct dispatch). Workers/minis/parents/eyes
 *     cannot have cross-family or foreign-private access grafted on —
 *     such charters are structurally invalid, not merely discouraged.
 *
 * Contract:
 *   - TOTAL validators with fixed rejection tokens; content is never
 *     echoed into reasons.
 *   - PURE: no clock, no random, no I/O.
 */

import type { AgentRole } from "./capabilities";
import {
  defaultGrantsFor,
  extendGrants,
  type AgentIdentity,
  type ChannelGrants,
} from "./capabilities";
import { parseChannel } from "./channels";
import type { ProbeKind } from "./gauntlet";

// ---------------------------------------------------------------------------
// Limits & tiers
// ---------------------------------------------------------------------------

export const GENESIS_LIMITS = Object.freeze({
  missionMaxChars: 4000,
  doctrineFieldMaxChars: 2000,
  stopConditionsMaxItems: 8,
  stopConditionMaxChars: 300,
  maxToolCallsMin: 1,
});

/** Execution tiers of the swarm pool (blueprint §5). */
export const MODEL_TIERS = Object.freeze(["deterministic", "fast", "frontier"] as const);
export type ModelTier = (typeof MODEL_TIERS)[number];

// ---------------------------------------------------------------------------
// Charter shape
// ---------------------------------------------------------------------------

export interface CharterDoctrine {
  /** Freeform planning narrative — HOW this parent decomposes work. */
  readonly planning: string;
  /** Freeform delegation style — HOW briefs are written to children [A]. */
  readonly delegation: string;
  /** Explicit conditions under which this parent MUST stop/escalate. */
  readonly stopConditions: readonly string[];
}

export interface CharterBudget {
  /** Hard cap on tool invocations per task unit. */
  readonly maxToolCalls: number;
  /** Planner's token estimate ceiling for the family (accounting only). */
  readonly maxTokenEstimate: number;
}

export interface CharterQualification {
  /** Probes that MUST pass before activation. */
  readonly requiredProbes: readonly ProbeKind[];
  /** If set: mean score across required probes must be ≥ minScore. */
  readonly minScore?: number;
}

export interface ParentCharter {
  readonly identity: AgentIdentity;
  readonly mission: string;
  readonly doctrine: CharterDoctrine;
  readonly tierByRole: Partial<Record<AgentRole, ModelTier>>;
  readonly budget: CharterBudget;
  readonly qualification: CharterQualification;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type CharterReason =
  | "not_an_object"
  | "bad_identity"
  | "mission_too_long"
  | "doctrine_too_long"
  | "too_many_stop_conditions"
  | "bad_tier"
  | "bad_budget"
  | "bad_probe_kind"
  | "bad_min_score"
  | "bad_channel_grant"
  | "unlawful_grants";

const KNOWN_PROBES: readonly string[] = [
  "planning_coverage",
  "channel_law",
  "budget_discipline",
  "failure_behavior",
  "delegation_quality",
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strBounded(v: unknown, max: number): boolean {
  return typeof v === "string" && v.length <= max;
}

function looksLikeIdentity(v: unknown): v is AgentIdentity {
  if (!isPlainObject(v)) return false;
  const id = v as Partial<AgentIdentity>;
  if (typeof id.agentId !== "string" || id.agentId.length === 0) return false;
  if (!Array.isArray(id.roles) || id.roles.length === 0) return false;
  for (const r of id.roles) {
    if (r !== "worker" && r !== "parent" && r !== "mini" && r !== "orchestrator" && r !== "eyes") {
      return false;
    }
  }
  if (id.parentId !== undefined && id.parentId !== null && typeof id.parentId !== "string") {
    return false;
  }
  return true;
}

/**
 * THE EXTENSION LAW (blueprint §6‡): audit proposed grant additions against
 * the candidate's identity. Returns the first unlawful wire address, or
 * null when the extension is lawful.
 *
 * Lawful additions:
 *   - any role: addresses it ALREADY holds (idempotent re-grants)
 *   - orchestrator ONLY: `chan:family:<anyId>` (dispatch doctrine)
 *   - eyes: nothing beyond its fixed oversight write (omniscient already)
 */
export function firstUnlawfulExtension(
  identity: AgentIdentity,
  base: ChannelGrants,
  extra: { readonly read?: readonly string[]; readonly write?: readonly string[] },
): string | null {
  const held = new Set([...base.read, ...base.write]);

  const check = (wire: string): string | null => {
    const addr = parseChannel(wire);
    if (addr === null) return wire; // malformed handled elsewhere; unlawful here
    if (held.has(wire)) return null; // idempotent re-grant
    if (addr.kind === "family") {
      return identity.roles.includes("orchestrator")
        ? null
        : wire;
    }
    // public read/write grafts, foreign privates, oversight grafts:
    // none are ever lawful as NEW grants outside the law table.
    return wire;
  };

  for (const wire of extra.read ?? []) {
    const bad = check(wire);
    if (bad !== null) return bad;
  }
  for (const wire of extra.write ?? []) {
    const bad = check(wire);
    if (bad !== null) return bad;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface ComposeCharterInput {
  readonly identity: AgentIdentity;
  readonly mission: string;
  readonly doctrine: CharterDoctrine;
  readonly tierByRole?: Partial<Record<AgentRole, ModelTier>>;
  readonly budget: CharterBudget;
  readonly qualification: CharterQualification;
  /** Genesis grant extensions (audited by the EXTENSION LAW). */
  readonly grantExtensions?: {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
  };
}

export type ComposeResult =
  | { readonly ok: true; readonly charter: ParentCharter; readonly grants: ChannelGrants }
  | { readonly ok: false; readonly reason: CharterReason };

/**
 * Build an immutable charter + derived channel grants. Total: returns typed
 * failures instead of throwing. The ONLY sanctioned path from "identity"
 * to "activated-candidate-with-grants".
 */
export function composeCharter(input: ComposeCharterInput): ComposeResult {
  if (!isPlainObject(input)) return { ok: false, reason: "not_an_object" };
  if (!looksLikeIdentity(input.identity)) return { ok: false, reason: "bad_identity" };
  if (!strBounded(input.mission, GENESIS_LIMITS.missionMaxChars)) {
    return { ok: false, reason: "mission_too_long" };
  }
  const d = input.doctrine;
  if (
    !isPlainObject(d) ||
    !strBounded(d.planning, GENESIS_LIMITS.doctrineFieldMaxChars) ||
    !strBounded(d.delegation, GENESIS_LIMITS.doctrineFieldMaxChars)
  ) {
    return { ok: false, reason: "doctrine_too_long" };
  }
  if (
    !Array.isArray(d.stopConditions) ||
    d.stopConditions.length > GENESIS_LIMITS.stopConditionsMaxItems ||
    !d.stopConditions.every((s) => strBounded(s, GENESIS_LIMITS.stopConditionMaxChars))
  ) {
    return { ok: false, reason: "too_many_stop_conditions" };
  }

  for (const tier of Object.values(input.tierByRole ?? {})) {
    if (tier !== undefined && !(MODEL_TIERS as readonly string[]).includes(tier)) {
      return { ok: false, reason: "bad_tier" };
    }
  }

  const b = input.budget;
  if (
    !isPlainObject(b) ||
    typeof b.maxToolCalls !== "number" ||
    b.maxToolCalls < GENESIS_LIMITS.maxToolCallsMin ||
    typeof b.maxTokenEstimate !== "number" ||
    b.maxTokenEstimate < 0
  ) {
    return { ok: false, reason: "bad_budget" };
  }

  const q = input.qualification;
  if (
    !isPlainObject(q) ||
    !Array.isArray(q.requiredProbes) ||
    !q.requiredProbes.every((p) => (KNOWN_PROBES as readonly string[]).includes(p))
  ) {
    return { ok: false, reason: "bad_probe_kind" };
  }
  if (
    q.minScore !== undefined &&
    (typeof q.minScore !== "number" || q.minScore < 0 || q.minScore > 1)
  ) {
    return { ok: false, reason: "bad_min_score" };
  }

  // Grants: law-table defaults, audited additive extensions only.
  const base = defaultGrantsFor(input.identity);
  let grants = base;
  const ext = input.grantExtensions ?? {};
  const unlawful = firstUnlawfulExtension(input.identity, base, ext);
  if (unlawful !== null) return { ok: false, reason: "unlawful_grants" };
  try {
    grants = extendGrants(base, ext);
  } catch {
    return { ok: false, reason: "bad_channel_grant" };
  }

  const charter: ParentCharter = {
    identity: input.identity,
    mission: input.mission,
    doctrine: {
      planning: d.planning,
      delegation: d.delegation,
      stopConditions: [...d.stopConditions],
    },
    tierByRole: { ...(input.tierByRole ?? {}) },
    budget: { maxToolCalls: b.maxToolCalls, maxTokenEstimate: b.maxTokenEstimate },
    qualification: {
      requiredProbes: [...q.requiredProbes],
      ...(q.minScore !== undefined ? { minScore: q.minScore } : {}),
    },
  };

  return { ok: true, charter, grants };
}
