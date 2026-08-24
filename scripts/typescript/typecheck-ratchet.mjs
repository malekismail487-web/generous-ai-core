import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const BASELINE_PATH = resolve(SCRIPT_DIR, "typecheck-baseline.json");

export function normalizeDiagnostic(input) {
  return {
    file: String(input.file).replace(/\\/g, "/").replace(/^\.\//, ""),
    code: String(input.code),
    message: String(input.message).replace(/\s+/g, " ").trim(),
  };
}

export function parseTypeScriptDiagnostics(output, root = ROOT) {
  const diagnostics = [];
  const linePattern = /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
  for (const rawLine of String(output).split(/\r?\n/)) {
    const match = rawLine.match(linePattern);
    if (!match) continue;
    const rawFile = match[1].replace(/\\/g, "/");
    const normalizedRoot = root.replace(/\\/g, "/");
    const file = rawFile.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
      ? relative(root, rawFile).replace(/\\/g, "/")
      : rawFile.replace(/^\.\//, "");
    diagnostics.push(normalizeDiagnostic({ file, code: match[4], message: match[5] }));
  }
  return diagnostics;
}

function diagnosticKey(diagnostic) {
  const normalized = normalizeDiagnostic(diagnostic);
  return JSON.stringify([normalized.file.toLowerCase(), normalized.code, normalized.message]);
}

function countByKey(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function compareDiagnostics(baselineDiagnostics, currentDiagnostics) {
  const baseline = countByKey(baselineDiagnostics);
  const current = countByKey(currentDiagnostics);
  const newDiagnostics = [];
  const resolvedDiagnostics = [];

  for (const diagnostic of currentDiagnostics.map(normalizeDiagnostic)) {
    const key = diagnosticKey(diagnostic);
    const remaining = baseline.get(key) ?? 0;
    if (remaining > 0) baseline.set(key, remaining - 1);
    else newDiagnostics.push(diagnostic);
  }
  for (const diagnostic of baselineDiagnostics.map(normalizeDiagnostic)) {
    const key = diagnosticKey(diagnostic);
    const remaining = current.get(key) ?? 0;
    if (remaining > 0) current.set(key, remaining - 1);
    else resolvedDiagnostics.push(diagnostic);
  }

  return {
    accepted: newDiagnostics.length === 0,
    baselineCount: baselineDiagnostics.length,
    currentCount: currentDiagnostics.length,
    newDiagnostics,
    resolvedDiagnostics,
  };
}

export function parseCompilerVersion(output) {
  const match = String(output).trim().match(/^Version ([0-9]+\.[0-9]+\.[0-9]+)$/);
  return match?.[1] ?? null;
}

export function compilerVersionMatches(output, expectedVersion) {
  return parseCompilerVersion(output) === expectedVersion;
}

export function loadTypeScriptBaseline(path = BASELINE_PATH) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const diagnosticsValid = Array.isArray(parsed?.diagnostics) && parsed.diagnostics.every((item) =>
    item && typeof item === "object" && typeof item.file === "string" && typeof item.code === "string" && typeof item.message === "string");
  if (parsed?.schemaVersion !== 1
    || !/^[0-9a-f]{40}$/.test(parsed?.baselineCommit ?? "")
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(parsed?.typescriptVersion ?? "")
    || parsed?.project !== "tsconfig.app.json"
    || !diagnosticsValid) {
    throw new Error("Unsupported or malformed TypeScript diagnostic baseline.");
  }
  return parsed;
}

export function runTypeScriptRatchet() {
  const baseline = loadTypeScriptBaseline();
  const compiler = resolve(ROOT, "node_modules/.bin", process.platform === "win32" ? "tsc.exe" : "tsc");
  const versionRun = spawnSync(compiler, ["--version"], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  if (versionRun.error) throw versionRun.error;
  const compilerVersionOutput = `${versionRun.stdout ?? ""}${versionRun.stderr ?? ""}`;
  if (versionRun.status !== 0 || !compilerVersionMatches(compilerVersionOutput, baseline.typescriptVersion)) {
    const observed = parseCompilerVersion(compilerVersionOutput) ?? "UNPARSEABLE";
    throw new Error(`TypeScript compiler version mismatch: expected ${baseline.typescriptVersion}, observed ${observed}.`);
  }
  const run = spawnSync(compiler, ["--noEmit", "-p", baseline.project, "--pretty", "false"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (run.error) throw run.error;
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const currentDiagnostics = parseTypeScriptDiagnostics(output);
  if (run.status !== 0 && currentDiagnostics.length === 0) {
    throw new Error(`TypeScript failed without parseable diagnostics (exit ${run.status}).`);
  }
  const comparison = compareDiagnostics(baseline.diagnostics, currentDiagnostics);
  return { baseline, comparison, compilerExitCode: run.status ?? -1, compilerVersion: baseline.typescriptVersion };
}

function printDiagnostic(prefix, diagnostic) {
  console.error(`${prefix} ${diagnostic.file} ${diagnostic.code}: ${diagnostic.message}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runTypeScriptRatchet();
    const { comparison, baseline } = result;
    console.log(
      `TS_RATCHET typescript=${result.compilerVersion} baselineCommit=${baseline.baselineCommit} baseline=${comparison.baselineCount} current=${comparison.currentCount} new=${comparison.newDiagnostics.length} resolved=${comparison.resolvedDiagnostics.length}`,
    );
    for (const diagnostic of comparison.newDiagnostics) printDiagnostic("NEW_TYPE_ERROR", diagnostic);
    for (const diagnostic of comparison.resolvedDiagnostics) console.log(`RESOLVED_TYPE_ERROR ${diagnostic.file} ${diagnostic.code}`);
    if (!comparison.accepted) process.exit(1);
  } catch (error) {
    console.error(`TS_RATCHET_ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
