import type { RepresentationTask } from "./sourceRepresentationTasks";

// New frozen objectives after the aggregate-guidance experiment. No old scored task is edited.
export const QUALITY_SITE_TRANSFER_TASKS: readonly RepresentationTask[] = [
  {id:"WEIGHTED-CENTERED-DISPERSION",tier:"VALIDATION",domain:"NUMERICAL_STATISTICS",
    objective:"Implement transform(input) for records {value,weight}, with finite values and nonnegative finite weights. Return weighted population variance, or null when total positive weight is zero. Zero-weight entries contribute nothing. Compute the weighted mean and centered squared deviations; do not subtract raw second moments, which loses precision for large offsets. Do not mutate input or records. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:[{value:1,weight:1},{value:3,weight:1}],expected:1},
      {input:[{value:99,weight:0}],expected:null}],
    privateCases:[{input:[],expected:null},
      {input:[{value:99999998,weight:1},{value:100000002,weight:1}],expected:4},
      {input:[{value:0,weight:1},{value:2,weight:3}],expected:0.75},
      {input:[{value:0.5,weight:1},{value:1.5,weight:1},{value:99,weight:0}],expected:0.25},
      {input:[{value:-2,weight:2},{value:2,weight:2}],expected:4}]},
  {id:"BALANCED-PARENTHESIS-SPANS",tier:"VALIDATION",domain:"STRUCTURED_TEXT_ANALYSIS",
    objective:"Implement transform(input) for a string whose parentheses are balanced. Other characters are ordinary content. Return new {open,close,depth} records for every matching parenthesis pair, sorted by increasing open index. Indices are JavaScript UTF-16 string indices; depth is one-based nesting depth. Include inner and outer pairs. No pairs returns []. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:"(a(b)c)",expected:[{open:0,close:6,depth:1},{open:2,close:4,depth:2}]},
      {input:"()()",expected:[{open:0,close:1,depth:1},{open:2,close:3,depth:1}]}],
    privateCases:[{input:"",expected:[]},{input:"noise",expected:[]},
      {input:"(()())",expected:[{open:0,close:5,depth:1},{open:1,close:2,depth:2},{open:3,close:4,depth:2}]},
      {input:"a😀(x)",expected:[{open:3,close:5,depth:1}]},
      {input:"((()))",expected:[{open:0,close:5,depth:1},{open:1,close:4,depth:2},{open:2,close:3,depth:3}]}]},
];
