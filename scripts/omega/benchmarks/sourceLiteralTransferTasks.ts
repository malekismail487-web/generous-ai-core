import type {RepresentationTask} from "./sourceRepresentationTasks";

// Frozen before inference; not selected from benchmark answers or a previous task's failed code.
// Same-session authored private expected values. This is not independent institutional replication.
export const SOURCE_LITERAL_TRANSFER_TASKS: readonly RepresentationTask[]=[
  {id:"TEXT-PROTOCOL-TOKEN",tier:"VALIDATION",domain:"EXACT_TEXT_ENCODING",
    objective:"Implement transform(input) for a string. Return that string enclosed in double quotes as a text-protocol token. Inside the token, replace backslash with two backslashes, double quote with backslash-double-quote, LF with backslash-n, CR with backslash-r, and TAB with backslash-t. Preserve every other character, including Unicode and other control characters, exactly. This protocol is not general JSON encoding. Empty input produces two double quotes. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:'a"b\\c',expected:'"a\\"b\\\\c"'},{input:"line\nnext",expected:'"line\\nnext"'}],
    privateCases:[{input:"",expected:'""'},{input:'"',expected:'"\\""'},
      {input:"\r\t",expected:'"\\r\\t"'},{input:"雨😀",expected:'"雨😀"'},
      {input:"\b",expected:'"\b"'},{input:"\\n",expected:'"\\\\n"'}]},
  {id:"GROUPED-TRANSITION-TRACE",tier:"VALIDATION",domain:"TEMPORAL_STATE_AGGREGATION",
    objective:"Implement transform(input) for records {time,delta} with finite integer numbers. Starting with value zero, process times in ascending numeric order. Sum every delta at the same time before changing the value. Return new {time,value} records only at times whose aggregate delta is nonzero; omit zero-net groups even if their individual events are nonzero. Include transitions back to zero. Empty input returns []. Do not mutate or alias input or its records. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:[{time:3,delta:2},{time:1,delta:4},{time:3,delta:-1}],expected:[{time:1,value:4},{time:3,value:5}]},
      {input:[{time:0,delta:1},{time:0,delta:-1},{time:2,delta:0}],expected:[]}],
    privateCases:[{input:[],expected:[]},
      {input:[{time:9,delta:3},{time:4,delta:-2},{time:-2,delta:2}],expected:[{time:-2,value:2},{time:4,value:0},{time:9,value:3}]},
      {input:[{time:2,delta:3},{time:1,delta:-1},{time:2,delta:4}],expected:[{time:1,value:-1},{time:2,value:6}]},
      {input:[{time:0,delta:0},{time:1,delta:5},{time:1,delta:-5},{time:2,delta:2},{time:3,delta:0}],expected:[{time:2,value:2}]}]},
];
