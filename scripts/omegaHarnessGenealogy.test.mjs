import { assessSuiteComposition, buildExecutionManifest, compareExecutionManifests, parseTestExecution } from "./omega/test-harness.mjs";

let passed = 0;
let failed = 0;
const failures = [];
function assert(value, label) { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

function execution(suiteId, identities, overrides = {}) {
  const suite = { suiteId, file: `scripts/${suiteId}.test.ts`, criticality: overrides.criticality ?? "REGRESSION" };
  return parseTestExecution({ suite, exitCode: 0, output: `passed: ${identities.length}, failed: 0`, source: overrides.source ?? identities.join("\n"), testIdentities: identities });
}
function manifest(version, executions, commit = "a".repeat(40)) {
  const declarations = executions.map((item) => ({ suiteId: item.suiteId, file: item.file, criticality: item.criticality }));
  return buildExecutionManifest({ suiteVersion: version, candidateCommit: commit, worktreeState: "CLEAN", nodeVersion: "v24", typescriptVersion: "5.8.3",
    composition: assessSuiteComposition(declarations, declarations.map((item) => item.file)), executions });
}

const previous = manifest("suite/1", [execution("SECURITY", ["SEC-1", "SEC-2"], { criticality: "CRITICAL_GATE", source: "old security" }), execution("REGRESSION", ["REG-1"], { source: "old regression" })]);
const unchanged = manifest("suite/1", [execution("SECURITY", ["SEC-1", "SEC-2"], { criticality: "CRITICAL_GATE", source: "old security" }), execution("REGRESSION", ["REG-1"], { source: "old regression" })], "b".repeat(40));
const clean = compareExecutionManifests(previous, unchanged);
assert(clean.decision === "ACCEPTED", "candidate-only change with identical suites and semantics is accepted");
assert(clean.addedSuites.length === 0 && clean.removedSuites.length === 0 && clean.removedSemanticIds.length === 0, "unchanged suite genealogy has no false deltas");

const evolved = manifest("suite/2", [execution("SECURITY", ["SEC-1", "SEC-3"], { criticality: "CRITICAL_GATE", source: "new security" }), execution("REGRESSION", ["REG-1"], { source: "new regression" }), execution("ADDED", ["ADD-1"])], "b".repeat(40));
const delta = compareExecutionManifests(previous, evolved);
assert(delta.decision === "REVIEW_REQUIRED", "silent semantic assertion removal requires review");
assert(delta.addedSuites.includes("ADDED"), "new suite is recorded in genealogy");
assert(delta.changedSourceDigests.length === 2, "source hash changes are recorded independently from semantic changes");
assert(delta.addedSemanticIds.some((item) => item.testId === "SEC-3") && delta.removedSemanticIds.some((item) => item.testId === "SEC-2"), "semantic assertion additions and removals are exact");
const classified = compareExecutionManifests(previous, evolved, [{ changeId: "SEMANTIC_REMOVED:SECURITY:SEC-2", disposition: "SUPERSEDED_BY_STRONGER_TEST", rationale: "SEC-3 exercises the same invariant adversarially.", evidenceRefs: ["evidence://sec-3"] }]);
assert(classified.decision === "ACCEPTED", "critical assertion removal is accepted only with stronger-test classification and evidence");
const weakCritical = compareExecutionManifests(previous, evolved, [{ changeId: "SEMANTIC_REMOVED:SECURITY:SEC-2", disposition: "APPROVED_REMOVAL", rationale: "remove", evidenceRefs: ["review://1"] }]);
assert(weakCritical.decision === "REVIEW_REQUIRED", "critical assertion cannot use ordinary approved-removal classification");

const removedSuite = manifest("suite/2", [execution("REGRESSION", ["REG-1"])], "b".repeat(40));
assert(compareExecutionManifests(previous, removedSuite).issues.includes("unclassified_suite_removal:SECURITY"), "silent required security-suite removal fails genealogy gate");
const classifiedSuite = compareExecutionManifests(previous, removedSuite, [{ changeId: "SUITE_REMOVED:SECURITY", disposition: "SUPERSEDED_BY_STRONGER_TEST", rationale: "Replacement suite independently covers the boundary.", evidenceRefs: ["evidence://replacement"] }]);
assert(classifiedSuite.decision === "ACCEPTED", "suite supersession remains possible with explicit stronger evidence");
assert(compareExecutionManifests({}, evolved).decision === "INVALID", "malformed predecessor cannot establish genealogy");
assert(previous.predecessor === null && previous.genealogy === null, "root manifest explicitly records absent predecessor genealogy");
assert(previous.manifestDigest !== evolved.manifestDigest, "genealogically distinct manifests have distinct integrity digests");

console.log(`Omega harness genealogy tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
