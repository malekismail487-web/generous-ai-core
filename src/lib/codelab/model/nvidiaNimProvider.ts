import { createHash } from "node:crypto";
import { liveNvidiaCapacity, NvidiaCapacityCoordinator, NVIDIA_CAPACITY_POLICY } from "./nvidiaCapacity";

export const NVIDIA_NIM_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export const NVIDIA_NIM_PROVIDER_STATUS = Object.freeze({
  chunkId: "OMEGA-NYX-NVIDIA-NIM-ADAPTER-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_WITH_TEST_DOUBLE",
  newCapability: "BOUNDED_NVIDIA_NIM_CHAT_COMPLETION",
  liveNetworkAuthorityGranted: false,
  executorAuthorityGranted: false,
  credentialPersistence: false,
  productionEligible: false,
} as const);

export type NvidiaNimMessageRole = "system" | "user" | "assistant";

export interface NvidiaNimMessage {
  readonly role: NvidiaNimMessageRole;
  readonly content: string;
}

export interface NvidiaNimCredentialSource {
  /** Return the credential only at request time. Callers must not log the value. */
  readonly read: () => string | undefined;
  readonly sourceIdentity: string;
}

export type NvidiaNimTransport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface NvidiaNimProviderConfig {
  readonly providerId: string;
  readonly model: string;
  readonly authorityMode: "TEST_DOUBLE_ONLY" | "EXPLICIT_LIVE_NVIDIA_NIM";
  readonly credentialSource: NvidiaNimCredentialSource;
  readonly maxPromptBytes: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly transport?: NvidiaNimTransport;
  /** Deterministic delivery testing only. Live instances always share the process-local gate. */
  readonly testCapacity?: NvidiaCapacityCoordinator;
}

export interface NvidiaNimCompletionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly messages: readonly NvidiaNimMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly responseFormat?: "JSON_OBJECT" | NvidiaNimJsonSchemaResponseFormat;
  /**
   * Opts this request into the provider's bounded JSON-generation template.
   * Omission preserves the provider's default chat-template behavior.
   */
  readonly inferencePolicy?: "CONSTRAINED_JSON";
  readonly observedAtEpochMs: number;
  /** Caller-owned run expiry; capacity waiting cannot renew it. Never supplied to the model. */
  readonly deadlineEpochMs?: number;
  readonly signal?: AbortSignal;
}

export interface NvidiaNimJsonSchemaResponseFormat {
  readonly type: "JSON_SCHEMA";
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface NvidiaNimUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
}

export type NvidiaNimFinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "function_call";

export type NvidiaNimProviderFailureCategory = "PROVIDER_AUTH_FAILURE" | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_SERVER_ERROR" | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "PROVIDER_TRANSPORT_ERROR"
  | "PROVIDER_REQUEST_REJECTED" | "PROVIDER_RESPONSE_SCHEMA_ERROR" | "PROVIDER_CANCELLED";

export type NvidiaNimRetryability = "YES" | "NO" | "UNKNOWN";

export interface NvidiaNimEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: "E3" | "E4";
  readonly providerId: string;
  readonly endpointOrigin: "https://integrate.api.nvidia.com";
  readonly model: string;
  readonly requestDigest: string;
  readonly responseDigest: string | null;
  readonly credentialSourceIdentity: string;
  readonly credentialPersisted: false;
  readonly promptPersisted: false;
  readonly networkAttempted: boolean;
  readonly statusCode: number | null;
  readonly failureCategory: NvidiaNimProviderFailureCategory | null;
  readonly retryability: NvidiaNimRetryability | null;
  readonly providerRequestId: string | null;
  readonly finishReason: NvidiaNimFinishReason | null;
  readonly usage: NvidiaNimUsage;
  readonly delivery?: NvidiaNimDeliveryEvidence;
}

export interface NvidiaNimDeliveryEvidence {
  readonly policy: "nvidia-capacity/1";
  readonly requestsPerMinute: 40;
  readonly scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT";
  readonly httpAttempts: number;
  readonly rateLimitedResponses: number;
  readonly capacityWaitMs: number;
  readonly state: "DELIVERED" | "WAITING_FOR_CAPACITY" | "STOPPED";
  readonly notBeforeEpochMs: number | null;
  readonly authorityRenewed: false;
}

