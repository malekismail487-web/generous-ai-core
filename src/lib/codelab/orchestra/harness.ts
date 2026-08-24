/**
 * ORCHESTRA O6 — Evidence Harness (AI Playground probe core)
 * ---------------------------------------------------------
 * The headless instrumentation that stress-tests "every minor aspect" of
 * what the orchestra builds (blueprint §10). The browser-side probe
 * RUNTIME (iframe injection, postMessage bridges, screenshotting) lands
 * with the UI phases; THIS module is the pack contract they must emit:
 *
 *   probes run ──▶ ProbeResult[] ──▶ EvidencePack (digest-signed)
 *              ├─▶ toChannelEvidence() → P0 verification channels
 *              │      (feeds aggregateVerdict AND the Delivery Gate)
 *              ├─▶ evaluateBudgets()  → perf budget annotations
 *              └─▶ packFindings()     → chan:oversight findings (O5)
 *
 * Probe vocabulary (frozen): console · network · perf · fuzz · visual ·
 * physics · a11y · api_contract.
 *
 * Channel mapping (P0 §5 alignment — O5 contract #1):
 *   console/network/perf/physics → runtime
 *   fuzz/visual/a11y             → behavioral
 *   api_contract                 → integration
 * A probe ERROR projects as channel FAIL (crashed probe = broken build).
 *
 * Contract: PURE + TOTAL. Digests are FNV-1a over canonical JSON
 * (log-integrity grade). Metrics must be finite; NaN/Infinity rejected.
 */

import { canonicalJson, fnv1a32 } from "./certificate";
import type { ChannelEvidence } from "../agent/types";
import { validateFinding, type OversightFinding } from "./eyes";

// ---------------------------------------------------------------------------
// Vocabulary & limits
// ---------------------------------------------------------------------------

export const PROBE_KINDS = Object.freeze([
  "console",
  "network",
  "perf",
  "fuzz",
  "visual",
  "physics",
  "a11y",
  "api_contract",
  "animation",
  "audio",
  "playtest",
] as const);

export type ProbeKind = (typeof PROBE_KINDS)[number];

export type ProbeStatus = "pass" | "fail" | "error" | "skipped";

export const HARNESS_LIMITS = Object.freeze({
  metricsMaxKeys: 32,
  detailsMaxLines: 64,
  detailMaxChars: 300,
  packsRetained: 32,
});

/** Frozen probe → P0 channel map (see header). */
export const PACK_CHANNEL_MAP: Readonly<Record<ProbeKind, "runtime" | "behavioral" | "integration">> =
  Object.freeze({
    console: "runtime",
    network: "runtime",
    perf: "runtime",
    physics: "runtime",
    animation: "runtime",
    audio: "runtime",
    fuzz: "behavioral",
    visual: "behavioral",
    a11y: "behavioral",
    playtest: "behavioral",
    api_contract: "integration",
  });

// ---------------------------------------------------------------------------
// Pack model
// ---------------------------------------------------------------------------

export interface ProbeResult {
  readonly probe: ProbeKind;
  readonly status: ProbeStatus;
  /** Finite numeric measurements only (fps, heapMb, errors, …). */
  readonly metrics: Readonly<Record<string, number>>;
  /** Bounded detail lines; fuzz repro paths land here by construction. */
  readonly details: readonly string[];
}

export interface EvidencePack {
  readonly packId: string;
  readonly familyId: string;
  readonly epoch: number;
  /** Artifact reference to the exact build under test. */
  readonly buildRef: string;
  readonly results: readonly ProbeResult[];
  /** Digest over everything above — tamper-evident (verifyPack). */
  readonly digest: string;
}

type V<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: HarnessReason };

export type HarnessReason =
  | "not_an_object"
  | "bad_id"
  | "bad_build_ref"
  | "bad_epoch"
  | "unknown_probe"
  | "bad_status"
  | "bad_metrics"
  | "too_many_metrics"
  | "bad_details"
  | "duplicate_probe";

function isIdLike(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 && !/\s/.test(v);
}

function isValidBuildRef(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 512) return false;
  return /^artifact:\/\/[^\s]+$/.test(v) || /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v);
}

