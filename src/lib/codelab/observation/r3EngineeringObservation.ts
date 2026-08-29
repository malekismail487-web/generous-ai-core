import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import type { R3BExecutionEvidence, R3BExecutionResult } from "../executor/r3ControlledEngineeringExecution";

export const R3_C_OBSERVATION_STATUS = Object.freeze({
  chunkId: "OMEGA-R3-C-OBSERVATION-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "STRUCTURED_ENGINEERING_FAILURE_OBSERVATION",
  consumesCapability: "CONTROLLED_BUILD_TEST_EXECUTION",
  grantsExecutionAuthority: false,
  grantsEvidenceAuthority: false,
  productionEligible: false,
} as const);

export type EngineeringState = "BUILD_PASS" | "BUILD_FAIL" | "TEST_PASS" | "TEST_FAIL"
  | "TYPECHECK_PASS" | "TYPECHECK_FAIL" | "TOOL_PASS" | "TOOL_FAIL" | "TIMEOUT" | "BLOCKED"
  | "INFRASTRUCTURE_ERROR";
export type BaselineComparison = "NEW_FAILURE" | "PREEXISTING_FAILURE" | "CHANGED_FAILURE" | "RESOLVED"
  | "UNCHANGED_PASS" | "UNKNOWN";
export type CandidateAttribution = "LIKELY_CANDIDATE_ATTRIBUTABLE" | "PREEXISTING_NOT_CANDIDATE_ATTRIBUTABLE"
  | "POSSIBLY_CANDIDATE_ATTRIBUTABLE" | "RESOLUTION_LIKELY_CANDIDATE_ATTRIBUTABLE" | "NOT_APPLICABLE" | "UNKNOWN";
export type ObservationEpistemicState = "SUPPORTED" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE" | "CONFLICTED";

export interface ExpectedEngineeringCandidateBinding {
  readonly candidateCommit: string;
  readonly disposableRepositoryId: string;
  readonly applicationId: string;
  readonly proposalDigest: string;
  readonly toolId: string;
  readonly toolKind: Exclude<R3BExecutionEvidence["toolKind"], "UNKNOWN">;
  readonly toolIdentityDigest: string;
  readonly environmentIdentity: string;
}

export interface EngineeringDiagnostic {
  readonly category: "TYPECHECK" | "TEST" | "STACK" | "GENERIC";
  readonly channel: "STDOUT" | "STDERR";
  readonly file: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly code: string | null;
  readonly testName: string | null;
  readonly message: string;
}

export interface EngineeringObservationRequest {
  readonly schemaVersion: 1;
  readonly observationRequestId: string;
  readonly observerIdentity: string;
  readonly evaluatorVersion: string;
  readonly expected: ExpectedEngineeringCandidateBinding;
  readonly candidate: R3BExecutionResult;
  readonly baseline: R3BExecutionResult | null;
  readonly observedAtEpochMs: number;
}

export interface EngineeringObservation {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly evidenceClass: "E3";
  readonly state: EngineeringState;
  readonly baselineComparison: BaselineComparison;
  readonly candidateAttribution: CandidateAttribution;
  readonly attributionConfidence: number;
  readonly epistemicState: ObservationEpistemicState;
  readonly candidateCommit: string;
  readonly disposableRepositoryId: string;
  readonly applicationId: string;
  readonly proposalDigest: string;
  readonly toolId: string;
  readonly toolKind: R3BExecutionEvidence["toolKind"];
  readonly toolIdentityDigest: string;
  readonly environmentIdentity: string;
  readonly diagnostics: readonly EngineeringDiagnostic[];
  readonly candidateFailureSignature: string | null;
  readonly baselineFailureSignature: string | null;
  readonly candidateEvidenceId: string;
  readonly baselineEvidenceId: string | null;
  readonly unknowns: readonly string[];
  readonly contradictions: readonly string[];
  readonly observedAtEpochMs: number;
  readonly grantsAuthority: false;
}

