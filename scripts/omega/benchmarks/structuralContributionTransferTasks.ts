import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration, v3NativeWireVerified } from "./v3NativeReasoningTransferTasks";

export const STRUCTURAL_CONTRIBUTION_EPOCH = Object.freeze({
  version: "nyx-structural-contributions-fresh-transfer/1",
  admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 4, predeclaredRepeats: 2,
  status: "FIRST_EXPOSURE_IN_THIS_EPOCH_NOT_PROVEN_PRETRAINING_UNSEEN",
  changedVariable: "SOURCE_BOUND_CONTROL_AND_SHORT_CIRCUIT_LOCATIONS_ON_QUALITY_ONLY_REPAIR",
  sharedNativeReasoning: { effort: "high", budget: 2048 },
  efficacyCriterion: "BOTH_REPEATS_REPAIR_WINS_IN_TWO_DISTINCT_DOMAINS_WITH_IDENTICAL_FIRST_CANDIDATES_MAP_EXERCISED_MATCHED_REALIZED_COMPUTE_AND_NO_PAIRED_ACCEPTANCE_REGRESSION",
  scope: "SAME_AUTHOR_SMALL_UNSEEDED_ENGINEERING_TRANSFER_NOT_EXTERNAL_BENCHMARK",
});

export function structuralContributionConfiguration(variant: string) {
  if (!["DECLARATION_SITES_CONTROL", "ALL_STRUCTURE_SITES"].includes(variant)) throw Error("structural_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    ...(variant === "ALL_STRUCTURE_SITES" ? { structuralContributionGuidance: "CONTROL_SITES" as const } : {}) };
}

export function structuralContributionWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown; publicAdmissionPolicyId?: unknown; legacyLineApplicabilityPresent?: boolean;
  qualityRepairPhase?: boolean; structuralMapVersion?: unknown; structuralMapSources?: unknown;
}[]) {
  structuralContributionConfiguration(variant);
  return v3NativeWireVerified("NATIVE_BOUNDED_REASONING", controls) && controls.every(control =>
    typeof control.qualityRepairPhase === "boolean" && (variant === "ALL_STRUCTURE_SITES" && control.qualityRepairPhase
      ? control.structuralMapVersion === "nyx-structural-contribution-guidance/1"
        && Number.isSafeInteger(control.structuralMapSources) && Number(control.structuralMapSources) > 0
      : control.structuralMapVersion === null && control.structuralMapSources === 0));
}

type Flow = { nodes: number; edges: number[][] };
// Exact independent cut enumeration; feasible implementation witness uses augmenting paths.
function cutCapacity(input: Flow) {
  let best = Infinity;
  for (let mask = 0; mask < 2 ** (input.nodes - 2); mask++) {
    const inside = (node: number) => node === 0 || node !== input.nodes - 1 && Boolean(mask & 2 ** (node - 1));
    best = Math.min(best, input.edges.reduce((sum, [a, b, capacity]) => sum + (inside(a) && !inside(b) ? capacity : 0), 0));
  }
  return best;
}

// Recursive expression reconstruction instead of an iterative operand stack.
function reversePolish(tokens: string[]): string | null {
  let end = tokens.length;
  const parse = (): bigint => {
    const token = tokens[--end];
    if (token === undefined) throw Error("missing_operand");
    if (/^-?(?:0|[1-9]\d*)$/.test(token)) return BigInt(token);
    const right = parse(), left = parse();
    if (token === "+") return left + right;
    if (token === "-") return left - right;
    if (token === "*") return left * right;
    if (token === "/" && right !== 0n) return left / right;
    throw Error("invalid_operator");
  };
  try { const value = parse(); return end === 0 ? value.toString() : null; } catch { return null; }
}

// Whole-stream lexical tokenization; witness uses incremental chunk-state scanning.
function escapedFields(chunks: string[]) {
  const fields = [""];
  for (const token of chunks.join("").match(/\\[\s\S]|[\s\S]/g) ?? []) {
    if (token === "|") fields.push("");
    else fields[fields.length - 1] += token.startsWith("\\") && token.length === 2 ? token.slice(1) : token;
  }
  return fields;
}

// Exhaust every canonical residue against all equations, not incremental merging.
function congruence(input: { residue: number; modulus: number }[]) {
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const modulus = input.reduce((value, item) => value / gcd(value, item.modulus) * item.modulus, 1);
  for (let residue = 0; residue < modulus; residue++) if (input.every(item =>
    residue % item.modulus === (item.residue % item.modulus + item.modulus) % item.modulus)) return { residue, modulus };
  return null;
}

const boundary = " Preserve every input and its nested values. Retain the ESM transform export. No imports, processes, filesystem or network. Only src/transform.mjs may change.";
const flowInputs: Flow[] = [
  { nodes: 2, edges: [] }, { nodes: 2, edges: [[0, 1, 4], [0, 1, 3], [1, 0, 7], [0, 0, 7]] },
  { nodes: 4, edges: [[0, 1, 3], [0, 2, 2], [1, 2, 2], [1, 3, 2], [2, 3, 3]] },
  { nodes: 4, edges: [[0, 1, 7], [1, 2, 0], [2, 3, 7]] },
  { nodes: 6, edges: [[0, 1, 1], [0, 2, 1], [1, 3, 1], [1, 4, 1], [2, 3, 1], [3, 5, 1], [4, 5, 1]] },
  ...Array.from({ length: 8 }, (_, seed) => ({ nodes: 5, edges: Array.from({ length: 18 }, (_, i) =>
    [i % 5, (i * 3 + seed + 1) % 5, (i * 5 + seed) % 8]) })),
];
const rpnInputs = [[], ["1", "2"], ["+"], ["2", "+"], ["1", "0", "/"], ["2", "3", "^"],
  ["-7", "3", "/"], ["7", "-3", "/"], ["-7", "-3", "/"], ["999999999999999999999", "3", "*"],
  ["9", "2", "-", "5", "*", "6", "/"], ["0"], ["-0"], ["01"], ["1", "2", "3", "+", "*"],
  ["3", "4", "*", "2", "5", "*", "+"], ["1", "constructor"], ["1", "2", "__proto__"]];
