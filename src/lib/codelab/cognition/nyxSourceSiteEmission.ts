import { createHash } from "node:crypto";
import ts from "typescript";
import { immutableTheoryValue, theoryDigest } from "../research/theoryContracts";
import { behaviorPreservingQualityGuidance } from "./nyxMeasuredQualityGuidance";
import { validateNyxSourceSyntax } from "./nyxRepairIntentCompiler";
import type { NyxRepairCognitionRequest, NyxSourceRepresentation } from "./nyxNemotronEngineeringCognition";

export const NYX_SOURCE_SITE_EMISSION = "nyx-source-bound-site-emission/1" as const;
const ACTION = "PROPOSE_SOURCE_SITES";
const LIMITS = Object.freeze({ sourceBytes: 12000, nodes: 2500, depth: 64, sites: 32,
  edits: 8, fragmentBytes: 2048, fragmentLines: 64, statementRun: 3 });
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
type Category = "STATEMENTS" | "EXPRESSION";
interface Span { readonly start: number; readonly end: number; readonly category: Category }
const children = (node: ts.Node) => { const result: ts.Node[] = [];
  ts.forEachChild(node, child => { result.push(child); }); return result; };

/** In-memory syntax only: no imports, libraries, filesystem reads or execution. */
function parse(path: string, source: string) {
  if (!/\.(?:mjs|cjs|js|ts)$/.test(path) || Buffer.byteLength(source, "utf8") > LIMITS.sourceBytes) return null;
  const rest = source.replace(/\r\n/g, "");
  if (/[\r\u2028\u2029]/.test(rest) || source.includes("\r\n") && rest.includes("\n")) return null;
  try {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true,
      path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    if ((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return null;
    let count = 0;
    const queue = [{ node: file as ts.Node, depth: 0 }];
    while (queue.length) {
      const item = queue.pop()!;
      if (++count > LIMITS.nodes || item.depth > LIMITS.depth) return null;
      for (const child of children(item.node)) queue.push({ node: child, depth: item.depth + 1 });
    }
    return file;
  } catch { return null; }
}

function insideFunctionBody(node: ts.Node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      const body = (parent as ts.FunctionLikeDeclaration).body;
      if (!body || !ts.isBlock(body)) return false;
      return node.getStart() > body.getStart() && node.end < body.end;
    }
  }
  return false;
}

/** Source locations identify edit opportunities, NOT algorithms or equivalence proofs.
 * Root function bodies/signatures and module declarations are never offered. Statement
 * runs permit removal of redundant intermediate representations without whole-file emission.
 */
function spans(file: ts.SourceFile) {
  const found: Span[] = [];
  const add = (start: number, end: number, category: Category) => {
    if (end > start && Buffer.byteLength(file.text.slice(start, end), "utf8") <= LIMITS.fragmentBytes)
      found.push({ start, end, category });
  };
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node)) for (let first = 0; first < node.statements.length; first++) {
      for (let size = 1; size <= LIMITS.statementRun && first + size <= node.statements.length; size++) {
        const selected = node.statements.slice(first, first + size);
        // Do not disguise replacement of the complete root function body as a local site.
        if (ts.isFunctionLike(node.parent) && first === 0 && size === node.statements.length) continue;
        if (selected.every(insideFunctionBody)) add(selected[0].getStart(file), selected.at(-1)!.end, "STATEMENTS");
      }
    }
    if ((ts.isBinaryExpression(node) || ts.isCallExpression(node) || ts.isConditionalExpression(node)
      || ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) && insideFunctionBody(node))
      add(node.getStart(file), node.end, "EXPRESSION");
    children(node).forEach(visit);
  };
  visit(file);
  // Deterministic breadth of opportunity: no task name, answer or model output affects ranking.
  return found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start
    || a.category.localeCompare(b.category)).slice(0, LIMITS.sites).sort((a, b) => a.start - b.start || a.end - b.end);
}

