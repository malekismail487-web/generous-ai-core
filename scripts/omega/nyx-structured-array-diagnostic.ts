import {execFileSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";

export const STRUCTURED_ARRAY_DIAGNOSTIC = Object.freeze({
  counts: [40,64], modes: ["PORTABLE_SCHEMA","EXPLICIT_BOUNDS","STRICT_LOCAL"],
  model: "nvidia/nemotron-3-ultra-550b-a55b", maxTokens: 2048, temperature: 0,
  maxLogicalCalls: 6, perRequestLifetimeMs: 90000, globalLifetimeMs: 480000,
  hypothesis: "Hosted structured generation may impose an implicit array-length limit when bounds are omitted.",
  falsification: "Unbounded schema consistently emits the requested longer arrays, or explicit bounds/local parsing do not remedy short output.",
  benchmarkQuestionsUsed: false, grantsAuthority: false, cognitiveGainClaim: false,
});
export function inspectDiagnosticArray(content: string|null,count: number) {
  try {
    if(content===null)throw Error("absent");const parsed: unknown=JSON.parse(content);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||Object.keys(parsed).length!==1
      ||!Object.hasOwn(parsed,"values"))throw Error("shape");
    const values=(parsed as {values: unknown}).values;
    if(!Array.isArray(values)||!values.every(Number.isSafeInteger))throw Error("values");
    return {schemaValid:true,observedCount:values.length,prefixCorrect:values.every((v,i)=>v===i),
      accepted:values.length===count&&values.every((v,i)=>v===i)};
  } catch {return {schemaValid:false,observedCount:null,prefixCorrect:false,accepted:false};}
}
export async function runStructuredArrayDiagnostic() {
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())
    throw Error("array_diagnostic_requires_injected_secret_and_explicit_network");
  const git=(...args: string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate=process.env.GITHUB_SHA||git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))
    throw Error("array_diagnostic_clean_candidate_required");
  const sourceBefore=theoryDigest(git("ls-files","-s"));const deadline=Date.now()+STRUCTURED_ARRAY_DIAGNOSTIC.globalLifetimeMs;
  const provider=NvidiaNimProvider.create({providerId:"NYX-STRUCTURED-ARRAY-DIAGNOSTIC",model:STRUCTURED_ARRAY_DIAGNOSTIC.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:12000,maxOutputTokens:STRUCTURED_ARRAY_DIAGNOSTIC.maxTokens,timeoutMs:45000});
  const results=[];
  for(const [index,count] of STRUCTURED_ARRAY_DIAGNOSTIC.counts.entries()) {
    const modes=index%2?["STRICT_LOCAL","EXPLICIT_BOUNDS","PORTABLE_SCHEMA"]:["PORTABLE_SCHEMA","EXPLICIT_BOUNDS","STRICT_LOCAL"];
    for(const mode of modes) {
      if(Date.now()>=deadline){results.push({count,mode,state:"BLOCKED_GLOBAL_BUDGET"});continue;}
      const schema={type:"object",properties:{values:{type:"array",items:{type:"integer"},
        ...(mode==="EXPLICIT_BOUNDS"?{maxItems:count}:{})}},required:["values"],additionalProperties:false};
      const started=Date.now();
      const completion=await provider.complete({schemaVersion:1,requestId:`ARRAY-${count}-${mode}`,
        messages:[{role:"system",content:"Return exactly one JSON object with the key values. This is a serialization diagnostic, not a reasoning benchmark."},
          {role:"user",content:`Return all integers from 0 through ${count-1} inclusive in order in values. Exactly ${count} values; do not abbreviate, omit or use ellipses.`}],
        maxTokens:STRUCTURED_ARRAY_DIAGNOSTIC.maxTokens,temperature:0,inferencePolicy:"CONSTRAINED_JSON",
        responseFormat:{type:"JSON_SCHEMA",name:"integer_sequence",schema},
        ...(mode==="STRICT_LOCAL"?{structuredOutputMode:"STRICT_LOCAL" as const}:{}),
        observedAtEpochMs:started,deadlineEpochMs:Math.min(deadline,started+STRUCTURED_ARRAY_DIAGNOSTIC.perRequestLifetimeMs)});
      const inspected=inspectDiagnosticArray(completion.content,count);
      const result={count,mode,decision:completion.decision,reason:completion.reason,finishReason:completion.finishReason,
        inspected,accepted:completion.decision==="COMPLETED"&&completion.finishReason==="stop"&&inspected.accepted,
        requestDigest:completion.evidence.requestDigest,responseDigest:completion.evidence.responseDigest,
        usage:completion.evidence.usage,delivery:completion.evidence.delivery,providerFailure:completion.evidence.failureCategory,
        wallClockMs:Date.now()-started,rawContentPersisted:false};
      results.push(result);console.log(`NYX_ARRAY_DIAGNOSTIC_CASE ${JSON.stringify(result)}`);
    }
  }
  const sourceUnchanged=sourceBefore===theoryDigest(git("ls-files","-s"))&&!git("status","--porcelain");
  const body={schemaVersion:1,candidate,frozen:STRUCTURED_ARRAY_DIAGNOSTIC,results,sourceUnchanged,
    interpretation:"E4_MECHANISTIC_SERIALIZATION_DIAGNOSTIC_NOT_CAPABILITY_COMPARISON",acceptanceUnchanged:true,grantsAuthority:false};
  const report={...body,reportDigest:theoryDigest(body)};
  await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-array-diagnostic-${candidate}.json`),JSON.stringify(report,null,2));
  console.log(`NYX_ARRAY_DIAGNOSTIC ${JSON.stringify(report)}`);
  if(!sourceUnchanged)process.exitCode=1;
  return report;
}
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/nyx-structured-array-diagnostic.ts"))await runStructuredArrayDiagnostic();
