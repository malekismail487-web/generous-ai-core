import { nyxCanonical, nyxContainsSecretLike, nyxSha256, parseNyxChatAction } from "../cli/nyxChatProtocol";
import type { NyxComputerAction, NyxComputerHost, NyxComputerResult } from "../cli/nyxChatSession";

export const NYX_CONTAINER_POLICY = Object.freeze({
  version: "nyx-isolated-container-execution/1", authority: "ISOLATED_RESEARCH_ONLY",
  hostShell: false, productionAuthority: false, candidateNetwork: false, credentialsInContainer: false,
  maxCommands: 12, maxCommandMs: 10000, maxOutputBytes: 16000, maxLeaseMs: 600000,
  maxMemoryBytes: 2147483648, maxNanoCpus: 2000000000, maxPids: 128,
  isolationClaim: "DOCKER_PROFILE_VERIFIED_NOT_A_VM_OR_KERNEL_ESCAPE_PROOF",
} as const);
/** Namespace PID 1 ignores SIGCHLD so killed/finished children cannot accumulate as unreaped zombies. */
export const NYX_CONTAINER_SUPERVISOR = Object.freeze(["python", "-I", "-c",
  "import signal,time; signal.signal(signal.SIGCHLD,signal.SIG_IGN); time.sleep(3600)"]);

export interface NyxContainerDriver {
  /** Trusted backend, not model output. Must return fresh actual engine inspection. */
  inspect(containerId: string): Promise<unknown>;
  /** Exact immutable ID only. Must fence/reap spawned children before returning. No host options from cognition. */
  exec(containerId: string, argv: readonly string[], commandMs: number): Promise<{
    exitCode: number; stdout: string; stderr: string; timedOut: boolean;
  }>;
}

export interface NyxContainerConfig {
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly containerId: string;
  readonly imageId: string;
  readonly owner: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly maxCommands: number;
  readonly commandMs: number;
  readonly driver: NyxContainerDriver;
  readonly now?: () => number;
}

