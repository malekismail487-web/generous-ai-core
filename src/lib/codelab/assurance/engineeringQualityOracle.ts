import { createHash } from "node:crypto";
import ts from "typescript";

export type EngineeringQualityDimension = "FUNCTIONAL_CORRECTNESS" | "REGRESSION_RESISTANCE" | "CHANGE_MINIMALITY"
  | "ARCHITECTURAL_FIT" | "API_COMPATIBILITY" | "TYPE_SAFETY" | "DUPLICATION" | "MAINTAINABILITY"
  | "UNNECESSARY_COMPLEXITY" | "SECURITY_IMPLICATIONS" | "SCOPE_DISCIPLINE" | "READABILITY";

export type QualityDisposition = "PASS" | "FAIL" | "NOT_APPLICABLE" | "INSUFFICIENT_EVIDENCE";

export interface QualityInvariant {
  readonly invariantId: string;
  readonly dimension: EngineeringQualityDimension;
  readonly kind: "REQUIRED_CALL" | "REQUIRED_IMPORT" | "FORBIDDEN_CALL" | "FORBIDDEN_IMPORT"
    | "FORBIDDEN_LITERAL" | "NO_PARAMETER_MUTATION" | "NO_GLOBAL_MUTABLE_STATE";
  readonly path: string;
  readonly value?: string | number | boolean;
}

export interface EngineeringQualityPolicy {
  readonly policyId: string;
  readonly allowedChangedPaths: readonly string[];
  readonly readonlyPaths: readonly string[];
  readonly maxChangedFiles: number;
  readonly maxChangedLines: number;
  readonly maxCandidateBytes: number;
  readonly maxCyclomaticComplexity: number;
  readonly maxComplexityDelta: number;
  readonly maxNestingDepth: number;
  readonly maxAddedDeclarations: number;
  readonly invariants: readonly QualityInvariant[];
}

export interface EngineeringQualityInput {
  readonly assessmentId: string;
  readonly evaluatorVersion: string;
  readonly baselineFiles: Readonly<Record<string, string>>;
  readonly candidateFiles: Readonly<Record<string, string>>;
  readonly changedPaths: readonly string[];
  readonly functionalAcceptance: "PASS" | "FAIL" | "NOT_EVALUATED";
  readonly regressionAcceptance: "PASS" | "FAIL" | "NOT_EVALUATED";
  readonly policy: EngineeringQualityPolicy;
}

export interface QualityDetectorResult {
  readonly dimension: EngineeringQualityDimension;
  readonly disposition: QualityDisposition;
  readonly detector: string;
  readonly evidenceClass: "E3";
  readonly evidenceStrength: "STRONG" | "MODERATE" | "LIMITED";
  readonly findings: readonly string[];
  readonly evidenceDigest: string;
  readonly falsePositiveRisk: "LOW" | "MEDIUM" | "HIGH";
  readonly falseNegativeRisk: "LOW" | "MEDIUM" | "HIGH";
}

export interface EngineeringQualityAssessment {
  readonly assessmentId: string;
  readonly evaluatorVersion: string;
  readonly decision: "ACCEPTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  readonly dimensions: Readonly<Record<EngineeringQualityDimension, QualityDetectorResult>>;
  readonly failedDimensions: readonly EngineeringQualityDimension[];
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly aggregateScoreUsed: false;
  readonly authorityGranted: false;
}

interface FileAnalysis {
  readonly parseErrors: readonly string[];
  readonly exports: readonly string[];
  readonly imports: readonly string[];
  readonly calls: readonly string[];
  readonly literals: readonly (string | number | boolean)[];
  readonly functionBodies: readonly string[];
  readonly complexity: number;
  readonly maxNesting: number;
  readonly declarations: number;
  readonly parameterMutation: boolean;
  readonly globalMutableState: boolean;
  readonly unsafeTypeEscape: boolean;
  readonly unsafeRuntimeAccess: boolean;
}

