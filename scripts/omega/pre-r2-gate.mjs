import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const OMEGA_R1_BEHAVIORAL_BASELINE = "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296";
export const OMEGA_R1_INTEGRATED_BASELINE = "734e402fd80ed7425735830ea9a0b2b6a6e25908";
export const PRE_R2_GATE_VERSION = "omega-pre-r2-gate/1";

export const PRE_R2_GATE_REQUIREMENTS = Object.freeze([
  "OMEGA_AGGREGATE",
  "HARNESS_MANIFEST",
  "TYPESCRIPT_ZERO_RATCHET",
  "SECRET_SCAN",
  "PRODUCTION_BUILD",
  "W0_NODE_STATIC",
  "W0_DENO",
  "R1_ORIGINAL_EXECUTOR",
  "R1_PRIVATE_EVALUATION",
  "READ_ONLY_VERTICAL_SLICE",
  "EVIDENCE_CUSTODY",
  "ASSURANCE_SELF_TEST",
  "REGISTRY_EVIDENCE_BRIDGE",
  "CRITICAL_PATH_COMPUTATION",
  "SEC003_CLOSURE_EVIDENCE",
  "R2A_READINESS",
]);

const AGGREGATE_SUITE_MAP = Object.freeze({
  R1_ORIGINAL_EXECUTOR: "OMEGA-READ-ONLY-EXECUTOR",
  R1_PRIVATE_EVALUATION: "OMEGA-R1-PRIVATE-EVAL",
  READ_ONLY_VERTICAL_SLICE: "OMEGA-READ-ONLY-VERTICAL-SLICE",
  EVIDENCE_CUSTODY: "OMEGA-EVIDENCE-CUSTODY",
  ASSURANCE_SELF_TEST: "OMEGA-ASSURE-R2-EVALUATOR",
  REGISTRY_EVIDENCE_BRIDGE: "OMEGA-REGISTRY-EVIDENCE-BRIDGE",
  CRITICAL_PATH_COMPUTATION: "OMEGA-REGISTRY-CRITICAL-PATH",
  SEC003_CLOSURE_EVIDENCE: "OMEGA-SEC003-CLOSURE-EVIDENCE",
  R2A_READINESS: "OMEGA-R2-A-READINESS",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : "UNAVAILABLE";
}

function run(command, args, order, evaluatorVersion) {
  const startedAtEpochMs = Date.now();
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 240_000 });
  const endedAtEpochMs = Date.now();
  return {
    order,
    evaluatorVersion,
    command: [command, ...args].join(" "),
    exitCode: result.status,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
    startedAtEpochMs,
    endedAtEpochMs,
    durationMs: endedAtEpochMs - startedAtEpochMs,
  };
}

function parseJsonLine(output, prefix) {
  const line = String(output).split(/\r?\n/).find((item) => item.startsWith(prefix));
  if (!line) return null;
  try { return JSON.parse(line.slice(prefix.length)); } catch { return null; }
}

function evidence(requirement, outcome, runResult, candidate, dependencies, detail, evidenceRef = null) {
  return Object.freeze({
    requirement,
    outcome,
    candidate,
    evaluatorVersion: runResult.evaluatorVersion,
    executedAtEpochMs: runResult.endedAtEpochMs,
    executionOrder: runResult.order,
    durationMs: runResult.durationMs,
    dependencies: Object.freeze(dependencies.map((item) => Object.freeze({ ...item }))),
    evidenceRef: evidenceRef ?? `local-run://${requirement.toLowerCase()}/${runResult.endedAtEpochMs}`,
    detail,
    freshness: "CURRENT",
  });
}

function sourceDependency(id, path) {
  const content = readFileSync(resolve(ROOT, path));
  return { dependencyId: id, fingerprint: sha256(content) };
}

