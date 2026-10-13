import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment,type NvidiaNimCompletionRequest,type NvidiaNimCompletionResult,type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {runNyxScientificModelGeneration} from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import {ScientificModelSession,type ScientificModelTask,type ScientificModelDraft,type ScientificModelRef} from "../../src/lib/codelab/research/scientificModelGeneration";
import {theoryDigest,immutableTheoryValue} from "../../src/lib/codelab/research/theoryContracts";
import {scientificModelReplay,type ScientificReplayCost} from "./benchmarks/scientific-model-replay";
import {prepareScientificRig} from "./scientific-world-rig";
import {SCIENCE_EPOCH as EPOCH,SCIENCE_WORLDS as WORLDS,SCIENCE_CORPUS_DIGEST,SCIENCE_SIMULATOR_SOURCE,scienceTask,type ScienceWorld} from "./nyx-scientific-world-fixtures";
import {procedureInferenceRequest,usage,sumUsage} from "./nyx-procedure-reuse-live-eval";
type Arm=typeof EPOCH.arms[number];
type Generation=Awaited<ReturnType<typeof runNyxScientificModelGeneration>>;
type Complete=(request:NvidiaNimCompletionRequest,stage:string)=>Promise<NvidiaNimCompletionResult>;
const python=()=>process.env.OMEGA_POLYNOMIAL_PYTHON??"python";
function oracle(input:unknown){const start=performance.now(),r=spawnSync(python(),["-B",resolve("scripts/omega/benchmarks/scientific-world-oracle.py")],
  {input:JSON.stringify(input),encoding:"utf8",timeout:5000,maxBuffer:262144,windowsHide:true});
  if(r.error||r.status!==0)throw Error("independent_world_oracle_unavailable");return{value:JSON.parse(r.stdout),wallMs:Math.max(0,performance.now()-start)};}
function finiteMs(v:unknown):v is number{return typeof v==="number"&&Number.isFinite(v)&&v>=0;}
export function scienceCalibration(world:ScienceWorld){
  const checked=oracle({operation:"CALIBRATION",world}),v=checked.value;
  if(!Array.isArray(v.calibration)||v.calibration.length!==world.calibration.length||v.calibration.some((n:unknown)=>typeof n!=="string")
    ||!finiteMs(v.elapsedMs)||!finiteMs(v.cpuMs))throw Error("calibration_contract");
  return{values:v.calibration as string[],cost:{elapsedMs:v.elapsedMs,cpuMs:v.cpuMs,wallMs:checked.wallMs}};
}
export function calibration(world:ScienceWorld):string[]{return scienceCalibration(world).values;}
export function independentScienceGrade(world:ScienceWorld,task:ScientificModelTask,draft:ScientificModelDraft){
  const checked=oracle({operation:"GRADE",world,task,draft}),g=checked.value,points=world.calibration.length+world.probes.length+world.heldout.length;
  if(typeof g.accepted!=="boolean"||g.points!==points||!Number.isSafeInteger(g.matched)||g.matched<0||g.matched>points
    ||g.accepted!==(g.matched===points)||g.scope!=="HELDOUT_PREDICTION_NOT_ORIGINAL_DISCOVERY"||!finiteMs(g.elapsedMs)||!finiteMs(g.cpuMs))throw Error("heldout_oracle_contract");
  return{accepted:g.accepted as boolean,cost:{points,matched:g.matched as number,elapsedMs:g.elapsedMs as number,cpuMs:g.cpuMs as number,wallMs:checked.wallMs}};
}
function inferenceCost(attempts:readonly {modelEvidence:NvidiaNimEvidence;outcome:string}[],elapsedMs=0){return usage({calls:attempts.length,attempts,toolRequests:0,toolWorkUnits:0,toolElapsedMs:0,elapsedMs});}
function generationPublic(g:Generation){return{competingModelsAdmitted:g.competingModelsAdmitted,firstAttemptAdmitted:g.firstAttemptAdmitted,attempts:g.attempts,
  usage:inferenceCost(g.attempts,g.elapsedMs),nativeUsage:g.nativeUsage,elapsedMs:g.elapsedMs};}
