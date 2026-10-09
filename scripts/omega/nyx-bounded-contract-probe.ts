import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { NyxNemotronEngineeringCognition, NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
  type NyxRepairCognitionRequest } from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NYX_BOUNDED_DECISION_SCHEMA_POLICY, NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY } from "../../src/lib/codelab/cognition/nyxDecisionRequiredSchema";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { R3BenchmarkRepositorySession, contentHash } from "./benchmarks/r3RepositorySession";
import { representationRepositoryFiles, type RepresentationTask } from "./benchmarks/sourceRepresentationTasks";
import { inferUsage } from "./benchmarks/nyxArcAdapter";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
  throw Error("bounded_contract_probe_requires_explicit_network_and_injected_secret");
const git = (...args: string[]) => execFileSync("git",args,{encoding:"utf8"}).trim();
const candidate = process.env.GITHUB_SHA || git("rev-parse","HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse","HEAD") || git("status","--porcelain"))
  throw Error("bounded_contract_probe_clean_candidate_required");
const sourceIdentity = theoryDigest(git("ls-files","-s"));
const lengthsOnly = process.env.NYX_LENGTH_CONTRACT_PROBE === "1";
const treatment = lengthsOnly ? "DECISION_REQUIRED_FIELDS_AND_LENGTHS" : "DECISION_REQUIRED_FIELDS_AND_BOUNDS";
const frozen = {version:lengthsOnly?"nyx-bounded-contract-probe/3":"nyx-bounded-contract-probe/2",model:"nvidia/nemotron-3-super-120b-a12b",
  temperature:0,reasoningEffort:"none",generationPolicy:lengthsOnly?NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY:NYX_BOUNDED_DECISION_SCHEMA_POLICY,
  maxOutputTokens:2048,maxPromptBytes:48000,providerTimeoutMs:65000,caseWallClockMs:80000,
  globalWallClockMs:540000,maxPhysicalCallsIncludingRetries:6,physicalCallsPerCase:1,
  maxDiagnosisCharacters:lengthsOnly?1500:256,maxCounterexamples:1,maxChanges:1,maxPatchBytes:4096,
  authority:"COGNITION_PROPOSAL_ONLY_NO_CANDIDATE_APPLICATION",defaultConfigurationChanged:false,
  benchmarkTasksUsed:false,provesUniversalHostedEnforcement:false,cognitivePromotion:false};
const cases = [
  {id:"EDIT",expectedDecision:"PROPOSE_EDIT",objective:
    "Implement transform(input) for an integer: return its successor input+1. Preserve the ESM export. Change only src/transform.mjs. No imports, processes, filesystem or network. Explain the invariant and at least one substantive counterexample within the stated bounds.",available:false},
  {id:"UNCERTAIN",expectedDecision:"NO_ACTION",objective:
    "Implement an integer adjustment using the organization's authoritative policy. That policy value is not in the supplied files and no additional evidence is available. Do not assume a value or change source without it. State the missing evidence and uncertainty within the stated bounds.",available:false},
  {id:"EVIDENCE",expectedDecision:"REQUEST_EVIDENCE",objective:
    "Implement an integer adjustment using the organization's authoritative policy. The policy file is listed as available evidence but has not been observed yet. Request that evidence before proposing a change; state the uncertainty within the stated bounds.",available:true},
] as const;
const sourcePaths = ["scripts/omega/nyx-bounded-contract-probe.ts","src/lib/codelab/cognition/nyxDecisionRequiredSchema.ts",
  "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts","src/lib/codelab/model/nvidiaNimProvider.ts",
  "scripts/omega/benchmarks/r3RepositorySession.ts","scripts/omega/benchmarks/sourceRepresentationTasks.ts"];
const sourceDigests = Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,contentHash(await readFile(path,"utf8"))])));
const began=Date.now(), globalDeadline=began+frozen.globalWallClockMs;
console.log(`NYX_BOUNDED_CONTRACT_FREEZE ${JSON.stringify({candidate,frozen,cases,sourceDigests,
  freezeDigest:theoryDigest({candidate,frozen,cases,sourceDigests})})}`);
