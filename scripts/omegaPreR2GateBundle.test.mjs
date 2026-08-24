import {
  OMEGA_R1_BEHAVIORAL_BASELINE,
  OMEGA_R1_INTEGRATED_BASELINE,
  OMEGA_R1_TRACEABLE_BASELINE,
  PRE_R2_GATE_REQUIREMENTS,
  classifyProductionBuildRun,
  classifyW0ExecutionSummary,
  evaluatePreR2Gate,
} from "./omega/pre-r2-gate.mjs";

let passed = 0;
let failed = 0;
const failures = [];
function assert(value, label) {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const candidate = Object.freeze({ commit: "a".repeat(40), worktreeState: "CLEAN" });
const dependencies = Object.freeze([{ dependencyId: "SOURCE", fingerprint: "source-v1" }]);
function item(requirement, overrides = {}) {
  return {
    requirement, outcome: "PASS", candidate, evaluatorVersion: `eval-${requirement}/1`, executedAtEpochMs: 1000,
    executionOrder: PRE_R2_GATE_REQUIREMENTS.indexOf(requirement) + 1, durationMs: 1, dependencies,
    evidenceRef: `evidence://${requirement}`, detail: "fresh deterministic fixture", freshness: "CURRENT", ...overrides,
  };
}
function bundle(overrides = {}) {
  return {
    schemaVersion: 1, candidate, behavioralBaselineCommit: OMEGA_R1_BEHAVIORAL_BASELINE,
    integratedBaselineCommit: OMEGA_R1_INTEGRATED_BASELINE, traceableBaselineCommit: OMEGA_R1_TRACEABLE_BASELINE,
    securityClosure: "REVOKED_AND_VERIFIED", r2Readiness: "ELIGIBLE",
    currentDependencies: dependencies, evidence: PRE_R2_GATE_REQUIREMENTS.map((requirement) => item(requirement)), ...overrides,
  };
}

assert(OMEGA_R1_BEHAVIORAL_BASELINE === "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296", "original R1 behavioral baseline is immutable");
assert(OMEGA_R1_INTEGRATED_BASELINE === "734e402fd80ed7425735830ea9a0b2b6a6e25908", "integrated institutional R1 baseline is exact");
assert(OMEGA_R1_TRACEABLE_BASELINE === "68717200b669a8e7644e01f717f158ea44899820", "traceable institutional R1 baseline is exact");
assert(PRE_R2_GATE_REQUIREMENTS.length === 16, "all required pre-R2 evidence families are explicit");
const ready = evaluatePreR2Gate(bundle());
assert(ready.decision === "READY", "complete fresh exact-bound evidence can produce READY");
assert(ready.grantsAuthority === false && ready.writeSandboxAvailable === false, "READY never grants authority or enables WRITE_SANDBOX");
assert(evaluatePreR2Gate(bundle({ securityClosure: "OPEN", r2Readiness: "INELIGIBLE" })).decision === "NOT_READY", "open SEC-003 and ineligible readiness produce NOT_READY");
assert(evaluatePreR2Gate(bundle({ evidence: bundle().evidence.map((entry) => entry.requirement === "W0_DENO" ? { ...entry, outcome: "BLOCKED_ENVIRONMENT" } : entry) })).decision === "INSUFFICIENT_EVIDENCE", "environment-blocked evidence is neither pass nor failure");
assert(evaluatePreR2Gate(bundle({ evidence: bundle().evidence.map((entry) => entry.requirement === "SECRET_SCAN" ? { ...entry, outcome: "FAIL" } : entry) })).decision === "NOT_READY", "failed critical evidence blocks readiness");
assert(evaluatePreR2Gate(bundle({ evidence: bundle().evidence.slice(1) })).decision === "INSUFFICIENT_EVIDENCE", "missing required evidence fails closed");
assert(evaluatePreR2Gate(bundle({ evidence: [...bundle().evidence, bundle().evidence[0]] })).decision === "INSUFFICIENT_EVIDENCE", "duplicate evidence requirement fails closed");
assert(evaluatePreR2Gate(bundle({ evidence: bundle().evidence.map((entry) => entry.requirement === "HARNESS_MANIFEST" ? { ...entry, candidate: { ...candidate, commit: "b".repeat(40) } } : entry) })).decision === "INSUFFICIENT_EVIDENCE", "cross-candidate evidence cannot satisfy the bundle");
assert(evaluatePreR2Gate(bundle({ evidence: bundle().evidence.map((entry) => entry.requirement === "TYPESCRIPT_ZERO_RATCHET" ? { ...entry, freshness: "STALE" } : entry) })).decision === "INSUFFICIENT_EVIDENCE", "stale evidence requires revalidation");
assert(evaluatePreR2Gate(bundle({ currentDependencies: [{ dependencyId: "SOURCE", fingerprint: "source-v2" }] })).decision === "INSUFFICIENT_EVIDENCE", "dependency change invalidates only evidence bound to that dependency");
assert(evaluatePreR2Gate(bundle({ traceableBaselineCommit: "c".repeat(40) })).decision === "INSUFFICIENT_EVIDENCE", "wrong traceable baseline fails closed");
assert(classifyProductionBuildRun({ exitCode: 0, stdout: "", stderr: "" }) === "PASS", "successful production build is classified as pass");
assert(classifyProductionBuildRun({ exitCode: 1, stdout: "", stderr: "Access is denied" }) === "BLOCKED_ENVIRONMENT", "sandbox filesystem denial is not misreported as a product build failure");
assert(classifyProductionBuildRun({ exitCode: 1, stdout: "", stderr: "syntax error" }) === "FAIL", "real build failure remains failure");
assert(classifyW0ExecutionSummary({ passed: 36, failed: 0, blocked: 0 }) === "PASS", "executed green Deno population can pass");
assert(classifyW0ExecutionSummary({ passed: 0, failed: 0, blocked: 36 }) === "BLOCKED_ENVIRONMENT", "missing Deno runtime blocks the executed population");
assert(classifyW0ExecutionSummary({ passed: 35, failed: 1, blocked: 0 }) === "FAIL", "Deno test failure cannot be laundered as environment blocking");

console.log(`Omega pre-R2 gate bundle tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
