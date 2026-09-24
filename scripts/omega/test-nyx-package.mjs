import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = resolve(root, "packages/nyx-windows/nyx.mjs");
const environment = { ...process.env };
delete environment.NVIDIA_API_KEY;
delete environment.OMEGA_ALLOW_NVIDIA_NETWORK;
const child = spawn(process.execPath, [entry, "--repo", root, "--no-open"], {
  cwd: fileURLToPath(new URL("./", import.meta.url)),
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
let errors = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { errors += chunk; });

try {
  const deadline = Date.now() + 10_000;
  let match;
  while (Date.now() < deadline) {
    match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#session=[A-Za-z0-9_-]+/);
    if (match) break;
    if (child.exitCode !== null) throw new Error(`NYX exited before ready: ${errors}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(match, `Bundled NYX did not start: ${errors}`);
  const sessionUrl = new URL(match[0]);
  const token = new URLSearchParams(sessionUrl.hash.slice(1)).get("session");
  assert.match(token ?? "", /^[A-Za-z0-9_-]{43}$/);
  const origin = sessionUrl.origin;
  for (const asset of ["/", "/ui.css", "/ui.js", "/logo.svg"]) {
    const response = await fetch(new URL(asset, origin));
    assert.equal(response.status, 200, `bundled asset ${asset}`);
    assert.ok((await response.text()).length > 100, `empty bundled asset ${asset}`);
  }
  assert.equal((await fetch(`${origin}/api/status`)).status, 403);
  const statusResponse = await fetch(`${origin}/api/status`, {
    headers: { "X-Nyx-Session": token },
  });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.configured, false);
  assert.equal(status.modelCredentialAvailable, false);
  assert.equal(status.defaultRepository, root);
  process.stdout.write("NYX_PACKAGE_SMOKE: PASS (assets, loopback session, no implicit credential)\n");
} finally {
  if (child.exitCode === null) child.kill();
}
