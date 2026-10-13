import { ScientificModelSession, SCIENTIFIC_MODEL_POLICY, type ScientificModelTask, type ScientificModelDraft, type ScientificModelRef } from "../src/lib/codelab/research/scientificModelGeneration";
import { runNyxScientificModelGeneration } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { canonicalRationalLiteral } from "../src/lib/codelab/research/exactQuantitativeDerivation";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { scientificModelReplay } from "./omega/benchmarks/scientific-model-replay";
import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { ResearchExperimentObservation } from "../src/lib/codelab/research/researchPartyContracts";
let passed=0,failed=0;
function check(v:unknown,m:string){if(v)passed++;else{failed++;console.error("FAIL "+m);}}
function throws(fn:()=>unknown,m:string){try{fn();check(false,m);}catch{check(true,m);}}
const now=Date.now(),candidate="d".repeat(40),limits={maxRequests:8,maxWorkUnits:300000,maxNativeElapsedMs:2000,expiresAtEpochMs:now+120000};
function task():ScientificModelTask{
  const observations=[{pointId:"Pzero",inputs:[{id:"x",value:"0"}],output:"0",evidenceRef:"OBSzero"},
    {pointId:"Pone",inputs:[{id:"x",value:"1"}],output:"1",evidenceRef:"OBSone"}];
  return{schemaVersion:1,objective:{schemaVersion:1,researchId:"GENERATED-MODEL-TEST",objective:"Find competing response functions and distinguish them prospectively; no human mechanism list is supplied.",
    domain:"SCIENCE",candidateBinding:candidate,scope:["lab/data"],admittedEvidence:observations.map(o=>({evidenceId:o.evidenceRef,evidenceClass:"E3",kind:"OBSERVATION",
      summary:"Independent admitted exact calibration measurement.",contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output}),provenanceRoot:o.evidenceRef,
      freshnessDependencies:[`CANDIDATE:${candidate}`],observedAtEpochMs:now,candidateBinding:candidate,grantsAuthority:false})),
    successCriteria:["Preserve ambiguity unless prospective evidence discriminates generated models."],expiryEpochMs:now+120000},variables:["x"],constants:[{id:"zero",value:"0"},{id:"one",value:"1"}],observations,
    experiments:[{experimentId:"ProbeOne",toolId:"MEASURE-one",question:"Measure at the calibration input, before seeing the result.",inputs:[{id:"x",value:"1"}],costUnits:1,authority:"RUN_TEST_IN_SANDBOX",scope:["lab/data"],mutatesCandidate:false},
      {experimentId:"ProbeTwo",toolId:"MEASURE-two",question:"Measure response at x=2.",inputs:[{id:"x",value:"2"}],costUnits:1,authority:"RUN_TEST_IN_SANDBOX",scope:["lab/data"],mutatesCandidate:false}]};
}
const draft=(expression:string,parameters:ScientificModelDraft["parameters"]=[]):ScientificModelDraft=>({schemaVersion:1,parameters,
  program:{schemaVersion:5,definitions:[],outputs:[{label:"response",expression}]},assumptions:["Deterministic rational response within the declared inputs."],uncertainties:["Agreement at calibration points does not establish global or causal validity."]});
