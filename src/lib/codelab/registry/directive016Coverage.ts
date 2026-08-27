import {
  INHERITED_OMEGA_CONSTRAINTS,
  OMEGA_CORPUS_STATUS,
  OMEGA_COVERAGE_STATUS,
  PLAN_CONFLICT_DOMAINS,
  type OmegaConceptRef,
  type PlanCoverageRecord,
} from "./planCoverage";

const concept = (conceptId: string, title: string, appliedScope: string): OmegaConceptRef => Object.freeze({ conceptId, title, appliedScope });
export const DIRECTIVE_016_WORKSTREAM_IDS = Object.freeze(["OMEGA-SEC-003-DEPLOYMENT-IDENTITY-RECONCILIATION-001"] as const);

export const DIRECTIVE_016_PLAN_COVERAGE: readonly PlanCoverageRecord[] = Object.freeze([Object.freeze({
  workstreamId: DIRECTIVE_016_WORKSTREAM_IDS[0],
  registryIdentity: "OMEGA-PLAN-COVERAGE-OMEGA-SEC-003-DEPLOYMENT-IDENTITY-RECONCILIATION-001",
  capabilityObjectiveId: "CAPABILITY-EXACT-DEPLOYABLE-STATE-IDENTITY",
  visionRef: "OMEGA_VERIFIED_STATE_TRANSFORMATION",
  sourceDirective: "OMEGA_DIRECTIVE_016",
  coverageStatus: OMEGA_COVERAGE_STATUS,
  corpusStatus: OMEGA_CORPUS_STATUS,
  directlyImplemented: [
    concept("PLAN-DCXLVII", "Immutable Capability Releases", "Separate the reviewed implementation baseline from the exact operator-designated deployable commit."),
    concept("PLAN-DXIV", "Reasoning Cache Coherence Protocol", "Invalidate deployment identity when any pinned security artifact digest changes."),
    concept("OMEGA-LAW-EVIDENCE", "Evidence Over Confidence", "Require Git/source identity evidence in addition to Lovable runtime evidence."),
  ],
  supporting: [
    concept("PLAN-D", "Machine-Readable Assurance Case", "Bind exact deployment state, immutable artifacts, runtime result, and database result."),
    concept("PLAN-DCXCIV", "Knowledge Dependency Lockfile", "Preserve the reviewed c75f484 implementation as the security baseline."),
  ],
  deferred: [
    concept("OMEGA-SEC-003-E4", "Lovable Deployment Evidence", "No deployment occurs in Directive 016."),
    concept("OMEGA-R2-A", "Disposable Sandbox Provisioning", "No mutation authority is introduced."),
  ],
  implementedRequirements: ["exact operator-designated deployment commit", "reviewed artifact SHA-256 set", "ancestry verification", "legacy acceptance-path scan", "descendant-with-changed-runtime rejection"],
  deferredRequirements: ["authorized Lovable deployment", "E4 resulting-state evidence", "final SEC-003 closure", "R2-A readiness rerun"],
  conflicts: [Object.freeze({
    conflictId: "CONFLICT-OMEGA-SEC-003-DEPLOYMENT-IDENTITY-RECONCILIATION-001",
    disposition: "RESOLVED" as const,
    proposals: ["Require deployment of the historical implementation commit", "Publish the current Lovable-synchronized branch state"] as const,
    preservedSourceRefs: ["directive://015", "directive://016"],
    operationalDecision: "Designate one exact current commit externally while proving its reviewed ALE runtime and migration artifacts are unchanged; ancestry alone is insufficient.",
    evidenceRefs: ["suite://OMEGA-SEC003-ALE-RETIREMENT", "tool://sec003-deployment-identity"],
  })],
  conflictDomainsChecked: PLAN_CONFLICT_DOMAINS,
  supersededOperationalApproaches: ["Hard-code the pre-manifest implementation commit as the only deployable commit", "Accept any descendant commit based on ancestry alone"],
  implementationMappings: ["scripts/evaluation/sec003-retirement/contracts.ts", "scripts/evaluation/sec003-retirement/evaluator.ts", "scripts/evaluation/sec003-retirement/deploymentIdentity.ts", "supabase/deployment/sec003-ale-retirement.release.json"],
  testEvidenceRefs: ["suite://OMEGA-SEC003-ALE-RETIREMENT", "suite://OMEGA-DIRECTIVE-016-PLAN-COVERAGE"],
  assuranceEvidenceRefs: ["assurance://directive-016/deployment-identity"],
  maturity: "VERIFIED",
  verificationScope: "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT",
  independentlyReplicated: false,
  authority: Object.freeze({
    available: Object.freeze(["READ_REPOSITORY"]),
    unavailable: Object.freeze(["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"]),
    forbidden: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"]),
    grantedByArtifact: Object.freeze([] as string[]),
  }),
  inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS,
})]);
