/** A data-only arithmetic IR. No eval, generated code, filesystem, or model authority. */
export interface QuantitativeProblem {
  readonly kind: "EXACT_QUANTITATIVE_DERIVATION";
  readonly constants: readonly { readonly id: string; readonly value: string }[];
}
export interface QuantitativeProgram {
  readonly schemaVersion: 1;
  readonly registers: readonly { readonly id: string; readonly source: string }[];
  readonly blocks: readonly {
    readonly iterations: number;
    readonly mode: "SEQUENTIAL" | "SIMULTANEOUS";
    readonly steps: readonly { readonly target: string; readonly op: "ADD" | "SUB" | "MUL" | "DIV" | "MIN" | "MAX" | "BINOMIAL";
      readonly left: string; readonly right: string }[];
  }[];
  readonly outputs: readonly { readonly label: string; readonly source: string }[];
}
export const EXACT_DERIVATION_OPERATIONS=Object.freeze(["ADD","SUB","MUL","DIV","MIN","MAX","BINOMIAL"] as const);
export const EXACT_DERIVATION_POLICY = Object.freeze({ version: "nyx-exact-derivation/2",
  maxConstants: 32, maxRegisters: 32, maxSteps: 64, maxBlocks: 16, maxIterations: 1024,
  maxOutputs: 16, maxIntegerBits: 4096, grantsAuthority: false,
  scope: "EXACT_EVALUATION_OF_MODEL_AUTHORED_IR_NOT_VALIDATION_OF_ITS_MATHEMATICAL_MODEL" });
const ownKeys = (value: unknown, names: readonly string[]): value is Record<string, unknown> => !!value
  && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...names].sort().join("\0");
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(value);
const literal = (value: unknown): value is string => typeof value === "string"
  && /^-?(?:0|[1-9][0-9]{0,127})(?:\/[1-9][0-9]{0,127})?$/.test(value);

/** Caller first rejects host objects/accessors and bounds serialized bytes. */
export function validQuantitativeProblem(value: QuantitativeProblem): boolean {
  return ownKeys(value, ["kind", "constants"]) && Array.isArray(value.constants)
    && value.constants.length > 0 && value.constants.length <= EXACT_DERIVATION_POLICY.maxConstants
    && new Set(value.constants.map(c => c?.id)).size === value.constants.length
    && value.constants.every(c => ownKeys(c, ["id", "value"]) && id(c.id) && literal(c.value));
}
export function quantitativeProgramFinding(problem: QuantitativeProblem, value: unknown): string | null {
  if (!ownKeys(value, ["schemaVersion", "registers", "blocks", "outputs"]) || value.schemaVersion !== 1
    || !Array.isArray(value.registers) || value.registers.length > EXACT_DERIVATION_POLICY.maxRegisters
    || !Array.isArray(value.blocks) || value.blocks.length > EXACT_DERIVATION_POLICY.maxBlocks
    || !Array.isArray(value.outputs) || value.outputs.length < 1 || value.outputs.length > EXACT_DERIVATION_POLICY.maxOutputs) return "PROGRAM_SHAPE_OR_COLLECTION_BOUND";
  const constants = new Set(problem.constants.map(c => c.id));
  const available = new Set(constants);
  const registers = new Set<string>();
  for (const [at,register] of value.registers.entries()) {
    if (!ownKeys(register, ["id", "source"])) return `REGISTER_SHAPE:${at}`;
    if (!id(register.id)) return `REGISTER_ID_INVALID:${at}`;
    if (!id(register.source)||!available.has(register.source)) return `REGISTER_SOURCE_NOT_BOUND:${at}`;
    if (available.has(register.id)) return `REGISTER_ID_ALREADY_BOUND:${at}`;
    registers.add(register.id); available.add(register.id);
  }
  let steps = 0;
  for (const [at,block] of value.blocks.entries()) {
    if (!ownKeys(block, ["iterations", "mode", "steps"]) || !Number.isSafeInteger(block.iterations)
      || Number(block.iterations) < 1 || Number(block.iterations) > EXACT_DERIVATION_POLICY.maxIterations
      || !["SEQUENTIAL", "SIMULTANEOUS"].includes(String(block.mode)) || !Array.isArray(block.steps)
      || block.steps.length < 1 || (steps += block.steps.length) > EXACT_DERIVATION_POLICY.maxSteps) return `BLOCK_SHAPE_OR_STEP_ITERATION_BOUND:${at}`;
    const targets = new Set<string>();
    for (const [column,step] of block.steps.entries()) {
      if (!ownKeys(step, ["target", "op", "left", "right"])) return `STEP_SHAPE:${at}.${column}`;
      if (!id(step.target) || !registers.has(step.target)) return `STEP_TARGET_NOT_MUTABLE_REGISTER:${at}.${column}`;
      if (!(EXACT_DERIVATION_OPERATIONS as readonly string[]).includes(String(step.op))) return `STEP_OPERATION:${at}.${column}`;
      if (!id(step.left) || !available.has(step.left) || !id(step.right) || !available.has(step.right)) return `STEP_SOURCE_NOT_BOUND:${at}.${column}`;
      if (block.mode === "SIMULTANEOUS" && targets.has(step.target)) return `SIMULTANEOUS_TARGET_DUPLICATED:${at}.${column}`;
      targets.add(step.target);
    }
  }
  return new Set(value.outputs.map(o => o?.label)).size === value.outputs.length
    && value.outputs.every(o => ownKeys(o, ["label", "source"]) && id(o.label) && id(o.source) && available.has(o.source))?null:"OUTPUT_BINDING";
}
export function validQuantitativeProgram(problem: QuantitativeProblem, value: unknown): value is QuantitativeProgram {
  return quantitativeProgramFinding(problem,value)===null;
}

