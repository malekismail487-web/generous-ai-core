import { ScientificModelSession, SCIENTIFIC_MODEL_POLICY, type ScientificModelTask, type ScientificModelDraft, type ScientificModelRef } from "../src/lib/codelab/research/scientificModelGeneration";
import { runNyxScientificModelGeneration } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { canonicalRationalLiteral } from "../src/lib/codelab/research/exactQuantitativeDerivation";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { scientificModelReplay, scientificFitReplay, type ScientificReplayCost } from "./omega/benchmarks/scientific-model-replay";
import { fitExactLinearSystem, exactScalar } from "../src/lib/codelab/research/exactLinearFit";
import { fitScientificStructure, type ScientificModelStructure } from "../src/lib/codelab/research/scientificModelFit";
import { algebraicBoundaryCode, compileAlgebraicExpressionGraph } from "../src/lib/codelab/research/quantitativeAlgebraicCompiler";
import {SCIENTIFIC_FIT_WORLDS,SCIENTIFIC_FIT_EPOCH,SCIENTIFIC_FIT_SIMULATOR_SOURCE,scientificFitTask,type ScientificFitWorld} from "./omega/nyx-scientific-fit-fixtures";
import {runFreshScientificFitEpoch} from "./omega/nyx-scientific-fit-live-eval";
import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { ResearchExperimentObservation } from "../src/lib/codelab/research/researchPartyContracts";
import {spawnSync} from "node:child_process";
import {SCIENCE_WORLDS,SCIENCE_EPOCH,SCIENCE_SIMULATOR_SOURCE,scienceTask,type ScienceWorld} from "./omega/nyx-scientific-world-fixtures";
import {calibration,independentScienceGrade,runScientificWorldEpoch,scientificAction} from "./omega/nyx-scientific-world-live-eval";
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

// Detector witnesses are author-owned offline tests, never live model inputs.
// A second expression fits the calibration yet fails untouched points: this
// validates that fit/admission and final scientific-model acceptance differ.
function worldDrafts(w:ScienceWorld,extraXs:readonly string[]=[],bothWrong=false){
  const xs=[...new Set([...w.calibration.map(p=>p[0]),...extraXs])];
  const parameters=[{id:"a",value:w.hidden.a},{id:"b",value:w.hidden.b},{id:"c",value:w.hidden.c},...xs.map((value,i)=>({id:"s"+i,value}))];
  const base=w.hidden.kind==="TRANSPORT"?"a*x/(b+x)+c*y":w.hidden.kind==="POTENTIAL"?"a*(x-y)*(x-y)+b*(x+y)+c":"(a*x+b*y)/(one+c*x*x)";
  const bump=xs.map((_,i)=>`(x-s${i})`).join("*");
  const form=(expression:string):ScientificModelDraft=>({...draft(expression,parameters),program:{schemaVersion:5,definitions:[{id:"base",expression:base},{id:"bump",expression:bump}],outputs:[{label:"response",expression}]}});
  return[form(bothWrong?"base+bump":"base"),form(bothWrong?"base+bump+bump":"base+bump")];
}
for(const w of SCIENCE_WORLDS){
  const values=calibration(w),t=scienceTask(w,candidate,Date.now(),Date.now()+60000,values),[correct,overfit]=worldDrafts(w);
  const checked=independentScienceGrade(w,t,correct),rejected=independentScienceGrade(w,t,overfit);
  check(checked.accepted&&checked.cost.points===13&&checked.cost.matched===13,"Independent scientific oracle accepts its planted mathematical witness at all calibration/prospective/held-out points");
  check(!rejected.accepted&&rejected.cost.matched<rejected.cost.points,"A calibration-fitting alternative cannot trick independent held-out acceptance");
  const simulator=spawnSync(process.execPath,["--input-type=module","-e",SCIENCE_SIMULATOR_SOURCE+`\nconsole.log(JSON.stringify(${JSON.stringify(w.calibration)}.map(p=>show(calculate(${JSON.stringify(w.hidden)},p)))));`],{encoding:"utf8",timeout:5000,windowsHide:true});
  check(simulator.status===0&&JSON.stringify(JSON.parse(simulator.stdout))===JSON.stringify(values),"Separately implemented Node simulator agrees with Python Fraction calibration before the live freeze");
}
const actionIds=["Probe1"],modelIds=["MODEL-owned"];
check(scientificAction({schemaVersion:1,operation:"MEASURE",experimentId:"Probe1",modelId:null},actionIds,modelIds)?.operation==="MEASURE","Typed scientific measurement refers only to registered experiment identity");
for(const bad of [{schemaVersion:1,operation:"SHELL",experimentId:null,modelId:null},{schemaVersion:1,operation:"MEASURE",experimentId:"outside",modelId:null},
  {schemaVersion:1,operation:"CONCLUDE",experimentId:null,modelId:"forged"},{schemaVersion:1,operation:"NO_CONCLUSION",experimentId:null,modelId:null,command:"run"}])
  check(scientificAction(bad,actionIds,modelIds)===null,"Unknown operations, targets, model identities and extra executable fields fail closed");
