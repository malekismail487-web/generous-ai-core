import { createHash } from "node:crypto";
import type { NyxRepairHypothesis } from "../cognition/nyxNemotronEngineeringCognition";
import type { R2GPatchProposal } from "../executor/r2PatchProposal";
import type { R3AApplyResult, R3AEvent } from "../executor/r3DisposablePatchApplication";
import { assessEngineeringQuality, type EngineeringQualityDimension,
  type EngineeringQualityPolicy, type QualityDisposition } from "./engineeringQualityOracle";

export const OMEGA_CANDIDATE_ENGINEERING_ADMISSION_STATUS = Object.freeze({
  chunkId: "OMEGA-NYX-QUALITY-ADMISSION-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "PROVENANCE_BOUND_PUBLIC_STATIC_CANDIDATE_ADMISSION",
  reviewScope: "PUBLIC_STATIC_CHANGED_FILES_ONLY",
  evidenceIndependence: "IMPLEMENTATION_ADJACENT_SHARED_STATIC_ORACLE",
  finalIndependentQualityAuthority: false,
  hiddenEvidenceUsed: false,
  authorityGranted: false,
} as const);

/**
 * The public, task-agnostic static policy used at the candidate-admission boundary.
 * It deliberately contains no holdout cases, expected answers, or task-specific
 * invariants. Allowed paths are supplied by the already-authorized mutation scope.
 */
export const OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1 = Object.freeze({
  policyId: "omega-public-static-candidate/1",
  maxChangedFiles: 4,
  maxChangedLines: 200,
  maxCandidateBytes: 65_536,
  maxCyclomaticComplexity: 12,
  maxComplexityDelta: 8,
  maxNestingDepth: 4,
  maxAddedDeclarations: 12,
  invariants: Object.freeze([]),
} as const);

export interface CandidateEngineeringLineage {
  readonly hypothesisId: string;
  readonly hypothesisDigest: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly applicationId: string;
}

export interface CandidateEngineeringAdmissionRequest {
  readonly schemaVersion: 1;
  readonly reviewId: string;
  readonly evaluatorVersion: string;
  readonly candidateCommit: string;
  readonly lineage: CandidateEngineeringLineage;
  readonly hypothesis: NyxRepairHypothesis;
  readonly proposal: R2GPatchProposal;
  readonly application: R3AApplyResult;
  readonly baselineFiles: Readonly<Record<string, string>>;
  readonly candidateFiles: Readonly<Record<string, string>>;
  readonly allowedMutationPaths: readonly string[];
}

export type CandidateEngineeringAdmissionDimension = "CONTRACT" | "PROVENANCE"
  | "SCOPE_DISCIPLINE" | "CHANGE_MINIMALITY" | "API_COMPATIBILITY" | "TYPE_SAFETY"
  | "DUPLICATION" | "MAINTAINABILITY" | "UNNECESSARY_COMPLEXITY"
  | "SECURITY_IMPLICATIONS" | "READABILITY";

export interface CandidateEngineeringAdmissionFinding {
  readonly dimension: CandidateEngineeringAdmissionDimension;
  /** Stable public category. It never contains a hidden assertion or expected answer. */
  readonly code: string;
  readonly paths: readonly string[];
}

export interface CandidateEngineeringAdmissionResult {
  readonly schemaVersion: 1;
  readonly reviewId: string;
  readonly evaluatorVersion: string;
  readonly candidateCommit: string | null;
  readonly decision: "ADMITTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  readonly lineage: CandidateEngineeringLineage | null;
  readonly changedPaths: readonly string[];
  readonly findings: readonly CandidateEngineeringAdmissionFinding[];
  readonly dimensionDispositions: Readonly<Partial<Record<EngineeringQualityDimension, QualityDisposition>>>;
  readonly staticPolicyId: typeof OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1.policyId;
  readonly reviewScope: "PUBLIC_STATIC_CHANGED_FILES_ONLY";
  readonly functionalEvidenceConsidered: false;
  readonly evidenceId: string;
  readonly evidenceDigest: string;
  readonly evidenceClass: "E3";
  readonly evidenceIndependence: "IMPLEMENTATION_ADJACENT_SHARED_STATIC_ORACLE";
  readonly eventIntegrity: "HASH_CHAINED_NOT_AUTHENTICATED";
  readonly hiddenEvidenceUsed: false;
  readonly authorityGranted: false;
}

