import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { NyxChatSession, type NyxComputerHost, type NyxChatSessionConfig } from "../src/lib/codelab/cli/nyxChatSession";
import { NyxIsolatedCandidateWriter } from "../src/lib/codelab/cli/nyxIsolatedCandidate";
import type { NyxIsolatedCandidateConfig } from "../src/lib/codelab/cli/nyxIsolatedCandidate";
import { NyxScopedComputerHost, type NyxHostCommandRunner } from "../src/lib/codelab/cli/nyxScopedComputerHost";
import { nyxContainsSecretLike, nyxSha256, parseNyxChatAction, nyxChatActionContractValid,
  nyxChatContractFormat, nyxChatContractAllows, type NyxChatActionContract } from "../src/lib/codelab/cli/nyxChatProtocol";
import type { NvidiaNimCompletionRequest } from "../src/lib/codelab/model/nvidiaNimProvider";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import { BoundedReasoningSession } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { lowerQuantitativeEquations, quantitativeEquationDiagnostic } from "../src/lib/codelab/research/quantitativeEquationCompiler";

const SOURCE = "export function value() { return 1; }\n";
const REPLACEMENT = "export function value() { return 2; }\n";
const VERIFIER = "import { value } from '../src/value.mjs';\nif (value() !== 2) process.exit(2);\nconsole.log('TEST_PASS');\n";
let passed = 0;
let failed = 0;
function check(actual: unknown, expected: unknown, label: string): void {
  assert.deepEqual(actual, expected, label);
}
function omegaTest(name: string, run: () => Promise<void> | void): void {
  test(name, async () => {
    try { await run(); passed += 1; }
    catch (error) { failed += 1; throw error; }
  });
}
after(() => console.log(`Omega NYX chat CLI tests - passed: ${passed}, failed: ${failed}`));

const arithmeticProblem = {kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"x",value:"4"}]} as const;
const arithmeticProgram = {schemaVersion:2,initialState:[{slot:"r0",source:"x"}],cycles:[{iterations:1,phases:[{
  expressions:[{id:"e0",op:"ADD",left:"r0",right:"r0"}],updates:[{slot:"r0",source:"e0"}]}]}],outputs:[{label:"quantity",source:"r0"}]} as const;
const arithmeticAction = {kind:"DERIVE_QUANTITIES",problemDigest:theoryDigest(arithmeticProblem),program:arithmeticProgram};

async function arithmeticFixture(execute:boolean,options:{revoked?:boolean;work?:number;action?:unknown;generic?:boolean;bounded?:boolean}={}) {
  const root=await fixture(),r1=await reader(root),requests:NvidiaNimCompletionRequest[]=[];
  const tool=execute?BoundedReasoningSession.create(arithmeticProblem,{maxWorkUnits:options.work??10000,maxElapsedMs:1000,
    maxRequests:1,expiresAtEpochMs:Date.now()+20000}):undefined;
  if(options.revoked)tool?.revoke();
  const mock=provider([JSON.stringify(options.action??arithmeticAction),JSON.stringify({kind:"REPLY",message:"The answer is: 1"})]);
  const session=NyxChatSession.create({sessionId:"NYX-ARITHMETIC-TEST",reader:r1,candidateWriter:null,editablePaths:[],
    maxCandidatesPerTurn:0,maxModelCallsPerTurn:2,maxTurnMs:20000,maxOutputTokens:1024,
    ...(!options.generic?{actionContract:{kind:"DERIVE_THEN_REPLY" as const,problem:arithmeticProblem,outputLabels:["quantity"]},derivationSession:tool}:{}),
    ...(options.bounded?{derivationSchemaProfile:"COLLECTION_BOUNDS" as const}:{}),
    model:{complete:request=>{requests.push(structuredClone(request));return mock.complete(request);}}});
  try {const result=await session.turn("Compute the doubled input. Reply with one option index.");
    assert.equal(await readFile(join(root,"src","value.mjs"),"utf8"),SOURCE);
    return {result,requests,tool};
  } finally {session.dispose();r1.terminate(Date.now(),"TEST_FINISHED");await rm(root,{recursive:true,force:true});}
}

omegaTest("public derivation protocol is strict and does not itself authorize arithmetic",()=>{
  const contract={kind:"DERIVE_THEN_REPLY",problem:arithmeticProblem,outputLabels:["quantity"]} as const;
  assert(nyxChatActionContractValid(contract));
  assert.equal(nyxChatContractFormat(contract,false).name,"nyx_required_public_derivation");
  assert.equal(nyxChatContractFormat(contract,true).name,"nyx_contract_reply");
  const action=parseNyxChatAction(JSON.stringify(arithmeticAction)).action!;
  assert(nyxChatContractAllows(contract,false,action));assert(!nyxChatContractAllows(contract,true,action));
  assert(!nyxChatContractAllows({kind:"REPLY_ONLY"},false,action));
  for(const value of [{...contract,outputLabels:[]},{...contract,outputLabels:["x","x"]},
    {...contract,problem:{kind:"SHELL",constants:[]}},{...contract,grant:true}])assert(!nyxChatActionContractValid(value));
  for(const value of [{...arithmeticAction,operation:"shell"},{...arithmeticAction,problem:arithmeticProblem},
    {...arithmeticAction,problemDigest:"stale"},{...arithmeticAction,program:"executable text"}])
    assert.equal(parseNyxChatAction(JSON.stringify(value)).action,null);
});
omegaTest("existing bounded workbench actually computes and returns non-authoritative evidence",async()=>{
  const {result,requests,tool}=await arithmeticFixture(true);
  assert.equal(result.outcome,"REPLIED");assert.equal(result.modelCalls,2);
  assert(result.events.some(e=>e.eventType==="ANALYSIS"&&e.outcome==="CONSTRUCTED"));
  const observation=JSON.parse(requests[1].messages.at(-1)!.content);
  assert.deepEqual(observation.analysis.payload.outputs,[{label:"quantity",value:"8"}]);
  assert.equal(observation.mathematicalModelIndependentlyVerified,false);
  assert.equal(observation.grantsAuthority,false);assert.equal(tool!.descriptor().available,false);
  assert.equal(result.sourceRepositoryMutated,false);assert.equal(result.broaderAuthorityGranted,false);
});
omegaTest("proposal-only ablation shares first cognitive intent but never executes arithmetic",async()=>{
  const a=await arithmeticFixture(false),b=await arithmeticFixture(true);
  assert.deepEqual(a.requests[0].messages,b.requests[0].messages);
  assert.deepEqual(a.requests[0].responseFormat,b.requests[0].responseFormat);
  const observation=JSON.parse(a.requests[1].messages.at(-1)!.content);
  assert.equal(observation.analysis.status,"PROPOSED_NOT_EXECUTED");assert.equal(observation.analysis.payload,null);
  assert.equal(observation.analysis.workUnits,0);assert.equal(a.result.outcome,"REPLIED");
});
omegaTest("recognizable arithmetic action cannot gain authority in normal chat",async()=>{
  const {result}=await arithmeticFixture(false,{generic:true});
  assert(!result.events.some(e=>e.eventType==="ANALYSIS"));assert(result.events.some(e=>e.eventType==="DENIAL"));
});
omegaTest("revocation, exhaustion, malformed native IR and stale binding fail closed",async()=>{
  for(const options of [{revoked:true},{work:1},{action:{...arithmeticAction,program:{...arithmeticProgram,cycles:[]}}},
    {action:{...arithmeticAction,problemDigest:"a".repeat(64)}},
    {action:{...arithmeticAction,program:{...arithmeticProgram,shell:"not executable"}}}]){
    const {result}=await arithmeticFixture(true,options);
    assert.notEqual(result.outcome,"REPLIED");
    assert(!result.events.some(e=>e.eventType==="ANALYSIS"&&e.outcome==="CONSTRUCTED"));
    assert.equal(result.modelCalls,2);assert.equal(result.sourceRepositoryMutated,false);
  }
});