let offlineCalls=0;const contexts:{stage:string;context:any}[]=[];
const epoch=await runScientificWorldEpoch(async(request,stage)=>{
  offlineCalls++;const context=JSON.parse(request.messages[1].content);contexts.push({stage,context});
  check(request.reasoningControl==="SUPER_HOSTED_NATIVE"&&request.reasoningBudgetTokens===2048&&!request.reasoningEffort,"Every arm uses the identical separately labeled Super reasoning wire controls");
  check(!JSON.stringify(context).includes('"hidden"')&&!JSON.stringify(context).includes('"heldout"'),"Author simulator coefficients and held-out cases never enter NYX requests");
  if(stage.endsWith("SHARED_GENERATION")){const w=SCIENCE_WORLDS.find(w=>w.taskId===context.task.objective.researchId)!;return fake(request,{schemaVersion:1,models:worldDrafts(w)});}
  return fake(request,{schemaVersion:1,operation:context.observations.length?"CONCLUDE":"MEASURE",experimentId:context.observations.length?null:"Probe1",modelId:context.observations.length?context.models[0].modelId:null});
},{candidate,sourceDigests:{offline:theoryDigest("explicit-test-double")}});
check(epoch.complete&&epoch.rows.length===9&&epoch.arms.every(a=>a.graded===3&&a.correct===3&&a.firstSubmittedCandidateCorrect===3),"Actual disposable R3B measurements, model selection and independent grading compose in all nine offline pilot arms");
check(epoch.rows.every(r=>r.experiments===1&&r.cleanup.sourceUnchanged&&r.cleanup.sandboxCleanupVerified&&r.cleanup.temporaryFixtureRemoved),"All nine actual temporary fixtures preserve original source and demonstrate verified cleanup");
check(epoch.physicalCalls===offlineCalls&&offlineCalls===21&&epoch.physicalUsage.calls===21&&epoch.physicalUsage.reportedTokens===630,"Physical inference is counted once across the shared prefix and all arm calls (test double only)");
check(epoch.arms.every(a=>a.allocatedUsage.calls===9&&a.allocatedUsage.reportedTokens===270),"Each arm is charged the complete shared generation prefix without hiding construction cost");
check(epoch.physicalNativeCost.requests===6&&epoch.physicalReplayCosts.length===6&&epoch.rows.every(r=>r.gradingExecutions===1),"Shared native/replay work is physically counted once and identical first/final candidates use one independently metered grade");
check(!epoch.scopedGuidanceSignal&&epoch.promotion===SCIENCE_EPOCH.promotion&&epoch.physicalUsage.httpAttempts===0,"Equal offline witness success neither establishes a guidance gain nor masquerades as live E4 cognition");
check(contexts.filter(c=>c.stage.includes("DIRECT_REVIEW")&&!c.stage.endsWith("SHARED_GENERATION")).every(c=>!("nativeForecasts"in c.context)&&!("evidenceAssessment"in c.context)),"The qualified direct control does not receive future forecast sheets or graph guidance");
check(contexts.filter(c=>c.stage.endsWith("NATIVE_FORECASTS")).every(c=>"nativeForecasts"in c.context&&!("evidenceAssessment"in c.context)),"The identical-tool control receives forecasts without the treatment's evidence-selection advice");
check(contexts.filter(c=>c.stage.endsWith("NATIVE_EVIDENCE_GUIDANCE")).every(c=>"nativeForecasts"in c.context&&"evidenceAssessment"in c.context),"Only the guidance arm receives the owned graph's explicit assessment and recommendation");
const serialized=JSON.stringify(epoch);
check(!serialized.includes('"expression"')&&!serialized.includes('"parameters"')&&!serialized.includes('"measurement"')&&!serialized.includes('"content"'),"Public pilot evidence excludes raw generated programs, request/response bodies and numerical measurement values");

// Force a general false model family, then a bounded revision on preserved
// observations; no held-out answer or oracle finding is used for the repair.
const revised=await runScientificWorldEpoch(async(request,stage)=>{
  const context=JSON.parse(request.messages[1].content),taskId=stage.split("/")[0],w=SCIENCE_WORLDS.find(w=>w.taskId===taskId)!;
  if(context.task){const regeneration=!stage.endsWith("SHARED_GENERATION");
    if(regeneration)check(context.task.observations.length===6&&context.task.objective.admittedEvidence.length===6&&!context.task.experiments.some((e:any)=>e.experimentId==="Probe1"),"Revision preserves numeric evidence with its original independent root and cannot replay a consumed experiment");
    return fake(request,{schemaVersion:1,models:worldDrafts(w,regeneration?[w.probes[1][0]]:[],!regeneration)});
  }
  const regenerate=context.feedback?.reason==="NEW_PROSPECTIVE_OBSERVATION_ADMITTED"&&context.observations.length===1;
  const operation=context.observations.length===0?"MEASURE":regenerate?"REGENERATE":context.observations.length===1?"MEASURE":"CONCLUDE";
  return fake(request,{schemaVersion:1,operation,experimentId:operation==="MEASURE"?(context.observations.length?"Probe2":"Probe1"):null,modelId:operation==="CONCLUDE"?context.models[0].modelId:null});
},{candidate,sourceDigests:{offline:theoryDigest("test-double-revision")}});
check(revised.complete&&revised.arms.every(a=>a.correct===3&&a.regenerated===3)&&revised.rows.every(r=>r.experiments===2),"After genuine prospective counterevidence all nine offline arms can regenerate, make new forecasts and independently verify a replacement");
check(revised.rows.every(r=>r.native.requests<=SCIENCE_EPOCH.maxModelRequests&&r.native.workUnits<=SCIENCE_EPOCH.maxNativeWorkUnitsPerArm&&r.native.elapsedMs<=SCIENCE_EPOCH.maxNativeElapsedMsPerArm),"Revision never resets the original shared model-request, work or native-time envelope");
check(revised.physicalCalls===48&&revised.physicalUsage.calls===48&&revised.physicalUsage.reportedTokens===1440&&revised.rows.every(r=>r.actions.length===4),"Every revision action and regeneration call is included without hidden compute or extra action allowance");

const missing=await runScientificWorldEpoch(async request=>fake(request,{schemaVersion:1,models:[]}),{candidate,sourceDigests:{offline:theoryDigest("test-double-invalid-generation")}});
check(!missing.complete&&missing.arms.every(a=>a.attempted===0&&a.graded===0&&a.unexecuted===3)&&missing.physicalCalls===6,"Invalid shared generation remains unexecuted science rather than nine synthetic reasoning failures");
check(missing.rows.every(r=>r.blocked==="SHARED_GENERATION_NOT_ADMITTED")&&!missing.scopedGuidanceSignal,"An inadmissible hypothesis population cannot produce a positive scientific capability claim");
check(missing.pairs.every(p=>!p.postGenerationExecuted&&!p.independentlyGraded&&!p.realizedInferenceMatched&&!p.guidedNoMoreInference),"Equal shared-prefix costs without executed and graded stages are not matched outcome comparisons under policy version two");
check(epoch.pairs.every(p=>p.postGenerationExecuted&&p.independentlyGraded&&p.realizedInferenceMatched),"Applicability correction retains matching for real fully graded equal-compute control/treatment pairs");
check(epoch.rows.every(r=>r.actions.filter(a=>a.experimentEvidence).length===1&&r.actions.every(a=>!a.experimentEvidence||a.experimentEvidence.evidenceClass==="E3"
  &&a.experimentEvidence.candidateBinding===candidate&&a.experimentEvidence.committedModelIds.length===2&&a.experimentEvidence.elapsedMs>=0)),"Actual measurements preserve request, candidate, precommitted model, execution and observation custody without public scalar hashes");
