import { immutableTheoryValue, theoryDigest, theoryKeys, theoryStrings, theoryText, validTheoryAssignment,
  type CommittedTheoryPrediction, type GuardianReport, type RecordedTheoryObservation, type TheoryAssignment,
  type TheoryLease, type TheoryMessage, type TheoryObservation, type TheoryPrediction, type TheoryRelation,
  type TheoryResearchContext, type TheoryWakeEvent } from "./theoryContracts";

export interface TheoryNetworkConfig {
  readonly namespace: string;
  readonly addressCapacity: string;
  readonly maxAssignedPairs: number;
  readonly maxConcurrentActivations: number;
  readonly maxTotalActivations: number;
  readonly maxEvents: number;
  readonly maxPredictionsPerTheory: number;
  readonly maxObservationsPerTheory: number;
  readonly maxRelations: number;
  readonly maxFanout: number;
  readonly maxMessages: number;
  readonly activationLifetimeMs: number;
  readonly now: () => number;
}

interface TheoryPair {
  readonly theoryId: string;
  readonly guardianId: string;
  readonly assignment: TheoryAssignment;
  readonly assignmentDigest: string;
  state: "DORMANT" | "QUEUED" | "ACTIVE" | "RETIRED";
  requiresRevalidation: boolean;
  readonly predictions: CommittedTheoryPrediction[];
  readonly observations: RecordedTheoryObservation[];
  readonly notices: TheoryMessage[];
}

interface ActiveLease { readonly lease: TheoryLease; readonly pair: TheoryPair; }

/**
 * Sparse process-local research runtime. Reservation is O(1), not a population of running models.
 * The coordinator object is a local ownership boundary, never an Omega actuation capability.
 * No file, process, network, credential, or deployment operations exist here.
 */
export class TheoryNetwork {
  readonly #config: TheoryNetworkConfig;
  readonly #coordinator: object;
  readonly #capacity: bigint;
  #reserved = 0n;
  #order = 0;
  #lastTime = 0;
  #activations = 0;
  #messages = 0;
  readonly #pairs = new Map<string, TheoryPair>();
  readonly #queue = new Map<string, number>();
  readonly #active = new Map<string, ActiveLease>();
  readonly #leases = new WeakMap<TheoryLease, ActiveLease>();
  readonly #events = new Map<string, Readonly<{ theoryId: string; event: TheoryWakeEvent; order: number }>>();
  readonly #relations = new Map<string, TheoryRelation>();
  readonly #adjacency = new Map<string, Set<string>>();
  readonly #deliveryIds = new Set<string>();

  private constructor(config: TheoryNetworkConfig, coordinator: object) {
    this.#config = Object.freeze({ ...config });
    this.#coordinator = coordinator;
    this.#capacity = BigInt(config.addressCapacity);
  }

  static create(config: TheoryNetworkConfig, coordinator: object): TheoryNetwork {
    const limits = [config.maxAssignedPairs, config.maxConcurrentActivations, config.maxTotalActivations,
      config.maxEvents, config.maxPredictionsPerTheory, config.maxObservationsPerTheory,
      config.maxRelations, config.maxFanout, config.maxMessages, config.activationLifetimeMs];
    if (!coordinator || typeof coordinator !== "object" || !/^[A-Za-z0-9_-]{1,64}$/.test(config.namespace)
      || typeof config.addressCapacity !== "string" || !/^[1-9][0-9]{0,17}$/.test(config.addressCapacity)
      || limits.some((value) => !Number.isSafeInteger(value) || value < 1)
      || config.maxAssignedPairs > 100_000 || config.maxConcurrentActivations > config.maxAssignedPairs
      || config.maxConcurrentActivations > 64 || config.maxPredictionsPerTheory > 64
      || config.maxObservationsPerTheory > 256 || config.maxEvents > 1_000_000
      || config.maxTotalActivations > 1_000_000 || config.maxMessages > 1_000_000
      || config.maxRelations > 1_000_000 || config.maxFanout > 64
      || config.activationLifetimeMs > 600_000 || typeof config.now !== "function") {
      throw new Error("theory_network_configuration_invalid");
    }
    return new TheoryNetwork(config, coordinator);
  }

  #own(coordinator: object): void {
    if (coordinator !== this.#coordinator) throw new Error("theory_coordinator_ownership_required");
  }

  #now(): number {
    const now = this.#config.now();
    if (!Number.isSafeInteger(now) || now < this.#lastTime || now < 0) throw new Error("theory_clock_invalid");
    this.#lastTime = now;
    return now;
  }

