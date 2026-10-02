import { TheoryNetwork } from "./theoryNetwork";
import { immutableTheoryValue, theoryDigest, type TheoryLease, type TheoryPrediction } from "./theoryContracts";
import { ResearchEvidenceGraph } from "./researchEvidenceGraph";
import { allocateHypothesisCoverage } from "./hypothesisCoverage";
import { sparseTheoryPerspectiveRouter, validTheoryPerspectiveRoute,
  type TheoryPerspectiveRouter } from "./sparseTheoryRouter";
import { researchObjectiveDigest, researchCognitionOutcomeClass, researchPredictionId, validResearchLimits, validResearchObjective,
  type ResearchExperiment, type ResearchExperimentObservation, type ResearchPartyLimits,
  type ResearchPartyObjective, type ResearchPartyResult, type ResearchRole, type TheoryCognitionEvidence,
  type HypothesisAllocationPolicy, type TheoryHypothesisAllocation,
  type TheoryCognitionRequest, type TheoryCognitionResult, type TheoryContribution } from "./researchPartyContracts";

export interface TheoryCognitionEngine {
  readonly profile: () => Readonly<{ model: string }>;
  readonly think: (request: TheoryCognitionRequest) => Promise<TheoryCognitionResult>;
}

export interface ResearchExperimentRunner {
  readonly run: (experiment: ResearchExperiment, objective: ResearchPartyObjective,
    signal: AbortSignal) => Promise<ResearchExperimentObservation>;
}

export interface TheoryResearchPartyConfig {
  readonly partyId: string;
  readonly network: TheoryNetwork;
  readonly coordinator: object;
  readonly cognition: TheoryCognitionEngine;
  readonly experiments: ResearchExperimentRunner;
  readonly limits: ResearchPartyLimits;
  readonly investigatorCount: number;
  /** Delivery-pressure experiment only. Default preserves existing parallel scheduling. */
  readonly maxParallelModelExecutions?: number;
  readonly now: () => number;
  readonly perspectiveRouter?: TheoryPerspectiveRouter;
  /** Experimental sequencing only: neither policy adds tools, evidence, or authority. */
  readonly experimentPolicy?: "REVISE_AFTER_OBSERVATION" | "EXHAUST_PRECOMMITTED_FORECASTS";
  /** Opt-in exploration intervention. The default cognition/acceptance behavior is unchanged. */
  readonly hypothesisAllocationPolicy?: HypothesisAllocationPolicy;
  /** Evaluation delivery policy only: stop after existing provider recovery is exhausted. */
  readonly stopOnProviderFailure?: boolean;
}

interface EntityRuntime {
  readonly theoryId: string;
  readonly guardianId: string;
  readonly initialRole: ResearchRole;
  readonly lease: TheoryLease;
}

interface NetworkPredictionBinding {
  readonly theoryId: string;
  readonly experimentId: string;
  readonly predictionId: string;
  readonly candidateDigest: string;
  readonly expectedOutcome: string;
  readonly lease: TheoryLease;
}

/**
 * A finite research coalition over sparse theory identities. Nemotron supplies
 * cognition; this class supplies isolation, sequencing, evidence custody, and budgets.
 * It cannot execute an experiment except through the host-provided Omega runner.
 */
export class TheoryResearchParty {
  readonly #config: TheoryResearchPartyConfig;