const exceptional=await runScientificWorldEpoch(async()=>{throw Error("TEST_DOUBLE_TRANSPORT_EXCEPTION");},{candidate,sourceDigests:{offline:theoryDigest("test-double-exception")}});
check(exceptional.physicalCalls===3&&exceptional.physicalUsage.calls===3&&exceptional.physicalUsage.unknownUsageCalls===3&&exceptional.unknownHttpAttemptCounts===3&&!exceptional.providerStable,"Unexpected completion exceptions remain counted with explicitly unknown transport usage, never assumed zero");
check(exceptional.seeds.every(s=>s.failure==="SHARED_GENERATION_INTEGRATION_FAILURE")&&exceptional.rows.length===9&&exceptional.arms.every(a=>a.unexecuted===3&&a.graded===0),"Exceptional shared generation preserves a complete blocked population and never masquerades as scientific failure or success");

// One mixed transport/contract run keeps failures separate and tests repairs
// without hidden-grade feedback or extra action capacity.
const failures=await runScientificWorldEpoch(async(request,stage)=>{
  const context=JSON.parse(request.messages[1].content),w=SCIENCE_WORLDS.find(w=>w.taskId===stage.split("/")[0])!;
  if(stage.endsWith("SHARED_GENERATION"))return fake(request,{schemaVersion:1,models:worldDrafts(w)});
  const count=SCIENCE_EPOCH.maxActionCalls-context.remaining.actions;
  if(stage.endsWith("DIRECT_REVIEW"))return fake(request,count===0?{schemaVersion:1,operation:"MEASURE",experimentId:"NOT_REGISTERED",modelId:null}
    :count===1?{schemaVersion:1,operation:"CONCLUDE",experimentId:null,modelId:context.models[0].modelId}
    :{schemaVersion:1,operation:"NO_CONCLUSION",experimentId:null,modelId:null});
  if(count===0){const reply=fake(request,{schemaVersion:1,operation:"MEASURE",experimentId:"Probe1",modelId:null});
    return stage.endsWith("NATIVE_FORECASTS")?{...reply,decision:"PROVIDER_ERROR",content:null,finishReason:null,evidence:{...reply.evidence,networkAttempted:true,statusCode:503,usage:{promptTokens:null,completionTokens:null,totalTokens:null}}}
      :{...reply,finishReason:"length",evidence:{...reply.evidence,finishReason:"length"}};
  }
  return fake(request,{schemaVersion:1,operation:context.observations.length?"CONCLUDE":"MEASURE",experimentId:context.observations.length?null:"Probe1",modelId:context.observations.length?context.models[0].modelId:null});
},{candidate,sourceDigests:{offline:theoryDigest("test-double-failure-classification")}});
check(failures.rows.filter(r=>r.arm==="DIRECT_REVIEW").every(r=>r.accepted===null&&r.experiments===0&&r.actions.map(a=>a.outcome).join("|")==="ACTION_SCOPE_REJECTION|CONCLUSION_WITHOUT_EXPERIMENT_REJECTION|NO_CONCLUSION"),"Malformed targets, conclusions without evidence and explicit uncertainty remain distinct nonacceptance outcomes");
check(failures.rows.filter(r=>r.arm==="NATIVE_FORECASTS").every(r=>r.accepted===true&&r.actions[0].outcome==="PROVIDER_FAILURE")&&failures.physicalUsage.providerFailures===3&&!failures.providerStable,"Provider disruption is separately recorded even when a later bounded action succeeds");
check(failures.rows.filter(r=>r.arm==="NATIVE_EVIDENCE_GUIDANCE").every(r=>r.accepted===true&&r.actions[0].outcome==="TRUNCATION")&&!failures.scopedGuidanceSignal,"Truncated action serialization is not counted as scientific reasoning failure or used to promote guidance");
// Separate development data: NOT a rerun or reconstruction of exposed live
// pilot formulas, and not an evaluation of model cognition/generalization.
const fitCosts:ScientificReplayCost[]=[],fitVerify=scientificFitReplay(process.env.OMEGA_POLYNOMIAL_PYTHON??"python",5000,c=>fitCosts.push(c));
const structure=(outputs:readonly {label:string;expression:string}[],numerator:readonly string[],denominator:readonly string[]=[]):ScientificModelStructure=>({schemaVersion:1,
  basis:{schemaVersion:5,definitions:[],outputs},numerator,denominator,denominatorConstant:"one",
  assumptions:["Exact deterministic calibration in the declared development domain."],uncertainties:["Calibration fit does not establish extrapolation, novelty or causal validity."]});
const fitted=(s:ScientificModelSession,p:unknown,v=fitVerify)=>s.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:s.taskDigest,structure:p},v);
let scalarTicks=0;const countedTick=()=>{if(++scalarTicks>1000000)throw Error("development_budget");};
const unique=fitExactLinearSystem([["0","1"],["2","1"],["4","1"]],["-3/2","5/2","13/2"],countedTick);
check(unique.state==="UNIQUE"&&unique.rank===2&&unique.values.join("|")==="2|-3/2"&&scalarTicks>0,"Bounded exact fitting handles negative rational coefficients and an overdetermined original-row residual check");
check(fitExactLinearSystem([["0","2"],["1","2"]],["4","5"],countedTick).values.join("|")==="1|2","Exact pivot exchange does not assume a nonzero leading matrix entry");
check(fitExactLinearSystem([["1","2"],["2","4"]],["3","6"],countedTick).state==="UNDERDETERMINED","Rank-deficient calibration reports ambiguity rather than inventing free coefficients");
check(fitExactLinearSystem([["1","2"],["2","4"]],["3","7"],countedTick).state==="INCONSISTENT","Contradictory calibration is distinct from insufficient rank");
check(fitExactLinearSystem([["0","0"]],["0"],countedTick).state==="UNDERDETERMINED"
  &&fitExactLinearSystem([["0","0"]],["1"],countedTick).state==="INCONSISTENT","Zero matrices cannot falsely produce a unique fitting solution");