const STATIC_DIMENSIONS = Object.freeze([
  "SCOPE_DISCIPLINE", "CHANGE_MINIMALITY", "API_COMPATIBILITY", "TYPE_SAFETY", "DUPLICATION",
  "MAINTAINABILITY", "UNNECESSARY_COMPLEXITY", "SECURITY_IMPLICATIONS", "READABILITY",
] as const satisfies readonly EngineeringQualityDimension[]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

function digest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }

function validPath(value: unknown): value is string {
  if (!nonEmpty(value) || value.includes("\0") || value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) return false;
  const segments = value.replace(/\\/g, "/").split("/");
  return segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}

function stringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.entries(value).every(([path, content]) => validPath(path) && typeof content === "string");
}

function frozenFinding(dimension: CandidateEngineeringAdmissionDimension, code: string,
  paths: readonly string[] = []): CandidateEngineeringAdmissionFinding {
  return Object.freeze({ dimension, code, paths: Object.freeze([...new Set(paths)].sort()) });
}

function publicFinding(dimension: typeof STATIC_DIMENSIONS[number], raw: string,
  changedPaths: readonly string[]): CandidateEngineeringAdmissionFinding {
  const prefix = raw.split(":", 1)[0].replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase() || "STATIC_POLICY_FAILURE";
  const paths = changedPaths.filter((path) => raw === path || raw.includes(`:${path}`));
  return frozenFinding(dimension, prefix, paths);
}

function recomputeDigest<T extends { readonly proposalDigest: string }>(value: T): string {
  const { proposalDigest: _ignored, ...base } = value;
  return sha256(canonical(base));
}

function verifyEventChain(events: readonly R3AEvent[], lineage: CandidateEngineeringLineage,
  application: R3AApplyResult, proposal: R2GPatchProposal): boolean {
  const expectedTypes = ["APPLICATION_REQUESTED", "APPLICATION_AUTHORIZED", "SOURCE_BASE_REVALIDATED",
    "CLONE_PRESTATE_VERIFIED", ...proposal.changes.map(() => "CHANGE_APPLIED" as const),
    "CLONE_POSTSTATE_VERIFIED", "APPLICATION_PROVEN"] as const;
  const expectedResults = ["REQUESTED", "AUTHORIZED", "VERIFIED", "VERIFIED",
    ...proposal.changes.map(() => "SUCCEEDED" as const), "VERIFIED", "VERIFIED"] as const;
  if (events.length !== expectedTypes.length || !digest(application.prestateDigest)
    || !digest(application.poststateDigest)) return false;
  let previousHash = "GENESIS";
  const requestId = events[0]?.requestId;
  for (const [index, event] of events.entries()) {
    if (event.schemaVersion !== 1 || event.applicationId !== lineage.applicationId
      || event.proposalDigest !== lineage.proposalDigest || event.previousHash !== previousHash
      || event.eventType !== expectedTypes[index] || event.result !== expectedResults[index]
      || !nonEmpty(event.eventId) || !nonEmpty(event.evidenceRef) || !nonEmpty(event.actorIdentity)
      || !nonEmpty(requestId) || event.requestId !== requestId || !digest(event.eventHash)) return false;
    const { eventHash: _ignored, ...base } = event;
    if (sha256(canonical(base)) !== event.eventHash) return false;
    if (["SOURCE_BASE_REVALIDATED", "CLONE_PRESTATE_VERIFIED"].includes(event.eventType)
      && event.stateDigest !== application.prestateDigest) return false;
    if (["CLONE_POSTSTATE_VERIFIED", "APPLICATION_PROVEN"].includes(event.eventType)
      && event.stateDigest !== application.poststateDigest) return false;
    if (event.eventType === "CHANGE_APPLIED") {
      const changeIndex = index - 4;
      const change = proposal.changes[changeIndex];
      const expectedState = change ? sha256(canonical({ relativePath: change.relativePath,
        hash: change.proposedContentHash, exists: true })) : null;
      if (event.stateDigest !== expectedState) return false;
    }
    previousHash = event.eventHash;
  }
  return true;
}