const verify=scientificModelReplay(process.env.OMEGA_POLYNOMIAL_PYTHON??"python");
const propose=(s:ScientificModelSession,d:ScientificModelDraft,verifier=verify)=>s.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:s.taskDigest,draft:d},verifier);
const session=ScientificModelSession.create(task(),limits),first=propose(session,draft("x")),second=propose(session,draft("x*x"));
check(first.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&second.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH","Two computed model hypotheses are admitted without a pre-supplied scientific mechanism catalog");
if(first.state!=="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"||second.state!=="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH")throw Error("valid_fixture_not_admitted");
check(session.inspect(first.model).predictions.find(p=>p.pointId==="ProbeTwo")?.value==="2"&&session.inspect(second.model).predictions.find(p=>p.pointId==="ProbeTwo")?.value==="4","Existing native exact computation derives competing future responses, not model confidence");
throws(()=>session.inspect({...first.model}),"Copying a reference does not preserve process-local model ownership");
throws(()=>session.bridge([first.model,first.model],{evidenceIdentity:"GEN",provenanceRoot:"ONE_MODEL_ROOT"}),"Duplicating an owned model cannot create a competing-model population");
const bridge=session.bridge([first.model,second.model],{evidenceIdentity:"GEN",provenanceRoot:"ONE_MODEL_ROOT"});
check(bridge.graph.selectNextExperiment(1)?.experimentId==="ProbeTwo","Existing research selector chooses the experiment whose generated predictions differ");
check(bridge.contributions.every(c=>c.modelEvidence.evidenceClass==="E1")&&new Set(bridge.contributions.map(c=>c.modelEvidence.provenanceRoot)).size===1,"Same-model contributions remain correlated hypotheses, never independent truth votes");
check(bridge.graph.decision().state==="INSUFFICIENT_EVIDENCE"&&!bridge.scientificTruthEstablished&&!bridge.authorityGranted,"Correct derivations and initial fit alone cannot close a scientific claim or grant authority");
function observation(exp:string,outcome:string,execution:string):ResearchExperimentObservation{
  const toolId=bridge.objective.experimentCatalog.find(e=>e.experimentId===exp)!.toolId,outputDigest=theoryDigest([execution,"SCOPED_TEST_OBSERVATION"]);
  const content={experimentId:exp,toolId,outcome,executionIdentity:execution,outputDigest};
  return{observationId:execution,experimentId:exp,toolId,outcome,executionIdentity:execution,outputDigest,authorityGranted:false,
    evidence:{evidenceId:"E-"+execution,evidenceClass:"E3",kind:"EXPERIMENT_RESULT",summary:"Explicit synthetic graph test, not a live instrument.",
      contentDigest:theoryDigest(content),provenanceRoot:execution,freshnessDependencies:[`CANDIDATE:${candidate}`],observedAtEpochMs:now+1,candidateBinding:candidate,grantsAuthority:false}};
}
bridge.graph.recordObservation(observation("ProbeOne","PREDICTION_0","EXEC-common"));
check(bridge.graph.decision().state==="INSUFFICIENT_EVIDENCE","A non-discriminating common success cannot falsely select a causal model");
bridge.graph.recordObservation(observation("ProbeTwo","PREDICTION_1","EXEC-discriminating"));
check(bridge.graph.decision().selectedMechanismId===second.model.modelId&&bridge.graph.decision().state==="SUPPORTED_WITHIN_MODELED_FAMILY"
  &&bridge.graph.decision().independentAcceptance===false,"Prospective disconfirming evidence eliminates a generated model but remains scoped and independently uncertified");
const outside=session.bridge([first.model,second.model],{evidenceIdentity:"GEN-other",provenanceRoot:"ONE_MODEL_ROOT"});
outside.graph.recordObservation(observation("ProbeTwo","OUTSIDE_ALL_CURRENT_PREDICTIONS","EXEC-outside"));
check(outside.graph.decision().state==="REFUTED_MODELED_FAMILY","Measurements outside every prediction refute the modeled family instead of forcing a favorite hypothesis");
check(propose(session,draft("x")).state==="REJECTED","The same executable artifact cannot be repeatedly admitted as more independent models");
const wrong=propose(session,draft("x+one"));check(wrong.state==="REJECTED"&&"contradictedObservationIds"in wrong&&wrong.contradictedObservationIds.includes("Pzero"),"An exact contradiction with admitted measurements is preserved and sent to repair");
for(const expression of ["x/x","MIN(x,zero)","process.env","x**x","x+2"]){const s=ScientificModelSession.create(task(),limits),result=propose(s,draft(expression));
  check(result.state!=="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH",`Unsupported, singular or executable-looking source remains non-admitted: ${expression}`);s.revoke();}
const modelAlias=draft("x") as any,owned=ScientificModelSession.create(task(),limits),admitted=propose(owned,modelAlias);modelAlias.program.outputs[0].expression="x+one";
check(admitted.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&owned.inspect(admitted.model).draft.program.outputs[0].expression==="x","Changing the caller's draft cannot change the owned scientific artifact");
const changedTask=task() as any;changedTask.observations[0].output="99";
throws(()=>ScientificModelSession.create(changedTask,limits),"Changing admitted measurements without their custody digest is rejected");
throws(()=>ScientificModelSession.create({...task(),variables:["x","x"]},limits),"Ambiguous input namespaces are rejected");
let getters=0;throws(()=>ScientificModelSession.create({...task(),get observations(){getters++;return[];}},limits),"Host accessors are not admissible scientific data");check(getters===0,"Snapshot validation does not invoke an attacker-supplied getter");
const forged=ScientificModelSession.create(task(),limits);const bad=forged.propose({schemaVersion:1,operation:"SHELL",taskDigest:forged.taskDigest,draft:draft("x")},verify);
check(bad.state==="REJECTED"&&forged.usage().requests===1,"An unknown tool stays data and consumes the same finite request budget");
const denied=ScientificModelSession.create(task(),limits);let votes=0;
const voter=()=>({decision:++votes===1?"DISAGREES" as const:"AGREES" as const,verificationDigest:theoryDigest(["VERIFIER-VOTE",votes])});
check(propose(denied,draft("x"),voter).state==="REJECTED"&&propose(denied,draft("x"),voter).state==="REJECTED"&&votes===1,"A critical independent derivation disagreement cannot be erased by repeated positive votes");
const unavailable=ScientificModelSession.create(task(),limits),unknown=propose(unavailable,draft("x"),()=>({decision:"INSUFFICIENT_EVIDENCE",verificationDigest:theoryDigest("UNKNOWN")}));
check(unknown.state==="INSUFFICIENT_EVIDENCE","Unsupported independent checking remains unknown, not a mathematical refutation");
let clock=now;const timed=ScientificModelSession.create(task(),limits,()=>clock);clock=limits.expiresAtEpochMs;
throws(()=>propose(timed,draft("x")),"Expiry forbids new computation and admission");clock=now;throws(()=>propose(timed,draft("x")),"Clock rollback cannot resurrect an expired scientific domain");
const one=ScientificModelSession.create(task(),{...limits,maxRequests:1});propose(one,draft("x"));throws(()=>propose(one,draft("x*x")),"Proposal counts cannot be bypassed by model retries");
const setup=ScientificModelSession.create(task(),limits).usage().workUnits,small=ScientificModelSession.create(task(),{...limits,maxWorkUnits:setup+1});
check(propose(small,draft("x*x")).state==="INSUFFICIENT_EVIDENCE","Setup and native lowering share the same charged work envelope");
for(let i=1;i<=24;i++){
  const coefficient=`${i}/${i+1}`,p=canonicalRationalLiteral(coefficient),t=task() as any;
  for(const o of t.observations){o.output=o.inputs[0].value==="0"?"0":p;const e=t.objective.admittedEvidence.find((e:any)=>e.evidenceId===o.evidenceRef);e.contentDigest=theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output});}
  const s=ScientificModelSession.create(t,limits),a=propose(s,draft("a*x",[{id:"a",value:coefficient}])),b=propose(s,draft("a*x*x",[{id:"a",value:coefficient}]));
  check(a.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&b.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH",`Independent replay supports rational coefficients in fresh development variation ${i}`);
  check(!("model"in a&&"model"in b)||s.bridge([a.model,b.model],{evidenceIdentity:`E${i}`,provenanceRoot:"SAME_COGNITION"}).graph.selectNextExperiment(1)?.experimentId==="ProbeTwo",`Generated predictions discriminate without an encoded task solution at variation ${i}`);
}
const fake=(request:NvidiaNimCompletionRequest,value:unknown):NvidiaNimCompletionResult=>({decision:"COMPLETED",reason:"TEST_DOUBLE_NOT_LIVE",content:JSON.stringify(value),finishReason:"stop",executorAuthorityGranted:false,
  evidence:{evidenceId:request.requestId,evidenceClass:"E4",providerId:"TEST_DOUBLE_NOT_LIVE",endpointOrigin:"https://integrate.api.nvidia.com",model:"TEST_DOUBLE_NOT_LIVE",
    requestDigest:theoryDigest(request),responseDigest:theoryDigest(value),credentialSourceIdentity:"NONE",credentialPersisted:false,promptPersisted:false,networkAttempted:false,
    statusCode:200,failureCategory:null,retryability:null,providerRequestId:null,finishReason:"stop",usage:{promptTokens:10,completionTokens:20,totalTokens:30}}});
