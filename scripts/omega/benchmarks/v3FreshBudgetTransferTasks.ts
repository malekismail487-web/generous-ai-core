import type { RepresentationTask } from "./sourceRepresentationTasks";
import { originalBudgetWireControlVerified } from "./originalBudgetTransferTasks";

export const V3_FRESH_BUDGET_EPOCH = Object.freeze({
  version: "nyx-v3-original-budget-fresh-transfer/1",
  admissionPolicyId: "omega-public-static-candidate/3" as const,
  originalBudgetVersion: "nyx-original-state-quality-budget/2",
  uniqueTasks: 4, predeclaredRepeats: 2,
  status: "FIRST_EXPOSURE_IN_THIS_EPOCH_NOT_PROVEN_PRETRAINING_UNSEEN",
  efficacyCriterion: "BOTH_REPEATS_WIN_IN_TWO_DISTINCT_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_NO_PAIRED_ACCEPTANCE_REGRESSION",
  scope: "SMALL_SAME_AUTHOR_DEVELOPMENT_TRANSFER_NOT_EXTERNAL_BENCHMARK_OR_BROAD_PROMOTION",
});

// Evaluator-only Floyd-Warshall reachability, rather than a candidate's SCC traversal.
function graphOracle(input: { nodes: string[]; edges: string[][] }): string[][] {
  const reaches = input.nodes.map((a, i) => input.nodes.map((b, j) => i === j
    || input.edges.some(([from, to]) => a === from && b === to)));
  for (let k = 0; k < input.nodes.length; k++) for (let i = 0; i < input.nodes.length; i++)
    for (let j = 0; j < input.nodes.length; j++) reaches[i][j] ||= reaches[i][k] && reaches[k][j];
  const groups: string[][] = [], used = new Set<string>();
  input.nodes.forEach((node, i) => {
    if (used.has(node)) return;
    const group = input.nodes.filter((_, j) => reaches[i][j] && reaches[j][i]).sort();
    group.forEach(value => used.add(value)); groups.push(group);
  });
  return groups.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}

// Recompute each prefix over the complete denominator product (not incremental accumulation).
function rationalOracle(input: { n: string; d: string }[]): string[][] {
  return input.map((_, index) => {
    const prefix = input.slice(0, index + 1);
    let d = prefix.reduce((product, term) => product * BigInt(term.d), 1n);
    let n = prefix.reduce((sum, term) => sum + BigInt(term.n) * (d / BigInt(term.d)), 0n);
    let a = n < 0n ? -n : n, b = d;
    while (b !== 0n) [a, b] = [b, a % b];
    n /= a; d /= a; return [String(n), String(d)];
  });
}

type Event = { op: "begin" | "commit" | "rollback" | "read" }
  | { op: "set"; key: string; value: string } | { op: "delete"; key: string };
// The oracle replays committed operation history; the witness uses live Map snapshots.
function transactionOracle(input: Event[]): string[][][] {
  let committed: Event[] = [], pending: Event[] | null = null;
  const views: string[][][] = [];
  for (const event of input) {
    if (event.op === "begin") pending = [];
    else if (event.op === "commit") { committed = committed.concat(pending!); pending = null; }
    else if (event.op === "rollback") pending = null;
    else if (event.op !== "read") pending!.push(event);
    else {
      const entries: string[][] = [];
      for (const write of committed.concat(pending ?? [])) {
        if (write.op !== "set" && write.op !== "delete") throw Error("invalid_oracle_history");
        const prior = entries.findIndex(([key]) => key === write.key);
        if (prior >= 0) entries.splice(prior, 1);
        if (write.op === "set") entries.push([write.key, write.value]);
      }
      views.push(entries.sort((a, b) => a[0] < b[0] ? -1 : 1));
    }
  }
  return views;
}

const suffix = " Preserve all input data; every returned object/array must be detached. Keep the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.";
const graphInputs = Array.from({ length: 12 }, (_, index) => {
  const nodes = ["", "__proto__", "α", "😀", "a", "constructor"].slice(0, index % 7);
  const edges = nodes.flatMap((a, i) => nodes.flatMap((b, j) => ((i * 7 + j * 11 + index) % 5 < 2) ? [[a, b]] : []));
  return { nodes: nodes.slice().reverse(), edges: [...edges, ...edges.slice(0, 2)] };
});
graphInputs.push({nodes:Array.from({length:40},(_,i)=>`node-${i}`),
  edges:Array.from({length:39},(_,i)=>[`node-${i}`,`node-${i+1}`])},
  {nodes:["c","b","a","f","e","d"],edges:[["a","b"],["b","c"],["c","a"],["c","d"],["d","e"],["e","d"]]});
