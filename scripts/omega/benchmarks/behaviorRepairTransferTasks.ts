import type { RepresentationTask } from "./sourceRepresentationTasks";

export function behaviorRepairTransferConfiguration(variant: string) {
  if (!["QUALITY_SITES_CONTROL", "BINDING_USES"].includes(variant)) throw Error("unknown_behavior_repair_arm");
  return { providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const, comparisonInferencePolicy: "CONSTRAINED_JSON" as const,
    qualityRepairGuidance: "STRUCTURE_SITES" as const, structuralBudgetGuidance: "PUBLIC_ORIGINAL_STATE" as const,
    ...(variant === "BINDING_USES" ? { behaviorRepairGuidance: "BINDING_USES" as const } : {}) };
}

export function behaviorRepairWireControlVerified(variant: string, controls: readonly {
  qualityRepairPhase?: boolean; bindingUsesPresented?: boolean;
}[]): boolean {
  behaviorRepairTransferConfiguration(variant);
  return controls.length > 0 && controls.every(control => typeof control.qualityRepairPhase === "boolean"
    && control.bindingUsesPresented === (variant === "BINDING_USES" && control.qualityRepairPhase));
}

// Fresh before live inference, now evaluator-owned literal expectations. Neither
// these answers nor test-only references are supplied as cognition evidence.
export const BEHAVIOR_REPAIR_TRANSFER_TASKS: readonly RepresentationTask[] = [
  { id:"ORDERED-RUN-FOLD",tier:"DEVELOPMENT",domain:"CANONICAL_DATA_REDUCTION",
    objective:"Implement transform(input), where input is an array of [symbol,count] pairs. symbol is an arbitrary string and count is a nonnegative safe integer; sums are safe. Drop zero-count rows. Merge adjacent equal symbols AFTER dropping zero rows, summing counts. Do not merge nonadjacent equal symbols. Return detached new pairs in the surviving order; empty input returns []. Preserve inputs. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:[["a",2],["a",3],["b",1]],expected:[["a",5],["b",1]]},
      {input:[["a",2],["b",0],["a",1]],expected:[["a",3]]}],
    privateCases:[{input:[],expected:[]},{input:[["x",0],["y",0]],expected:[]},
      {input:[["",1],["",2]],expected:[["",3]]},
      {input:[["a",1],["b",1],["a",2]],expected:[["a",1],["b",1],["a",2]]},
      {input:[["__proto__",3],["__proto__",2],["😀",4]],expected:[["__proto__",5],["😀",4]]},
      {input:[["a",0],["b",1],["c",0],["b",2],["d",1],["d",0]],expected:[["b",3],["d",1]]}]},
  {id:"ORDER-PRESERVING-INTERLEAVE",tier:"DEVELOPMENT",domain:"DYNAMIC_PROGRAMMING_TEXT",
    objective:"Implement transform(input) for {left,right,merged}, strings of at most 60 UTF-16 code units each. Return whether merged can be formed by interleaving ALL code units of left and right while preserving the order within each original string. Repeated characters require considering competing paths, not a greedy choice. Empty strings are valid. Operate on UTF-16 code units without normalization. Preserve input and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{left:"ab",right:"cd",merged:"acbd"},expected:true},
      {input:{left:"ab",right:"cd",merged:"adbc"},expected:false}],
    privateCases:[{input:{left:"",right:"",merged:""},expected:true},
      {input:{left:"",right:"abc",merged:"abc"},expected:true},
      {input:{left:"ab",right:"",merged:"ba"},expected:false},
      {input:{left:"aa",right:"aa",merged:"aaaa"},expected:true},
      {input:{left:"aabcc",right:"dbbca",merged:"aadbbcbcac"},expected:true},
      {input:{left:"aabcc",right:"dbbca",merged:"aadbbbaccc"},expected:false},
      {input:{left:"😀",right:"x",merged:"\ud83dx\ude00"},expected:true},
      {input:{left:"a",right:"b",merged:"a"},expected:false}]},
  {id:"HISTOGRAM-MAX-RECTANGLE",tier:"VALIDATION",domain:"MONOTONE_STATE_OPTIMIZATION",
    objective:"Implement transform(input), an array of at most 100 nonnegative safe integer histogram heights of unit width. Return the maximum area of a rectangle spanning contiguous bars, with height no greater than any spanned bar. Areas are safe integers. Empty input returns 0. Equal heights, zeros, increasing and decreasing sequences are valid. Preserve input. Keep the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:[2,1,5,6,2,3],expected:10},{input:[2,4],expected:4}],
    privateCases:[{input:[],expected:0},{input:[0,0],expected:0},{input:[7],expected:7},
      {input:[3,3,3],expected:9},{input:[1,2,3,4],expected:6},{input:[4,3,2,1],expected:6},
      {input:[5,0,5],expected:5},{input:[6,2,5,4,5,1,6],expected:12}]},
  {id:"DEPENDENCY-CRITICAL-FINISH",tier:"VALIDATION",domain:"DEPENDENCY_GRAPH_SCHEDULING",
    objective:"Implement transform(input) for {durations,edges}. durations has at most 30 nonnegative safe integer task durations. Each directed [from,to] edge means to starts only after from finishes. Indices are valid; repeated edges, self-edges and disconnected graphs are permitted. Tasks without prerequisites start at 0; tasks otherwise start at the maximum finish time of all prerequisites. Return the latest finish time if the graph is acyclic, 0 for no tasks, and null if ANY component has a cycle. Repeated edges do not change the required answer. Sums are safe integers. Preserve all inputs and return the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{durations:[2,3,4],edges:[[0,2],[1,2]]},expected:7},
      {input:{durations:[2,3],edges:[[0,1],[1,0]]},expected:null}],
    privateCases:[{input:{durations:[],edges:[]},expected:0},{input:{durations:[0,4,2],edges:[]},expected:4},
      {input:{durations:[1,4,3,2],edges:[[0,1],[0,2],[1,3],[2,3]]},expected:7},
      {input:{durations:[3,4],edges:[[0,1],[0,1]]},expected:7},
      {input:{durations:[2],edges:[[0,0]]},expected:null},
      {input:{durations:[2,3,4],edges:[[1,2],[2,1]]},expected:null},
      {input:{durations:[0,0,5],edges:[[0,1],[1,2]]},expected:5},
      {input:{durations:[2,6,3,7],edges:[[2,0],[0,3]]},expected:12}]},
];
