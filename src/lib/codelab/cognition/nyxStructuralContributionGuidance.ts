import { createHash } from "node:crypto";
import ts from "typescript";
import { measureEngineeringStructure } from "../assurance/engineeringQualityOracle";
import { behaviorPreservingQualityGuidance } from "./nyxMeasuredQualityGuidance";
import type { NyxRepairCognitionRequest } from "./nyxNemotronEngineeringCognition";

/** Explain, never change, the existing detector. No source execution or compiler host. */
export function measureStructuralContributions(path: string, source: string) {
  if (typeof path !== "string" || path.length > 1024 || typeof source !== "string" || Buffer.byteLength(source, "utf8") > 12000
    || !/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(path)) return null;
  try {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
      /\.[cm]?js$|\.jsx$/.test(path) ? ts.ScriptKind.JS : /\.tsx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []).length) return null;
    const sites: { kind: string; line: number; column: number; category: "CONTROL" | "SHORT_CIRCUIT";
      contribution: number; controlDepth: number; functionLine: number | null }[] = [];
    let nodes = 0, total = 0, maximumDepth = 0;
    const visit = (node: ts.Node, depth: number, functionLine: number | null): void => {
      if (++nodes > 2500) throw Error("structural_map_ast_bound");
      const control = ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node)
        || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)
        || ts.isConditionalExpression(node) || ts.isCatchClause(node) || ts.isCaseClause(node);
      const shortCircuit = ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind);
      const position = file.getLineAndCharacterOfPosition(node.getStart(file));
      const owner = ts.isFunctionLike(node) ? position.line + 1 : functionLine;
      const nextDepth = depth + Number(control);
      maximumDepth = Math.max(maximumDepth, nextDepth);
      if (control || shortCircuit) {
        total++;
        if (sites.length < 48) sites.push({ kind: shortCircuit && ts.isBinaryExpression(node)
          ? ts.tokenToString(node.operatorToken.kind)! : ts.SyntaxKind[node.kind],
          line: position.line + 1, column: position.character + 1,
          category: control ? "CONTROL" : "SHORT_CIRCUIT", contribution: 1,
          controlDepth: nextDepth, functionLine: owner });
      }
      ts.forEachChild(node, child => visit(child, nextDepth, owner));
    };
    visit(file, 0, null);
    const measured = measureEngineeringStructure(path, source);
    // Reconcile with the authoritative detector; disagreement must not become advice.
    if (!measured.parseable || measured.complexity !== 1 + total || measured.maxNesting !== maximumDepth) return null;
    return Object.freeze({ sourceDigest: createHash("sha256").update(source).digest("hex"),
      baseContribution: 1, totalDecisionContributions: total, complexity: measured.complexity,
      maxNesting: measured.maxNesting, sites: Object.freeze(sites.map(site => Object.freeze(site))),
      complete: sites.length === total, omittedContributions: total - sites.length,
      maximumSites: 48, maximumAstNodes: 2500,
      interpretation: "FILE_TOTAL_INCLUDES_NESTED_CALLBACKS_CONTROL_DEPTH_DOES_NOT_RESET_AT_FUNCTION_BOUNDARY" });
  } catch { return null; }
}

/** Opt-in public, source-bound context only after actual quality-only rejection. */
export function structuralContributionGuidance(request: NyxRepairCognitionRequest) {
  if (!request?.candidateQualityFeedback) return null;
  const context = behaviorPreservingQualityGuidance(request);
  if (!context) return null;
  const sources = context.sources.map(source => {
    const files = request.files.filter(file => file.relativePath === source.path);
    if (files.length !== 1 || files[0].contentSha256 !== source.sourceDigest) return null;
    const map = measureStructuralContributions(source.path, files[0].content);
    return map && map.sourceDigest === source.sourceDigest ? Object.freeze({ path: source.path, ...map }) : null;
  });
  if (!sources.length || sources.some(source => source === null)) return null;
  return Object.freeze({ version: "nyx-structural-contribution-guidance/1", evidenceRef: context.evidenceRef,
    passingObservationRef: context.passingObservationRef, evidenceScope: context.evidenceScope,
    sources: Object.freeze(sources),
    instruction: "These locations explain the current source, not a replacement. Identify which traversals or decisions are semantically redundant, then design a coherent correction preserving every objective invariant. Nested callbacks contribute to the same file total. Moving a condition into &&, || or ?? does not remove its contribution. Do not hide branches in callbacks, giant expressions, state packs or forbidden tools to evade measurement. Necessary decisions must remain; if redesign is required, rederive behavior rather than deleting conditions. Recount the replacement against ALL unchanged original-state limits and verify it. Public checks passed, not hidden acceptance; this map is not a correctness or maintainability certificate.",
    hiddenEvidenceUsed: false, authorityGranted: false });
}
