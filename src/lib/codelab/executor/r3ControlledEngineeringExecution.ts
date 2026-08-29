import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { R3AApplyResult, R3ADisposablePatchApplicator } from "./r3DisposablePatchApplication";

export const R3_B_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R3-B-ISOLATED-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "CONTROLLED_BUILD_TEST_EXECUTION",
  candidateCapabilities: Object.freeze(["RUN_AUTHORIZED_ENGINEERING_TOOL"] as const),
  unavailableCapabilities: Object.freeze(["GENERAL_SHELL", "WRITE_SOURCE_REPOSITORY", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  forbiddenCapabilities: Object.freeze(["NETWORK", "CREDENTIAL_ACCESS", "PRODUCTION_MUTATION"] as const),
  isolation: "PROCESS_LOCAL_NODE_PERMISSION_SEATBELT_NOT_HOSTILE_CODE_SANDBOX",
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R3BProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R3BEngineeringToolDefinition {
  readonly toolId: string;
  readonly toolKind: "TYPECHECK" | "BUILD" | "TEST" | "OTHER";
  readonly toolVersion: string;
  readonly entrypoint: string;
  readonly expectedEntrypointSha256: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly allowedMutationPrefixes: readonly string[];
  readonly allowChildProcesses: boolean;
}

export interface R3BControlledExecutionConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly disposableRepositoryRoot: string;
  readonly disposableRepositoryId: string;
  readonly applicator: R3ADisposablePatchApplicator;
  readonly appliedCandidate: R3AApplyResult;
  readonly capability: R3BProcessLocalCapability;
  readonly tools: readonly R3BEngineeringToolDefinition[];
  readonly maxRepositoryFiles: number;
  readonly maxRepositoryBytes: number;
  readonly maxTimeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface R3BExecutionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly executionId: string;
  readonly authority: "RUN_AUTHORIZED_ENGINEERING_TOOL";
  readonly toolId: string;
  readonly disposableRepositoryId: string;
  readonly applicationId: string;
  readonly proposalDigest: string;
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly environmentIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R3BExecutionOutcome = "PASS" | "FAIL" | "TIMEOUT" | "BLOCKED" | "INFRASTRUCTURE_ERROR";

export interface R3BRepositoryManifestEntry {
  readonly relativePath: string;
  readonly size: number;
  readonly mode: number;
  readonly sha256: string;
}

export interface R3BEnvironmentObservation {
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly nodeVersion: string;
  readonly permissionModel: "NODE_PERMISSION_MODEL";
  readonly networkAllowed: false;
  readonly credentialEnvironmentForwarded: false;
  readonly childProcessesAllowed: boolean;
  readonly inheritedEnvironmentNames: readonly string[];
}

export interface R3BExecutionEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly executionId: string;
  readonly candidateCommit: string;
  readonly disposableRepositoryId: string;
  readonly applicationId: string;
  readonly proposalDigest: string;
  readonly toolId: string;
  readonly toolKind: R3BEngineeringToolDefinition["toolKind"] | "UNKNOWN";
  readonly toolVersion: string;
  readonly toolIdentityDigest: string;
  readonly environment: R3BEnvironmentObservation;
  readonly startedAtEpochMs: number;
  readonly endedAtEpochMs: number;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputTruncated: boolean;
  readonly prestateManifestDigest: string;
  readonly poststateManifestDigest: string | null;
  readonly changedPaths: readonly string[];
  readonly unexpectedMutationPaths: readonly string[];
  readonly processTreeTerminationAttempted: boolean;
  readonly outcome: R3BExecutionOutcome;
}

export interface R3BExecutionResult {
  readonly outcome: R3BExecutionOutcome;
  readonly reason: string;
  readonly evidence: R3BExecutionEvidence;
  readonly generalShellAuthority: false;
  readonly sourceRepositoryWriteAuthority: false;
  readonly networkAuthority: false;
  readonly productionAuthority: false;
  readonly authorityGranted: false;
}

interface Manifest {
  readonly entries: readonly R3BRepositoryManifestEntry[];
  readonly digest: string;
}

interface AdmittedTool {
  readonly definition: R3BEngineeringToolDefinition;
  readonly entrypointPath: string;
  readonly workingDirectoryPath: string;
  readonly allowedMutationRoots: readonly string[];
  readonly identityDigest: string;
}

const SENSITIVE_ENVIRONMENT_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;
const SECRET_OUTPUT_PATTERNS = Object.freeze([
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /ale_live_[A-Za-z0-9]{20,}/g,
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
]);
let nodeExecutableDigestPromise: Promise<string> | null = null;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nodeExecutableDigest(): Promise<string> {
  nodeExecutableDigestPromise ??= readFile(process.execPath).then(sha256);
  return nodeExecutableDigestPromise;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}

function validRelativePath(path: unknown, allowDot = false): path is string {
  if (allowDot && path === ".") return true;
  if (typeof path !== "string" || !path.trim() || path.includes("\0") || isAbsolute(path)) return false;
  return path.replace(/\\/g, "/").split("/").every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}

function identityOf(stats: Awaited<ReturnType<typeof lstat>>): string {
  return `${stats.dev.toString()}:${stats.ino.toString()}:${stats.birthtimeMs.toString()}`;
}

function redactOutput(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_OUTPUT_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  return redacted;
}

function safeEnvironment(): Record<string, string> {
  const names = process.platform === "win32" ? ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"] : ["PATH", "TMPDIR", "TMP", "TEMP"];
  const environment: Record<string, string> = { CI: "true", NO_COLOR: "1" };
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && !SENSITIVE_ENVIRONMENT_PATTERN.test(name)) environment[name] = value;
  }
  return environment;
}

