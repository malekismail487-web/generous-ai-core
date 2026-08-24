import { ReadOnlyRepositoryExecutor } from "../../../src/lib/codelab/executor/readOnlyExecutor";
import type { RepositoryObservation } from "../../../src/lib/codelab/executor/types";
import { EvidenceCustodySession, computeAuthoritativeEvidenceDigest } from "../evidence-custody/custodian";
import type { EvidenceArtifact, JsonValue } from "../evidence-custody/contracts";
import { assureReadOnlyVerticalSlice } from "./assurance";
import type {
  MaterialRepositoryClaim,
  ObservationClaimSelector,
  ReadOnlyObjectiveClaim,
  ReadOnlyVerticalSliceInput,
  ReadOnlyVerticalSliceResult,
  ReadOnlyVerticalSliceRun,
} from "./contracts";

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

function valueAtPath(value: unknown, path: readonly string[]): JsonValue | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === null || ["string", "number", "boolean"].includes(typeof current)) return current as JsonValue;
  return undefined;
}

function selectClaimValue(observation: RepositoryObservation, selector: ObservationClaimSelector): { value: JsonValue; state: MaterialRepositoryClaim["epistemicState"]; detail: string } {
  if (selector.kind === "RESOURCE_STATUS") {
    return { value: observation.status, state: observation.epistemicState === "SUPPORTED" ? "SUPPORTED" : observation.epistemicState === "UNKNOWN" ? "UNKNOWN" : "INSUFFICIENT_EVIDENCE", detail: `Resource status observed as ${observation.status}.` };
  }
  if (observation.status !== "OBSERVED" || observation.epistemicState !== "SUPPORTED") {
    return { value: null, state: observation.epistemicState === "UNKNOWN" ? "UNKNOWN" : "INSUFFICIENT_EVIDENCE", detail: `Source observation is ${observation.status}.` };
  }
  if (selector.kind === "FILE_SHA256") {
    return observation.contentSha256
      ? { value: observation.contentSha256, state: "SUPPORTED", detail: `Observed file SHA-256 ${observation.contentSha256}.` }
      : { value: null, state: "INSUFFICIENT_EVIDENCE", detail: "Observed resource did not provide a file digest." };
  }
  if (observation.content === null) return { value: null, state: "INSUFFICIENT_EVIDENCE", detail: "JSON field requires observed file content." };
  try {
    const selected = valueAtPath(JSON.parse(observation.content), selector.path);
    return selected === undefined
      ? { value: null, state: "UNKNOWN", detail: `JSON field ${selector.path.join(".")} was absent or non-primitive.` }
      : { value: selected, state: "SUPPORTED", detail: `Observed JSON field ${selector.path.join(".")} as ${JSON.stringify(selected)}.` };
  } catch {
    return { value: null, state: "INSUFFICIENT_EVIDENCE", detail: "Observed content was not valid JSON." };
  }
}

function validateInput(input: ReadOnlyVerticalSliceInput): void {
  if (input.schemaVersion !== 1 || !nonEmpty(input.objective.objectiveId) || !nonEmpty(input.objective.statement)) throw new Error("Objective identity and statement are required");
  if (!input.registry.capabilities.some((item) => item.canonicalId === input.objective.registryRecordId)
    && !input.registry.plans.some((item) => item.canonicalId === input.objective.registryRecordId)) throw new Error("Objective registry association is unknown");
  const requestIds = new Set(input.objective.requests.map((item) => item.requestId));
  if (requestIds.size !== input.objective.requests.length) throw new Error("Objective request identities must be unique");
  if (new Set(input.objective.claims.map((item) => item.claimId)).size !== input.objective.claims.length) throw new Error("Objective claim identities must be unique");
  if (input.objective.claims.some((item) => !requestIds.has(item.sourceRequestId))) throw new Error("Every claim requires a declared source request");
  const candidate = input.admissionPolicy.expectedCandidate;
  if (candidate.commit !== input.candidate.commit || candidate.capabilityVersion !== input.candidate.capabilityVersion
    || candidate.environmentIdentity !== input.candidate.environmentIdentity) throw new Error("Admission policy candidate must exactly match the vertical-slice candidate");
}

