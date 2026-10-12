import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration } from "./v3NativeReasoningTransferTasks";

export const SOURCE_SITE_REPAIR_EPOCH = Object.freeze({
  version: "nyx-source-site-fresh-repair/1", admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 2, predeclaredRepeats: 2, authoredCandidates: false,
  changedVariable: "OPTIONAL_MODEL_WRITTEN_SOURCE_BOUND_FRAGMENT_INTERFACE_ONLY",
  criterion: "BOTH_REPEATS_GAIN_IN_BOTH_DOMAINS_FROM_SHARED_QUALITY_REJECTED_LIVE_SOURCE_WITH_RESOLVED_SITES_MATCHED_REPAIR_COMPUTE_AND_NO_REGRESSION",
  limitations: "Same-author small synthetic engineering tasks, not an official benchmark or independently authored holdout. Pretraining exposure unknown. E3 source replay is not new inference. Syntactic confinement is not semantic equivalence. No credit for unexercised sites or extra compute; no broad/default promotion.",
});
export type SourceSiteRepairVariant = "SHARED_INITIAL" | "WHOLE_SOURCE" | "SOURCE_SITES";
export function sourceSiteRepairConfiguration(variant: SourceSiteRepairVariant) {
  if (!["SHARED_INITIAL", "WHOLE_SOURCE", "SOURCE_SITES"].includes(variant)) throw Error("source_site_repair_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    ...(variant === "SOURCE_SITES" ? { sourceSiteEmission: "SOURCE_BOUND_FRAGMENTS" as const } : {}) };
}

// Finite unit-cell measurement oracle, independent of an event-sweep implementation.
type Segment = { start: number; end: number; weight: number };
export function sourceSiteCoverageOracle(input: Segment[]): [number[][], number] {
  const weights = Array.from({ length: 10 }, (_, index) => input.reduce((sum, segment) =>
    sum + (segment.start <= index - 5 && segment.end >= index - 4 ? segment.weight : 0), 0));
  const runs: number[][] = [];
  for (let index = 0; index < weights.length; index++) {
    const value = weights[index]; if (!value) continue;
    const last = runs.at(-1);
    if (last && last[1] === index - 5 && last[2] === value) last[1]++;
    else runs.push([index - 5, index - 4, value]);
  }
  return [runs, weights.reduce((sum, value) => sum + value, 0)];
}
// Exhaustive edit-path enumeration, not the dynamic programming witness.
export function sourceSiteAlignmentOracle(input: { from: string; to: string }): [number, string] {
  const from = [...input.from], to = [...input.to]; let best = Infinity, operations = "";
  const visit = (i: number, j: number, cost: number, path: string): void => {
    if (cost > best) return;
    if (i === from.length && j === to.length) {
      if (cost < best || cost === best && path < operations) { best = cost; operations = path; } return;
    }
    if (i < from.length) visit(i + 1, j, cost + 1, path + "D");
    if (j < to.length) visit(i, j + 1, cost + 1, path + "I");
    if (i < from.length && j < to.length) visit(i + 1, j + 1, cost + (from[i] === to[j] ? 0 : 2),
      path + (from[i] === to[j] ? "M" : "R"));
  };
  visit(0, 0, 0, ""); return [best, operations];
}
const coverageInputs: Segment[][] = [[], [{ start: 0, end: 0, weight: 3 }],
  [{ start: -5, end: 5, weight: 2 }, { start: -3, end: 3, weight: -2 }],
  [{ start: -2, end: 0, weight: -3 }, { start: 0, end: 2, weight: -3 }],
  ...Array.from({ length: 8 }, (_, seed) => Array.from({ length: seed % 5 + 1 }, (_, index) => {
    const start = (seed * 3 + index * 2) % 9 - 5; return { start, end: Math.min(5, start + (index + seed) % 6), weight: (seed + index) % 7 - 3 };
  }))];
const alignmentInputs = [
  { from: "", to: "" }, { from: "", to: "λ😀" }, { from: "😀", to: "" },
  { from: "a", to: "b" }, { from: "a😀b", to: "😀ab" }, { from: "λλa", to: "aλλ" },
  { from: "abcd", to: "dcba" }, { from: "é", to: "é" },
  { from: "aaaa", to: "aa" }, { from: "😀a", to: "a😀" },
  { from: "ab", to: "ba" }, { from: "aa😀", to: "a😀a" },
];
const boundary = " Preserve input and independently own returned arrays. Retain named ESM transform. No imports, filesystem, processes or network. Only src/transform.mjs may change.";
export const SOURCE_SITE_REPAIR_TASKS: readonly RepresentationTask[] = [
  { id: "SIGNED-COVERAGE-CANONICAL-RUNS", tier: "DEVELOPMENT", domain: "SIGNED_SPATIAL_COVERAGE",
    objective: "Implement transform(input) for up to six segments {start,end,weight}. start/end are integers -5..5 with start<=end; weight integers -3..3. Each segment adds weight on half-open [start,end). Return [runs,integral]. runs are sorted [start,end,totalWeight] intervals of nonzero coverage: merge adjacent intervals iff their totalWeight is equal, omit all zero coverage and zero-length intervals. integral is signed sum of totalWeight*length over the whole line. Empty input returns [[],0]." + boundary,
    publicCases: [{ input: [{ start: 0, end: 3, weight: 2 }, { start: 1, end: 2, weight: -2 }], expected: [[[0, 1, 2], [2, 3, 2]], 4] },
      { input: [{ start: -1, end: 0, weight: 3 }, { start: 0, end: 1, weight: 3 }], expected: [[[-1, 1, 3]], 6] }],
    privateCases: coverageInputs.map(input => ({ input, expected: sourceSiteCoverageOracle(input) })) },
  { id: "UNICODE-EDIT-CANONICAL-TRACE", tier: "VALIDATION", domain: "UNICODE_SEQUENCE_OPTIMIZATION",
    objective: "Implement transform(input) for {from,to} Unicode strings each at most four code points. Work on code points, without normalization. Return [minimumCost,canonicalOperations] for left-to-right alignment. D consumes one from character (cost1); I consumes one to character (cost1); M consumes equal characters from both (cost0); R consumes differing characters from both (cost2). Both strings must be completely consumed. Of all minimum-cost operation strings choose lexicographically smallest under ASCII order D<I<M<R. Empty-to-empty is [0,\"\"]." + boundary,
    publicCases: [{ input: { from: "ab", to: "ab" }, expected: [0, "MM"] },
      { input: { from: "a", to: "b" }, expected: [2, "DI"] }],
    privateCases: alignmentInputs.map(input => ({ input, expected: sourceSiteAlignmentOracle(input) })) },
];
export function sourceSiteRepairTasks(): RepresentationTask[] {
  return SOURCE_SITE_REPAIR_TASKS.flatMap(task => [1, 2].map(repeat => ({ ...task, id: `${task.id}-REPEAT-${repeat}` })));
}

export function sourceSitePairAssessment(common: { sourceDigest: string | null; live: boolean; stable: boolean },
  control: { accepted: boolean; perIteration: readonly { candidateSourceDigest?: string | null; functionalAccepted: boolean; quality?: string | null }[] },
  treatment: typeof control & { sourceSiteReceipts: readonly { outcome: string }[] }, matchedRepairCompute: boolean) {
  const first = control.perIteration[0], other = treatment.perIteration[0];
  const liveSourceBound = common.live && common.stable && /^[a-f0-9]{64}$/.test(common.sourceDigest ?? "")
    && first?.candidateSourceDigest === common.sourceDigest && other?.candidateSourceDigest === common.sourceDigest;
  const eligible = liveSourceBound && first.functionalAccepted && other.functionalAccepted
    && first.quality === "REJECTED" && other.quality === "REJECTED";
  const exercised = treatment.sourceSiteReceipts.some(receipt => receipt.outcome === "RESOLVED");
  return { liveSourceBound, eligible, exercised, matchedRepairCompute,
    qualifyingQualityRepairGain: eligible && exercised && matchedRepairCompute && !control.accepted && treatment.accepted,
    pairedRegression: control.accepted && !treatment.accepted };
}
