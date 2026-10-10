import { createHash } from "node:crypto";
import ts from "typescript";
import { measureEngineeringStructure } from "../assurance/engineeringQualityOracle";
import type { NyxRepairCognitionRequest } from "./nyxNemotronEngineeringCognition";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2, OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_ADDED_DECLARATIONS,
  OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_NONBLANK_BASELINE_LINES } from "../assurance/candidateEngineeringAdmission";

/** Explain the existing single-target policy before its first candidate, never authorize it. */
export function originalStateQualityBudget(request: NyxRepairCognitionRequest) {
  // After a candidate, current files are NOT the original quality baseline.
  // Bound post-rejection measurements remain the existing repair guidance's job.
  if (request.priorHypotheses.length || request.candidateQualityFeedback !== null
    || request.allowedMutationPaths.length !== 1) return null;
  const target = request.allowedMutationPaths[0];
  const files = request.files.filter(file => file.relativePath === target);
  if (files.length !== 1 || createHash("sha256").update(files[0].content).digest("hex") !== files[0].contentSha256) return null;
  const source = files[0].content;
  const measurement = measureEngineeringStructure(target, source, true);
  if (!measurement.parseable) return null;
  const originalNonblankLines = source.split(/\r?\n/).filter(line => line.trim()).length;
  const tinySingleTarget = originalNonblankLines <= OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_NONBLANK_BASELINE_LINES;
  const policy = OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2;
  const addedDeclarations = tinySingleTarget ? OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_ADDED_DECLARATIONS : policy.maxAddedDeclarations;
  return Object.freeze({ version: "nyx-original-state-quality-budget/1", target,
    evidenceRef: `FILE:${target}`, originalSourceDigest: files[0].contentSha256,
    originalNonblankLines, tinySingleTarget, originalMeasurement: measurement,
    maximumCandidateTotals: Object.freeze({ declarations: measurement.declarations + addedDeclarations,
      complexity: Math.min(policy.maxCyclomaticComplexity, measurement.complexity + policy.maxComplexityDelta),
      maxNesting: policy.maxNestingDepth }),
    scope: "SINGLE_ORIGINAL_AUTHORIZED_TARGET_NOT_A_NEW_ADMISSION_POLICY",
    accounting: "Count each function, method, arrow/callback, and each variable-statement declarator. Parameters and loop-header bindings do not count as variable statements. Multiple variables on one line still count separately. Complexity includes control nodes and &&, ||, ??; nesting is AST control depth, not indentation.",
    discipline: "Design a coherent algorithm within every total before emitting code. Avoid unnecessary intermediate representations, repeated traversals and redundant bindings. Do not golf identifiers, hide work in giant expressions/state objects, delete required behavior, change tests, or evade a detector. Preserve all functional requirements. This explanation does not establish correctness: Omega must remeasure and execute the complete candidate.",
    hiddenEvidenceUsed: false, authorityGranted: false });
}

