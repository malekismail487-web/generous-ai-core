import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment,type NvidiaNimCompletionRequest,type NvidiaNimCompletionResult,type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {runNyxScientificModelGeneration} from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import {ScientificModelSession,type ScientificModelRef,type ScientificModelTask} from "../../src/lib/codelab/research/scientificModelGeneration";
import type {ScientificSearchSpec} from "../../src/lib/codelab/research/scientificModelSearch";
import {snapshotBoundedReasoningData} from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import {immutableTheoryValue,theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {scientificModelReplay,scientificFitReplay,type ScientificReplayCost} from "./benchmarks/scientific-model-replay";
import {scienceCalibration,independentScienceGrade,type ScientificOracleCase} from "./nyx-scientific-world-live-eval";
import {prepareScientificRig} from "./scientific-world-rig";
import {procedureInferenceRequest,usage,sumUsage} from "./nyx-procedure-reuse-live-eval";
import {SCIENTIFIC_FIT_EPOCH as DEFAULT_EPOCH,SCIENTIFIC_FIT_WORLDS,SCIENTIFIC_FIT_CORPUS_DIGEST,SCIENTIFIC_FIT_SIMULATOR_SOURCE,scientificFitTask} from "./nyx-scientific-fit-fixtures";
import {SCIENTIFIC_SEARCH_EPOCH,SCIENTIFIC_SEARCH_WORLDS,SCIENTIFIC_SEARCH_CORPUS_DIGEST,SCIENTIFIC_SEARCH_SIMULATOR_SOURCE,SCIENTIFIC_FIXED_SEARCH,scientificSearchTask} from "./nyx-scientific-search-fixtures";
import {SCIENTIFIC_DIAGONAL_TRANSFER_EPOCH,SCIENTIFIC_DIAGONAL_TRANSFER_WORLDS,SCIENTIFIC_DIAGONAL_TRANSFER_CORPUS_DIGEST,
  SCIENTIFIC_DIAGONAL_TRANSFER_SIMULATOR_SOURCE,SCIENTIFIC_DIAGONAL_FIXED_SEARCH} from "./nyx-scientific-search-fixtures";
type Generation=Awaited<ReturnType<typeof runNyxScientificModelGeneration>>;
type Complete=(r:NvidiaNimCompletionRequest,stage:string)=>Promise<NvidiaNimCompletionResult>;
type Cost=ReturnType<typeof usage>;
type Arm=typeof DEFAULT_EPOCH.arms[number];
type GenerationMode="MODEL_STRUCTURE"|"NYX_SEARCH"|"FIXED_SEARCH";
export interface ScientificFitEpochOptions{
  readonly epoch:typeof DEFAULT_EPOCH;readonly worlds:readonly ScientificOracleCase[];
  readonly corpusDigest:string;readonly simulatorSource:string;
  readonly generationModes:readonly GenerationMode[];readonly fixedSearchSpec:ScientificSearchSpec;
  readonly taskFactory:(world:ScientificOracleCase,candidate:string,at:number,expires:number,values:readonly string[])=>ScientificModelTask;
}
type Replay=ScientificReplayCost & {kind:"FIT"|"POINT_DERIVATION"};
type Selection={outcome:string;modelId:string|null;modelEvidence:NvidiaNimEvidence|null;elapsedMs:number;diagnostic?:ScientificSelectionDiagnostic};
type Row={taskId:string;family:string;arm:Arm;generationAttempted:boolean;generationFirstAdmitted:boolean|null;generation:Generation["attempts"];
  fixedSearch?:{state:string;reason:string|null;evaluatedSupports:number;candidateCount:number;resultDigest:string;proposals:{state:string;reason:string|null;resultDigest:string}[]};
  candidateCount:number;competingArtifactsAdmitted:boolean;generationFailure:string|null;generationBudgetStopReason:string|null;generationStage:string;
  measurement:{experimentId:string;evidenceId:string;executionIdentity:string;provenanceRoot:string;candidateBinding:string;observedAtEpochMs:number;elapsedMs:number}|null;
  measurementFailure:string|null;selection:Selection;selectedCandidateSubmitted:boolean;accepted:boolean|null;outcome:string;
  grading:ReturnType<typeof independentScienceGrade>["cost"]|null;usage:Cost;native:ReturnType<ScientificModelSession["usage"]>|null;replay:Replay[];
  cleanup:Awaited<ReturnType<Awaited<ReturnType<typeof prepareScientificRig>>["cleanup"]>>|null;
  setupMs:number;fixtureAttempted:boolean;simulatorDigest:string|null;generationMs:number;sharedPrefixWith:Arm|null;completed:boolean};
const python=()=>process.env.OMEGA_POLYNOMIAL_PYTHON??"python";
const cost=(entries:readonly {evidence:NvidiaNimEvidence|null;outcome:string}[],elapsedMs=0):Cost=>{
  const known=entries.flatMap(e=>e.evidence?[{modelEvidence:e.evidence,outcome:e.outcome}]:[]),unknown=entries.filter(e=>!e.evidence).length;
  const result=usage({calls:known.length,attempts:known,toolRequests:0,toolWorkUnits:0,toolElapsedMs:0,elapsedMs});
  return{...result,calls:result.calls+unknown,unknownUsageCalls:result.unknownUsageCalls+unknown};
};
const validSelection=(raw:unknown,models:readonly ScientificModelRef[]):{operation:"CONCLUDE"|"NO_CONCLUSION";modelId:string|null}|null=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).sort().join("|")!=="modelId|operation|schemaVersion")return null;
  const r=raw as Record<string,unknown>;
  if(r.schemaVersion!==1)return null;
  return r.operation==="CONCLUDE"&&typeof r.modelId==="string"&&models.some(m=>m.modelId===r.modelId)?{operation:"CONCLUDE",modelId:r.modelId}
    :r.operation==="NO_CONCLUSION"&&r.modelId===null?{operation:"NO_CONCLUSION",modelId:null}:null;
};