export type EngineeringObservationResult = Readonly<{
  decision: "OBSERVED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  reason: string;
  observation: EngineeringObservation | null;
  grantsAuthority: false;
}>;

const MAX_DIAGNOSTICS = 64;
const MAX_MESSAGE_CHARACTERS = 1_000;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function normalizeMessage(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARACTERS);
}

function safeRelativeFile(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("\0")) return null;
  return normalized;
}

function diagnosticKey(diagnostic: EngineeringDiagnostic): string { return canonical(diagnostic); }

function parseChannel(value: string, channel: EngineeringDiagnostic["channel"]): EngineeringDiagnostic[] {
  const diagnostics: EngineeringDiagnostic[] = [];
  const seen = new Set<string>();
  const add = (diagnostic: EngineeringDiagnostic): void => {
    if (!diagnostic.message || diagnostics.length >= MAX_DIAGNOSTICS) return;
    const key = diagnosticKey(diagnostic);
    if (!seen.has(key)) { seen.add(key); diagnostics.push(Object.freeze(diagnostic)); }
  };
  for (const rawLine of value.split(/\r?\n/)) {
    const line = normalizeMessage(rawLine);
    if (!line) continue;
    const typecheck = /^(.*)\((\d+),(\d+)\):\s*(?:error|warning)\s+(TS\d+):\s*(.+)$/i.exec(line);
    if (typecheck) {
      add({ category: "TYPECHECK", channel, file: safeRelativeFile(typecheck[1]), line: Number(typecheck[2]),
        column: Number(typecheck[3]), code: typecheck[4].toUpperCase(), testName: null, message: normalizeMessage(typecheck[5]) });
      continue;
    }
    const test = /^(?:FAIL|FAILED|×|✕)\s+([^>]+?)(?:\s*>\s*(.+))?$/i.exec(line);
    if (test) {
      add({ category: "TEST", channel, file: safeRelativeFile(test[1]), line: null, column: null, code: null,
        testName: normalizeMessage(test[2] ?? test[1]), message: line });
      continue;
    }
    const stack = /\(?([^\s()]+):(\d+):(\d+)\)?/.exec(line);
    if (stack && /\bat\b|Error|Exception/i.test(line)) {
      add({ category: "STACK", channel, file: safeRelativeFile(stack[1]), line: Number(stack[2]), column: Number(stack[3]),
        code: null, testName: null, message: line });
      continue;
    }
    if (/\b(error|failed|failure|exception|fatal)\b/i.test(line)) {
      add({ category: "GENERIC", channel, file: null, line: null, column: null, code: null, testName: null, message: line });
    }
  }
  return diagnostics;
}

export function parseEngineeringDiagnostics(evidence: R3BExecutionEvidence): readonly EngineeringDiagnostic[] {
  const diagnostics = [...parseChannel(evidence.stderr, "STDERR"), ...parseChannel(evidence.stdout, "STDOUT")];
  const unique = new Map(diagnostics.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic]));
  return Object.freeze([...unique.values()].slice(0, MAX_DIAGNOSTICS));
}

function engineeringState(evidence: R3BExecutionEvidence): EngineeringState {
  if (evidence.outcome === "TIMEOUT" || evidence.outcome === "BLOCKED" || evidence.outcome === "INFRASTRUCTURE_ERROR") return evidence.outcome;
  const suffix = evidence.outcome === "PASS" ? "PASS" : "FAIL";
  if (evidence.toolKind === "BUILD" || evidence.toolKind === "TEST" || evidence.toolKind === "TYPECHECK") return `${evidence.toolKind}_${suffix}`;
  return `TOOL_${suffix}`;
}

function isFailure(state: EngineeringState): boolean {
  return state.endsWith("_FAIL") || state === "TIMEOUT" || state === "BLOCKED" || state === "INFRASTRUCTURE_ERROR";
}

function failureSignature(result: R3BExecutionResult, diagnostics: readonly EngineeringDiagnostic[]): string | null {
  const state = engineeringState(result.evidence);
  if (!isFailure(state)) return null;
  return sha256(canonical({ state, exitCode: result.evidence.exitCode, signal: result.evidence.signal,
    diagnostics, stdoutDigest: sha256(result.evidence.stdout), stderrDigest: sha256(result.evidence.stderr), reason: result.reason }));
}