class ArithmeticBoundary extends Error {}
/** Bounded canonicalization reuses the SAME exact interpreter. This establishes
 * rational representation equality, never scientific truth or tool authority.
 */
export function canonicalRationalLiteral(value: string, tick:()=>void=()=>{}, operandMemo?:ExactOperandMemo):string {
  // Derived/native measurement scalars may be wider than source constants.
  // Preserve the source validator's 128-digit limit; the interpreter itself
  // enforces its original 4096-bit arithmetic ceiling on this bounded string.
  if(typeof value!=="string"||!/^-(?:0|[1-9][0-9]{0,1233})(?:\/[1-9][0-9]{0,1233})?$/.test(value)
    &&!/^(?:0|[1-9][0-9]{0,1233})(?:\/[1-9][0-9]{0,1233})?$/.test(value))throw Error("rational_literal_invalid");
  const result=deriveQuantities({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"scalar",value}]},
    {schemaVersion:1,registers:[],blocks:[],outputs:[{label:"value",source:"scalar"}]},{tick,operandMemo});
  if(result.status!=="CONSTRUCTED"||!result.payload.outputs)throw Error("rational_literal_insufficient");
  return result.payload.outputs[0].value;
}
interface Rational { n: bigint; d: bigint }
export const EXACT_OPERAND_MEMO_POLICY=Object.freeze({version:"nyx-exact-operand-memo/1",maxEntries:256,maxRetainedUnits:262144,
  scope:"ONE_OWNER_EXACT_INTERPRETER_PARSE_REUSE_NOT_AUTHORITY",grantsAuthority:false});
export interface ExactOperandMemo {
  readonly version:typeof EXACT_OPERAND_MEMO_POLICY.version;
  statistics():{readonly hits:number;readonly misses:number;readonly evictions:number;readonly entries:number;readonly retainedUnits:number};
}
type OperandEntry={readonly value:Rational;readonly retainedUnits:number};
const operandMemos=new WeakMap<ExactOperandMemo,{owner:()=>void;entries:Map<string,OperandEntry>;hits:number;misses:number;evictions:number;retainedUnits:number}>();
/** Opaque trusted object ownership, never a model-supplied cache or cross-task
 * store. Only parsed operands are reused; every actual arithmetic primitive,
 * normalization and original bit check still runs in the SAME interpreter. */