const rationalInputs = [[], [{n:"0",d:"17"}], [{n:"-4",d:"8"},{n:"1",d:"2"}],
  [{n:"1",d:"6"},{n:"1",d:"3"},{n:"-1",d:"2"}],
  [{n:"9007199254740993",d:"1"},{n:"-9007199254740992",d:"1"}],
  [{n:"999999999999999999999999999999",d:"1000000000000000000000000000000"},{n:"1",d:"1000000000000000000000000000000"}],
  [{n:"-21",d:"15"},{n:"13",d:"35"},{n:"-1",d:"21"}],
  [{n:"1",d:"7"},{n:"1",d:"11"},{n:"1",d:"13"},{n:"-1",d:"7"}],
  [{n:"2",d:"4"},{n:"6",d:"12"},{n:"-9",d:"9"}],
  [{n:"9999999999999999999999999999999999999999",d:"1"},{n:"-9999999999999999999999999999999999999998",d:"1"}]];
const transactionInputs: Event[][] = [[], [{op:"read"}],
  [{op:"begin"},{op:"set",key:"x",value:"1"},{op:"read"},{op:"rollback"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"x",value:"1"},{op:"commit"},{op:"begin"},{op:"set",key:"x",value:"2"},{op:"read"},{op:"rollback"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"__proto__",value:""},{op:"set",key:"constructor",value:"v"},{op:"commit"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"x",value:"1"},{op:"set",key:"x",value:"2"},{op:"delete",key:"missing"},{op:"commit"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"x",value:"1"},{op:"commit"},{op:"begin"},{op:"delete",key:"x"},{op:"read"},{op:"commit"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"😀",value:"emoji"},{op:"set",key:"α",value:"greek"},{op:"set",key:"",value:"empty"},{op:"commit"},{op:"read"}],
  [{op:"begin"},{op:"commit"},{op:"read"},{op:"begin"},{op:"rollback"},{op:"read"}],
  [{op:"begin"},{op:"set",key:"a",value:"first"},{op:"read"},{op:"set",key:"a",value:"second"},{op:"read"},
    {op:"delete",key:"a"},{op:"read"},{op:"commit"},{op:"read"}]];
const pointerCases = [
  {input:{document:{"a/b":{"~":7}},pointer:"/a~1b/~0"},expected:{found:true,value:7}},
  {input:{document:["zero","one"],pointer:"/01"},expected:{found:false}},
  {input:{document:{"":false},pointer:"/"},expected:{found:true,value:false}},
  {input:{document:{a:[null]},pointer:"/a/0"},expected:{found:true,value:null}},
  {input:{document:{a:0},pointer:"/a/child"},expected:{found:false}},
  {input:{document:{a:[]},pointer:"/a/-"},expected:{found:false}},
  {input:{document:{a:[]},pointer:"/a/length"},expected:{found:false}},
  {input:{document:JSON.parse('{"__proto__":{"constructor":"safe"}}'),pointer:"/__proto__/constructor"},expected:{found:true,value:"safe"}},
  {input:{document:{},pointer:"/constructor"},expected:{found:false}},
  {input:{document:{"01":[]},pointer:"/01"},expected:{found:true,value:[]}},
  {input:{document:{a:[{b:true}]},pointer:""},expected:{found:true,value:{a:[{b:true}]}}},
  {input:{document:{"~1":"tilde-one"},pointer:"/~01"},expected:{found:true,value:"tilde-one"}},
  {input:{document:null,pointer:""},expected:{found:true,value:null}},
  {input:{document:[0,false],pointer:"/1"},expected:{found:true,value:false}},
  {input:{document:[0,false],pointer:"/9007199254740993"},expected:{found:false}},
];