/** Bounded lexical facts, not liveness, purity, alias analysis or refactoring approval. */
export function measureBindingUses(path: string, source: string) {
  if (Buffer.byteLength(source, "utf8") > 12000 || !/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(path)) return null;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    /\.[cm]?js$|\.jsx$/.test(path) ? ts.ScriptKind.JS : /\.tsx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []).length) return null;
  // The checker binds lexical symbols only. Its host never reads another file,
  // loads libraries/imports, resolves modules, evaluates source or runs tools.
  const program = ts.createProgram([path], { noLib: true, noResolve: true, allowJs: true }, {
    getSourceFile: name => name === path ? file : undefined, getDefaultLibFileName: () => "",
    writeFile: () => { throw Error("binding_summary_write_forbidden"); },
    getCurrentDirectory: () => "", getDirectories: () => [], fileExists: name => name === path,
    readFile: name => name === path ? source : undefined, getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  });
  const checker = program.getTypeChecker();
  const owner = (node: ts.Node): ts.Node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (ts.isFunctionLike(parent)) return parent;
    return file;
  };
  const declarations: ts.VariableDeclaration[] = [];
  const identifiers: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    if (ts.isIdentifier(node)) identifiers.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  let unresolvedBindings = 0;
  const bindings = declarations.slice(0, 32).flatMap(declaration => {
    if (!ts.isIdentifier(declaration.name)) { unresolvedBindings++; return []; }
    const symbol = checker.getSymbolAtLocation(declaration.name);
    if (!symbol) { unresolvedBindings++; return []; }
    const reads: ts.Identifier[] = [];
    const writes: ts.Identifier[] = [];
    let memberUses = 0;
    for (const identifier of identifiers) {
      if (identifier === declaration.name) continue;
      const parent = identifier.parent;
      const reference = ts.isShorthandPropertyAssignment(parent)
        ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(identifier);
      if (reference !== symbol) continue;
      const assignment = ts.isBinaryExpression(parent) && parent.left === identifier
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
      const update = (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
        && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator);
      if (assignment || update) writes.push(identifier);
      if (!assignment || parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken) reads.push(identifier);
      if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
        && parent.expression === identifier) memberUses++;
    }
    const initializerHazards = new Set<string>();
    const inspect = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) initializerHazards.add("CALL_OR_CONSTRUCTION");
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) initializerHazards.add("PROPERTY_READ_MAY_HAVE_GETTER");
      if (ts.isAwaitExpression(node) || ts.isYieldExpression(node)) initializerHazards.add("SUSPENSION");
      if (ts.isDeleteExpression(node) || ts.isBinaryExpression(node)
        && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        || (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
          && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) initializerHazards.add("STATE_UPDATE");
      ts.forEachChild(node, inspect);
    };
    if (declaration.initializer) inspect(declaration.initializer);
    const position = file.getLineAndCharacterOfPosition(declaration.getStart(file));
    const list = declaration.parent;
    return [Object.freeze({ name: declaration.name.text, line: position.line + 1, column: position.character + 1,
      declarationKind: ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const ? "CONST"
        : ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Let ? "LET" : "VAR",
      countedByQualityDetector: ts.isVariableDeclarationList(list) && ts.isVariableStatement(list.parent),
      readReferences: reads.length, directWriteReferences: writes.length, memberUses,
      capturedReferences: [...new Set([...reads, ...writes])].filter(node => owner(node) !== owner(declaration)).length,
      initializerHazards: Object.freeze([...initializerHazards].sort()),
      initializerKind: declaration.initializer ? ts.SyntaxKind[declaration.initializer.kind] : null })];
  });
  return Object.freeze({ bindings: Object.freeze(bindings), complete: declarations.length <= 32 && unresolvedBindings === 0,
    totalVariableDeclarations: declarations.length, unresolvedBindings, maxBindings: 32,
    scope: "LEXICAL_REFERENCE_COUNTS_NOT_SEMANTIC_EQUIVALENCE",
    referenceLimitations: "Direct writes exclude destructuring/for-target assignment and alias mutation; memberUses is not a mutation or purity proof." });
}

export function behaviorPreservingQualityGuidance(request: NyxRepairCognitionRequest) {
  const measured = measuredQualityRepairGuidance(request, true);
  const feedback = request.candidateQualityFeedback;
  const prior = request.priorHypotheses.at(-1);
  if (!measured || !feedback || prior?.hypothesisId !== feedback.hypothesisId
    || prior.disposition !== "PARTIALLY_SUPPORTED" || !prior.verificationEvidenceRefs.includes(feedback.evidenceId)
    || feedback.applicationId !== request.observation.applicationId || feedback.proposalDigest !== request.observation.proposalDigest
    || !["TEST_PASS", "BUILD_PASS", "TYPECHECK_PASS"].includes(request.observation.state)
    || request.observation.epistemicState !== "SUPPORTED") return null;
  const paths = [...new Set(measured.corrections.flatMap(correction => correction.measurements.map(item => item.path)))];
  const sources = paths.flatMap(path => {
    const files = request.files.filter(file => file.relativePath === path);
    if (files.length !== 1 || createHash("sha256").update(files[0].content).digest("hex") !== files[0].contentSha256) return [];
    const uses = measureBindingUses(path, files[0].content);
    return uses ? [{ path, sourceDigest: files[0].contentSha256, ...uses }] : [];
  });
  if (sources.length !== paths.length) return null;
  return Object.freeze({ version: "nyx-behavior-preserving-quality-repair/1", evidenceRef: feedback.evidenceId,
    passingObservationRef: `OBSERVATION:${request.observation.observationId}`, sources: Object.freeze(sources),
    evidenceScope: "AVAILABLE_PUBLIC_CHECKS_PASSED_NOT_FULL_CORRECTNESS_OR_HIDDEN_ACCEPTANCE",
    instruction: "This is a quality refactor of a candidate that passed available checks, not evidence that its algorithm should be replaced. Identify each binding's semantic role before removing it. Keep persistent accumulators/cursors and evaluation order; calls/getters/updates cannot be freely repeated or moved. A single lexical read does not prove safe inlining; zero reads does not prove safe deletion. Captured and member-used values may hold shared state. Prefer removing a genuinely redundant representation or composing an equivalent operation. If replacing the algorithm, rederive every objective invariant and challenge the replacement with boundary cases. Meet every original-state structural limit, preserve public behavior and exports, and rerun the unchanged verifier. Do not pack unrelated state, exploit loop-header counting, golf code or lower acceptance thresholds.",
    limitations: "No purity, alias, control-flow, dynamic property, exception, timing or equivalence proof. Missing bindings and an incomplete summary must not be treated as unused. The source remains authoritative; runtime verification remains mandatory.",
    hiddenEvidenceUsed: false, authorityGranted: false });
}

