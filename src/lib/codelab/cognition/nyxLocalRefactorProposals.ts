import { createHash } from "node:crypto";
import ts from "typescript";
import { measureEngineeringStructure } from "../assurance/engineeringQualityOracle";
import { behaviorPreservingQualityGuidance } from "./nyxMeasuredQualityGuidance";
import type { NyxRepairCognitionRequest } from "./nyxNemotronEngineeringCognition";

type RefactorKind = "ADJACENT_RETURN_TEMPORARY" | "LOCAL_PRIMITIVE_CONSTANT" | "BOOLEAN_RETURN_BRANCH"
  | "ADJACENT_FIRST_EVALUATED_USE";
interface Edit { readonly start: number; readonly end: number; readonly replacement: string }
interface Rewrite { readonly kind: RefactorKind; readonly edits: readonly Edit[]; readonly guard: string }
const digest = (source: string) => createHash("sha256").update(source).digest("hex");
const MAX_OPERATIONS = 8;

function parse(path: string, source: string): {
  file: ts.SourceFile; nodes: ts.Node[]; checker: ts.TypeChecker;
} | null {
  try { return parseBounded(path, source); } catch { return null; }
}

function parseBounded(path: string, source: string) {
  if (!/\.(?:js|mjs|cjs)$/.test(path) || Buffer.byteLength(source, "utf8") > 12000) return null;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  if (((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []).length) return null;
  const nodes: ts.Node[] = [];
  const pending: ts.Node[] = [file];
  while (pending.length) {
    const node = pending.pop()!;
    nodes.push(node);
    if (nodes.length > 2500) return null;
    const children: ts.Node[] = [];
    ts.forEachChild(node, child => { children.push(child); });
    pending.push(...children.reverse());
  }
  // Fail closed around dynamic lexical access. This is not a complete reflection detector.
  if (nodes.some(node => ts.isWithStatement(node) || ts.isIdentifier(node) && ["eval", "Function"].includes(node.text)
    || ts.isTypeNode(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)
    || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)
    || ts.isModuleDeclaration(node) || ts.isVariableDeclarationList(node) && node.flags & ts.NodeFlags.Using)) return null;
  const program = ts.createProgram([path], { noLib: true, noResolve: true, allowJs: true }, {
    getSourceFile: name => name === path ? file : undefined, getDefaultLibFileName: () => "",
    writeFile: () => { throw Error("local_refactor_write_forbidden"); }, getCurrentDirectory: () => "",
    getDirectories: () => [], fileExists: name => name === path, readFile: name => name === path ? source : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  });
  return { file, nodes, checker: program.getTypeChecker() };
}

function owner(node: ts.Node): ts.Node | null {
  for (let parent = node.parent; parent; parent = parent.parent) if (ts.isFunctionLike(parent)) return parent;
  return null;
}

function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}

function primitive(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)
    || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)
    || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator)
      && ts.isNumericLiteral(unwrap(node.operand));
}

function valuePosition(node: ts.Identifier): boolean {
  for (let child: ts.Node = node, parent = node.parent; parent && !ts.isStatement(parent);
    child = parent, parent = parent.parent) {
    if (ts.isBinaryExpression(parent) && parent.left === child
      && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return false;
  }
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent) || ts.isBindingElement(parent)
    || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)
    || ts.isVariableDeclaration(parent) && parent.name === node
    || ts.isPropertyAccessExpression(parent) && parent.name === node
    || ts.isPropertyAssignment(parent) && parent.name === node
    || ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)
    || ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)
    || ts.isDeleteExpression(parent)) return false;
  if (ts.isBinaryExpression(parent) && parent.left === node
    && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return false;
  // Only known expression positions. Destructuring assignment/for targets and
  // any unrecognized syntax are not certified value uses by this small proposer.
  return ts.isReturnStatement(parent) || ts.isParenthesizedExpression(parent)
    || ts.isBinaryExpression(parent) && (parent.left !== node || parent.operatorToken.kind < ts.SyntaxKind.FirstAssignment)
    || ts.isVariableDeclaration(parent) && parent.initializer === node
    || ts.isCallExpression(parent) && parent.arguments.includes(node)
    || ts.isArrayLiteralExpression(parent) && parent.elements.includes(node)
    || ts.isPropertyAssignment(parent) && parent.initializer === node
    || ts.isConditionalExpression(parent) || ts.isIfStatement(parent) && parent.expression === node
    || ts.isElementAccessExpression(parent) && parent.argumentExpression === node;
}

/** The reference must be evaluated unconditionally, before any other expression.
 * Calls, typeof, assignments, destructuring, collection construction and
 * suspension are deliberately outside this small evaluation-order grammar.
 */
