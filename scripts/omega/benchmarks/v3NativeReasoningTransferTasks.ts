import type { RepresentationTask } from "./sourceRepresentationTasks";
import { nativeReasoningTransferConfiguration } from "./nativeReasoningTransferTasks";

export const V3_NATIVE_REASONING_EPOCH = Object.freeze({
  version: "nyx-v3-native-reasoning-fresh-transfer/1",
  admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 4, predeclaredRepeats: 2,
  reasoningReservationTokens: 2048, sharedOutputCapTokens: 8192,
  status: "FIRST_EXPOSURE_IN_THIS_EPOCH_NOT_PROVEN_PRETRAINING_UNSEEN",
  efficacyCriterion: "BOTH_REPEATS_WIN_IN_TWO_DISTINCT_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_NO_PAIRED_ACCEPTANCE_REGRESSION",
  scope: "SAME_AUTHOR_SMALL_UNSEEDED_ENGINEERING_TRANSFER_NOT_EXTERNAL_BENCHMARK",
  priorV2Results: "PRESERVED_NOT_REGRADED_NOT_DIRECTLY_COMPARABLE",
});

/** Reuses the existing native reasoning mechanism. No new cognition or executor. */
export function v3NativeReasoningConfiguration(variant: string) {
  return { ...nativeReasoningTransferConfiguration(variant),
    qualityRepairGuidance: "STRUCTURE_SITES" as const,
    structuralBudgetGuidance: "PUBLIC_ORIGINAL_STATE" as const };
}

// Evaluator-only decimal digit arithmetic, independent of the BigInt witness.
function roundedDecimal(input: { coefficient: string; scale: number; places: number }): string {
  const negative = input.coefficient.startsWith("-");
  let digits = input.coefficient.replace(/^-/, "");
  if (input.places >= input.scale) digits += "0".repeat(input.places - input.scale);
  else {
    digits = digits.padStart(input.scale - input.places + 1, "0");
    const retained = digits.slice(0, -(input.scale - input.places));
    const discarded = digits.slice(-(input.scale - input.places));
    const increase = discarded[0] > "5" || discarded[0] === "5"
      && (/[1-9]/.test(discarded.slice(1)) || Number(retained.at(-1)) % 2 === 1);
    digits = retained;
    if (increase) {
      const cells = [...digits]; let index = cells.length - 1;
      while (index >= 0 && cells[index] === "9") cells[index--] = "0";
      if (index < 0) cells.unshift("1"); else cells[index] = String(Number(cells[index]) + 1);
      digits = cells.join("");
    }
  }
  digits = digits.replace(/^0+(?=\d)/, "").padStart(input.places + 1, "0");
  const value = input.places ? digits.slice(0, -input.places) + "." + digits.slice(-input.places) : digits;
  return negative && /[1-9]/.test(digits) ? "-" + value : value;
}

// Evaluator enumerates integer unit cells; the witness partitions coordinate boundaries.
function rectangleArea(input: number[][]): number {
  const cells = new Set<string>();
  for (const [a, b, c, d] of input) for (let x = Math.min(a, c); x < Math.max(a, c); x++)
    for (let y = Math.min(b, d); y < Math.max(b, d); y++) cells.add(`${x},${y}`);
  return cells.size;
}

// Evaluator exhausts subsets; the witness uses finish-time dynamic programming.
function intervalReward(input: { start: number; end: number; reward: number }[]): number {
  let best = 0;
  for (let mask = 0; mask < 2 ** input.length; mask++) {
    const chosen = input.filter((_, index) => (mask & 2 ** index) !== 0);
    if (chosen.some((a, index) => chosen.slice(index + 1).some(b => a.start < b.end && b.start < a.end))) continue;
    best = Math.max(best, chosen.reduce((sum, item) => sum + item.reward, 0));
  }
  return best;
}

type Automaton = { transitions: number[][]; accepting: number[] };
// Enumerate words independently, not product-state BFS. For deterministic finite
// automata the disjoint union of n states distinguishes inequivalent states in < n steps.
function distinguishingWord(input: { left: Automaton; right: Automaton }): string | null {
  for (let length = 0; length < input.left.transitions.length + input.right.transitions.length; length++) {
    for (let encoding = 0; encoding < 2 ** length; encoding++) {
      const word = length ? encoding.toString(2).padStart(length, "0").replace(/0/g, "a").replace(/1/g, "b") : "";
      const accepts = (machine: Automaton) => machine.accepting.includes([...word]
        .reduce((state, letter) => machine.transitions[state][letter === "a" ? 0 : 1], 0));
      if (accepts(input.left) !== accepts(input.right)) return word;
    }
  }
  return null;
}