export interface NvidiaNimCompletionResult {
  readonly decision: "COMPLETED" | "REJECTED" | "BLOCKED" | "PROVIDER_ERROR" | "WAITING_FOR_CAPACITY";
  readonly reason: string;
  readonly content: string | null;
  readonly finishReason: NvidiaNimFinishReason | null;
  readonly evidence: NvidiaNimEvidence;
  readonly executorAuthorityGranted: false;
}

interface ProviderResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: unknown };
    readonly finish_reason?: unknown;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly total_tokens?: unknown;
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validMessages(messages: readonly NvidiaNimMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length < 1) return false;
  let previous: NvidiaNimMessageRole | null = null;
  for (const [index, message] of messages.entries()) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) return false;
    if (message.role === "system") {
      if (index !== 0) return false;
    } else if (message.role === previous || (index === 0 && message.role === "assistant")) return false;
    previous = message.role;
  }
  return messages.at(-1)?.role === "user";
}

function emptyUsage(): NvidiaNimUsage {
  return Object.freeze({ promptTokens: null, completionTokens: null, totalTokens: null });
}

function responseFormatPayload(format: NvidiaNimCompletionRequest["responseFormat"]): Record<string, unknown> | null {
  if (format === undefined) return null;
  if (format === "JSON_OBJECT") return { type: "json_object" };
  if (!format || format.type !== "JSON_SCHEMA" || !/^[a-z][a-z0-9_]{2,63}$/i.test(format.name)
    || !format.schema || typeof format.schema !== "object" || Array.isArray(format.schema)) return null;
  try {
    if (Buffer.byteLength(canonical(format.schema), "utf8") > 32_768) return null;
  } catch { return null; }
  return { type: "json_schema", json_schema: { name: format.name, strict: true, schema: format.schema } };
}

function safeProviderRequestId(value: string | null): string | null {
  return value && /^[A-Za-z0-9._:/-]{1,160}$/.test(value) ? value : null;
}

const NVIDIA_NIM_FINISH_REASONS = new Set<NvidiaNimFinishReason>([
  "stop", "length", "content_filter", "tool_calls", "function_call",
]);

function safeFinishReason(value: unknown): NvidiaNimFinishReason | null {
  return typeof value === "string" && NVIDIA_NIM_FINISH_REASONS.has(value as NvidiaNimFinishReason)
    ? value as NvidiaNimFinishReason
    : null;
}

function failureDiagnostics(reason: string, statusCode: number | null): {
  readonly category: NvidiaNimProviderFailureCategory | null;
  readonly retryability: NvidiaNimRetryability | null;
} {
  if (reason === "nvidia_provider_timeout") return { category: "PROVIDER_TIMEOUT", retryability: "YES" };
  if (reason === "nvidia_provider_cancelled") return { category: "PROVIDER_CANCELLED", retryability: "NO" };
  if (reason === "nvidia_provider_transport_failure") return { category: "PROVIDER_TRANSPORT_ERROR", retryability: "UNKNOWN" };
  if (reason === "nvidia_provider_response_not_json" || reason === "nvidia_provider_response_missing_content"
    || reason === "nvidia_provider_response_finish_reason_invalid") {
    return { category: "PROVIDER_RESPONSE_SCHEMA_ERROR", retryability: "NO" };
  }
  if (statusCode === 401 || statusCode === 403) return { category: "PROVIDER_AUTH_FAILURE", retryability: "NO" };
  if (statusCode === 400 || statusCode === 404 || statusCode === 405 || statusCode === 422) {
    return { category: "PROVIDER_REQUEST_REJECTED", retryability: "NO" };
  }
  if (statusCode === 429) return { category: "PROVIDER_RATE_LIMIT", retryability: "YES" };
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return { category: "PROVIDER_UNAVAILABLE", retryability: "YES" };
  if (statusCode !== null && statusCode >= 500) return { category: "PROVIDER_SERVER_ERROR", retryability: "YES" };
  return { category: null, retryability: null };
}

