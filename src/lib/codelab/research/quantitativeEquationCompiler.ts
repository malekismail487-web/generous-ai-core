import { quantitativeProgramFinding, type QuantitativeProblem, type QuantitativeProgram } from "./exactQuantitativeDerivation";

/** A finite equation language, lowered into the EXISTING exact interpreter. No new executor.
 * Expressions are immutable within each phase; updates commit together after all expressions.
 * Phases run in order, so sequential and synchronous systems are represented without scratch writes.
 */
export const EQUATION_COMPILER_POLICY=Object.freeze({version:"nyx-equation-lowering/1",schemaVersion:2,
  stateSlots:16,expressionSlotsPerPhase:16,maxPhasesPerCycle:8,maxCycles:16,
  defaultState:"EXPLICIT_ZERO_INITIALIZED_SLOTS",grantsAuthority:false});
export interface QuantitativeEquations {
  readonly schemaVersion:2;
  readonly initialState:readonly {readonly slot:string;readonly source:string}[];
  readonly cycles:readonly {readonly iterations:number;readonly phases:readonly {
    readonly expressions:readonly {readonly id:string;readonly op:QuantitativeProgram["blocks"][number]["steps"][number]["op"];
      readonly left:string;readonly right:string}[];
    readonly updates:readonly {readonly slot:string;readonly source:string}[];
  }[]}[];
  readonly outputs:QuantitativeProgram["outputs"];
}
export function equationNames(constants:readonly string[]) {
  const names=(prefix:string,excluded:readonly string[])=>Array.from({length:64},(_,i)=>`${prefix}${i}`).filter(n=>!excluded.includes(n)).slice(0,16);
  const state=names("r",constants);const expressions=names("e",[...constants,...state]);
  return {state,expressions,temporary:names("t",[...constants,...state,...expressions])};
}
const keys=(v:unknown,names:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)
  &&Object.keys(v).sort().join("\0")===[...names].sort().join("\0");
const boundedArray=(v:unknown,max:number,min=0):v is unknown[]=>Array.isArray(v)&&v.length>=min&&v.length<=max;
const ops=new Set(["ADD","SUB","MUL","DIV","MIN","MAX"]);
/** Caller rejects accessors/host objects, cycles, and input-byte overflow before entering this compiler. */
export function lowerQuantitativeEquations(problem:QuantitativeProblem,value:unknown):QuantitativeProgram {
  const fail=(code:string):never=>{throw Error(`quantitative_equations_invalid:${code}`);};
  if(!keys(value,["schemaVersion","initialState","cycles","outputs"])||value.schemaVersion!==2
    ||!boundedArray(value.initialState,16)||!boundedArray(value.cycles,16,1)||!boundedArray(value.outputs,16,1))return fail("SHAPE");
  const constantIds=problem.constants.map(c=>c.id);const constants=new Set(constantIds);
  const zero=problem.constants.find(c=>/^-?0(?:\/[1-9][0-9]*)?$/.test(c.value))?.id;
  if(!zero)return fail("ZERO_CONSTANT_REQUIRED");
  const {state,expressions,temporary}=equationNames(constantIds);
  const mutable=new Set(state);const named=new Set([...state,...constantIds]);
  const initial=new Map<string,string>();
  for(const item of value.initialState) {
    if(!keys(item,["slot","source"])||typeof item.slot!=="string"||!mutable.has(item.slot)
      ||typeof item.source!=="string"||!constants.has(item.source)||initial.has(item.slot))return fail("INITIAL_BINDING");
    initial.set(item.slot,item.source);
  }
  const registers=[...state.map(id=>({id,source:initial.get(id)??zero})),...temporary.map(id=>({id,source:zero}))];
  const blocks:QuantitativeProgram["blocks"][number][]=[];let totalSteps=0;
  for(const cycle of value.cycles) {
    if(!keys(cycle,["iterations","phases"])||!Number.isSafeInteger(cycle.iterations)||Number(cycle.iterations)<1
      ||Number(cycle.iterations)>1024||!boundedArray(cycle.phases,8,1))return fail("CYCLE_BOUND");
    const steps:QuantitativeProgram["blocks"][number]["steps"][number][]=[];
    for(const phase of cycle.phases) {
      if(!keys(phase,["expressions","updates"])||!boundedArray(phase.expressions,16)||!boundedArray(phase.updates,16,1))return fail("PHASE_BOUND");
      const bindings=new Map<string,string>();
      const resolve=(source:unknown):string=>{
        if(typeof source!=="string")return fail("SOURCE_TYPE");
        if(named.has(source))return source;
        return bindings.get(source)??fail("EXPRESSION_SOURCE_NOT_BOUND");
      };
      for(const [index,expression] of phase.expressions.entries()) {
        if(!keys(expression,["id","op","left","right"])||typeof expression.id!=="string"
          ||!expressions.includes(expression.id)||bindings.has(expression.id)||typeof expression.op!=="string"||!ops.has(expression.op))return fail("EXPRESSION_SHAPE");
        const left=resolve(expression.left);const right=resolve(expression.right);const target=temporary[index];
        steps.push({target,op:expression.op as QuantitativeProgram["blocks"][number]["steps"][number]["op"],left,right});
        bindings.set(expression.id,target);
      }
      const updated=new Set<string>();
      // Every node has already been evaluated; state-to-state copies need snapshots too.
      const updates=phase.updates.map(update=>{
        if(!keys(update,["slot","source"])||typeof update.slot!=="string"||!mutable.has(update.slot)||updated.has(update.slot))return fail("UPDATE_TARGET");
        updated.add(update.slot);return {target:update.slot,source:resolve(update.source)};
      });
      const stateCopies=updates.filter(u=>mutable.has(u.source));
      const scratch=new Map<string,string>();let scratchAt=phase.expressions.length;
      for(const update of stateCopies)if(!scratch.has(update.source)) {
        if(scratchAt>=temporary.length)return fail("SNAPSHOT_CAPACITY");
        const target=temporary[scratchAt++];steps.push({target,op:"ADD",left:update.source,right:zero});scratch.set(update.source,target);
      }
      for(const update of updates)steps.push({target:update.target,op:"ADD",left:scratch.get(update.source)??update.source,right:zero});
    }
    totalSteps+=steps.length;if(totalSteps>64)return fail("LOWERED_STEP_BOUND");
    blocks.push({iterations:Number(cycle.iterations),mode:"SEQUENTIAL",steps});
  }
  const outputs=value.outputs.map(output=>{
    if(!keys(output,["label","source"])||typeof output.label!=="string"||typeof output.source!=="string"||!named.has(output.source))return fail("OUTPUT_BINDING");
    return {label:output.label,source:output.source};
  });
  const program:QuantitativeProgram={schemaVersion:1,registers,blocks,outputs};
  if(quantitativeProgramFinding(problem,program)!==null)return fail("LOWERED_PROGRAM_REJECTED");
  return program;
}
