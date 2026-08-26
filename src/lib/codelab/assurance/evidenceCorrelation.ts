export const EVIDENCE_CORRELATION_CLASSES = Object.freeze([
  "HIGHLY_CORRELATED",
  "PARTIALLY_CORRELATED",
  "LOW_CORRELATION",
  "INDEPENDENT_MECHANISM",
  "UNKNOWN",
] as const);
export type EvidenceCorrelationClass = (typeof EVIDENCE_CORRELATION_CLASSES)[number];

export interface EvidenceMechanismProfile {
  readonly mechanismId: string;
  readonly suiteId: string;
  readonly evidenceClass: "E0" | "E1" | "E2" | "E3" | "E4" | "E5";
  readonly mechanismKind: "IMPLEMENTATION_ADJACENT_TEST" | "SEPARATE_EVALUATOR" | "DETERMINISTIC_EXTERNAL_TOOL" | "ENVIRONMENTAL_REPLICATION";
  readonly implementationOwnership: readonly string[];
  readonly sharedCodeDependencies: readonly string[];
  readonly sharedFixtures: readonly string[];
  readonly sharedSchemas: readonly string[];
  readonly sharedEnvironment: readonly string[];
  readonly sharedModelAssumptions: readonly string[];
  readonly sharedTestAuthoringPath: readonly string[];
  readonly sharedEvidenceSource: readonly string[];
  readonly sharedRuntime: readonly string[];
  readonly currentState: "AVAILABLE" | "BLOCKED_ENVIRONMENT" | "BLOCKED_AUTHORITY";
}

export interface EvidenceRelationship {
  readonly left: string;
  readonly right: string;
  readonly classification: EvidenceCorrelationClass;
  readonly sharedAssumptions: readonly string[];
  readonly rationale: string;
  readonly numericalIndependenceScore: null;
}

function overlap(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((item) => rightSet.has(item)))].sort();
}

export function classifyEvidenceRelationship(left: EvidenceMechanismProfile, right: EvidenceMechanismProfile): EvidenceRelationship {
  const dimensions = [
    ["code", overlap(left.sharedCodeDependencies, right.sharedCodeDependencies)],
    ["fixture", overlap(left.sharedFixtures, right.sharedFixtures)],
    ["schema", overlap(left.sharedSchemas, right.sharedSchemas)],
    ["environment", overlap(left.sharedEnvironment, right.sharedEnvironment)],
    ["model", overlap(left.sharedModelAssumptions, right.sharedModelAssumptions)],
    ["authoring", overlap(left.sharedTestAuthoringPath, right.sharedTestAuthoringPath)],
    ["source", overlap(left.sharedEvidenceSource, right.sharedEvidenceSource)],
    ["runtime", overlap(left.sharedRuntime, right.sharedRuntime)],
    ["ownership", overlap(left.implementationOwnership, right.implementationOwnership)],
  ] as const;
  const shared = dimensions.flatMap(([dimension, values]) => values.map((value) => `${dimension}:${value}`));
  const external = left.mechanismKind === "DETERMINISTIC_EXTERNAL_TOOL" || right.mechanismKind === "DETERMINISTIC_EXTERNAL_TOOL";
  const blocked = left.currentState !== "AVAILABLE" || right.currentState !== "AVAILABLE";
  const stronglyImplementationAdjacent = left.mechanismKind === "IMPLEMENTATION_ADJACENT_TEST"
    && right.mechanismKind === "IMPLEMENTATION_ADJACENT_TEST"
    && overlap(left.implementationOwnership, right.implementationOwnership).length > 0
    && (overlap(left.sharedCodeDependencies, right.sharedCodeDependencies).length > 0 || overlap(left.sharedSchemas, right.sharedSchemas).length > 0);

  let classification: EvidenceCorrelationClass;
  if (blocked) classification = "UNKNOWN";
  else if (stronglyImplementationAdjacent) classification = "HIGHLY_CORRELATED";
  else if (external && shared.length <= 3) classification = "INDEPENDENT_MECHANISM";
  else if (shared.length >= 3) classification = "PARTIALLY_CORRELATED";
  else if (shared.length > 0) classification = "LOW_CORRELATION";
  else classification = "UNKNOWN";
  return Object.freeze({
    left: left.mechanismId,
    right: right.mechanismId,
    classification,
    sharedAssumptions: Object.freeze(shared),
    rationale: blocked
      ? "At least one mechanism is not currently executable, so independence cannot be established."
      : classification === "INDEPENDENT_MECHANISM"
        ? "A deterministic external tool supplies a distinct checking mechanism despite shared candidate input."
        : `Relationship is based on explicit overlap across ${shared.length} named assumption paths.`,
    numericalIndependenceScore: null,
  });
}

