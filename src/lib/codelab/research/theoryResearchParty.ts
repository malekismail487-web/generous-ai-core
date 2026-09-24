import { TheoryNetwork } from "./theoryNetwork";
import { immutableTheoryValue, theoryDigest, type TheoryLease } from "./theoryContracts";
import { ResearchEvidenceGraph } from "./researchEvidenceGraph";
import { sparseTheoryPerspectiveRouter, validTheoryPerspectiveRoute,
  type TheoryPerspectiveRouter } from "./sparseTheoryRouter";
import { researchObjectiveDigest, validResearchLimits, validResearchObjective,
  type ResearchExperiment, type ResearchExperimentObservation, type ResearchPartyLimits,
  type ResearchPartyObjective, type ResearchPartyResult, type ResearchRole, type TheoryCognitionEvidence,
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
  readonly now: () => number;
  readonly perspectiveRouter?: TheoryPerspectiveRouter;
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
      || typeof config.cognition?.think !== "function" || typeof config.cognition?.profile !== "function"
      || typeof config.experiments?.run !== "function" || !config.coordinator || typeof config.coordinator !== "object"
      || (config.perspectiveRouter !== undefined && typeof config.perspectiveRouter?.route !== "function")) {
      throw new Error("theory_research_party_configuration_invalid");
    }
    return new TheoryResearchParty(config);
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
    const predictionBindings: NetworkPredictionBinding[] = [];
    let cognitiveRouting: ResearchPartyResult["cognitiveRouting"] = null;
    let modelCalls = 0;
    let reservedOutputTokens = 0;
    let knownPromptTokens = 0;
    let knownCompletionTokens = 0;
    let knownTotalTokens = 0;
    let usageComplete = true;
    let experimentCostUnits = 0;
    let peakParallelModelExecutions = 0;
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
        cognitionEvidence, cognitiveRouting, resourceUsage: { modelCalls, experiments: observations.length, experimentCostUnits,
          promptTokens: usageComplete ? knownPromptTokens : null, completionTokens: usageComplete ? knownCompletionTokens : null,
          totalTokens: usageComplete ? knownTotalTokens : null, wallClockMs: elapsed },
        addressability: { reservedTheorySlots: metrics.reservedAddressSlots,
          materializedTheoryGuardianPairs: entityCount, peakActiveReasoners: entities.length,
          simultaneousModelExecutions: peakParallelModelExecutions, distributedExecutionImplemented: false as const },
        evidenceChainComplete: !failure && graph.chainComplete(),
        actualReasoningEngine: cognitionEvidence.some((item) => item.evidenceClass === "E4")
          ? "SHARED_NEMOTRON" as const : "TEST_DOUBLE" as const,
        authorityGranted: false as const });
    };
    const timeLeft = (): boolean => !signal.aborted && this.#config.now() < deadline;
    const call = async (entity: EntityRuntime, role: ResearchRole, instruction: string,
      privatePriorContributions: readonly TheoryContribution[], peerContributions: readonly TheoryContribution[]): Promise<TheoryContribution | null> => {
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
        const predictionId = `${latestOwn.contributionId}-${forecast.experimentId}`;
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
      const requestId = `${this.#config.partyId}-${modelCalls}-${theoryDigest([entity.theoryId, role, instruction]).slice(0, 16)}`;
      const result = await this.#config.cognition.think({ schemaVersion: 1, requestId, role,
        theoryId: entity.theoryId, guardianId: entity.guardianId, objective,
        privatePriorContributions, peerContributions, experimentObservations: observations,
        predictionFeedback,
        instruction, maxOutputTokens: this.#config.limits.maxOutputTokensPerCall,
        observedAtEpochMs: this.#config.now(), deadlineEpochMs: deadline, signal });
      cognitionEvidence.push(result.evidence);
      if (result.evidence.promptTokens === null || result.evidence.completionTokens === null
        || result.evidence.totalTokens === null) usageComplete = false;
      else { knownPromptTokens += result.evidence.promptTokens; knownCompletionTokens += result.evidence.completionTokens;
        knownTotalTokens += result.evidence.totalTokens; }
      if (result.decision !== "CONTRIBUTION" || !result.intent) {
        if (["WAITING_FOR_CAPACITY", "BLOCKED"].includes(result.decision)) failure = result.reason;
        return null;
      }
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
      try { graph.commitContribution(contribution); }
      catch { failure = "research_party_contribution_not_admitted"; return null; }
      contributions.push(contribution);
      if (["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"].includes(contribution.intent.decision)) {
        for (const forecast of contribution.intent.forecasts) {
          const experiment = objective.experimentCatalog.find((item) => item.experimentId === forecast.experimentId)!;
          const predictionId = `${contribution.contributionId}-${forecast.experimentId}`;
          const candidateDigest = theoryDigest({ contribution: contribution.contributionDigest,
            experimentId: forecast.experimentId, expectedOutcome: forecast.expectedOutcome });
          try { this.#config.network.commitPrediction(this.#config.coordinator, entity.lease, {
            predictionId, statement: contribution.intent.causalMechanism!, expectedResult: forecast.expectedOutcome,
            candidateDigest, evidenceRefs: contribution.intent.evidenceRefs,
            assumptions: contribution.intent.assumptions, uncertainties: contribution.intent.uncertainties,
            proposedCounterexamples: contribution.intent.counterexamples.map((item) => item.rationale).slice(0, 5),
            expectedPassingTools: [experiment.toolId], modelEstimate: contribution.intent.modelEstimate }); }
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
        this.#config.network.wake(this.#config.coordinator, theoryId, { eventId: `${this.#config.partyId}-${role}-${index}`,
          kind: "ASSIGNMENT", reason: "Research-party phase assignment." });
      }
      for (const role of roles) {
        const lease = this.#config.network.take(this.#config.coordinator);
        if (!lease) { failure = "research_party_activation_capacity_unavailable"; break; }
        entities.push({ theoryId: lease.theoryId, guardianId: lease.guardianId, initialRole: role, lease });
      }
      if (failure || entities.length !== entityCount) return finish();
      const investigators = entities.filter((item) => item.initialRole === "INVESTIGATOR");
      peakParallelModelExecutions = Math.max(peakParallelModelExecutions, investigators.length);
      await Promise.all(investigators.map((entity, index) => call(entity, "INVESTIGATOR",
        `Generate an independent causal hypothesis from the ${cognitiveRouting!.assignments[index].perspectiveId} compartment. ${cognitiveRouting!.assignments[index].instruction} Predict every catalogued experiment and request the most discriminating ones.`, [], [])));
      if (failure) return finish();
      const hypotheses = contributions.filter((item) => item.intent.decision === "PROPOSE_HYPOTHESIS");
      if (hypotheses.length < 2) { failure = "research_party_insufficient_independent_hypotheses"; return finish(); }
      const falsifier = entities.find((item) => item.initialRole === "FALSIFIER")!;
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
        peakParallelModelExecutions = Math.max(peakParallelModelExecutions, investigators.length);
        const falsifierContribution = contributions.find((item) => item.role === "FALSIFIER");
        await Promise.all(investigators.map(async (entity) => {
          const own = contributions.filter((item) => item.theoryId === entity.theoryId);
          const latestPeers = investigators.filter((item) => item.theoryId !== entity.theoryId).map((peer) =>
            [...contributions].reverse().find((item) => item.theoryId === peer.theoryId
              && ["INVESTIGATOR", "REVISER"].includes(item.role))).filter((item): item is TheoryContribution => Boolean(item));
          if (falsifierContribution) latestPeers.push(falsifierContribution);
          return call(entity, "REVISER", "Revise your own mechanism using every observed counterexample. Forecast only experiments that have not yet been observed; do not defend a falsified mechanism.", own, latestPeers);
        }));
        if (failure) break;
      }
      if (failure) return finish();
      const reviewer = entities.find((item) => item.initialRole === "META_REVIEWER")!;
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