function object(properties:Record<string,unknown>){return{type:"object",additionalProperties:false,required:Object.keys(properties),properties};}
export function scientificAction(raw:unknown,experiments:readonly string[],models:readonly string[]){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).sort().join("|")!=="experimentId|modelId|operation|schemaVersion")return null;
  const v=raw as Record<string,unknown>;
  if(v.schemaVersion!==1)return null;
  if(v.operation==="MEASURE"&&typeof v.experimentId==="string"&&experiments.includes(v.experimentId)&&v.modelId===null)return v as {operation:"MEASURE";experimentId:string;modelId:null};
  if(v.operation==="CONCLUDE"&&v.experimentId===null&&typeof v.modelId==="string"&&models.includes(v.modelId))return v as {operation:"CONCLUDE";experimentId:null;modelId:string};
  if(["REGENERATE","NO_CONCLUSION"].includes(String(v.operation))&&v.experimentId===null&&v.modelId===null)return v as {operation:"REGENERATE"|"NO_CONCLUSION";experimentId:null;modelId:null};
  return null;
}
type Row={taskId:string;family:string;arm:Arm;attempted:boolean;blocked:string|null;accepted:boolean|null;firstSubmittedCandidateAccepted:boolean|null;
  outcome:string;experiments:number;actions:{step:number;operation:string|null;outcome:string;modelEvidence:NvidiaNimEvidence;
    experimentEvidence?:{experimentId:string;toolId:string;observationId:string;evidenceId:string;provenanceRoot:string;candidateBinding:string;
      executionIdentity:string;observedAtEpochMs:number;elapsedMs:number;committedModelIds:string[];outcome:string;evidenceClass:"E3"|"E4"}}[];
  regeneration:ReturnType<typeof generationPublic>|null;usage:ReturnType<typeof inferenceCost>;allocatedUsage:ReturnType<typeof inferenceCost>;
  native:{requests:number;workUnits:number;elapsedMs:number};replayCosts:ScientificReplayCost[];grading:{points:number;matched:number;elapsedMs:number;cpuMs:number;wallMs:number}|null;
  firstGrading:Row["grading"];gradingExecutions:number;guidance:{calls:number;elapsedMs:number};
  sharedReplayCount:number;graphState:string|null;fixtureSetupMs:number;
  cleanup:{sourceUnchanged:boolean|null;sandboxCleanupVerified:boolean;temporaryFixtureRemoved:boolean;quarantined?:boolean;setupFailed?:boolean}|null;simulatorDigest:string|null};

/** Matched post-generation pilot. One physical generation prefix is charged to
 * EVERY arm; model-only/direct claims remain qualified by that shared tooling.
 * The held-out oracle is not consulted until each bounded arm has stopped.
 */
