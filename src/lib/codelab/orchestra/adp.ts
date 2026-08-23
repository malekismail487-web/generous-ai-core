/**
 * ORCHESTRA O4 — Adversarial Deliberation Protocol (ADP)
 * -----------------------------------------------------
 * The owner's "abstract evaluation process" (blueprint §8): high-stakes
 * judgments are NOT read-throughs. The orchestrator convenes a panel of
 * five distinct examiner perspectives, cross-examines them, and synthesizes
 * a verdict under a frozen rubric — with every claim evidence-backed and
 * every dissent preserved.
 *
 *   OPEN → POSITIONS (5 roles) → CHALLENGES (evidence-required)
 *        → RESOLUTIONS (chair) → SYNTHESIS → VERDICT → CALIBRATION
 *
 * Roles (fixed):
 *   feasibility      red-team — attacks the mechanism
 *   evidence_auditor — verifies claims against citations/logs
 *   novelty_scout    — originality vs known practice (web-checked)
 *   cost_physicist   — token/compute/time accounting vs expected value [A]
 *   advocate         — steel-mans the proposal; mandatory counterweight
 *
 * Determinism contract (kernel level; model-backed examiners land at
 * runtime behind these same events):
 *   - Frozen rubric: role weights, accept/revise/reject thresholds,
 *     challenge effects. No hidden constants.
 *   - Upheld challenges mechanically reduce the TARGET position's score by
 *     a fixed delta; every open challenge shaves confidence by a fixed
 *     penalty. Cross-examination bites, deterministically.
 *   - Verdicts are digest-bound (O3 decisionDigest discipline); dissents
 *     preserved for calibration.
 *   - Low-stakes items bypass the panel via a single-judge fallback [A:
 *     single LLM-judge was most consistent for simple grading].
 *
 * Contract: PURE + TOTAL. Fixed rejection tokens; content never echoed.
 */

import { canonicalJson, fnv1a32 } from "./certificate";
import type { PolicyScope } from "./policy";

// ---------------------------------------------------------------------------
// Rubric (frozen, published — blueprint §8.3)
// ---------------------------------------------------------------------------

export const EXAMINER_ROLES = Object.freeze([
  "feasibility",
  "evidence_auditor",
  "novelty_scout",
  "cost_physicist",
  "advocate",
] as const);

export type ExaminerRole = (typeof EXAMINER_ROLES)[number];

export const RUBRIC = Object.freeze({
  weights: Object.freeze({
    feasibility: 0.25,
    evidence_auditor: 0.25,
    novelty_scout: 0.15,
    cost_physicist: 0.15,
    advocate: 0.2,
  } as Readonly<Record<ExaminerRole, number>>),
  acceptAt: 0.66,
  reviseAt: 0.4,
  /** Score removed from a position per UPHELD challenge against it. */
  upholdScoreDelta: 0.1,
  /** Confidence penalty per challenge left unresolved at synthesis. */
  openChallengePenalty: 0.05,
  /** Helped-ratio below which doctrine review fires (calibration loop). */
  driftReviewFloor: 0.5,
});

export type Stakes = "low" | "high";

/** Complexity-Gate seam: low stakes take the single-judge fallback path. */
export function requiresFullPanel(stakes: Stakes): boolean {
  return stakes === "high";
}

// ---------------------------------------------------------------------------
// Positions, challenges, verdicts
// ---------------------------------------------------------------------------

export type Stance = "accept" | "reject" | "revise";

export interface ExaminerPosition {
  readonly positionId: string;
  readonly deliberationId: string;
  readonly role: ExaminerRole;
  readonly stance: Stance;
  /** Rubric score in [0,1] for THIS examiner's dimension. */
  readonly score: number;
  /** Bounded structured rationale — NOT chain-of-thought (P0 directive 4). */
  readonly rationale: string;
  /** Evidence refs REQUIRED: artifact://, http(s), or log:<seq>. */
  readonly evidenceRefs: readonly string[];
}