function basicContractIssues(value: unknown): readonly CandidateEngineeringAdmissionFinding[] {
  if (!isRecord(value)) return [frozenFinding("CONTRACT", "REQUEST_NOT_OBJECT")];
  const issues: CandidateEngineeringAdmissionFinding[] = [];
  if (value.schemaVersion !== 1) issues.push(frozenFinding("CONTRACT", "SCHEMA_VERSION_INVALID"));
  if (!nonEmpty(value.reviewId)) issues.push(frozenFinding("CONTRACT", "REVIEW_ID_INVALID"));
  if (!nonEmpty(value.evaluatorVersion)) issues.push(frozenFinding("CONTRACT", "EVALUATOR_VERSION_INVALID"));
  if (typeof value.candidateCommit !== "string" || !/^[0-9a-f]{40}$/.test(value.candidateCommit)) {
    issues.push(frozenFinding("CONTRACT", "CANDIDATE_COMMIT_INVALID"));
  }
  if (!isRecord(value.lineage)) issues.push(frozenFinding("CONTRACT", "LINEAGE_INVALID"));
  if (!isRecord(value.hypothesis) || !Array.isArray(value.hypothesis.changes)) {
    issues.push(frozenFinding("CONTRACT", "HYPOTHESIS_INVALID"));
  }
  if (!isRecord(value.proposal) || !Array.isArray(value.proposal.changes)) {
    issues.push(frozenFinding("CONTRACT", "PROPOSAL_INVALID"));
  }
  if (!isRecord(value.application) || !Array.isArray(value.application.changedPaths)
    || !Array.isArray(value.application.events)) issues.push(frozenFinding("CONTRACT", "APPLICATION_INVALID"));
  if (!stringRecord(value.baselineFiles)) issues.push(frozenFinding("CONTRACT", "BASELINE_FILES_INVALID"));
  if (!stringRecord(value.candidateFiles)) issues.push(frozenFinding("CONTRACT", "CANDIDATE_FILES_INVALID"));
  if (!Array.isArray(value.allowedMutationPaths) || !value.allowedMutationPaths.every(validPath)
    || new Set(value.allowedMutationPaths).size !== value.allowedMutationPaths.length) {
    issues.push(frozenFinding("CONTRACT", "ALLOWED_MUTATION_PATHS_INVALID"));
  }
  return Object.freeze(issues);
}

