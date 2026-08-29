import type { R3BExecutionEvidence, R3BExecutionOutcome, R3BExecutionResult } from "../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import {
  R3_C_OBSERVATION_STATUS,
  observeEngineeringExecution,
  parseEngineeringDiagnostics,
  type EngineeringObservationRequest,
  type ExpectedEngineeringCandidateBinding,
} from "../src/lib/codelab/observation/r3EngineeringObservation";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;

const COMMIT = "a".repeat(40);
const TOOL_DIGEST = "b".repeat(64);
const PROPOSAL_DIGEST = "c".repeat(64);
const ENVIRONMENT = "local-win32-x64-node24";

function execution(outcome: R3BExecutionOutcome, overrides: Partial<R3BExecutionEvidence> = {}, reason?: string): R3BExecutionResult {
  const startedAtEpochMs = overrides.startedAtEpochMs ?? 1_000;
  const endedAtEpochMs = overrides.endedAtEpochMs ?? 1_010;
  const evidence: R3BExecutionEvidence = Object.freeze({ evidenceId: overrides.evidenceId ?? `R3B-EVIDENCE-${outcome}-${overrides.applicationId ?? "candidate"}`,
    evidenceClass: "E3", executionId: overrides.executionId ?? "EXECUTION-CANDIDATE", candidateCommit: overrides.candidateCommit ?? COMMIT,
    disposableRepositoryId: overrides.disposableRepositoryId ?? "DISPOSABLE-1", applicationId: overrides.applicationId ?? "APPLICATION-1",
    proposalDigest: overrides.proposalDigest ?? PROPOSAL_DIGEST, toolId: overrides.toolId ?? "TYPECHECK",
    toolKind: overrides.toolKind ?? "TYPECHECK", toolVersion: overrides.toolVersion ?? "fixture/1",
    toolIdentityDigest: overrides.toolIdentityDigest ?? TOOL_DIGEST, environmentIdentity: overrides.environmentIdentity ?? ENVIRONMENT,
    environment: overrides.environment ?? Object.freeze({ platform: "win32", architecture: "x64", nodeVersion: "v24.19.0",
      permissionModel: "NODE_PERMISSION_MODEL", networkAllowed: false, credentialEnvironmentForwarded: false,
      childProcessesAllowed: false, inheritedEnvironmentNames: Object.freeze(["CI", "NO_COLOR"]) }),
    startedAtEpochMs, endedAtEpochMs, durationMs: overrides.durationMs ?? endedAtEpochMs - startedAtEpochMs,
    exitCode: overrides.exitCode ?? (outcome === "PASS" ? 0 : 2), signal: overrides.signal ?? null,
    stdout: overrides.stdout ?? "", stderr: overrides.stderr ?? "", outputTruncated: overrides.outputTruncated ?? false,
    prestateManifestDigest: overrides.prestateManifestDigest ?? "d".repeat(64),
    poststateManifestDigest: overrides.poststateManifestDigest ?? "d".repeat(64), changedPaths: overrides.changedPaths ?? Object.freeze([]),
    unexpectedMutationPaths: overrides.unexpectedMutationPaths ?? Object.freeze([]),
    processTreeTerminationAttempted: overrides.processTreeTerminationAttempted ?? outcome === "TIMEOUT", outcome });
  return Object.freeze({ outcome, reason: reason ?? (outcome === "PASS" ? "engineering_tool_passed" : "engineering_tool_failed"),
    evidence, generalShellAuthority: false, sourceRepositoryWriteAuthority: false, networkAuthority: false,
    productionAuthority: false, authorityGranted: false });
}

function expected(candidate: R3BExecutionResult): ExpectedEngineeringCandidateBinding {
  const evidence = candidate.evidence;
  if (evidence.toolKind === "UNKNOWN") throw new Error("fixture_tool_kind_unknown");
  return { candidateCommit: evidence.candidateCommit, disposableRepositoryId: evidence.disposableRepositoryId,
    applicationId: evidence.applicationId, proposalDigest: evidence.proposalDigest, toolId: evidence.toolId,
    toolKind: evidence.toolKind, toolIdentityDigest: evidence.toolIdentityDigest, environmentIdentity: evidence.environmentIdentity };
}

function request(candidate: R3BExecutionResult, baseline: R3BExecutionResult | null,
  overrides: Partial<EngineeringObservationRequest> = {}): EngineeringObservationRequest {
  return { schemaVersion: 1, observationRequestId: "R3C-REQUEST-1", observerIdentity: "OMEGA-R3C-EVALUATOR",
    evaluatorVersion: "r3-c/1", expected: expected(candidate), candidate, baseline, observedAtEpochMs: 2_000, ...overrides };
}

