import { ScientificModelSession, type ScientificModelTask } from "../src/lib/codelab/research/scientificModelGeneration";
import { searchScientificStructures, snapshotScientificSearchSpec, type ScientificSearchSpec } from "../src/lib/codelab/research/scientificModelSearch";
import { exactScalar } from "../src/lib/codelab/research/exactLinearFit";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { scientificFitReplay, scientificModelReplay } from "./omega/benchmarks/scientific-model-replay";
import { runNyxScientificModelGeneration } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult } from "../src/lib/codelab/model/nvidiaNimProvider";

let passed=0,failed=0;
function check(value:unknown,label:string){if(value)passed++;else{failed++;console.error("FAIL "+label);}}
function throws(fn:()=>unknown,label:string){try{fn();check(false,label);}catch{check(true,label);}}
const at=Date.now(),candidate="e".repeat(40);
const limits={maxRequests:8,maxWorkUnits:1000000,maxNativeElapsedMs:10000,expiresAtEpochMs:at+120000};
const spec:ScientificSearchSpec={schemaVersion:1,nonzeroConstantId:"one",maxDegree:3,includeReciprocals:true,
  allowDenominatorTerms:true,maxCoefficients:4,maxCandidates:128,maxModels:1,strategy:"FORWARD_RESIDUAL"};