function validateResult(raw: unknown): V<ProbeResult> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  if (typeof o.probe !== "string" || !(PROBE_KINDS as readonly string[]).includes(o.probe)) {
    return { ok: false, reason: "unknown_probe" };
  }
  if (
    typeof o.status !== "string" ||
    !["pass", "fail", "error", "skipped"].includes(o.status)
  ) {
    return { ok: false, reason: "bad_status" };
  }
  const m = o.metrics;
  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    return { ok: false, reason: "bad_metrics" };
  }
  const keys = Object.keys(m as Record<string, unknown>);
  if (keys.length > HARNESS_LIMITS.metricsMaxKeys) return { ok: false, reason: "too_many_metrics" };
  for (const k of keys) {
    const val = (m as Record<string, unknown>)[k];
    if (typeof val !== "number" || !Number.isFinite(val)) return { ok: false, reason: "bad_metrics" };
  }
  const d = o.details ?? [];
  if (!Array.isArray(d) || d.length > HARNESS_LIMITS.detailsMaxLines) {
    return { ok: false, reason: "bad_details" };
  }
  for (const line of d) {
    if (typeof line !== "string" || line.length > HARNESS_LIMITS.detailMaxChars) {
      return { ok: false, reason: "bad_details" };
    }
  }
  return {
    ok: true,
    value: {
      probe: o.probe as ProbeKind,
      status: o.status as ProbeStatus,
      metrics: m as Readonly<Record<string, number>>,
      details: d as readonly string[],
    },
  };
}

/** Digest over the unsigned pack content. Deterministic across replays. */
export function packDigest(p: Omit<EvidencePack, "digest">): string {
  return fnv1a32(canonicalJson(p));
}

/** Validate + sign an incoming pack. Total. */
export function buildPack(raw: unknown): V<EvidencePack> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not_an_object" };
  const o = raw as Record<string, unknown>;
  for (const k of ["packId", "familyId"]) {
    if (!isIdLike(o[k])) return { ok: false, reason: "bad_id" };
  }
  if (!isValidBuildRef(o.buildRef)) return { ok: false, reason: "bad_build_ref" };
  if (typeof o.epoch !== "number" || !Number.isInteger(o.epoch) || o.epoch < 0) {
    return { ok: false, reason: "bad_epoch" };
  }
  if (!Array.isArray(o.results) || o.results.length === 0 || o.results.length > PROBE_KINDS.length) {
    return { ok: false, reason: "unknown_probe" };
  }
  const results: ProbeResult[] = [];
  const seen = new Set<string>();
  for (const r of o.results) {
    const v = validateResult(r);
    if (!v.ok) return v;
    if (seen.has(v.value.probe)) return { ok: false, reason: "duplicate_probe" };
    seen.add(v.value.probe);
    results.push(v.value);
  }
  const unsigned = {
    packId: o.packId as string,
    familyId: o.familyId as string,
    epoch: o.epoch as number,
    buildRef: o.buildRef as string,
    results,
  };
  return { ok: true, value: { ...unsigned, digest: packDigest(unsigned) } };
}

/** Recompute-and-compare tamper check (certificate parity). */
export function verifyPack(pack: EvidencePack): boolean {
  const { digest, ...rest } = pack;
  return packDigest(rest) === digest;
}

// ---------------------------------------------------------------------------
// Budget evaluation
// ---------------------------------------------------------------------------

export interface PerfBudgets {
  /** Minimum acceptable FPS sample. */
  readonly minFps?: number;
  /** Maximum heap growth across the session, MB. */
  readonly maxHeapGrowthMb?: number;
  /** Maximum long-task count. */
  readonly maxLongTasks?: number;
  /** Maximum console error count. */
  readonly maxConsoleErrors?: number;
  /** Maximum failed network requests. */
  readonly maxFailedFetches?: number;
}

export type BudgetOutcome =
  | { readonly metric: string; readonly ok: true; readonly measured: number }
  | { readonly metric: string; readonly ok: false; readonly measured: number | null; readonly why: "metric_missing" | "over_budget" };

/**
 * Evaluate declared budgets against pack metrics. A declared budget whose
 * metric is MISSING from the pack FAILS (absence of measurement ≠ success)
 * — same honesty law as Eyes' drift handling.
 */
export function evaluateBudgets(
  pack: EvidencePack,
  budgets: PerfBudgets,
): readonly BudgetOutcome[] {
  const merged: Record<string, number> = {};
  for (const r of pack.results) {
    for (const [k, v] of Object.entries(r.metrics)) merged[k] = v;
  }

  const out: BudgetOutcome[] = [];
  const check = (
    metric: string,
    limit: number | undefined,
    passes: (measured: number) => boolean,
  ): void => {
    if (limit === undefined) return;
    const measured = merged[metric];
    if (typeof measured !== "number") {
      out.push({ metric, ok: false, measured: null, why: "metric_missing" });
      return;
    }
    out.push(passes(measured)
      ? { metric, ok: true, measured }
      : { metric, ok: false, measured, why: "over_budget" });
  };

  check("fps", budgets.minFps, (m) => m >= budgets.minFps!);
  check("heapGrowthMb", budgets.maxHeapGrowthMb, (m) => m <= budgets.maxHeapGrowthMb!);
  check("longTasks", budgets.maxLongTasks, (m) => m <= budgets.maxLongTasks!);
  check("consoleErrors", budgets.maxConsoleErrors, (m) => m <= budgets.maxConsoleErrors!);
  check("failedFetches", budgets.maxFailedFetches, (m) => m <= budgets.maxFailedFetches!);
  return out;
}