{
  const candidate = execution("FAIL", { stderr: "src/candidate.ts(3,7): error TS2322: candidate failure", exitCode: 2 });
  const baseline = execution("PASS", { candidateCommit: "0".repeat(40), applicationId: "BASELINE-APP", proposalDigest: "1".repeat(64),
    executionId: "EXECUTION-BASELINE", evidenceId: "R3B-EVIDENCE-BASELINE-PASS", exitCode: 0 });
  const result = observeEngineeringExecution(request(candidate, baseline)); const observation = result.observation;
  check(result.decision === "OBSERVED" && observation?.state === "TYPECHECK_FAIL", "typecheck process failure becomes a structured TYPECHECK_FAIL state");
  check(observation?.diagnostics[0]?.file === "src/candidate.ts" && observation.diagnostics[0].line === 3
    && observation.diagnostics[0].column === 7 && observation.diagnostics[0].code === "TS2322", "TypeScript diagnostic is localized to file, line, column, and code");
  check(observation?.baselineComparison === "NEW_FAILURE" && observation.candidateAttribution === "LIKELY_CANDIDATE_ATTRIBUTABLE", "passing baseline plus failing candidate is classified as a likely candidate-attributable new failure");
  check(observation?.attributionConfidence === 0.8 && observation.unknowns.includes("single_baseline_comparison_cannot_exclude_flakiness"), "attribution retains calibrated uncertainty rather than claiming causality");
  check(observation?.candidateEvidenceId === candidate.evidence.evidenceId && observation.baselineEvidenceId === baseline.evidence.evidenceId, "observation preserves both candidate and baseline evidence provenance");
  check(observation?.candidateFailureSignature?.length === 64 && observation.grantsAuthority === false, "failure signature is stable and observation grants no authority");
}

{
  const stderr = "src/candidate.ts(3,7): error TS2322: candidate failure";
  const candidate = execution("FAIL", { stderr });
  const baseline = execution("FAIL", { stderr, candidateCommit: "0".repeat(40), applicationId: "BASELINE-APP",
    proposalDigest: "1".repeat(64), executionId: "BASELINE", evidenceId: "BASELINE-EVIDENCE" });
  const observation = observeEngineeringExecution(request(candidate, baseline)).observation;
  check(observation?.baselineComparison === "PREEXISTING_FAILURE"
    && observation.candidateAttribution === "PREEXISTING_NOT_CANDIDATE_ATTRIBUTABLE", "identical baseline failure is recognized as pre-existing");
  check(observation?.attributionConfidence === 0.95 && observation.epistemicState === "SUPPORTED", "pre-existing failure classification carries explicit bounded confidence");
}

{
  const candidate = execution("FAIL", { toolKind: "TEST", toolId: "TEST", stderr: "FAIL tests/widget.test.ts > handles edge case" });
  const baseline = execution("FAIL", { toolKind: "TEST", toolId: "TEST", stderr: "FAIL tests/widget.test.ts > different case",
    candidateCommit: "0".repeat(40), applicationId: "BASELINE", proposalDigest: "1".repeat(64), evidenceId: "BASELINE-DIFFERENT" });
  const observation = observeEngineeringExecution(request(candidate, baseline)).observation;
  check(observation?.state === "TEST_FAIL" && observation.diagnostics[0]?.category === "TEST", "test failure becomes TEST_FAIL with a structured failing-test diagnostic");
  check(observation?.baselineComparison === "CHANGED_FAILURE" && observation.candidateAttribution === "POSSIBLY_CANDIDATE_ATTRIBUTABLE", "different baseline and candidate failures remain only possibly attributable");
}

{
  const candidate = execution("PASS", { toolKind: "BUILD", toolId: "BUILD", exitCode: 0 });
  const baseline = execution("FAIL", { toolKind: "BUILD", toolId: "BUILD", stderr: "Error: build failed", candidateCommit: "0".repeat(40),
    applicationId: "BASELINE", proposalDigest: "1".repeat(64), evidenceId: "BASELINE-FAILED-BUILD" });
  const observation = observeEngineeringExecution(request(candidate, baseline)).observation;
  check(observation?.state === "BUILD_PASS" && observation.baselineComparison === "RESOLVED", "passing candidate after failing baseline is classified as a resolved build failure");
  check(observation?.candidateAttribution === "RESOLUTION_LIKELY_CANDIDATE_ATTRIBUTABLE" && observation.attributionConfidence === 0.8, "resolution attribution remains probabilistic");
}

{
  const candidate = execution("PASS", { toolKind: "OTHER", toolId: "LINT", exitCode: 0 });
  const observation = observeEngineeringExecution(request(candidate, null)).observation;
  check(observation?.state === "TOOL_PASS" && observation.baselineComparison === "UNKNOWN", "missing baseline preserves tool result while marking historical comparison unknown");
  check(observation?.epistemicState === "INSUFFICIENT_EVIDENCE" && observation.unknowns.includes("baseline_execution_not_supplied"), "missing baseline is an explicit insufficient-evidence state");
}