for(const bad of [[],Array.from({length:13},()=>["1"]),[["1"],["1","2"]],[["1/0"]],[["1e3"]],[["9".repeat(1234)]]])
  throws(()=>fitExactLinearSystem(bad,["1"],countedTick),"Malformed, non-rational and oversized fitting input fails closed");
throws(()=>fitExactLinearSystem([["1"]],["1"],()=>{throw Error("original_shared_budget");}),"Fitting cannot swallow the owning session's budget/lease exception");
throws(()=>exactScalar("DIV","1","0",countedTick),"Native fitting does not hide division by zero");
throws(()=>exactScalar("ADD","1".repeat(10000),"1",countedTick),"The scalar adapter bounds representation before parsing a huge integer");
const basicStructure=structure([{label:"a",expression:"x"}],["a"]),quadraticStructure=structure([{label:"b",expression:"x*x"}],["b"]);
const fitSession=ScientificModelSession.create(task(),limits),beforeFit=fitSession.usage(),fitResult=fitted(fitSession,basicStructure);
check(fitResult.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&fitResult.fit.linear.values[0]==="1"&&fitSession.usage().models===0,"A fitting result is a candidate, never implicit model admission or truth");
if(fitResult.state!=="FITTED_CANDIDATE_NOT_ADMITTED"||!fitResult.fit.draft)throw Error("development_fit_not_verified");
const fitAdmission=propose(fitSession,fitResult.fit.draft);
check(fitAdmission.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&fitSession.usage().requests===2&&fitSession.usage().fitRequests===1
  &&fitSession.usage().workUnits>beforeFit.workUnits&&fitSession.usage().nativeElapsedMs>0,"Fitting, original model admission and native cost share one finite request/work/time domain");
const deficient=ScientificModelSession.create(task(),limits),deficientResult=fitted(deficient,structure([{label:"a",expression:"x"},{label:"b",expression:"x"}],["a","b"]));
check(deficientResult.state==="INSUFFICIENT_EVIDENCE"&&"linearState"in deficientResult&&deficientResult.linearState==="UNDERDETERMINED"&&deficientResult.rank===1,
  "Independent fitting replay confirms insufficient identifiability without creating a model");
const inconsistent=ScientificModelSession.create(task(),limits),inconsistentResult=fitted(inconsistent,structure([{label:"a",expression:"one"}],["a"]));
check(inconsistentResult.state==="REJECTED"&&"linearState"in inconsistentResult&&inconsistentResult.linearState==="INCONSISTENT","Independent replay separates a wrong proposed structure from rank ambiguity");
function calibrationTask(xs:readonly string[],ys:readonly string[]):ScientificModelTask{
  const t=task(),observations=xs.map((value,i)=>({pointId:`Cal${i}`,inputs:[{id:"x",value}],output:ys[i],evidenceRef:`OBS${i}`}));
  return{...t,observations,experiments:t.experiments.map((e,i)=>({...e,inputs:[{id:"x",value:i?"7":"4"}]})),objective:{...t.objective,admittedEvidence:observations.map(o=>({...t.objective.admittedEvidence[0],evidenceId:o.evidenceRef,
    provenanceRoot:o.evidenceRef,contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output})}))}};
}
const rationalStructure=structure([{label:"a",expression:"x"},{label:"b",expression:"one"},{label:"c",expression:"x"}],["a","b"],["c"]);
const rationalTask=calibrationTask(["0","1","2","3"],["3","5/2","7/3","9/4"]),rationalSession=ScientificModelSession.create(rationalTask,limits),rationalFit=fitted(rationalSession,rationalStructure);
check(rationalFit.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&rationalFit.fit.linear.values.join("|")==="2|3|1","A model-authored rational denominator is fitted by calibration cross-multiplication, not hidden structure search");
const rationalAdmission=rationalFit.state==="FITTED_CANDIDATE_NOT_ADMITTED"?propose(rationalSession,rationalFit.fit.draft!):null;
check(rationalAdmission?.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH",
  "Independently replayed rational fitting still passes the existing exact point prediction admission");
check(rationalAdmission?.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH"&&rationalSession.inspect(rationalAdmission.model).predictions.slice(-2).map(p=>p.value).join("|")==="11/5|17/8",
  "Fitting uses calibration outputs only; prospective development extrapolation is evaluated afterward with the existing model interpreter");
const affineStructure=structure([{label:"slope",expression:"x"},{label:"offset",expression:"one"}],["slope","offset"]);
for(let i=1;i<=24;i++){
  const ys=[String(-i),String(i),String(3*i)],t=calibrationTask(["0","1","2"],ys),s=ScientificModelSession.create(t,limits),r=fitted(s,affineStructure);
  check(r.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&r.fit.linear.values.join("|")===`${2*i}|${-i}`,"Independent original-source replay recovers fresh development coefficients without equation-specific repair");
  check(r.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&propose(s,r.fit.draft!).state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH","Every development coefficient variation preserves ordinary model admission and future-point derivation");
}
const multivariateTask=task(),multiInputs=[["0","0"],["1","0"],["0","1"],["2","3"]],multiOutputs=["4","6","1","-1"];
const multiObs=multiInputs.map((values,i)=>({pointId:`Multi${i}`,inputs:[{id:"x",value:values[0]},{id:"z",value:values[1]}],output:multiOutputs[i],evidenceRef:`MULTI${i}`}));
const multiTask:ScientificModelTask={...multivariateTask,variables:["x","z"],observations:multiObs,
  experiments:multivariateTask.experiments.map(e=>({...e,inputs:[{id:"x",value:"3"},{id:"z",value:"5"}]})),objective:{...multivariateTask.objective,
    admittedEvidence:multiObs.map(o=>({...multivariateTask.objective.admittedEvidence[0],evidenceId:o.evidenceRef,provenanceRoot:o.evidenceRef,
      contentDigest:theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output})}))}};
