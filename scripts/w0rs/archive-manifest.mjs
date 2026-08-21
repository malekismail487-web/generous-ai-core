import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveDir = join(root, "supabase", "legacy", "lovable-migrations");
const manifestPath = join(archiveDir, "manifest.json");
const checksumPath = join(archiveDir, "checksums.sha256");
const check = process.argv.includes("--check");
const write = process.argv.includes("--write");

if (check === write) {
  throw new Error("Choose exactly one of --check or --write");
}

const canonicalLf = (buffer) => Buffer.from(
  buffer.toString("utf8").replace(/\r\n?/g, "\n"),
  "utf8",
);
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");
const gitBlobId = (bytes) => digest(
  "sha1",
  Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]),
);
const repoPath = (path) => relative(root, path).replaceAll("\\", "/");

const filenames = readdirSync(archiveDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right, "en"));

if (filenames.length !== 128) {
  throw new Error(`Expected 128 archived SQL migrations, found ${filenames.length}`);
}

const entries = filenames.map((filename, zeroBasedIndex) => {
  const canonical = canonicalLf(readFileSync(join(archiveDir, filename)));
  const version = filename.split("_", 1)[0];

  return {
    order: zeroBasedIndex + 1,
    version,
    filename,
    originalPath: `supabase/migrations/${filename}`,
    archivePath: `supabase/legacy/lovable-migrations/${filename}`,
    classification: "non-executable historical evidence",
    retentionReason: "Preserved verbatim as repository evidence; not part of the canonical deployment path.",
    canonicalLfBytes: canonical.length,
    canonicalLfSha256: digest("sha256", canonical),
    gitBlobId: gitBlobId(canonical),
  };
});

const manifest = {
  schemaVersion: 1,
  status: "non-executable historical evidence",
  executable: false,
  sourceCount: entries.length,
  ordering: "filename ascending, matching Supabase migration discovery order",
  canonicalization: "UTF-8 bytes with CRLF and lone CR normalized to LF; no trailing-newline rewrite",
  integrity: {
    canonicalLfSha256: "SHA-256 after documented line-ending normalization",
    gitBlobId: "Git SHA-1 blob identity computed from canonical LF bytes, matching repository storage",
  },
  entries,
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
const checksums = `${entries
  .map((entry) => `${entry.canonicalLfSha256}  ${entry.filename}`)
  .join("\n")}\n`;

const compare = (path, expected) => {
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) {
    throw new Error(`${repoPath(path)} is out of date; run node scripts/w0rs/archive-manifest.mjs --write`);
  }
};

if (write) {
  writeFileSync(manifestPath, json, "utf8");
  writeFileSync(checksumPath, checksums, "utf8");
  console.log(`Wrote ${repoPath(manifestPath)} and ${repoPath(checksumPath)} for ${entries.length} migrations.`);
} else {
  compare(manifestPath, json);
  compare(checksumPath, checksums);
  console.log(`Verified ${entries.length} archived migrations and both deterministic integrity artifacts.`);
}
