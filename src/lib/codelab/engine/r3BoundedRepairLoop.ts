import { createHash } from "node:crypto";
import { NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS, type NyxAvailableEvidence, type NyxCandidateQualityFeedback,
  type NyxEngineeringFileContext, type NyxEvidenceRequest, type NyxNemotronEngineeringCognition,
  type NyxPriorCognitionFailure, type NyxPriorHypothesis, type NyxRepairCognitionEvidence, type NyxRepairHypothesis,
  type NyxSchemaDiagnostic } from "../cognition/nyxNemotronEngineeringCognition";
import { admitStaticEngineeringCandidate, type CandidateEngineeringAdmissionResult } from "../assurance/candidateEngineeringAdmission";
import type { R2GPatchProposal } from "../executor/r2PatchProposal";
import type { R3AApplyResult } from "../executor/r3DisposablePatchApplication";
import type { R3BControlledEngineeringExecutor, R3BExecutionRequest, R3BExecutionResult } from "../executor/r3ControlledEngineeringExecution";
import { observeEngineeringExecution, type EngineeringObservation } from "../observation/r3EngineeringObservation";

export const R3_E_BOUNDED_REPAIR_LOOP_STATUS = Object.freeze({
  chunkId: "OMEGA-R3-E-BOUNDED-REPAIR-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "BOUNDED_OBSERVE_DIAGNOSE_REPAIR_RETEST_LOOP",
  cognition: "NYX_NVIDIA_NEMOTRON_3_ULTRA",
  actuation: "OMEGA_R3_A_R3_B",
  observation: "OMEGA_R3_C",
  publicStaticCandidateAdmission: "OMEGA_NYX_QUALITY_ADMISSION_V1",
  qualityRejectionCanDriveBoundedRepair: true,
  finalIndependentQualityAuthority: false,
  unboundedAutonomy: false,
  sourceRepositoryWriteAuthority: false,
  productionAuthority: false,
  authorityGranted: false,
} as const);

export interface OmegaRepairVerification {
  readonly toolId: string;
  readonly executor: R3BControlledEngineeringExecutor;
  readonly request: R3BExecutionRequest;
}

export interface OmegaPreparedRepairCandidate {
  readonly hypothesisId: string;
  readonly hypothesisDigest: string;
  readonly proposal: R2GPatchProposal;
  readonly application: R3AApplyResult;
  readonly verifications: readonly OmegaRepairVerification[];
  readonly files: readonly NyxEngineeringFileContext[];
  readonly omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY";
  readonly sourceRepositoryMutated: false;
  readonly productionAuthorityGranted: false;
}

export interface OmegaRepairCandidateBuilder {
  readonly builderIdentity: string;
  readonly prepare: (hypothesis: NyxRepairHypothesis, iteration: number) => Promise<OmegaPreparedRepairCandidate>;
}

export interface OmegaAcquiredRepairEvidence {
  readonly requestedEvidenceRefs: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly files: readonly NyxEngineeringFileContext[];
  readonly omegaAuthorityBoundary: "R1_ADMITTED_READ_ONLY_EVIDENCE";
  readonly authorityGranted: false;
}

export interface OmegaRepairEvidenceProvider {
  readonly providerIdentity: string;
  readonly acquire: (request: NyxEvidenceRequest, cognitionCycle: number) => Promise<OmegaAcquiredRepairEvidence>;
}

export interface R3BoundedRepairLoopConfig {
  readonly loopId: string;
  readonly evaluatorVersion: string;
  readonly observerIdentity: string;
  readonly cognition: NyxNemotronEngineeringCognition;
  readonly candidateBuilder: OmegaRepairCandidateBuilder;
  readonly evidenceProvider?: OmegaRepairEvidenceProvider;
  readonly maxIterations: number;
  readonly maxWallClockMs: number;
  readonly maxChangesPerIteration: number;
  readonly maxPatchBytesPerIteration: number;
  readonly maxDiagnosisCharacters: number;
}

export interface R3RepairBaselineExecution {
  readonly toolId: string;
  readonly result: R3BExecutionResult;
}

