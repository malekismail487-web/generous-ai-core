import { createHash } from "node:crypto";
import type { OmegaRepairVerification } from "../engine/r3BoundedRepairLoop";
import { immutableTheoryValue, theoryDigest, theoryText } from "./theoryContracts";
import type { ResearchExperiment, ResearchExperimentObservation, ResearchPartyObjective } from "./researchPartyContracts";
import type { ResearchExperimentRunner } from "./theoryResearchParty";

export interface OmegaResearchExperimentBinding {
  readonly experimentId: string;
  readonly verification: OmegaRepairVerification;
  /** Exact sanitized stdout digest -> semantic outcome. Raw output is never an instruction. */
  readonly outcomeByOutputDigest: Readonly<Record<string, string>>;
}

export class OmegaResearchExperimentRunner implements ResearchExperimentRunner {
  readonly #bindings: ReadonlyMap<string, OmegaResearchExperimentBinding>;
  readonly #used = new Set<string>();

  private constructor(bindings: readonly OmegaResearchExperimentBinding[]) {
    // Executor instances contain private state and are intentionally retained by identity.
    this.#bindings = new Map(bindings.map((item) => [item.experimentId, Object.freeze({ ...item,
      outcomeByOutputDigest: Object.freeze({ ...item.outcomeByOutputDigest }) })]));
  }

  static create(bindings: readonly OmegaResearchExperimentBinding[]): OmegaResearchExperimentRunner {
    if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 64
      || new Set(bindings.map((item) => item.experimentId)).size !== bindings.length) {
      throw new Error("omega_research_experiment_catalog_invalid");
    }
    for (const binding of bindings) {
      const outputs = Object.entries(binding?.outcomeByOutputDigest ?? {});
      if (!binding?.experimentId || binding.verification?.toolId !== binding.verification?.request.toolId
        || outputs.length < 1 || outputs.length > 32 || outputs.some(([digest, outcome]) =>
          !/^[a-f0-9]{64}$/.test(digest) || !theoryText(outcome, 500))) {
        throw new Error("omega_research_experiment_binding_invalid");
      }
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
    const outcome = binding.outcomeByOutputDigest[outputDigest];
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