// Shared parent budget cannot be renewed by creating another task scope.
let dispatched=0;
const base = NvidiaNimProvider.create({providerId:"NYX-BOUNDED-CONTRACT-DEVELOPMENT",model:frozen.model,
  authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes:64000,maxOutputTokens:frozen.maxOutputTokens,timeoutMs:frozen.providerTimeoutMs,
  transport:async(url,init)=>{
    if(String(url)!==NVIDIA_NIM_CHAT_COMPLETIONS_URL)throw Error("bounded_contract_endpoint_out_of_scope");
    const body=JSON.parse(String(init?.body));
    capturedSchema=body.response_format?.json_schema?.schema ?? null;
    dispatched++;
    const response=await fetch(url,init);
    if(response.ok)try {
      const decoded=await response.clone().json();
      capturedContent=typeof decoded.choices?.[0]?.message?.content==="string"?decoded.choices[0].message.content:null;
    }catch {captureDecodeFailed=true;}
    return response;
  }}).withHttpAttemptBudget(frozen.maxPhysicalCallsIncludingRetries,"WITHIN_SHARED_BUDGET");
let capturedSchema: unknown=null, capturedContent: string|null=null, captureDecodeFailed=false;
const results: Record<string,any>[]=[];
let rejectedBackend=false;
const ajv=new Ajv({allErrors:true,strictKeywords:true});
for(const [index, item] of cases.entries()) {
  const shapes = ["DECISION_REQUIRED_FIELDS",treatment] as const;
  for(const shape of index%2 ? [...shapes].reverse() : shapes) {
    if(Date.now()>=globalDeadline || rejectedBackend) {
      results.push({id:item.id,shape,state:rejectedBackend?"UNEXECUTED_BACKEND_REJECTED":"UNEXECUTED_GLOBAL_BUDGET"});continue;
    }
    const started=Date.now(), deadline=Math.min(globalDeadline,started+frozen.caseWallClockMs), dispatchedBefore=dispatched;
    const fixture: RepresentationTask={id:`BOUNDED-${item.id}`,tier:"DEVELOPMENT",domain:"INTERFACE_COMPATIBILITY",
      objective:item.objective,publicCases:[{input:3,expected:4}],privateCases:[]};
    const session=await R3BenchmarkRepositorySession.create({...representationRepositoryFiles(fixture),
      "src/policy.mjs":"export const adjustment = 1;\n"},candidate,deadline,frozen.maxPatchBytes);
    capturedSchema=null;capturedContent=null;captureDecodeFailed=false;
    let result: Awaited<ReturnType<NyxNemotronEngineeringCognition["proposeRepair"]>>|null=null;
    let cleanup: Awaited<ReturnType<R3BenchmarkRepositorySession["close"]>>|null=null;
    let infrastructureFailure=false, schemaAccepted: boolean|null=null, responseIntegrity: boolean|null=null;
    let schemaDigest: string|null=null;
    try {
      const baseline=await session.baseline();
      const request: NyxRepairCognitionRequest={schemaVersion:1,cognitionRequestId:`BOUNDED-${item.id}-${shape}`,
        objective:item.objective,observation:baseline.observation,
        files:baseline.prepared.files.filter(file=>file.relativePath!=="src/policy.mjs"),
        allowedMutationPaths:["src/transform.mjs"],availableEvidence:item.available?[{evidenceRef:"AVAILABLE:policy",
          kind:"FILE",relativePath:"src/policy.mjs",description:"Authoritative policy, not yet observed"}]:[],
        priorHypotheses:[],priorCognitionFailures:[],candidateQualityFeedback:null,
        sourceQualityConstraints:NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,allowedVerificationToolIds:["TEST"],
        maxChanges:frozen.maxChanges,maxPatchBytes:frozen.maxPatchBytes,maxDiagnosisCharacters:frozen.maxDiagnosisCharacters,
        maxCounterexamples:frozen.maxCounterexamples,observedAtEpochMs:Date.now(),deadlineEpochMs:deadline,
        signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()-2000))};
      const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"NYX-BOUNDED-CONTRACT-SHARED-COGNITION",
        provider:base.withHttpAttemptBudget(1,"WITHIN_SHARED_BUDGET"),maxPromptBytes:frozen.maxPromptBytes,
        maxOutputTokens:frozen.maxOutputTokens,sourceRepresentation:"LINES",comparisonInferencePolicy:"CONSTRAINED_JSON",
        comparisonReasoningControl:"SUPER_HOSTED_NATIVE",providerIntentShape:shape});
      result=await cognition.proposeRepair(request);
      if(capturedSchema) schemaDigest=theoryDigest(capturedSchema);
      if(capturedContent!==null) {
        responseIntegrity=contentHash(capturedContent)===result.evidence.modelResponseDigest;
        try {schemaAccepted=Boolean(ajv.compile(capturedSchema as object)(JSON.parse(capturedContent)));}
        catch {schemaAccepted=false;}
      }
      if(shape===treatment && [400,422].includes(result.evidence.modelStatusCode??0))
        rejectedBackend=true;
    }catch {infrastructureFailure=true;}finally {cleanup=await session.close();capturedContent=null;capturedSchema=null;}
    const expectedOutcome=item.expectedDecision==="PROPOSE_EDIT"?"PROPOSED":item.expectedDecision;
    const usage=result?inferUsage(result.evidence.modelEvidenceId==="NOT_INVOKED"?[]:[result.evidence]):null;
    const row={id:item.id,shape,state:result?.decision??"INFRASTRUCTURE_FAILURE",reason:result?.reason??"PROBE_THROW",
      expectedOutcome,observedCompatible:result?.decision===expectedOutcome && schemaAccepted===true && responseIntegrity===true
        && !infrastructureFailure && cleanup?.cleanupVerified===true && cleanup.sourceUnchanged,
      schemaAccepted,responseIntegrity,schemaDigest,captureDecodeFailed,infrastructureFailure,
      evidence:result?.evidence??null,usage,httpDispatches:dispatched-dispatchedBefore,
      accountingComplete:usage?.physicalCalls===dispatched-dispatchedBefore,
      wallClockMs:Date.now()-started,cleanup,
      diagnostics:result?.schemaDiagnostics??[],authorityGranted:result?.omegaAuthorityGranted??false};
    results.push(row);console.log(`NYX_BOUNDED_CONTRACT_CASE ${JSON.stringify(row)}`);
  }
}
const sourceUnchanged=sourceIdentity===theoryDigest(git("ls-files","-s")) && !git("status","--porcelain");
const bounded=results.filter(r=>r.shape===treatment);
const report={schemaVersion:1,candidate,frozen,cases,sourceDigests,results,sourceUnchanged,
  outcome:bounded.length===3&&bounded.every(r=>r.observedCompatible&&r.accountingComplete)?"OBSERVED_COMPATIBLE":"NOT_YET_VERIFIED",
  elapsedMs:Date.now()-began,selected:6,attempted:results.filter(r=>(r.httpDispatches??0)>0).length,
  logicalCalls:results.reduce((n,r)=>n+(r.usage?.logicalCalls??0),0),
  physicalCalls:dispatched,accountingComplete:results.every(r=>!r.evidence && !(r.httpDispatches??0) || r.accountingComplete),
  reportedTokens:results.reduce((n,r)=>n+(r.usage?.reportedTokens??0),0),
  unknownUsageCalls:results.reduce((n,r)=>n+(r.usage?.unknownUsageCalls??r.httpDispatches??0),0),
  evidence:"E4_HOSTED_RESPONSE_AND_E3_LOCAL_VALIDATION_ONLY",backendVersion:"UNKNOWN",
  limitations:["Three synthetic action shapes, not frontier reasoning or universal hosted enforcement",
    "JSON Schema character counts differ from local UTF-16; local enforcement remains authoritative",
    "Responses and schemas compared in process; not independent transport authentication"],
  rawContentPersisted:false,candidateApplied:false,benchmarkScore:null,cognitivePromotion:false};
await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-bounded-contract-${candidate}.json`),JSON.stringify(report,null,2));
console.log(`NYX_BOUNDED_CONTRACT_REPORT ${JSON.stringify(report)}`);
if(!sourceUnchanged || results.some(r=>r.authorityGranted || r.cleanup && (!r.cleanup.cleanupVerified||!r.cleanup.sourceUnchanged)))
  process.exitCode=1;
