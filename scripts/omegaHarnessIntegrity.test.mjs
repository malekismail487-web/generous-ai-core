import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessSuiteComposition,
  buildExecutionManifest,
  discoverOmegaTestFiles,
  extractSemanticTestIdentities,
  isDiscoverableOmegaTest,
  loadSuiteCatalog,
  parseTestExecution,
} from "./omega/test-harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const failures = [];
function assert(condition, label) {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const catalog = loadSuiteCatalog(resolve(ROOT, "scripts/omega/required-suites.json"));
const discovered = discoverOmegaTestFiles(ROOT);
const liveComposition = assessSuiteComposition(catalog.requiredSuites, discovered);
assert(catalog.schemaVersion === 1 && catalog.suiteVersion === "omega-institutional-suite/2", "catalog schema and suite genealogy are explicit");
assert(liveComposition.ok, "declared and discovered Ω suite composition matches");
assert(liveComposition.suites.some((suite) => suite.suiteId === "OMEGA-HARNESS-INTEGRITY"), "harness self-test is part of discovered execution");
assert(isDiscoverableOmegaTest("scripts/omegaFuture.test.ts"), "future Ω tests are discoverable without runner count edits");
assert(!isDiscoverableOmegaTest("scripts/lseFuture.test.ts"), "unrelated test families are outside Ω aggregation");

const declaredMissing = assessSuiteComposition([{ suiteId: "A", file: "scripts/omegaMissing.test.ts" }], []);
assert(!declaredMissing.ok && declaredMissing.issues[0]?.code === "DECLARED_SUITE_MISSING", "declared missing suite fails closed");
const discoveredOmitted = assessSuiteComposition([], ["scripts/omegaUncatalogued.test.ts"]);
assert(!discoveredOmitted.ok && discoveredOmitted.issues[0]?.code === "DISCOVERED_SUITE_OMITTED", "discovered omitted suite fails closed");
const duplicateId = assessSuiteComposition([
  { suiteId: "DUP", file: "scripts/omegaOne.test.ts" },
  { suiteId: "DUP", file: "scripts/omegaTwo.test.ts" },
], ["scripts/omegaOne.test.ts", "scripts/omegaTwo.test.ts"]);
assert(duplicateId.issues.some((issue) => issue.code === "DUPLICATE_SUITE_ID"), "duplicate semantic suite identity is rejected");
const duplicateFile = assessSuiteComposition([
  { suiteId: "ONE", file: "scripts/omegaSame.test.ts" },
  { suiteId: "TWO", file: "scripts/omegaSame.test.ts" },
], ["scripts/omegaSame.test.ts"]);
assert(duplicateFile.issues.some((issue) => issue.code === "DUPLICATE_SUITE_FILE"), "duplicate suite file is rejected");

const semanticSource = "assert(true, 'stable claim');\nassert(false, 'other claim');";
const semanticA = extractSemanticTestIdentities(semanticSource, "S", "scripts/omegaSynthetic.test.ts");
const semanticB = extractSemanticTestIdentities(`\n${semanticSource}\n`, "S", "scripts/omegaSynthetic.test.ts");
assert(semanticA.length === 2, "semantic assertion definitions are discovered");
assert(JSON.stringify(semanticA) === JSON.stringify(semanticB), "semantic identities survive irrelevant source positioning changes");
assert(new Set(semanticA).size === semanticA.length, "semantic test identities are unique within a suite");

const suite = { suiteId: "S", file: "scripts/omegaSynthetic.test.ts" };
const good = parseTestExecution({ suite, exitCode: 0, output: "passed: 2, failed: 0", source: semanticSource, testIdentities: semanticA });
assert(good.status === "PASSED" && good.passedChecks === 2, "actual executed checks drive successful aggregation");
assert(good.sourceDigest.length === 64 && good.testIdentityDigest.length === 64, "execution binds source and semantic identity digests");
const noSummary = parseTestExecution({ suite, exitCode: 0, output: "looks fine", source: semanticSource, testIdentities: semanticA });
assert(noSummary.failureReason === "MISSING_EXECUTION_SUMMARY", "missing execution summary is rejected");
const ambiguous = parseTestExecution({ suite, exitCode: 0, output: "passed: 1, failed: 0\npassed: 1, failed: 0", source: semanticSource, testIdentities: semanticA });
assert(ambiguous.failureReason === "AMBIGUOUS_EXECUTION_SUMMARY", "multiple summaries are rejected");
const zero = parseTestExecution({ suite, exitCode: 0, output: "passed: 0, failed: 0", source: semanticSource, testIdentities: semanticA });
assert(zero.failureReason === "ZERO_CHECK_SUITE", "zero-test success is rejected");
const failedCheck = parseTestExecution({ suite, exitCode: 0, output: "passed: 1, failed: 1", source: semanticSource, testIdentities: semanticA });
assert(failedCheck.failureReason === "OBSERVED_CHECK_FAILURE", "reported check failure is rejected");
const failedProcess = parseTestExecution({ suite, exitCode: 9, output: "passed: 2, failed: 0", source: semanticSource, testIdentities: semanticA });
assert(failedProcess.failureReason === "PROCESS_EXIT_9", "nonzero process exit is rejected despite green summary");
const noIdentities = parseTestExecution({ suite, exitCode: 0, output: "passed: 1, failed: 0", source: "console.log('x')", testIdentities: [] });
assert(noIdentities.failureReason === "NO_SEMANTIC_TEST_IDENTITIES", "suite without semantic test identities is rejected");

const composition = assessSuiteComposition([suite], [suite.file]);
const manifest = buildExecutionManifest({
  suiteVersion: "synthetic/1",
  candidateCommit: "a".repeat(40),
  worktreeState: "CLEAN",
  nodeVersion: "v-test",
  typescriptVersion: "5.8.3",
  composition,
  executions: [good],
});
assert(manifest.aggregate.executedSuites === 1 && manifest.aggregate.passedChecks === 2, "machine manifest aggregates observed execution");
assert(manifest.aggregate.semanticTestDefinitions === 2, "machine manifest records semantic test definition population");
assert(manifest.candidate.commit === "a".repeat(40) && manifest.candidate.worktreeState === "CLEAN", "manifest binds candidate commit and worktree state");
assert(manifest.tools.typescript === "5.8.3", "manifest records compiler identity");
assert(manifest.manifestDigest.length === 64, "manifest has a deterministic integrity digest");
const selfSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
assert(extractSemanticTestIdentities(selfSource, "OMEGA-HARNESS-INTEGRITY", "scripts/omegaHarnessIntegrity.test.mjs").length > 20,
  "harness records its own stable semantic test definitions");

console.log(`Omega harness integrity tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