// Separate development data, no import of the exposed live science corpus.
const q=(op:"ADD"|"SUB"|"MUL"|"DIV",a:string,b:string)=>exactScalar(op,a,b,()=>{});
function task(fn:(x:string)=>string,calibration=["1","2","3","4","5","6"],variable="x"):ScientificModelTask{
  const observations=calibration.map((x,i)=>({pointId:`P${i}`,inputs:[{id:variable,value:x}],output:fn(x),evidenceRef:`OBS${i}`}));
  return {schemaVersion:1,objective:{schemaVersion:1,researchId:"STRUCTURE-SEARCH-DEVELOPMENT",objective:"Infer a bounded response law from admitted data and preserve its uncertainty.",
    domain:"SCIENCE",candidateBinding:candidate,scope:["lab/development"],admittedEvidence:observations.map(o=>({evidenceId:o.evidenceRef,evidenceClass:"E3",kind:"OBSERVATION",
      summary:"Developer-generated exact calibration, not physical observation.",contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output}),provenanceRoot:o.evidenceRef,
      freshnessDependencies:[`CANDIDATE:${candidate}`],observedAtEpochMs:at,candidateBinding:candidate,grantsAuthority:false})),
    successCriteria:["Fit admitted data; keep extrapolation and causation unestablished."],expiryEpochMs:at+120000},variables:[variable],constants:[{id:"one",value:"1"}],observations,
    experiments:[{experimentId:"NextPoint",toolId:"MEASURE-next",question:"Prospective measurement, unknown response.",inputs:[{id:variable,value:"9"}],costUnits:1,
      authority:"RUN_TEST_IN_SANDBOX",scope:["lab/development"],mutatesCandidate:false}]};
}
const verifyFit=scientificFitReplay(process.env.OMEGA_POLYNOMIAL_PYTHON??"python"),verifyModel=scientificModelReplay(process.env.OMEGA_POLYNOMIAL_PYTHON??"python");
const session=(t:ScientificModelTask,l=limits)=>ScientificModelSession.create(t,l,()=>at,{structureSearch:true});
const search=(s:ScientificModelSession,p:unknown=spec)=>s.search({schemaVersion:1,operation:"SEARCH_SCIENTIFIC_MODELS",taskDigest:s.taskDigest,spec:p});
const metrics:any[]=[];
for(const [name,fn] of [
  ["affine",(x:string)=>q("SUB",q("MUL","3",x),"2")],
  ["single_cubic",(x:string)=>q("MUL","2",q("MUL",x,q("MUL",x,x)))],
  ["saturation",(x:string)=>q("DIV",q("MUL","7",x),q("ADD","1",q("MUL","2",x)))],
  ["reciprocal_square",(x:string)=>q("DIV","5",q("MUL",x,x))],
] as const){
  const t=task(fn),s=session(t),start=performance.now(),r=search(s);
  const searchUsage=s.usage();
  check(r.state==="CANDIDATES_NOT_ADMITTED"&&r.candidates.length===1,`${name} produces a native calibration hypothesis`);
  check(s.usage().models===0&&s.usage().fitRequests===0&&s.usage().searchSupports>0,`${name} search neither owns nor independently certifies a model`);
  if(r.state==="CANDIDATES_NOT_ADMITTED"){
    const structure=r.candidates[0].structure,f=s.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:s.taskDigest,structure},verifyFit);
    check(f.state==="FITTED_CANDIDATE_NOT_ADMITTED",`${name} independent original-basis replay agrees`);
    if(f.state==="FITTED_CANDIDATE_NOT_ADMITTED"){
      const a=s.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:s.taskDigest,draft:f.fit.draft},verifyModel);
      check(a.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH",`${name} ordinary proposal and point replay remain required`);
      if(a.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH")check(s.inspect(a.model).predictions.at(-1)?.value===fn("9"),`${name} development extrapolation matches independent expected value`);
    }
    check(Object.isFrozen(r)&&Object.isFrozen(r.candidates)&&r.grantsAuthority===false&&r.scientificTruthEstablished===false,`${name} hypotheses are immutable and authority neutral`);
  }
  metrics.push({name,strategy:spec.strategy,state:r.state,searchUsage,fullUsage:s.usage(),elapsedMs:performance.now()-start});
  s.revoke();
  const control=session(t),c=search(control,{...spec,strategy:"LEXICOGRAPHIC"});
  check(c.state==="CANDIDATES_NOT_ADMITTED",`${name} simpler same-grammar control is executed with identical ceilings`);
  const controlSearchUsage=control.usage();
  if(c.state==="CANDIDATES_NOT_ADMITTED"){
    const f=control.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:control.taskDigest,structure:c.candidates[0].structure},verifyFit);
    check(f.state==="FITTED_CANDIDATE_NOT_ADMITTED",`${name} control uses the same independent fit check`);
    if(f.state==="FITTED_CANDIDATE_NOT_ADMITTED"){
      const a=control.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:control.taskDigest,draft:f.fit.draft},verifyModel);
      check(a.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&control.inspect(a.model).predictions.at(-1)?.value===fn("9"),`${name} control meets the same development extrapolation check`);
    }
  }
  metrics.push({name,strategy:"LEXICOGRAPHIC",state:c.state,searchUsage:controlSearchUsage,fullUsage:control.usage()});control.revoke();
}
const simple=task(x=>x),off=ScientificModelSession.create(simple,limits,()=>at);
check(search(off).state==="REJECTED"&&off.usage().models===0,"Search is unavailable unless the trusted host explicitly enables it");
throws(()=>ScientificModelSession.create(simple,limits,()=>at,{structureSearch:1 as any}),"Malformed feature configuration fails closed");
for(const invalid of [{...spec,maxDegree:4},{...spec,maxCandidates:257},{...spec,maxModels:0},{...spec,maxCoefficients:1.5},
  {...spec,includeReciprocals:"true"},{...spec,strategy:"EXECUTE"},{...spec,extra:true}])throws(()=>snapshotScientificSearchSpec(invalid),"Search spec strictly preserves shape and finite limits");
