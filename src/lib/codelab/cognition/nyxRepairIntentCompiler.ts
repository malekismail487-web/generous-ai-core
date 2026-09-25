import { createHash } from "node:crypto";
import { extname } from "node:path";
import { format } from "prettier";
import ts from "typescript";

export type NyxRepairIntentCompilationMode = "STRICT" | "SAFE_CANONICALIZATION";

export const NYX_REPAIR_INTENT_COMPILER_STATUS = Object.freeze({
  compilerId: "OMEGA_NYX_REPAIR_INTENT_COMPILER",
  compilerVersion: "nyx-repair-intent-compiler/2",
  formatterIdentity: "prettier/3.9.6",
  supportedModes: Object.freeze(["STRICT", "SAFE_CANONICALIZATION"] as const),
  transformsExecutableTargets: false,
  repairsInvalidSyntax: false,
  grantsAuthority: false,
  requiresOrdinaryAdmissionAndExecutionVerification: true,
} as const);

export interface NyxIntentCompilationOperation {
  readonly kind: "BOUND_ADVISORY_COUNTEREXAMPLES" | "CANONICALIZE_PARSEABLE_SOURCE";
  readonly path: string;
  readonly beforeDigest: string;
  readonly afterDigest: string;
  readonly beforeCount?: number;
  readonly afterCount?: number;
}

export interface NyxIntentCompilationEvidence {
  readonly compilerId: "OMEGA_NYX_REPAIR_INTENT_COMPILER";
  readonly compilerVersion: "nyx-repair-intent-compiler/2";
  readonly formatterIdentity: "prettier/3.9.6";
  readonly mode: NyxRepairIntentCompilationMode;
  readonly outcome: "NOT_REQUESTED" | "UNCHANGED" | "COMPILED" | "REFUSED";
  readonly inputDigest: string;
  readonly outputDigest: string;
  readonly refusalReason: string | null;
  readonly operations: readonly NyxIntentCompilationOperation[];
  readonly semanticPreservationClaim: "NONE" | "PARSEABLE_SOURCE_FORMAT_REQUIRES_EXECUTION_VERIFICATION";
  readonly executableAuthorityGranted: false;
}

export interface NyxRepairIntentCompilationRequest {
  readonly mode: NyxRepairIntentCompilationMode;
  readonly sourceRepresentation: "TEXT" | "LINES";
  readonly maxCounterexamples: number;
  readonly maxPatchBytes: number;
  readonly maxLineLength: number;
  readonly maxSourceLines: number;
}

export interface NyxRepairIntentCompilationResult {
  readonly value: unknown;
  readonly evidence: NyxIntentCompilationEvidence;
}

export interface NyxSourceSyntaxValidation {
  readonly valid: boolean;
  readonly parser: "babel" | "json" | "typescript";
  readonly line: number | null;
  readonly column: number | null;
}

export interface NyxSourceLanguageContract {
  readonly language: "ECMASCRIPT_2022" | "TYPESCRIPT" | "JSON";
  readonly parser: "babel" | "json" | "typescript";
  readonly moduleSystem: "ES_MODULE" | "COMMONJS" | "DATA" | "REPOSITORY_CONVENTION";
  readonly forbiddenSyntax: readonly string[];
}

const JAVASCRIPT_ONLY_FORBIDDEN_SYNTAX = Object.freeze([
  "TypeScript type annotations",
  "TypeScript as/satisfies assertions",
  "interface/type/enum/namespace declarations",
  "access modifiers and parameter properties",
] as const);