async function repositoryManifest(root: string, maxFiles: number, maxBytes: number): Promise<Manifest> {
  const entries: R3BRepositoryManifestEntry[] = [];
  let totalBytes = 0;
  async function walk(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = resolve(directory, child.name);
      if (!within(root, path)) throw new Error("repository_manifest_escape");
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error("repository_manifest_alias_rejected");
      if (stats.isDirectory()) await walk(path);
      else if (stats.isFile()) {
        if (entries.length >= maxFiles) throw new Error("repository_manifest_file_limit_exceeded");
        totalBytes += stats.size;
        if (totalBytes > maxBytes) throw new Error("repository_manifest_byte_limit_exceeded");
        const content = await readFile(path);
        entries.push(Object.freeze({ relativePath: relative(root, path).replace(/\\/g, "/"), size: stats.size,
          mode: stats.mode, sha256: sha256(content) }));
      } else throw new Error("repository_manifest_unsupported_resource");
    }
  }
  await walk(root);
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return Object.freeze({ entries: Object.freeze(entries), digest: sha256(canonical(entries)) });
}

function manifestChanges(before: Manifest, after: Manifest): readonly string[] {
  const left = new Map(before.entries.map((entry) => [entry.relativePath, entry]));
  const right = new Map(after.entries.map((entry) => [entry.relativePath, entry]));
  const paths = new Set([...left.keys(), ...right.keys()]);
  return Object.freeze([...paths].filter((path) => canonical(left.get(path) ?? null) !== canonical(right.get(path) ?? null)).sort());
}

function allowedMutation(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function terminateProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    // R3-B rejects every tool definition that requests child-process authority,
    // so terminating this process also terminates the complete permitted tree.
    child.kill("SIGKILL");
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }
}

export class R3BControlledEngineeringExecutor {
  readonly #config: R3BControlledExecutionConfig;
  readonly #root: string;
  readonly #rootIdentity: string;
  readonly #baseline: Manifest;
  readonly #tools: ReadonlyMap<string, AdmittedTool>;
  #used = false;
  #revoked = false;

  private constructor(config: R3BControlledExecutionConfig, root: string, rootIdentity: string,
    baseline: Manifest, tools: ReadonlyMap<string, AdmittedTool>) {
    this.#config = config;
    this.#root = root;
    this.#rootIdentity = rootIdentity;
    this.#baseline = baseline;
    this.#tools = tools;
  }

