import {immutableTheoryValue,theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import type {ScientificModelTask} from "../../src/lib/codelab/research/scientificModelGeneration";
import type {ScientificOracleCase} from "./nyx-scientific-world-live-eval";

export const SCIENTIFIC_FIT_EPOCH=immutableTheoryValue({version:"nyx-fresh-scientific-fit/1",model:"nvidia/nemotron-3-super-120b-a12b",
  arms:["LITERAL_GENERATION","NATIVE_FIT","SAME_TOOL_FIRST_NON_REFUTED"],maxGenerationCalls:2,maxSelectionCalls:1,
  maxOutputTokens:8192,reasoningControl:"SUPER_HOSTED_NATIVE",reasoningBudgetTokens:2048,
  maxModelRequests:8,maxNativeWorkUnits:300000,maxNativeElapsedMs:3000,maxGenerationMs:240000,maxSelectionMs:120000,maxEpochMs:1800000,
  maxPhysicalCalls:48,maxHttpAttempts:48,replayTimeoutMs:5000,realizedTokenMatchTolerance:0.05,
  primaryMetric:"INDEPENDENT_ALL_POINT_ACCEPTANCE_OF_PRECOMMITTED_SELECTED_MODEL",
  changedVariable:"LITERAL_GENERATION_VERSUS_MODEL_AUTHORED_STRUCTURE_WITH_EXACT_FITTING",
  selectionAblation:"SAME_NATIVE_GENERATION_AND_OBSERVATION_PREFIX_WITHOUT_SELECTION_INFERENCE",
  prospectivePolicy:"ONE_FIXED_PREDECLARED_PROBE_PER_GENERATION_PREFIX_NOT_ADAPTIVE_DESIGN",
  repairFeedback:"CALIBRATION_AND_TYPED_ADMISSION_ONLY_NEVER_HELDOUT_GRADES",
  scope:"EIGHT_FRESH_STRUCTURAL_CASES_FOUR_FAMILIES_NOT_CROSS_DOMAIN_SCIENCE_OR_OFFICIAL_BENCHMARK",
  promotion:"NONE_SMALL_PILOT_REQUIRES_FRESH_REPLICATION_AND_FULL_PROGRAM_GATES",authorityIncrease:false,defaultUltraChanged:false});
export interface ScientificFitWorld extends ScientificOracleCase {
  readonly hidden:{readonly kind:"BILINEAR"|"INVERSE_CHANNELS"|"MIXED_CUBIC"|"CROSS_RATIO";readonly a:string;readonly b:string;readonly c:string;readonly d:string};
}
const grid=[['0','0'],['1','0'],['0','1'],['1','1'],['2','-1'],['-1','2']] as const;
const cubic=[['0','0'],['1','0'],['0','1'],['1','1'],['2','1'],['1','2']] as const;
const inverse=[['1','1'],['1','2'],['2','1'],['2','3'],['3','2'],['4','5']] as const;
const probes=[['3/5','2/7'],['7/3','-4/5'],['-5/4','9/7']] as const;
const hold=[['11/8','3/7'],['-2/9','5/6'],['7/4','-3/8'],['13/7','2/5'],['-9/5','11/6']] as const;
const kinds=['BILINEAR','INVERSE_CHANNELS','MIXED_CUBIC','CROSS_RATIO'] as const;
const coefficients=[['3/7','-5/11','2/13','7/17'],['-7/19','11/23','-3/29','5/31']] as const;
export const SCIENTIFIC_FIT_WORLDS=immutableTheoryValue(kinds.flatMap((kind,family)=>coefficients.map((v,index)=>({
  taskId:`FRESH-FIT-${family+1}-${index+1}`,family:kind,hidden:{kind,a:v[(family)%4],b:v[(family+1)%4],c:v[(family+2)%4],d:v[(family+3)%4]},
  calibration:kind==='INVERSE_CHANNELS'?inverse:kind==='MIXED_CUBIC'?cubic:grid,
  probes:kind==='INVERSE_CHANNELS'?probes.map(p=>p.map(s=>s.startsWith('-')?s.slice(1):s) as [string,string]):probes,
  heldout:kind==='INVERSE_CHANNELS'?hold.map(p=>p.map(s=>s.startsWith('-')?s.slice(1):s) as [string,string]):hold,
}))) satisfies ScientificFitWorld[]);
export const SCIENTIFIC_FIT_CORPUS_DIGEST=theoryDigest(SCIENTIFIC_FIT_WORLDS);
export function scientificFitTask(w:ScientificFitWorld,candidate:string,at:number,expires:number,values:readonly string[]):ScientificModelTask{
  if(values.length!==w.calibration.length)throw Error("fit_calibration_population");
  const observations=w.calibration.map((p,i)=>({pointId:`Cal${i}`,inputs:[{id:'x',value:p[0]},{id:'y',value:p[1]}],output:values[i],evidenceRef:`CAL-${w.taskId}-${i}`}));
  return{schemaVersion:1,variables:['x','y'],constants:[{id:'zero',value:'0'},{id:'one',value:'1'}],observations,
    objective:{schemaVersion:1,researchId:w.taskId,objective:"Infer an executable deterministic rational response of two normalized controlled inputs from admitted measurements. Commit point predictions before the prospective measurement; preserve uncertainty about global/causal validity.",domain:'SCIENCE',
      candidateBinding:candidate,scope:['src/marker.txt'],successCriteria:['A selected hypothesis must pass independent exact calibration, prospective and withheld point predictions; this does not establish causal truth or novelty.'],expiryEpochMs:expires,
      admittedEvidence:observations.map(o=>({evidenceId:o.evidenceRef,evidenceClass:'E3',kind:'OBSERVATION',summary:'Exact computational calibration independently reconciled with author simulator, not physical laboratory observation.',
        contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output}),provenanceRoot:`CALIBRATION-${w.taskId}`,freshnessDependencies:[`CANDIDATE:${candidate}`],observedAtEpochMs:at,candidateBinding:candidate,grantsAuthority:false}))},
    experiments:w.probes.map((p,i)=>({experimentId:`Probe${i}`,toolId:`MEASURE-${w.taskId}-${i}`,question:'Measure normalized response at these predeclared controlled inputs.',inputs:[{id:'x',value:p[0]},{id:'y',value:p[1]}],costUnits:1,authority:'RUN_TEST_IN_SANDBOX',scope:['src/marker.txt'],mutatesCandidate:false}))};
}
/** Independent author simulator uses the same trusted fixture surface, not
 * candidate source execution or a downloadable artificial brain. */
export const SCIENTIFIC_FIT_SIMULATOR_SOURCE=`
function q(n,d=1n){if(d===0n)throw Error("zero_divisor");if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return[n/a,d/a];}
const parse=s=>{const[n,d="1"]=s.split("/");return q(BigInt(n),BigInt(d));};
const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]),div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);
function calculate(h,p){const[x,y]=p.map(parse),a=parse(h.a),b=parse(h.b),c=parse(h.c),d=parse(h.d),one=parse("1"),xy=mul(x,y);
if(h.kind==="BILINEAR")return add(add(add(mul(a,xy),mul(b,x)),mul(c,y)),d);
if(h.kind==="INVERSE_CHANNELS")return add(add(div(a,x),div(b,y)),div(c,xy));
if(h.kind==="MIXED_CUBIC")return add(add(add(mul(a,mul(mul(x,x),x)),mul(b,mul(x,mul(y,y)))),mul(c,y)),d);
if(h.kind==="CROSS_RATIO")return div(add(add(mul(a,xy),mul(b,add(x,y))),c),add(one,mul(d,xy)));
throw Error("world_not_supported");}
const show=v=>v[1]===1n?String(v[0]):String(v[0])+"/"+String(v[1]);
`;
