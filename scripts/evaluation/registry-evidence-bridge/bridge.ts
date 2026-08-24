import type {
  EvidenceArtifact,
  AdmittedEvidenceRecord,
  EvidenceAdmissionPolicy,
  JsonValue,
} from "../evidence-custody/contracts";
import { verifyAdmittedEvidence } from "../evidence-custody/custodian";
import { validateRegistry } from "../../../src/lib/codelab/registry/registry";
import type {
  EvidenceBoundWorkState,
  EvidenceClass,
  EvidenceRecord,
  InstitutionalCriticalPath,
  InstitutionalWorkItem,
  MaturityState,
  OmegaRegistry,
  RegistryRecordBase,
  VerificationState,
} from "../../../src/lib/codelab/registry/types";

const ACTIVE_MATURITY_PATH = Object.freeze([
  "PROPOSED",
  "SPECIFIED",
  "PROTOTYPED",
  "IMPLEMENTED",
  "INTEGRATED",
  "VERIFIED",
  "INDEPENDENTLY_REPLICATED",
  "PRODUCTION_READY",
  "ROUTINIZED",
] as const satisfies readonly MaturityState[]);
const EVIDENCE_RANK: Readonly<Record<EvidenceClass, number>> = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 });

export interface MaterialStateBinding {
  readonly subjectId: string;
  readonly fingerprint: string;
  readonly changedAtEpochMs: number;
}

export interface DependencyStateBinding {
  readonly dependencyId: string;
  readonly fingerprint: string;
}

export interface RegistryEvidenceClaimPayload {
  readonly schemaVersion: 1;
  readonly claimId: string;
  readonly registryRecordId: string;
  readonly claim: string;
  readonly result: "SUPPORTS" | "FALSIFIES" | "INCONCLUSIVE";
  readonly targetMaturity: MaturityState;
  readonly completeness: "COMPLETE" | "PARTIAL";
  readonly critical: boolean;
  readonly materialBinding: { readonly subjectId: string; readonly fingerprint: string };
  readonly dependencyBindings: readonly DependencyStateBinding[];
}

export interface CustodyAdmissionEnvelope {
  readonly record: AdmittedEvidenceRecord;
  readonly artifact: EvidenceArtifact;
  readonly policy: EvidenceAdmissionPolicy;
}

export interface RegistryTransitionRequest {
  readonly transitionId: string;
  readonly registry: OmegaRegistry;
  readonly registryRecordId: string;
  readonly requestedMaturity: MaturityState;
  readonly minimumEvidenceClass: EvidenceClass;
  readonly admissionRefs: readonly string[];
  readonly admissions: readonly CustodyAdmissionEnvelope[];
  readonly materialState: MaterialStateBinding;
  readonly dependencyState: readonly DependencyStateBinding[];
}

export interface RegistryTransitionDecision {
  readonly decision: "APPLIED" | "PRESERVED_FALSIFICATION" | "INSUFFICIENT_EVIDENCE" | "REJECTED";
  readonly issues: readonly string[];
  readonly registry: OmegaRegistry;
  readonly record: RegistryRecordBase | null;
  readonly admittedEvidenceIds: readonly string[];
}

function asObject(value: JsonValue): Readonly<Record<string, JsonValue>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseClaimPayload(value: JsonValue): RegistryEvidenceClaimPayload | null {
  const raw = asObject(value);
  if (!raw || raw.schemaVersion !== 1 || !nonEmpty(raw.claimId) || !nonEmpty(raw.registryRecordId) || !nonEmpty(raw.claim)) return null;
  if (!["SUPPORTS", "FALSIFIES", "INCONCLUSIVE"].includes(String(raw.result))) return null;
  if (!ACTIVE_MATURITY_PATH.includes(raw.targetMaturity as MaturityState) && raw.targetMaturity !== "REJECTED_EXPERIMENTALLY") return null;
  if (!["COMPLETE", "PARTIAL"].includes(String(raw.completeness)) || typeof raw.critical !== "boolean") return null;
  const material = asObject(raw.materialBinding);
  if (!material || !nonEmpty(material.subjectId) || !nonEmpty(material.fingerprint) || !Array.isArray(raw.dependencyBindings)) return null;
  const dependencies: DependencyStateBinding[] = [];
  for (const item of raw.dependencyBindings) {
    const dependency = asObject(item);
    if (!dependency || !nonEmpty(dependency.dependencyId) || !nonEmpty(dependency.fingerprint)) return null;
    dependencies.push({ dependencyId: dependency.dependencyId, fingerprint: dependency.fingerprint });
  }
  return {
    schemaVersion: 1,
    claimId: raw.claimId,
    registryRecordId: raw.registryRecordId,
    claim: raw.claim,
    result: raw.result as RegistryEvidenceClaimPayload["result"],
    targetMaturity: raw.targetMaturity as MaturityState,
    completeness: raw.completeness as RegistryEvidenceClaimPayload["completeness"],
    critical: raw.critical,
    materialBinding: { subjectId: material.subjectId, fingerprint: material.fingerprint },
    dependencyBindings: dependencies,
  };
}

