/**
 * ORCHESTRA O3 — MiniAgent Policy Pipeline
 * ---------------------------------------
 * The up-chain governance flow from blueprint §7, as pure contracts:
 *
 *   mini finding ──▶ MiniProposal (citations MANDATORY)
 *               ──▶ ParentReport  (parent's own assessment)
 *               ──▶ ADP (O4)      ──▶ PolicyDecision (scope-classified)
 *               ──▶ broadcastPolicy() routes verdicts through the O0
 *                   fabric with FULL attempt auditing
 *
 * Scope → channel routing law (blueprint §7):
 *   reject          → no broadcast; decision is recorded only
 *   private_worker  → creator's FAMILY channel (artifact-scoped to the
 *                     worker; workers read their family channel — private
 *                     channels are memory, not delivery targets)
 *   family          → that family's channel
 *   group_public    → one envelope per family in the target group
 *   global_rule     → chan:public (governance write; orchestrator default)
 *
 * The DoctrineBook persists accepted rules event-sourced; global rules are
 * what Genesis (O1) injects into every future charter.
 *
 * Contract: PURE + TOTAL. Validators use fixed tokens, never echo content.
 * Message ids derive deterministically (`${decisionId}:${n}`) so replays
 * produce identical audit trails.
 */

import { attemptRecord, route, type MessageEnvelope, type RouteAttemptRecord } from "./router";
import type { ChannelGrants } from "./capabilities";
import { canonicalJson, fnv1a32 } from "./certificate";

// ---------------------------------------------------------------------------
// Limits (transport sanity — never swarm-capacity caps; owner law §0a.1)
// ---------------------------------------------------------------------------

export const POLICY_LIMITS = Object.freeze({
  findingMaxChars: 2000,
  citationsMaxItems: 8,
  citationSourceMaxChars: 512,
  citationClaimMaxChars: 300,
  assessmentMaxChars: 1000,
  doctrineMaxChars: 2000,
  /** Max families in ONE group-public fan-out (transport frame bound). */
  fanoutMaxFamilies: 256,
  /** Global doctrine rules retained in the book (memory bound). */
  globalDoctrineRetained: 64,
});

// ---------------------------------------------------------------------------
// Citations & proposals
// ---------------------------------------------------------------------------

export interface Citation {
  readonly source: string; // http(s) URL or artifact:// ref
  readonly claim: string;
}

export interface MiniProposal {
  readonly proposalId: string;
  readonly miniId: string;
  readonly workerId: string;
  readonly familyId: string;
  readonly finding: string;
  /** MANDATORY — uncited findings are inadmissible (blueprint §7/§9). */
  readonly citations: readonly Citation[];
  readonly confidence: number; // 0..1
}

export type PolicyReason =
  | "not_an_object"
  | "bad_id"
  | "bad_finding"
  | "missing_citations"
  | "bad_citation"
  | "bad_confidence"
  | "bad_assessment"
  | "bad_endorses"
  | "bad_scope_fields"
  | "bad_doctrine";

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

/** http(s) URL or internal artifact reference. */
export function isValidCitationSource(v: string): boolean {
  if (v.length === 0 || v.length > POLICY_LIMITS.citationSourceMaxChars) return false;
  if (/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v)) return true;
  return /^artifact:\/\/[^\s]+$/.test(v);
}

type V<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: PolicyReason };

