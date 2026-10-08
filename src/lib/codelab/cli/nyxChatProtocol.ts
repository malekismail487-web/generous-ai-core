import { createHash } from "node:crypto";
import type { NvidiaNimJsonSchemaResponseFormat } from "../model/nvidiaNimProvider";
import { validQuantitativeProblem, type QuantitativeProblem } from "../research/exactQuantitativeDerivation";
import { quantitativeProgramSchema } from "../research/nyxQuantitativeReasoning";
import type { QuantitativeEquations } from "../research/quantitativeEquationCompiler";
import { theoryDigest } from "../research/theoryContracts";

/** Host-owned workflow restriction, not a capability token or an authorization grant. */
export type NyxChatActionContract =
  | { readonly kind: "REPLY_ONLY" }
  | { readonly kind: "READ_THEN_REPLY"; readonly path: string }
  | { readonly kind: "DERIVE_THEN_REPLY"; readonly problem: QuantitativeProblem; readonly outputLabels: readonly string[] };

export function nyxChatActionContractValid(value: unknown): value is NyxChatActionContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const contract = value as Record<string, unknown>;
  return contract.kind === "REPLY_ONLY" && exactKeys(contract, ["kind"])
    || contract.kind === "READ_THEN_REPLY" && exactKeys(contract, ["kind", "path"])
      && nyxSafeRelativePath(contract.path)
    || contract.kind === "DERIVE_THEN_REPLY" && exactKeys(contract, ["kind", "problem", "outputLabels"])
      && validQuantitativeProblem(contract.problem as QuantitativeProblem)
      && Array.isArray(contract.outputLabels) && contract.outputLabels.length > 0 && contract.outputLabels.length <= 16
      && contract.outputLabels.every(label => typeof label === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(label))
      && new Set(contract.outputLabels).size === contract.outputLabels.length;
}

/** Generation guidance only; the strict parser, phase check and R1 executor remain independent. */
export function nyxChatContractFormat(contract: NyxChatActionContract, observed: boolean): NvidiaNimJsonSchemaResponseFormat {
  if (!nyxChatActionContractValid(contract) || typeof observed !== "boolean") throw Error("nyx_chat_action_contract_invalid");
  const readRequired = contract.kind === "READ_THEN_REPLY" && !observed;
  if (contract.kind === "DERIVE_THEN_REPLY" && !observed) return {
    type: "JSON_SCHEMA", name: "nyx_required_public_derivation", schema: {type:"object",additionalProperties:false,
      required:["kind","problemDigest","program"],properties:{kind:{type:"string",enum:["DERIVE_QUANTITIES"]},
        problemDigest:{type:"string",enum:[theoryDigest(contract.problem)]},
        program:quantitativeProgramSchema(contract.outputLabels,contract.problem.constants.map(c=>c.id))}}};
  return { type: "JSON_SCHEMA", name: readRequired ? "nyx_required_file_read" : "nyx_contract_reply",
    schema: { type: "object", properties: readRequired
      ? { kind: { type: "string", enum: ["READ_FILE"] }, path: { type: "string", enum: [contract.path] } }
      : { kind: { type: "string", enum: ["REPLY"] }, message: { type: "string", minLength: 1, maxLength: 8000 } },
      required: readRequired ? ["kind", "path"] : ["kind", "message"], additionalProperties: false } };
}

export function nyxChatContractAllows(contract: NyxChatActionContract, observed: boolean, action: NyxChatAction): boolean {
  if (!nyxChatActionContractValid(contract) || typeof observed !== "boolean") return false;
  if (contract.kind === "DERIVE_THEN_REPLY" && !observed)
    return action.kind === "DERIVE_QUANTITIES" && action.problemDigest === theoryDigest(contract.problem);
  return contract.kind === "READ_THEN_REPLY" && !observed
    ? action.kind === "READ_FILE" && action.path === contract.path : action.kind === "REPLY";
}

export type NyxChatAction =
  | { readonly kind: "REPLY"; readonly message: string }
  | { readonly kind: "DERIVE_QUANTITIES"; readonly problemDigest: string; readonly program: QuantitativeEquations }
  | { readonly kind: "READ_FILE" | "LIST_DIRECTORY"; readonly path: string }
  | { readonly kind: "PROPOSE_EDIT"; readonly path: string; readonly expectedBaseHash: string;
      readonly replacement: string; readonly rationale: string }
  | { readonly kind: "TERMINAL_CHECK"; readonly path: string }
  | { readonly kind: "CONTAINER_EXEC"; readonly argv: readonly string[] }
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
  // Recognition is not execution: the bounded workbench independently validates native IR,
  // immutable scope, expiry, revocation and resource policy before computation.
  if (value.kind === "DERIVE_QUANTITIES" && exactKeys(value,["kind","problemDigest","program"])
    && typeof value.problemDigest === "string" && /^[a-f0-9]{64}$/.test(value.problemDigest)
    && value.program && typeof value.program === "object" && !Array.isArray(value.program)
    && (value.program as Record<string,unknown>).schemaVersion === 2)
    return {action:{kind:"DERIVE_QUANTITIES",problemDigest:value.problemDigest,program:value.program as QuantitativeEquations},reason:"accepted"};
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
  if (value.kind === "CONTAINER_EXEC" && exactKeys(value, ["kind", "argv"])
    && Array.isArray(value.argv) && value.argv.length > 0 && value.argv.length <= 24
    && value.argv.every(arg => typeof arg === "string" && !arg.includes("\0") && arg.length <= 8000)
    && value.argv[0].length > 0 && !value.argv[0].startsWith("-")
    && Buffer.byteLength(JSON.stringify(value.argv), "utf8") <= 16000) {
    return { action: { kind: "CONTAINER_EXEC", argv: Object.freeze([...value.argv]) }, reason: "accepted" };
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
