import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const R3_HIDDEN_EVALUATOR_STATUS = Object.freeze({
  chunkId: "OMEGA-VERIFY-INTEGRITY-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  capability: "CANDIDATE_BLIND_HIDDEN_EVALUATION",
  candidateReadableHiddenAssets: false,
  candidateMutableHiddenAssets: false,
  networkAuthorityGranted: false,
  candidateNetworkIsolation: "NOT_PROVEN",
  authorityGranted: false,
  hostileCodeSandbox: false,
} as const);

export interface HiddenReturnExpectation {
  readonly kind: "RETURN";
  readonly value: unknown;
  readonly argsAfter?: readonly unknown[];
}

export interface HiddenThrowExpectation {
  readonly kind: "THROW";
  readonly errorName: string;
}

export interface HiddenEvaluationCase {
  readonly caseId: string;
  readonly args: readonly unknown[];
  readonly expectation: HiddenReturnExpectation | HiddenThrowExpectation;
}

interface HiddenCaseFile {
  readonly schemaVersion: 1;
  readonly suiteId: string;
  readonly cases: readonly HiddenEvaluationCase[];
}

export interface R3HiddenEvaluatorConfig {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly candidateRoot: string;
  readonly hiddenEvaluatorRoot: string;
  readonly hiddenCaseFile: string;
  readonly expectedHiddenCaseFileSha256: string;
  readonly candidateRunner: string;
  readonly expectedCandidateRunnerSha256: string;
  readonly candidateModule: string;
  readonly exportName: string;
  readonly timeoutMsPerCase: number;
  readonly maxOutputBytesPerCase: number;
  readonly maxCases: number;
}

export interface HiddenCaseObservation {
  readonly caseId: string;
  readonly disposition: "PASS" | "FAIL" | "BLOCKED" | "INFRASTRUCTURE_ERROR";
  readonly failureClass: "NONE" | "BEHAVIOR_MISMATCH" | "CANDIDATE_EXECUTION_BLOCKED" | "MALFORMED_CANDIDATE_OUTPUT" | "EXECUTION_FAILURE";
  readonly actualDigest: string | null;
}

export interface R3HiddenEvaluationEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly candidateRootDigest: string;
  readonly hiddenEvaluatorRootDigest: string;
  readonly candidateAndEvaluatorScopesDisjoint: true;
  readonly hiddenCaseFileDigest: string;
  readonly candidateRunnerDigest: string;
  readonly hiddenAssetsExposedToCandidate: false;
  readonly hiddenAssetsMutableByCandidate: false;
  readonly candidateResultTransportAuthenticated: true;
  readonly executedCases: number;
  readonly passedCases: number;
  readonly observations: readonly HiddenCaseObservation[];
  readonly startedAtEpochMs: number;
  readonly endedAtEpochMs: number;
}

export interface R3HiddenEvaluationResult {
  readonly outcome: "PASS" | "FAIL" | "BLOCKED" | "INFRASTRUCTURE_ERROR";
  readonly reason: string;
  /** Bounded model-admissible evidence. It deliberately excludes expected values and evaluator paths. */
  readonly candidateFeedback: {
    readonly verificationResult: "PASS" | "FAIL" | "BLOCKED" | "INFRASTRUCTURE_ERROR";
    readonly failureClass: "NONE" | "REGRESSION" | "EXECUTION_POLICY" | "INFRASTRUCTURE";
    readonly failedCaseIds: readonly string[];
  };
  readonly evidence: R3HiddenEvaluationEvidence;
  readonly authorityGranted: false;
}

interface CandidateResult {
  readonly kind: "RETURN" | "THROW";
  readonly value?: unknown;
  readonly argsAfter?: readonly unknown[];
  readonly errorName?: string;
}

interface CandidateResultEnvelope {
  readonly payloadJson: string;
  readonly authenticator: string;
}

const RESULT_PREFIX = "OMEGA_CANDIDATE_RESULT ";
const SENSITIVE_ENVIRONMENT_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === undefined) return '"__OMEGA_UNDEFINED__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}

function validRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || isAbsolute(value)) return false;
  return value.replace(/\\/g, "/").split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function safeEnvironment(): Record<string, string> {
  const names = process.platform === "win32" ? ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"] : ["PATH", "TMPDIR", "TMP", "TEMP"];
  const result: Record<string, string> = { CI: "true", NO_COLOR: "1" };
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && !SENSITIVE_ENVIRONMENT_PATTERN.test(name)) result[name] = value;
  }
  return result;
}

async function assertAliasFree(root: string): Promise<void> {
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (!within(root, path)) throw new Error("candidate_scope_escape");
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error("candidate_alias_rejected");
      if (stats.isDirectory()) await walk(path);
      else if (!stats.isFile()) throw new Error("candidate_resource_type_rejected");
      else if (stats.nlink !== 1) throw new Error("candidate_hardlink_rejected");
    }
  }
  await walk(root);
}

function validCaseFile(value: unknown, maxCases: number): value is HiddenCaseFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as Partial<HiddenCaseFile>;
  if (file.schemaVersion !== 1 || typeof file.suiteId !== "string" || !file.suiteId.trim()
    || !Array.isArray(file.cases) || file.cases.length < 1 || file.cases.length > maxCases) return false;
  const ids = new Set<string>();
  return file.cases.every((item) => {
    if (!item || typeof item !== "object" || typeof item.caseId !== "string" || !item.caseId.trim() || ids.has(item.caseId)
      || !Array.isArray(item.args) || !item.expectation || typeof item.expectation !== "object") return false;
    ids.add(item.caseId);
    return item.expectation.kind === "RETURN"
      || (item.expectation.kind === "THROW" && typeof item.expectation.errorName === "string" && Boolean(item.expectation.errorName));
  });
}

function validCandidateResult(value: unknown): value is CandidateResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<CandidateResult>;
  if (result.kind === "RETURN") return Array.isArray(result.argsAfter);
  return result.kind === "THROW" && typeof result.errorName === "string" && Boolean(result.errorName);
}

function parseAuthenticatedCandidateResult(lines: readonly string[], resultCapability: string): CandidateResult | null {
  const reserved = lines.filter((value) => value.startsWith(RESULT_PREFIX));
  if (reserved.length !== 1) return null;
  let envelope: CandidateResultEnvelope;
  try { envelope = JSON.parse(reserved[0].slice(RESULT_PREFIX.length)) as CandidateResultEnvelope; }
  catch { return null; }
  if (!envelope || typeof envelope.payloadJson !== "string" || envelope.payloadJson.length > 1_000_000
    || typeof envelope.authenticator !== "string" || !/^[0-9a-f]{64}$/.test(envelope.authenticator)) return null;
  const expected = createHmac("sha256", resultCapability).update(envelope.payloadJson).digest();
  const observed = Buffer.from(envelope.authenticator, "hex");
  if (observed.length !== expected.length || !timingSafeEqual(expected, observed)) return null;
  let payload: unknown;
  try { payload = JSON.parse(envelope.payloadJson); } catch { return null; }
  return validCandidateResult(payload) ? payload : null;
}

