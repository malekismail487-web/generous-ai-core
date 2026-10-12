import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { NyxNemotronEngineeringCognition, type NyxRepairCognitionEvidence } from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash, R3BenchmarkRepositorySession } from "./benchmarks/r3RepositorySession";
import { representationRepositoryFiles, assessRepresentationCandidate, classifyRepresentationFailure, type RepresentationTask } from "./benchmarks/sourceRepresentationTasks";
import { suppliedCandidateThenLive } from "./benchmarks/conditionalRefactorRepairTasks";
import { inferUsage } from "./benchmarks/nyxArcAdapter";
import { inspectNyxSourceEmission } from "./nyx-source-emission-diagnostics";
import { v3NativeReasoningConfiguration } from "./benchmarks/v3NativeReasoningTransferTasks";
import { SHARED_GUARDED_REPAIR_EPOCH, sharedGuardedRepairTasks, sharedGuardedRepairConfiguration,
  sharedGuardedWireVerified, sharedGuardedPairAssessment, type SharedGuardedWireControl } from "./benchmarks/sharedGuardedRepairTasks";
import { SOURCE_SITE_REPAIR_EPOCH, sourceSiteRepairConfiguration, type SourceSiteRepairVariant } from "./benchmarks/sourceSiteRepairFreshTasks";

export const SHARED_GUARDED_LIMITS = Object.freeze({model:"nvidia/nemotron-3-super-120b-a12b",temperature:0,
  maxOutputTokens:8192,reasoningTokens:2048,maxPromptBytes:48000,maxPatchBytes:12000,providerTimeoutMs:65000,
  logicalCallsPerArmIncludingShared:2,physicalCallsPerPairMaximum:3,localReplayInteractionsPerArm:1,
  maxVerificationExecutionsPerStage:3,maxVerificationExecutionsChargedPerArm:5,
  maxWallClockMsChargedPerArm:155000,globalWallClockMs:2700000,realizedTolerance:0.1,
  sharedAccounting:"COUNT_ONCE_IN_UNIQUE_EPOCH_TOTAL_AND_FULLY_CHARGE_TO_EACH_COUNTERFACTUAL_ARM",
  matchScope:"POST_REPLAY_REPAIR_CALLS_TOKENS_AND_SCHEDULED_VERIFIER_WORK_NOT_SHARED_COST_MASKING",
  replayCost:"SEPARATE_E3_PARSE_APPLY_AND_REVERIFY_NO_FREE_TOOLS_OR_NEW_LIVE_INFERENCE",
  wallClockPolicy:"SHARED_STAGE_ELAPSED_CHARGED_TO_EACH_ARM_IDLE_OTHER_ARM_TIME_REPORTED_AT_EPOCH_LEVEL_NO_LEASE_RENEWAL",
  sourceMutations:false,generalShell:false,generalNetwork:false,production:false,hostileCodeSandbox:false,
  candidateNetworkIsolation:"NOT_PROVEN",defaultChanged:false,broadPromotion:"NONE"});
type GuardedStageVariant="SHARED_INITIAL"|"V3_CONTROL"|"V4_COVERAGE";
type StageVariant=GuardedStageVariant|"WHOLE_SOURCE"|"SOURCE_SITES";
type LoopResult=Awaited<ReturnType<R3BoundedRepairLoop["run"]>>;
const evidenceFor=(result:LoopResult|null)=>[...(result?.iterations.map(i=>i.cognitionEvidence)??[]),
  ...(result?.cognitionFailures.map(i=>i.cognitionEvidence)??[]),...(result?.evidenceAcquisitions.map(i=>i.cognitionEvidence)??[]),
  ...(result?.lastCognitionEvidence?[result.lastCognitionEvidence]:[])]
  .filter((e,i,all)=>all.findIndex(other=>other.evidenceId===e.evidenceId)===i);