/** Public detector explanations only. No solutions, task IDs, hidden scores, or executable authority. */
export function measuredQualityRepairGuidance(request: NyxRepairCognitionRequest, includeDeclarationSites = false) {
  const feedback = request.candidateQualityFeedback;
  if (!feedback) return null;
  const files = new Map(request.files.map(file => [file.relativePath, file]));
  const supported = new Map([
    ["DECLARATION_DELTA", "declarations"], ["COMPLEXITY_DELTA", "complexity"],
    ["COMPLEXITY_LIMIT", "complexity"], ["NESTING_LIMIT", "maxNesting"],
  ] as const);
  const corrections = feedback.findings.flatMap(finding => {
    const metric = supported.get(finding.code as "DECLARATION_DELTA" | "COMPLEXITY_DELTA" | "COMPLEXITY_LIMIT" | "NESTING_LIMIT");
    if (!metric || !finding.measurement || finding.paths.length === 0
      || new Set(finding.paths).size !== finding.paths.length
      || finding.paths.some(path => !request.allowedMutationPaths.includes(path) || !files.has(path))) return [];
    const measurements = finding.paths.map(path => {
      const file = files.get(path)!;
      return { path, sourceDigest: createHash("sha256").update(file.content).digest("hex"),
        ...measureEngineeringStructure(path, file.content, includeDeclarationSites) };
    });
    if (measurements.some(item => !item.parseable)) return [];
    const { observed, limit } = finding.measurement;
    if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(limit) || limit < 0 || observed <= limit) return [];
    const current = measurements.reduce((sum, item) => sum + item[metric], 0);
    const cumulative = finding.code.endsWith("_DELTA");
    // Delta paths are the complete reviewed change set supplied by admission, not all context files.
    // Infer the original total only from that provenance-bound in-process finding and the current sources.
    if ((!cumulative && (measurements.length !== 1 || current !== observed)) || (cumulative && current < observed)) return [];
    const original = cumulative ? current - observed : null;
    return [{ code: finding.code, metric, measurements, currentTotal: current, originalTotal: original,
      maximumCandidateTotal: cumulative ? original! + limit : limit, minimumReduction: observed - limit,
      comparison: cumulative ? "ORIGINAL_OBSERVED_STATE_NOT_PREVIOUS_REPAIR" : "PER_FILE_LIMIT" }];
  });
  if (!corrections.length) return null;
  return Object.freeze({ version: includeDeclarationSites ? "nyx-measured-quality-repair/2" : "nyx-measured-quality-repair/1", evidenceRef: feedback.evidenceId,
    assessmentId: feedback.assessmentId, corrections,
    metricDefinitions: {
      declarations: "The existing detector counts every function declaration, function expression, arrow function and method once, plus each declarator in a variable statement. Nested callbacks count. Parameters and loop-header bindings are not variable statements. Renaming, merging statement lines or deleting comments does not reduce this count.",
      complexity: "One per reviewed file, plus if/for/for-in/for-of/while/do/conditional/catch/case nodes and each &&, || or ?? binary operator. Nested callbacks still contribute.",
      maxNesting: "Maximum nested control-node depth in the existing AST detector, not indentation depth.",
    },
    repairInstruction: "Before emitting the full replacement, budget its structure against every maximumCandidateTotal. Remove redundant intermediate representations or duplicate traversals through a coherent algorithm; do not golf identifiers, hide code, delete required behavior, change tests, or request relaxed limits. Preserve functional behavior and all other quality/security requirements. These measurements are guidance, not approval; Omega must remeasure and verify the proposed source.",
    ...(includeDeclarationSites ? { siteInterpretation: "Each listed site contributes its count to the current total, including nested callbacks. Locations refer to the admitted current source, not the replacement. When declarationSitesComplete is false, do not treat the bounded list as the whole source. Plan a coherent lower-footprint implementation, then recount all replacement functions and variable statements, including callbacks, before emitting it. A local one-site edit is insufficient if the cumulative excess is larger. Do not remove the public export or required behavior, introduce obfuscation, or move work into forbidden files/tools." } : {}),
    hiddenEvidenceUsed: false, authorityGranted: false });
}
