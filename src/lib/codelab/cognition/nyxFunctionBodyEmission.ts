import { createHash } from "node:crypto";
import ts from "typescript";
import { immutableTheoryValue, theoryDigest } from "../research/theoryContracts";
import { validateNyxSourceSyntax } from "./nyxRepairIntentCompiler";
import type { NyxRepairCognitionRequest } from "./nyxNemotronEngineeringCognition";

export const NYX_FUNCTION_BODY_EMISSION = "nyx-source-bound-function-body/1" as const;
const sourceDigest = (source: string) => createHash("sha256").update(source).digest("hex");

function soleFunction(path: string, source: string) {
  if (!/\.(?:mjs|js|ts)$/.test(path) || Buffer.byteLength(source, "utf8") > 12000) return null;
  const withoutCrLf = source.replace(/\r\n/g, "");
  if (/[\r\u2028\u2029]/.test(withoutCrLf) || source.includes("\r\n") && withoutCrLf.includes("\n")) return null;
  let file: ts.SourceFile;
  try { file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true,
    path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS); } catch { return null; }
  if ((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length
    || file.statements.length !== 1) return null;
  const fn = file.statements[0];
  if (!ts.isFunctionDeclaration(fn) || !fn.name || !fn.body
    || !fn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return null;
  return { file, fn, start: fn.body.getStart(file) + 1, end: fn.body.end - 1 };
}

/** An emission boundary, not a capability, solution generator or acceptance gate.
 * Initial scope: a module containing one named exported function. No fallback
 * silently broadens the edit surface when the source is unsupported.
 */
export function buildNyxFunctionBodyCatalog(request: NyxRepairCognitionRequest) {
  const { signal: _signal, ...boundRequest } = request;
  const bindingDigest = theoryDigest({ version: NYX_FUNCTION_BODY_EMISSION, request: boundRequest });
  const entries = request.files.filter(file => request.allowedMutationPaths.includes(file.relativePath)).map(file => {
    const parsed = soleFunction(file.relativePath, file.content);
    if (!parsed || sourceDigest(file.content) !== file.contentSha256) return null;
    const prefix = file.content.slice(0, parsed.start), suffix = file.content.slice(parsed.end);
    const binding = { version: NYX_FUNCTION_BODY_EMISSION, bindingDigest, requestId: request.cognitionRequestId,
      objectiveDigest: sourceDigest(request.objective), observationId: request.observation.observationId,
      path: file.relativePath, baseSourceDigest: file.contentSha256, prefix, suffix,
      maxPatchBytes: request.maxPatchBytes, maxLineLength: request.sourceQualityConstraints.maxLineLength };
    return { target: file.relativePath, bodyRef: `BODY-${theoryDigest(binding)}`,
      baseSourceDigest: file.contentSha256, functionName: parsed.fn.name!.text,
      signature: file.content.slice(parsed.fn.getStart(parsed.file), parsed.start), prefix, suffix,
      lineEnding: file.content.includes("\r\n") ? "CRLF" as const : "LF" as const };
  });
  if (!entries.length || entries.some(entry => entry === null) || entries.length > request.maxChanges
    || new Set(entries.map(entry => entry!.target)).size !== entries.length) return null;
  return immutableTheoryValue({ version: NYX_FUNCTION_BODY_EMISSION, bindingDigest, entries: entries.filter(entry => entry !== null),
    instruction: "Emit only statements inside the observed function body, as replacement.lines with replacement.bodyRef and lineEnding. Do not emit the signature, enclosing braces, exports, imports or surrounding module text. Omega preserves that exact scaffold, not the behavior. Nested helper functions are permitted. All ordinary syntax, scope, freshness, functional and quality gates still apply.",
    authorityGranted: false, acceptanceGranted: false });
}
export type NyxFunctionBodyCatalog = NonNullable<ReturnType<typeof buildNyxFunctionBodyCatalog>>;
export interface NyxFunctionBodyEvidence {
  readonly version: typeof NYX_FUNCTION_BODY_EMISSION;
  readonly outcome: "RESOLVED" | "REFUSED";
  readonly reason: string;
  readonly inputDigest: string;
  readonly outputDigest: string | null;
  readonly sourceDigests: readonly { readonly target: string; readonly base: string; readonly proposed: string }[];
  readonly authorityGranted: false;
  readonly acceptanceGranted: false;
}

/** Replace only the source wire representation; action requirements stay unchanged. */
interface BodySchema {
  readonly [key: string]: unknown;
  readonly anyOf?: readonly BodySchema[];
  readonly properties?: Readonly<Record<string, BodySchema>>;
  readonly items?: BodySchema;
  readonly enum?: readonly unknown[];
  readonly required?: readonly string[];
}
export function withNyxFunctionBodySchema(schema: Readonly<Record<string, unknown>>, catalog: NyxFunctionBodyCatalog | null) {
  if (!catalog) return schema;
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf as BodySchema[] : [schema as BodySchema];
  let transformed = false;
  const mapped = variants.map(branch => {
    const properties = branch.properties;
    if (!properties?.decision?.enum?.includes("PROPOSE_EDIT")) return branch;
    const changes = properties.changes;
    const replacement = changes?.items?.properties?.replacement;
    if (branch.additionalProperties !== false || !changes?.items?.properties || !replacement?.properties?.lines
      || !replacement.required) throw Error("function_body_schema_invalid");
    transformed = true;
    return { ...branch, properties: { ...properties, changes: { ...changes, items: { ...changes.items,
      properties: { ...changes.items.properties, replacement: { ...replacement,
        properties: { ...replacement.properties, bodyRef: { type: "string", enum: catalog.entries.map(entry => entry.bodyRef) } },
        required: [...replacement.required, "bodyRef"] } } } } } };
  });
  if (!transformed) throw Error("function_body_schema_invalid");
  return immutableTheoryValue(Array.isArray(schema.anyOf) ? { ...schema, anyOf: mapped } : mapped[0]);
}

/** Rebind after inference, expand literally, then refuse any AST boundary escape.
 * Never balance braces, invent missing tokens, execute source or repair syntax.
 */
export async function resolveNyxFunctionBody(input: unknown, catalog: NyxFunctionBodyCatalog | null,
  request: NyxRepairCognitionRequest) {
  if (!catalog || !input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).decision !== "PROPOSE_EDIT") return null;
  const raw = input as Record<string, unknown>, proposed: { target: string; replacement: { lines: string[]; lineEnding: "LF" | "CRLF" } }[] = [];
  const sources: { target: string; base: string; proposed: string }[] = [];
  let reason: string | null = null;
  const current = buildNyxFunctionBodyCatalog(request);
  if (!current || theoryDigest(current) !== theoryDigest(catalog)) reason = "function_body_request_changed";
  else if (!Array.isArray(raw.changes) || !raw.changes.length || raw.changes.length > request.maxChanges) reason = "function_body_changes_invalid";
  else for (const change of raw.changes) {
    if (!change || typeof change !== "object" || Array.isArray(change)
      || Object.keys(change).length !== 2 || !Object.prototype.hasOwnProperty.call(change, "target") || !Object.prototype.hasOwnProperty.call(change, "replacement")) {
      reason = "function_body_change_shape_invalid"; break;
    }
    const entry = current.entries.find(item => item.target === change.target);
    const replacement = change.replacement;
    if (!entry || proposed.some(item => item.target === entry.target)) { reason = "function_body_target_invalid"; break; }
    if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)
      || Object.keys(replacement).length !== 3 || !["lines", "lineEnding", "bodyRef"].every(key => Object.prototype.hasOwnProperty.call(replacement, key))
      || replacement.bodyRef !== entry.bodyRef || replacement.lineEnding !== entry.lineEnding
      || !Array.isArray(replacement.lines) || !replacement.lines.length || replacement.lines.length > 4096
      || replacement.lines.some((line: unknown) => typeof line !== "string" || /[\r\n\u2028\u2029]/.test(line))) {
      reason = "function_body_replacement_invalid"; break;
    }
    const eol = replacement.lineEnding === "CRLF" ? "\r\n" : "\n";
    const source = entry.prefix + eol + replacement.lines.join(eol) + eol + entry.suffix;
    if (Buffer.byteLength(source, "utf8") > request.maxPatchBytes) { reason = "function_body_patch_bound_exceeded"; break; }
    const parsed = soleFunction(entry.target, source);
    const nodes: ts.Node[] = parsed?.fn.body ? [parsed.fn.body] : [];
    let moduleSyntax = false;
    while (nodes.length) {
      const node = nodes.pop()!;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
        || ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        moduleSyntax = true; break;
      }
      ts.forEachChild(node, child => { nodes.push(child); });
    }
    const syntaxValid = parsed && !moduleSyntax
      ? await validateNyxSourceSyntax(entry.target, source).then(result => result.valid).catch(() => false) : false;
    if (!parsed || parsed.start !== entry.prefix.length || parsed.end !== source.length - entry.suffix.length
      || !syntaxValid) {
      reason = "function_body_syntax_or_boundary_invalid"; break;
    }
    proposed.push({ target: entry.target, replacement: { lines: source.split(eol), lineEnding: replacement.lineEnding } });
    sources.push({ target: entry.target, base: entry.baseSourceDigest, proposed: sourceDigest(source) });
  }
  if (!reason && theoryDigest(buildNyxFunctionBodyCatalog(request)) !== theoryDigest(catalog)) reason = "function_body_request_changed";
  const value = reason ? null : { ...raw, changes: proposed };
  const evidence: NyxFunctionBodyEvidence = immutableTheoryValue({ version: NYX_FUNCTION_BODY_EMISSION,
    outcome: reason ? "REFUSED" : "RESOLVED", reason: reason ?? "literal_body_expanded_not_authorized",
    inputDigest: theoryDigest(input), outputDigest: value ? theoryDigest(value) : null,
    sourceDigests: reason ? [] : sources, authorityGranted: false, acceptanceGranted: false });
  return { value: value ? immutableTheoryValue(value) : null, evidence };
}