const multiFit=fitted(ScientificModelSession.create(multiTask,limits),structure([{label:"a",expression:"x"},{label:"b",expression:"z"},{label:"c",expression:"one"}],["a","b","c"]));
check(multiFit.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&multiFit.fit.linear.values.join("|")==="2|-3|4","The same fitter handles independently replayed multivariable calibration without task-specific structures or coefficients");
const denseMatrix=Array.from({length:12},(_,i)=>Array.from({length:8},(_,j)=>String(i**j))),denseRhs=denseMatrix.map(row=>String(row.reduce((n,v,j)=>n+Number(v)*(j+1),0)));
check(fitExactLinearSystem(denseMatrix,denseRhs,countedTick).values.join("|")==="1|2|3|4|5|6|7|8","Dense fitting exercises the maximum 12-row/8-column domain under a finite native work budget");
const collisionStructure={...basicStructure,basis:{...basicStructure.basis,definitions:[{id:"FitBasis0",expression:"x"}],outputs:[{label:"a",expression:"FitBasis0"}]}};
check(fitted(ScientificModelSession.create(task(),limits),collisionStructure).state==="FITTED_CANDIDATE_NOT_ADMITTED","Deterministic generated basis bindings avoid existing model-authored namespace collisions");
const corruptNative=fitScientificStructure(rationalTask,rationalStructure,countedTick);
const simpleFit=fitScientificStructure(task(),basicStructure,countedTick);
check(fitVerify(task(),basicStructure,{...simpleFit,linear:{...simpleFit.linear,rank:true as unknown as number}}).decision==="DISAGREES",
  "Independent detector rejects boolean-as-integer rank claims instead of relying on Python dictionary numeric equality");
check(fitVerify(rationalTask,rationalStructure,{...corruptNative,linear:{...corruptNative.linear,values:["3","3","1"]}}).decision==="DISAGREES","Independent detector rejects planted coefficient corruption");
check(fitVerify(rationalTask,rationalStructure,{...corruptNative,linear:{...corruptNative.linear,rank:1}}).decision==="DISAGREES","Independent detector rejects planted rank corruption");
check(fitVerify(rationalTask,rationalStructure,{...corruptNative,draft:{...corruptNative.draft!,program:{schemaVersion:5,definitions:[],outputs:[{label:"response",expression:"a*x"}]}}}).decision==="DISAGREES",
  "Independent detector recomputes original-basis semantics instead of trusting generated candidate code");
const underNative=fitScientificStructure(task(),structure([{label:"a",expression:"x"},{label:"b",expression:"x"}],["a","b"]),countedTick);
check(fitVerify(task(),structure([{label:"a",expression:"x"},{label:"b",expression:"x"}],["a","b"]),{...underNative,draft:draft("x")}).decision==="DISAGREES",
  "A non-unique fit cannot smuggle an arbitrary completed candidate past independent replay");
const degenerate=fitted(ScientificModelSession.create(task(),limits),structure([{label:"a",expression:"one"},{label:"b",expression:"one"}],["a"],["b"]));
check(degenerate.state==="INSUFFICIENT_EVIDENCE","Unique cross-multiplied coefficients with a zero denominator are not accepted as a scientific function");
let observedGetter=false;const getterStructure=Object.defineProperty({},"schemaVersion",{enumerable:true,get(){observedGetter=true;return 1;}});
const badStructures=[getterStructure,{...basicStructure,command:"execute"},{...basicStructure,denominatorConstant:"zero"},{...basicStructure,numerator:["x"]},
  {...basicStructure,numerator:["a","a"]},{...basicStructure,denominator:["a"]},structure([{label:"a",expression:"MIN(x,one)"}],["a"]),
  {...basicStructure,basis:{schemaVersion:5,definitions:[{id:"a",expression:"x"}],outputs:[{label:"a",expression:"a"}]}},structure([{label:"a",expression:"missing+x"}],["a"])];
for(const bad of badStructures)check(fitted(ScientificModelSession.create(task(),limits),bad).state==="REJECTED","Malformed, accessor, shadowed, unauthorized operation or unbound fitting structure rejects before model admission");
check(!observedGetter,"Fitting does not invoke model-provided host getters during snapshotting");
const oneFit=ScientificModelSession.create(task(),{...limits,maxRequests:1});fitted(oneFit,basicStructure);
throws(()=>propose(oneFit,draft("x")),"One fitting request cannot create a free extra ordinary model-proposal request");
const resourceFit=ScientificModelSession.create(task(),{...limits,maxWorkUnits:setup+2});
check(fitted(resourceFit,basicStructure).state==="INSUFFICIENT_EVIDENCE","Fitting stops under the original shared work bound rather than refreshing its budget");
const foreignFit=fitSession.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:"0".repeat(64),structure:basicStructure},fitVerify);
check(foreignFit.state==="REJECTED"&&"reason"in foreignFit&&foreignFit.reason==="FIT_CONTRACT","Fitting cannot target another task domain or manufacture experiment authority");
const conflictSession=ScientificModelSession.create(task(),limits),disagree=()=>({decision:"DISAGREES" as const,verificationDigest:"a".repeat(64)});
fitted(conflictSession,basicStructure,disagree);const conflict=fitted(conflictSession,basicStructure);
check(conflict.state==="REJECTED"&&"reason"in conflict&&conflict.reason==="CRITICAL_INDEPENDENT_FIT_CONFLICT","A later positive verifier cannot vote away a critical fitting disagreement");
const malformedFit=fitted(ScientificModelSession.create(task(),limits),basicStructure,()=>({decision:"AGREES",verificationDigest:"forged"}));
check(malformedFit.state==="INSUFFICIENT_EVIDENCE","Invalid independent fitting custody is not an acceptance vote");
const brokenFit=fitted(ScientificModelSession.create(task(),limits),basicStructure,()=>{throw Error("verification_infrastructure");});
check(brokenFit.state==="INSUFFICIENT_EVIDENCE","Independent verifier outages are neither model reasoning refutations nor passes");
const fitReentry=ScientificModelSession.create(task(),limits);let fitReentryPrevented=false;
const fitReentryResult=fitted(fitReentry,basicStructure,(t,s,f)=>{try{fitted(fitReentry,basicStructure);}catch{fitReentryPrevented=true;}return fitVerify(t,s,f);});
check(fitReentryPrevented&&fitReentryResult.state==="FITTED_CANDIDATE_NOT_ADMITTED"&&fitReentry.usage().requests===1,"A fitting verifier cannot recursively interleave ownership or hidden native requests");
const revokedFit=ScientificModelSession.create(task(),limits);revokedFit.revoke();throws(()=>fitted(revokedFit,basicStructure),"Revoked fitting authority remains unavailable");
let fitClock=now;const expiredFit=ScientificModelSession.create(task(),{...limits,expiresAtEpochMs:now+1000},()=>fitClock);
throws(()=>fitted(expiredFit,basicStructure,(t,s,f)=>{const v=fitVerify(t,s,f);fitClock=now+1000;return v;}),"Successful independent fitting evidence cannot admit after the original lease expires");
fitClock=now;throws(()=>fitted(expiredFit,basicStructure),"Clock rollback cannot resurrect an expired fitting session");
const nativeCognition=await runNyxScientificModelGeneration({session:ScientificModelSession.create(task(),limits),maxCalls:1,maxOutputTokens:2048,deadlineEpochMs:now+60000,verify,
  nativeFit:{verify:fitVerify},complete:async request=>{const p=JSON.parse(request.messages[1].content);
    check(p.nativeFitPolicy.grantsAuthority===false&&!JSON.stringify(p).includes("heldout")&&JSON.stringify(request.responseFormat).includes("denominatorConstant"),"Opt-in NYX cognition sees the original observations and typed fitting grammar, not a hidden formula catalog");
    return fake(request,{schemaVersion:1,models:[basicStructure,quadraticStructure]});}});