function dependencyBindingsMatch(expected: readonly DependencyStateBinding[], current: readonly DependencyStateBinding[]): boolean {
  const currentMap = new Map(current.map((item) => [item.dependencyId, item.fingerprint]));
  return expected.length === current.length && expected.every((item) => currentMap.get(item.dependencyId) === item.fingerprint);
}

function nextMaturity(current: MaturityState): MaturityState | null {
  const index = ACTIVE_MATURITY_PATH.indexOf(current);
  return index >= 0 ? ACTIVE_MATURITY_PATH[index + 1] ?? null : null;
}

function verificationFor(maturity: MaturityState, current: VerificationState): VerificationState {
  if (maturity === "INDEPENDENTLY_REPLICATED" || maturity === "PRODUCTION_READY" || maturity === "ROUTINIZED") return "INDEPENDENTLY_REPLICATED";
  if (maturity === "VERIFIED") return "VERIFIED";
  return current === "UNVERIFIED" ? "PARTIALLY_VERIFIED" : current;
}

function registryEvidence(envelope: CustodyAdmissionEnvelope, payload: RegistryEvidenceClaimPayload): EvidenceRecord {
  return {
    evidenceId: envelope.record.artifactId,
    evidenceClass: envelope.record.independence.evidenceClass,
    result: payload.result,
    claim: payload.claim,
    provenance: {
      sourceId: envelope.record.artifactId,
      sourceType: "external",
      locator: envelope.record.source,
      contentHash: envelope.record.authoritativeDigest,
    },
    artifactRef: envelope.record.admissionRef,
    mechanism: envelope.record.custody.mechanism,
    freshness: "CURRENT",
    independenceBasis: envelope.record.independence.independenceBasis,
  };
}

function replaceRecord(registry: OmegaRegistry, updated: RegistryRecordBase): OmegaRegistry {
  const clone = structuredClone(registry) as OmegaRegistry;
  return {
    ...clone,
    plans: clone.plans.map((record) => record.canonicalId === updated.canonicalId ? updated as typeof record : record),
    capabilities: clone.capabilities.map((record) => record.canonicalId === updated.canonicalId ? updated as typeof record : record),
  };
}

function rejected(request: RegistryTransitionRequest, issues: readonly string[]): RegistryTransitionDecision {
  return { decision: "REJECTED", issues: [...new Set(issues)], registry: request.registry, record: null, admittedEvidenceIds: [] };
}