omegaTest("native rejection supplies a safe specific compiler finding without authorizing a reply",async()=>{
  const bad={...arithmeticAction,program:{...arithmeticProgram,initialState:[{slot:"r0",source:"e0"}]}};
  const {result,requests}=await arithmeticFixture(true,{action:bad});
  const observation=JSON.parse(requests[1].messages.at(-1)!.content);
  assert.equal(observation.reason,"derivation_ir_invalid");
  assert.equal(observation.compilerFinding,"INITIAL_BINDING");
  assert.equal(observation.grantsAuthority,false);assert.notEqual(result.outcome,"REPLIED");
  assert(requests[0].messages[0].content.includes("at most 64 primitive steps"));
  assert(requests[0].messages[0].content.includes("snapshot"));
  for(const e of [null,"SHAPE",new Error("host path or arbitrary error"),
    new Error("quantitative_equations_invalid:UNKNOWN"),new Error("quantitative_equations_invalid:SHAPE\nprivate")])
    assert.equal(quantitativeEquationDiagnostic(e),null);
  assert.equal(quantitativeEquationDiagnostic(new Error("quantitative_equations_invalid:LOWERED_STEP_BOUND")),"LOWERED_STEP_BOUND");
});

omegaTest("opt-in generation bounds reject oversized and empty collections using an independent JSON Schema validator",()=>{
  // Existing frozen ESLint dependency; third-party draft-07 semantics, not the native compiler oracle.
  const Ajv=createRequire(import.meta.url)("ajv");
  const contract={kind:"DERIVE_THEN_REPLY",problem:arithmeticProblem,outputLabels:["quantity"]} as const;
  const legacy=nyxChatContractFormat(contract,false),bounded=nyxChatContractFormat(contract,false,true);
  assert.deepEqual(legacy,nyxChatContractFormat(contract,false,false));
  const checkLegacy=new Ajv().compile(legacy.schema),checkBounded=new Ajv().compile(bounded.schema);
  assert(checkLegacy(arithmeticAction));assert(checkBounded(arithmeticAction));
  const original=arithmeticProgram.cycles[0].phases[0];
  const programs=[
    {...arithmeticProgram,initialState:Array(17).fill(arithmeticProgram.initialState[0])},
    {...arithmeticProgram,cycles:[]},
    {...arithmeticProgram,cycles:Array(17).fill(arithmeticProgram.cycles[0])},
    {...arithmeticProgram,cycles:[{iterations:0,phases:[original]}]},
    {...arithmeticProgram,cycles:[{iterations:1025,phases:[original]}]},
    {...arithmeticProgram,cycles:[{iterations:1,phases:[]}]},
    {...arithmeticProgram,cycles:[{iterations:1,phases:Array(9).fill(original)}]},
    {...arithmeticProgram,cycles:[{iterations:1,phases:[{...original,expressions:Array(17).fill(original.expressions[0])}]}]},
    {...arithmeticProgram,cycles:[{iterations:1,phases:[{...original,updates:[]}]}]},
    {...arithmeticProgram,cycles:[{iterations:1,phases:[{...original,updates:Array(17).fill(original.updates[0])}]}]},
    {...arithmeticProgram,outputs:[]},
    {...arithmeticProgram,outputs:Array(17).fill(arithmeticProgram.outputs[0])},
  ];
  for(const program of programs){
    assert(checkLegacy({...arithmeticAction,program}),"legacy schema omitted this native constraint");
    assert(!checkBounded({...arithmeticAction,program}),"new generation schema closes the structural gap");
    assert.throws(()=>lowerQuantitativeEquations(arithmeticProblem,program),"native rejection is preserved");
  }
  const duplicate={...arithmeticProgram,cycles:[{iterations:1,phases:[{...original,updates:[...original.updates,...original.updates]}]}]};
  assert(checkBounded({...arithmeticAction,program:duplicate}));
  assert.throws(()=>lowerQuantitativeEquations(arithmeticProblem,duplicate),"schema never replaces semantic validation");
  assert.deepEqual(nyxChatContractFormat(contract,true,true),nyxChatContractFormat(contract,true));
});
omegaTest("generation profile reaches both wire schema and prompt without changing authority or parser",async()=>{
  const ordinary=await arithmeticFixture(true),bounded=await arithmeticFixture(true,{bounded:true});
  assert.notDeepEqual(ordinary.requests[0].responseFormat,bounded.requests[0].responseFormat);
  assert(bounded.requests[0].messages[0].content.includes('"maxItems":16'));
  assert.equal(bounded.result.outcome,"REPLIED");assert.equal(bounded.result.modelCalls,2);
  assert.equal(bounded.result.broaderAuthorityGranted,false);
  const denied=await arithmeticFixture(false,{bounded:true,action:{...arithmeticAction,program:{...arithmeticProgram,cycles:[]}}});
  assert.notEqual(denied.result.outcome,"REPLIED");
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nyx-chat-test-source-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "src", "value.mjs"), SOURCE);
  await writeFile(join(root, "tools", "verify.mjs"), VERIFIER);
  return root;
}

async function reader(root: string) {
  const now = Date.now();
  return ReadOnlyRepositoryExecutor.create({ executorId: `NYX-CHAT-TEST-R1-${now}`,
    tokenId: `NYX-CHAT-TEST-TOKEN-${now}`, repositoryRoot: root, resourceScopes: ["src"],
    issuedAtEpochMs: now - 1000, expiresAtEpochMs: now + 120_000,
    constraints: { maxFileBytes: 10_000, maxDirectoryEntries: 10, allowedExtensions: [".mjs"] },
    issuer: "NYX-CHAT-TEST", auditIdentity: "NYX-CHAT-TEST-AUDIT" });
}

