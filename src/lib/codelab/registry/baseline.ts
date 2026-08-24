import type {
  CapabilityCertificate,
  Criterion,
  EvidenceRecord,
  MaturityAttestation,
  MaturityState,
  OmegaRegistry,
  SecurityProfile,
  SourceProvenance,
} from "./types";

const DIRECTIVE_SOURCE: SourceProvenance = Object.freeze({
  sourceId: "Ω-SOURCE-DIRECTIVE-002",
  sourceType: "conversation",
  locator: "conversation://omega-institutional-execution-directive-002",
  contentHash: null,
});

const DIRECTIVE_003_SOURCE: SourceProvenance = Object.freeze({
  sourceId: "Ω-SOURCE-DIRECTIVE-003",
  sourceType: "conversation",
  locator: "conversation://omega-institutional-execution-directive-003",
  contentHash: null,
});

const REPOSITORY_SOURCE: SourceProvenance = Object.freeze({
  sourceId: "Ω-SOURCE-REPOSITORY",
  sourceType: "repository",
  locator: "repository://generous-ai-core/sol/omega-institutional-spine",
  contentHash: null,
});

function criterion(id: string, statement: string, measurement: string, threshold: string): Criterion {
  return { criterionId: id, statement, measurement, threshold };
}

function evidence(
  evidenceId: string,
  evidenceClass: EvidenceRecord["evidenceClass"],
  claim: string,
  artifactRef: string,
  mechanism: string,
  independenceBasis: string | null,
  provenance: SourceProvenance = REPOSITORY_SOURCE,
): EvidenceRecord {
  return {
    evidenceId,
    evidenceClass,
    result: "SUPPORTS",
    claim,
    provenance,
    artifactRef,
    mechanism,
    freshness: "CURRENT",
    independenceBasis,
  };
}

function maturityHistory(states: readonly MaturityState[], verifiedEvidenceId?: string): readonly MaturityAttestation[] {
  return states.map((state) => ({
    state,
    evidenceIds: ["VERIFIED", "INDEPENDENTLY_REPLICATED", "PRODUCTION_READY", "ROUTINIZED"].includes(state) && verifiedEvidenceId
      ? [verifiedEvidenceId]
      : [],
    rationale: `Institutional maturity gate ${state} recorded explicitly.`,
  }));
}

function securityProfile(evidenceIds: readonly string[], privilege = "No runtime privilege"): SecurityProfile {
  return {
    threatModel: ["Dishonest or stale institutional state", "Tampered or correlated evidence"],
    privilegeRequirements: [privilege],
    dataSensitivity: "INTERNAL",
    isolationRequirements: ["Repository-scoped implementation", "No credential access"],
    attackSurface: ["Registry input", "Evidence provenance", "Serialization boundary"],
    trustAssumptions: ["Git object identity is available", "Deterministic tests execute without mutation"],
    possibleMisuse: ["Inflating maturity", "Claiming corpus completeness", "Treating correlated evidence as independent"],
    compromisePaths: ["Malformed registry object", "Falsified evidence reference"],
    blastRadius: "Institutional planning and capability claims; no direct execution authority.",
    containmentMechanisms: ["Runtime validation", "Explicit maturity gates", "Evidence-class checks"],
    rollbackMechanisms: ["Revert registry commit", "Restore prior verified registry snapshot"],
    securityEvidenceIds: evidenceIds,
  };
}

function capabilityCertificate(
  certificateId: string,
  title: string,
  evidenceId: string,
  result: string,
): CapabilityCertificate {
  return {
    certificateId,
    title,
    maturity: "VERIFIED",
    epistemicState: "SUPPORTED",
    verificationState: "VERIFIED",
    evidenceIds: [evidenceId],
    threshold: "All assigned held-out checks pass with zero false acceptance",
    result,
    confidence: 1,
  };
}