export async function runScientificWorldEpoch(complete:Complete,binding:{candidate:string;sourceDigests:Record<string,string>},now=Date.now,
  checkpoint:(report:unknown)=>Promise<void>=async()=>{}){
  const start=now(),expires=start+EPOCH.maxEpochMs,rows:Row[]=[],seeds:{taskId:string;run:ReturnType<typeof generationPublic>;failure:string|null;replayCosts:ScientificReplayCost[];taskDigest:string}[]=[];
  const ledger:{stage:string;evidence:NvidiaNimEvidence|null;outcome:string}[]=[];
  const calibrationData=WORLDS.map(world=>({world,...scienceCalibration(world)}));
  const freeze={...binding,configuration:EPOCH,corpusDigest:SCIENCE_CORPUS_DIGEST,issuedAtEpochMs:start,expiresAtEpochMs:expires,
    taskBindings:calibrationData.map(({world:w,values})=>({taskId:w.taskId,family:w.family,taskDigest:theoryDigest(scienceTask(w,binding.candidate,start,expires,values))}))};
  const invoke=async(request:NvidiaNimCompletionRequest,stage:string)=>{
    if(ledger.length>=EPOCH.maxPhysicalCalls)throw Error("science_epoch_call_cap");
    const entry={stage,evidence:null as NvidiaNimEvidence|null,outcome:"INTEGRATION_CALL_EXCEPTION"};ledger.push(entry);
    const reply=await complete({...procedureInferenceRequest(request),requestId:stage+"/"+request.requestId},stage);
    entry.evidence=immutableTheoryValue(reply.evidence);entry.outcome=reply.decision==="COMPLETED"?"DELIVERED":"PROVIDER_FAILURE";return reply;
  };
  function costForStage(stage?:string,elapsedMs=0){
    const entries=stage===undefined?ledger:ledger.filter(e=>e.stage===stage),unknown=entries.filter(e=>!e.evidence).length;
    const cost=inferenceCost(entries.flatMap(e=>e.evidence?[{modelEvidence:e.evidence,outcome:e.outcome}]:[]),elapsedMs);
    return{...cost,calls:cost.calls+unknown,unknownUsageCalls:cost.unknownUsageCalls+unknown};
  }
  function report(){
    const arms=EPOCH.arms.map(arm=>{const selected=rows.filter(r=>r.arm===arm),graded=selected.filter(r=>r.accepted!==null);
      return{arm,selected:WORLDS.length,attempted:selected.filter(r=>r.attempted).length,graded:graded.length,correct:graded.filter(r=>r.accepted).length,
        firstSubmittedCandidateCorrect:selected.filter(r=>r.firstSubmittedCandidateAccepted===true).length,ungraded:selected.filter(r=>r.attempted&&r.accepted===null).length,
        unexecuted:WORLDS.length-selected.filter(r=>r.attempted).length,experiments:selected.reduce((n,r)=>n+r.experiments,0),
        regenerated:selected.filter(r=>r.regeneration!==null).length,allocatedUsage:sumUsage(selected.map(r=>({usage:r.allocatedUsage}))),
        nativeWorkUnits:selected.reduce((n,r)=>n+r.native.workUnits,0),nativeElapsedMs:selected.reduce((n,r)=>n+r.native.elapsedMs,0),
        outcomes:Object.fromEntries([...new Set(selected.map(r=>r.outcome))].sort().map(k=>[k,selected.filter(r=>r.outcome===k).length]))};});
    const physical=costForStage(),unknownHttpAttemptCounts=ledger.filter(e=>!e.evidence).length;
    const pairs=WORLDS.map(w=>{const a=rows.find(r=>r.taskId===w.taskId&&r.arm==="NATIVE_FORECASTS"),b=rows.find(r=>r.taskId===w.taskId&&r.arm==="NATIVE_EVIDENCE_GUIDANCE");
      const executed=!!a&&!!b&&[a,b].every(r=>r.attempted),graded=executed&&[a!,b!].every(r=>r.accepted!==null);
      const known=graded&&[a!,b!].every(r=>r.allocatedUsage.unknownUsageCalls===0&&r.allocatedUsage.unknownUsageHttpAttempts===0);
      return{taskId:w.taskId,postGenerationExecuted:executed,independentlyGraded:graded,nativeAccepted:a?.accepted??null,guidedAccepted:b?.accepted??null,
        realizedInferenceMatched:known&&a!.allocatedUsage.calls===b!.allocatedUsage.calls&&a!.allocatedUsage.httpAttempts===b!.allocatedUsage.httpAttempts
          &&Math.abs(a!.allocatedUsage.reportedTokens-b!.allocatedUsage.reportedTokens)<=EPOCH.realizedTokenMatchTolerance*Math.max(1,a!.allocatedUsage.reportedTokens,b!.allocatedUsage.reportedTokens),
        guidedNoMoreInference:known&&b!.allocatedUsage.calls<=a!.allocatedUsage.calls&&b!.allocatedUsage.httpAttempts<=a!.allocatedUsage.httpAttempts&&b!.allocatedUsage.reportedTokens<=a!.allocatedUsage.reportedTokens};});
    const populationComplete=rows.length===WORLDS.length*EPOCH.arms.length,
      cleanupComplete=rows.filter(r=>r.attempted).every(r=>r.cleanup?.sourceUnchanged===true&&r.cleanup.sandboxCleanupVerified&&r.cleanup.temporaryFixtureRemoved),
      complete=populationComplete&&cleanupComplete&&rows.every(r=>r.attempted),providerStable=physical.providerFailures===0&&physical.localDeliveryBlocks===0
      &&physical.recoveredDisruptions===0&&physical.unknownUsageCalls===0&&physical.unknownUsageHttpAttempts===0;
    return{schemaVersion:1,candidate:binding.candidate,freeze,freezeDigest:theoryDigest(freeze),seeds,rows,arms,pairs,invocations:ledger,populationComplete,cleanupComplete,complete,providerStable,
      physicalCalls:ledger.length,physicalUsage:physical,unknownHttpAttemptCounts,
      physicalNativeCost:{requests:seeds.reduce((n,s)=>n+s.run.nativeUsage.requests,0)+rows.reduce((n,r)=>n+r.native.requests-(seeds.find(s=>s.taskId===r.taskId)?.run.nativeUsage.requests??0),0),
        workUnits:seeds.reduce((n,s)=>n+s.run.nativeUsage.workUnits,0)+rows.reduce((n,r)=>n+r.native.workUnits-(seeds.find(s=>s.taskId===r.taskId)?.run.nativeUsage.workUnits??0),0),
        elapsedMs:seeds.reduce((n,s)=>n+s.run.nativeUsage.nativeElapsedMs,0)+rows.reduce((n,r)=>n+r.native.elapsedMs-(seeds.find(s=>s.taskId===r.taskId)?.run.nativeUsage.nativeElapsedMs??0),0)},
      physicalReplayCosts:[...seeds.flatMap(s=>s.replayCosts),...rows.flatMap(r=>r.replayCosts.slice(r.sharedReplayCount))],
      calibrationPreparationCosts:calibrationData.map(d=>({taskId:d.world.taskId,...d.cost})),
      resourceUnknowns:{modelInternalCompute:true,modelCostUsd:true,measurementCpu:true,peakMemory:true},
      elapsedMs:Math.max(0,now()-start),stopReason:now()>=expires?"GLOBAL_BUDGET":complete?"PREDECLARED_ARMS_COMPLETE":"INCOMPLETE",
      scopedGuidanceSignal:complete&&providerStable&&arms[2].correct>arms[1].correct&&pairs.every(p=>p.nativeAccepted!==null&&p.guidedAccepted!==null
        &&Number(p.guidedAccepted)>=Number(p.nativeAccepted)&&p.guidedNoMoreInference),promotion:EPOCH.promotion,
      safety:{defaultUltraChanged:false,authorityIncrease:false,generalShell:false,generalNetwork:false,productionAuthority:false,rawReasoningPersisted:false,
        modelProgramsPersisted:false,measurementValuesPersisted:false,hiddenOracleFeedbackToCognition:false},
      limitations:[EPOCH.scope,EPOCH.baseline,"THREE_CASES_UNDERPOWERED_REQUIRES_FRESH_REPLICATION","FIXED_NATIVE_GENERATION_SHARED_NOT_INDEPENDENT_SAMPLES",
        "DETERMINISTIC_SCALAR_PREDICTIONS_NOT_CAUSAL_IDENTIFIABILITY","PUBLIC_PRETRAINING_EXPOSURE_UNKNOWN","TOOLS_AND_EVALUATOR_COMPUTE_RECORDED_NOT_INFERENCE_ONLY_TOTAL_MATCH"]};
  }
  for(const[i,{world:w,values}]of calibrationData.entries()){
    if(now()>=expires)break;
    const task=scienceTask(w,binding.candidate,start,expires,values),replayCosts:ScientificReplayCost[]=[];
    const seedSession=ScientificModelSession.create(task,{maxRequests:EPOCH.maxModelRequests,maxWorkUnits:EPOCH.maxNativeWorkUnitsPerArm,maxNativeElapsedMs:EPOCH.maxNativeElapsedMsPerArm,expiresAtEpochMs:expires},now);
    try{
      const seedStart=now();let seed:Generation|null=null,failure:string|null=null;
      try{seed=await runNyxScientificModelGeneration({session:seedSession,maxCalls:EPOCH.maxSeedCalls,maxOutputTokens:EPOCH.maxOutputTokens,
        deadlineEpochMs:Math.min(expires,now()+EPOCH.maxSeedMs),now,verify:scientificModelReplay(python(),EPOCH.replayTimeoutMs,c=>replayCosts.push(c)),
        complete:r=>invoke(r,w.taskId+"/SHARED_GENERATION")});}catch{failure="SHARED_GENERATION_INTEGRATION_FAILURE";}
      const prefix=seed?generationPublic(seed):{competingModelsAdmitted:false,firstAttemptAdmitted:false,attempts:[],usage:costForStage(w.taskId+"/SHARED_GENERATION",Math.max(0,now()-seedStart)),nativeUsage:seedSession.usage(),elapsedMs:Math.max(0,now()-seedStart)};
      seeds.push({taskId:w.taskId,run:prefix,failure,replayCosts,taskDigest:seedSession.taskDigest});await checkpoint(report());
      for(let offset=0;offset<EPOCH.arms.length;offset++){
        const arm=EPOCH.arms[(i+offset)%EPOCH.arms.length],identity=w.taskId+"/"+arm;
        const actions:Row["actions"]=[],row:Row={taskId:w.taskId,family:w.family,arm,attempted:false,blocked:null,accepted:null,firstSubmittedCandidateAccepted:null,outcome:"UNEXECUTED",
          experiments:0,actions,regeneration:null,usage:inferenceCost([]),allocatedUsage:prefix.usage,
          native:{requests:prefix.nativeUsage.requests,workUnits:prefix.nativeUsage.workUnits,elapsedMs:prefix.nativeUsage.nativeElapsedMs},
          replayCosts:[...replayCosts],sharedReplayCount:replayCosts.length,grading:null,firstGrading:null,gradingExecutions:0,guidance:{calls:0,elapsedMs:0},graphState:null,fixtureSetupMs:0,cleanup:null,simulatorDigest:null};
        if(!seed||!seed.competingModelsAdmitted||now()>=expires){row.blocked=failure??(!seed?.competingModelsAdmitted?"SHARED_GENERATION_NOT_ADMITTED":"GLOBAL_BUDGET");rows.push(row);await checkpoint(report());continue;}
        const armStart=now(),deadline=Math.min(expires,armStart+Math.max(0,EPOCH.maxArmMs-prefix.elapsedMs));
        let rig:Awaited<ReturnType<typeof prepareScientificRig>>|null=null;
        let session=seedSession,models=[...seed.models],currentTask=task;
        const observations:{pointId:string;inputs:readonly {id:string;value:string}[];value:string;evidenceId:string;provenanceRoot:string;observedAt:number}[]=[];
        let selected:ScientificModelRef|null=null,firstSelected:ScientificModelRef|null=null,selectedSession:ScientificModelSession|null=null,firstSelectedSession:ScientificModelSession|null=null;
        let feedback:unknown=null,regenSession:ScientificModelSession|null=null;
        try{
          const rigStart=now();rig=await prepareScientificRig(w,binding.candidate,`${w.taskId}-${arm}`,expires);row.fixtureSetupMs=now()-rigStart;row.simulatorDigest=rig.simulatorSourceDigest;
          let bridge=session.bridge(models,{evidenceIdentity:identity,provenanceRoot:"NYX-SHARED-NEMOTRON"}),runner=rig.runner(bridge.objective,bridge.readouts);
          for(let step=1;step<=EPOCH.maxActionCalls&&now()<deadline;step++){
            const eligible=currentTask.experiments.filter(e=>!observations.some(o=>o.pointId===e.experimentId)).map(e=>e.experimentId),modelIds=models.map(m=>m.modelId);
            let guidance:unknown={};
            if(arm==="NATIVE_EVIDENCE_GUIDANCE"){
              const t=performance.now();guidance={evidenceAssessment:bridge.graph.decision(),recommendedExperiment:bridge.graph.selectNextExperiment(EPOCH.maxExperimentsPerArm-row.experiments)?.experimentId??null,
                guidance:"Prefer discriminating evidence, honor falsifications, and regenerate only if the current modeled family is refuted."};row.guidance.calls++;row.guidance.elapsedMs+=Math.max(0,performance.now()-t);
            }
            row.attempted=true;
            const reply=await invoke({schemaVersion:1,requestId:`NYX-SCIENCE-ACTION-${step}`,messages:[{role:"system",content:"You are NYX cognition investigating a bounded computational scientific objective through Omega. Choose one typed action, never commands. "
              +"MEASURE requests a declared experiment. CONCLUDE proposes one registered model for independent acceptance; it is not self-certification and requires at least one observation. "
              +"REGENERATE requests one bounded model revision after observations have falsified all current hypotheses. NO_CONCLUSION preserves actual uncertainty. Do not claim physical observation or original discovery."},
              {role:"user",content:JSON.stringify({objective:task.objective.objective,calibration:task.observations,experiments:currentTask.experiments,models:models.map(m=>({modelId:m.modelId,draft:session.inspect(m).draft})),
                observations,feedback,remaining:{actions:EPOCH.maxActionCalls-step+1,measurements:EPOCH.maxExperimentsPerArm-row.experiments,regenerations:row.regeneration?0:1},
                ...(arm==="DIRECT_REVIEW"?{policy:"Reason directly from your generated models and admitted measurements; no computed future forecast sheet is supplied."}:{nativeForecasts:models.map(m=>({modelId:m.modelId,predictions:session.inspect(m).predictions})),policy:"Use the same bounded native forecast computations; choose experiments and interpret evidence."}),
                ...(guidance as object)})}],
              maxTokens:EPOCH.maxOutputTokens,temperature:0,inferencePolicy:"REASONING_JSON",reasoningEffort:"MEDIUM",
              responseFormat:{type:"JSON_SCHEMA",name:"nyx_scientific_action",schema:object({schemaVersion:{type:"integer",enum:[1]},operation:{type:"string",enum:["MEASURE","CONCLUDE","REGENERATE","NO_CONCLUSION"]},
                experimentId:{anyOf:[{type:"string",enum:eligible.length?eligible:["NO_AVAILABLE_EXPERIMENT"]},{type:"null"}]},modelId:{anyOf:[{type:"string",enum:modelIds},{type:"null"}]}})},observedAtEpochMs:now(),deadlineEpochMs:deadline},identity);
            const trace:Row["actions"][number]={step,operation:null,outcome:"",modelEvidence:reply.evidence};actions.push(trace);
            if(now()>=deadline){trace.outcome="LATE_RESPONSE_NOT_ADMITTED";break;}
            if(reply.finishReason==="length"){trace.outcome="TRUNCATION";feedback={reason:"COMPLETE_ACTION_JSON_REQUIRED"};continue;}
            if(reply.decision!=="COMPLETED"||reply.content===null){trace.outcome="PROVIDER_FAILURE";feedback={reason:"DELIVERY_FAILURE_NOT_SCIENCE_REASONING"};continue;}
            if(reply.finishReason!=="stop"){trace.outcome="NONSTOP_REJECTION";feedback={reason:trace.outcome};continue;}
            let parsed:ReturnType<typeof scientificAction>=null,raw:unknown;
            try{raw=JSON.parse(reply.content);}catch{trace.outcome="ACTION_JSON_REJECTION";feedback={reason:trace.outcome};continue;}
            parsed=scientificAction(raw,eligible,modelIds);
            if(!parsed){const fields=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
              trace.outcome=fields&&fields.schemaVersion===1&&Object.keys(fields).sort().join("|")==="experimentId|modelId|operation|schemaVersion"
                &&((fields.operation==="MEASURE"&&typeof fields.experimentId==="string"&&fields.modelId===null)||(fields.operation==="CONCLUDE"&&typeof fields.modelId==="string"&&fields.experimentId===null))?"ACTION_SCOPE_REJECTION"
                :fields&&typeof fields.operation==="string"&&!["MEASURE","CONCLUDE","REGENERATE","NO_CONCLUSION"].includes(fields.operation)?"UNKNOWN_CAPABILITY_REJECTION":"ACTION_SCHEMA_REJECTION";
              feedback={reason:trace.outcome};continue;}
            trace.operation=parsed.operation;
            if(parsed.operation==="NO_CONCLUSION"){trace.outcome="NO_CONCLUSION";row.outcome="NO_CONCLUSION";break;}
            if(parsed.operation==="MEASURE"){
              if(row.experiments>=EPOCH.maxExperimentsPerArm){trace.outcome="EXPERIMENT_BUDGET_REJECTION";feedback={reason:trace.outcome};continue;}
              const experiment=bridge.objective.experimentCatalog.find(e=>e.experimentId===parsed!.experimentId)!;
              const began=performance.now(),committedModelIds=models.map(m=>m.modelId);
              const observation=await runner.run(experiment,bridge.objective,new AbortController().signal);
              trace.experimentEvidence={experimentId:observation.experimentId,toolId:observation.toolId,observationId:observation.observationId,evidenceId:observation.evidence.evidenceId,
                provenanceRoot:observation.evidence.provenanceRoot,candidateBinding:observation.evidence.candidateBinding,executionIdentity:observation.executionIdentity,
                observedAtEpochMs:observation.evidence.observedAtEpochMs,elapsedMs:Math.max(0,performance.now()-began),committedModelIds,outcome:observation.outcome,evidenceClass:"E3"};
              bridge.graph.recordObservation(observation);
              const numeric=runner.readMeasurement(experiment.experimentId);if(!numeric||numeric.observation.evidence.evidenceId!==observation.evidence.evidenceId)throw Error("numeric_observation_custody");
              row.experiments++;observations.push({pointId:numeric.measurement.pointId,inputs:numeric.measurement.inputs,value:numeric.measurement.value,
                evidenceId:observation.evidence.evidenceId,provenanceRoot:observation.evidence.provenanceRoot,observedAt:observation.evidence.observedAtEpochMs});
              trace.outcome="AUTHORIZED_MEASUREMENT_OBSERVED";feedback={reason:"NEW_PROSPECTIVE_OBSERVATION_ADMITTED"};continue;
            }
            if(parsed.operation==="REGENERATE"){
              if(row.regeneration||bridge.graph.decision().state!=="REFUTED_MODELED_FAMILY"||observations.length===0){trace.outcome="REGENERATION_PRECONDITION_REJECTION";feedback={reason:trace.outcome};continue;}
              const added=observations.map(o=>({pointId:o.pointId,inputs:o.inputs,output:o.value,evidenceRef:"MEASURED-"+o.evidenceId}));
              currentTask={...task,objective:{...task.objective,objective:task.objective.objective+" Earlier proposed models were refuted. Propose replacements consistent with ALL preserved observations; do not erase prior failures.",
                admittedEvidence:[...task.objective.admittedEvidence,...observations.map((o,i)=>({evidenceId:added[i].evidenceRef,evidenceClass:"E3" as const,kind:"OBSERVATION" as const,
                  summary:"Numeric projection of the same authorized R3B observation, not an additional independent root.",contentDigest:theoryDigest({pointId:added[i].pointId,inputs:added[i].inputs,output:added[i].output}),
                  provenanceRoot:o.provenanceRoot,freshnessDependencies:[`CANDIDATE:${binding.candidate}`],observedAtEpochMs:o.observedAt,candidateBinding:binding.candidate,grantsAuthority:false as const}))]},
                observations:[...task.observations,...added],experiments:task.experiments.filter(e=>!observations.some(o=>o.pointId===e.experimentId))};
              if(!currentTask.experiments.length){trace.outcome="REGENERATION_NO_UNUSED_EXPERIMENT";continue;}
              const remainingRequests=EPOCH.maxModelRequests-row.native.requests,remainingWork=EPOCH.maxNativeWorkUnitsPerArm-row.native.workUnits,remainingTime=Math.floor(EPOCH.maxNativeElapsedMsPerArm-row.native.elapsedMs);
              if(remainingRequests<=0||remainingWork<=0||remainingTime<=0){trace.outcome="ORIGINAL_NATIVE_BUDGET_EXHAUSTED";feedback={reason:trace.outcome};continue;}
              regenSession=ScientificModelSession.create(currentTask,{maxRequests:remainingRequests,maxWorkUnits:remainingWork,
                maxNativeElapsedMs:remainingTime,expiresAtEpochMs:expires},now);
              const regeneration=await runNyxScientificModelGeneration({session:regenSession,maxCalls:1,maxOutputTokens:EPOCH.maxOutputTokens,deadlineEpochMs:deadline,now,
                verify:scientificModelReplay(python(),EPOCH.replayTimeoutMs,c=>row.replayCosts.push(c)),complete:r=>invoke(r,identity)});
              row.regeneration=generationPublic(regeneration);row.native.requests+=regeneration.nativeUsage.requests;row.native.workUnits+=regeneration.nativeUsage.workUnits;row.native.elapsedMs+=regeneration.nativeUsage.nativeElapsedMs;
              if(!regeneration.competingModelsAdmitted){trace.outcome="REGENERATION_NOT_ADMITTED";row.outcome="REGENERATION_NOT_ADMITTED";break;}
              session=regenSession;models=[...regeneration.models];bridge=session.bridge(models,{evidenceIdentity:identity+"-REVISION",provenanceRoot:"NYX-SHARED-NEMOTRON"});runner=rig.runner(bridge.objective,bridge.readouts);
              trace.outcome="REVISED_MODELS_DERIVATIONS_ADMITTED";feedback={reason:"OLD_FALSIFICATIONS_PRESERVED_NEW_MODELS_REQUIRE_NEW_PROSPECTIVE_SUPPORT"};continue;
            }
            if(row.experiments<1){trace.outcome="CONCLUSION_WITHOUT_EXPERIMENT_REJECTION";feedback={reason:trace.outcome};continue;}
            selected=models.find(m=>m.modelId===parsed!.modelId)!;selectedSession=session;
            if(!firstSelected){firstSelected=selected;firstSelectedSession=session;}
            if(bridge.graph.assessment(bridge.contributions.find(c=>c.intent.mechanismId===selected!.modelId)!.theoryId).falsifyingObservationIds.length){
              trace.outcome="CONCLUSION_CONTRADICTED_BY_OBSERVATION";feedback={reason:trace.outcome};selected=null;continue;}
            trace.outcome="CANDIDATE_SUBMITTED_TO_INDEPENDENT_HELDOUT_ORACLE";break;
          }
          row.graphState=bridge.graph.decision().state;
          if(firstSelected&&firstSelectedSession){row.gradingExecutions++;const checked=independentScienceGrade(w,firstSelectedSession.task,firstSelectedSession.inspect(firstSelected).draft);
            row.firstSubmittedCandidateAccepted=checked.accepted;row.firstGrading=checked.cost;}
          if(selected&&selectedSession){
            const reuse=selected===firstSelected&&selectedSession===firstSelectedSession;
            if(!reuse)row.gradingExecutions++;
            const checked=reuse?{accepted:row.firstSubmittedCandidateAccepted!,cost:row.firstGrading!}
              :independentScienceGrade(w,selectedSession.task,selectedSession.inspect(selected).draft);
            row.accepted=checked.accepted;row.grading=checked.cost;row.outcome=checked.accepted?"HELDOUT_PREDICTION_ACCEPTED":"HELDOUT_MODEL_GENERALIZATION_FAILURE";
          }else if(row.outcome==="UNEXECUTED")row.outcome=now()>=deadline?"ORIGINAL_ARM_BUDGET_EXHAUSTED":"NO_ADMISSIBLE_CONCLUSION";
        }catch(error){const message=error instanceof Error?error.message:"";
          row.outcome=message==="omega_research_experiment_not_authorized"?"OMEGA_AUTHORIZATION_FAILURE"
            :message.startsWith("omega_rational_")?"MEASUREMENT_SCHEMA_FAILURE"
            :message==="omega_research_experiment_evidence_invalid"?"OMEGA_EXECUTION_EVIDENCE_FAILURE"
            :["independent_world_oracle_unavailable","heldout_oracle_contract"].includes(message)?"INDEPENDENT_VERIFIER_INFRASTRUCTURE_FAILURE"
            :message==="scientific_model_session_unavailable"?"ORIGINAL_SESSION_UNAVAILABLE"
            :message==="science_epoch_call_cap"?"ORIGINAL_EPOCH_CALL_BUDGET_EXHAUSTED":"INFRASTRUCTURE_OR_INTEGRATION_FAILURE";
          row.accepted=null;}
        finally{
          if(rig){try{row.cleanup=await rig.cleanup();}catch{row.cleanup={sourceUnchanged:null,sandboxCleanupVerified:false,temporaryFixtureRemoved:false,quarantined:true};row.outcome="FIXTURE_CLEANUP_FAILURE";}}
          else row.cleanup={sourceUnchanged:null,sandboxCleanupVerified:false,temporaryFixtureRemoved:false,quarantined:true,setupFailed:true};
          if(regenSession){const used=regenSession.usage();row.native={requests:prefix.nativeUsage.requests+used.requests,workUnits:prefix.nativeUsage.workUnits+used.workUnits,elapsedMs:prefix.nativeUsage.nativeElapsedMs+used.nativeElapsedMs};regenSession.revoke();}
        }
        row.usage=costForStage(identity,Math.max(0,now()-armStart));
        row.allocatedUsage=sumUsage([{usage:row.usage},{usage:prefix.usage}]);rows.push(row);await checkpoint(report());
      }
    }finally{seedSession.revoke();}
  }
  return report();
}

