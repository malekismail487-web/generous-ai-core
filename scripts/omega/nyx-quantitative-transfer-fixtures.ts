import type { QuantitativeProblem, QuantitativeProgram } from "../../src/lib/codelab/research/exactQuantitativeDerivation";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const QUANTITATIVE_EPOCH = Object.freeze({ chunkId: "NYX-EXACT-DERIVATION-TRANSFER-001", version: 1,
  maxCallsPerTask: 4, maxOutputTokensPerCall: 4096, maxTaskMs: 360_000, maxWallClockMs: 3_600_000,
  maxToolRequests: 2, maxToolWorkUnits: 100_000, maxToolElapsedMs: 2000,
  hypothesis: "Model-authored exact derivations reduce quantitative failures versus medium-effort reasoning alone.",
  supportCriterion: "Higher fresh-task acceptance at no greater reported model tokens, including native work cost; independently replicate before broader promotion.",
  falsificationCriterion: "No acceptance gain or worse capability per compute, or a semantic/oracle regression.",
  population: "FOUR_FRESH_DEVELOPER_AUTHORED_FINITE_CROSS_DOMAIN_TASKS_NOT_OFFICIAL_BENCHMARKS",
  confidenceRequirement: "Paired descriptive outcomes only; no broad significance from four tasks.",
  planCoverage: { status: "PARTIAL_JUST_IN_TIME", direct: ["GENERATOR_REQUIRES_DETECTOR", "SEMANTIC_SEARCH_EFFICIENCY",
    "EXECUTABLE_EVIDENCE_OUTRANKS_CONFIDENCE", "VERIFIED_CAPABILITY_PER_COMPUTE"],
    supporting: ["NO_SELF_CERTIFICATION", "NO_AUTHORITY_WITHOUT_SCOPE"],
    deferred: ["MODEL_TRAINING", "OPEN_ENDED_PROOF", "DEVICE_INTEGRATION"], conflicts: [],
    superseded: ["MORE_ORCHESTRATION_WITHOUT_REPAIRING_OBSERVED_NUMERICAL_FAILURES"] },
});
export interface QuantitativeTask { readonly taskId: string; readonly objective: string;
  readonly problem: QuantitativeProblem; readonly outputLabels: readonly string[] }
const problem = (values: Readonly<Record<string, string>>): QuantitativeProblem => ({
  kind: "EXACT_QUANTITATIVE_DERIVATION", constants: Object.entries({ zero: "0", one: "1", ...values })
    .map(([id, value]) => ({ id, value })) });
export const QUANTITATIVE_TASKS: readonly QuantitativeTask[] = immutableTheoryValue([
  { taskId: "MIXING-23", objective: "Two equal-volume sealed vessels exchange dissolved tracer synchronously each cycle. "
    + "At each of 23 cycles, new x = ax*old x + bx*old y, and new y = bx*old x + ax*old y. "
    + "Initially x=x0 and y=y0. Report exact reduced rational final x and y; do not round or use newly updated x when updating y.",
    problem: problem({ x0: "41/7", y0: "13/11", ax: "7/9", bx: "2/9" }), outputLabels: ["x", "y"] },
  { taskId: "CONTROL-19", objective: "A discrete controller uses two ordered substeps per cycle. First x := ax*x + bx*y. "
    + "Then y := ay*y + by*x, using the NEW x from that same cycle. Starting at x0,y0, run 19 cycles. "
    + "Report exact reduced rational final x and y; these are sequential, not simultaneous, updates.",
    problem: problem({ x0: "-5/13", y0: "17/3", ax: "3/7", bx: "2/7", ay: "5/11", by: "4/11" }), outputLabels: ["x", "y"] },
  { taskId: "INVENTORY-13", objective: "Start with stock=initial and shipped=0. For each of 13 days: "
    + "(1) add supply to stock; (2) deliver min(stock,capacity); (3) subtract delivered stock and add delivery to cumulative shipped; "
    + "(4) a fraction returned of THAT day's delivery is returned to stock AFTER delivery. "
    + "Report exact reduced rational final stock and cumulative shipped. Returned units may be delivered again later; do not subtract returns from shipped.",
    problem: problem({ initial: "1/5", supply: "17/5", capacity: "11/3", returned: "2/7" }), outputLabels: ["stock", "shipped"] },
  { taskId: "SAMPLING-8", objective: "A uniformly random sample of draw objects is taken without replacement from a bag of red red objects "
    + "and blue blue objects. Report the exact reduced rational probability that exactly wanted sampled objects are red. "
    + "Use the finite-population model, not independent draws or an approximation. Output label probability.",
    problem: problem({ red: "17", blue: "29", draw: "8", wanted: "3" }), outputLabels: ["probability"] },
]);
export const QUANTITATIVE_CORPUS_DIGEST = theoryDigest(QUANTITATIVE_TASKS);

