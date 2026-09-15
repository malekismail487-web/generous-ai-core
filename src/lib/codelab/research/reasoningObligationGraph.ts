import { immutableTheoryValue, theoryDigest, theoryKeys, theoryStrings, theoryText } from "./theoryContracts";

export type ObligationKind = "REQUIREMENT" | "INVARIANT" | "COVERAGE" | "COUNTEREXAMPLE"
  | "EXPERIMENT" | "PROVENANCE" | "RESOURCE" | "AUTHORITY";
export type ObligationPriority = "CRITICAL" | "REQUIRED" | "SUPPORTING";
export type ObligationEvidenceClass = "E1" | "E2" | "E3" | "E4" | "E5";
export type ObligationDisposition = "SATISFIES" | "FALSIFIES" | "INCONCLUSIVE";
export type ObligationState = "OPEN" | "BLOCKED" | "SATISFIED" | "FALSIFIED" | "INCONCLUSIVE" | "STALE";

export interface ReasoningObligationDefinition {
  readonly obligationId: string;
  readonly kind: ObligationKind;
  readonly priority: ObligationPriority;
  readonly statement: string;
  readonly acceptanceCriterion: string;
  readonly falsificationCriterion: string;
  readonly dependsOn: readonly string[];
  readonly conflictsWith: readonly string[];
  readonly ownerRoles: readonly string[];
  readonly minimumEvidenceClass: ObligationEvidenceClass;
  readonly minimumIndependentRoots: number;
  readonly freshnessDependencies: readonly string[];
  readonly grantsAuthority: false;
}

export interface ObligationEvaluation {
  readonly evaluationId: string;
  readonly obligationId: string;
  readonly subjectBinding: string;
  readonly disposition: ObligationDisposition;
  readonly evidenceClass: ObligationEvidenceClass;
  readonly evidenceRefs: readonly string[];
  readonly provenanceRoot: string;
  readonly summary: string;
  readonly contentDigest: string;
  readonly freshnessDependencies: readonly string[];
  readonly observedAtEpochMs: number;
  readonly evaluatorIdentity: string;
  readonly grantsAuthority: false;
}

export interface ObligationAttemptLease {
  readonly attemptId: string;
  readonly subjectBinding: string;
  readonly ownerRole: string;
  readonly sequence: number;
  readonly startedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly leaseDigest: string;
  readonly grantsAuthority: false;
}

export interface ObligationAssessment {
  readonly obligationId: string;
  readonly state: ObligationState;
  readonly blockingObligationIds: readonly string[];
  readonly satisfyingEvaluationIds: readonly string[];
  readonly falsifyingEvaluationIds: readonly string[];
  readonly inconclusiveEvaluationIds: readonly string[];
  readonly distinctQualifyingRoots: number;
  readonly findings: readonly string[];
  readonly subjectBinding: string | null;
}

export interface ObligationWorkItem {
  readonly obligationId: string;
  readonly priority: ObligationPriority;
  readonly kind: ObligationKind;
  readonly statement: string;
  readonly acceptanceCriterion: string;
  readonly falsificationCriterion: string;
  readonly state: ObligationState;
  readonly blockers: readonly string[];
  readonly preservedEvidence: readonly string[];
  readonly falsificationEvidence: readonly string[];
  readonly requiredEvidenceClass: ObligationEvidenceClass;
  readonly requiredIndependentRoots: number;
}

export interface ObligationWorkPacket {
  readonly schemaVersion: 1;
  readonly graphId: string;
  readonly objective: string;
  readonly objectiveBinding: string;
  readonly subjectBinding: string | null;
  readonly unresolved: readonly ObligationWorkItem[];
  readonly satisfiedToPreserve: readonly ObligationWorkItem[];
  readonly falsified: readonly ObligationWorkItem[];
  readonly nextEligibleObligationIds: readonly string[];
  readonly acceptanceState: "ACCEPTABLE" | "REJECTED" | "INCOMPLETE" | "STALE";
  readonly instruction: string;
  readonly grantsAuthority: false;
}