/** Evaluator-only composition of the SAME R3 loop and repository session. Never
 * restores a lease, changes an oracle, gives a model authority, or certifies E3 as E4.
 * returnedSource is transient data and must never enter logs or the report.
 */
export async function executeSharedGuardedStage(task:RepresentationTask,candidate:string,deadline:number,
  variant:StageVariant,provider:NvidiaNimProvider,replaySource?:string,trial?:"SOURCE_SITES_FRESH_1") {
  if(trial!==undefined&&trial!=="SOURCE_SITES_FRESH_1")throw Error("shared_stage_trial_invalid");
  const sourceSites=trial==="SOURCE_SITES_FRESH_1", epoch=sourceSites?SOURCE_SITE_REPAIR_EPOCH:SHARED_GUARDED_REPAIR_EPOCH;
  if(!(sourceSites?["SHARED_INITIAL","WHOLE_SOURCE","SOURCE_SITES"]:["SHARED_INITIAL","V3_CONTROL","V4_COVERAGE"]).includes(variant)
    ||(variant==="SHARED_INITIAL")!==(replaySource===undefined)
    ||provider.profile().model!==SHARED_GUARDED_LIMITS.model)throw Error("shared_stage_config_invalid");
  const began=Date.now();
  let session:R3BenchmarkRepositorySession|null=null;
  let result:LoopResult|null=null,baselineExecutions=0,infrastructureFailure=false;
  let cleanup:Awaited<ReturnType<R3BenchmarkRepositorySession["close"]>>|null=null;
  let fixtureEvidence:readonly NyxRepairCognitionEvidence[]=[];
  try {
    session=await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task),candidate,deadline,12000);
    const activeSession=session;
    const baseline=await session.baseline();baselineExecutions++;
    const live=NyxNemotronEngineeringCognition.create({cognitionId:"NYX-SHARED-CANDIDATE-EXISTING-COGNITION",
      provider:provider.withHttpAttemptBudget(1,"WITHIN_SHARED_BUDGET"),maxPromptBytes:48000,maxOutputTokens:8192,
      sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",repairFeedbackPolicy:"TRANSIENT_REJECTED_SOURCE_WINDOW",
      experimentVariant:"CURRENT",comparisonInferencePolicy:"CONSTRAINED_JSON",preserveProviderArrayBounds:true,
      comparisonReasoningControl:"SUPER_HOSTED_NATIVE",
      ...(sourceSites?sourceSiteRepairConfiguration(variant as SourceSiteRepairVariant)
        :variant==="SHARED_INITIAL"?v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"):sharedGuardedRepairConfiguration(variant))});
    const replay=replaySource===undefined?null:suppliedCandidateThenLive(live,replaySource);
    fixtureEvidence=replay?.fixtureEvidence??[];
    const loop=R3BoundedRepairLoop.create({loopId:`SHARED-${task.id}-${variant}`,evaluatorVersion:epoch.version,
      observerIdentity:"EXISTING-OMEGA-SHARED-CANDIDATE-EVALUATOR",candidateAdmissionPolicyId:epoch.admissionPolicyId,
      cognition:replay?.cognition??live,candidateBuilder:{builderIdentity:"EXISTING-OMEGA-R3",prepare:h=>activeSession.prepare(h)},
      maxIterations:replay?2:1,maxModelInteractions:replay?2:1,maxCognitionCorrections:0,
      maxWallClockMs:Math.max(100,deadline-Date.now()-5000),maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
    result=await loop.run({schemaVersion:1,repairRequestId:`SHARED-${task.id}`,objective:task.objective,
      initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
      availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],
      observedAtEpochMs:Date.now(),signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()-5000))});
  } catch {infrastructureFailure=true;}
  finally {try{if(session)cleanup=await session.close();}catch{infrastructureFailure=true;}}
  const liveEvidence=evidenceFor(result).filter(e=>!fixtureEvidence.some(f=>f.evidenceId===e.evidenceId));
  const usage=inferUsage(liveEvidence);
  usage.toolCalls=baselineExecutions+(result?.iterations.reduce((n,i)=>n+i.verifications.length,0)??0);
  usage.toolWorkUnits=usage.toolCalls*(task.publicCases.length+task.privateCases.length);
  usage.wallClockMs=Date.now()-began;
  const last=result?.iterations.at(-1);
  const perIteration=result?.iterations.map(i=>({iteration:i.iteration,evidenceClass:i.cognitionEvidence.evidenceClass,
    sourceOrigin:fixtureEvidence.some(f=>f.evidenceId===i.cognitionEvidence.evidenceId)
      ?"E3_REPLAY_OF_SHARED_LIVE_SOURCE_NOT_NEW_INFERENCE":"INFERENCE_OR_NO_MODEL_SOURCE",
    candidateSourceDigest:i.hypothesis.changes[0]?.replacementContentHash??null,
    publicAccepted:i.functionallyPassed,quality:i.candidateAdmission?.decision??null,
    staticPolicyId:i.candidateAdmission?.staticPolicyId??null,applicability:i.candidateAdmission?.applicability??null,
    qualityFindings:i.candidateAdmission?.findings??[],
    ...assessRepresentationCandidate(task,{publicAccepted:i.functionallyPassed,qualityAccepted:i.candidateAdmission?.decision==="ADMITTED",
      verificationStdout:i.verifications[0]?.execution.evidence.stdout??null,
      loopVerified:i===last&&result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"})}))??[];
  const final=perIteration.at(-1)??assessRepresentationCandidate(task,{publicAccepted:false,qualityAccepted:false,
    verificationStdout:null,loopVerified:false});
  const failure=result?.cognitionFailures.find(f=>f.cognitionEvidence.evidenceId===result?.lastCognitionEvidence?.evidenceId);
  const failureClass=classifyRepresentationFailure({accepted:final.accepted,infrastructureFailure,
    reason:result?.reason??"infrastructure_failure",latestSchemaFailure:failure,
    latestProviderFailure:result?.lastCognitionEvidence?.providerFailureCategory,latestDelivery:result?.lastCognitionEvidence?.delivery,
    qualityRejected:last?.candidateAdmission?.decision==="REJECTED",publicFailed:last?.functionallyPassed===false,
    privateFailure:final.score?.failure??null});
  // Keep private verifier stdout/answers and all raw model text out of returned evidence.
  const row={id:task.id,domain:task.domain,variant,evidenceClass:liveEvidence.some(e=>e.evidenceClass==="E4")?"E4":"E3_OR_NOT_INVOKED",
    accepted:final.accepted,functionalAccepted:final.functionalAccepted,qualityAccepted:final.qualityAccepted,
    score:final.score,perIteration,usage,infrastructureFailure,toolUsageComplete:!infrastructureFailure,
    loopOutcome:result?.outcome??"INFRASTRUCTURE_FAILURE",loopReason:result?.reason??"INTEGRATION_THROW",failureClass,
    nominalLoopInteractions:result?.modelCallCount??0,replayInteractions:fixtureEvidence.length,
    replayEvidence:fixtureEvidence.map(e=>({evidenceId:e.evidenceId,evidenceClass:e.evidenceClass,
      requestDigest:e.modelRequestDigest,responseDigest:e.modelResponseDigest,authorityGranted:e.authorityGranted})),
    liveEvidence:liveEvidence.map(e=>({evidenceId:e.evidenceId,evidenceClass:e.evidenceClass,modelEvidenceId:e.modelEvidenceId,
      requestDigest:e.modelRequestDigest,responseDigest:e.modelResponseDigest,delivery:e.delivery,usage:e.modelUsage,
      providerFailureCategory:e.providerFailureCategory,authorityGranted:e.authorityGranted})),
    terminalProviderFailure:result?.lastCognitionEvidence?.providerFailureCategory??null,
    terminalProviderDelivery:result?.lastCognitionEvidence?.delivery??null,
    schemaFailureClasses:result?.cognitionFailures.map(f=>({reason:f.reason,categories:f.diagnostics.map(d=>d.category)}))??[],
    guardedSelectionReceipts:liveEvidence.flatMap(e=>e.refactorSelection?[e.refactorSelection]:[]),cleanup,
    ...(sourceSites?{sourceSiteReceipts:liveEvidence.flatMap(e=>e.sourceSiteEmission?[e.sourceSiteEmission]:[])}:{}),
    repairedAccepted:final.accepted&&(result?.iterations.length??0)>1&&usage.physicalCalls>0,
    retainedReplayWithoutLiveRepair:replaySource!==undefined&&(result?.iterations.length??0)===1&&usage.physicalCalls===0,
    privateScorerWorkUnits:perIteration.reduce((n,i)=>n+i.privateScorerWorkUnits,0)};
  const first=result?.iterations[0];
  const returnedSource=variant==="SHARED_INITIAL"&&first?.applicationDecision==="APPLIED"
    &&!infrastructureFailure?first.hypothesis.changes[0]?.replacementContent:null;
  return {row,returnedSource:returnedSource??null};
}

/** Malformed/truncated source is an outcome, never an evaluator exception. Raw
 * content is transient, and canonical input digests only correlate strict receipts. */
export async function inspectSharedGuardedCaptures(captures:readonly {content:string|null;finishReason:string|null}[],
  row:Pick<Awaited<ReturnType<typeof executeSharedGuardedStage>>["row"],"liveEvidence"|"guardedSelectionReceipts">) {
  return Promise.all(captures.map(capture=>{
    const receipt=row.liveEvidence.find(e=>capture.content!==null&&e.responseDigest===contentHash(capture.content));
    let inputDigest:string|null=null;
    if(capture.content!==null)try{inputDigest=theoryDigest(JSON.parse(capture.content));}catch{/* diagnostics preserve NON_JSON_CONTENT */}
    return inspectNyxSourceEmission({content:capture.content,finishReason:capture.finishReason,
      providerResponseDigest:receipt?.responseDigest??null,expectedTarget:"src/transform.mjs",representation:"LINES",
      refactorSelection:inputDigest===null?undefined:row.guardedSelectionReceipts.find(e=>e.inputDigest===inputDigest)});
  }));
}

export function sharedGuardedStageBounds(row:Awaited<ReturnType<typeof executeSharedGuardedStage>>["row"]) {
  return row.usage.physicalCalls<=1&&row.usage.logicalCalls<=1
    &&row.usage.toolCalls<=SHARED_GUARDED_LIMITS.maxVerificationExecutionsPerStage
    &&row.nominalLoopInteractions<=2&&row.replayInteractions<=1
    &&row.cleanup?.sourceUnchanged===true&&row.cleanup?.cleanupVerified===true;
}

export async function runSharedGuardedRepairEpoch() {
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())
    throw Error("shared_guarded_requires_explicit_network_and_injected_secret");
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate=process.env.GITHUB_SHA||git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))
    throw Error("shared_guarded_clean_exact_candidate_required");
  const original=theoryDigest(git("ls-files","-s")),taskSet=sharedGuardedRepairTasks();
  const paths=["scripts/omega/nyx-shared-guarded-repair.ts","scripts/omega/benchmarks/sharedGuardedRepairTasks.ts",
    "scripts/omega/benchmarks/conditionalRefactorRepairTasks.ts","scripts/omega/benchmarks/sourceRepresentationTasks.ts",
    "scripts/omega/benchmarks/r3RepositorySession.ts","scripts/omega/benchmarks/nyxArcAdapter.ts",
    "scripts/omega/benchmarks/v3NativeReasoningTransferTasks.ts","scripts/omega/benchmarks/nativeReasoningTransferTasks.ts",
    "scripts/omega/benchmarks/guardedRepairFreshTasks.ts","scripts/omega/nyx-source-emission-diagnostics.ts",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts","src/lib/codelab/cognition/nyxLocalRefactorProposals.ts",
    "src/lib/codelab/cognition/nyxSourceBoundRefactorSelection.ts","src/lib/codelab/cognition/nyxRepairIntentCompiler.ts",
    "src/lib/codelab/cognition/nyxDecisionRequiredSchema.ts","src/lib/codelab/cognition/nyxMeasuredQualityGuidance.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/engine/r3BoundedRepairLoop.ts",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts","src/lib/codelab/assurance/candidateEngineeringAdmission.ts",
    "src/lib/codelab/assurance/candidateQualityApplicability.ts"];
  const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async path=>[path,contentHash(await readFile(path,"utf8"))])));
  const tasks=taskSet.map(task=>({id:task.id,tier:task.tier,domain:task.domain,
    inputDigest:theoryDigest({objective:task.objective,publicCases:task.publicCases,privateInputs:task.privateCases.map(c=>c.input)}),
    oracleDigest:theoryDigest(task.privateCases),fixtureDigest:theoryDigest(task)}));
  const frozen={...SHARED_GUARDED_LIMITS,epoch:SHARED_GUARDED_REPAIR_EPOCH,taskCorpus:SHARED_GUARDED_REPAIR_EPOCH.version,
    qualityPolicy:SHARED_GUARDED_REPAIR_EPOCH.admissionPolicyId,modelCallsMaximum:taskSet.length*3,
    authoredCandidates:false,replaySourceOrigin:"SHARED_LIVE_NYX_INITIAL_NOT_AUTHORED_ALGORITHM",authority:"EXISTING_R3_ISOLATED_ONLY"};
  const freezeDigest=theoryDigest({candidate,frozen,sourceDigests,tasks});
  console.log(`NYX_REPRESENTATION_FREEZE ${JSON.stringify({candidate,frozen,sourceDigests,tasks,freezeDigest})}`);
  const began=Date.now(),globalDeadline=began+frozen.globalWallClockMs,results:any[]=[],initialResults:any[]=[],pairs:any[]=[];
  const run=async(task:RepresentationTask,variant:GuardedStageVariant,remainingMs:number,replaySource?:string)=>{
    const controls:SharedGuardedWireControl[]=[],captures:{content:string|null;finishReason:string|null}[]=[];
    const provider=NvidiaNimProvider.create({providerId:`NYX-SHARED-${variant}`,model:frozen.model,
      authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
      maxPromptBytes:64000,maxOutputTokens:8192,timeoutMs:65000,transport:async(url,init)=>{
        if(String(url)!==NVIDIA_NIM_CHAT_COMPLETIONS_URL)throw Error("shared_endpoint_out_of_scope");
        const body=JSON.parse(String(init.body)),prompt=JSON.parse(body.messages[1].content);
        const proposals=prompt.localRefactorProposals;
        controls.push({model:body.model,maxTokens:body.max_tokens,temperature:body.temperature,effort:body.reasoning_effort,
          reasoningBudget:body.reasoning_budget??null,initialCandidateState:prompt.hypothesisHistory.length===0
            &&prompt.activeRepairDriver.kind==="EXECUTION_OBSERVATION",publicAdmissionPolicyId:prompt.constraints.publicStaticAdmission.policyId,
          legacyLineApplicabilityPresent:Object.hasOwn(prompt.constraints.publicStaticAdmission.tinySingleChangedFileRule,"atMostNonblankOriginalLines"),
          originalBudgetPresented:!!prompt.originalStructuralBudget,originalBudgetVersion:prompt.originalStructuralBudget?.version??null,
          originalBudgetPolicyId:prompt.originalStructuralBudget?.staticPolicyId??null,
          qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",localProposalCount:proposals?.proposals?.length??0,
          localProposalVersion:proposals?.version??null,proposerVersion:proposals?.proposerVersion??null,
          selectionBranchOffered:(body.response_format.json_schema.schema.anyOf??[]).some((b:any)=>b.properties?.decision?.enum?.includes("SELECT_LOCAL_REFACTOR")),
          selectionBindingDigest:proposals?.bindingDigest??null,promptDigest:theoryDigest(body.messages),schemaDigest:theoryDigest(body.response_format)});
        const response=await fetch(url,init);
        if(response.ok)try{const data=await response.clone().json(),choice=data.choices?.[0];
          captures.push({content:typeof choice?.message?.content==="string"?choice.message.content:null,
            finishReason:typeof choice?.finish_reason==="string"?choice.finish_reason:null});}catch{captures.push({content:null,finishReason:null});}
        return response;
      }});
    const stage=await executeSharedGuardedStage(task,candidate,Math.min(globalDeadline,Date.now()+remainingMs),variant,provider,replaySource);
    const inspections=await inspectSharedGuardedCaptures(captures,stage.row);
    captures.length=0;
    return {...stage,row:{...stage.row,observedInferenceControls:controls,inspections,
      boundsVerified:sharedGuardedStageBounds(stage.row),
      wireVerified:controls.length?sharedGuardedWireVerified(variant,controls):stage.row.retainedReplayWithoutLiveRepair,
      proposalPrompts:controls.filter(c=>c.localProposalCount>0).length}};
  };
  for(const [index,task] of taskSet.entries()){
    if(Date.now()>=globalDeadline){initialResults.push({id:task.id,variant:"SHARED_INITIAL",state:"BLOCKED_GLOBAL_BUDGET"});continue;}
    const common=await run(task,"SHARED_INITIAL",155000);initialResults.push(common.row);
    console.log(`NYX_REPRESENTATION_INITIAL ${JSON.stringify(common.row)}`);
    const armRows:any[]=[];
    for(const variant of (index%2?["V4_COVERAGE","V3_CONTROL"]:["V3_CONTROL","V4_COVERAGE"]) as ("V3_CONTROL"|"V4_COVERAGE")[]){
      const remaining=155000-common.row.usage.wallClockMs;
      if(!common.returnedSource||remaining<6000||Date.now()>=globalDeadline){
        const row={id:task.id,variant,state:!common.returnedSource?"NO_SHARED_VALID_CANDIDATE"
          :Date.now()>=globalDeadline?"BLOCKED_GLOBAL_BUDGET":"BLOCKED_CHARGED_ARM_BUDGET",accepted:false};
        armRows.push(row);results.push(row);continue;
      }
      const stage=await run(task,variant,remaining,common.returnedSource);
      const row={...stage.row,sharedInitialSourceDigest:contentHash(common.returnedSource),
        counterfactualChargedCalls:common.row.usage.physicalCalls+stage.row.usage.physicalCalls,
        counterfactualChargedTokens:common.row.usage.reportedTokens+stage.row.usage.reportedTokens,
        counterfactualChargedToolCalls:common.row.usage.toolCalls+stage.row.usage.toolCalls,
        counterfactualChargedPrivateScorerWork:common.row.privateScorerWorkUnits+stage.row.privateScorerWorkUnits,
        counterfactualChargedWallClockMs:common.row.usage.wallClockMs+stage.row.usage.wallClockMs};
      armRows.push(row);results.push(row);console.log(`NYX_REPRESENTATION_TASK ${JSON.stringify(row)}`);
    }
    const stable=(row:any)=>!!row?.usage&&!row.infrastructureFailure&&row.toolUsageComplete&&row.wireVerified&&row.boundsVerified
      &&row.usage.wallClockMs<=155000&&(row.counterfactualChargedWallClockMs??0)<=155000
      &&(row.counterfactualChargedToolCalls??0)<=5&&(row.counterfactualChargedCalls??0)<=2
      &&row.usage.unknownUsageCalls===0&&row.usage.providerFailures===0&&row.usage.retries===0;
    const control=armRows.find(r=>r.variant==="V3_CONTROL"),treatment=armRows.find(r=>r.variant==="V4_COVERAGE");
    const repairMatch=armRows.length===2&&armRows.every(stable)&&["physicalCalls","reportedTokens","toolWorkUnits"].every(key=>{
      const values=armRows.map(row=>row.usage[key]+(key==="toolWorkUnits"?row.privateScorerWorkUnits:0));
      return Math.max(...values)-Math.min(...values)<=0.1*Math.max(1,...values);
    });
    const pair={id:task.id,providerStable:stable(common.row)&&armRows.length===2&&armRows.every(stable),matchedRepairCompute:repairMatch,
      ...sharedGuardedPairAssessment({sourceDigest:common.returnedSource?contentHash(common.returnedSource):null,
        liveEvidenceClass:common.row.evidenceClass,stable:stable(common.row)},control,treatment,repairMatch),
      initialAccepted:common.row.accepted,initialFunctionalAccepted:common.row.functionalAccepted,
      outcomes:armRows.map(row=>({variant:row.variant,accepted:row.accepted,failureClass:row.failureClass??row.state}))};
    pairs.push(pair);console.log(`NYX_REPRESENTATION_PAIR ${JSON.stringify(pair)}`);
    common.returnedSource=null; // No source replay survives its bounded pair or enters persistent evidence.
  }
  const sourceUnchanged=theoryDigest(git("ls-files","-s"))===original&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain");
  const completeRows=[...initialResults,...results].filter(row=>row.usage);
  const usageTotals=Object.fromEntries(["logicalCalls","physicalCalls","reportedTokens","unknownUsageCalls","providerFailures","retries","toolCalls","toolWorkUnits"]
    .map(key=>[key,completeRows.reduce((n,row)=>n+row.usage[key],0)]));
  const report={schemaVersion:1,candidate,frozen,sourceDigests,tasks,freezeDigest,initialResults,results,pairs,sourceUnchanged,
    elapsedMs:Date.now()-began,stopReason:Date.now()>=globalDeadline?"GLOBAL_BUDGET":"PREDECLARED_TASKS_COMPLETE",
    firstAttemptAccounting:{selected:tasks.length,attempted:initialResults.filter(row=>row.usage?.physicalCalls>0).length,
      graded:initialResults.filter(row=>row.perIteration?.some((i:any)=>i.score?.failure!=="ARTIFACT_SCHEMA"&&i.score)).length,
      functionalAccepted:initialResults.filter(row=>row.functionalAccepted).length,qualityAccepted:initialResults.filter(row=>row.accepted).length},
    usageTotals,summary: ["V3_CONTROL","V4_COVERAGE"].map(variant=>{const rows=results.filter(row=>row.variant===variant);return{variant,
      selected:tasks.length,executed:rows.filter(row=>row.usage).length,accepted:rows.filter(row=>row.accepted).length,
      liveRepairs:rows.filter(row=>row.usage?.physicalCalls>0).length,repairedAccepted:rows.filter(row=>row.repairedAccepted).length,
      retainedCommonSuccesses:rows.filter(row=>row.retainedReplayWithoutLiveRepair&&row.accepted).length,
      proposalPrompts:rows.reduce((n,row)=>n+(row.proposalPrompts??0),0),resolvedSelections:rows.reduce((n,row)=>n+(row.guardedSelectionReceipts??[]).filter((r:any)=>r.outcome==="RESOLVED").length,0)};}),
    promotion:"NONE_REQUIRES_REPRODUCIBLE_FRESH_CONDITIONAL_GAINS_AND_UNSEEDED_REPLICATION",
    claimScope:SHARED_GUARDED_REPAIR_EPOCH.limitations};
  console.log(`NYX_REPRESENTATION_REPORT ${JSON.stringify(report)}`);
  await writeFile(join(process.env.RUNNER_TEMP??tmpdir(),`nyx-source-representation-${candidate}.json`),JSON.stringify(report,null,2)+"\n");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href)await runSharedGuardedRepairEpoch();