export interface ScientificSelectionDiagnostic {
  readonly version:"nyx-scientific-selection-contract/1";
  readonly boundary:"VALID"|"JSON_PARSE"|"DATA_SNAPSHOT"|"ROOT_SHAPE"|"FIELD_SET"|"SCHEMA_VERSION"|"OPERATION_TYPE"
    |"UNSUPPORTED_OPERATION"|"MODEL_ID_TYPE"|"UNKNOWN_MODEL_REFERENCE"|"NO_CONCLUSION_REQUIRES_NULL";
  readonly missingFields:readonly string[];readonly unexpectedFieldCount:number;readonly wrongTypeFields:readonly string[];
}
/** Describe the existing strict boundary, never repair/coerce its content.
 * Only fixed contract field names and counts survive; no unknown keys, model
 * IDs, raw source/response, private reasoning or low-entropy answer hash. */
export function inspectScientificSelection(content:string,models:readonly ScientificModelRef[]){
  const required=["schemaVersion","operation","modelId"];
  let parsed:unknown,raw:Record<string,unknown>|null=null;
  let boundary:ScientificSelectionDiagnostic["boundary"]="VALID";
  try{parsed=JSON.parse(content);}catch{boundary="JSON_PARSE";}
  if(boundary==="VALID")try{parsed=snapshotBoundedReasoningData(parsed);}catch{boundary="DATA_SNAPSHOT";}
  if(boundary==="VALID"){
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))boundary="ROOT_SHAPE";
    else raw=parsed as Record<string,unknown>;
  }
  const actual=raw?Object.keys(raw):[],missingFields=raw?required.filter(k=>!Object.prototype.hasOwnProperty.call(raw,k)):[];
  const unexpectedFieldCount=actual.filter(k=>!required.includes(k)).length,wrongTypeFields:string[]=[];
  if(raw){
    if(typeof raw.schemaVersion!=="number")wrongTypeFields.push("schemaVersion");
    if(typeof raw.operation!=="string")wrongTypeFields.push("operation");
    if(raw.modelId!==null&&typeof raw.modelId!=="string")wrongTypeFields.push("modelId");
    if(missingFields.length||unexpectedFieldCount)boundary="FIELD_SET";
    else if(raw.schemaVersion!==1)boundary="SCHEMA_VERSION";
    else if(typeof raw.operation!=="string")boundary="OPERATION_TYPE";
    else if(!["CONCLUDE","NO_CONCLUSION"].includes(raw.operation))boundary="UNSUPPORTED_OPERATION";
    else if(raw.operation==="NO_CONCLUSION"&&raw.modelId!==null)boundary="NO_CONCLUSION_REQUIRES_NULL";
    else if(raw.operation==="CONCLUDE"&&typeof raw.modelId!=="string")boundary="MODEL_ID_TYPE";
    else if(raw.operation==="CONCLUDE"&&!models.some(m=>m.modelId===raw!.modelId))boundary="UNKNOWN_MODEL_REFERENCE";
  }
  const choice=validSelection(raw,models);
  if((boundary==="VALID")!==(choice!==null))throw Error("selection_diagnostic_acceptance_disagreement");
  // Preserve the original outcome precedence, even if a malformed object has
  // more than one problem. The additional boundary is diagnostic, not admission.
  const rejectedOutcome=choice?null:raw&&typeof raw.operation==="string"&&!["CONCLUDE","NO_CONCLUSION"].includes(raw.operation)?"SELECTION_UNSUPPORTED_CAPABILITY"
    :raw?.operation==="CONCLUDE"&&typeof raw.modelId==="string"&&!models.some(m=>m.modelId===raw!.modelId)?"SELECTION_AUTHORIZATION_REJECTION":"SELECTION_SCHEMA_REJECTION";
  return immutableTheoryValue({choice,rejectedOutcome,diagnostic:{version:"nyx-scientific-selection-contract/1" as const,boundary,missingFields,unexpectedFieldCount,wrongTypeFields}});
}

/** Only new evaluation composition: existing cognition, fit/proposal custody,
 * original-source verifier and R1/R2A/R3B fixture. No new inference/executor stack. */