// Oracle arithmetic is independent of the IR interpreter. Domain oracles use closed-form
// eigendecomposition, matrix exponentiation, a direct inventory recurrence, and combinations.
type Q = readonly [bigint, bigint];
function q(n: bigint, d = 1n): Q {
  if (d === 0n) throw Error("oracle_zero_denominator");
  const sign = d < 0n ? -1n : 1n; n *= sign; d *= sign;
  let a = n < 0n ? -n : n; let b = d;
  while (b) { const next = a % b; a = b; b = next; }
  return [n / a, d / a];
}
const plus = (a: Q, b: Q) => q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
const times = (a: Q, b: Q) => q(a[0]*b[0],a[1]*b[1]);
const neg = (a: Q): Q => [-a[0],a[1]];
const div = (a: Q, b: Q) => q(a[0]*b[1],a[1]*b[0]);
const parse = (v: string): Q => { const [n,d="1"] = v.split("/"); return q(BigInt(n),BigInt(d)); };
const show = (v: Q) => v[1] === 1n ? String(v[0]) : `${v[0]}/${v[1]}`;
function power(v: Q, exponent: number): Q { return q(v[0] ** BigInt(exponent),v[1] ** BigInt(exponent)); }
function choose(n: bigint, k: bigint): bigint {
  let result = 1n;
  for (let i=1n;i<=k;i++) result = result*(n-i+1n)/i;
  return result;
}
export function expectedQuantities(task: QuantitativeTask): readonly {label: string;value: string}[] {
  const c = Object.fromEntries(task.problem.constants.map(item=>[item.id,parse(item.value)]));
  let result: Record<string,Q>;
  if (task.taskId === "MIXING-23") {
    const sum = plus(c.x0,c.y0); const difference = plus(c.x0,neg(c.y0));
    const differenceAfter = times(difference,power(plus(c.ax,neg(c.bx)),23));
    result = {x:div(plus(sum,differenceAfter),q(2n)),y:div(plus(sum,neg(differenceAfter)),q(2n))};
  } else if (task.taskId === "CONTROL-19") {
    type Matrix = readonly [Q,Q,Q,Q];
    const multiply = (a: Matrix,b: Matrix): Matrix => [plus(times(a[0],b[0]),times(a[1],b[2])),
      plus(times(a[0],b[1]),times(a[1],b[3])),plus(times(a[2],b[0]),times(a[3],b[2])),
      plus(times(a[2],b[1]),times(a[3],b[3]))];
    let base: Matrix = [c.ax,c.bx,times(c.by,c.ax),plus(c.ay,times(c.by,c.bx))];
    let accumulator: Matrix = [q(1n),q(0n),q(0n),q(1n)];
    for(let exponent=19;exponent>0;exponent=Math.floor(exponent/2)) {
      if(exponent%2) accumulator=multiply(accumulator,base); base=multiply(base,base);
    }
    result={x:plus(times(accumulator[0],c.x0),times(accumulator[1],c.y0)),
      y:plus(times(accumulator[2],c.x0),times(accumulator[3],c.y0))};
  } else if (task.taskId === "INVENTORY-13") {
    let stock=c.initial;let shipped=q(0n);
    for(let day=0;day<13;day++) {
      const before=plus(stock,c.supply);
      const sent=before[0]*c.capacity[1]<c.capacity[0]*before[1]?before:c.capacity;
      stock=plus(before,times(sent,plus(c.returned,q(-1n)))); shipped=plus(shipped,sent);
    }
    result={stock,shipped};
  } else if (task.taskId === "SAMPLING-8") result={probability:q(choose(c.red[0],c.wanted[0])
    *choose(c.blue[0],c.draw[0]-c.wanted[0]),choose(c.red[0]+c.blue[0],c.draw[0]))};
  else throw Error("unknown_frozen_task");
  return task.outputLabels.map(label=>({label,value:show(result[label])}));
}
export function verifyQuantitativeSubmission(task: QuantitativeTask, supplied: unknown) {
  const findings: string[] = [];
  let nodes=0;
  function data(value:unknown,ancestors=new Set<object>(),depth=0):boolean {
    if(++nodes>4096||depth>8)return false;
    if(value===null||typeof value==="boolean")return true;
    if(typeof value==="number")return Number.isFinite(value);
    if(typeof value==="string")return value.length<=4096;
    if(!value||typeof value!=="object"||ancestors.has(value))return false;
    if(![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))return false;
    if(Array.isArray(value)&&Reflect.ownKeys(value).length!==value.length+1)return false;
    ancestors.add(value);
    for(const name of Reflect.ownKeys(value)) {
      if(typeof name!=="string")return false;
      const descriptor=Object.getOwnPropertyDescriptor(value,name)!;
      if(!Object.prototype.hasOwnProperty.call(descriptor,"value")||name!=="length"&&!descriptor.enumerable
        ||!data(descriptor.value,ancestors,depth+1))return false;
    }
    ancestors.delete(value);return true;
  }
  const plain=data(supplied);
  const certificate = supplied as {outputs?: unknown;confidence?: unknown};
  if (!plain || !supplied || typeof supplied !== "object" || Array.isArray(supplied)
    || Object.keys(supplied).sort().join() !== "confidence,outputs" || typeof certificate.confidence !== "number"
    || !Number.isFinite(certificate.confidence) || certificate.confidence < 0 || certificate.confidence > 1
    || !Array.isArray(certificate.outputs) || certificate.outputs.length !== task.outputLabels.length) findings.push("CERTIFICATE_SCHEMA_INVALID");
  else {
    const expected = new Map(expectedQuantities(task).map(o=>[o.label,o.value]));
    const seen = new Set<string>();
    for (const item of certificate.outputs) {
      if (!item || typeof item !== "object" || Object.keys(item).sort().join() !== "label,value"
        || typeof item.label !== "string" || seen.has(item.label) || !expected.has(item.label)
        || typeof item.value !== "string" || item.value.length>4096) { findings.push("OUTPUT_SCHEMA_INVALID"); continue; }
      seen.add(item.label);
      if (expected.get(item.label)!==item.value) findings.push(`EXACT_VALUE_OR_MATHEMATICAL_MODEL_MISMATCH:${item.label}`);
    }
  }
  const candidateDigest=theoryDigest(plain?supplied:{malformedType:typeof supplied});
  return immutableTheoryValue({accepted:findings.length===0,findings,evidenceClass:"E3" as const,
    verifierVersion:"nyx-quantitative-domain-oracle/1",candidateDigest,
    verificationDigest:theoryDigest({taskDigest:theoryDigest(task),candidateDigest,findings}),grantsAuthority:false});
}

