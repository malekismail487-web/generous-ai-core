import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NyxLocalWebConsole } from "../../src/lib/codelab/cli/nyxLocalWebConsole";

const args = process.argv.slice(2);
let repository = process.cwd();
let openBrowser = true;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--help" || args[index] === "-h") {
    process.stdout.write(
      "Νύξ local chat console\nUsage: nyx [--repo PATH] [--no-open]\nFrom source: npm run omega:nyx:cli -- [--repo PATH] [--no-open]\nThe browser UI binds to 127.0.0.1 only. NVIDIA_API_KEY must be injected privately; OMEGA_ALLOW_NVIDIA_NETWORK=1 is required for model use.\n",
    );
    process.exit(0);
  }
  if (args[index] === "--no-open") {
    openBrowser = false;
    continue;
  }
  if (args[index] === "--repo" && args[index + 1]) {
    repository = args[++index];
    continue;
  }
  throw new Error(`unknown_or_incomplete_nyx_ui_option:${args[index]}`);
}

const consoleUi = new NyxLocalWebConsole({
  assetRoot: fileURLToPath(new URL("./nyx-ui/", import.meta.url)),
  environment: process.env,
  defaultRepository: repository,
});
const url = await consoleUi.start();
process.stdout.write(
  `\nΝύξ is ready at ${url}\nThis one-time local URL is the session key. Keep it private. Press Ctrl+C to stop; source repository writes remain disabled.\n\n`,
);
if (openBrowser && process.stdout.isTTY) {
  const executable =
    process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  execFile(
    executable,
    [url],
    { windowsHide: true, timeout: 5_000 },
    (error) => {
      if (error)
        process.stdout.write(
          "Browser did not open automatically; paste the local URL above into your browser.\n",
        );
    },
  );
}
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const closed = await consoleUi.close();
  if (!closed.cleaned) {
    process.stderr.write(
      `Isolated scratch cleanup needs manual review: ${closed.quarantinePath}\n`,
    );
    process.exitCode = 2;
  }
}
process.once("SIGINT", () => {
  void shutdown().then(() => process.exit());
});
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit());
});
