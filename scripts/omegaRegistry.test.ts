import { OMEGA_BASELINE_REGISTRY } from "../src/lib/codelab/registry/baseline";
import {
  capabilityRelationships,
  dependenciesOf,
  deserializeRegistry,
  evidenceIsIndependent,
  planRelationships,
  serializeRegistry,
  sourceProvenanceEqual,
  validateRegistry,
} from "../src/lib/codelab/registry/registry";
import type { EvidenceRecord, OmegaRegistry } from "../src/lib/codelab/registry/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(label);
    console.error(`  x ${label}`);
  }
}

function clone(): OmegaRegistry {
  return structuredClone(OMEGA_BASELINE_REGISTRY);
}

function errorCodes(registry: unknown): Set<string> {
  const result = validateRegistry(registry);
  return new Set(result.ok ? [] : result.errors.map((error) => error.code));
}

function mutate(mutator: (registry: any) => void): unknown {
  const registry = clone() as any;
  mutator(registry);
  return registry;
}

const baseline = validateRegistry(OMEGA_BASELINE_REGISTRY);
assert(baseline.ok, "baseline registry is accepted");
assert(OMEGA_BASELINE_REGISTRY.corpusStatus === "PARTIAL", "baseline corpus is explicitly partial");
assert(OMEGA_BASELINE_REGISTRY.losslessCertification === false, "baseline disclaims lossless certification");

assert(
  errorCodes(mutate((registry) => { registry.losslessCertification = true; })).has("partial_claims_lossless"),
  "partial corpus cannot claim completeness",
);
assert(
  errorCodes(mutate((registry) => {
    registry.corpusStatus = "LOSSLESSLY_CERTIFIED";
    registry.losslessCertification = true;
    for (const record of [...registry.plans, ...registry.capabilities]) {
      record.corpusStatus = "LOSSLESSLY_CERTIFIED";
      record.losslessCertification = true;
    }
  })).has("certified_source_without_hash"),
  "lossless corpus requires source hashes",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].evidence = []; })).has("verified_without_evidence"),
  "verified maturity without evidence is rejected",
);
assert(
  errorCodes(mutate((registry) => {
    const capability = registry.capabilities[0];
    capability.maturity = "INDEPENDENTLY_REPLICATED";
    capability.maturityHistory.push({
      state: "INDEPENDENTLY_REPLICATED",
      evidenceIds: [capability.evidence[0].evidenceId],
      rationale: "Adversarial fixture without independent evidence.",
    });
    capability.evidence[0].evidenceClass = "E1";
    capability.evidence[0].independenceBasis = null;
  })).has("replicated_without_independent_evidence"),
  "replicated maturity without independent evidence is rejected",
);
assert(
  errorCodes(mutate((registry) => {
    const plan = registry.plans[1];
    plan.maturity = "REJECTED_EXPERIMENTALLY";
    plan.maturityHistory.push({ state: "REJECTED_EXPERIMENTALLY", evidenceIds: [], rationale: "Rejected fixture." });
    plan.verificationState = "REJECTED";
  })).has("rejected_without_falsification"),
  "experimental rejection requires falsification evidence",
);
assert(
  errorCodes(mutate((registry) => {
    const capability = registry.capabilities[1];
    capability.maturity = "PRODUCTION_READY";
    capability.maturityHistory = [
      capability.maturityHistory[0],
      { state: "PRODUCTION_READY", evidenceIds: [], rationale: "Skipped fixture." },
    ];
  })).has("maturity_gate_skipped"),
  "production-ready state cannot skip intermediate maturity gates",
);

const rejected = mutate((registry) => {
  const plan = registry.plans[1];
  const falsification = structuredClone(plan.evidence[0]);
  falsification.evidenceId = "OMEGA-EV-FALSIFIED-HYPOTHESIS";
  falsification.evidenceClass = "E3";
  falsification.result = "FALSIFIES";
  falsification.claim = "The defined hypothesis failed its deterministic falsification threshold.";
  falsification.independenceBasis = "A deterministic external harness produced the counterexample.";
  plan.evidence.push(falsification);
  plan.maturity = "REJECTED_EXPERIMENTALLY";
  plan.maturityHistory.push({
    state: "REJECTED_EXPERIMENTALLY",
    evidenceIds: [falsification.evidenceId],
    rationale: "Falsifying evidence is retained rather than deleted.",
  });
  plan.epistemicState = "REFUTED";
  plan.verificationState = "REJECTED";
});
const rejectedResult = validateRegistry(rejected);
assert(rejectedResult.ok, "valid falsified hypothesis is accepted");
assert(
  rejectedResult.ok && rejectedResult.registry.plans[1].evidence.some((item) => item.result === "FALSIFIES"),
  "falsifying evidence remains preserved",
);

