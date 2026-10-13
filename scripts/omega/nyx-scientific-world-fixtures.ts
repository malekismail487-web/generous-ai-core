import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { ScientificModelTask } from "../../src/lib/codelab/research/scientificModelGeneration";

export const SCIENCE_EPOCH=immutableTheoryValue({version:"nyx-prospective-generated-models/2",model:"nvidia/nemotron-3-super-120b-a12b",
  arms:["DIRECT_REVIEW","NATIVE_FORECASTS","NATIVE_EVIDENCE_GUIDANCE"],maxSeedCalls:2,maxActionCalls:4,maxRegenerationCalls:1,
  maxExperimentsPerArm:2,maxArmMs:240000,maxSeedMs:180000,maxEpochMs:1800000,maxOutputTokens:8192,reasoningControl:"SUPER_HOSTED_NATIVE",reasoningBudgetTokens:2048,
  maxModelRequests:8,maxNativeWorkUnitsPerArm:150000,maxNativeElapsedMsPerArm:2500,maxPhysicalCalls:51,maxHttpAttempts:51,
  replayTimeoutMs:5000,realizedTokenMatchTolerance:0.05,
  changedVariable:"POST_GENERATION_FORECAST_TOOLS_AND_OWNED_EVIDENCE_GUIDANCE",
  baseline:"DIRECT_REVIEW_AFTER_SHARED_TOOL_CHECKED_GENERATION_NOT_FULL_UNTOOLED_NEMOTRON",
  control:"NATIVE_FORECASTS_HAS_SAME_TOOLS_AS_NATIVE_EVIDENCE_GUIDANCE",
  sharedPrefix:"CHARGE_COMPLETE_GENERATION_NATIVE_AND_REPLAY_COST_TO_EACH_ARM_PHYSICAL_COST_ONCE",
  scope:"THREE_FRESH_DETERMINISTIC_COMPUTATIONAL_WORLDS_NOT_ORIGINAL_DISCOVERY_OR_OFFICIAL_BENCHMARK",
  promotion:"NONE_PILOT_REQUIRES_TRANSFER_REPLICATION_AND_STRONGER_CONTROLS",defaultUltraChanged:false,authorityIncrease:false});
export interface ScienceWorld {
  readonly taskId:string;readonly family:string;
  /** Author/evaluator data NEVER supplied to NYX cognition. */
  readonly hidden:{kind:"TRANSPORT"|"POTENTIAL"|"TRANSITION";a:string;b:string;c:string};
  readonly calibration:readonly (readonly [string,string])[];
  readonly probes:readonly (readonly [string,string])[];
  readonly heldout:readonly (readonly [string,string])[];
}
export const SCIENCE_WORLDS=immutableTheoryValue([
  {taskId:"SCI-TRANSPORT",family:"SATURATING_RESPONSE_PLUS_CONTROL",hidden:{kind:"TRANSPORT",a:"7/13",b:"3/5",c:"-2/11"},
    calibration:[["1/5","0"],["2/5","0"],["4/5","0"],["1/5","1"],["4/5","-1"]],
    probes:[["1/5","0"],["3/7","2/3"],["9/5","-3/4"]],heldout:[["5/11","2/7"],["11/8","-7/9"],["17/13","5/6"],["3/2","-2/5"],["8/3","1/7"]]},
  {taskId:"SCI-POTENTIAL",family:"COUPLED_QUADRATIC_AND_LINEAR_RESPONSE",hidden:{kind:"POTENTIAL",a:"5/7",b:"-3/11",c:"2/13"},
    calibration:[["0","0"],["1","1"],["1","0"],["0","1"],["2","2"]],
    probes:[["1","1"],["3/5","-2/7"],["-4/3","5/8"]],heldout:[["7/11","4/9"],["-5/6","2/13"],["11/7","-3/5"],["3/4","8/9"],["-7/3","-2/5"]]},
  {taskId:"SCI-TRANSITION",family:"NONLINEAR_ONE_STEP_STATE_RESPONSE",hidden:{kind:"TRANSITION",a:"11/17",b:"-5/19",c:"2/23"},
    calibration:[["0","0"],["0","1"],["1","0"],["-1","0"],["2","0"]],
    probes:[["0","1"],["3/7","2/5"],["-5/4","-3/8"]],heldout:[["9/11","-4/7"],["-7/9","5/13"],["13/8","3/11"],["-11/6","-7/5"],["2/3","4/9"]]},
] satisfies ScienceWorld[]);
export const SCIENCE_CORPUS_DIGEST=theoryDigest(SCIENCE_WORLDS);

