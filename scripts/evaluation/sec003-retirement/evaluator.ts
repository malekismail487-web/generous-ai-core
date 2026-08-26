import { verifyAdmittedEvidence } from "../evidence-custody/custodian";
import type { JsonValue } from "../evidence-custody/contracts";
import type { CustodyAdmissionEnvelope } from "../registry-evidence-bridge/bridge";
import {
  ALE_RETIREMENT_MIGRATION_ID,
  SEC003_RETIREMENT_OBSERVATION_KINDS,
  validateAleRetirementReleaseManifest,
  type Sec003RetirementDecision,
  type Sec003RetirementObservationKind,
  type Sec003RetirementPackage,
} from "./contracts";

const EVIDENCE_RANK = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 } as const);
type DataObject = Readonly<Record<string, JsonValue>>;

interface Observation {
  readonly envelope: CustodyAdmissionEnvelope;
  readonly kind: Sec003RetirementObservationKind;
  readonly closureId: string;
  readonly projectRef: string;
  readonly candidateCommit: string;
  readonly secretMaterialIncluded: boolean;
  readonly data: DataObject;
}

function object(value: JsonValue): DataObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DataObject : null;
}
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

function parseObservation(envelope: CustodyAdmissionEnvelope): Observation | null {
  const payload = object(envelope.artifact.payload);
  if (!payload || payload.schemaVersion !== 1 || !nonEmpty(payload.closureId) || !nonEmpty(payload.projectRef) || !nonEmpty(payload.candidateCommit)) return null;
  if (!SEC003_RETIREMENT_OBSERVATION_KINDS.includes(payload.kind as Sec003RetirementObservationKind)) return null;
  const data = object(payload.data);
  if (!data || typeof payload.secretMaterialIncluded !== "boolean") return null;
  return {
    envelope,
    kind: payload.kind as Sec003RetirementObservationKind,
    closureId: payload.closureId,
    projectRef: payload.projectRef,
    candidateCommit: payload.candidateCommit,
    secretMaterialIncluded: payload.secretMaterialIncluded,
    data,
  };
}

function result(
  decision: Sec003RetirementDecision["decision"],
  closureState: Sec003RetirementDecision["closureState"],
  verifierRetirement: Sec003RetirementDecision["verifierRetirement"],
  databaseRetirement: Sec003RetirementDecision["databaseRetirement"],
  internalAdaptiveLearning: Sec003RetirementDecision["internalAdaptiveLearning"],
  dependentIntegration: Sec003RetirementDecision["dependentIntegration"],
  issues: readonly string[],
  evidenceRefs: readonly string[],
): Sec003RetirementDecision {
  return Object.freeze({
    decision, closureState, verifierRetirement, databaseRetirement, internalAdaptiveLearning, dependentIntegration,
    issues: unique(issues), evidenceRefs: unique(evidenceRefs), grantsAuthority: false, containsSecretMaterial: false,
  });
}