const fieldInputs = [[], [""], ["|", "|"], ["a\\", "|b|c"], ["a\\", "\\|b"], ["\\"], ["\\", "n"],
  ["α|", "😀\\", "|x"], ["first", "|", "", "last|"], ["\\", "\\", "\\", "|", "|"],
  ["a\r", "\n|b"], [" ", "|", " "], ["\\", "\n", "|", "tail"]];
const congruenceInputs = [[], [{ residue: -1, modulus: 5 }], [{ residue: 2, modulus: 4 }, { residue: 3, modulus: 6 }],
  [{ residue: 2, modulus: 4 }, { residue: 4, modulus: 6 }], [{ residue: 0, modulus: 1 }, { residue: -7, modulus: 9 }],
  ...Array.from({ length: 8 }, (_, i) => [{ residue: i - 5, modulus: 4 }, { residue: 2 * i, modulus: 6 },
    { residue: i + 3, modulus: 9 }]), [{ residue: 31, modulus: 7 }, { residue: -17, modulus: 11 }]];

export const STRUCTURAL_CONTRIBUTION_TASKS: readonly RepresentationTask[] = [
  { id: "DIRECTED-CAPACITY-FLOW", tier: "DEVELOPMENT", domain: "GRAPH_OPTIMIZATION",
    objective: "Implement transform(input) for {nodes,edges}. nodes is 2..6; nodes are numbered 0..nodes-1; each directed edge [from,to,capacity] has integer capacity 0..7. Return the maximum total integral flow from node 0 to node nodes-1. Parallel edges accumulate capacity, reverse edges are independent, self loops contribute no source-to-sink flow, and disconnected sinks return 0. Residual rerouting must be possible; greedily fixing paths without reverse residuals is insufficient." + boundary,
    publicCases: [{ input: { nodes: 3, edges: [[0, 1, 4], [1, 2, 2], [0, 2, 1]] }, expected: 3 },
      { input: { nodes: 2, edges: [[0, 1, 2], [0, 1, 3]] }, expected: 5 }],
    privateCases: flowInputs.map(input => ({ input, expected: cutCapacity(input) })) },
  { id: "SIGNED-POSTFIX-ARITHMETIC", tier: "DEVELOPMENT", domain: "EXACT_EXPRESSION_INTERPRETATION",
    objective: "Implement transform(input) for a token array of at most 24 strings. Integer tokens match ^-?(0|[1-9]\\d*)$ and may exceed Number precision. Operators are +, -, *, /, each consuming two operands in left/right order. Division truncates toward zero. Return the exact integer result as canonical decimal text if the expression is valid and finishes with exactly one value; return null for empty input, insufficient operands, unused operands, malformed numbers, unknown operators or division by zero. Never evaluate source text." + boundary,
    publicCases: [{ input: ["10", "3", "-"], expected: "7" }, { input: ["1", "2", "+", "4", "*"], expected: "12" }],
    privateCases: rpnInputs.map(input => ({ input, expected: reversePolish(input) })) },
  { id: "ESCAPED-CHUNK-FIELDS", tier: "VALIDATION", domain: "STREAM_LEXICAL_STATE",
    objective: "Implement transform(input) for an array of arbitrary Unicode string chunks. Treat their ordered concatenation as one stream. Unescaped | separates fields; backslash escapes exactly the next character, stripping itself and preserving that character literally, even | or backslash or newline. A terminal unmatched backslash is literal. Preserve empty fields (including terminal field), all whitespace and Unicode; empty stream yields ['']. Escapes may span chunks and repeated backslashes must obey parity." + boundary,
    publicCases: [{ input: ["a\\", "|b|c"], expected: ["a|b", "c"] }, { input: ["|x|"], expected: ["", "x", ""] }],
    privateCases: fieldInputs.map(input => ({ input, expected: escapedFields(input) })) },
  { id: "NONCOPRIME-CONGRUENCE-SYSTEM", tier: "VALIDATION", domain: "MODULAR_CONSTRAINT_SOLVING",
    objective: "Implement transform(input) for up to five equations {residue,modulus}, where residue is integer -40..40 and modulus is integer 1..12. Return null if no integer x satisfies all x congruent to residue modulo modulus. Otherwise return {residue:r,modulus:m}, with m the least common multiple of all moduli and 0<=r<m the unique canonical solution. Moduli need not be coprime, repeated compatible equations are allowed, negative residues use mathematical nonnegative modulo, and no equations returns {residue:0,modulus:1}." + boundary,
    publicCases: [{ input: [{ residue: 2, modulus: 4 }, { residue: 4, modulus: 6 }], expected: { residue: 10, modulus: 12 } },
      { input: [{ residue: 0, modulus: 2 }, { residue: 1, modulus: 2 }], expected: null }],
    privateCases: congruenceInputs.map(input => ({ input, expected: congruence(input) })) },
];

export function structuralContributionTasks(): RepresentationTask[] {
  return STRUCTURAL_CONTRIBUTION_TASKS.flatMap(task => [1, 2].map(repeat => ({ ...task, id: `${task.id}-REPEAT-${repeat}` })));
}