/** Tests only: never included in model inputs; each live program must be authored by NYX. */
export function referenceQuantitativeProgram(task: QuantitativeTask): QuantitativeProgram {
  type Step = QuantitativeProgram["blocks"][number]["steps"][number];
  const step = (target:string,op:Step["op"],left:string,right:string): Step => ({target,op,left,right});
  const register = (id:string,source:string) => ({id,source});
  const output = (label:string,source=label) => ({label,source});
  if (task.taskId==="MIXING-23" || task.taskId==="CONTROL-19") return {schemaVersion:1,
    registers:[register("x","x0"),register("y","y0"),register("a","zero"),register("b","zero"),register("c","zero"),register("d","zero")],
    blocks:[{iterations:task.taskId==="MIXING-23"?23:19,mode:"SEQUENTIAL",steps:[step("a","MUL","x","ax"),step("b","MUL","y","bx"),
      step("c","MUL","y",task.taskId==="MIXING-23"?"ax":"ay"),
      ...(task.taskId==="MIXING-23"?[step("d","MUL","x","bx")]:[]),step("x","ADD","a","b"),
      ...(task.taskId==="CONTROL-19"?[step("d","MUL","x","by")]:[]),step("y","ADD","c","d")]}],outputs:[output("x"),output("y")]};
  if(task.taskId==="INVENTORY-13") return {schemaVersion:1,registers:[register("stock","initial"),register("shipped","zero"),
    register("sent","zero"),register("ret","zero")],blocks:[{iterations:13,mode:"SEQUENTIAL",steps:[
      step("stock","ADD","stock","supply"),step("sent","MIN","stock","capacity"),step("stock","SUB","stock","sent"),
      step("shipped","ADD","shipped","sent"),step("ret","MUL","sent","returned"),step("stock","ADD","stock","ret")]}],
    outputs:[output("stock"),output("shipped")]};
  const registers=[register("r","red"),register("b","blue"),register("total","zero"),register("i","zero"),register("product","one"),
    register("rchoose","one"),register("bchoose","one"),register("allchoose","one"),register("probability","zero")];
  const loop=(source:string,n:number,destination:string):QuantitativeProgram["blocks"][number][]=>[
    {iterations:1,mode:"SEQUENTIAL",steps:[step("i","ADD","zero","zero"),step("product","ADD","one","zero")]},
    {iterations:n,mode:"SEQUENTIAL",steps:[step("i","ADD","i","one"),step("product","MUL","product",source),
      step("product","DIV","product","i"),step(source,"SUB",source,"one")]},
    {iterations:1,mode:"SEQUENTIAL",steps:[step(destination,"ADD","product","zero")]}];
  return {schemaVersion:1,registers,blocks:[{iterations:1,mode:"SEQUENTIAL",steps:[step("total","ADD","red","blue")]},
    ...loop("r",3,"rchoose"),...loop("b",5,"bchoose"),...loop("total",8,"allchoose"),
    {iterations:1,mode:"SEQUENTIAL",steps:[step("probability","MUL","rchoose","bchoose"),step("probability","DIV","probability","allchoose")]}],
    outputs:[output("probability")]};
}