  #ordinal(id: string): bigint {
    const prefix = `${this.#config.namespace}:theory:`;
    if (typeof id !== "string" || !id.startsWith(prefix)) throw new Error("theory_address_invalid");
    const value = id.slice(prefix.length);
    if (!/^(0|[1-9][0-9]{0,17})$/.test(value)) throw new Error("theory_address_invalid");
    const ordinal = BigInt(value);
    if (ordinal >= this.#reserved) throw new Error("theory_address_not_reserved");
    return ordinal;
  }

  #pair(id: string): TheoryPair {
    this.#ordinal(id);
    const pair = this.#pairs.get(id);
    if (!pair) throw new Error("blank_theory_cannot_act");
    if (pair.state === "RETIRED") throw new Error("retired_theory_cannot_act");
    return pair;
  }

  #live(coordinator: object, lease: TheoryLease): TheoryPair {
    this.#own(coordinator);
    const owned = lease && this.#leases.get(lease);
    if (!owned || this.#active.get(lease.theoryId) !== owned || owned.pair.state !== "ACTIVE") {
      throw new Error("theory_activation_not_owned");
    }
    if (this.#now() >= lease.expiresAtEpochMs) throw new Error("theory_activation_expired");
    if (owned.pair.requiresRevalidation) throw new Error("theory_dependency_requires_revalidation");
    return owned.pair;
  }

  reserve(coordinator: object, count: string): { readonly firstId: string; readonly lastId: string; readonly count: string } {
    this.#own(coordinator);
    if (typeof count !== "string" || !/^[1-9][0-9]{0,17}$/.test(count)) throw new Error("theory_reservation_invalid");
    const amount = BigInt(count);
    if (this.#reserved + amount > this.#capacity) throw new Error("theory_address_capacity_exhausted");
    const first = this.#reserved;
    this.#reserved += amount;
    return Object.freeze({ firstId: `${this.#config.namespace}:theory:${first}`,
      lastId: `${this.#config.namespace}:theory:${this.#reserved - 1n}`, count });
  }

  inspect(id: string) {
    this.#ordinal(id);
    const pair = this.#pairs.get(id);
    if (!pair) return Object.freeze({ theoryId: id, state: "BLANK" as const, guardianId: null });
    return immutableTheoryValue({ ...pair });
  }

  assign(coordinator: object, id: string, assignment: TheoryAssignment): void {
    this.#own(coordinator);
    const ordinal = this.#ordinal(id);
    if (this.#pairs.has(id)) throw new Error("theory_already_assigned");
    if (this.#pairs.size >= this.#config.maxAssignedPairs) throw new Error("theory_resident_capacity_exhausted");
    if (!validTheoryAssignment(assignment)) throw new Error("theory_assignment_invalid");
    const retained = immutableTheoryValue(assignment);
    this.#pairs.set(id, { theoryId: id, guardianId: `${this.#config.namespace}:guardian:${ordinal}`,
      assignment: retained, assignmentDigest: theoryDigest(retained), state: "DORMANT",
      requiresRevalidation: false, predictions: [], observations: [], notices: [] });
  }

  wake(coordinator: object, id: string, event: TheoryWakeEvent): "QUEUED" | "DUPLICATE" {
    this.#own(coordinator);
    const pair = this.#pair(id);
    if (!event || !theoryKeys(event, ["eventId", "kind", "reason"])
      || !theoryText(event.eventId, 200) || !theoryText(event.reason, 500)
      || !["ASSIGNMENT", "NEW_EVIDENCE", "CONTRADICTION", "DEPENDENCY_CHANGED", "FOLLOW_UP"].includes(event.kind)) {
      throw new Error("theory_wake_event_invalid");
    }
    const key = theoryDigest([id, event.eventId]);
    if (this.#events.has(key)) return "DUPLICATE";
    if (this.#events.size >= this.#config.maxEvents) throw new Error("theory_event_budget_exhausted");
    this.#events.set(key, immutableTheoryValue({ theoryId: id, event, order: ++this.#order }));
    if (event.kind === "DEPENDENCY_CHANGED") {
      pair.requiresRevalidation = true;
      this.#active.delete(id);
      pair.state = "DORMANT";
    }
    // Coalescing keeps at most one pending activation per assigned theory.
    if (!this.#queue.has(id)) this.#queue.set(id, ++this.#order);
    if (pair.state !== "ACTIVE") pair.state = "QUEUED";
    return "QUEUED";
  }

  take(coordinator: object): TheoryLease | null {
    this.#own(coordinator);
    const now = this.#now();
    if (!Number.isSafeInteger(now + this.#config.activationLifetimeMs)) throw new Error("theory_expiry_invalid");
    for (const [id, active] of this.#active) {
      if (now >= active.lease.expiresAtEpochMs) {
        this.#active.delete(id);
        active.pair.state = "QUEUED";
        if (!this.#queue.has(id)) this.#queue.set(id, ++this.#order);
      }
    }
    if (this.#active.size >= this.#config.maxConcurrentActivations
      || this.#activations >= this.#config.maxTotalActivations) return null;
    for (const [id] of this.#queue) {
      const pair = this.#pair(id);
      if (pair.state === "ACTIVE" || pair.requiresRevalidation) continue;
      this.#queue.delete(id);
      pair.state = "ACTIVE";
      const lease: TheoryLease = Object.freeze({ theoryId: id, guardianId: pair.guardianId,
        activationId: `${this.#config.namespace}:activation:${++this.#activations}`,
        assignmentDigest: pair.assignmentDigest, expiresAtEpochMs: now + this.#config.activationLifetimeMs });
      const active = { lease, pair };
      this.#active.set(id, active);
      this.#leases.set(lease, active);
      return lease;
    }
    return null;
  }

  assertActive(coordinator: object, lease: TheoryLease): void { this.#live(coordinator, lease); }

  release(coordinator: object, lease: TheoryLease): void {
    this.#own(coordinator);
    const owned = this.#leases.get(lease);
    if (!owned || this.#active.get(lease.theoryId) !== owned) throw new Error("theory_activation_not_owned");
    this.#active.delete(lease.theoryId);
    owned.pair.state = this.#queue.has(lease.theoryId) ? "QUEUED" : "DORMANT";
  }

  retire(coordinator: object, id: string): void {
    this.#own(coordinator);
    const pair = this.#pair(id);
    this.#active.delete(id);
    this.#queue.delete(id);
    pair.state = "RETIRED";
  }

  commitPrediction(coordinator: object, lease: TheoryLease, prediction: TheoryPrediction): string {
    const pair = this.#live(coordinator, lease);
    if (!prediction || !theoryKeys(prediction, ["predictionId", "statement", "expectedResult", "candidateDigest",
      "evidenceRefs", "assumptions", "uncertainties", "proposedCounterexamples", "expectedPassingTools", "modelEstimate"])
      || !theoryText(prediction.predictionId, 200) || !theoryText(prediction.statement)
      || !theoryText(prediction.expectedResult) || !/^[a-f0-9]{64}$/.test(prediction.candidateDigest)
      || !theoryStrings(prediction.evidenceRefs) || prediction.evidenceRefs.length === 0
      || !theoryStrings(prediction.assumptions, 10) || !theoryStrings(prediction.uncertainties, 10)
      || !theoryStrings(prediction.proposedCounterexamples, 5)
      || !theoryStrings(prediction.expectedPassingTools, 10) || prediction.expectedPassingTools.length === 0
      || (prediction.modelEstimate !== null && (typeof prediction.modelEstimate !== "number"
        || !Number.isFinite(prediction.modelEstimate) || prediction.modelEstimate < 0 || prediction.modelEstimate > 1))) {
      throw new Error("theory_prediction_invalid");
    }
    if (pair.predictions.some((item) => item.predictionId === prediction.predictionId)) {
      throw new Error("theory_prediction_already_committed");
    }
    if (pair.predictions.length >= this.#config.maxPredictionsPerTheory) throw new Error("theory_prediction_budget_exhausted");
    const committed = immutableTheoryValue({ ...prediction, committedAtOrder: ++this.#order,
      digest: theoryDigest(prediction) });
    pair.predictions.push(committed);
    return committed.digest;
  }

  observe(coordinator: object, lease: TheoryLease, observation: TheoryObservation): void {
    const pair = this.#live(coordinator, lease);
    const prediction = pair.predictions.find((item) => item.predictionId === observation?.predictionId);
    if (!prediction || !theoryKeys(observation, ["evidenceId", "predictionId", "candidateDigest", "toolId", "result",
      "evidenceClass", "environmentIdentity", "provenanceRoot"]) || observation.candidateDigest !== prediction.candidateDigest
      || !prediction.expectedPassingTools.includes(observation.toolId)
      || !theoryText(observation.evidenceId, 200) || !theoryText(observation.environmentIdentity, 200)
      || !theoryText(observation.provenanceRoot, 200) || !["E3", "E4"].includes(observation.evidenceClass)
      || !["PASS", "FAIL", "INCONCLUSIVE"].includes(observation.result)) {
      throw new Error("theory_observation_binding_invalid");
    }
    if (pair.observations.some((item) => item.evidenceId === observation.evidenceId
      || (item.predictionId === observation.predictionId && item.toolId === observation.toolId))) {
      throw new Error("theory_observation_duplicate");
    }
    if (pair.observations.length >= this.#config.maxObservationsPerTheory) throw new Error("theory_observation_budget_exhausted");
    pair.observations.push(immutableTheoryValue({ ...observation, observedAtOrder: ++this.#order }));
  }

  relate(coordinator: object, relation: TheoryRelation): void {
    this.#own(coordinator);
    this.#pair(relation.from);
    this.#pair(relation.to);
    if (!theoryKeys(relation, ["relationId", "from", "to", "kind", "justification", "disposition"])
      || !theoryText(relation.relationId, 200) || !theoryText(relation.justification, 500)
      || relation.from === relation.to || relation.disposition !== "PROPOSED_NOT_PROVEN"
      || !["RELATED", "COMPETING", "DEPENDS_ON", "SHARED_ASSUMPTION"].includes(relation.kind)) {
      throw new Error("theory_relation_invalid");
    }
    if (this.#relations.has(relation.relationId)) throw new Error("theory_relation_duplicate");
    if (this.#relations.size >= this.#config.maxRelations) throw new Error("theory_relation_budget_exhausted");
    const neighbors = this.#adjacency.get(relation.from) ?? new Set<string>();
    if (!neighbors.has(relation.to) && neighbors.size >= this.#config.maxFanout) {
      throw new Error("theory_relation_fanout_exhausted");
    }
    this.#relations.set(relation.relationId, immutableTheoryValue(relation));
    neighbors.add(relation.to);
    this.#adjacency.set(relation.from, neighbors);
  }

  /** Explicit one-hop delivery: recipients investigate, never inherit support or authority. */
  publish(coordinator: object, lease: TheoryLease, evidenceId: string): number {
    const pair = this.#live(coordinator, lease);
    const evidence = pair.observations.find((item) => item.evidenceId === evidenceId);
    if (!evidence) throw new Error("theory_message_evidence_not_observed");
    const recipients = [...(this.#adjacency.get(pair.theoryId) ?? [])]
      .map((id) => this.#pairs.get(id)!)
      .filter((item) => item.state !== "RETIRED")
      .filter((item) => !this.#deliveryIds.has(theoryDigest([item.theoryId, evidence.provenanceRoot, evidenceId])));
    if (recipients.some((recipient) => recipient.notices.length >= this.#config.maxObservationsPerTheory)
      || this.#messages + recipients.length > this.#config.maxMessages
      || this.#events.size + recipients.length > this.#config.maxEvents) throw new Error("theory_message_budget_exhausted");
    for (const recipient of recipients) {
      const messageId = theoryDigest([recipient.theoryId, evidence.provenanceRoot, evidenceId]);
      const message: TheoryMessage = immutableTheoryValue({ messageId, from: pair.theoryId, to: recipient.theoryId,
        evidenceId, provenanceRoot: evidence.provenanceRoot, kind: "EVIDENCE_NOTICE",
        interpretation: "INVESTIGATE_RELEVANCE_NOT_AUTOMATIC_SUPPORT" });
      recipient.notices.push(message);
      this.#deliveryIds.add(messageId);
      this.#messages += 1;
      this.wake(coordinator, recipient.theoryId, { eventId: messageId, kind: "NEW_EVIDENCE",
        reason: "Related observation requires relevance assessment; it is not support for the recipient." });
    }
    return recipients.length;
  }

  guardianReport(id: string): GuardianReport {
    const pair = this.#pair(id);
    const predictionResults = pair.predictions.map((prediction) => {
      const observations = pair.observations.filter((item) => item.predictionId === prediction.predictionId);
      const disposition = observations.some((item) => item.result === "FAIL") ? "FALSIFIED_PREDICTION" as const
        : observations.length === 0 ? "PENDING" as const
          : observations.length === prediction.expectedPassingTools.length
            && observations.every((item) => item.result === "PASS") ? "SUPPORTED_WITHIN_TEST_SCOPE" as const
              : "INCONCLUSIVE" as const;
      return { predictionId: prediction.predictionId, disposition };
    });
    // Keep the latest expectation/observation differences small enough to enter
    // cognition context. The full immutable prediction and observation history
    // remains available through inspect(); this projection grants no authority.
    const predictionAudits = pair.predictions.slice(-8).map((prediction) => {
      const observed = pair.observations.filter((item) => item.predictionId === prediction.predictionId)
        .map((item) => ({ toolId: item.toolId, result: item.result, evidenceId: item.evidenceId,
          evidenceClass: item.evidenceClass }));
      const seen = new Set(observed.map((item) => item.toolId));
      return { predictionId: prediction.predictionId, candidateDigest: prediction.candidateDigest,
        expectedPassingTools: prediction.expectedPassingTools,
        observed, unobservedTools: prediction.expectedPassingTools.filter((tool) => !seen.has(tool)),
        falsifyingEvidenceIds: observed.filter((item) => item.result === "FAIL").map((item) => item.evidenceId),
        inconclusiveEvidenceIds: observed.filter((item) => item.result === "INCONCLUSIVE").map((item) => item.evidenceId) };
    });
    const latest = pair.predictions.at(-1);
    const weakPoints = [...new Set([
      ...(pair.requiresRevalidation ? ["Changed dependency requires fresh assignment and revalidation."] : []),
      ...(latest?.uncertainties ?? []),
      ...(latest?.assumptions ?? pair.assignment.assumptions),
      ...(latest?.proposedCounterexamples.length ? ["Proposed counterexamples are not executed test evidence."] : []),
      ...(predictionResults.some((item) => item.disposition === "FALSIFIED_PREDICTION")
        ? ["A predicted test outcome failed; separate theory, implementation, and evaluator explanations."] : []),
      ...predictionAudits.slice(-2).flatMap((audit) => [
        ...audit.observed.filter((item) => item.result === "FAIL")
          .map((item) => `Prediction ${audit.predictionId.slice(0, 48)}: ${item.toolId.slice(0, 48)} failed; inspect predictionAudits evidence.`),
        ...audit.unobservedTools.map((tool) => `Prediction ${audit.predictionId.slice(0, 48)}: ${tool.slice(0, 48)} remains unobserved.`),
      ]),
      "Test agreement does not independently establish the proposed causal mechanism.",
    ])].slice(0, 20);
    return immutableTheoryValue({ theoryId: pair.theoryId, guardianId: pair.guardianId,
      assignmentDigest: pair.assignmentDigest,
      causalTheoryState: pair.requiresRevalidation ? "REQUIRES_REVALIDATION" : "UNKNOWN",
      predictionResults, predictionAudits, confidence: { calibratedProbability: null, calibrationState: "NOT_CALIBRATED",
        lastModelEstimate: latest?.modelEstimate ?? null,
        distinctEvidenceRoots: new Set(pair.observations.map((item) => item.provenanceRoot)).size,
        independenceEstablished: false, numericalTarget: null },
      weakPoints, requests: weakPoints.map((question) => ({ question,
        mode: pair.requiresRevalidation ? "REVALIDATE_DEPENDENCY" : "FOCUSED_INVESTIGATION", grantsAuthority: false })),
      relatedEvidenceNotices: pair.notices.slice(-8), grantsAuthority: false });
  }

  context(coordinator: object, lease: TheoryLease): TheoryResearchContext {
    const pair = this.#live(coordinator, lease);
    return immutableTheoryValue({ schemaVersion: 1, theoryId: pair.theoryId, guardianId: pair.guardianId,
      assignment: pair.assignment, assignmentDigest: pair.assignmentDigest, report: this.guardianReport(pair.theoryId),
      trust: "RESEARCH_CONTEXT_NOT_INSTRUCTION_OR_ACCEPTANCE_AUTHORITY", grantsAuthority: false });
  }

  eventHistory(coordinator: object, id: string) {
    this.#own(coordinator);
    this.#ordinal(id);
    return immutableTheoryValue([...this.#events.values()].filter((item) => item.theoryId === id));
  }

  metrics() {
    return Object.freeze({ reservedAddressSlots: this.#reserved.toString(),
      unassignedAddressSlots: (this.#reserved - BigInt(this.#pairs.size)).toString(), assignedPairs: this.#pairs.size,
      activePairs: this.#active.size, queuedPairs: this.#queue.size, activationCount: this.#activations,
      relationCount: this.#relations.size, deliveredMessages: this.#messages, recordedEvents: this.#events.size,
      residentScaleVerified: false, distributedExecutionImplemented: false, grantsAuthority: false });
  }
}