export function evaluatePreR2Gate(input) {
  const reasons = [];
  const requirements = new Map();
  for (const item of input.evidence) {
    if (requirements.has(item.requirement)) reasons.push(`duplicate_requirement:${item.requirement}`);
    requirements.set(item.requirement, item);
  }
  for (const requirement of PRE_R2_GATE_REQUIREMENTS) {
    if (!requirements.has(requirement)) reasons.push(`missing_requirement:${requirement}`);
  }
  for (const item of input.evidence) {
    if (item.candidate.commit !== input.candidate.commit || item.candidate.worktreeState !== input.candidate.worktreeState) {
      reasons.push(`candidate_binding_mismatch:${item.requirement}`);
    }
    if (!item.evaluatorVersion || !item.executedAtEpochMs || !item.executionOrder || !item.evidenceRef) {
      reasons.push(`incomplete_provenance:${item.requirement}`);
    }
    if (item.freshness !== "CURRENT") reasons.push(`stale_evidence:${item.requirement}`);
    const current = new Map(input.currentDependencies.map((dependency) => [dependency.dependencyId, dependency.fingerprint]));
    for (const dependency of item.dependencies) {
      if (current.get(dependency.dependencyId) !== dependency.fingerprint) reasons.push(`dependency_changed:${item.requirement}:${dependency.dependencyId}`);
    }
  }
  const failed = input.evidence.filter((item) => item.outcome === "FAIL");
  const blocked = input.evidence.filter((item) => ["BLOCKED_ENVIRONMENT", "BLOCKED_AUTHORITY", "UNKNOWN"].includes(item.outcome));
  if (input.securityClosure === "OPEN" || input.securityClosure === "UNKNOWN") reasons.push("omega_sec_003_not_authoritatively_closed");
  if (input.r2Readiness !== "ELIGIBLE") reasons.push(`r2_readiness_${input.r2Readiness.toLowerCase()}`);
  const structural = reasons.some((reason) => reason.startsWith("duplicate_") || reason.startsWith("missing_") || reason.startsWith("candidate_") || reason.startsWith("incomplete_") || reason.startsWith("stale_") || reason.startsWith("dependency_"));
  const decision = failed.length > 0 || input.securityClosure === "OPEN" || input.securityClosure === "UNKNOWN" || input.r2Readiness === "INELIGIBLE"
    ? "NOT_READY"
    : blocked.length > 0 || structural || input.r2Readiness === "INSUFFICIENT_EVIDENCE"
      ? "INSUFFICIENT_EVIDENCE"
      : "READY";
  return Object.freeze({
    schemaVersion: 1,
    coordinatorVersion: PRE_R2_GATE_VERSION,
    decision,
    reasons: Object.freeze([...new Set(reasons)]),
    failedRequirements: Object.freeze(failed.map((item) => item.requirement)),
    blockedRequirements: Object.freeze(blocked.map((item) => item.requirement)),
    grantsAuthority: false,
    writeSandboxAvailable: false,
  });
}

