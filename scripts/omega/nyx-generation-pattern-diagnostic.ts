import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { nyxInformativeProviderStringSchema } from "../../src/lib/codelab/cognition/nyxDecisionRequiredSchema";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash } from "./benchmarks/r3RepositorySession";
import { inferUsage } from "./benchmarks/nyxArcAdapter";

// Development-only differential diagnosis. No benchmark prompts/answers, cognition
// success claim, candidate execution, output repair, fallback, or authority change.
const historicalVariants = [
  { id: "SEARCH_PATTERN", string: { type: "string", minLength: 8, maxLength: 64, pattern: "\\S" } },
  { id: "WHOLE_STRING_PATTERN", string: { type: "string", minLength: 8, maxLength: 64,
    pattern: "^[\\s\\S]*\\S[\\s\\S]*$" } },
  { id: "LENGTH_ONLY_CONTROL", string: { type: "string", minLength: 8, maxLength: 64 } },
] as const;
const escapes = process.env.NYX_PATTERN_ESCAPES === "1";
const repair = process.env.NYX_PATTERN_REPAIR === "1" || escapes;
const variants = repair ? [historicalVariants[2], {id:"BOUNDED_PREFIX_PATTERN",
  string:nyxInformativeProviderStringSchema({type:"string",minLength:8,maxLength:64})}] : historicalVariants;