function evidenceCoherent(result: R3BExecutionResult): boolean {
  const evidence = result.evidence;
  return result.outcome === evidence.outcome && result.authorityGranted === false && result.generalShellAuthority === false
    && result.sourceRepositoryWriteAuthority === false && result.networkAuthority === false && result.productionAuthority === false
    && evidence.evidenceClass === "E3" && Boolean(evidence.evidenceId) && Boolean(evidence.executionId)
    && evidence.endedAtEpochMs >= evidence.startedAtEpochMs && evidence.durationMs === evidence.endedAtEpochMs - evidence.startedAtEpochMs
    && evidence.stdout.length + evidence.stderr.length <= 400_000;
}

function matchesExpected(evidence: R3BExecutionEvidence, expected: ExpectedEngineeringCandidateBinding): boolean {
  return evidence.candidateCommit === expected.candidateCommit && evidence.disposableRepositoryId === expected.disposableRepositoryId
    && evidence.applicationId === expected.applicationId && evidence.proposalDigest === expected.proposalDigest
    && evidence.toolId === expected.toolId && evidence.toolKind === expected.toolKind
    && evidence.toolIdentityDigest === expected.toolIdentityDigest && evidence.environmentIdentity === expected.environmentIdentity;
}

function comparableBaseline(candidate: R3BExecutionEvidence, baseline: R3BExecutionEvidence): boolean {
  return baseline.toolId === candidate.toolId && baseline.toolKind === candidate.toolKind
    && baseline.toolIdentityDigest === candidate.toolIdentityDigest
    && baseline.environmentIdentity === candidate.environmentIdentity
    && baseline.environment.platform === candidate.environment.platform && baseline.environment.architecture === candidate.environment.architecture
    && baseline.environment.nodeVersion === candidate.environment.nodeVersion;
}

function compare(candidateState: EngineeringState, candidateSignature: string | null, baselineState: EngineeringState | null,
  baselineSignature: string | null): { comparison: BaselineComparison; attribution: CandidateAttribution; confidence: number; unknowns: string[] } {
  if (baselineState === null) return { comparison: "UNKNOWN", attribution: "UNKNOWN", confidence: 0,
    unknowns: ["baseline_execution_not_supplied"] };
  const candidateFailed = isFailure(candidateState); const baselineFailed = isFailure(baselineState);
  if (!candidateFailed && !baselineFailed) return { comparison: "UNCHANGED_PASS", attribution: "NOT_APPLICABLE", confidence: 1, unknowns: [] };
  if (!candidateFailed && baselineFailed) return { comparison: "RESOLVED", attribution: "RESOLUTION_LIKELY_CANDIDATE_ATTRIBUTABLE",
    confidence: 0.8, unknowns: ["baseline_comparison_is_not_a_causal_intervention"] };
  if (candidateFailed && !baselineFailed) return { comparison: "NEW_FAILURE", attribution: "LIKELY_CANDIDATE_ATTRIBUTABLE",
    confidence: 0.8, unknowns: ["single_baseline_comparison_cannot_exclude_flakiness"] };
  if (candidateSignature === baselineSignature) return { comparison: "PREEXISTING_FAILURE",
    attribution: "PREEXISTING_NOT_CANDIDATE_ATTRIBUTABLE", confidence: 0.95, unknowns: [] };
  return { comparison: "CHANGED_FAILURE", attribution: "POSSIBLY_CANDIDATE_ATTRIBUTABLE", confidence: 0.5,
    unknowns: ["both_baseline_and_candidate_failed_with_different_signatures"] };
}