export function buildNyxSourceSiteCatalog(request: NyxRepairCognitionRequest) {
  if (request.candidateQualityFeedback?.hiddenEvidenceUsed !== false
    || request.candidateQualityFeedback.authorityGranted !== false) return null;
  const guidance = behaviorPreservingQualityGuidance(request);
  if (!guidance) return null;
  const { signal: _signal, ...boundRequest } = request;
  const bindingDigest = theoryDigest({ version: NYX_SOURCE_SITE_EMISSION, limits: LIMITS, request: boundRequest });
  const entries = guidance.sources.flatMap(source => {
    const contexts = request.files.filter(file => file.relativePath === source.path);
    if (contexts.length !== 1 || !request.allowedMutationPaths.includes(source.path)) return [];
    const context = contexts[0], file = parse(source.path, context.content);
    if (!file || hash(context.content) !== context.contentSha256) return [];
    return spans(file).map(span => ({ ...span, path: source.path, baseSourceDigest: context.contentSha256,
      siteRef: `SOURCE-SITE-${theoryDigest({ bindingDigest, path: source.path, span })}`,
      line: file.getLineAndCharacterOfPosition(span.start).line + 1,
      original: context.content.slice(span.start, span.end),
      lineEnding: context.content.includes("\r\n") ? "CRLF" as const : "LF" as const }));
  }).slice(0, LIMITS.sites);
  if (!entries.length) return null;
  return immutableTheoryValue({ version: NYX_SOURCE_SITE_EMISSION, bindingDigest, entries, limits: LIMITS,
    evidenceRef: guidance.evidenceRef, passingObservationRef: guidance.passingObservationRef,
    instruction: "For a localized quality repair, use PROPOSE_SOURCE_SITES with edits containing siteRef, lines and lineEnding. Generate your own replacement expression or statements, without leading/trailing trivia. Select nonoverlapping current sites. Cite FILE, passing observation and quality evidence. Surrounding source is retained literally and AST boundaries are checked. Review state/effects and cumulative original-state limits; local edits can still be semantically wrong. Ordinary full-source PROPOSE_EDIT remains available when a coherent broader correction is necessary. All existing authorization, syntax, functional, quality and security checks still apply.",
    sourceOrigin: "MODEL_GENERATED_FRAGMENTS_NOT_HOST_ALGORITHM", semanticEquivalenceCertified: false,
    authorityGranted: false, acceptanceGranted: false });
}
export type NyxSourceSiteCatalog = NonNullable<ReturnType<typeof buildNyxSourceSiteCatalog>>;
export interface NyxSourceSiteEvidence {
  readonly version: typeof NYX_SOURCE_SITE_EMISSION;
  readonly outcome: "RESOLVED" | "REFUSED";
  readonly reason: string;
  readonly bindingDigest: string | null;
  readonly selectedSiteRefs: readonly string[];
  readonly inputDigest: string;
  readonly outputDigest: string | null;
  readonly sourceDigests: readonly { readonly path: string; readonly base: string; readonly proposed: string }[];
  readonly sourceOrigin: "MODEL_GENERATED_FRAGMENTS_NOT_HOST_ALGORITHM";
  readonly semanticEquivalenceCertified: false;
  readonly authorityGranted: false;
  readonly acceptanceGranted: false;
}

export function withNyxSourceSiteSchema(schema: Readonly<Record<string, unknown>>, catalog: NyxSourceSiteCatalog | null) {
  if (!catalog) return schema;
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf as Record<string, unknown>[] : [schema];
  const ordinary = variants.find(branch => (branch.properties as Record<string, { enum?: string[] }> | undefined)
    ?.decision?.enum?.includes("PROPOSE_EDIT"));
  if (!ordinary || ordinary.additionalProperties !== false) throw Error("source_site_schema_invalid");
  const { changes: _changes, ...properties } = ordinary.properties as Record<string, unknown>;
  return immutableTheoryValue({ type: "object", anyOf: [...variants, { ...ordinary,
    properties: { ...properties, decision: { type: "string", enum: [ACTION] }, edits: { type: "array",
      minItems: 1, maxItems: LIMITS.edits, items: { type: "object", additionalProperties: false,
        properties: { siteRef: { type: "string", enum: catalog.entries.map(entry => entry.siteRef) },
          lines: { type: "array", minItems: 1, maxItems: LIMITS.fragmentLines, items: { type: "string" } },
          lineEnding: { type: "string", enum: ["LF", "CRLF"] } }, required: ["siteRef", "lines", "lineEnding"] } } },
    required: [...(ordinary.required as string[]).filter(field => field !== "changes"), "edits"] }] });
}