const directiveEvidence = evidence(
  "Ω-EV-DIRECTIVE-002",
  "E0",
  "The institutional authority specified REG-001A and VS-001A requirements.",
  DIRECTIVE_SOURCE.locator,
  "Explicit institutional directive",
  null,
  DIRECTIVE_SOURCE,
);
const directive003Evidence = evidence(
  "Ω-EV-DIRECTIVE-003",
  "E0",
  "The institutional authority specified credential containment, private R1 evaluation, and R2 design requirements.",
  DIRECTIVE_003_SOURCE.locator,
  "Explicit institutional directive",
  null,
  DIRECTIVE_003_SOURCE,
);
const registryEvidence = evidence(
  "Ω-EV-REGISTRY-TESTS",
  "E3",
  "Registry invariants pass the deterministic registry harness.",
  "command://npm-run-omega-tests",
  "Node 24 deterministic test harness",
  "The runtime checker executes independently from stored registry claims.",
);
const readOnlyExecutorEvidence = evidence(
  "Ω-EV-VS-READ-ONLY-34",
  "E3",
  "The R1 executor passed 34 scoped, attributable, auditable, revocable, and epistemically honest repository-observation checks, including a live package.json read.",
  "command://npm-run-omega-tests",
  "Node 24 executor adversarial harness with live repository observation",
  "The filesystem and deterministic harness produce observations independently from stored capability claims; harness-oracle correlation remains acknowledged.",
);
const r1BaselineEvidence = evidence(
  "Ω-EV-R1-BASELINE-7729CF3",
  "E3",
  "Commit 7729cf3 is the immutable comparison point for the locally verified R1 executor foundation.",
  "git://generous-ai-core/commit/7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296",
  "Git object identity and pushed upstream equality",
  "Git independently identifies the exact repository state; it does not independently validate capability semantics.",
);
const r1PrivateEvaluationEvidence = evidence(
  "Ω-EV-EVAL-R1-PRIVATE-31",
  "E3",
  "A fresh evaluator-owned repository corpus passed 31 held-out checks across R1-A through R1-J, including a real Windows junction escape attempt.",
  "command://omega-r1-private-evaluation",
  "Separate temporary-repository generator, direct host-filesystem oracle, and capability-certificate harness",
  "The evaluator does not import executor normalization or audit validators and discovered a root-path defect before the corrected rerun; model-author correlation remains acknowledged.",
);
const orchestraEvidence = evidence(
  "Ω-EV-ORCHESTRA-385",
  "E3",
  "The deterministic ORCHESTRA contract suite reports 385 passed and zero failed checks.",
  "command://npm-run-omega-tests",
  "Node 24 deterministic test harness",
  "Execution is deterministic, while oracle-design correlation remains explicitly acknowledged.",
);
const secretEvidence = evidence(
  "Ω-EV-SECRET-SCAN",
  "E3",
  "The tracked-file high-confidence secret scan reports zero findings.",
  "command://npm-run-security-secrets",
  "Deterministic tracked-file scanner",
  "The scanner operates on Git-tracked bytes rather than generator self-report.",
);

