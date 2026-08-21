import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = join(ROOT, "docs", "w0rs", "evidence", "test-manifest.json");
const LOADER = join(ROOT, "scripts", "w0rs", "register-typescript-loader.mjs");
const args = process.argv.slice(2);
const requestedGroups = [];
let reportPath = null;
let allowLive = false;

function sanitizeOutput(value) {
  if (!value) return "";
  return value
    .replaceAll(ROOT, "<repo>")
    .replaceAll(ROOT.replaceAll("\\", "/"), "<repo>")
    .trim();
}

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--group") requestedGroups.push(args[++index]);
  else if (args[index] === "--report") reportPath = resolve(ROOT, args[++index]);
  else if (args[index] === "--allow-live") allowLive = true;
}

if (!existsSync(MANIFEST_PATH)) {
  console.error("Missing test manifest. Run `node scripts/w0rs/inventory.mjs --write` first.");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const tests = [
  ...manifest.scripts.tests.map((test) => ({ ...test, runtime: "node" })),
  ...manifest.deno.tests.map((test) => ({ ...test, group: "deno-unit", runtime: "deno", countBasis: "Deno.test declarations" })),
];
const groups = [...new Set(tests.map((test) => test.group))].sort();

if (args.includes("--list") || requestedGroups.length === 0) {
  console.log("W0-RS-1 test groups:");
  for (const group of groups) {
    const selected = tests.filter((test) => test.group === group);
    const fixed = selected.reduce((total, test) => total + (test.declaredChecks ?? 0), 0);
    console.log(`  ${group}: files=${selected.length} fixedDeclaredChecks=${fixed}`);
  }
  console.log("Live benchmarks require both `--group live-benchmark` and `--allow-live`; the runner never enables network access itself.");
  process.exit(0);
}

const selected = tests.filter((test) => requestedGroups.includes(test.group));
if (selected.length === 0) {
  console.error(`No tests matched groups: ${requestedGroups.join(", ")}`);
  process.exit(2);
}

const results = [];
for (const test of selected) {
  if (test.group === "live-benchmark" && !allowLive) {
    results.push({ ...test, status: "skipped", reason: "live execution requires explicit --allow-live" });
    continue;
  }

  const command = test.runtime === "deno" ? "deno" : process.execPath;
  const commandArgs = test.runtime === "deno"
    ? [
        "test",
        "--allow-env",
        "--allow-read=.env,.env.defaults,.env.example,supabase/functions",
        test.file,
      ]
    : ["--experimental-strip-types", "--import", pathToFileURL(LOADER).href, test.file];
  const run = spawnSync(command, commandArgs, { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  const missingRuntime = run.error?.code === "ENOENT";
  const dependencyMissing = run.status !== 0 && /Cannot find package ['"][^'"]+['"]/i.test(run.stderr ?? "");
  const status = missingRuntime || dependencyMissing ? "blocked" : run.status === 0 ? "passed" : "failed";
  results.push({
    ...test,
    status,
    exitCode: run.status,
    reason: missingRuntime
      ? `${command} runtime unavailable`
      : dependencyMissing
        ? "repository dependencies are not installed"
        : null,
    stdout: sanitizeOutput(run.stdout),
    stderr: sanitizeOutput(run.stderr ?? run.error?.message),
  });
  console.log(`${status.toUpperCase()} ${test.file}${test.declaredChecks === null ? "" : ` checks=${test.declaredChecks}`}`);
}

const summary = {
  files: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  blocked: results.filter((result) => result.status === "blocked").length,
  skipped: results.filter((result) => result.status === "skipped").length,
  passedDeclaredChecks: results.filter((result) => result.status === "passed").reduce((total, result) => total + (result.declaredChecks ?? 0), 0),
};
const report = { schemaVersion: 1, requestedGroups, allowLive, summary, results };
console.log(`SUMMARY ${JSON.stringify(summary)}`);

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`REPORT ${reportPath}`);
}

if (summary.failed > 0 || summary.blocked > 0) process.exit(1);