export function validateProposal(raw: unknown): V<MiniProposal> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  for (const k of ["proposalId", "miniId", "workerId", "familyId"]) {
    if (!isIdLike(o[k])) return { ok: false, reason: "bad_id" };
  }
  if (typeof o.finding !== "string" || o.finding.length === 0 || o.finding.length > POLICY_LIMITS.findingMaxChars) {
    return { ok: false, reason: "bad_finding" };
  }
  const cites = o.citations;
  if (!Array.isArray(cites) || cites.length === 0) return { ok: false, reason: "missing_citations" };
  if (cites.length > POLICY_LIMITS.citationsMaxItems) return { ok: false, reason: "bad_citation" };
  for (const c of cites) {
    if (typeof c !== "object" || c === null) return { ok: false, reason: "bad_citation" };
    const cc = c as Record<string, unknown>;
    if (typeof cc.source !== "string" || !isValidCitationSource(cc.source)) {
      return { ok: false, reason: "bad_citation" };
    }
    if (typeof cc.claim !== "string" || cc.claim.length === 0 || cc.claim.length > POLICY_LIMITS.citationClaimMaxChars) {
      return { ok: false, reason: "bad_citation" };
    }
  }
  if (typeof o.confidence !== "number" || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) {
    return { ok: false, reason: "bad_confidence" };
  }
  return {
    ok: true,
    value: {
      proposalId: o.proposalId as string,
      miniId: o.miniId as string,
      workerId: o.workerId as string,
      familyId: o.familyId as string,
      finding: o.finding,
      citations: cites as readonly Citation[],
      confidence: o.confidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Parent report
// ---------------------------------------------------------------------------

export interface ParentReport {
  readonly reportId: string;
  readonly proposalId: string;
  readonly parentAgentId: string;
  readonly familyId: string;
  readonly assessment: string;
  readonly endorses: boolean;
}

export function validateParentReport(raw: unknown): V<ParentReport> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  for (const k of ["reportId", "proposalId", "parentAgentId", "familyId"]) {
    if (!isIdLike(o[k])) return { ok: false, reason: "bad_id" };
  }
  if (typeof o.assessment !== "string" || o.assessment.length === 0 || o.assessment.length > POLICY_LIMITS.assessmentMaxChars) {
    return { ok: false, reason: "bad_assessment" };
  }
  if (typeof o.endorses !== "boolean") return { ok: false, reason: "bad_endorses" };
  return {
    ok: true,
    value: {
      reportId: o.reportId as string,
      proposalId: o.proposalId as string,
      parentAgentId: o.parentAgentId as string,
      familyId: o.familyId as string,
      assessment: o.assessment,
      endorses: o.endorses,
    },
  };
}

// ---------------------------------------------------------------------------
// Policy decisions
// ---------------------------------------------------------------------------

export const POLICY_SCOPES = Object.freeze([
  "reject",
  "private_worker",
  "family",
  "group_public",
  "global_rule",
] as const);

export type PolicyScope = (typeof POLICY_SCOPES)[number];

export interface PolicyDecision {
  readonly decisionId: string;
  readonly proposalId: string;
  readonly scope: PolicyScope;
  /** Required when scope ∈ {private_worker, family}: the target family. */
  readonly targetFamilyId?: string;
  /** Required when scope = private_worker: the worker the rule applies to. */
  readonly targetWorkerId?: string;
  /** Required when scope = group_public: ≥1 family in the group. */
  readonly targetFamilies?: readonly string[];
  /** Required when scope ≠ reject: the rule text itself. */
  readonly doctrine?: string;
  readonly decidedBy: string; // orchestrator agent id
}

/**
 * Deterministic digest binding a decision to its exact content — used by
 * the DoctrineBook and audit tooling.
 */
export function decisionDigest(d: PolicyDecision): string {
  return fnv1a32(canonicalJson(d));
}

export function validateDecision(raw: unknown): V<PolicyDecision> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  if (!isIdLike(o.decisionId) || !isIdLike(o.proposalId) || !isIdLike(o.decidedBy)) {
    return { ok: false, reason: "bad_id" };
  }
  if (typeof o.scope !== "string" || !(POLICY_SCOPES as readonly string[]).includes(o.scope)) {
    return { ok: false, reason: "bad_scope_fields" };
  }
  const scope = o.scope as PolicyScope;

  if (scope === "reject") {
    // No further fields required.
    return {
      ok: true,
      value: { decisionId: o.decisionId as string, proposalId: o.proposalId as string, scope, decidedBy: o.decidedBy as string },
    };
  }

  if (typeof o.doctrine !== "string" || o.doctrine.length === 0 || o.doctrine.length > POLICY_LIMITS.doctrineMaxChars) {
    return { ok: false, reason: "bad_doctrine" };
  }

  const needsFamily = scope === "private_worker" || scope === "family";
  if (needsFamily && !(isIdLike(o.targetFamilyId))) return { ok: false, reason: "bad_scope_fields" };
  if (scope === "private_worker" && !isIdLike(o.targetWorkerId)) return { ok: false, reason: "bad_scope_fields" };

  let targetFamilies: readonly string[] | undefined;
  if (scope === "group_public") {
    if (!Array.isArray(o.targetFamilies) || o.targetFamilies.length === 0 ||
        o.targetFamilies.length > POLICY_LIMITS.fanoutMaxFamilies ||
        !o.targetFamilies.every((f) => isIdLike(f))) {
      return { ok: false, reason: "bad_scope_fields" };
    }
    targetFamilies = o.targetFamilies as string[];
  }

  return {
    ok: true,
    value: {
      decisionId: o.decisionId as string,
      proposalId: o.proposalId as string,
      scope,
      decidedBy: o.decidedBy as string,
      ...(o.targetFamilyId !== undefined ? { targetFamilyId: o.targetFamilyId as string } : {}),
      ...(o.targetWorkerId !== undefined ? { targetWorkerId: o.targetWorkerId as string } : {}),
      ...(targetFamilies !== undefined ? { targetFamilies } : {}),
      doctrine: o.doctrine as string,
    },
  };
}

// ---------------------------------------------------------------------------
// Broadcast routing
// ---------------------------------------------------------------------------