export interface ReasoningObligationGraphConfig {
  readonly graphId: string;
  readonly objective: string;
  readonly objectiveBinding: string;
  readonly obligations: readonly ReasoningObligationDefinition[];
  readonly maxAttempts: number;
  readonly maxEvaluations: number;
  readonly maxConcurrentAttempts: number;
  readonly attemptLifetimeMs: number;
  readonly now: () => number;
}

interface AttemptRecord {
  readonly lease: ObligationAttemptLease;
  readonly evaluations: Map<string, ObligationEvaluation[]>;
  state: "ACTIVE" | "COMPLETED" | "ABORTED";
  completionDigest: string | null;
}

interface EvaluationRecord {
  readonly evaluation: ObligationEvaluation;
  stale: boolean;
  readonly sequence: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const EVIDENCE_RANK: Readonly<Record<ObligationEvidenceClass, number>> = Object.freeze({
  E1: 1, E2: 2, E3: 3, E4: 4, E5: 5,
});
const PRIORITY_RANK: Readonly<Record<ObligationPriority, number>> = Object.freeze({
  CRITICAL: 0, REQUIRED: 1, SUPPORTING: 2,
});

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function validSubject(value: unknown): value is string {
  return typeof value === "string" && SUBJECT.test(value);
}

function validDefinition(value: ReasoningObligationDefinition): boolean {
  return Boolean(value && theoryKeys(value, ["obligationId", "kind", "priority", "statement",
    "acceptanceCriterion", "falsificationCriterion", "dependsOn", "conflictsWith", "ownerRoles",
    "minimumEvidenceClass", "minimumIndependentRoots", "freshnessDependencies", "grantsAuthority"])
    && validId(value.obligationId)
    && ["REQUIREMENT", "INVARIANT", "COVERAGE", "COUNTEREXAMPLE", "EXPERIMENT", "PROVENANCE",
      "RESOURCE", "AUTHORITY"].includes(value.kind)
    && ["CRITICAL", "REQUIRED", "SUPPORTING"].includes(value.priority)
    && theoryText(value.statement, 2_000) && theoryText(value.acceptanceCriterion, 2_000)
    && theoryText(value.falsificationCriterion, 2_000)
    && theoryStrings(value.dependsOn, 64) && theoryStrings(value.conflictsWith, 64)
    && theoryStrings(value.ownerRoles, 32) && value.ownerRoles.length > 0
    && ["E1", "E2", "E3", "E4", "E5"].includes(value.minimumEvidenceClass)
    && Number.isSafeInteger(value.minimumIndependentRoots) && value.minimumIndependentRoots >= 1
    && value.minimumIndependentRoots <= 16 && theoryStrings(value.freshnessDependencies, 64)
    && value.grantsAuthority === false);
}

function validEvaluation(value: ObligationEvaluation): boolean {
  return Boolean(value && theoryKeys(value, ["evaluationId", "obligationId", "subjectBinding", "disposition",
    "evidenceClass", "evidenceRefs", "provenanceRoot", "summary", "contentDigest", "freshnessDependencies",
    "observedAtEpochMs", "evaluatorIdentity", "grantsAuthority"])
    && validId(value.evaluationId) && validId(value.obligationId) && validSubject(value.subjectBinding)
    && ["SATISFIES", "FALSIFIES", "INCONCLUSIVE"].includes(value.disposition)
    && ["E1", "E2", "E3", "E4", "E5"].includes(value.evidenceClass)
    && theoryStrings(value.evidenceRefs, 64) && value.evidenceRefs.length > 0
    && validId(value.provenanceRoot) && theoryText(value.summary, 2_000) && DIGEST.test(value.contentDigest)
    && theoryStrings(value.freshnessDependencies, 64)
    && Number.isSafeInteger(value.observedAtEpochMs) && value.observedAtEpochMs >= 0
    && validId(value.evaluatorIdentity) && value.grantsAuthority === false);
}

function assertAcyclic(definitions: ReadonlyMap<string, ReasoningObligationDefinition>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("obligation_dependency_cycle");
    visiting.add(id);
    for (const dependency of definitions.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of definitions.keys()) visit(id);
}

/**
 * Process-local, authority-neutral obligation substrate.
 *
 * It does not reason, execute tools, or decide whether external evidence is true.
 * It preserves the work decomposition around a reasoning engine and prevents
 * model claims, correlated votes, stale evidence, or unresolved dependencies
 * from silently becoming acceptance.
 */
export class ReasoningObligationGraph {
  readonly #config: ReasoningObligationGraphConfig;
  readonly #coordinator: object;
  readonly #definitions = new Map<string, ReasoningObligationDefinition>();
  readonly #attempts = new Map<string, AttemptRecord>();
  readonly #leases = new WeakMap<ObligationAttemptLease, AttemptRecord>();
  readonly #evaluations = new Map<string, EvaluationRecord>();
  readonly #changedDependencies = new Set<string>();
  #latestCompletedAttemptId: string | null = null;
  #lastNow = 0;
  #attemptSequence = 0;
  #evaluationSequence = 0;