export interface R3BoundedRepairRequest {
  readonly schemaVersion: 1;
  readonly repairRequestId: string;
  readonly objective: string;
  readonly initialObservation: EngineeringObservation;
  readonly initialFiles: readonly NyxEngineeringFileContext[];
  readonly allowedMutationPaths: readonly string[];
  readonly availableEvidence: readonly NyxAvailableEvidence[];
  readonly allowedVerificationToolIds: readonly string[];
  readonly baselineExecutions: readonly R3RepairBaselineExecution[];
  readonly observedAtEpochMs: number;
}

export interface R3RepairVerificationRecord {
  readonly toolId: string;
  readonly execution: R3BExecutionResult;
  readonly observation: EngineeringObservation;
}

export interface R3RepairIteration {
  readonly iteration: number;
  readonly inputObservationId: string;
  readonly cognitionEvidenceId: string;
  readonly cognitionEvidence: NyxRepairCognitionEvidence;
  readonly hypothesis: NyxRepairHypothesis;
  readonly hypothesisDisposition: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "FALSIFIED" | "INSUFFICIENT_EVIDENCE";
  readonly proposalDigest: string;
  readonly applicationId: string;
  readonly applicationDecision: R3AApplyResult["decision"];
  readonly verifications: readonly R3RepairVerificationRecord[];
  readonly candidateAdmission: CandidateEngineeringAdmissionResult | null;
  readonly functionallyPassed: boolean;
  readonly passed: boolean;
}

export interface R3EvidenceAcquisitionRecord {
  readonly cognitionCycle: number;
  readonly cognitionEvidenceId: string;
  readonly cognitionEvidence: NyxRepairCognitionEvidence;
  readonly requestDigest: string;
  readonly requestedEvidenceRefs: readonly string[];
  readonly admittedEvidenceIds: readonly string[];
  readonly admittedPaths: readonly string[];
  readonly authorityGranted: false;
}

export interface R3CognitionFailureRecord {
  readonly cognitionCycle: number;
  readonly cognitionRequestId: string;
  readonly reason: "SCHEMA_INVALID" | "NON_JSON" | "OUTPUT_TRUNCATED";
  readonly cognitionEvidence: NyxRepairCognitionEvidence;
  readonly diagnostics: readonly NyxSchemaDiagnostic[];
}

export interface R3BoundedRepairResult {
  readonly outcome: "FUNCTIONALLY_REPAIRED_VERIFIED" | "EXHAUSTED" | "BLOCKED" | "COGNITION_ERROR" | "INFRASTRUCTURE_ERROR";
  readonly reason: string;
  readonly iterations: readonly R3RepairIteration[];
  readonly evidenceAcquisitions: readonly R3EvidenceAcquisitionRecord[];
  readonly cognitionFailures: readonly R3CognitionFailureRecord[];
  readonly finalObservation: EngineeringObservation;
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly modelCallCount: number;
  readonly lastCognitionEvidence: NyxRepairCognitionEvidence | null;
  readonly durationMs: number;
  readonly functionalAcceptance: "ACCEPTED" | "NOT_ACCEPTED";
  readonly engineeringQualityAcceptance: "NOT_EVALUATED";
  readonly candidateAdmissionAcceptance: "ACCEPTED" | "NOT_ACCEPTED" | "INSUFFICIENT_EVIDENCE" | "NOT_EVALUATED";
  readonly authorityGranted: false;
  readonly sourceRepositoryWriteAuthority: false;
  readonly productionAuthority: false;
}

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function passing(observation: EngineeringObservation): boolean { return observation.state.endsWith("_PASS"); }
function failing(observation: EngineeringObservation): boolean {
  return observation.state.endsWith("_FAIL") || ["TIMEOUT", "BLOCKED", "INFRASTRUCTURE_ERROR"].includes(observation.state);
}
function patchDigestValid(proposal: R2GPatchProposal): boolean {
  const { proposalDigest, ...base } = proposal;
  return proposalDigest === sha256(canonical(base));
}
function fileContextsValid(files: readonly NyxEngineeringFileContext[]): boolean {
  return files.length > 0 && new Set(files.map((file) => file.relativePath)).size === files.length
    && files.every((file) => Boolean(file.relativePath) && file.contentSha256 === sha256(file.content));
}