check(nativeCognition.competingModelsAdmitted&&nativeCognition.firstAttemptAdmitted&&nativeCognition.calls===1&&nativeCognition.nativeUsage.requests===4&&nativeCognition.nativeUsage.fitRequests===2,
  "Existing NYX cognition composes two independently fitted structures with ordinary exact proposal admission (test double, not live reasoning evidence)");
check(nativeCognition.attempts[0].proposals.every(p=>p.fit?.linearState==="UNIQUE"&&p.fit.rank===1)&&!JSON.stringify(nativeCognition.attempts).includes('"parameters"')
  &&!nativeCognition.scientificTruthEstablished&&!nativeCognition.cognitiveGainDemonstrated&&!nativeCognition.authorityGranted,"Public fitting evidence contains bounded outcomes/costs rather than unnecessary source, coefficients, private reasoning or authority");
const fitCapped=await runNyxScientificModelGeneration({session:ScientificModelSession.create(task(),{...limits,maxRequests:3}),maxCalls:2,maxOutputTokens:2048,deadlineEpochMs:now+60000,verify,nativeFit:{verify:fitVerify},
  complete:async request=>fake(request,{schemaVersion:1,models:[basicStructure,quadraticStructure]})});
check(!fitCapped.competingModelsAdmitted&&fitCapped.calls===1&&fitCapped.nativeUsage.requests===3&&fitCapped.models.length===1,"Finite fitting/proposal capacity cannot be silently increased to manufacture two admitted hypotheses");
for(const [expression,code] of [["x+","SYNTAX"],["x y","TRAILING_TOKEN"],["foo(x)","FUNCTION_NOT_ALLOWED"],["-x","ZERO_NOT_BOUND"]] as const){
  let caught:unknown;try{compileAlgebraicExpressionGraph(["x","y"],undefined,{schemaVersion:5,definitions:[],outputs:[{label:"a",expression}]});}catch(e){caught=e;}
  check(algebraicBoundaryCode(caught)===code,"Generic OTHER diagnostics now expose the exact safe parser boundary without recovering failed live source");
  check(!JSON.stringify(algebraicBoundaryCode(caught)).includes(expression),"Structural boundary feedback contains no proposed expression or offending token");
}
check(algebraicBoundaryCode(Error("quantitative_algebraic_invalid:SYNTAX"))===null,"Exception text alone cannot forge structural compiler provenance");
check(fitCosts.length>24&&fitCosts.every(c=>c.elapsedMs>=0&&(c.childCpuMs===null||c.childCpuMs>=0))&&fitCosts.some(c=>c.decision==="DISAGREES"),
  "Independent fitting replay costs and planted detector rejections are observable separately from model usage");
// Author witnesses/detector attacks are offline data, not live prompt hints.
function freshFitWitness(w:ScientificFitWorld):ScientificModelStructure{
  const basis=w.hidden.kind==="BILINEAR"?["x*y","x","y","one"]:w.hidden.kind==="INVERSE_CHANNELS"?["one/x","one/y","one/(x*y)"]
    :w.hidden.kind==="MIXED_CUBIC"?["x*x*x","x*y*y","y","one"]:["x*y","x+y","one","x*y"];
  const labels=basis.map((_,i)=>["a","b","c","d"][i]);
  return structure(basis.map((expression,i)=>({label:labels[i],expression})),w.hidden.kind==="CROSS_RATIO"?labels.slice(0,3):labels,w.hidden.kind==="CROSS_RATIO"?["d"]:[]);
}
const interpolationStructure:ScientificModelStructure={...structure(["one","u","u2","u3","u4","u5"].map((expression,i)=>({label:`q${i}`,expression})),["q0","q1","q2","q3","q4","q5"]),
  basis:{schemaVersion:5,definitions:[{id:"u",expression:"x+y+y+y"},{id:"u2",expression:"u*u"},{id:"u3",expression:"u2*u"},{id:"u4",expression:"u3*u"},{id:"u5",expression:"u4*u"}],
    outputs:["one","u","u2","u3","u4","u5"].map((expression,i)=>({label:`q${i}`,expression}))}};
