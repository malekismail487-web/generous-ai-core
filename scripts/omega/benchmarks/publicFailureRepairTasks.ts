import type { RepresentationTask } from "./sourceRepresentationTasks";

export const PUBLIC_FAILURE_REPAIR_EPOCH = Object.freeze({
  version:"nyx-public-exception-class-repair/1", admissionPolicyId:"omega-public-static-candidate/3" as const,
  uniqueTasks:4, predeclaredRepeats:2, maxPhysicalCalls:32,
  scope:"FRESH_BOUNDED_EXISTING_FUNCTION_DEBUGGING_NOT_EXTERNAL_BENCHMARK_OR_FIRST_ATTEMPT_IMPLEMENTATION",
  disclosure:"Same-author synthetic faulty repositories; initial algorithms are supplied, not NYX-generated. Public examples and withheld inputs are visible; private expected outputs are not.",
  efficacyCriterion:"BOTH_REPEATS_WIN_IN_TWO_DISTINCT_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_NO_PAIRED_ACCEPTANCE_REGRESSION",
});
export interface PublicFailureRepairTask extends RepresentationTask { readonly initialSource:string }

/** Both arms omit verifier implementation, so adding a diagnostic helper cannot
 * covertly add source hints or a large context-compute advantage to treatment.
 * Omega still pins and executes that verifier; no execution permission changes.
 */
export function publicFailureContext<T extends {readonly relativePath:string}>(files:readonly T[]):readonly T[] {
  const visible=["src/transform.mjs","src/examples.mjs","src/inputs.mjs"];
  const result=files.filter(file=>visible.includes(file.relativePath));
  if(result.length!==3||new Set(result.map(file=>file.relativePath)).size!==3)throw Error("public_failure_context_invalid");
  return result;
}

export function publicFailureRepairConfiguration(variant:string) {
  if(!["OPAQUE_EXCEPTION_CONTROL","PUBLIC_EXCEPTION_CLASS"].includes(variant))throw Error("unknown_public_failure_arm");
  return {providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl:"SUPER_HOSTED_NATIVE" as const, comparisonInferencePolicy:"CONSTRAINED_JSON" as const,
    qualityRepairGuidance:"STRUCTURE_SITES" as const, structuralBudgetGuidance:"PUBLIC_ORIGINAL_STATE" as const};
}

/** Public diagnostic presence is observed, not inferred from an environment switch. */
export function publicFailureRepairWireVerified(variant:string, controls:readonly {
  publicExceptionClassCount?:number; privateExceptionClassCount?:number; publicAdmissionPolicyId?:unknown;
  contextPaths?:readonly string[];
}[]):boolean {
  publicFailureRepairConfiguration(variant);
  return controls.length>0 && controls.every(control=>Number.isSafeInteger(control.publicExceptionClassCount)
    &&control.publicExceptionClassCount!>=0&&control.publicExceptionClassCount!<=16
    &&control.privateExceptionClassCount===0&&control.publicAdmissionPolicyId===PUBLIC_FAILURE_REPAIR_EPOCH.admissionPolicyId
    &&Array.isArray(control.contextPaths)&&control.contextPaths.slice().sort().join(",")==="src/examples.mjs,src/inputs.mjs,src/transform.mjs"
    &&(variant==="PUBLIC_EXCEPTION_CLASS"||control.publicExceptionClassCount===0))
    &&(variant!=="PUBLIC_EXCEPTION_CLASS"||controls[0].publicExceptionClassCount!>0);
}

