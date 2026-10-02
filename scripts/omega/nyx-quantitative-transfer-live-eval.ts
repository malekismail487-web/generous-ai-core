import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {runNyxQuantitativeTask,type QuantitativeArm,type QuantitativeRun} from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {QUANTITATIVE_EPOCH,QUANTITATIVE_TASKS,QUANTITATIVE_CORPUS_DIGEST,verifyQuantitativeSubmission} from "./nyx-quantitative-transfer-fixtures";
import {FRESH_QUANTITATIVE_EPOCH,FRESH_QUANTITATIVE_TASKS,FRESH_QUANTITATIVE_CORPUS_DIGEST,verifyFreshQuantitativeSubmission} from "./nyx-quantitative-fresh-fixtures";
import {SLOT_TRANSFER_EPOCH,SLOT_TRANSFER_TASKS,SLOT_TRANSFER_CORPUS_DIGEST,verifySlotTransferSubmission} from "./nyx-quantitative-slot-transfer-fixtures";

const fresh=process.env.NYX_QUANTITATIVE_FRESH==="1";
const slotTransfer=process.env.NYX_QUANTITATIVE_SLOT_TRANSFER==="1";
const EPOCH=slotTransfer?SLOT_TRANSFER_EPOCH:fresh?FRESH_QUANTITATIVE_EPOCH:QUANTITATIVE_EPOCH;
const TASKS=slotTransfer?SLOT_TRANSFER_TASKS:fresh?FRESH_QUANTITATIVE_TASKS:QUANTITATIVE_TASKS;
const CORPUS_DIGEST=slotTransfer?SLOT_TRANSFER_CORPUS_DIGEST:fresh?FRESH_QUANTITATIVE_CORPUS_DIGEST:QUANTITATIVE_CORPUS_DIGEST;
const verify=slotTransfer?verifySlotTransferSubmission:fresh?verifyFreshQuantitativeSubmission:verifyQuantitativeSubmission;

if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_QUANTITATIVE_TRANSFER: BLOCKED_AUTHORITY_OR_MISSING_INJECTED_SECRET");process.exit(2);
}
const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
const candidate=process.env.GITHUB_SHA?.trim()||git("rev-parse","HEAD");
if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))throw Error("clean_candidate_checkout_required");
const sourceBefore=theoryDigest({index:git("ls-files","-s"),status:git("status","--porcelain")});
const model=process.env.NVIDIA_NIM_MODEL?.trim()||"nvidia/nemotron-3-ultra-550b-a55b";
const provider=NvidiaNimProvider.create({providerId:"NYX-QUANTITATIVE-TRANSFER",model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",
  credentialSource:nvidiaNimCredentialFromEnvironment(process.env),maxPromptBytes:32000,
  maxOutputTokens:EPOCH.maxOutputTokensPerCall,timeoutMs:120000});