function artifactFor(
  input: ReadOnlyVerticalSliceInput,
  claimSpec: ReadOnlyObjectiveClaim,
  claim: Omit<MaterialRepositoryClaim, "evidenceAdmissionRef" | "evidenceArtifactId">,
  artifactId: string,
): EvidenceArtifact {
  return {
    schemaVersion: 1,
    artifactId,
    evidenceType: "R1_REPOSITORY_OBSERVATION",
    source: `repository://${input.objective.objectiveId}/${claim.sourceResource}`,
    candidate: input.candidate,
    evaluatorVersion: input.evaluatorVersion,
    observedAtEpochMs: input.objective.requests.find((item) => item.requestId === claimSpec.sourceRequestId)!.observedAtEpochMs,
    independence: {
      evidenceClass: "E3",
      evidenceChannel: "r1-live-repository-observation",
      producerOwner: "R1-EXECUTOR",
      evaluatorOwner: "RO-VERTICAL-SLICE-ASSURANCE",
      oracleOwner: "NODE-JSON-AND-SHA256",
      implementationOwner: "R1-EXECUTOR",
      sharesImplementationHelpers: false,
      independenceBasis: "The claim selector and assurance checks consume the executor observation ledger without importing its path or authorization helpers.",
    },
    payload: {
      schemaVersion: 1,
      objectiveId: input.objective.objectiveId,
      claimId: claim.claimId,
      statement: claim.statement,
      value: claim.value,
      epistemicState: claim.epistemicState,
      observationId: claim.observationId,
      sourceRequestId: claim.sourceRequestId,
      sourceResource: claim.sourceResource,
      sourceContentSha256: claim.sourceContentSha256,
      registryRecordId: claim.registryRecordId,
      repositoryFingerprint: claim.repositoryFingerprint,
    },
  };
}

export async function runReadOnlyVerticalSlice(input: ReadOnlyVerticalSliceInput): Promise<ReadOnlyVerticalSliceResult> {
  validateInput(input);
  const executor = await ReadOnlyRepositoryExecutor.create(input.executor);
  const transactions = [];
  for (const request of input.objective.requests) {
    transactions.push(await executor.execute({ ...request, tokenId: input.executor.tokenId }));
  }
  const custody = new EvidenceCustodySession(input.admissionPolicy);
  const claims: MaterialRepositoryClaim[] = [];
  const admissions: ReadOnlyVerticalSliceRun["custody"][number][] = [];
  for (let index = 0; index < input.objective.claims.length; index += 1) {
    const spec = input.objective.claims[index];
    const transaction = transactions.find((item) => item.request.requestId === spec.sourceRequestId)!;
    const selected = selectClaimValue(transaction.observation, spec.selector);
    const base = {
      claimId: spec.claimId,
      statement: selected.detail,
      value: selected.value,
      epistemicState: selected.state,
      observationId: transaction.observation.observationId,
      sourceRequestId: spec.sourceRequestId,
      sourceResource: transaction.observation.resourcePath ?? transaction.request.resourcePath,
      sourceContentSha256: transaction.observation.contentSha256,
      repositoryFingerprint: input.candidate.commit,
      evaluatorVersion: input.evaluatorVersion,
      candidate: input.candidate,
      authorityScope: { repositoryRoot: executor.token.repositoryRoot, resourceScopes: executor.token.resourceScopes, operation: "READ_REPOSITORY" as const },
      registryRecordId: input.objective.registryRecordId,
    } satisfies Omit<MaterialRepositoryClaim, "evidenceAdmissionRef" | "evidenceArtifactId">;
    const artifact = artifactFor(input, spec, base, `RO-VS-EVIDENCE-${String(index + 1).padStart(3, "0")}`);
    const admission = custody.admit({ schemaVersion: 1, requestId: `RO-VS-ADMISSION-${index + 1}`, artifact, candidateClaimedDigest: computeAuthoritativeEvidenceDigest(artifact) });
    if (admission.decision !== "ADMIT") throw new Error(`Evidence custody rejected vertical-slice observation: ${admission.issues.join(",")}`);
    claims.push({ ...base, evidenceAdmissionRef: admission.record.admissionRef, evidenceArtifactId: artifact.artifactId });
    admissions.push({ record: admission.record, artifact });
  }

  const revocation = executor.terminate(input.terminatedAtEpochMs, "Read-only institutional objective concluded.");
  await executor.execute({
    requestId: "RO-VS-TERMINATION-PROBE",
    tokenId: input.executor.tokenId,
    action: "READ_METADATA",
    resourcePath: input.executor.resourceScopes[0] ?? ".",
    observedAtEpochMs: input.terminatedAtEpochMs,
  });
  const run: ReadOnlyVerticalSliceRun = {
    schemaVersion: 1,
    objective: input.objective,
    candidate: input.candidate,
    evaluatorVersion: input.evaluatorVersion,
    registry: input.registry,
    executorAudit: executor.auditLog(),
    revocation,
    custody: admissions,
    admissionPolicy: input.admissionPolicy,
    claims,
    registryAssociation: {
      registryRecordId: input.objective.registryRecordId,
      claimIds: claims.map((item) => item.claimId),
      admissionRefs: claims.map((item) => item.evidenceAdmissionRef),
      maturityChanged: false,
    },
    knownContradictions: input.knownContradictions,
    knownUnknowns: input.knownUnknowns,
  };
  const assurance = assureReadOnlyVerticalSlice(run);
  return {
    run,
    assurance,
    final: {
      objectiveId: input.objective.objectiveId,
      decision: assurance.decision,
      evidenceLinkedClaims: claims,
      statement: assurance.decision === "ACCEPT"
        ? "Objective concluded from custody-admitted R1 repository evidence."
        : assurance.decision === "REJECT" ? "Objective rejected by the independent R1 assurance checks." : "Objective remains unresolved because evidence is insufficient.",
    },
  };
}
