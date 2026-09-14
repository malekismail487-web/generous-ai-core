import { immutableTheoryValue, theoryDigest, theoryKeys, theoryStrings, theoryText } from "./theoryContracts";
import { researchObjectiveDigest, validResearchEvidence, validResearchId, validResearchObjective,
  type ResearchExperiment, type ResearchExperimentObservation, type ResearchHypothesisAssessment,
  type ResearchPartyDecision, type ResearchPartyObjective, type TheoryCognitionIntent,
  type TheoryContribution } from "./researchPartyContracts";

interface ContributionRecord {
  readonly contribution: TheoryContribution;
  readonly order: number;
}

interface ObservationRecord {
  readonly observation: ResearchExperimentObservation;
  readonly order: number;
}

const DECISIONS = new Set(["PROPOSE_HYPOTHESIS", "CHALLENGE", "REVISE_HYPOTHESIS", "NO_CONCLUSION"]);

/**
 * Claim/evidence graph for one bounded research party.
 * Model contributions are claims (E1), never truth evidence. Only admitted E3/E4
 * observations can support or falsify a forecast.
 */
export class ResearchEvidenceGraph {
  readonly #objective: ResearchPartyObjective;
  readonly #objectiveDigest: string;
  readonly #evidence = new Map<string, { readonly item: ResearchPartyObjective["admittedEvidence"][number]; stale: boolean }>();
  readonly #contributions = new Map<string, ContributionRecord>();
  readonly #latestByTheory = new Map<string, string>();
  readonly #observations = new Map<string, ObservationRecord>();
  readonly #observationByExperiment = new Map<string, string>();
  readonly #changedDependencies = new Set<string>();
  #order = 0;

  constructor(objective: ResearchPartyObjective, now: number) {
    if (!Number.isSafeInteger(now) || now < 0 || !validResearchObjective(objective, now)) {
      throw new Error("research_evidence_graph_objective_invalid");
    }
    this.#objective = immutableTheoryValue(objective);
    this.#objectiveDigest = researchObjectiveDigest(objective);
    for (const item of objective.admittedEvidence) this.#evidence.set(item.evidenceId, { item, stale: false });
  }

