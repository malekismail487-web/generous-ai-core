import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE_DIR = join(ROOT, "docs", "w0rs", "evidence");
const MODE = process.argv.includes("--check") ? "check" : "write";
const TRACKED_FILES = new Set(
  execFileSync(
    "git",
    ["-c", `safe.directory=${ROOT.replaceAll("\\", "/")}`, "ls-files", "-z"],
    { cwd: ROOT, encoding: "utf8" },
  ).split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/")),
);

const toRepoPath = (path) => relative(ROOT, path).replaceAll("\\", "/");
const read = (path) => readFileSync(path, "utf8");
const canonicalText = (value) => value.replace(/\r\n?/g, "\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const lineOf = (value, index) => value.slice(0, index).split(/\r?\n/).length;
const normalizeName = (name) => name.replaceAll('"', "").toLowerCase();
const normalizeSql = (value) => value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
const unqualifiedName = (name) => name.split(".").at(-1);
const canonicalParameters = (value) => value
  .toLowerCase()
  .replace(/default\s+null::[a-z0-9_.]+/g, "default null")
  .replace(/\s+/g, " ")
  .trim();

function walk(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(path, predicate));
    else if (predicate(path)) results.push(path);
  }
  return results.sort((a, b) => toRepoPath(a).localeCompare(toRepoPath(b)));
}

function matchingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function functionBodyEnd(source, headerEnd) {
  const afterHeader = source.slice(headerEnd);
  const delimiterMatch = afterHeader.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)/i);
  if (!delimiterMatch) return Math.min(source.length, headerEnd + 4000);
  const delimiter = delimiterMatch[1];
  const bodyStart = headerEnd + delimiterMatch.index + delimiterMatch[0].length;
  const bodyEnd = source.indexOf(delimiter, bodyStart);
  return bodyEnd === -1 ? Math.min(source.length, headerEnd + 12000) : bodyEnd + delimiter.length;
}

