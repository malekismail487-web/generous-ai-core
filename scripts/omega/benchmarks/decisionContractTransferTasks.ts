import type { RepresentationTask } from "./sourceRepresentationTasks";

// Fresh domain fixtures, authored before inference, not derived from benchmark failures.
// Expected values stay evaluator-side; only objectives, public examples and private inputs enter isolation.
// Small protocol/engineering transfer experiment, not a frontier benchmark or independent replication.
export const DECISION_CONTRACT_TRANSFER_TASKS: readonly RepresentationTask[] = [
  {id: "ATOMIC-STOCK-RESERVATION", tier: "DEVELOPMENT", domain: "TRANSACTIONAL_ALLOCATION",
    objective: "Implement transform(input) for {stock,orders}. stock maps SKU strings to nonnegative integer quantities; each order has a unique id and an items object of nonnegative integer quantities. Process orders in their given order. Accept an order only if ALL requested quantities are available, then subtract them atomically; otherwise reject it without consuming any stock. Missing SKUs have quantity zero. Empty orders are accepted. Return {accepted:[accepted IDs in input order],remaining:{all original stock keys in their original order with remaining quantities}}. Do not insert missing SKUs, mutate input, or alias input objects. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [
      {input: {stock:{a:3,b:2},orders:[{id:"first",items:{a:2,b:3}},{id:"second",items:{a:3}}]},expected:{accepted:["second"],remaining:{a:0,b:2}}},
      {input: {stock:{a:1},orders:[{id:"empty",items:{}},{id:"missing",items:{z:1}}]},expected:{accepted:["empty"],remaining:{a:1}}}],
    privateCases: [
      {input:{stock:{},orders:[]},expected:{accepted:[],remaining:{}}},
      {input:{stock:{},orders:[{id:"zero",items:{unknown:0}}]},expected:{accepted:["zero"],remaining:{}}},
      {input:{stock:{x:2,y:1},orders:[{id:"a",items:{x:1}},{id:"b",items:{x:2,y:1}},{id:"c",items:{x:1,y:1}}]},expected:{accepted:["a","c"],remaining:{x:0,y:0}}},
      {input:{stock:{x:4},orders:[{id:"a",items:{x:4}},{id:"b",items:{x:0}},{id:"c",items:{x:1}}]},expected:{accepted:["a","b"],remaining:{x:0}}},
      {input:{stock:{unused:7,z:0},orders:[{id:"q",items:{z:0}},{id:"r",items:{z:1}}]},expected:{accepted:["q"],remaining:{unused:7,z:0}}}]},
  {id: "NONDETERMINISTIC-STATE-TRACE", tier: "DEVELOPMENT", domain: "FINITE_STATE_INTERPRETATION",
    objective: "Implement transform(input) for {start,transitions,symbols}. start is an array of state strings, transitions is an array of {from,symbol,to} records and symbols is an array of strings. There are no epsilon transitions. Return the reachable state set for every prefix, INCLUDING the initial set, as an array of arrays. Each set must be unique and sorted using JavaScript string comparison. For each symbol, follow all matching transitions from all currently reachable states. A dead set remains empty. Duplicate states or transitions change nothing. Do not mutate or alias any input objects. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[
      {input:{start:["s"],transitions:[{from:"s",symbol:"a",to:"y"},{from:"s",symbol:"a",to:"x"},{from:"x",symbol:"b",to:"z"}],symbols:["a","b","c"]},expected:[["s"],["x","y"],["z"],[]]},
      {input:{start:["b","a","b"],transitions:[],symbols:[]},expected:[["a","b"]]}],
    privateCases:[
      {input:{start:[],transitions:[],symbols:["x","y"]},expected:[[],[],[]]},
      {input:{start:["s"],transitions:[{from:"s",symbol:"x",to:"s"},{from:"s",symbol:"x",to:"s"}],symbols:["x","x"]},expected:[["s"],["s"],["s"]]},
      {input:{start:["A","a"],transitions:[{from:"A",symbol:"",to:"z"},{from:"a",symbol:"",to:"b"}],symbols:[""]},expected:[["A","a"],["b","z"]]},
      {input:{start:["s"],transitions:[{from:"s",symbol:"a",to:"x"},{from:"x",symbol:"b",to:"s"}],symbols:["b","a","b"]},expected:[["s"],[],[],[]]},
      {input:{start:["q"],transitions:[{from:"q",symbol:"a",to:"p"},{from:"q",symbol:"a",to:"q"},{from:"p",symbol:"a",to:"p"}],symbols:["a","a"]},expected:[["q"],["p","q"],["p","q"]]}]},
  {id: "SIGNED-RATIONAL-ACCUMULATION", tier: "VALIDATION", domain: "EXACT_ARITHMETIC",
    objective: "Implement transform(input) for an array of fractions [integer numerator,nonzero integer denominator]. Return their exact sum as [numerator,denominator] in lowest terms with a positive denominator. Zero, including an empty sum, is [0,1]. All inputs and all necessary products and sums are within JavaScript's safe integer range. Do not use floating-point approximation or tolerance-based reduction. Do not mutate or alias input arrays. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:[[1,6],[1,3]],expected:[1,2]},{input:[[1,-2],[1,4]],expected:[-1,4]}],
    privateCases:[{input:[],expected:[0,1]},{input:[[0,-7]],expected:[0,1]},
      {input:[[2,4],[-3,6]],expected:[0,1]},{input:[[-4,-6]],expected:[2,3]},
      {input:[[1,2],[1,3],[1,6]],expected:[1,1]},{input:[[5,12],[-7,18],[1,-9]],expected:[-1,12]},
      {input:[[7,-21],[2,9]],expected:[-1,9]}]},
  {id: "UNICODE-EDIT-METRIC", tier: "VALIDATION", domain: "DYNAMIC_PROGRAMMING",
    objective: "Implement transform(input) for {left,right} strings. Return Levenshtein edit distance with unit insertion, deletion and substitution costs. Operate on Unicode code points, not UTF-16 code units; do not normalize Unicode. Empty strings are valid. Transposition is NOT a single operation. Do not mutate input. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases:[{input:{left:"kitten",right:"sitting"},expected:3},{input:{left:"😀",right:""},expected:1}],
    privateCases:[{input:{left:"",right:""},expected:0},{input:{left:"",right:"α😀"},expected:2},
      {input:{left:"ab",right:"ba"},expected:2},{input:{left:"😀a",right:"😀b"},expected:1},
      {input:{left:"é",right:"e\u0301"},expected:2},{input:{left:"aaaa",right:"aa"},expected:2},
      {input:{left:"x😀y",right:"xy"},expected:1},{input:{left:"same",right:"same"},expected:0}]},
];
