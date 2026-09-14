import { createHash } from "node:crypto";

/** Records and research context do not confer any Omega execution capability. */
export interface TheoryAssignment {
  readonly objective: string;
  readonly question: string;
  readonly domain: "SOFTWARE" | "MATHEMATICS" | "SCIENCE";
  readonly candidateBinding: string;
  readonly scope: readonly string[];
  readonly assumptions: readonly string[];
}

export type TheoryWakeKind = "ASSIGNMENT" | "NEW_EVIDENCE" | "CONTRADICTION" | "DEPENDENCY_CHANGED" | "FOLLOW_UP";
export interface TheoryWakeEvent {
  readonly eventId: string;
  readonly kind: TheoryWakeKind;
  readonly reason: string;
}

export interface TheoryLease {
  readonly theoryId: string;
  readonly guardianId: string;
  readonly activationId: string;
  readonly assignmentDigest: string;
  readonly expiresAtEpochMs: number;
}

export interface TheoryPrediction {
  readonly predictionId: string;
  readonly statement: string;
  readonly expectedResult: string;
  readonly candidateDigest: string;
  readonly evidenceRefs: readonly string[];
  readonly assumptions: readonly string[];
  readonly uncertainties: readonly string[];
  readonly proposedCounterexamples: readonly string[];
  readonly expectedPassingTools: readonly string[];
  readonly modelEstimate: number | null;
}

export interface TheoryObservation {
  readonly evidenceId: string;
  readonly predictionId: string;
  readonly candidateDigest: string;
  readonly toolId: string;
  readonly result: "PASS" | "FAIL" | "INCONCLUSIVE";
  readonly evidenceClass: "E3" | "E4";
  readonly environmentIdentity: string;
  readonly provenanceRoot: string;
}

export interface CommittedTheoryPrediction extends TheoryPrediction {
  readonly committedAtOrder: number;
  readonly digest: string;
}

export interface RecordedTheoryObservation extends TheoryObservation {
  readonly observedAtOrder: number;
}

export interface TheoryRelation {
  readonly relationId: string;
  readonly from: string;
  readonly to: string;
  readonly kind: "RELATED" | "COMPETING" | "DEPENDS_ON" | "SHARED_ASSUMPTION";
  readonly justification: string;
  readonly disposition: "PROPOSED_NOT_PROVEN";
}

export interface TheoryMessage {
  readonly messageId: string;
  readonly from: string;
  readonly to: string;
  readonly evidenceId: string;
  readonly provenanceRoot: string;
  readonly kind: "EVIDENCE_NOTICE";
  readonly interpretation: "INVESTIGATE_RELEVANCE_NOT_AUTOMATIC_SUPPORT";
}

export interface GuardianReport {
  readonly theoryId: string;
  readonly guardianId: string;
  readonly assignmentDigest: string;
  readonly causalTheoryState: "UNKNOWN" | "REQUIRES_REVALIDATION";
  readonly predictionResults: readonly {
    readonly predictionId: string;
    readonly disposition: "PENDING" | "SUPPORTED_WITHIN_TEST_SCOPE" | "FALSIFIED_PREDICTION" | "INCONCLUSIVE";
  }[];
  readonly confidence: {
    readonly calibratedProbability: null;
    readonly calibrationState: "NOT_CALIBRATED";
    readonly lastModelEstimate: number | null;
    readonly distinctEvidenceRoots: number;
    readonly independenceEstablished: false;
    readonly numericalTarget: null;
  };
  readonly weakPoints: readonly string[];
  readonly requests: readonly {
    readonly question: string;
    readonly mode: "FOCUSED_INVESTIGATION" | "REVALIDATE_DEPENDENCY";
    readonly grantsAuthority: false;
  }[];
  readonly relatedEvidenceNotices: readonly TheoryMessage[];
  readonly grantsAuthority: false;
}

export interface TheoryResearchContext {
  readonly schemaVersion: 1;
  readonly theoryId: string;
  readonly guardianId: string;
  readonly assignment: TheoryAssignment;
  readonly assignmentDigest: string;
  readonly report: GuardianReport;
  readonly trust: "RESEARCH_CONTEXT_NOT_INSTRUCTION_OR_ACCEPTANCE_AUTHORITY";
  readonly grantsAuthority: false;
}

export function theoryDigest(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (item && typeof item === "object") {
      const object = item as Record<string, unknown>;
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
    }
    return JSON.stringify(item) ?? "null";
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function immutableTheoryValue<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

export function theoryText(value: unknown, max = 2_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function theoryStrings(value: unknown, max = 20): value is readonly string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => theoryText(item, 500))
    && new Set(value).size === value.length;
}

export function theoryKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function validTheoryAssignment(value: TheoryAssignment): boolean {
  return Boolean(value && theoryText(value.objective) && theoryText(value.question)
    && theoryKeys(value, ["objective", "question", "domain", "candidateBinding", "scope", "assumptions"])
    && ["SOFTWARE", "MATHEMATICS", "SCIENCE"].includes(value.domain)
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.candidateBinding) && theoryStrings(value.scope)
    && value.scope.length > 0 && theoryStrings(value.assumptions, 10));
}

/** Defense in depth at the cognition boundary; the coordinator also binds this to a live lease. */
export function validTheoryResearchContext(value: TheoryResearchContext, objective: string, candidate: string): boolean {
  try {
    return value?.schemaVersion === 1 && value.grantsAuthority === false
      && value.trust === "RESEARCH_CONTEXT_NOT_INSTRUCTION_OR_ACCEPTANCE_AUTHORITY"
      && validTheoryAssignment(value.assignment) && value.assignment.objective === objective
      && value.assignment.candidateBinding === candidate
      && value.assignmentDigest === theoryDigest(value.assignment)
      && value.report.theoryId === value.theoryId && value.report.guardianId === value.guardianId
      && value.report.assignmentDigest === value.assignmentDigest && value.report.grantsAuthority === false
      && value.report.confidence.calibratedProbability === null
      && value.report.confidence.calibrationState === "NOT_CALIBRATED"
      && value.report.confidence.numericalTarget === null
      && theoryStrings(value.report.weakPoints, 20) && JSON.stringify(value).length <= 24_000;
  } catch { return false; }
}