function extractFunctionDefinitions(sql, file) {
  const results = [];
  const regex = /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_".]+)\s*\(/gi;
  for (const match of sql.matchAll(regex)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = matchingParen(sql, openIndex);
    if (closeIndex === -1) continue;
    const endIndex = functionBodyEnd(sql, closeIndex + 1);
    const definition = sql.slice(match.index, endIndex);
    const parameters = normalizeSql(sql.slice(openIndex + 1, closeIndex));
    const name = normalizeName(match[1]);
    const signals = [];
    const signalPatterns = [
      ["auth_uid", /auth\.uid\s*\(/i],
      ["jwt_email", /auth\.jwt\s*\([^)]*\)[\s\S]{0,120}email/i],
      ["has_role_admin", /has_role\s*\([\s\S]{0,180}['"]admin['"]/i],
      ["super_admin_helper", /is_(?:platform_)?super_admin/i],
      ["code_verification", /access_code|admin_code|super_admin_code/i],
      ["service_role", /service_role/i],
      ["caller_supplied_uuid", /(?:user|target|profile)_uuid/i],
    ];
    for (const [signal, pattern] of signalPatterns) {
      if (pattern.test(definition)) signals.push(signal);
    }
    results.push({
      name,
      parameters,
      signature: `${name}(${canonicalParameters(parameters)})`,
      file,
      line: lineOf(sql, match.index),
      securityDefiner: /SECURITY\s+DEFINER/i.test(definition),
      searchPathPinned: /SET\s+search_path\s*(?:=|TO)/i.test(definition),
      authorizationSignals: signals,
    });
  }
  return results;
}

function extractNamedObjects(sql, file, regex, type) {
  return [...sql.matchAll(regex)].map((match) => ({
    type,
    name: normalizeName(match[1]),
    file,
    line: lineOf(sql, match.index),
  }));
}

function extractPolicies(sql, file) {
  const regex = /\bCREATE\s+POLICY\s+(?:"([^"]+)"|([^\s]+))\s+ON\s+([A-Za-z0-9_".]+)/gi;
  return [...sql.matchAll(regex)].map((match) => {
    const statementEnd = sql.indexOf(";", match.index);
    const statement = sql.slice(match.index, statementEnd === -1 ? match.index + 2000 : statementEnd + 1);
    return {
      name: match[1] ?? match[2],
      table: normalizeName(match[3]),
      file,
      line: lineOf(sql, match.index),
      privilegedSignals: [
        /has_role\s*\([\s\S]*?['"]admin['"]/i.test(statement) ? "generic_admin" : null,
        /is_(?:platform_)?super_admin/i.test(statement) ? "super_admin" : null,
        /school_admin/i.test(statement) ? "school_admin" : null,
        /auth\.uid\s*\(/i.test(statement) ? "auth_uid" : null,
        /auth\.jwt\s*\(/i.test(statement) ? "jwt_claim" : null,
      ].filter(Boolean),
    };
  });
}

const migrationPaths = walk(join(ROOT, "supabase", "legacy", "lovable-migrations"), (path) => path.endsWith(".sql"));
const migrationRecords = [];
const functionDefinitions = [];
const tables = [];
const enums = [];
const extensions = [];
const policies = [];
const buckets = [];
const publications = [];
const privilegeStatements = [];

for (const [index, path] of migrationPaths.entries()) {
  const content = canonicalText(read(path));
  // Preserve the original discovery path in the W0-RS historical evidence so
  // prior hashes and findings remain comparable after the non-executable move.
  const file = `supabase/migrations/${path.split(/[\\/]/).at(-1)}`;
  const version = /^([0-9]+)_/.exec(path.split(/[\\/]/).at(-1))?.[1] ?? null;
  migrationRecords.push({
    order: index + 1,
    file,
    version,
    versionDigits: version?.length ?? 0,
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: sha256(content),
  });
  functionDefinitions.push(...extractFunctionDefinitions(content, file));
  tables.push(...extractNamedObjects(content, file, /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_".]+)/gi, "table"));
  enums.push(...extractNamedObjects(content, file, /\bCREATE\s+TYPE\s+([A-Za-z0-9_".]+)\s+AS\s+ENUM/gi, "enum"));
  extensions.push(...extractNamedObjects(content, file, /\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_".]+)/gi, "extension"));
  policies.push(...extractPolicies(content, file));
  for (const match of content.matchAll(/storage\.buckets[\s\S]{0,500}?VALUES\s*\(\s*['"]([^'"]+)['"]/gi)) {
    buckets.push({ type: "storage_bucket", name: match[1], file, line: lineOf(content, match.index) });
  }
  for (const match of content.matchAll(/ALTER\s+PUBLICATION\s+([A-Za-z0-9_".]+)\s+ADD\s+TABLE\s+([A-Za-z0-9_".]+)/gi)) {
    publications.push({ publication: normalizeName(match[1]), table: normalizeName(match[2]), file, line: lineOf(content, match.index) });
  }
  for (const match of content.matchAll(/\b(?:GRANT|REVOKE)\b[\s\S]*?;/gi)) {
    const statement = normalizeSql(match[0]);
    if (/EXECUTE|\bPUBLIC\b|\banon\b|\bauthenticated\b|service_role/i.test(statement)) {
      privilegeStatements.push({ file, line: lineOf(content, match.index), statement });
    }
  }
}

const codePaths = [
  ...walk(join(ROOT, "src"), (path) => /\.[jt]sx?$/.test(path)),
  ...walk(join(ROOT, "scripts"), (path) => /\.[cm]?[jt]sx?$/.test(path) && !toRepoPath(path).startsWith("scripts/w0rs/")),
  ...walk(join(ROOT, "supabase", "functions"), (path) => /\.[jt]s$/.test(path)),
];
const codeContents = new Map(codePaths.map((path) => [toRepoPath(path), read(path)]));

const rpcCalls = [];
const edgeCalls = [];
const envReferences = new Map();
const oldBackendCoupling = [];

function addEnv(name, file) {
  if (!envReferences.has(name)) envReferences.set(name, new Set());
  envReferences.get(name).add(file);
}

for (const path of codePaths) {
  const file = toRepoPath(path);
  const content = codeContents.get(file);
  for (const match of content.matchAll(/\.rpc\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    rpcCalls.push({ name: match[1], file, line: lineOf(content, match.index) });
  }
  for (const match of content.matchAll(/functions\.invoke\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    edgeCalls.push({ name: match[1], file, line: lineOf(content, match.index), transport: "supabase-js" });
  }
  for (const match of content.matchAll(/functions\/v1\/([A-Za-z0-9_-]+)/g)) {
    edgeCalls.push({ name: match[1], file, line: lineOf(content, match.index), transport: "raw-url" });
  }
  for (const match of content.matchAll(/Deno\.env\.get\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) addEnv(match[1], file);
  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) addEnv(match[1], file);
  for (const match of content.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) addEnv(match[1], file);
  if (/https:\/\/[a-z0-9-]+\.supabase\.co/i.test(content) || /project_id\s*=/.test(content)) {
    oldBackendCoupling.push({ file, kind: "hardcoded-project-or-url", valueRedacted: true });
  }
}

for (const envPath of walk(ROOT, (path) => /(^|[\\/])\.env(?:\..+)?$/.test(path))) {
  const file = toRepoPath(envPath);
  // Repository evidence is a property of the Git tree. Local ignored files
  // (especially a developer's .env) must never change a generated manifest.
  if (!TRACKED_FILES.has(file)) continue;
  const content = read(envPath);
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match) addEnv(match[1], file);
  }
  if (/https:\/\/[a-z0-9-]+\.supabase\.co/i.test(content) || /SUPABASE_PROJECT_ID\s*=/.test(content)) {
    oldBackendCoupling.push({ file, kind: "environment-project-reference", valueRedacted: true });
  }
}

const configPath = join(ROOT, "supabase", "config.toml");
const config = existsSync(configPath) ? read(configPath) : "";
if (/^\s*project_id\s*=\s*"[^"]+"/m.test(config)) {
  oldBackendCoupling.push({ file: toRepoPath(configPath), kind: "supabase-config-project-id", valueRedacted: true });
}
const functionJwtConfig = new Map();
let currentFunction = null;
for (const line of config.split(/\r?\n/)) {
  const section = /^\s*\[functions\.([^\]]+)\]\s*$/.exec(line);
  if (section) currentFunction = section[1];
  const jwt = /^\s*verify_jwt\s*=\s*(true|false)\s*$/.exec(line);
  if (currentFunction && jwt) functionJwtConfig.set(currentFunction, jwt[1] === "true");
}

const edgeCallers = new Map();
for (const call of edgeCalls) {
  if (!edgeCallers.has(call.name)) edgeCallers.set(call.name, []);
  edgeCallers.get(call.name).push({ file: call.file, line: call.line, transport: call.transport });
}

const serviceRoleBoundaries = [];
for (const path of walk(join(ROOT, "supabase", "functions"), (candidate) => /\.[jt]s$/.test(candidate))) {
  const content = read(path);
  if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) continue;
  const file = toRepoPath(path);
  const relativeParts = file.split("/");
  const functionName = relativeParts[2] === "_shared" ? "_shared" : relativeParts[2];
  const evidence = [];
  if (/auth\.getUser\s*\(/.test(content)) evidence.push("auth.getUser");
  if (/auth\.getClaims\s*\(/.test(content)) evidence.push("auth.getClaims");
  if (/authorization/i.test(content)) evidence.push("authorization-header");
  if (/CRON_SECRET|INTERNAL_SECRET|WEBHOOK_SECRET/.test(content)) evidence.push("internal-secret-reference");
  if (/x-api-key|api[_-]?key/i.test(content)) evidence.push("api-key-reference");
  const callers = edgeCallers.get(functionName) ?? [];
  const isDefaultDenyBlocker = ["mi-aggregate", "unified-optimize"].includes(functionName);
  serviceRoleBoundaries.push({
    function: functionName,
    file,
    serviceRoleReferenceLines: [...content.matchAll(/SUPABASE_SERVICE_ROLE_KEY/g)].map((match) => lineOf(content, match.index)),
    jwtVerification: functionJwtConfig.has(functionName) ? (functionJwtConfig.get(functionName) ? "explicit-true" : "explicit-false") : "supabase-default",
    repositoryCallers: callers,
    boundaryEvidence: evidence,
    classification: isDefaultDenyBlocker
      ? "default-deny-review-blocker"
      : callers.length > 0
        ? "client-reachable-needs-endpoint-review"
        : "no-first-party-client-caller-found-needs-review",
    confidence: isDefaultDenyBlocker || callers.length > 0 ? "medium" : "low",
    requiredBeforeEnablement: isDefaultDenyBlocker
      ? "Prove intended callers, authentication, authorization, tenant scope, and audit contract."
      : null,
    conclusionLimit: "Static evidence does not prove the deployed endpoint is reachable or vulnerable.",
    deploymentEligible: true,
  });
}

const disabledServiceRoleBoundaries = [];
for (const path of walk(join(ROOT, "supabase", "functions-disabled"), (candidate) => /index\.[jt]s$/.test(candidate))) {
  const content = read(path);
  if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) continue;
  const file = toRepoPath(path);
  const functionName = file.split("/")[2];
  disabledServiceRoleBoundaries.push({
    function: functionName,
    file,
    serviceRoleReferenceLines: [...content.matchAll(/SUPABASE_SERVICE_ROLE_KEY/g)].map((match) => lineOf(content, match.index)),
    jwtVerification: "not-deployable",
    repositoryCallers: edgeCallers.get(functionName) ?? [],
    boundaryEvidence: ["preserved-outside-supabase-functions"],
    classification: "excluded-from-deployment",
    confidence: "high",
    requiredBeforeEnablement: "Complete a reviewed caller, authentication, authorization, tenant-scope, idempotency, and audit contract before moving this code into the deployable function tree.",
    conclusionLimit: "Preserved repository evidence is not a deployable Edge Function.",
    deploymentEligible: false,
  });
}

const functionGroups = new Map();
for (const definition of functionDefinitions) {
  if (!functionGroups.has(definition.name)) functionGroups.set(definition.name, []);
  functionGroups.get(definition.name).push(definition);
}

const rpcCallerMap = new Map();
for (const call of rpcCalls) {
  if (!rpcCallerMap.has(call.name)) rpcCallerMap.set(call.name, []);
  rpcCallerMap.get(call.name).push({ file: call.file, line: call.line });
}

function codeReferences(identifier) {
  const pattern = new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return [...codeContents.entries()]
    .filter(([file, content]) => !file.endsWith("src/integrations/supabase/types.ts") && pattern.test(content))
    .map(([file]) => file)
    .sort();
}

const genericAdminMigrationFiles = migrationPaths
  .filter((path) => /has_role\s*\([\s\S]{0,180}['"]admin['"]/i.test(read(path)))
  .map(toRepoPath);
const genericAdminCodeFiles = [...codeContents.entries()]
  .filter(([file, content]) =>
    file.startsWith("src/") &&
    /isAdmin|has_role\s*\([^\n]*["']admin["']|hardcoded_admin|user_roles[\s\S]{0,120}["']admin["']|role[\s\S]{0,80}["']admin["']/i.test(content),
  )
  .map(([file]) => file)
  .sort();

const legacyReplaceFunctions = new Set([
  "verify_admin_access_code",
  "verify_super_admin_code",
  "grant_admin_via_code",
  "activate_school_with_code",
  "is_super_admin_user",
  "is_super_admin",
  "is_super_admin_caller",
]);
const legacyExcludeTables = new Set([
  "public.admin_access_codes",
  "public.hardcoded_admins",
  "public.super_admin_codes",
  "public.super_admin_verification",
  "public.super_admin_attack_attempts",
  "public.super_admin_attack_logs",
]);

const privilegedObjects = [...functionGroups.entries()]
  .filter(([name, definitions]) =>
    definitions.some((item) => item.securityDefiner || item.authorizationSignals.length > 0) ||
    /admin|role|access|activate|approve|deny|moderator|ministry|invite|auth/i.test(name),
  )
  .map(([name, definitions]) => {
    const shortName = unqualifiedName(name);
    const isLegacyReplacement = legacyReplaceFunctions.has(shortName);
    const recommendation = isLegacyReplacement ? "replace" : "retain";
    return {
      type: "function",
      name,
      definitionCount: definitions.length,
      signatures: [...new Set(definitions.map((item) => item.signature))],
      latestDefinition: definitions.at(-1),
      callers: rpcCallerMap.get(shortName) ?? [],
      recommendation,
      confidence: isLegacyReplacement ? "high" : "low",
      decisionRequired: !isLegacyReplacement,
      rationale: isLegacyReplacement
        ? "Reviewed W0-RS authority replacement requires removal of this legacy trust path after replacement proof."
        : "Privileged/static signal requires Phase B semantic and product-intent review before canonicalization.",
    };
  });

function latestUnique(objects) {
  const map = new Map();
  for (const object of objects) map.set(`${object.type}:${object.name}`, object);
  return [...map.values()].sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
}

const baselineObjects = latestUnique([...tables, ...enums, ...extensions, ...buckets]).map((object) => {
  const tableName = object.name.startsWith("public.") ? object.name : `public.${object.name}`;
  let recommendation = "retain";
  let confidence = "low";
  let decisionRequired = true;
  let rationale = "Present in repository migrations; retain conservatively until Phase B semantic and caller review.";
  if (legacyExcludeTables.has(tableName)) {
    recommendation = "exclude";
    confidence = "high";
    decisionRequired = false;
    rationale = "Dedicated legacy code/email-based authority support object superseded by the approved W0-RS authority model.";
  }
  if (["public.api_keys", "public.api_call_logs"].includes(tableName)) {
    recommendation = "exclude";
    confidence = "medium";
    decisionRequired = true;
    rationale = "Preserve in the historical evidence archive, but exclude from the canonical baseline unless Phase B proves a legitimate consumer. No first-party consumer is currently evidenced.";
  }
  if (["public.lumina_api_keys", "public.lumina_api_usage"].includes(tableName)) {
    recommendation = "retain";
    confidence = "medium";
    decisionRequired = false;
    rationale = "Repository client or Edge-function references support current product use; Phase B must still review grants and RLS.";
  }
  return {
    ...object,
    recommendation,
    confidence,
    decisionRequired,
    rationale,
    prerequisites: legacyExcludeTables.has(tableName)
      ? ["Replacement Super Admin authority is implemented and verified before any legacy authority path is retired."]
      : undefined,
    evidence: object.type === "table" ? { firstPartyCodeReferences: codeReferences(unqualifiedName(object.name)) } : undefined,
  };
});

for (const [name, definitions] of [...functionGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const shortName = unqualifiedName(name);
  const isLegacyReplacement = legacyReplaceFunctions.has(shortName);
  baselineObjects.push({
    type: "function",
    name,
    definitionCount: definitions.length,
    signatures: [...new Set(definitions.map((item) => item.signature))],
    latestDefinition: definitions.at(-1),
    callers: rpcCallerMap.get(shortName) ?? [],
    recommendation: isLegacyReplacement ? "replace" : "retain",
    confidence: isLegacyReplacement ? "high" : "low",
    decisionRequired: !isLegacyReplacement,
    rationale: isLegacyReplacement
      ? "Legacy authority implementation must be replaced only after the replacement path is proven."
      : "Retain conservatively until duplicate, grant, caller, and business semantics are reviewed.",
    prerequisites: isLegacyReplacement
      ? ["Replacement Super Admin authority is implemented and verified before this legacy path is retired."]
      : undefined,
  });
}

baselineObjects.push(
  {
    type: "column",
    name: "public.profiles.email",
    recommendation: "add",
    confidence: "high",
    decisionRequired: false,
    rationale: "Migration 20 references the absent column and generated client types/application behavior expect it; it must not be used as authority.",
  },
  {
    type: "function",
    name: "public.deny_invite_request(uuid)",
    recommendation: "add",
    confidence: "medium",
    decisionRequired: true,
    rationale: "New canonical operation required by the School Admin UI; implement as authenticated, school-scoped, idempotent, and audited without claiming historical migration provenance.",
    requirements: ["authenticated", "school-scoped", "idempotent", "audited", "newly-reviewed-not-historical"],
  },
  {
    type: "enum-value",
    name: "public.app_role.admin",
    recommendation: "replace",
    confidence: "medium",
    decisionRequired: true,
    rationale: "Replace generic admin, but do not remove it until every trust site has a reviewed Super Admin, School Admin, ordinary-role, or narrow-capability replacement.",
    evidence: {
      migrationTrustSites: genericAdminMigrationFiles,
      highSignalClientAuthorityFiles: genericAdminCodeFiles,
      interpretation: "Pattern matches are review targets, not proof that each file grants or trusts generic admin.",
    },
  },
  {
    type: "migration-chain",
    name: "supabase/migrations/*.sql",
    recommendation: "replace",
    confidence: "high",
    decisionRequired: false,
    rationale: "Approved clean rebaseline direction; files remain untouched in W0-RS-1 and must be preserved as evidence during Phase B.",
  },
);

const duplicateFunctions = [...functionGroups.entries()]
  .filter(([, definitions]) => definitions.length > 1)
  .map(([name, definitions]) => ({
    name,
    definitionCount: definitions.length,
    signatures: [...new Set(definitions.map((item) => item.signature))],
    locations: definitions.map(({ file, line }) => ({ file, line })),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const denoTestPaths = walk(join(ROOT, "supabase", "functions"), (path) => /_test\.ts$/.test(path));
const denoTests = denoTestPaths.map((path) => {
  const content = read(path);
  return { file: toRepoPath(path), declaredChecks: [...content.matchAll(/Deno\.test\s*\(/g)].length };
});

const scriptMetadata = [
  ["scripts/adaptiveCoverageAudit.ts", "static-audit", null, "dynamic repository coverage audit"],
  ["scripts/coldStartTest.ts", "node-dependencies", 4, "source assertion calls"],
  ["scripts/consistencyAudit.ts", "static-audit", 9, "required surface contracts"],
  ["scripts/lseA10Integration.test.ts", "node-offline", 23, "runtime observed"],
  ["scripts/lseA8Integration.test.ts", "node-offline", 83, "runtime observed"],
  ["scripts/lseA9LiveBenchmark.ts", "live-benchmark", null, "live benchmark, not a fixed assertion suite"],
  ["scripts/lseContextCache.test.ts", "node-offline", 48, "runtime observed"],
  ["scripts/lseEventNormalizer.test.ts", "node-offline", 66, "runtime observed"],
  ["scripts/lseLessonReducer.test.ts", "node-offline", 25, "runtime observed"],
  ["scripts/lsePriorityScheduler.test.ts", "node-offline", 35, "runtime observed"],
  ["scripts/lseSessionInternals.test.ts", "node-offline", 45, "runtime observed"],
  ["scripts/outcomeMetricsTest.ts", "node-dependencies", 8, "source assertion calls"],
  ["scripts/personaTest.ts", "node-offline", 5, "persona fixtures"],
  ["scripts/teachingOutputDeterminism.test.ts", "node-offline", 4, "deterministic fixtures"],
].map(([file, group, declaredChecks, countBasis]) => ({ file, group, declaredChecks, countBasis }));

const fixedScriptChecks = scriptMetadata.reduce((total, item) => total + (item.declaredChecks ?? 0), 0);
const assertionStyleScriptChecks = scriptMetadata
  .filter((item) => item.group !== "static-audit")
  .reduce((total, item) => total + (item.declaredChecks ?? 0), 0);
const denoCheckCount = denoTests.reduce((total, item) => total + item.declaredChecks, 0);
const databaseContractPath = join(ROOT, "supabase", "tests", "w0rs_authority.sql");
const databaseContractChecks = existsSync(databaseContractPath)
  ? [...canonicalText(read(databaseContractPath)).matchAll(/^-- ASSERT: ([a-z0-9-]+)$/gm)].length
  : 0;

function definitionLocations(shortName) {
  return [...functionGroups.entries()]
    .filter(([name]) => unqualifiedName(name) === shortName)
    .flatMap(([, definitions]) => definitions.map(({ file, line, signature }) => ({ file, line, signature })));
}

const authorityPaths = [
  {
    path: "verify_admin_access_code",
    authorityClass: "retired legacy Super Admin entry path",
    exactAuthority: "Historical evidence validates a shared pre-authentication code that was reused as the reserved identity password. It is absent from the canonical executable schema and active client.",
    reservedSuperAdminAccess: "historical-only",
    repositoryReachability: "not-reachable-in-canonical-system",
    callers: rpcCallerMap.get("verify_admin_access_code") ?? [],
    definitions: definitionLocations("verify_admin_access_code"),
    disablementImpact: "None in the canonical application; the replacement uses normal authentication plus immutable UUID assignment and AAL2.",
    recommendation: "retired-after-replacement",
    confidence: "high",
  },
  {
    path: "verify_super_admin_code",
    authorityClass: "retired legacy Super Admin UI verification path",
    exactAuthority: "Historical evidence returned code-verification state used for a browser session flag. It is absent from the canonical executable schema and active client.",
    reservedSuperAdminAccess: "historical-only",
    repositoryReachability: "not-reachable-in-canonical-system",
    callers: rpcCallerMap.get("verify_super_admin_code") ?? [],
    definitions: definitionLocations("verify_super_admin_code"),
    disablementImpact: "None in the canonical application; the replacement trusts only server-confirmed assignment plus AAL2.",
    recommendation: "retired-after-replacement",
    confidence: "high",
  },
  {
    path: "grant_admin_via_code",
    authorityClass: "retired legacy generic admin grant",
    exactAuthority: "Historical evidence added persistent generic admin authority to a caller-supplied target UUID. Generic admin is absent from the canonical role enum and executable schema.",
    reservedSuperAdminAccess: "historical-only",
    repositoryReachability: "not-reachable-in-canonical-system",
    callers: rpcCallerMap.get("grant_admin_via_code") ?? [],
    definitions: definitionLocations("grant_admin_via_code"),
    disablementImpact: "None in the canonical application; platform and School Admin assignments use distinct reviewed boundaries.",
    recommendation: "retired-after-replacement",
    confidence: "high",
  },
  {
    path: "activate-school / activate_school",
    authorityClass: "retired Edge path plus canonical School Admin activation",
    exactAuthority: "The legacy service-role Edge Function is preserved outside the deployable tree. The canonical authenticated RPC derives auth.uid(), atomically consumes a hashed code, creates only an active school-scoped membership, and never creates generic admin.",
    reservedSuperAdminAccess: "none",
    repositoryReachability: "canonical-RPC-called-by-ActivateSchool-page; legacy-edge-excluded",
    callers: rpcCallerMap.get("activate_school") ?? [],
    definitions: definitionLocations("activate_school"),
    historicalDefinition: "supabase/functions-disabled/activate-school/index.ts",
    disablementImpact: "Disabling the canonical RPC blocks new School Admin onboarding. The retired Edge Function has no active caller.",
    recommendation: "replacement-active-legacy-excluded",
    confidence: "high",
  },
];

const outputs = {
  "repository-truth-map.json": {
    schemaVersion: 1,
    scope: "W0-RS canonical repository evidence",
    migrations: {
      count: migrationRecords.length,
      fourteenDigitVersions: migrationRecords.filter((item) => item.versionDigits === 14).length,
      nonFourteenDigitVersions: migrationRecords.filter((item) => item.versionDigits !== 14).map((item) => item.file),
      uniqueVersions: new Set(migrationRecords.map((item) => item.version)).size === migrationRecords.length,
      files: migrationRecords,
    },
    schemaEvents: {
      functionDefinitions: functionDefinitions.length,
      uniqueFunctionNames: functionGroups.size,
      duplicateFunctionNames: duplicateFunctions.length,
      tableCreateEvents: tables.length,
      enumCreateEvents: enums.length,
      extensionCreateEvents: extensions.length,
      policyCreateEvents: policies.length,
      privilegedGrantOrRevokeStatements: privilegeStatements.length,
      storageBucketEvidence: latestUnique(buckets),
      realtimePublicationAdditions: publications,
    },
    callers: { rpcCalls, edgeFunctionCalls: edgeCalls },
    environmentVariableNames: [...envReferences.entries()]
      .map(([name, files]) => ({ name, files: [...files].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    oldBackendCoupling,
    lockfiles: ["bun.lock", "bun.lockb", "package-lock.json"].filter((file) => existsSync(join(ROOT, file))),
  },
  "privileged-objects.json": {
    schemaVersion: 1,
    classificationRule: "Recommendations only; retain is conservative and does not attest security.",
    duplicateFunctions,
    privilegedObjects,
    policiesWithPrivilegeSignals: policies.filter((policy) => policy.privilegedSignals.length > 0),
    privilegeStatements,
  },
  "authority-paths.json": {
    schemaVersion: 1,
    roleDefinitions: {
      superAdmin: "Platform-wide authority requiring an active immutable auth.users.id assignment and an AAL2 JWT.",
      genericAdmin: "Retired legacy user_roles authority; absent from the canonical role enum and never equivalent to Super Admin.",
      schoolAdmin: "Active, approved School Admin profile plus active membership for one school; never implies generic admin or Super Admin.",
    },
    paths: authorityPaths,
  },
  "service-role-boundaries.json": {
    schemaVersion: 1,
    count: serviceRoleBoundaries.length + disabledServiceRoleBoundaries.length,
    deployableCount: serviceRoleBoundaries.length,
    excludedCount: disabledServiceRoleBoundaries.length,
    interpretation: "Static boundary evidence plus explicit deployability. Absence of a first-party caller or auth signal is not proof of safety, reachability, or vulnerability.",
    boundaries: [...serviceRoleBoundaries, ...disabledServiceRoleBoundaries].sort((a, b) => a.file.localeCompare(b.file)),
  },
  "baseline-classification.json": {
    schemaVersion: 1,
    status: "Canonical rebaseline decisions with historical evidence retained separately",
    allowedRecommendations: ["retain", "replace", "add", "exclude"],
    safetyConstraints: [
      "Preserve legitimate School Admin onboarding without generic-admin escalation.",
      "Do not remove any legacy Super Admin path before replacement authority is implemented and verified.",
      "Do not treat absence of a first-party caller as proof that an object or endpoint is unused.",
    ],
    objects: baselineObjects.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
  },
  "test-manifest.json": {
    schemaVersion: 1,
    runner: "scripts/w0rs/run-tests.mjs",
    deno: { files: denoTests.length, declaredChecks: denoCheckCount, tests: denoTests },
    database: {
      files: databaseContractChecks > 0 ? 1 : 0,
      declaredChecks: databaseContractChecks,
      command: "psql -v ON_ERROR_STOP=1 -f supabase/tests/w0rs_authority.sql",
      tests: databaseContractChecks > 0
        ? [{ file: "supabase/tests/w0rs_authority.sql", group: "database-contract", declaredChecks: databaseContractChecks, countBasis: "versioned ASSERT markers executed transactionally in the canonical CI replica" }]
        : [],
    },
    scripts: {
      files: scriptMetadata.length,
      fixedDeclaredChecksIncludingAudits: fixedScriptChecks,
      assertionStyleFixedChecks: assertionStyleScriptChecks,
      tests: scriptMetadata,
    },
    reconciliation: {
      priorClaim: 549,
      currentFixedAssertionStyleMinimum: denoCheckCount + assertionStyleScriptChecks + databaseContractChecks,
      currentFixedIncludingNineSurfaceAudit: denoCheckCount + fixedScriptChecks + databaseContractChecks,
      manifestBackedFixedFiles: denoTests.length + scriptMetadata.filter((item) => item.declaredChecks !== null).length + (databaseContractChecks > 0 ? 1 : 0),
      dynamicOrBenchmarkFilesExcludedFromFixedTotal: scriptMetadata.filter((item) => item.declaredChecks === null).map((item) => item.file),
      conclusion: "The prior 549 figure is not reproducible from the current tree and must not be used as a gate until a versioned manifest defines its scope.",
    },
  },
};

mkdirSync(EVIDENCE_DIR, { recursive: true });
let differences = 0;
for (const [name, value] of Object.entries(outputs)) {
  const path = join(EVIDENCE_DIR, name);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (MODE === "check") {
    if (!existsSync(path) || read(path) !== serialized) {
      console.error(`OUT-OF-DATE ${toRepoPath(path)}`);
      differences += 1;
    } else {
      console.log(`OK ${toRepoPath(path)}`);
    }
  } else {
    writeFileSync(path, serialized);
    console.log(`WROTE ${toRepoPath(path)}`);
  }
}

if (differences > 0) process.exit(1);
console.log(`SUMMARY migrations=${migrationRecords.length} functionDefinitions=${functionDefinitions.length} serviceRoleFiles=${serviceRoleBoundaries.length} denoChecks=${denoCheckCount} databaseChecks=${databaseContractChecks}`);