const freshWitnesses=new Map<string,{task:ScientificModelTask;structures:ScientificModelStructure[];drafts:ScientificModelDraft[]}>();
for(const w of SCIENTIFIC_FIT_WORLDS){
  const t=scientificFitTask(w,candidate,Date.now(),Date.now()+120000,calibration(w)),correctStructure=freshFitWitness(w),base=fitScientificStructure(t,correctStructure,countedTick),alt=fitScientificStructure(t,interpolationStructure,countedTick);
  check(base.linear.state==="UNIQUE"&&alt.linear.state==="UNIQUE"&&!!base.draft&&!!alt.draft,"Fresh fixture gold structure and distinct interpolation competitor are identifiable from the same six calibration points");
  if(!base.draft||!alt.draft)throw Error("fresh_fixture_rank_failed");
  const good=independentScienceGrade(w,t,base.draft),bad=independentScienceGrade(w,t,alt.draft);
  check(good.accepted&&good.cost.points===14&&good.cost.undefinedPoints===0&&good.cost.resourceBlockedPoints===0,"Fresh fixture gold model is independently accepted on all six calibration, three prospective and five hidden points");
  check(!bad.accepted&&bad.cost.matched>=6,"The unchanged held-out oracle rejects an exactly calibration-fitting interpolation overfit");
  const simulator=spawnSync(process.execPath,["--input-type=module","-e",SCIENTIFIC_FIT_SIMULATOR_SOURCE+`\nconsole.log(JSON.stringify(${JSON.stringify(w.calibration)}.map(p=>show(calculate(${JSON.stringify(w.hidden)},p)))));`],{encoding:"utf8",timeout:5000,windowsHide:true});
  check(simulator.status===0&&JSON.stringify(JSON.parse(simulator.stdout))===JSON.stringify(t.observations.map(o=>o.output)),"Independent Node author simulator and Python Fraction agree before fresh corpus freeze");
  freshWitnesses.set(w.taskId,{task:t,structures:[correctStructure,interpolationStructure],drafts:[base.draft,alt.draft]});
}
let freshCalls=0;const freshEpoch=await runFreshScientificFitEpoch(async(request,stage)=>{
  freshCalls++;const context=JSON.parse(request.messages[1].content),id=stage.split("/")[0];
  check(request.reasoningControl===SCIENTIFIC_FIT_EPOCH.reasoningControl&&request.reasoningBudgetTokens===SCIENTIFIC_FIT_EPOCH.reasoningBudgetTokens&&!request.reasoningEffort,
    "Fresh control and treatment retain identical explicit Super wire reasoning configuration");
  check(!JSON.stringify(context).includes('"hidden"')&&!JSON.stringify(context).includes('"heldout"')&&!JSON.stringify(context).includes('"family"'),"Fresh model requests do not receive author law identities, coefficients or hidden test points");
  if(stage.endsWith("GENERATION"))return fake(request,{schemaVersion:1,models:context.nativeFitPolicy?freshWitnesses.get(id)!.structures:freshWitnesses.get(id)!.drafts});
  const observation=context.prospectiveObservation.measurement,selected=context.models.find((m:any)=>m.forecasts.find((p:any)=>p.pointId===observation.pointId)?.value===observation.value);
  return fake(request,{schemaVersion:1,operation:selected?"CONCLUDE":"NO_CONCLUSION",modelId:selected?.modelId??null});
},{candidate,sourceDigests:{offline:theoryDigest("explicit-fresh-fit-test-double")}});
check(freshEpoch.populationComplete&&freshEpoch.gradedComplete&&freshEpoch.cleanupComplete&&freshEpoch.arms.every(a=>a.correct===8&&a.graded===8)&&freshEpoch.rows.length===24,
  "Fresh eight-case composition runs the real bounded R3B observation and independently grades all 24 offline control/treatment/ablation stages");
check(freshCalls===32&&freshEpoch.physicalCalls===32&&freshEpoch.physicalMeasurementCount===16&&freshEpoch.rows.filter(r=>r.sharedPrefixWith!==null).length===8,
  "Same-tool ablation shares exactly the native generation/observation prefix rather than double-counting physical calls or inventing independent samples");
check(freshEpoch.pairs.every(p=>p.independentlyGraded&&p.realizedInferenceMatched&&p.sameToolPrefixShared&&!p.sameToolIndependentSample)&&!freshEpoch.scopedFittingSignal&&!freshEpoch.selectionSignal,
  "Equal offline results do not become cognitive improvement or selection advantage even when the synthetic inference budget matches");
check(freshEpoch.rows.every(r=>r.grading?.points===14&&r.cleanup?.sourceUnchanged===true&&r.native&&r.native.requests<=8&&r.native.workUnits<=300000),
  "Fresh fixture execution preserves original source integrity, exact all-point acceptance and shared native limits");
check(freshEpoch.rows.every(r=>typeof r.simulatorDigest==="string"&&/^[a-f0-9]{64}$/.test(r.simulatorDigest))
  &&freshEpoch.rows.filter(r=>r.sharedPrefixWith!==null).every(r=>r.simulatorDigest===freshEpoch.rows.find(s=>s.taskId===r.taskId&&s.arm==="NATIVE_FIT")?.simulatorDigest),
  "Fresh observation evidence retains the pinned simulator identity and makes shared-prefix custody explicit");
check(freshEpoch.physicalReplayCosts.some(c=>c.kind==="FIT")&&freshEpoch.physicalReplayCosts.some(c=>c.kind==="POINT_DERIVATION")
  &&freshEpoch.rows.filter(r=>r.arm==="SAME_TOOL_FIRST_NON_REFUTED").every(r=>r.selection.modelEvidence===null&&r.selection.elapsedMs===0),
  "Fit/replay and model-selection costs remain separately observable with zero fabricated ablation model calls");
const failedFresh=await runFreshScientificFitEpoch(async(request)=>{const r=fake(request,{schemaVersion:1,models:[]});return{...r,finishReason:"length",evidence:{...r.evidence,finishReason:"length"}};},
  {candidate,sourceDigests:{offline:theoryDigest("explicit-fresh-truncation-test-double")}});
check(failedFresh.populationComplete&&!failedFresh.gradedComplete&&failedFresh.arms.every(a=>a.graded===0&&a.ungraded===8)&&failedFresh.pairs.every(p=>!p.independentlyGraded&&!p.realizedInferenceMatched),
  "Unreached hidden tests and identical empty prefixes cannot masquerade as matched reasoning failures or accepted comparisons");
