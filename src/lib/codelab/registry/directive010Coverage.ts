import {
  INHERITED_OMEGA_CONSTRAINTS,
  OMEGA_CORPUS_STATUS,
  OMEGA_COVERAGE_STATUS,
  PLAN_CONFLICT_DOMAINS,
  type OmegaConceptRef,
  type PlanCoverageRecord,
} from "./planCoverage";

export const DIRECTIVE_010_WORKSTREAM_IDS = Object.freeze([
  "OMEGA-PREACTUATION-CHECKPOINT-001",
  "OMEGA-R1-INDEPENDENT-REPLICATION-001",
  "OMEGA-R2-A-SHADOW-INTEGRATION-001",
  "OMEGA-EVIDENCE-CORRELATION-MAP-001",
  "OMEGA-R2-CAPABILITY-LINEAGE-RECONCILIATION-001",
] as const);

const AUTHORITY = Object.freeze({
  available: Object.freeze(["READ_REPOSITORY"]),
  unavailable: Object.freeze(["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"]),
  forbidden: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]),
  grantedByArtifact: Object.freeze([] as string[]),
});

const concept = (conceptId: string, title: string, appliedScope: string): OmegaConceptRef => Object.freeze({ conceptId, title, appliedScope });
interface CoverageInput {
  readonly id: (typeof DIRECTIVE_010_WORKSTREAM_IDS)[number];
  readonly capability: string;
  readonly direct: readonly OmegaConceptRef[];
  readonly support: readonly OmegaConceptRef[];
  readonly deferred: readonly OmegaConceptRef[];
  readonly implemented: readonly string[];
  readonly deferredRequirements: readonly string[];
  readonly conflict: string;
  readonly decision: string;
  readonly mappings: readonly string[];
  readonly suite: string;
}

const record = (input: CoverageInput): PlanCoverageRecord => {
  const coverage: PlanCoverageRecord = {
  workstreamId: input.id,
  registryIdentity: `OMEGA-PLAN-COVERAGE-${input.id}`,
  capabilityObjectiveId: input.capability,
  visionRef: "OMEGA_VERIFIED_STATE_TRANSFORMATION",
  sourceDirective: "OMEGA_DIRECTIVE_010",
  coverageStatus: OMEGA_COVERAGE_STATUS,
  corpusStatus: OMEGA_CORPUS_STATUS,
  directlyImplemented: input.direct,
  supporting: input.support,
  deferred: input.deferred,
  implementedRequirements: input.implemented,
  deferredRequirements: input.deferredRequirements,
  conflicts: [{
    conflictId: `CONFLICT-${input.id}`,
    disposition: "RESOLVED",
    proposals: [input.conflict, "Reality-bound, authority-neutral execution within Directive 010."],
    preservedSourceRefs: ["source://omega-study", "directive://010"],
    operationalDecision: input.decision,
    evidenceRefs: [`suite://${input.suite}`],
  }],
  conflictDomainsChecked: PLAN_CONFLICT_DOMAINS,
  supersededOperationalApproaches: ["Additional speculative pre-R2 scaffolding without concrete failure evidence"],
  implementationMappings: input.mappings,
  testEvidenceRefs: [`suite://${input.suite}`],
  assuranceEvidenceRefs: [`assurance://directive-010/${input.id}`],
  maturity: "VERIFIED",
  verificationScope: "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT",
  independentlyReplicated: false,
  authority: AUTHORITY,
  inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS,
  };
  return Object.freeze(coverage);
};