export interface BroadcastContext {
  readonly grants: ChannelGrants; // orchestrator's post-genesis grants
  readonly orchestratorEpoch: number;
  /** Current per-family epochs from the swarm ledger (stale-proofing). */
  readonly familyEpochs: Readonly<Record<string, number>>;
}

export interface BroadcastResult {
  readonly envelopes: readonly MessageEnvelope[];
  readonly attempts: readonly RouteAttemptRecord[];
  readonly deliveredCount: number;
}

interface Target {
  readonly channel: string;
  readonly epoch: number;
}

function targetsFor(d: PolicyDecision, ctx: BroadcastContext): readonly Target[] {
  switch (d.scope) {
    case "reject":
      return [];
    case "global_rule":
      return [{ channel: "chan:public", epoch: ctx.orchestratorEpoch }];
    case "private_worker":
    case "family":
      return [{
        channel: `chan:family:${d.targetFamilyId as string}`,
        epoch: ctx.familyEpochs[d.targetFamilyId as string] ?? ctx.orchestratorEpoch,
      }];
    case "group_public":
      return (d.targetFamilies as readonly string[]).map((f) => ({
        channel: `chan:family:${f}`,
        epoch: ctx.familyEpochs[f] ?? ctx.orchestratorEpoch,
      }));
  }
}

/**
 * Route a policy verdict through the O0 fabric. Every envelope gets an
 * attempt record — delivered or not — so Eyes see the full trail and a
 * missing genesis dispatch grant surfaces as a typed rejection, never a
 * silent drop.
 */
export function broadcastPolicy(d: PolicyDecision, ctx: BroadcastContext): BroadcastResult {
  const targets = targetsFor(d, ctx);
  const envelopes: MessageEnvelope[] = [];
  const attempts: RouteAttemptRecord[] = [];
  let delivered = 0;

  targets.forEach((t, i) => {
    const env: MessageEnvelope = {
      messageId: `${d.decisionId}:${i}`,
      fromAgentId: d.decidedBy,
      toChannel: t.channel,
      kind: "policy",
      bodyRef: `artifact://policy/${d.decisionId}`,
      epoch: t.epoch,
    };
    const decision = route(env, ctx.grants);
    envelopes.push(env);
    attempts.push(attemptRecord(env, decision));
    if (decision.ok) delivered++;
  });

  return { envelopes, attempts, deliveredCount: delivered };
}

// ---------------------------------------------------------------------------
// Doctrine book
// ---------------------------------------------------------------------------

export interface DoctrinePublishedEvent {
  readonly kind: "doctrine_published";
  readonly ruleId: string;
  readonly decisionId: string;
  readonly scope: Exclude<PolicyScope, "reject">;
  readonly text: string;
  readonly familyId?: string;
}

export interface DoctrineBookState {
  readonly version: number;
  readonly rejectedCount: number;
  /** Newest LAST; capped at POLICY_LIMITS.globalDoctrineRetained. */
  readonly globalRules: readonly DoctrinePublishedEvent[];
  /** Family-scoped rules keyed by familyId (insertion-ordered). */
  readonly familyRules: Readonly<Record<string, readonly DoctrinePublishedEvent[]>>;
}

export function initialDoctrineBook(): DoctrineBookState {
  return { version: 0, rejectedCount: 0, globalRules: [], familyRules: {} };
}

export function reduceDoctrine(
  state: DoctrineBookState,
  event: DoctrinePublishedEvent,
): DoctrineBookState {
  const fail = (): DoctrineBookState => ({ ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 });

  if (!isIdLike(event.ruleId) || !isIdLike(event.decisionId)) return fail();
  if (event.text.length === 0 || event.text.length > POLICY_LIMITS.doctrineMaxChars) return fail();

  if (event.scope === "global_rule") {
    const next =
      state.globalRules.length >= POLICY_LIMITS.globalDoctrineRetained
        ? [...state.globalRules.slice(1), event]
        : [...state.globalRules, event];
    return { ...state, version: state.version + 1, globalRules: next };
  }

  if (event.scope === "family" || event.scope === "private_worker") {
    if (!isIdLike(event.familyId)) return fail();
    const list = state.familyRules[event.familyId] ?? [];
    const next =
      list.length >= POLICY_LIMITS.globalDoctrineRetained
        ? [...list.slice(1), event]
        : [...list, event];
    return {
      ...state,
      version: state.version + 1,
      familyRules: { ...state.familyRules, [event.familyId]: next },
    };
  }

  if (event.scope === "group_public") {
    if (!Array.isArray(event.familyId)) return fail(); // group publishes fan out per-family upstream
    return fail();
  }

  return fail();
}

export function foldDoctrine(events: readonly DoctrinePublishedEvent[]): DoctrineBookState {
  let s = initialDoctrineBook();
  for (const e of events) s = reduceDoctrine(s, e);
  return s;
}