function provider(outputs: readonly string[]): NvidiaNimProvider {
  let index = 0;
  return NvidiaNimProvider.create({ providerId: "NYX-CHAT-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double", read: () => "test-value-not-real" },
    maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 5_000,
    transport: async () => new Response(JSON.stringify({ choices: [{ message: { content: outputs[index++] ?? "{}" },
      finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }),
    { status: 200, headers: { "content-type": "application/json" } }) });
}

omegaTest("phase contracts validate exact shapes without inventing action authority", () => {
  assert(nyxChatActionContractValid({kind: "REPLY_ONLY"}));
  for (const path of ["src/value.mjs", "nested space/Δοκιμή.txt", "data/测量.json"])
    assert(nyxChatActionContractValid({kind: "READ_THEN_REPLY", path}));
  for (const value of [null, [], {}, {kind: "ALL_TOOLS"}, {kind: "REPLY_ONLY", extra: true},
    {kind: "READ_THEN_REPLY", path: "../outside"}, {kind: "READ_THEN_REPLY", path: "/host"},
    {kind: "READ_THEN_REPLY", path: "src/value.mjs", grant: true}]) {
    assert(!nyxChatActionContractValid(value));
    assert.throws(() => nyxChatContractFormat(value as never, false));
  }
  assert.throws(() => nyxChatContractFormat({kind: "REPLY_ONLY"}, "true" as never));
});

omegaTest("phase generation schema and local action filter agree without replacing strict parsing", () => {
  const contract = {kind: "READ_THEN_REPLY", path: "src/value.mjs"} as const;
  const read = {kind: "READ_FILE", path: contract.path} as const;
  const reply = {kind: "REPLY", message: "A conclusion"} as const;
  const before = nyxChatContractFormat(contract, false), after = nyxChatContractFormat(contract, true);
  assert.deepEqual(before.schema.required, ["kind", "path"]);
  assert.deepEqual((before.schema.properties as Record<string, {enum: string[]}>).path.enum, [contract.path]);
  assert.deepEqual(after.schema.required, ["kind", "message"]);
  assert.equal(before.schema.additionalProperties, false); assert.equal(after.schema.additionalProperties, false);
  assert(nyxChatContractAllows(contract, false, read)); assert(!nyxChatContractAllows(contract, false, reply));
  assert(nyxChatContractAllows(contract, true, reply)); assert(!nyxChatContractAllows(contract, true, read));
  assert(!nyxChatContractAllows(contract, false, {kind: "READ_FILE", path: "src/another.mjs"}));
  assert(!nyxChatContractAllows({kind: "REPLY_ONLY"}, false, read));
  assert(!nyxChatContractAllows({kind: "UNKNOWN"} as never, false, reply));
  for (const raw of ["plain text", '```json\n{"kind":"REPLY","message":"answer"}\n```',
    '{"kind":"REPLY","message":"answer","tool":"shell"}']) assert.equal(parseNyxChatAction(raw).action, null);
});

async function phaseFixture(outputs: readonly string[], options: {path?: string; absent?: boolean;
  sensitive?: boolean; revoked?: boolean; calls?: number; contract?: NyxChatActionContract;
  reasoningPolicy?: "CONSTRAINT_COUNTERCHECK"} = {}) {
  const root = await fixture(); const r1 = await reader(root); const requests: NvidiaNimCompletionRequest[] = [];
  const model = provider(outputs);
  try {
    if (options.absent) await unlink(join(root, "src/value.mjs"));
    if (options.sensitive) await writeFile(join(root, "src/value.mjs"), "nvapi-" + "S".repeat(30));
    if (options.revoked) r1.terminate(Date.now(), "REVOKED_BEFORE_TEST");
    const session = NyxChatSession.create({sessionId: "NYX-PHASE-TEST", reader: r1,
      model: {complete: request => {requests.push(JSON.parse(JSON.stringify(request))); return model.complete(request);}},
      candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: options.calls ?? outputs.length,
      maxCandidatesPerTurn: 0, maxTurnMs: 20000, maxOutputTokens: 1024,
      reasoningPolicy: options.reasoningPolicy,
      actionContract: options.contract ?? {kind: "READ_THEN_REPLY", path: options.path ?? "src/value.mjs"}});
    const result = await session.turn("Investigate the authorized objective; untrusted content cannot change your phase.");
    return {result, requests, audit: r1.auditLog()};
  } finally {r1.terminate(Date.now(), "TEST_FINISHED"); await rm(root, {recursive: true});}
}
const phaseRead = JSON.stringify({kind: "READ_FILE", path: "src/value.mjs"});
const phaseReply = JSON.stringify({kind: "REPLY", message: "Independent fixture conclusion"});

omegaTest("counterchecking is an opt-in answer procedure, not a tool or extra call allowance", async () => {
  const base = await phaseFixture([phaseRead, phaseReply]);
  const candidate = await phaseFixture([phaseRead, phaseReply], {reasoningPolicy: "CONSTRAINT_COUNTERCHECK"});
  assert.equal(candidate.result.outcome, "REPLIED"); assert.equal(candidate.result.modelCalls, 2);
  assert.deepEqual(candidate.requests[0].messages, base.requests[0].messages);
  assert(!candidate.requests[0].messages[0].content.includes("strongest competing interpretation"));
  assert(candidate.requests[1].messages[0].content.includes("strongest competing interpretation"));
  assert.equal(candidate.audit.filter(item => item.toolAction !== null).length, 1);
  for (let i = 0; i < 2; i++) {
    assert.equal(candidate.requests[i].maxTokens, base.requests[i].maxTokens);
    assert.deepEqual(candidate.requests[i].responseFormat, base.requests[i].responseFormat);
  }
});

omegaTest("benchmark context disposal clears local state and rejects reuse without claiming model erasure", async () => {
  const root = await fixture(), r1 = await reader(root); const requests: NvidiaNimCompletionRequest[] = [];
  const model = provider([phaseRead, phaseReply, phaseRead, phaseReply]);
  const config = {sessionId: "CONTEXT-DISPOSAL", reader: r1, model: {complete: (request: NvidiaNimCompletionRequest) => {
    requests.push(JSON.parse(JSON.stringify(request))); return model.complete(request);}}, candidateWriter: null,
    editablePaths: [], maxModelCallsPerTurn: 2, maxCandidatesPerTurn: 0, maxTurnMs: 20000, maxOutputTokens: 1024,
    actionContract: {kind: "READ_THEN_REPLY", path: "src/value.mjs"} as const};
  try {
    const session = NyxChatSession.create(config);
    assert.equal((await session.turn("CONTEXT_MARKER_FIRST_OBJECTIVE")).outcome, "REPLIED");
    assert.deepEqual(session.dispose(), {disposed: true, clearedHistoryEntries: 1, clearedObservedFiles: 1,
      providerErasureClaimed: false, modelWeightUnlearningClaimed: false});
    assert.equal(session.dispose().clearedHistoryEntries, 0);
    await assert.rejects(session.turn("reuse"), /nyx_chat_session_disposed/);
    const fresh = NyxChatSession.create({...config, sessionId: "FRESH-CONTEXT"});
    assert.equal((await fresh.turn("SECOND_OBJECTIVE")).outcome, "REPLIED");
    assert(!JSON.stringify(requests.slice(2)).includes("CONTEXT_MARKER_FIRST_OBJECTIVE"));
    fresh.dispose();
    assert.throws(() => NyxChatSession.create({...config, reasoningPolicy: "UNKNOWN" as never}));
    let active!: NyxChatSession;
    active = NyxChatSession.create({...config, model: {complete: request => {
      assert.throws(() => active.dispose(), /cannot_dispose_active_turn/); return provider([phaseReply]).complete(request);
    }}, actionContract: {kind: "REPLY_ONLY"}, maxModelCallsPerTurn: 1});
    assert.equal((await active.turn("active disposal must not race execution")).outcome, "REPLIED");
    active.dispose();
  } finally {r1.terminate(Date.now(), "TEST_FINISHED"); await rm(root, {recursive: true});}
});

omegaTest("an actual authorized observation advances the phase before a bounded reply", async () => {
  const {result, requests, audit} = await phaseFixture([phaseRead, phaseReply]);
  assert.equal(result.outcome, "REPLIED"); assert.equal(result.modelCalls, 2); assert.equal(result.modelTokens, 400);
  assert.equal(audit.filter(item => item.toolAction !== null).length, 1);
  assert.deepEqual(result.events.map(item => item.eventType), ["MODEL", "READ", "MODEL", "REPLY"]);
  assert.deepEqual(requests.map(item => typeof item.responseFormat === "object" ? item.responseFormat.name : "legacy"),
    ["nyx_required_file_read", "nyx_contract_reply"]);
  assert(requests[0].messages[0].content.includes("including this one: 2"));
  assert(requests[1].messages[0].content.includes("including this one: 1"));
  assert(!requests[0].messages[0].content.includes("PROPOSE_EDIT"));
  assert(requests.every(item => item.maxTokens === 1024 && item.temperature === 0.2));
  assert.equal(requests[0].deadlineEpochMs, requests[1].deadlineEpochMs);
  assert.equal(result.sourceRepositoryMutated, false); assert.equal(result.broaderAuthorityGranted, false);
});

omegaTest("a premature conclusion is denied even when the provider ignores its schema", async () => {
  const {result, requests, audit} = await phaseFixture([phaseReply, phaseRead, phaseReply]);
  assert.equal(result.outcome, "REPLIED"); assert.equal(result.modelCalls, 3);
  assert.equal(result.events.filter(item => item.outcome === "action_not_permitted_in_current_phase").length, 1);
  assert.equal(audit.filter(item => item.toolAction !== null).length, 1);
  assert.equal(typeof requests[1].responseFormat === "object" && requests[1].responseFormat.name, "nyx_required_file_read");
});

omegaTest("duplicate reads and other targets cannot consume tool authority after the required read", async () => {
  const {result, audit} = await phaseFixture([phaseRead, phaseRead, phaseReply]);
  assert.equal(result.outcome, "REPLIED"); assert.equal(audit.filter(item => item.toolAction !== null).length, 1);
  const denied = await phaseFixture([JSON.stringify({kind: "READ_FILE", path: "tools/verify.mjs"}), phaseReply]);
  assert.equal(denied.result.outcome, "BUDGET_EXHAUSTED"); assert.equal(denied.audit.length, 0);
  assert(!denied.result.events.some(item => item.eventType === "REPLY"));
});

omegaTest("missing sensitive revoked and out-of-scope observations never unlock a reply", async () => {
  for (const options of [{absent: true}, {sensitive: true}, {revoked: true}, {path: "tools/verify.mjs"}]) {
    const first = JSON.stringify({kind: "READ_FILE", path: options.path ?? "src/value.mjs"});
    const {result, requests} = await phaseFixture([first, phaseReply], options);
    assert.equal(result.outcome, "BUDGET_EXHAUSTED");
    assert.equal(typeof requests[1].responseFormat === "object" && requests[1].responseFormat.name, "nyx_required_file_read");
    assert(!result.events.some(item => item.eventType === "REPLY"));
    assert(!JSON.stringify(requests).includes("S".repeat(30)));
  }
});

omegaTest("malformed output is not extracted or autoexecuted and still consumes its logical call", async () => {
  const {result, audit} = await phaseFixture(["I will inspect first", phaseRead]);
  assert.equal(result.outcome, "BUDGET_EXHAUSTED"); assert.equal(result.modelCalls, 2);
  assert.equal(audit.filter(item => item.toolAction !== null).length, 1);
  assert(!result.events.some(item => item.eventType === "REPLY"));
});

omegaTest("a reply-only workflow neither reads nor certifies an incorrect answer", async () => {
  const {result, audit} = await phaseFixture([JSON.stringify({kind: "REPLY", message: "The answer is: 999"})],
    {contract: {kind: "REPLY_ONLY"}});
  assert.equal(result.outcome, "REPLIED"); assert.equal(audit.length, 0);
  assert.notEqual(result.message, "The answer is: 17"); // Answer quality belongs to an independent oracle.
  assert.equal(result.candidate, null);
});

omegaTest("phase ownership is frozen and each later turn requires a fresh observation", async () => {
  const root = await fixture(); const r1 = await reader(root); const contract = {kind: "READ_THEN_REPLY", path: "src/value.mjs"} as const;
  const model = provider([phaseRead, phaseReply, phaseReply, phaseReply]);
  try {
    const config = {sessionId: "NYX-PHASE-OWNERSHIP", model, reader: r1, candidateWriter: null,
      editablePaths: [], maxModelCallsPerTurn: 2, maxCandidatesPerTurn: 0, maxTurnMs: 20000, maxOutputTokens: 1024,
      actionContract: contract};
    const session = NyxChatSession.create(config);
    Object.assign(contract, {kind: "REPLY_ONLY", path: "tools/verify.mjs"});
    assert.equal((await session.turn("Inspect then conclude.")).outcome, "REPLIED");
    assert.equal((await session.turn("A later objective needs new evidence.")).outcome, "BUDGET_EXHAUSTED");
    assert.equal(r1.auditLog().filter(item => item.toolAction !== null).length, 1);
    assert.throws(() => NyxChatSession.create({...config, actionContract: {kind: "READ_THEN_REPLY", path: "src/value.mjs"},
      maxModelCallsPerTurn: 1}), /policy_invalid/);
    assert.throws(() => NyxChatSession.create({...config, actionContract: null as never}), /policy_invalid/);
  } finally {r1.terminate(Date.now(), "TEST_FINISHED"); await rm(root, {recursive: true});}
});

omegaTest("the same contract observes distinct real Unicode and space-containing filenames", async () => {
  const root = await fixture(); const r1 = await reader(root);
  try {
    for (const path of ["src/metric data.mjs", "src/Δοκιμή.mjs", "src/测量.mjs"]) {
      await writeFile(join(root, path), SOURCE);
      const session = NyxChatSession.create({sessionId: `NYX-GENERAL-${nyxSha256(path).slice(0, 8)}`,
        model: provider([JSON.stringify({kind: "READ_FILE", path}), phaseReply]), reader: r1,
        candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 2, maxCandidatesPerTurn: 0,
        maxTurnMs: 20000, maxOutputTokens: 1024, actionContract: {kind: "READ_THEN_REPLY", path}});
      assert.equal((await session.turn("Observe the scoped file before concluding.")).outcome, "REPLIED");
    }
    assert.equal(r1.auditLog().filter(item => item.toolAction !== null).length, 3);
  } finally {r1.terminate(Date.now(), "TEST_FINISHED"); await rm(root, {recursive: true});}
});

omegaTest("a late contracted read cannot gain authority by satisfying its generation schema", async () => {
  const root = await fixture(); const r1 = await reader(root); const base = provider([phaseRead]);
  try {
    const session = NyxChatSession.create({sessionId: "NYX-CONTRACT-EXPIRED", reader: r1,
      model: {complete: async request => {const result = await base.complete(request);
        await new Promise(resolve => setTimeout(resolve, 1100)); return result;}},
      candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 2, maxCandidatesPerTurn: 0,
      maxTurnMs: 1000, maxOutputTokens: 1024, actionContract: {kind: "READ_THEN_REPLY", path: "src/value.mjs"}});
    assert.equal((await session.turn("Inspect before answering.")).outcome, "BUDGET_EXHAUSTED");
    assert.equal(r1.auditLog().length, 0);
  } finally {r1.terminate(Date.now(), "TEST_FINISHED"); await rm(root, {recursive: true});}
});

omegaTest("parseable length-terminated output never reaches a repository action", async () => {
  const root = await fixture(); const r1 = await reader(root);
  try {
    const model = NvidiaNimProvider.create({ providerId: "NYX-LENGTH-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
      authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double", read: () => "synthetic-test-only" },
      maxPromptBytes: 64_000, maxOutputTokens: 1_024, timeoutMs: 5_000,
      transport: async () => new Response(JSON.stringify({ choices: [{ message: { content:
        JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }) }, finish_reason: "length" }],
        usage: { total_tokens: 123, prompt_tokens: 23, completion_tokens: 100 } }), { status: 200 }) });
    const session = NyxChatSession.create({ sessionId: "NYX-LENGTH", model, reader: r1, candidateWriter: null,
      editablePaths: [], maxModelCallsPerTurn: 1, maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Inspect the authorized file.");
    check(result.outcome, "MODEL_FAILURE", "parseable truncated completion cannot authorize repository action"); assert.equal(r1.auditLog().length, 0);
    assert.equal(result.modelTokens, 123); assert.equal(result.modelCalls, 1);
    assert.deepEqual(result.events.map(item => item.eventType), ["MODEL", "DENIAL"]);
  } finally { r1.terminate(Date.now(), "test_closed"); await rm(root, { recursive: true }); }
});

omegaTest("session ownership rejects overlapping turns and releases after a rejected delivery", async () => {
  const root = await fixture(); const r1 = await reader(root);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const base = provider([JSON.stringify({ kind: "REPLY", message: "Ready." })]);
  const model = { complete: async (request: Parameters<typeof base.complete>[0]) => {
    calls += 1; if (calls === 1) { await gate; throw new Error("synthetic_delivery_failure"); }
    return base.complete(request);
  } };
  const session = NyxChatSession.create({ sessionId: "NYX-OWNERSHIP", model, reader: r1, candidateWriter: null,
    editablePaths: [], maxModelCallsPerTurn: 1, maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 });
  try {
    const first = session.turn("First task");
    const assertion = assert.rejects(session.turn("Concurrent task"), /nyx_chat_turn_already_active/);
    release(); await assertion;
    assert.equal((await first).outcome, "MODEL_FAILURE");
    assert.equal((await session.turn("Next task")).outcome, "REPLIED");
    check(calls, 2, "overlapping turn spends no call and rejected delivery releases ownership"); assert.equal(r1.auditLog().length, 0);
  } finally { release(); r1.terminate(Date.now(), "test_closed"); await rm(root, { recursive: true }); }
});

omegaTest("caller configuration mutation cannot expand an existing session", async () => {
  const root = await fixture(); const r1 = await reader(root); const paths: string[] = [];
  const config: NyxChatSessionConfig = { sessionId: "NYX-FROZEN-POLICY", model: provider([
    JSON.stringify({ kind: "SHELL", command: "whoami" }), JSON.stringify({ kind: "REPLY", message: "No authority." })]),
    reader: r1, candidateWriter: null, editablePaths: paths, maxModelCallsPerTurn: 1,
    maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 };
  const session = NyxChatSession.create(config);
  Object.assign(config, { maxModelCallsPerTurn: 12 }); paths.push("src/value.mjs");
  try {
    const result = await session.turn("Request an unavailable operation.");
    check(result.outcome, "BUDGET_EXHAUSTED", "caller mutation cannot increase an existing finite call budget"); assert.equal(result.modelCalls, 1);
    assert.equal(r1.auditLog().length, 0);
  } finally { r1.terminate(Date.now(), "test_closed"); await rm(root, { recursive: true }); }
});

omegaTest("a late successful delivery cannot authorize an action after the turn expires", async () => {
  const root = await fixture(); const r1 = await reader(root);
  const base = provider([JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" })]);
  const model = { complete: async (request: Parameters<typeof base.complete>[0]) => {
    const response = await base.complete(request);
    await new Promise(resolve => setTimeout(resolve, 1_100));
    return response;
  } };
  try {
    const session = NyxChatSession.create({ sessionId: "NYX-LATE-DELIVERY", model, reader: r1,
      candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 1, maxCandidatesPerTurn: 0,
      maxTurnMs: 1_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Inspect the authorized file.");
    check(result.outcome, "BUDGET_EXHAUSTED", "late successful delivery cannot authorize an expired action"); assert.equal(result.modelCalls, 1);
    assert.equal(result.modelTokens, 200); assert.equal(r1.auditLog().length, 0);
    assert.deepEqual(result.events.map(item => item.eventType), ["MODEL"]);
  } finally { r1.terminate(Date.now(), "test_closed"); await rm(root, { recursive: true }); }
});

omegaTest("malformed input releases session ownership without any model or tool execution", async () => {
  const root = await fixture(); const r1 = await reader(root);
  try {
    const config: NyxChatSessionConfig = { sessionId: "NYX-INPUT-OWNERSHIP", model: provider([
      JSON.stringify({ kind: "REPLY", message: "Ready." })]), reader: r1,
      candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 1, maxCandidatesPerTurn: 0,
      maxTurnMs: 20_000, maxOutputTokens: 1_024 };
    assert.throws(() => NyxChatSession.create({ ...config, editablePaths: ["../outside.mjs"] }), /policy_invalid/);
    const session = NyxChatSession.create(config);
    await assert.rejects(session.turn(""), /user_input_outside_bounds/);
    check((await session.turn("A valid request")).outcome, "REPLIED", "malformed input releases session ownership without operational rescue");
    assert.equal(r1.auditLog().length, 0);
  } finally { r1.terminate(Date.now(), "test_closed"); await rm(root, { recursive: true }); }
});

omegaTest("typed protocol rejects arbitrary executable text and malformed edit targets", () => {
  assert.equal(parseNyxChatAction("rm -rf /*").action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "SHELL", command: "whoami" })).action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "READ_FILE", path: "../secret" })).action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs",
    expectedBaseHash: nyxSha256(SOURCE), replacement: REPLACEMENT, rationale: "fix", shell: "whoami" })).action, null);
  check(parseNyxChatAction(JSON.stringify({ kind: "LIST_DIRECTORY", path: "." })).action?.kind,
    "LIST_DIRECTORY", "root listing remains a typed read-only request");
  assert.equal(nyxContainsSecretLike(["nvapi", "A".repeat(25)].join("-")), true);
});

