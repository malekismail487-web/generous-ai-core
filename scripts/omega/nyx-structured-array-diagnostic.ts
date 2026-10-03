import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {inspectNyxSourceEmission} from "./nyx-source-emission-diagnostics";
import ts from "typescript";

/** Public, neutral copy probes. These are not engineering/benchmark solutions. */
export const SOURCE_LITERAL_PROBES = Object.freeze([
  {id:"PLAIN",lineEnding:"LF",lines:["export function probe() {","  return [0, 1, 2];","}"]},
  {id:"QUOTES_AND_ESCAPES",lineEnding:"LF",lines:["export function probe() {",
    '  const quote = "\\\"";',"  const slash = '\\\\';",'  const controls = "\\n\\r\\t";',
    "  return { quote, slash, controls };","}"]},
  {id:"REGEX_UNICODE_CRLF",lineEnding:"CRLF",lines:["export function probe(input) {",
    "  const pattern = /[\\\\\"']/gu;",'  const label = "Νύξ 雨 😀";',
    '  return `${label}:${input.replace(pattern, "_")}`;',"}"]},
] as const);
export const SOURCE_LITERAL_DIAGNOSTIC = Object.freeze({
  model:"nvidia/nemotron-3-ultra-550b-a55b",modes:["HOSTED_BOUNDED","STRICT_LOCAL"],
  maxTokens:2048,temperature:0,maxLogicalCalls:6,perRequestLifetimeMs:90000,globalLifetimeMs:480000,
  hypothesis:"Hosted structured generation corrupts source literals or escaping even when array bounds are explicit.",
  falsification:"Hosted bounded generation copies the neutral escape-rich programs exactly with valid syntax.",
  benchmarkQuestionsUsed:false,grantsAuthority:false,cognitiveGainClaim:false,
});
const probeTarget="src/probe.mjs";
/** Diagnostic only: ignores trivia and literal spelling, not AST structure or decoded values. */
export function sourceLiteralStructureDigest(source: string) {
  const file=ts.createSourceFile(probeTarget,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
  const visit=(node: ts.Node): unknown=>{
    const children=node.getChildren(file);
    const text=ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isIdentifier(node)
      ?node.text:children.length===0?node.getText(file):null;
    return {kind:node.kind,text,children:children.map(visit)};
  };
  return theoryDigest(visit(file));
}
export function sourceLiteralEnvelope(probe: (typeof SOURCE_LITERAL_PROBES)[number]) {
  return {changes:[{target:probeTarget,replacement:{lines:[...probe.lines] as string[],lineEnding:probe.lineEnding}}]};
}
export async function inspectSourceLiteral(content: string|null,finishReason: string|null,responseDigest: string|null,
  probe: (typeof SOURCE_LITERAL_PROBES)[number]) {
  const inspection=await inspectNyxSourceEmission({content,finishReason,providerResponseDigest:responseDigest,
    expectedTarget:probeTarget,representation:"LINES"});
  let exactEnvelope=false;let structuralComparison: "EXACT"|"TRIVIA_OR_LITERAL_SPELLING_ONLY"|"STRUCTURE_OR_LITERAL_VALUE_CHANGED"|"UNAVAILABLE"="UNAVAILABLE";
  try {
    const actual=JSON.parse(content??"");
    const change=actual.changes?.[0];const replacement=change?.replacement;
    exactEnvelope=!!actual&&typeof actual==="object"&&!Array.isArray(actual)&&Object.keys(actual).length===1
      &&Array.isArray(actual.changes)&&actual.changes.length===1&&!!change&&typeof change==="object"
      &&!Array.isArray(change)&&Object.keys(change).sort().join(",")==="replacement,target"
      &&change.target===probeTarget&&!!replacement&&typeof replacement==="object"&&!Array.isArray(replacement)
      &&Object.keys(replacement).sort().join(",")==="lineEnding,lines"&&replacement.lineEnding===probe.lineEnding
      &&Array.isArray(replacement.lines)&&replacement.lines.length===probe.lines.length
      &&replacement.lines.every((line: unknown,index: number)=>line===probe.lines[index]);
    if(exactEnvelope)structuralComparison="EXACT";
    else if(inspection.outcome==="SYNTACTICALLY_VALID"&&replacement&&Array.isArray(replacement.lines)
      &&replacement.lines.every((line: unknown)=>typeof line==="string")
      &&(replacement.lineEnding==="LF"||replacement.lineEnding==="CRLF")) {
      const actualSource=replacement.lines.join(replacement.lineEnding==="LF"?"\n":"\r\n");
      const expectedSource=probe.lines.join(probe.lineEnding==="LF"?"\n":"\r\n");
      structuralComparison=sourceLiteralStructureDigest(actualSource)===sourceLiteralStructureDigest(expectedSource)
        ?"TRIVIA_OR_LITERAL_SPELLING_ONLY":"STRUCTURE_OR_LITERAL_VALUE_CHANGED";
    }
  } catch { /* Deliberately classify malformed output; never repair it. */ }
  return {inspection,exactEnvelope,structuralComparison,accepted:exactEnvelope&&inspection.outcome==="SYNTACTICALLY_VALID"};
}

export async function runSourceLiteralDiagnostic() {
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())
    throw Error("source_literal_diagnostic_requires_injected_secret_and_explicit_network");
  const git=(...args: string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate=process.env.GITHUB_SHA||git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))
    throw Error("source_literal_diagnostic_clean_candidate_required");
  // Validate the independent copy oracle before spending any live calls.
  for(const probe of SOURCE_LITERAL_PROBES) {
    const content=JSON.stringify(sourceLiteralEnvelope(probe));
    if(!(await inspectSourceLiteral(content,"stop",createHash("sha256").update(content).digest("hex"),probe)).accepted)
      throw Error("source_literal_diagnostic_invalid_reference");
  }
  const sourceBefore=theoryDigest(git("ls-files","-s"));const deadline=Date.now()+SOURCE_LITERAL_DIAGNOSTIC.globalLifetimeMs;
  const provider=NvidiaNimProvider.create({providerId:"NYX-SOURCE-LITERAL-DIAGNOSTIC",model:SOURCE_LITERAL_DIAGNOSTIC.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:12000,maxOutputTokens:SOURCE_LITERAL_DIAGNOSTIC.maxTokens,timeoutMs:45000});
  const schema={type:"object",properties:{changes:{type:"array",maxItems:1,items:{type:"object",properties:{
    target:{type:"string",enum:[probeTarget]},replacement:{type:"object",properties:{
      lines:{type:"array",maxItems:128,items:{type:"string"}},lineEnding:{type:"string",enum:["LF","CRLF"]}},
    required:["lines","lineEnding"],additionalProperties:false}},required:["target","replacement"],additionalProperties:false}}},
    required:["changes"],additionalProperties:false};
  const results=[];
  for(const [index,probe] of SOURCE_LITERAL_PROBES.entries()) {
    const modes=index%2?["STRICT_LOCAL","HOSTED_BOUNDED"]:["HOSTED_BOUNDED","STRICT_LOCAL"];
    for(const mode of modes) {
      if(Date.now()>=deadline){results.push({id:probe.id,mode,state:"BLOCKED_GLOBAL_BUDGET"});continue;}
      const started=Date.now();
      const completion=await provider.complete({schemaVersion:1,requestId:`LITERAL-${probe.id}-${mode}`,
        messages:[{role:"system",content:"Copy the supplied JSON object exactly. Do not generate or fix code. Preserve every decoded string, escape, Unicode character, line and lineEnding. Return only JSON."},
          {role:"user",content:JSON.stringify(sourceLiteralEnvelope(probe))}],
        maxTokens:SOURCE_LITERAL_DIAGNOSTIC.maxTokens,temperature:0,inferencePolicy:"CONSTRAINED_JSON",
        responseFormat:{type:"JSON_SCHEMA",name:"source_literal_copy",schema},
        ...(mode==="STRICT_LOCAL"?{structuredOutputMode:"STRICT_LOCAL" as const}:{}),
        observedAtEpochMs:started,deadlineEpochMs:Math.min(deadline,started+SOURCE_LITERAL_DIAGNOSTIC.perRequestLifetimeMs)});
      const inspected=await inspectSourceLiteral(completion.content,completion.finishReason,completion.evidence.responseDigest,probe);
      const result={id:probe.id,mode,decision:completion.decision,reason:completion.reason,finishReason:completion.finishReason,
        inspected,accepted:completion.decision==="COMPLETED"&&inspected.accepted,
        requestDigest:completion.evidence.requestDigest,responseDigest:completion.evidence.responseDigest,
        usage:completion.evidence.usage,delivery:completion.evidence.delivery,providerFailure:completion.evidence.failureCategory,
        wallClockMs:Date.now()-started,rawContentPersisted:false};
      results.push(result);console.log(`NYX_SOURCE_LITERAL_CASE ${JSON.stringify(result)}`);
    }
  }
  const sourceUnchanged=sourceBefore===theoryDigest(git("ls-files","-s"))&&!git("status","--porcelain");
  const body={schemaVersion:1,candidate,frozen:SOURCE_LITERAL_DIAGNOSTIC,probeDigest:theoryDigest(SOURCE_LITERAL_PROBES),results,
    sourceUnchanged,interpretation:"E4_MECHANISTIC_SOURCE_COPY_DIAGNOSTIC_NOT_CODE_GENERATION_OR_CAPABILITY_COMPARISON",
    acceptanceUnchanged:true,grantsAuthority:false};
  const report={...body,reportDigest:theoryDigest(body)};
  await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-source-literal-diagnostic-${candidate}.json`),JSON.stringify(report,null,2));
  console.log(`NYX_SOURCE_LITERAL_DIAGNOSTIC ${JSON.stringify(report)}`);
  if(!sourceUnchanged)process.exitCode=1;
  return report;
}

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
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/nyx-structured-array-diagnostic.ts")) {
  if(process.env.NYX_SERIALIZATION_DIAGNOSTIC==="SOURCE_LITERALS")await runSourceLiteralDiagnostic();
  else if(!process.env.NYX_SERIALIZATION_DIAGNOSTIC)await runStructuredArrayDiagnostic();
  else throw Error("unsupported_serialization_diagnostic");
}
