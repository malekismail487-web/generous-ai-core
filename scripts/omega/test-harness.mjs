import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const PRIVATE_R1_EVALUATOR = "scripts/evaluation/omegaR1PrivateEval.ts";
const TEST_FILE_PATTERN = /^scripts\/(?:codelab|orchestra|omega)[^/]*\.test\.(?:ts|mjs)$/;

function normalizePath(value) {
  return value.split(sep).join("/").replace(/^\.\//, "");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isDiscoverableOmegaTest(file) {
  const normalized = normalizePath(file);
  return normalized === PRIVATE_R1_EVALUATOR || TEST_FILE_PATTERN.test(normalized);
}

export function discoverOmegaTestFiles(root) {
  const scriptsRoot = resolve(root, "scripts");
  const discovered = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const file = normalizePath(relative(root, absolute));
        if (isDiscoverableOmegaTest(file)) discovered.push(file);
      }
    }
  };
  visit(scriptsRoot);
  return Object.freeze(discovered.sort());
}

export function loadSuiteCatalog(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (parsed.schemaVersion !== 1 || typeof parsed.suiteVersion !== "string" || !Array.isArray(parsed.requiredSuites)) {
    throw new Error("Unsupported or malformed Ω suite catalog");
  }
  return Object.freeze({
    schemaVersion: 1,
    suiteVersion: parsed.suiteVersion,
    requiredSuites: Object.freeze(parsed.requiredSuites.map((suite) => Object.freeze({
      suiteId: String(suite.suiteId),
      file: normalizePath(String(suite.file)),
    }))),
  });
}

export function assessSuiteComposition(declarations, discoveredFiles) {
  const issues = [];
  const idCounts = new Map();
  const pathCounts = new Map();
  for (const suite of declarations) {
    idCounts.set(suite.suiteId, (idCounts.get(suite.suiteId) ?? 0) + 1);
    pathCounts.set(normalizePath(suite.file), (pathCounts.get(normalizePath(suite.file)) ?? 0) + 1);
  }
  for (const [suiteId, count] of idCounts) if (count > 1) issues.push({ code: "DUPLICATE_SUITE_ID", suiteId, count });
  for (const [file, count] of pathCounts) if (count > 1) issues.push({ code: "DUPLICATE_SUITE_FILE", file, count });

  const declaredFiles = new Set(declarations.map((suite) => normalizePath(suite.file)));
  const discovered = [...new Set(discoveredFiles.map(normalizePath))].sort();
  for (const file of [...declaredFiles].sort()) {
    if (!discovered.includes(file)) issues.push({ code: "DECLARED_SUITE_MISSING", file });
  }
  for (const file of discovered) {
    if (!declaredFiles.has(file)) issues.push({ code: "DISCOVERED_SUITE_OMITTED", file });
  }

  const suites = declarations
    .map((suite) => ({ suiteId: suite.suiteId, file: normalizePath(suite.file) }))
    .sort((a, b) => a.suiteId.localeCompare(b.suiteId));
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues), suites: Object.freeze(suites) });
}

export function extractSemanticTestIdentities(source, suiteId, file = "test.ts") {
  const scriptKind = file.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const definitions = [];
  const occurrences = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(?:assert|assertEq|check)$/.test(node.expression.text)) {
      const labelIndex = node.expression.text === "assert" ? 1 : 2;
      const label = node.arguments[labelIndex]?.getText(sourceFile).replace(/\s+/g, " ").trim() ?? "UNLABELED_ASSERTION";
      const semanticKey = `${node.expression.text}:${label}`;
      const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
      occurrences.set(semanticKey, occurrence);
      definitions.push(`${suiteId}::${sha256(semanticKey).slice(0, 20)}::${occurrence}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze(definitions);
}

export function parseTestExecution({ suite, exitCode, signal = null, output, source, testIdentities }) {
  const summaries = [...output.matchAll(/passed:\s*(\d+),\s*failed:\s*(\d+)/gi)];
  const passedChecks = summaries.length === 1 ? Number(summaries[0][1]) : 0;
  const failedChecks = summaries.length === 1 ? Number(summaries[0][2]) : 0;
  let failureReason = null;
  if (exitCode !== 0) failureReason = signal ? `PROCESS_SIGNAL_${signal}` : `PROCESS_EXIT_${String(exitCode)}`;
  else if (summaries.length === 0) failureReason = "MISSING_EXECUTION_SUMMARY";
  else if (summaries.length > 1) failureReason = "AMBIGUOUS_EXECUTION_SUMMARY";
  else if (failedChecks > 0) failureReason = "OBSERVED_CHECK_FAILURE";
  else if (passedChecks === 0) failureReason = "ZERO_CHECK_SUITE";
  else if (testIdentities.length === 0) failureReason = "NO_SEMANTIC_TEST_IDENTITIES";
  return Object.freeze({
    suiteId: suite.suiteId,
    file: suite.file,
    status: failureReason === null ? "PASSED" : "FAILED",
    failureReason,
    exitCode,
    passedChecks,
    failedChecks,
    sourceDigest: sha256(source),
    testIdentityDigest: sha256(testIdentities.join("\n")),
    testIdentities: Object.freeze([...testIdentities]),
  });
}

export function buildExecutionManifest({ suiteVersion, candidateCommit, worktreeState, nodeVersion, typescriptVersion, composition, executions }) {
  const aggregate = {
    discoveredSuites: composition.suites.length,
    executedSuites: executions.length,
    passedSuites: executions.filter((item) => item.status === "PASSED").length,
    failedSuites: executions.filter((item) => item.status === "FAILED").length + composition.issues.length,
    passedChecks: executions.reduce((sum, item) => sum + item.passedChecks, 0),
    failedChecks: executions.reduce((sum, item) => sum + item.failedChecks, 0),
    semanticTestDefinitions: executions.reduce((sum, item) => sum + item.testIdentities.length, 0),
  };
  const body = {
    schemaVersion: 1,
    suiteVersion,
    candidate: { commit: candidateCommit, worktreeState },
    tools: { node: nodeVersion, typescript: typescriptVersion },
    composition: { ok: composition.ok, issues: composition.issues },
    executions,
    aggregate,
  };
  return Object.freeze({ ...body, manifestDigest: sha256(canonicalize(body)) });
}