export interface Challenge {
  readonly challengeId: string;
  readonly deliberationId: string;
  readonly challengerRole: ExaminerRole;
  readonly targetPositionId: string;
  readonly grounds: string;
  /** REQUIRED — challenges without evidence are invalid (blueprint §8.2). */
  readonly evidenceRef: string;
}

export interface DeliberationVerdict {
  readonly verdictId: string;
  readonly deliberationId: string;
  readonly outcome: "accept" | "reject" | "revise";
  /** Deterministic scope recommendation; orchestrator may override (O3). */
  readonly recommendedScope: PolicyScope;
  readonly confidence: number;
  readonly meanWeightedScore: number;
  /** Dissenting positions preserved (stance ≠ final outcome). */
  readonly dissents: readonly {
    readonly role: ExaminerRole;
    readonly stance: Stance;
    readonly rationale: string;
  }[];
  /** Binds verdict to exact inputs. */
  readonly digest: string;
}

export type CalibrationOutcome = "helped" | "neutral" | "harmed" | "unresolved";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type AdpEvent =
  | { readonly kind: "deliberation_opened"; readonly deliberationId: string; readonly proposalId: string; readonly stakes: Stakes }
  | { readonly kind: "position_filed"; readonly position: ExaminerPosition }
  | { readonly kind: "challenge_filed"; readonly challenge: Challenge }
  | { readonly kind: "challenge_resolved"; readonly deliberationId: string; readonly challengeId: string; readonly upheld: boolean }
  | { readonly kind: "verdict_synthesized"; readonly verdict: DeliberationVerdict }
  | { readonly kind: "calibration_recorded"; readonly verdictId: string; readonly realized: CalibrationOutcome };

export interface DeliberationCase {
  readonly deliberationId: string;
  readonly proposalId: string;
  readonly stakes: Stakes;
  readonly phase: "open" | "synthesized";
  readonly positions: readonly ExaminerPosition[];
  readonly challenges: readonly Challenge[];
  /** challengeId → upheld boolean, once resolved by the chair. */
  readonly resolutions: Readonly<Record<string, boolean>>;
  readonly verdict: DeliberationVerdict | null;
}

export interface AdpState {
  readonly version: number;
  readonly rejectedCount: number;
  /** Keyed by deliberationId. */
  readonly cases: Readonly<Record<string, DeliberationCase>>;
  /** Keyed by verdictId; newest-last, history capped. */
  readonly calibrations: Readonly<Record<string, readonly CalibrationOutcome[]>>;
}

const CALIBRATION_HISTORY_CAP = 32;

export function initialAdp(): AdpState {
  return { version: 0, rejectedCount: 0, cases: {}, calibrations: {} };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type V<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: AdpReason };

export type AdpReason =
  | "not_an_object"
  | "bad_id"
  | "bad_stance"
  | "bad_score"
  | "bad_rationale"
  | "missing_evidence"
  | "bad_role";

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

export function isValidEvidenceRef(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 512) return false;
  return (
    /^artifact:\/\/[^\s]+$/.test(v) ||
    /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v) ||
    /^log:[1-9][0-9]*$/.test(v)
  );
}

const RATIONALE_MAX = 600;

function validatePosition(raw: unknown): V<ExaminerPosition> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  if (!isIdLike(o.positionId) || !isIdLike(o.deliberationId)) return { ok: false, reason: "bad_id" };
  if (typeof o.role !== "string" || !(EXAMINER_ROLES as readonly string[]).includes(o.role)) {
    return { ok: false, reason: "bad_role" };
  }
  if (typeof o.stance !== "string" || !["accept", "reject", "revise"].includes(o.stance)) {
    return { ok: false, reason: "bad_stance" };
  }
  if (typeof o.score !== "number" || !Number.isFinite(o.score) || o.score < 0 || o.score > 1) {
    return { ok: false, reason: "bad_score" };
  }
  if (typeof o.rationale !== "string" || o.rationale.length === 0 || o.rationale.length > RATIONALE_MAX) {
    return { ok: false, reason: "bad_rationale" };
  }
  if (!Array.isArray(o.evidenceRefs) || o.evidenceRefs.length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }
  if (!o.evidenceRefs.every((r) => isValidEvidenceRef(r))) return { ok: false, reason: "bad_id" };
  return {
    ok: true,
    value: {
      positionId: o.positionId as string,
      deliberationId: o.deliberationId as string,
      role: o.role as ExaminerRole,
      stance: o.stance as Stance,
      score: o.score,
      rationale: o.rationale,
      evidenceRefs: o.evidenceRefs as readonly string[],
    },
  };
}