export function evaluateSec003AleRetirement(input: Sec003RetirementPackage): Sec003RetirementDecision {
  const issues = [...validateAleRetirementReleaseManifest(input.releaseManifest, input.expectedCandidateCommit)];
  const hardFailures: string[] = [];
  if (input.schemaVersion !== 1 || !nonEmpty(input.closureId) || !nonEmpty(input.expectedProjectRef) || !/^[0-9a-f]{40}$/.test(input.expectedCandidateCommit)) hardFailures.push("malformed_closure_identity");
  if (input.admissionRefs.length === 0) issues.push("deployment_evidence_required");
  if (unique(input.admissionRefs).length !== input.admissionRefs.length) hardFailures.push("duplicate_admission_reference");
  const envelopes = input.admissionRefs.map((ref) => input.admissions.find((item) => item.record.admissionRef === ref));
  if (envelopes.some((item) => item === undefined)) hardFailures.push("admission_reference_not_found");

  const observations: Observation[] = [];
  for (const envelope of envelopes.filter(Boolean) as CustodyAdmissionEnvelope[]) {
    const verified = verifyAdmittedEvidence(envelope.record, envelope.artifact, envelope.policy);
    if (!verified.ok) hardFailures.push(...verified.issues.map((issue) => `custody_${issue}`));
    const observation = parseObservation(envelope);
    if (!observation) { hardFailures.push("malformed_retirement_observation"); continue; }
    observations.push(observation);
    if (observation.closureId !== input.closureId) hardFailures.push("closure_identity_mismatch");
    if (observation.projectRef !== input.expectedProjectRef) hardFailures.push("wrong_lovable_project");
    if (observation.candidateCommit !== input.expectedCandidateCommit) hardFailures.push("wrong_deployed_candidate");
    if (observation.secretMaterialIncluded) hardFailures.push("secret_material_prohibited");
    const evidenceClass = envelope.record.independence.evidenceClass;
    const required = observation.kind === "DEPENDENCY_PRESERVATION" ? "E3" : "E4";
    if (EVIDENCE_RANK[evidenceClass] < EVIDENCE_RANK[required]) issues.push(`evidence_class_below_requirement:${observation.kind}`);
  }
  if (hardFailures.length > 0) return result("REJECTED", null, "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", hardFailures, input.admissionRefs);

  const deployment = observations.filter((item) => item.kind === "LOVABLE_DEPLOYMENT");
  if (deployment.length !== 1) issues.push(deployment.length === 0 ? "lovable_deployment_evidence_missing" : "duplicate_lovable_deployment_evidence");
  let verifier: Sec003RetirementDecision["verifierRetirement"] = "UNKNOWN";
  if (deployment.length === 1) {
    const data = deployment[0].data;
    const valid = data.deploymentAuthority === "AUTHORIZED_LOVABLE_PROJECT"
      && data.deployedCommit === input.expectedCandidateCommit
      && data.gatewayState === "RETIRED_FAIL_CLOSED"
      && data.syntheticLegacyRequestOutcome === "REJECTED_RETIRED"
      && data.httpStatus === 410
      && data.databaseLookupAttempted === false
      && data.learnerProvisioningAttempted === false
      && data.learnerTokenMintingAttempted === false
      && data.downstreamForwardingAttempted === false
      && nonEmpty(data.deploymentEvidenceRef)
      && nonEmpty(data.resultingStateEvidenceRef);
    if (valid) verifier = "VERIFIED"; else issues.push("deployed_verifier_retirement_unproven");
  }

  const database = observations.filter((item) => item.kind === "DATABASE_RETIREMENT");
  if (database.length !== 1) issues.push(database.length === 0 ? "database_retirement_evidence_missing" : "duplicate_database_retirement_evidence");
  let databaseState: Sec003RetirementDecision["databaseRetirement"] = "UNKNOWN";
  if (database.length === 1) {
    const data = database[0].data;
    const outcome = String(data.outcome);
    const presentValid = outcome === "TABLE_PRESENT_ALL_INACTIVE" && data.activeRowsAfter === 0 && Number.isInteger(data.retiredRows) && Number(data.retiredRows) >= 0;
    const absentValid = outcome === "TABLE_ABSENT" && data.activeRowsAfter === null && data.retiredRows === 0;
    if (data.migrationIdentity === ALE_RETIREMENT_MIGRATION_ID && (presentValid || absentValid) && nonEmpty(data.migrationEvidenceRef)) databaseState = outcome as Sec003RetirementDecision["databaseRetirement"];
    else issues.push("database_retirement_unproven");
  }

  const dependency = observations.filter((item) => item.kind === "DEPENDENCY_PRESERVATION");
  if (dependency.length !== 1) issues.push(dependency.length === 0 ? "dependency_preservation_evidence_missing" : "duplicate_dependency_preservation_evidence");
  let internal: Sec003RetirementDecision["internalAdaptiveLearning"] = "UNKNOWN";
  let integration: Sec003RetirementDecision["dependentIntegration"] = "UNKNOWN";
  if (dependency.length === 1) {
    const data = dependency[0].data;
    if (data.internalAdaptiveLearningPreserved === true && data.internalCallsLegacyGateway === false && data.luminaCredentialSystemUnchanged === true && nonEmpty(data.evidenceRef)) internal = "PRESERVED";
    else issues.push("internal_adaptive_learning_preservation_unproven");
    if (data.externalIntegrationRequired === false && data.externalIntegrationStatus === "NOT_REQUIRED") integration = "NOT_REQUIRED";
    else issues.push("dependent_external_integration_unresolved");
  }

  const closed = verifier === "VERIFIED" && databaseState !== "UNKNOWN" && internal === "PRESERVED" && integration === "NOT_REQUIRED" && issues.length === 0;
  return closed
    ? result("CLOSED", "CONFIRMED_INVALID", verifier, databaseState, internal, integration, [], input.admissionRefs)
    : result("INSUFFICIENT_EVIDENCE", null, verifier, databaseState, internal, integration, issues, input.admissionRefs);
}

export function projectAleRetirementToR2Readiness(decision: Sec003RetirementDecision): "CONFIRMED_INVALID" | "OPEN" {
  return decision.decision === "CLOSED" && decision.closureState === "CONFIRMED_INVALID" ? "CONFIRMED_INVALID" : "OPEN";
}
