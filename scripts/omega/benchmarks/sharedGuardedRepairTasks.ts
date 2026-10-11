import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration } from "./v3NativeReasoningTransferTasks";
import { guardedRepairPairAssessment } from "./guardedRepairFreshTasks";

export const SHARED_GUARDED_REPAIR_EPOCH = Object.freeze({
  version: "nyx-shared-live-candidate-guarded-repair/1", admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 2, predeclaredRepeats: 2, authoredCandidates: false,
  changedVariable: "V3_VS_V4_GUARDED_PROPOSAL_GRAMMAR_WITH_SOURCE_SELECTION_IN_BOTH_ARMS",
  initialCandidate: "ONE_SHARED_LIVE_NYX_FIRST_ATTEMPT_NO_ALGORITHM_SEED",
  replay: "E3_EXISTING_SUPPLIED_CANDIDATE_COMPOSITION_NOT_ADDITIONAL_LIVE_INFERENCE",
  criterion: "BOTH_REPEATS_GAIN_IN_BOTH_DOMAINS_WITH_IDENTICAL_INITIAL_QUALITY_REJECTION_MATCHED_REPAIR_COMPUTE_AND_NO_REGRESSION",
  limitations: "Same-author synthetic engineering tasks; conditional repair comparison, not an official benchmark. Pretraining exposure unknown. Replaying a live-generated candidate does not create a new E4 generation. Source-bound selected replacements originate in the host proposer. No broad or default promotion.",
});
export function sharedGuardedRepairConfiguration(variant: string) {
  if (!["V3_CONTROL", "V4_COVERAGE"].includes(variant)) throw Error("shared_guarded_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    localRefactorGuidance: variant === "V3_CONTROL" ? "EVALUATION_ORDER_PROPOSALS" as const
      : "EXTENDED_EVALUATION_ORDER_PROPOSALS" as const,
    localRefactorSelection: "SOURCE_BOUND_REFERENCES" as const };
}
export interface SharedGuardedWireControl {
  model: unknown; maxTokens: unknown; temperature: unknown; effort: unknown; reasoningBudget: unknown;
  initialCandidateState: boolean; publicAdmissionPolicyId: unknown; legacyLineApplicabilityPresent: boolean;
  originalBudgetPresented: boolean; originalBudgetVersion: unknown; originalBudgetPolicyId: unknown;
  qualityRepairPhase: boolean; localProposalCount: number; localProposalVersion: string | null;
  proposerVersion: string | null; selectionBranchOffered: boolean; selectionBindingDigest: string | null;
  promptDigest: string; schemaDigest: string;
}
export function sharedGuardedWireVerified(variant: "SHARED_INITIAL" | "V3_CONTROL" | "V4_COVERAGE",
  controls: readonly SharedGuardedWireControl[]) {
  if (!["SHARED_INITIAL", "V3_CONTROL", "V4_COVERAGE"].includes(variant) || controls.length !== 1) return false;
  const c=controls[0], initial=variant === "SHARED_INITIAL";
  if (c.model !== "nvidia/nemotron-3-super-120b-a12b" || c.maxTokens !== 8192 || c.temperature !== 0
    || c.effort !== "high" || c.reasoningBudget !== 2048 || c.publicAdmissionPolicyId !== SHARED_GUARDED_REPAIR_EPOCH.admissionPolicyId
    || c.legacyLineApplicabilityPresent || c.initialCandidateState !== initial
    || !/^[a-f0-9]{64}$/.test(c.promptDigest) || !/^[a-f0-9]{64}$/.test(c.schemaDigest)
    || !Number.isSafeInteger(c.localProposalCount) || c.localProposalCount < 0 || c.localProposalCount > 8) return false;
  if (initial && (!c.originalBudgetPresented || c.originalBudgetVersion !== "nyx-original-state-quality-budget/2"
    || c.originalBudgetPolicyId !== SHARED_GUARDED_REPAIR_EPOCH.admissionPolicyId || c.qualityRepairPhase)) return false;
  if (!initial && (c.originalBudgetPresented || c.originalBudgetVersion !== null || c.originalBudgetPolicyId !== null)) return false;
  if (c.localProposalCount === 0) return c.localProposalVersion === null && c.proposerVersion === null
    && !c.selectionBranchOffered && c.selectionBindingDigest === null;
  return !initial && c.qualityRepairPhase && c.selectionBranchOffered
    && c.localProposalVersion === (variant === "V3_CONTROL" ? "nyx-source-bound-refactor-selection/1" : "nyx-source-bound-refactor-selection/2")
    && c.proposerVersion === (variant === "V3_CONTROL" ? null : "nyx-local-refactor-proposals/4")
    && /^[a-f0-9]{64}$/.test(c.selectionBindingDigest ?? "");
}
export function sharedGuardedPairAssessment(common: {
  sourceDigest?: string | null; liveEvidenceClass?: string | null; stable?: boolean;
}, control: Parameters<typeof guardedRepairPairAssessment>[0],
treatment: Parameters<typeof guardedRepairPairAssessment>[1], matchedRepairCompute: boolean) {
  const initial=control?.perIteration?.[0], other=treatment?.perIteration?.[0];
  const liveSourceBound=common.liveEvidenceClass === "E4" && common.stable === true
    && /^[a-f0-9]{64}$/.test(common.sourceDigest ?? "")
    && common.sourceDigest === initial?.candidateSourceDigest && common.sourceDigest === other?.candidateSourceDigest;
  return { ...guardedRepairPairAssessment(control,treatment,liveSourceBound && matchedRepairCompute), liveSourceBound };
}

