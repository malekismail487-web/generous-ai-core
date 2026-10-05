import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NyxChatSession, type NyxChatModel } from "../../../src/lib/codelab/cli/nyxChatSession";
import { nyxCanonical, nyxContainsSecretLike, nyxSha256 } from "../../../src/lib/codelab/cli/nyxChatProtocol";
import { NyxIsolatedContainerHost, type NyxContainerDriver } from "../../../src/lib/codelab/executor/nyxContainerExecution";
import { ReadOnlyRepositoryExecutor } from "../../../src/lib/codelab/executor/readOnlyExecutor";
import type { NvidiaNimEvidence } from "../../../src/lib/codelab/model/nvidiaNimProvider";
import { textInferenceUsage } from "./nyxTextBenchmark";

/** Host harness input, never a model-created capability token. Existing container admission remains mandatory. */
export interface NyxHarborTaskRequest {
  readonly schemaVersion: 1;
  readonly candidate: string;
  readonly taskIdentity: string;
  readonly instruction: string;
  readonly containerId: string;
  readonly imageId: string;
  readonly owner: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}
export const NYX_HARBOR_BRIDGE_POLICY = Object.freeze({version: "nyx-harbor-existing-substrate/1",
  model: "nvidia/nemotron-3-ultra-550b-a55b", maxModelCalls: 12, maxOutputTokens: 4096,
  maxTurnMs: 300000, maxCommands: 12, commandMs: 10000,
  independentVerifier: "HARBOR_AFTER_NYX_LEASE_REVOCATION", containerProfile: "EXISTING_PRIVATE_OFFLINE_PROFILE_ONLY",
  automaticProfileRelaxation: false, hostAuthority: false, productionAuthority: false});

export function parseNyxHarborTaskRequest(raw: unknown, now = Date.now()): NyxHarborTaskRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("harbor_request_shape_invalid");
  const value = raw as Record<string, unknown>;
  const keys = ["schemaVersion", "candidate", "taskIdentity", "instruction", "containerId", "imageId", "owner",
    "issuedAtEpochMs", "expiresAtEpochMs"];
  if (!Number.isSafeInteger(now) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))
    || value.schemaVersion !== 1 || typeof value.candidate !== "string" || !/^[a-f0-9]{40}$/.test(value.candidate)
    || typeof value.taskIdentity !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.taskIdentity)
    || typeof value.instruction !== "string" || !value.instruction.trim() || value.instruction.length > 8000
    || nyxContainsSecretLike(value.instruction) || typeof value.containerId !== "string" || !/^[a-f0-9]{64}$/.test(value.containerId)
    || typeof value.imageId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.imageId)
    || typeof value.owner !== "string" || !/^[a-f0-9]{32}$/.test(value.owner)
    || !Number.isSafeInteger(value.issuedAtEpochMs) || !Number.isSafeInteger(value.expiresAtEpochMs)
    || Number(value.issuedAtEpochMs) > now || Number(value.expiresAtEpochMs) <= now
    || Number(value.expiresAtEpochMs) - Number(value.issuedAtEpochMs) > NYX_HARBOR_BRIDGE_POLICY.maxTurnMs)
    throw Error("harbor_request_policy_invalid");
  return Object.freeze({...value}) as unknown as NyxHarborTaskRequest;
}

