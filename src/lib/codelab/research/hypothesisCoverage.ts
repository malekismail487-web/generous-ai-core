import { immutableTheoryValue, theoryDigest, theoryKeys } from "./theoryContracts";
import { researchObjectiveDigest, validResearchId, validResearchObjective, type HypothesisAllocationPolicy,
  type ResearchExperimentObservation, type ResearchPartyObjective, type TheoryContribution,
  type TheoryCognitionRequest, type TheoryHypothesisAllocation } from "./researchPartyContracts";

interface CoverageInput {
  readonly objective: ResearchPartyObjective;
  readonly cohortTheoryIds: readonly string[];
  readonly contributions: readonly TheoryContribution[];
  readonly observations: readonly ResearchExperimentObservation[];
  readonly phaseOrdinal: number;
  readonly policy: HypothesisAllocationPolicy;
}

const HYPOTHESES = new Set(["PROPOSE_HYPOTHESIS", "REVISE_HYPOTHESIS"]);

/** Only current, admitted conjectures affect exploration. Confidence never ranks a mechanism. */
function context(input: CoverageInput) {
  const objectiveDigest = researchObjectiveDigest(input.objective);
  const latest = new Map<string, TheoryContribution>();
  for (const item of input.contributions) {
    if (item.objectiveDigest !== objectiveDigest || item.grantsAuthority !== false) {
      throw new Error("hypothesis_allocation_contribution_binding_invalid");
    }
    if (HYPOTHESES.has(item.intent.decision)) latest.set(item.theoryId, item);
  }
  const observations = [...input.observations].sort((a, b) => a.experimentId.localeCompare(b.experimentId));
  for (const item of observations) {
    if (item.authorityGranted !== false || item.evidence.grantsAuthority !== false
      || item.evidence.candidateBinding !== input.objective.candidateBinding
      || !["E3", "E4"].includes(item.evidence.evidenceClass)
      || !input.objective.experimentCatalog.some(experiment => experiment.experimentId === item.experimentId
        && experiment.toolId === item.toolId && experiment.possibleOutcomes.includes(item.outcome))) {
      throw new Error("hypothesis_allocation_observation_binding_invalid");
    }
  }
  if (new Set(observations.map(item => item.experimentId)).size !== observations.length) {
    throw new Error("hypothesis_allocation_observation_duplicate");
  }
  const claims = [...latest.values()].sort((a, b) => a.theoryId.localeCompare(b.theoryId));
  // Bind actual forecasts, not just a caller-supplied contribution digest.
  const digest = theoryDigest({ objectiveDigest, claims: claims.map(item => ({ theoryId: item.theoryId,
    contributionId: item.contributionId, mechanismId: item.intent.mechanismId, forecasts: item.intent.forecasts })),
  observations: observations.map(item => ({ experimentId: item.experimentId, outcome: item.outcome,
    evidenceId: item.evidence.evidenceId, contentDigest: item.evidence.contentDigest })) });
  return { claims, observations, digest };
}

/**
 * Bounded exploration scheduling, not an extra reasoning engine. No oracle,
 * selected runtime program, hidden answer, confidence, or network input exists here.
 * A forecast mismatch is NOT a proof that the named mechanism is impossible:
 * the derivation itself may be wrong. Therefore no mechanism is blacklisted.
 */
