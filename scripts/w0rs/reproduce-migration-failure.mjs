import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REPORT = join(ROOT, "docs", "w0rs", "evidence", "migration-failure-reproduction.json");
const MODE = process.argv.includes("--check") ? "check" : "write";
const toRepoPath = (path) => relative(ROOT, path).replaceAll("\\", "/");

const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
const profileCreationFile = "20260112001051_e440cf24-7253-4460-a7b0-0818be9374ae.sql";
const failureFile = "20260202112822_a61c6b14-58e3-4d54-a6ec-f025d3ae0486.sql";
const creationIndex = files.indexOf(profileCreationFile);
const failureIndex = files.indexOf(failureFile);

if (creationIndex === -1 || failureIndex === -1) {
  console.error("Expected migration evidence files are missing.");
  process.exit(1);
}

const creationSql = readFileSync(join(MIGRATIONS, profileCreationFile), "utf8");
const failureSql = readFileSync(join(MIGRATIONS, failureFile), "utf8");
const createMatch = creationSql.match(/CREATE\s+TABLE\s+public\.profiles\s*\(([\s\S]*?)\);/i);
const declaredProfileEmail = createMatch ? /^\s*email\s+/im.test(createMatch[1]) : false;
const priorSql = files.slice(0, failureIndex).map((name) => readFileSync(join(MIGRATIONS, name), "utf8")).join("\n");
const priorEmailAlter = /ALTER\s+TABLE\s+(?:public\.)?profiles[\s\S]{0,300}?ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?email\b/i.test(priorSql);
const failureReferencesEmail = /ON\s+public\.profiles[\s\S]*?\bLOWER\s*\(\s*email\s*\)/i.test(failureSql);
const confirmed =
  files.length === 128 &&
  failureIndex === 19 &&
  creationIndex < failureIndex &&
  createMatch !== null &&
  !declaredProfileEmail &&
  !priorEmailAlter &&
  failureReferencesEmail;

const result = {
  schemaVersion: 1,
  reproductionType: "deterministic ordered-SQL dependency reproduction",
  databaseEngineExecution: false,
  databaseEngineBlocker: "Docker and Supabase CLI are unavailable in the current execution environment.",
  migrationCount: files.length,
  profileCreation: { file: `supabase/migrations/${profileCreationFile}`, order: creationIndex + 1, declaresEmail: declaredProfileEmail },
  firstFailingDependency: {
    file: `supabase/migrations/${failureFile}`,
    order: failureIndex + 1,
    referencesProfilesEmail: failureReferencesEmail,
    priorAddColumnEmailFound: priorEmailAlter,
  },
  expectedPostgresDiagnostic: { sqlstate: "42703", condition: "undefined_column", missingIdentifier: "public.profiles.email" },
  confirmed,
  interpretation: confirmed
    ? "A clean ordered replay reaches migration 20 with public.profiles.email absent, while that migration creates a policy referencing email."
    : "Repository evidence drifted; the expected migration failure was not reproduced.",
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
mkdirSync(dirname(REPORT), { recursive: true });
if (MODE === "check") {
  if (!existsSync(REPORT) || readFileSync(REPORT, "utf8") !== serialized) {
    console.error(`OUT-OF-DATE ${toRepoPath(REPORT)}`);
    process.exit(1);
  }
  console.log(`OK ${toRepoPath(REPORT)}`);
} else {
  writeFileSync(REPORT, serialized);
  console.log(`WROTE ${toRepoPath(REPORT)}`);
}

console.log(`CONFIRMED=${confirmed} ORDER=${failureIndex + 1} SQLSTATE=42703 MISSING=public.profiles.email`);
if (!confirmed) process.exit(1);
