import {immutableTheoryValue,theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import type {ScientificOracleCase} from "./nyx-scientific-world-live-eval";
import type {ScientificSearchSpec} from "../../src/lib/codelab/research/scientificModelSearch";
import {SCIENTIFIC_FIT_EPOCH,scientificFitTask} from "./nyx-scientific-fit-fixtures";

export const SCIENTIFIC_SEARCH_EPOCH=immutableTheoryValue({...SCIENTIFIC_FIT_EPOCH,version:"nyx-fresh-scientific-search/1",
  arms:["MODEL_AUTHORED_STRUCTURE","NYX_REQUESTED_SEARCH","FIXED_LEXICOGRAPHIC_SEARCH"],maxPhysicalCalls:36,maxHttpAttempts:36,
  changedVariable:"MODEL_AUTHORED_STRUCTURE_VERSUS_TYPED_SEARCH_REQUEST_VERSUS_FIXED_SAME_TOOL_SEARCH",
  selectionAblation:"FIXED_CONTROL_SELECTS_FIRST_NON_REFUTED_WITHOUT_ADDITIONAL_MODEL_COMPUTE",
  scope:"SIX_FRESH_TWO_INPUT_CASES_THREE_STRUCTURAL_FAMILIES_WITH_ONE_GRAMMAR_BOUNDARY_CONTROL_NOT_ORIGINAL_DISCOVERY",
  promotion:"NONE_PILOT_REQUIRES_REPLICATION_AND_FULL_PROGRAM_GATES"});
export const SCIENTIFIC_FIXED_SEARCH=immutableTheoryValue({schemaVersion:1,nonzeroConstantId:"one",maxDegree:3,includeReciprocals:true,
  allowDenominatorTerms:true,maxCoefficients:4,maxCandidates:128,maxModels:3,strategy:"LEXICOGRAPHIC"}) satisfies ScientificSearchSpec;
const calibration=[["1","1"],["2","1"],["1","2"],["3","2"]] as const;
const probes=[["5/4","3/2"],["7/5","2/3"],["4/3","5/6"]] as const;
const heldout=[["9/7","4/5"],["11/6","8/7"],["3/8","7/9"],["13/5","2/11"],["17/9","11/13"]] as const;
const kinds=["INTERACTION_CUBIC","CONIC_CHANNEL","MIXED_RECIPROCAL"] as const;
const coefficients=[["5/17","-7/23","11/29","2/31"],["-13/37","17/41","-19/43","3/47"]] as const;
export const SCIENTIFIC_SEARCH_WORLDS=immutableTheoryValue(kinds.flatMap((kind,f)=>coefficients.map((v,i)=>({
  taskId:"SEARCH-TRANSFER-"+String(f+1)+"-"+String(i+1),family:kind,hidden:{kind,a:v[0],b:v[1],c:v[2],d:v[3]},calibration,probes,heldout,
})))) satisfies readonly ScientificOracleCase[];
export const SCIENTIFIC_SEARCH_CORPUS_DIGEST=theoryDigest(SCIENTIFIC_SEARCH_WORLDS);
export const scientificSearchTask=scientificFitTask;
// Author simulator runs only in the existing registered R3B fixture.
// NYX receives admitted measurements and inputs, no hidden law or source.
export const SCIENTIFIC_SEARCH_SIMULATOR_SOURCE=[
  "function q(n,d=1n){if(d===0n)throw Error('zero_divisor');if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return[n/a,d/a];}",
  "const parse=s=>{const[n,d='1']=s.split('/');return q(BigInt(n),BigInt(d));};",
  "const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]),div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);",
  "function calculate(h,p){const[x,y]=p.map(parse),a=parse(h.a),b=parse(h.b),c=parse(h.c),d=parse(h.d),one=parse('1');",
  "if(h.kind==='INTERACTION_CUBIC')return add(add(mul(a,mul(mul(x,x),y)),mul(b,mul(y,y))),mul(c,x));",
  "if(h.kind==='CONIC_CHANNEL')return div(add(add(mul(a,x),mul(b,mul(y,y))),c),add(one,mul(d,y)));",
  "if(h.kind==='MIXED_RECIPROCAL')return add(add(mul(a,div(x,y)),mul(b,div(y,x))),div(c,add(x,y)));",
  "throw Error('world_not_supported');}",
  "const show=v=>v[1]===1n?String(v[0]):String(v[0])+'/'+String(v[1]);",
].join("\n");

/** Fresh composition transfer after the development-only scheduling correction.
 * Historical corpus, fixed strategy and simulator above remain immutable.
 * No transfer outcomes are used to tune the native search or live prompts. */
export const SCIENTIFIC_DIAGONAL_TRANSFER_EPOCH=immutableTheoryValue({...SCIENTIFIC_SEARCH_EPOCH,
  version:"nyx-fresh-scientific-diagonal-transfer/1",
  arms:["MODEL_AUTHORED_STRUCTURE","NYX_REQUESTED_SEARCH","FIXED_DIAGONAL_EXACT_SEARCH"],
  scope:"SIX_NEW_COMPOSITIONS_THREE_RATIONAL_GRAMMAR_FAMILIES_NOT_CROSS_DOMAIN_OR_ORIGINAL_DISCOVERY",
  changedVariable:"MODEL_AUTHORED_FORMULATION_VERSUS_NYX_SEARCH_POLICY_SELECTION_VERSUS_FIXED_DIAGONAL_TOOL",
  priorCorpusPolicy:"NO_RERUN_OR_TUNING_OF_EXPOSED_FIT_AND_SEARCH_CASES"});
export const SCIENTIFIC_DIAGONAL_FIXED_SEARCH=immutableTheoryValue({...SCIENTIFIC_FIXED_SEARCH,strategy:"DIAGONAL_EXACT"}) satisfies ScientificSearchSpec;
const transferCalibration=[["1","1"],["2","3"],["4","2"],["3","5"]] as const;
const transferProbes=[["5/3","4/7"],["8/5","7/4"],["11/4","3/2"]] as const;
const transferHeldout=[["2/7","9/4"],["7/3","5/8"],["13/6","11/5"],["17/4","19/7"],["23/8","2/9"]] as const;
const transferKinds=["RECIPROCAL_OFFSET","ASYMMETRIC_INTERACTION","SHARED_LINEAR_QUOTIENT"] as const;
const transferCoefficients=[["-23/53","29/59","31/61"],["37/67","-41/71","43/73"]] as const;
export const SCIENTIFIC_DIAGONAL_TRANSFER_WORLDS=immutableTheoryValue(transferKinds.flatMap((kind,f)=>transferCoefficients.map((v,i)=>({
  taskId:"DIAGONAL-TRANSFER-"+String(f+1)+"-"+String(i+1),family:kind,hidden:{kind,a:v[0],b:v[1],c:v[2]},
  calibration:transferCalibration,probes:transferProbes,heldout:transferHeldout,
})))) satisfies readonly ScientificOracleCase[];
export const SCIENTIFIC_DIAGONAL_TRANSFER_CORPUS_DIGEST=theoryDigest(SCIENTIFIC_DIAGONAL_TRANSFER_WORLDS);
export const SCIENTIFIC_DIAGONAL_TRANSFER_SIMULATOR_SOURCE=[
  "function q(n,d=1n){if(d===0n)throw Error('zero_divisor');if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return[n/a,d/a];}",
  "const parse=s=>{const[n,d='1']=s.split('/');return q(BigInt(n),BigInt(d));};",
  "const add=(a,b)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),mul=(a,b)=>q(a[0]*b[0],a[1]*b[1]),div=(a,b)=>q(a[0]*b[1],a[1]*b[0]);",
  "function calculate(h,p){const[x,y]=p.map(parse),a=parse(h.a),b=parse(h.b),c=parse(h.c),one=parse('1');",
  "if(h.kind==='RECIPROCAL_OFFSET')return add(add(div(a,x),div(b,y)),c);",
  "if(h.kind==='ASYMMETRIC_INTERACTION')return add(add(mul(a,mul(x,y)),mul(b,y)),c);",
  "if(h.kind==='SHARED_LINEAR_QUOTIENT')return div(add(mul(a,x),mul(b,y)),add(one,mul(c,x)));",
  "throw Error('world_not_supported');}",
  "const show=v=>v[1]===1n?String(v[0]):String(v[0])+'/'+String(v[1]);",
].join("\n");