const began=Date.now();const expires=began+EPOCH.maxWallClockMs;
const ARMS:readonly QuantitativeArm[]=["CURRENT_DIRECT","REASONING_MEDIUM","REASONING_WITH_WORKBENCH"];
const results:QuantitativeRun[]=[];
// Rotate order across tasks; no parallel dispatch or selective task omission after failures.
for(let index=0;index<TASKS.length;index++) for(let offset=0;offset<ARMS.length;offset++) {
  const task=TASKS[index];const arm=ARMS[(offset+index)%ARMS.length];
  if(Date.now()>=expires) break;
  const result=await runNyxQuantitativeTask({arm,...task,
    limits:{maxCalls:EPOCH.maxCallsPerTask,maxOutputTokens:EPOCH.maxOutputTokensPerCall,maxTaskMs:EPOCH.maxTaskMs,
      expiresAtEpochMs:expires,maxToolRequests:EPOCH.maxToolRequests,maxToolWorkUnits:EPOCH.maxToolWorkUnits,maxToolElapsedMs:EPOCH.maxToolElapsedMs},
    complete:request=>provider.complete(request),verify:certificate=>verify(task,certificate)});
  results.push(result);
  console.log(`NYX_QUANTITATIVE_TASK ${JSON.stringify({taskId:task.taskId,arm,outcome:result.outcome,calls:result.calls,
    reportedTokens:result.attempts.reduce((n,a)=>n+(a.modelEvidence.usage.totalTokens??0),0),toolWorkUnits:result.toolWorkUnits,elapsedMs:result.elapsedMs})}`);
}
const summaries=ARMS.map(arm=>{
  const selected=results.filter(r=>r.arm===arm);const attempts=selected.flatMap(r=>r.attempts);
  const submitted=attempts.filter(a=>a.confidence!==null);
  return {arm,executed:selected.length,accepted:selected.filter(r=>r.accepted).length,
    firstCallAccepted:selected.filter(r=>r.attempts[0]?.outcome==="ACCEPTED").length,
    firstSubmissionAccepted:selected.filter(r=>r.attempts.find(a=>a.confidence!==null)?.outcome==="ACCEPTED").length,
    calls:attempts.length,reportedTokens:attempts.reduce((n,a)=>n+(a.modelEvidence.usage.totalTokens??0),0),
    unknownUsageCalls:attempts.filter(a=>a.modelEvidence.usage.totalTokens===null).length,
    providerFailures:attempts.filter(a=>a.outcome==="PROVIDER_FAILURE").length,
    recoveredProviderDisruptions:attempts.reduce((n,a)=>n+(a.modelEvidence.delivery?.rateLimitedResponses??0)
      +(a.modelEvidence.delivery?.transientUnavailableResponses??0)+(a.modelEvidence.delivery?.timedOutAttempts??0),0),
    truncations:attempts.filter(a=>a.outcome==="TRUNCATION").length,
    protocolOrAuthorizationFailures:attempts.filter(a=>/REJECTION/.test(a.outcome)&&!["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome)).length,
    certificateSchemaRejections:attempts.filter(a=>a.outcome==="CERTIFICATE_SCHEMA_REJECTION").length,
    functionalRejections:attempts.filter(a=>a.outcome==="FUNCTIONAL_REJECTION").length,
    verifierTriggeredRevisions:selected.reduce((n,r)=>n+r.attempts.filter((a,i)=>i>0&&["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(r.attempts[i-1].outcome)).length,0),
    repairDepth:selected.map(r=>({taskId:r.taskId,rejectedSubmissions:r.attempts.filter(a=>["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome)).length})),
    toolRequests:selected.reduce((n,r)=>n+r.toolRequests,0),toolWorkUnits:selected.reduce((n,r)=>n+r.toolWorkUnits,0),
    toolElapsedMs:selected.reduce((n,r)=>n+r.toolElapsedMs,0),elapsedMs:selected.reduce((n,r)=>n+r.elapsedMs,0),
    submittedCandidateBrierScore:submitted.length?submitted.reduce((n,a)=>n+(a.confidence!-Number(a.outcome==="ACCEPTED"))**2,0)/submitted.length:null};
});
const reasoning=summaries[1];const workbench=summaries[2];
const complete=results.length===TASKS.length*ARMS.length;
const stable=summaries.every(s=>s.providerFailures===0&&s.recoveredProviderDisruptions===0&&s.unknownUsageCalls===0);
const nativeAdvantage=complete&&stable&&workbench.accepted>reasoning.accepted&&workbench.reportedTokens<=reasoning.reportedTokens;
const sourceAfter=theoryDigest({index:git("ls-files","-s"),status:git("status","--porcelain")});
if(sourceAfter!==sourceBefore) throw Error("source_repository_changed_during_evaluation");
const sources=["src/lib/codelab/research/analysisArtifactReference.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/exactQuantitativeDerivation.ts",
  "src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/model/nvidiaNimProvider.ts",
  "src/lib/codelab/model/nvidiaCapacity.ts","src/lib/codelab/research/theoryContracts.ts",
  "scripts/omega/nyx-quantitative-transfer-fixtures.ts","scripts/omega/nyx-quantitative-fresh-fixtures.ts","scripts/omega/nyx-quantitative-slot-transfer-fixtures.ts","scripts/omega/nyx-quantitative-transfer-live-eval.ts"];
const report={schemaVersion:1,chunkId:EPOCH.chunkId,candidate,model,epoch:EPOCH,corpusDigest:CORPUS_DIGEST,
  sourceDigests:Object.fromEntries(sources.map(path=>[path,theoryDigest(readFileSync(path,"utf8"))])),
  executionIdentity:process.env.GITHUB_RUN_ID??"LOCAL_AUTHORIZED_RUN",environment:{platform:process.platform,node:process.version},
  startedAtEpochMs:began,finishedAtEpochMs:Date.now(),complete,providerStable:stable,summaries,results,
  verdict:!complete||!stable?"INCONCLUSIVE_PROVIDER_OR_BUDGET":nativeAdvantage?"NARROW_EXACT_DERIVATION_ADVANTAGE_REPLICATION_REQUIRED":"NO_COMPUTE_DEFENSIBLE_ACCEPTANCE_ADVANTAGE",
  pairs:TASKS.map(task=>({taskId:task.taskId,outcomes:ARMS.map(arm=>({arm,
    result:results.find(r=>r.taskId===task.taskId&&r.arm===arm)?.outcome??"NOT_EXECUTED"}))})),
  identicalModel:true,identicalTaskSet:true,identicalOracle:true,matchedCallAndOutputTokenCeilings:true,
  matchedRealizedCompute:false,nativeWorkMustBeAccountedSeparately:true,toolAblation:"MEDIUM_REASONING_WITH_VS_WITHOUT_EXACT_IR",
  reasoningConfigurationAblation:"CURRENT_DIRECT_VS_MEDIUM_REASONING",frozenBeforeLive:true,
  independentEvidenceClass:"E3_INDEPENDENT_DOMAIN_ALGORITHMS_NOT_EXTERNAL_INSTITUTION",liveEvidenceClass:"E4",
  calibrationScope:"DESCRIPTIVE_DEPENDENT_SUBMISSIONS_FOUR_TASKS_NOT_GENERAL_CALIBRATION",
  falseAcceptanceEvidence:"NEGATIVE_ORACLE_CONTROLS_LOCAL_ONLY_NOT_EXTERNALLY_MEASURED",
  sourceBefore,sourceAfter,sourceRepositoryUnchanged:true,
  populationScope:fresh?"FRESH_MODEL_UNSEEN_PARAMETERS_EXISTING_FAMILIES_AFTER_PROTOCOL_REPAIR_NOT_PRIVATE_INSTITUTIONAL_HOLDOUT"
    :"FRESH_MODEL_UNSEEN_PUBLIC_DEVELOPER_AUTHORED_FINITE_TASKS_NOT_PRIVATE_INSTITUTIONAL_HOLDOUT",
  security:{credentialPersisted:false,rawReasoningPersisted:false,generalNetworkAuthority:false,
    shellAuthority:false,repositoryMutation:false,productionAuthority:false},broadPromotion:false};
await writeFile(join(process.env.RUNNER_TEMP??tmpdir(),`nyx-quantitative-transfer-${candidate.slice(0,12)}.json`),`${JSON.stringify(report,null,2)}\n`,{encoding:"utf8",mode:0o600});
console.log(`NYX_QUANTITATIVE_TRANSFER_REPORT ${JSON.stringify(report)}`);
console.log(`NYX_QUANTITATIVE_TRANSFER_SUMMARY verdict=${report.verdict}`);