function evidenceCatalogValid(catalog: readonly NyxAvailableEvidence[], admittedFiles: readonly NyxEngineeringFileContext[]): boolean {
  const admittedPaths = new Set(admittedFiles.map((file) => file.relativePath));
  return new Set(catalog.map((item) => item.evidenceRef)).size === catalog.length
    && new Set(catalog.map((item) => item.relativePath)).size === catalog.length
    && catalog.every((item) => item.kind === "FILE" && Boolean(item.evidenceRef) && Boolean(item.relativePath)
      && Boolean(item.description) && !admittedPaths.has(item.relativePath));
}

function acquiredEvidenceValid(acquired: OmegaAcquiredRepairEvidence, requested: NyxEvidenceRequest,
  catalog: readonly NyxAvailableEvidence[], currentFiles: readonly NyxEngineeringFileContext[]): boolean {
  if (acquired.omegaAuthorityBoundary !== "R1_ADMITTED_READ_ONLY_EVIDENCE" || acquired.authorityGranted
    || !fileContextsValid(acquired.files) || acquired.evidenceIds.length !== acquired.files.length
    || new Set(acquired.evidenceIds).size !== acquired.evidenceIds.length || acquired.evidenceIds.some((item) => !item)
    || canonical([...acquired.requestedEvidenceRefs].sort()) !== canonical([...requested.requestedEvidenceRefs].sort())) return false;
  const descriptorByRef = new Map(catalog.map((item) => [item.evidenceRef, item]));
  const existingPaths = new Set(currentFiles.map((file) => file.relativePath));
  return acquired.requestedEvidenceRefs.length === acquired.files.length
    && acquired.requestedEvidenceRefs.every((ref, index) => {
      const descriptor = descriptorByRef.get(ref);
      const file = acquired.files[index];
      return Boolean(descriptor) && descriptor?.relativePath === file.relativePath && !existingPaths.has(file.relativePath);
    });
}

function expectedCandidateContexts(currentFiles: readonly NyxEngineeringFileContext[], hypothesis: NyxRepairHypothesis):
readonly NyxEngineeringFileContext[] {
  const changes = new Map(hypothesis.changes.map((change) => [change.relativePath, change]));
  return Object.freeze(currentFiles.map((file) => {
    const change = changes.get(file.relativePath);
    return change ? Object.freeze({ relativePath: file.relativePath, content: change.replacementContent,
      contentSha256: change.replacementContentHash }) : file;
  }));
}

