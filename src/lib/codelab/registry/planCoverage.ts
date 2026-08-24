export const OMEGA_COVERAGE_STATUS = "PARTIAL_JUST_IN_TIME" as const;
export const OMEGA_CORPUS_STATUS = "PARTIAL_NOT_LOSSLESSLY_CERTIFIED" as const;

export const INHERITED_OMEGA_CONSTRAINTS = Object.freeze([
  "REALITY_OVER_PREDICTION",
  "EVIDENCE_OVER_CONFIDENCE",
  "PLANS_ARE_HYPOTHESES",
  "GENERATOR_REQUIRES_DETECTOR",
  "DETECTOR_REQUIRES_VALIDATION",
  "NO_SELF_CERTIFICATION",
  "NO_AUTHORITY_WITHOUT_SCOPE",
  "NO_ACTION_WITHOUT_PROVENANCE",
  "NO_OBSERVATION_WITHOUT_EVIDENCE",
  "SECURITY_SCALES_WITH_CAPABILITY",
  "CAPABILITY_NOT_AUTHORITY",
  "PLAN_NOT_AUTHORITY",
  "SPECIFICATION_NOT_CAPABILITY",
  "IMPLEMENTED_NOT_VERIFIED",
  "VERIFIED_NOT_REPLICATED",
  "REPLICATED_NOT_PRODUCTION_READY",
  "CRITICAL_FALSIFICATION_OUTRANKS_POSITIVE_VOTES",
  "BLOCKED_FAILED_PASSED_DISTINCT",
  "INTERNAL_COMPLEXITY_MUST_PAY_RENT",
] as const);

export const PLAN_CONFLICT_DOMAINS = Object.freeze([
  "AUTHORITY_MODEL",
  "EVIDENCE_ARCHITECTURE",
  "REGISTRY_INVARIANTS",
  "ASSURANCE_MODEL",
  "ROLLBACK_MODEL",
  "CAPABILITY_GENEALOGY",
  "SECURITY_CONSTRAINTS",
  "ORIGINAL_OMEGA_PLANS",
] as const);

const CURRENT_AUTHORITY = Object.freeze({
  available: Object.freeze(["READ_REPOSITORY"]),
  unavailable: Object.freeze(["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"]),
  forbidden: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]),
  grantedByArtifact: Object.freeze([] as string[]),
});

export type CoverageMaturity = "VERIFIED";
export type ConflictDisposition = "RESOLVED" | "OPEN" | "NO_CONFLICT";

export interface OmegaConceptRef {
  readonly conceptId: string;
  readonly title: string;
  readonly appliedScope: string;
}

export interface ArchitecturalConflict {
  readonly conflictId: string;
  readonly disposition: ConflictDisposition;
  readonly proposals: readonly [string, string];
  readonly preservedSourceRefs: readonly string[];
  readonly operationalDecision: string;
  readonly evidenceRefs: readonly string[];
}

export interface PlanCoverageRecord {
  readonly workstreamId: string;
  readonly registryIdentity: string;
  readonly capabilityObjectiveId: string;
  readonly visionRef: "OMEGA_VERIFIED_STATE_TRANSFORMATION";
  readonly sourceDirective: "OMEGA_DIRECTIVE_008";
  readonly coverageStatus: typeof OMEGA_COVERAGE_STATUS;
  readonly corpusStatus: typeof OMEGA_CORPUS_STATUS;
  readonly directlyImplemented: readonly OmegaConceptRef[];
  readonly supporting: readonly OmegaConceptRef[];
  readonly deferred: readonly OmegaConceptRef[];
  readonly implementedRequirements: readonly string[];
  readonly deferredRequirements: readonly string[];
  readonly conflicts: readonly ArchitecturalConflict[];
  readonly conflictDomainsChecked: typeof PLAN_CONFLICT_DOMAINS;
  readonly supersededOperationalApproaches: readonly string[];
  readonly implementationMappings: readonly string[];
  readonly testEvidenceRefs: readonly string[];
  readonly assuranceEvidenceRefs: readonly string[];
  readonly maturity: CoverageMaturity;
  readonly verificationScope: "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT";
  readonly independentlyReplicated: false;
  readonly authority: typeof CURRENT_AUTHORITY;
  readonly inheritedConstraints: typeof INHERITED_OMEGA_CONSTRAINTS;
}

function concept(conceptId: string, title: string, appliedScope: string): OmegaConceptRef {
  return Object.freeze({ conceptId, title, appliedScope });
}

