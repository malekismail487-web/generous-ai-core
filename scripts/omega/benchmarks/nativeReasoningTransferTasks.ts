import type { RepresentationTask } from "./sourceRepresentationTasks";

/** Evaluation configuration only; the existing provider/parser/authority own execution. */
export function nativeReasoningTransferConfiguration(variant: string) {
  if (!["NATIVE_NONE", "NATIVE_BOUNDED_REASONING"].includes(variant)) throw Error("unknown_native_transfer_arm");
  return { providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const,
    comparisonInferencePolicy: variant === "NATIVE_NONE" ? "CONSTRAINED_JSON" as const : "REASONING_JSON" as const,
    ...(variant === "NATIVE_BOUNDED_REASONING" ? { comparisonReasoningBudgetTokens: 2048 } : {}) };
}

// Frozen before live inference, with literal evaluator-only expectations. No
// reserved benchmark content or task-specific solution enters the cognition.
export const NATIVE_REASONING_TRANSFER_TASKS: readonly RepresentationTask[] = [
  { id: "WEIGHTED-UNICODE-EDIT", tier: "DEVELOPMENT", domain: "OPTIMAL_SEQUENCE_ALIGNMENT",
    objective: "Implement transform(input) for {from,to,insertCost,deleteCost,replaceCost}. Strings contain Unicode code points, not UTF-16 units. Costs are nonnegative integers. Return the minimum total cost of changing from to to by inserting, deleting or replacing a single code point; matching equal points costs zero. Insert and delete costs may differ. Replacement may cost more than deletion plus insertion. Empty strings are valid. Preserve input. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: { from: "a", to: "b", insertCost: 3, deleteCost: 2, replaceCost: 10 }, expected: 5 },
      { input: { from: "kitten", to: "sitting", insertCost: 1, deleteCost: 1, replaceCost: 1 }, expected: 3 },
    ],
    privateCases: [
      { input: { from: "", to: "😀α", insertCost: 2, deleteCost: 7, replaceCost: 4 }, expected: 4 },
      { input: { from: "😀α", to: "", insertCost: 2, deleteCost: 7, replaceCost: 4 }, expected: 14 },
      { input: { from: "😀a", to: "😀b", insertCost: 5, deleteCost: 3, replaceCost: 2 }, expected: 2 },
      { input: { from: "ab", to: "ba", insertCost: 1, deleteCost: 1, replaceCost: 5 }, expected: 2 },
      { input: { from: "abc", to: "z", insertCost: 0, deleteCost: 0, replaceCost: 9 }, expected: 0 },
      { input: { from: "é", to: "é", insertCost: 2, deleteCost: 3, replaceCost: 1 }, expected: 3 },
      { input: { from: "", to: "", insertCost: 0, deleteCost: 0, replaceCost: 0 }, expected: 0 },
    ] },
  { id: "EXACT-RATIONAL-AGGREGATE", tier: "DEVELOPMENT", domain: "SYMBOLIC_ARITHMETIC",
    objective: "Implement transform(input) for an array of [numerator,denominator] signed integer decimal strings. Denominators are nonzero and may be negative. Return [numerator,denominator] decimal strings for the EXACT sum, reduced by greatest common divisor; denominator must be positive, each string has no redundant sign or leading zeroes, and zero is ['0','1']. Empty input sums to zero. Values may have 100 digits, so converting them to Number is not exact. Preserve input and return new output. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: [["1", "2"], ["1", "3"]], expected: ["5", "6"] },
      { input: [["2", "-4"], ["1", "2"]], expected: ["0", "1"] },
    ],
    privateCases: [
      { input: [], expected: ["0", "1"] },
      { input: [["-2", "-6"]], expected: ["1", "3"] },
      { input: [["1", "6"], ["1", "3"], ["-1", "2"]], expected: ["0", "1"] },
      { input: [["999999999999999999999999999999", "3"], ["1", "3"]], expected: ["1000000000000000000000000000000", "3"] },
      { input: [["-1", "2"], ["1", "6"]], expected: ["-1", "3"] },
      { input: [["0006", "0008"], ["-1", "4"]], expected: ["1", "2"] },
      { input: [["0", "-999"], ["-0", "7"]], expected: ["0", "1"] },
    ] },
  { id: "VERSIONED-REGISTER-RECONCILIATION", tier: "VALIDATION", domain: "CONCURRENT_STATE_REDUCTION",
    objective: "Implement transform(input) for an array of {key,version,value} events. Keys are arbitrary strings, including __proto__; versions are nonnegative safe integers, and value is a string or null (a deletion tombstone). Keep the highest version per key regardless of arrival order. A repeated event at the CURRENT highest version with an identical value is harmless; a different value at that version aborts and returns {error: zero-based event index}. Older events are ignored even if their values differ. Otherwise return {rows: [key,version,value] entries sorted by JavaScript string comparison}; include tombstones. Preserve inputs, do not alias output, and retain the ESM export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: [{ key: "x", version: 2, value: "new" }, { key: "x", version: 1, value: "old" }],
        expected: { rows: [["x", 2, "new"]] } },
      { input: [{ key: "x", version: 2, value: "a" }, { key: "x", version: 2, value: "b" }], expected: { error: 1 } },
    ],
    privateCases: [
      { input: [], expected: { rows: [] } },
      { input: [{ key: "__proto__", version: 0, value: "data" }], expected: { rows: [["__proto__", 0, "data"]] } },
      { input: [{ key: "b", version: 1, value: "b" }, { key: "a", version: 3, value: null }],
        expected: { rows: [["a", 3, null], ["b", 1, "b"]] } },
      { input: [{ key: "x", version: 1, value: "same" }, { key: "x", version: 1, value: "same" }],
        expected: { rows: [["x", 1, "same"]] } },
      { input: [{ key: "x", version: 3, value: null }, { key: "x", version: 1, value: "a" }, { key: "x", version: 1, value: "b" }],
        expected: { rows: [["x", 3, null]] } },
      { input: [{ key: "x", version: 0, value: null }, { key: "y", version: 0, value: "y" }, { key: "x", version: 0, value: "" }],
        expected: { error: 2 } },
    ] },
  { id: "BOUNDED-BOOLEAN-MODELS", tier: "VALIDATION", domain: "FINITE_CONSTRAINT_SOLVING",
    objective: "Implement transform(input) for {variables,clauses}. variables is an integer 0 through 8. Each clause is an array of signed nonzero variable indices with absolute value at most variables; positive means that variable is true and negative means false. A model satisfies every clause, and a clause is satisfied if ANY of its literals is true. Return {models: all satisfying assignments as bit strings of length variables, in lexicographic order with 0 before 1}; position i represents variable i+1. Repeated literals and tautologies are valid. No clauses imposes no restriction; an empty clause is unsatisfiable. For zero variables, the single empty assignment is represented by ''. Preserve input, create new output, and retain the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: { variables: 2, clauses: [[1, 2], [-1, 2]] }, expected: { models: ["01", "11"] } },
      { input: { variables: 1, clauses: [[1], [-1]] }, expected: { models: [] } },
    ],
    privateCases: [
      { input: { variables: 0, clauses: [] }, expected: { models: [""] } },
      { input: { variables: 0, clauses: [[]] }, expected: { models: [] } },
      { input: { variables: 2, clauses: [] }, expected: { models: ["00", "01", "10", "11"] } },
      { input: { variables: 2, clauses: [[1, -1], [2, 2]] }, expected: { models: ["01", "11"] } },
      { input: { variables: 3, clauses: [[-1, 2], [-2, 3], [1]] }, expected: { models: ["111"] } },
      { input: { variables: 3, clauses: [[1, 2], [-1, -2], [3]] }, expected: { models: ["011", "101"] } },
      { input: { variables: 8, clauses: [[1], [-2], [3], [-4], [5], [-6], [7], [-8]] }, expected: { models: ["10101010"] } },
    ] },
];