function contextsMatch(left: readonly NyxEngineeringFileContext[], right: readonly NyxEngineeringFileContext[]): boolean {
  const normalized = (items: readonly NyxEngineeringFileContext[]) => [...items]
    .map((item) => ({ relativePath: item.relativePath, content: item.content, contentSha256: item.contentSha256 }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return canonical(normalized(left)) === canonical(normalized(right));
}

function preparedCandidateValid(candidate: OmegaPreparedRepairCandidate, hypothesis: NyxRepairHypothesis,
  currentFiles: readonly NyxEngineeringFileContext[]): boolean {
  if (candidate.hypothesisId !== hypothesis.hypothesisId || candidate.hypothesisDigest !== hypothesis.proposalDigest
    || candidate.omegaAuthorityBoundary !== "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY" || candidate.sourceRepositoryMutated
    || candidate.productionAuthorityGranted || candidate.proposal.applyAuthorized || !candidate.proposal.rollbackRequiredBeforeApply
    || !patchDigestValid(candidate.proposal) || candidate.application.decision !== "APPLIED" || candidate.application.authorityGranted
    || candidate.application.sourceRepositoryMutated || candidate.application.proposalDigest !== candidate.proposal.proposalDigest
    || !fileContextsValid(candidate.files)
    || !contextsMatch(candidate.files, expectedCandidateContexts(currentFiles, hypothesis))) return false;
  if (candidate.proposal.changes.length !== hypothesis.changes.length) return false;
  for (const [index, change] of candidate.proposal.changes.entries()) {
    const expected = hypothesis.changes[index];
    if (change.kind !== "MODIFY" || change.kind !== expected.kind || change.relativePath !== expected.relativePath
      || change.expectedBaseHash !== expected.expectedBaseHash || change.proposedContent !== expected.replacementContent
      || change.proposedContentHash !== expected.replacementContentHash) return false;
  }
  const appliedPaths = [...candidate.application.changedPaths].sort();
  const proposedPaths = candidate.proposal.changes.map((change) => change.relativePath).sort();
  if (canonical(appliedPaths) !== canonical(proposedPaths)) return false;
  const fileContexts = new Map(candidate.files.map((file) => [file.relativePath, file]));
  if (hypothesis.changes.some((change) => {
    const file = fileContexts.get(change.relativePath);
    return !file || file.contentSha256 !== change.replacementContentHash || file.content !== change.replacementContent;
  })) return false;
  const expectedTools = [...hypothesis.verificationToolIds].sort();
  const actualTools = candidate.verifications.map((item) => item.toolId).sort();
  if (new Set(actualTools).size !== actualTools.length || canonical(expectedTools) !== canonical(actualTools)) return false;
  return candidate.verifications.every((verification) => verification.request.toolId === verification.toolId
    && verification.request.proposalDigest === candidate.application.proposalDigest
    && verification.request.applicationId === candidate.application.applicationId
    && verification.request.disposableRepositoryId === candidate.application.disposableRepositoryId);
}

export class R3BoundedRepairLoop {
  readonly #config: R3BoundedRepairLoopConfig;

  private constructor(config: R3BoundedRepairLoopConfig) { this.#config = config; }

  static create(config: R3BoundedRepairLoopConfig): R3BoundedRepairLoop {
    if (!config.loopId.trim() || !config.evaluatorVersion.trim() || !config.observerIdentity.trim()
      || !config.candidateBuilder.builderIdentity.trim() || typeof config.candidateBuilder.prepare !== "function"
      || (config.evidenceProvider !== undefined && (!config.evidenceProvider.providerIdentity.trim()
        || typeof config.evidenceProvider.acquire !== "function"))
      || !Number.isInteger(config.maxIterations) || config.maxIterations < 1 || config.maxIterations > 8
      || !Number.isInteger(config.maxWallClockMs) || config.maxWallClockMs < 100 || config.maxWallClockMs > 600_000
      || !Number.isInteger(config.maxChangesPerIteration) || config.maxChangesPerIteration < 1
      || !Number.isInteger(config.maxPatchBytesPerIteration) || config.maxPatchBytesPerIteration < 1
      || !Number.isInteger(config.maxDiagnosisCharacters) || config.maxDiagnosisCharacters < 1) throw new Error("bounded_repair_loop_configuration_invalid");
    return new R3BoundedRepairLoop(config);
  }

  async run(request: R3BoundedRepairRequest): Promise<R3BoundedRepairResult> {
    const started = Date.now();
    let modelCallCount = 0;
    let lastCognitionEvidence: NyxRepairCognitionEvidence | null = null;
    const evidenceAcquisitions: R3EvidenceAcquisitionRecord[] = [];
    const cognitionFailures: R3CognitionFailureRecord[] = [];
    const finish = (outcome: R3BoundedRepairResult["outcome"], reason: string,
      iterations: readonly R3RepairIteration[], observation: EngineeringObservation): R3BoundedRepairResult =>
      this.#result(outcome, reason, iterations, evidenceAcquisitions, cognitionFailures, observation, started,
        modelCallCount, lastCognitionEvidence);
    const initialExecution = request.baselineExecutions.find((item) => item.toolId === request.initialObservation.toolId
      && item.result.evidence.evidenceId === request.initialObservation.candidateEvidenceId);
    if (request.schemaVersion !== 1 || !request.repairRequestId?.trim() || typeof request.objective !== "string"
      || !request.objective.trim() || request.objective.length > 2_000 || !Number.isFinite(request.observedAtEpochMs)
      || !failing(request.initialObservation) || request.initialObservation.grantsAuthority || !fileContextsValid(request.initialFiles)
      || !Array.isArray(request.allowedMutationPaths) || request.allowedMutationPaths.length < 1
      || new Set(request.allowedMutationPaths).size !== request.allowedMutationPaths.length
      || request.allowedMutationPaths.some((path) => !request.initialFiles.some((file) => file.relativePath === path))
      || !Array.isArray(request.availableEvidence) || !evidenceCatalogValid(request.availableEvidence, request.initialFiles)
      || request.allowedVerificationToolIds.length < 1 || new Set(request.allowedVerificationToolIds).size !== request.allowedVerificationToolIds.length
      || request.baselineExecutions.some((item) => !item.toolId || item.toolId !== item.result.evidence.toolId)
      || !initialExecution || initialExecution.result.evidence.candidateCommit !== request.initialObservation.candidateCommit
      || initialExecution.result.evidence.disposableRepositoryId !== request.initialObservation.disposableRepositoryId
      || initialExecution.result.evidence.applicationId !== request.initialObservation.applicationId
      || initialExecution.result.evidence.proposalDigest !== request.initialObservation.proposalDigest
      || initialExecution.result.evidence.toolIdentityDigest !== request.initialObservation.toolIdentityDigest) {
      return finish("BLOCKED", "bounded_repair_request_invalid", [], request.initialObservation);
    }
    const baselineByTool = new Map(request.baselineExecutions.map((item) => [item.toolId, item.result]));
    let currentObservation = request.initialObservation;
    let currentFiles: readonly NyxEngineeringFileContext[] = request.initialFiles;
    let currentAvailableEvidence: readonly NyxAvailableEvidence[] = request.availableEvidence;
    const priorHypotheses: NyxPriorHypothesis[] = [];
    const priorCognitionFailures: NyxPriorCognitionFailure[] = [];
    const iterations: R3RepairIteration[] = [];
    let candidateQualityFeedback: NyxCandidateQualityFeedback | null = null;
    for (let cognitionCycle = 1; cognitionCycle <= this.#config.maxIterations; cognitionCycle += 1) {
      if (Date.now() - started >= this.#config.maxWallClockMs) return finish("EXHAUSTED", "repair_wall_clock_budget_exhausted", iterations, currentObservation);
      const cognition = await this.#config.cognition.proposeRepair({ schemaVersion: 1,
        cognitionRequestId: `${request.repairRequestId}-COGNITION-${cognitionCycle}`, objective: request.objective,
        observation: currentObservation, files: currentFiles, allowedMutationPaths: request.allowedMutationPaths,
        availableEvidence: currentAvailableEvidence,
        priorHypotheses, priorCognitionFailures,
        candidateQualityFeedback,
        sourceQualityConstraints: NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
        allowedVerificationToolIds: request.allowedVerificationToolIds, maxChanges: this.#config.maxChangesPerIteration,
        maxPatchBytes: this.#config.maxPatchBytesPerIteration, maxDiagnosisCharacters: this.#config.maxDiagnosisCharacters,
        maxCounterexamples: 3,
        observedAtEpochMs: Math.max(request.observedAtEpochMs, Date.now()) });
      lastCognitionEvidence = cognition.evidence;
      if (cognition.evidence.modelEvidenceId !== "NOT_INVOKED") modelCallCount += 1;
      if (Date.now() - started >= this.#config.maxWallClockMs) {
        return finish("EXHAUSTED", "repair_wall_clock_budget_exhausted", iterations, currentObservation);
      }
      if (cognition.decision === "COGNITION_ERROR" && cognition.schemaDiagnostics.length > 0
        && cognition.evidence.modelEvidenceId !== "NOT_INVOKED") {
        const reason = cognition.reason === "nyx_cognition_output_truncated" ? "OUTPUT_TRUNCATED" as const
          : cognition.reason === "nyx_cognition_output_not_strict_json" ? "NON_JSON" as const : "SCHEMA_INVALID" as const;
        const record: R3CognitionFailureRecord = Object.freeze({ cognitionCycle,
          cognitionRequestId: `${request.repairRequestId}-COGNITION-${cognitionCycle}`, reason,
          cognitionEvidence: cognition.evidence, diagnostics: Object.freeze([...cognition.schemaDiagnostics]) });
        const previousFailure = cognitionFailures.at(-1);
        cognitionFailures.push(record);
        priorCognitionFailures.push(Object.freeze({ failureId: cognition.evidence.evidenceId,
          cognitionRequestId: record.cognitionRequestId, reason, modelResponseDigest: cognition.evidence.modelResponseDigest,
          diagnostics: record.diagnostics }));
        if (previousFailure?.cognitionCycle === cognitionCycle - 1 && cognition.evidence.modelResponseDigest !== null
          && previousFailure.cognitionEvidence.modelResponseDigest === cognition.evidence.modelResponseDigest
          && canonical(previousFailure.diagnostics) === canonical(record.diagnostics)) {
          return finish("EXHAUSTED", "repair_cognition_no_progress", iterations, currentObservation);
        }
        if (cognitionCycle < this.#config.maxIterations && Date.now() - started < this.#config.maxWallClockMs) continue;
        return finish("EXHAUSTED", "repair_cognition_correction_budget_exhausted", iterations, currentObservation);
      }
      if (cognition.decision === "REQUEST_EVIDENCE" && cognition.evidenceRequest) {
        if (!this.#config.evidenceProvider) return finish("BLOCKED", "repair_evidence_provider_unavailable", iterations, currentObservation);
        let acquired: OmegaAcquiredRepairEvidence;
        try { acquired = await this.#config.evidenceProvider.acquire(cognition.evidenceRequest, cognitionCycle); }
        catch { return finish("INFRASTRUCTURE_ERROR", "repair_evidence_acquisition_failed", iterations, currentObservation); }
        if (!acquiredEvidenceValid(acquired, cognition.evidenceRequest, currentAvailableEvidence, currentFiles)) {
          return finish("BLOCKED", "repair_acquired_evidence_provenance_invalid", iterations, currentObservation);
        }
        evidenceAcquisitions.push(Object.freeze({ cognitionCycle, cognitionEvidenceId: cognition.evidence.evidenceId,
          cognitionEvidence: cognition.evidence,
          requestDigest: cognition.evidenceRequest.requestDigest,
          requestedEvidenceRefs: Object.freeze([...acquired.requestedEvidenceRefs]),
          admittedEvidenceIds: Object.freeze([...acquired.evidenceIds]),
          admittedPaths: Object.freeze(acquired.files.map((file) => file.relativePath)), authorityGranted: false }));
        const requested = new Set<string>(acquired.requestedEvidenceRefs);
        currentFiles = Object.freeze([...currentFiles, ...acquired.files]);
        currentAvailableEvidence = Object.freeze(currentAvailableEvidence.filter((item) => !requested.has(item.evidenceRef)));
        continue;
      }
      if (cognition.decision !== "PROPOSED" || !cognition.hypothesis) {
        const outcome = cognition.decision === "BLOCKED" || cognition.decision === "REJECTED" || cognition.decision === "NO_ACTION"
          ? "BLOCKED" : "COGNITION_ERROR";
        return finish(outcome, `repair_cognition_${cognition.reason}`, iterations, currentObservation);
      }
      let candidate: OmegaPreparedRepairCandidate;
      const iteration = iterations.length + 1;
      try { candidate = await this.#config.candidateBuilder.prepare(cognition.hypothesis, iteration); }
      catch { return finish("INFRASTRUCTURE_ERROR", "omega_candidate_preparation_failed", iterations, currentObservation); }
      if (!preparedCandidateValid(candidate, cognition.hypothesis, currentFiles)) {
        return finish("BLOCKED", "omega_prepared_candidate_provenance_invalid", iterations, currentObservation);
      }
      const candidateContexts = expectedCandidateContexts(currentFiles, cognition.hypothesis);
      const verifications: R3RepairVerificationRecord[] = [];
      for (const verification of candidate.verifications) {
        if (Date.now() - started >= this.#config.maxWallClockMs) return finish("EXHAUSTED", "repair_wall_clock_budget_exhausted", iterations, currentObservation);
        const execution = await verification.executor.execute(verification.request);
        if (execution.evidence.toolKind === "UNKNOWN") return finish("BLOCKED", "repair_verification_tool_kind_unknown", iterations, currentObservation);
        const baseline = baselineByTool.get(verification.toolId);
        if (!baseline) return finish("BLOCKED", "repair_verification_baseline_missing", iterations, currentObservation);
        const observed = observeEngineeringExecution({ schemaVersion: 1,
          observationRequestId: `${request.repairRequestId}-OBSERVATION-${iteration}-${verification.toolId}`,
          observerIdentity: this.#config.observerIdentity, evaluatorVersion: this.#config.evaluatorVersion,
          expected: { candidateCommit: execution.evidence.candidateCommit, disposableRepositoryId: candidate.application.disposableRepositoryId,
            applicationId: candidate.application.applicationId, proposalDigest: candidate.application.proposalDigest,
            toolId: verification.toolId, toolKind: execution.evidence.toolKind,
            toolIdentityDigest: execution.evidence.toolIdentityDigest, environmentIdentity: execution.evidence.environmentIdentity },
          candidate: execution, baseline,
          observedAtEpochMs: Math.max(Date.now(), execution.evidence.endedAtEpochMs) });
        if (observed.decision !== "OBSERVED" || !observed.observation || observed.observation.epistemicState === "CONFLICTED") {
          return finish("BLOCKED", `repair_observation_${observed.reason}`, iterations, currentObservation);
        }
        verifications.push(Object.freeze({ toolId: verification.toolId, execution, observation: observed.observation }));
      }
      const functionallyPassed = verifications.length > 0 && verifications.every((item) => passing(item.observation));
      const candidateAdmission = functionallyPassed ? admitStaticEngineeringCandidate({ schemaVersion: 1,
        reviewId: `${request.repairRequestId}-CANDIDATE-ADMISSION-${iteration}`,
        evaluatorVersion: `${this.#config.evaluatorVersion}/candidate-admission-1`,
        candidateCommit: candidate.proposal.baseCandidateCommit,
        lineage: { hypothesisId: cognition.hypothesis.hypothesisId, hypothesisDigest: cognition.hypothesis.proposalDigest,
          proposalId: candidate.proposal.proposalId, proposalDigest: candidate.proposal.proposalDigest,
          applicationId: candidate.application.applicationId },
        hypothesis: cognition.hypothesis, proposal: candidate.proposal, application: candidate.application,
        baselineFiles: Object.freeze(Object.fromEntries(currentFiles.map((file) => [file.relativePath, file.content]))),
        candidateFiles: Object.freeze(Object.fromEntries(candidateContexts.map((file) => [file.relativePath, file.content]))),
        allowedMutationPaths: request.allowedMutationPaths }) : null;
      const passed = functionallyPassed && candidateAdmission?.decision === "ADMITTED";
      const hypothesisDisposition = passed ? "SUPPORTED" as const
        : candidateAdmission?.decision === "INSUFFICIENT_EVIDENCE" ? "INSUFFICIENT_EVIDENCE" as const
          : functionallyPassed ? "PARTIALLY_SUPPORTED" as const : "FALSIFIED" as const;
      const record: R3RepairIteration = Object.freeze({ iteration, inputObservationId: currentObservation.observationId,
        cognitionEvidenceId: cognition.evidence.evidenceId, cognitionEvidence: cognition.evidence, hypothesis: cognition.hypothesis,
        hypothesisDisposition,
        proposalDigest: candidate.proposal.proposalDigest, applicationId: candidate.application.applicationId,
        applicationDecision: candidate.application.decision, verifications: Object.freeze(verifications), candidateAdmission,
        functionallyPassed, passed });
      iterations.push(record);
      if (candidateAdmission?.decision === "INSUFFICIENT_EVIDENCE") {
        return finish("BLOCKED", "candidate_admission_evidence_insufficient", iterations, currentObservation);
      }
      if (passed) return finish("FUNCTIONALLY_REPAIRED_VERIFIED", "bounded_repair_functionally_verified", iterations, verifications[0].observation);
      if (functionallyPassed && candidateAdmission?.decision === "REJECTED") {
        priorHypotheses.push(Object.freeze({ hypothesisId: cognition.hypothesis.hypothesisId,
          parentHypothesisId: cognition.hypothesis.parentHypothesisId, causalHypothesis: cognition.hypothesis.causalHypothesis,
          expectedResult: cognition.hypothesis.expectedResult, strategyDigest: cognition.hypothesis.strategyDigest,
          disposition: "PARTIALLY_SUPPORTED",
          verificationEvidenceRefs: Object.freeze([...verifications.map((item) => item.execution.evidence.evidenceId),
            candidateAdmission.evidenceId]) }));
        candidateQualityFeedback = Object.freeze({ assessmentId: candidateAdmission.reviewId,
          evidenceId: candidateAdmission.evidenceId, hypothesisId: cognition.hypothesis.hypothesisId,
          proposalDigest: candidate.proposal.proposalDigest, applicationId: candidate.application.applicationId,
          findings: Object.freeze(candidateAdmission.findings.map((finding) => Object.freeze({
            dimension: finding.dimension, code: finding.code, paths: Object.freeze([...finding.paths]),
          }))), hiddenEvidenceUsed: false, authorityGranted: false });
        currentObservation = verifications[0].observation;
        currentFiles = candidateContexts;
        continue;
      }
      const nextFailure = verifications.find((item) => failing(item.observation));
      if (!nextFailure) return finish("BLOCKED", "repair_verification_state_not_actionable", iterations, currentObservation);
      priorHypotheses.push(Object.freeze({ hypothesisId: cognition.hypothesis.hypothesisId,
        parentHypothesisId: cognition.hypothesis.parentHypothesisId, causalHypothesis: cognition.hypothesis.causalHypothesis,
        expectedResult: cognition.hypothesis.expectedResult, strategyDigest: cognition.hypothesis.strategyDigest,
        disposition: "FALSIFIED", verificationEvidenceRefs: Object.freeze(verifications.map((item) => item.execution.evidence.evidenceId)) }));
      currentObservation = nextFailure.observation;
      currentFiles = candidateContexts;
      candidateQualityFeedback = null;
    }
    return finish("EXHAUSTED", "repair_iteration_budget_exhausted", iterations, currentObservation);
  }

  #result(outcome: R3BoundedRepairResult["outcome"], reason: string, iterations: readonly R3RepairIteration[],
    evidenceAcquisitions: readonly R3EvidenceAcquisitionRecord[], cognitionFailures: readonly R3CognitionFailureRecord[],
    finalObservation: EngineeringObservation, started: number, modelCallCount: number,
    lastCognitionEvidence: NyxRepairCognitionEvidence | null): R3BoundedRepairResult {
    const durationMs = Math.max(0, Date.now() - started);
    const candidateAdmissionAcceptance = outcome === "FUNCTIONALLY_REPAIRED_VERIFIED"
      && iterations.at(-1)?.candidateAdmission?.decision === "ADMITTED" ? "ACCEPTED" as const
      : iterations.some((item) => item.candidateAdmission?.decision === "INSUFFICIENT_EVIDENCE")
        ? "INSUFFICIENT_EVIDENCE" as const
      : iterations.some((item) => item.candidateAdmission?.decision === "REJECTED")
        ? "NOT_ACCEPTED" as const : "NOT_EVALUATED" as const;
    const evidenceId = `R3E-EVIDENCE-${sha256(canonical({ loopId: this.#config.loopId, outcome, reason,
      iterations: iterations.map((item) => ({ iteration: item.iteration, hypothesis: item.hypothesis.proposalDigest,
        proposal: item.proposalDigest, application: item.applicationId,
        functionallyPassed: item.functionallyPassed, hypothesisDisposition: item.hypothesisDisposition,
        candidateAdmission: item.candidateAdmission ? { decision: item.candidateAdmission.decision,
          evidence: item.candidateAdmission.evidenceId, digest: item.candidateAdmission.evidenceDigest } : null,
        verifications: item.verifications.map((verification) => ({ tool: verification.toolId,
          evidence: verification.execution.evidence.evidenceId, observation: verification.observation.observationId })) })),
      evidenceAcquisitions: evidenceAcquisitions.map((item) => ({ request: item.requestDigest, evidence: item.admittedEvidenceIds })),
      cognitionFailures: cognitionFailures.map((item) => ({ cycle: item.cognitionCycle, reason: item.reason,
        evidence: item.cognitionEvidence.evidenceId, diagnostics: item.diagnostics })),
      finalObservation: finalObservation.observationId })).slice(0, 32)}`;
    return Object.freeze({ outcome, reason, iterations: Object.freeze([...iterations]),
      evidenceAcquisitions: Object.freeze([...evidenceAcquisitions]), cognitionFailures: Object.freeze([...cognitionFailures]),
      finalObservation, evidenceId,
      evidenceClass: "E3", modelCallCount, lastCognitionEvidence, durationMs,
      functionalAcceptance: iterations.some((item) => item.functionallyPassed) ? "ACCEPTED" : "NOT_ACCEPTED",
      engineeringQualityAcceptance: "NOT_EVALUATED", candidateAdmissionAcceptance,
      authorityGranted: false, sourceRepositoryWriteAuthority: false, productionAuthority: false });
  }
}