let accessed=false;const hostile=Object.defineProperty({},"maxDegree",{get(){accessed=true;return 3;},enumerable:true});
throws(()=>snapshotScientificSearchSpec(hostile),"Source host getters are rejected without executing them");check(!accessed,"The snapshot guard does not invoke a getter");
const malformed=session(simple);
check(search(malformed,{...spec,nonzeroConstantId:"notBound"}).state==="REJECTED","No new constant or observation authority is inferred");
check(malformed.search({schemaVersion:1,operation:"SEARCH_SCIENTIFIC_MODELS",taskDigest:"f".repeat(64),spec}).state==="REJECTED","Foreign task references cannot redirect search");
check(malformed.search({schemaVersion:1,operation:"SHELL",taskDigest:malformed.taskDigest,spec}).state==="REJECTED","An unknown action remains inert");
const tiny=session(simple,{...limits,maxWorkUnits:200}),tinyResult=search(tiny);
check(tinyResult.state==="INSUFFICIENT_EVIDENCE"&&tiny.usage().workUnits===200&&tiny.usage().models===0,"Exhaustion is insufficiency, not no-solution or model admission");
const expired=session(simple);expired.revoke();throws(()=>search(expired),"Revoked sessions never revive through search");
const requestLimited=session(simple,{...limits,maxRequests:1});search(requestLimited,{...spec,maxCandidates:1});throws(()=>search(requestLimited),"Compound search does not renew its request budget");
const names=session(task(x=>x,undefined,"SearchCoefficient0")),n=search(names,{...spec,includeReciprocals:false,allowDenominatorTerms:false});
check(n.state==="CANDIDATES_NOT_ADMITTED"&&n.candidates[0].structure.numerator[0]!=="SearchCoefficient0","Generated coefficient IDs avoid existing names without relaxing namespace validation");
const zeroTask=task(x=>x,["0","1","2"]),z=search(session(zeroTask));
check("domainBlockedAtoms"in z&&z.domainBlockedAtoms===3,"Poles remove only unsupported reciprocal atoms on calibration, not unrelated hypotheses");
let tick=0;const direct=searchScientificStructures(simple,{...spec,maxCandidates:1},()=>{tick++;});
check(direct.evaluatedSupports===1&&tick>0&&direct.stopReason!=="SEARCH_EXHAUSTED","Every support and finite-grammar traversal is charged and capped");
throws(()=>searchScientificStructures(simple,spec,()=>{throw Error("owning_budget_sentinel");}),"The algorithm cannot swallow or reset owning budget exceptions");
const ambiguous=task(x=>x,["0","1"]),many=session(ambiguous),competing=search(many,{...spec,includeReciprocals:false,allowDenominatorTerms:false,maxModels:2});
check(competing.state==="CANDIDATES_NOT_ADMITTED"&&competing.candidates.length===2,"Limited observations can produce competing predictions without supplied task equations");
throws(()=>many.inspect((competing as any).candidates?.[0]),"Search candidates cannot be forged into owned model references");
if(competing.state==="CANDIDATES_NOT_ADMITTED"){
  const structure=competing.candidates[0].structure;
  const denied=many.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:many.taskDigest,structure},()=>({decision:"DISAGREES",verificationDigest:theoryDigest("planted-refutation")}));
  const retried=many.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:many.taskDigest,structure},verifyFit);
  check(denied.state==="REJECTED"&&retried.state==="REJECTED"&&"reason"in retried&&retried.reason==="CRITICAL_INDEPENDENT_FIT_CONFLICT","Search candidates cannot vote away critical independent refutation");
  const alternatePath=many.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:many.taskDigest,draft:competing.candidates[0].fit.draft},verifyModel);
  check(alternatePath.state==="REJECTED"&&"reason"in alternatePath&&alternatePath.reason==="CRITICAL_INDEPENDENT_DERIVATION_CONFLICT","A refuted search draft cannot bypass independent fitting through direct point proposal");
  const searchedAgain=search(many,{...spec,includeReciprocals:false,allowDenominatorTerms:false,maxModels:2});
  check("candidates"in searchedAgain&&!searchedAgain.candidates.some(c=>theoryDigest(c.structure)===theoryDigest(structure)),"Quarantined structures stay excluded on a repeated search");
}
const noSolution=search(session(task(x=>q("MUL",x,x))),{...spec,maxDegree:1,includeReciprocals:false,allowDenominatorTerms:false,maxCoefficients:2,maxModels:2});
check(noSolution.state==="NO_CANDIDATE_IN_SEARCHED_GRAMMAR"&&noSolution.stopReason==="SEARCH_EXHAUSTED","An unsupported law is unknown outside the requested grammar, not disproved");
let clock=at;const expires=ScientificModelSession.create(simple,{...limits,expiresAtEpochMs:at+10},()=>clock,{structureSearch:true});clock=at+10;
throws(()=>search(expires),"Absolute expiry applies to search before any work");
let clockCalls=0;const midExpire=ScientificModelSession.create(simple,{...limits,expiresAtEpochMs:at+100},()=>clockCalls++>100?at+101:at,{structureSearch:true});
throws(()=>search(midExpire),"Expiry during native search aborts without provisional admission");
const changedSpec=JSON.parse(JSON.stringify(spec)),snap=snapshotScientificSearchSpec(changedSpec);changedSpec.maxCandidates=256;
check(snap.maxCandidates===128&&Object.isFrozen(snap),"The search configuration cannot change after ownership snapshot");
const rankBad=search(session(task(()=>"2",["1","1","1"])),{...spec,maxDegree:1,includeReciprocals:false,allowDenominatorTerms:false,maxModels:3,strategy:"LEXICOGRAPHIC"});
check("rankDeficientSupports"in rankBad&&rankBad.rankDeficientSupports>0,"Duplicate observations do not invent rank or free coefficients");
const namespace=session(simple);const sourceConflict=namespace.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:namespace.taskDigest,
  structure:{schemaVersion:1,basis:{schemaVersion:5,definitions:[{id:"one",expression:"x"}],outputs:[{label:"coef",expression:"one"}]},numerator:["coef"],denominator:[],denominatorConstant:"one",assumptions:["Development"],uncertainties:["Unverified"]}},verifyFit);