export function nvidiaNimCredentialFromEnvironment(environment: Readonly<Record<string, string | undefined>>): NvidiaNimCredentialSource {
  return Object.freeze({
    sourceIdentity: "environment:NVIDIA_API_KEY",
    read: () => environment.NVIDIA_API_KEY,
  });
}

export class NvidiaNimProvider {
  readonly #config: NvidiaNimProviderConfig;
  readonly #transport: NvidiaNimTransport | null;
  readonly #capacity: NvidiaCapacityCoordinator | null;

  private constructor(config: NvidiaNimProviderConfig, transport: NvidiaNimTransport | null) {
    this.#config = Object.freeze({ ...config, credentialSource: Object.freeze({ ...config.credentialSource }) });
    this.#transport = transport;
    this.#capacity = config.authorityMode === "EXPLICIT_LIVE_NVIDIA_NIM" ? liveNvidiaCapacity : config.testCapacity ?? null;
  }

  static create(config: NvidiaNimProviderConfig): NvidiaNimProvider {
    if (!config.providerId.trim() || !/^[a-z0-9][a-z0-9._/-]{2,127}$/i.test(config.model)) throw new Error("provider_identity_or_model_invalid");
    if (!config.credentialSource.sourceIdentity.trim() || typeof config.credentialSource.read !== "function") throw new Error("credential_source_invalid");
    if (!Number.isInteger(config.maxPromptBytes) || config.maxPromptBytes < 1
      || !Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 32_768
      || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 120_000) throw new Error("provider_resource_policy_invalid");
    if (config.authorityMode === "TEST_DOUBLE_ONLY" && !config.transport) throw new Error("test_double_transport_required");
    if (config.authorityMode !== "TEST_DOUBLE_ONLY" && config.authorityMode !== "EXPLICIT_LIVE_NVIDIA_NIM") throw new Error("provider_authority_mode_invalid");
    if (config.testCapacity && (config.authorityMode !== "TEST_DOUBLE_ONLY" || !(config.testCapacity instanceof NvidiaCapacityCoordinator))) {
      throw new Error("test_capacity_cannot_override_live_gate");
    }
    return new NvidiaNimProvider(config, config.transport ?? (config.authorityMode === "EXPLICIT_LIVE_NVIDIA_NIM" ? fetch : null));
  }

