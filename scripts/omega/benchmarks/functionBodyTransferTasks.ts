import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration, v3NativeWireVerified } from "./v3NativeReasoningTransferTasks";
import { NYX_FUNCTION_BODY_EMISSION } from "../../../src/lib/codelab/cognition/nyxFunctionBodyEmission";

export const FUNCTION_BODY_TRANSFER_EPOCH = Object.freeze({
  version: "nyx-function-body-fresh-transfer/1", admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 4, predeclaredRepeats: 2,
  changedVariable: "SOURCE_BOUND_BODY_SERIALIZATION_VS_COMPLETE_FILE_SERIALIZATION",
  mechanism: NYX_FUNCTION_BODY_EMISSION,
  scope: "SAME_AUTHOR_FIRST_EXPOSURE_UNSEEDED_KERNELS_NOT_EXTERNAL_BENCHMARK",
  criterion: "BOTH_REPEATS_FULL_ACCEPTANCE_WINS_IN_TWO_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_NO_PAIRED_REGRESSION",
  limitations: "Body arm preserves the sole-function scaffold and cannot move helpers outside that function; full-file arm has the original file edit envelope. No broader coding or reasoning claim.",
});
export function functionBodyTransferConfiguration(variant: string) {
  if (!["COMPLETE_FILE_CONTROL", "SOURCE_BOUND_BODY"].includes(variant)) throw Error("function_body_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    ...(variant === "SOURCE_BOUND_BODY" ? { sourceEditScope: "FUNCTION_BODY" as const } : {}) };
}
export function functionBodyWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown; publicAdmissionPolicyId?: unknown; legacyLineApplicabilityPresent?: boolean;
  bodyEmissionVersion?: unknown; bodyEntryCount?: number; hostedSchemaPresent?: boolean;
}[]) {
  functionBodyTransferConfiguration(variant);
  return v3NativeWireVerified("NATIVE_BOUNDED_REASONING", controls) && controls.length > 0
    && controls.every(control => control.hostedSchemaPresent === true
      && control.bodyEmissionVersion === (variant === "SOURCE_BOUND_BODY" ? NYX_FUNCTION_BODY_EMISSION : null)
      && control.bodyEntryCount === (variant === "SOURCE_BOUND_BODY" ? 1 : 0));
}

type Job = { id: string; duration: number; needs: string[] };
// Oracle relaxes ready vertices in rounds; test witness memoizes predecessor recursion.
function finishes(jobs: Job[]): number[] {
  const remaining = jobs.slice(), known = new Map<string, number>();
  while (remaining.length) {
    const ready = remaining.filter(job => job.needs.every(id => known.has(id)));
    if (!ready.length) throw Error("frozen_jobs_must_be_acyclic");
    for (const job of ready) {
      known.set(job.id, job.duration + Math.max(0, ...job.needs.map(id => known.get(id)!)));
      remaining.splice(remaining.indexOf(job), 1);
    }
  }
  return jobs.map(job => known.get(job.id)!);
}
// Oracle separates the two directed coordinate products; witness folds edge cross products.
function area(points: number[][]): [number, string] {
  const next = [...points.slice(1), points[0]];
  const forward = points.reduce((sum, point, index) => sum + point[0] * next[index][1], 0);
  const backward = points.reduce((sum, point, index) => sum + point[1] * next[index][0], 0);
  const signed = forward - backward;
  return [signed, signed === 0 ? "DEGENERATE" : signed > 0 ? "CCW" : "CW"];
}
// Oracle adds each 16-bit word with end-around carry; witness folds an aggregate sum.
function checksum(bytes: number[]): number {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    const word = bytes[index] * 256 + (bytes[index + 1] ?? 0);
    const wide = sum + word;
    sum = wide % 65536 + Math.floor(wide / 65536);
  }
  return 65535 - sum;
}
// Oracle sorts exact integer remainders; witness repeatedly selects residual maxima.
function allocate(input: { seats: number; weights: number[] }): number[] {
  const total = input.weights.reduce((sum, value) => sum + value, 0);
  if (!total) return input.weights.map(() => 0);
  const output = input.weights.map(weight => Math.floor(input.seats * weight / total));
  const order = input.weights.map((weight, index) => ({index, remainder: input.seats * weight % total}))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = input.seats - output.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++) output[order[index].index]++;
  return output;
}
const boundary = " Preserve input and the named ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.";
const jobInputs: Job[][] = [[], [{id:"a",duration:0,needs:[]}], [{id:"b",duration:4,needs:["a"]},{id:"a",duration:3,needs:[]}],
  [{id:"a",duration:2,needs:[]},{id:"b",duration:8,needs:[]},{id:"c",duration:1,needs:["a","b"]}],
  ...Array.from({length:8},(_,seed)=>Array.from({length:5},(_,index)=>({id:"j"+index,duration:(seed+index*3)%10,
    needs:Array.from({length:index},(_,previous)=>previous).filter(previous=>(previous+seed)%2===0).map(previous=>"j"+previous)})).reverse())];