const reality = concept("OMEGA-DIRECTIVE-010-LAW", "Reality Before More Architecture", "Prefer independent, compositional, or environmental evidence over new speculative wrappers.");
const assurance = concept("PLAN-DCCLXXX", "Omega Assurance Kernel", "Fail closed without sufficient independent evidence.");
export const DIRECTIVE_010_PLAN_COVERAGE = Object.freeze([
  record({ id: "OMEGA-PREACTUATION-CHECKPOINT-001", capability: "CAPABILITY-CANONICAL-PREACTUATION-CHECKPOINT", direct: [concept("PLAN-DCXLVII", "Immutable Capability Releases", "Freeze exact code, tools, evidence, authority, and maturity state."), reality], support: [concept("PLAN-DCXLVIII", "Capability Delta Report", "Preserve comparison ancestry for future R2 candidates.")], deferred: [concept("OMEGA-R2-A", "Operational Sandbox Provisioning", "No R2 authority is present at this checkpoint.")], implemented: ["exact 587b988 identity", "R1-only authority", "suite/tool/security bindings", "non-R2 assertions"], deferredRequirements: ["operational R2", "independent replication"], conflict: "A strong pre-actuation checkpoint may be mislabeled R2.", decision: "Encode explicit false operational and replication claims.", mappings: ["src/lib/codelab/registry/preActuationCheckpoint.ts", "scripts/omegaPreActuationCheckpoint.test.ts"], suite: "OMEGA-PREACTUATION-CHECKPOINT" }),
  record({ id: "OMEGA-R1-INDEPENDENT-REPLICATION-001", capability: "CAPABILITY-HONEST-R1-REPLICATION-OUTCOME", direct: [concept("PLAN-DCXCVIII", "Cognitive Reproducible Builds", "Attempt exact clean-environment reconstruction."), reality], support: [concept("OMEGA-EVIDENCE-INDEPENDENCE", "Evidence Independence Classes", "Classify actual independence rather than intended independence.")], deferred: [concept("PLAN-VIII", "Cross-Environment Evaluation", "A dependency-complete independent environment is unavailable.")], implemented: ["environment eligibility inspection", "requirement outcome partition", "BLOCKED_ENVIRONMENT result"], deferredRequirements: ["clean exact checkout execution", "E4/E5 replication evidence"], conflict: "A second run on the same host could be called replication.", decision: "Reject shared/dirty/cache-dependent environments and preserve BLOCKED_ENVIRONMENT.", mappings: ["src/lib/codelab/assurance/r1ReplicationAttempt.ts", "scripts/omegaR1IndependentReplication.test.ts"], suite: "OMEGA-R1-INDEPENDENT-REPLICATION" }),
  record({ id: "OMEGA-R2-A-SHADOW-INTEGRATION-001", capability: "CAPABILITY-PREOPERATIONAL-R2-COMPOSITION", direct: [concept("PLAN-IV", "Adversarial Verification Empire", "Inject cross-component deceptive cases."), assurance], support: [concept("PLAN-DCCXLI", "Modality Disagreement Detector", "Record component divergence without treating scoped disagreement as contradiction.")], deferred: [concept("OMEGA-R2-A", "Operational Sandbox Provisioning", "The lifecycle remains entirely synthetic.")], implemented: ["nine-component shadow chain", "fourteen adversarial cases", "operational E4 floor", "fail-closed final decision"], deferredRequirements: ["real filesystem lifecycle", "operational acceptance"], conflict: "Synthetic composition success may look like R2 success.", decision: "Return SHADOW_COMPOSITION_VALIDATED while operational capability remains INSUFFICIENT_EVIDENCE.", mappings: ["scripts/evaluation/r2-shadow-integration/evaluator.ts", "scripts/omegaR2AShadowIntegration.test.ts"], suite: "OMEGA-R2-A-SHADOW-INTEGRATION" }),
  record({ id: "OMEGA-EVIDENCE-CORRELATION-MAP-001", capability: "CAPABILITY-QUALITATIVE-EVIDENCE-CORRELATION", direct: [concept("PLAN-DII", "Evidence Bottleneck Detector", "Expose shared assumptions limiting acceptance confidence."), concept("PLAN-DXI", "Cognitive Shapley Approximation", "Preserve component relationships without inventing a numerical score.")], support: [reality], deferred: [concept("PLAN-DVI", "Cognitive Causal Profiler", "Causal evaluator contribution requires later ablation evidence.")], implemented: ["nine major mechanism profiles", "nine correlation dimensions", "qualitative relationship classes", "explicit bottlenecks"], deferredRequirements: ["institutional external replication", "causal independence measurement"], conflict: "Large green-check counts may be interpreted as independent evidence count.", decision: "Represent shared assumption paths and set numerical independence score to null.", mappings: ["src/lib/codelab/assurance/evidenceCorrelation.ts", "scripts/omegaEvidenceCorrelationMap.test.ts"], suite: "OMEGA-EVIDENCE-CORRELATION-MAP" }),
  record({ id: "OMEGA-R2-CAPABILITY-LINEAGE-RECONCILIATION-001", capability: "CAPABILITY-R2-TO-NYX-LINEAGE", direct: [concept("PLAN-DCCLXXIII", "Goal Provenance Graph", "Trace each controlled-mutation chunk upward and forward to Nyx."), concept("PLAN-CDLIV", "Change Intent Graph", "Preserve why every authority and evidence requirement exists.")], support: [reality], deferred: [concept("OMEGA-CORPUS-INTEGRITY", "Lossless Corpus Reconciliation", "Only currently relevant plans are reconciled.")], implemented: ["R2-A through R2-G lineage", "assurance dependency", "authority deltas", "future Nyx capability path"], deferredRequirements: ["full corpus reconciliation", "operational capability evidence"], conflict: "The sandbox chain may drift into isolated infrastructure work.", decision: "Bind every chunk to verified coding, research engineering, and Nyx capability objectives.", mappings: ["src/lib/codelab/registry/r2NyxLineage.ts", "scripts/omegaR2NyxLineage.test.ts"], suite: "OMEGA-R2-NYX-LINEAGE" }),
]);