// Independent oracle: binary GCD and unreduced prefix common denominators.
function binaryGcd(a: bigint, b: bigint): bigint {
  a=a<0n?-a:a; b=b<0n?-b:b;
  if(!a)return b;if(!b)return a;
  let common=0n;
  while(!((a|b)&1n)){a>>=1n;b>>=1n;common++;}
  while(!(a&1n))a>>=1n;
  while(b){while(!(b&1n))b>>=1n;if(a>b)[a,b]=[b,a];b-=a;}
  return a<<common;
}
function rationalPrefixes(input: string[][]): [string,string[]] {
  const prefixes=input.map((_,last)=>{
    const terms=input.slice(0,last+1).map(([n,d])=>[BigInt(n),BigInt(d)]);
    let denominator=terms.reduce((product,term)=>product*term[1],1n);
    let numerator=terms.reduce((sum,[n,d])=>sum+n*(denominator/d),0n);
    if(denominator<0n){numerator=-numerator;denominator=-denominator;}
    const divisor=binaryGcd(numerator,denominator);
    return `${numerator/divisor}/${denominator/divisor}`;
  });
  return [prefixes.at(-1)??"0/1",prefixes];
}
type Event = {id:string;clock:number[]};
// Independent finite-set embedding oracle; witness compares vector coordinates directly.
function causalFrontier(input: Event[]): [string[],number,number] {
  const downsets=input.map(event=>{
    const points=new Set<string>();
    const visit=(prefix:number[],axis:number)=>{
      if(axis===event.clock.length){points.add(prefix.join(","));return;}
      for(let value=0;value<=event.clock[axis];value++)visit([...prefix,value],axis+1);
    };
    visit([],0);return points;
  });
  const subset=(a:Set<string>,b:Set<string>)=>[...a].every(point=>b.has(point));
  let incomparable=0,equal=0;
  for(let i=0;i<input.length;i++)for(let j=i+1;j<input.length;j++){
    const ij=subset(downsets[i],downsets[j]),ji=subset(downsets[j],downsets[i]);
    if(ij&&ji)equal++;else if(!ij&&!ji)incomparable++;
  }
  const ids=input.filter((_,i)=>!downsets.some((other,j)=>j!==i
    &&downsets[i].size<other.size&&subset(downsets[i],other))).map(event=>event.id).sort();
  return [ids,incomparable,equal];
}
const rationalInputs: string[][][] = [[],[["0","-3"]],[["1","2"],["1","-2"]],
  [["9007199254740993","7"],["-9007199254740992","7"]],
  [["-5","-6"],["7","-9"],["-1","18"]],
  ...Array.from({length:7},(_,seed)=>Array.from({length:seed%5+1},(_,index)=>
    [String((seed-3)*(index+1)),String((index+2)*(seed%2?-1:1))]))];
const causalInputs: Event[][] = [[],[{id:"a",clock:[0]}],
  [{id:"z",clock:[1,1]},{id:"a",clock:[1,1]},{id:"b",clock:[2,0]}],
  [{id:"a",clock:[0,0,0,0]},{id:"b",clock:[1,2,3,0]},{id:"c",clock:[2,1,0,3]}],
  ...Array.from({length:8},(_,seed)=>Array.from({length:seed%6+1},(_,index)=>({
    id:String.fromCharCode(122-index),clock:Array.from({length:seed%4+1},(_,axis)=>(seed+index*(axis+1))%4)})))];
const boundary=" Preserve input and independently own all returned arrays. Retain the named ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.";
export const SHARED_GUARDED_REPAIR_TASKS: readonly RepresentationTask[] = [
  {id:"EXACT-RATIONAL-PREFIX-BALANCES",tier:"DEVELOPMENT",domain:"EXACT_SIGNED_RATIONAL_STATE",
    objective:"Implement transform(input) for zero to six pairs [numerator,denominator] of signed decimal integer strings with absolute value at most 10^30; denominators are nonzero and may be negative. Sum terms exactly, never converting large integers to Number. Return [canonicalTotal,canonicalPrefixes], where canonicalPrefixes contains the running sum after each term. Each canonical fraction is the string N/D in lowest terms with positive denominator, and zero is 0/1. Empty input returns [\"0/1\",[]]."+boundary,
    publicCases:[{input:[["1","2"],["1","3"]],expected:["5/6",["1/2","5/6"]]},
      {input:[["2","-4"],["3","6"]],expected:["0/1",["-1/2","0/1"]]}],
    privateCases:rationalInputs.map(input=>({input,expected:rationalPrefixes(input)}))},
  {id:"VECTOR-CLOCK-CAUSAL-FRONTIER",tier:"VALIDATION",domain:"PARTIAL_ORDER_CONCURRENCY",
    objective:"Implement transform(input) for zero to six events {id,clock}. IDs are distinct lowercase ASCII strings. All clocks have the same length 1..4 and integer components 0..3. A strictly precedes B iff every A component is <= the corresponding B component and at least one is smaller. Return [frontierIds,incomparablePairs,equalPairs]. frontierIds includes every event not strictly preceding another, sorted lexicographically, retaining distinct IDs even for equal clocks. Count unordered pairs: equal clocks count only as equalPairs; unequal clocks where neither strictly precedes the other count as incomparablePairs. Empty input returns [[],0,0]."+boundary,
    publicCases:[{input:[{id:"a",clock:[1,0]},{id:"b",clock:[0,1]},{id:"c",clock:[1,1]}],expected:[["c"],1,0]},
      {input:[{id:"z",clock:[1]},{id:"a",clock:[1]}],expected:[["a","z"],0,1]}],
    privateCases:causalInputs.map(input=>({input,expected:causalFrontier(input)}))},
];
export function sharedGuardedRepairTasks(): RepresentationTask[] {
  return SHARED_GUARDED_REPAIR_TASKS.flatMap(task=>[1,2].map(repeat=>({...task,id:`${task.id}-REPEAT-${repeat}`})));
}