assert(planRelationships(OMEGA_BASELINE_REGISTRY, "Ω-PLAN-REG-001A", "OVERLAPS")[0]?.canonicalId === "Ω-PLAN-VS-001A", "plan relationship query resolves target");
assert(capabilityRelationships(OMEGA_BASELINE_REGISTRY, "Ω-CAP-REGISTRY-INVARIANTS", "ENABLES")[0]?.canonicalId === "Ω-CAP-READ-REPOSITORY", "capability relationship query resolves target");
assert(dependenciesOf(OMEGA_BASELINE_REGISTRY, "Ω-CAP-READ-REPOSITORY").length === 3, "cross-graph dependencies resolve");
assert(planRelationships(OMEGA_BASELINE_REGISTRY, "MISSING").length === 0, "missing relationship source is honest empty result");
const sec003Plan = OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-SEC-003");
assert(sec003Plan?.epistemicState === "UNKNOWN", "unresolved credential containment remains explicitly UNKNOWN");
assert(sec003Plan?.securityClosureSubstates?.length === 10, "SEC-003 exposes all ten explicit closure substates");
assert(sec003Plan?.securityClosureSubstates?.find((item) => item.substateId === "PROJECT_IDENTIFIED")?.satisfied === true, "SEC-003 records the repository-linked project as identified");
assert(sec003Plan?.securityClosureSubstates?.filter((item) => item.substateId !== "PROJECT_IDENTIFIED").every((item) => item.satisfied === false), "SEC-003 keeps every unresolved containment substate open");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-R2-DESIGN-001")?.maturity === "SPECIFIED", "R2 plan stops at SPECIFIED maturity");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-R2-DESIGN-001")?.verificationState === "VERIFIED", "R2 specification has verification evidence without claiming implementation");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-R2-A-SPEC-EVAL-001")?.verificationState === "VERIFIED", "R2-A specification/evaluator is verified without operational authority");
const r2AImplSpecPlan = OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-R2-A-IMPLSPEC-001");
assert(r2AImplSpecPlan?.maturity === "SPECIFIED" && r2AImplSpecPlan.verificationState === "VERIFIED", "R2-A implementation blueprint is design-verified at SPECIFIED maturity only");
assert(r2AImplSpecPlan?.implementationMappings.every((mapping) => mapping.status !== "active" || mapping.kind === "tool"), "R2-A implementation blueprint has no active repository authority mapping");
const r2HostEvalPlan = OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-R2-HOST-EVAL-001");
assert(r2HostEvalPlan?.maturity === "PROTOTYPED" && r2HostEvalPlan.verificationState === "VERIFIED", "R2 host detector is verified only as a prototype evaluator");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-TS-RATCHET-001")?.maturity === "VERIFIED", "TypeScript diagnostic ratchet plan is operationally verified");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-ASSURE-R2-SPEC-001")?.verificationState === "VERIFIED", "R2 assurance decision specification is verified without certifying R2");
assert(OMEGA_BASELINE_REGISTRY.plans.find((plan) => plan.canonicalId === "Ω-PLAN-ASSURE-R2-EVAL-001")?.maturity === "PROTOTYPED", "separate R2 assurance evaluator is registered as a prototype only");
const writeSandboxCapability = OMEGA_BASELINE_REGISTRY.capabilities.find((capability) => capability.canonicalId === "Ω-CAP-WRITE-SANDBOX");
assert(writeSandboxCapability?.maturity === "SPECIFIED" && writeSandboxCapability.epistemicState === "INSUFFICIENT_EVIDENCE", "WRITE_SANDBOX remains specified with insufficient operational evidence");
assert(writeSandboxCapability?.implementationMappings.every((mapping) => mapping.status !== "active"), "WRITE_SANDBOX has no active implementation mapping");
assert(dependenciesOf(OMEGA_BASELINE_REGISTRY, "Ω-PLAN-R2-DESIGN-001").some((dependency) => dependency.canonicalId === "Ω-PLAN-SEC-003"), "R2 design dependency graph retains credential containment blocker");
assert(dependenciesOf(OMEGA_BASELINE_REGISTRY, "Ω-PLAN-R2-A-SPEC-EVAL-001").some((dependency) => dependency.canonicalId === "Ω-PLAN-SEC-003"), "R2-A implementation preparation retains credential containment blocker");
assert(capabilityRelationships(OMEGA_BASELINE_REGISTRY, "Ω-CAP-WRITE-SANDBOX", "DEPENDS_ON")[0]?.canonicalId === "Ω-CAP-READ-REPOSITORY", "WRITE_SANDBOX capability depends on verified R1 observation");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.capabilityId === "Ω-CAP-WRITE-SANDBOX" && entry.currentResult === "IMPLSPEC_VERIFIED_AUTHORITY_UNAVAILABLE"), "capability regression ledger distinguishes blueprint verification from authority availability");
assert(writeSandboxCapability?.implementationMappings.some((mapping) => mapping.ref.endsWith("r2ProvisioningBlueprint.ts") && mapping.status === "experimental"), "WRITE_SANDBOX maps the blueprint as experimental rather than active authority");
const r2HostCapability = OMEGA_BASELINE_REGISTRY.capabilities.find((capability) => capability.canonicalId === "Ω-CAP-R2-HOST-EVALUATION");
assert(r2HostCapability?.epistemicState === "INSUFFICIENT_EVIDENCE" && r2HostCapability.verificationState === "UNVERIFIED", "real host-boundary capability remains unverified despite detector tests");
assert(capabilityRelationships(OMEGA_BASELINE_REGISTRY, "Ω-CAP-R2-HOST-EVALUATION", "VERIFIES")[0]?.canonicalId === "Ω-CAP-WRITE-SANDBOX", "host evaluator capability maps to future sandbox-write verification");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.capabilityId === "Ω-CAP-R2-HOST-EVALUATION" && entry.currentResult === "PROTOTYPED_SYNTHETIC_13_OF_13_REAL_HOST_0"), "host evaluator regression ledger separates synthetic from real-host coverage");
assert(OMEGA_BASELINE_REGISTRY.capabilities.find((capability) => capability.canonicalId === "Ω-CAP-TS-ERROR-RATCHET")?.verificationState === "VERIFIED", "TypeScript no-new-error capability is registered as verified");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.capabilityId === "Ω-CAP-TS-ERROR-RATCHET" && entry.currentResult.endsWith("NEW_0")), "TypeScript regression record preserves the zero-new-error result");
const r2AssuranceCapability = OMEGA_BASELINE_REGISTRY.capabilities.find((capability) => capability.canonicalId === "Ω-CAP-R2-INDEPENDENT-ASSURANCE");
assert(r2AssuranceCapability?.maturity === "PROTOTYPED" && r2AssuranceCapability.verificationState === "UNVERIFIED", "R2 assurance capability remains prototyped and operationally unverified");
assert(r2AssuranceCapability?.implementationMappings.some((mapping) => mapping.ref.endsWith("r2-assurance/evaluator.ts") && mapping.status === "experimental"), "separate assurance evaluator remains an experimental mapping");
assert(capabilityRelationships(OMEGA_BASELINE_REGISTRY, "Ω-CAP-R2-INDEPENDENT-ASSURANCE", "VERIFIES")[0]?.canonicalId === "Ω-CAP-WRITE-SANDBOX", "R2 assurance capability is mapped to verify WRITE_SANDBOX");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.capabilityId === "Ω-CAP-R2-INDEPENDENT-ASSURANCE" && entry.currentResult === "PROTOTYPED_34_VECTORS_NOT_OPERATIONAL"), "assurance regression record does not inflate evaluator vectors into operation");

