import {
  INHERITED_OMEGA_CONSTRAINTS,
  OMEGA_CORPUS_STATUS,
  OMEGA_COVERAGE_STATUS,
  PLAN_CONFLICT_DOMAINS,
  type OmegaConceptRef,
  type PlanCoverageRecord,
} from "./planCoverage";

export const DIRECTIVE_015_WORKSTREAM_IDS = Object.freeze([
  "OMEGA-SEC-003-ALE-RETIREMENT-RELEASE-001",
  "OMEGA-SEC-003-LOVABLE-CLOSURE-EVALUATOR-001",
] as const);

const AUTHORITY = Object.freeze({
  available: Object.freeze(["READ_REPOSITORY"]),
  unavailable: Object.freeze(["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"]),
  forbidden: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]),
  grantedByArtifact: Object.freeze([] as string[]),
});
const concept = (conceptId: string, title: string, appliedScope: string): OmegaConceptRef => Object.freeze({ conceptId, title, appliedScope });

interface Input {
  readonly id: (typeof DIRECTIVE_015_WORKSTREAM_IDS)[number];
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

function record(input: Input): PlanCoverageRecord {
  return Object.freeze({
    workstreamId: input.id,
    registryIdentity: `OMEGA-PLAN-COVERAGE-${input.id}`,
    capabilityObjectiveId: input.capability,
    visionRef: "OMEGA_VERIFIED_STATE_TRANSFORMATION",
    sourceDirective: "OMEGA_DIRECTIVE_015",
    coverageStatus: OMEGA_COVERAGE_STATUS,
    corpusStatus: OMEGA_CORPUS_STATUS,
    directlyImplemented: input.direct,
    supporting: input.support,
    deferred: input.deferred,
    implementedRequirements: input.implemented,
    deferredRequirements: input.deferredRequirements,
    conflicts: [Object.freeze({
      conflictId: `CONFLICT-${input.id}`,
      disposition: "RESOLVED" as const,
      proposals: [input.conflict, "Retire only the obsolete external ALE bridge while preserving internal Lumina adaptive-learning services."] as const,
      preservedSourceRefs: ["source://omega-study", "directive://015"],
      operationalDecision: input.decision,
      evidenceRefs: [`suite://${input.suite}`],
    })],
    conflictDomainsChecked: PLAN_CONFLICT_DOMAINS,
    supersededOperationalApproaches: ["Replace an obsolete external credential with a new credential generation", "Treat repository code as proof of deployed state"],
    implementationMappings: input.mappings,
    testEvidenceRefs: [`suite://${input.suite}`],
    assuranceEvidenceRefs: [`assurance://directive-015/${input.id}`],
    maturity: "VERIFIED",
    verificationScope: "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT",
    independentlyReplicated: false,
    authority: AUTHORITY,
    inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS,
  });
}

const reality = concept("OMEGA-LAW-REALITY", "Reality Over Prediction", "A pushed release remains insufficient until Lovable deployment evidence is admitted.");
const assurance = concept("PLAN-DCCLXXX", "Omega Assurance Kernel", "Return closed, rejected, or insufficient evidence without granting authority.");

export const DIRECTIVE_015_PLAN_COVERAGE = Object.freeze([
  record({
    id: "OMEGA-SEC-003-ALE-RETIREMENT-RELEASE-001",
    capability: "CAPABILITY-LEGACY-ALE-CREDENTIAL-CLASS-RETIREMENT",
    direct: [concept("PLAN-CDLVIII", "Specification Mutation Testing", "Remove the obsolete credential semantics rather than replacing their token form."), concept("PLAN-DCXVIII", "Semantic TODO Resolver", "Convert historical security debt into an explicit retirement condition."), reality],
    support: [concept("PLAN-CDLV", "Semantic Dead-Code Detector", "Classify and retire the external-only gateway while retaining internal ALE functions."), concept("PLAN-DCXXXI", "Dependency Minimization Engine", "Remove the abandoned cross-project dependency surface."), assurance],
    deferred: [concept("OMEGA-R2-A", "Disposable Sandbox Provisioning", "No Ω runtime mutation authority is introduced."), concept("PLAN-DCXLVI", "Capability Rollback Graph", "Deployment rollback remains an operator concern outside this release package.")],
    implemented: ["fail-closed 410 gateway tombstone", "no credential/database/provision/session/forward path", "conditional table-present/table-absent retirement migration", "internal Lumina dependency separation"],
    deferredRequirements: ["authorized Lovable deployment", "deployed resulting-state evidence", "final SEC-003 closure"],
    conflict: "Removing an ALE-named artifact could be mistaken for removing internal adaptive-learning capability.",
    decision: "Retain internal engine functions untouched and replace only the cross-project gateway with a non-authorizing tombstone.",
    mappings: ["supabase/functions/ale-api/index.ts", "supabase/functions/ale-api/retirement.ts", "supabase/migrations/20260826000000_retire_legacy_ale_external_api.sql"],
    suite: "OMEGA-SEC003-ALE-RETIREMENT",
  }),
  record({
    id: "OMEGA-SEC-003-LOVABLE-CLOSURE-EVALUATOR-001",
    capability: "CAPABILITY-LOVABLE-DEPLOYMENT-BOUND-SEC003-CLOSURE",
    direct: [concept("PLAN-D", "Machine-Readable Assurance Case", "Bind gateway, database, dependency, and deployment claims to non-secret evidence."), concept("PLAN-DIII", "Completion Proof Compiler", "CONFIRMED_INVALID requires every retirement evidence path."), assurance],
    support: [concept("PLAN-DI", "Confidence Decomposition", "Represent verifier, database, internal feature, and dependency states separately."), reality],
    deferred: [concept("PLAN-DCCXLVII", "Calibrated Consensus", "Independent human or institutional replication remains future work."), concept("OMEGA-R2-A", "Operational Sandbox Provisioning", "Readiness remains ineligible before final security closure and gate reruns.")],
    implemented: ["reviewed implementation baseline and artifact binding", "E4 deployment/database evidence floors", "secret-bearing evidence rejection", "table-present/table-absent outcomes", "non-authorizing readiness projection"],
    deferredRequirements: ["real operator evidence", "evidence custody admission after deployment", "R2-A readiness rerun"],
    conflict: "Code-level retirement could be reported as final credential invalidation.",
    decision: "Keep SEC-003 open until authorized Lovable resulting-state evidence passes the separate closure evaluator.",
    mappings: ["scripts/evaluation/sec003-retirement/contracts.ts", "scripts/evaluation/sec003-retirement/evaluator.ts"],
    suite: "OMEGA-SEC003-ALE-RETIREMENT/EVALUATOR",
  }),
]);