export function observeEngineeringExecution(request: EngineeringObservationRequest): EngineeringObservationResult {
  if (request.schemaVersion !== 1 || !request.observationRequestId?.trim() || !request.observerIdentity?.trim()
    || !request.evaluatorVersion?.trim() || !Number.isFinite(request.observedAtEpochMs)
    || request.observedAtEpochMs < request.candidate.evidence.endedAtEpochMs) {
    return Object.freeze({ decision: "REJECTED", reason: "observation_request_malformed", observation: null, grantsAuthority: false });
  }
  if (!evidenceCoherent(request.candidate)) {
    return Object.freeze({ decision: "REJECTED", reason: "candidate_execution_evidence_incoherent", observation: null, grantsAuthority: false });
  }
  if (!matchesExpected(request.candidate.evidence, request.expected)) {
    return Object.freeze({ decision: "REJECTED", reason: "candidate_execution_binding_mismatch", observation: null, grantsAuthority: false });
  }
  const candidateDiagnostics = parseEngineeringDiagnostics(request.candidate.evidence);
  const candidateState = engineeringState(request.candidate.evidence);
  const candidateSignature = failureSignature(request.candidate, candidateDiagnostics);
  let baselineState: EngineeringState | null = null;
  let baselineSignature: string | null = null;
  const contradictions: string[] = [];
  if (request.baseline) {
    if (!evidenceCoherent(request.baseline)) {
      return Object.freeze({ decision: "REJECTED", reason: "baseline_execution_evidence_incoherent", observation: null, grantsAuthority: false });
    }
    if (!comparableBaseline(request.candidate.evidence, request.baseline.evidence)) {
      contradictions.push("baseline_not_comparable_to_candidate_execution");
    } else {
      const baselineDiagnostics = parseEngineeringDiagnostics(request.baseline.evidence);
      baselineState = engineeringState(request.baseline.evidence);
      baselineSignature = failureSignature(request.baseline, baselineDiagnostics);
    }
  }
  const comparison = compare(candidateState, candidateSignature, baselineState, baselineSignature);
  const epistemicState: ObservationEpistemicState = contradictions.length > 0 ? "CONFLICTED"
    : comparison.comparison === "UNKNOWN" ? "INSUFFICIENT_EVIDENCE" : "SUPPORTED";
  const observationCore = { schemaVersion: 1 as const, evidenceClass: "E3" as const, state: candidateState,
    baselineComparison: comparison.comparison,
    candidateAttribution: contradictions.length > 0 ? "UNKNOWN" as const : comparison.attribution,
    attributionConfidence: contradictions.length > 0 ? 0 : comparison.confidence, epistemicState,
    candidateCommit: request.candidate.evidence.candidateCommit, disposableRepositoryId: request.candidate.evidence.disposableRepositoryId,
    applicationId: request.candidate.evidence.applicationId, proposalDigest: request.candidate.evidence.proposalDigest,
    toolId: request.candidate.evidence.toolId, toolKind: request.candidate.evidence.toolKind,
    toolIdentityDigest: request.candidate.evidence.toolIdentityDigest, environmentIdentity: request.expected.environmentIdentity,
    diagnostics: candidateDiagnostics, candidateFailureSignature: candidateSignature, baselineFailureSignature: baselineSignature,
    candidateEvidenceId: request.candidate.evidence.evidenceId, baselineEvidenceId: request.baseline?.evidence.evidenceId ?? null,
    unknowns: Object.freeze([...comparison.unknowns, ...contradictions]), contradictions: Object.freeze(contradictions),
    observedAtEpochMs: request.observedAtEpochMs, grantsAuthority: false as const };
  const observation: EngineeringObservation = Object.freeze({ ...observationCore,
    observationId: `R3C-OBSERVATION-${sha256(canonical({ requestId: request.observationRequestId,
      observerIdentity: request.observerIdentity, evaluatorVersion: request.evaluatorVersion, observationCore })).slice(0, 32)}` });
  return Object.freeze({ decision: epistemicState === "CONFLICTED" ? "INSUFFICIENT_EVIDENCE" : "OBSERVED",
    reason: epistemicState === "CONFLICTED" ? "baseline_comparison_conflicted" : "engineering_execution_observed",
    observation, grantsAuthority: false });
}