/** Independent author simulator, not a candidate-program interpreter. Its
 * source and coefficients stay outside the cognition/tool inspection surface.
 * Python's separately implemented Fraction oracle confirms all measurements.
 */
export const SCIENCE_SIMULATOR_SOURCE=`
function q(n,d=1n){if(d===0n)throw Error("zero_divisor");if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){let r=a%b;a=b;b=r;}return[n/a,d/a];}
const parse=s=>{const[n,d="1"]=s.split("/");return q(BigInt(n),BigInt(d));};
const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),sub=(a,b)=>q(a[0]*b[1]-b[0]*a[1],a[1]*b[1]);
const mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]),div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);
function calculate(h,point){const[x,y]=point.map(parse),a=parse(h.a),b=parse(h.b),c=parse(h.c),one=parse("1");
 if(h.kind==="TRANSPORT")return add(div(mul(a,x),add(b,x)),mul(c,y));
 if(h.kind==="POTENTIAL"){const d=sub(x,y);return add(add(mul(a,mul(d,d)),mul(b,add(x,y))),c);}
 if(h.kind==="TRANSITION")return div(add(mul(a,x),mul(b,y)),add(one,mul(c,mul(x,x))));
 throw Error("world_not_supported");}
const show=v=>v[1]===1n?String(v[0]):String(v[0])+"/"+String(v[1]);
`;
export function scienceInputs(point:readonly [string,string]){return[{id:"x",value:point[0]},{id:"y",value:point[1]}];}
export function scienceTask(world:ScienceWorld,candidate:string,at:number,expires:number,measurements:readonly string[]):ScientificModelTask{
  if(measurements.length!==world.calibration.length)throw Error("calibration_population");
  const observations=world.calibration.map((point,i)=>({pointId:`Cal${i}`,inputs:scienceInputs(point),output:measurements[i],evidenceRef:`CAL-${world.taskId}-${i}`}));
  return{schemaVersion:1,objective:{schemaVersion:1,researchId:world.taskId,objective:"Investigate an unknown deterministic normalized response of two controlled inputs x and y. Infer competing executable response models from the admitted measurements. Use prospective evidence to revise what remains plausible, never assert global causal truth from finite samples.",
    domain:"SCIENCE",candidateBinding:candidate,scope:["src/marker.txt"],successCriteria:["All future responses are committed before observing them; conclusion remains a bounded hypothesis subject to independent held-out evaluation."],expiryEpochMs:expires,
    admittedEvidence:observations.map(o=>({evidenceId:o.evidenceRef,evidenceClass:"E3",kind:"OBSERVATION",summary:"Exact deterministic author-simulator calibration, independently reconciled; not a physical observation.",
      contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output}),provenanceRoot:`CALIBRATION-${world.taskId}`,freshnessDependencies:[`CANDIDATE:${candidate}`],observedAtEpochMs:at,candidateBinding:candidate,grantsAuthority:false}))},
    variables:["x","y"],constants:[{id:"zero",value:"0"},{id:"one",value:"1"}],observations,
    experiments:world.probes.map((point,i)=>({experimentId:`Probe${i}`,toolId:`MEASURE-${world.taskId}-${i}`,question:"Measure the exact normalized response at these predeclared inputs.",inputs:scienceInputs(point),costUnits:1,authority:"RUN_TEST_IN_SANDBOX",scope:["src/marker.txt"],mutatesCandidate:false}))};
}
