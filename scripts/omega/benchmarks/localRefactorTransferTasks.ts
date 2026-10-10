import type { RepresentationTask } from "./sourceRepresentationTasks";

export function localRefactorTransferConfiguration(variant: string) {
  if (!["QUALITY_SITES_CONTROL", "GUARDED_REFACTOR_PROPOSALS"].includes(variant)) throw Error("unknown_local_refactor_arm");
  return { providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const, comparisonInferencePolicy: "CONSTRAINED_JSON" as const,
    qualityRepairGuidance: "STRUCTURE_SITES" as const, structuralBudgetGuidance: "PUBLIC_ORIGINAL_STATE" as const,
    ...(variant === "GUARDED_REFACTOR_PROPOSALS" ? { localRefactorGuidance: "GUARDED_PROPOSALS" as const } : {}) };
}

export function localRefactorWireControlVerified(variant: string, controls: readonly {
  qualityRepairPhase?: boolean; localProposalsPresented?: boolean; localProposalCount?: number;
}[]): boolean {
  localRefactorTransferConfiguration(variant);
  return controls.length > 0 && controls.every(control => typeof control.qualityRepairPhase === "boolean"
    && control.localProposalsPresented === (variant === "GUARDED_REFACTOR_PROPOSALS" && control.qualityRepairPhase)
    && Number.isSafeInteger(control.localProposalCount) && control.localProposalCount! >= 0
    && (control.localProposalsPresented || control.localProposalCount === 0));
}

// Frozen before first inference. Literal private expectations remain evaluator-only.
// These are new tasks, not repaired variants of the exposed binding-feedback corpus.
export const LOCAL_REFACTOR_TRANSFER_TASKS: readonly RepresentationTask[] = [
  { id:"STABLE-KEYED-BAG-DIFFERENCE",tier:"DEVELOPMENT",domain:"MULTISET_RECONCILIATION",
    objective:"Implement transform(input) for {left,right}. left is an array of {key,value} records with arbitrary string keys and JSON values; right is an array of string keys. For each key, cancel as many of its EARLIEST left occurrences as there are right occurrences. Return the uncancelled left records in original order, with deeply detached new records/values. Unmatched right keys do nothing. Empty arrays are valid. Preserve inputs and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{left:[{key:"a",value:1},{key:"b",value:2},{key:"a",value:3}],right:["a"]},expected:[{key:"b",value:2},{key:"a",value:3}]},
      {input:{left:[{key:"x",value:{n:[1]}}],right:[]},expected:[{key:"x",value:{n:[1]}}]}],
    privateCases:[{input:{left:[],right:["z"]},expected:[]},
      {input:{left:[{key:"a",value:1},{key:"a",value:2},{key:"b",value:3}],right:["a","a","a"]},expected:[{key:"b",value:3}]},
      {input:{left:[{key:"__proto__",value:1},{key:"constructor",value:2},{key:"__proto__",value:3}],right:["__proto__"]},expected:[{key:"constructor",value:2},{key:"__proto__",value:3}]},
      {input:{left:[{key:"",value:null},{key:"😀",value:[{x:true}]},{key:"",value:false}],right:["","missing"]},expected:[{key:"😀",value:[{x:true}]},{key:"",value:false}]},
      {input:{left:[{key:"b",value:0},{key:"a",value:1},{key:"b",value:2},{key:"a",value:3}],right:["a","b"]},expected:[{key:"b",value:2},{key:"a",value:3}]}]},
  {id:"COIN-COMBINATION-COUNT",tier:"DEVELOPMENT",domain:"DISCRETE_COMBINATORICS",
    objective:"Implement transform(input) for {amount,coins}. amount is a nonnegative integer at most 100; coins contains distinct positive integers. Return the number of unordered multisets of these coin denominations whose sum is amount, with unlimited copies of each denomination. Ordering the same coins differently does not create a new combination. All counts are safe integers. amount zero has exactly one empty combination; positive amount with no coins has zero. Coins may be unsorted or larger than amount. Preserve inputs and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{amount:5,coins:[1,2,5]},expected:4},{input:{amount:3,coins:[2]},expected:0}],
    privateCases:[{input:{amount:0,coins:[]},expected:1},{input:{amount:8,coins:[]},expected:0},
      {input:{amount:6,coins:[4,1,3]},expected:4},{input:{amount:4,coins:[1,2]},expected:3},
      {input:{amount:10,coins:[2,5,20]},expected:2},{input:{amount:7,coins:[7,1]},expected:2},
      {input:{amount:100,coins:[25,10,5,1]},expected:242}]},
  {id:"MEDIAN-ABSOLUTE-DEVIATION",tier:"VALIDATION",domain:"ROBUST_NUMERICAL_STATISTICS",
    objective:"Implement transform(input) for an array of at most 100 finite numbers. Return {median,mad}, where median is the middle sorted value for odd length or the arithmetic mean of the two middle sorted values for even length, and mad is the median of the absolute deviations from that median, without any scaling factor. Empty input returns null. Numeric sorting is required; repeated, negative and fractional values are valid. Preserve input and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:[1,2,100],expected:{median:2,mad:1}},{input:[1,3,5,7],expected:{median:4,mad:2}}],
    privateCases:[{input:[],expected:null},{input:[-7],expected:{median:-7,mad:0}},
      {input:[10,2,1],expected:{median:2,mad:1}},{input:[-5,-1,-3],expected:{median:-3,mad:2}},
      {input:[9,9,9,9],expected:{median:9,mad:0}},{input:[0,100],expected:{median:50,mad:50}},
      {input:[0.5,1.5,2.5,3.5],expected:{median:2,mad:1}}]},
  {id:"DIRECTED-HOP-DISTANCES",tier:"VALIDATION",domain:"CYCLIC_GRAPH_TRAVERSAL",
    objective:"Implement transform(input) for {adjacency,start}. adjacency is a square 0/1 directed adjacency matrix of at most 30 nodes, and start is a valid node index if nonempty. Return the minimum number of directed edges from start to every node in index order; start has distance zero and unreachable nodes are null. Cycles, self edges, disconnected nodes and edges directed back toward start are valid. Empty adjacency returns []. Preserve input and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{adjacency:[[0,1,0],[0,0,1],[0,0,0]],start:0},expected:[0,1,2]},
      {input:{adjacency:[[0,1],[0,0]],start:1},expected:[null,0]}],
    privateCases:[{input:{adjacency:[],start:0},expected:[]},{input:{adjacency:[[1]],start:0},expected:[0]},
      {input:{adjacency:[[0,1,1,0],[0,0,0,1],[0,1,0,0],[1,0,0,0]],start:0},expected:[0,1,1,2]},
      {input:{adjacency:[[0,0,0],[1,0,1],[0,1,0]],start:2},expected:[2,1,0]},
      {input:{adjacency:[[0,1,0,0],[0,0,0,0],[0,0,1,1],[0,0,0,0]],start:0},expected:[0,1,null,null]},
      {input:{adjacency:[[0,1,1,0],[0,0,1,0],[0,0,0,1],[0,0,0,0]],start:0},expected:[0,1,1,2]}]},
];