function provenanceIssues(request: CandidateEngineeringAdmissionRequest): readonly CandidateEngineeringAdmissionFinding[] {
  const issues: CandidateEngineeringAdmissionFinding[] = [];
  const { lineage, hypothesis, proposal, application } = request;
  if (!nonEmpty(lineage.hypothesisId) || !digest(lineage.hypothesisDigest) || !nonEmpty(lineage.proposalId)
    || !digest(lineage.proposalDigest) || !nonEmpty(lineage.applicationId)) {
    issues.push(frozenFinding("PROVENANCE", "LINEAGE_FIELDS_INVALID"));
    return issues;
  }
  if (hypothesis.schemaVersion !== 1 || hypothesis.hypothesisId !== lineage.hypothesisId
    || hypothesis.proposalDigest !== lineage.hypothesisDigest || recomputeDigest(hypothesis) !== hypothesis.proposalDigest
    || hypothesis.applyAuthorized !== false || hypothesis.disposition !== "PENDING_VERIFICATION"
    || hypothesis.changes.length < 1) {
    issues.push(frozenFinding("PROVENANCE", "HYPOTHESIS_BINDING_MISMATCH"));
  }
  if (proposal.schemaVersion !== 1 || proposal.proposalId !== lineage.proposalId
    || proposal.proposalDigest !== lineage.proposalDigest || recomputeDigest(proposal) !== proposal.proposalDigest
    || proposal.baseCandidateCommit !== request.candidateCommit || proposal.applyAuthorized !== false
    || proposal.rollbackRequiredBeforeApply !== true || proposal.changes.length < 1) {
    issues.push(frozenFinding("PROVENANCE", "PROPOSAL_BINDING_MISMATCH"));
  }
  const proposalPaths = Array.isArray(proposal.changes) ? proposal.changes.map((item) => item.relativePath).sort() : [];
  const applicationPaths = Array.isArray(application.changedPaths) ? [...application.changedPaths].sort() : [];
  if (new Set(proposalPaths).size !== proposalPaths.length || new Set(applicationPaths).size !== applicationPaths.length
    || proposalPaths.some((path) => !validPath(path))) issues.push(frozenFinding("PROVENANCE", "CHANGE_SET_INVALID"));
  if (application.decision !== "APPLIED" || application.applicationId !== lineage.applicationId
    || application.proposalDigest !== lineage.proposalDigest || application.evidenceClass !== "E3"
    || application.sourceRepositoryMutated !== false || application.authorityGranted !== false
    || !digest(application.prestateDigest) || !digest(application.poststateDigest)
    || canonical(proposalPaths) !== canonical(applicationPaths)
    || !verifyEventChain(application.events, lineage, application, proposal)) {
    issues.push(frozenFinding("PROVENANCE", "APPLICATION_BINDING_MISMATCH"));
  }
  const hypothesisChanges = Array.isArray(hypothesis.changes) ? hypothesis.changes : [];
  if (hypothesisChanges.length !== proposal.changes.length || proposal.changes.some((change, index) => {
    const intent = hypothesisChanges[index];
    return change.kind !== "MODIFY" || intent?.kind !== "MODIFY" || intent.relativePath !== change.relativePath
      || intent.expectedBaseHash !== change.expectedBaseHash || intent.replacementContent !== change.proposedContent
      || intent.replacementContentHash !== change.proposedContentHash;
  })) issues.push(frozenFinding("PROVENANCE", "HYPOTHESIS_PROPOSAL_CONTENT_MISMATCH"));
  const baselinePaths = Object.keys(request.baselineFiles).sort();
  const candidatePaths = Object.keys(request.candidateFiles).sort();
  const actualChangedPaths = baselinePaths.filter((path) => request.baselineFiles[path] !== request.candidateFiles[path]);
  if (canonical(baselinePaths) !== canonical(candidatePaths)
    || canonical(actualChangedPaths) !== canonical(proposalPaths)) {
    issues.push(frozenFinding("PROVENANCE", "CANDIDATE_TRANSITION_MISMATCH",
      [...new Set([...actualChangedPaths, ...proposalPaths])]));
  }
  for (const change of proposal.changes) {
    const before = request.baselineFiles[change.relativePath];
    const after = request.candidateFiles[change.relativePath];
    if (typeof before !== "string" || typeof after !== "string" || sha256(before) !== change.expectedBaseHash
      || sha256(after) !== change.proposedContentHash || after !== change.proposedContent) {
      issues.push(frozenFinding("PROVENANCE", "FILE_CONTENT_BINDING_MISMATCH", [change.relativePath]));
    }
  }
  return Object.freeze([...new Map(issues.map((item) => [`${item.dimension}:${item.code}:${item.paths.join(",")}`, item])).values()]);
}

function result(input: { readonly reviewId: string; readonly evaluatorVersion: string; readonly candidateCommit: string | null;
  readonly decision: CandidateEngineeringAdmissionResult["decision"]; readonly lineage: CandidateEngineeringLineage | null;
  readonly changedPaths: readonly string[]; readonly findings: readonly CandidateEngineeringAdmissionFinding[];
  readonly dimensionDispositions?: Readonly<Partial<Record<EngineeringQualityDimension, QualityDisposition>>> }): CandidateEngineeringAdmissionResult {
  const body = { schemaVersion: 1 as const, reviewId: input.reviewId, evaluatorVersion: input.evaluatorVersion,
    candidateCommit: input.candidateCommit, decision: input.decision, lineage: input.lineage,
    changedPaths: Object.freeze([...input.changedPaths].sort()), findings: Object.freeze([...input.findings]),
    dimensionDispositions: Object.freeze({ ...(input.dimensionDispositions ?? {}) }),
    staticPolicyId: OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1.policyId,
    reviewScope: "PUBLIC_STATIC_CHANGED_FILES_ONLY" as const, functionalEvidenceConsidered: false as const };
  const evidenceDigest = sha256(canonical(body));
  return Object.freeze({ ...body, evidenceId: `CANDIDATE-ADMISSION-${evidenceDigest.slice(0, 32)}`, evidenceDigest,
    evidenceClass: "E3", evidenceIndependence: "IMPLEMENTATION_ADJACENT_SHARED_STATIC_ORACLE",
    eventIntegrity: "HASH_CHAINED_NOT_AUTHENTICATED", hiddenEvidenceUsed: false, authorityGranted: false });
}

