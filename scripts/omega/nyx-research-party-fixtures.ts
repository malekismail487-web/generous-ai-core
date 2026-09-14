import { immutableResearchValue, type ResearchPartyObjective } from "../../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export interface NyxResearchPartyLiveTask {
  readonly taskId: string;
  readonly expectedMechanismId: string;
  readonly oracleProvenanceRoot: string;
  readonly objective: (candidateBinding: string, now: number) => ResearchPartyObjective;
  readonly outcome: (experimentId: string) => string;
  readonly oracleDigest: string;
}

function sourceEvidence(candidateBinding: string, now: number, taskId: string, summary: string) {
  return immutableResearchValue({ evidenceId: `${taskId}-SOURCE`, evidenceClass: "E3" as const, kind: "SOURCE" as const,
    summary, contentDigest: theoryDigest(summary), provenanceRoot: `${taskId}-FIXTURE-SOURCE`,
    freshnessDependencies: [`CANDIDATE:${candidateBinding}`], observedAtEpochMs: now, candidateBinding,
    grantsAuthority: false as const });
}

function requirementEvidence(candidateBinding: string, now: number, taskId: string, summary: string) {
  return immutableResearchValue({ evidenceId: `${taskId}-REQUIREMENT`, evidenceClass: "E3" as const,
    kind: "REQUIREMENT" as const, summary, contentDigest: theoryDigest(summary),
    provenanceRoot: `${taskId}-HOLDOUT-REQUIREMENT`, freshnessDependencies: [`CANDIDATE:${candidateBinding}`],
    observedAtEpochMs: now, candidateBinding, grantsAuthority: false as const });
}

function task(input: Omit<NyxResearchPartyLiveTask, "oracleDigest">): NyxResearchPartyLiveTask {
  const outcomes = ["A", "B", "C"].map((suffix) => {
    try { return [suffix, input.outcome(`${input.taskId}-EXP-${suffix}`)]; }
    catch { return [suffix, "NOT_DEFINED"]; }
  });
  return Object.freeze({ ...input,
    oracleDigest: theoryDigest({ taskId: input.taskId, expectedMechanismId: input.expectedMechanismId, outcomes }) });
}