  profile(): typeof NVIDIA_NIM_PROVIDER_STATUS & { readonly authorityMode: NvidiaNimProviderConfig["authorityMode"]; readonly model: string } {
    return Object.freeze({ ...NVIDIA_NIM_PROVIDER_STATUS, authorityMode: this.#config.authorityMode, model: this.#config.model });
  }

  async complete(request: NvidiaNimCompletionRequest): Promise<NvidiaNimCompletionResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const responseFormat = responseFormatPayload(request.responseFormat);
    const payload = { model: this.#config.model, messages: request.messages, max_tokens: request.maxTokens,
      temperature: request.temperature, stream: false,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(request.inferencePolicy === "CONSTRAINED_JSON"
        ? { chat_template_kwargs: { enable_thinking: false, force_nonempty_content: true } }
        : {}) };
    const requestDigest = sha256(canonical({ requestId, ...payload }));
    const issues: string[] = [];
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || !Number.isFinite(request.observedAtEpochMs)) issues.push("completion_request_malformed");
    if (request.deadlineEpochMs !== undefined && (!Number.isSafeInteger(request.deadlineEpochMs) || request.deadlineEpochMs < 0)) {
      issues.push("completion_deadline_invalid");
    }
    if (!validMessages(request.messages)) issues.push("completion_messages_invalid");
    if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > this.#config.maxOutputTokens) issues.push("completion_token_bound_exceeded");
    if (typeof request.temperature !== "number" || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 1) issues.push("completion_temperature_invalid");
    if (request.responseFormat !== undefined && responseFormat === null) issues.push("completion_response_format_invalid");
    if (request.inferencePolicy !== undefined && request.inferencePolicy !== "CONSTRAINED_JSON") issues.push("completion_inference_policy_invalid");
    if (request.inferencePolicy === "CONSTRAINED_JSON" && responseFormat === null) issues.push("completion_constrained_json_requires_response_format");
    if (Buffer.byteLength(canonical(request.messages), "utf8") > this.#config.maxPromptBytes) issues.push("completion_prompt_bound_exceeded");
    if (issues.length > 0) return this.#result("REJECTED", [...new Set(issues)].join(","), null, null, requestDigest, null, null, emptyUsage(), false);
    // Serialize once: queued requests and retries cannot silently pick up caller mutations.
    const body = JSON.stringify(payload);
    const now = () => this.#capacity?.clock.now() ?? Date.now();
    const deadline = Math.min(request.deadlineEpochMs ?? Infinity, now() + NVIDIA_CAPACITY_POLICY.defaultRequestLifetimeMs);
    const signal = request.signal ?? new AbortController().signal;
    let httpAttempts = 0;
    let rateLimitedResponses = 0;
    let capacityWaitMs = 0;
    let previous: NvidiaNimCompletionResult | null = null;
    const finish = (result: NvidiaNimCompletionResult, notBeforeEpochMs: number | null = null): NvidiaNimCompletionResult => {
      const delivery: NvidiaNimDeliveryEvidence = Object.freeze({ policy: "nvidia-capacity/1", requestsPerMinute: 40,
        scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT", httpAttempts, rateLimitedResponses, capacityWaitMs,
        state: result.decision === "COMPLETED" ? "DELIVERED" : result.decision === "WAITING_FOR_CAPACITY" ? "WAITING_FOR_CAPACITY" : "STOPPED",
        notBeforeEpochMs, authorityRenewed: false });
      return Object.freeze({ ...result, evidence: Object.freeze({ ...result.evidence, delivery }) });
    };
    const stopped = (cancelled: boolean, notBeforeEpochMs: number | null = null) => finish(this.#result(
      cancelled ? "BLOCKED" : "WAITING_FOR_CAPACITY", cancelled ? "nvidia_provider_cancelled" : "nvidia_capacity_requires_renewed_run",
      null, null, requestDigest, null, previous?.evidence.statusCode ?? null, emptyUsage(), httpAttempts > 0,
      previous?.evidence.providerRequestId ?? null), notBeforeEpochMs);
    while (true) {
      if (signal.aborted) return stopped(true);
      if (now() >= deadline) return stopped(false);
      if (this.#capacity) {
        const admission = await this.#capacity.acquire(deadline, signal);
        capacityWaitMs += admission.waitedMs;
        if (admission.state !== "ADMITTED") return stopped(admission.state === "CANCELLED", admission.notBeforeEpochMs);
      }
      // Admission can await; recheck before any credential read or external request.
      if (signal.aborted) return stopped(true);
      if (now() >= deadline) return stopped(false);
      previous = await this.#attempt(body, requestDigest, signal, deadline);
      if (previous.evidence.networkAttempted) httpAttempts += 1;
      if (previous.evidence.statusCode === 429) rateLimitedResponses += 1;
      if (previous.evidence.statusCode === 429 && this.#capacity) continue;
      if (signal.aborted) return stopped(true);
      if (now() >= deadline && previous.decision === "COMPLETED") {
        return finish(this.#result("BLOCKED", "nvidia_completion_run_expired", null, null, requestDigest,
          previous.evidence.responseDigest, previous.evidence.statusCode, previous.evidence.usage, httpAttempts > 0));
      }
      return finish(previous);
    }
  }