export const V3_FRESH_BUDGET_TASKS: readonly RepresentationTask[] = [
  {id:"SCC-PARTITION-V3-FRESH",tier:"VALIDATION",domain:"DIRECTED_GRAPH_EQUIVALENCE",
    objective:"Implement transform({nodes,edges}) for distinct arbitrary string node IDs and directed [from,to] edges whose endpoints are in nodes. Return the strongly connected components: each component's IDs sorted by JavaScript UTF-16 lexicographic order, then components sorted by their first ID in that order. Every node appears exactly once, including isolated nodes. Repeated edges and self-loops do not change the partition. Empty graph returns []. Up to 40 nodes."+suffix,
    publicCases:[{input:{nodes:["c","a","b"],edges:[["a","b"],["b","a"],["b","c"]]},expected:[["a","b"],["c"]]},
      {input:{nodes:["z","x"],edges:[]},expected:[["x"],["z"]]}],
    privateCases:graphInputs.map(input=>({input,expected:graphOracle(input)}))},
  {id:"RATIONAL-PREFIX-V3-FRESH",tier:"VALIDATION",domain:"EXACT_NUMERICAL_COMPUTATION",
    objective:"Implement transform(input) for an array of fractions {n,d}. n and d are decimal integer strings, n may be signed, d is strictly positive. Return one [numerator,denominator] string pair for each prefix sum, in input order, normalized to coprime integers with positive denominator. Zero is exactly ['0','1']; empty input returns []. Inputs may exceed Number precision, with up to 40 digits; arithmetic must stay exact."+suffix,
    publicCases:[{input:[{n:"1",d:"2"},{n:"1",d:"3"}],expected:[["1","2"],["5","6"]]},
      {input:[{n:"-1",d:"4"},{n:"1",d:"4"}],expected:[["-1","4"],["0","1"]]}],
    privateCases:rationalInputs.map(input=>({input,expected:rationalOracle(input)}))},
  {id:"TRANSACTION-VIEWS-V3-FRESH",tier:"VALIDATION",domain:"TRANSACTIONAL_STATE_VISIBILITY",
    objective:"Implement transform(events) for a valid sequence of key/value transaction events. begin starts a single nonnested transaction from committed state; set {key,value} overwrites a string value and delete {key} removes it (missing deletion is a no-op), only inside a transaction. commit atomically replaces committed state; rollback discards pending state. read returns the currently visible state, pending if a transaction is open, otherwise committed. Return one snapshot per read, each as detached [key,value] pairs sorted by JavaScript UTF-16 lexicographic key order. Keys/values are arbitrary strings. State begins empty; the input is guaranteed balanced with no open transaction at the end and no invalid operations. Earlier read snapshots must not change after later writes."+suffix,
    publicCases:[{input:[{op:"begin"},{op:"set",key:"a",value:"1"},{op:"read"},{op:"commit"},{op:"read"}],expected:[[["a","1"]],[["a","1"]]]},
      {input:[{op:"begin"},{op:"set",key:"a",value:"1"},{op:"rollback"},{op:"read"}],expected:[[]]}],
    privateCases:transactionInputs.map(input=>({input,expected:transactionOracle(input)}))},
  {id:"JSON-POINTER-V3-FRESH",tier:"VALIDATION",domain:"STRUCTURED_DATA_ADDRESSING",
    objective:"Implement transform({document,pointer}) for a JSON value and a syntactically valid JSON Pointer: empty string selects the root; otherwise slash-separated tokens decode ~1 to slash and ~0 to tilde, without recursive decoding. Resolve object OWN properties exactly. For arrays accept only canonical nonnegative decimal indices ('0' or a nonzero digit followed by digits) within length, not '-', length, or leading-zero indices. If a component cannot resolve or encounters a scalar/null, return {found:false}. Otherwise return {found:true,value: selected JSON value}. Missing is distinct from a selected null or false. Object property names may be arbitrary strings, including numeric-looking strings."+suffix,
    publicCases:pointerCases.slice(0,2),privateCases:pointerCases.slice(2)},
];

export function v3FreshBudgetTasks(): readonly RepresentationTask[] {
  return V3_FRESH_BUDGET_TASKS.flatMap(task => [1, 2].map(repeat => ({...task,id:`${task.id}-REPEAT-${repeat}`})));
}

export function v3FreshBudgetWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown;
}[]): boolean {
  return originalBudgetWireControlVerified(variant, controls) && controls.every(control => {
    const presented = variant === "ORIGINAL_BUDGET" && control.initialCandidateState;
    return presented ? control.originalBudgetVersion === V3_FRESH_BUDGET_EPOCH.originalBudgetVersion
      && control.originalBudgetPolicyId === V3_FRESH_BUDGET_EPOCH.admissionPolicyId
      : control.originalBudgetVersion == null && control.originalBudgetPolicyId == null;
  });
}

/** No admission on a failed executable candidate is NOT_REACHED, not policy drift. */
export function observeV3AdmissionPolicy(rows: readonly {quality: string|null; staticPolicyId?: string|null}[]) {
  const reached = rows.filter(row => row.quality !== null);
  const consistent = rows.every(row => row.quality === null ? row.staticPolicyId === null
    : ["ADMITTED","REJECTED","INSUFFICIENT_EVIDENCE"].includes(row.quality)
      && row.staticPolicyId === V3_FRESH_BUDGET_EPOCH.admissionPolicyId);
  return Object.freeze({state: !consistent ? "MISMATCH" as const
    : reached.length ? "OBSERVED" as const : "NOT_REACHED" as const, observedAdmissions: reached.length});
}
