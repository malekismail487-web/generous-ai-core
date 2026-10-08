import {execFileSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {NyxChatSession,type NyxChatTurnResult} from "../../src/lib/codelab/cli/nyxChatSession";
import {parseNyxChatAction} from "../../src/lib/codelab/cli/nyxChatProtocol";
import {ReadOnlyRepositoryExecutor} from "../../src/lib/codelab/executor/readOnlyExecutor";
import {BoundedReasoningSession} from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import {theoryDigest,immutableTheoryValue} from "../../src/lib/codelab/research/theoryContracts";
import {validQuantitativeProblem,type QuantitativeProblem} from "../../src/lib/codelab/research/exactQuantitativeDerivation";
import {lowerQuantitativeEquations,EQUATION_COMPILER_POLICY} from "../../src/lib/codelab/research/quantitativeEquationCompiler";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment,type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {liveNvidiaCapacity} from "../../src/lib/codelab/model/nvidiaCapacity";
import {createSharedFirstProposal} from "./nyx-quantitative-coupled-transfer-fixtures";
import {textConfiguredRequest,textBoundedTaskRequest,textInferenceUsage,aimeFinalInteger} from "./benchmarks/nyxTextBenchmark";
import {computationTasks,COMPUTATION_TRANSFER_POLICY as POLICY,type ComputationTask} from "./benchmarks/computationTransferTasks";
import {probabilityTransferTasks,type ProbabilityTransferTask} from "./benchmarks/probabilityTransferTasks";
import {lowerFiniteProbability,FINITE_PROBABILITY_POLICY} from "../../src/lib/codelab/research/finiteProbabilityCompiler";

export type ComputationArm="PROPOSAL_ONLY"|"EXACT_EXECUTION"|"LEGACY_SCHEMA"|"BOUNDED_SCHEMA"|"FINITE_PROBABILITY";
export function computationOutcome(result:NyxChatTurnResult|null,evidence:readonly NvidiaNimEvidence[],answer:string){
  if(!result)return {state:"INFRASTRUCTURE_FAILURE",correct:null};
  if(evidence.some(e=>e.finishReason==="length"))return {state:"TRUNCATION",correct:null};
  if(evidence.some(e=>e.delivery?.httpAttemptBudget?.dispatchDenied))return {state:"RESOURCE_EXHAUSTION",correct:null};
  if(evidence.some(e=>e.delivery&&e.delivery.state!=="DELIVERED"&&((e.delivery.timedOutAttempts??0)>0
    ||(e.delivery.transientUnavailableResponses??0)>0||(e.delivery.rateLimitedResponses??0)>0)))return {state:"PROVIDER_FAILURE",correct:null};
  if(evidence.some(e=>e.failureCategory!==null))return {state:"PROVIDER_FAILURE",correct:null};
  const denials=result.events.filter(e=>e.eventType==="DENIAL");
  if(denials.some(e=>["derivation_scope_unavailable","derivation_capability_unavailable","derivation_output_scope_invalid","derivation_representation_not_authorized"].includes(e.outcome)))
    return {state:"AUTHORIZATION_FAILURE",correct:null};
  if(denials.some(e=>e.outcome==="derivation_resource_exhausted"))return {state:"RESOURCE_EXHAUSTION",correct:null};
  if(denials.length)return {state:"SCHEMA_OR_NATIVE_IR_FAILURE",correct:null};
  if(result.outcome==="BUDGET_EXHAUSTED")return {state:"RESOURCE_EXHAUSTION",correct:null};
  if(result.outcome!=="REPLIED")return {state:"INTEGRATION_FAILURE",correct:null};
  const choice=aimeFinalInteger(result.message);
  if(choice===null||choice<1||choice>4)return {state:"ANSWER_FORMAT_FAILURE",correct:null};
  const correct=String(choice)===answer;
  return {state:correct?"PASS":"WRONG_VALID_CHOICE",correct};
}
/** Evidence IDs identify request CONTENT, not unique executions. Count each actual
 * completion callback once; the shared-prefix replay never invokes that callback. */
export function computationPhysicalUsage(executions:readonly NvidiaNimEvidence[],elapsedMs:number){
  return textInferenceUsage(executions,elapsedMs);
}
/** Only public synthetic native model/actions; never a question, choice, oracle or private inference. */
export function captureProbabilityReplay(problem:QuantitativeProblem,proposal:string|null,observation:string|null){
  if(typeof proposal!=="string"||typeof observation!=="string"||Buffer.byteLength(proposal)>50000||Buffer.byteLength(observation)>50000)return null;
  try{
    const action=parseNyxChatAction(proposal).action;
    if(action?.kind!=="DERIVE_QUANTITIES"||action.program.schemaVersion!==3)return null;
    const lowered=lowerFiniteProbability(problem,action.program).program,o=JSON.parse(observation),a=o?.analysis;
    if(action.problemDigest!==theoryDigest(problem))return null;
    const request={schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:action.problemDigest,program:action.program};
    if(o.omegaObservation!=="CONSTRUCTED"||a?.status!=="CONSTRUCTED"||a.inputDigest!==action.problemDigest
      ||a.requestDigest!==theoryDigest(request)||a.executedProgramDigest!==theoryDigest(lowered)
      ||a.loweringVersion!==FINITE_PROBABILITY_POLICY.version||a.grantsAuthority!==false
      ||a.acceptanceRequiresIndependentVerifier!==true||a.evidenceClass!=="E3")return null;
    const {resultDigest,...body}=a;
    if(resultDigest!==theoryDigest(body)||!Array.isArray(a.payload?.outputs)
      ||a.payload.outputs.length!==action.program.outputs.length||a.payload.outputs.some((v,i)=>!v
        ||v.label!==action.program.outputs[i].label||typeof v.value!=="string"||v.value.length>2500
        ||!(/^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/).test(v.value)))return null;
    return immutableTheoryValue({problem,model:action.program,status:a.status,
      outputs:a.payload.outputs.map(v=>({label:v.label,value:v.value})),
      problemDigest:action.problemDigest,executedProgramDigest:a.executedProgramDigest,analysisDigest:resultDigest,
      scientificModelIndependentlyVerified:false,scope:"PUBLIC_SYNTHETIC_MODEL_EXECUTION_ONLY_NOT_ORACLE_OR_PRIVATE_INFERENCE"});
  }catch{return null;}
}
/** Development-only public tool-action replay, never private inference or a task oracle.
 * The capture does not execute anything or feed a checker result back into cognition. */
export function captureComputationReplay(problem:QuantitativeProblem,proposal:string|null,observation:string|null){
  const dataOnly=(v:unknown,seen=new Set<object>(),budget={nodes:0},depth=0):boolean=>{
    if(++budget.nodes>6000||depth>12)return false;
    if(v===null||typeof v==="boolean"||typeof v==="string")return true;
    if(typeof v==="number")return Number.isFinite(v);
    if(!v||typeof v!=="object"||seen.has(v)||!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype
      &&Object.getPrototypeOf(v)!==null)return false;
    seen.add(v);
    if(Reflect.ownKeys(v).some(k=>typeof k!=="string"))return false;
    for(const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(v))){
      if(key==="length"&&Array.isArray(v))continue;
      if(!d.enumerable||!("value" in d)||!dataOnly(d.value,seen,budget,depth+1))return false;
    }
    seen.delete(v);return true;
  };
  if(!dataOnly(problem)||!validQuantitativeProblem(problem)||typeof proposal!=="string"||typeof observation!=="string"
    ||Buffer.byteLength(proposal)>50000||Buffer.byteLength(observation)>50000)return null;
  try{
    const action=parseNyxChatAction(proposal).action;
    if(action?.kind!=="DERIVE_QUANTITIES"||action.problemDigest!==theoryDigest(problem))return null;
    const lowered=lowerQuantitativeEquations(problem,action.program);
    const o=JSON.parse(observation),a=o?.analysis;
    const request={schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:action.problemDigest,program:action.program};
    if(o?.omegaObservation!=="CONSTRUCTED"||a?.status!=="CONSTRUCTED"||a.inputDigest!==action.problemDigest
      ||a.requestDigest!==theoryDigest(request)||a.executedProgramDigest!==theoryDigest(lowered)
      ||a.loweringVersion!==EQUATION_COMPILER_POLICY.version||a.grantsAuthority!==false
      ||a.acceptanceRequiresIndependentVerifier!==true||a.evidenceClass!=="E3")return null;
    const {resultDigest,...originalAnalysis}=a;
    if(resultDigest!==theoryDigest(originalAnalysis))return null;
    const outputs=a.payload?.outputs;
    if(!Array.isArray(outputs)||outputs.length!==action.program.outputs.length||outputs.some((v,i)=>!v
      ||v.label!==action.program.outputs[i].label||typeof v.value!=="string"||v.value.length>2500
      ||!(/^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/).test(v.value)))return null;
    const body={schemaVersion:1,kind:"PUBLIC_NATIVE_DERIVATION_REPLAY",problem,program:action.program,
      problemDigest:action.problemDigest,programDigest:theoryDigest(action.program),
      executedProgramDigest:a.executedProgramDigest,loweringVersion:a.loweringVersion,analysisDigest:resultDigest,
      observedOutputs:outputs.map(v=>({label:v.label as string,value:v.value as string})),
      scope:"SYNTHETIC_DEVELOPMENT_TOOL_ACTION_NOT_PRIVATE_REASONING_OR_MODEL_VALIDITY",
      grantsAuthority:false,mathematicalModelIndependentlyVerified:false};
    if(Buffer.byteLength(JSON.stringify(body))>50000)return null;
    return immutableTheoryValue({...body,capsuleDigest:theoryDigest(body)});
  }catch{return null;}
}
export function computationPairMatched(rows:readonly {allocatedTokens:number;allocatedHttpAttempts:number;unknownUsageCalls:number;
  providerFailures:number;logicalCalls:number;toolWorkUnits:number}[]){
  const stable=rows.length===2&&rows.every(r=>r.unknownUsageCalls===0&&r.providerFailures===0&&r.logicalCalls===2
    &&Number.isFinite(r.allocatedTokens)&&r.allocatedTokens>0&&Number.isFinite(r.allocatedHttpAttempts)&&r.allocatedHttpAttempts>0
    &&Number.isSafeInteger(r.toolWorkUnits)&&r.toolWorkUnits>=0);
  const matchedModelCompute=stable&&["allocatedTokens","allocatedHttpAttempts"].every(k=>{
    const values=rows.map(r=>r[k as "allocatedTokens"|"allocatedHttpAttempts"]);
    return Math.max(...values)-Math.min(...values)<=Math.max(1,...values)*POLICY.matchedModelComputeTolerance;});
  return {providerStable:stable,matchedModelCompute,totalComputeMatched:false,
    toolWorkUnits:rows.map(r=>r.toolWorkUnits),interpretation:"TOOL_COMPUTE_IS_THE_TREATMENT_NOT_FREE_OR_MATCHED"};
}
export async function runComputationTransfer(){
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())
    throw Error("computation_transfer_requires_authorized_network_and_injected_secret");
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate=process.env.GITHUB_SHA||git("rev-parse","HEAD");
  if(candidate!==git("rev-parse","HEAD")||!/^[a-f0-9]{40}$/.test(candidate)||git("status","--porcelain"))throw Error("clean_candidate_required");
  const stage=process.env.OMEGA_COMPUTATION_STAGE??"FULL";
  if(!["FULL","DIAGNOSTIC","COLLECTION_BOUNDS","PROBABILITY_DEVELOPMENT","PROBABILITY_TRANSFER"].includes(stage))throw Error("computation_stage_invalid");
  const boundsComparison=stage==="COLLECTION_BOUNDS";
  const probabilityComparison=stage.startsWith("PROBABILITY_"),independentProposals=boundsComparison||probabilityComparison;
  const tasks:readonly (ComputationTask|ProbabilityTransferTask)[]=probabilityComparison?probabilityTransferTasks(stage==="PROBABILITY_TRANSFER"?"TRANSFER":"DEVELOPMENT")
    :boundsComparison?computationTasks("BOUNDS_DIAGNOSTIC"):stage==="DIAGNOSTIC"?computationTasks("DIAGNOSTIC"):[...computationTasks("DEVELOPMENT"),...computationTasks("TRANSFER")];
  const sourceBefore=git("ls-files","-s");const started=Date.now();const epochDeadline=started+tasks.length*2*POLICY.maxTaskMs+60000;
  const provider=NvidiaNimProvider.create({providerId:"NYX-SHARED-COMPUTATION-TRANSFER",model:POLICY.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:64000,maxOutputTokens:POLICY.maxOutputTokens,timeoutMs:120000,finalAttemptTimeoutMs:POLICY.maxTaskMs,
    finalAttemptSelection:"LAST_ATTEMPT_OR_NO_RETRY_WINDOW"});
  type Row={taskId:string;stage:string;domain:string;arm:ComputationArm;state:string;correct:boolean|null;
    logicalCalls:number;allocatedTokens:number;allocatedHttpAttempts:number;unknownUsageCalls:number;providerFailures:number;
    toolWorkUnits:number;toolElapsedMs:number;elapsedMs:number;allocatedElapsedMs:number;prefixReplayed:boolean;
    inputDigest:string;programDigest:string|null;computedModelCorrect:boolean|null;sharedIntentDigest:string|null;
    logicalUsage:ReturnType<typeof textInferenceUsage>;physicalAccounting:unknown;events:unknown;
    evidence:unknown;compilerFindings:string[];nativeReplay:ReturnType<typeof captureComputationReplay>;nativeReplayCaptureMs:number;
    probabilityReplay:ReturnType<typeof captureProbabilityReplay>;
    sourceRepositoryMutated:false;broaderAuthorityGranted:false};
  const rows:Row[]=[],blocked:{taskId:string;reason:string}[]=[],physicalExecutions:NvidiaNimEvidence[]=[];
  const publicTask=(task:ComputationTask|ProbabilityTransferTask)=>({taskId:task.taskId,stage:task.stage,domain:task.domain,
    problem:task.problem,question:task.question});
  const checkpoint=async(final=false)=>{
    const pairs=tasks.map(t=>{const pair=rows.filter(r=>r.taskId===t.taskId);return {taskId:t.taskId,stage:t.stage,domain:t.domain,
      ...computationPairMatched(pair),sharedProposalMatched:pair.length===2&&pair[0].programDigest===pair[1].programDigest
        &&pair[0].sharedIntentDigest===pair[1].sharedIntentDigest&&pair[0].sharedIntentDigest!==null&&pair[0].programDigest!==null,
      executionTreatmentDelivered:pair.some(r=>r.arm!=="PROPOSAL_ONLY"&&r.computedModelCorrect!==null),
      outcomes:pair.map(r=>({arm:r.arm,state:r.state,correct:r.correct}))};});
    const sourceUnchanged=sourceBefore===git("ls-files","-s")&&!git("status","--porcelain");
    const report={schemaVersion:1,identity:"NYX-COMPUTATION-TRANSFER-001",candidate,executionIdentity:process.env.GITHUB_RUN_ID?`github-actions-${process.env.GITHUB_RUN_ID}`:"LOCAL",
      environment:`${process.platform}-${process.arch}-${process.version}`,
      policy:probabilityComparison?{...POLICY,version:2,corpusDigest:theoryDigest(tasks.map(publicTask)),
        purpose:"FINITE_PROBABILISTIC_MODEL_FORMULATION_ABLATION_NOT_OFFICIAL_BENCHMARK"}:POLICY,stage,populationDigest:theoryDigest(tasks),
      selectedTasks:tasks.map(t=>({taskId:t.taskId,stage:t.stage,domain:t.domain,inputDigest:theoryDigest(publicTask(t))})),
      selectedTaskArms:tasks.length*2,attempted:rows.length,graded:rows.filter(r=>r.correct!==null).length,
      correct:rows.filter(r=>r.correct===true).length,ungraded:rows.filter(r=>r.correct===null).length,unexecuted:tasks.length*2-rows.length,
      actualUniqueModelUsage:computationPhysicalUsage(physicalExecutions,Date.now()-started),rows,pairs,blocked,
      nativeToolUsage:{workUnits:rows.reduce((n,r)=>n+r.toolWorkUnits,0),elapsedMs:rows.reduce((n,r)=>n+r.toolElapsedMs,0),
        scope:"RETURNED_NATIVE_ANALYSIS_ACCOUNTING_SEPARATE_FROM_MODEL_USAGE"},
      nativeReplayCaptureElapsedMs:rows.reduce((n,r)=>n+r.nativeReplayCaptureMs,0),
      intervention:probabilityComparison?"DECLARATIVE_PROBABILISTIC_MODEL_VS_BOUNDED_PHASE_IR":boundsComparison?"NATIVE_COLLECTION_BOUND_GENERATION_SCHEMA":"EXACT_EXECUTION_OF_SHARED_PROPOSAL",
      firstProposalProtocol:independentProposals?"INDEPENDENT_INFERENCE_REPRESENTATION_IS_THE_INTERVENTION":"SHARED_LIVE_PUBLIC_PROPOSAL",
      representationAcceptance:probabilityComparison?{scope:"CORRECT_FINAL_CHOICE_AND_CORRECT_NATIVE_QUANTITY_REQUIRED",
        byArm:["BOUNDED_SCHEMA","FINITE_PROBABILITY"].map(arm=>({arm,selected:tasks.length,
          attempted:rows.filter(r=>r.arm===arm).length,correctChoices:rows.filter(r=>r.arm===arm&&r.correct===true).length,
          correctQuantities:rows.filter(r=>r.arm===arm&&r.computedModelCorrect===true).length,
          jointlyAccepted:rows.filter(r=>r.arm===arm&&r.correct===true&&r.computedModelCorrect===true).length}))}:null,
      sourceUnchanged,firstAttemptsOnly:true,semanticRepairs:0,feedbackFromGraderToCognition:false,officialBenchmark:false,
      modelDefaultChanged:false,productionAuthority:false,networkScope:"CONFIGURED_NVIDIA_ENDPOINT_ONLY",
      toolScope:"PREBOUND_FINITE_EXACT_ARITHMETIC_ONLY_NO_FILES_SHELL_OR_NETWORK",
      priorGpqaScorePreserved:true,gpqaQuestionsOrAnswersLoaded:false,rawPrivateReasoningStored:false,
      nativeReplayScope:"PUBLIC_NATIVE_TOOL_ACTION_AND_OUTPUT_ONLY_SYNTHETIC_DEVELOPMENT_NO_ORACLE_OR_PRIVATE_INFERENCE",
      oracleIndependence:"E3_IMPLEMENTER_AUTHORED_WITH_SEPARATE_PYTHON_FRACTION_CROSSCHECK_NOT_INDEPENDENT_REPLICATION",
      inferenceEvidence:independentProposals?"E4_LIVE_NVIDIA_INDEPENDENT_PROPOSALS_NO_REPLAY":"E4_LIVE_NVIDIA_PLUS_EXPLICITLY_LABELED_SHARED_PROPOSAL_REPLAY",
      interpretation:probabilityComparison?"SYNTHETIC_MODELING_REPRESENTATION_ABLATION_NOT_GPQA_OR_BROAD_COGNITIVE_PROMOTION":boundsComparison?"DEVELOPMENT_SCHEMA_RELIABILITY_ABLATION_NOT_COGNITIVE_PROMOTION_OR_GPQA_SCORE":"SHARED_DERIVATION_CAUSAL_ABLATION_NOT_REPLACEMENT_FOR_CURRENT_NYX_OR_GPQA_SCORE",
      computeAccounting:"PHYSICAL_COMPLETION_CALLBACKS_COUNTED_ONCE_PREFIX_REPLAY_NOT_DISPATCHED_REQUEST_DIGEST_IS_NOT_EXECUTION_ID_TOOL_COST_ADDITIONAL",
      calibration:"NOT_SUPPORTED_BY_FINAL_CHOICE_PROTOCOL",broadPromotion:false,automaticPromotion:false,
      stopReason:rows.length===tasks.length*2?"SELECTION_EXHAUSTED":blocked.at(-1)?.reason??"FROZEN_EPOCH_BUDGET",
      epochElapsedMs:Date.now()-started};
    await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-computation-${final?"report":"progress"}-${candidate}.json`),JSON.stringify(report,null,2));
    if(final)console.log(`NYX_COMPUTATION_EPOCH ${JSON.stringify(report)}`);return report;
  };
  outer:for(const [index,task] of tasks.entries()){
    // Precommitted alternating order; probability transfer reverses development's order.
    // Four objectives in one epoch do NOT fully separate domain and execution-order effects.
    const order:ComputationArm[]=probabilityComparison?((index+Number(stage==="PROBABILITY_TRANSFER"))%2===0?["BOUNDED_SCHEMA","FINITE_PROBABILITY"]:["FINITE_PROBABILITY","BOUNDED_SCHEMA"])
      :boundsComparison?(index%2===0?["LEGACY_SCHEMA","BOUNDED_SCHEMA"]:["BOUNDED_SCHEMA","LEGACY_SCHEMA"])
      :(task.stage==="TRANSFER"&&"replicate" in task?task.replicate%2===0:index%2===1)?["EXACT_EXECUTION","PROPOSAL_ONLY"]:["PROPOSAL_ONLY","EXACT_EXECUTION"];
    const pairProvider=provider.withHttpAttemptBudget(POLICY.maxHttpAttemptsPerPair,"WITHIN_SHARED_BUDGET");
    let activeDeadline=0;let prefixEvidence:NvidiaNimEvidence|null=null,programDigest:string|null=null,computedModelCorrect:boolean|null=null;
    const completePhysical=async (request:Parameters<typeof pairProvider.complete>[0])=>{
      const response=await pairProvider.complete(textBoundedTaskRequest(textConfiguredRequest(request,"SESSION_SUPER_PHASE_CONTRACT","DIRECT"),activeDeadline));
      physicalExecutions.push(response.evidence);return response;};
    const shared=createSharedFirstProposal(completePhysical);
    for(const arm of order){
      const ready=await liveNvidiaCapacity.waitUntilReady(Math.min(epochDeadline,Date.now()+180000),new AbortController().signal);
      if(ready.state!=="READY"||Date.now()>=epochDeadline){blocked.push({taskId:task.taskId,reason:"CAPACITY_OR_EPOCH_UNAVAILABLE"});break outer;}
      const prefixMs=independentProposals?0:shared.prefixElapsedMs(),began=Date.now(),remaining=POLICY.maxTaskMs-prefixMs;
      if(remaining<1000){blocked.push({taskId:task.taskId,reason:"SHARED_PREFIX_EXHAUSTED_ORIGINAL_LEASE"});break outer;}
      activeDeadline=Math.min(epochDeadline,began+remaining);
      const reader=await ReadOnlyRepositoryExecutor.create({executorId:`COMPUTE-${task.taskId}`,tokenId:`COMPUTE-TOKEN-${task.taskId}`,
        repositoryRoot:resolve("."),resourceScopes:["scripts/omega/benchmarks"],issuedAtEpochMs:began-1,expiresAtEpochMs:activeDeadline,
        constraints:{maxFileBytes:1,maxDirectoryEntries:1,allowedExtensions:[".txt"]},issuer:"NYX-COMPUTATION-TRANSFER",auditIdentity:task.taskId});
      reader.terminate(began,"NO_REPOSITORY_AUTHORITY_IN_COMPUTATION_PILOT");
      const tool=arm!=="PROPOSAL_ONLY"?BoundedReasoningSession.create(task.problem,{maxWorkUnits:POLICY.maxWorkUnits,
        maxElapsedMs:POLICY.maxToolMs,maxRequests:1,expiresAtEpochMs:activeDeadline}):undefined;
      // Different generation schemas require independent proposals. Existing branch accounting
      // is reused, but no response, operation, prefix time or inference is replayed between these arms.
      const branch=(independentProposals?createSharedFirstProposal(completePhysical):shared).branch(),evidence:NvidiaNimEvidence[]=[],compilerFindings:string[]=[];let toolWorkUnits=0,toolElapsedMs=0;
      if(independentProposals){prefixEvidence=null;programDigest=null;computedModelCorrect=null;}
      let result:NyxChatTurnResult|null=null,session:NyxChatSession|null=null;
      let publicProposal:string|null=null,nativeReplay:ReturnType<typeof captureComputationReplay>=null,nativeReplayCaptureMs=0;
      let probabilityReplay:ReturnType<typeof captureProbabilityReplay>=null;
      try{
        session=NyxChatSession.create({sessionId:task.taskId,reader,candidateWriter:null,editablePaths:[],maxCandidatesPerTurn:0,
          maxModelCallsPerTurn:POLICY.maxCallsPerArm,maxTurnMs:activeDeadline-Date.now(),maxOutputTokens:POLICY.maxOutputTokens,
          actionContract:{kind:"DERIVE_THEN_REPLY",problem:task.problem,outputLabels:["quantity"]},derivationSession:tool,
          ...(arm==="BOUNDED_SCHEMA"?{derivationSchemaProfile:"COLLECTION_BOUNDS" as const}:{}),
          ...(arm==="FINITE_PROBABILITY"?{derivationRepresentation:"FINITE_PROBABILITY_MODEL" as const}:{}),
          model:{complete:async request=>{
            // Observe only admitted public tool output, never hidden model reasoning or verifier answers.
            const last=request.messages.at(-1)?.content;
            if(publicProposal!==null&&last){const beganCapture=performance.now();
              nativeReplay=captureComputationReplay(task.problem,publicProposal,last);
              probabilityReplay=captureProbabilityReplay(task.problem,publicProposal,last);
              nativeReplayCaptureMs+=performance.now()-beganCapture;}
            if(last){try{const o=JSON.parse(last);if(o.omegaObservation==="REJECTED"&&typeof o.compilerFinding==="string")compilerFindings.push(o.compilerFinding);}catch{/* Objective text is not an observation. */}}
            if(arm!=="PROPOSAL_ONLY"&&last){try{const observation=JSON.parse(last);
              // Failed/budget-exhausted native analyses still spend resources.
              if(observation.analysis&&Number.isSafeInteger(observation.analysis.workUnits)&&observation.analysis.workUnits>=0
                &&Number.isFinite(observation.analysis.elapsedMs)&&observation.analysis.elapsedMs>=0){
                toolWorkUnits=observation.analysis.workUnits;toolElapsedMs=observation.analysis.elapsedMs;
              }
              if(observation.omegaObservation==="CONSTRUCTED"){
                const quantities=observation.analysis.payload?.outputs;
                computedModelCorrect=Array.isArray(quantities)&&quantities.length===1&&quantities[0].label==="quantity"&&quantities[0].value===task.expectedQuantity;
              }
            }catch{/* Bounded task text is not a tool observation. */}}
            const response=await branch.complete(request);evidence.push(response.evidence);
            if(evidence.length===1){prefixEvidence=response.evidence;
              publicProposal=response.content;
              const parsed=response.content===null?null:parseNyxChatAction(response.content).action;
              programDigest=parsed?.kind==="DERIVE_QUANTITIES"?theoryDigest(parsed.program):null;}
            return response;
          }}});
        result=await session.turn(task.question);
      }catch{/* Sanitized infrastructure outcome only; do not persist a raw exception or response. */}
      finally{session?.dispose();tool?.revoke();reader.terminate(Date.now(),"COMPUTATION_TASK_FINISHED");}
      const usage=textInferenceUsage(evidence,Date.now()-began),prefix=!independentProposals&&prefixEvidence?textInferenceUsage([prefixEvidence],prefixMs):null;
      const {state,correct}=computationOutcome(result,evidence,task.answer);
      const row:Row={taskId:task.taskId,stage:task.stage,domain:task.domain,arm,state,correct,logicalCalls:evidence.length,
        allocatedTokens:usage.reportedTokens-(prefix?.reportedTokens??0)/2,
        allocatedHttpAttempts:usage.httpAttempts-(prefix?.httpAttempts??0)/2,unknownUsageCalls:usage.unknownUsageCalls,providerFailures:usage.providerFailures,
        elapsedMs:Date.now()-began,allocatedElapsedMs:Date.now()-began+prefixMs,
        toolWorkUnits,toolElapsedMs,compilerFindings,nativeReplay,probabilityReplay,nativeReplayCaptureMs,prefixReplayed:branch.accounting().receipt?.replayed??false,
        inputDigest:theoryDigest(publicTask(task)),programDigest,computedModelCorrect:arm!=="PROPOSAL_ONLY"?computedModelCorrect:null,
        sharedIntentDigest:branch.accounting().receipt?.intentDigest??null,logicalUsage:usage,
        physicalAccounting:{...branch.accounting(),receipt:undefined},
        events:result?.events.map(e=>({sequence:e.sequence,eventType:e.eventType,outcome:e.outcome,evidenceClass:e.evidenceClass}))??[],
        evidence:evidence.map(e=>({evidenceId:e.evidenceId,requestDigest:e.requestDigest,statusCode:e.statusCode,finishReason:e.finishReason,
          failureCategory:e.failureCategory,usage:e.usage,reasoningOutputBytes:e.reasoningOutputBytes??null,
          delivery:e.delivery??null})),sourceRepositoryMutated:false,broaderAuthorityGranted:false};
      rows.push(row);console.log(`NYX_COMPUTATION_TASK ${JSON.stringify(row)}`);await checkpoint();
    }
  }
  const report=await checkpoint(true);
  if(!report.sourceUnchanged||report.unexecuted||report.ungraded)process.exitCode=1;
  return report;
}
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/nyx-computation-transfer.ts"))await runComputationTransfer();