export function allocateHypothesisCoverage(input: CoverageInput): readonly TheoryHypothesisAllocation[] {
  const ids = input.cohortTheoryIds;
  if (!validResearchObjective(input.objective, 0)
    || !Array.isArray(input.contributions) || input.contributions.length > 128
    || !Array.isArray(input.observations) || input.observations.length > 32
    || !Array.isArray(ids) || ids.length < (input.phaseOrdinal === 0 ? 2 : 1) || ids.length > 14
    || ids.some(id => !validResearchId(id)) || new Set(ids).size !== ids.length
    || !Number.isSafeInteger(input.phaseOrdinal) || input.phaseOrdinal < 0 || input.phaseOrdinal > 64
    || !["ROTATING_PARTITION", "COVERAGE_AWARE"].includes(input.policy)
    || (input.phaseOrdinal === 0 && (input.contributions.length > 0 || input.observations.length > 0))) {
    throw new Error("hypothesis_allocation_input_invalid");
  }
  const { claims, observations, digest } = context(input);
  const mechanisms = input.objective.mechanismCatalog.map(item => item.mechanismId);
  const offset = (input.phaseOrdinal * ids.length) % mechanisms.length;
  let ranked = [...mechanisms.slice(offset), ...mechanisms.slice(0, offset)];
  if (input.policy === "COVERAGE_AWARE") {
    const rank = (id: string) => {
      const represented = claims.filter(item => item.intent.mechanismId === id);
      const mismatches = represented.reduce((count, item) => count + observations.filter(observed =>
        item.intent.forecasts.some(forecast => forecast.experimentId === observed.experimentId
          && forecast.expectedOutcome !== observed.outcome)).length, 0);
      // Unrepresented alternatives first; then distribute effort away from duplicates.
      // Mismatched forecasts need repair, not erasure or retrospective confirmation.
      return [represented.length, -mismatches];
    };
    const tie = new Map(ranked.map((id, index) => [id, index]));
    ranked.sort((a, b) => { const x = rank(a); const y = rank(b);
      return x[0] - y[0] || x[1] - y[1] || tie.get(a)! - tie.get(b)!; });
  }
  return immutableTheoryValue(ids.map((theoryId, ordinal) => {
    const partition = ranked.filter((_, index) => index % ids.length === ordinal);
    // More investigators than mechanisms is allowed; disclose necessary reuse.
    const preferred = partition.length ? partition : [ranked[ordinal % ranked.length]];
    return { schemaVersion: 1 as const, policy: input.policy,
      objectiveDigest: researchObjectiveDigest(input.objective), contextDigest: digest,
      phaseOrdinal: input.phaseOrdinal, theoryId, cohortTheoryIds: ids,
      rankedMechanismIds: ranked, preferredMechanismIds: preferred,
      observedExperimentIds: observations.map(item => item.experimentId),
      interpretation: "EXPLORATION_GUIDANCE_NOT_EVIDENCE" as const, grantsAuthority: false as const };
  }));
}

/** Recompute guidance from the request's own public context; never trust claimed coverage. */
export function validHypothesisAllocation(request: TheoryCognitionRequest): boolean {
  const allocation = request.hypothesisAllocation;
  if (allocation === undefined) return true;
  if (!allocation || !["INVESTIGATOR", "REVISER"].includes(request.role)
    || !theoryKeys(allocation, ["schemaVersion", "policy", "objectiveDigest", "contextDigest", "phaseOrdinal",
      "theoryId", "cohortTheoryIds", "rankedMechanismIds", "preferredMechanismIds", "observedExperimentIds",
      "interpretation", "grantsAuthority"]) || allocation.schemaVersion !== 1
    || allocation.theoryId !== request.theoryId || allocation.grantsAuthority !== false
    || allocation.interpretation !== "EXPLORATION_GUIDANCE_NOT_EVIDENCE"
    || (request.role === "INVESTIGATOR" ? allocation.phaseOrdinal !== 0 : allocation.phaseOrdinal < 1)) return false;
  try {
    const reconstructed = allocateHypothesisCoverage({ objective: request.objective,
      cohortTheoryIds: allocation.cohortTheoryIds, policy: allocation.policy, phaseOrdinal: allocation.phaseOrdinal,
      contributions: [...request.privatePriorContributions, ...request.peerContributions],
      observations: request.experimentObservations }).find(item => item.theoryId === request.theoryId);
    return reconstructed !== undefined && theoryDigest(reconstructed) === theoryDigest(allocation);
  } catch { return false; }
}
