import type { RepresentationTask } from "./sourceRepresentationTasks";

/** Both arms retain identical post-rejection feedback, native inference and grammar. */
export function originalBudgetTransferConfiguration(variant: string) {
  if (!["STRUCTURE_SITES_CONTROL", "ORIGINAL_BUDGET"].includes(variant)) throw Error("unknown_original_budget_arm");
  return { providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const,
    comparisonInferencePolicy: "CONSTRAINED_JSON" as const,
    qualityRepairGuidance: "STRUCTURE_SITES" as const,
    ...(variant === "ORIGINAL_BUDGET" ? { structuralBudgetGuidance: "PUBLIC_ORIGINAL_STATE" as const } : {}) };
}

// Frozen before inference. Literal expectations and reference implementations
// are evaluator-owned, not available evidence or feedback to NYX. These are
// development transfer tasks, not external benchmark scores or replication.
export const ORIGINAL_BUDGET_TRANSFER_TASKS: readonly RepresentationTask[] = [
  { id: "STABLE-FULL-OUTER-JOIN", tier: "DEVELOPMENT", domain: "RELATIONAL_DATA_PROCESSING",
    objective: "Implement transform(input) for {left,right}, each an array of [key,value] string pairs. Return [key,leftValueOrNull,rightValueOrNull] rows for a FULL OUTER equality join. For each left row in original left order emit every matching right row in original right order (including the Cartesian product of duplicates); if none matches emit null on the right. After all left rows, emit unmatched right rows in original right order with null on the left. Keys are arbitrary strings, including __proto__; empty values are distinct from missing nulls. Preserve all input rows and return detached new output. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: {left:[["a","L"],["b","B"]],right:[["a","R"],["c","C"]]},
        expected: [["a","L","R"],["b","B",null],["c",null,"C"]] },
      { input: {left:[["x","1"],["x","2"]],right:[["x","3"],["x","4"]]},
        expected: [["x","1","3"],["x","1","4"],["x","2","3"],["x","2","4"]] },
    ],
    privateCases: [
      { input: {left:[],right:[]}, expected: [] },
      { input: {left:[],right:[["a",""],["a","v"]]}, expected: [["a",null,""],["a",null,"v"]] },
      { input: {left:[["a",""],["a","v"]],right:[]}, expected: [["a","",null],["a","v",null]] },
      { input: {left:[["__proto__","safe"]],right:[["__proto__",""]]}, expected: [["__proto__","safe",""]] },
      { input: {left:[["b","L1"],["a","L2"]],right:[["a","R1"],["b","R2"],["b","R3"]]},
        expected: [["b","L1","R2"],["b","L1","R3"],["a","L2","R1"]] },
      { input: {left:[["😀","left"]],right:[["é","one"],["é","two"],["é","three"]]},
        expected: [["😀","left",null],["é",null,"one"],["é",null,"two"],["é",null,"three"]] },
    ] },
  { id: "UTF16-LENGTH-FRAMES", tier: "DEVELOPMENT", domain: "STREAM_FRAMING_VALIDATION",
    objective: "Implement transform(input) for a string of concatenated frames <length>:<body>,. length is a canonical nonnegative decimal safe integer (no leading zeros except 0); body contains exactly length UTF-16 code units and may contain any characters, including commas, colons, line breaks or surrogate pairs. Every frame ends with a comma. Empty input returns {frames:[]}; zero-length frames are valid. On the FIRST malformed frame return {error: its zero-based start offset in UTF-16 code units}, discarding any prior frames. Reject noncanonical/unsafe lengths, truncated bodies, missing commas and trailing junk. Otherwise return {frames:[bodies in order]}. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: "1:a,2:bc,", expected: {frames:["a","bc"]} },
      { input: "1:a,02:bc,", expected: {error:4} },
    ],
    privateCases: [
      { input: "", expected: {frames:[]} },
      { input: "0:,0:,", expected: {frames:["",""]} },
      { input: "2:😀,", expected: {frames:["😀"]} },
      { input: "1:😀,", expected: {error:0} },
      { input: "3:,:\n,", expected: {frames:[",:\n"]} },
      { input: "1:a,0:", expected: {error:4} },
      { input: "1:a,x", expected: {error:4} },
      { input: "9007199254740992:a,", expected: {error:0} },
      { input: "2:a,", expected: {error:0} },
      { input: "+1:a,", expected: {error:0} },
    ] },
  { id: "EXACT-AFFINE-SKIP", tier: "VALIDATION", domain: "ALGEBRAIC_STATE_COMPOSITION",
    objective: "Implement transform(input) for {seed,a,c,modulus,steps}, all integer decimal strings. modulus is positive, steps is nonnegative; other values may be signed. Return the canonical nonnegative decimal string x_steps for x_0=seed modulo modulus, x_(k+1)=(a*x_k+c) modulo modulus. Values and steps may have 100 digits: preserve exactness, do not convert the arithmetic to Number, and skip ahead in logarithmic steps rather than iterating once per recurrence. steps=0 returns the normalized seed. Preserve input. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: {seed:"1",a:"2",c:"1",modulus:"100",steps:"3"}, expected: "15" },
      { input: {seed:"9",a:"1",c:"3",modulus:"7",steps:"2"}, expected: "1" },
    ],
    privateCases: [
      { input: {seed:"-1",a:"99",c:"10",modulus:"7",steps:"0"}, expected: "6" },
      { input: {seed:"87",a:"0",c:"5",modulus:"7",steps:"1000000000000000000000000000000"}, expected: "5" },
      { input: {seed:"0",a:"1",c:"1",modulus:"11",steps:"1000000000000000000000000000000"}, expected: "1" },
      { input: {seed:"2",a:"-1",c:"0",modulus:"13",steps:"999999999999999999999999999999"}, expected: "11" },
      { input: {seed:"-2",a:"-1",c:"0",modulus:"13",steps:"1000000000000000000000000000000"}, expected: "11" },
      { input: {seed:"1",a:"2",c:"0",modulus:"17",steps:"100"}, expected: "16" },
      { input: {seed:"999999999999999999999999999999",a:"-23",c:"-999",modulus:"1",steps:"888888888888888888888888888888"}, expected: "0" },
      { input: {seed:"999999999999999999999999999999",a:"1",c:"1",modulus:"1000000000000000000000000000001",steps:"2"}, expected: "0" },
    ] },
  { id: "WEIGHTED-INTERVAL-OPTIMUM", tier: "VALIDATION", domain: "COMBINATORIAL_OPTIMIZATION",
    objective: "Implement transform(input) for an array of {start,end,weight}, with integer start<end and nonnegative integer weight. Return the maximum sum of weights of a nonoverlapping subset of HALF-OPEN intervals [start,end). Touching endpoints are compatible. Input order is arbitrary. Duplicate overlapping intervals are separate choices, not jointly compatible. Empty input returns 0. All sums are safe integers. Preserve inputs and do not sort borrowed arrays in place. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases: [
      { input: [{start:0,end:4,weight:7},{start:0,end:2,weight:4},{start:2,end:4,weight:4}], expected: 8 },
      { input: [{start:2,end:3,weight:5},{start:0,end:1,weight:4}], expected: 9 },
    ],
    privateCases: [
      { input: [], expected: 0 },
      { input: [{start:0,end:2,weight:3},{start:0,end:2,weight:9}], expected: 9 },
      { input: [{start:-3,end:-1,weight:7},{start:-1,end:0,weight:2},{start:-3,end:0,weight:8}], expected: 9 },
      { input: [{start:1,end:2,weight:0},{start:0,end:1,weight:0}], expected: 0 },
      { input: [{start:0,end:3,weight:10},{start:1,end:2,weight:11},{start:2,end:4,weight:7},{start:4,end:5,weight:2}], expected: 20 },
      { input: [{start:5,end:7,weight:4},{start:1,end:4,weight:5},{start:4,end:6,weight:8},{start:0,end:1,weight:3}], expected: 16 },
    ] },
];
