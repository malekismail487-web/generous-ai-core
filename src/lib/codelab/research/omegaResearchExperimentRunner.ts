import { createHash } from "node:crypto";
import type { OmegaRepairVerification } from "../engine/r3BoundedRepairLoop";
import { immutableTheoryValue, theoryDigest, theoryText } from "./theoryContracts";
import type { ResearchExperiment, ResearchExperimentObservation, ResearchPartyObjective } from "./researchPartyContracts";
import type { ResearchExperimentRunner } from "./theoryResearchParty";
import { canonicalRationalLiteral } from "./exactQuantitativeDerivation";
import { snapshotBoundedReasoningData } from "./boundedReasoningWorkbench";

export interface RationalResearchReadout {readonly kind:"RATIONAL_SCALAR";readonly label:string;readonly pointId:string;
  readonly inputs:readonly {readonly id:string;readonly value:string}[];
  readonly matching:readonly {readonly value:string;readonly outcome:string}[];readonly otherOutcome:string}

export interface OmegaResearchExperimentBinding {
  readonly experimentId: string;
  readonly verification: OmegaRepairVerification;
  /** Exact sanitized stdout digest -> semantic outcome. Raw output is never an instruction. */
  readonly outcomeByOutputDigest: Readonly<Record<string, string>>;
  /** Trusted host interpretation of a pinned measurement tool, NEVER supplied
   * by a model as an instruction. Unmodeled values refute all current forecasts.
   */
  readonly rationalReadout?:RationalResearchReadout;
}

export class OmegaResearchExperimentRunner implements ResearchExperimentRunner {
  readonly #bindings: ReadonlyMap<string, OmegaResearchExperimentBinding>;
  readonly #used = new Set<string>();