/**
 * Reviews the exact applied candidate identified by a Νύξ hypothesis, Omega patch
 * proposal, and Omega application transcript. This is a static admission only:
 * execution and regression evidence remain separate mandatory gates.
 */
function admitStaticEngineeringCandidateInternal(input: unknown): CandidateEngineeringAdmissionResult {
  const contract = basicContractIssues(input);
  if (contract.length > 0 || !isRecord(input)) return result({
    reviewId: isRecord(input) && nonEmpty(input.reviewId) ? input.reviewId : "UNKNOWN",
    evaluatorVersion: isRecord(input) && nonEmpty(input.evaluatorVersion) ? input.evaluatorVersion : "UNKNOWN",
    candidateCommit: isRecord(input) && typeof input.candidateCommit === "string" && /^[0-9a-f]{40}$/.test(input.candidateCommit)
      ? input.candidateCommit : null,
    decision: "INSUFFICIENT_EVIDENCE", lineage: null, changedPaths: [], findings: contract,
  });
  const request = input as unknown as CandidateEngineeringAdmissionRequest;
  const provenance = provenanceIssues(request);
  const changedPaths = [...new Set(request.application.changedPaths)].sort();
  if (provenance.length > 0) return result({ reviewId: request.reviewId, evaluatorVersion: request.evaluatorVersion,
    candidateCommit: request.candidateCommit, decision: "INSUFFICIENT_EVIDENCE", lineage: request.lineage,
    changedPaths, findings: provenance });

  // Only changed files are supplied to the analyzer. Existing debt in observed,
  // read-only context therefore cannot become a false rejection of this candidate.
  const baselineFiles = Object.fromEntries(changedPaths.map((path) => [path, request.baselineFiles[path]]));
  const candidateFiles = Object.fromEntries(changedPaths.map((path) => [path, request.candidateFiles[path]]));
  const policy: EngineeringQualityPolicy = Object.freeze({ ...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1,
    allowedChangedPaths: Object.freeze([...request.allowedMutationPaths]), readonlyPaths: Object.freeze([]) });
  let assessment;
  try {
    assessment = assessEngineeringQuality({ assessmentId: request.reviewId, evaluatorVersion: request.evaluatorVersion,
      baselineFiles, candidateFiles, changedPaths, functionalAcceptance: "NOT_EVALUATED",
      regressionAcceptance: "NOT_EVALUATED", policy });
  } catch {
    return result({ reviewId: request.reviewId, evaluatorVersion: request.evaluatorVersion,
      candidateCommit: request.candidateCommit, decision: "INSUFFICIENT_EVIDENCE", lineage: request.lineage,
      changedPaths, findings: [frozenFinding("CONTRACT", "STATIC_ANALYSIS_INPUT_INVALID")] });
  }
  const dimensionDispositions: Partial<Record<EngineeringQualityDimension, QualityDisposition>> = {};
  const findings: CandidateEngineeringAdmissionFinding[] = [];
  for (const dimension of STATIC_DIMENSIONS) {
    const detector = assessment.dimensions[dimension];
    dimensionDispositions[dimension] = detector.disposition;
    for (const finding of detector.findings) findings.push(publicFinding(dimension, finding, changedPaths));
  }
  const staticInsufficient = STATIC_DIMENSIONS.some((dimension) => dimensionDispositions[dimension] === "INSUFFICIENT_EVIDENCE");
  const rejected = STATIC_DIMENSIONS.some((dimension) => dimensionDispositions[dimension] === "FAIL");
  return result({ reviewId: request.reviewId, evaluatorVersion: request.evaluatorVersion,
    candidateCommit: request.candidateCommit, decision: rejected ? "REJECTED" : staticInsufficient ? "INSUFFICIENT_EVIDENCE" : "ADMITTED",
    lineage: request.lineage, changedPaths, findings, dimensionDispositions });
}

export function admitStaticEngineeringCandidate(input: unknown): CandidateEngineeringAdmissionResult {
  try { return admitStaticEngineeringCandidateInternal(input); }
  catch {
    return result({ reviewId: "UNKNOWN", evaluatorVersion: "UNKNOWN", candidateCommit: null,
      decision: "INSUFFICIENT_EVIDENCE", lineage: null, changedPaths: [],
      findings: [frozenFinding("CONTRACT", "ADMISSION_INPUT_UNSAFE_OR_MALFORMED")] });
  }
}
