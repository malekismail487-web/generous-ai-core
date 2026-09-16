import { immutableTheoryValue, theoryDigest, theoryKeys, theoryStrings, theoryText } from "./theoryContracts";

export type ResearchDomain = "SOFTWARE" | "MATHEMATICS" | "SCIENCE";
export type ResearchRole = "INVESTIGATOR" | "FALSIFIER" | "REVISER" | "META_REVIEWER";
export type TheoryPerspectiveId = "STATE_TRANSITION" | "BOUNDARY_ADVERSARY" | "DATA_CONTROL_FLOW"
  | "INTEGRATION_EFFECT" | "CONCURRENCY_ORDERING" | "RESOURCE_LIFECYCLE" | "IDENTITY_AUTHORIZATION"
  | "TEMPORAL_EXPIRY" | "NUMERICAL_INVARIANT" | "CAUSAL_INTERVENTION" | "REPRESENTATION_ENCODING"
  | "ENVIRONMENT_VARIANCE";
export type ResearchEvidenceClass = "E1" | "E3" | "E4";
export type ResearchEpistemicState = "UNKNOWN" | "SUPPORTED" | "REFUTED" | "CONFLICTED"
  | "INSUFFICIENT_EVIDENCE" | "STALE";

export interface ResearchEvidenceItem {
  readonly evidenceId: string;
  readonly evidenceClass: ResearchEvidenceClass;
  readonly kind: "REQUIREMENT" | "SOURCE" | "OBSERVATION" | "EXPERIMENT_RESULT" | "MODEL_CONTRIBUTION";
  readonly summary: string;
  readonly contentDigest: string;
  readonly provenanceRoot: string;
  readonly freshnessDependencies: readonly string[];
  readonly observedAtEpochMs: number;
  readonly candidateBinding: string;
  readonly grantsAuthority: false;
}

export interface ResearchMechanism {
  readonly mechanismId: string;
  readonly description: string;
}

export interface ResearchExperiment {
  readonly experimentId: string;
  readonly toolId: string;
  readonly question: string;
  readonly possibleOutcomes: readonly string[];
  readonly costUnits: number;
  readonly authority: "READ_REPOSITORY" | "RUN_TEST_IN_SANDBOX";
  readonly scope: readonly string[];
  readonly mutatesCandidate: false;
}

export interface ResearchPartyObjective {
  readonly schemaVersion: 1;
  readonly researchId: string;
  readonly objective: string;
  readonly domain: ResearchDomain;
  readonly candidateBinding: string;
  readonly scope: readonly string[];
  /** A bounded mechanism family is required for this first falsifiable specialist tissue. */
  readonly mechanismCatalog: readonly ResearchMechanism[];
  readonly admittedEvidence: readonly ResearchEvidenceItem[];
  readonly experimentCatalog: readonly ResearchExperiment[];
  readonly successCriteria: readonly string[];
  readonly expiryEpochMs: number;
}

export interface TheoryForecast {
  readonly experimentId: string;
  readonly expectedOutcome: string;
  readonly rationale: string;
}

export interface TheoryCounterexample {
  readonly targetTheoryId: string;
  readonly experimentId: string;
  readonly disconfirmingOutcome: string;
  readonly rationale: string;
}

export type TheoryCognitionDecision = "PROPOSE_HYPOTHESIS" | "CHALLENGE" | "REVISE_HYPOTHESIS" | "NO_CONCLUSION";

export interface TheoryCognitionIntent {
  readonly schemaVersion: 1;
  readonly decision: TheoryCognitionDecision;
  readonly thesis: string;
  readonly mechanismId: string | null;
  readonly causalMechanism: string | null;
  readonly evidenceRefs: readonly string[];
  readonly assumptions: readonly string[];
  readonly uncertainties: readonly string[];
  readonly forecasts: readonly TheoryForecast[];
  readonly counterexamples: readonly TheoryCounterexample[];
  readonly requestedExperimentIds: readonly string[];
  readonly revisionOfTheoryId: string | null;
  /** A model estimate is retained as introspection, never accepted as calibrated evidence. */
  readonly modelEstimate: number | null;
}