export const OMEGA_BASELINE_REGISTRY: OmegaRegistry = Object.freeze({
  schemaVersion: 1,
  corpusStatus: "PARTIAL",
  losslessCertification: false,
  plans: [
    {
      recordType: "PLAN",
      canonicalId: "Ω-PLAN-REG-001A",
      originalSourceId: "Ω-REG-001A",
      title: "Minimum Executable Registry",
      source: DIRECTIVE_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        registryEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [directiveEvidence, registryEvidence],
      acceptanceCriteria: [
        criterion("Ω-AC-REG-VALID", "Valid registry records are accepted.", "Deterministic registry harness", "All valid fixtures accepted"),
        criterion("Ω-AC-REG-DISHONEST", "Dishonest state combinations are rejected.", "Adversarial invariant fixtures", "All defined invalid combinations rejected"),
      ],
      falsificationCriteria: [
        criterion("Ω-FC-REG-BYPASS", "A malformed or dishonest object bypasses validation.", "Adversarial registry harness", "Any bypass falsifies the claim"),
      ],
      dependencies: [],
      implementationMappings: [
        { kind: "repository", ref: "src/lib/codelab/registry", status: "active" },
        { kind: "tool", ref: "scripts/omegaRegistry.test.ts", status: "active" },
      ],
      securityProfile: securityProfile([registryEvidence.evidenceId]),
      researchMaturity: "EXPERIMENT_RUN",
      hypothesis: {
        statement: "Machine-enforced registry invariants reduce dishonest institutional state combinations.",
        supportCriterion: "Defined invalid maturity, corpus, and evidence combinations are rejected.",
        falsificationCriterion: "Any defined dishonest combination is accepted without an explicit error.",
        baseline: "Unstructured narrative status records",
        competingExplanations: ["Tests merely mirror the implementation", "Manual review provides equivalent protection"],
        measurementMethod: "Deterministic valid and adversarial fixture execution",
        requiredPopulation: "Every required Directive-002 invariant plus serialization and relationship cases",
        computeBudget: "Single local CPU process; no model inference",
        calibrationRequirement: "No probabilistic confidence claim; exact acceptance/rejection outcomes",
      },
      relationships: [{ kind: "OVERLAPS", targetId: "Ω-PLAN-VS-001A" }],
    },
    {
      recordType: "PLAN",
      canonicalId: "Ω-PLAN-VS-001A",
      originalSourceId: "Ω-VS-001A",
      title: "Read-Only Live Executor",
      source: DIRECTIVE_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        readOnlyExecutorEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [directiveEvidence, readOnlyExecutorEvidence],
      acceptanceCriteria: [
        criterion("Ω-AC-VS-SCOPED", "Repository observations are scoped and auditable.", "Adversarial executor harness", "All required authorization cases pass"),
      ],
      falsificationCriteria: [
        criterion("Ω-FC-VS-ESCAPE", "Executor reads outside authorized scope or omits an action.", "Traversal and audit adversary", "Any unauthorized read or omitted action falsifies the claim"),
      ],
      dependencies: ["Ω-PLAN-REG-001A"],
      implementationMappings: [
        { kind: "repository", ref: "src/lib/codelab/executor", status: "active" },
        { kind: "tool", ref: "scripts/omegaReadOnlyExecutor.test.ts", status: "active" },
      ],
      securityProfile: securityProfile([readOnlyExecutorEvidence.evidenceId], "R1 scoped repository read only"),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [{ kind: "OVERLAPS", targetId: "Ω-PLAN-REG-001A" }],
    },
    {
      recordType: "PLAN",
      canonicalId: "Ω-PLAN-EVAL-R1-001",
      originalSourceId: "Ω-EVAL-R1-001",
      title: "Independent Private R1 Evaluation",
      source: DIRECTIVE_003_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        r1PrivateEvaluationEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [directive003Evidence, r1PrivateEvaluationEvidence, r1BaselineEvidence],
      acceptanceCriteria: [
        criterion("Ω-AC-EVAL-R1-HELDOUT", "Fresh evaluator-owned repository cases pass against independent expected outcomes.", "Private R1 evaluation harness", "All assigned checks pass"),
        criterion("Ω-AC-EVAL-R1-ALIAS", "A real host filesystem alias cannot escape the canonical repository root.", "Real junction or symlink fixture", "Escape rejected without content or target disclosure"),
      ],
      falsificationCriteria: [
        criterion("Ω-FC-EVAL-R1-ESCAPE", "Any held-out request observes content outside its authorization.", "Private adversarial fixture", "Any unauthorized observation falsifies R1 confinement"),
        criterion("Ω-FC-EVAL-R1-CORRELATION", "The independent oracle fails to reveal any behavior beyond the unit harness.", "Defect-discovery comparison", "No differentiated case coverage or fault discovery"),
      ],
      dependencies: ["Ω-PLAN-VS-001A", "Ω-CAP-READ-REPOSITORY"],
      implementationMappings: [
        { kind: "tool", ref: "scripts/evaluation/omegaR1PrivateEval.ts", status: "active" },
        { kind: "repository", ref: "src/lib/codelab/executor/readOnlyExecutor.ts", status: "active" },
      ],
      securityProfile: securityProfile([r1PrivateEvaluationEvidence.evidenceId], "R1 scoped read over evaluator-owned disposable repositories"),
      researchMaturity: "EXPERIMENT_RUN",
      hypothesis: {
        statement: "A fresh, separately oracled repository suite reveals R1 failures hidden by implementation-adjacent unit tests.",
        supportCriterion: "The evaluator discovers at least one real behavioral gap or materially expands host-filesystem evidence at matched authority.",
        falsificationCriterion: "The evaluator adds no differentiated coverage and no independent behavioral information.",
        baseline: "34 implementation-adjacent R1 unit checks at commit 7729cf3",
        competingExplanations: ["Additional cases improve only test volume", "The same model author preserves correlated assumptions"],
        measurementMethod: "Fresh temporary repository construction, direct host-filesystem expectations, and R1-A through R1-J certificates",
        requiredPopulation: "Nested, ignored, Unicode, generated, bounded, malformed, nested-Git, alias, expired, revoked, and adversarial scope cases",
        computeBudget: "Single local CPU process; no model inference and no network",
        calibrationRequirement: "Exact outcomes; host alias unsupported state must be reported PARTIAL rather than inferred",
      },
      relationships: [{ kind: "OVERLAPS", targetId: "Ω-PLAN-VS-001A" }],
    },
  ],
  capabilities: [
    {
      recordType: "CAPABILITY",
      canonicalId: "Ω-CAP-REGISTRY-INVARIANTS",
      originalSourceId: "Ω-REG-001A",
      title: "Machine-enforced institutional registry invariants",
      source: REPOSITORY_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        registryEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [registryEvidence],
      acceptanceCriteria: [criterion("Ω-AC-CAP-REG", "Registry invariant enforcement remains deterministic.", "Registry harness", "Zero failed invariant checks")],
      falsificationCriteria: [criterion("Ω-FC-CAP-REG", "An invalid object is accepted.", "Adversarial fixture", "Any acceptance")],
      dependencies: ["Ω-PLAN-REG-001A"],
      implementationMappings: [{ kind: "repository", ref: "src/lib/codelab/registry", status: "active" }],
      securityProfile: securityProfile([registryEvidence.evidenceId]),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [{ kind: "ENABLES", targetId: "Ω-CAP-READ-REPOSITORY" }],
      expectedEvidence: ["Deterministic invariant suite", "Serialization round trip", "Relationship queries"],
    },
    {
      recordType: "CAPABILITY",
      canonicalId: "Ω-CAP-READ-REPOSITORY",
      originalSourceId: "Ω-VS-001A",
      title: "Scoped attributable repository observation",
      source: DIRECTIVE_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        readOnlyExecutorEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [readOnlyExecutorEvidence, r1BaselineEvidence, r1PrivateEvaluationEvidence],
      acceptanceCriteria: [criterion("Ω-AC-CAP-READ", "Authorized reads succeed and forbidden reads fail closed.", "Executor adversarial harness", "All defined cases pass")],
      falsificationCriteria: [criterion("Ω-FC-CAP-READ", "Any request escapes scope or loses provenance.", "Executor adversarial harness", "Any escape or missing evidence")],
      dependencies: ["Ω-PLAN-VS-001A", "Ω-PLAN-EVAL-R1-001", "Ω-CAP-REGISTRY-INVARIANTS"],
      implementationMappings: [
        { kind: "repository", ref: "src/lib/codelab/executor", status: "active" },
        { kind: "repository", ref: "git:7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296", status: "historical" },
        { kind: "tool", ref: "scripts/evaluation/omegaR1PrivateEval.ts", status: "active" },
      ],
      securityProfile: securityProfile([readOnlyExecutorEvidence.evidenceId, r1PrivateEvaluationEvidence.evidenceId], "R1 scoped repository read only"),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [{ kind: "DEPENDS_ON", targetId: "Ω-CAP-REGISTRY-INVARIANTS" }],
      expectedEvidence: ["Authorization decisions", "Tool-action records", "Observation evidence", "Revocation tests", "Less-correlated private repository cases"],
      certificates: [
        capabilityCertificate("Ω-CERT-R1-A", "Authorized file observation", r1PrivateEvaluationEvidence.evidenceId, "2/2 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-B", "Directory observation", r1PrivateEvaluationEvidence.evidenceId, "1/1 held-out check passed"),
        capabilityCertificate("Ω-CERT-R1-C", "Metadata observation", r1PrivateEvaluationEvidence.evidenceId, "2/2 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-D", "Scope confinement", r1PrivateEvaluationEvidence.evidenceId, "6/6 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-E", "Canonical-path confinement", r1PrivateEvaluationEvidence.evidenceId, "1/1 real junction check passed"),
        capabilityCertificate("Ω-CERT-R1-F", "Revocation", r1PrivateEvaluationEvidence.evidenceId, "2/2 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-G", "Audit completeness", r1PrivateEvaluationEvidence.evidenceId, "3/3 independent-oracle checks passed"),
        capabilityCertificate("Ω-CERT-R1-H", "Epistemic failure handling", r1PrivateEvaluationEvidence.evidenceId, "4/4 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-I", "Resource-bound enforcement", r1PrivateEvaluationEvidence.evidenceId, "3/3 held-out checks passed"),
        capabilityCertificate("Ω-CERT-R1-J", "Host-filesystem edge cases", r1PrivateEvaluationEvidence.evidenceId, "7/7 checks passed with a real Windows junction"),
      ],
    },
    {
      recordType: "CAPABILITY",
      canonicalId: "Ω-CAP-ORCHESTRA-CONTRACTS",
      originalSourceId: "ORCHESTRA-O0-O7A",
      title: "Deterministic ORCHESTRA protocol and orchestration contracts",
      source: REPOSITORY_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        orchestraEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [orchestraEvidence],
      acceptanceCriteria: [criterion("Ω-AC-CAP-ORCH", "Pinned deterministic contracts remain green.", "Omega aggregate test runner", "385 passed and zero failed")],
      falsificationCriteria: [criterion("Ω-FC-CAP-ORCH", "Any pinned contract fails.", "Omega aggregate test runner", "At least one failure")],
      dependencies: [],
      implementationMappings: [{ kind: "repository", ref: "src/lib/codelab", status: "active" }],
      securityProfile: securityProfile([orchestraEvidence.evidenceId]),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [],
      expectedEvidence: ["385 deterministic checks"],
    },
    {
      recordType: "CAPABILITY",
      canonicalId: "Ω-CAP-TRACKED-SECRET-DETECTION",
      originalSourceId: "Ω-SEC-001",
      title: "Tracked high-confidence secret detection",
      source: REPOSITORY_SOURCE,
      corpusStatus: "PARTIAL",
      losslessCertification: false,
      maturity: "VERIFIED",
      maturityHistory: maturityHistory(
        ["PROPOSED", "SPECIFIED", "PROTOTYPED", "IMPLEMENTED", "INTEGRATED", "VERIFIED"],
        secretEvidence.evidenceId,
      ),
      epistemicState: "SUPPORTED",
      verificationState: "VERIFIED",
      evidence: [secretEvidence],
      acceptanceCriteria: [criterion("Ω-AC-CAP-SECRET", "Tracked high-confidence secret patterns are rejected.", "Secret scanner", "Zero findings on accepted tree")],
      falsificationCriteria: [criterion("Ω-FC-CAP-SECRET", "A defined pattern bypasses the scanner.", "Secret scanner adversarial fixture", "Any bypass")],
      dependencies: [],
      implementationMappings: [{ kind: "tool", ref: "scripts/security/scan-secrets.mjs", status: "active" }],
      securityProfile: securityProfile([secretEvidence.evidenceId]),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [],
      expectedEvidence: ["Tracked-file scanner pass", "Adversarial scanner fixtures"],
    },
  ],
  regressions: [
    {
      capabilityId: "Ω-CAP-ORCHESTRA-CONTRACTS",
      expectedEvidence: ["385 deterministic checks"],
      previousResult: "385/385",
      currentResult: "385/385",
      change: "UNCHANGED",
      confidence: 1,
      previousEvidenceIds: [orchestraEvidence.evidenceId],
      currentEvidenceIds: [orchestraEvidence.evidenceId],
    },
    {
      capabilityId: "Ω-CAP-READ-REPOSITORY",
      expectedEvidence: ["Scoped repository observation harness", "Fresh private repository evaluation", "Real host alias confinement"],
      previousResult: "VERIFIED_R1_34_OF_34_AT_7729CF3",
      currentResult: "VERIFIED_R1_PRIVATE_31_OF_31",
      change: "IMPROVED",
      confidence: 1,
      previousEvidenceIds: [readOnlyExecutorEvidence.evidenceId, r1BaselineEvidence.evidenceId],
      currentEvidenceIds: [readOnlyExecutorEvidence.evidenceId, r1BaselineEvidence.evidenceId, r1PrivateEvaluationEvidence.evidenceId],
    },
    {
      capabilityId: "Ω-CAP-TRACKED-SECRET-DETECTION",
      expectedEvidence: ["Tracked-file scanner pass"],
      previousResult: "VERIFIED",
      currentResult: "VERIFIED",
      change: "UNCHANGED",
      confidence: 1,
      previousEvidenceIds: [secretEvidence.evidenceId],
      currentEvidenceIds: [secretEvidence.evidenceId],
    },
  ],
} as const satisfies OmegaRegistry);