const serialized = serializeRegistry(OMEGA_BASELINE_REGISTRY);
assert(serialized.ok, "valid registry serializes");
const serializedAgain = serializeRegistry(clone());
assert(serialized.ok && serializedAgain.ok && serialized.json === serializedAgain.json, "serialization is deterministic");
const restored = serialized.ok ? deserializeRegistry(serialized.json) : { ok: false as const, errors: [] };
assert(restored.ok, "serialized registry deserializes");
assert(
  restored.ok && sourceProvenanceEqual(restored.registry.plans[0].source, OMEGA_BASELINE_REGISTRY.plans[0].source),
  "source provenance survives serialization",
);
assert(!deserializeRegistry("{not-json").ok, "invalid JSON is rejected");
assert(errorCodes(mutate((registry) => { registry.schemaVersion = 2; })).has("bad_schema_version"), "unsupported future schema version is explicitly rejected");
assert(errorCodes(mutate((registry) => { registry.schemaVersion = "1"; })).has("bad_schema_version"), "malformed schema version is explicitly rejected");
assert(!validateRegistry({ schemaVersion: 1, plans: [null], capabilities: [], regressions: [] }).ok, "malformed records fail closed without throwing");
assert(!validateRegistry(mutate((registry) => { registry.plans[0].relationships = [null]; })).ok, "malformed relationships fail closed without throwing");
assert(!validateRegistry(mutate((registry) => { delete registry.plans[0].dependencies; })).ok, "missing dependency arrays fail closed without throwing");