const DIMENSIONS: readonly EngineeringQualityDimension[] = Object.freeze([
  "FUNCTIONAL_CORRECTNESS", "REGRESSION_RESISTANCE", "CHANGE_MINIMALITY", "ARCHITECTURAL_FIT", "API_COMPATIBILITY",
  "TYPE_SAFETY", "DUPLICATION", "MAINTAINABILITY", "UNNECESSARY_COMPLEXITY", "SECURITY_IMPLICATIONS",
  "SCOPE_DISCIPLINE", "READABILITY",
]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith(".ts") || path.endsWith(".tsx") ? ts.ScriptKind.TS : path.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
}

/**
 * Bounded, flow-insensitive borrowing analysis, not a proof of immutability.
 * Symbols distinguish lexical shadowing; two bits distinguish a borrowed value
 * from a fresh container that still holds borrowed values. Shallow array copies
 * may therefore be sorted, but their borrowed elements may not be mutated.
 * Standard built-in method semantics are assumed. Arbitrary interprocedural
 * effects, monkey-patching, and aliasing through later container stores still
 * require execution evidence; this detector must not replace those checks.
 */
function detectsParameterMutation(file: ts.SourceFile): boolean {
  const BORROWED = 1;
  const CONTAINS_BORROWED = 2;
  const BORROWED_GRAPH = BORROWED | CONTAINS_BORROWED;
  // Bind only this already-parsed source. No compiler filesystem or module access.
  const host: ts.CompilerHost = {
    getSourceFile: (name) => name === file.fileName ? file : undefined,
    getDefaultLibFileName: () => "", writeFile: () => undefined,
    getCurrentDirectory: () => "", getDirectories: () => [],
    fileExists: (name) => name === file.fileName,
    readFile: (name) => name === file.fileName ? file.text : undefined,
    getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  };
  const checker = ts.createProgram([file.fileName], {
    allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest,
  }, host).getTypeChecker();
  const origins = new Map<ts.Symbol, number>();
  const nodes: ts.Node[] = [];
  const collect = (node: ts.Node): void => { nodes.push(node); ts.forEachChild(node, collect); };
  collect(file);
  const unwrap = (expression: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)) expression = expression.expression;
    return expression;
  };
  const member = (expression: ts.Expression): { receiver: ts.Expression; name: string } | null => {
    const node = unwrap(expression);
    if (ts.isPropertyAccessExpression(node)) return { receiver: node.expression, name: node.name.text };
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      return { receiver: node.expression, name: node.argumentExpression.text };
    }
    return null;
  };
  const isGlobal = (expression: ts.Expression, name: string): boolean =>
    ts.isIdentifier(expression) && expression.text === name && !checker.getSymbolAtLocation(expression);
  const mutators = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "add", "delete", "clear"]);
  const shallowCopies = new Set(["map", "filter", "slice", "concat", "flat", "flatMap", "toSorted", "toReversed", "toSpliced", "with"]);
  const descendants = (origin: number): number => origin & CONTAINS_BORROWED ? BORROWED_GRAPH : 0;
  const originOf = (input: ts.Expression): number => {
    const node = unwrap(input);
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      return symbol ? origins.get(symbol) ?? 0 : 0;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return descendants(originOf(node.expression));
    if (ts.isConditionalExpression(node)) return originOf(node.whenTrue) | originOf(node.whenFalse);
    if (ts.isBinaryExpression(node)) {
      return node.operatorToken.kind === ts.SyntaxKind.CommaToken ? originOf(node.right) : originOf(node.left) | originOf(node.right);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.some((element) => ts.isSpreadElement(element)
        ? originOf(element.expression) & CONTAINS_BORROWED : !ts.isOmittedExpression(element) && originOf(element)) ? CONTAINS_BORROWED : 0;
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((property) => ts.isSpreadAssignment(property)
        ? originOf(property.expression) & CONTAINS_BORROWED
        : ts.isPropertyAssignment(property) ? originOf(property.initializer)
          : ts.isShorthandPropertyAssignment(property) && originOf(property.name)) ? CONTAINS_BORROWED : 0;
    }
    if (ts.isCallExpression(node)) {
      const method = member(node.expression);
      const receiver = method ? originOf(method.receiver) : 0;
      if (method && shallowCopies.has(method.name)) return receiver ? CONTAINS_BORROWED : 0;
      if (method && ["sort", "reverse", "fill", "copyWithin"].includes(method.name)) return receiver;
      if (method && ["pop", "shift", "at", "find"].includes(method.name)) return descendants(receiver);
      if (method && isGlobal(method.receiver, "Array") && method.name === "from") {
        const mapper = node.arguments[1];
        if (mapper && (ts.isArrowFunction(mapper) || ts.isFunctionExpression(mapper))) {
          const returnedOrigin = (body: ts.Node): number => {
            if (ts.isReturnStatement(body)) return body.expression ? originOf(body.expression) : 0;
            if (ts.isFunctionLike(body)) return 0;
            let origin = 0;
            ts.forEachChild(body, (child) => { origin |= returnedOrigin(child); });
            return origin;
          };
          const returned = ts.isBlock(mapper.body) ? returnedOrigin(mapper.body) : originOf(mapper.body);
          return returned ? CONTAINS_BORROWED : 0;
        }
        return node.arguments.some((argument) => originOf(argument)) ? CONTAINS_BORROWED : 0;
      }
      if (method && isGlobal(method.receiver, "Object") && method.name === "assign") {
        return (node.arguments[0] ? originOf(node.arguments[0]) : 0)
          | (node.arguments.slice(1).some((argument) => originOf(argument)) ? CONTAINS_BORROWED : 0);
      }
      // Unknown calls may return an alias. Do not assume they make private copies.
      return receiver || node.arguments.some((argument) => originOf(argument)) ? BORROWED_GRAPH : 0;
    }
    return 0;
  };
  let changed = false;
  const bind = (name: ts.BindingName, origin: number): void => {
    if (ts.isIdentifier(name)) {
      const symbol = checker.getSymbolAtLocation(name);
      if (!symbol) return;
      const previous = origins.get(symbol) ?? 0;
      const next = previous | origin;
      if (next !== previous) { origins.set(symbol, next); changed = true; }
    } else for (const element of name.elements) if (ts.isBindingElement(element)) {
      bind(element.name, element.dotDotDotToken ? (origin ? CONTAINS_BORROWED : 0) : descendants(origin));
    }
  };
  for (const node of nodes) if (ts.isParameter(node)) bind(node.name, BORROWED_GRAPH);
  // Monotone fixed point: each symbol can acquire only two bits, so cycles in
  // aliases terminate. Union across branches is deliberately conservative.
  do {
    changed = false;
    for (const node of nodes) {
      if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, originOf(node.initializer));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        bind(node.left, originOf(node.right));
      }
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
        for (const declaration of node.initializer.declarations) bind(declaration.name, descendants(originOf(node.expression)));
      }
    }
  } while (changed);
  const writesBorrow = (input: ts.Expression): boolean => {
    const node = unwrap(input);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return Boolean(originOf(node.expression) & BORROWED);
    if (ts.isArrayLiteralExpression(node)) return node.elements.some((element) => !ts.isOmittedExpression(element)
      && writesBorrow(ts.isSpreadElement(element) ? element.expression : element));
    if (ts.isObjectLiteralExpression(node)) return node.properties.some((property) => ts.isPropertyAssignment(property)
      && writesBorrow(property.initializer));
    return false; // Rebinding a local parameter does not mutate the caller's value.
  };
  return nodes.some((node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return writesBorrow(node.left);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return writesBorrow(node.operand);
    if (ts.isDeleteExpression(node)) return writesBorrow(node.expression);
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
      return writesBorrow(node.initializer);
    }
    if (!ts.isCallExpression(node)) return false;
    const method = member(node.expression);
    if (!method) return false;
    if (mutators.has(method.name) && (originOf(method.receiver) & BORROWED)) return true;
    const writesFirstArgument = (isGlobal(method.receiver, "Object") && ["assign", "defineProperty", "defineProperties", "setPrototypeOf"].includes(method.name))
      || (isGlobal(method.receiver, "Reflect") && ["set", "deleteProperty", "defineProperty", "setPrototypeOf"].includes(method.name));
    return writesFirstArgument && Boolean(node.arguments[0] && (originOf(node.arguments[0]) & BORROWED));
  });
}

