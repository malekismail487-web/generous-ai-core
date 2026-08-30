import { createHash } from "node:crypto";
import type { NyxEngineeringFileContext, NyxNemotronEngineeringCognition, NyxRepairCognitionEvidence, NyxRepairHypothesis } from "../cognition/nyxNemotronEngineeringCognition";
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

export interface R3BoundedRepairLoopConfig {
  readonly loopId: string;
  readonly evaluatorVersion: string;
  readonly observerIdentity: string;
  readonly cognition: NyxNemotronEngineeringCognition;
  readonly candidateBuilder: OmegaRepairCandidateBuilder;
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
  readonly proposalDigest: string;
  readonly applicationId: string;
  readonly applicationDecision: R3AApplyResult["decision"];
  readonly verifications: readonly R3RepairVerificationRecord[];
  readonly passed: boolean;
}

export interface R3BoundedRepairResult {
  readonly outcome: "FUNCTIONALLY_REPAIRED_VERIFIED" | "EXHAUSTED" | "BLOCKED" | "COGNITION_ERROR" | "INFRASTRUCTURE_ERROR";
  readonly reason: string;
  readonly iterations: readonly R3RepairIteration[];
  readonly finalObservation: EngineeringObservation;
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly modelCallCount: number;
  readonly lastCognitionEvidence: NyxRepairCognitionEvidence | null;
  readonly durationMs: number;
  readonly functionalAcceptance: "ACCEPTED" | "NOT_ACCEPTED";
  readonly engineeringQualityAcceptance: "NOT_EVALUATED";
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

function preparedCandidateValid(candidate: OmegaPreparedRepairCandidate, hypothesis: NyxRepairHypothesis): boolean {
  if (candidate.hypothesisId !== hypothesis.hypothesisId || candidate.hypothesisDigest !== hypothesis.proposalDigest
    || candidate.omegaAuthorityBoundary !== "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY" || candidate.sourceRepositoryMutated
    || candidate.productionAuthorityGranted || candidate.proposal.applyAuthorized || !candidate.proposal.rollbackRequiredBeforeApply
    || !patchDigestValid(candidate.proposal) || candidate.application.decision !== "APPLIED" || candidate.application.authorityGranted
    || candidate.application.sourceRepositoryMutated || candidate.application.proposalDigest !== candidate.proposal.proposalDigest
    || !fileContextsValid(candidate.files)) return false;
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
    const finish = (outcome: R3BoundedRepairResult["outcome"], reason: string,
      iterations: readonly R3RepairIteration[], observation: EngineeringObservation): R3BoundedRepairResult =>
      this.#result(outcome, reason, iterations, observation, started, modelCallCount, lastCognitionEvidence);
    const initialExecution = request.baselineExecutions.find((item) => item.toolId === request.initialObservation.toolId
      && item.result.evidence.evidenceId === request.initialObservation.candidateEvidenceId);
    if (request.schemaVersion !== 1 || !request.repairRequestId?.trim() || typeof request.objective !== "string"
      || !request.objective.trim() || request.objective.length > 2_000 || !Number.isFinite(request.observedAtEpochMs)
      || !failing(request.initialObservation) || request.initialObservation.grantsAuthority || !fileContextsValid(request.initialFiles)
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
    let currentFiles = request.initialFiles;
    const iterations: R3RepairIteration[] = [];
    for (let iteration = 1; iteration <= this.#config.maxIterations; iteration += 1) {
      if (Date.now() - started >= this.#config.maxWallClockMs) return finish("EXHAUSTED", "repair_wall_clock_budget_exhausted", iterations, currentObservation);
      const cognition = await this.#config.cognition.proposeRepair({ schemaVersion: 1,
        cognitionRequestId: `${request.repairRequestId}-COGNITION-${iteration}`, objective: request.objective,
        observation: currentObservation, files: currentFiles,
        allowedVerificationToolIds: request.allowedVerificationToolIds, maxChanges: this.#config.maxChangesPerIteration,
        maxPatchBytes: this.#config.maxPatchBytesPerIteration, maxDiagnosisCharacters: this.#config.maxDiagnosisCharacters,
        observedAtEpochMs: Math.max(request.observedAtEpochMs, Date.now()) });
      lastCognitionEvidence = cognition.evidence;
      if (cognition.evidence.modelEvidenceId !== "NOT_INVOKED") modelCallCount += 1;
      if (cognition.decision !== "PROPOSED" || !cognition.hypothesis) {
        const outcome = cognition.decision === "BLOCKED" || cognition.decision === "REJECTED" || cognition.decision === "NO_ACTION"
          ? "BLOCKED" : "COGNITION_ERROR";
        return finish(outcome, `repair_cognition_${cognition.reason}`, iterations, currentObservation);
      }
      let candidate: OmegaPreparedRepairCandidate;
      try { candidate = await this.#config.candidateBuilder.prepare(cognition.hypothesis, iteration); }
      catch { return finish("INFRASTRUCTURE_ERROR", "omega_candidate_preparation_failed", iterations, currentObservation); }
      if (!preparedCandidateValid(candidate, cognition.hypothesis)) {
        return finish("BLOCKED", "omega_prepared_candidate_provenance_invalid", iterations, currentObservation);
      }
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
      const passed = verifications.length > 0 && verifications.every((item) => passing(item.observation));
      const record: R3RepairIteration = Object.freeze({ iteration, inputObservationId: currentObservation.observationId,
        cognitionEvidenceId: cognition.evidence.evidenceId, cognitionEvidence: cognition.evidence, hypothesis: cognition.hypothesis,
        proposalDigest: candidate.proposal.proposalDigest, applicationId: candidate.application.applicationId,
        applicationDecision: candidate.application.decision, verifications: Object.freeze(verifications), passed });
      iterations.push(record);
      if (passed) return finish("FUNCTIONALLY_REPAIRED_VERIFIED", "bounded_repair_functionally_verified", iterations, verifications[0].observation);
      const nextFailure = verifications.find((item) => failing(item.observation));
      if (!nextFailure) return finish("BLOCKED", "repair_verification_state_not_actionable", iterations, currentObservation);
      currentObservation = nextFailure.observation;
      currentFiles = candidate.files;
    }
    return finish("EXHAUSTED", "repair_iteration_budget_exhausted", iterations, currentObservation);
  }

  #result(outcome: R3BoundedRepairResult["outcome"], reason: string, iterations: readonly R3RepairIteration[],
    finalObservation: EngineeringObservation, started: number, modelCallCount: number,
    lastCognitionEvidence: NyxRepairCognitionEvidence | null): R3BoundedRepairResult {
    const durationMs = Math.max(0, Date.now() - started);
    const evidenceId = `R3E-EVIDENCE-${sha256(canonical({ loopId: this.#config.loopId, outcome, reason,
      iterations: iterations.map((item) => ({ iteration: item.iteration, hypothesis: item.hypothesis.proposalDigest,
        proposal: item.proposalDigest, application: item.applicationId,
        verifications: item.verifications.map((verification) => ({ tool: verification.toolId,
          evidence: verification.execution.evidence.evidenceId, observation: verification.observation.observationId })) })),
      finalObservation: finalObservation.observationId })).slice(0, 32)}`;
    return Object.freeze({ outcome, reason, iterations: Object.freeze([...iterations]), finalObservation, evidenceId,
      evidenceClass: "E3", modelCallCount, lastCognitionEvidence, durationMs,
      functionalAcceptance: outcome === "FUNCTIONALLY_REPAIRED_VERIFIED" ? "ACCEPTED" : "NOT_ACCEPTED",
      engineeringQualityAcceptance: "NOT_EVALUATED", authorityGranted: false, sourceRepositoryWriteAuthority: false, productionAuthority: false });
  }
}
