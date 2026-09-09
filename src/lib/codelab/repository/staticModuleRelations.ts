import { posix } from "node:path";
import ts from "typescript";

export interface StaticModuleReference {
  readonly specifier: string | null;
  readonly line: number;
  readonly kind: "IMPORT" | "REEXPORT" | "DYNAMIC_OR_COMMONJS";
}

export interface StaticModuleSummary {
  readonly parseState: "PARSED" | "SYNTAX_INVALID" | "UNSUPPORTED_LANGUAGE";
  readonly references: readonly StaticModuleReference[];
}

// No TypeScript module resolver: resolving imports must never trigger filesystem access.
export function parseStaticModule(path: string, content: string): StaticModuleSummary {
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)) {
    return { parseState: "UNSUPPORTED_LANGUAGE", references: [] };
  }
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics?.length) return { parseState: "SYNTAX_INVALID", references: [] };
  const references: StaticModuleReference[] = [];
  const add = (node: ts.Node, specifier: string | null, kind: StaticModuleReference["kind"]) => {
    references.push({ specifier, kind, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
  };
  // Iterative traversal bounds stack use for deeply nested, untrusted source.
  const pending: ts.Node[] = [file];
  while (pending.length) {
    const node = pending.pop()!;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text, ts.isImportDeclaration(node) ? "IMPORT" : "REEXPORT");
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      add(node, node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null,
        "DYNAMIC_OR_COMMONJS");
    } else if (ts.isImportEqualsDeclaration(node)) {
      add(node, null, "DYNAMIC_OR_COMMONJS");
    }
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
  references.sort((left, right) => left.line - right.line || compareText(left.specifier ?? "", right.specifier ?? ""));
  return { parseState: "PARSED", references };
}

export function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function hasControlCharacter(value: string): boolean { return [...value].some((character) => character.charCodeAt(0) < 32); }

export function canonicalRepositoryPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500
    && !/[\\:]/.test(value) && !hasControlCharacter(value) && !value.startsWith("/")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export type ModuleResolution =
  | { readonly state: "OBSERVED_RELATIVE_CANDIDATE"; readonly target: string }
  | { readonly state: "UNRESOLVED"; readonly target: null;
    readonly reason: "DYNAMIC_OR_COMMONJS" | "EXTERNAL_OR_ALIAS" | "OUTSIDE_MANIFEST"
      | "AMBIGUOUS" | "UNSUPPORTED_SPECIFIER" };

export function resolveObservedModule(source: string, reference: StaticModuleReference,
  observedPaths: ReadonlySet<string>): ModuleResolution {
  const unresolved = (reason: Extract<ModuleResolution, { state: "UNRESOLVED" }>["reason"]): ModuleResolution =>
    ({ state: "UNRESOLVED", target: null, reason });
  if (reference.kind === "DYNAMIC_OR_COMMONJS") return unresolved("DYNAMIC_OR_COMMONJS");
  const specifier = reference.specifier;
  if (!specifier || /[\\:?#%]/.test(specifier) || hasControlCharacter(specifier)) return unresolved("UNSUPPORTED_SPECIFIER");
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return unresolved("EXTERNAL_OR_ALIAS");
  const base = posix.normalize(posix.join(posix.dirname(source), specifier));
  if (!canonicalRepositoryPath(base)) return unresolved("OUTSIDE_MANIFEST");
  // Conservative source-level candidates, NOT a claim about runtime/bundler resolution.
  // .js -> .ts rewriting, aliases, package exports and host case folding are deliberately not inferred.
  const candidates = posix.extname(base) ? [base] : [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
    .flatMap((extension) => [base + extension, `${base}/index${extension}`])];
  const observed = candidates.filter((candidate) => observedPaths.has(candidate));
  if (observed.length > 1) return unresolved("AMBIGUOUS");
  return observed.length === 1 ? { state: "OBSERVED_RELATIVE_CANDIDATE", target: observed[0] }
    : unresolved("OUTSIDE_MANIFEST");
}