function analyze(path: string, source: string): FileAnalysis {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const exports: string[] = [];
  const imports: string[] = [];
  const calls: string[] = [];
  const literals: (string | number | boolean)[] = [];
  const functionBodies: string[] = [];
  let complexity = 1;
  let nesting = 0;
  let maxNesting = 0;
  let declarations = 0;
  let globalMutableState = false;
  let unsafeTypeEscape = /@ts-(?:ignore|nocheck)|\bas\s+(?:any|unknown)\b|:\s*any\b/.test(source);
  let unsafeRuntimeAccess = false;
  const hasExport = (node: ts.Node) => ts.canHaveModifiers(node)
    && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
  const visit = (node: ts.Node): void => {
    const isControl = ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)
      || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isConditionalExpression(node) || ts.isCatchClause(node)
      || ts.isCaseClause(node);
    if (isControl) { complexity += 1; nesting += 1; maxNesting = Math.max(maxNesting, nesting); }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) complexity += 1;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      calls.push(node.expression.getText(file));
      const expression = node.expression.getText(file);
      if (["eval", "Function", "fetch"].includes(expression) || expression.startsWith("process.")) unsafeRuntimeAccess = true;
    }
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) literals.push(ts.isNumericLiteral(node) ? Number(node.text) : node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) literals.push(true);
    if (node.kind === ts.SyntaxKind.FalseKeyword) literals.push(false);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      declarations += 1;
      if (node.body) functionBodies.push(node.body.getText(file).replace(/\s+/g, " ").trim());
    }
    if (ts.isVariableStatement(node)) {
      declarations += node.declarationList.declarations.length;
      if (node.parent === file && (node.declarationList.flags & ts.NodeFlags.Const) === 0) globalMutableState = true;
      if (hasExport(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) exports.push(`${declaration.name.text}:value`);
    }
    if (ts.isFunctionDeclaration(node) && node.name && hasExport(node)) {
      exports.push(`${node.name.text}:function/${node.parameters.length}`);
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        exports.push("default:export");
      }
    }
    if ((ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && hasExport(node)) {
      exports.push(`${node.name.text}:${ts.SyntaxKind[node.kind]}`);
    }
    if (ts.isExportAssignment(node)) exports.push("default:export");
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) exports.push(`${element.name.text}:reexport`);
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) unsafeTypeEscape = true;
    ts.forEachChild(node, visit);
    if (isControl) nesting -= 1;
  };
  visit(file);
  if (imports.some((value) => /^(?:node:)?(?:fs|child_process|worker_threads|cluster|net|tls|http|https|dgram|vm)$/.test(value))) {
    unsafeRuntimeAccess = true;
  }
  const parseDiagnostics = (file as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  return Object.freeze({ parseErrors: Object.freeze(parseDiagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, " "))),
    exports: Object.freeze([...new Set(exports)].sort()), imports: Object.freeze(imports.sort()), calls: Object.freeze(calls.sort()),
    literals: Object.freeze(literals), functionBodies: Object.freeze(functionBodies), complexity, maxNesting, declarations,
    parameterMutation: detectsParameterMutation(file), globalMutableState, unsafeTypeEscape, unsafeRuntimeAccess });
}