/** Machine-readable source-language contract used by both prompting and admission diagnostics. */
export function nyxSourceLanguageContract(path: string): NyxSourceLanguageContract {
  switch (extname(path).toLowerCase()) {
    case ".mjs":
      return Object.freeze({ language: "ECMASCRIPT_2022", parser: "babel", moduleSystem: "ES_MODULE",
        forbiddenSyntax: JAVASCRIPT_ONLY_FORBIDDEN_SYNTAX });
    case ".cjs":
      return Object.freeze({ language: "ECMASCRIPT_2022", parser: "babel", moduleSystem: "COMMONJS",
        forbiddenSyntax: JAVASCRIPT_ONLY_FORBIDDEN_SYNTAX });
    case ".js": case ".jsx":
      return Object.freeze({ language: "ECMASCRIPT_2022", parser: "babel", moduleSystem: "REPOSITORY_CONVENTION",
        forbiddenSyntax: JAVASCRIPT_ONLY_FORBIDDEN_SYNTAX });
    case ".json":
      return Object.freeze({ language: "JSON", parser: "json", moduleSystem: "DATA",
        forbiddenSyntax: Object.freeze(["comments", "functions", "undefined", "trailing commas"]) });
    default:
      return Object.freeze({ language: "TYPESCRIPT", parser: "typescript", moduleSystem: "REPOSITORY_CONVENTION",
        forbiddenSyntax: Object.freeze([]) });
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function frozenOperation(operation: NyxIntentCompilationOperation): NyxIntentCompilationOperation {
  return Object.freeze({ ...operation });
}

function evidence(request: NyxRepairIntentCompilationRequest, inputDigest: string, outputDigest: string,
  outcome: NyxIntentCompilationEvidence["outcome"], refusalReason: string | null,
  operations: readonly NyxIntentCompilationOperation[]): NyxIntentCompilationEvidence {
  return Object.freeze({ compilerId: "OMEGA_NYX_REPAIR_INTENT_COMPILER",
    compilerVersion: "nyx-repair-intent-compiler/2", formatterIdentity: "prettier/3.9.6",
    mode: request.mode, outcome, inputDigest, outputDigest,
    refusalReason, operations: Object.freeze(operations.map(frozenOperation)),
    semanticPreservationClaim: operations.some((item) => item.kind === "CANONICALIZE_PARSEABLE_SOURCE")
      ? "PARSEABLE_SOURCE_FORMAT_REQUIRES_EXECUTION_VERIFICATION" : "NONE",
    executableAuthorityGranted: false });
}

function sourceKind(path: string): ts.ScriptKind {
  switch (extname(path).toLowerCase()) {
    case ".js": case ".cjs": case ".mjs": return ts.ScriptKind.JS;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".tsx": return ts.ScriptKind.TSX;
    case ".json": return ts.ScriptKind.JSON;
    default: return ts.ScriptKind.TS;
  }
}

function prettierParser(path: string): "babel" | "json" | "typescript" {
  return nyxSourceLanguageContract(path).parser;
}

function parseable(path: string, source: string): boolean {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, sourceKind(path));
  const diagnostics = (parsed as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  return diagnostics.length === 0;
}

async function formatParseableSource(path: string, source: string, printWidth: number): Promise<string | null> {
  if (!parseable(path, source)) return null;
  try {
    const formatted = await format(source, { parser: prettierParser(path), filepath: path,
      printWidth, tabWidth: 2, useTabs: false, endOfLine: "lf" });
    return parseable(path, formatted) ? formatted : null;
  } catch {
    return null;
  }
}

function syntaxLocation(error: unknown): { readonly line: number | null; readonly column: number | null } {
  if (!error || typeof error !== "object") return { line: null, column: null };
  const loc = (error as { readonly loc?: unknown }).loc;
  if (!loc || typeof loc !== "object") return { line: null, column: null };
  const start = (loc as { readonly start?: unknown }).start;
  const position = start && typeof start === "object" ? start : loc;
  const line = (position as { readonly line?: unknown }).line;
  const column = (position as { readonly column?: unknown }).column;
  return { line: Number.isSafeInteger(line) && Number(line) > 0 ? Number(line) : null,
    column: Number.isSafeInteger(column) && Number(column) >= 0 ? Number(column) : null };
}

/** Parse-only authority-neutral check using the same language parser as canonical formatting. */
export async function validateNyxSourceSyntax(path: string, source: string): Promise<NyxSourceSyntaxValidation> {
  const parser = prettierParser(path);
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, sourceKind(path));
  const diagnostics = (parsed as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const start = diagnostics[0].start;
    const position = start === undefined ? null : parsed.getLineAndCharacterOfPosition(start);
    return Object.freeze({ valid: false, parser, line: position === null ? null : position.line + 1,
      column: position === null ? null : position.character + 1 });
  }
  try {
    await format(source, { parser, filepath: path, printWidth: 120, endOfLine: "lf" });
    return Object.freeze({ valid: true, parser, line: null, column: null });
  } catch (error) {
    return Object.freeze({ valid: false, parser, ...syntaxLocation(error) });
  }
}

function asStructuredSource(value: unknown): { readonly lines: readonly string[]; readonly lineEnding: "LF" | "CRLF" } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 2 || !Object.keys(item).every((key) => key === "lines" || key === "lineEnding")
    || !Array.isArray(item.lines) || item.lines.length < 1 || !item.lines.every((line) => typeof line === "string")
    || (item.lineEnding !== "LF" && item.lineEnding !== "CRLF")) return null;
  return { lines: item.lines as string[], lineEnding: item.lineEnding };
}