  private constructor(config: TheoryResearchPartyConfig) { this.#config = config; }

  static create(config: TheoryResearchPartyConfig): TheoryResearchParty {
    if (!config.partyId?.trim() || !validResearchLimits(config.limits)
      || !Number.isSafeInteger(config.investigatorCount) || config.investigatorCount < 2
      || config.investigatorCount + 2 > config.limits.maxEntities || typeof config.now !== "function"
      || (config.maxParallelModelExecutions !== undefined && (!Number.isSafeInteger(config.maxParallelModelExecutions)
        || config.maxParallelModelExecutions < 1 || config.maxParallelModelExecutions > config.investigatorCount))
      || typeof config.cognition?.think !== "function" || typeof config.cognition?.profile !== "function"
      || typeof config.experiments?.run !== "function" || !config.coordinator || typeof config.coordinator !== "object"
      || (config.perspectiveRouter !== undefined && typeof config.perspectiveRouter?.route !== "function")
      || (config.experimentPolicy !== undefined && !["REVISE_AFTER_OBSERVATION",
        "EXHAUST_PRECOMMITTED_FORECASTS"].includes(config.experimentPolicy))
      || (config.hypothesisAllocationPolicy !== undefined && !["ROTATING_PARTITION",
        "COVERAGE_AWARE"].includes(config.hypothesisAllocationPolicy))
      || (config.stopOnProviderFailure !== undefined && typeof config.stopOnProviderFailure !== "boolean")) {
      throw new Error("theory_research_party_configuration_invalid");
    }
    return new TheoryResearchParty(Object.freeze({ ...config, limits: immutableTheoryValue(config.limits) }));
  }

  async investigate(objective: ResearchPartyObjective, signal = new AbortController().signal): Promise<ResearchPartyResult> {
    const started = this.#config.now();
    if (!validResearchObjective(objective, started)) return this.#emptyResult(objective.researchId ?? "MALFORMED",
      started, "BLOCKED", "research_objective_invalid");
    const graph = new ResearchEvidenceGraph(objective, started);
    if (graph.evidenceCount() > this.#config.limits.maxEvidenceItems) {
      return this.#emptyResult(objective.researchId, started, "BLOCKED", "research_party_initial_evidence_budget_exceeded");
    }
    const entities: EntityRuntime[] = [];
    const contributions: TheoryContribution[] = [];
    const observations: ResearchExperimentObservation[] = [];
    const cognitionEvidence: TheoryCognitionEvidence[] = [];
    const cognitionOutcomes: NonNullable<ResearchPartyResult["cognitionOutcomes"]>[number][] = [];
    const predictionBindings: NetworkPredictionBinding[] = [];
    const hypothesisAllocations: TheoryHypothesisAllocation[] = [];
    let allocationPhase = 0;
    let cognitiveRouting: ResearchPartyResult["cognitiveRouting"] = null;
    let modelCalls = 0;
    let reservedOutputTokens = 0;
    let knownPromptTokens = 0;
    let knownCompletionTokens = 0;
    let knownTotalTokens = 0;
    let usageComplete = true;
    let experimentCostUnits = 0;
    let peakParallelModelExecutions = 0;
    let peakActiveReasoners = 0;
    let failure: string | null = null;
    const deadline = Math.min(objective.expiryEpochMs, started + this.#config.limits.maxWallClockMs);
    const entityCount = this.#config.investigatorCount + 2;
    const finish = (): ResearchPartyResult => {
      const elapsed = Math.max(0, this.#config.now() - started);
      const decision = failure ? immutableTheoryValue({ state: "BLOCKED" as const, selectedTheoryId: null,
        selectedMechanismId: null, reason: failure, assessments: [], decisiveEvidenceIds: [],
        independentAcceptance: false as const, grantsAuthority: false as const }) : graph.decision();
      const metrics = this.#config.network.metrics();
      return immutableTheoryValue({ researchId: objective.researchId, decision, contributions, observations,
        cognitionEvidence, cognitionOutcomes, cognitiveRouting, hypothesisAllocations,
        resourceUsage: { modelCalls, experiments: observations.length, experimentCostUnits,
          promptTokens: usageComplete ? knownPromptTokens : null, completionTokens: usageComplete ? knownCompletionTokens : null,
          totalTokens: usageComplete ? knownTotalTokens : null, wallClockMs: elapsed },
        addressability: { reservedTheorySlots: metrics.reservedAddressSlots,
          materializedTheoryGuardianPairs: entityCount, peakActiveReasoners,
          simultaneousModelExecutions: peakParallelModelExecutions, distributedExecutionImplemented: false as const },
        evidenceChainComplete: !failure && graph.chainComplete(),
        actualReasoningEngine: cognitionEvidence.some((item) => item.evidenceClass === "E4")
          ? "SHARED_NEMOTRON" as const : "TEST_DOUBLE" as const,
        authorityGranted: false as const });
    };
    const timeLeft = (): boolean => !signal.aborted && this.#config.now() < deadline;
    const runCognitionPhase = async (jobs: readonly (() => Promise<TheoryContribution | null>)[]) => {
      const width = this.#config.maxParallelModelExecutions ?? this.#config.investigatorCount;
      for (let start = 0; start < jobs.length && !failure; start += width) {
        const batch = jobs.slice(start, start + width);
        peakParallelModelExecutions = Math.max(peakParallelModelExecutions, batch.length);
        await Promise.all(batch.map(job => job()));
      }
    };
    const call = async (entity: EntityRuntime, role: ResearchRole, instruction: string,
      privatePriorContributions: readonly TheoryContribution[], peerContributions: readonly TheoryContribution[],
      hypothesisAllocation?: TheoryHypothesisAllocation): Promise<TheoryContribution | null> => {
      if (!timeLeft()) { failure = signal.aborted ? "research_party_cancelled" : "research_party_time_budget_exhausted"; return null; }
      if (modelCalls >= this.#config.limits.maxModelCalls
        || reservedOutputTokens + this.#config.limits.maxOutputTokensPerCall > this.#config.limits.maxTotalOutputTokens) {
        failure = "research_party_model_budget_exhausted"; return null;
      }
      if (graph.evidenceCount() >= this.#config.limits.maxEvidenceItems) {
        failure = "research_party_evidence_budget_exhausted"; return null;
      }
      try { this.#config.network.assertActive(this.#config.coordinator, entity.lease); }
      catch { failure = "research_party_entity_lease_invalid"; return null; }
      const latestOwn = role === "REVISER" ? privatePriorContributions.at(-1) : undefined;
      const predictionFeedback = latestOwn ? observations.flatMap((observation) => {
        const forecast = latestOwn.intent.forecasts.find((item) => item.experimentId === observation.experimentId);
        if (!forecast) return [];
        const predictionId = researchPredictionId(latestOwn.contributionId, forecast.experimentId);
        const binding = predictionBindings.find((item) => item.theoryId === entity.theoryId
          && item.predictionId === predictionId && item.expectedOutcome === forecast.expectedOutcome);
        if (!binding) { failure = "research_party_prediction_feedback_unbound"; return []; }
        if (observation.evidence.evidenceClass === "E1") {
          failure = "research_party_prediction_feedback_not_external_evidence"; return [];
        }
        return [immutableTheoryValue({ contributionId: latestOwn.contributionId, predictionId,
          experimentId: forecast.experimentId, expectedOutcome: forecast.expectedOutcome,
          observedOutcome: observation.outcome, observationId: observation.observationId,
          evidenceId: observation.evidence.evidenceId,
          evidenceClass: observation.evidence.evidenceClass,
          disposition: forecast.expectedOutcome === observation.outcome
            ? "SUPPORTED_WITHIN_TEST_SCOPE" as const : "FALSIFIED_PREDICTION" as const,
          grantsAuthority: false as const })];
      }) : [];
      if (failure) return null;
      modelCalls += 1; reservedOutputTokens += this.#config.limits.maxOutputTokensPerCall;
      if (hypothesisAllocation) hypothesisAllocations.push(hypothesisAllocation);
      const requestId = `${this.#config.partyId}-${modelCalls}-${theoryDigest([entity.theoryId, role, instruction]).slice(0, 16)}`;
      const result = await this.#config.cognition.think(Object.freeze({ ...immutableTheoryValue({ schemaVersion: 1 as const, requestId, role,
        theoryId: entity.theoryId, guardianId: entity.guardianId, objective,
        privatePriorContributions, peerContributions, experimentObservations: observations,
        predictionFeedback, ...(hypothesisAllocation ? { hypothesisAllocation } : {}),
        instruction, maxOutputTokens: this.#config.limits.maxOutputTokensPerCall,
        observedAtEpochMs: this.#config.now(),
        deadlineEpochMs: Math.min(deadline, entity.lease.expiresAtEpochMs) }), signal }));
      cognitionEvidence.push(result.evidence);
      cognitionOutcomes.push(immutableTheoryValue({ requestId, role, decision: result.decision,
        reason: result.reason, diagnostics: result.diagnostics, outcomeClass: researchCognitionOutcomeClass(result) }));
      // Delivered usage covers only the final HTTP attempt. Discarded failed
      // attempts may have consumed model compute; never call that a full total.
      if ((result.evidence.delivery?.httpAttempts ?? 1) > 1) usageComplete = false;
      if (result.evidence.promptTokens === null || result.evidence.completionTokens === null
        || result.evidence.totalTokens === null) usageComplete = false;
      else { knownPromptTokens += result.evidence.promptTokens; knownCompletionTokens += result.evidence.completionTokens;
        knownTotalTokens += result.evidence.totalTokens; }
      // Awaiting cognition can outlive the lease checked before dispatch. Keep
      // delivery evidence, but never admit a late result into the causal graph.
      // This narrows the request deadline; it does not renew any authority.
      if (!timeLeft()) {
        failure = signal.aborted ? "research_party_cancelled" : "research_party_time_budget_exhausted";
        return null;
      }
      if (result.decision !== "CONTRIBUTION" || !result.intent) {
        if (["WAITING_FOR_CAPACITY", "BLOCKED"].includes(result.decision)) failure = result.reason;
        if (this.#config.stopOnProviderFailure && researchCognitionOutcomeClass(result) === "PROVIDER_FAILURE") {
          failure = "research_party_provider_unavailable";
        }
        return null;
      }
      try { this.#config.network.assertActive(this.#config.coordinator, entity.lease); }
      catch { failure = "research_party_entity_lease_invalid_after_cognition"; return null; }
      const modelEvidence = immutableTheoryValue({ evidenceId: `E1-${theoryDigest([requestId, result.intent]).slice(0, 48)}`,
        evidenceClass: "E1" as const, kind: "MODEL_CONTRIBUTION" as const,
        summary: `${role} contribution generated by the shared model; this is a claim, not truth evidence.`,
        contentDigest: theoryDigest(result.intent), provenanceRoot: `MODEL-${theoryDigest(this.#config.cognition.profile().model).slice(0, 32)}`,
        freshnessDependencies: [`CANDIDATE:${objective.candidateBinding}`], observedAtEpochMs: this.#config.now(),
        candidateBinding: objective.candidateBinding, grantsAuthority: false as const });
      const contributionId = `CONTRIBUTION-${theoryDigest([entity.theoryId, requestId, result.intent]).slice(0, 40)}`;
      const contributionBase = { contributionId, theoryId: entity.theoryId, guardianId: entity.guardianId,
        role, objectiveDigest: researchObjectiveDigest(objective), intent: result.intent, modelEvidence,
        committedAtEpochMs: this.#config.now() };
      const contribution = immutableTheoryValue({ ...contributionBase,
        contributionDigest: theoryDigest({ contributionId, theoryId: entity.theoryId, guardianId: entity.guardianId,
          role, objectiveDigest: researchObjectiveDigest(objective), intent: result.intent,
          modelEvidenceId: modelEvidence.evidenceId, committedAtEpochMs: contributionBase.committedAtEpochMs }),
        grantsAuthority: false as const });
      const predictions: TheoryPrediction[] = ["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"].includes(contribution.intent.decision)
        ? contribution.intent.forecasts.map(forecast => ({
          predictionId: researchPredictionId(contribution.contributionId, forecast.experimentId),
          statement: contribution.intent.causalMechanism!, expectedResult: forecast.expectedOutcome,
          candidateDigest: theoryDigest({ contribution: contribution.contributionDigest,
            experimentId: forecast.experimentId, expectedOutcome: forecast.expectedOutcome }),
          evidenceRefs: contribution.intent.evidenceRefs, assumptions: contribution.intent.assumptions,
          uncertainties: contribution.intent.uncertainties,
          // Full counterexamples remain in the contribution. Custody stores
          // references rather than lossy excerpts exceeding its text bound.
          proposedCounterexamples: contribution.intent.counterexamples.slice(0, 5).map(item => `COUNTEREXAMPLE:${theoryDigest(item)}`),
          expectedPassingTools: [objective.experimentCatalog.find(item => item.experimentId === forecast.experimentId)?.toolId ?? ""],
          modelEstimate: contribution.intent.modelEstimate,
        })) : [];
      if (predictions.length) {
        try { this.#config.network.assertPredictionsAdmissible(this.#config.coordinator, entity.lease, predictions); }
        catch { failure = "research_party_prediction_not_precommitted"; return null; }
      }
      try { graph.commitContribution(contribution); }
      catch { failure = "research_party_contribution_not_admitted"; return null; }
      contributions.push(contribution);
      if (["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"].includes(contribution.intent.decision)) {
        for (const [index, forecast] of contribution.intent.forecasts.entries()) {
          const prediction = predictions[index];
          const { predictionId, candidateDigest } = prediction;
          try { this.#config.network.commitPrediction(this.#config.coordinator, entity.lease, prediction); }
          catch { failure = "research_party_prediction_not_precommitted"; return null; }
          predictionBindings.push({ theoryId: entity.theoryId, experimentId: forecast.experimentId,
            predictionId, candidateDigest, expectedOutcome: forecast.expectedOutcome, lease: entity.lease });
        }
      }
      return contribution;
    };
    const runExperiment = async (experiment: ResearchExperiment): Promise<boolean> => {
      if (!timeLeft()) { failure = signal.aborted ? "research_party_cancelled" : "research_party_time_budget_exhausted"; return false; }
      if (observations.length >= this.#config.limits.maxExperiments
        || experimentCostUnits + experiment.costUnits > this.#config.limits.maxCostUnits) {
        failure = "research_party_experiment_budget_exhausted"; return false;
      }
      if (graph.evidenceCount() >= this.#config.limits.maxEvidenceItems) {
        failure = "research_party_evidence_budget_exhausted"; return false;
      }
      let observation: ResearchExperimentObservation;
      try { observation = await this.#config.experiments.run(experiment, objective, signal); }
      catch { failure = "research_party_experiment_infrastructure_failure"; return false; }
      if (observation.evidence.evidenceClass === "E1") {
        failure = "research_party_experiment_cannot_use_model_claim_as_observation"; return false;
      }
      try { graph.recordObservation(observation); }
      catch { failure = "research_party_experiment_evidence_not_admitted"; return false; }
      observations.push(observation); experimentCostUnits += experiment.costUnits;
      for (const binding of predictionBindings.filter((item) => item.experimentId === experiment.experimentId)) {
        try { this.#config.network.observe(this.#config.coordinator, binding.lease, {
          evidenceId: `DERIVED-${theoryDigest([observation.evidence.evidenceId, binding.predictionId]).slice(0, 48)}`,
          predictionId: binding.predictionId, candidateDigest: binding.candidateDigest, toolId: experiment.toolId,
          result: binding.expectedOutcome === observation.outcome ? "PASS" : "FAIL",
          evidenceClass: observation.evidence.evidenceClass, environmentIdentity: observation.executionIdentity,
          provenanceRoot: observation.evidence.provenanceRoot }); }
        catch { failure = "research_party_theory_observation_not_admitted"; return false; }
      }
      return true;
    };

    try {
      cognitiveRouting = (this.#config.perspectiveRouter ?? sparseTheoryPerspectiveRouter)
        .route(objective, this.#config.investigatorCount);
      if (!validTheoryPerspectiveRoute(cognitiveRouting, objective, this.#config.investigatorCount)) {
        failure = "research_party_cognitive_route_invalid"; return finish();
      }
      const reservation = this.#config.network.reserve(this.#config.coordinator, entityCount.toString());
      const first = BigInt(reservation.firstId.slice(reservation.firstId.lastIndexOf(":") + 1));
      const roles: ResearchRole[] = [...Array(this.#config.investigatorCount).fill("INVESTIGATOR"), "FALSIFIER", "META_REVIEWER"];
      const namespace = reservation.firstId.slice(0, reservation.firstId.lastIndexOf(":") + 1);
      for (const [index, role] of roles.entries()) {
        const theoryId = `${namespace}${first + BigInt(index)}`;
        this.#config.network.assign(this.#config.coordinator, theoryId, { objective: objective.objective,
          question: role === "INVESTIGATOR" ? `Independently explain the causal mechanism using the ${cognitiveRouting.assignments[index].perspectiveId} compartment.`
            : role === "FALSIFIER" ? "Find decisive counterexamples to the independent hypotheses."
              : "Audit the party's evidence coverage without self-certifying the answer.",
          domain: objective.domain, candidateBinding: objective.candidateBinding, scope: objective.scope,
          assumptions: ["The bounded mechanism catalog may be incomplete.", "Model agreement is not experimental evidence."] });
      }
      // Roles wait dormant until their phase begins. Taking a lease here for
      // the final reviewer would spend its lifetime on other entities' work.
      // Each role is activated once; existing leases are never renewed.
      const activateRole = (role: ResearchRole, index: number): EntityRuntime | null => {
        const theoryId = `${namespace}${first + BigInt(index)}`;
        this.#config.network.wake(this.#config.coordinator, theoryId, {
          eventId: `${this.#config.partyId}-${role}-${index}`, kind: "ASSIGNMENT",
          reason: "Research-party phase starts." });
        const lease = this.#config.network.take(this.#config.coordinator, theoryId);
        if (!lease) { failure = "research_party_activation_capacity_unavailable"; return null; }
        const entity = { theoryId: lease.theoryId, guardianId: lease.guardianId, initialRole: role, lease };
        entities.push(entity);
        peakActiveReasoners = Math.max(peakActiveReasoners, this.#config.network.metrics().activePairs);
        return entity;
      };
      for (let index = 0; index < this.#config.investigatorCount; index++) {
        if (!activateRole("INVESTIGATOR", index)) break;
      }
      if (failure) return finish();
      const investigators = entities.filter((item) => item.initialRole === "INVESTIGATOR");
      const allocatePhase = (phaseOrdinal: number, cohort = investigators) => this.#config.hypothesisAllocationPolicy
        ? allocateHypothesisCoverage({ objective, cohortTheoryIds: cohort.map(item => item.theoryId),
          contributions: phaseOrdinal === 0 ? [] : investigators.flatMap(entity =>
            [...contributions].reverse().find(item => item.theoryId === entity.theoryId
              && ["INVESTIGATOR", "REVISER"].includes(item.role)) ?? []),
          observations, phaseOrdinal, policy: this.#config.hypothesisAllocationPolicy }) : [];
      const initialAllocations = allocatePhase(0);
      await runCognitionPhase(investigators.map((entity, index) => () => call(entity, "INVESTIGATOR",
        `Generate an independent causal hypothesis from the ${cognitiveRouting!.assignments[index].perspectiveId} compartment. ${cognitiveRouting!.assignments[index].instruction} Predict every catalogued experiment and request the most discriminating ones.`, [], [], initialAllocations[index])));
      if (failure) return finish();
      const hypotheses = contributions.filter((item) => item.intent.decision === "PROPOSE_HYPOTHESIS");
      if (hypotheses.length < 2) { failure = "research_party_insufficient_independent_hypotheses"; return finish(); }
      const falsifier = activateRole("FALSIFIER", this.#config.investigatorCount);
      if (!falsifier) return finish();
      await call(falsifier, "FALSIFIER", "Attack each hypothesis with a catalogued experiment/outcome that would disconfirm it. Do not select by confidence or majority.", [], hypotheses);
      if (failure) return finish();
      while (observations.length < this.#config.limits.maxExperiments) {
        const next = graph.selectNextExperiment(this.#config.limits.maxCostUnits - experimentCostUnits);
        if (!next) {
          if (observations.length === 0) failure = "research_party_no_discriminating_experiment";
          break;
        }
        if (!(await runExperiment(next))) break;
        if (graph.decision().state === "SUPPORTED_WITHIN_MODELED_FAMILY") break;
        const unobservedRemain = objective.experimentCatalog.some((experiment) =>
          !observations.some((observation) => observation.experimentId === experiment.experimentId));
        if (!unobservedRemain) break;
        // Predictions were committed before any outcome was known. Gather their
        // remaining external evidence before asking the model to rewrite them.
        // If the modeled family is exhausted, use the existing revision path;
        // this policy never manufactures a replacement hypothesis or observation.
        if (this.#config.experimentPolicy === "EXHAUST_PRECOMMITTED_FORECASTS") {
          if (observations.length >= this.#config.limits.maxExperiments) break;
          if (graph.selectNextExperiment(this.#config.limits.maxCostUnits - experimentCostUnits)) continue;
        }
        const falsifierContribution = contributions.find((item) => item.role === "FALSIFIER");
        const revisers = investigators.filter((entity) => {
          const latest = contributions.filter((item) => item.theoryId === entity.theoryId).at(-1);
          // A failed or abstaining investigator has no hypothesis to revise.
          // Do not consume a call reservation or invent another entity's history.
          return latest !== undefined && ["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"].includes(latest.intent.decision);
        });
        // Freeze all peer views before this phase, even when inference is serial.
        // Later entities must not see earlier revisions from the same phase.
        if (revisers.length === 0) break;
        const revisionAllocations = allocatePhase(++allocationPhase, revisers);
        const revisionJobs = revisers.map((entity) => {
          const own = contributions.filter((item) => item.theoryId === entity.theoryId);
          const latestPeers = investigators.filter((item) => item.theoryId !== entity.theoryId).map((peer) =>
            [...contributions].reverse().find((item) => item.theoryId === peer.theoryId
              && ["INVESTIGATOR", "REVISER"].includes(item.role))).filter((item): item is TheoryContribution => Boolean(item));
          if (falsifierContribution) latestPeers.push(falsifierContribution);
          return () => call(entity, "REVISER", "Revise your own mechanism using every observed counterexample. Forecast only experiments that have not yet been observed; do not defend a falsified mechanism.", own, latestPeers,
            revisionAllocations.find(item => item.theoryId === entity.theoryId));
        });
        await runCognitionPhase(revisionJobs);
        if (failure) break;
      }
      if (failure) return finish();
      const reviewer = activateRole("META_REVIEWER", this.#config.investigatorCount + 1);
      if (!reviewer) return finish();
      await call(reviewer, "META_REVIEWER",
        "Summarize unresolved conflicts and evidence gaps. Return NO_CONCLUSION; Omega's deterministic graph makes the acceptance decision.", [], contributions.filter((item) => item.role !== "META_REVIEWER"));
      return finish();
    } catch {
      failure = failure ?? "research_party_unexpected_integration_failure";
      return finish();
    } finally {
      for (const entity of entities) {
        try { this.#config.network.release(this.#config.coordinator, entity.lease); } catch { /* revocation is already terminal */ }
      }
    }
  }

  #emptyResult(researchId: string, started: number, state: "BLOCKED", reason: string): ResearchPartyResult {
    return immutableTheoryValue({ researchId, decision: { state, selectedTheoryId: null, selectedMechanismId: null,
      reason, assessments: [], decisiveEvidenceIds: [], independentAcceptance: false, grantsAuthority: false },
      contributions: [], observations: [], cognitionEvidence: [], cognitiveRouting: null,
      resourceUsage: { modelCalls: 0, experiments: 0,
        experimentCostUnits: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0,
        wallClockMs: Math.max(0, this.#config.now() - started) },
      addressability: { reservedTheorySlots: this.#config.network.metrics().reservedAddressSlots,
        materializedTheoryGuardianPairs: 0, peakActiveReasoners: 0, simultaneousModelExecutions: 0,
        distributedExecutionImplemented: false }, evidenceChainComplete: false,
      actualReasoningEngine: "TEST_DOUBLE", authorityGranted: false });
  }
}
