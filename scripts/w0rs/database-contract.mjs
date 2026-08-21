import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testPath = resolve(root, "supabase/tests/w0rs_authority.sql");
const source = readFileSync(testPath, "utf8").replace(/\r\n?/g, "\n");
const assertions = [...source.matchAll(/^-- ASSERT: ([a-z0-9-]+)$/gm)].map((match) => match[1]);
const unique = new Set(assertions);

if (assertions.length !== 31) {
  throw new Error(`Expected 31 database contract assertions, found ${assertions.length}`);
}
if (unique.size !== assertions.length) {
  throw new Error("Database contract assertion identifiers must be unique");
}
if (!source.includes("BEGIN;") || !source.includes("ROLLBACK;")) {
  throw new Error("Database contract fixtures must be transaction-scoped and rolled back");
}
if (/malekismail487|SUPABASE_(?:SERVICE_ROLE|DB_PASSWORD)|sb_secret_|eyJ[A-Za-z0-9_-]{10,}\./i.test(source)) {
  throw new Error("Database contract contains a forbidden identity or secret-like value");
}

console.log(`Verified ${assertions.length} deterministic database contract assertions in supabase/tests/w0rs_authority.sql.`);
