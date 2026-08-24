import { verifyAdmittedEvidence } from "../evidence-custody/custodian";
import type { JsonValue } from "../evidence-custody/contracts";
import type { CustodyAdmissionEnvelope } from "../registry-evidence-bridge/bridge";
import {
  SEC003_CLOSURE_STATES,
  SEC003_PARTIAL_SUBSTATES,
  type Sec003ClosureDecision,
  type Sec003ClosurePackage,
  type Sec003ClosureState,
  type Sec003ObservationKind,
  type Sec003PartialSubstate,
} from "./contracts";

const EVIDENCE_RANK = Object.freeze({ E0: 0, E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 } as const);
const REQUIRED_TIPS = Object.freeze(["origin/main", "origin/sol/w0-rs-1-truth-map"]);

type DataObject = Readonly<Record<string, JsonValue>>;
interface Observation {
  readonly envelope: CustodyAdmissionEnvelope;
  readonly kind: Sec003ObservationKind;
  readonly closureId: string;
  readonly projectRef: string;
  readonly secretMaterialIncluded: boolean;
  readonly data: DataObject;
}

function object(value: JsonValue): DataObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DataObject : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseObservation(envelope: CustodyAdmissionEnvelope): Observation | null {
  const payload = object(envelope.artifact.payload);
  if (!payload || payload.schemaVersion !== 1 || !nonEmpty(payload.closureId) || !nonEmpty(payload.projectRef)) return null;
  if (!["MANAGEMENT_CREDENTIAL", "DEPENDENT_INTEGRATION", "REMOTE_TIP", "HISTORY_POLICY"].includes(String(payload.kind))) return null;
  if (typeof payload.secretMaterialIncluded !== "boolean") return null;
  const data = object(payload.data);
  if (!data) return null;
  return {
    envelope,
    kind: payload.kind as Sec003ObservationKind,
    closureId: payload.closureId,
    projectRef: payload.projectRef,
    secretMaterialIncluded: payload.secretMaterialIncluded,
    data,
  };
}

function minimumClass(kind: Sec003ObservationKind): keyof typeof EVIDENCE_RANK {
  return kind === "MANAGEMENT_CREDENTIAL" ? "E4" : "E3";
}

function stateMap(): Map<Sec003PartialSubstate, { status: "SUPPORTED" | "UNKNOWN" | "REFUTED"; refs: string[] }> {
  return new Map(SEC003_PARTIAL_SUBSTATES.map((substate) => [substate, { status: "UNKNOWN", refs: [] }]));
}

function support(states: ReturnType<typeof stateMap>, substate: Sec003PartialSubstate, ref: string): void {
  states.set(substate, { status: "SUPPORTED", refs: [ref] });
}

function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

function result(
  decision: Sec003ClosureDecision["decision"],
  closureState: Sec003ClosureState | null,
  credentialContainment: Sec003ClosureDecision["credentialContainment"],
  repositoryExposureRemediation: Sec003ClosureDecision["repositoryExposureRemediation"],
  states: ReturnType<typeof stateMap>,
  issues: readonly string[],
  evidenceRefs: readonly string[],
): Sec003ClosureDecision {
  return Object.freeze({
    decision,
    closureState,
    credentialContainment,
    repositoryExposureRemediation,
    substates: SEC003_PARTIAL_SUBSTATES.map((substate) => ({ substate, status: states.get(substate)!.status, evidenceRefs: states.get(substate)!.refs })),
    issues: unique(issues),
    evidenceRefs: unique(evidenceRefs),
    grantsAuthority: false,
    containsSecretMaterial: false,
  });
}