export interface TheoryContribution {
  readonly contributionId: string;
  readonly theoryId: string;
  readonly guardianId: string;
  readonly role: ResearchRole;
  readonly objectiveDigest: string;
  readonly intent: TheoryCognitionIntent;
  readonly modelEvidence: ResearchEvidenceItem;
  readonly committedAtEpochMs: number;
  readonly contributionDigest: string;
  readonly grantsAuthority: false;
}

export interface ResearchExperimentObservation {
  readonly observationId: string;
  readonly experimentId: string;
  readonly toolId: string;
  readonly outcome: string;
  readonly evidence: ResearchEvidenceItem;
  readonly executionIdentity: string;
  readonly outputDigest: string;
  readonly authorityGranted: false;
}

export interface ResearchPartyLimits {
  readonly maxEntities: number;
  readonly maxModelCalls: number;
  readonly maxExperiments: number;
  readonly maxEvidenceItems: number;
  readonly maxWallClockMs: number;
  readonly maxPromptBytesPerCall: number;
  readonly maxOutputTokensPerCall: number;
  readonly maxTotalOutputTokens: number;
  readonly maxCostUnits: number;
}

export interface TheoryPerspectiveAssignment {
  readonly perspectiveId: TheoryPerspectiveId;
  readonly ordinal: number;
  readonly instruction: string;
  readonly relevantCues: readonly string[];
  readonly relevanceScore: number;
  readonly noveltyScore: number;
}

export interface TheoryPerspectiveRoute {
  readonly schemaVersion: 1;
  readonly algorithmId: "FIXED_ROTATION_V1" | "SPARSE_RELEVANCE_DIVERSITY_V1";
  readonly objectiveDigest: string;
  readonly inputFeatureDigest: string;
  readonly inputFeatureCount: number;
  readonly candidatePerspectiveCount: number;
  readonly assignments: readonly TheoryPerspectiveAssignment[];
  readonly sparseActivationRatio: number;
  readonly grantsAuthority: false;
}

export interface TheoryCognitionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly role: ResearchRole;
  readonly theoryId: string;
  readonly guardianId: string;
  readonly objective: ResearchPartyObjective;
  readonly privatePriorContributions: readonly TheoryContribution[];
  readonly peerContributions: readonly TheoryContribution[];
  readonly experimentObservations: readonly ResearchExperimentObservation[];
  readonly instruction: string;
  readonly maxOutputTokens: number;
  readonly observedAtEpochMs: number;
  readonly deadlineEpochMs: number;
  readonly signal?: AbortSignal;
}

export interface TheoryCognitionEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: "E3" | "E4";
  readonly providerId: string;
  readonly model: string;
  readonly requestDigest: string | null;
  readonly responseDigest: string | null;
  readonly statusCode: number | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly finishReason: string | null;
  readonly grantsAuthority: false;
}

export interface TheoryCognitionResult {
  readonly decision: "CONTRIBUTION" | "REJECTED" | "BLOCKED" | "COGNITION_ERROR" | "WAITING_FOR_CAPACITY";
  readonly reason: string;
  readonly intent: TheoryCognitionIntent | null;
  readonly evidence: TheoryCognitionEvidence;
  readonly diagnostics: readonly string[];
  readonly grantsAuthority: false;
}

export interface ResearchHypothesisAssessment {
  readonly theoryId: string;
  readonly mechanismId: string | null;
  readonly state: ResearchEpistemicState;
  readonly supportingObservationIds: readonly string[];
  readonly falsifyingObservationIds: readonly string[];
  readonly unresolvedExperimentIds: readonly string[];
  readonly distinctEvidenceRoots: number;
  readonly modelEstimate: number | null;
  readonly calibratedProbability: null;
}