{
  const timeout = execution("TIMEOUT", { toolKind: "TEST", toolId: "TEST", processTreeTerminationAttempted: true }, "engineering_tool_timeout");
  const blocked = execution("BLOCKED", { toolKind: "BUILD", toolId: "BUILD" }, "unexpected_repository_mutation");
  const infrastructure = execution("INFRASTRUCTURE_ERROR", { toolKind: "BUILD", toolId: "BUILD" }, "engineering_tool_spawn_failed");
  check(observeEngineeringExecution(request(timeout, null)).observation?.state === "TIMEOUT", "timeout remains distinct from tool failure");
  check(observeEngineeringExecution(request(blocked, null)).observation?.state === "BLOCKED", "authority/safety block remains distinct from tool failure");
  check(observeEngineeringExecution(request(infrastructure, null)).observation?.state === "INFRASTRUCTURE_ERROR", "infrastructure failure remains distinct from candidate failure");
}

{
  const evidence = execution("FAIL", { stderr: ["Error: explosion", "    at run (src/run.ts:8:4)",
    "C:/outside/secret.ts(2,1): error TS1000: outside", "FAIL tests/a.test.ts > case"].join("\n") }).evidence;
  const diagnostics = parseEngineeringDiagnostics(evidence);
  check(diagnostics.some((item) => item.category === "STACK" && item.file === "src/run.ts" && item.line === 8), "stack location is extracted when it is repository-relative");
  check(diagnostics.some((item) => item.code === "TS1000" && item.file === null), "absolute diagnostic path is not admitted as a repository-relative location");
  check(diagnostics.some((item) => item.category === "GENERIC") && diagnostics.some((item) => item.category === "TEST"), "generic errors and failing tests remain separately represented");
}

{
  const candidate = execution("FAIL", { stderr: "Error: candidate failed" });
  const mismatchedBaseline = execution("PASS", { toolIdentityDigest: "9".repeat(64), candidateCommit: "0".repeat(40),
    applicationId: "BASELINE", proposalDigest: "1".repeat(64), evidenceId: "MISMATCHED-BASELINE", exitCode: 0 });
  const result = observeEngineeringExecution(request(candidate, mismatchedBaseline));
  check(result.decision === "INSUFFICIENT_EVIDENCE" && result.observation?.epistemicState === "CONFLICTED", "non-comparable baseline cannot support an attribution claim");
  check(result.observation?.contradictions.includes("baseline_not_comparable_to_candidate_execution")
    && result.observation.candidateAttribution === "UNKNOWN", "baseline contradiction is preserved and attribution collapses to unknown");
}

{
  const candidate = execution("FAIL", { stderr: "Error: candidate failed" });
  const badBinding = observeEngineeringExecution(request(candidate, null, { expected: { ...expected(candidate), proposalDigest: "0".repeat(64) } }));
  check(badBinding.decision === "REJECTED" && badBinding.reason === "candidate_execution_binding_mismatch", "candidate identity mismatch rejects observation");
  const malformed = observeEngineeringExecution(request(candidate, null, { observationRequestId: "" }));
  check(malformed.decision === "REJECTED" && malformed.reason === "observation_request_malformed", "malformed observation request is rejected");
  const incoherent = { ...candidate, outcome: "PASS" as const };
  const incoherentResult = observeEngineeringExecution(request(incoherent, null, { expected: expected(candidate) }));
  check(incoherentResult.decision === "REJECTED" && incoherentResult.reason === "candidate_execution_evidence_incoherent", "result/evidence outcome contradiction is rejected");
  const authorityBearing = { ...candidate, authorityGranted: true as unknown as false };
  const authorityResult = observeEngineeringExecution(request(authorityBearing, null, { expected: expected(candidate) }));
  check(authorityResult.decision === "REJECTED" && authorityResult.reason === "candidate_execution_evidence_incoherent", "authority-bearing candidate evidence is rejected");
}

assert(R3_C_OBSERVATION_STATUS.newCapability === "STRUCTURED_ENGINEERING_FAILURE_OBSERVATION", "chunk reports exact structured-observation capability gain");
assert(R3_C_OBSERVATION_STATUS.grantsExecutionAuthority === false && R3_C_OBSERVATION_STATUS.grantsEvidenceAuthority === false,
  "observation cannot promote execution or evidence authority");
assert(R3_C_OBSERVATION_STATUS.consumesCapability === "CONTROLLED_BUILD_TEST_EXECUTION" && !R3_C_OBSERVATION_STATUS.productionEligible,
  "R3-C composes R3-B evidence while remaining isolated and non-production");

console.log(`Omega R3-C engineering observation tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