check(failedFresh.rows.filter(r=>r.arm!=="SAME_TOOL_FIRST_NON_REFUTED").every(r=>r.generation.every(a=>a.outcome==="TRUNCATION")&&r.outcome==="NO_ADMITTED_COMPETING_MODEL_POPULATION"),
  "Fresh truncated serialization remains a generation interface failure, not an executed wrong hidden prediction");
const unknownFresh=await runFreshScientificFitEpoch(async()=>{throw Error("controlled_transport_exception");},{candidate,sourceDigests:{offline:theoryDigest("explicit-unknown-delivery-test-double")}});
check(unknownFresh.physicalCalls===16&&unknownFresh.physicalUsage.unknownUsageCalls===16&&unknownFresh.unknownHttpAttemptCounts===16&&!unknownFresh.providerStable,
  "Unexpected transport exceptions preserve actual attempted call counts with unknown tokens/HTTP attempts instead of fictitious zero usage");
let selectionClock=Date.now();const rejectedSelections=await runFreshScientificFitEpoch(async(request,stage)=>{
  const context=JSON.parse(request.messages[1].content),id=stage.split("/")[0],index=SCIENTIFIC_FIT_WORLDS.findIndex(w=>w.taskId===id);
  if(stage.endsWith("GENERATION"))return fake(request,{schemaVersion:1,models:context.nativeFitPolicy?freshWitnesses.get(id)!.structures:freshWitnesses.get(id)!.drafts});
  const reply=fake(request,{schemaVersion:1,operation:"NO_CONCLUSION",modelId:null});
  if(index===0)return fake(request,{schemaVersion:1,operation:"SHELL",modelId:null,command:"never_execute_text"});
  if(index===1)return fake(request,{schemaVersion:1,operation:"CONCLUDE",modelId:"MODEL-foreign"});
  if(index===2)return{...reply,content:"not-json"};
  if(index===3)return{...reply,finishReason:"length",evidence:{...reply.evidence,finishReason:"length"}};
  if(index===4)return{...reply,decision:"PROVIDER_ERROR",content:null,finishReason:null,evidence:{...reply.evidence,networkAttempted:true,statusCode:503,usage:{promptTokens:null,completionTokens:null,totalTokens:null}}};
  if(index===6){selectionClock=request.deadlineEpochMs+1;return fake(request,{schemaVersion:1,operation:"CONCLUDE",modelId:context.models[0].modelId});}
  if(index===7)return fake(request,{schemaVersion:1,operation:"CONCLUDE",modelId:true});
  return reply;
},{candidate,sourceDigests:{offline:theoryDigest("explicit-selection-boundary-test-double")}},()=>selectionClock);
check(rejectedSelections.populationComplete&&rejectedSelections.arms[0].graded===0&&rejectedSelections.arms[1].graded===0&&rejectedSelections.arms[2].correct===8,
  "Same-tool non-refuted control can succeed while model selection fails; the evaluator does not force model-mediated selection superiority");
const rejectionKinds=new Set(rejectedSelections.rows.filter(r=>r.sharedPrefixWith===null).map(r=>r.selection.outcome));
for(const outcome of ["SELECTION_UNSUPPORTED_CAPABILITY","SELECTION_AUTHORIZATION_REJECTION","SELECTION_SCHEMA_REJECTION","SELECTION_TRUNCATION","SELECTION_PROVIDER_FAILURE","NO_CONCLUSION","LATE_SELECTION_REJECTED"])
  check(rejectionKinds.has(outcome),"Fresh selection separates unsupported capability, scope, schema, truncation, delivery, uncertainty and expired success");
check(rejectedSelections.rows.filter(r=>r.sharedPrefixWith===null).every(r=>!r.selectedCandidateSubmitted&&r.grading===null)&&!rejectedSelections.scopedFittingSignal&&!rejectedSelections.selectionSignal,
  "Rejected or late model selections never reach hidden grading or create a positive cognitive claim");
const poleWorld=SCIENTIFIC_FIT_WORLDS[0],poleTask=scientificFitTask(poleWorld,candidate,Date.now(),Date.now()+60000,calibration(poleWorld));
const pole={...freshWitnesses.get(poleWorld.taskId)!.drafts[0],parameters:[...freshWitnesses.get(poleWorld.taskId)!.drafts[0].parameters,{id:"pole",value:poleWorld.heldout[0][0]}],
  program:{schemaVersion:5 as const,definitions:[],outputs:[{label:"response",expression:"one/(x-pole)"}]}};
const poleGrade=independentScienceGrade(poleWorld,poleTask,pole);
check(!poleGrade.accepted&&poleGrade.cost.undefinedPoints===1,"An undefined hidden-point response is a rejected candidate-domain failure, not a falsely unavailable grader");
let preflightClock=Date.now(),preflightTicks=0,zeroModelCalls=0;const preflightReports:any[]=[];
const unexecutedEpoch=await runFreshScientificFitEpoch(async()=>{zeroModelCalls++;throw Error("must_not_call");},{candidate,sourceDigests:{offline:theoryDigest("expired-preflight-test-double")}},
  ()=>preflightClock+(preflightTicks++?SCIENTIFIC_FIT_EPOCH.maxEpochMs+1:0),async r=>{preflightReports.push(r);});
check(zeroModelCalls===0&&unexecutedEpoch.physicalCalls===0&&!unexecutedEpoch.providerStable&&unexecutedEpoch.arms.every(a=>a.unexecuted===8&&a.graded===0),
  "A deadline-expired epoch cannot claim stable provider delivery or reuse expired capacity to start inference");
check(preflightReports[0]?.freezeDigest&&preflightReports[0].physicalCalls===0&&preflightReports[0].rows.length===0,
  "The frozen task/source/configuration commitment is persisted before any possible model invocation");
console.log(`OMEGA_SCIENTIFIC_FIT_DEVELOPMENT nativeWorkUnits=${scalarTicks} independentCalls=${fitCosts.length} independentMs=${fitCosts.reduce((n,c)=>n+c.elapsedMs,0).toFixed(2)} liveModelCalls=0 cognitiveGainDemonstrated=false`);
console.log(`OMEGA_SCIENTIFIC_MODEL_GENERATION_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);if(failed)process.exitCode=1;
