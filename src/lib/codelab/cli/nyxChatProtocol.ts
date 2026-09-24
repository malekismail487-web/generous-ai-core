import { createHash } from "node:crypto";

export type NyxChatAction =
  | { readonly kind: "REPLY"; readonly message: string }
  | { readonly kind: "READ_FILE" | "LIST_DIRECTORY"; readonly path: string }
  | { readonly kind: "PROPOSE_EDIT"; readonly path: string; readonly expectedBaseHash: string;
      readonly replacement: string; readonly rationale: string }
  | { readonly kind: "TERMINAL_CHECK"; readonly path: string }
  | { readonly kind: "DESKTOP_INSPECT" }
  | { readonly kind: "DESKTOP_INVOKE"; readonly selector: string; readonly observationDigest: string }
  | { readonly kind: "DESKTOP_SET_VALUE"; readonly selector: string; readonly observationDigest: string;
      readonly value: string };

export interface NyxChatParseResult {
  readonly action: NyxChatAction | null;
  readonly reason: string;
}

export function nyxSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Conservative guard; no source text matching these patterns is sent to model cognition. */
export function nyxContainsSecretLike(value: string): boolean {
  return /(?:nvapi-[A-Za-z0-9_-]{20,}|ale_live_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})/.test(value);
}

export function nyxCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(nyxCanonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${nyxCanonical(record[key])}`).join(",")}}`;
}

export function nyxSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || value.includes("\0")
    || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) return false;
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").every((part) => part !== "" && part !== ".." && part !== ".");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function parseNyxChatAction(raw: string, maxReplacementBytes = 32_768): NyxChatParseResult {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 50_000) return { action: null, reason: "model_output_oversized" };
  if (nyxContainsSecretLike(raw)) return { action: null, reason: "model_output_credential_pattern" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { action: null, reason: "model_output_not_json" }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { action: null, reason: "model_output_not_object" };
  const value = parsed as Record<string, unknown>;
  if (value.kind === "REPLY" && exactKeys(value, ["kind", "message"])
    && typeof value.message === "string" && value.message.trim() && value.message.length <= 8_000) {
    return { action: { kind: "REPLY", message: value.message }, reason: "accepted" };
  }
  if ((value.kind === "READ_FILE" || value.kind === "LIST_DIRECTORY")
    && exactKeys(value, ["kind", "path"])
    && (nyxSafeRelativePath(value.path) || (value.kind === "LIST_DIRECTORY" && value.path === "."))) {
    return { action: { kind: value.kind, path: value.path }, reason: "accepted" };
  }
  if (value.kind === "PROPOSE_EDIT" && exactKeys(value, ["kind", "path", "expectedBaseHash", "replacement", "rationale"])
    && nyxSafeRelativePath(value.path) && typeof value.expectedBaseHash === "string"
    && /^[a-f0-9]{64}$/.test(value.expectedBaseHash) && typeof value.replacement === "string"
    && Buffer.byteLength(value.replacement, "utf8") <= maxReplacementBytes
    && typeof value.rationale === "string" && value.rationale.trim() && value.rationale.length <= 2_000) {
    return { action: { kind: "PROPOSE_EDIT", path: value.path, expectedBaseHash: value.expectedBaseHash,
      replacement: value.replacement, rationale: value.rationale }, reason: "accepted" };
  }
  if (value.kind === "TERMINAL_CHECK" && exactKeys(value, ["kind", "path"]) && nyxSafeRelativePath(value.path)
    && /\.(?:mjs|cjs|js)$/.test(value.path)) {
    return { action: { kind: "TERMINAL_CHECK", path: value.path }, reason: "accepted" };
  }
  if (value.kind === "DESKTOP_INSPECT" && exactKeys(value, ["kind"])) {
    return { action: { kind: "DESKTOP_INSPECT" }, reason: "accepted" };
  }
  if ((value.kind === "DESKTOP_INVOKE" || value.kind === "DESKTOP_SET_VALUE")
    && exactKeys(value, value.kind === "DESKTOP_INVOKE" ? ["kind", "selector", "observationDigest"]
      : ["kind", "selector", "observationDigest", "value"])
    && typeof value.selector === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value.selector)
    && typeof value.observationDigest === "string" && /^[a-f0-9]{64}$/.test(value.observationDigest)) {
    if (value.kind === "DESKTOP_INVOKE") return { action: { kind: "DESKTOP_INVOKE", selector: value.selector,
      observationDigest: value.observationDigest }, reason: "accepted" };
    if (typeof value.value === "string" && value.value.length <= 1_000 && !nyxContainsSecretLike(value.value)) {
      return { action: { kind: "DESKTOP_SET_VALUE", selector: value.selector,
        observationDigest: value.observationDigest, value: value.value }, reason: "accepted" };
    }
  }
  return { action: null, reason: "unknown_or_malformed_typed_action" };
}
