import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareDiagnostics,
  loadTypeScriptBaseline,
  normalizeDiagnostic,
  compilerVersionMatches,
  parseCompilerVersion,
  parseTypeScriptDiagnostics,
} from "./typescript/typecheck-ratchet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(label);
    console.error(`  x ${label}`);
  }
}

const sample = [
  "src/example.ts(4,2): error TS2322: Type 'number' is not assignable to type 'string'.",
  "  continuation text is deliberately ignored by the stable first-line fingerprint",
  "src/other.ts(8,1): error TS2339: Property 'x' does not exist on type 'Y'.",
].join("\n");
const parsed = parseTypeScriptDiagnostics(sample, ROOT);
assert(parsed.length === 2, "parser extracts TypeScript diagnostic headers");
assert(parsed[0].file === "src/example.ts", "parser normalizes diagnostic paths");
assert(parsed[0].code === "TS2322", "parser preserves TypeScript diagnostic codes");
assert(parsed[0].message.includes("not assignable"), "parser preserves the stable first-line message");
assert(normalizeDiagnostic({ file: ".\\src\\a.ts", code: "TS1", message: " a   b " }).file === "src/a.ts", "diagnostic normalization is platform-neutral");

const baseline = [parsed[0], parsed[1], parsed[1]];
const unchanged = compareDiagnostics(baseline, [parsed[1], parsed[0], parsed[1]]);
assert(unchanged.accepted && unchanged.newDiagnostics.length === 0, "ordering does not affect the ratchet");
assert(unchanged.resolvedDiagnostics.length === 0, "unchanged diagnostics do not appear resolved");
const improved = compareDiagnostics(baseline, [parsed[0]]);
assert(improved.accepted, "resolved historical diagnostics are allowed");
assert(improved.resolvedDiagnostics.length === 2, "duplicate historical diagnostics are counted as a multiset");
const regressed = compareDiagnostics(baseline, [...baseline, { file: "src/new.ts", code: "TS9999", message: "New error" }]);
assert(!regressed.accepted && regressed.newDiagnostics.length === 1, "new diagnostic fails the comparison");
assert(parseCompilerVersion("Version 5.8.3\n") === "5.8.3", "compiler version parser accepts the exact tsc format");
assert(parseCompilerVersion("typescript 5.8.3") === null, "compiler version parser rejects ambiguous output");
assert(compilerVersionMatches("Version 5.8.3", "5.8.3"), "exact compiler version matches the baseline");
assert(!compilerVersionMatches("Version 5.9.0", "5.8.3"), "compiler upgrade cannot silently reuse the baseline");

const stored = loadTypeScriptBaseline();
assert(stored.schemaVersion === 1, "stored baseline schema is recognized");
assert(stored.baselineCommit === "e97da82a00208725d66f618b15fa6580b2301f10", "zero-error baseline identifies the exact pushed source commit");
assert(stored.diagnostics.length === 0, "stored baseline accepts no historical TypeScript diagnostics");
assert(stored.predecessor.baselineCommit === "d2b7121716cb17d0b78e29b9a6510e8c122b901e" && stored.predecessor.diagnosticCount === 7,
  "downward baseline preserves its seven-error predecessor genealogy");
assert(stored.predecessor.transition === "STRICT_DOWNWARD_SUBSET", "baseline transition is explicitly downward-only");
assert(stored.typescriptVersion === "5.8.3", "stored baseline binds exact TypeScript 5.8.3");
assert(stored.project === "tsconfig.app.json", "stored baseline binds the intended project configuration");

const live = spawnSync(process.execPath, ["scripts/typescript/typecheck-ratchet.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 120_000,
});
const liveOutput = `${live.stdout ?? ""}\n${live.stderr ?? ""}`;
assert(live.status === 0, "live full-project TypeScript ratchet permits only baseline debt");
assert(/baseline=0 current=0 new=0 resolved=0/.test(liveOutput), "live ratchet enforces the zero-diagnostic baseline");
assert(/typescript=5\.8\.3/.test(liveOutput), "live ratchet reports the verified compiler version");
assert(!liveOutput.includes("NEW_TYPE_ERROR"), "live ratchet reports no new TypeScript diagnostics");

console.log(`Omega TypeScript ratchet tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