async function executeCase(config: R3HiddenEvaluatorConfig, candidateRoot: string, runnerPath: string,
  item: HiddenEvaluationCase): Promise<{ observation: HiddenCaseObservation; actual: CandidateResult | null }> {
  const resultCapability = randomBytes(32).toString("hex");
  const args = ["--permission", `--allow-fs-read=${candidateRoot}`, runnerPath, config.candidateModule, config.exportName];
  const child = spawn(process.execPath, args, { cwd: candidateRoot, env: safeEnvironment(), shell: false,
    windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let exceeded = false;
  const append = (current: Buffer, chunk: Buffer): Buffer => {
    const remaining = Math.max(0, config.maxOutputBytesPerCase - stdout.length - stderr.length);
    if (chunk.length > remaining) exceeded = true;
    return Buffer.concat([current, chunk.subarray(0, remaining)]);
  };
  child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
  child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
  child.stdin.on("error", () => undefined);
  child.stdin.end(JSON.stringify({ schemaVersion: 1, args: item.args, resultCapability }));
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, config.timeoutMsPerCase);
  const closed = await new Promise<{ code: number | null; error: boolean }>((done) => {
    let settled = false;
    const finish = (value: { code: number | null; error: boolean }) => { if (!settled) { settled = true; done(value); } };
    child.once("error", () => finish({ code: null, error: true }));
    child.once("close", (code) => finish({ code, error: false }));
  });
  clearTimeout(timer);
  if (timedOut || exceeded) return { actual: null, observation: Object.freeze({ caseId: item.caseId, disposition: "BLOCKED",
    failureClass: "CANDIDATE_EXECUTION_BLOCKED", actualDigest: null }) };
  if (closed.error || closed.code !== 0) return { actual: null, observation: Object.freeze({ caseId: item.caseId,
    disposition: closed.error ? "INFRASTRUCTURE_ERROR" : "FAIL", failureClass: "EXECUTION_FAILURE", actualDigest: null }) };
  const actual = parseAuthenticatedCandidateResult(stdout.toString("utf8").split(/\r?\n/), resultCapability);
  if (!actual) return { actual: null, observation: Object.freeze({ caseId: item.caseId, disposition: "FAIL",
    failureClass: "MALFORMED_CANDIDATE_OUTPUT", actualDigest: null }) };
  const expected = item.expectation.kind === "RETURN"
    ? { kind: "RETURN", value: item.expectation.value, argsAfter: item.expectation.argsAfter ?? item.args }
    : { kind: "THROW", errorName: item.expectation.errorName };
  const normalizedActual = actual.kind === "RETURN"
    ? { kind: "RETURN", value: actual.value, argsAfter: actual.argsAfter }
    : { kind: "THROW", errorName: actual.errorName };
  const pass = canonical(expected) === canonical(normalizedActual);
  return { actual, observation: Object.freeze({ caseId: item.caseId, disposition: pass ? "PASS" : "FAIL",
    failureClass: pass ? "NONE" : "BEHAVIOR_MISMATCH", actualDigest: sha256(canonical(normalizedActual)) }) };
}

export class R3IsolatedHiddenEvaluator {
  readonly #config: R3HiddenEvaluatorConfig;
  readonly #candidateRoot: string;
  readonly #hiddenRoot: string;
  readonly #caseFilePath: string;
  readonly #runnerPath: string;
  readonly #caseFile: HiddenCaseFile;
  #used = false;

  private constructor(config: R3HiddenEvaluatorConfig, candidateRoot: string, hiddenRoot: string,
    caseFilePath: string, runnerPath: string, caseFile: HiddenCaseFile) {
    this.#config = config; this.#candidateRoot = candidateRoot; this.#hiddenRoot = hiddenRoot;
    this.#caseFilePath = caseFilePath; this.#runnerPath = runnerPath; this.#caseFile = caseFile;
  }

  static async create(config: R3HiddenEvaluatorConfig): Promise<R3IsolatedHiddenEvaluator> {
    if (!config.evaluatorId.trim() || !config.evaluatorVersion.trim() || !/^[0-9a-f]{64}$/.test(config.expectedHiddenCaseFileSha256)
      || !/^[0-9a-f]{64}$/.test(config.expectedCandidateRunnerSha256) || !validRelativePath(config.hiddenCaseFile)
      || !validRelativePath(config.candidateRunner) || !validRelativePath(config.candidateModule)
      || !/^[A-Za-z_$][\w$]*$/.test(config.exportName) || !Number.isInteger(config.timeoutMsPerCase)
      || config.timeoutMsPerCase < 100 || !Number.isInteger(config.maxOutputBytesPerCase)
      || config.maxOutputBytesPerCase < 128 || !Number.isInteger(config.maxCases) || config.maxCases < 1) {
      throw new Error("hidden_evaluator_configuration_invalid");
    }
    const [candidateRoot, hiddenRoot] = await Promise.all([realpath(config.candidateRoot), realpath(config.hiddenEvaluatorRoot)]);
    if (within(candidateRoot, hiddenRoot) || within(hiddenRoot, candidateRoot)) throw new Error("hidden_evaluator_scope_overlap");
    const [candidateStats, hiddenStats] = await Promise.all([lstat(candidateRoot), lstat(hiddenRoot)]);
    if (!candidateStats.isDirectory() || candidateStats.isSymbolicLink() || !hiddenStats.isDirectory() || hiddenStats.isSymbolicLink()) {
      throw new Error("hidden_evaluator_root_invalid");
    }
    await assertAliasFree(candidateRoot);
    const [caseFilePath, runnerPath, candidateModulePath] = await Promise.all([
      realpath(resolve(hiddenRoot, config.hiddenCaseFile)), realpath(resolve(candidateRoot, config.candidateRunner)),
      realpath(resolve(candidateRoot, config.candidateModule)),
    ]);
    if (!within(hiddenRoot, caseFilePath) || !within(candidateRoot, runnerPath) || !within(candidateRoot, candidateModulePath)) {
      throw new Error("hidden_evaluator_resource_scope_invalid");
    }
    const [caseBytes, runnerBytes] = await Promise.all([readFile(caseFilePath), readFile(runnerPath)]);
    if (sha256(caseBytes) !== config.expectedHiddenCaseFileSha256 || sha256(runnerBytes) !== config.expectedCandidateRunnerSha256) {
      throw new Error("hidden_evaluator_resource_identity_mismatch");
    }
    let parsed: unknown;
    try { parsed = JSON.parse(caseBytes.toString("utf8")); } catch { throw new Error("hidden_case_file_malformed"); }
    if (!validCaseFile(parsed, config.maxCases)) throw new Error("hidden_case_file_contract_invalid");
    return new R3IsolatedHiddenEvaluator(config, candidateRoot, hiddenRoot, caseFilePath, runnerPath, parsed);
  }

  async evaluate(): Promise<R3HiddenEvaluationResult> {
    if (this.#used) throw new Error("hidden_evaluator_single_use_exhausted");
    this.#used = true;
    const startedAtEpochMs = Date.now();
    const observations: HiddenCaseObservation[] = [];
    for (const item of this.#caseFile.cases) observations.push((await executeCase(this.#config, this.#candidateRoot, this.#runnerPath, item)).observation);
    const [caseBytesAfter, runnerBytesAfter] = await Promise.all([readFile(this.#caseFilePath), readFile(this.#runnerPath)]);
    if (sha256(caseBytesAfter) !== this.#config.expectedHiddenCaseFileSha256
      || sha256(runnerBytesAfter) !== this.#config.expectedCandidateRunnerSha256) throw new Error("hidden_evaluator_poststate_identity_mismatch");
    const failed = observations.filter((item) => item.disposition !== "PASS");
    const outcome = failed.length === 0 ? "PASS" : failed.some((item) => item.disposition === "INFRASTRUCTURE_ERROR")
      ? "INFRASTRUCTURE_ERROR" : failed.some((item) => item.disposition === "BLOCKED") ? "BLOCKED" : "FAIL";
    const evidenceBase = { evaluatorId: this.#config.evaluatorId, evaluatorVersion: this.#config.evaluatorVersion,
      candidateRootDigest: sha256(this.#candidateRoot), hiddenEvaluatorRootDigest: sha256(this.#hiddenRoot),
      candidateAndEvaluatorScopesDisjoint: true as const, hiddenCaseFileDigest: this.#config.expectedHiddenCaseFileSha256,
      candidateRunnerDigest: this.#config.expectedCandidateRunnerSha256, hiddenAssetsExposedToCandidate: false as const,
      hiddenAssetsMutableByCandidate: false as const, candidateResultTransportAuthenticated: true as const,
      executedCases: observations.length,
      passedCases: observations.filter((item) => item.disposition === "PASS").length,
      observations: Object.freeze(observations), startedAtEpochMs, endedAtEpochMs: Date.now() };
    const evidence: R3HiddenEvaluationEvidence = Object.freeze({ evidenceId: `R3-HIDDEN-${sha256(canonical(evidenceBase)).slice(0, 32)}`,
      evidenceClass: "E3", ...evidenceBase });
    return Object.freeze({ outcome, reason: outcome === "PASS" ? "hidden_evaluation_passed" : "hidden_evaluation_failed",
      candidateFeedback: Object.freeze({ verificationResult: outcome,
        failureClass: outcome === "PASS" ? "NONE" : outcome === "FAIL" ? "REGRESSION"
          : outcome === "BLOCKED" ? "EXECUTION_POLICY" : "INFRASTRUCTURE",
        failedCaseIds: Object.freeze(failed.map((item) => item.caseId)) }), evidence, authorityGranted: false });
  }
}