export function evaluateEvidenceBoundTransition(request: RegistryTransitionRequest): RegistryTransitionDecision {
  const issues: string[] = [];
  const registryValidation = validateRegistry(request.registry);
  if (!registryValidation.ok) issues.push("registry_invalid_before_transition");
  const target = [...request.registry.plans, ...request.registry.capabilities].find((item) => item.canonicalId === request.registryRecordId);
  if (!target) issues.push("registry_record_not_found");
  if (request.admissionRefs.length === 0) issues.push("custody_admission_required");
  if (new Set(request.admissionRefs).size !== request.admissionRefs.length) issues.push("duplicate_admission_reference");
  const envelopes = request.admissionRefs.map((ref) => request.admissions.find((item) => item.record.admissionRef === ref));
  if (envelopes.some((item) => item === undefined)) issues.push("admission_reference_not_found");
  if (issues.length > 0 || !target) return rejected(request, issues);

  const admitted = envelopes as CustodyAdmissionEnvelope[];
  const payloads: RegistryEvidenceClaimPayload[] = [];
  for (const envelope of admitted) {
    const verification = verifyAdmittedEvidence(envelope.record, envelope.artifact, envelope.policy);
    if (!verification.ok) issues.push(...verification.issues.map((issue) => `custody_${issue}`));
    const payload = parseClaimPayload(envelope.artifact.payload);
    if (!payload) { issues.push("malformed_claim_payload"); continue; }
    payloads.push(payload);
    if (payload.registryRecordId !== request.registryRecordId) issues.push("claim_registry_record_mismatch");
    if (payload.targetMaturity !== request.requestedMaturity && payload.result === "SUPPORTS") issues.push("claim_target_maturity_mismatch");
    if (payload.completeness !== "COMPLETE") issues.push("incomplete_claim_evidence");
    if (payload.materialBinding.subjectId !== request.materialState.subjectId) issues.push("material_subject_mismatch");
    if (payload.materialBinding.fingerprint !== request.materialState.fingerprint) issues.push("material_fingerprint_changed");
    if (envelope.record.observedAtEpochMs < request.materialState.changedAtEpochMs) issues.push("evidence_predates_material_change");
    if (!dependencyBindingsMatch(payload.dependencyBindings, request.dependencyState)) issues.push("dependency_fingerprint_changed");
    const evidenceClass = envelope.record.independence.evidenceClass;
    if (EVIDENCE_RANK[evidenceClass] < EVIDENCE_RANK[request.minimumEvidenceClass]) issues.push("evidence_independence_below_requirement");
    if (EVIDENCE_RANK[evidenceClass] >= EVIDENCE_RANK.E2 && envelope.record.independence.sharesImplementationHelpers) {
      issues.push("independent_evidence_shares_implementation_helpers");
    }
  }
  if (issues.length > 0) return rejected(request, issues);

  const evidence = admitted.map((envelope, index) => registryEvidence(envelope, payloads[index]));
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const hasCriticalFalsification = payloads.some((payload) => payload.result === "FALSIFIES" && payload.critical);
  const hasFalsification = payloads.some((payload) => payload.result === "FALSIFIES");
  const hasSupport = payloads.some((payload) => payload.result === "SUPPORTS");
  const mergedEvidence = [...target.evidence, ...evidence];

  let updated: RegistryRecordBase;
  let decision: RegistryTransitionDecision["decision"];
  if (hasCriticalFalsification) {
    updated = {
      ...target,
      maturity: "REJECTED_EXPERIMENTALLY",
      maturityHistory: [...target.maturityHistory, { state: "REJECTED_EXPERIMENTALLY", evidenceIds, rationale: "Critical admitted falsification dominates supporting confidence." }],
      epistemicState: "REFUTED",
      verificationState: "REJECTED",
      evidence: mergedEvidence,
    };
    decision = "PRESERVED_FALSIFICATION";
  } else if (hasFalsification && hasSupport) {
    updated = { ...target, epistemicState: "CONFLICTED", evidence: mergedEvidence };
    decision = "INSUFFICIENT_EVIDENCE";
  } else if (!hasSupport) {
    updated = { ...target, epistemicState: "INSUFFICIENT_EVIDENCE", evidence: mergedEvidence };
    decision = "INSUFFICIENT_EVIDENCE";
  } else {
    const permitted = nextMaturity(target.maturity);
    if (permitted !== request.requestedMaturity) return rejected(request, ["maturity_transition_not_next_gate"]);
    updated = {
      ...target,
      maturity: request.requestedMaturity,
      maturityHistory: [...target.maturityHistory, { state: request.requestedMaturity, evidenceIds, rationale: `Transition ${request.transitionId} is bound to admitted evidence.` }],
      epistemicState: "SUPPORTED",
      verificationState: verificationFor(request.requestedMaturity, target.verificationState),
      evidence: mergedEvidence,
    };
    decision = "APPLIED";
  }

  const registry = replaceRecord(request.registry, updated);
  const validation = validateRegistry(registry);
  if (!validation.ok) return rejected(request, ["registry_invalid_after_transition", ...validation.errors.map((error) => error.code)]);
  return { decision, issues: [], registry, record: updated, admittedEvidenceIds: evidenceIds };
}

export function deriveEvidenceBoundCriticalPath(
  template: InstitutionalCriticalPath,
  stateBindings: readonly EvidenceBoundWorkState[],
): InstitutionalCriticalPath {
  const bindings = new Map(stateBindings.map((binding) => [binding.workItemId, binding]));
  const workItems = template.workItems.map((item): InstitutionalWorkItem => {
    const binding = bindings.get(item.workItemId);
    if (!binding) return { ...item, state: "UNKNOWN", blockingReasons: ["EVIDENCE_STATE_BINDING_MISSING"] };
    if (binding.administrativeState === "BLOCKED_EXTERNAL") {
      return { ...item, state: "BLOCKED_EXTERNAL", blockingReasons: binding.blockingReasons.length > 0 ? binding.blockingReasons : ["EXTERNAL_BLOCKER_UNSPECIFIED"] };
    }
    if (binding.administrativeState === "CANCELLED" || binding.administrativeState === "SUPERSEDED") {
      return { ...item, state: "REJECTED", blockingReasons: [binding.administrativeState] };
    }
    if (binding.evidentiaryState === "VERIFIED" && binding.evidenceAdmissionRefs.length > 0) {
      return { ...item, state: "SATISFIED", blockingReasons: [] };
    }
    if (binding.evidentiaryState === "UNVERIFIED") return { ...item, state: "NOT_STARTED", blockingReasons: [] };
    if (binding.evidentiaryState === "REFUTED" || binding.evidentiaryState === "CONFLICTED") {
      return { ...item, state: "REJECTED", blockingReasons: [binding.evidentiaryState] };
    }
    return { ...item, state: "UNKNOWN", blockingReasons: [binding.evidentiaryState] };
  });
  return { ...template, workItems };
}

export function invalidateEvidenceBoundState(
  binding: EvidenceBoundWorkState,
  claimDependencies: readonly DependencyStateBinding[],
  currentDependencies: readonly DependencyStateBinding[],
  observedAtEpochMs: number,
  materialChangedAtEpochMs: number,
): EvidenceBoundWorkState {
  const stale = observedAtEpochMs < materialChangedAtEpochMs || !dependencyBindingsMatch(claimDependencies, currentDependencies);
  return stale ? { ...binding, evidentiaryState: "REQUIRES_REVALIDATION", blockingReasons: [...binding.blockingReasons, "MATERIAL_OR_DEPENDENCY_STATE_CHANGED"] } : binding;
}