function safeCounterexampleBound(value: unknown, maximum: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length <= maximum || value.length < 1
    || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 500)) return null;
  const unique = [...new Set(value as string[])];
  return unique.slice(0, maximum);
}

/**
 * Converts a narrow class of syntactically valid model wire output into the
 * strict Omega intent contract. It never repairs syntax, targets, capabilities,
 * or executable semantics and it never grants authority. Every transformed
 * candidate still requires the ordinary validator and deterministic execution.
 */
export async function compileNyxRepairIntent(input: unknown,
  request: NyxRepairIntentCompilationRequest): Promise<NyxRepairIntentCompilationResult> {
  const inputDigest = digest(input);
  if (request.mode === "STRICT") {
    return Object.freeze({ value: input, evidence: evidence(request, inputDigest, inputDigest,
      "NOT_REQUESTED", null, []) });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Object.freeze({ value: input, evidence: evidence(request, inputDigest, inputDigest,
      "REFUSED", "intent_not_object", []) });
  }

  const output = { ...(input as Record<string, unknown>) };
  const operations: NyxIntentCompilationOperation[] = [];
  const boundedCounterexamples = safeCounterexampleBound(output.counterexamples, request.maxCounterexamples);
  if (boundedCounterexamples) {
    const before = output.counterexamples as unknown[];
    output.counterexamples = boundedCounterexamples;
    operations.push({ kind: "BOUND_ADVISORY_COUNTEREXAMPLES", path: "$.counterexamples",
      beforeDigest: digest(before), afterDigest: digest(boundedCounterexamples),
      beforeCount: before.length, afterCount: boundedCounterexamples.length });
  }

  if (request.sourceRepresentation === "LINES" && Array.isArray(output.changes)) {
    const compiledChanges = [...output.changes];
    for (const [index, value] of compiledChanges.entries()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const change = value as Record<string, unknown>;
      if (Object.keys(change).some((key) => key !== "target" && key !== "replacement")
        || typeof change.target !== "string") continue;
      const replacement = asStructuredSource(change.replacement);
      if (!replacement || replacement.lines.length > request.maxSourceLines
        || !replacement.lines.some((line) => line.length > request.maxLineLength)) continue;
      const separator = replacement.lineEnding === "LF" ? "\n" : "\r\n";
      const original = replacement.lines.join(separator);
      if (Buffer.byteLength(original, "utf8") > request.maxPatchBytes) continue;
      const formatted = await formatParseableSource(change.target, original, request.maxLineLength);
      if (formatted === null || formatted === original || Buffer.byteLength(formatted, "utf8") > request.maxPatchBytes) continue;
      const formattedLines = formatted.split("\n");
      if (formattedLines.length > request.maxSourceLines
        || formattedLines.some((line) => line.length > request.maxLineLength || /[\r\n\u2028\u2029]/.test(line))) continue;
      const structured = Object.freeze({ lines: Object.freeze(formattedLines), lineEnding: replacement.lineEnding });
      compiledChanges[index] = Object.freeze({ ...change, replacement: structured });
      operations.push({ kind: "CANONICALIZE_PARSEABLE_SOURCE", path: `$.changes[${index}].replacement`,
        beforeDigest: digest(original), afterDigest: digest(formatted) });
    }
    output.changes = Object.freeze(compiledChanges);
  }

  const outputDigest = digest(output);
  const outcome = operations.length > 0 ? "COMPILED" : "UNCHANGED";
  return Object.freeze({ value: Object.freeze(output), evidence: evidence(request, inputDigest, outputDigest,
    outcome, null, operations) });
}

export function unattemptedNyxRepairIntentCompilation(mode: NyxRepairIntentCompilationMode,
  sourceRepresentation: "TEXT" | "LINES"): NyxIntentCompilationEvidence {
  const input = Object.freeze({ sourceRepresentation, state: "NO_COMPLETED_MODEL_INTENT" });
  const request = { mode, sourceRepresentation, maxCounterexamples: 1, maxPatchBytes: 1,
    maxLineLength: 80, maxSourceLines: 1 } as const;
  const inputDigest = digest(input);
  return evidence(request, inputDigest, inputDigest, "NOT_REQUESTED", null, []);
}