function firstEvaluatedValue(expression: ts.Expression, reference: ts.Identifier, depth = 0): boolean {
  if (depth >= 16) return false;
  if (expression === reference) return true;
  if (ts.isParenthesizedExpression(expression)) return firstEvaluatedValue(expression.expression, reference, depth + 1);
  if (ts.isBinaryExpression(expression)
    && !(expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment)) {
    return firstEvaluatedValue(expression.left, reference, depth + 1);
  }
  if (ts.isConditionalExpression(expression)) return firstEvaluatedValue(expression.condition, reference, depth + 1);
  if (ts.isPrefixUnaryExpression(expression)
    && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.ExclamationToken,
      ts.SyntaxKind.TildeToken].includes(expression.operator)) {
    return firstEvaluatedValue(expression.operand, reference, depth + 1);
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return firstEvaluatedValue(expression.expression, reference, depth + 1);
  }
  return false;
}

function findRewrite(path: string, source: string, includeEvaluationOrder: boolean): Rewrite | null {
  const parsed = parse(path, source);
  if (!parsed) return null;
  const { file, nodes, checker } = parsed;
  const text = (node: ts.Node) => node.getText(file);
  const uncommented = (start: number, end: number) => !/\/\/|\/\*/.test(source.slice(start, end));
  for (const node of nodes) {
    if (ts.isVariableStatement(node) && ts.isBlock(node.parent) && owner(node)
      && node.declarationList.flags & ts.NodeFlags.Const && node.declarationList.declarations.length === 1) {
      const declaration = node.declarationList.declarations[0];
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const symbol = checker.getSymbolAtLocation(declaration.name);
      if (!symbol || symbol.declarations?.length !== 1) continue;
      const refs = nodes.filter((other): other is ts.Identifier => ts.isIdentifier(other)
        && other !== declaration.name && (ts.isShorthandPropertyAssignment(other.parent)
          ? checker.getShorthandAssignmentValueSymbol(other.parent) : checker.getSymbolAtLocation(other)) === symbol);
      if (!refs.length || refs.some(ref => ref.getStart(file) < node.end || owner(ref) !== owner(node))
        || !uncommented(node.getStart(file), node.end)) continue;
      const next = node.parent.statements[node.parent.statements.indexOf(node) + 1];
      // Anonymous functions/classes get a binding-derived name. Removing that
      // binding is NOT equivalent; closures can also retain the removed binding.
      const initializerContainsFunction = nodes.some(other => other.pos >= declaration.initializer!.pos
        && other.end <= declaration.initializer!.end && (ts.isFunctionLike(other) || ts.isClassExpression(other)));
      if (next && ts.isReturnStatement(next) && next.expression && ts.isIdentifier(unwrap(next.expression))
        && refs.length === 1 && refs[0] === unwrap(next.expression) && !initializerContainsFunction
        && uncommented(node.getStart(file), next.end)) {
        return { kind: "ADJACENT_RETURN_TEMPORARY", guard: "ONE_LEXICAL_RETURN_USE_ADJACENT_SAME_BLOCK_NO_CAPTURE_OR_INFERRED_FUNCTION_NAME",
          edits: [{ start: node.getStart(file), end: next.end, replacement: `return (${text(declaration.initializer)});` }] };
      }
      if (includeEvaluationOrder && next && refs.length === 1 && !initializerContainsFunction
        && !nodes.some(other => other.pos >= declaration.initializer!.pos && other.end <= declaration.initializer!.end
          && (ts.isAwaitExpression(other) || ts.isYieldExpression(other)))
        && uncommented(node.getStart(file), next.end)) {
        const nextDeclaration = ts.isVariableStatement(next) && next.declarationList.declarations.length === 1
          ? next.declarationList.declarations[0] : null;
        const expression = ts.isReturnStatement(next) ? next.expression
          : nextDeclaration && ts.isIdentifier(nextDeclaration.name) ? nextDeclaration.initializer : undefined;
        if (expression && firstEvaluatedValue(expression, refs[0])) {
          return { kind: "ADJACENT_FIRST_EVALUATED_USE",
            guard: "ONE_LEXICAL_USE_FIRST_UNCONDITIONAL_VALUE_IN_NEXT_STATEMENT_SAME_BLOCK_NO_CAPTURE_NAME_OR_SUSPENSION",
            edits: [{ start: node.getStart(file), end: node.end, replacement: "" },
              { start: refs[0].getStart(file), end: refs[0].end, replacement: `(${text(declaration.initializer)})` }] };
        }
      }
      if (primitive(declaration.initializer) && refs.length <= 8 && refs.every(valuePosition)) {
        return { kind: "LOCAL_PRIMITIVE_CONSTANT", guard: "CONST_PRIMITIVE_AFTER_DECLARATION_SAME_FUNCTION_EXPLICIT_VALUE_POSITIONS",
          edits: [{ start: node.getStart(file), end: node.end, replacement: "" },
            ...refs.map(ref => ({ start: ref.getStart(file), end: ref.end, replacement: `(${text(declaration.initializer!)})` }))] };
      }
    }
    if (ts.isIfStatement(node) && node.elseStatement && owner(node)) {
      const returned = (statement: ts.Statement) => ts.isBlock(statement) && statement.statements.length === 1
        ? statement.statements[0] : statement;
      const yes = returned(node.thenStatement), no = returned(node.elseStatement);
      if (!ts.isReturnStatement(yes) || !ts.isReturnStatement(no) || !yes.expression || !no.expression) continue;
      const a = yes.expression.kind, b = no.expression.kind;
      if (![a, b].every(kind => [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(kind)) || a === b
        || !uncommented(node.getStart(file), node.end)) continue;
      return { kind: "BOOLEAN_RETURN_BRANCH", guard: "OPPOSITE_BOOLEAN_RETURN_LITERALS_SINGLE_CONDITION_EVALUATION",
        edits: [{ start: node.getStart(file), end: node.end,
          replacement: `return ${a === ts.SyntaxKind.TrueKeyword ? "!!" : "!"}(${text(node.expression)});` }] };
    }
  }
  return null;
}

/** Pure bounded suggestion, never a compiler transform, file write or approval.
 * Language-level guards do not prove full observational equivalence: reflection,
 * stack traces, source introspection and unmodeled host behavior still require review.
 */
export function proposeNyxLocalRefactors(path: string, source: string, includeEvaluationOrder = false) {
  if (typeof includeEvaluationOrder !== "boolean") return null;
  if (!parse(path, source)) return null;
  let current = source;
  const operations = [];
  for (let step = 0; step < MAX_OPERATIONS; step++) {
    const rewrite = findRewrite(path, current, includeEvaluationOrder);
    if (!rewrite) break;
    const before = current;
    for (const edit of rewrite.edits.slice().sort((a, b) => b.start - a.start))
      current = current.slice(0, edit.start) + edit.replacement + current.slice(edit.end);
    if (!parse(path, current)) return null;
    operations.push(Object.freeze({ kind: rewrite.kind, guard: rewrite.guard,
      inputDigest: digest(before), outputDigest: digest(current) }));
  }
  if (!operations.length) return null;
  const before = measureEngineeringStructure(path, source), after = measureEngineeringStructure(path, current);
  if (!before.parseable || !after.parseable || after.declarations > before.declarations
    || after.complexity > before.complexity || after.maxNesting > before.maxNesting) return null;
  return Object.freeze({ path, baseSourceDigest: digest(source), proposedSourceDigest: digest(current),
    proposedSource: current, operations: Object.freeze(operations), maximumOperations: MAX_OPERATIONS,
    maximumAstNodes: 2500,
    before: Object.freeze({ declarations: before.declarations, complexity: before.complexity, maxNesting: before.maxNesting }),
    after: Object.freeze({ declarations: after.declarations, complexity: after.complexity, maxNesting: after.maxNesting }),
    equivalence: "GUARDED_PROPOSAL_NOT_CERTIFIED_REQUIRES_EXECUTION_AND_REVIEW", authorityGranted: false });
}

export function nyxLocalRefactorGuidance(request: NyxRepairCognitionRequest, includeEvaluationOrder = false) {
  if (typeof includeEvaluationOrder !== "boolean") return null;
  // Reuse the existing passing-observation/source/evidence binding contract,
  // but do not ship the previously falsified binding-inventory intervention.
  const context = behaviorPreservingQualityGuidance(request);
  if (!context) return null;
  const proposals = context.sources.flatMap(source => {
    const file = request.files.find(file => file.relativePath === source.path)!;
    const proposal = proposeNyxLocalRefactors(source.path, file.content, includeEvaluationOrder);
    return proposal ? [proposal] : [];
  });
  if (!proposals.length) return null;
  return Object.freeze({ version: includeEvaluationOrder ? "nyx-local-refactor-proposals/3" : "nyx-local-refactor-proposals/2",
    evidenceRef: context.evidenceRef,
    passingObservationRef: context.passingObservationRef, evidenceScope: context.evidenceScope,
    proposals: Object.freeze(proposals),
    instruction: "These are optional concrete local refactor proposals for the current passing candidate. Review their guards and the objective; if appropriate, use their proposedSource as the starting point of an ordinary PROPOSE_EDIT. They do not apply themselves or satisfy the task automatically. If they do not meet every unchanged cumulative quality bound, make a coherent further correction. Never change tests, thresholds, targets or tools. Preserve behavior and verify through Omega; public passing is not hidden acceptance.",
    limitations: "Not full observational equivalence or whole-program proof. Source introspection, stack locations, indirect dynamic code, host effects and unsupported syntax remain outside the guards. Review is required even when local structure improves. No task identities, expected private answers or hidden feedback are used.",
    hiddenEvidenceUsed: false, authorityGranted: false });
}
