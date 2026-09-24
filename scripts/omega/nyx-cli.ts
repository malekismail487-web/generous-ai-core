import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { basename, dirname, join, resolve } from "node:path";
import { NyxChatSession } from "../../src/lib/codelab/cli/nyxChatSession";
import { NyxIsolatedCandidateWriter } from "../../src/lib/codelab/cli/nyxIsolatedCandidate";
import { NyxScopedComputerHost, nyxHostExecutableAliasPresent } from "../../src/lib/codelab/cli/nyxScopedComputerHost";
import { nyxSafeRelativePath } from "../../src/lib/codelab/cli/nyxChatProtocol";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

interface Options {
  repo: string | null;
  scope: string[];
  edit: string | null;
  verify: string | null;
  terminalChecks: string[];
  desktopPid: number | null;
  ask: string | null;
  color: boolean;
  help: boolean;
}

function parseOptions(args: readonly string[]): Options {
  const options: Options = { repo: null, scope: [], edit: null, verify: null, terminalChecks: [],
    desktopPid: null, ask: null, color: true, help: false };
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
    else if (arg === "--terminal-check") options.terminalChecks.push(value);
    else if (arg === "--desktop-pid") options.desktopPid = Number(value);
    else if (arg === "--ask") options.ask = value;
    else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

function printHelp(): void {
  process.stdout.write(`NYX / isolated engineering console\n\nUsage: npm run omega:nyx:cli -- [--repo PATH] [--scope RELATIVE_PATH] [--edit RELATIVE_FILE] [--verify RELATIVE_MJS] [--terminal-check RELATIVE_JS] [--desktop-pid PID] [--ask QUESTION]\n\nThe conversation is natural language. No model-generated shell commands are executed. --edit limits candidate mutation to one file, --verify selects one fixed Node .mjs checker in isolation, and --terminal-check enables Node syntax checking of an authorized file on a disposable copy. --desktop-pid opts in to one selected Windows app via Microsoft WinApp CLI; every UI mutation requires confirmation. The authoritative repository remains unchanged. The NVIDIA endpoint is the only model network path, and requires NVIDIA_API_KEY plus OMEGA_ALLOW_NVIDIA_NETWORK=1.\n`);
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
const terminalSafe = (value: string): string => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
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
  if (options.terminalChecks.some((path) => !nyxSafeRelativePath(path) || !/\.(?:mjs|cjs|js)$/.test(path))) {
    throw new Error("terminal checks require explicit relative .js/.mjs/.cjs files");
  }
  if (options.desktopPid !== null && (!Number.isSafeInteger(options.desktopPid) || options.desktopPid < 1 || options.ask)) {
    throw new Error("desktop control requires an interactive session and an explicit positive PID");
  }
  const defaultScope = editable ? dirname(editable).replace(/\\/g, "/") : existsSync(join(repositoryRoot, "src")) ? "src" : ".";
  const scopes = options.scope.length ? options.scope : [defaultScope];
  if (scopes.some((scope) => scope !== "." && !nyxSafeRelativePath(scope))) throw new Error("read scope must be normalized and relative");
  if (options.terminalChecks.some((path) => !scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`)))) {
    throw new Error("terminal check path is outside declared read scope");
  }
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
  let desktopPid = options.desktopPid;
  if (desktopPid !== null) {
    const answer = (await io.question(`${amber("Desktop consent")} › Allow NYX to observe UI labels in PID ${desktopPid} and send them to the NVIDIA model? [y/N] `)).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") desktopPid = null;
  }
  const winappPath = process.platform === "win32" && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "winapp.exe") : null;
  const computerHost = NyxScopedComputerHost.create({ reader, allowedCheckPaths: options.terminalChecks,
    desktopPid, winappPath: winappPath && nyxHostExecutableAliasPresent(winappPath) ? winappPath : null,
    approveDesktopAction: async (action) => {
      const detail = action.value !== null ? ` value ${JSON.stringify(action.value)}` : "";
      const answer = (await io.question(`${amber("Approve desktop action")} › ${action.kind} ${action.selector} (${JSON.stringify(action.elementName)}, ${action.controlType}) on PID ${action.pid} HWND ${action.hwnd}${detail}? [y/N] `)).trim().toLowerCase();
      return answer === "y" || answer === "yes";
    } });
  const session = NyxChatSession.create({ sessionId: `NYX-CLI-${now}`, model: provider, reader,
    candidateWriter: writer, computerHost, editablePaths: editable ? [editable] : [], maxModelCallsPerTurn: 7,
    maxCandidatesPerTurn: editable ? 2 : 0, maxTurnMs: 300_000, maxOutputTokens: 4_096 });
  process.stdout.write(`\n${violet("╭─ ΝΥΞ / OMEGA ───────────────────────────────────────────╮")}\n`);
  process.stdout.write(`${violet("│")} ${green("LIVE COGNITION")} Nemotron · ${green("R1 READ")} ${scopes.join(", ")}\n`);
  process.stdout.write(`${violet("│")} ${editable ? amber(`ISOLATED EDIT ${editable}`) : dim("EDIT UNAVAILABLE")} · ${verifier ? green(`TEST ${verifier}`) : dim("NO VERIFIER")}\n`);
  process.stdout.write(`${violet("│")} ${computerHost.terminalCheckAvailable ? green("SCOPED SYNTAX CHECK") : dim("TERMINAL CHECK UNAVAILABLE")} · ${computerHost.desktopAvailable ? amber(`APP PID ${desktopPid}`) : dim("DESKTOP UNAVAILABLE")}\n`);
  process.stdout.write(`${violet("│")} ${dim(`SOURCE READ-ONLY · NO GENERAL SHELL · NO COORDINATE CONTROL · ${basename(repositoryRoot)}`)}\n`);
  process.stdout.write(`${violet("╰──────────────────────────────────────────────────────────╯")}\n`);
  if (editable && !verifier) process.stdout.write(`${amber("Note:")} candidate edits can be isolated, but cannot be called verified without a checker.\n`);
  if (!options.ask) process.stdout.write(`${dim("Talk naturally. Type /tools for the capability palette, /status for the boundary, or /exit to close.")}\n\n`);
  while (true) {
    const input = options.ask ?? (await io.question(`${cyan("you")} › `));
    if (!input || input.trim() === "/exit") break;
    if (input.trim() === "/status") {
      process.stdout.write(`${dim(`Repository ${repositoryRoot}; read scopes ${scopes.join(", ")}; edit ${editable || "none"}; verifier ${verifier || "none"}; terminal checks ${options.terminalChecks.join(", ") || "none"}; desktop PID ${desktopPid ?? "none"}; source writes denied.`)}\n`);
      if (options.ask) break;
      continue;
    }
    if (input.trim() === "/tools") {
      process.stdout.write(`${violet("Ω CAPABILITY PALETTE")}\n`);
      process.stdout.write(`  ${green("REPOSITORY OBSERVATION")}  ${scopes.join(", ")} · attributed R1 reads\n`);
      process.stdout.write(`  ${editable ? amber("ISOLATED CANDIDATE") : dim("ISOLATED CANDIDATE")}  ${editable || "not authorized"} · source unchanged\n`);
      process.stdout.write(`  ${verifier ? green("FIXED VERIFICATION") : dim("FIXED VERIFICATION")}  ${verifier || "not configured"}\n`);
      process.stdout.write(`  ${computerHost.terminalCheckAvailable ? green("TERMINAL SYNTAX CHECK") : dim("TERMINAL SYNTAX CHECK")}  ${options.terminalChecks.join(", ") || "not authorized"} · disposable copy only\n`);
      process.stdout.write(`  ${computerHost.desktopAvailable ? amber("DESKTOP UI AUTOMATION") : dim("DESKTOP UI AUTOMATION")}  ${computerHost.desktopAvailable ? `PID ${desktopPid} · inspect, approved input/click` : "not authorized"}\n`);
      process.stdout.write(`  ${dim("GENERAL SHELL / NETWORK / DEPLOYMENT / SOURCE WRITE  unavailable")}\n\n`);
      continue;
    }
    const result = await session.turn(input);
    process.stdout.write(`\n${violet("NYX")} › ${terminalSafe(result.message)}\n`);
    process.stdout.write(`${dim(`Outcome ${result.outcome} · model calls ${result.modelCalls} · tokens ${result.modelTokens ?? "unknown"} · E3/E4 events ${result.events.length} · source mutation false`)}\n\n`);
    if (result.events.length > 0) {
      process.stdout.write(`${dim("EVIDENCE TRAIL")}\n`);
      for (const event of result.events) {
        process.stdout.write(`${dim(`  ${String(event.sequence).padStart(2, "0")} ${event.eventType.padEnd(9)} ${event.outcome.slice(0, 48).padEnd(48)} ${event.evidenceClass} ${event.evidenceId.slice(0, 28)}`)}\n`);
      }
      process.stdout.write("\n");
    }
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
