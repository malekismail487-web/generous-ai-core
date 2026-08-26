import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaDir = join(root, "supabase", "schema");
const migrationDir = join(root, "supabase", "migrations");
const baselineName = "20260821000000_lumina_canonical_baseline.sql";
const baselinePath = join(migrationDir, baselineName);
const manifestPath = join(schemaDir, "manifest.json");
const sources = [
  "00_extensions.sql",
  "10_types.sql",
  "20_platform_authority.sql",
  "30_functions.sql",
  "40_tables.sql",
  "45_views_sequences_comments.sql",
  "47_view_functions.sql",
  "50_constraints_indexes.sql",
  "55_security_constraints.sql",
  "60_triggers.sql",
  "65_authority_functions.sql",
  "70_rls.sql",
  "80_storage_realtime.sql",
  "90_grants.sql",
];
const check = process.argv.includes("--check");
const write = process.argv.includes("--write");
if (check === write) throw new Error("Choose exactly one of --check or --write");

const canonical = (text) => text.replace(/\r\n?/g, "\n");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const repoPath = (path) => relative(root, path).replaceAll("\\", "/");
const loaded = sources.map((name) => ({
  name,
  text: canonical(readFileSync(join(schemaDir, name), "utf8")).trimEnd() + "\n",
}));

const sourceText = loaded.map(({ text }) => text).join("\n");
const retired = [
  /'admin'::public\.app_role/,
  /malekismail487@gmail\.com/i,
  /verify_admin_access_code/i,
  /verify_super_admin_code/i,
  /grant_admin_via_code/i,
  /activate_school_with_code/i,
  /public\.hardcoded_admins/i,
  /public\.super_admin_codes/i,
  /public\.api_keys\b/i,
  /public\.api_call_logs\b/i,
];
for (const pattern of retired) {
  if (pattern.test(sourceText)) throw new Error(`Retired authority/API pattern survived canonical sources: ${pattern}`);
}

const functionSections = sourceText.split(/(?=\n--\n-- Name: .*?; Type: FUNCTION;)/g);
const unpinned = functionSections.filter((section) =>
  /SECURITY DEFINER/.test(section)
  && !/SET search_path TO 'pg_catalog', 'public', 'auth'(?:, 'extensions')?/.test(section),
);
if (unpinned.length) throw new Error(`${unpinned.length} SECURITY DEFINER functions lack a fixed canonical search_path`);

const body = [
  "-- LUMINA canonical baseline for fresh user-owned Supabase environments.",
  "-- Truthful provenance: reviewed rebaseline from repository evidence; not recovered deployment history.",
  "-- The 128 Lovable-era files are non-executable evidence under supabase/legacy/lovable-migrations.",
  "",
  "BEGIN;",
  "SET LOCAL statement_timeout = '120s';",
  "SET LOCAL lock_timeout = '10s';",
  "",
  sourceText.trimEnd(),
  "",
  "COMMIT;",
  "",
].join("\n");
const manifest = {
  schemaVersion: 1,
  status: "canonical fresh-backend baseline",
  provenance: "reviewed rebaseline from repository evidence; not recovered deployment history",
  executableMigration: `supabase/migrations/${baselineName}`,
  legacyArchive: "supabase/legacy/lovable-migrations",
  sources: loaded.map(({ name, text }) => ({
    path: `supabase/schema/${name}`,
    canonicalLfBytes: Buffer.byteLength(text),
    canonicalLfSha256: sha256(text),
  })),
  baseline: {
    canonicalLfBytes: Buffer.byteLength(body),
    canonicalLfSha256: sha256(body),
  },
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

if (write) {
  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(baselinePath, body, "utf8");
  writeFileSync(manifestPath, manifestText, "utf8");
  console.log(`Wrote ${repoPath(baselinePath)} from ${sources.length} canonical sources.`);
} else {
  const migrationFiles = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
  if (!migrationFiles.includes(baselineName)) throw new Error(`Canonical executable migration ${baselineName} is missing.`);
  const invalidPostBaseline = migrationFiles.filter((name) => name !== baselineName && name.localeCompare(baselineName) <= 0);
  if (invalidPostBaseline.length > 0) throw new Error(`Executable migrations must follow canonical baseline ${baselineName}; found ${invalidPostBaseline.join(", ")}`);
  if (canonical(readFileSync(baselinePath, "utf8")) !== body) throw new Error(`${repoPath(baselinePath)} is out of date`);
  if (canonical(readFileSync(manifestPath, "utf8")) !== manifestText) throw new Error(`${repoPath(manifestPath)} is out of date`);
  console.log(`Verified canonical baseline, ${migrationFiles.length - 1} post-baseline migration(s), ${sources.length} sources, and ${manifest.baseline.canonicalLfSha256}.`);
}