  private constructor(config: ReasoningObligationGraphConfig, coordinator: object) {
    this.#config = Object.freeze({ ...config, obligations: immutableTheoryValue(config.obligations) });
    this.#coordinator = coordinator;
    for (const definition of config.obligations) this.#definitions.set(definition.obligationId, definition);
  }

  static create(config: ReasoningObligationGraphConfig, coordinator: object): ReasoningObligationGraph {
    if (!coordinator || typeof coordinator !== "object" || !validId(config.graphId)
      || !theoryText(config.objective, 4_000) || !validSubject(config.objectiveBinding)
      || !Array.isArray(config.obligations) || config.obligations.length < 1 || config.obligations.length > 1_024
      || !Number.isSafeInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 10_000
      || !Number.isSafeInteger(config.maxEvaluations) || config.maxEvaluations < config.obligations.length
      || config.maxEvaluations > 1_000_000 || !Number.isSafeInteger(config.maxConcurrentAttempts)
      || config.maxConcurrentAttempts < 1 || config.maxConcurrentAttempts > 64
      || !Number.isSafeInteger(config.attemptLifetimeMs) || config.attemptLifetimeMs < 1_000
      || config.attemptLifetimeMs > 3_600_000 || typeof config.now !== "function") {
      throw new Error("obligation_graph_configuration_invalid");
    }
    const definitions = new Map<string, ReasoningObligationDefinition>();
    for (const definition of config.obligations) {
      if (!validDefinition(definition) || definitions.has(definition.obligationId)) {
        throw new Error("obligation_definition_invalid_or_duplicate");
      }
      definitions.set(definition.obligationId, immutableTheoryValue(definition));
    }
    for (const definition of definitions.values()) {
      if (definition.dependsOn.some((id) => !definitions.has(id) || id === definition.obligationId)
        || definition.conflictsWith.some((id) => !definitions.has(id) || id === definition.obligationId)) {
        throw new Error("obligation_relationship_invalid");
      }
      for (const conflicting of definition.conflictsWith) {
        if (!definitions.get(conflicting)!.conflictsWith.includes(definition.obligationId)) {
          throw new Error("obligation_conflict_not_symmetric");
        }
      }
    }
    assertAcyclic(definitions);
    return new ReasoningObligationGraph(config, coordinator);
  }

  #own(coordinator: object): void {
    if (coordinator !== this.#coordinator) throw new Error("obligation_coordinator_ownership_required");
  }

  #now(): number {
    const now = this.#config.now();
    if (!Number.isSafeInteger(now) || now < 0 || now < this.#lastNow) throw new Error("obligation_clock_invalid");
    this.#lastNow = now;
    return now;
  }

  #active(coordinator: object, lease: ObligationAttemptLease): AttemptRecord {
    this.#own(coordinator);
    const record = lease && this.#leases.get(lease);
    if (!record || record.state !== "ACTIVE" || record.lease !== lease) {
      throw new Error("obligation_attempt_not_active_or_owned");
    }
    if (this.#now() >= lease.expiresAtEpochMs) {
      record.state = "ABORTED";
      throw new Error("obligation_attempt_expired");
    }
    return record;
  }