assert(
  errorCodes(mutate((registry) => { registry.capabilities[1].canonicalId = registry.capabilities[0].canonicalId; })).has("duplicate_canonical_id"),
  "duplicate canonical IDs are rejected",
);
assert(
  errorCodes(mutate((registry) => { registry.capabilities[1].dependencies.push("Ω-CAP-MISSING"); })).has("unknown_dependency"),
  "unknown dependency is rejected",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].relationships[0].targetId = "Ω-PLAN-MISSING"; })).has("unknown_relationship_target"),
  "unknown relationship target is rejected",
);
assert(
  errorCodes(mutate((registry) => {
    const capability = registry.capabilities[1];
    capability.maturity = "SPECIFIED";
    capability.maturityHistory = capability.maturityHistory.slice(0, 2);
    capability.verificationState = "UNVERIFIED";
    capability.evidence = [];
    capability.securityProfile.securityEvidenceIds = [];
    capability.epistemicState = "SUPPORTED";
  })).has("supported_without_evidence"),
  "SUPPORTED without evidence is rejected",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].epistemicState = "CONFLICTED"; })).has("conflicted_without_both_sides"),
  "CONFLICTED without both sides is rejected",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].evidence[0].independenceBasis = "False independence claim"; })).has("correlated_claims_independence"),
  "E0-E1 evidence cannot claim independence",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].evidence[1].independenceBasis = null; })).has("independence_unjustified"),
  "E2-E5 evidence requires an independence basis",
);
assert(
  errorCodes(mutate((registry) => { delete registry.plans[0].securityProfile; })).has("missing_security_profile"),
  "security profile is mandatory",
);
assert(
  errorCodes(mutate((registry) => { registry.plans[0].securityProfile.securityEvidenceIds = ["Ω-EV-MISSING"]; })).has("unknown_security_evidence"),
  "security evidence must resolve locally",
);
assert(
  errorCodes(mutate((registry) => { registry.regressions[0].confidence = 1.1; })).has("bad_regression_confidence"),
  "regression confidence is bounded",
);
assert(
  errorCodes(mutate((registry) => { registry.regressions[0].currentEvidenceIds = ["Ω-EV-MISSING"]; })).has("unknown_current_regression_evidence"),
  "regression evidence must resolve",
);
assert(OMEGA_BASELINE_REGISTRY.capabilities[1].certificates?.length === 10, "R1 capability exposes ten subordinate certificates");
assert(
  errorCodes(mutate((registry) => { registry.capabilities[1].certificates[0].evidenceIds = []; })).has("verified_certificate_without_evidence"),
  "verified capability certificate requires evidence",
);
assert(
  errorCodes(mutate((registry) => { registry.capabilities[1].certificates[1].certificateId = registry.capabilities[1].certificates[0].certificateId; })).has("duplicate_certificate_id"),
  "duplicate capability certificate IDs are rejected",
);
assert(
  errorCodes(mutate((registry) => { registry.capabilities[1].certificates[0].evidenceIds = ["Ω-EV-MISSING"]; })).has("unknown_certificate_evidence"),
  "capability certificate evidence must resolve locally",
);
assert(
  errorCodes(mutate((registry) => {
    const plan = registry.plans.find((item) => item.canonicalId === "Ω-PLAN-SEC-003");
    const substate = plan.securityClosureSubstates.find((item) => item.substateId === "CORRECT_MANAGEMENT_ACCESS");
    substate.satisfied = true;
    substate.evidenceIds = [];
  })).has("satisfied_security_closure_without_evidence"),
  "satisfied security closure substate requires evidence",
);
assert(
  errorCodes(mutate((registry) => {
    const plan = registry.plans.find((item) => item.canonicalId === "Ω-PLAN-SEC-003");
    plan.securityClosureSubstates[1].substateId = plan.securityClosureSubstates[0].substateId;
  })).has("duplicate_security_closure_substate"),
  "duplicate security closure substates are rejected",
);
assert(
  errorCodes(mutate((registry) => {
    const plan = registry.plans.find((item) => item.canonicalId === "Ω-PLAN-SEC-003");
    plan.securityClosureSubstates[0].evidenceIds = ["Ω-EV-MISSING"];
  })).has("unknown_security_closure_evidence"),
  "security closure evidence must resolve locally",
);

const e3 = OMEGA_BASELINE_REGISTRY.capabilities[0].evidence[0];
const e0 = OMEGA_BASELINE_REGISTRY.plans[0].evidence[0];
assert(evidenceIsIndependent(e3), "E3 evidence with basis is classified independent");
assert(!evidenceIsIndependent(e0), "E0 directive evidence is not inflated to independent evidence");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.currentResult === "385/385"), "baseline tracks exact ORCHESTRA capability result");
assert(OMEGA_BASELINE_REGISTRY.regressions.some((entry) => entry.currentResult === "VERIFIED_R1_PRIVATE_31_OF_31"), "read capability regression state records the private R1 evaluation result");
assert(
  (OMEGA_BASELINE_REGISTRY.plans[0].evidence[0] as EvidenceRecord).provenance.sourceType === "conversation",
  "directive evidence retains conversation provenance",
);

console.log(`Omega registry tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