export function collectPreR2GateEvidence() {
  const candidate = Object.freeze({
    commit: gitOutput(["rev-parse", "HEAD"]),
    worktreeState: gitOutput(["status", "--porcelain"]) === "" ? "CLEAN" : "DIRTY",
  });
  const currentDependencies = Object.freeze([
    sourceDependency("OMEGA_SUITE_CATALOG", "scripts/omega/required-suites.json"),
    sourceDependency("OMEGA_HARNESS", "scripts/omega/test-harness.mjs"),
    sourceDependency("TYPESCRIPT_BASELINE", "scripts/typescript/typecheck-baseline.json"),
    sourceDependency("SECRET_SCANNER", "scripts/security/scan-secrets.mjs"),
    sourceDependency("W0_TEST_MANIFEST", "docs/w0rs/evidence/test-manifest.json"),
    { dependencyId: "NODE_VERSION", fingerprint: process.version },
  ]);
  const dependencyMap = new Map(currentDependencies.map((item) => [item.dependencyId, item]));
  const pick = (...ids) => ids.map((id) => dependencyMap.get(id));
  const results = [];
  let order = 0;

  const aggregateRun = run(process.execPath, ["scripts/omega/run-tests.mjs"], ++order, "omega-aggregate/1");
  const manifest = parseJsonLine(aggregateRun.stdout, "OMEGA_TEST_MANIFEST ");
  const aggregatePass = aggregateRun.exitCode === 0 && manifest?.aggregate?.failedSuites === 0;
  results.push(evidence("OMEGA_AGGREGATE", aggregatePass ? "PASS" : "FAIL", aggregateRun, candidate, pick("OMEGA_SUITE_CATALOG", "OMEGA_HARNESS", "NODE_VERSION"),
    manifest ? `suites=${manifest.aggregate.executedSuites};checks=${manifest.aggregate.passedChecks}` : "aggregate manifest unavailable"));
  results.push(evidence("HARNESS_MANIFEST", manifest?.manifestDigest && manifest?.candidate?.commit === candidate.commit ? "PASS" : "FAIL", aggregateRun, candidate,
    pick("OMEGA_SUITE_CATALOG", "OMEGA_HARNESS", "NODE_VERSION"), manifest?.manifestDigest ?? "manifest unavailable", manifest ? `manifest://${manifest.manifestDigest}` : null));
  for (const [requirement, suiteId] of Object.entries(AGGREGATE_SUITE_MAP)) {
    const execution = manifest?.executions?.find((item) => item.suiteId === suiteId);
    results.push(evidence(requirement, execution?.status === "PASSED" ? "PASS" : "FAIL", aggregateRun, candidate,
      pick("OMEGA_SUITE_CATALOG", "OMEGA_HARNESS", "NODE_VERSION"), execution ? `suiteId=${suiteId};checks=${execution.passedChecks}` : `suite ${suiteId} missing`));
  }

  const tsRun = run(process.execPath, ["scripts/typescript/typecheck-ratchet.mjs"], ++order, "typescript-ratchet/1");
  results.push(evidence("TYPESCRIPT_ZERO_RATCHET", tsRun.exitCode === 0 && /current=0 new=0/.test(tsRun.stdout) ? "PASS" : "FAIL", tsRun, candidate,
    pick("TYPESCRIPT_BASELINE", "NODE_VERSION"), tsRun.stdout.trim() || tsRun.stderr.trim()));

  const secretRun = run(process.execPath, ["scripts/security/scan-secrets.mjs"], ++order, "secret-scan/1");
  results.push(evidence("SECRET_SCAN", secretRun.exitCode === 0 && /SECRET_SCAN_PASSED/.test(secretRun.stdout) ? "PASS" : "FAIL", secretRun, candidate,
    pick("SECRET_SCANNER", "NODE_VERSION"), secretRun.stdout.trim() || secretRun.stderr.trim()));

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const buildRun = run(npm, ["run", "build"], ++order, "vite-production-build/1");
  results.push(evidence("PRODUCTION_BUILD", buildRun.exitCode === 0 ? "PASS" : "FAIL", buildRun, candidate,
    pick("NODE_VERSION"), buildRun.exitCode === 0 ? "production build completed" : (buildRun.stderr.trim() || "production build failed")));

  const w0NodeRun = run(process.execPath, ["scripts/w0rs/run-tests.mjs", "--group", "node-dependencies", "--group", "node-offline", "--group", "static-audit"], ++order, "w0-deterministic/1");
  const w0NodeSummary = parseJsonLine(w0NodeRun.stdout, "SUMMARY ");
  results.push(evidence("W0_NODE_STATIC", w0NodeRun.exitCode === 0 && w0NodeSummary?.failed === 0 && w0NodeSummary?.blocked === 0 ? "PASS" : "FAIL", w0NodeRun, candidate,
    pick("W0_TEST_MANIFEST", "NODE_VERSION"), w0NodeSummary ? JSON.stringify(w0NodeSummary) : "W0 Node/static summary unavailable"));

  const denoRun = run("deno", ["test", "--version"], ++order, "w0-deno-environment-probe/1");
  const denoOutcome = denoRun.errorCode === "ENOENT" ? "BLOCKED_ENVIRONMENT" : denoRun.exitCode === 0 ? "PASS" : "FAIL";
  results.push(evidence("W0_DENO", denoOutcome, denoRun, candidate, [], denoOutcome === "BLOCKED_ENVIRONMENT" ? "Deno runtime unavailable; 220 checks not executed" : "Deno runtime probe completed"));

  return Object.freeze({
    schemaVersion: 1,
    candidate,
    behavioralBaselineCommit: OMEGA_R1_BEHAVIORAL_BASELINE,
    integratedBaselineCommit: OMEGA_R1_INTEGRATED_BASELINE,
    securityClosure: "OPEN",
    r2Readiness: "INELIGIBLE",
    currentDependencies,
    evidence: Object.freeze(results),
    networkBenchmark: Object.freeze({ outcome: "BLOCKED_AUTHORITY", reason: "Network benchmark not authorized" }),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = collectPreR2GateEvidence();
  const decision = evaluatePreR2Gate(bundle);
  console.log(`OMEGA_PRE_R2_GATE ${JSON.stringify({ ...decision, candidate: bundle.candidate, evidence: bundle.evidence.map((item) => ({ requirement: item.requirement, outcome: item.outcome, durationMs: item.durationMs, evidenceRef: item.evidenceRef })) })}`);
  if (decision.decision === "NOT_READY") process.exitCode = 2;
  else if (decision.decision === "INSUFFICIENT_EVIDENCE") process.exitCode = 3;
}
