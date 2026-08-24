import { R2_HOST_ATTACK_FAMILIES, type ExpectedHostCandidate, type HostMutationBoundaryObservation, type HostObjectIdentity } from "./contracts";

export const EXPECTED_HOST_CANDIDATE: ExpectedHostCandidate = Object.freeze({
  commit: "0123456789abcdef0123456789abcdef01234567",
  capabilityVersion: "r2-a/1",
  schemaVersion: 1,
  evaluatorVersion: "r2-host-eval/1",
  environmentIdentity: "synthetic-host-vector-set-001",
  nowEpochMs: 10_000,
  maxEvidenceAgeMs: 5_000,
  admittedRealHostObservationIds: [],
});

function objectIdentity(objectId: string): HostObjectIdentity {
  return { scheme: "HOST_STABLE_ID", volumeOrDevice: "fixture-volume", objectId };
}

export function safeSyntheticObservation(
  overrides: Partial<HostMutationBoundaryObservation> = {},
): HostMutationBoundaryObservation {
  return {
    schemaVersion: 1,
    observationId: "R2-HOST-SYNTHETIC-BASELINE",
    attackFamily: "BASELINE",
    evidenceKind: "SYNTHETIC_VECTOR",
    observerOwner: "R2_HOST_EVALUATOR",
    adapterOwner: "FUTURE_HOST_DRIVER",
    observedAtEpochMs: 9_000,
    candidate: {
      commit: EXPECTED_HOST_CANDIDATE.commit,
      capabilityVersion: EXPECTED_HOST_CANDIDATE.capabilityVersion,
      schemaVersion: 1,
      evaluatorVersion: EXPECTED_HOST_CANDIDATE.evaluatorVersion,
      environmentIdentity: EXPECTED_HOST_CANDIDATE.environmentIdentity,
    },
    capability: "PROVISION_SANDBOX",
    requestedOperation: "PROVISION_EMPTY_SANDBOX",
    authorizationDecision: "ALLOWED",
    canonicalApprovedRoot: "X:/omega-sandboxes",
    canonicalParent: "X:/omega-sandboxes",
    canonicalTarget: "X:/omega-sandboxes/task-001",
    resolvedTarget: "X:/omega-sandboxes/task-001",
    resolvedInsideApprovedRoot: true,
    targetExpectedAbsent: true,
    authorizedRootIdentity: objectIdentity("sandbox-root"),
    authorizedParentIdentity: objectIdentity("sandbox-root"),
    parentIdentityAtUse: objectIdentity("sandbox-root"),
    createdObjectIdentity: objectIdentity("sandbox-object"),
    objectIdentityAtUse: objectIdentity("sandbox-object"),
    repositoryIdentity: objectIdentity("repository-root"),
    mutationAttempted: true,
    actualChange: "EMPTY_DIRECTORY_CREATED",
    cleanupOutcome: "SUCCESS",
    terminalObjectExists: false,
    authorityRevoked: true,
    reusable: false,
    forbiddenActionsObserved: [],
    eventReferences: ["host-event://authorize", "host-event://identity", "host-event://provision", "host-event://cleanup", "host-event://verify"],
    semanticEventCount: 5,
    hashChainValid: true,
    ...overrides,
  };
}

export const COMPLETE_SYNTHETIC_ATTACK_FAMILY = Object.freeze(
  R2_HOST_ATTACK_FAMILIES.map((attackFamily, index) => safeSyntheticObservation({
    observationId: `R2-HOST-SYNTHETIC-${String(index).padStart(2, "0")}`,
    attackFamily,
  })),
);
