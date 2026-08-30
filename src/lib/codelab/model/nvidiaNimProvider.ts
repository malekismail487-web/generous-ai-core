import { createHash } from "node:crypto";

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
}

export interface NvidiaNimCompletionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly messages: readonly NvidiaNimMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly responseFormat?: "JSON_OBJECT" | NvidiaNimJsonSchemaResponseFormat;
  readonly observedAtEpochMs: number;
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
  readonly usage: NvidiaNimUsage;
}

export interface NvidiaNimCompletionResult {
  readonly decision: "COMPLETED" | "REJECTED" | "BLOCKED" | "PROVIDER_ERROR";
  readonly reason: string;
  readonly content: string | null;
  readonly finishReason: string | null;
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

export function nvidiaNimCredentialFromEnvironment(environment: Readonly<Record<string, string | undefined>>): NvidiaNimCredentialSource {
  return Object.freeze({
    sourceIdentity: "environment:NVIDIA_API_KEY",
    read: () => environment.NVIDIA_API_KEY,
  });
}

export class NvidiaNimProvider {
  readonly #config: NvidiaNimProviderConfig;
  readonly #transport: NvidiaNimTransport | null;

  private constructor(config: NvidiaNimProviderConfig, transport: NvidiaNimTransport | null) {
    this.#config = config;
    this.#transport = transport;
  }

  static create(config: NvidiaNimProviderConfig): NvidiaNimProvider {
    if (!config.providerId.trim() || !/^[a-z0-9][a-z0-9._/-]{2,127}$/i.test(config.model)) throw new Error("provider_identity_or_model_invalid");
    if (!config.credentialSource.sourceIdentity.trim() || typeof config.credentialSource.read !== "function") throw new Error("credential_source_invalid");
    if (!Number.isInteger(config.maxPromptBytes) || config.maxPromptBytes < 1
      || !Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 32_768
      || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 120_000) throw new Error("provider_resource_policy_invalid");
    if (config.authorityMode === "TEST_DOUBLE_ONLY" && !config.transport) throw new Error("test_double_transport_required");
    if (config.authorityMode !== "TEST_DOUBLE_ONLY" && config.authorityMode !== "EXPLICIT_LIVE_NVIDIA_NIM") throw new Error("provider_authority_mode_invalid");
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
      ...(responseFormat ? { response_format: responseFormat } : {}) };
    const requestDigest = sha256(canonical({ requestId, ...payload }));
    const issues: string[] = [];
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || !Number.isFinite(request.observedAtEpochMs)) issues.push("completion_request_malformed");
    if (!validMessages(request.messages)) issues.push("completion_messages_invalid");
    if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > this.#config.maxOutputTokens) issues.push("completion_token_bound_exceeded");
    if (typeof request.temperature !== "number" || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 1) issues.push("completion_temperature_invalid");
    if (request.responseFormat !== undefined && responseFormat === null) issues.push("completion_response_format_invalid");
    if (Buffer.byteLength(canonical(request.messages), "utf8") > this.#config.maxPromptBytes) issues.push("completion_prompt_bound_exceeded");
    if (issues.length > 0) return this.#result("REJECTED", [...new Set(issues)].join(","), null, null, requestDigest, null, null, emptyUsage(), false);
    const credential = this.#config.credentialSource.read();
    if (typeof credential !== "string" || credential.length < 16 || /\s/.test(credential)) {
      return this.#result("BLOCKED", "nvidia_api_credential_unavailable", null, null, requestDigest, null, null, emptyUsage(), false);
    }
    if (!this.#transport) return this.#result("BLOCKED", "network_transport_unavailable", null, null, requestDigest, null, null, emptyUsage(), false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    try {
      const response = await this.#transport(NVIDIA_NIM_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        return this.#result("PROVIDER_ERROR", `nvidia_provider_http_${response.status}`, null, null, requestDigest, null,
          response.status, emptyUsage(), true);
      }
      let parsed: ProviderResponse;
      try { parsed = await response.json() as ProviderResponse; }
      catch { return this.#result("PROVIDER_ERROR", "nvidia_provider_response_not_json", null, null, requestDigest, null,
        response.status, emptyUsage(), true); }
      const content = parsed.choices?.[0]?.message?.content;
      const finishReason = parsed.choices?.[0]?.finish_reason;
      if (typeof content !== "string" || !content.trim()) {
        return this.#result("PROVIDER_ERROR", "nvidia_provider_response_missing_content", null, null, requestDigest, null,
          response.status, emptyUsage(), true);
      }
      const usage = Object.freeze({ promptTokens: finiteInteger(parsed.usage?.prompt_tokens),
        completionTokens: finiteInteger(parsed.usage?.completion_tokens), totalTokens: finiteInteger(parsed.usage?.total_tokens) });
      return this.#result("COMPLETED", "nvidia_nim_completion_observed", content,
        typeof finishReason === "string" ? finishReason : null, requestDigest, sha256(content), response.status, usage, true);
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "nvidia_provider_timeout" : "nvidia_provider_transport_failure";
      return this.#result("PROVIDER_ERROR", reason, null, null, requestDigest, null, null, emptyUsage(), true);
    } finally {
      clearTimeout(timeout);
    }
  }

  #result(decision: NvidiaNimCompletionResult["decision"], reason: string, content: string | null, finishReason: string | null,
    requestDigest: string, responseDigest: string | null, statusCode: number | null, usage: NvidiaNimUsage,
    networkAttempted: boolean): NvidiaNimCompletionResult {
    const evidenceClass = this.#config.authorityMode === "EXPLICIT_LIVE_NVIDIA_NIM" && networkAttempted ? "E4" : "E3";
    const evidence: NvidiaNimEvidence = Object.freeze({ evidenceId: `NVIDIA-NIM-${requestDigest.slice(0, 32)}`, evidenceClass,
      providerId: this.#config.providerId, endpointOrigin: "https://integrate.api.nvidia.com", model: this.#config.model,
      requestDigest, responseDigest, credentialSourceIdentity: this.#config.credentialSource.sourceIdentity,
      credentialPersisted: false, promptPersisted: false, networkAttempted, statusCode, usage });
    return Object.freeze({ decision, reason, content, finishReason, evidence, executorAuthorityGranted: false });
  }
}