export function createExactOperandMemo(tick:()=>void):ExactOperandMemo {
  if(typeof tick!=="function")throw Error("exact_operand_memo_owner");tick();
  const state={owner:tick,entries:new Map<string,OperandEntry>(),hits:0,misses:0,evictions:0,retainedUnits:0};
  const memo=Object.freeze({version:EXACT_OPERAND_MEMO_POLICY.version,statistics:()=>{tick();return Object.freeze({hits:state.hits,misses:state.misses,evictions:state.evictions,entries:state.entries.size,retainedUnits:state.retainedUnits});}});
  operandMemos.set(memo,state);return memo;
}
/** Every primitive and Euclidean iteration consumes the SAME session's finite work budget. */
export function deriveQuantities(problem: QuantitativeProblem, program: QuantitativeProgram, budget: { tick(): void;operandMemo?:ExactOperandMemo }) {
  const originalBudget=budget,ownerTick=budget.tick;
  const memo=budget.operandMemo===undefined?null:operandMemos.get(budget.operandMemo);
  if(budget.operandMemo!==undefined&&(!memo||memo.owner!==ownerTick))throw Error("exact_operand_memo_owner");
  // Capture identity without losing a method-based budget's original receiver.
  budget=Object.freeze({tick:()=>ownerTick.call(originalBudget),operandMemo:budget.operandMemo});
  const bits = (n: bigint) => (n < 0n ? -n : n).toString(2).length;
  function charge(...values: bigint[]) {
    for (const value of values) {
      const length = bits(value);
      if (length > EXACT_DERIVATION_POLICY.maxIntegerBits) throw new ArithmeticBoundary("INTEGER_BOUND_EXCEEDED");
      for (let at = 0; at < length; at += 64) budget.tick();
    }
  }
  function rational(n: bigint, d: bigint): Rational {
    if (d === 0n) throw new ArithmeticBoundary("DIVISION_BY_ZERO");
    charge(n, d);
    if (d < 0n) { n = -n; d = -d; }
    let a = n < 0n ? -n : n; let b = d;
    while (b !== 0n) { charge(a, b); const remainder = a % b; a = b; b = remainder; }
    return { n: n / a, d: d / a };
  }
  function parse(value: string): Rational {
    if(memo){
      budget.tick();for(let at=0;at<value.length;at+=64)budget.tick();
      const cached=memo.entries.get(value);
      if(cached){memo.hits++;return cached.value;}memo.misses++;
    }
    const [n, d = "1"] = value.split("/"),parsed=rational(BigInt(n),BigInt(d));
    if(memo){
      // Charge measuring/retaining the operand and every eviction. Unsuccessful
      // parsing or an interrupted insertion never installs a partial value.
      budget.tick();const retainedUnits=value.length+bits(parsed.n)+bits(parsed.d);
      for(let at=0;at<retainedUnits;at+=64)budget.tick();
      if(retainedUnits<=EXACT_OPERAND_MEMO_POLICY.maxRetainedUnits){
        while(memo.entries.size>=EXACT_OPERAND_MEMO_POLICY.maxEntries||memo.retainedUnits+retainedUnits>EXACT_OPERAND_MEMO_POLICY.maxRetainedUnits){
          budget.tick();const oldest=memo.entries.keys().next().value!;const old=memo.entries.get(oldest)!;
          memo.entries.delete(oldest);memo.retainedUnits-=old.retainedUnits;memo.evictions++;
        }
        budget.tick();memo.entries.set(value,{value:Object.freeze(parsed),retainedUnits});memo.retainedUnits+=retainedUnits;
      }
    }
    return parsed;
  }
  const show = (v: Rational) => v.d === 1n ? String(v.n) : `${v.n}/${v.d}`;
  const values = new Map<string, Rational>();
  try {
    for (const c of problem.constants) { budget.tick(); values.set(c.id, parse(c.value)); }
    for (const r of program.registers) { budget.tick(); values.set(r.id, values.get(r.source)!); }
    for (const block of program.blocks) for (let iteration = 0; iteration < block.iterations; iteration++) {
      budget.tick();
      const source = block.mode === "SIMULTANEOUS" ? new Map(values) : values;
      for (const step of block.steps) {
        budget.tick(); const left = source.get(step.left)!; const right = source.get(step.right)!;
        charge(left.n, left.d, right.n, right.d);
        let next: Rational;
        switch (step.op) {
          case "ADD": next = rational(left.n * right.d + right.n * left.d, left.d * right.d); break;
          case "SUB": next = rational(left.n * right.d - right.n * left.d, left.d * right.d); break;
          case "MUL": next = rational(left.n * right.n, left.d * right.d); break;
          case "DIV": next = rational(left.n * right.d, left.d * right.n); break;
          case "MIN": next = left.n * right.d <= right.n * left.d ? left : right; break;
          case "MAX": next = left.n * right.d >= right.n * left.d ? left : right; break;
          case "BINOMIAL": {
            if(left.d!==1n||right.d!==1n||left.n<0n||right.n<0n)throw new ArithmeticBoundary("BINOMIAL_REQUIRES_NONNEGATIVE_INTEGERS");
            if(right.n>left.n){next=rational(0n,1n);break;}
            const k=right.n<left.n-right.n?right.n:left.n-right.n;
            if(k>BigInt(EXACT_DERIVATION_POLICY.maxIterations))throw new ArithmeticBoundary("BINOMIAL_ITERATION_BOUND");
            next=rational(1n,1n);
            for(let i=1n;i<=k;i++){budget.tick();next=rational(next.n*(left.n-i+1n),next.d*i);}
            break;
          }
        }
        values.set(step.target, next);
      }
    }
    const outputs = program.outputs.map(o => { budget.tick(); return { label: o.label, value: show(values.get(o.source)!) }; });
    return { status: "CONSTRUCTED" as const, payload: { outputs, arithmetic: "EXACT_RATIONAL",
      scope: EXACT_DERIVATION_POLICY.scope, mathematicalModelIndependentlyVerified: false } };
  } catch (error) {
    if (!(error instanceof ArithmeticBoundary)) throw error;
    return { status: "INSUFFICIENT_EVIDENCE" as const, payload: { errorCode: error.message,
      outputs: null, scope: EXACT_DERIVATION_POLICY.scope, mathematicalModelIndependentlyVerified: false } };
  }
}