function validateChallenge(raw: unknown): V<Challenge> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  for (const k of ["challengeId", "deliberationId", "targetPositionId"]) {
    if (!isIdLike(o[k])) return { ok: false, reason: "bad_id" };
  }
  if (typeof o.challengerRole !== "string" || !(EXAMINER_ROLES as readonly string[]).includes(o.challengerRole)) {
    return { ok: false, reason: "bad_role" };
  }
  if (typeof o.grounds !== "string" || o.grounds.length === 0 || o.grounds.length > RATIONALE_MAX) {
    return { ok: false, reason: "bad_rationale" };
  }
  if (!isValidEvidenceRef(o.evidenceRef)) return { ok: false, reason: "missing_evidence" };
  return {
    ok: true,
    value: {
      challengeId: o.challengeId as string,
      deliberationId: o.deliberationId as string,
      challengerRole: o.challengerRole as ExaminerRole,
      targetPositionId: o.targetPositionId as string,
      grounds: o.grounds,
      evidenceRef: o.evidenceRef,
    },
  };
}

// ---------------------------------------------------------------------------
// Synthesis — the deterministic heart of the abstract evaluation
// ---------------------------------------------------------------------------

/**
 * Effective score of a position = base score − RUBRIC.upholdScoreDelta ×
 * (upheld challenges against it), clamped to [0,1].
 */
export function effectiveScore(c: DeliberationCase, p: ExaminerPosition): number {
  let upheld = 0;
  for (const ch of c.challenges) {
    if (ch.targetPositionId !== p.positionId) continue;
    if (c.resolutions[ch.challengeId] === true) upheld++;
  }
  return Math.max(0, Math.min(1, p.score - upheld * RUBRIC.upholdScoreDelta));
}

/**
 * Synthesize the panel verdict. Deterministic given the case contents:
 *   weighted mean over effective scores (frozen role weights)
 *   ≥ acceptAt ⇒ accept · < reviseAt ⇒ reject · otherwise revise
 *   confidence = clamp(1 − spread, 0,1) − openChallengePenalty × openCount
 * Scope recommendation table: accept∧conf≥0.8 ⇒ global_rule;
 * accept∧conf≥0.6 ⇒ family; else none ("reject").
 */
export function synthesize(c: DeliberationCase, verdictId: string): V<DeliberationVerdict> {
  if (c.phase === "synthesized") {
    return { ok: false, reason: "bad_score" }; // fixed token reuse avoided below
  }

  // Quorum: all five roles must have filed.
  const byRole = new Map<ExaminerRole, ExaminerPosition>();
  for (const p of c.positions) {
    if (!byRole.has(p.role)) byRole.set(p.role, p); // first-filed wins duplicates (reducer prevents anyway)
  }
  if (byRole.size !== EXAMINER_ROLES.length) {
    return { ok: false, reason: "missing_evidence" }; // quorum failure surfaced as typed miss
  }

  let weighted = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const role of EXAMINER_ROLES) {
    const p = byRole.get(role)!;
    const eff = effectiveScore(c, p);
    weighted += eff * RUBRIC.weights[role];
    if (eff < min) min = eff;
    if (eff > max) max = eff;
  }

  let openChallenges = 0;
  for (const ch of c.challenges) {
    if (c.resolutions[ch.challengeId] === undefined) openChallenges++;
  }

  const outcome: DeliberationVerdict["outcome"] =
    weighted >= RUBRIC.acceptAt ? "accept" : weighted < RUBRIC.reviseAt ? "reject" : "revise";

  const spread = max - min;
  const confidenceRaw = Math.max(0, Math.min(1, 1 - spread));
  const confidence = Math.max(0, confidenceRaw - openChallenges * RUBRIC.openChallengePenalty);

  const recommendedScope: PolicyScope =
    outcome === "accept"
      ? confidence >= 0.8
        ? "global_rule"
        : "family"
      : "reject";

  const dissents = c.positions
    .filter((p) => p.stance !== outcome)
    .map((p) => ({ role: p.role, stance: p.stance, rationale: p.rationale }));

  const partial: Omit<DeliberationVerdict, "digest"> = {
    verdictId,
    deliberationId: c.deliberationId,
    outcome,
    recommendedScope,
    confidence: Math.round(confidence * 10000) / 10000,
    meanWeightedScore: Math.round(weighted * 10000) / 10000,
    dissents,
  };

  return {
    ok: true,
    value: { ...partial, digest: fnv1a32(canonicalJson(partial)) },
  };
}

