import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assessSuiteComposition,
  buildExecutionManifest,
  discoverOmegaTestFiles,
  extractSemanticTestIdentities,
  loadSuiteCatalog,
  parseTestExecution,
  compareExecutionManifests,
} from "./test-harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOADER = resolve(ROOT, "scripts/w0rs/register-typescript-loader.mjs");
const CATALOG = resolve(ROOT, "scripts/omega/required-suites.json");

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : "UNAVAILABLE";
}

const catalog = loadSuiteCatalog(CATALOG);
const discovered = discoverOmegaTestFiles(ROOT);
const composition = assessSuiteComposition(catalog.requiredSuites, discovered);
const candidateCommit = gitOutput(["rev-parse", "HEAD"]);
const worktreeState = gitOutput(["status", "--porcelain"]) === "" ? "CLEAN" : "DIRTY";
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

if (!composition.ok) {
  for (const issue of composition.issues) console.error(`OMEGA_HARNESS_INTEGRITY_FAILURE ${JSON.stringify(issue)}`);
  const manifest = buildExecutionManifest({
    suiteVersion: catalog.suiteVersion,
    candidateCommit,
    worktreeState,
    nodeVersion: process.version,
    typescriptVersion: packageJson.devDependencies?.typescript ?? "UNKNOWN",
    composition,
    executions: [],
  });
  console.log(`OMEGA_TEST_MANIFEST ${JSON.stringify(manifest)}`);
  console.log(`OMEGA_TEST_SUMMARY files=0 failedFiles=${composition.issues.length} passedChecks=0`);
  process.exit(1);
}

const executions = [];
for (const suite of composition.suites) {
  const source = readFileSync(resolve(ROOT, suite.file), "utf8");
  const testIdentities = extractSemanticTestIdentities(source, suite.suiteId, suite.file);
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--import", pathToFileURL(LOADER).href, suite.file],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const execution = parseTestExecution({
    suite,
    exitCode: run.status,
    signal: run.signal,
    output,
    source,
    testIdentities,
  });
  executions.push(execution);
  if (execution.status === "PASSED") {
    console.log(`PASSED ${suite.file} suiteId=${suite.suiteId} checks=${execution.passedChecks}`);
  } else {
    console.error(`FAILED ${suite.file} suiteId=${suite.suiteId} reason=${execution.failureReason}`);
    const detail = output.trim();
    if (detail) console.error(detail);
  }
}

let manifest = buildExecutionManifest({
  suiteVersion: catalog.suiteVersion,
  candidateCommit,
  worktreeState,
  nodeVersion: process.version,
  typescriptVersion: packageJson.devDependencies?.typescript ?? "UNKNOWN",
  composition,
  executions,
});
if (process.env.OMEGA_PREVIOUS_TEST_MANIFEST_PATH) {
  const previous = JSON.parse(readFileSync(resolve(process.env.OMEGA_PREVIOUS_TEST_MANIFEST_PATH), "utf8"));
  const classifications = process.env.OMEGA_TEST_GENEALOGY_CLASSIFICATIONS_PATH
    ? JSON.parse(readFileSync(resolve(process.env.OMEGA_TEST_GENEALOGY_CLASSIFICATIONS_PATH), "utf8")) : [];
  const genealogy = compareExecutionManifests(previous, manifest, classifications);
  manifest = buildExecutionManifest({
    suiteVersion: catalog.suiteVersion, candidateCommit, worktreeState, nodeVersion: process.version,
    typescriptVersion: packageJson.devDependencies?.typescript ?? "UNKNOWN", composition, executions,
    predecessor: { manifestDigest: previous.manifestDigest, candidate: previous.candidate }, genealogy,
  });
  if (genealogy.decision !== "ACCEPTED") {
    for (const issue of genealogy.issues ?? []) console.error(`OMEGA_HARNESS_GENEALOGY_FAILURE ${issue}`);
  }
}
const compactManifest = {
  ...manifest,
  executions: manifest.executions.map(({ testIdentities, ...execution }) => ({
    ...execution,
    semanticTestDefinitions: testIdentities.length,
  })),
};
if (process.env.OMEGA_TEST_MANIFEST_PATH) {
  writeFileSync(resolve(process.env.OMEGA_TEST_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
console.log(`OMEGA_TEST_MANIFEST ${JSON.stringify(compactManifest)}`);
console.log(`OMEGA_TEST_SUMMARY files=${executions.length} failedFiles=${manifest.aggregate.failedSuites} passedChecks=${manifest.aggregate.passedChecks}`);
if (manifest.aggregate.failedSuites > 0 || (manifest.genealogy && manifest.genealogy.decision !== "ACCEPTED")) process.exit(1);
