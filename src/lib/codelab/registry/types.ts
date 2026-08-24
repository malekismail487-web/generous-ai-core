export const MATURITY_STATES = Object.freeze([
  "PROPOSED",
  "SPECIFIED",
  "PROTOTYPED",
  "IMPLEMENTED",
  "INTEGRATED",
  "VERIFIED",
  "INDEPENDENTLY_REPLICATED",
  "PRODUCTION_READY",
  "ROUTINIZED",
  "REJECTED_EXPERIMENTALLY",
  "RETIRED",
] as const);
export type MaturityState = (typeof MATURITY_STATES)[number];

export const EPISTEMIC_STATES = Object.freeze([
  "SUPPORTED",
  "REFUTED",
  "CONFLICTED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "STALE",
  "OUT_OF_SCOPE",
] as const);
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

export const EVIDENCE_CLASSES = Object.freeze(["E0", "E1", "E2", "E3", "E4", "E5"] as const);
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const CORPUS_STATUSES = Object.freeze([
  "PARTIAL",
  "INGESTED_UNRECONCILED",
  "LOSSLESSLY_CERTIFIED",
] as const);
export type CorpusStatus = (typeof CORPUS_STATUSES)[number];

export const VERIFICATION_STATES = Object.freeze([
  "UNVERIFIED",
  "PARTIALLY_VERIFIED",
  "VERIFIED",
  "INDEPENDENTLY_REPLICATED",
  "REJECTED",
] as const);
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const RESEARCH_MATURITY_STATES = Object.freeze([
  "CONCEPT",
  "HYPOTHESIS_DEFINED",
  "EXPERIMENT_DESIGNED",
  "EXPERIMENT_RUN",
  "REPLICATED",
  "OPERATIONALIZED",
] as const);
export type ResearchMaturity = (typeof RESEARCH_MATURITY_STATES)[number];

export type EvidenceResult = "SUPPORTS" | "FALSIFIES" | "INCONCLUSIVE";
export type EvidenceFreshness = "CURRENT" | "STALE";

export interface SourceProvenance {
  readonly sourceId: string;
  readonly sourceType: "conversation" | "document" | "repository" | "external";
  readonly locator: string;
  /** Null is permitted only while the source corpus is not losslessly certified. */
  readonly contentHash: string | null;
}

export interface EvidenceRecord {
  readonly evidenceId: string;
  readonly evidenceClass: EvidenceClass;
  readonly result: EvidenceResult;
  readonly claim: string;
  readonly provenance: SourceProvenance;
  readonly artifactRef: string;
  readonly mechanism: string;
  readonly freshness: EvidenceFreshness;
  /** Concrete reason this evidence is methodologically independent. */
  readonly independenceBasis: string | null;
}

export interface Criterion {
  readonly criterionId: string;
  readonly statement: string;
  readonly measurement: string;
  readonly threshold: string;
}

