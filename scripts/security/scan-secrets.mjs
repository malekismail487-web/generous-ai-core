import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

const HIGH_CONFIDENCE_PATTERNS = Object.freeze([
  { id: "ale-live-key", pattern: /ale_live_[A-Za-z0-9]{20,}/ },
  { id: "github-token", pattern: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { id: "openai-style-key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
]);

const TRACKED_SECRET_FILENAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
]);

function trackedFiles() {
  const run = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "buffer",
  });
  if (run.status !== 0) {
    const detail = run.stderr?.toString("utf8").trim() || "git ls-files failed";
    throw new Error(detail);
  }
  return run.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

const findings = [];
let scannedTextFiles = 0;

for (const relativePath of trackedFiles()) {
  if (TRACKED_SECRET_FILENAMES.has(basename(relativePath))) {
    findings.push({ rule: "tracked-secret-file", path: relativePath, line: null });
  }

  const buffer = readFileSync(resolve(ROOT, relativePath));
  if (buffer.length > MAX_TEXT_BYTES || isProbablyBinary(buffer)) continue;
  scannedTextFiles += 1;
  const lines = buffer.toString("utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of HIGH_CONFIDENCE_PATTERNS) {
      if (rule.pattern.test(lines[index])) {
        findings.push({ rule: rule.id, path: relativePath, line: index + 1 });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`SECRET_SCAN_FAILED findings=${findings.length}`);
  for (const finding of findings) {
    const location = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
    console.error(`${finding.rule} ${location}`);
  }
  process.exit(1);
}

console.log(`SECRET_SCAN_PASSED textFiles=${scannedTextFiles} findings=0`);
