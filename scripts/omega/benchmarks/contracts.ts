import { z } from "zod";
import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";

export const FAMILIES = ["SWE_BENCH", "TERMINAL_BENCH", "ARC_AGI", "HLE", "FRONTIER_MATH"] as const;
export const ARMS = ["RAW_MODEL", "MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX", "CANDIDATE_NYX"] as const;
export type Family = typeof FAMILIES[number];
export type Arm = typeof ARMS[number];
export type Tier = "DEVELOPMENT" | "VALIDATION" | "SEALED";
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(200);
const nonnegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = nonnegative.min(1);

export const sourceSchema = z.object({
  dataset: identity, revision: identity, contentDigest: digestSchema,
  visibility: z.enum(["PUBLIC", "PROTECTED", "INDEPENDENT_PRIVATE", "SYNTHETIC"]),
  kind: z.enum(["DATASET_TASK", "PUBLIC_SAMPLE", "DEVELOPMENT_REPRODUCTION"]),
  provenance: z.string().min(1).max(2000),
}).strict();
export type TaskSource = z.infer<typeof sourceSchema>;
export interface TaskManifest {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly family: Family;
  readonly tier: Tier;
  readonly source: TaskSource;
  readonly inputDigest: string;
  readonly privateOracleDigest: string;
  readonly taskDigest: string;
  readonly requiredCapabilities: readonly string[];
}

export const usageSchema = z.object({
  logicalCalls: nonnegative, physicalCalls: nonnegative, httpAttempts: nonnegative,
  reportedTokens: nonnegative, unknownUsageCalls: nonnegative,
  toolCalls: nonnegative, toolWorkUnits: nonnegative, wallClockMs: nonnegative,
  providerFailures: nonnegative, retries: nonnegative,
}).strict().superRefine((u, context) => {
  if (u.physicalCalls < u.logicalCalls || u.httpAttempts < u.physicalCalls
    || u.unknownUsageCalls > u.physicalCalls || u.providerFailures > u.httpAttempts
    || u.retries > u.httpAttempts) context.addIssue({ code: "custom", message: "inconsistent_usage" });
});
export type Usage = z.infer<typeof usageSchema>;
export const FAILURE_CLASSES = ["PROVIDER_FAILURE", "TRUNCATION", "SCHEMA_FAILURE", "SYNTAX_FAILURE",
  "FUNCTIONAL_FAILURE", "HIDDEN_CASE_FAILURE", "QUALITY_REJECTION", "AUTHORIZATION_FAILURE",
  "MISSING_CAPABILITY", "VERIFIER_FAILURE", "RESOURCE_EXHAUSTION", "INFRASTRUCTURE_FAILURE"] as const;
export type FailureClass = typeof FAILURE_CLASSES[number];

export const campaignSchema = z.object({
  schemaVersion: z.literal(1), campaignId: identity,
  environmentIdentity: identity, executionIdentity: identity,
  frozenAtEpochMs: positive, expiresAtEpochMs: positive,
  taskDigests: z.array(digestSchema).min(1).max(10000),
  model: identity, modelConfigDigest: digestSchema,
  authorityDigest: digestSchema, toolEnvelopeDigest: digestSchema,
  verifierVersion: identity, verifierSourceDigest: digestSchema,
  limits: z.object({ maxCallsPerTask: positive, maxReportedTokensPerTask: positive,
    maxToolCallsPerTask: nonnegative, maxToolWorkUnitsPerTask: nonnegative,
    maxAttemptsPerTask: positive.max(10), maxArtifactBytes: positive.max(2_000_000),
    maxWallClockMsPerTask: positive, maxWallClockMs: positive }).strict(),
  realizedComputeTolerance: z.number().min(0).max(0.1),
}).strict().superRefine((m, context) => {
  if (m.expiresAtEpochMs <= m.frozenAtEpochMs || new Set(m.taskDigests).size !== m.taskDigests.length)
    context.addIssue({ code: "custom", message: "invalid_campaign_freeze" });
});
export type CampaignSpec = z.infer<typeof campaignSchema>;
export const armSchema = z.object({
  arm: z.enum(ARMS), version: identity, sourceDigest: digestSchema,
  inferenceMode: z.enum(["LIVE_PROVIDER_E4", "LOCAL_MODEL_E3", "IMPORTED_TRANSCRIPT", "SYNTHETIC_PROTOCOL_TEST"]),
  model: identity, modelConfigDigest: digestSchema,
  authorityDigest: digestSchema, toolEnvelopeDigest: digestSchema,
  supportedCapabilities: z.array(identity).max(64),
}).strict();
export type ArmSpec = z.infer<typeof armSchema>;