function conflict(
  conflictId: string,
  proposals: readonly [string, string],
  operationalDecision: string,
  evidenceRefs: readonly string[],
): ArchitecturalConflict {
  return Object.freeze({
    conflictId,
    disposition: "RESOLVED",
    proposals,
    preservedSourceRefs: Object.freeze(["source://omega-study", "directive://008-traceability-amendment"]),
    operationalDecision,
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });
}

function record(input: Omit<PlanCoverageRecord,
  "visionRef" | "sourceDirective" | "coverageStatus" | "corpusStatus" | "maturity" | "verificationScope"
  | "independentlyReplicated" | "authority" | "inheritedConstraints" | "conflictDomainsChecked">): PlanCoverageRecord {
  return Object.freeze({
    ...input,
    visionRef: "OMEGA_VERIFIED_STATE_TRANSFORMATION",
    sourceDirective: "OMEGA_DIRECTIVE_008",
    coverageStatus: OMEGA_COVERAGE_STATUS,
    corpusStatus: OMEGA_CORPUS_STATUS,
    maturity: "VERIFIED",
    verificationScope: "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT",
    independentlyReplicated: false,
    authority: CURRENT_AUTHORITY,
    inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS,
    conflictDomainsChecked: PLAN_CONFLICT_DOMAINS,
  });
}

