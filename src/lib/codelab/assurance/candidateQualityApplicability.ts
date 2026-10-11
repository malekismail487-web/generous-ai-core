import ts from "typescript";

export const OMEGA_STRUCTURAL_REPAIR_APPLICABILITY = Object.freeze({
  version: "omega-original-syntax-applicability/1",
  maxOriginalBytes: 65_536,
  maxTinyFunctionNodes: 40,
} as const);

export interface CandidateQualityApplicability {
  readonly version: typeof OMEGA_STRUCTURAL_REPAIR_APPLICABILITY.version;
  readonly classification: "FROM_SCRATCH_THROW_STUB" | "TINY_EXISTING_FUNCTION_REPAIR"
    | "GENERAL_CHANGE" | "UNCLASSIFIED_SOURCE";
  readonly originalNodeCount: number | null;
  readonly basis: "ORIGINAL_SYNTAX_NOT_SEMANTIC_EQUIVALENCE_OR_AUTHORITY";
}

/** Original-source classification only: never evaluates code or reads imports/files. */
export function classifyCandidateQualityApplicability(originals: Readonly<Record<string, string>>,
  reviewedPaths: readonly string[]): CandidateQualityApplicability {
  const result = (classification: CandidateQualityApplicability["classification"], originalNodeCount: number | null) =>
    Object.freeze({ version: OMEGA_STRUCTURAL_REPAIR_APPLICABILITY.version, classification, originalNodeCount,
      basis: "ORIGINAL_SYNTAX_NOT_SEMANTIC_EQUIVALENCE_OR_AUTHORITY" as const });
  if (reviewedPaths.length !== 1) return result("GENERAL_CHANGE", null);
  const path = reviewedPaths[0];
  const source = originals[path];
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > OMEGA_STRUCTURAL_REPAIR_APPLICABILITY.maxOriginalBytes
    || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)) return result("UNCLASSIFIED_SOURCE", null);
  try {
    const kind = /\.jsx$/.test(path) ? ts.ScriptKind.JSX : /\.tsx$/.test(path) ? ts.ScriptKind.TSX
      : /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
    if ((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) {
      return result("UNCLASSIFIED_SOURCE", null);
    }
    // Empty statements, whitespace and comments cannot change this decision.
    const statements = file.statements.filter(statement => !ts.isEmptyStatement(statement));
    if (statements.length !== 1) return result("GENERAL_CHANGE", null);
    const statement = statements[0];
    const initializer = ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1
      && ts.isIdentifier(statement.declarationList.declarations[0].name)
      ? statement.declarationList.declarations[0].initializer : ts.isExportAssignment(statement) ? statement.expression : null;
    const declaration = ts.isFunctionDeclaration(statement) ? statement
      : initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer : null;
    if (!declaration?.body) return result("GENERAL_CHANGE", null);
    const body = declaration.body;
    let nodeCount = 0;
    const pending: ts.Node[] = [statement];
    while (pending.length) {
      const node = pending.pop()!;
      if (!ts.isEmptyStatement(node)) nodeCount++;
      ts.forEachChild(node, child => { pending.push(child); });
    }
    const bodyStatements = ts.isBlock(body) ? body.statements.filter(statement => !ts.isEmptyStatement(statement)) : [];
    const onlyStatement = bodyStatements[0];
    // Deliberately narrow stub syntax: one unconditional throw of a literal or
    // Error with one literal message. Return constants/empty bodies/calls are not
    // assumed to be unimplemented. This is not a proof of the function's purpose.
    const thrown = bodyStatements.length === 1 && ts.isThrowStatement(onlyStatement) ? onlyStatement.expression : null;
    const literal = (node: ts.Node): boolean => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    const standardError = thrown && ts.isNewExpression(thrown) && ts.isIdentifier(thrown.expression)
      && thrown.expression.text === "Error" && thrown.arguments?.length === 1 && literal(thrown.arguments[0])
      && !(declaration.name && ts.isIdentifier(declaration.name) && declaration.name.text === "Error")
      && declaration.parameters.every(parameter => ts.isIdentifier(parameter.name) && parameter.name.text !== "Error"
        && parameter.initializer === undefined);
    const simpleSignature = !("asteriskToken" in declaration && declaration.asteriskToken)
      && !declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)
      && declaration.parameters.every(parameter => ts.isIdentifier(parameter.name) && parameter.initializer === undefined);
    if (simpleSignature && thrown && (literal(thrown) || standardError)) return result("FROM_SCRATCH_THROW_STUB", nodeCount);
    return result(nodeCount <= OMEGA_STRUCTURAL_REPAIR_APPLICABILITY.maxTinyFunctionNodes
      ? "TINY_EXISTING_FUNCTION_REPAIR" : "GENERAL_CHANGE", nodeCount);
  } catch { return result("UNCLASSIFIED_SOURCE", null); }
}