  static async create(config: R3BControlledExecutionConfig): Promise<R3BControlledEngineeringExecutor> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit) || !config.executorId.trim() || !config.evaluatorVersion.trim()
      || !config.environmentIdentity.trim() || !config.capability.capabilityId.trim() || !config.capability.issuer.trim()
      || !config.capability.auditIdentity.trim()) throw new Error("execution_candidate_identity_invalid");
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("execution_capability_lifetime_invalid");
    if (!Number.isInteger(config.maxRepositoryFiles) || config.maxRepositoryFiles < 1
      || !Number.isInteger(config.maxRepositoryBytes) || config.maxRepositoryBytes < 1
      || !Number.isInteger(config.maxTimeoutMs) || config.maxTimeoutMs < 100
      || !Number.isInteger(config.maxOutputBytes) || config.maxOutputBytes < 1) throw new Error("execution_resource_policy_invalid");
    const root = await realpath(config.disposableRepositoryRoot);
    if (!await config.applicator.attestsAppliedCandidate(config.appliedCandidate, root, config.disposableRepositoryId)) {
      throw new Error("r3a_applied_candidate_attestation_rejected");
    }
    const rootStats = await lstat(root);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("disposable_repository_identity_invalid");
    const tools = new Map<string, AdmittedTool>();
    for (const definition of config.tools) {
      if (!definition.toolId.trim() || !["TYPECHECK", "BUILD", "TEST", "OTHER"].includes(definition.toolKind)
        || !definition.toolVersion.trim() || tools.has(definition.toolId)
        || !validRelativePath(definition.entrypoint) || !validRelativePath(definition.workingDirectory, true)
        || !Array.isArray(definition.arguments) || definition.arguments.some((argument) => typeof argument !== "string" || argument.includes("\0"))
        || !Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 100 || definition.timeoutMs > config.maxTimeoutMs
        || !Number.isInteger(definition.maxOutputBytes) || definition.maxOutputBytes < 1 || definition.maxOutputBytes > config.maxOutputBytes) {
        throw new Error("engineering_tool_definition_invalid");
      }
      if (definition.allowChildProcesses) throw new Error("engineering_tool_child_process_scope_not_supported");
      const entrypointPath = await realpath(resolve(root, definition.entrypoint));
      const workingDirectoryPath = await realpath(resolve(root, definition.workingDirectory));
      if (!within(root, entrypointPath) || !within(root, workingDirectoryPath)) throw new Error("engineering_tool_scope_escape");
      const [entryStats, workingStats, entryContent] = await Promise.all([lstat(entrypointPath), lstat(workingDirectoryPath), readFile(entrypointPath)]);
      if (!entryStats.isFile() || entryStats.isSymbolicLink() || !workingStats.isDirectory() || workingStats.isSymbolicLink()
        || sha256(entryContent) !== definition.expectedEntrypointSha256) throw new Error("engineering_tool_identity_mismatch");
      const mutationRoots: string[] = [];
      const prefixes = new Set<string>();
      for (const prefix of definition.allowedMutationPrefixes) {
        if (!validRelativePath(prefix) || prefixes.has(prefix)) throw new Error("engineering_tool_mutation_scope_invalid");
        prefixes.add(prefix);
        let mutationRoot: string;
        let mutationStats: Awaited<ReturnType<typeof lstat>>;
        try {
          mutationRoot = await realpath(resolve(root, prefix));
          mutationStats = await lstat(mutationRoot);
        } catch {
          throw new Error("engineering_tool_mutation_scope_invalid");
        }
        if (!within(root, mutationRoot) || !mutationStats.isDirectory() || mutationStats.isSymbolicLink()) {
          throw new Error("engineering_tool_mutation_scope_invalid");
        }
        mutationRoots.push(mutationRoot);
      }
      const publicDefinition = { toolId: definition.toolId, toolKind: definition.toolKind,
        toolVersion: definition.toolVersion, entrypoint: definition.entrypoint,
        expectedEntrypointSha256: definition.expectedEntrypointSha256, arguments: definition.arguments,
        workingDirectory: definition.workingDirectory, timeoutMs: definition.timeoutMs, maxOutputBytes: definition.maxOutputBytes,
        allowedMutationPrefixes: [...prefixes].sort(), allowChildProcesses: definition.allowChildProcesses,
        nodeExecutableSha256: await nodeExecutableDigest() };
      tools.set(definition.toolId, Object.freeze({ definition: Object.freeze({ ...definition,
        arguments: Object.freeze([...definition.arguments]), allowedMutationPrefixes: Object.freeze([...prefixes]) }),
        entrypointPath, workingDirectoryPath, allowedMutationRoots: Object.freeze(mutationRoots), identityDigest: sha256(canonical(publicDefinition)) }));
    }
    if (tools.size < 1) throw new Error("engineering_tool_catalog_empty");
    const baseline = await repositoryManifest(root, config.maxRepositoryFiles, config.maxRepositoryBytes);
    return new R3BControlledEngineeringExecutor(config, root, identityOf(rootStats), baseline, tools);
  }

  capabilityProfile(): typeof R3_B_ISOLATED_CANDIDATE_STATUS & { readonly used: boolean; readonly revoked: boolean } {
    return Object.freeze({ ...R3_B_ISOLATED_CANDIDATE_STATUS, used: this.#used, revoked: this.#revoked });
  }

  async execute(request: R3BExecutionRequest): Promise<R3BExecutionResult> {
    const startedAtEpochMs = Date.now();
    const tool = this.#tools.get(typeof request.toolId === "string" ? request.toolId : "");
    const preflightIssues = await this.#preflight(request, tool);
    if (preflightIssues.length > 0 || !tool) {
      return this.#result("BLOCKED", preflightIssues.join(",") || "unsupported_engineering_tool", request, tool ?? null,
        startedAtEpochMs, Date.now(), null, null, "", "", false, null, [], [], false);
    }
    this.#used = true;
    const environment = safeEnvironment();
    const args = ["--permission", `--allow-fs-read=${this.#root}`];
    for (const mutationRoot of tool.allowedMutationRoots) args.push(`--allow-fs-write=${mutationRoot}`);
    args.push(tool.entrypointPath, ...tool.definition.arguments);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(process.execPath, args, { cwd: tool.workingDirectoryPath, env: environment, shell: false,
        windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return this.#result("INFRASTRUCTURE_ERROR", "engineering_tool_spawn_failed", request, tool, startedAtEpochMs,
        Date.now(), null, null, "", "", false, null, [], [], false);
    }
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let outputExceeded = false;
    let timedOut = false;
    let terminationAttempted = false;
    const append = (current: Buffer, chunk: Buffer): Buffer => {
      const remaining = Math.max(0, tool.definition.maxOutputBytes - stdout.length - stderr.length);
      if (chunk.length > remaining) outputExceeded = true;
      return Buffer.concat([current, chunk.subarray(0, remaining)]);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timeout = setTimeout(async () => {
      timedOut = true; terminationAttempted = true; await terminateProcessTree(child);
    }, tool.definition.timeoutMs);
    const outputMonitor = setInterval(async () => {
      if (outputExceeded && child.exitCode === null) { terminationAttempted = true; await terminateProcessTree(child); }
    }, 10);
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; spawnError: boolean }>((resolveClose) => {
      let settled = false;
      const finish = (value: { code: number | null; signal: NodeJS.Signals | null; spawnError: boolean }) => {
        if (!settled) { settled = true; resolveClose(value); }
      };
      child.once("error", () => finish({ code: null, signal: null, spawnError: true }));
      child.once("close", (code, signal) => finish({ code, signal, spawnError: false }));
    });
    clearTimeout(timeout); clearInterval(outputMonitor);
    const endedAtEpochMs = Date.now();
    let after: Manifest | null = null;
    try { after = await repositoryManifest(this.#root, this.#config.maxRepositoryFiles, this.#config.maxRepositoryBytes); }
    catch {
      this.#revoked = true;
      return this.#result("INFRASTRUCTURE_ERROR", "post_execution_repository_observation_failed", request, tool, startedAtEpochMs,
        endedAtEpochMs, closed.code, closed.signal, stdout.toString("utf8"), stderr.toString("utf8"), outputExceeded,
        null, [], [], terminationAttempted);
    }
    const changedPaths = manifestChanges(this.#baseline, after);
    const unexpected = changedPaths.filter((path) => !allowedMutation(path, tool.definition.allowedMutationPrefixes));
    if (unexpected.length > 0) this.#revoked = true;
    const outcome: R3BExecutionOutcome = timedOut ? "TIMEOUT" : outputExceeded || unexpected.length > 0 ? "BLOCKED"
      : closed.spawnError ? "INFRASTRUCTURE_ERROR" : closed.code === 0 ? "PASS" : "FAIL";
    const reason = timedOut ? "engineering_tool_timeout" : outputExceeded ? "engineering_tool_output_limit_exceeded"
      : unexpected.length > 0 ? "unexpected_repository_mutation" : closed.spawnError ? "engineering_tool_process_error"
        : closed.code === 0 ? "engineering_tool_passed" : "engineering_tool_failed";
    return this.#result(outcome, reason, request, tool, startedAtEpochMs, endedAtEpochMs, closed.code, closed.signal,
      stdout.toString("utf8"), stderr.toString("utf8"), outputExceeded, after, changedPaths, unexpected, terminationAttempted);
  }

  async #preflight(request: R3BExecutionRequest, tool: AdmittedTool | undefined): Promise<readonly string[]> {
    const issues: string[] = [];
    if (this.#revoked) issues.push("engineering_execution_capability_revoked");
    if (this.#used) issues.push("engineering_execution_capability_already_used");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.executionId !== "string" || !request.executionId.trim() || typeof request.issuer !== "string"
      || typeof request.auditIdentity !== "string") issues.push("engineering_execution_request_malformed");
    if (request.authority !== "RUN_AUTHORIZED_ENGINEERING_TOOL") issues.push("engineering_execution_authority_mismatch");
    if (!tool) issues.push("unsupported_engineering_tool");
    if (request.disposableRepositoryId !== this.#config.disposableRepositoryId
      || request.applicationId !== this.#config.appliedCandidate.applicationId
      || request.proposalDigest !== this.#config.appliedCandidate.proposalDigest) issues.push("applied_candidate_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("engineering_execution_capability_identity_mismatch");
    if (request.environmentIdentity !== this.#config.environmentIdentity) issues.push("engineering_execution_environment_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs) issues.push("engineering_execution_capability_expired");
    try {
      const [root, stats, current] = await Promise.all([realpath(this.#config.disposableRepositoryRoot),
        lstat(this.#config.disposableRepositoryRoot), repositoryManifest(this.#root, this.#config.maxRepositoryFiles, this.#config.maxRepositoryBytes)]);
      if (root !== this.#root || identityOf(stats) !== this.#rootIdentity || current.digest !== this.#baseline.digest) {
        issues.push("disposable_repository_stale_or_replaced");
      }
      if (!await this.#config.applicator.attestsAppliedCandidate(this.#config.appliedCandidate, root, this.#config.disposableRepositoryId)) {
        issues.push("r3a_applied_candidate_attestation_lost");
      }
      if (tool) {
        const [entrypoint, content] = await Promise.all([realpath(tool.entrypointPath), readFile(tool.entrypointPath)]);
        if (entrypoint !== tool.entrypointPath || sha256(content) !== tool.definition.expectedEntrypointSha256) issues.push("engineering_tool_identity_changed");
      }
    } catch { issues.push("execution_preflight_observation_failed"); }
    return Object.freeze([...new Set(issues)]);
  }

  #result(outcome: R3BExecutionOutcome, reason: string, request: R3BExecutionRequest, tool: AdmittedTool | null,
    startedAtEpochMs: number, endedAtEpochMs: number, exitCode: number | null, signal: NodeJS.Signals | null,
    stdout: string, stderr: string, outputTruncated: boolean, after: Manifest | null, changedPaths: readonly string[],
    unexpectedMutationPaths: readonly string[], processTreeTerminationAttempted: boolean): R3BExecutionResult {
    const environmentNames = Object.keys(safeEnvironment()).sort();
    const environment: R3BEnvironmentObservation = Object.freeze({ platform: process.platform, architecture: process.arch,
      nodeVersion: process.version, permissionModel: "NODE_PERMISSION_MODEL", networkAllowed: false,
      credentialEnvironmentForwarded: false, childProcessesAllowed: tool?.definition.allowChildProcesses ?? false,
      inheritedEnvironmentNames: Object.freeze(environmentNames) });
    const safeStdout = redactOutput(stdout);
    const safeStderr = redactOutput(stderr);
    const executionId = typeof request.executionId === "string" && request.executionId.trim() ? request.executionId : "MALFORMED";
    const evidence: R3BExecutionEvidence = Object.freeze({ evidenceId: `R3B-EVIDENCE-${sha256(canonical({ executionId,
      outcome, reason, tool: tool?.identityDigest ?? null, startedAtEpochMs })).slice(0, 32)}`, evidenceClass: "E3", executionId,
      candidateCommit: this.#config.candidateCommit, disposableRepositoryId: this.#config.disposableRepositoryId,
      applicationId: this.#config.appliedCandidate.applicationId, proposalDigest: this.#config.appliedCandidate.proposalDigest,
      toolId: tool?.definition.toolId ?? (typeof request.toolId === "string" ? request.toolId : "MALFORMED"),
      toolKind: tool?.definition.toolKind ?? "UNKNOWN",
      toolVersion: tool?.definition.toolVersion ?? "UNKNOWN", toolIdentityDigest: tool?.identityDigest ?? "UNKNOWN", environment,
      startedAtEpochMs, endedAtEpochMs, durationMs: Math.max(0, endedAtEpochMs - startedAtEpochMs), exitCode, signal,
      stdout: safeStdout, stderr: safeStderr, outputTruncated, prestateManifestDigest: this.#baseline.digest,
      poststateManifestDigest: after?.digest ?? null, changedPaths: Object.freeze([...changedPaths]),
      unexpectedMutationPaths: Object.freeze([...unexpectedMutationPaths]), processTreeTerminationAttempted, outcome });
    return Object.freeze({ outcome, reason, evidence, generalShellAuthority: false, sourceRepositoryWriteAuthority: false,
      networkAuthority: false, productionAuthority: false, authorityGranted: false });
  }
}