export async function runFreshScientificFitEpoch(complete:Complete,binding:{candidate:string;sourceDigests:Record<string,string>},now=Date.now,
  checkpoint:(report:unknown)=>Promise<void>=async()=>{},options?:ScientificFitEpochOptions){
  binding=snapshotBoundedReasoningData(binding);
  const EPOCH=snapshotBoundedReasoningData(options?.epoch??DEFAULT_EPOCH),WORLDS=snapshotBoundedReasoningData(options?.worlds??SCIENTIFIC_FIT_WORLDS);
  const modes=options?snapshotBoundedReasoningData(options.generationModes):null,fixedSpec=options?snapshotBoundedReasoningData(options.fixedSearchSpec):null;
  const makeTask=options?.taskFactory??scientificFitTask,simulatorSource=options?.simulatorSource??SCIENTIFIC_FIT_SIMULATOR_SOURCE;
  if(options&&(EPOCH.arms.length!==3||new Set(EPOCH.arms).size!==3||modes!.length!==3
    ||new Set(modes).size!==3||!modes!.every(m=>["MODEL_STRUCTURE","NYX_SEARCH","FIXED_SEARCH"].includes(m))
    ||options.corpusDigest!==theoryDigest(WORLDS)||typeof makeTask!=="function"
    ||["maxGenerationCalls","maxSelectionCalls","maxOutputTokens","maxModelRequests","maxNativeWorkUnits","maxNativeElapsedMs","maxGenerationMs","maxSelectionMs","maxEpochMs","replayTimeoutMs","realizedTokenMatchTolerance"].some(k=>EPOCH[k]!==DEFAULT_EPOCH[k])
    ||!Number.isSafeInteger(EPOCH.maxPhysicalCalls)||EPOCH.maxPhysicalCalls<1||EPOCH.maxPhysicalCalls>DEFAULT_EPOCH.maxPhysicalCalls
    ||!Number.isSafeInteger(EPOCH.maxHttpAttempts)||EPOCH.maxHttpAttempts<1||EPOCH.maxHttpAttempts>DEFAULT_EPOCH.maxHttpAttempts))throw Error("scientific_epoch_definition_invalid");
  const began=now(),expires=began+EPOCH.maxEpochMs,rows:Row[]=[],ledger:{stage:string;evidence:NvidiaNimEvidence|null;outcome:string}[]=[];
  const calibration=WORLDS.map(w=>({world:w,...scienceCalibration(w)}));
  const tasks=calibration.map(d=>snapshotBoundedReasoningData(makeTask(d.world,binding.candidate,began,expires,d.values)));
  const freeze={...binding,configuration:EPOCH,corpusDigest:options?.corpusDigest??SCIENTIFIC_FIT_CORPUS_DIGEST,issuedAtEpochMs:began,expiresAtEpochMs:expires,
    ...(options?{generationModes:modes,fixedSearchSpec:fixedSpec,simulatorSourceDigest:theoryDigest(simulatorSource)}:{}),
    taskBindings:calibration.map((d,i)=>({taskId:d.world.taskId,family:d.world.family,taskDigest:theoryDigest(tasks[i])}))};
  const invoke=async(r:NvidiaNimCompletionRequest,stage:string)=>{
    if(now()>=expires||ledger.length>=EPOCH.maxPhysicalCalls)throw Error("fit_epoch_budget");
    const item={stage,evidence:null as NvidiaNimEvidence|null,outcome:"LOGICAL_CALL_IN_FLIGHT"};ledger.push(item);await checkpoint(report());
    try{
      const reply=await complete({...procedureInferenceRequest(r),requestId:stage+"/"+r.requestId,deadlineEpochMs:Math.min(r.deadlineEpochMs,expires)},stage);
      item.evidence=snapshotBoundedReasoningData(reply.evidence);item.outcome=reply.decision==="COMPLETED"?"DELIVERED":"PROVIDER_FAILURE";await checkpoint(report());return reply;
    }catch(error){item.outcome="INTEGRATION_CALL_EXCEPTION";await checkpoint(report());throw error;}
  };
  const stageCost=(stage:string)=>cost(ledger.filter(e=>e.stage===stage));
  function report(){
    const arms=EPOCH.arms.map(arm=>{const r=rows.filter(x=>x.arm===arm);return{arm,selected:WORLDS.length,generationAttempted:r.filter(x=>x.generationAttempted).length,
      submitted:r.filter(x=>x.selectedCandidateSubmitted).length,graded:r.filter(x=>x.accepted!==null).length,correct:r.filter(x=>x.accepted===true).length,
      wrongPredictions:r.filter(x=>x.accepted===false).length,ungraded:r.filter(x=>x.generationAttempted&&x.accepted===null).length,
      unexecuted:WORLDS.length-r.filter(x=>x.generationAttempted).length,firstGenerationAdmitted:r.filter(x=>x.generationFirstAdmitted===true).length,
      generationRepaired:r.filter(x=>x.generationFirstAdmitted===false&&x.candidateCount>=2).length,allocatedUsage:sumUsage(r.map(x=>({usage:x.usage}))),
      outcomes:Object.fromEntries([...new Set(r.map(x=>x.outcome))].sort().map(k=>[k,r.filter(x=>x.outcome===k).length]))};});
    const pairs=WORLDS.map(w=>{const a=rows.find(r=>r.taskId===w.taskId&&r.arm===EPOCH.arms[0]),b=rows.find(r=>r.taskId===w.taskId&&r.arm===EPOCH.arms[1]),c=rows.find(r=>r.taskId===w.taskId&&r.arm===EPOCH.arms[2]);
      const graded=!!a&&!!b&&a.accepted!==null&&b.accepted!==null,known=graded&&[a!,b!].every(r=>r.usage.unknownUsageCalls===0&&r.usage.unknownUsageHttpAttempts===0);
      return{taskId:w.taskId,literalAccepted:a?.accepted??null,fitAccepted:b?.accepted??null,sameToolControlAccepted:c?.accepted??null,independentlyGraded:graded,
        realizedInferenceMatched:known&&a!.usage.calls===b!.usage.calls&&a!.usage.httpAttempts===b!.usage.httpAttempts
          &&Math.abs(a!.usage.reportedTokens-b!.usage.reportedTokens)<=EPOCH.realizedTokenMatchTolerance*Math.max(1,a!.usage.reportedTokens,b!.usage.reportedTokens),
        fitNoMoreInference:known&&b!.usage.calls<=a!.usage.calls&&b!.usage.httpAttempts<=a!.usage.httpAttempts&&b!.usage.reportedTokens<=a!.usage.reportedTokens,
        sameToolPrefixShared:!!b&&!!c&&b.generationStage===c.generationStage,sameToolIndependentSample:false,
        ...(options?{referenceArm:EPOCH.arms[0],searchArm:EPOCH.arms[1],controlArm:EPOCH.arms[2],
          sameToolIndependentExecution:true,
          inferenceCostScope:"EQUAL_CEILINGS_UNEQUAL_REALIZED_COMPUTE_FIXED_CONTROL_USES_NO_MODEL_CALLS"}:{})};});
    const physical=cost(ledger),generationPhysical=rows.filter(r=>r.sharedPrefixWith===null),unknownHttpAttemptCounts=ledger.filter(e=>!e.evidence).length;
    const cleanupComplete=generationPhysical.filter(r=>r.fixtureAttempted).every(r=>r.cleanup?.sourceUnchanged===true&&r.cleanup.sandboxCleanupVerified&&r.cleanup.temporaryFixtureRemoved);
    const populationComplete=rows.length===WORLDS.length*EPOCH.arms.length&&rows.every(r=>r.completed),gradedComplete=populationComplete&&rows.every(r=>r.accepted!==null);
    const providerStable=physical.calls>0&&physical.providerFailures===0&&physical.localDeliveryBlocks===0&&physical.recoveredDisruptions===0&&physical.unknownUsageCalls===0&&physical.unknownUsageHttpAttempts===0;
    return immutableTheoryValue({schemaVersion:1,candidate:binding.candidate,freeze,freezeDigest:theoryDigest(freeze),rows,arms,pairs,invocations:ledger,populationComplete,gradedComplete,cleanupComplete,
      ...(options?{evaluationVersion:EPOCH.version,cleanupExercised:generationPhysical.some(r=>r.fixtureAttempted)}:{}),
      providerStable,physicalCalls:ledger.length,physicalUsage:physical,unknownHttpAttemptCounts,
      physicalNativeCost:{requests:generationPhysical.reduce((n,r)=>n+(r.native?.requests??0),0),fitRequests:generationPhysical.reduce((n,r)=>n+(r.native?.fitRequests??0),0),
        searchRequests:generationPhysical.reduce((n,r)=>n+(r.native?.searchRequests??0),0),searchSupports:generationPhysical.reduce((n,r)=>n+(r.native?.searchSupports??0),0),
        completedSearchSupports:generationPhysical.reduce((n,r)=>n+(r.native?.completedSearchSupports??0),0),
        workUnits:generationPhysical.reduce((n,r)=>n+(r.native?.workUnits??0),0),elapsedMs:generationPhysical.reduce((n,r)=>n+(r.native?.nativeElapsedMs??0),0)},
      physicalReplayCosts:generationPhysical.flatMap(r=>r.replay),physicalMeasurementCount:generationPhysical.filter(r=>r.measurement!==null).length,
      calibrationCosts:calibration.map(d=>({taskId:d.world.taskId,...d.cost})),
      resourceUnknowns:{modelInternalCompute:true,costUsd:true,measurementCpu:true,peakMemory:true},elapsedMs:Math.max(0,now()-began),
      stopReason:now()>=expires?"GLOBAL_BUDGET":populationComplete?"PREDECLARED_POPULATION_TERMINAL":"INCOMPLETE",
      scopedFittingSignal:!options&&gradedComplete&&cleanupComplete&&providerStable&&arms[1].correct>arms[0].correct&&pairs.every(p=>Number(p.fitAccepted)>=Number(p.literalAccepted)&&p.fitNoMoreInference),
      selectionSignal:!options&&gradedComplete&&cleanupComplete&&providerStable&&arms[1].correct>arms[2].correct,
      ...(options?{comparisonKind:"INDEPENDENT_SEARCH_CONTROL_WITH_REALIZED_COMPUTE_ACCOUNTING",cognitiveGainDemonstrated:false,armsShareGeneration:false}:{}),
      promotion:EPOCH.promotion,safety:{defaultUltraChanged:false,authorityIncrease:false,generalShell:false,generalNetwork:false,productionAuthority:false,
        rawReasoningPersisted:false,modelProgramsPersisted:false,measurementValuesPersisted:false,hiddenGradesToCognition:false},
      limitations:[EPOCH.scope,options?"MODEL_REQUESTED_SEARCH_VERSUS_FIXED_SEARCH_NOT_SAME_REALIZED_INFERENCE":"MODEL_STRUCTURE_AND_COEFFICIENT_INTERFACE_BUNDLE_NOT_FIT_ONLY_CAUSAL_ISOLATION",
        options?"SIX_CASES_THREE_FAMILY_CLUSTERS_UNDERPOWERED":"EIGHT_CASES_FOUR_FAMILY_CLUSTERS_UNDERPOWERED",
        options?"FIXED_CONTROL_HAS_INDEPENDENT_NATIVE_SEARCH_AND_MEASUREMENT_NO_INFERENCE":"SAME_TOOL_CONTROL_SHARES_GENERATION_AND_MEASUREMENT_NOT_INDEPENDENT_SAMPLES","CANDIDATE_ARTIFACT_COUNT_NOT_PROVEN_SEMANTIC_MODEL_DIVERSITY",
        "ORIGINAL_TWO_MODEL_ADMISSION_PRESERVED_NOT_SEMANTIC_INDEPENDENCE","FIXED_MEASUREMENT_NOT_ADAPTIVE_EXPERIMENT_DESIGN","INFERENCE_MATCH_NOT_TOTAL_COMPUTE_MATCH"]});
  }
  await checkpoint(report()); // Task/config/source commitment precedes inference.
  for(const[i,d]of calibration.entries()){
    const w=d.world,task=tasks[i];
    // Balance ordering; the frozen cases and acceptance are the same in each arm.
    const activeArms=options?[...EPOCH.arms]:["LITERAL_GENERATION","NATIVE_FIT"];
    const order=activeArms.slice(i%activeArms.length).concat(activeArms.slice(0,i%activeArms.length));
    for(const arm of order){
      const mode=modes?.[EPOCH.arms.indexOf(arm)]??(arm==="NATIVE_FIT"?"MODEL_STRUCTURE":null);
      const stage=w.taskId+"/"+arm+"/GENERATION",selectionStage=w.taskId+"/"+arm+"/SELECTION",replay:Replay[]=[];
      const rowStart=now(),row:Row={taskId:w.taskId,family:w.family,arm,generationAttempted:false,generationFirstAdmitted:null,generation:[],candidateCount:0,competingArtifactsAdmitted:false,
        generationFailure:null,generationBudgetStopReason:null,generationStage:stage,measurement:null,measurementFailure:null,selection:{outcome:"UNEXECUTED",modelId:null,modelEvidence:null,elapsedMs:0},selectedCandidateSubmitted:false,
        accepted:null,outcome:"UNEXECUTED",grading:null,usage:cost([]),native:null,replay,cleanup:null,setupMs:0,fixtureAttempted:false,simulatorDigest:null,generationMs:0,sharedPrefixWith:null,completed:false};
      let session:ScientificModelSession|null=null,rig:Awaited<ReturnType<typeof prepareScientificRig>>|null=null;
      let control:Row|null=null,models:readonly ScientificModelRef[]=[],selected:ScientificModelRef|null=null,baselineSelected:ScientificModelRef|null=null;
      try{
        if(now()>=expires){row.outcome="GLOBAL_BUDGET_UNEXECUTED";continue;}
        const genStart=now();session=ScientificModelSession.create(task,{maxRequests:EPOCH.maxModelRequests,maxWorkUnits:EPOCH.maxNativeWorkUnits,maxNativeElapsedMs:EPOCH.maxNativeElapsedMs,expiresAtEpochMs:expires},now,{structureSearch:mode==="NYX_SEARCH"||mode==="FIXED_SEARCH"});
        row.generationAttempted=true;
        let generated:Generation|null=null;
        try{
          if(mode==="FIXED_SEARCH"){
            const found=session.search({schemaVersion:1,operation:"SEARCH_SCIENTIFIC_MODELS",taskDigest:session.taskDigest,spec:fixedSpec}),owned:ScientificModelRef[]=[];
            row.fixedSearch={state:found.state,reason:"reason"in found?found.reason:"stopReason"in found?found.stopReason:null,evaluatedSupports:session.usage().searchSupports,
              candidateCount:"candidates"in found?found.candidates.length:0,resultDigest:found.resultDigest,proposals:[]};
            if("candidates"in found)for(const c of found.candidates){
              if(now()>=expires||session.usage().remainingRequests<2)break;
              const fitted=session.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:session.taskDigest,structure:c.structure},scientificFitReplay(python(),EPOCH.replayTimeoutMs,c=>replay.push({...c,kind:"FIT"})));
              row.fixedSearch.proposals.push({state:fitted.state,reason:"reason"in fitted?fitted.reason:null,resultDigest:fitted.resultDigest});
              if(fitted.state!=="FITTED_CANDIDATE_NOT_ADMITTED")continue;
              const admitted=session.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:session.taskDigest,draft:fitted.fit.draft},scientificModelReplay(python(),EPOCH.replayTimeoutMs,c=>replay.push({...c,kind:"POINT_DERIVATION"})));
              row.fixedSearch.proposals.push({state:admitted.state,reason:"reason"in admitted?admitted.reason:null,resultDigest:admitted.resultDigest});
              if(admitted.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH")owned.push(admitted.model);
            }
            models=owned;row.candidateCount=owned.length;row.competingArtifactsAdmitted=owned.length>=2;row.generationFirstAdmitted=owned.length>=2;
            row.generationFailure=found.state==="REJECTED"||found.state==="INSUFFICIENT_EVIDENCE"?found.reason:null;
          }else generated=await runNyxScientificModelGeneration({session,maxCalls:EPOCH.maxGenerationCalls,maxOutputTokens:EPOCH.maxOutputTokens,deadlineEpochMs:Math.min(expires,genStart+EPOCH.maxGenerationMs),now,
          verify:scientificModelReplay(python(),EPOCH.replayTimeoutMs,c=>replay.push({...c,kind:"POINT_DERIVATION"})),
          ...(mode==="MODEL_STRUCTURE"?{nativeFit:{verify:scientificFitReplay(python(),EPOCH.replayTimeoutMs,c=>replay.push({...c,kind:"FIT"}))}}:{}),
          ...(mode==="NYX_SEARCH"?{nativeSearch:{verify:scientificFitReplay(python(),EPOCH.replayTimeoutMs,c=>replay.push({...c,kind:"FIT"}))}}:{}),complete:r=>invoke(r,stage)});}
        catch{row.generationFailure="GENERATION_INTEGRATION_OR_SESSION_FAILURE";}
        row.generationMs=Math.max(0,now()-genStart);row.native=session.usage();row.usage=stageCost(stage);
        if(generated){models=generated.models;row.generation=generated.attempts;row.candidateCount=models.length;row.competingArtifactsAdmitted=generated.competingModelsAdmitted;
          row.generationFirstAdmitted=generated.firstAttemptAdmitted;row.generationBudgetStopReason=generated.budgetStopReason;}
        if(!options&&arm==="NATIVE_FIT")control={...row,arm:"SAME_TOOL_FIRST_NON_REFUTED",sharedPrefixWith:"NATIVE_FIT",selection:{outcome:"UNEXECUTED",modelId:null,modelEvidence:null,elapsedMs:0},replay:[...replay]};
        if(models.length<2){row.outcome=row.generationFailure??"NO_ADMITTED_COMPETING_MODEL_POPULATION";continue;}
        if(now()>=expires){row.outcome="GLOBAL_BUDGET_BEFORE_MEASUREMENT";continue;}
        const startRig=now();row.fixtureAttempted=true;rig=await prepareScientificRig(w,binding.candidate,w.taskId+"-"+arm,expires,simulatorSource);row.setupMs=Math.max(0,now()-startRig);
        row.simulatorDigest=rig.simulatorSourceDigest;
        const bridge=session.bridge(models,{evidenceIdentity:stage,provenanceRoot:"NYX-SHARED-NEMOTRON"}),runner=rig.runner(bridge.objective,bridge.readouts);
        const observedStart=performance.now();const observation=await runner.run(bridge.objective.experimentCatalog[0],bridge.objective,new AbortController().signal);
        const measured=runner.readMeasurement(bridge.objective.experimentCatalog[0].experimentId);if(!measured)throw Error("admitted_measurement_missing");
        row.measurement={experimentId:observation.experimentId,evidenceId:observation.evidence.evidenceId,executionIdentity:observation.executionIdentity,
          provenanceRoot:observation.evidence.provenanceRoot,candidateBinding:observation.evidence.candidateBinding,observedAtEpochMs:observation.evidence.observedAtEpochMs,elapsedMs:Math.max(0,performance.now()-observedStart)};
        const consistent=models.filter(m=>session!.inspect(m).predictions.find(p=>p.pointId===measured.measurement.pointId)?.value===measured.measurement.value);
        baselineSelected=consistent[0]??null;
        if(control){control.measurement=row.measurement;control.setupMs=row.setupMs;control.selection={outcome:baselineSelected?"FIRST_NON_REFUTED_PRECOMMITTED_CANDIDATE":"ALL_CANDIDATES_REFUTED",modelId:baselineSelected?.modelId??null,modelEvidence:null,elapsedMs:0};}
        if(mode==="FIXED_SEARCH"){
          selected=baselineSelected;row.selection={outcome:selected?"FIRST_NON_REFUTED_PRECOMMITTED_CANDIDATE":"ALL_CANDIDATES_REFUTED",modelId:selected?.modelId??null,modelEvidence:null,elapsedMs:0};
          row.outcome=row.selection.outcome;continue;
        }
        const deadline=Math.min(expires,now()+EPOCH.maxSelectionMs);
        if(now()>=deadline){row.selection.outcome="LATE_SELECTION_UNEXECUTED";row.outcome="GLOBAL_BUDGET_BEFORE_SELECTION";continue;}
        const selectionStart=now();try{
          const result=await invoke({schemaVersion:1,requestId:"NYX-FIT-SELECT",messages:[{role:"system",content:"You are NYX cognition selecting a bounded prediction hypothesis under Omega. Return exactly the typed selection JSON. "
            +"The model IDs and all point forecasts were committed before this independently authorized observation. Choose CONCLUDE with an owned model ID only if it is not contradicted; otherwise NO_CONCLUSION with null. "
            +"This submits a hypothesis to independent numerical acceptance, not a claim of scientific truth, novelty or proof. No new code, tools or authority may be requested."},
            {role:"user",content:JSON.stringify({objective:task.objective.objective,calibration:task.observations,prospectiveObservation:measured,
              models:models.map(m=>({modelId:m.modelId,draft:session!.inspect(m).draft,forecasts:session!.inspect(m).predictions})),remainingCalls:0})}],
            maxTokens:EPOCH.maxOutputTokens,temperature:0,inferencePolicy:"REASONING_JSON",reasoningEffort:"MEDIUM",
            responseFormat:{type:"JSON_SCHEMA",name:"nyx_fresh_fit_selection",schema:{type:"object",additionalProperties:false,required:["schemaVersion","operation","modelId"],
              properties:{schemaVersion:{type:"integer",enum:[1]},operation:{type:"string",enum:["CONCLUDE","NO_CONCLUSION"]},modelId:{anyOf:[{type:"string",enum:models.map(m=>m.modelId)},{type:"null"}]}}}},
            observedAtEpochMs:now(),deadlineEpochMs:deadline},selectionStage);
          row.selection.modelEvidence=snapshotBoundedReasoningData(result.evidence);
          if(now()>=deadline)row.selection.outcome="LATE_SELECTION_REJECTED";
          else if(result.finishReason==="length")row.selection.outcome="SELECTION_TRUNCATION";
          else if(result.decision!=="COMPLETED"||result.content===null)row.selection.outcome="SELECTION_PROVIDER_FAILURE";
          else if(result.finishReason!=="stop")row.selection.outcome="SELECTION_NONSTOP_REJECTION";
          else{
            const inspected=inspectScientificSelection(result.content,models),choice=inspected.choice;
            row.selection.diagnostic=inspected.diagnostic;
            if(!choice)row.selection.outcome=inspected.rejectedOutcome??"SELECTION_SCHEMA_REJECTION";
            else if(choice.operation==="NO_CONCLUSION")row.selection.outcome="NO_CONCLUSION";
            else if(!consistent.some(m=>m.modelId===choice!.modelId))row.selection.outcome="SELECTION_REFUTED_BY_OBSERVATION";
            else{selected=models.find(m=>m.modelId===choice!.modelId)!;row.selection={outcome:"PRECOMMITTED_CANDIDATE_SELECTED",modelId:selected.modelId,modelEvidence:row.selection.modelEvidence,elapsedMs:0,diagnostic:row.selection.diagnostic};}
          }
        }catch{row.selection.outcome="SELECTION_INTEGRATION_FAILURE";}
        row.selection.elapsedMs=Math.max(0,now()-selectionStart);
        row.outcome=row.selection.outcome;
      }catch{row.measurementFailure="MEASUREMENT_OR_FIXTURE_INFRASTRUCTURE_FAILURE";row.outcome=row.measurementFailure;}
      finally{
        // Grade ONLY after inference/action is over. No hidden score is ever a
        // repair input, and no best-of selection can consult this oracle.
        if(selected&&session){try{row.selectedCandidateSubmitted=true;const g=independentScienceGrade(w,task,session.inspect(selected).draft);row.accepted=g.accepted;row.grading=g.cost;row.outcome=g.accepted?"HELDOUT_PREDICTION_ACCEPTED":g.cost.resourceBlockedPoints?"HELDOUT_ARITHMETIC_RESOURCE_BOUNDARY":g.cost.undefinedPoints?"HELDOUT_UNDEFINED_MODEL_RESPONSE":"HELDOUT_REASONING_OR_SPECIFICATION_FAILURE";}
          catch{row.outcome="INDEPENDENT_GRADING_INFRASTRUCTURE_FAILURE";}}
        if(control&&baselineSelected&&session){try{control.selectedCandidateSubmitted=true;const g=independentScienceGrade(w,task,session.inspect(baselineSelected).draft);control.accepted=g.accepted;control.grading=g.cost;control.outcome=g.accepted?"HELDOUT_PREDICTION_ACCEPTED":g.cost.resourceBlockedPoints?"HELDOUT_ARITHMETIC_RESOURCE_BOUNDARY":g.cost.undefinedPoints?"HELDOUT_UNDEFINED_MODEL_RESPONSE":"HELDOUT_REASONING_OR_SPECIFICATION_FAILURE";}
          catch{control.outcome="INDEPENDENT_GRADING_INFRASTRUCTURE_FAILURE";}}
        if(rig){try{row.cleanup=await rig.cleanup();}catch{row.outcome="CLEANUP_FAILURE";}}
        row.usage=cost(ledger.filter(e=>e.stage===stage||e.stage===selectionStage),Math.max(0,now()-rowStart));row.native=session?.usage()??null;session?.revoke();row.completed=true;rows.push(row);
        if(!options&&arm==="NATIVE_FIT"){
          control??={...row,arm:"SAME_TOOL_FIRST_NON_REFUTED",sharedPrefixWith:"NATIVE_FIT",selection:{outcome:"UNEXECUTED",modelId:null,modelEvidence:null,elapsedMs:0}};
          control.usage={...stageCost(stage),elapsedMs:row.generationMs+row.setupMs+(row.measurement?.elapsedMs??0)+(control.grading?.wallMs??0)};
          control.native=row.native;control.replay=[...row.replay];control.generation=row.generation;control.measurement=row.measurement;control.measurementFailure=row.measurementFailure;control.fixtureAttempted=row.fixtureAttempted;
          control.simulatorDigest=row.simulatorDigest;control.cleanup=row.cleanup;control.completed=true;if(control.accepted===null)control.outcome=row.measurementFailure??(control.selection.outcome==="UNEXECUTED"?row.outcome:control.selection.outcome);
          if(row.fixtureAttempted&&!row.cleanup)control.outcome="SHARED_PREFIX_CLEANUP_UNVERIFIED";rows.push(control);
        }
        await checkpoint(report());
      }
    }
  }
  return report();
}