check(sourceConflict.state==="REJECTED"&&"emissionBoundary"in sourceConflict&&sourceConflict.emissionBoundary==="DEFINITION_SHAPE_OR_BOUND","A separately reproduced original-name collision still rejects under the strict source compiler");
let entered=false;const reentry=session(simple);let deniedReentry=false;
const entry=search(reentry,{...spec,includeReciprocals:false,allowDenominatorTerms:false});
if(entry.state==="CANDIDATES_NOT_ADMITTED")reentry.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:reentry.taskDigest,structure:entry.candidates[0].structure},(t,s,f)=>{
  entered=true;try{search(reentry);}catch{deniedReentry=true;}return verifyFit(t,s,f);
});
check(entered&&deniedReentry,"Verifier callbacks cannot reenter search while admission owns the session");
function fake(request:NvidiaNimCompletionRequest,value:unknown):NvidiaNimCompletionResult{
  return {decision:"COMPLETED",reason:"TEST_DOUBLE_NOT_LIVE",executorAuthorityGranted:false,content:JSON.stringify(value),finishReason:"stop",evidence:{evidenceId:request.requestId,evidenceClass:"E4",providerId:"TEST_DOUBLE_NOT_LIVE",
    endpointOrigin:"https://integrate.api.nvidia.com",model:"TEST_DOUBLE_NOT_LIVE",requestDigest:theoryDigest(request),responseDigest:theoryDigest(value),
    credentialSourceIdentity:"NONE",credentialPersisted:false,promptPersisted:false,networkAttempted:false,statusCode:200,failureCategory:null,retryability:null,
    providerRequestId:null,finishReason:"stop",usage:{promptTokens:0,completionTokens:0,totalTokens:0}}};
}
let calls=0;const modelSession=session(ambiguous);
const integrated=await runNyxScientificModelGeneration({session:modelSession,maxCalls:1,maxOutputTokens:1024,deadlineEpochMs:at+60000,now:()=>at,verify:verifyModel,nativeSearch:{verify:verifyFit},
  complete:async request=>{calls++;check((request.responseFormat as any).schema.properties.search!==undefined,"NYX requests a typed search through its existing completion protocol");
    return fake(request,{schemaVersion:1,search:{...spec,maxModels:2,includeReciprocals:false,allowDenominatorTerms:false}});}});
