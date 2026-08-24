import type {
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

const directiveEvidence = evidence(
  "Ω-EV-DIRECTIVE-002",
  "E0",
  "The institutional authority specified REG-001A and VS-001A requirements.",
  DIRECTIVE_SOURCE.locator,
  "Explicit institutional directive",
  null,
  DIRECTIVE_SOURCE,
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
      evidence: [readOnlyExecutorEvidence],
      acceptanceCriteria: [criterion("Ω-AC-CAP-READ", "Authorized reads succeed and forbidden reads fail closed.", "Executor adversarial harness", "All defined cases pass")],
      falsificationCriteria: [criterion("Ω-FC-CAP-READ", "Any request escapes scope or loses provenance.", "Executor adversarial harness", "Any escape or missing evidence")],
      dependencies: ["Ω-PLAN-VS-001A", "Ω-CAP-REGISTRY-INVARIANTS"],
      implementationMappings: [{ kind: "repository", ref: "src/lib/codelab/executor", status: "active" }],
      securityProfile: securityProfile([readOnlyExecutorEvidence.evidenceId], "R1 scoped repository read only"),
      researchMaturity: "EXPERIMENT_RUN",
      relationships: [{ kind: "DEPENDS_ON", targetId: "Ω-CAP-REGISTRY-INVARIANTS" }],
      expectedEvidence: ["Authorization decisions", "Tool-action records", "Observation evidence", "Revocation tests"],
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
      expectedEvidence: ["Scoped repository observation harness"],
      previousResult: "UNAVAILABLE",
      currentResult: "VERIFIED_R1_34_OF_34",
      change: "NEW",
      confidence: 1,
      previousEvidenceIds: [],
      currentEvidenceIds: [readOnlyExecutorEvidence.evidenceId],
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