export interface MaturityAttestation {
  readonly state: MaturityState;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface ImplementationMapping {
  readonly kind: "repository" | "service" | "model" | "tool" | "process";
  readonly ref: string;
  readonly status: "active" | "experimental" | "historical";
}

export interface SecurityProfile {
  readonly threatModel: readonly string[];
  readonly privilegeRequirements: readonly string[];
  readonly dataSensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  readonly isolationRequirements: readonly string[];
  readonly attackSurface: readonly string[];
  readonly trustAssumptions: readonly string[];
  readonly possibleMisuse: readonly string[];
  readonly compromisePaths: readonly string[];
  readonly blastRadius: string;
  readonly containmentMechanisms: readonly string[];
  readonly rollbackMechanisms: readonly string[];
  readonly securityEvidenceIds: readonly string[];
}

export interface ResearchHypothesis {
  readonly statement: string;
  readonly supportCriterion: string;
  readonly falsificationCriterion: string;
  readonly baseline: string;
  readonly competingExplanations: readonly string[];
  readonly measurementMethod: string;
  readonly requiredPopulation: string;
  readonly computeBudget: string;
  readonly calibrationRequirement: string;
}

export const PLAN_RELATION_KINDS = Object.freeze([
  "REFINES",
  "OVERLAPS",
  "CONTRADICTS",
  "DERIVES_FROM",
  "SUPERSEDES_OPERATIONALLY",
] as const);
export type PlanRelationKind = (typeof PLAN_RELATION_KINDS)[number];

export const CAPABILITY_RELATION_KINDS = Object.freeze([
  "ENABLES",
  "DEPENDS_ON",
  "COMPOSES_WITH",
  "VERIFIES",
  "REPLACES",
] as const);
export type CapabilityRelationKind = (typeof CAPABILITY_RELATION_KINDS)[number];

export interface PlanRelationship {
  readonly kind: PlanRelationKind;
  readonly targetId: string;
}

export interface CapabilityRelationship {
  readonly kind: CapabilityRelationKind;
  readonly targetId: string;
}

export interface RegistryRecordBase {
  readonly canonicalId: string;
  readonly originalSourceId: string;
  readonly title: string;
  readonly source: SourceProvenance;
  readonly corpusStatus: CorpusStatus;
  readonly losslessCertification: boolean;
  readonly maturity: MaturityState;
  readonly maturityHistory: readonly MaturityAttestation[];
  readonly epistemicState: EpistemicState;
  readonly verificationState: VerificationState;
  readonly evidence: readonly EvidenceRecord[];
  readonly acceptanceCriteria: readonly Criterion[];
  readonly falsificationCriteria: readonly Criterion[];
  /** May reference either plan or capability canonical IDs. */
  readonly dependencies: readonly string[];
  readonly implementationMappings: readonly ImplementationMapping[];
  readonly securityProfile: SecurityProfile;
  readonly researchMaturity: ResearchMaturity;
  readonly hypothesis?: ResearchHypothesis;
}

export interface PlanRecord extends RegistryRecordBase {
  readonly recordType: "PLAN";
  readonly relationships: readonly PlanRelationship[];
  readonly securityClosureSubstates?: readonly SecurityClosureSubstate[];
}

export interface SecurityClosureSubstate {
  readonly substateId: string;
  readonly satisfied: boolean;
  readonly epistemicState: EpistemicState;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface CapabilityRecord extends RegistryRecordBase {
  readonly recordType: "CAPABILITY";
  readonly relationships: readonly CapabilityRelationship[];
  readonly expectedEvidence: readonly string[];
  readonly certificates?: readonly CapabilityCertificate[];
}

export interface CapabilityCertificate {
  readonly certificateId: string;
  readonly title: string;
  readonly maturity: MaturityState;
  readonly epistemicState: EpistemicState;
  readonly verificationState: VerificationState;
  readonly evidenceIds: readonly string[];
  readonly threshold: string;
  readonly result: string;
  readonly confidence: number;
}

export interface CapabilityRegressionRecord {
  readonly capabilityId: string;
  readonly expectedEvidence: readonly string[];
  readonly previousResult: string;
  readonly currentResult: string;
  readonly change: "IMPROVED" | "UNCHANGED" | "REGRESSED" | "NEW" | "UNKNOWN";
  readonly confidence: number;
  readonly previousEvidenceIds: readonly string[];
  readonly currentEvidenceIds: readonly string[];
}

export const INSTITUTIONAL_WORK_STATES = Object.freeze([
  "SATISFIED",
  "NOT_STARTED",
  "BLOCKED_EXTERNAL",
  "UNKNOWN",
  "REJECTED",
] as const);
export type InstitutionalWorkState = (typeof INSTITUTIONAL_WORK_STATES)[number];

export const INSTITUTIONAL_ADMINISTRATIVE_STATES = Object.freeze([
  "QUEUED",
  "BLOCKED_EXTERNAL",
  "AUTHORIZED",
  "CANCELLED",
  "SUPERSEDED",
] as const);
export type InstitutionalAdministrativeState = (typeof INSTITUTIONAL_ADMINISTRATIVE_STATES)[number];

export const INSTITUTIONAL_EVIDENTIARY_STATES = Object.freeze([
  "UNVERIFIED",
  "SUPPORTED",
  "VERIFIED",
  "REFUTED",
  "CONFLICTED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "STALE",
  "REQUIRES_REVALIDATION",
] as const);
export type InstitutionalEvidentiaryState = (typeof INSTITUTIONAL_EVIDENTIARY_STATES)[number];

export interface EvidenceBoundWorkState {
  readonly workItemId: string;
  readonly administrativeState: InstitutionalAdministrativeState;
  readonly evidentiaryState: InstitutionalEvidentiaryState;
  readonly evidenceAdmissionRefs: readonly string[];
  readonly blockingReasons: readonly string[];
}

export interface InstitutionalWorkItem {
  readonly workItemId: string;
  readonly title: string;
  readonly state: InstitutionalWorkState;
  readonly registryRecordId: string | null;
  readonly dependencies: readonly string[];
  readonly blockingReasons: readonly string[];
}

export interface InstitutionalCriticalPath {
  readonly pathId: string;
  readonly title: string;
  readonly targetWorkItemId: string;
  readonly workItems: readonly InstitutionalWorkItem[];
}

export interface OmegaRegistry {
  readonly schemaVersion: 1;
  readonly corpusStatus: CorpusStatus;
  readonly losslessCertification: boolean;
  readonly plans: readonly PlanRecord[];
  readonly capabilities: readonly CapabilityRecord[];
  readonly regressions: readonly CapabilityRegressionRecord[];
  /** Optional schema-v1 extension. Older compatible v1 snapshots may omit critical paths. */
  readonly criticalPaths?: readonly InstitutionalCriticalPath[];
}