export function evaluateSec003Closure(input: Sec003ClosurePackage): Sec003ClosureDecision {
  const issues: string[] = [];
  const hardFailures: string[] = [];
  const states = stateMap();
  if (input.schemaVersion !== 1 || !nonEmpty(input.closureId) || !nonEmpty(input.expectedProjectRef) || !nonEmpty(input.credentialRecordIdentity)) {
    return result("REJECTED", null, "UNKNOWN", "OPEN", states, ["malformed_closure_identity"], [],);
  }
  if (!SEC003_CLOSURE_STATES.includes(input.requestedClosureState)) hardFailures.push("unsupported_closure_state");
  if (input.admissionRefs.length === 0) issues.push("custody_admission_required");
  if (unique(input.admissionRefs).length !== input.admissionRefs.length) hardFailures.push("duplicate_admission_reference");
  const envelopes = input.admissionRefs.map((ref) => input.admissions.find((item) => item.record.admissionRef === ref));
  if (envelopes.some((item) => item === undefined)) hardFailures.push("admission_reference_not_found");
  if (hardFailures.length > 0) return result("REJECTED", null, "UNKNOWN", "OPEN", states, hardFailures, input.admissionRefs);

  const observations: Observation[] = [];
  for (const envelope of envelopes as CustodyAdmissionEnvelope[]) {
    const verified = verifyAdmittedEvidence(envelope.record, envelope.artifact, envelope.policy);
    if (!verified.ok) hardFailures.push(...verified.issues.map((issue) => `custody_${issue}`));
    const observation = parseObservation(envelope);
    if (!observation) { hardFailures.push("malformed_sec003_observation"); continue; }
    observations.push(observation);
    if (observation.closureId !== input.closureId) hardFailures.push("closure_identity_mismatch");
    if (observation.projectRef !== input.expectedProjectRef) hardFailures.push("wrong_supabase_project");
    if (observation.secretMaterialIncluded) hardFailures.push("secret_material_prohibited");
    const evidenceClass = envelope.record.independence.evidenceClass;
    if (EVIDENCE_RANK[evidenceClass] < EVIDENCE_RANK[minimumClass(observation.kind)]) issues.push(`evidence_class_below_requirement:${observation.kind}`);
  }
  if (hardFailures.length > 0) return result("REJECTED", null, "UNKNOWN", "OPEN", states, hardFailures, input.admissionRefs);
  if (observations.length > 0) support(states, "PROJECT_IDENTIFIED", input.admissionRefs[0]);

  const management = observations.filter((item) => item.kind === "MANAGEMENT_CREDENTIAL");
  if (management.length !== 1) issues.push(management.length === 0 ? "management_evidence_missing" : "duplicate_management_evidence");
  let containment: Sec003ClosureDecision["credentialContainment"] = management.length > 0 ? "PARTIAL" : "UNKNOWN";
  if (management.length === 1) {
    const observation = management[0];
    const data = observation.data;
    const ref = observation.envelope.record.admissionRef;
    if (data.managementAccess === "AUTHORIZED" && nonEmpty(data.managementContextRef) && nonEmpty(data.operatorIdentity)) support(states, "MANAGEMENT_ACCESS_OBTAINED", ref);
    else issues.push("authorized_management_context_missing");
    if (data.credentialRecordIdentity === input.credentialRecordIdentity && data.credentialIdentityIsSecret === false) support(states, "CREDENTIAL_RECORD_IDENTIFIED", ref);
    else hardFailures.push("credential_record_identity_mismatch_or_secret");
    if (nonEmpty(data.priorState)) support(states, "VALIDITY_ESTABLISHED", ref); else issues.push("credential_prior_state_missing");
    const usageAcceptable = ["REVIEWED_NO_SUSPICIOUS_USE", "REVIEWED_SUSPICIOUS_USE_ESCALATED", "UNAVAILABLE_DOCUMENTED"].includes(String(data.usageReview));
    if (usageAcceptable && nonEmpty(data.usageEvidenceRef)) support(states, "USAGE_REVIEWED", ref); else issues.push("usage_review_incomplete");
    if (data.usageReview === "REVIEWED_SUSPICIOUS_USE_ESCALATED" && !nonEmpty(data.incidentResponseRef)) issues.push("suspicious_usage_without_incident_response");

    const expectedAction = input.requestedClosureState === "REVOKED_AND_VERIFIED" ? "REVOKE"
      : input.requestedClosureState === "ROTATED_AND_VERIFIED" ? "ROTATE" : "CONFIRM_INVALID";
    const expectedState = input.requestedClosureState === "REVOKED_AND_VERIFIED" ? "REVOKED"
      : input.requestedClosureState === "ROTATED_AND_VERIFIED" ? "ROTATED" : "INVALID";
    const destructive = expectedAction !== "CONFIRM_INVALID";
    if (!destructive || nonEmpty(data.operatorAuthorizationRef)) support(states, "REVOCATION_AUTHORIZED", ref); else issues.push("destructive_action_authorization_missing");
    const actionAt = Number(data.actionAtEpochMs);
    const verifiedAt = Number(data.verifiedAtEpochMs);
    if (data.action === expectedAction && Number.isSafeInteger(actionAt) && actionAt >= 0) support(states, "REVOCATION_EXECUTED", ref);
    else hardFailures.push("containment_action_mismatch");
    if (data.resultingState === expectedState && Number.isSafeInteger(verifiedAt) && verifiedAt >= actionAt && nonEmpty(data.resultingStateEvidenceRef)) {
      support(states, "REVOCATION_VERIFIED", ref);
    } else hardFailures.push("resulting_state_or_order_invalid");
    if (hardFailures.length === 0 && states.get("MANAGEMENT_ACCESS_OBTAINED")!.status === "SUPPORTED"
      && states.get("CREDENTIAL_RECORD_IDENTIFIED")!.status === "SUPPORTED"
      && states.get("VALIDITY_ESTABLISHED")!.status === "SUPPORTED"
      && states.get("USAGE_REVIEWED")!.status === "SUPPORTED"
      && states.get("REVOCATION_AUTHORIZED")!.status === "SUPPORTED"
      && states.get("REVOCATION_EXECUTED")!.status === "SUPPORTED"
      && states.get("REVOCATION_VERIFIED")!.status === "SUPPORTED") containment = input.requestedClosureState;
  }

  const integrations = observations.filter((item) => item.kind === "DEPENDENT_INTEGRATION");
  if (integrations.length !== 1) issues.push(integrations.length === 0 ? "dependent_integration_evidence_missing" : "duplicate_dependent_integration_evidence");
  if (integrations.length === 1) {
    const data = integrations[0].data;
    const acceptable = data.integrationRequired === false && data.status === "NOT_REQUIRED"
      || data.integrationRequired === true && data.status === "ROTATED_AND_VERIFIED";
    if (acceptable && nonEmpty(data.evidenceRef)) support(states, "DEPENDENCIES_ROTATED", integrations[0].envelope.record.admissionRef);
    else issues.push("dependent_integration_unresolved");
  }

  const tipObservations = observations.filter((item) => item.kind === "REMOTE_TIP");
  const tipStates = new Map<string, Observation>();
  for (const observation of tipObservations) {
    const tip = String(observation.data.tip);
    if (tipStates.has(tip)) hardFailures.push(`duplicate_remote_tip:${tip}`);
    tipStates.set(tip, observation);
  }
  const tipsRedacted = REQUIRED_TIPS.every((tip) => {
    const observation = tipStates.get(tip);
    return observation?.data.status === "REDACTED" && nonEmpty(observation.data.evidenceRef);
  });
  if (tipsRedacted) support(states, "REMOTE_TIPS_REDACTED", ...[tipStates.get(REQUIRED_TIPS[0])!.envelope.record.admissionRef]);
  else issues.push("remote_tip_remediation_incomplete");

  const history = observations.filter((item) => item.kind === "HISTORY_POLICY");
  const historyDecided = history.length === 1
    && ["NO_REWRITE_WITH_RATIONALE", "COORDINATED_REWRITE_APPROVED"].includes(String(history[0].data.decision))
    && nonEmpty(history[0].data.decisionEvidenceRef);
  if (!historyDecided) issues.push("history_policy_undecided");
  const repositoryExposure: Sec003ClosureDecision["repositoryExposureRemediation"] = tipsRedacted && historyDecided
    ? "REMEDIATED" : tipObservations.length > 0 || history.length > 0 ? "PARTIAL" : "OPEN";

  if (hardFailures.length > 0) return result("REJECTED", null, containment, repositoryExposure, states, hardFailures, input.admissionRefs);
  const fullyClosed = containment === input.requestedClosureState
    && states.get("DEPENDENCIES_ROTATED")!.status === "SUPPORTED"
    && repositoryExposure === "REMEDIATED"
    && issues.length === 0;
  return fullyClosed
    ? result("CLOSED", input.requestedClosureState, containment, repositoryExposure, states, [], input.admissionRefs)
    : result("INSUFFICIENT_EVIDENCE", null, containment, repositoryExposure, states, issues, input.admissionRefs);
}

export function projectSec003ClosureToReadiness(decision: Sec003ClosureDecision): Sec003ClosureState | "OPEN" {
  return decision.decision === "CLOSED" && decision.closureState !== null ? decision.closureState : "OPEN";
}
