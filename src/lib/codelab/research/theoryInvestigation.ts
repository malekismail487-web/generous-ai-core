import type { NyxRepairHypothesis } from "../cognition/nyxNemotronEngineeringCognition";
import type { EngineeringObservation } from "../observation/r3EngineeringObservation";
import { TheoryNetwork } from "./theoryNetwork";
import { validTheoryResearchContext, type TheoryLease, type TheoryResearchContext } from "./theoryContracts";

/** Research context and feedback attached to the existing engineering loop, not an executor. */
export class TheoryInvestigationSession {
  readonly #network: TheoryNetwork;
  readonly #coordinator: object;
  readonly #lease: TheoryLease;

  constructor(network: TheoryNetwork, coordinator: object, lease: TheoryLease) {
    network.assertActive(coordinator, lease);
    this.#network = network;
    this.#coordinator = coordinator;
    this.#lease = lease;
  }

  context(objective: string, candidate: string, paths: readonly string[]): TheoryResearchContext {
    const context = this.#network.context(this.#coordinator, this.#lease);
    if (!validTheoryResearchContext(context, objective, candidate) || context.assignment.domain !== "SOFTWARE"
      || paths.length === 0 || paths.some((path) => !context.assignment.scope.includes(path))) {
      throw new Error("theory_engineering_assignment_mismatch");
    }
    return context;
  }

  assertActive(): void { this.#network.assertActive(this.#coordinator, this.#lease); }

  /** Commit the prediction before Omega attempts candidate preparation or execution. */
  predict(hypothesis: NyxRepairHypothesis): void {
    this.#network.commitPrediction(this.#coordinator, this.#lease, {
      predictionId: hypothesis.hypothesisId, statement: hypothesis.causalHypothesis,
      expectedResult: hypothesis.expectedResult, candidateDigest: hypothesis.proposalDigest,
      evidenceRefs: hypothesis.evidenceRefs, assumptions: hypothesis.assumptions,
      uncertainties: hypothesis.uncertainties, proposedCounterexamples: hypothesis.counterexamples,
      expectedPassingTools: hypothesis.verificationToolIds, modelEstimate: hypothesis.confidence,
    });
  }

  /** Called only after the loop's existing candidate/observation provenance checks. */
  observe(hypothesis: NyxRepairHypothesis, observation: EngineeringObservation): void {
    const context = this.#network.context(this.#coordinator, this.#lease);
    if (observation.candidateCommit !== context.assignment.candidateBinding || observation.grantsAuthority
      || observation.epistemicState === "CONFLICTED" || observation.evidenceClass !== "E3") {
      throw new Error("theory_engineering_observation_mismatch");
    }
    this.#network.observe(this.#coordinator, this.#lease, {
      predictionId: hypothesis.hypothesisId, candidateDigest: hypothesis.proposalDigest,
      evidenceId: observation.candidateEvidenceId, toolId: observation.toolId,
      result: ["TEST_PASS", "BUILD_PASS", "TYPECHECK_PASS"].includes(observation.state) ? "PASS"
        : ["TEST_FAIL", "BUILD_FAIL", "TYPECHECK_FAIL"].includes(observation.state) ? "FAIL" : "INCONCLUSIVE",
      evidenceClass: observation.evidenceClass, environmentIdentity: observation.environmentIdentity,
      // Same verifier/environment is one provenance group, not independent votes per retry.
      provenanceRoot: `${observation.toolIdentityDigest}:${observation.environmentIdentity}`,
    });
  }
}