/** Prune exactly the selected sibling range/subtree from both ASTs. Every untouched
 * leaf and ancestor kind/child ordering must agree. A syntax-valid fragment cannot
 * close a surrounding block, swallow unselected text, or introduce module siblings.
 * This proves a syntactic boundary, not observational semantic equivalence.
 */
function outsideProjection(file: ts.SourceFile, edits: readonly Span[]) {
  const consumed = new Set<number>();
  const category = (node: ts.Node, value: Category) => value === "STATEMENTS" ? ts.isStatement(node) : ts.isExpression(node);
  const visit = (node: ts.Node): unknown => {
    const nested = children(node), result: unknown[] = [];
    for (let index = 0; index < nested.length; index++) {
      const child = nested[index], start = child.getStart(file);
      const selected = edits.findIndex(edit => edit.start === start);
      if (selected >= 0) {
        const edit = edits[selected], group: ts.Node[] = [];
        let last = index;
        while (last < nested.length && nested[last].end <= edit.end) group.push(nested[last++]);
        if (group.length && group.at(-1)!.end === edit.end && group.every(item => category(item, edit.category))
          && (edit.category === "STATEMENTS" || group.length === 1)) {
          if (consumed.has(selected)) throw Error("site_boundary");
          consumed.add(selected); result.push({ selected }); index = last - 1;
        } else result.push(visit(child));
      } else result.push(visit(child));
    }
    return nested.length ? { kind: node.kind, children: result } : { kind: node.kind, text: node.getText(file) };
  };
  const projection = visit(file);
  if (consumed.size !== edits.length) throw Error("site_boundary");
  return theoryDigest(projection);
}

