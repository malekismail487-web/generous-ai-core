import { createHash } from "node:crypto";
import { validateNyxSourceSyntax } from "../../src/lib/codelab/cognition/nyxRepairIntentCompiler";

export type NyxEmissionOutcome = "TRUNCATED" | "INCOMPLETE_FINISH" | "NO_PROVIDER_CONTENT" | "ADAPTER_DIGEST_MISMATCH"
  | "NON_JSON_CONTENT" | "NO_SOURCE_PROPOSED" | "MALFORMED_REPLACEMENT_BOUNDARY" | "INVALID_TARGET"
  | "SYNTAX_REJECTED" | "SYNTACTICALLY_VALID";

export interface NyxEmissionInspection {
  readonly outcome: NyxEmissionOutcome;
  readonly responseDigest: string | null;
  readonly sourceDigest: string | null;
  readonly sourceBytes: number | null;
  readonly lineCount: number | null;
  readonly finalLineLength: number | null;
  readonly maximumLineLength: number | null;
  readonly syntaxLine: number | null;
  readonly syntaxColumn: number | null;
  readonly syntaxAtFinalLine: boolean | null;
  readonly syntaxNearSourceEnd: boolean | null;
  readonly representation: "LINES" | "TEXT";
  readonly rawSourcePersisted: false;
  readonly authorityGranted: false;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function result(outcome: NyxEmissionOutcome, representation: "LINES" | "TEXT",
  responseDigest: string | null, source: string | null = null,
  syntax: { readonly line: number | null; readonly column: number | null } | null = null): NyxEmissionInspection {
  const lines = source === null ? null : source.split(/\r\n|\n|\r/);
  const sourceBytes = source === null ? null : Buffer.byteLength(source, "utf8");
  const locationAtEnd = syntax?.line !== null && syntax?.line !== undefined && lines !== null
    ? syntax.line === lines.length : null;
  let maximumLineLength: number | null = null;
  if (lines !== null) {
    maximumLineLength = 0;
    for (const line of lines) maximumLineLength = Math.max(maximumLineLength, line.length);
  }
  return Object.freeze({ outcome, responseDigest, sourceDigest: source === null ? null : sha256(source),
    sourceBytes, lineCount: lines?.length ?? null, finalLineLength: lines?.at(-1)?.length ?? null,
    maximumLineLength,
    syntaxLine: syntax?.line ?? null, syntaxColumn: syntax?.column ?? null,
    syntaxAtFinalLine: locationAtEnd,
    syntaxNearSourceEnd: syntax?.line !== null && syntax?.line !== undefined && lines !== null
      ? syntax.line >= Math.max(1, lines.length - 1) : null,
    representation, rawSourcePersisted: false, authorityGranted: false });
}

/** Development-only inspection. Neither this function nor its report admits a candidate. */
export async function inspectNyxSourceEmission(input: {
  readonly content: string | null;
  readonly finishReason: string | null;
  readonly providerResponseDigest: string | null;
  readonly expectedTarget: string;
  readonly representation: "LINES" | "TEXT";
}): Promise<NyxEmissionInspection> {
  if (input.finishReason === "length") return result("TRUNCATED", input.representation, input.providerResponseDigest);
  if (input.finishReason !== "stop") return result("INCOMPLETE_FINISH", input.representation, input.providerResponseDigest);
  if (input.content === null) return result("NO_PROVIDER_CONTENT", input.representation, input.providerResponseDigest);
  const digest = sha256(input.content);
  if (digest !== input.providerResponseDigest) return result("ADAPTER_DIGEST_MISMATCH", input.representation, digest);
  let body: unknown;
  try { body = JSON.parse(input.content) as unknown; }
  catch { return result("NON_JSON_CONTENT", input.representation, digest); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return result("MALFORMED_REPLACEMENT_BOUNDARY", input.representation, digest);
  }
  const intent = body as Record<string, unknown>;
  if (intent.decision === "REQUEST_EVIDENCE" || intent.decision === "NO_ACTION") {
    return result("NO_SOURCE_PROPOSED", input.representation, digest);
  }
  const changes = intent.changes;
  if (!Array.isArray(changes) || changes.length !== 1 || !changes[0]
    || typeof changes[0] !== "object" || Array.isArray(changes[0])) {
    return result("MALFORMED_REPLACEMENT_BOUNDARY", input.representation, digest);
  }
  const change = changes[0] as Record<string, unknown>;
  if (change.target !== input.expectedTarget) return result("INVALID_TARGET", input.representation, digest);
  let source: string;
  if (input.representation === "TEXT") {
    if (typeof change.replacement !== "string") {
      return result("MALFORMED_REPLACEMENT_BOUNDARY", input.representation, digest);
    }
    source = change.replacement;
  } else {
    const replacement = change.replacement;
    if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) {
      return result("MALFORMED_REPLACEMENT_BOUNDARY", input.representation, digest);
    }
    const fields = replacement as Record<string, unknown>;
    if (!Array.isArray(fields.lines) || fields.lines.length === 0
      || !fields.lines.every((line) => typeof line === "string" && !/[\r\n\u2028\u2029]/.test(line))
      || (fields.lineEnding !== "LF" && fields.lineEnding !== "CRLF")) {
      return result("MALFORMED_REPLACEMENT_BOUNDARY", input.representation, digest);
    }
    source = (fields.lines as string[]).join(fields.lineEnding === "LF" ? "\n" : "\r\n");
  }
  const syntax = await validateNyxSourceSyntax(input.expectedTarget, source);
  return result(syntax.valid ? "SYNTACTICALLY_VALID" : "SYNTAX_REJECTED",
    input.representation, digest, source, syntax);
}