  objective(): ResearchPartyObjective { return immutableTheoryValue(this.#objective); }
  objectiveDigest(): string { return this.#objectiveDigest; }
  evidenceCount(): number { return this.#evidence.size; }

  #experiment(experimentId: string): ResearchExperiment | null {
    return this.#objective.experimentCatalog.find((item) => item.experimentId === experimentId) ?? null;
  }

  #validateIntent(intent: TheoryCognitionIntent, role: TheoryContribution["role"], theoryId: string): boolean {
    if (!intent || !theoryKeys(intent, ["schemaVersion", "decision", "thesis", "mechanismId", "causalMechanism",
      "evidenceRefs", "assumptions", "uncertainties", "forecasts", "counterexamples", "requestedExperimentIds",
      "revisionOfTheoryId", "modelEstimate"]) || intent.schemaVersion !== 1 || !DECISIONS.has(intent.decision)
      || !theoryText(intent.thesis, 2_000) || !theoryStrings(intent.evidenceRefs, 32)
      || !theoryStrings(intent.assumptions, 16) || !theoryStrings(intent.uncertainties, 16)
      || !theoryStrings(intent.requestedExperimentIds, 32)
      || (intent.modelEstimate !== null && (typeof intent.modelEstimate !== "number"
        || !Number.isFinite(intent.modelEstimate) || intent.modelEstimate < 0 || intent.modelEstimate > 1))
      || !Array.isArray(intent.forecasts) || intent.forecasts.length > 64
      || !Array.isArray(intent.counterexamples) || intent.counterexamples.length > 32) return false;
    if (intent.evidenceRefs.some((id) => !this.#evidence.has(id))
      || intent.requestedExperimentIds.some((id) => !this.#experiment(id))) return false;
    const mechanismIds = new Set(this.#objective.mechanismCatalog.map((item) => item.mechanismId));
    const hypothesisDecision = intent.decision === "PROPOSE_HYPOTHESIS" || intent.decision === "REVISE_HYPOTHESIS";
    if (hypothesisDecision && role !== "INVESTIGATOR" && role !== "REVISER") return false;
    if (!hypothesisDecision && intent.decision !== "NO_CONCLUSION" && role !== "FALSIFIER") return false;
    if (intent.decision === "CHALLENGE" && role !== "FALSIFIER") return false;
    if (intent.decision === "NO_CONCLUSION" && role === "META_REVIEWER" && intent.mechanismId !== null) return false;
    if (hypothesisDecision) {
      if (!intent.mechanismId || !mechanismIds.has(intent.mechanismId) || !theoryText(intent.causalMechanism, 2_000)
        || intent.forecasts.length < 1 || intent.evidenceRefs.length < 1) return false;
      if (intent.decision === "PROPOSE_HYPOTHESIS" && intent.revisionOfTheoryId !== null) return false;
      if (intent.decision === "REVISE_HYPOTHESIS" && (!intent.revisionOfTheoryId
        || intent.revisionOfTheoryId !== theoryId || !this.#latestByTheory.has(theoryId))) return false;
    } else if (intent.mechanismId !== null || intent.causalMechanism !== null || intent.forecasts.length > 0
      || intent.revisionOfTheoryId !== null) return false;
    const forecastExperiments = new Set<string>();
    for (const forecast of intent.forecasts) {
      const experiment = this.#experiment(forecast?.experimentId);
      if (!forecast || !theoryKeys(forecast, ["experimentId", "expectedOutcome", "rationale"])
        || !experiment || forecastExperiments.has(forecast.experimentId)
        || !experiment.possibleOutcomes.includes(forecast.expectedOutcome)
        || !theoryText(forecast.rationale, 1_000)) return false;
      forecastExperiments.add(forecast.experimentId);
    }
    if (intent.requestedExperimentIds.some((id) => !forecastExperiments.has(id))) return false;
    for (const counterexample of intent.counterexamples) {
      const experiment = this.#experiment(counterexample?.experimentId);
      if (!counterexample || !theoryKeys(counterexample, ["targetTheoryId", "experimentId", "disconfirmingOutcome", "rationale"])
        || !validResearchId(counterexample.targetTheoryId) || !experiment
        || !experiment.possibleOutcomes.includes(counterexample.disconfirmingOutcome)
        || !theoryText(counterexample.rationale, 1_000)) return false;
    }
    if (intent.decision === "CHALLENGE" && intent.counterexamples.length < 1) return false;
    return true;
  }

  commitContribution(contribution: TheoryContribution): void {
    if (!contribution || !theoryKeys(contribution, ["contributionId", "theoryId", "guardianId", "role", "objectiveDigest",
      "intent", "modelEvidence", "committedAtEpochMs", "contributionDigest", "grantsAuthority"])
      || !validResearchId(contribution.contributionId) || this.#contributions.has(contribution.contributionId)
      || !validResearchId(contribution.theoryId) || !validResearchId(contribution.guardianId)
      || !["INVESTIGATOR", "FALSIFIER", "REVISER", "META_REVIEWER"].includes(contribution.role)
      || contribution.objectiveDigest !== this.#objectiveDigest || contribution.grantsAuthority !== false
      || !Number.isSafeInteger(contribution.committedAtEpochMs) || contribution.committedAtEpochMs < 0
      || !validResearchEvidence(contribution.modelEvidence, this.#objective.candidateBinding)
      || contribution.modelEvidence.evidenceClass !== "E1" || contribution.modelEvidence.kind !== "MODEL_CONTRIBUTION"
      || contribution.modelEvidence.contentDigest !== theoryDigest(contribution.intent)
      || contribution.contributionDigest !== theoryDigest({ contributionId: contribution.contributionId,
        theoryId: contribution.theoryId, guardianId: contribution.guardianId, role: contribution.role,
        objectiveDigest: contribution.objectiveDigest, intent: contribution.intent,
        modelEvidenceId: contribution.modelEvidence.evidenceId, committedAtEpochMs: contribution.committedAtEpochMs })
      || !this.#validateIntent(contribution.intent, contribution.role, contribution.theoryId)) {
      throw new Error("research_contribution_invalid");
    }
    if (this.#evidence.has(contribution.modelEvidence.evidenceId)) throw new Error("research_evidence_identity_duplicate");
    const previousId = this.#latestByTheory.get(contribution.theoryId);
    if (previousId && contribution.intent.decision !== "REVISE_HYPOTHESIS") {
      throw new Error("research_theory_requires_revision_lineage");
    }
    this.#evidence.set(contribution.modelEvidence.evidenceId, { item: contribution.modelEvidence, stale: false });
    this.#contributions.set(contribution.contributionId, { contribution: immutableTheoryValue(contribution), order: ++this.#order });
    if (["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"].includes(contribution.intent.decision)) {
      this.#latestByTheory.set(contribution.theoryId, contribution.contributionId);
    }
  }

  recordObservation(observation: ResearchExperimentObservation): void {
    const experiment = this.#experiment(observation?.experimentId);
    if (!observation || !theoryKeys(observation, ["observationId", "experimentId", "toolId", "outcome", "evidence",
      "executionIdentity", "outputDigest", "authorityGranted"]) || !validResearchId(observation.observationId)
      || this.#observations.has(observation.observationId) || this.#observationByExperiment.has(observation.experimentId)
      || !experiment || observation.toolId !== experiment.toolId
      || !experiment.possibleOutcomes.includes(observation.outcome) || !validResearchId(observation.executionIdentity)
      || !/^[a-f0-9]{64}$/.test(observation.outputDigest) || observation.authorityGranted !== false
      || !validResearchEvidence(observation.evidence, this.#objective.candidateBinding)
      || !["E3", "E4"].includes(observation.evidence.evidenceClass)
      || observation.evidence.kind !== "EXPERIMENT_RESULT"
      || observation.evidence.contentDigest !== theoryDigest({ experimentId: observation.experimentId,
        toolId: observation.toolId, outcome: observation.outcome, executionIdentity: observation.executionIdentity,
        outputDigest: observation.outputDigest })) throw new Error("research_experiment_observation_invalid");
    // At least one precommitted hypothesis forecast must exist before the experiment is run.
    const predicted = [...this.#contributions.values()].some(({ contribution }) =>
      contribution.intent.forecasts.some((item) => item.experimentId === observation.experimentId));
    if (!predicted) throw new Error("research_observation_without_precommitted_prediction");
    if (this.#evidence.has(observation.evidence.evidenceId)) throw new Error("research_evidence_identity_duplicate");
    this.#evidence.set(observation.evidence.evidenceId, { item: observation.evidence, stale: false });
    this.#observations.set(observation.observationId, { observation: immutableTheoryValue(observation), order: ++this.#order });
    this.#observationByExperiment.set(observation.experimentId, observation.observationId);
  }

  invalidateDependency(dependency: string): readonly string[] {
    if (!theoryText(dependency, 500)) throw new Error("research_freshness_dependency_invalid");
    this.#changedDependencies.add(dependency);
    const invalidated: string[] = [];
    for (const [id, record] of this.#evidence) {
      if (!record.stale && record.item.freshnessDependencies.includes(dependency)) {
        record.stale = true; invalidated.push(id);
      }
    }
    return Object.freeze(invalidated.sort());
  }

  #latestHypotheses(): readonly TheoryContribution[] {
    return [...this.#latestByTheory.values()].map((id) => this.#contributions.get(id)!.contribution);
  }

  assessment(theoryId: string): ResearchHypothesisAssessment {
    const contributionId = this.#latestByTheory.get(theoryId);
    const contribution = contributionId ? this.#contributions.get(contributionId)?.contribution : null;
    if (!contribution) throw new Error("research_hypothesis_unknown");
    const support: string[] = [];
    const falsification: string[] = [];
    const unresolved: string[] = [];
    const roots = new Set<string>();
    let stale = this.#evidence.get(contribution.modelEvidence.evidenceId)?.stale ?? true;
    for (const ref of contribution.intent.evidenceRefs) stale ||= this.#evidence.get(ref)?.stale ?? true;
    for (const forecast of contribution.intent.forecasts) {
      const observationId = this.#observationByExperiment.get(forecast.experimentId);
      const observation = observationId ? this.#observations.get(observationId)?.observation : null;
      if (!observation || this.#evidence.get(observation.evidence.evidenceId)?.stale) {
        unresolved.push(forecast.experimentId); continue;
      }
      roots.add(observation.evidence.provenanceRoot);
      (observation.outcome === forecast.expectedOutcome ? support : falsification).push(observation.observationId);
    }
    const state: ResearchHypothesisAssessment["state"] = stale ? "STALE"
      : support.length > 0 && falsification.length > 0 ? "CONFLICTED"
        : falsification.length > 0 ? "REFUTED" : support.length > 0 && unresolved.length === 0 ? "SUPPORTED"
          : "INSUFFICIENT_EVIDENCE";
    return immutableTheoryValue({ theoryId, mechanismId: contribution.intent.mechanismId, state,
      supportingObservationIds: support, falsifyingObservationIds: falsification,
      unresolvedExperimentIds: unresolved, distinctEvidenceRoots: roots.size,
      modelEstimate: contribution.intent.modelEstimate, calibratedProbability: null });
  }

  selectNextExperiment(maxRemainingCost: number): ResearchExperiment | null {
    if (!Number.isSafeInteger(maxRemainingCost) || maxRemainingCost < 0) throw new Error("research_cost_budget_invalid");
    const hypotheses = this.#latestHypotheses().filter((item) => this.assessment(item.theoryId).state !== "REFUTED");
    if (hypotheses.length < 1) return null;
    const candidates = this.#objective.experimentCatalog.filter((experiment) =>
      !this.#observationByExperiment.has(experiment.experimentId) && experiment.costUnits <= maxRemainingCost
      && hypotheses.some((hypothesis) => hypothesis.intent.forecasts.some((forecast) => forecast.experimentId === experiment.experimentId)));
    const scored = candidates.map((experiment) => {
      const groups = new Map<string, number>();
      let coverage = 0;
      for (const hypothesis of hypotheses) {
        const forecast = hypothesis.intent.forecasts.find((item) => item.experimentId === experiment.experimentId);
        if (!forecast) continue;
        coverage += 1; groups.set(forecast.expectedOutcome, (groups.get(forecast.expectedOutcome) ?? 0) + 1);
      }
      const worstSurvivors = groups.size ? Math.max(...groups.values()) + (hypotheses.length - coverage) : hypotheses.length;
      return { experiment, discrimination: hypotheses.length - worstSurvivors, coverage };
    });
    return [...scored].sort((left, right) => right.discrimination - left.discrimination
      || right.coverage - left.coverage || left.experiment.costUnits - right.experiment.costUnits
      || left.experiment.experimentId.localeCompare(right.experiment.experimentId))[0]?.experiment ?? null;
  }

  decision(): ResearchPartyDecision {
    const hypotheses = this.#latestHypotheses();
    const assessments = hypotheses.map((item) => this.assessment(item.theoryId));
    const supported = assessments.filter((item) => item.state === "SUPPORTED");
    const viable = assessments.filter((item) => !["REFUTED", "STALE"].includes(item.state));
    const supportedMechanisms = new Set(supported.map((item) => item.mechanismId).filter(Boolean));
    const viableMechanisms = new Set(viable.map((item) => item.mechanismId).filter(Boolean));
    // Several entities may converge on one empirically supported mechanism. This is
    // deduplication by causal claim, not majority voting or additional evidence.
    const selected = supportedMechanisms.size === 1 && viableMechanisms.size === 1
      && [...supportedMechanisms][0] === [...viableMechanisms][0] ? supported[0] : null;
    const decisiveIds = new Set<string>();
    for (const assessment of assessments) {
      for (const id of [...assessment.supportingObservationIds, ...assessment.falsifyingObservationIds]) {
        const observation = this.#observations.get(id)?.observation;
        if (observation) decisiveIds.add(observation.evidence.evidenceId);
      }
    }
    const state: ResearchPartyDecision["state"] = selected ? "SUPPORTED_WITHIN_MODELED_FAMILY"
      : assessments.length > 0 && assessments.every((item) => item.state === "REFUTED") ? "REFUTED_MODELED_FAMILY"
        : "INSUFFICIENT_EVIDENCE";
    return immutableTheoryValue({ state, selectedTheoryId: selected?.theoryId ?? null,
      selectedMechanismId: selected?.mechanismId ?? null,
      reason: selected ? "one_hypothesis_survives_complete_precommitted_predictions"
        : state === "REFUTED_MODELED_FAMILY" ? "all_modeled_hypotheses_falsified" : "multiple_or_incompletely_tested_hypotheses_remain",
      assessments, decisiveEvidenceIds: [...decisiveIds].sort(), independentAcceptance: false, grantsAuthority: false });
  }

  chainComplete(): boolean {
    for (const { contribution } of this.#contributions.values()) {
      if (contribution.intent.evidenceRefs.some((ref) => !this.#evidence.has(ref))
        || contribution.intent.counterexamples.some((item) => !this.#latestByTheory.has(item.targetTheoryId))) return false;
    }
    return [...this.#observations.values()].every(({ observation }) => this.#evidence.has(observation.evidence.evidenceId));
  }

  snapshot() {
    return immutableTheoryValue({ objectiveDigest: this.#objectiveDigest,
      evidence: [...this.#evidence.values()].map((record) => ({ ...record.item, stale: record.stale })),
      contributions: [...this.#contributions.values()].sort((a, b) => a.order - b.order).map((item) => item.contribution),
      observations: [...this.#observations.values()].sort((a, b) => a.order - b.order).map((item) => item.observation),
      changedDependencies: [...this.#changedDependencies].sort(), chainComplete: this.chainComplete(),
      grantsAuthority: false as const });
  }
}