  async #attempt(body: string, requestDigest: string, signal: AbortSignal, deadlineEpochMs: number): Promise<NvidiaNimCompletionResult> {
    let credential: string | undefined;
    try { credential = this.#config.credentialSource.read(); }
    catch { return this.#result("BLOCKED", "nvidia_api_credential_unavailable", null, null, requestDigest, null, null, emptyUsage(), false); }
    if (typeof credential !== "string" || credential.length < 16 || /\s/.test(credential)) {
      return this.#result("BLOCKED", "nvidia_api_credential_unavailable", null, null, requestDigest, null, null, emptyUsage(), false);
    }
    if (!this.#transport) return this.#result("BLOCKED", "network_transport_unavailable", null, null, requestDigest, null, null, emptyUsage(), false);
    const remainingMs = deadlineEpochMs - (this.#capacity?.clock.now() ?? Date.now());
    if (remainingMs <= 0) return this.#result("BLOCKED", "nvidia_completion_run_expired", null, null,
      requestDigest, null, null, emptyUsage(), false);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { signal.removeEventListener("abort", abort); return this.#result("BLOCKED", "nvidia_provider_cancelled",
      null, null, requestDigest, null, null, emptyUsage(), false); }
    let timeoutTriggered = false;
    const timeout = setTimeout(() => { timeoutTriggered = true; controller.abort(); }, Math.min(this.#config.timeoutMs, remainingMs));
    try {
      this.#capacity?.recordDispatch();
      const response = await this.#transport(NVIDIA_NIM_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json", "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      const providerRequestId = safeProviderRequestId(response.headers.get("x-request-id") ?? response.headers.get("request-id"));
      if (!response.ok) {
        if (response.status === 429) this.#capacity?.defer(response.headers.get("retry-after"));
        // Error bodies are not model input or evidence; release the response without persisting it.
        try { await response.body?.cancel(); } catch { /* transport cleanup cannot make rejection successful */ }
        return this.#result("PROVIDER_ERROR", `nvidia_provider_http_${response.status}`, null, null, requestDigest, null,
          response.status, emptyUsage(), true, providerRequestId);
      }
      let parsed: ProviderResponse;
      try { parsed = await response.json() as ProviderResponse; }
      catch { return this.#result("PROVIDER_ERROR", "nvidia_provider_response_not_json", null, null, requestDigest, null,
        response.status, emptyUsage(), true, providerRequestId); }
      const content = parsed.choices?.[0]?.message?.content;
      const rawFinishReason = parsed.choices?.[0]?.finish_reason;
      if (typeof content !== "string" || !content.trim()) {
        return this.#result("PROVIDER_ERROR", "nvidia_provider_response_missing_content", null, null, requestDigest, null,
          response.status, emptyUsage(), true, providerRequestId);
      }
      const finishReason = safeFinishReason(rawFinishReason);
      if (finishReason === null) {
        return this.#result("PROVIDER_ERROR", "nvidia_provider_response_finish_reason_invalid", null, null, requestDigest,
          sha256(content), response.status, emptyUsage(), true, providerRequestId);
      }
      const usage = Object.freeze({ promptTokens: finiteInteger(parsed.usage?.prompt_tokens),
        completionTokens: finiteInteger(parsed.usage?.completion_tokens), totalTokens: finiteInteger(parsed.usage?.total_tokens) });
      return this.#result("COMPLETED", "nvidia_nim_completion_observed", content,
        finishReason, requestDigest, sha256(content), response.status, usage, true, providerRequestId);
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError"
        ? timeoutTriggered ? "nvidia_provider_timeout" : "nvidia_provider_cancelled"
        : "nvidia_provider_transport_failure";
      return this.#result("PROVIDER_ERROR", reason, null, null, requestDigest, null, null, emptyUsage(), true);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }

  #result(decision: NvidiaNimCompletionResult["decision"], reason: string, content: string | null, finishReason: NvidiaNimFinishReason | null,
    requestDigest: string, responseDigest: string | null, statusCode: number | null, usage: NvidiaNimUsage,
    networkAttempted: boolean, providerRequestId: string | null = null): NvidiaNimCompletionResult {
    const evidenceClass = this.#config.authorityMode === "EXPLICIT_LIVE_NVIDIA_NIM" && networkAttempted ? "E4" : "E3";
    const diagnostics = failureDiagnostics(reason, statusCode);
    const evidence: NvidiaNimEvidence = Object.freeze({ evidenceId: `NVIDIA-NIM-${requestDigest.slice(0, 32)}`, evidenceClass,
      providerId: this.#config.providerId, endpointOrigin: "https://integrate.api.nvidia.com", model: this.#config.model,
      requestDigest, responseDigest, credentialSourceIdentity: this.#config.credentialSource.sourceIdentity,
      credentialPersisted: false, promptPersisted: false, networkAttempted, statusCode,
      failureCategory: diagnostics.category, retryability: diagnostics.retryability,
      providerRequestId: safeProviderRequestId(providerRequestId), finishReason, usage });
    return Object.freeze({ decision, reason, content, finishReason, evidence, executorAuthorityGranted: false });
  }
}
