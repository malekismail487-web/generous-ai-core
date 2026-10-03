import type { RepresentationTask } from "./sourceRepresentationTasks";

// Frozen before inference. Private expected outputs never enter cognition or repair feedback.
// Same-session authorship, not independent replication. Old failed tasks are not reused here.
export const MEASURED_QUALITY_TRANSFER_TASKS: readonly RepresentationTask[] = [
  { id: "KEYED-MEAN-RECONCILIATION", tier: "DEVELOPMENT", domain: "DATA_RECONCILIATION",
    objective: "Implement transform(input) for records {key,value}, where key is a string and value is finite. Return new {key,mean} records sorted by JavaScript lexicographic string comparison. Mean is the arithmetic mean of all values with the exact same key, including duplicates. Preserve keys such as __proto__, constructor and Unicode. Empty input returns []. Do not mutate or alias input or records. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{ input: [{key:"b",value:8},{key:"a",value:2},{key:"b",value:4}], expected:[{key:"a",mean:2},{key:"b",mean:6}] },
      {input:[],expected:[]}],
    privateCases: [{input:[{key:"__proto__",value:3},{key:"constructor",value:-2},{key:"__proto__",value:1}],expected:[{key:"__proto__",mean:2},{key:"constructor",mean:-2}]},
      {input:[{key:"",value:0},{key:"",value:0}],expected:[{key:"",mean:0}]},
      {input:[{key:"雨",value:1},{key:"a",value:2},{key:"雨",value:3}],expected:[{key:"a",mean:2},{key:"雨",mean:2}]},
      {input:[{key:"x",value:-3},{key:"x",value:1},{key:"x",value:2}],expected:[{key:"x",mean:0}]}]},
  { id: "BOUNDED-COVERAGE-GAPS", tier: "VALIDATION", domain: "INTERVAL_COMPLEMENT",
    objective: "Implement transform(input) for {start,end,intervals}, with finite integer start<=end and half-open intervals [a,b] where a<=b. Return new half-open uncovered intervals inside [start,end), ordered ascending. Clip coverage to the bounds, merge overlap and touching coverage, ignore zero-length coverage, and omit zero-length gaps. Intervals can be unsorted, duplicated or outside the bounds. Zero-length domain returns []. Do not mutate or alias input or nested arrays. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:{start:0,end:10,intervals:[[6,8],[2,4]]},expected:[[0,2],[4,6],[8,10]]},
      {input:{start:0,end:5,intervals:[[0,2],[2,5]]},expected:[]}],
    privateCases:[{input:{start:3,end:3,intervals:[]},expected:[]},
      {input:{start:-3,end:4,intervals:[[-10,-1],[1,9]]},expected:[[-1,1]]},
      {input:{start:0,end:8,intervals:[[3,3],[-4,-1],[9,11]]},expected:[[0,8]]},
      {input:{start:0,end:9,intervals:[[5,7],[1,4],[2,3],[1,4],[7,8]]},expected:[[0,1],[4,5],[8,9]]}]},
  { id: "TRAILING-RMS", tier: "VALIDATION", domain: "NUMERICAL_STREAM_STATISTICS",
    objective: "Implement transform(input) for {values,width}, where values contains finite numbers and width is a positive integer. For each input position return the root mean square of the suffix ending there containing at most width values: sqrt(sum of squares divided by the actual count). Early positions use their available count, not width. Empty values returns []. Do not mutate input. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:{values:[3,4,0],width:2},expected:[3,Math.sqrt(12.5),Math.sqrt(8)]},
      {input:{values:[-2,0,2],width:1},expected:[2,0,2]}],
    privateCases:[{input:{values:[],width:3},expected:[]},
      {input:{values:[1,2,3],width:8},expected:[1,Math.sqrt(2.5),Math.sqrt(14/3)]},
      {input:{values:[0,-4,0,0],width:2},expected:[0,Math.sqrt(8),Math.sqrt(8),0]},
      {input:{values:[0.5,-0.5,0.5],width:2},expected:[0.5,0.5,0.5]}]},
];