const areaInputs = [[[0,0],[4,0],[4,3],[0,3]],[[0,0],[0,3],[4,3],[4,0]],[[1,1],[2,2],[3,3]],
  [[-3,-2],[4,-2],[0,5]],[[0,0],[3,0],[1,1],[0,3],[0,0]],
  ...Array.from({length:7},(_,seed)=>[[seed-4,2],[seed-1,2],[seed-1,seed+4],[seed-4,seed+4]])];
const checksumInputs = [[],[0],[255],[255,255],[255,255,0,1],[1,2,3],[128,0,128,0],
  ...Array.from({length:9},(_,seed)=>Array.from({length:seed+7},(_,index)=>(seed*47+index*73)%256))];
const allocationInputs = [{seats:0,weights:[]},{seats:8,weights:[0,0]},{seats:3,weights:[1,1]},
  {seats:1,weights:[0,9,0]},{seats:12,weights:[9]},
  ...Array.from({length:9},(_,seed)=>({seats:seed+2,weights:[seed%4,3,(seed*3)%7,2]}))];

export const FUNCTION_BODY_TRANSFER_TASKS: readonly RepresentationTask[] = [
  {id:"DEPENDENCY-FINISH-TIMES",tier:"DEVELOPMENT",domain:"ACYCLIC_DURATION_PROPAGATION",
    objective:"Implement transform(input) for at most six job records {id,duration,needs}. IDs are distinct strings, durations integers 0..9, needs lists IDs present in the input and the graph is acyclic. Jobs may appear in any order. With unlimited workers, a job starts when all its prerequisites finish, or time zero if none. Return earliest finish times in original input order. Empty input returns []."+boundary,
    publicCases:[{input:[{id:"b",duration:2,needs:["a"]},{id:"a",duration:3,needs:[]}],expected:[5,3]},
      {input:[{id:"x",duration:4,needs:[]},{id:"y",duration:1,needs:[]}],expected:[4,1]}],privateCases:jobInputs.map(input=>({input,expected:finishes(input)}))},
  {id:"POLYGON-SIGNED-AREA",tier:"DEVELOPMENT",domain:"EXACT_PLANAR_GEOMETRY",
    objective:"Implement transform(input) for 3..8 [x,y] integer vertices (coordinates -10..10) of a closed polygonal walk. Include the edge from last vertex to first; a repeated closing vertex is allowed. Return [signedDoubleArea,orientation], with algebraic shoelace double area positive for counterclockwise and orientation CCW, negative for CW, zero for DEGENERATE. Preserve sign and do not take the absolute area."+boundary,
    publicCases:[{input:[[0,0],[2,0],[0,3]],expected:[6,"CCW"]},{input:[[0,0],[0,3],[2,0]],expected:[-6,"CW"]}],
    privateCases:areaInputs.map(input=>({input,expected:area(input)}))},
  {id:"INTERNET-WORD-CHECKSUM",tier:"VALIDATION",domain:"BOUNDED_BINARY_ARITHMETIC",
    objective:"Implement transform(input) for an array of 0..32 integer bytes 0..255. Pair bytes into big-endian 16-bit words; pad an odd final byte with a low zero byte. Sum using one's-complement arithmetic (carry above bit 15 is added back to the low 16 bits, repeating if required). Return the 16-bit one's complement as integer 0..65535. Empty bytes return 65535."+boundary,
    publicCases:[{input:[0,1,0,2],expected:65532},{input:[255,255,0,1],expected:65534}],privateCases:checksumInputs.map(input=>({input,expected:checksum(input)}))},
  {id:"STABLE-SEAT-APPORTIONMENT",tier:"VALIDATION",domain:"CONSERVATIVE_DISCRETE_ALLOCATION",
    objective:"Implement transform(input) for {seats,weights}: seats integer 0..12, weights at most six integers 0..9. Use largest-remainder allocation: floor each exact proportional quota, then award remaining seats by descending fractional remainder, ties by lower original index. Return allocations in original order. Empty or all-zero weights return zeros of matching length, even with positive seats."+boundary,
    publicCases:[{input:{seats:5,weights:[2,1,1]},expected:[3,1,1]},{input:{seats:3,weights:[1,1]},expected:[2,1]}],
    privateCases:allocationInputs.map(input=>({input,expected:allocate(input)}))},
];
export function functionBodyTransferTasks(): RepresentationTask[] {
  return FUNCTION_BODY_TRANSFER_TASKS.flatMap(task=>[1,2].map(repeat=>({...task,id:`${task.id}-REPEAT-${repeat}`})));
}