export const DIRECTIVE_008_PLAN_COVERAGE = Object.freeze([
  record({
    workstreamId: "OMEGA-PRE-R2-GATE-BUNDLE-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-PRE-R2-001",
    capabilityObjectiveId: "CAPABILITY-TRUST-GATED-R2-ELIGIBILITY",
    directlyImplemented: [
      concept("PLAN-D", "Machine-Readable Assurance Case", "Evidence-bearing gate requirements and result records."),
      concept("PLAN-DIII", "Completion Proof Compiler", "Requirements terminate in attributable evidence or an explicit blocker."),
      concept("PLAN-DCCLXXX", "Omega Assurance Kernel", "Three-state READY, NOT_READY, or INSUFFICIENT_EVIDENCE decision only."),
    ],
    supporting: [
      concept("PLAN-XXI", "Self-Evaluation Without Self-Deception", "Blocked and unavailable evidence cannot be counted as passing."),
      concept("PLAN-DXII", "Cognitive Cost Accounting", "Execution duration and evaluator identity are retained."),
    ],
    deferred: [
      concept("PLAN-DCXLVII", "Immutable Capability Releases", "Durable release promotion remains outside this coordinator."),
      concept("PLAN-DCCLXXX", "Independent Assurance Kernel", "Institutionally independent replication is not claimed."),
    ],
    implementedRequirements: ["typed pre-R2 requirements", "candidate/tool/environment/execution/freshness attribution", "three-state non-authorizing decision", "SEC-003 and R2-A gating"],
    deferredRequirements: ["SEC-003 closure", "operational R2-A evidence", "signed or independently durable evidence custody"],
    conflicts: [conflict("CONFLICT-PRE-R2-EXECUTION-AUTHORITY", ["Gate must execute verification tools.", "Live executor shell authority is forbidden."], "The institutional coordinator invokes declared evaluators outside the R1 executor capability; it grants no executor authority.", ["suite://OMEGA-PRE-R2-GATE-BUNDLE", "git://1dfac50828a898c9512370253bc15d1649269848"])],
    supersededOperationalApproaches: ["historical green results treated as fresh", "binary pass/fail for unavailable evaluators", "test-count-only readiness"],
    implementationMappings: ["scripts/omega/pre-r2-gate.mjs", "scripts/omegaPreR2GateBundle.test.mjs"],
    testEvidenceRefs: ["suite://OMEGA-PRE-R2-GATE-BUNDLE", "git://ffd3310eebdcaa719dcb4f58daa5cfd91309d7a5", "git://1dfac50828a898c9512370253bc15d1649269848"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
  record({
    workstreamId: "OMEGA-EVIDENCE-INVALIDATION-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-EVIDENCE-INVALIDATION-001",
    capabilityObjectiveId: "CAPABILITY-DEPENDENCY-AWARE-EVIDENCE-FRESHNESS",
    directlyImplemented: [
      concept("PLAN-DXIV", "Reasoning Cache Coherence Protocol", "Evidence is invalidated when a declared dependency fingerprint changes."),
      concept("PLAN-DCXCV", "Epistemic Build System", "Reverse dependencies propagate evidence changes through claims, capabilities, and gates."),
      concept("PLAN-DCXCVI", "Knowledge Incremental Compilation", "Unrelated changes do not globally invalidate evidence."),
    ],
    supporting: [
      concept("PLAN-DCXCVII", "Theory Cache Invalidation Proof", "Invalidation reasons identify the changed or missing dependency."),
      concept("PLAN-XXI", "Evidence Hierarchy", "Current falsification remains distinct from stale support."),
    ],
    deferred: [
      concept("PLAN-DCXCV", "Durable Epistemic Build Service", "Persistence and distributed invalidation are deliberately absent."),
      concept("PLAN-DCCXXXV", "Neural/Symbolic Memory Coherence", "No model-weight or neural-memory coupling exists yet."),
    ],
    implementedRequirements: ["dependency fingerprints", "reverse Evidence-to-Claim-to-Capability-to-Gate invalidation", "REQUIRES_REVALIDATION without false refutation", "localized invalidation"],
    deferredRequirements: ["durable dependency graph", "cross-process invalidation", "automatic Git change-to-dependency derivation"],
    conflicts: [conflict("CONFLICT-INVALIDATION-SCOPE", ["Any repository change might make evidence stale.", "Global invalidation destroys useful current evidence."], "Invalidate only evidence with a changed or missing declared dependency; surface incomplete dependency declarations as an assurance limitation.", ["suite://OMEGA-EVIDENCE-INVALIDATION"])],
    supersededOperationalApproaches: ["age-only evidence freshness", "global invalidation on any change", "stale evidence classified as refuted"],
    implementationMappings: ["scripts/evaluation/evidence-invalidation/engine.ts", "scripts/omegaEvidenceInvalidation.test.ts"],
    testEvidenceRefs: ["suite://OMEGA-EVIDENCE-INVALIDATION", "git://da06a4dda1f6cbf63ecb17d1c56dc954dc23d126"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
  record({
    workstreamId: "OMEGA-CLAIM-LIFECYCLE-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-CLAIM-LIFECYCLE-001",
    capabilityObjectiveId: "CAPABILITY-REPOSITORY-CLAIM-FRESHNESS",
    directlyImplemented: [
      concept("PLAN-DCLXXXV", "Belief Version Control", "Repository claims retain state transitions and repository/candidate binding."),
      concept("PLAN-DCXCIII", "Knowledge Semantic Versioning", "Supersession is explicit rather than destructive overwrite."),
      concept("PLAN-X", "Fractal Memory Architecture", "Only the minimum evidence-linked claim layer is implemented."),
    ],
    supporting: [
      concept("PLAN-XIV", "Unknown-Unknown Detector", "UNKNOWN and contradiction references remain first-class."),
      concept("PLAN-XVI", "Theory Objects", "Claims keep support, contradiction, and freshness dependencies."),
    ],
    deferred: [
      concept("PLAN-X", "Persistent Multi-Level Memory", "Episodic, semantic, architectural, and skill memory remain deferred."),
      concept("PLAN-XVI", "Theory Competition and Guardians", "No autonomous theory population is introduced."),
    ],
    implementedRequirements: ["UNKNOWN/SUPPORTED/STALE/CONFLICTED/REFUTED/SUPERSEDED states", "evidence and contradiction references", "candidate and authority binding", "freshness dependency preservation"],
    deferredRequirements: ["persistent repository memory", "automated claim extraction", "theory competition", "cross-session consolidation"],
    conflicts: [conflict("CONFLICT-CLAIM-HISTORY", ["Replace a claim when new evidence arrives.", "Preserve contradictory and superseded epistemic history."], "Append a validated transition and preserve prior evidence and contradiction references; never silently overwrite claim history.", ["suite://OMEGA-CLAIM-LIFECYCLE"])],
    supersededOperationalApproaches: ["conversation memory as the only claim store", "silent belief overwrite", "unknown forced into supported or refuted"],
    implementationMappings: ["scripts/evaluation/claim-lifecycle/lifecycle.ts", "scripts/omegaClaimLifecycle.test.ts"],
    testEvidenceRefs: ["suite://OMEGA-CLAIM-LIFECYCLE", "git://39cb1de5bde9760b63af78703685b6fc58b081dd"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
  record({
    workstreamId: "OMEGA-PLAN-ARTIFACT-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-PLAN-ARTIFACT-001",
    capabilityObjectiveId: "CAPABILITY-AUTHORITY-NEUTRAL-PLANNING",
    directlyImplemented: [
      concept("OMEGA-HIERARCHICAL-PLANNER", "Hierarchical Planner", "Objectives, requirements, dependencies, actions, and verification are represented explicitly."),
      concept("PLAN-XII", "Meta-Reasoning Compiler", "Only deterministic strategy/feasibility compilation is implemented."),
      concept("PLAN-DCCLXXIII", "Goal Provenance Graph", "Actions trace upward to objectives and requirements."),
    ],
    supporting: [
      concept("PLAN-DCCLXXVI", "Hierarchical Utility Model", "Hard requirements remain distinct from planning preferences."),
      concept("OMEGA-DESIGN-LAW", "Proposal, Detection, Correction, Learning", "Plans declare expected evidence, verification, and rollback needs."),
    ],
    deferred: [
      concept("PLAN-II", "Cognitive Mesh", "No model, agent population, or latent reasoning is introduced."),
      concept("PLAN-XII", "Meta-Strategy Search", "No probabilistic strategy generation exists yet."),
    ],
    implementedRequirements: ["typed objective/requirement/observation/unknown input", "typed actions and dependencies", "authority analysis", "ambiguity and contradiction handling", "verification and rollback declarations"],
    deferredRequirements: ["model-backed planning", "patch generation", "tool execution", "adaptive replanning", "persistent planner memory"],
    conflicts: [conflict("CONFLICT-PLAN-AUTHORITY", ["A useful plan may request future authority.", "The R1 ceiling forbids granting future authority."], "Represent the request and classify it BLOCKED_BY_AUTHORITY; the artifact has grantsAuthority=false and executesActions=false.", ["suite://OMEGA-PLAN-ARTIFACT"])],
    supersededOperationalApproaches: ["plan interpreted as command", "planner as authority mechanism", "model planner before deterministic contracts"],
    implementationMappings: ["scripts/evaluation/plan-artifact/planner.ts", "scripts/omegaPlanArtifact.test.ts"],
    testEvidenceRefs: ["suite://OMEGA-PLAN-ARTIFACT", "git://f23bf239dc9c8a0cb748e10281a16bbd314bf6ab"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
  record({
    workstreamId: "OMEGA-HARNESS-GENEALOGY-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-HARNESS-GENEALOGY-001",
    capabilityObjectiveId: "CAPABILITY-EVALUATION-GENEALOGY",
    directlyImplemented: [
      concept("PLAN-DCXLVII", "Immutable Capability Releases", "Candidate and suite identities are bound into immutable manifest data."),
      concept("PLAN-DCXLVIII", "Capability Delta Report", "Added, removed, and semantically changed tests are explicit."),
      concept("PLAN-DCXCVIII", "Cognitive Reproducible Builds", "Tool, candidate, suite, and source identities are retained."),
    ],
    supporting: [
      concept("PLAN-XXIV.3", "Regression Firewall", "Critical evaluation removal requires explicit stronger-test evidence."),
      concept("PLAN-DCLIII", "Release Semantic Diff Compiler", "Semantic test identity changes outrank raw count equality."),
    ],
    deferred: [
      concept("PLAN-DCXLVII", "Durable Immutable Release Authority", "Manifests are hash-addressed but not externally signed or durably witnessed."),
      concept("PLAN-DXI", "Cognitive Shapley Approximation", "Evaluator contribution attribution remains deferred."),
    ],
    implementedRequirements: ["predecessor/current manifest comparison", "suite addition/removal identity", "source digest changes", "semantic test addition/removal identity", "security-critical removal review"],
    deferredRequirements: ["independent durable predecessor custody", "signed genealogy", "cross-release semantic migration policy"],
    conflicts: [conflict("CONFLICT-HARNESS-COUNT", ["An unchanged green test count suggests unchanged coverage.", "Test identities and meanings may change while counts remain constant."], "Compare suite identity, source digest, and semantic assertion identities; counts are retained only as secondary evidence.", ["suite://OMEGA-HARNESS-GENEALOGY"])],
    supersededOperationalApproaches: ["test-count equality as evaluation identity", "silent critical-test removal", "manifest without predecessor semantics"],
    implementationMappings: ["scripts/omega/test-harness.mjs", "scripts/omegaHarnessGenealogy.test.mjs"],
    testEvidenceRefs: ["suite://OMEGA-HARNESS-GENEALOGY", "git://7c76f384318867d9e4a10670c964588c1b8798da"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
  record({
    workstreamId: "OMEGA-ENV-CAPABILITY-001",
    registryIdentity: "OMEGA-PLAN-COVERAGE-ENV-CAPABILITY-001",
    capabilityObjectiveId: "CAPABILITY-ENVIRONMENT-HONEST-EVALUATION",
    directlyImplemented: [
      concept("PLAN-DCXXV", "Environment Model Compiler", "Tool availability, authorization, applicability, and provenance are explicit."),
      concept("PLAN-DCXXVI", "Environmental Difference Analyzer", "Blocked-environment and blocked-authority outcomes remain distinct."),
      concept("PLAN-DCXXVIII", "Reproducibility Capsule", "Candidate, tool version, environment, and execution identity accompany outcomes."),
    ],
    supporting: [
      concept("PLAN-DCXXXV", "Toolchain Digital Twin", "Only a minimal observed toolchain capability projection is implemented."),
      concept("PLAN-DCXL", "Tool Reliability Calibrator", "Unavailable tools are not converted into false pass or failure evidence."),
    ],
    deferred: [
      concept("PLAN-DCXXVI", "Cross-Platform Environment Matrix", "POSIX, macOS, GPU, and remote worker replication remain deferred."),
      concept("PLAN-XXII", "Repository Digital Twin", "No predictive environment twin exists."),
    ],
    implementedRequirements: ["AVAILABLE/UNAVAILABLE/NOT_AUTHORIZED/NOT_APPLICABLE capability states", "PASS/FAIL/BLOCKED_ENVIRONMENT/BLOCKED_AUTHORITY/NOT_APPLICABLE outcomes", "tool/environment provenance", "honest Deno and network classification"],
    deferredRequirements: ["Deno runtime execution", "authorized live/network benchmark", "cross-platform replication", "durable environment inventory"],
    conflicts: [conflict("CONFLICT-ENV-PROBE-AUTHORITY", ["Environment reporting may probe installed tools.", "The live R1 executor cannot receive shell authority."], "Run bounded environment reporting as institutional evaluation infrastructure outside the executor authority layer; report unavailable or unauthorized states without granting authority.", ["suite://OMEGA-ENV-CAPABILITY", "git://07b3ab67b6ac108c0bd7b5443f42f829d3749470"])],
    supersededOperationalApproaches: ["missing runtime counted as pass", "unauthorized evaluation counted as failure", "implicit toolchain assumptions"],
    implementationMappings: ["scripts/evaluation/environment-capability/capabilities.ts", "scripts/omega/report-environment.ts", "scripts/omegaEnvironmentCapability.test.ts"],
    testEvidenceRefs: ["suite://OMEGA-ENV-CAPABILITY", "git://07b3ab67b6ac108c0bd7b5443f42f829d3749470"],
    assuranceEvidenceRefs: ["manifest://9ba1d1dbdd51f7a0ba1757182d655256e2a4a7473b44a399ee94607cf314b1d4"],
  }),
] as const satisfies readonly PlanCoverageRecord[]);

export interface PlanCoverageIssue {
  readonly code: string;
  readonly workstreamId: string | null;
  readonly detail: string;
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function validatePlanCoverage(records: readonly PlanCoverageRecord[]): readonly PlanCoverageIssue[] {
  const issues: PlanCoverageIssue[] = [];
  const workstreams = new Set<string>();
  const registryIds = new Set<string>();
  const evidenceOwnership = new Map<string, string>();
  for (const item of records) {
    const add = (code: string, detail: string): void => { issues.push({ code, workstreamId: item.workstreamId, detail }); };
    if (workstreams.has(item.workstreamId)) add("DUPLICATE_WORKSTREAM", item.workstreamId); else workstreams.add(item.workstreamId);
    if (registryIds.has(item.registryIdentity)) add("DUPLICATE_REGISTRY_ID", item.registryIdentity); else registryIds.add(item.registryIdentity);
    if (item.coverageStatus !== OMEGA_COVERAGE_STATUS || item.corpusStatus !== OMEGA_CORPUS_STATUS) add("DISHONEST_CORPUS_COVERAGE", `${item.coverageStatus}/${item.corpusStatus}`);
    if (item.directlyImplemented.length === 0 || item.supporting.length === 0 || item.deferred.length === 0) add("INCOMPLETE_PLAN_MAPPING", "direct, supporting, and deferred concepts are required");
    if (item.implementedRequirements.length === 0 || item.deferredRequirements.length === 0) add("INCOMPLETE_REQUIREMENT_MAPPING", "implemented and deferred requirements are required");
    if (item.implementationMappings.length === 0 || item.testEvidenceRefs.length === 0 || item.assuranceEvidenceRefs.length === 0) add("BROKEN_DOWNWARD_TRACE", "implementation, test, and assurance references are required");
    if (item.supersededOperationalApproaches.length === 0) add("MISSING_OPERATIONAL_HISTORY", "superseded approaches must remain explicit");
    if (!sameSet(item.inheritedConstraints, INHERITED_OMEGA_CONSTRAINTS)) add("INHERITED_CONSTRAINT_DRIFT", "constraint set differs from Directive 008");
    if (!sameSet(item.conflictDomainsChecked, PLAN_CONFLICT_DOMAINS)) add("INCOMPLETE_CONFLICT_REVIEW", "all architectural domains must be checked");
    if (item.conflicts.some((entry) => entry.disposition === "OPEN" && entry.evidenceRefs.length === 0)) add("UNEVIDENCED_OPEN_CONFLICT", "open conflict requires evidence references");
    if (item.conflicts.some((entry) => entry.disposition !== "NO_CONFLICT" && (entry.preservedSourceRefs.length === 0 || entry.operationalDecision.trim().length === 0))) add("SILENT_CONFLICT_RESOLUTION", "conflict source and decision are required");
    if (item.maturity !== "VERIFIED" || item.verificationScope !== "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT" || item.independentlyReplicated) add("MATURITY_SCOPE_OVERCLAIM", "coverage records may claim only local deterministic verification");
    if (!sameSet(item.authority.available, CURRENT_AUTHORITY.available)
      || !sameSet(item.authority.unavailable, CURRENT_AUTHORITY.unavailable)
      || !sameSet(item.authority.forbidden, CURRENT_AUTHORITY.forbidden)
      || item.authority.grantedByArtifact.length !== 0) add("AUTHORITY_CEILING_CHANGED", "traceability must not grant or reclassify authority");
    for (const evidenceRef of item.testEvidenceRefs) {
      if (!evidenceRef.startsWith("suite://") && !evidenceRef.startsWith("git://")) add("INVALID_TEST_EVIDENCE_REF", evidenceRef);
      const owner = evidenceOwnership.get(evidenceRef);
      if (evidenceRef.startsWith("suite://") && owner && owner !== item.workstreamId) add("SHARED_PRIMARY_EVIDENCE_IDENTITY", `${evidenceRef} owned by ${owner}`);
      if (evidenceRef.startsWith("suite://")) evidenceOwnership.set(evidenceRef, item.workstreamId);
    }
  }
  const expectedWorkstreams = [
    "OMEGA-PRE-R2-GATE-BUNDLE-001", "OMEGA-EVIDENCE-INVALIDATION-001", "OMEGA-CLAIM-LIFECYCLE-001",
    "OMEGA-PLAN-ARTIFACT-001", "OMEGA-HARNESS-GENEALOGY-001", "OMEGA-ENV-CAPABILITY-001",
  ];
  for (const expected of expectedWorkstreams) if (!workstreams.has(expected)) issues.push({ code: "MISSING_DIRECTIVE_WORKSTREAM", workstreamId: expected, detail: "Directive 008 workstream lacks coverage" });
  return Object.freeze(issues);
}

export function coverageForWorkstream(workstreamId: string): PlanCoverageRecord | null {
  return DIRECTIVE_008_PLAN_COVERAGE.find((item) => item.workstreamId === workstreamId) ?? null;
}

export function workstreamsCoveringConcept(conceptId: string): readonly PlanCoverageRecord[] {
  return Object.freeze(DIRECTIVE_008_PLAN_COVERAGE.filter((item) =>
    [...item.directlyImplemented, ...item.supporting, ...item.deferred].some((entry) => entry.conceptId === conceptId)));
}

export function traceabilityChain(item: PlanCoverageRecord): readonly string[] {
  return Object.freeze([
    item.visionRef,
    ...item.directlyImplemented.map((entry) => entry.conceptId),
    item.capabilityObjectiveId,
    ...item.implementedRequirements.map((entry) => `requirement://${entry}`),
    ...item.implementationMappings.map((entry) => `implementation://${entry}`),
    ...item.testEvidenceRefs,
    ...item.assuranceEvidenceRefs,
    `maturity://${item.maturity}/${item.verificationScope}`,
  ]);
}