export interface Evaluation {
  readonly state: "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
  readonly correct: number;
  readonly total: number;
  readonly quality: "ACCEPT" | "REJECT" | "NOT_EVALUATED" | "NOT_APPLICABLE";
  readonly metric: string;
  readonly evidenceDigest: string;
  readonly confidence: number | null;
}
export interface AttemptContext {
  readonly campaignDigest: string;
  readonly taskDigest: string;
  readonly taskId: string;
  readonly arm: Arm;
  readonly armSourceDigest: string;
  readonly attempt: number;
  readonly artifactDigest: string;
  readonly evaluationRunId: string;
}

/** Normalized by a trusted external evaluator, never by the candidate adapter. Hashes are not authentication. */
export const receiptSchema = z.object({
  schemaVersion: z.literal(1), campaignDigest: digestSchema, taskDigest: digestSchema,
  armSourceDigest: digestSchema, attempt: positive, artifactDigest: digestSchema,
  evaluationRunId: identity, environment: identity, evaluatorVersion: identity,
  evaluatorSourceDigest: digestSchema, rawReportDigest: digestSchema,
  custody: z.literal("CALLER_ATTESTED_NOT_AUTHENTICATED"),
}).strict();
export type ExternalReceipt = z.infer<typeof receiptSchema>;

export function zeroUsage(): Usage {
  return { logicalCalls: 0, physicalCalls: 0, httpAttempts: 0, reportedTokens: 0, unknownUsageCalls: 0,
    toolCalls: 0, toolWorkUnits: 0, wallClockMs: 0, providerFailures: 0, retries: 0 };
}
export function sumUsage(values: readonly Usage[]): Usage {
  const result = zeroUsage();
  for (const raw of values) {
    const value = usageSchema.parse(raw);
    for (const key of Object.keys(result) as (keyof Usage)[]) result[key] += value[key];
  }
  return usageSchema.parse(result);
}
export function jsonValue(value: unknown, maxBytes = 2_000_000): unknown {
  // Reject non-JSON/sparse/prototype-bearing values before hashing. Never silently coerce NaN/undefined to null.
  const visit = (item: unknown, depth: number): void => {
    if (depth > 100) throw Error("benchmark_json_depth");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) throw Error("benchmark_sparse_array");
      for (const child of item) visit(child, depth + 1);
      return;
    }
    if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
      for (const [key, child] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("benchmark_reserved_key");
        visit(child, depth + 1);
      }
      return;
    }
    throw Error("benchmark_non_json_value");
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) throw Error("benchmark_json_size");
  return immutableTheoryValue(value);
}
export function attemptContext(campaign: CampaignSpec, task: TaskManifest, arm: ArmSpec,
  attempt: number, artifact: unknown): AttemptContext {
  const context = { campaignDigest: theoryDigest(campaign), taskDigest: task.taskDigest,
    taskId: task.taskId, arm: arm.arm, armSourceDigest: arm.sourceDigest,
    attempt, artifactDigest: theoryDigest(jsonValue(artifact, campaign.limits.maxArtifactBytes)) };
  // Includes content + epoch + arm + attempt: changed predictions cannot accidentally reuse SWE-bench caches.
  return immutableTheoryValue({ ...context, evaluationRunId: `nyx-${theoryDigest(context).slice(0, 48)}` });
}
export function validateReceipt(receipt: unknown, report: unknown, context: AttemptContext,
  campaign: CampaignSpec): ExternalReceipt {
  const r = receiptSchema.parse(receipt);
  for (const key of ["campaignDigest", "taskDigest", "armSourceDigest", "attempt", "artifactDigest", "evaluationRunId"] as const)
    if (r[key] !== context[key]) throw Error("benchmark_stale_receipt");
  if (r.evaluatorVersion !== campaign.verifierVersion || r.evaluatorSourceDigest !== campaign.verifierSourceDigest
    || r.rawReportDigest !== theoryDigest(jsonValue(report))) throw Error("benchmark_verifier_binding");
  return immutableTheoryValue(r);
}