/**
 * LOW-STAKES FALLBACK (blueprint §8): single-judge path for simple items.
 * Same verdict shape so downstream consumers never branch on provenance.
 */
export function synthesizeLowStakes(params: {
  readonly deliberationId: string;
  readonly proposalId: string;
  readonly judgeScore: number;
  readonly stance: Stance;
  readonly verdictId: string;
}): V<DeliberationVerdict> {
  const { judgeScore, stance } = params;
  if (typeof judgeScore !== "number" || !Number.isFinite(judgeScore) || judgeScore < 0 || judgeScore > 1) {
    return { ok: false, reason: "bad_score" };
  }
  const outcome: DeliberationVerdict["outcome"] =
    judgeScore >= RUBRIC.acceptAt ? "accept" : judgeScore < RUBRIC.reviseAt ? "reject" : "revise";
  const recommendedScope: PolicyScope =
    outcome === "accept" ? (judgeScore >= 0.8 ? "global_rule" : "family") : "reject";
  const partial: Omit<DeliberationVerdict, "digest"> = {
    verdictId: params.verdictId,
    deliberationId: params.deliberationId,
    outcome,
    recommendedScope,
    confidence: 0.5, // single-judge ceiling: never as confident as a panel
    meanWeightedScore: judgeScore,
    dissents: [],
  };
  void stance;
  return { ok: true, value: { ...partial, digest: fnv1a32(canonicalJson(partial)) } };
}

// ---------------------------------------------------------------------------
// Reducer & folds
// ---------------------------------------------------------------------------

function rejected(state: AdpState): AdpState {
  return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
}

