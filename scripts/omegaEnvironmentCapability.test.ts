import { resolve } from "node:path";
import { evaluateEnvironmentPreconditions, evaluationTelemetry, probeLocalEnvironment, type EnvironmentCapabilityReport, type EvaluationDefinition } from "./evaluation/environment-capability/capabilities";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

const report: EnvironmentCapabilityReport = {
  schemaVersion: 1, reporterVersion: "omega-environment-capability/1", observedAtEpochMs: 1,
  capabilities: [
    { capabilityId: "NODE", status: "AVAILABLE", identity: "v24", evidence: "fixture" },
    { capabilityId: "TYPESCRIPT", status: "AVAILABLE", identity: "5.8.3", evidence: "fixture" },
    { capabilityId: "FILESYSTEM", status: "AVAILABLE", identity: "win32", evidence: "fixture" },
    { capabilityId: "DENO", status: "UNAVAILABLE", identity: null, evidence: "fixture" },
    { capabilityId: "NETWORK_BENCHMARK", status: "NOT_AUTHORIZED", identity: null, evidence: "fixture" },
    { capabilityId: "GPU", status: "NOT_REQUIRED", identity: null, evidence: "fixture" },
  ], grantsAuthority: false,
};
function evaluation(overrides: Partial<EvaluationDefinition> = {}): EvaluationDefinition {
  return { evaluationId: "EVAL-NODE", importance: "CRITICAL_GATE", applicable: true,
    environmentRequirements: [{ capabilityId: "NODE", statement: "Node required" }], authorityRequirements: [], ...overrides };
}

assert(evaluateEnvironmentPreconditions(evaluation(), report, []).outcome === "READY_TO_EXECUTE", "satisfied preconditions are ready but not falsely passed");
assert(evaluateEnvironmentPreconditions(evaluation(), report, [], "PASS").outcome === "PASS", "executed success is a pass");
assert(evaluateEnvironmentPreconditions(evaluation(), report, [], "FAIL").outcome === "FAIL", "executed failure remains failure");
const deno = evaluateEnvironmentPreconditions(evaluation({ evaluationId: "EVAL-DENO", environmentRequirements: [{ capabilityId: "DENO", statement: "Deno required" }] }), report, []);
assert(deno.outcome === "BLOCKED_ENVIRONMENT" && deno.outcome !== "PASS" && deno.outcome !== "FAIL", "unavailable Deno is environment-blocked, neither passed nor failed");
const network = evaluateEnvironmentPreconditions(evaluation({ evaluationId: "EVAL-LIVE", environmentRequirements: [{ capabilityId: "NETWORK_BENCHMARK", statement: "Network required" }], authorityRequirements: ["NETWORK_BENCHMARK"] }), report, []);
assert(network.outcome === "BLOCKED_AUTHORITY", "missing explicit network authority blocks before execution");
assert(evaluateEnvironmentPreconditions(evaluation({ applicable: false }), report, []).outcome === "NOT_APPLICABLE", "not-applicable remains distinct from every execution outcome");
assert(evaluateEnvironmentPreconditions(evaluation({ importance: "HELD_OUT" }), report, []).importance === "HELD_OUT", "evaluation importance survives precondition analysis");

const local = probeLocalEnvironment(resolve("."), 100);
assert(local.capabilities.find((item) => item.capabilityId === "NODE")?.status === "AVAILABLE", "live reporter identifies Node as available");
assert(local.capabilities.find((item) => item.capabilityId === "TYPESCRIPT")?.identity === "5.8.3", "live reporter binds pinned TypeScript version");
assert(local.capabilities.find((item) => item.capabilityId === "FILESYSTEM")?.status === "AVAILABLE", "live reporter confirms authorized repository read capability");
assert(local.capabilities.find((item) => item.capabilityId === "DENO")?.status === "UNAVAILABLE", "live reporter honestly reports absent Deno runtime");
assert(local.capabilities.find((item) => item.capabilityId === "NETWORK_BENCHMARK")?.status === "NOT_AUTHORIZED", "live reporter preserves network authority prohibition");
assert(local.capabilities.find((item) => item.capabilityId === "GPU")?.status === "NOT_REQUIRED", "GPU is not inflated into a current requirement");
assert(local.grantsAuthority === false, "environment reporting grants no authority");

const telemetry = evaluationTelemetry({ evaluationId: "EVAL", importance: "REGRESSION", startedAtEpochMs: 10, endedAtEpochMs: 25, outcome: "PASS" });
assert(telemetry.durationMs === 15 && telemetry.importance === "REGRESSION", "verification cost telemetry preserves runtime and importance");
let badTelemetryRejected = false;
try { evaluationTelemetry({ evaluationId: "BAD", importance: "INFORMATIONAL", startedAtEpochMs: 20, endedAtEpochMs: 10, outcome: "FAIL" }); } catch { badTelemetryRejected = true; }
assert(badTelemetryRejected, "invalid runtime telemetry interval is rejected");

console.log(`Omega environment capability tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