omegaTest("real R2A/R3A/R3B candidate stays isolated and passes fixed verifier", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "a".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  try {
    const stale = await writer.apply({ requestId: "stale", path: "src/value.mjs", expectedBaseHash: "0".repeat(64),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    assert.equal(stale.decision, "REJECTED");
    const unauthorized = await writer.apply({ requestId: "wrong", path: "src/other.mjs", expectedBaseHash: nyxSha256(SOURCE),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    assert.equal(unauthorized.decision, "REJECTED");
    const fixed = await writer.apply({ requestId: "fix", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    check(fixed.decision, "VERIFIED", "R2A R3A R3B candidate verified in isolation");
    assert.equal(fixed.verification, "PASS");
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});

omegaTest("isolated writer rejects a concurrent proposal rather than losing candidate ownership", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "d".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const request = { requestId: "owned", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
    replacement: REPLACEMENT, rationale: "Bounded repair.", observedEvidenceId: "E3-BASE" };
  try {
    const first = writer.apply(request);
    const contender = writer.apply({ ...request, requestId: "contender", replacement: "export function value() { return 3; }\n" });
    const [accepted, rejected] = await Promise.all([first, contender]);
    check(rejected.decision, "REJECTED", "isolated writer owns one proposal lane even across different session callers");
    assert.equal(rejected.reason, "candidate_operation_already_active"); assert.equal(accepted.decision, "VERIFIED");
    assert.equal((await writer.observeCandidate(request.path)).content, REPLACEMENT);
    assert.equal(await readFile(join(root, "src/value.mjs"), "utf8"), SOURCE);
  } finally { await writer.close(); await rm(root, { recursive: true }); }
});

omegaTest("termination drains an owned candidate before cleanup and forbids subsequent writes", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "e".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const request = { requestId: "closing", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
    replacement: REPLACEMENT, rationale: "Bounded repair.", observedEvidenceId: "E3-BASE" };
  try {
    const results = await Promise.allSettled([writer.apply(request), writer.close()]);
    check(results[0].status, "fulfilled", "cleanup cannot remove a disposable root while its owned verifier is running");
    if (results[0].status === "fulfilled") assert.equal(results[0].value.decision, "VERIFIED");
    assert.equal(results[1].status, "fulfilled");
    if (results[1].status === "fulfilled") assert.equal(results[1].value.decision, "CLEANED");
    await assert.rejects(lstat(writer.scratchRoot), { code: "ENOENT" });
    assert.equal((await writer.apply(request)).reason, "candidate_writer_closed");
    assert.equal(await readFile(join(root, "src/value.mjs"), "utf8"), SOURCE);
  } finally { await writer.close(); await rm(writer.scratchRoot, { recursive: true, force: true }); await rm(root, { recursive: true }); }
});

omegaTest("writer policy cannot be expanded by mutating the caller configuration", async () => {
  const root = await fixture();
  const config: NyxIsolatedCandidateConfig = { sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "f".repeat(40), maxCandidateBytes: 1, maxVerifierMs: 5_000 };
  const pendingWriter = NyxIsolatedCandidateWriter.create(config);
  Object.assign(config, { maxCandidateBytes: 4_096 }); // While create is suspended in its first filesystem await.
  const writer = await pendingWriter;
  try {
    const result = await writer.apply({ requestId: "policy", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
      replacement: REPLACEMENT, rationale: "Bounded repair.", observedEvidenceId: "E3-BASE" });
    check(result.reason, "candidate_scope_or_size_rejected", "writer byte authority is a creation-time snapshot, not mutable caller state");
  } finally { await writer.close(); await rm(root, { recursive: true }); }
});

omegaTest("repeated termination preserves a real alias quarantine instead of inventing cleanup", async () => {
  const root = await fixture(); const outside = await mkdtemp(join(tmpdir(), "nyx-quarantine-target-"));
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: null, candidateCommit: "a".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const alias = join(writer.scratchRoot, "alias");
  try {
    await writeFile(join(outside, "marker"), "fixture-only");
    await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir");
    assert.equal((await writer.close()).decision, "QUARANTINED");
    check((await writer.close()).decision, "QUARANTINED", "cleanup retry cannot convert retained alias material into CLEANED evidence");
    assert.equal(await readFile(join(outside, "marker"), "utf8"), "fixture-only");
    assert.equal((await lstat(alias)).isSymbolicLink(), true);
  } finally {
    const link = await lstat(alias).catch(() => null);
    if (link?.isSymbolicLink()) await unlink(alias); // Unlink only the fixture alias; never traverse its target.
    await rm(writer.scratchRoot, { recursive: true, force: true });
    await rm(root, { recursive: true }); await rm(outside, { recursive: true });
  }
});

omegaTest("live-shaped model conversation reads through R1, then proposes a verified isolated edit", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "b".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const r1 = await reader(root);
  try {
    const model = provider([
      JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
        replacement: REPLACEMENT, rationale: "The function returned the old value." }),
    ]);
    const session = NyxChatSession.create({ sessionId: "NYX-TEST-SESSION", model, reader: r1,
      candidateWriter: writer, editablePaths: ["src/value.mjs"], maxModelCallsPerTurn: 3,
      maxCandidatesPerTurn: 2, maxTurnMs: 30_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Please repair value() so it returns 2.");
    check(result.outcome, "CANDIDATE_VERIFIED", "live shaped chat composes R1 read and isolated edit");
    assert.equal(result.modelCalls, 2);
    assert.equal(result.modelTokens, 400);
    assert.deepEqual(result.events.map((event) => event.eventType), ["MODEL", "READ", "MODEL", "CANDIDATE"]);
    assert.equal(result.events.filter((event) => event.evidenceClass === "E3").length >= 2, true);
    assert.equal(result.sourceRepositoryMutated, false);
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});

omegaTest("model-proposed privilege upgrade cannot become a tool call", async () => {
  const root = await fixture();
  const r1 = await reader(root);
  try {
    const session = NyxChatSession.create({ sessionId: "NYX-DENIAL-SESSION",
      model: provider([JSON.stringify({ kind: "SHELL", command: "whoami" }),
        JSON.stringify({ kind: "REPLY", message: "I cannot run that shell action." })]),
      reader: r1, candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 2,
      maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Run whoami.");
    assert.equal(result.outcome, "REPLIED");
    check(result.events.some((event) => event.eventType === "DENIAL"), true,
      "model shell request is denied without execution");
    assert.equal(r1.auditLog().length, 0);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});

omegaTest("failed isolated candidate returns evidence to NYX for a bounded repair", async () => {
  const root = await fixture();
  const wrong = "export function value() { return 3; }\n";
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "c".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const r1 = await reader(root);
  try {
    const model = provider([
      JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
        replacement: wrong, rationale: "Try a candidate." }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(wrong),
        replacement: REPLACEMENT, rationale: "The verifier rejected 3, so return 2." }),
    ]);
    const session = NyxChatSession.create({ sessionId: "NYX-REPAIR-SESSION", model, reader: r1,
      candidateWriter: writer, editablePaths: ["src/value.mjs"], maxModelCallsPerTurn: 3,
      maxCandidatesPerTurn: 2, maxTurnMs: 30_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Make value() return 2.");
    check(result.outcome, "CANDIDATE_VERIFIED", "failed candidate is repaired under finite budget");
    assert.deepEqual(result.events.filter((event) => event.eventType === "CANDIDATE").map((event) => event.outcome),
      ["UNVERIFIED", "VERIFIED"]);
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});

omegaTest(
  "rereading after a failed edit observes the isolated candidate, not stale source",
  async () => {
    const root = await fixture();
    const wrong = "export function value() { return 3; }\n";
    const writer = await NyxIsolatedCandidateWriter.create({
      sourceRoot: root,
      editablePath: "src/value.mjs",
      verifierPath: "tools/verify.mjs",
      candidateCommit: "d".repeat(40),
      maxCandidateBytes: 4_096,
      maxVerifierMs: 5_000,
    });
    const r1 = await reader(root);
    try {
      const model = provider([
        JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
        JSON.stringify({
          kind: "PROPOSE_EDIT",
          path: "src/value.mjs",
          expectedBaseHash: nyxSha256(SOURCE),
          replacement: wrong,
          rationale: "First bounded attempt.",
        }),
        JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
        JSON.stringify({
          kind: "PROPOSE_EDIT",
          path: "src/value.mjs",
          expectedBaseHash: nyxSha256(wrong),
          replacement: REPLACEMENT,
          rationale: "Revise the isolated candidate.",
        }),
      ]);
      const session = NyxChatSession.create({
        sessionId: "NYX-REOBSERVE-SESSION",
        model,
        reader: r1,
        candidateWriter: writer,
        editablePaths: ["src/value.mjs"],
        maxModelCallsPerTurn: 4,
        maxCandidatesPerTurn: 2,
        maxTurnMs: 30_000,
        maxOutputTokens: 1_024,
      });
      const result = await session.turn(
        "Make value() return 2 and inspect failed work before retrying.",
      );
      check(
        result.outcome,
        "CANDIDATE_VERIFIED",
        "the second candidate uses the observed isolated base",
      );
      check(
        result.events.filter((event) => event.eventType === "READ").length,
        2,
        "source and candidate reads each have evidence",
      );
      check(
        r1.auditLog().length,
        1,
        "reread does not silently return to the authoritative source",
      );
      assert.equal(
        await readFile(join(root, "src", "value.mjs"), "utf8"),
        SOURCE,
      );
      const observed = await writer.observeCandidate("src/value.mjs");
      check(
        observed.contentSha256,
        nyxSha256(REPLACEMENT),
        "candidate read binds to applied content",
      );
      await assert.rejects(
        writer.observeCandidate("src/other.mjs"),
        /not_observable/,
      );
    } finally {
      r1.terminate(Date.now(), "test_closed");
      assert.equal((await writer.close()).decision, "CLEANED");
      await rm(root, { recursive: true });
    }
  },
);

omegaTest(
  "candidate reobservation fails closed if the authoritative source changes",
  async () => {
    const root = await fixture();
    const writer = await NyxIsolatedCandidateWriter.create({
      sourceRoot: root,
      editablePath: "src/value.mjs",
      verifierPath: "tools/verify.mjs",
      candidateCommit: "e".repeat(40),
      maxCandidateBytes: 4_096,
      maxVerifierMs: 5_000,
    });
    try {
      const applied = await writer.apply({
        requestId: "source-change",
        path: "src/value.mjs",
        expectedBaseHash: nyxSha256(SOURCE),
        replacement: REPLACEMENT,
        rationale: "Isolated candidate",
        observedEvidenceId: "E3",
      });
      check(
        applied.decision,
        "VERIFIED",
        "the isolated candidate initially verifies",
      );
      await writeFile(
        join(root, "src", "value.mjs"),
        "export function value() { return 4; }\n",
      );
      await assert.rejects(
        writer.observeCandidate("src/value.mjs"),
        /authoritative_source_changed/,
      );
    } finally {
      assert.equal((await writer.close()).decision, "CLEANED");
      await rm(root, { recursive: true });
    }
  },
);

omegaTest(
  "an unverified edit cannot inherit the model's claim of success",
  async () => {
    const root = await fixture();
    const wrong = "export function value() { return 3; }\n";
    const writer = await NyxIsolatedCandidateWriter.create({
      sourceRoot: root,
      editablePath: "src/value.mjs",
      verifierPath: "tools/verify.mjs",
      candidateCommit: "f".repeat(40),
      maxCandidateBytes: 4_096,
      maxVerifierMs: 5_000,
    });
    const r1 = await reader(root);
    try {
      const model = provider([
        JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
        JSON.stringify({
          kind: "PROPOSE_EDIT",
          path: "src/value.mjs",
          expectedBaseHash: nyxSha256(SOURCE),
          replacement: wrong,
          rationale: "A failing attempt.",
        }),
        JSON.stringify({
          kind: "REPLY",
          message: "Done. This change is verified.",
        }),
      ]);
      const session = NyxChatSession.create({
        sessionId: "NYX-UNVERIFIED-SESSION",
        model,
        reader: r1,
        candidateWriter: writer,
        editablePaths: ["src/value.mjs"],
        maxModelCallsPerTurn: 3,
        maxCandidatesPerTurn: 2,
        maxTurnMs: 30_000,
        maxOutputTokens: 1_024,
      });
      const result = await session.turn("Make value() return 2.");
      check(
        result.outcome,
        "CANDIDATE_UNVERIFIED",
        "Omega's verdict overrides the model's success claim",
      );
      assert.match(
        result.message,
        /^Omega did not verify the isolated candidate/,
      );
      assert.match(result.message, /Unverified model note:/);
      assert.equal(
        await readFile(join(root, "src", "value.mjs"), "utf8"),
        SOURCE,
      );
    } finally {
      r1.terminate(Date.now(), "test_closed");
      assert.equal((await writer.close()).decision, "CLEANED");
      await rm(root, { recursive: true });
    }
  },
);

omegaTest("terminal capability checks only an R1-observed authorized file in disposable isolation", async () => {
  const root = await fixture();
  await writeFile(join(root, "src", "broken.mjs"), "export function broken( {\n");
  const r1 = await reader(root);
  try {
    const host = NyxScopedComputerHost.create({ reader: r1, allowedCheckPaths: ["src/value.mjs", "src/broken.mjs"],
      desktopPid: null, winappPath: null, approveDesktopAction: async () => false });
    const checked = await host.execute({ kind: "TERMINAL_CHECK", path: "src/value.mjs" }, "terminal-1");
    check(checked.decision, "EXECUTED", "authorized Node syntax check executes on disposable source copy");
    assert.equal(checked.observation?.sourceSha256, nyxSha256(SOURCE));
    const denied = await host.execute({ kind: "TERMINAL_CHECK", path: "tools/verify.mjs" }, "terminal-2");
    assert.equal(denied.decision, "REJECTED");
    const broken = await host.execute({ kind: "TERMINAL_CHECK", path: "src/broken.mjs" }, "terminal-3");
    assert.equal(broken.decision, "UNVERIFIED");
    assert.equal(broken.observation?.exitCode === 0, false);
    assert.equal(r1.auditLog().length, 2);
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});

omegaTest("desktop action requires pinned inspection, fresh selector, and operator approval", async () => {
  const root = await fixture();
  const r1 = await reader(root);
  const seen: string[][] = [];
  const approvals: { selector: string; elementName: string; value: string | null }[] = [];
  let approve = false;
  const runner: NyxHostCommandRunner = async (_exe, args) => {
    seen.push([...args]);
    if (args[1] === "inspect") return { exitCode: 0,
      stdout: JSON.stringify({ windows: [{ hwnd: 39101, title: "NYX disposable fixture", elements: [
        { selector: "NyxButton", name: "Run", controlType: "Button" },
        { selector: "NyxInput", name: "Input", controlType: "Edit" },
      ] }] }), stderr: "" };
    if (args[1] === "status") return { exitCode: 0,
      stdout: JSON.stringify({ processId: 12345, hwnd: 39101, windowTitle: "NYX disposable fixture" }), stderr: "" };
    if (args[1] === "get-value") return { exitCode: 0, stdout: JSON.stringify({ text: "safe text" }), stderr: "" };
    return { exitCode: 0, stdout: "{}", stderr: "" };
  };
  try {
    const host = NyxScopedComputerHost.create({ reader: r1, allowedCheckPaths: [], desktopPid: 12345,
      winappPath: "C:/test/winapp.exe", commandRunner: runner, approveDesktopAction: async (request) => {
        approvals.push({ selector: request.selector, elementName: request.elementName, value: request.value });
        return approve;
      } });
    const inspection = await host.execute({ kind: "DESKTOP_INSPECT" }, "desktop-1");
    check(inspection.decision, "OBSERVED", "desktop inspection binds one window and typed selectors");
    const digest = String(inspection.observation?.observationDigest);
    assert.match(digest, /^[a-f0-9]{64}$/);
    const stale = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxButton",
      observationDigest: "0".repeat(64) }, "desktop-2");
    assert.equal(stale.decision, "REJECTED");
    const denied = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxButton",
      observationDigest: digest }, "desktop-3");
    assert.equal(denied.decision, "REJECTED");
    assert.equal(seen.length, 2);
    assert.equal(seen.some((args) => args[1] === "invoke"), false);
    approve = true;
    const invoked = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxButton",
      observationDigest: digest }, "desktop-4");
    assert.equal(invoked.decision, "UNVERIFIED");
    assert.deepEqual(seen.at(-1), ["ui", "invoke", "NyxButton", "-w", "39101", "--json"]);
    assert.equal(seen.filter((args) => args[1] === "status").length, 3);
    const reuse = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxButton",
      observationDigest: digest }, "desktop-5");
    assert.equal(reuse.decision, "REJECTED");
    const second = await host.execute({ kind: "DESKTOP_INSPECT" }, "desktop-6");
    const set = await host.execute({ kind: "DESKTOP_SET_VALUE", selector: "NyxInput",
      observationDigest: String(second.observation?.observationDigest), value: "safe text" }, "desktop-7");
    assert.equal(set.decision, "EXECUTED");
    assert.equal(set.observation?.confirmed, true);
    assert.deepEqual(approvals.at(-1), { selector: "NyxInput", elementName: "Input", value: "safe text" });
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});

omegaTest("desktop approval cannot outlive the observed window identity", async () => {
  const root = await fixture();
  const r1 = await reader(root);
  let identityChecks = 0;
  let invocations = 0;
  const runner: NyxHostCommandRunner = async (_exe, args) => {
    if (args[1] === "inspect") return { exitCode: 0, stdout: JSON.stringify({ windows: [
      { hwnd: 39101, title: "NYX disposable fixture", elements: [
        { selector: "NyxButton", name: "Run", controlType: "Button" }] }] }), stderr: "" };
    if (args[1] === "status") {
      identityChecks += 1;
      return { exitCode: 0, stdout: JSON.stringify({ processId: identityChecks === 1 ? 12345 : 98765,
        hwnd: 39101, windowTitle: "NYX disposable fixture" }), stderr: "" };
    }
    invocations += 1;
    return { exitCode: 0, stdout: "{}", stderr: "" };
  };
  try {
    const host = NyxScopedComputerHost.create({ reader: r1, allowedCheckPaths: [], desktopPid: 12345,
      winappPath: "C:/test/winapp.exe", commandRunner: runner, approveDesktopAction: async () => true });
    const inspected = await host.execute({ kind: "DESKTOP_INSPECT" }, "identity-inspect");
    const attempt = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxButton",
      observationDigest: String(inspected.observation?.observationDigest) }, "identity-invoke");
    assert.equal(attempt.decision, "REJECTED");
    assert.equal(attempt.reason, "desktop_window_changed_during_approval");
    assert.equal(invocations, 0);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});