check(integrated.competingModelsAdmitted&&calls===1&&integrated.nativeUsage.requests===5&&integrated.nativeUsage.models===2,"One typed NYX search composes with two independent fits and ordinary proposals");
check(integrated.authorityGranted===false&&integrated.scientificTruthEstablished===false&&!integrated.cognitiveGainDemonstrated,"Test-double composition cannot claim live reasoning or scientific truth");
const invalidCognition=session(simple);let rejectedCalls=0;
const invalidRun=await runNyxScientificModelGeneration({session:invalidCognition,maxCalls:1,maxOutputTokens:1024,deadlineEpochMs:at+60000,now:()=>at,verify:verifyModel,nativeSearch:{verify:verifyFit},
  complete:async request=>{rejectedCalls++;return fake(request,{schemaVersion:1,search:{...spec,command:"execute"}});}});
check(rejectedCalls===1&&!invalidRun.competingModelsAdmitted&&invalidRun.attempts[0].search?.state==="REJECTED","Unknown model fields cannot acquire search or execution authority");
let disabledCalls=0,disabledRejected=false;
try{await runNyxScientificModelGeneration({session:off,maxCalls:1,maxOutputTokens:1024,deadlineEpochMs:at+60000,now:()=>at,verify:verifyModel,nativeSearch:{verify:verifyFit},
  complete:async request=>{disabledCalls++;return fake(request,{});}});}catch{disabledRejected=true;}
check(disabledRejected&&disabledCalls===0,"The cognition protocol cannot enable a capability that the host withheld");
// Metamorphic development checks: variable names, signed coefficients, units
// and denominator offset change independently of the searched grammar.
for(let i=1;i<=6;i++){
  const fn=(x:string)=>q("ADD",q("MUL",String(-i),q("MUL",x,x)),String(i+2));
  const original=task(fn,["-3","-2","-1","1","2","4"],i%2?"coordinate":"SearchCoefficient1");
  const renamed={...original,constants:[{id:"scale",value:String(i+1)}]};
  const s=session(renamed),r=search(s,{...spec,nonzeroConstantId:"scale",includeReciprocals:false,allowDenominatorTerms:false});
  check(r.state==="CANDIDATES_NOT_ADMITTED",`Signed quadratic and renamed nonunit offset variation ${i} can be discovered`);
  if(r.state==="CANDIDATES_NOT_ADMITTED"){
    const fit=verifyFit(s.task,r.candidates[0].structure,r.candidates[0].fit);
    check(fit.decision==="AGREES",`Independent original-source verifier agrees at variation ${i}`);
    const draft=r.candidates[0].fit.draft!,a=s.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:s.taskDigest,draft},verifyModel);
    check(a.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&s.inspect(a.model).predictions.at(-1)?.value===fn("9"),`Variation ${i} predicts the development point after ordinary admission`);
  }
}
const triplet=task(x=>x),t3={...triplet,variables:["x","y","z"],observations:triplet.observations.map((o,i)=>({...o,inputs:[...o.inputs,{id:"y",value:String(i+2)},{id:"z",value:String(i+3)}]})),
  experiments:triplet.experiments.map(e=>({...e,inputs:[...e.inputs,{id:"y",value:"10"},{id:"z",value:"11"}]}))};
t3.objective={...triplet.objective,admittedEvidence:t3.observations.map((o,i)=>({...triplet.objective.admittedEvidence[i],contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output})}))};
const largest=session(t3),largestResult=search(largest,{...spec,maxCandidates:1});
check("atoms"in largestResult&&largestResult.atoms===58&&largestResult.evaluatedSupports===1&&largest.usage().workUnits<limits.maxWorkUnits,"Maximum three-variable grammar remains finite and respects a one-support cap");
console.log("OMEGA_SCIENTIFIC_SEARCH_DEVELOPMENT "+JSON.stringify({metrics,liveModelCalls:0,cognitiveGainDemonstrated:false}));
console.log(`OMEGA_SCIENTIFIC_STRUCTURE_SEARCH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);if(failed)process.exitCode=1;
