/**
 * ORCHESTRA O1 — Qualification Gauntlet (Genesis Pipeline, step 3)
 * ---------------------------------------------------------------
 * BEFORE a parent may activate, it must pass an adversarial battery
 * generated against its own mission (blueprint §4.3). This module is the
 * RUNNER and the executable probes; model-judged probe implementations
 * (planning coverage, delegation quality, failure behavior) land in O2+
 * behind the same `Probe` interface — the gauntlet never changes shape.
 *
 * Executable TODAY (deterministic, no model):
 *   - `channelLawProbe` — fires the standard illegal-route battery through
 *     the O0 router; every attempt MUST be structurally rejected, and all
 *      lawful routes MUST deliver. Also audits raw grants against the
 *     EXTENSION LAW. A genesis mistake fails here before it can ever run.
 *
 * Contract:
 *   - PURE: probes receive everything they need; no clock/random/I/O.
 *   - Deterministic verdict math: pass ⇔ every required probe passed AND
 *     (when minScore set) mean score of required probes ≥ minScore.
 *   - `needsRevision` feeds the fail → revise → re-gauntlet loop (§4.3).
 */

import {
  formatChannel,
  parseChannel,
} from "./channels";
import {
  canRead,
  canWrite,
  type AgentIdentity,
  type ChannelGrants,
} from "./capabilities";
import { route } from "./router";
import type { MessageEnvelope } from "./router";

// ---------------------------------------------------------------------------
// Probe vocabulary
// ---------------------------------------------------------------------------

export const PROBE_KINDS = Object.freeze([
  "planning_coverage",
  "channel_law",
  "budget_discipline",
  "failure_behavior",
  "delegation_quality",
] as const);

export type ProbeKind = (typeof PROBE_KINDS)[number];

export interface Candidate {
  readonly identity: AgentIdentity;
  readonly grants: ChannelGrants;
}

export interface ProbeResult {
  readonly kind: ProbeKind;
  readonly passed: boolean;
  /** 0..1 — probes self-score; runner aggregates deterministically. */
  readonly score: number;
  /** Bounded evidence line for the log/Eyes (≤200 chars). */
  readonly evidence: string;
}

export interface Probe {
  readonly kind: ProbeKind;
  run(candidate: Candidate): ProbeResult;
}

// ---------------------------------------------------------------------------
// Channel-law battery (executable now)
// ---------------------------------------------------------------------------

const EVIDENCE_MAX = 200;

function clip(v: string): string {
  return v.length <= EVIDENCE_MAX ? v : `${v.slice(0, EVIDENCE_MAX - 1)}…`;
}

interface Attempt {
  readonly toChannel: string;
  readonly expectDeliverable: boolean;
}

/** Standard illegal/lawful route battery derived from the candidate's tree position. */
function buildBattery(identity: AgentIdentity): Attempt[] {
  const attempts: Attempt[] = [
    // Universal structural denials:
    { toChannel: "chan:oversight", expectDeliverable: false },
    { toChannel: "chan:private:zz-sibling", expectDeliverable: false },
    // Synthetic foreign family — collides with nothing real by construction.
    { toChannel: "chan:family:zz-foreign", expectDeliverable: false },
  ];

  const isOrchestrator = identity.roles.includes("orchestrator");
  if (!isOrchestrator) {
    attempts.push({ toChannel: "chan:public", expectDeliverable: false });
  }

  // Position-dependent lawful positives:
  if (identity.parentId !== null) {
    attempts.push({
      toChannel: formatChannel({ kind: "family", parentId: identity.parentId }),
      expectDeliverable: true,
    });
  }
  if (identity.roles.includes("parent")) {
    attempts.push({
      toChannel: formatChannel({ kind: "family", parentId: identity.agentId }),
      expectDeliverable: true,
    });
  }
  attempts.push({
    toChannel: formatChannel({ kind: "private", agentId: identity.agentId }),
    expectDeliverable: true,
  });

  return attempts;
}

/**
 * THE executable law probe. Fails the candidate if ANY illegal route would
 * deliver (genesis bug) or ANY lawful route would bounce (over-tightened
 * genesis). Audits raw grant strings too — unparseable grant = instant fail.
 */
export function channelLawProbe(candidate: Candidate): ProbeResult {
  const { identity, grants } = candidate;

  // Raw-grant hygiene: every stored address must parse.
  for (const wire of [...grants.read, ...grants.write]) {
    if (parseChannel(wire) === null) {
      return {
        kind: "channel_law",
        passed: false,
        score: 0,
        evidence: clip("unparseable grant address present in charter"),
      };
    }
  }

  let attempted = 0;
  const violations: string[] = [];

  for (const at of buildBattery(identity)) {
    attempted++;
    const envelope: MessageEnvelope = {
      messageId: `gauntlet-${identity.agentId}-${attempted}`,
      fromAgentId: identity.agentId,
      toChannel: at.toChannel,
      kind: "chat",
      bodyRef: "artifact://gauntlet/probe",
      epoch: 0,
    };
    const decision = route(envelope, grants);
    const delivered = decision.ok;
    if (delivered !== at.expectDeliverable) {
      violations.push(
        decision.ok ? `unlawful delivery to ${at.toChannel.slice(0, 40)}` : `lawful route bounced ${at.toChannel.slice(0, 40)}`,
      );
    }
  }

  if (violations.length > 0) {
    return {
      kind: "channel_law",
      passed: false,
      score: 0,
      evidence: clip(`${violations.length}/${attempted} violations: ${violations[0]}`),
    };
  }

  return {
    kind: "channel_law",
    passed: true,
    score: 1,
    evidence: clip(`all ${attempted} structural routes behaved per law table`),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface GauntletReport {
  readonly candidateId: string;
  /** Results in battery order — deterministic, replayable. */
  readonly results: readonly ProbeResult[];
  /** Probes that ran but were NOT in requiredProbes still count as advisory. */
  readonly passed: boolean;
  readonly meanRequiredScore: number;
  readonly failedKinds: readonly ProbeKind[];
}

/**
 * Run the full battery in order. Every probe runs even after failures —
 * the report is a complete diagnostic, not short-circuiting.
 */
export function runGauntlet(
  candidate: Candidate,
  battery: readonly Probe[],
  requiredProbes: readonly ProbeKind[],
  minScore?: number,
): GauntletReport {
  const results = battery.map((p) => p.run(candidate));

  const requiredResults = results.filter((r) => requiredProbes.includes(r.kind));
  const failedKinds = requiredResults.filter((r) => !r.passed).map((r) => r.kind);

  const mean =
    requiredResults.length === 0
      ? 0
      : requiredResults.reduce((acc, r) => acc + r.score, 0) / requiredResults.length;

  const scoreOk = minScore === undefined || mean >= minScore;

  return {
    candidateId: candidate.identity.agentId,
    results,
    passed: failedKinds.length === 0 && scoreOk,
    meanRequiredScore: mean,
    failedKinds,
  };
}

/**
 * Revision loop helper (blueprint §4.3: fail → revise charter → re-gauntlet).
 * Returns failed required kinds in battery order — the charter author's
 * work list.
 */
export function needsRevision(report: GauntletReport): readonly ProbeKind[] {
  return report.failedKinds;
}