/** Composes the same NYX chat cognition, provider interface, Omega lease and execution driver used elsewhere. */
export async function runNyxHarborCandidate(raw: unknown, dependencies: {model: NyxChatModel; driver: NyxContainerDriver}) {
  const request = parseNyxHarborTaskRequest(raw), began = Date.now();
  const root = await mkdtemp(join(tmpdir(), "nyx-harbor-no-source-authority-"));
  let reader: ReadOnlyRepositoryExecutor | null = null;
  let host: NyxIsolatedContainerHost | null = null;
  const evidence: NvidiaNimEvidence[] = [];
  try {
    host = await NyxIsolatedContainerHost.create({...request, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
      maxCommands: NYX_HARBOR_BRIDGE_POLICY.maxCommands, commandMs: NYX_HARBOR_BRIDGE_POLICY.commandMs,
      driver: dependencies.driver});
    reader = await ReadOnlyRepositoryExecutor.create({executorId: `HARBOR-${request.taskIdentity}`,
      tokenId: `HARBOR-R1-${request.taskIdentity}`, repositoryRoot: root, resourceScopes: ["."],
      issuedAtEpochMs: request.issuedAtEpochMs, expiresAtEpochMs: request.expiresAtEpochMs,
      constraints: {maxFileBytes: 1, maxDirectoryEntries: 1, allowedExtensions: [".txt"]},
      issuer: "NYX-HARBOR-ISOLATED-HARNESS", auditIdentity: `HARBOR-AUDIT-${request.taskIdentity}`});
    reader.terminate(Date.now(), "NO_HOST_REPOSITORY_AUTHORITY_IN_HARBOR_AGENT");
    const remaining = request.expiresAtEpochMs - Date.now();
    if (remaining < 1000) throw Error("harbor_lease_expired_before_cognition");
    const result = await NyxChatSession.create({sessionId: `HARBOR-${request.taskIdentity}`,
      model: {complete: async input => {
        const response = await dependencies.model.complete(input); evidence.push(response.evidence); return response;
      }}, reader, computerHost: host, candidateWriter: null, editablePaths: [],
      maxModelCallsPerTurn: NYX_HARBOR_BRIDGE_POLICY.maxModelCalls, maxCandidatesPerTurn: 0,
      maxTurnMs: Math.min(remaining, NYX_HARBOR_BRIDGE_POLICY.maxTurnMs), maxOutputTokens: NYX_HARBOR_BRIDGE_POLICY.maxOutputTokens
    }).turn(request.instruction);
    host.revoke(); // Official hidden tests run only after cognition can no longer mutate the task container.
    const audit = host.auditLog();
    const usage = textInferenceUsage(evidence, Date.now() - began);
    const unobservedLogicalCalls = result.modelCalls - evidence.length;
    const fullyReported = usage.unknownUsageCalls === 0 && unobservedLogicalCalls === 0;
    return Object.freeze({schemaVersion: 1, identity: "NYX-HARBOR-EXISTING-SUBSTRATE-CANDIDATE-001",
      candidate: request.candidate, taskIdentity: request.taskIdentity, instructionDigest: nyxSha256(request.instruction),
      policy: NYX_HARBOR_BRIDGE_POLICY, outcome: result.outcome, finalMessageDigest: nyxSha256(result.message),
      containerIdentityDigest: nyxSha256(request.containerId), modelCalls: result.modelCalls,
      usage: {...usage, unobservedLogicalCalls, toolCalls: audit.filter(event => event.toolAction !== null).length},
      inputTokens: fullyReported && evidence.every(item => item.usage.promptTokens !== null)
        ? evidence.reduce((sum, item) => sum + item.usage.promptTokens!, 0) : null,
      outputTokens: fullyReported && evidence.every(item => item.usage.completionTokens !== null)
        ? evidence.reduce((sum, item) => sum + item.usage.completionTokens!, 0) : null,
      modelEvidence: evidence, events: result.events, audit,
      auditDigest: nyxSha256(nyxCanonical(audit)), leaseRevoked: !host.containerExecAvailable,
      officialVerification: "NOT_EXECUTED_BY_AGENT", taskSuccessClaimed: false,
      cognitionEvidence: evidence.some(item => item.evidenceClass === "E4") ? "LIVE_NVIDIA_OBSERVED" : "LOCAL_OR_TEST_DOUBLE",
      cognitiveGain: false,
      sourceRepositoryMutation: false, hostAuthority: false, generalNetworkAuthority: false, productionAuthority: false});
  } finally {
    host?.revoke(); reader?.terminate(Date.now(), "HARBOR_CANDIDATE_FINISHED");
    // This exact fresh directory was never exposed to cognition, mounted, or populated from untrusted data.
    await rm(root, {recursive: true});
  }
}