const profile = (value: EvidenceMechanismProfile): EvidenceMechanismProfile => Object.freeze(value);
export const MAJOR_EVIDENCE_MECHANISMS = Object.freeze<readonly EvidenceMechanismProfile[]>([
  profile({ mechanismId: "R2_CANDIDATE_PACKAGE_CONTRACT", suiteId: "OMEGA-R2-A-CANDIDATE-PACKAGE", evidenceClass: "E3", mechanismKind: "IMPLEMENTATION_ADJACENT_TEST", implementationOwnership: ["OMEGA_LOCAL_AUTHORING"], sharedCodeDependencies: ["R2_CANDIDATE_PACKAGE"], sharedFixtures: ["LOCAL_SYNTHETIC_R2"], sharedSchemas: ["R2_A_PACKAGE_SCHEMA"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["DIRECTIVE_009_INTERPRETATION"], sharedTestAuthoringPath: ["CURRENT_CODEX_SESSION_LINEAGE"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "R2_NEGATIVE_CAPABILITY_EVALUATOR", suiteId: "OMEGA-R2-A-NEGATIVE-CAP-EVAL", evidenceClass: "E3", mechanismKind: "SEPARATE_EVALUATOR", implementationOwnership: ["OMEGA_LOCAL_AUTHORING"], sharedCodeDependencies: ["AUTHORITY_NAMES"], sharedFixtures: ["LOCAL_SYNTHETIC_R2"], sharedSchemas: ["R2_A_AUTHORITY_DELTA"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["DIRECTIVE_009_INTERPRETATION"], sharedTestAuthoringPath: ["CURRENT_CODEX_SESSION_LINEAGE"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "R2_ASSURANCE_EVALUATOR", suiteId: "OMEGA-ASSURE-R2-EVALUATOR", evidenceClass: "E3", mechanismKind: "SEPARATE_EVALUATOR", implementationOwnership: ["OMEGA_LOCAL_AUTHORING"], sharedCodeDependencies: ["EVIDENCE_CUSTODY"], sharedFixtures: ["LOCAL_SYNTHETIC_R2"], sharedSchemas: ["R2_ASSURANCE_SCHEMA"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["OMEGA_ASSURANCE_LAWS"], sharedTestAuthoringPath: ["CURRENT_CODEX_SESSION_LINEAGE"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "R1_EXECUTOR_CONTRACT", suiteId: "OMEGA-READ-ONLY-EXECUTOR", evidenceClass: "E3", mechanismKind: "IMPLEMENTATION_ADJACENT_TEST", implementationOwnership: ["OMEGA_R1_IMPLEMENTATION"], sharedCodeDependencies: ["READ_ONLY_EXECUTOR"], sharedFixtures: ["R1_LOCAL_FIXTURES"], sharedSchemas: ["R1_CAPABILITY_SCHEMA"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["R1_REQUIREMENT_INTERPRETATION"], sharedTestAuthoringPath: ["R1_IMPLEMENTATION_PATH"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "R1_PRIVATE_HELDOUT_EVALUATOR", suiteId: "OMEGA-R1-PRIVATE-EVAL", evidenceClass: "E3", mechanismKind: "SEPARATE_EVALUATOR", implementationOwnership: ["OMEGA_EVALUATION_AUTHORING"], sharedCodeDependencies: ["R1_PUBLIC_CONTRACTS"], sharedFixtures: ["R1_HELDOUT_FIXTURES"], sharedSchemas: ["R1_CAPABILITY_SCHEMA"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["R1_REQUIREMENT_INTERPRETATION"], sharedTestAuthoringPath: ["R1_HELDOUT_PATH"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "TYPESCRIPT_COMPILER", suiteId: "OMEGA-TS-RATCHET", evidenceClass: "E3", mechanismKind: "DETERMINISTIC_EXTERNAL_TOOL", implementationOwnership: ["MICROSOFT_TYPESCRIPT"], sharedCodeDependencies: [], sharedFixtures: [], sharedSchemas: ["TSC_TYPE_SYSTEM"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: [], sharedTestAuthoringPath: [], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "VITE_PRODUCTION_BUILD", suiteId: "PRODUCTION_BUILD", evidenceClass: "E3", mechanismKind: "DETERMINISTIC_EXTERNAL_TOOL", implementationOwnership: ["VITE_ESBUILD"], sharedCodeDependencies: [], sharedFixtures: [], sharedSchemas: ["BUILD_CONFIGURATION"], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: [], sharedTestAuthoringPath: [], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "SECRET_SCANNER", suiteId: "SECRET_SCAN", evidenceClass: "E3", mechanismKind: "SEPARATE_EVALUATOR", implementationOwnership: ["OMEGA_SECURITY_TOOLING"], sharedCodeDependencies: ["SECRET_SCAN_PATTERNS"], sharedFixtures: [], sharedSchemas: [], sharedEnvironment: ["CURRENT_WINDOWS_HOST"], sharedModelAssumptions: ["LOCAL_PATTERN_COVERAGE"], sharedTestAuthoringPath: ["OMEGA_SECURITY_AUTHORING"], sharedEvidenceSource: ["LOCAL_REPOSITORY"], sharedRuntime: ["NODE_24"], currentState: "AVAILABLE" }),
  profile({ mechanismId: "R1_INDEPENDENT_REPLICATION", suiteId: "OMEGA-R1-INDEPENDENT-REPLICATION", evidenceClass: "E0", mechanismKind: "ENVIRONMENTAL_REPLICATION", implementationOwnership: ["UNASSIGNED_EXTERNAL_OPERATOR"], sharedCodeDependencies: [], sharedFixtures: [], sharedSchemas: ["R1_REPLICATION_SPEC"], sharedEnvironment: [], sharedModelAssumptions: [], sharedTestAuthoringPath: [], sharedEvidenceSource: [], sharedRuntime: [], currentState: "BLOCKED_ENVIRONMENT" }),
]);

export const EVIDENCE_BOTTLENECKS = Object.freeze([
  Object.freeze({ claimFamily: "R2_PREACTUATION_SAFETY", state: "IMPLEMENTATION_ADJACENT_E3_DOMINANT", reason: "Candidate, negative-capability, custody, and assurance evidence are locally authored and run on one host." }),
  Object.freeze({ claimFamily: "R1_CROSS_ENVIRONMENT_REPRODUCIBILITY", state: "BLOCKED_ENVIRONMENT", reason: "No exact clean dependency-complete independent environment is available." }),
  Object.freeze({ claimFamily: "FILESYSTEM_MUTATION_SAFETY", state: "UNOBSERVED", reason: "Operational R2 authority remains unavailable." }),
  Object.freeze({ claimFamily: "SEC003_CONTAINMENT", state: "BLOCKED_EXTERNAL", reason: "Authorized Lovable deployment and resulting-state evidence remain unavailable." }),
]);

export function validateEvidenceCorrelationMap(profiles: readonly EvidenceMechanismProfile[] = MAJOR_EVIDENCE_MECHANISMS): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const item of profiles) {
    if (!item.mechanismId.trim() || !item.suiteId.trim()) issues.push("malformed_evidence_mechanism_identity");
    if (ids.has(item.mechanismId)) issues.push(`duplicate_evidence_mechanism:${item.mechanismId}`);
    ids.add(item.mechanismId);
    if (item.currentState === "AVAILABLE" && item.sharedEvidenceSource.length === 0) issues.push(`available_mechanism_without_evidence_source:${item.mechanismId}`);
  }
  if (!ids.has("R2_ASSURANCE_EVALUATOR") || !ids.has("R1_PRIVATE_HELDOUT_EVALUATOR") || !ids.has("TYPESCRIPT_COMPILER") || !ids.has("R1_INDEPENDENT_REPLICATION")) issues.push("major_evidence_family_missing");
  return Object.freeze([...new Set(issues)]);
}