// ---------------------------------------------------------------------------
// Projection into P0 verification channels (single source of truth)
// ---------------------------------------------------------------------------

const STATUS_RANK: Readonly<Record<ProbeStatus, number>> = Object.freeze({
  pass: 0,
  skipped: 1,
  fail: 2,
  error: 3,
});

/**
 * Aggregate pack results into ChannelEvidence per the frozen channel map.
 *
 * Semantics (pinned):
 *   - A channel RAN if ≥1 probe reported pass/fail/error; it reports
 *     `skipped` ONLY when every contributing probe was skipped.
 *   - Worst outcome wins among ran probes, and a probe ERROR projects as
 *     channel FAIL: a crashed probe is demonstrable build breakage, not
 *     mere inconclusiveness (delivery-gate posture).
 */
export function toChannelEvidence(pack: EvidencePack): readonly ChannelEvidence[] {
  const byChannel = new Map<string, { ran: boolean; worst: ProbeStatus | null; count: number }>();

  for (const r of pack.results) {
    const ch = PACK_CHANNEL_MAP[r.probe];
    let cur = byChannel.get(ch);
    if (!cur) {
      cur = { ran: false, worst: null, count: 0 };
      byChannel.set(ch, cur);
    }
    cur.count++;
    if (r.status === "skipped") continue;
    cur.ran = true;
    if (cur.worst === null || STATUS_RANK[r.status] > STATUS_RANK[cur.worst]) {
      cur.worst = r.status;
    }
  }

  const evidence: ChannelEvidence[] = [];
  for (const [channel, agg] of byChannel) {
    let status: ChannelEvidence["status"];
    if (!agg.ran || agg.worst === null) {
      status = "skipped";
    } else if (agg.worst === "error" || agg.worst === "fail") {
      status = "fail"; // crashed probe ≡ failed check (delivery posture)
    } else {
      status = "pass";
    }
    evidence.push({
      channel: channel as ChannelEvidence["channel"],
      status,
      detail: `${agg.count} probe(s)`,
    });
  }
  return evidence;
}

// ---------------------------------------------------------------------------
// Finding derivation (chan:oversight feed — O5 contract #2)
// ---------------------------------------------------------------------------

const SEVERITY_BY_STATUS: Readonly<Record<ProbeStatus, OversightFinding["severity"] | null>> =
  Object.freeze({
    pass: null,
    skipped: null,
    fail: "concern",
    error: "urgent",
  });

/**
 * Failed/errored probes become oversight findings with auto-cited artifact
 * refs; passes stay silent (noise discipline).
 */
export function packFindings(pack: EvidencePack): readonly OversightFinding[] {
  const findings: OversightFinding[] = [];
  for (const r of pack.results) {
    const severity = SEVERITY_BY_STATUS[r.status];
    if (severity === null) continue;
    const candidate: OversightFinding = {
      findingId: `harness-${pack.packId}-${r.probe}`,
      observerId: "harness-auto",
      familyId: pack.familyId,
      dimension: "anomaly",
      severity,
      claim: `probe ${r.probe} ${r.status}`,
      evidenceRefs: [`artifact://pack/${pack.packId}/${r.probe}`],
    };
    const checked = validateFinding(candidate);
    if (checked.ok) findings.push(checked.value); // refs valid BY CONSTRUCTION
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface PackRecordedEvent {
  readonly kind: "pack_recorded";
  readonly pack: EvidencePack;
}

export interface HarnessLedgerState {
  readonly version: number;
  readonly rejectedCount: number;
  /** Newest-last insertion order; capped at HARNESS_LIMITS.packsRetained. */
  readonly packs: readonly EvidencePack[];
}

export function initialHarness(): HarnessLedgerState {
  return { version: 0, rejectedCount: 0, packs: [] };
}

export function reduceHarness(state: HarnessLedgerState, event: PackRecordedEvent): HarnessLedgerState {
  if (event.kind !== "pack_recorded") {
    return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
  }
  if (!verifyPack(event.pack)) return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 };
  if (state.packs.some((p) => p.packId === event.pack.packId)) {
    return { ...state, version: state.version + 1, rejectedCount: state.rejectedCount + 1 }; // idempotent-ish dedupe
  }
  const packs =
    state.packs.length >= HARNESS_LIMITS.packsRetained
      ? [...state.packs.slice(1), event.pack]
      : [...state.packs, event.pack];
  return { ...state, version: state.version + 1, packs };
}

export function foldHarness(events: readonly PackRecordedEvent[]): HarnessLedgerState {
  let s = initialHarness();
  for (const e of events) s = reduceHarness(s, e);
  return s;
}

/** Most recent pack for a family, or null — never guesses. */
export function latestForFamily(state: HarnessLedgerState, familyId: string): EvidencePack | null {
  for (let i = state.packs.length - 1; i >= 0; i--) {
    if (state.packs[i].familyId === familyId) return state.packs[i];
  }
  return null;
}