const suffix = " Preserve all inputs; return detached data. Retain the ESM transform export. No imports, processes, filesystem or network. Only src/transform.mjs may change.";
const decimalInputs = [
  { coefficient: "5", scale: 1, places: 0 }, { coefficient: "15", scale: 1, places: 0 },
  { coefficient: "-25", scale: 1, places: 0 }, { coefficient: "251", scale: 2, places: 0 },
  { coefficient: "-49", scale: 2, places: 0 }, { coefficient: "9995", scale: 3, places: 2 },
  { coefficient: "9999999999999999999999999999995", scale: 1, places: 0 },
  { coefficient: "-1", scale: 20, places: 3 }, { coefficient: "0", scale: 20, places: 20 },
  { coefficient: "123", scale: 0, places: 4 }, { coefficient: "-12500", scale: 4, places: 1 },
  { coefficient: "1234500000000000000001", scale: 20, places: 2 },
];
const rectangleInputs: number[][][] = [[], [[1, 1, 1, 7]], [[5, 6, -2, -1]],
  [[-3, -3, 3, 3], [-1, -1, 1, 1]], [[0, 0, 2, 2], [2, 0, 4, 2]],
  [[0, 0, 3, 3], [2, 2, 5, 5], [1, -1, 4, 1]], [[-8, -8, 8, 8], [8, 8, -8, -8]],
  [[-2, 0, 2, 1], [0, -2, 1, 2]], [[1, 1, 2, 2], [4, 4, 5, 5], [7, 7, 8, 8]],
  ...Array.from({ length: 5 }, (_, seed) => Array.from({ length: 8 }, (_, index) =>
    [index - 4, (index * 3 + seed) % 9 - 4, (index + seed) % 9 - 4, (index * 2 + seed + 1) % 9 - 4])),
];
const intervalInputs = [[], [{ start: 0, end: 1, reward: 0 }],
  [{ start: 0, end: 5, reward: 10 }, { start: 0, end: 2, reward: 6 }, { start: 2, end: 5, reward: 6 }],
  [{ start: 1, end: 3, reward: 9 }, { start: 1, end: 3, reward: 9 }, { start: 3, end: 4, reward: 2 }],
  ...Array.from({ length: 8 }, (_, seed) => Array.from({ length: 10 }, (_, index) =>
    ({ start: (index * 3 + seed) % 17, end: (index * 3 + seed) % 17 + 1 + (index + seed) % 6,
      reward: (index * 7 + seed * 3) % 23 }))),
];
const acceptsNone: Automaton = { transitions: [[0, 0]], accepting: [] };
const acceptsAll: Automaton = { transitions: [[0, 0]], accepting: [0] };
const automatonInputs = [
  { left: acceptsNone, right: acceptsAll }, { left: acceptsNone, right: acceptsNone },
  { left: { transitions: [[1, 0], [1, 1]], accepting: [1] }, right: acceptsNone },
  { left: { transitions: [[1, 0], [2, 1], [2, 2]], accepting: [2] }, right: acceptsNone },
  { left: { transitions: [[0, 1], [0, 1]], accepting: [1] },
    right: { transitions: [[1, 0], [1, 0]], accepting: [0] } },
  ...Array.from({ length: 8 }, (_, seed) => ({
    left: { transitions: Array.from({ length: 4 }, (_, index) => [(index + 1) % 4, (index * 2 + seed) % 4]),
      accepting: [seed % 4] },
    right: { transitions: Array.from({ length: 3 }, (_, index) => [(index + seed) % 3, (index + 1) % 3]),
      accepting: seed % 2 ? [] : [seed % 3] },
  })),
];