// Frozen before live inference. No prior exposed task or task-specific repair is reused.
// Literal private answers are evaluator-owned and are never supplied in feedback.
export const PUBLIC_FAILURE_REPAIR_TASKS:readonly PublicFailureRepairTask[]=[
  {id:"EXACT-INTEGER-PRODUCT",tier:"DEVELOPMENT",domain:"ARBITRARY_PRECISION_ARITHMETIC",
    objective:"Repair transform(input) for {left,right}, signed base-10 integer strings of up to 80 digits (optional leading minus, leading zeros allowed). Return the exact product as a canonical decimal string, with no precision loss, no leading zeros and zero represented as 0, not -0. Preserve input and ESM export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    initialSource:'export function transform(input) {\n  return String(BigInt(input.left) * Number(input.right));\n}\n',
    publicCases:[{input:{left:"12",right:"7"},expected:"84"},{input:{left:"-4",right:"3"},expected:"-12"}],
    privateCases:[{input:{left:"0",right:"-9"},expected:"0"},{input:{left:"-0002",right:"0003"},expected:"-6"},
      {input:{left:"99999999999999999999",right:"9"},expected:"899999999999999999991"},
      {input:{left:"-11",right:"-13"},expected:"143"},{input:{left:"1"+"0".repeat(79),right:"1"+"0".repeat(79)},expected:"1"+"0".repeat(158)}]},
  {id:"OVERLAPPING-LITERAL-COUNT",tier:"DEVELOPMENT",domain:"LITERAL_TEXT_SEARCH",
    objective:"Repair transform(input) for {text,needle}, arbitrary JavaScript strings of at most 200 UTF-16 code units. Count all literal occurrences of needle in text, including overlaps. Treat regex punctuation as ordinary text; do not normalize Unicode. Empty needle returns 0. Preserve input and ESM export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    initialSource:'export function transform(input) {\n  return [...input.text.matchAll(new RegExp(input.needle, "g"))].length;\n}\n',
    publicCases:[{input:{text:"a[b[c",needle:"["},expected:2},{input:{text:"aaaa",needle:"aa"},expected:3}],
    privateCases:[{input:{text:"abc",needle:""},expected:0},{input:{text:"",needle:"x"},expected:0},
      {input:{text:"a.b...",needle:"."},expected:4},{input:{text:"abababa",needle:"aba"},expected:3},
      {input:{text:"😀😀",needle:"😀"},expected:2},{input:{text:"ab",needle:"abc"},expected:0},
      {input:{text:"\\\\x\\",needle:"\\"},expected:3},{input:{text:"AaA",needle:"a"},expected:1}]},
  {id:"CLOSED-INTEGER-RANGE",tier:"VALIDATION",domain:"BOUNDED_DISCRETE_ENUMERATION",
    objective:"Repair transform(input) for {start,end}, safe integers between -50 and 50. Return all integers from start through end inclusive in increasing order. If end<start, return an empty array. Preserve input and ESM export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    initialSource:'export function transform(input) {\n  return new Array(input.end - input.start + 1).fill(0).map((_, index) => input.start + index);\n}\n',
    publicCases:[{input:{start:5,end:2},expected:[]},{input:{start:-1,end:2},expected:[-1,0,1,2]}],
    privateCases:[{input:{start:0,end:0},expected:[0]},{input:{start:-5,end:-3},expected:[-5,-4,-3]},
      {input:{start:1,end:0},expected:[]},{input:{start:50,end:-50},expected:[]},
      {input:{start:-50,end:50},expected:Array.from({length:101},(_,index)=>index-50)}]},
  {id:"PRIORITY-STABLE-ROW-IDS",tier:"VALIDATION",domain:"ORDERED_RECORD_SCHEDULING",
    objective:"Repair transform(input) for {order,rows}. order is an array of unique arbitrary string keys; rows is an array of {key,id} string records. Return row ids sorted by each key's index in order, with all unknown keys AFTER known keys. Preserve original row order within equal known ranks and among all unknown keys. Empty arrays are valid; keys can be __proto__ or empty strings. Preserve all inputs and ESM export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    initialSource:'export function transform(input) {\n  const rank = new Map(input.order.map((key, index) => [key, index]));\n  return input.rows.slice().sort((a, b) => ranking.get(a.key) - ranking.get(b.key)).map(row => row.id);\n}\n',
    publicCases:[{input:{order:["a","b"],rows:[{key:"b",id:"B"},{key:"a",id:"A"}]},expected:["A","B"]},
      {input:{order:["a"],rows:[{key:"unknown",id:"U"},{key:"a",id:"A"}]},expected:["A","U"]}],
    privateCases:[{input:{order:[],rows:[]},expected:[]},{input:{order:[],rows:[{key:"x",id:"1"},{key:"y",id:"2"}]},expected:["1","2"]},
      {input:{order:[""],rows:[{key:"",id:"1"},{key:"",id:"2"}]},expected:["1","2"]},
      {input:{order:["__proto__","z"],rows:[{key:"z",id:"Z"},{key:"__proto__",id:"P"}]},expected:["P","Z"]},
      {input:{order:["b","a"],rows:[{key:"u",id:"U"},{key:"a",id:"A1"},{key:"b",id:"B1"},{key:"a",id:"A2"},{key:"v",id:"V"},{key:"b",id:"B2"}]},expected:["B1","B2","A1","A2","U","V"]}]},
];

export function publicFailureRepairTasks():readonly PublicFailureRepairTask[] {
  return PUBLIC_FAILURE_REPAIR_TASKS.flatMap(task=>[1,2].map(repeat=>({...task,id:`${task.id}-REPEAT-${repeat}`})));
}