const generateSession=ScientificModelSession.create(task(),limits);let call=0;
const generated=await runNyxScientificModelGeneration({session:generateSession,maxCalls:2,maxOutputTokens:2048,deadlineEpochMs:now+60000,verify,
  complete:async request=>{const context=JSON.parse(request.messages[1].content);check(!("mechanismCatalog"in context.task.objective),"NYX receives observations and model grammar, not prewritten candidate mechanisms");
    return fake(request,{schemaVersion:1,models:call++?[draft("x"),draft("x*x")]:[draft("x+one"),draft("x/x")]});}});
check(generated.competingModelsAdmitted&&!generated.firstAttemptAdmitted&&generated.calls===2&&generated.models.length===2,"Existing NYX completion boundary composes invalid model proposals, feedback, bounded repair and admitted competing models (test double only)");
check(generated.attempts[0].proposals.some(p=>p.reason==="REFUTED_BY_ADMITTED_OBSERVATION")&&!generated.scientificTruthEstablished&&!generated.cognitiveGainDemonstrated
  &&!generated.authorityGranted&&!generated.generalShell&&!generated.generalNetwork&&!generated.productionAuthority,"Prediction derivations, empirical claims, cognition promotion and execution authority stay distinct");
const capped=ScientificModelSession.create(task(),{...limits,maxRequests:1});
const bounded=await runNyxScientificModelGeneration({session:capped,maxCalls:4,maxOutputTokens:1024,deadlineEpochMs:now+60000,verify,complete:async request=>fake(request,{schemaVersion:1,models:[draft("x"),draft("x*x")]})});
check(!bounded.competingModelsAdmitted&&bounded.calls===1&&bounded.nativeUsage.requests===1,"Generation stops at its original proposal cap without an unstructured retry storm or implicit lease increase");
check(!SCIENTIFIC_MODEL_POLICY.grantsAuthority,"Scientific model generation grants no environment capability");
check(canonicalRationalLiteral("1"+"0".repeat(200))==="1"+"0".repeat(200),"Derived rational scalars retain the native 4096-bit range instead of inheriting the narrower source-constant bound");
throws(()=>canonicalRationalLiteral("9".repeat(1234)),"The canonical scalar adapter cannot bypass the existing arithmetic bit ceiling");
const oversize=ScientificModelSession.create(task(),limits),wide=propose(oversize,draft("a*x",[{id:"a",value:"1"+"0".repeat(200)}]));
check(wide.state==="REJECTED"&&"reason"in wide&&wide.reason==="PARAMETER_LITERAL_BOUND","Derived-scalar support does not weaken original model parameter literal bounds");
const reentrant=ScientificModelSession.create(task(),limits);let prevented=false;
const reentrantResult=propose(reentrant,draft("x"),(t,d,p)=>{try{propose(reentrant,draft("x*x"));}catch{prevented=true;}return verify(t,d,p);});
check(prevented&&reentrantResult.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&reentrant.usage().requests===1,"Synchronous verifier reentry cannot interleave proposal ownership or consume hidden branches");
const malformedIndependent=ScientificModelSession.create(task(),limits),malformedResult=propose(malformedIndependent,draft("x"),()=>({decision:"AGREES",verificationDigest:"forged"}));
check(malformedResult.state==="INSUFFICIENT_EVIDENCE","An unbound independent verifier response is not accepted as evidence");
const throwIndependent=ScientificModelSession.create(task(),limits),thrown=propose(throwIndependent,draft("x"),()=>{throw Error("infrastructure_test");});
check(thrown.state==="INSUFFICIENT_EVIDENCE"&&"reason"in thrown&&thrown.reason==="INDEPENDENT_VERIFIER_FAILURE","Verifier infrastructure failures are separate from source or mathematical failures");
let generationClock=now,lateSession=ScientificModelSession.create(task(),{...limits,expiresAtEpochMs:now+1000},()=>generationClock);
const late=await runNyxScientificModelGeneration({session:lateSession,maxCalls:2,maxOutputTokens:1024,deadlineEpochMs:now+60000,now:()=>generationClock,verify,
  complete:async request=>{check(request.deadlineEpochMs===now+1000,"Model request cannot outlive its original native proposal domain");generationClock=now+1000;
    return fake(request,{schemaVersion:1,models:[draft("x"),draft("x*x")]});}});
check(!late.competingModelsAdmitted&&late.calls===1&&late.attempts[0].outcome==="LATE_RESPONSE_NOT_ADMITTED"&&lateSession.usage().requests===0,"Late successful text cannot renew a scientific admission lease");
const literalSession=ScientificModelSession.create(task(),limits),literalResult=propose(literalSession,draft("x+2"));
check(literalResult.state==="REJECTED"&&"reason"in literalResult&&literalResult.reason==="ALGEBRAIC_NUMERIC_LITERAL","Scientific repair reuses sanitized parser diagnostics without confusing source emission with scientific reasoning");
console.log(`OMEGA_SCIENTIFIC_MODEL_GENERATION_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);if(failed)process.exitCode=1;
