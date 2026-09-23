import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY) {
  throw new Error("live_cli_evaluation_requires_explicit_nvidia_endpoint_and_injected_secret");
}
const parent = await mkdtemp(join(tmpdir(), "nyx-cli-live-eval-"));
const repo = join(parent, "repository fixture");
const original = "export function normalizeLabel(value) { return value.trim(); }\n";
const verifier = `import { normalizeLabel } from '../src/normalize-label.mjs';
for (const [input, expected] of [[' A ', 'a'], ['B', 'b'], ['  C  ', 'c']]) {
  if (normalizeLabel(input) !== expected) process.exit(2);
}
console.log('TEST_PASS');
`;
try {
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "tools"));
  await writeFile(join(repo, "src", "normalize-label.mjs"), original);
  await writeFile(join(repo, "tools", "verify.mjs"), verifier);
  execFileSync("git", ["init", "-q", repo], { timeout: 5_000 });
  execFileSync("git", ["-C", repo, "add", "--", "src/normalize-label.mjs", "tools/verify.mjs"], { timeout: 5_000 });
  execFileSync("git", ["-C", repo, "-c", "user.name=NYX-Eval", "-c", "user.email=nyx-eval@example.invalid",
    "commit", "-q", "-m", "Fixture baseline"], { timeout: 5_000 });
  const command = spawnSync(process.execPath, ["--experimental-strip-types", "--import",
    resolve("scripts/w0rs/register-typescript-loader.mjs"), resolve("scripts/omega/nyx-cli.ts"),
    "--repo", repo, "--scope", "src", "--edit", "src/normalize-label.mjs",
    "--verify", "tools/verify.mjs", "--ask",
    "Repair normalizeLabel so it returns lowercase trimmed strings. Inspect the source, propose a minimal edit, and use Omega's fixed verifier. Stop if verification is unavailable."],
  { encoding: "utf8", timeout: 300_000, maxBuffer: 256_000, env: process.env });
  const sourceUnchanged = await readFile(join(repo, "src", "normalize-label.mjs"), "utf8") === original;
  const output = `${command.stdout ?? ""}\n${command.stderr ?? ""}`;
  const verified = command.status === 0 && /Outcome CANDIDATE_VERIFIED/.test(output)
    && /source mutation false/.test(output) && sourceUnchanged;
  const summary = { schemaVersion: 1, taskId: "NYX-CLI-LIVE-ISOLATED-001", model: process.env.NVIDIA_NIM_MODEL?.trim()
    || "nvidia/nemotron-3-ultra-550b-a55b", result: verified ? "VERIFIED_IN_ISOLATION" : "EMPIRICALLY_NOT_YET_VERIFIED",
    exitCode: command.status, timedOut: command.error?.message.includes("ETIMEDOUT") ?? false,
    sourceUnchanged, declaredVerifierPassed: /Outcome CANDIDATE_VERIFIED/.test(output),
    generalShellAuthorityGranted: false, desktopAuthorityGranted: false, productionAuthorityGranted: false };
  console.log(`NYX_CLI_LIVE_SUMMARY ${JSON.stringify(summary)}`);
  if (!verified) {
    // This contains no credential, raw model prompt, or source bytes; only terminal-visible outcome diagnostics.
    console.error(output.slice(-8_000));
    process.exitCode = 2;
  }
} finally {
  await rm(parent, { recursive: true });
}
