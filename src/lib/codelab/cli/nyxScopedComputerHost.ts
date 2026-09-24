import { execFile } from "node:child_process";
import { lstatSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { ReadOnlyRepositoryExecutor } from "../executor/readOnlyExecutor";
import { nyxCanonical, nyxContainsSecretLike, nyxSafeRelativePath, nyxSha256 } from "./nyxChatProtocol";
import type { NyxComputerAction, NyxComputerHost, NyxComputerResult } from "./nyxChatSession";

const execFileAsync = promisify(execFile);

export interface NyxHostCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type NyxHostCommandRunner = (executable: string, args: readonly string[], timeoutMs: number)
  => Promise<NyxHostCommandResult>;

export interface NyxDesktopApproval {
  readonly kind: "DESKTOP_INVOKE" | "DESKTOP_SET_VALUE";
  readonly pid: number;
  readonly hwnd: number;
  readonly selector: string;
  readonly elementName: string;
  readonly controlType: string;
  readonly value: string | null;
  readonly valueDigest: string | null;
}

export interface NyxScopedComputerConfig {
  readonly reader: ReadOnlyRepositoryExecutor;
  readonly allowedCheckPaths: readonly string[];
  readonly desktopPid: number | null;
  readonly winappPath: string | null;
  readonly approveDesktopAction: (request: NyxDesktopApproval) => Promise<boolean>;
  readonly commandRunner?: NyxHostCommandRunner;
  readonly observedAt?: () => number;
}

interface DesktopElement { readonly selector: string; readonly name: string; readonly controlType: string; }
interface DesktopObservation { readonly hwnd: number; readonly title: string; readonly elements: readonly DesktopElement[];
  readonly digest: string; readonly at: number; }

function safeEnv(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"];
  const env: NodeJS.ProcessEnv = { WINAPP_CLI_TELEMETRY_OPTOUT: "1", NODE_OPTIONS: "" };
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  return env;
}

export function nyxHostExecutableAliasPresent(path: string): boolean {
  try { return lstatSync(path).isFile() || lstatSync(path).isSymbolicLink(); }
  catch { return false; }
}

export const DEFAULT_NYX_HOST_COMMAND_RUNNER: NyxHostCommandRunner = async (executable, args, timeoutMs) => {
  try {
    const result = await execFileAsync(executable, [...args], { windowsHide: true, shell: false, timeout: timeoutMs,
      maxBuffer: 65_536, env: safeEnv() });
    return { exitCode: 0, stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    const value = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return { exitCode: typeof value.code === "number" ? value.code : 124,
      stdout: String(value.stdout ?? "").slice(0, 32_768), stderr: String(value.stderr ?? "").slice(0, 32_768) };
  }
};

function rejected(requestId: string, reason: string): NyxComputerResult {
  return { decision: "REJECTED", reason, observation: null,
    evidenceId: `NYX-COMPUTER-REJECTED-${nyxSha256(`${requestId}:${reason}`).slice(0, 24)}`,
    evidenceClass: "E3", broaderAuthorityGranted: false };
}

function evidence(requestId: string, decision: NyxComputerResult["decision"], reason: string,
  observation: Readonly<Record<string, unknown>> | null, evidenceClass: "E3" | "E4"): NyxComputerResult {
  return { decision, reason, observation,
    evidenceId: `NYX-COMPUTER-${nyxSha256(nyxCanonical({ requestId, decision, reason, observation })).slice(0, 32)}`,
    evidenceClass, broaderAuthorityGranted: false };
}

function collectElements(nodes: unknown, out: DesktopElement[], depth = 0): void {
  if (!Array.isArray(nodes) || depth > 8 || out.length >= 100) return;
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const item = node as Record<string, unknown>;
    const selector = typeof item.selector === "string" ? item.selector : typeof item.elementId === "string" ? item.elementId : null;
    const name = typeof item.name === "string" ? item.name : "";
    const controlType = typeof item.controlType === "string" ? item.controlType : typeof item.type === "string" ? item.type : "UNKNOWN";
    if (selector && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(selector)) {
      out.push({ selector, name: name.slice(0, 100), controlType: controlType.slice(0, 40) });
    }
    if (out.length >= 100) break;
    collectElements(item.children, out, depth + 1);
  }
}

export class NyxScopedComputerHost implements NyxComputerHost {
  readonly terminalCheckAvailable: boolean;
  readonly desktopAvailable: boolean;
  readonly #config: NyxScopedComputerConfig;
  readonly #runner: NyxHostCommandRunner;
  readonly #now: () => number;
  #desktopObservation: DesktopObservation | null = null;

  private constructor(config: NyxScopedComputerConfig) {
    this.#config = config;
    this.#runner = config.commandRunner ?? DEFAULT_NYX_HOST_COMMAND_RUNNER;
    this.#now = config.observedAt ?? Date.now;
    this.terminalCheckAvailable = config.allowedCheckPaths.length > 0;
    this.desktopAvailable = config.desktopPid !== null && config.winappPath !== null;
  }

  static create(config: NyxScopedComputerConfig): NyxScopedComputerHost {
    if (config.allowedCheckPaths.some((path) => !nyxSafeRelativePath(path) || !/\.(?:mjs|cjs|js)$/.test(path))
      || new Set(config.allowedCheckPaths).size !== config.allowedCheckPaths.length
      || (config.desktopPid !== null && (!Number.isSafeInteger(config.desktopPid) || config.desktopPid < 1))
      || (config.winappPath !== null && !config.commandRunner
        && (!isAbsolute(config.winappPath) || basename(config.winappPath).toLowerCase() !== "winapp.exe"
          || !nyxHostExecutableAliasPresent(config.winappPath)))) {
      throw new Error("nyx_computer_host_policy_invalid");
    }
    return new NyxScopedComputerHost(config);
  }

  async execute(action: NyxComputerAction, requestId: string): Promise<NyxComputerResult> {
    if (action.kind === "TERMINAL_CHECK") return this.#terminalCheck(action.path, requestId);
    if (!this.desktopAvailable || this.#config.desktopPid === null || this.#config.winappPath === null) {
      return rejected(requestId, "desktop_capability_unavailable");
    }
    if (action.kind === "DESKTOP_INSPECT") return this.#inspect(requestId);
    const observed = this.#desktopObservation;
    if (!observed || observed.digest !== action.observationDigest || this.#now() - observed.at > 15_000) {
      return rejected(requestId, "desktop_observation_stale_or_unbound");
    }
    const element = observed.elements.find((item) => item.selector === action.selector);
    if (!element) {
      return rejected(requestId, "desktop_selector_not_observed");
    }
    if (!(await this.#windowIdentityCurrent(observed))) {
      this.#desktopObservation = null;
      return rejected(requestId, "desktop_window_identity_changed");
    }
    const approval: NyxDesktopApproval = { kind: action.kind, pid: this.#config.desktopPid,
      hwnd: observed.hwnd, selector: action.selector, elementName: element.name,
      controlType: element.controlType, value: action.kind === "DESKTOP_SET_VALUE" ? action.value : null,
      valueDigest: action.kind === "DESKTOP_SET_VALUE" ? nyxSha256(action.value) : null };
    if (!(await this.#config.approveDesktopAction(approval))) return rejected(requestId, "operator_denied_desktop_action");
    this.#desktopObservation = null;
    if (this.#now() - observed.at > 15_000 || !(await this.#windowIdentityCurrent(observed))) {
      return rejected(requestId, "desktop_window_changed_during_approval");
    }
    if (action.kind === "DESKTOP_INVOKE") {
      const result = await this.#runner(this.#config.winappPath,
        ["ui", "invoke", action.selector, "-w", String(observed.hwnd), "--json"], 8_000);
      return evidence(requestId, result.exitCode === 0 ? "UNVERIFIED" : "REJECTED",
        result.exitCode === 0 ? "ui_invocation_delivered_semantic_effect_requires_reinspection" : "ui_invocation_failed",
        { pid: this.#config.desktopPid, hwnd: observed.hwnd, selector: action.selector,
          commandExitCode: result.exitCode }, "E4");
    }
    if (nyxContainsSecretLike(action.value)) return rejected(requestId, "desktop_value_credential_pattern_blocked");
    const written = await this.#runner(this.#config.winappPath,
      ["ui", "set-value", action.selector, action.value, "-w", String(observed.hwnd), "--json"], 8_000);
    if (written.exitCode !== 0) return evidence(requestId, "REJECTED", "desktop_set_value_failed",
      { commandExitCode: written.exitCode }, "E4");
    const readback = await this.#runner(this.#config.winappPath,
      ["ui", "get-value", action.selector, "-w", String(observed.hwnd), "--json"], 8_000);
    let readbackValue: string | null = null;
    try {
      const parsed = JSON.parse(readback.stdout) as Record<string, unknown>;
      readbackValue = typeof parsed.text === "string" ? parsed.text : typeof parsed.value === "string" ? parsed.value : null;
    } catch { /* malformed external readback is not success */ }
    const confirmed = readback.exitCode === 0 && readbackValue === action.value;
    return evidence(requestId, confirmed ? "EXECUTED" : "UNVERIFIED",
      confirmed ? "desktop_value_readback_matches" : "desktop_value_readback_unconfirmed",
      { pid: this.#config.desktopPid, hwnd: observed.hwnd, selector: action.selector,
        readbackDigest: readbackValue === null ? null : nyxSha256(readbackValue), confirmed }, "E4");
  }

  async #terminalCheck(path: string, requestId: string): Promise<NyxComputerResult> {
    if (!this.terminalCheckAvailable || !this.#config.allowedCheckPaths.includes(path)) {
      return rejected(requestId, "terminal_path_not_authorized");
    }
    const transaction = await this.#config.reader.execute({ requestId: `${requestId}-R1`,
      tokenId: this.#config.reader.token.tokenId, action: "READ_FILE", resourcePath: path,
      observedAtEpochMs: this.#now() });
    const item = transaction.observation;
    if (item.status !== "OBSERVED" || item.content === null || item.contentSha256 === null) {
      return rejected(requestId, `terminal_source_unavailable:${item.status}`);
    }
    if (nyxContainsSecretLike(item.content)) return rejected(requestId, "terminal_source_credential_pattern_blocked");
    const scratch = await mkdtemp(join(tmpdir(), "nyx-terminal-check-"));
    try {
      const tempFile = join(scratch, basename(path));
      await writeFile(tempFile, item.content, { encoding: "utf8", flag: "wx" });
      const result = await this.#runner(process.execPath, ["--check", tempFile], 5_000);
      const detail = result.stderr.split(scratch).join("<isolated>").slice(0, 4_000);
      return evidence(requestId, result.exitCode === 0 ? "EXECUTED" : "UNVERIFIED",
        result.exitCode === 0 ? "bounded_node_syntax_check_passed" : "bounded_node_syntax_check_failed",
        { path, sourceSha256: item.contentSha256, sourceEvidenceId: transaction.evidence.evidenceId,
          exitCode: result.exitCode, diagnostic: nyxContainsSecretLike(detail) ? "sensitive_diagnostic_withheld" : detail }, "E3");
    } finally {
      await rm(scratch, { recursive: true });
    }
  }

  async #inspect(requestId: string): Promise<NyxComputerResult> {
    const pid = this.#config.desktopPid!;
    const result = await this.#runner(this.#config.winappPath!,
      ["ui", "inspect", "-a", String(pid), "--depth", "4", "--json"], 8_000);
    if (result.exitCode !== 0 || Buffer.byteLength(result.stdout, "utf8") > 60_000) {
      return rejected(requestId, "desktop_inspection_failed_or_oversized");
    }
    let parsed: unknown;
    try { parsed = JSON.parse(result.stdout); } catch { return rejected(requestId, "desktop_inspection_not_json"); }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).windows)) {
      return rejected(requestId, "desktop_inspection_schema_invalid");
    }
    const windows = (parsed as { windows: unknown[] }).windows;
    if (windows.length !== 1 || !windows[0] || typeof windows[0] !== "object") {
      return rejected(requestId, "desktop_window_not_unique");
    }
    const window = windows[0] as Record<string, unknown>;
    const hwnd = Number(window.hwnd);
    if (!Number.isSafeInteger(hwnd) || hwnd < 1) return rejected(requestId, "desktop_window_handle_invalid");
    const title = typeof window.title === "string" ? window.title.slice(0, 120) : "";
    const elements: DesktopElement[] = [];
    collectElements(window.elements, elements);
    const unique = [...new Map(elements.map((item) => [item.selector, item])).values()];
    const safe = { pid, hwnd, title, elements: unique };
    if (nyxContainsSecretLike(nyxCanonical(safe))) return rejected(requestId, "desktop_inspection_credential_pattern_blocked");
    const digest = nyxSha256(nyxCanonical(safe));
    this.#desktopObservation = { ...safe, digest, at: this.#now() };
    return evidence(requestId, "OBSERVED", "selected_desktop_window_observed",
      { ...safe, observationDigest: digest, freshnessMs: 15_000 }, "E4");
  }

  async #windowIdentityCurrent(observed: DesktopObservation): Promise<boolean> {
    const result = await this.#runner(this.#config.winappPath!,
      ["ui", "status", "-w", String(observed.hwnd), "--json"], 5_000);
    if (result.exitCode !== 0 || Buffer.byteLength(result.stdout, "utf8") > 8_000) return false;
    try {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      return Number(parsed.processId) === this.#config.desktopPid
        && Number(parsed.hwnd) === observed.hwnd && parsed.windowTitle === observed.title;
    } catch { return false; }
  }
}