async function main(){
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())throw Error("explicit_network_and_injected_secret_required");
  const git=(...a:string[])=>execFileSync("git",a,{encoding:"utf8"}).trim(),candidate=process.env.GITHUB_SHA??git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||git("rev-parse","HEAD")!==candidate||git("status","--porcelain"))throw Error("clean_frozen_candidate_required");
  const before=theoryDigest(git("ls-files","-s")),paths=["scripts/omega/nyx-scientific-world-live-eval.ts","scripts/omega/nyx-scientific-world-fixtures.ts","scripts/omega/scientific-world-rig.ts",
    "scripts/omega/benchmarks/scientific-world-oracle.py","scripts/omega/benchmarks/scientific-model-replay.ts","scripts/omega/benchmarks/replay-polynomial-identities.py",
    "scripts/omega/nyx-procedure-reuse-live-eval.ts","scripts/omega/nyx-procedure-reuse-fixtures.ts","src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/research/scientificModelGeneration.ts",
    "src/lib/codelab/research/researchEvidenceGraph.ts","src/lib/codelab/research/researchPartyContracts.ts","src/lib/codelab/research/omegaResearchExperimentRunner.ts",
    "src/lib/codelab/research/exactQuantitativeDerivation.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/quantitativeAlgebraicCompiler.ts",
    "src/lib/codelab/research/quantitativeExpressionCompiler.ts","src/lib/codelab/research/theoryContracts.ts","src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/model/nvidiaCapacity.ts",
    "src/lib/codelab/executor/readOnlyExecutor.ts","src/lib/codelab/executor/r2SandboxLifecycle.ts","src/lib/codelab/executor/r2ProvisioningBlueprint.ts",
    "src/lib/codelab/executor/r3DisposablePatchApplication.ts","src/lib/codelab/executor/r3ControlledEngineeringExecution.ts",".github/workflows/omega-nyx-procedure-reuse-one-shot.yml"];
  const sourceDigests=Object.fromEntries(paths.map(p=>[p,theoryDigest(readFileSync(p,"utf8"))]));
  const provider=NvidiaNimProvider.create({providerId:"NYX-PROSPECTIVE-SCIENCE",model:EPOCH.model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource:nvidiaNimCredentialFromEnvironment(process.env),maxPromptBytes:64000,maxOutputTokens:EPOCH.maxOutputTokens,timeoutMs:120000}).withHttpAttemptBudget(EPOCH.maxHttpAttempts,"WITHIN_SHARED_BUDGET");
  const stages=new Map<string,NvidiaNimProvider>(),path=join(process.env.RUNNER_TEMP??tmpdir(),`nyx-scientific-world-${candidate}.json`),persist=(r:unknown)=>writeFile(path,JSON.stringify(r,null,2)+"\n");
  const report=await runScientificWorldEpoch((r,stage)=>{if(!stages.has(stage))stages.set(stage,provider.withHttpAttemptBudget(stage.endsWith("SHARED_GENERATION")?2:5,"WITHIN_SHARED_BUDGET"));return stages.get(stage)!.complete(r);},
    {candidate,sourceDigests},Date.now,persist);
  const sourceUnchanged=before===theoryDigest(git("ls-files","-s"))&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain"),final={...report,sourceUnchanged};
  await persist(final);console.log(`NYX_SCIENTIFIC_WORLD_REPORT ${JSON.stringify(final)}`);if(!sourceUnchanged)throw Error("authoritative_source_changed");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href)await main();