export const V3_NATIVE_REASONING_TASKS: readonly RepresentationTask[] = [
  { id: "DECIMAL-COEFFICIENT-QUANTIZATION-V3", tier: "DEVELOPMENT", domain: "EXACT_NUMERICAL_ROUNDING",
    objective: "Implement transform(input) for {coefficient,scale,places}. coefficient is a canonical signed integer decimal string with at most 100 digits, including '0' but no '-0'. scale and places are integers 0..20. Its value is coefficient*10^(-scale). Round it to exactly places digits after the decimal point using nearest, ties to EVEN. Return fixed-point decimal text (no scientific notation, no unnecessary leading zeros, no minus sign for zero). Increasing places pads zeros, not approximation; values beyond Number precision must remain exact." + suffix,
    publicCases: [{ input: { coefficient: "125", scale: 2, places: 1 }, expected: "1.2" },
      { input: { coefficient: "-135", scale: 2, places: 1 }, expected: "-1.4" }],
    privateCases: decimalInputs.map(input => ({ input, expected: roundedDecimal(input) })) },
  { id: "PLANAR-RECTANGLE-AREA", tier: "DEVELOPMENT", domain: "SPATIAL_UNION_MEASUREMENT",
    objective: "Implement transform(input) for an array of up to 12 axis-aligned rectangles [x1,y1,x2,y2]. Coordinates are integers -8..8. Either coordinate order is allowed: normalize each axis independently. Return exact area of their UNION; overlap counts once, zero-width/height rectangles contribute zero, touching edges do not create area. Empty input has area 0." + suffix,
    publicCases: [{ input: [[0, 0, 3, 2], [2, 0, 5, 2]], expected: 10 },
      { input: [[2, 2, 0, 0], [1, 1, 1, 5]], expected: 4 }],
    privateCases: rectangleInputs.map(input => ({ input, expected: rectangleArea(input) })) },
  { id: "MAXIMUM-INTERVAL-REWARD", tier: "VALIDATION", domain: "COMBINATORIAL_SCHEDULING",
    objective: "Implement transform(input) for an array of up to 18 jobs {start,end,reward}, with integer 0<=start<end<=40 and integer 0<=reward<=40. Choose any subset of pairwise non-overlapping half-open intervals [start,end) to maximize total reward. Return only the maximum integer reward, 0 for empty input. End exactly equal to the next start is compatible. Arrival order is arbitrary; duplicated jobs remain competing alternatives, not free extra reward. Greedy earliest finish or largest reward alone is not the optimization criterion." + suffix,
    publicCases: [{ input: [{ start: 0, end: 4, reward: 7 }, { start: 0, end: 2, reward: 4 }, { start: 2, end: 4, reward: 4 }], expected: 8 },
      { input: [{ start: 1, end: 3, reward: 2 }, { start: 3, end: 5, reward: 6 }], expected: 8 }],
    privateCases: intervalInputs.map(input => ({ input, expected: intervalReward(input) })) },
  { id: "FINITE-LANGUAGE-DISTINCTION", tier: "VALIDATION", domain: "AUTOMATA_EQUIVALENCE_COUNTEREXAMPLE",
    objective: "Implement transform(input) for {left,right}, two complete deterministic finite automata over letters a,b. Each automaton has 1..4 states indexed from 0, starts in state 0, transitions is an array of [nextOnA,nextOnB] state indices, and accepting is an array of accepting state indices. Return the shortest word accepted by exactly ONE machine, breaking equal-length ties lexicographically with a before b; the empty word is ''. If their languages are identical return null. Unreachable states and cycles are valid. Do not impose a smaller arbitrary search bound." + suffix,
    publicCases: [{ input: { left: { transitions: [[1, 0], [1, 1]], accepting: [1] }, right: acceptsNone }, expected: "a" },
      { input: { left: acceptsAll, right: acceptsAll }, expected: null }],
    privateCases: automatonInputs.map(input => ({ input, expected: distinguishingWord(input) })) },
];

export function v3NativeReasoningTasks(): RepresentationTask[] {
  return V3_NATIVE_REASONING_TASKS.flatMap(task => [1, 2].map(repeat => ({ ...task, id: `${task.id}-REPEAT-${repeat}` })));
}

/** Match public policy/guidance, not hidden chain-of-thought. Wire settings alone do not prove reasoning efficacy. */
export function v3NativeWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown; publicAdmissionPolicyId?: unknown; legacyLineApplicabilityPresent?: boolean;
}[]): boolean {
  v3NativeReasoningConfiguration(variant); // Unknown arms fail closed.
  return controls.length > 0 && controls.every(control => control.publicAdmissionPolicyId === V3_NATIVE_REASONING_EPOCH.admissionPolicyId
    && control.legacyLineApplicabilityPresent === false && typeof control.initialCandidateState === "boolean"
    && (control.initialCandidateState ? control.originalBudgetPresented === true
      && control.originalBudgetVersion === "nyx-original-state-quality-budget/2"
      && control.originalBudgetPolicyId === V3_NATIVE_REASONING_EPOCH.admissionPolicyId
      : control.originalBudgetPresented === false && control.originalBudgetVersion === null && control.originalBudgetPolicyId === null));
}