  beginAttempt(coordinator: object, input: {
    readonly attemptId: string;
    readonly subjectBinding: string;
    readonly ownerRole: string;
  }): ObligationAttemptLease {
    this.#own(coordinator);
    const now = this.#now();
    const activeCount = [...this.#attempts.values()].filter((item) => item.state === "ACTIVE").length;
    if (!input || !validId(input.attemptId) || !validSubject(input.subjectBinding) || !validId(input.ownerRole)
      || this.#attempts.has(input.attemptId)) throw new Error("obligation_attempt_invalid_or_duplicate");
    if (this.#attempts.size >= this.#config.maxAttempts) throw new Error("obligation_attempt_budget_exhausted");
    if (activeCount >= this.#config.maxConcurrentAttempts) throw new Error("obligation_concurrency_budget_exhausted");
    const sequence = ++this.#attemptSequence;
    const base = { attemptId: input.attemptId, subjectBinding: input.subjectBinding, ownerRole: input.ownerRole,
      sequence, startedAtEpochMs: now, expiresAtEpochMs: now + this.#config.attemptLifetimeMs };
    const lease = Object.freeze({ ...base, leaseDigest: theoryDigest([this.#config.graphId, base]),
      grantsAuthority: false as const });
    const record: AttemptRecord = { lease, evaluations: new Map(), state: "ACTIVE", completionDigest: null };
    this.#attempts.set(input.attemptId, record);
    this.#leases.set(lease, record);
    return lease;
  }

  recordEvaluation(coordinator: object, lease: ObligationAttemptLease, evaluation: ObligationEvaluation): void {
    const attempt = this.#active(coordinator, lease);
    const definition = this.#definitions.get(evaluation?.obligationId);
    if (!definition || !validEvaluation(evaluation) || evaluation.subjectBinding !== lease.subjectBinding
      || this.#evaluations.has(evaluation.evaluationId)
      || !definition.ownerRoles.includes(lease.ownerRole)) {
      throw new Error("obligation_evaluation_not_admitted");
    }
    if (evaluation.observedAtEpochMs < lease.startedAtEpochMs || evaluation.observedAtEpochMs >= lease.expiresAtEpochMs) {
      throw new Error("obligation_evaluation_time_invalid");
    }
    const retained = immutableTheoryValue(evaluation);
    const forObligation = attempt.evaluations.get(evaluation.obligationId) ?? [];
    if (forObligation.some((item) => item.provenanceRoot === evaluation.provenanceRoot
      && item.disposition === evaluation.disposition)) {
      throw new Error("obligation_correlated_duplicate_evaluation");
    }
    forObligation.push(retained);
    attempt.evaluations.set(evaluation.obligationId, forObligation);
    this.#evaluations.set(evaluation.evaluationId, { evaluation: retained, stale: false,
      sequence: ++this.#evaluationSequence });
  }

  finishAttempt(coordinator: object, lease: ObligationAttemptLease): string {
    const attempt = this.#active(coordinator, lease);
    attempt.state = "COMPLETED";
    attempt.completionDigest = theoryDigest({ lease: attempt.lease,
      evaluations: [...attempt.evaluations.values()].flat().map((item) => item.contentDigest).sort() });
    this.#latestCompletedAttemptId = attempt.lease.attemptId;
    return attempt.completionDigest;
  }

  abortAttempt(coordinator: object, lease: ObligationAttemptLease): void {
    const attempt = this.#active(coordinator, lease);
    attempt.state = "ABORTED";
  }

  invalidateDependency(coordinator: object, dependency: string): readonly string[] {
    this.#own(coordinator);
    if (!theoryText(dependency, 500)) throw new Error("obligation_dependency_invalid");
    this.#changedDependencies.add(dependency);
    const invalidated: string[] = [];
    for (const record of this.#evaluations.values()) {
      if (!record.stale && record.evaluation.freshnessDependencies.includes(dependency)) {
        record.stale = true;
        invalidated.push(record.evaluation.evaluationId);
      }
    }
    return Object.freeze(invalidated.sort());
  }

  #latestAttempt(): AttemptRecord | null {
    return this.#latestCompletedAttemptId ? this.#attempts.get(this.#latestCompletedAttemptId) ?? null : null;
  }

  assessment(obligationId: string): ObligationAssessment {
    const definition = this.#definitions.get(obligationId);
    if (!definition) throw new Error("obligation_unknown");
    const attempt = this.#latestAttempt();
    if (!attempt) return immutableTheoryValue({ obligationId, state: "OPEN" as const,
      blockingObligationIds: definition.dependsOn, satisfyingEvaluationIds: [], falsifyingEvaluationIds: [],
      inconclusiveEvaluationIds: [], distinctQualifyingRoots: 0, findings: ["NO_COMPLETED_ATTEMPT"],
      subjectBinding: null });
    const dependencyAssessments = definition.dependsOn.map((id) => this.assessment(id));
    const blockers = dependencyAssessments.filter((item) => item.state !== "SATISFIED").map((item) => item.obligationId);
    const records = attempt.evaluations.get(obligationId) ?? [];
    const stored = records.map((record) => this.#evaluations.get(record.evaluationId)).filter(
      (record): record is EvaluationRecord => Boolean(record));
    const stale = stored.some((record) => record.stale);
    const fresh = stored.filter((record) => !record.stale).map((record) => record.evaluation);
    const satisfying = fresh.filter((evaluation) => evaluation.disposition === "SATISFIES");
    const falsifying = fresh.filter((evaluation) => evaluation.disposition === "FALSIFIES");
    const inconclusive = fresh.filter((evaluation) => evaluation.disposition === "INCONCLUSIVE");
    const qualifying = satisfying.filter((item) => EVIDENCE_RANK[item.evidenceClass]
      >= EVIDENCE_RANK[definition.minimumEvidenceClass]);
    const qualifyingFalsification = falsifying.filter((item) => EVIDENCE_RANK[item.evidenceClass]
      >= EVIDENCE_RANK[definition.minimumEvidenceClass]);
    const roots = new Set(qualifying.map((item) => item.provenanceRoot));
    let state: ObligationState = "OPEN";
    const findings: string[] = [];
    if (stale) { state = "STALE"; findings.push("EVIDENCE_DEPENDENCY_CHANGED"); }
    else if (qualifyingFalsification.length > 0) {
      state = "FALSIFIED";
      findings.push(...qualifyingFalsification.flatMap((item) => item.evidenceRefs));
    }
    else if (blockers.length > 0) { state = "BLOCKED"; findings.push("DEPENDENCIES_UNRESOLVED"); }
    else if (inconclusive.length > 0 || falsifying.length > 0) {
      state = "INCONCLUSIVE";
      findings.push(...inconclusive.flatMap((item) => item.evidenceRefs));
      if (falsifying.length > 0) findings.push("FALSIFICATION_EVIDENCE_CLASS_INSUFFICIENT");
    }
    else if (satisfying.length > 0 && roots.size >= definition.minimumIndependentRoots) state = "SATISFIED";
    else if (satisfying.length > 0) {
      state = "INCONCLUSIVE";
      if (qualifying.length < satisfying.length) findings.push("EVIDENCE_CLASS_INSUFFICIENT");
      if (roots.size < definition.minimumIndependentRoots) findings.push("EVIDENCE_INDEPENDENCE_INSUFFICIENT");
    } else findings.push("EVALUATION_MISSING");
    return immutableTheoryValue({ obligationId, state, blockingObligationIds: blockers,
      satisfyingEvaluationIds: qualifying.map((item) => item.evaluationId),
      falsifyingEvaluationIds: qualifyingFalsification.map((item) => item.evaluationId),
      inconclusiveEvaluationIds: [...inconclusive,
        ...satisfying.filter((item) => !qualifying.includes(item)),
        ...falsifying.filter((item) => !qualifyingFalsification.includes(item))].map((item) => item.evaluationId),
      distinctQualifyingRoots: roots.size, findings: [...new Set(findings)],
      subjectBinding: attempt.lease.subjectBinding });
  }

  #workItem(definition: ReasoningObligationDefinition, assessment: ObligationAssessment): ObligationWorkItem {
    return immutableTheoryValue({ obligationId: definition.obligationId, priority: definition.priority,
      kind: definition.kind, statement: definition.statement, acceptanceCriterion: definition.acceptanceCriterion,
      falsificationCriterion: definition.falsificationCriterion, state: assessment.state,
      blockers: assessment.blockingObligationIds, preservedEvidence: assessment.satisfyingEvaluationIds,
      falsificationEvidence: assessment.falsifyingEvaluationIds,
      requiredEvidenceClass: definition.minimumEvidenceClass,
      requiredIndependentRoots: definition.minimumIndependentRoots });
  }

  workPacket(): ObligationWorkPacket {
    const definitions = [...this.#definitions.values()];
    const assessed = definitions.map((definition) => ({ definition, assessment: this.assessment(definition.obligationId) }));
    const items = assessed.map(({ definition, assessment }) => this.#workItem(definition, assessment));
    const unresolved = items.filter((item) => !["SATISFIED", "FALSIFIED"].includes(item.state));
    const falsified = items.filter((item) => item.state === "FALSIFIED");
    const satisfied = items.filter((item) => item.state === "SATISFIED");
    const nextEligible = unresolved.filter((item) => item.blockers.length === 0)
      .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
        || left.obligationId.localeCompare(right.obligationId)).map((item) => item.obligationId);
    const conflict = assessed.some(({ definition, assessment }) => assessment.state === "SATISFIED"
      && definition.conflictsWith.some((id) => this.assessment(id).state === "SATISFIED"));
    const required = assessed.filter(({ definition }) => definition.priority !== "SUPPORTING");
    const acceptanceState = items.some((item) => item.state === "STALE") ? "STALE"
      : falsified.some((item) => item.priority !== "SUPPORTING") || conflict ? "REJECTED"
        : required.every(({ assessment }) => assessment.state === "SATISFIED") ? "ACCEPTABLE" : "INCOMPLETE";
    const attempt = this.#latestAttempt();
    return immutableTheoryValue({ schemaVersion: 1, graphId: this.#config.graphId,
      objective: this.#config.objective, objectiveBinding: this.#config.objectiveBinding,
      subjectBinding: attempt?.lease.subjectBinding ?? null, unresolved, satisfiedToPreserve: satisfied,
      falsified, nextEligibleObligationIds: nextEligible, acceptanceState,
      instruction: falsified.length > 0
        ? "Revise the candidate to remove every falsification while preserving already satisfied obligations."
        : unresolved.length > 0
          ? "Resolve eligible obligations first, then their newly unblocked dependents; return one candidate addressing every required obligation with evidence."
          : "All required obligations are satisfied; do not infer authority or broader generalization.",
      grantsAuthority: false as const });
  }

  snapshot() {
    const attempts = [...this.#attempts.values()].map((record) => ({ lease: record.lease, state: record.state,
      completionDigest: record.completionDigest, evaluationIds: [...record.evaluations.values()].flat()
        .map((item) => item.evaluationId).sort() }));
    const assessments = [...this.#definitions.keys()].map((id) => this.assessment(id));
    return immutableTheoryValue({ schemaVersion: 1, graphId: this.#config.graphId,
      objectiveBinding: this.#config.objectiveBinding, definitions: [...this.#definitions.values()], attempts,
      assessments, latestCompletedAttemptId: this.#latestCompletedAttemptId,
      changedDependencies: [...this.#changedDependencies].sort(), workPacket: this.workPacket(),
      metrics: { obligationCount: this.#definitions.size, attemptCount: this.#attempts.size,
        activeAttempts: [...this.#attempts.values()].filter((item) => item.state === "ACTIVE").length,
        evaluationCount: this.#evaluations.size, authorityGranted: false },
      integrityDigest: theoryDigest({ graphId: this.#config.graphId, attempts, assessments }),
      grantsAuthority: false as const });
  }
}