export async function resolveNyxSourceSites(input: unknown, catalog: NyxSourceSiteCatalog | null,
  request: NyxRepairCognitionRequest, representation: NyxSourceRepresentation) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).decision !== ACTION) return null;
  const raw = input as Record<string, unknown>;
  const selectedRefs: string[] = [], sources: { path: string; base: string; proposed: string }[] = [];
  const changes: { target: string; replacement: unknown }[] = [];
  let reason: string | null = null;
  const current = buildNyxSourceSiteCatalog(request);
  const edits = new Map<string, { entry: NyxSourceSiteCatalog["entries"][number]; fragment: string }[]>();
  if (!catalog || !current || theoryDigest(current) !== theoryDigest(catalog)) reason = "source_sites_request_changed_or_not_offered";
  else if (Object.prototype.hasOwnProperty.call(raw, "changes") || Object.prototype.hasOwnProperty.call(raw, "selectedProposalRef")) reason = "source_sites_mixed_wire";
  else if (!Array.isArray(raw.edits) || !raw.edits.length || raw.edits.length > LIMITS.edits) reason = "source_sites_edits_invalid";
  else for (const edit of raw.edits) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit) || Object.keys(edit).length !== 3
      || !["siteRef", "lines", "lineEnding"].every(key => Object.prototype.hasOwnProperty.call(edit, key))) { reason = "source_sites_shape_invalid"; break; }
    const entry = current.entries.find(item => item.siteRef === edit.siteRef);
    if (!entry || selectedRefs.includes(entry.siteRef)) { reason = "source_sites_reference_invalid"; break; }
    if (edit.lineEnding !== entry.lineEnding || !Array.isArray(edit.lines) || !edit.lines.length
      || edit.lines.length > LIMITS.fragmentLines || edit.lines.some((line: unknown) => typeof line !== "string"
        || /[\r\n\u2028\u2029]/.test(line))) { reason = "source_sites_fragment_invalid"; break; }
    const fragment = edit.lines.join(entry.lineEnding === "CRLF" ? "\r\n" : "\n");
    if (!fragment || Buffer.byteLength(fragment, "utf8") > LIMITS.fragmentBytes || fragment === entry.original) {
      reason = "source_sites_fragment_bound_or_noop"; break;
    }
    const cited = Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : [];
    if (![current.evidenceRef, current.passingObservationRef, `FILE:${entry.path}`].every(ref => cited.includes(ref))) {
      reason = "source_sites_evidence_not_cited"; break;
    }
    selectedRefs.push(entry.siteRef);
    edits.set(entry.path, [...(edits.get(entry.path) ?? []), { entry, fragment }]);
  }
  if (!reason && edits.size > request.maxChanges) reason = "source_sites_change_bound";
  let totalBytes = 0;
  if (!reason) for (const [path, proposed] of edits) {
    const original = request.files.find(file => file.relativePath === path)!.content;
    const ordered = proposed.sort((a, b) => a.entry.start - b.entry.start);
    if (ordered.some((item, index) => index > 0 && ordered[index - 1].entry.end > item.entry.start)) {
      reason = "source_sites_overlap"; break;
    }
    const before = parse(path, original)!;
    let source = "", cursor = 0;
    const newSpans: Span[] = [];
    for (const { entry, fragment } of ordered) {
      source += original.slice(cursor, entry.start);
      newSpans.push({ start: source.length, end: source.length + fragment.length, category: entry.category });
      source += fragment; cursor = entry.end;
    }
    source += original.slice(cursor); totalBytes += Buffer.byteLength(source, "utf8");
    const after = parse(path, source);
    if (!after || totalBytes > request.maxPatchBytes) { reason = "source_sites_source_or_patch_bound"; break; }
    try {
      if (outsideProjection(before, ordered.map(item => item.entry)) !== outsideProjection(after, newSpans))
        reason = "source_sites_ast_boundary_changed";
    } catch { reason = "source_sites_ast_boundary_changed"; }
    if (reason) break;
    if (!await validateNyxSourceSyntax(path, source).then(result => result.valid).catch(() => false)) {
      reason = "source_sites_syntax_invalid"; break;
    }
    changes.push({ target: path, replacement: representation === "TEXT" ? source
      : { lines: source.split(source.includes("\r\n") ? "\r\n" : "\n"), lineEnding: source.includes("\r\n") ? "CRLF" : "LF" } });
    sources.push({ path, base: hash(original), proposed: hash(source) });
  }
  if (!reason && (request.signal?.aborted || request.deadlineEpochMs !== undefined && Date.now() >= request.deadlineEpochMs
    || theoryDigest(buildNyxSourceSiteCatalog(request)) !== theoryDigest(catalog))) reason = "source_sites_request_changed_or_expired";
  const { edits: _edits, ...intent } = raw;
  const value = reason ? null : { ...intent, decision: "PROPOSE_EDIT", changes };
  const evidence: NyxSourceSiteEvidence = immutableTheoryValue({ version: NYX_SOURCE_SITE_EMISSION,
    outcome: reason ? "REFUSED" : "RESOLVED", reason: reason ?? "literal_sites_expanded_not_authorized",
    bindingDigest: catalog?.bindingDigest ?? null, selectedSiteRefs: selectedRefs,
    inputDigest: theoryDigest(input), outputDigest: value ? theoryDigest(value) : null,
    sourceDigests: reason ? [] : sources, sourceOrigin: "MODEL_GENERATED_FRAGMENTS_NOT_HOST_ALGORITHM",
    semanticEquivalenceCertified: false, authorityGranted: false, acceptanceGranted: false });
  return { value: value ? immutableTheoryValue(value) : null, evidence };
}
