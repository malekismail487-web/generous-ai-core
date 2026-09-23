import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { basename, dirname, join, resolve } from "node:path";
import { NyxChatSession } from "../../src/lib/codelab/cli/nyxChatSession";
import { NyxIsolatedCandidateWriter } from "../../src/lib/codelab/cli/nyxIsolatedCandidate";
import { nyxSafeRelativePath } from "../../src/lib/codelab/cli/nyxChatProtocol";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

interface Options {
  repo: string | null;
  scope: string[];
  edit: string | null;
  verify: string | null;
  ask: string | null;
  color: boolean;
  help: boolean;
}

function parseOptions(args: readonly string[]): Options {
  const options: Options = { repo: null, scope: [], edit: null, verify: null, ask: null, color: true, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--no-color") { options.color = false; continue; }
    const value = args[++index];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--repo") options.repo = value;
    else if (arg === "--scope") options.scope.push(value);
    else if (arg === "--edit") options.edit = value;
    else if (arg === "--verify") options.verify = value;
    else if (arg === "--ask") options.ask = value;
    else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

function printHelp(): void {
  process.stdout.write(`NYX / isolated engineering console\n\nUsage: npm run omega:nyx:cli -- [--repo PATH] [--scope RELATIVE_PATH] [--edit RELATIVE_FILE] [--verify RELATIVE_MJS] [--ask QUESTION]\n\nThe conversation is natural language. No model-generated shell commands are executed. --edit limits candidate mutation to one file, and --verify selects one fixed Node .mjs checker copied into an isolated candidate. The authoritative repository remains unchanged. The NVIDIA endpoint is the only network path, and requires NVIDIA_API_KEY plus OMEGA_ALLOW_NVIDIA_NETWORK=1.\n`);
}

const options = parseOptions(process.argv.slice(2));
if (options.help) { printHelp(); process.exit(0); }
const tty = process.stdout.isTTY && options.color;
const paint = (code: string, value: string): string => tty ? `\x1b[${code}m${value}\x1b[0m` : value;
const dim = (value: string): string => paint("2", value);
const cyan = (value: string): string => paint("36", value);
const violet = (value: string): string => paint("35", value);
const green = (value: string): string => paint("32", value);
const amber = (value: string): string => paint("33", value);
const io = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let writer: NyxIsolatedCandidateWriter | null = null;
let reader: ReadOnlyRepositoryExecutor | null = null;

async function prompt(label: string, fallback: string): Promise<string> {
  const answer = (await io.question(`${cyan(label)} ${dim(`[${fallback}]`)} › `)).trim();
  return answer || fallback;
}

try {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") throw new Error("Set OMEGA_ALLOW_NVIDIA_NETWORK=1 to authorize only the NVIDIA model endpoint.");
  if (!process.env.NVIDIA_API_KEY?.trim()) throw new Error("NVIDIA_API_KEY is unavailable. Inject it privately; never put it in a repository file.");
  const repositoryInput = options.repo || (options.ask ? process.cwd() : await prompt("Repository", process.cwd()));
  const repositoryRoot = await realpath(resolve(repositoryInput));
  const editable = options.edit || (options.ask ? "" : await prompt("Editable relative file (blank = chat/read only)", ""));
  if (editable && !nyxSafeRelativePath(editable)) throw new Error("editable path must be a normalized relative file");
  const verifier = options.verify || (editable && !options.ask ? await prompt("Verification .mjs (blank = not configured)", "") : "");
  if (verifier && (!nyxSafeRelativePath(verifier) || !verifier.endsWith(".mjs"))) throw new Error("verifier must be a relative .mjs file");
  const defaultScope = editable ? dirname(editable).replace(/\\/g, "/") : existsSync(join(repositoryRoot, "src")) ? "src" : ".";
  const scopes = options.scope.length ? options.scope : [defaultScope];
  if (scopes.some((scope) => scope !== "." && !nyxSafeRelativePath(scope))) throw new Error("read scope must be normalized and relative");
  const now = Date.now();
  reader = await ReadOnlyRepositoryExecutor.create({ executorId: `NYX-CLI-R1-${now}`,
    tokenId: `NYX-CLI-R1-TOKEN-${now}`, repositoryRoot, resourceScopes: scopes,
    issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + 3_600_000,
    constraints: { maxFileBytes: 24_000, maxDirectoryEntries: 80,
      allowedExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".py", ".rs", ".go"] },
    issuer: "NYX-CLI-LOCAL-USER", auditIdentity: `NYX-CLI-READ-${now}` });
  if (editable) {
    if (!scopes.some((scope) => scope === "." || editable === scope || editable.startsWith(`${scope}/`))) {
      throw new Error("editable path is outside the declared read scope");
    }
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8", timeout: 5_000 }).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) throw new Error("Git HEAD is not a valid candidate binding");
    writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: repositoryRoot, editablePath: editable,
      verifierPath: verifier || null, candidateCommit: head, maxCandidateBytes: 32_768, maxVerifierMs: 10_000 });
  }
  const provider = NvidiaNimProvider.create({ providerId: "NYX-CLI-NEMOTRON", model: process.env.NVIDIA_NIM_MODEL?.trim()
      || "nvidia/nemotron-3-ultra-550b-a55b", authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64_000,
    maxOutputTokens: 4_096, timeoutMs: 90_000,
    onCapacityProgress: (progress) => {
      if (progress.state === "WAITING_FOR_CAPACITY") process.stdout.write(`${amber("NYX paused")}: provider capacity; retry in ${progress.secondsUntilRetry ?? "?"}s. No action is executing.\n`);
    } });
  const session = NyxChatSession.create({ sessionId: `NYX-CLI-${now}`, model: provider, reader,
    candidateWriter: writer, editablePaths: editable ? [editable] : [], maxModelCallsPerTurn: 7,
    maxCandidatesPerTurn: editable ? 2 : 0, maxTurnMs: 300_000, maxOutputTokens: 4_096 });
  process.stdout.write(`\n${violet("╭─ ΝΥΞ / OMEGA ───────────────────────────────────────────╮")}\n`);
  process.stdout.write(`${violet("│")} ${green("LIVE COGNITION")} Nemotron · ${green("R1 READ")} ${scopes.join(", ")}\n`);
  process.stdout.write(`${violet("│")} ${editable ? amber(`ISOLATED EDIT ${editable}`) : dim("EDIT UNAVAILABLE")} · ${verifier ? green(`TEST ${verifier}`) : dim("NO VERIFIER")}\n`);
  process.stdout.write(`${violet("│")} ${dim(`SOURCE READ-ONLY · NO GENERAL SHELL · NO DESKTOP · ${basename(repositoryRoot)}`)}\n`);
  process.stdout.write(`${violet("╰──────────────────────────────────────────────────────────╯")}\n`);
  if (editable && !verifier) process.stdout.write(`${amber("Note:")} candidate edits can be isolated, but cannot be called verified without a checker.\n`);
  if (!options.ask) process.stdout.write(`${dim("Talk naturally. Type /exit to close; /status to see the boundary.")}\n\n`);
  while (true) {
    const input = options.ask ?? (await io.question(`${cyan("you")} › `));
    if (!input || input.trim() === "/exit") break;
    if (input.trim() === "/status") {
      process.stdout.write(`${dim(`Repository ${repositoryRoot}; read scopes ${scopes.join(", ")}; edit ${editable || "none"}; verifier ${verifier || "none"}; source writes denied.`)}\n`);
      if (options.ask) break;
      continue;
    }
    const result = await session.turn(input);
    process.stdout.write(`\n${violet("NYX")} › ${result.message}\n`);
    process.stdout.write(`${dim(`Outcome ${result.outcome} · model calls ${result.modelCalls} · tokens ${result.modelTokens ?? "unknown"} · E3/E4 events ${result.events.length} · source mutation false`)}\n\n`);
    if (options.ask) { if (result.outcome === "MODEL_FAILURE" || result.outcome === "REJECTED") process.exitCode = 2; break; }
  }
} catch (error) {
  process.stderr.write(`${amber("NYX unavailable")}: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 2;
} finally {
  reader?.terminate(Date.now(), "nyx_cli_session_closed");
  if (writer) {
    const closed = await writer.close();
    if (closed.decision === "QUARANTINED") {
      process.stderr.write(`${amber("Isolated scratch cleanup needs manual review")}: ${closed.path}\n`);
      process.exitCode = 2;
    }
  }
  io.close();
}