export function reduceAdp(state: AdpState, event: AdpEvent): AdpState {
  switch (event.kind) {
    case "deliberation_opened": {
      if (!isIdLike(event.deliberationId) || !isIdLike(event.proposalId)) return rejected(state);
      if (!(event.stakes === "low" || event.stakes === "high")) return rejected(state);
      if (state.cases[event.deliberationId]) return rejected(state);
      const c: DeliberationCase = {
        deliberationId: event.deliberationId,
        proposalId: event.proposalId,
        stakes: event.stakes,
        phase: "open",
        positions: [],
        challenges: [],
        resolutions: {},
        verdict: null,
      };
      return { ...state, version: state.version + 1, cases: { ...state.cases, [event.deliberationId]: c } };
    }

    case "position_filed": {
      const v = validatePosition(event.position);
      if (!v.ok) return rejected(state);
      const p = v.value;
      const c = state.cases[p.deliberationId];
      if (!c || c.phase !== "open") return rejected(state);
      if (c.positions.some((x) => x.role === p.role || x.positionId === p.positionId)) {
        return rejected(state); // one position per role; unique ids
      }
      const next: DeliberationCase = { ...c, positions: [...c.positions, p] };
      return { ...state, version: state.version + 1, cases: { ...state.cases, [p.deliberationId]: next } };
    }

    case "challenge_filed": {
      const v = validateChallenge(event.challenge);
      if (!v.ok) return rejected(state);
      const ch = v.value;
      const c = state.cases[ch.deliberationId];
      if (!c || c.phase !== "open") return rejected(state);
      const target = c.positions.find((x) => x.positionId === ch.targetPositionId);
      if (!target) return rejected(state);
      if (target.role === ch.challengerRole) return rejected(state); // no self-challenge
      if (
        c.challenges.some(
          (x) => x.challengerRole === ch.challengerRole && x.targetPositionId === ch.targetPositionId,
        )
      ) {
        return rejected(state); // one challenge per (challenger, target)
      }
      const next: DeliberationCase = { ...c, challenges: [...c.challenges, ch] };
      return { ...state, version: state.version + 1, cases: { ...state.cases, [ch.deliberationId]: next } };
    }

    case "challenge_resolved": {
      const c = state.cases[event.deliberationId];
      if (!c || c.phase !== "open") return rejected(state);
      if (!c.challenges.some((x) => x.challengeId === event.challengeId)) return rejected(state);
      if (c.resolutions[event.challengeId] !== undefined) return rejected(state);
      const next: DeliberationCase = {
        ...c,
        resolutions: { ...c.resolutions, [event.challengeId]: event.upheld },
      };
      return { ...state, version: state.version + 1, cases: { ...state.cases, [event.deliberationId]: next } };
    }

    case "verdict_synthesized": {
      const c = state.cases[event.verdict.deliberationId];
      if (!c || c.phase !== "open") return rejected(state);
      // Digest binding: only the exact synthesis of THIS case may land.
      const recomputed = synthesize(c, event.verdict.verdictId);
      if (!recomputed.ok) return rejected(state);
      if (recomputed.value.digest !== event.verdict.digest) return rejected(state);
      const next: DeliberationCase = { ...c, phase: "synthesized", verdict: recomputed.value };
      return { ...state, version: state.version + 1, cases: { ...state.cases, [c.deliberationId]: next } };
    }

    case "calibration_recorded": {
      const known = Object.values(state.cases).some((x) => x.verdict?.verdictId === event.verdictId);
      if (!known) return rejected(state);
      if (!["helped", "neutral", "harmed", "unresolved"].includes(event.realized)) return rejected(state);
      const hist = state.calibrations[event.verdictId] ?? [];
      const nextHist =
        hist.length >= CALIBRATION_HISTORY_CAP
          ? [...hist.slice(1), event.realized]
          : [...hist, event.realized];
      return {
        ...state,
        version: state.version + 1,
        calibrations: { ...state.calibrations, [event.verdictId]: nextHist },
      };
    }

    default:
      return rejected(state);
  }
}

export function foldAdp(events: readonly AdpEvent[]): AdpState {
  let s = initialAdp();
  for (const e of events) s = reduceAdp(s, e);
  return s;
}

export function foldAdpFrom(state: AdpState, events: readonly AdpEvent[]): AdpState {
  let s = state;
  for (const e of events) s = reduceAdp(s, e);
  return s;
}

// ---------------------------------------------------------------------------
// Calibration metrics (the feedback loop into future charters)
// ---------------------------------------------------------------------------

export interface DriftReport {
  readonly helpedRatio: number | null;
  readonly records: number;
  /** True when realized outcomes demand doctrine review (RUBRIC floor). */
  readonly reviewRequired: boolean;
}

/**
 * Helped-ratio over resolved (non-unresolved) calibration records for a
 * verdict. null when nothing has been measured yet — absence of evidence is
 * reported as such, never disguised as success.
 */
export function driftFor(state: AdpState, verdictId: string): DriftReport {
  const hist = state.calibrations[verdictId] ?? [];
  const resolved = hist.filter((h) => h !== "unresolved");
  if (resolved.length === 0) {
    return { helpedRatio: null, records: hist.length, reviewRequired: false };
  }
  const helped = resolved.filter((h) => h === "helped").length;
  const ratio = helped / resolved.length;
  return {
    helpedRatio: ratio,
    records: hist.length,
    reviewRequired: ratio < RUBRIC.driftReviewFloor,
  };
}