const sentenceCases = [
  { id: "INPUT_READER", prompt: "Give three distinct short sentences describing different failure risks for an input reader." },
  { id: "MEASUREMENT", prompt: "Give three distinct short sentences describing different measurement errors in a simulation." },
] as const;
const escapeCases = [
  {id:"QUOTES_SLASH_LF",expected:["The label is \"alpha\".","A literal slash is \\.","The next word follows:\nnext."]},
  {id:"CRLF_PATH_TAB",expected:["A CRLF follows:\r\nnext.","A path is C:\\work\\task.","A tab separates:\twords."]},
].map(item=>({...item,prompt:"Copy exactly these three JSON string values into the items array, in order; do not paraphrase: "+JSON.stringify(item.expected)}));
const cases = escapes ? escapeCases : sentenceCases;
const schema = (string: object) => ({ type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", minItems: 3, maxItems: 3, items: string } } });
function shape(value: unknown) {
  const items = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).items : null;
  if (!Array.isArray(items) || items.some(item => typeof item !== "string")) return null;
  return { count: items.length, codePointLengths: items.map(item => [...item].length),
    utf16Lengths: items.map(item => item.length), nonWhitespace: items.map(item => Boolean(item.trim())),
    distinctTrimmed: new Set(items.map(item => item.trim())).size };
}
const ajv = new Ajv({ allErrors: true, strictKeywords: true });
const validators = variants.map(variant => ajv.compile(schema(variant.string)));
// Confirm local standards semantics and that only safe shape metadata can escape.
for (const validate of validators) {
  if (!validate({items:["Risk one.","Risk two.","Risk three."]})
    || validate({items:["a","b","c"]}) || validate({items:["x".repeat(65),"Risk two.","Risk three."]}))
    throw Error("pattern_diagnostic_local_schema_invalid");
}
if (JSON.stringify(shape({items:["private text one","private text two","private text three"]})).includes("private")
  || shape({items:[1]}) !== null) throw Error("pattern_diagnostic_sanitization_invalid");
if (process.argv.includes("--self-test")) {
  console.log("NYX_GENERATION_PATTERN_SELF_TEST PASSED");
} else {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("pattern_diagnostic_requires_explicit_network_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate = process.env.GITHUB_SHA || git("rev-parse","HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse","HEAD") || git("status","--porcelain"))
    throw Error("pattern_diagnostic_clean_candidate_required");
  const sourceIdentity = theoryDigest(git("ls-files","-s"));
  const frozen = { version:escapes?"nyx-generation-pattern-diagnostic/3":repair?"nyx-generation-pattern-diagnostic/2":"nyx-generation-pattern-diagnostic/1",
    model:"nvidia/nemotron-3-super-120b-a12b",
    temperature:0,reasoningEffort:"none",maxOutputTokens:512,providerTimeoutMs:65000,
    caseWallClockMs:80000,globalWallClockMs:540000,maxPhysicalCallsIncludingRetries:cases.length*variants.length,
    physicalCallsPerCase:1,backendVersion:"UNKNOWN",candidateApplied:false,benchmarkTasksUsed:false,
    rawContentPersisted:false,cognitivePromotion:false,defaultConfigurationChanged:false };
  const sourcePaths = ["scripts/omega/nyx-generation-pattern-diagnostic.ts","src/lib/codelab/cognition/nyxDecisionRequiredSchema.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts","scripts/omega/benchmarks/nyxArcAdapter.ts"];
  const sourceDigests = Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,contentHash(await readFile(path,"utf8"))])));
  const started = Date.now(), globalDeadline = started + frozen.globalWallClockMs;
  console.log(`NYX_GENERATION_PATTERN_FREEZE ${JSON.stringify({candidate,frozen,cases,variants,sourceDigests,
    digest:theoryDigest({candidate,frozen,cases,variants,sourceDigests})})}`);
  let dispatched = 0;
  const provider = NvidiaNimProvider.create({providerId:"NYX-GENERATION-PATTERN-DIAGNOSTIC",model:frozen.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:8000,maxOutputTokens:frozen.maxOutputTokens,timeoutMs:frozen.providerTimeoutMs,
    transport:async(url,init)=>{
      if(String(url)!==NVIDIA_NIM_CHAT_COMPLETIONS_URL) throw Error("pattern_endpoint_out_of_scope");
      dispatched++; return fetch(url,init);
    }}).withHttpAttemptBudget(frozen.maxPhysicalCallsIncludingRetries,"WITHIN_SHARED_BUDGET");
  const results: Record<string, any>[] = [];
  for (const [index,item] of cases.entries()) for (const variant of index%2 ? [...variants].reverse() : variants) {
    if (Date.now()>=globalDeadline) {
      results.push({id:item.id,variant:variant.id,state:"UNEXECUTED_GLOBAL_BUDGET"}); continue;
    }
    const began = Date.now(), deadline = Math.min(globalDeadline,began+frozen.caseWallClockMs), before = dispatched;
    const wireSchema = schema(variant.string);
    const result = await provider.withHttpAttemptBudget(1,"WITHIN_SHARED_BUDGET").complete({schemaVersion:1,
      requestId:`PATTERN-${item.id}-${variant.id}`,messages:[{role:"system",content:
        "Return only JSON {items:[three distinct sentences]}. Each sentence must contain information, at least eight and at most 64 characters. No tools or code execution."},
        {role:"user",content:item.prompt}],maxTokens:frozen.maxOutputTokens,temperature:0,
      responseFormat:{type:"JSON_SCHEMA",name:"nyx_pattern_diagnostic",schema:wireSchema},
      inferencePolicy:"CONSTRAINED_JSON",reasoningControl:"SUPER_HOSTED_NATIVE",observedAtEpochMs:began,
      deadlineEpochMs:deadline,signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});
    let metadata: ReturnType<typeof shape> = null, localSchemaAccepted: boolean|null = null,
      exactCopyAccepted: boolean|null = null, parseErrorPosition: number|null = null;
    if (result.content !== null) try {
      const decoded: unknown = JSON.parse(result.content);
      metadata = shape(decoded); localSchemaAccepted = Boolean(ajv.compile(wireSchema)(decoded));
      if ("expected" in item) exactCopyAccepted = JSON.stringify((decoded as {items?:unknown}).items)===JSON.stringify(item.expected);
    } catch (error) {
      localSchemaAccepted = false;
      if ("expected" in item) exactCopyAccepted = false;
      // Numeric parser location only: exception text can contain raw generated content.
      const match=error instanceof SyntaxError?/\bposition (\d+)\b/.exec(error.message):null;
      parseErrorPosition=match?Number(match[1]):null;
    }
    const usage = inferUsage([{modelEvidenceId:result.evidence.networkAttempted?result.evidence.evidenceId:"NOT_INVOKED",
      modelUsage:result.evidence.usage,delivery:result.evidence.delivery,providerFailureCategory:result.evidence.failureCategory}]);
    usage.wallClockMs = Date.now()-began;
    const row = {id:item.id,variant:variant.id,state:result.decision,status:result.evidence.statusCode,
      reason:result.reason,finishReason:result.finishReason,localSchemaAccepted,shape:metadata,
      exactCopyAccepted,parseErrorPosition,
      substantiveDistinct:localSchemaAccepted===true && metadata?.distinctTrimmed===3 && metadata.nonWhitespace.every(Boolean),
      schemaDigest:theoryDigest(wireSchema),evidence:result.evidence,usage,httpDispatches:dispatched-before,
      accountingComplete:usage.physicalCalls===dispatched-before,authorityGranted:result.executorAuthorityGranted};
    results.push(row); console.log(`NYX_GENERATION_PATTERN_CASE ${JSON.stringify(row)}`);
    // Generated text remains in memory only for classification; never write it or private reasoning.
  }
  const sourceUnchanged = sourceIdentity===theoryDigest(git("ls-files","-s")) && !git("status","--porcelain");
  const report = {schemaVersion:1,candidate,frozen,cases,variants,sourceDigests,results,sourceUnchanged,
    elapsedMs:Date.now()-started,selected:cases.length*variants.length,physicalCalls:dispatched,
    reportedTokens:results.reduce((n,r)=>n+(r.usage?.reportedTokens??0),0),
    unknownUsageCalls:results.reduce((n,r)=>n+(r.usage?.unknownUsageCalls??0),0),
    evidence:"E4_HOSTED_DELIVERY_AND_E3_INDEPENDENT_SCHEMA_VALIDATION",benchmarkScore:null,
    authorityGranted:false,cognitivePromotion:false,rawContentPersisted:false};
  await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-generation-pattern-${candidate}.json`),JSON.stringify(report,null,2));
  console.log(`NYX_GENERATION_PATTERN_REPORT ${JSON.stringify(report)}`);
  if (!sourceUnchanged || results.some(r=>r.authorityGranted || r.accountingComplete===false)) process.exitCode=1;
}
