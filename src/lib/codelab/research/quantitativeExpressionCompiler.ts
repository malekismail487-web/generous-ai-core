import { EXACT_DERIVATION_OPERATIONS, EXACT_DERIVATION_POLICY, quantitativeProgramFinding,
  type QuantitativeProblem, type QuantitativeProgram } from "./exactQuantitativeDerivation";

/** Positional, single-assignment arithmetic data. No mutable names, phases,
 * inferred mathematics, algebraic rewrites, new operations or second executor.
 * A string refers ONLY to an original constant; a number refers ONLY to an
 * earlier expression's zero-based position. Every expression is evaluated,
 * including unused ones: the compiler must not hide arithmetic failures.
 */
export const EXPRESSION_COMPILER_POLICY=Object.freeze({version:"nyx-expression-lowering/1",schemaVersion:4,
  maxExpressions:EXACT_DERIVATION_POLICY.maxSteps,maxRegisters:EXACT_DERIVATION_POLICY.maxRegisters,
  maxOutputs:EXACT_DERIVATION_POLICY.maxOutputs,grantsAuthority:false,
  experimental:true,optimization:"LIFETIME_REGISTER_REUSE_ONLY_NO_DEAD_CODE_ELIMINATION"});
export interface QuantitativeExpressionGraph {
  readonly schemaVersion:4;
  readonly expressions:readonly {readonly op:QuantitativeProgram["blocks"][number]["steps"][number]["op"];
    readonly left:string|number;readonly right:string|number}[];
  readonly outputs:readonly {readonly label:string;readonly source:string|number}[];
}
const keys=(v:unknown,n:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)
  &&Object.keys(v).sort().join("\0")===[...n].sort().join("\0");
/** Caller MUST first apply the existing native plain-data, byte and depth guard.
 * All validation is structural; no candidate can inject constants or change scope.
 * Register spilling is forbidden: excess pressure rejects, never writes memory.
 */
export function lowerQuantitativeExpressions(problem:QuantitativeProblem,value:unknown):QuantitativeProgram {
  const fail=(code:string):never=>{throw Error(`quantitative_expressions_invalid:${code}`);};
  if(!keys(value,["schemaVersion","expressions","outputs"])||value.schemaVersion!==4
    ||!Array.isArray(value.expressions)||value.expressions.length>EXPRESSION_COMPILER_POLICY.maxExpressions
    ||!Array.isArray(value.outputs)||value.outputs.length<1||value.outputs.length>EXPRESSION_COMPILER_POLICY.maxOutputs)return fail("SHAPE_OR_BOUND");
  const constants=new Set(problem.constants.map(c=>c.id)), count=value.expressions.length;
  const lastUse=Array.from({length:count},(_,i)=>i);
  const source=(v:unknown,before:number):v is string|number=>typeof v==="string"?constants.has(v)
    :Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<before;
  for(const [i,e] of value.expressions.entries()) {
    if(!keys(e,["op","left","right"])||!(EXACT_DERIVATION_OPERATIONS as readonly unknown[]).includes(e.op))return fail("EXPRESSION_SHAPE");
    for(const operand of [e.left,e.right]) {
      if(!source(operand,i))return fail("SOURCE_NOT_BOUND");
      if(typeof operand==="number")lastUse[operand]=i;
    }
  }
  const labels=new Set<string>();
  for(const o of value.outputs) {
    if(!keys(o,["label","source"])||typeof o.label!=="string"||!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(o.label)
      ||labels.has(o.label)||!source(o.source,count))return fail("OUTPUT_BINDING");
    labels.add(o.label);if(typeof o.source==="number")lastUse[o.source]=count;
  }
  const names=Array.from({length:EXPRESSION_COMPILER_POLICY.maxRegisters+constants.size},(_,i)=>`q${i}`)
    .filter(id=>!constants.has(id)).slice(0,EXPRESSION_COMPILER_POLICY.maxRegisters);
  const locations=new Map<number,string>(), live=new Map<number,string>(), used=new Set<string>();
  const steps:QuantitativeProgram["blocks"][number]["steps"][number][]=[];
  const resolve=(s:string|number)=>typeof s==="string"?s:locations.get(s)??fail("INTERNAL_BINDING");
  for(const [i,raw] of value.expressions.entries()) {
    const e=raw as QuantitativeExpressionGraph["expressions"][number];
    // Resolve operands BEFORE freeing their last-read register. The native
    // sequential interpreter reads both operands before writing the target.
    const left=resolve(e.left),right=resolve(e.right);
    for(const [position] of live)if(lastUse[position]<=i)live.delete(position);
    const occupied=new Set(live.values()),target=names.find(n=>!occupied.has(n))??fail("REGISTER_PRESSURE");
    used.add(target);locations.set(i,target);live.set(i,target);
    steps.push({target,op:e.op,left,right});
  }
  const program:QuantitativeProgram={schemaVersion:1,
    registers:names.filter(id=>used.has(id)).map(id=>({id,source:problem.constants[0].id})),
    blocks:steps.length?[{iterations:1,mode:"SEQUENTIAL",steps}]:[],
    outputs:(value.outputs as unknown as QuantitativeExpressionGraph["outputs"]).map(o=>({label:o.label,source:resolve(o.source)}))};
  if(quantitativeProgramFinding(problem,program)!==null)return fail("LOWERED_PROGRAM_REJECTED");
  return program;
}
export function quantitativeExpressionSchema(labels:readonly string[],constantIds:readonly string[]) {
  const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  const source={anyOf:[{type:"string",enum:constantIds},{type:"integer",minimum:0,maximum:EXPRESSION_COMPILER_POLICY.maxExpressions-1}]};
  return object({schemaVersion:{type:"integer",enum:[4]},
    expressions:{type:"array",minItems:0,maxItems:EXPRESSION_COMPILER_POLICY.maxExpressions,
      items:object({op:{type:"string",enum:EXACT_DERIVATION_OPERATIONS},left:source,right:source})},
    outputs:{type:"array",minItems:1,maxItems:EXPRESSION_COMPILER_POLICY.maxOutputs,
      items:object({label:{type:"string",enum:labels},source})}});
}
