import { accessSync, constants, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type EnvironmentCapabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_AUTHORIZED" | "NOT_REQUIRED";
export type EvaluationOutcome = "READY_TO_EXECUTE" | "PASS" | "FAIL" | "BLOCKED_ENVIRONMENT" | "BLOCKED_AUTHORITY" | "NOT_APPLICABLE";
export type EvaluationImportance = "CRITICAL_GATE" | "REGRESSION" | "HELD_OUT" | "INFORMATIONAL";

export interface EnvironmentCapability {
  readonly capabilityId: "NODE" | "TYPESCRIPT" | "FILESYSTEM" | "DENO" | "NETWORK_BENCHMARK" | "GPU";
  readonly status: EnvironmentCapabilityStatus;
  readonly identity: string | null;
  readonly evidence: string;
}

export interface EnvironmentCapabilityReport {
  readonly schemaVersion: 1;
  readonly reporterVersion: "omega-environment-capability/1";
  readonly observedAtEpochMs: number;
  readonly capabilities: readonly EnvironmentCapability[];
  readonly grantsAuthority: false;
}

export interface EvaluationDefinition {
  readonly evaluationId: string;
  readonly importance: EvaluationImportance;
  readonly applicable: boolean;
  readonly environmentRequirements: readonly { readonly capabilityId: EnvironmentCapability["capabilityId"]; readonly statement: string }[];
  readonly authorityRequirements: readonly string[];
}

export interface EvaluationPreconditionDecision {
  readonly evaluationId: string;
  readonly outcome: EvaluationOutcome;
  readonly reasons: readonly string[];
  readonly importance: EvaluationImportance;
}

function commandVersion(command: string, args: readonly string[]): { available: boolean; identity: string | null } {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
  if (result.error?.code === "ENOENT") return { available: false, identity: null };
  return { available: result.status === 0, identity: result.status === 0 ? `${result.stdout ?? result.stderr}`.trim().split(/\r?\n/)[0] : null };
}

export function probeLocalEnvironment(root = resolve("."), observedAtEpochMs = Date.now()): EnvironmentCapabilityReport {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  let filesystemAvailable = true;
  try { accessSync(root, constants.R_OK); } catch { filesystemAvailable = false; }
  const deno = commandVersion("deno", ["--version"]);
  return Object.freeze({
    schemaVersion: 1, reporterVersion: "omega-environment-capability/1", observedAtEpochMs,
    capabilities: Object.freeze([
      Object.freeze({ capabilityId: "NODE", status: "AVAILABLE", identity: process.version, evidence: "Executing reporter process identity." }),
      Object.freeze({ capabilityId: "TYPESCRIPT", status: packageJson.devDependencies?.typescript ? "AVAILABLE" : "UNAVAILABLE", identity: packageJson.devDependencies?.typescript ?? null, evidence: "Pinned package.json devDependency." }),
      Object.freeze({ capabilityId: "FILESYSTEM", status: filesystemAvailable ? "AVAILABLE" : "UNAVAILABLE", identity: filesystemAvailable ? process.platform : null, evidence: "Read-access probe against authorized repository root." }),
      Object.freeze({ capabilityId: "DENO", status: deno.available ? "AVAILABLE" : "UNAVAILABLE", identity: deno.identity, evidence: deno.available ? "Local deno --version probe." : "Deno executable unavailable; no installation attempted." }),
      Object.freeze({ capabilityId: "NETWORK_BENCHMARK", status: "NOT_AUTHORIZED", identity: null, evidence: "No explicit network benchmark authorization in current directive." }),
      Object.freeze({ capabilityId: "GPU", status: "NOT_REQUIRED", identity: null, evidence: "Current deterministic authority-neutral workstreams require no GPU." }),
    ]),
    grantsAuthority: false,
  });
}

export function evaluateEnvironmentPreconditions(
  definition: EvaluationDefinition,
  report: EnvironmentCapabilityReport,
  availableAuthorities: readonly string[],
  executionResult: "PASS" | "FAIL" | null = null,
): EvaluationPreconditionDecision {
  if (!definition.applicable) return { evaluationId: definition.evaluationId, outcome: "NOT_APPLICABLE", reasons: ["evaluation_not_applicable"], importance: definition.importance };
  const authorities = new Set(availableAuthorities);
  const missingAuthorities = definition.authorityRequirements.filter((authority) => !authorities.has(authority));
  if (missingAuthorities.length > 0) return { evaluationId: definition.evaluationId, outcome: "BLOCKED_AUTHORITY", reasons: missingAuthorities.map((item) => `authority_unavailable:${item}`), importance: definition.importance };
  const capabilities = new Map(report.capabilities.map((item) => [item.capabilityId, item]));
  const unavailable = definition.environmentRequirements.filter((requirement) => capabilities.get(requirement.capabilityId)?.status !== "AVAILABLE");
  if (unavailable.length > 0) return { evaluationId: definition.evaluationId, outcome: "BLOCKED_ENVIRONMENT", reasons: unavailable.map((item) => `environment_unavailable:${item.capabilityId}`), importance: definition.importance };
  return { evaluationId: definition.evaluationId, outcome: executionResult ?? "READY_TO_EXECUTE", reasons: [], importance: definition.importance };
}

export function evaluationTelemetry(input: {
  readonly evaluationId: string;
  readonly importance: EvaluationImportance;
  readonly startedAtEpochMs: number;
  readonly endedAtEpochMs: number;
  readonly outcome: EvaluationOutcome;
}) {
  if (!Number.isSafeInteger(input.startedAtEpochMs) || !Number.isSafeInteger(input.endedAtEpochMs) || input.endedAtEpochMs < input.startedAtEpochMs) throw new Error("Invalid evaluation telemetry interval");
  return Object.freeze({ schemaVersion: 1, ...input, durationMs: input.endedAtEpochMs - input.startedAtEpochMs });
}