async function main(){
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())throw Error("explicit_network_and_injected_secret_required");
  if(process.env.OMEGA_SCIENTIFIC_EXPERIMENT!==undefined&&!["STRUCTURE_SEARCH","STRUCTURE_SEARCH_DIAGONAL_TRANSFER"].includes(process.env.OMEGA_SCIENTIFIC_EXPERIMENT))throw Error("unknown_scientific_experiment");
  const diagonalTransfer=process.env.OMEGA_SCIENTIFIC_EXPERIMENT==="STRUCTURE_SEARCH_DIAGONAL_TRANSFER";
  const searchEpoch=process.env.OMEGA_SCIENTIFIC_EXPERIMENT==="STRUCTURE_SEARCH"||diagonalTransfer,EPOCH=diagonalTransfer?SCIENTIFIC_DIAGONAL_TRANSFER_EPOCH:searchEpoch?SCIENTIFIC_SEARCH_EPOCH:DEFAULT_EPOCH;
  const options:ScientificFitEpochOptions|undefined=diagonalTransfer?{epoch:EPOCH,worlds:SCIENTIFIC_DIAGONAL_TRANSFER_WORLDS,corpusDigest:SCIENTIFIC_DIAGONAL_TRANSFER_CORPUS_DIGEST,
    simulatorSource:SCIENTIFIC_DIAGONAL_TRANSFER_SIMULATOR_SOURCE,generationModes:["MODEL_STRUCTURE","NYX_SEARCH","FIXED_SEARCH"],fixedSearchSpec:SCIENTIFIC_DIAGONAL_FIXED_SEARCH,taskFactory:scientificSearchTask}:searchEpoch?{epoch:EPOCH,worlds:SCIENTIFIC_SEARCH_WORLDS,corpusDigest:SCIENTIFIC_SEARCH_CORPUS_DIGEST,
    simulatorSource:SCIENTIFIC_SEARCH_SIMULATOR_SOURCE,generationModes:["MODEL_STRUCTURE","NYX_SEARCH","FIXED_SEARCH"],fixedSearchSpec:SCIENTIFIC_FIXED_SEARCH,taskFactory:scientificSearchTask}:undefined;
  const git=(...a:string[])=>execFileSync("git",a,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim(),candidate=process.env.GITHUB_SHA??git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||git("rev-parse","HEAD")!==candidate||git("status","--porcelain"))throw Error("clean_frozen_candidate_required");
  const before=theoryDigest(git("ls-files","-s")),paths=["scripts/omega/nyx-scientific-fit-live-eval.ts","scripts/omega/nyx-scientific-fit-fixtures.ts","scripts/omega/scientific-world-rig.ts",
    "scripts/omega/nyx-scientific-search-fixtures.ts","src/lib/codelab/research/scientificModelSearch.ts",
    "scripts/omega/nyx-scientific-world-live-eval.ts","scripts/omega/nyx-scientific-world-fixtures.ts","scripts/omega/benchmarks/scientific-world-oracle.py",
    "scripts/omega/benchmarks/scientific-model-replay.ts","scripts/omega/benchmarks/replay-polynomial-identities.py","scripts/omega/nyx-procedure-reuse-live-eval.ts",
    "scripts/omega/nyx-procedure-reuse-fixtures.ts","src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/research/scientificModelGeneration.ts",
    "src/lib/codelab/research/scientificModelFit.ts","src/lib/codelab/research/exactLinearFit.ts","src/lib/codelab/research/theoryContracts.ts",
    "src/lib/codelab/research/exactQuantitativeDerivation.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/quantitativeAlgebraicCompiler.ts",
    "src/lib/codelab/research/quantitativeExpressionCompiler.ts","src/lib/codelab/research/omegaResearchExperimentRunner.ts","src/lib/codelab/research/researchPartyContracts.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/model/nvidiaCapacity.ts","src/lib/codelab/executor/readOnlyExecutor.ts","src/lib/codelab/executor/r2SandboxLifecycle.ts",
    "src/lib/codelab/executor/r2ProvisioningBlueprint.ts","src/lib/codelab/executor/r3DisposablePatchApplication.ts","src/lib/codelab/executor/r3ControlledEngineeringExecution.ts",
    ".github/workflows/omega-nyx-procedure-reuse-one-shot.yml"];
  const sourceDigests=Object.fromEntries(paths.map(p=>[p,theoryDigest(readFileSync(p,"utf8"))]));
  const provider=NvidiaNimProvider.create({providerId:searchEpoch?"NYX-FRESH-SCIENTIFIC-SEARCH":"NYX-FRESH-SCIENTIFIC-FIT",model:EPOCH.model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:64000,maxOutputTokens:EPOCH.maxOutputTokens,timeoutMs:120000}).withHttpAttemptBudget(EPOCH.maxHttpAttempts,"WITHIN_SHARED_BUDGET");
  const stages=new Map<string,NvidiaNimProvider>(),path=join(process.env.RUNNER_TEMP??tmpdir(),`nyx-scientific-fit-${candidate}.json`),persist=(r:unknown)=>writeFile(path,JSON.stringify(r,null,2)+"\n");
  const report=await runFreshScientificFitEpoch((r,stage)=>{if(!stages.has(stage))stages.set(stage,provider.withHttpAttemptBudget(stage.endsWith("GENERATION")?3:1,"WITHIN_SHARED_BUDGET"));return stages.get(stage)!.complete(r);},
    {candidate,sourceDigests},Date.now,persist,options);
  const sourceUnchanged=before===theoryDigest(git("ls-files","-s"))&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain");
  const final={...report,sourceUnchanged};await persist(final);console.log(`NYX_SCIENTIFIC_FIT_REPORT ${JSON.stringify(final)}`);if(!sourceUnchanged)throw Error("authoritative_source_changed");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href)await main();