omegaTest("model requests computer actions through typed Omega host and receives its evidence", async () => {
  const root = await fixture();
  const r1 = await reader(root);
  const actions: string[] = [];
  const computer: NyxComputerHost = { terminalCheckAvailable: true, desktopAvailable: false,
    execute: async (action) => {
      actions.push(action.kind);
      return { decision: "EXECUTED", reason: "bounded_node_syntax_check_passed",
        observation: { exitCode: 0 }, evidenceId: "COMPUTER-E3-1", evidenceClass: "E3",
        broaderAuthorityGranted: false };
    } };
  try {
    const session = NyxChatSession.create({ sessionId: "NYX-COMPUTER-SESSION",
      model: provider([JSON.stringify({ kind: "TERMINAL_CHECK", path: "src/value.mjs" }),
        JSON.stringify({ kind: "REPLY", message: "The bounded syntax check passed." })]),
      reader: r1, computerHost: computer, candidateWriter: null, editablePaths: [],
      maxModelCallsPerTurn: 2, maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Check syntax, then explain the result.");
    assert.equal(result.outcome, "REPLIED");
    assert.deepEqual(actions, ["TERMINAL_CHECK"]);
    assert.deepEqual(result.events.map((event) => event.eventType), ["MODEL", "COMPUTER", "MODEL", "REPLY"]);
    assert.equal(result.broaderAuthorityGranted, false);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});