const scheduler = task({ taskId: "NYX-LIVE-SCHEDULER", expectedMechanismId: "FAILED_AS_COMPLETE",
  oracleProvenanceRoot: "NYX-HIDDEN-SCHEDULER-ORACLE",
  objective: (candidateBinding, now) => immutableResearchValue({ schemaVersion: 1,
    researchId: "NYX-LIVE-SCHEDULER", objective: "Diagnose which prerequisite state is incorrectly admitted by a scheduler's compact readiness classifier.",
    domain: "SOFTWARE", candidateBinding, scope: ["scheduler/readiness.ts"], mechanismCatalog: [
      { mechanismId: "STRICT", description: "Only COMPLETED prerequisites permit dependent dispatch." },
      { mechanismId: "PENDING_AS_COMPLETE", description: "PENDING prerequisites are incorrectly treated as completed." },
      { mechanismId: "FAILED_AS_COMPLETE", description: "FAILED prerequisites are incorrectly treated as completed." },
      { mechanismId: "CANCELLED_AS_COMPLETE", description: "CANCELLED prerequisites are incorrectly treated as completed." },
    ], admittedEvidence: [
      requirementEvidence(candidateBinding, now, "NYX-LIVE-SCHEDULER", "Dependents must run only after every prerequisite completes successfully."),
      sourceEvidence(candidateBinding, now, "NYX-LIVE-SCHEDULER", "A compact terminal-state classifier was introduced. A dependent occasionally dispatches after a terminal but unsuccessful predecessor; logs do not identify which terminal state."),
    ], experimentCatalog: [
      { experimentId: "NYX-LIVE-SCHEDULER-EXP-A", toolId: "SCHEDULER-FAILED-PROBE",
        question: "Run a dependent behind one FAILED prerequisite.", possibleOutcomes: ["BLOCKED", "DISPATCHED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["scheduler/readiness.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-SCHEDULER-EXP-B", toolId: "SCHEDULER-CANCELLED-PROBE",
        question: "Run a dependent behind one CANCELLED prerequisite.", possibleOutcomes: ["BLOCKED", "DISPATCHED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["scheduler/readiness.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-SCHEDULER-EXP-C", toolId: "SCHEDULER-PENDING-PROBE",
        question: "Run a dependent behind one PENDING prerequisite.", possibleOutcomes: ["BLOCKED", "DISPATCHED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["scheduler/readiness.ts"], mutatesCandidate: false },
    ], successCriteria: ["Identify one mechanism consistent with every executed readiness probe."],
    expiryEpochMs: now + 20 * 60_000 }),
  outcome: (experimentId) => experimentId.endsWith("EXP-A") ? "DISPATCHED" : "BLOCKED" });

const cache = task({ taskId: "NYX-LIVE-CACHE", expectedMechanismId: "TENANT_OMITTED",
  oracleProvenanceRoot: "NYX-HIDDEN-CACHE-ORACLE",
  objective: (candidateBinding, now) => immutableResearchValue({ schemaVersion: 1,
    researchId: "NYX-LIVE-CACHE", objective: "Diagnose which identity dimension is absent from a refactored distributed-cache key.",
    domain: "SOFTWARE", candidateBinding, scope: ["cache/key.ts"], mechanismCatalog: [
      { mechanismId: "STRICT", description: "Tenant, namespace, and schema version all participate in cache identity." },
      { mechanismId: "TENANT_OMITTED", description: "Tenant identity is omitted, causing otherwise identical tenants to collide." },
      { mechanismId: "NAMESPACE_OMITTED", description: "Namespace is omitted, causing different logical collections to collide." },
      { mechanismId: "VERSION_OMITTED", description: "Schema version is omitted, causing incompatible representations to collide." },
    ], admittedEvidence: [
      requirementEvidence(candidateBinding, now, "NYX-LIVE-CACHE", "Cache identities must isolate tenant, namespace, and schema version."),
      sourceEvidence(candidateBinding, now, "NYX-LIVE-CACHE", "A bit-packed composite-key refactor is followed by rare cross-request cache hits. Telemetry proves one identity dimension is absent but redacts which dimension."),
    ], experimentCatalog: [
      { experimentId: "NYX-LIVE-CACHE-EXP-A", toolId: "CACHE-TENANT-ISOLATION",
        question: "Compare otherwise identical requests from two tenants.", possibleOutcomes: ["ISOLATED", "COLLISION"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["cache/key.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-CACHE-EXP-B", toolId: "CACHE-NAMESPACE-ISOLATION",
        question: "Compare otherwise identical requests from two namespaces.", possibleOutcomes: ["ISOLATED", "COLLISION"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["cache/key.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-CACHE-EXP-C", toolId: "CACHE-VERSION-ISOLATION",
        question: "Compare otherwise identical requests under two schema versions.", possibleOutcomes: ["ISOLATED", "COLLISION"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["cache/key.ts"], mutatesCandidate: false },
    ], successCriteria: ["Identify one omitted identity dimension consistent with every executed isolation probe."],
    expiryEpochMs: now + 20 * 60_000 }),
  outcome: (experimentId) => experimentId.endsWith("EXP-A") ? "COLLISION" : "ISOLATED" });

const retry = task({ taskId: "NYX-LIVE-RETRY", expectedMechanismId: "AUTH_RETRIED",
  oracleProvenanceRoot: "NYX-HIDDEN-RETRY-ORACLE",
  objective: (candidateBinding, now) => immutableResearchValue({ schemaVersion: 1,
    researchId: "NYX-LIVE-RETRY", objective: "Diagnose which terminal HTTP response family a retry classifier incorrectly treats as transient.",
    domain: "SOFTWARE", candidateBinding, scope: ["transport/retryPolicy.ts"], mechanismCatalog: [
      { mechanismId: "STRICT", description: "Only rate-limit and server-unavailable responses are retried." },
      { mechanismId: "AUTH_RETRIED", description: "Authentication failures are incorrectly treated as retryable." },
      { mechanismId: "VALIDATION_RETRIED", description: "Client validation failures are incorrectly treated as retryable." },
      { mechanismId: "SUCCESS_RETRIED", description: "Successful no-content responses are incorrectly treated as retryable." },
    ], admittedEvidence: [
      requirementEvidence(candidateBinding, now, "NYX-LIVE-RETRY", "Permanent client/authentication responses and successful responses must not be retried."),
      sourceEvidence(candidateBinding, now, "NYX-LIVE-RETRY", "After response-family consolidation, telemetry shows one deterministic terminal response family causing repeated requests; the status family was redacted."),
    ], experimentCatalog: [
      { experimentId: "NYX-LIVE-RETRY-EXP-A", toolId: "RETRY-AUTH-PROBE",
        question: "Observe attempt count for an authentication failure.", possibleOutcomes: ["SINGLE_ATTEMPT", "RETRIED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["transport/retryPolicy.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-RETRY-EXP-B", toolId: "RETRY-VALIDATION-PROBE",
        question: "Observe attempt count for a validation failure.", possibleOutcomes: ["SINGLE_ATTEMPT", "RETRIED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["transport/retryPolicy.ts"], mutatesCandidate: false },
      { experimentId: "NYX-LIVE-RETRY-EXP-C", toolId: "RETRY-SUCCESS-PROBE",
        question: "Observe attempt count for a successful no-content response.", possibleOutcomes: ["SINGLE_ATTEMPT", "RETRIED"],
        costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["transport/retryPolicy.ts"], mutatesCandidate: false },
    ], successCriteria: ["Identify one retry-classification mechanism consistent with every executed attempt-count probe."],
    expiryEpochMs: now + 20 * 60_000 }),
  outcome: (experimentId) => experimentId.endsWith("EXP-A") ? "RETRIED" : "SINGLE_ATTEMPT" });

export const NYX_RESEARCH_PARTY_LIVE_TASKS = Object.freeze([scheduler, cache, retry]);