  private constructor(bindings: readonly OmegaResearchExperimentBinding[]) {
    // Executor instances contain private state and are intentionally retained by identity.
    this.#bindings = new Map(bindings.map((item) => [item.experimentId, Object.freeze({ ...item,
      outcomeByOutputDigest: Object.freeze({ ...item.outcomeByOutputDigest }),
      ...(item.rationalReadout?{rationalReadout:snapshotBoundedReasoningData(item.rationalReadout)}:{}) })]));
  }

  static create(bindings: readonly OmegaResearchExperimentBinding[]): OmegaResearchExperimentRunner {
    if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 64
      || new Set(bindings.map((item) => item.experimentId)).size !== bindings.length) {
      throw new Error("omega_research_experiment_catalog_invalid");
    }
    for (const binding of bindings) {
      const outputs = Object.entries(binding?.outcomeByOutputDigest ?? {});
      if (!binding?.experimentId || binding.verification?.toolId !== binding.verification?.request.toolId
        || (!binding.rationalReadout&&outputs.length<1)||outputs.length > 32 || outputs.some(([digest, outcome]) =>
          !/^[a-f0-9]{64}$/.test(digest) || !theoryText(outcome, 500))) {
        throw new Error("omega_research_experiment_binding_invalid");
      }
      if(binding.rationalReadout){
        const r=snapshotBoundedReasoningData(binding.rationalReadout);
        if(Object.keys(r).sort().join("|")!=="inputs|kind|label|matching|otherOutcome|pointId"||r.kind!=="RATIONAL_SCALAR"||!theoryText(r.label,48)
          ||r.pointId!==binding.experimentId||!Array.isArray(r.inputs)||r.inputs.length<1||r.inputs.length>3
          ||r.inputs.some(i=>!i||Object.keys(i).sort().join("|")!=="id|value"||!theoryText(i.id,48))||new Set(r.inputs.map(i=>i.id)).size!==r.inputs.length
          ||!Array.isArray(r.matching)||r.matching.length<1||r.matching.length>16||outputs.length!==0
          ||!theoryText(r.otherOutcome,500)||new Set(r.matching.map(m=>m.outcome)).size!==r.matching.length
          ||r.matching.some(m=>!m||Object.keys(m).sort().join("|")!=="outcome|value"||!theoryText(m.outcome,500)||m.outcome===r.otherOutcome)
          ||new Set(r.matching.map(m=>canonicalRationalLiteral(m.value))).size!==r.matching.length)throw Error("omega_rational_readout_invalid");
        for(const input of r.inputs)canonicalRationalLiteral(input.value);
      }
    }
    // R3B authority is single-use, regardless of how many tools its catalog has.
    // Sharing that executor across experiments guarantees a replay denial.
    if (new Set(bindings.map(item => item.verification.executor)).size !== bindings.length) {
      throw new Error("omega_research_single_use_executor_shared");
    }
    return new OmegaResearchExperimentRunner(bindings);
  }

  async run(experiment: ResearchExperiment, objective: ResearchPartyObjective,
    signal: AbortSignal): Promise<ResearchExperimentObservation> {
    if (signal.aborted) throw new Error("omega_research_experiment_cancelled");
    const binding = this.#bindings.get(experiment.experimentId);
    if (!binding || this.#used.has(experiment.experimentId) || binding.verification.toolId !== experiment.toolId
      || binding.verification.request.toolId !== experiment.toolId
      || binding.verification.request.environmentIdentity.trim().length < 1
      || binding.verification.request.observedAtEpochMs >= objective.expiryEpochMs) {
      throw new Error("omega_research_experiment_not_authorized");
    }
    this.#used.add(experiment.experimentId);
    const execution = await binding.verification.executor.execute(binding.verification.request);
    if (signal.aborted) throw new Error("omega_research_experiment_cancelled");
    const evidence = execution.evidence;
    const outputDigest = createHash("sha256").update(evidence.stdout.trim()).digest("hex");
    let outcome = binding.outcomeByOutputDigest[outputDigest];
    if(binding.rationalReadout){
      const r=binding.rationalReadout;
      if(Buffer.byteLength(evidence.stdout,"utf8")>4096)throw Error("omega_rational_readout_bytes");
      let measured:unknown;
      try{measured=snapshotBoundedReasoningData(JSON.parse(evidence.stdout.trim()));}catch{throw Error("omega_rational_measurement_invalid");}
      const m=measured as Record<string,unknown>;
      if(!measured||typeof measured!=="object"||Array.isArray(measured)||Object.keys(measured).sort().join("|")!=="inputs|label|pointId|schemaVersion|value"
        ||m.schemaVersion!==1||m.pointId!==r.pointId||m.label!==r.label||typeof m.value!=="string"||!Array.isArray(m.inputs)||m.inputs.length!==r.inputs.length
        ||m.inputs.some(i=>!i||typeof i!=="object"||Object.keys(i).sort().join("|")!=="id|value"||typeof i.id!=="string"||typeof i.value!=="string")
        ||new Set(m.inputs.map(i=>i.id)).size!==m.inputs.length
        ||m.inputs.some(i=>!r.inputs.some(w=>w.id===i.id&&canonicalRationalLiteral(w.value)===canonicalRationalLiteral(i.value))))throw Error("omega_rational_measurement_invalid");
      const value=canonicalRationalLiteral(m.value);outcome=r.matching.find(m=>canonicalRationalLiteral(m.value)===value)?.outcome??r.otherOutcome;
    }
    if (execution.outcome !== "PASS" || evidence.outcome !== execution.outcome || evidence.exitCode !== 0
      || !outcome || !experiment.possibleOutcomes.includes(outcome) || evidence.outputTruncated
      || evidence.changedPaths.length > 0 || evidence.unexpectedMutationPaths.length > 0
      || execution.authorityGranted || execution.generalShellAuthority || execution.sourceRepositoryWriteAuthority
      || execution.networkAuthority || execution.productionAuthority
      || evidence.candidateCommit !== objective.candidateBinding
      || evidence.toolId !== experiment.toolId || evidence.executionId !== binding.verification.request.executionId
      || evidence.disposableRepositoryId !== binding.verification.request.disposableRepositoryId
      || evidence.applicationId !== binding.verification.request.applicationId
      || evidence.proposalDigest !== binding.verification.request.proposalDigest
      || evidence.environmentIdentity !== binding.verification.request.environmentIdentity) {
      throw new Error("omega_research_experiment_evidence_invalid");
    }
    const content = { experimentId: experiment.experimentId, toolId: experiment.toolId, outcome,
      executionIdentity: evidence.executionId, outputDigest };
    return immutableTheoryValue({ observationId: `OBS-${theoryDigest([evidence.evidenceId, content]).slice(0, 48)}`,
      experimentId: experiment.experimentId, toolId: experiment.toolId, outcome,
      evidence: { evidenceId: `RESEARCH-${evidence.evidenceId}`, evidenceClass: "E3", kind: "EXPERIMENT_RESULT",
        summary: "Sanitized outcome admitted from a bounded Omega R3B execution.", contentDigest: theoryDigest(content),
        provenanceRoot: evidence.evidenceId, freshnessDependencies: [`CANDIDATE:${objective.candidateBinding}`],
        observedAtEpochMs: evidence.endedAtEpochMs, candidateBinding: objective.candidateBinding,
        grantsAuthority: false }, executionIdentity: evidence.executionId, outputDigest, authorityGranted: false });
  }
}
