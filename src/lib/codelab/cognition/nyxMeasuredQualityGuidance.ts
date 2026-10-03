import { createHash } from "node:crypto";
import { measureEngineeringStructure } from "../assurance/engineeringQualityOracle";
import type { NyxRepairCognitionRequest } from "./nyxNemotronEngineeringCognition";

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