export interface ResearchPartyDecision {
  readonly state: "SUPPORTED_WITHIN_MODELED_FAMILY" | "REFUTED_MODELED_FAMILY" | "INSUFFICIENT_EVIDENCE" | "BLOCKED";
  readonly selectedTheoryId: string | null;
  readonly selectedMechanismId: string | null;
  readonly reason: string;
  readonly assessments: readonly ResearchHypothesisAssessment[];
  readonly decisiveEvidenceIds: readonly string[];
  readonly independentAcceptance: false;
  readonly grantsAuthority: false;
}

export interface ResearchPartyResourceUsage {
  readonly modelCalls: number;
  readonly experiments: number;
  readonly experimentCostUnits: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly wallClockMs: number;
}

export interface ResearchPartyResult {
  readonly researchId: string;
  readonly decision: ResearchPartyDecision;
  readonly contributions: readonly TheoryContribution[];
  readonly observations: readonly ResearchExperimentObservation[];
  readonly cognitionEvidence: readonly TheoryCognitionEvidence[];
  readonly cognitiveRouting: TheoryPerspectiveRoute | null;
  readonly resourceUsage: ResearchPartyResourceUsage;
  readonly addressability: {
    readonly reservedTheorySlots: string;
    readonly materializedTheoryGuardianPairs: number;
    readonly peakActiveReasoners: number;
    readonly simultaneousModelExecutions: number;
    readonly distributedExecutionImplemented: false;
  };
  readonly evidenceChainComplete: boolean;
  readonly actualReasoningEngine: "SHARED_NEMOTRON" | "TEST_DOUBLE";
  readonly authorityGranted: false;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CANDIDATE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export function validResearchId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function validResearchEvidence(value: ResearchEvidenceItem, candidateBinding: string): boolean {
  return Boolean(value && theoryKeys(value, ["evidenceId", "evidenceClass", "kind", "summary", "contentDigest",
    "provenanceRoot", "freshnessDependencies", "observedAtEpochMs", "candidateBinding", "grantsAuthority"])
    && validResearchId(value.evidenceId) && ["E1", "E3", "E4"].includes(value.evidenceClass)
    && ["REQUIREMENT", "SOURCE", "OBSERVATION", "EXPERIMENT_RESULT", "MODEL_CONTRIBUTION"].includes(value.kind)
    && theoryText(value.summary, 2_000) && DIGEST.test(value.contentDigest)
    && validResearchId(value.provenanceRoot) && theoryStrings(value.freshnessDependencies, 20)
    && Number.isSafeInteger(value.observedAtEpochMs) && value.observedAtEpochMs >= 0
    && value.candidateBinding === candidateBinding && value.grantsAuthority === false);
}

export function validResearchObjective(value: ResearchPartyObjective, now: number): boolean {
  if (!value || !theoryKeys(value, ["schemaVersion", "researchId", "objective", "domain", "candidateBinding", "scope",
    "mechanismCatalog", "admittedEvidence", "experimentCatalog", "successCriteria", "expiryEpochMs"])
    || value.schemaVersion !== 1 || !validResearchId(value.researchId) || !theoryText(value.objective, 4_000)
    || !["SOFTWARE", "MATHEMATICS", "SCIENCE"].includes(value.domain) || !CANDIDATE.test(value.candidateBinding)
    || !theoryStrings(value.scope, 50) || value.scope.length < 1 || !theoryStrings(value.successCriteria, 20)
    || value.successCriteria.length < 1 || !Number.isSafeInteger(value.expiryEpochMs) || value.expiryEpochMs <= now
    || !Array.isArray(value.mechanismCatalog) || value.mechanismCatalog.length < 2 || value.mechanismCatalog.length > 32
    || !Array.isArray(value.admittedEvidence) || value.admittedEvidence.length < 1 || value.admittedEvidence.length > 128
    || !Array.isArray(value.experimentCatalog) || value.experimentCatalog.length < 1 || value.experimentCatalog.length > 64) return false;
  const mechanismIds = new Set<string>();
  for (const mechanism of value.mechanismCatalog) {
    if (!mechanism || !theoryKeys(mechanism, ["mechanismId", "description"])
      || !validResearchId(mechanism.mechanismId) || mechanismIds.has(mechanism.mechanismId)
      || !theoryText(mechanism.description, 1_000)) return false;
    mechanismIds.add(mechanism.mechanismId);
  }
  const evidenceIds = new Set<string>();
  for (const evidence of value.admittedEvidence) {
    if (!validResearchEvidence(evidence, value.candidateBinding) || evidenceIds.has(evidence.evidenceId)) return false;
    evidenceIds.add(evidence.evidenceId);
  }
  const experimentIds = new Set<string>();
  const tools = new Set<string>();
  for (const experiment of value.experimentCatalog) {
    if (!experiment || !theoryKeys(experiment, ["experimentId", "toolId", "question", "possibleOutcomes", "costUnits",
      "authority", "scope", "mutatesCandidate"]) || !validResearchId(experiment.experimentId)
      || experimentIds.has(experiment.experimentId) || !validResearchId(experiment.toolId) || tools.has(experiment.toolId)
      || !theoryText(experiment.question, 1_000) || !theoryStrings(experiment.possibleOutcomes, 20)
      || experiment.possibleOutcomes.length < 2 || !Number.isSafeInteger(experiment.costUnits) || experiment.costUnits < 1
      || experiment.costUnits > 1_000 || !["READ_REPOSITORY", "RUN_TEST_IN_SANDBOX"].includes(experiment.authority)
      || !theoryStrings(experiment.scope, 50) || experiment.scope.length < 1
      || experiment.scope.some((path) => !value.scope.includes(path)) || experiment.mutatesCandidate !== false) return false;
    experimentIds.add(experiment.experimentId); tools.add(experiment.toolId);
  }
  return true;
}

export function validResearchLimits(value: ResearchPartyLimits): boolean {
  return Boolean(value && theoryKeys(value, ["maxEntities", "maxModelCalls", "maxExperiments", "maxEvidenceItems",
    "maxWallClockMs", "maxPromptBytesPerCall", "maxOutputTokensPerCall", "maxTotalOutputTokens", "maxCostUnits"])
    && Number.isSafeInteger(value.maxEntities) && value.maxEntities >= 3 && value.maxEntities <= 16
    && Number.isSafeInteger(value.maxModelCalls) && value.maxModelCalls >= 1 && value.maxModelCalls <= 64
    && Number.isSafeInteger(value.maxExperiments) && value.maxExperiments >= 1 && value.maxExperiments <= 32
    && Number.isSafeInteger(value.maxEvidenceItems) && value.maxEvidenceItems >= 1 && value.maxEvidenceItems <= 512
    && Number.isSafeInteger(value.maxWallClockMs) && value.maxWallClockMs >= 1_000 && value.maxWallClockMs <= 1_800_000
    && Number.isSafeInteger(value.maxPromptBytesPerCall) && value.maxPromptBytesPerCall >= 1_000
    && value.maxPromptBytesPerCall <= 1_000_000 && Number.isSafeInteger(value.maxOutputTokensPerCall)
    && value.maxOutputTokensPerCall >= 128 && value.maxOutputTokensPerCall <= 16_384
    && Number.isSafeInteger(value.maxTotalOutputTokens) && value.maxTotalOutputTokens >= value.maxOutputTokensPerCall
    && value.maxTotalOutputTokens <= 262_144 && Number.isSafeInteger(value.maxCostUnits)
    && value.maxCostUnits >= 1 && value.maxCostUnits <= 100_000);
}

export function researchObjectiveDigest(objective: ResearchPartyObjective): string {
  return theoryDigest(objective);
}

export function immutableResearchValue<T>(value: T): T {
  return immutableTheoryValue(value);
}