function changedLineEstimate(before: string, after: string): number {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return Math.max(0, left.length - prefix - suffix) + Math.max(0, right.length - prefix - suffix);
}

function result(dimension: EngineeringQualityDimension, disposition: QualityDisposition, detector: string,
  evidenceStrength: QualityDetectorResult["evidenceStrength"], findings: readonly string[], falsePositiveRisk: QualityDetectorResult["falsePositiveRisk"],
  falseNegativeRisk: QualityDetectorResult["falseNegativeRisk"]): QualityDetectorResult {
  const body = { dimension, disposition, detector, findings: [...findings].sort() };
  return Object.freeze({ ...body, evidenceClass: "E3", evidenceStrength, findings: Object.freeze([...findings].sort()),
    evidenceDigest: sha256(canonical(body)), falsePositiveRisk, falseNegativeRisk });
}

export function assessEngineeringQuality(input: EngineeringQualityInput): EngineeringQualityAssessment {
  if (!input.assessmentId.trim() || !input.evaluatorVersion.trim() || !input.policy.policyId.trim()
    || !Number.isInteger(input.policy.maxChangedFiles) || input.policy.maxChangedFiles < 1
    || !Number.isInteger(input.policy.maxChangedLines) || input.policy.maxChangedLines < 1
    || !Number.isInteger(input.policy.maxCandidateBytes) || input.policy.maxCandidateBytes < 1) throw new Error("quality_assessment_contract_invalid");
  const analyses = new Map(Object.entries(input.candidateFiles).map(([path, source]) => [path, analyze(path, source)]));
  const baselineAnalyses = new Map(Object.entries(input.baselineFiles).map(([path, source]) => [path, analyze(path, source)]));
  const dimensions = {} as Record<EngineeringQualityDimension, QualityDetectorResult>;
  const external = (dimension: EngineeringQualityDimension, value: EngineeringQualityInput["functionalAcceptance"], detector: string) => {
    dimensions[dimension] = result(dimension, value === "PASS" ? "PASS" : value === "FAIL" ? "FAIL" : "INSUFFICIENT_EVIDENCE",
      detector, "STRONG", value === "PASS" ? [] : [value === "FAIL" ? "external_verification_failed" : "external_verification_missing"], "LOW", "LOW");
  };
  external("FUNCTIONAL_CORRECTNESS", input.functionalAcceptance, "independent_functional_evidence");
  external("REGRESSION_RESISTANCE", input.regressionAcceptance, "independent_regression_evidence");
  const changed = [...new Set(input.changedPaths)].sort();
  const allowed = new Set(input.policy.allowedChangedPaths);
  const readonly = new Set(input.policy.readonlyPaths);
  const changedLines = changed.reduce((sum, path) => sum + changedLineEstimate(input.baselineFiles[path] ?? "", input.candidateFiles[path] ?? ""), 0);
  const candidateBytes = Object.values(input.candidateFiles).reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  const scopeFindings = changed.filter((path) => !allowed.has(path) || readonly.has(path)).map((path) => `unauthorized_change:${path}`);
  dimensions.SCOPE_DISCIPLINE = result("SCOPE_DISCIPLINE", scopeFindings.length ? "FAIL" : "PASS", "path_scope_and_readonly_policy",
    "STRONG", scopeFindings, "LOW", "LOW");
  const minimalityFindings = [
    ...(changed.length > input.policy.maxChangedFiles ? [`changed_file_limit:${changed.length}`] : []),
    ...(changedLines > input.policy.maxChangedLines ? [`changed_line_limit:${changedLines}`] : []),
    ...(candidateBytes > input.policy.maxCandidateBytes ? [`candidate_byte_limit:${candidateBytes}`] : []),
  ];
  dimensions.CHANGE_MINIMALITY = result("CHANGE_MINIMALITY", minimalityFindings.length ? "FAIL" : "PASS",
    "semantic_scope_and_delta_bounds", "MODERATE", minimalityFindings, "MEDIUM", "MEDIUM");
  const apiFindings: string[] = [];
  for (const path of changed) {
    const before = baselineAnalyses.get(path)?.exports ?? [];
    const after = analyses.get(path)?.exports ?? [];
    if (canonical(before) !== canonical(after)) apiFindings.push(`export_contract_changed:${path}`);
  }
  dimensions.API_COMPATIBILITY = result("API_COMPATIBILITY", apiFindings.length ? "FAIL" : "PASS", "typescript_ast_export_contract",
    "STRONG", apiFindings, "LOW", "MEDIUM");
  const invariantFindings: Partial<Record<EngineeringQualityDimension, string[]>> = {};
  for (const invariant of input.policy.invariants) {
    const analysis = analyses.get(invariant.path);
    let passed = Boolean(analysis);
    if (analysis) {
      if (invariant.kind === "REQUIRED_CALL") passed = analysis.calls.includes(String(invariant.value));
      else if (invariant.kind === "REQUIRED_IMPORT") passed = analysis.imports.includes(String(invariant.value));
      else if (invariant.kind === "FORBIDDEN_CALL") passed = !analysis.calls.includes(String(invariant.value));
      else if (invariant.kind === "FORBIDDEN_IMPORT") passed = !analysis.imports.includes(String(invariant.value));
      else if (invariant.kind === "FORBIDDEN_LITERAL") passed = !analysis.literals.some((value) => canonical(value) === canonical(invariant.value));
      else if (invariant.kind === "NO_PARAMETER_MUTATION") passed = !analysis.parameterMutation;
      else if (invariant.kind === "NO_GLOBAL_MUTABLE_STATE") passed = !analysis.globalMutableState;
    }
    if (!passed) (invariantFindings[invariant.dimension] ??= []).push(`invariant_failed:${invariant.invariantId}`);
  }
  const architectureFindings = invariantFindings.ARCHITECTURAL_FIT ?? [];
  dimensions.ARCHITECTURAL_FIT = result("ARCHITECTURAL_FIT", architectureFindings.length ? "FAIL" : "PASS",
    "task_specific_ast_invariants/2", "MODERATE", architectureFindings, "MEDIUM", "MEDIUM");
  const typeFindings = [...analyses.entries()].flatMap(([path, item]) => item.unsafeTypeEscape ? [`unsafe_type_escape:${path}`] : []);
  dimensions.TYPE_SAFETY = result("TYPE_SAFETY", typeFindings.length ? "FAIL" : "PASS", "typescript_ast_and_suppression_scan",
    "MODERATE", typeFindings, "LOW", "MEDIUM");
  const bodies = [...analyses.entries()].flatMap(([path, item]) => item.functionBodies.filter((body) => body.length >= 24).map((body) => ({ path, body })));
  const duplicateFindings: string[] = [];
  for (let index = 0; index < bodies.length; index += 1) for (let right = index + 1; right < bodies.length; right += 1) {
    if (bodies[index].body === bodies[right].body) duplicateFindings.push(`duplicate_function_body:${bodies[index].path}:${bodies[right].path}`);
  }
  duplicateFindings.push(...(invariantFindings.DUPLICATION ?? []));
  dimensions.DUPLICATION = result("DUPLICATION", duplicateFindings.length ? "FAIL" : "PASS", "typescript_ast_function_body_fingerprint",
    "MODERATE", duplicateFindings, "MEDIUM", "MEDIUM");
  const maintainabilityFindings = [...analyses.entries()].flatMap(([path, item]) => [
    ...(item.complexity > input.policy.maxCyclomaticComplexity ? [`complexity_limit:${path}:${item.complexity}`] : []),
    ...(item.maxNesting > input.policy.maxNestingDepth ? [`nesting_limit:${path}:${item.maxNesting}`] : []),
  ]).concat(invariantFindings.MAINTAINABILITY ?? []);
  dimensions.MAINTAINABILITY = result("MAINTAINABILITY", maintainabilityFindings.length ? "FAIL" : "PASS",
    "ast_complexity_and_nesting", "MODERATE", maintainabilityFindings, "MEDIUM", "MEDIUM");
  const beforeComplexity = [...baselineAnalyses.values()].reduce((sum, item) => sum + item.complexity, 0);
  const afterComplexity = [...analyses.values()].reduce((sum, item) => sum + item.complexity, 0);
  const beforeDeclarations = [...baselineAnalyses.values()].reduce((sum, item) => sum + item.declarations, 0);
  const afterDeclarations = [...analyses.values()].reduce((sum, item) => sum + item.declarations, 0);
  const complexityFindings = [
    ...(afterComplexity - beforeComplexity > input.policy.maxComplexityDelta ? [`complexity_delta:${afterComplexity - beforeComplexity}`] : []),
    ...(afterDeclarations - beforeDeclarations > input.policy.maxAddedDeclarations ? [`declaration_delta:${afterDeclarations - beforeDeclarations}`] : []),
    ...(invariantFindings.UNNECESSARY_COMPLEXITY ?? []),
  ];
  dimensions.UNNECESSARY_COMPLEXITY = result("UNNECESSARY_COMPLEXITY", complexityFindings.length ? "FAIL" : "PASS",
    "ast_complexity_and_declaration_delta", "MODERATE", complexityFindings, "MEDIUM", "MEDIUM");
  const securityFindings = [...analyses.entries()].flatMap(([path, item]) => item.unsafeRuntimeAccess ? [`unsafe_runtime_access:${path}`] : [])
    .concat(invariantFindings.SECURITY_IMPLICATIONS ?? []);
  dimensions.SECURITY_IMPLICATIONS = result("SECURITY_IMPLICATIONS", securityFindings.length ? "FAIL" : "PASS",
    "unsafe_runtime_and_task_security_invariants", "STRONG", securityFindings, "LOW", "MEDIUM");
  const readabilityFindings = [...analyses.entries()].flatMap(([path, item]) => [
    ...item.parseErrors.map(() => `parse_error:${path}`),
    ...(input.candidateFiles[path].split(/\r?\n/).some((line) => line.length > 180) ? [`excessive_line_length:${path}`] : []),
    ...(item.functionBodies.some((body) => /\b(?:_0x[a-f0-9]+|[a-zA-Z]\d{3,})\b/.test(body)) ? [`obfuscated_identifier:${path}`] : []),
  ]).concat(invariantFindings.READABILITY ?? []);
  dimensions.READABILITY = result("READABILITY", readabilityFindings.length ? "FAIL" : "PASS", "parser_and_bounded_readability_structure",
    "LIMITED", readabilityFindings, "MEDIUM", "HIGH");
  for (const dimension of DIMENSIONS) if (!dimensions[dimension]) {
    dimensions[dimension] = result(dimension, "PASS", "no_disqualifying_fixture_specific_evidence", "LIMITED", [], "MEDIUM", "HIGH");
  }
  const failedDimensions = DIMENSIONS.filter((dimension) => dimensions[dimension].disposition === "FAIL");
  const insufficient = DIMENSIONS.filter((dimension) => dimensions[dimension].disposition === "INSUFFICIENT_EVIDENCE");
  const decision: EngineeringQualityAssessment["decision"] = failedDimensions.length > 0
    ? "REJECTED" : insufficient.length > 0 ? "INSUFFICIENT_EVIDENCE" : "ACCEPTED";
  const body = { assessmentId: input.assessmentId, evaluatorVersion: input.evaluatorVersion, decision,
    dimensions, failedDimensions };
  return Object.freeze({ ...body, dimensions: Object.freeze(dimensions), failedDimensions: Object.freeze(failedDimensions),
    evidenceId: `QUALITY-${sha256(canonical(body)).slice(0, 32)}`, evidenceClass: "E3", aggregateScoreUsed: false, authorityGranted: false });
}
