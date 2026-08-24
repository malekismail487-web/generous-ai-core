import type { CustodyAdmissionEnvelope } from "../registry-evidence-bridge/bridge";

export const SEC003_CLOSURE_STATES = Object.freeze(["REVOKED_AND_VERIFIED", "ROTATED_AND_VERIFIED", "CONFIRMED_INVALID"] as const);
export type Sec003ClosureState = (typeof SEC003_CLOSURE_STATES)[number];

export const SEC003_PARTIAL_SUBSTATES = Object.freeze([
  "PROJECT_IDENTIFIED",
  "MANAGEMENT_ACCESS_OBTAINED",
  "CREDENTIAL_RECORD_IDENTIFIED",
  "VALIDITY_ESTABLISHED",
  "USAGE_REVIEWED",
  "REVOCATION_AUTHORIZED",
  "REVOCATION_EXECUTED",
  "REVOCATION_VERIFIED",
  "DEPENDENCIES_ROTATED",
  "REMOTE_TIPS_REDACTED",
] as const);
export type Sec003PartialSubstate = (typeof SEC003_PARTIAL_SUBSTATES)[number];

export type Sec003ObservationKind = "MANAGEMENT_CREDENTIAL" | "DEPENDENT_INTEGRATION" | "REMOTE_TIP" | "HISTORY_POLICY";

export interface Sec003ClosurePackage {
  readonly schemaVersion: 1;
  readonly closureId: string;
  readonly expectedProjectRef: string;
  readonly credentialRecordIdentity: string;
  readonly requestedClosureState: Sec003ClosureState;
  readonly admissionRefs: readonly string[];
  readonly admissions: readonly CustodyAdmissionEnvelope[];
}

export interface Sec003SubstateResult {
  readonly substate: Sec003PartialSubstate;
  readonly status: "SUPPORTED" | "UNKNOWN" | "REFUTED";
  readonly evidenceRefs: readonly string[];
}

export interface Sec003ClosureDecision {
  readonly decision: "CLOSED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  readonly closureState: Sec003ClosureState | null;
  readonly credentialContainment: Sec003ClosureState | "PARTIAL" | "UNKNOWN";
  readonly repositoryExposureRemediation: "REMEDIATED" | "PARTIAL" | "OPEN";
  readonly substates: readonly Sec003SubstateResult[];
  readonly issues: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly grantsAuthority: false;
  readonly containsSecretMaterial: false;
}