export interface NyxContainerAuditEvent {
  readonly sequence: number;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly containerIdDigest: string;
  readonly inspectionDigest: string | null;
  readonly toolAction: "DOCKER_CONTAINER_EXEC" | null;
  readonly observedAtEpochMs: number;
  readonly decision: NyxComputerResult["decision"];
  readonly reason: string;
  readonly resultDigest: string;
  readonly previousDigest: string;
  readonly eventDigest: string;
  readonly evidenceClass: "E3";
  readonly integrity: "TAMPER_EVIDENT_NOT_SIGNED";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function empty(value: unknown): boolean { return value === null || Array.isArray(value) && value.length === 0; }
function integer(value: unknown, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

/** Engine inspection is required, not a caller's statement that an environment is a sandbox. */
export function validateNyxContainerInspection(raw: unknown, expected: Pick<NyxContainerConfig,
  "containerId" | "imageId" | "owner">): readonly string[] {
  const value = record(raw), host = record(value?.HostConfig), config = record(value?.Config);
  const state = record(value?.State), labels = record(config?.Labels);
  if (!value || !host || !config || !state || !labels) return ["inspection_shape_invalid"];
  const issues: string[] = [];
  if (value.Id !== expected.containerId || value.Image !== expected.imageId
    || labels["org.lumina.nyx.isolated-owner"] !== expected.owner) issues.push("container_identity_unbound");
  if (state.Running !== true || state.Paused !== false || state.Restarting !== false) issues.push("container_not_running");
  if (host.NetworkMode !== "none" || !empty(host.PortBindings) && Object.keys(record(host.PortBindings) ?? {bad: true}).length
    || !empty(host.Links)) issues.push("container_network_not_confined");
  if (host.Privileged !== false || host.ReadonlyRootfs !== true || host.PidMode !== ""
    || host.IpcMode !== "private" || !empty(host.Binds) || !empty(host.CapAdd) || !empty(host.Devices) || !empty(host.DeviceRequests)
    || !empty(host.VolumesFrom)) issues.push("container_host_access_or_privilege");
  if (!Array.isArray(host.CapDrop) || host.CapDrop.length !== 1 || host.CapDrop[0] !== "ALL"
    || !Array.isArray(host.SecurityOpt) || host.SecurityOpt.length !== 1
    || !["no-new-privileges", "no-new-privileges:true"].includes(String(host.SecurityOpt[0])))
    issues.push("container_security_profile_invalid");
  if (!integer(host.Memory, 67108864, NYX_CONTAINER_POLICY.maxMemoryBytes) || host.MemorySwap !== host.Memory
    || !integer(host.NanoCpus, 100000000, NYX_CONTAINER_POLICY.maxNanoCpus)
    || !integer(host.PidsLimit, 8, NYX_CONTAINER_POLICY.maxPids)) issues.push("container_resource_limits_invalid");
  const tmpfs = record(host.Tmpfs);
  if (!tmpfs || Object.keys(tmpfs).length !== 2 || Object.keys(tmpfs).some(path => !["/workspace", "/tmp"].includes(path))
    || Object.values(tmpfs).some(options => typeof options !== "string"
      || !options.split(",").includes("nosuid") || !options.split(",").includes("nodev")
      || !options.split(",").includes("size=67108864"))) issues.push("container_tmpfs_policy_invalid");
  if (!Array.isArray(value.Mounts) || value.Mounts.some(mount => {
    const item = record(mount);
    return !item || item.Type !== "tmpfs" || !["/workspace", "/tmp"].includes(String(item.Destination));
  })) issues.push("container_host_mounts_forbidden");
  if (config.User !== "65534:65534" || config.WorkingDir !== "/workspace") issues.push("container_user_or_workdir_invalid");
  if (nyxCanonical(config.Cmd) !== nyxCanonical(NYX_CONTAINER_SUPERVISOR)) issues.push("container_supervisor_invalid");
  const allowedEnv = new Set(["PATH", "LANG", "PYTHON_VERSION", "PYTHON_SHA256", "PYTHON_PIP_VERSION",
    "PYTHON_SETUPTOOLS_VERSION", "PYTHON_GET_PIP_URL", "PYTHON_GET_PIP_SHA256"]);
  if (!Array.isArray(config.Env) || config.Env.some(item => typeof item !== "string"
    || !allowedEnv.has(item.split("=", 1)[0]) || nyxContainsSecretLike(item))) issues.push("container_environment_not_allowlisted");
  return Object.freeze(issues);
}

/** A process-local, single-container lease. Recognizing CONTAINER_EXEC is not issuing this lease. */
export class NyxIsolatedContainerHost implements NyxComputerHost {
  readonly terminalCheckAvailable = false;
  readonly desktopAvailable = false;
  readonly #config: Readonly<NyxContainerConfig>;
  readonly #now: () => number;
  readonly #audit: NyxContainerAuditEvent[] = [];
  readonly #usedRequestIds = new Set<string>();
  #state: "ACTIVE" | "REVOKED" | "QUARANTINED" = "ACTIVE";
  #active = false;
  #commands = 0;

  private constructor(config: NyxContainerConfig) {
    this.#config = Object.freeze({...config}); this.#now = config.now ?? Date.now;
  }
  static async create(config: NyxContainerConfig): Promise<NyxIsolatedContainerHost> {
    const now = (config.now ?? Date.now)();
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED" || !/^[a-f0-9]{64}$/.test(config.containerId)
      || !/^sha256:[a-f0-9]{64}$/.test(config.imageId) || !/^[a-f0-9]{32}$/.test(config.owner)
      || !Number.isSafeInteger(now) || !Number.isSafeInteger(config.issuedAtEpochMs)
      || !Number.isSafeInteger(config.expiresAtEpochMs) || config.issuedAtEpochMs > now || config.expiresAtEpochMs <= now
      || config.expiresAtEpochMs - config.issuedAtEpochMs > NYX_CONTAINER_POLICY.maxLeaseMs
      || !integer(config.maxCommands, 1, NYX_CONTAINER_POLICY.maxCommands)
      || !integer(config.commandMs, 100, NYX_CONTAINER_POLICY.maxCommandMs)) throw Error("nyx_container_lease_invalid");
    // Freeze before awaiting inspection so caller mutation cannot change the admitted identity/bounds.
    const host = new NyxIsolatedContainerHost(config);
    const raw = await host.#config.driver.inspect(host.#config.containerId);
    if (validateNyxContainerInspection(raw, host.#config).length || !host.containerExecAvailable)
      throw Error("nyx_container_profile_rejected");
    return host;
  }
  get containerExecAvailable(): boolean {
    return this.#state === "ACTIVE" && this.#now() >= this.#config.issuedAtEpochMs
      && this.#now() < this.#config.expiresAtEpochMs && this.#commands < this.#config.maxCommands;
  }
  auditLog(): readonly NyxContainerAuditEvent[] { return Object.freeze([...this.#audit]); }
  revoke(): void { this.#state = "REVOKED"; }

  async execute(action: NyxComputerAction, requestId: string): Promise<NyxComputerResult> {
    let inspectionDigest: string | null = null;
    let toolAction: NyxContainerAuditEvent["toolAction"] = null;
    let requestText = "MALFORMED_REQUEST";
    try { requestText = nyxCanonical(action); } catch { /* malformed data has no executable interpretation */ }
    const finish = (decision: NyxComputerResult["decision"], reason: string,
      observation: Readonly<Record<string, unknown>> | null = null): NyxComputerResult => {
      const sequence = this.#audit.length + 1;
      const previousDigest = this.#audit.at(-1)?.eventDigest ?? "0".repeat(64);
      const base = {sequence, requestId: /^[A-Za-z0-9_-]{1,120}$/.test(requestId) ? requestId : "INVALID_REQUEST_ID",
        requestDigest: nyxSha256(requestText), containerIdDigest: nyxSha256(this.#config.containerId), inspectionDigest,
        toolAction, observedAtEpochMs: this.#now(),
        decision, reason, resultDigest: nyxSha256(nyxCanonical(observation)), previousDigest,
        evidenceClass: "E3" as const, integrity: "TAMPER_EVIDENT_NOT_SIGNED" as const};
      const event = Object.freeze({...base, eventDigest: nyxSha256(previousDigest + nyxCanonical(base))});
      this.#audit.push(event);
      return {decision, reason, observation, evidenceId: `NYX-CONTAINER-${event.eventDigest}`,
        evidenceClass: "E3", broaderAuthorityGranted: false};
    };
    const parsed = parseNyxChatAction(requestText);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(requestId) || parsed.action?.kind !== "CONTAINER_EXEC")
      return finish("REJECTED", "container_request_malformed_or_unsupported");
    if (!this.containerExecAvailable) return finish("REJECTED", "container_lease_unavailable");
    if (this.#active) return finish("REJECTED", "container_command_already_active");
    if (this.#usedRequestIds.has(requestId)) return finish("REJECTED", "container_request_replayed");
    this.#active = true; this.#usedRequestIds.add(requestId);
    try {
      const raw = await this.#config.driver.inspect(this.#config.containerId);
      inspectionDigest = nyxSha256(nyxCanonical(raw));
      if (validateNyxContainerInspection(raw, this.#config).length) {
        this.#state = "QUARANTINED"; return finish("REJECTED", "container_profile_changed");
      }
      // Inspection may await. Recheck revocation, remaining resource/lease, and immutable ID immediately before use.
      if (!this.containerExecAvailable || this.#config.expiresAtEpochMs - this.#now() < this.#config.commandMs)
        return finish("REJECTED", "container_lease_expired_during_authorization");
      this.#commands += 1;
      toolAction = "DOCKER_CONTAINER_EXEC";
      const output = await this.#config.driver.exec(this.#config.containerId, parsed.action.argv, this.#config.commandMs);
      if (!Number.isSafeInteger(output.exitCode) || typeof output.stdout !== "string"
        || typeof output.stderr !== "string" || typeof output.timedOut !== "boolean"
        || Buffer.byteLength(output.stdout + output.stderr) > NYX_CONTAINER_POLICY.maxOutputBytes) {
        this.#state = "QUARANTINED"; return finish("UNVERIFIED", "container_output_invalid_or_oversized");
      }
      if (output.timedOut) { this.#state = "QUARANTINED"; return finish("UNVERIFIED", "container_command_timed_out"); }
      if (this.#state !== "ACTIVE" || this.#now() >= this.#config.expiresAtEpochMs)
        return finish("UNVERIFIED", "container_result_arrived_after_revocation_or_expiry");
      if (nyxContainsSecretLike(output.stdout + output.stderr))
        return finish("UNVERIFIED", "container_sensitive_output_withheld");
      return finish(output.exitCode === 0 ? "EXECUTED" : "UNVERIFIED",
        output.exitCode === 0 ? "isolated_container_command_completed_not_task_verification" : "isolated_container_command_failed",
        Object.freeze({exitCode: output.exitCode, stdout: output.stdout, stderr: output.stderr,
          containerIdentityDigest: nyxSha256(this.#config.containerId), commandNumber: this.#commands,
          taskAcceptance: "INDEPENDENT_VERIFIER_REQUIRED", broaderAuthorityGranted: false}));
    } catch {
      this.#state = "QUARANTINED";
      return finish("UNVERIFIED", "container_backend_failure");
    } finally { this.#active = false; }
  }
}
