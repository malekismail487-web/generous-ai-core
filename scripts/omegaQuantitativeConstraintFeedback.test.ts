import { readFileSync } from "node:fs";
import type { QuantitativeEquations } from "../src/lib/codelab/research/quantitativeEquationCompiler";
import { createQuantitativeConstraintFeedback, type QuantitativeNecessaryCondition } from "../src/lib/codelab/research/quantitativeConstraintFeedback";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { runNyxQuantitativeTask } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { BoundedReasoningSession } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import { CONSTRAINT_TRANSFER_TASKS, constraintExpectedQuantities, verifyConstraintTransferSubmission } from "./omega/nyx-quantitative-constraint-transfer-fixtures";
import { COMMAND_TRANSFER_TASKS, verifyCommandTransferSubmission } from "./omega/nyx-quantitative-command-transfer-fixtures";
import { COUPLED_TRANSFER_TASKS, COUPLED_TRANSFER_CORPUS_DIGEST, coupledExpectedQuantities, verifyCoupledTransferSubmission,
  createSharedFirstProposal, assessConstraintFeedbackComparison, quantitativeCognitiveIntent,
  type FeedbackComparisonRun } from "./omega/nyx-quantitative-coupled-transfer-fixtures";
import type { NvidiaNimCompletionRequest } from "../src/lib/codelab/model/nvidiaNimProvider";
import { PROTOCOL_REPAIR_TASKS,protocolRepairExpectedQuantities,verifyProtocolRepairSubmission } from "./omega/nyx-quantitative-protocol-repair-fixtures";
import { REPAIR_CONTEXT_TASKS,repairContextExpectedQuantities,verifyRepairContextSubmission } from "./omega/nyx-quantitative-repair-context-fixtures";
let passed=0,failed=0;
function check(v:unknown,label:string){if(v)passed++;else{failed++;console.error(`x ${label}`);}}
const throws=(f:()=>unknown)=>{try{f();return false;}catch{return true;}};
const binding=theoryDigest({task:"independent-constraint-unit"});
const c=(id:string,relation:QuantitativeNecessaryCondition["relation"],bound:string,terms=[{label:"p",coefficient:"1"}]):QuantitativeNecessaryCondition=>({
  id,relation,bound,terms,requirementRef:`public:${id}`});
const unit=[c("nonnegative","GTE","0"),c("bounded","LTE","1")];
const diagnostic=createQuantitativeConstraintFeedback(binding,["p"],unit);
const certificate=(value:string)=>({outputs:[{label:"p",value}],confidence:1});
check(diagnostic.evaluate(certificate("1/2")).status==="SATISFIED_NOT_ACCEPTED","necessary conditions never establish a correct solution");
const bad=diagnostic.evaluate(certificate("2"));
check(bad.status==="VIOLATED"&&bad.violations.length===1&&bad.violations[0].observed==="2"&&bad.violations[0].requiredBound==="1",
  "an exact public counterexample explains a bound violation without revealing the expected answer");
check(!bad.grantsAuthority&&!bad.grantsAcceptance,"counterexample feedback carries no execution or evidence acceptance authority");
const {evidenceDigest,...body}=bad;
check(evidenceDigest===theoryDigest(body)&&bad.contractDigest===diagnostic.contractDigest&&bad.candidateDigest===theoryDigest(certificate("2")),
  "diagnostic binds the owned public contract, candidate, measured work and actual observation");
for(const value of ["0","1","1/2","999/1000"])check(diagnostic.evaluate(certificate(value)).status==="SATISFIED_NOT_ACCEPTED",`closed interval ${value}`);
for(const value of ["-1","2","1001/1000"])check(diagnostic.evaluate(certificate(value)).status==="VIOLATED",`interval violation ${value}`);
for(const value of ["-0","00","1.0","NaN","Infinity","1/0","2/4","0/3","1/-2","1e5"," 1",""])
  check(diagnostic.evaluate(certificate(value)).status==="NOT_EVALUATED",`noncanonical rational cannot produce a fake constraint proof ${value}`);
check(diagnostic.evaluate(certificate((1n<<4096n).toString())).reason==="INTEGER_BOUND","huge candidate rational fails bounded evaluation");
check(diagnostic.evaluate({outputs:[{label:"different",value:"1"}],confidence:1}).status==="NOT_EVALUATED","unknown output binding is not a satisfied condition");
check(diagnostic.evaluate({outputs:[{label:"p",value:"1"},{label:"p",value:"1"}],confidence:1}).status==="NOT_EVALUATED","duplicate output cannot hide a missing label");
let getterCalled=false;const accessor={outputs:[],confidence:1};
Object.defineProperty(accessor,"outputs",{enumerable:true,get(){getterCalled=true;return []}});
check(diagnostic.evaluate(accessor).status==="NOT_EVALUATED"&&!getterCalled,"malformed certificate is rejected without executing accessor code");
const cycle:Record<string,unknown>={};cycle.self=cycle;
check(diagnostic.evaluate(cycle).status==="NOT_EVALUATED","cyclic host object cannot enter rational diagnostics");
check(diagnostic.evaluate({outputs:[{label:"p",value:"1"}],confidence:NaN}).status==="NOT_EVALUATED","nonfinite confidence is not trustworthy data");
const mutable=structuredClone(unit);const owned=createQuantitativeConstraintFeedback(binding,["p"],mutable);
(mutable[1] as {bound:string}).bound="100";
check(owned.evaluate(certificate("2")).status==="VIOLATED","later caller edits cannot mutate an owned public constraint contract");
check(Object.isFrozen(bad.violations)&&Object.isFrozen(bad.violations[0]),"returned counterexamples cannot be rewritten in place");
for(const malformed of [[],[unit[0],unit[0]],[{...unit[0],extra:true}],[{...unit[0],bound:"2/4"}],
  [{...unit[0],relation:"ANY"}],[{...unit[0],terms:[{label:"p",coefficient:"1"},{label:"p",coefficient:"-1"}]}],
  [{...unit[0],terms:[{label:"unobserved",coefficient:"1"}]}],[{...unit[0],requirementRef:""}],Array(33).fill(unit[0]),[null]])
  check(throws(()=>createQuantitativeConstraintFeedback(binding,["p"],malformed as QuantitativeNecessaryCondition[])),"invalid public contract fails closed");
check(throws(()=>createQuantitativeConstraintFeedback("stale",["p"],unit)),"contract requires an exact task binding digest");
const sum=createQuantitativeConstraintFeedback(binding,["x","y"],[c("conserved","EQ","1",[{label:"x",coefficient:"1"},{label:"y",coefficient:"1"}])]);
check(sum.evaluate({outputs:[{label:"x",value:"1/3"},{label:"y",value:"2/3"}],confidence:0}).status==="SATISFIED_NOT_ACCEPTED",
  "exact conservation holds despite floating-point-inexact thirds and zero model confidence");
for(let x=-6;x<=6;x++)for(let y=-3;y<=3;y++) {
  const left=3*x-2*y;
  for(const difference of [-1,0,1]) {
    const checkLinear=createQuantitativeConstraintFeedback(binding,["x","y"],[c("linear","LTE",String(left+difference),
      [{label:"x",coefficient:"3"},{label:"y",coefficient:"-2"}])]);
    check((checkLinear.evaluate({outputs:[{label:"x",value:String(x)},{label:"y",value:String(y)}],confidence:1}).status==="VIOLATED")
      ===(difference<0),"generated signed linear inequalities agree with an independent bounded integer calculation");
  }
}
const reject=()=>({accepted:false,findings:["UNCHANGED_ORACLE_REJECTED"],verificationDigest:binding});
const enhanced=diagnostic.decorate(reject,true),control=diagnostic.decorate(reject,false);
check(!enhanced(certificate("1/2")).accepted,"satisfied public constraints cannot overrule independent rejection");
check(enhanced(certificate("2")).findings.length===2&&control(certificate("2")).findings.length===1,
  "the ablation changes diagnostic delivery only, not acceptance criteria or computation");
let observed=0;diagnostic.decorate(reject,false,()=>observed++)(certificate("2"));
check(observed===1,"control also computes and records the same constraints rather than secretly spending less native compute");
check(throws(()=>diagnostic.decorate(()=>({accepted:true,findings:[],verificationDigest:binding}),true)(certificate("2"))),
  "a contradiction between public requirements and oracle acceptance is an explicit evaluation defect, never a promoted candidate");
check(throws(()=>diagnostic.decorate(()=>{throw Error("independent_oracle_unavailable")},true)(certificate("1/2"))),
  "oracle errors remain infrastructure failures rather than model failures or automatic acceptance");

// Frozen transfer domain oracles are checked independently of the feedback arithmetic.
check(constraintExpectedQuantities(CONSTRAINT_TRANSFER_TASKS[0])[0].value==="279/355","enumerated latent sensor outcomes agree with a hand-derived reduced posterior");
function altered(index:number,values:Record<string,string>){const task=CONSTRAINT_TRANSFER_TASKS[index];return {...task,
  problem:{...task.problem,constants:task.problem.constants.map(v=>({...v,value:values[v.id]??v.value}))}};}
check(constraintExpectedQuantities(altered(1,{red:"2",blue:"2",green:"1",draw:"2",wanted:"1"}))[0].value==="2/5",
  "Pascal-counting oracle agrees with enumerating four qualifying pairs among ten unordered pairs");
check(JSON.stringify(constraintExpectedQuantities(altered(2,{transfer:"0",loss:"0"})))===JSON.stringify([
  {label:"x",value:"31/7"},{label:"y",value:"18/7"},{label:"dissipated",value:"0"}]),"no-transfer no-loss oracle preserves initial state");
check(JSON.stringify(constraintExpectedQuantities(altered(2,{transfer:"0",loss:"1"})))===JSON.stringify([
  {label:"x",value:"0"},{label:"y",value:"0"},{label:"dissipated",value:"7"}]),"complete dissipation is conserved in the oracle ledger");
check(JSON.stringify(constraintExpectedQuantities(altered(3,{principal:"1",rate:"1",withdrawal:"0"})))===JSON.stringify([
  {label:"capital",value:"131072"},{label:"paid",value:"0"},{label:"earned",value:"131071"}]),"ledger oracle matches closed-form doubling with no withdrawals");
for(const task of CONSTRAINT_TRANSFER_TASKS) {
  const expected={outputs:constraintExpectedQuantities(task),confidence:1};const feedback=createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,task.publicConditions);
  check(verifyConstraintTransferSubmission(task,expected).accepted&&feedback.evaluate(expected).status==="SATISFIED_NOT_ACCEPTED",
    `frozen independent solution satisfies, but is not established by, public conditions ${task.taskId}`);
  check(!verifyConstraintTransferSubmission(task,{...expected,outputs:expected.outputs.map(o=>({...o,value:"99999"}))}).accepted,
    `independent oracle still rejects wrong quantities ${task.taskId}`);
}

// Reference expressions exist in this TEST ONLY: prove all frozen objectives are expressible
// within the unchanged capability envelope before asking live cognition to solve them.
const expression=(id:number,op:"ADD"|"SUB"|"MUL"|"DIV"|"MIN"|"BINOMIAL",left:string,right:string)=>({id:`e${id}`,op,left,right});
const programs:QuantitativeEquations[]=[
  {schemaVersion:2,initialState:[],cycles:[{iterations:1,phases:[{expressions:[
    expression(0,"MUL","prior","sensitivityA"),expression(1,"MUL","e0","sensitivityB"),expression(2,"SUB","one","prior"),
    expression(3,"MUL","e2","falseA"),expression(4,"MUL","e3","falseB"),expression(5,"ADD","e1","e4"),expression(6,"DIV","e1","e5")],
    updates:[{slot:"r0",source:"e6"}]}]}],outputs:[{label:"posterior",source:"r0"}]},
  {schemaVersion:2,initialState:[],cycles:[{iterations:1,phases:[{expressions:[
    expression(0,"BINOMIAL","red","wanted"),expression(1,"SUB","draw","wanted"),expression(2,"ADD","blue","green"),
    expression(3,"BINOMIAL","e2","e1"),expression(4,"BINOMIAL","green","e1"),expression(5,"SUB","e3","e4"),
    expression(6,"MUL","e0","e5"),expression(7,"ADD","red","e2"),expression(8,"BINOMIAL","e7","draw"),expression(9,"DIV","e6","e8")],
    updates:[{slot:"r0",source:"e9"}]}]}],outputs:[{label:"probability",source:"r0"}]},
  {schemaVersion:2,initialState:[{slot:"r0",source:"x0"},{slot:"r1",source:"y0"}],cycles:[{iterations:17,phases:[{expressions:[
    expression(0,"SUB","one","transfer"),expression(1,"SUB","e0","loss"),expression(2,"MUL","e1","r0"),expression(3,"MUL","transfer","r1"),
    expression(4,"ADD","e2","e3"),expression(5,"MUL","transfer","r0"),expression(6,"MUL","e1","r1"),expression(7,"ADD","e5","e6"),
    expression(8,"ADD","r0","r1"),expression(9,"MUL","loss","e8"),expression(10,"ADD","r2","e9")],
    updates:[{slot:"r0",source:"e4"},{slot:"r1",source:"e7"},{slot:"r2",source:"e10"}]}]}],
    outputs:[{label:"x",source:"r0"},{label:"y",source:"r1"},{label:"dissipated",source:"r2"}]},
  {schemaVersion:2,initialState:[{slot:"r0",source:"principal"}],cycles:[{iterations:17,phases:[{expressions:[
    expression(0,"MUL","rate","r0"),expression(1,"ADD","r0","e0"),expression(2,"MIN","e1","withdrawal"),
    expression(3,"SUB","e1","e2"),expression(4,"ADD","r1","e2"),expression(5,"ADD","r2","e0")],
    updates:[{slot:"r0",source:"e3"},{slot:"r1",source:"e4"},{slot:"r2",source:"e5"}]}]}],
    outputs:[{label:"capital",source:"r0"},{label:"paid",source:"r1"},{label:"earned",source:"r2"}]},
];
for(const [index,task] of CONSTRAINT_TRANSFER_TASKS.entries()) {
  const session=BoundedReasoningSession.create(task.problem,{maxRequests:2,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000});
  try {const result=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:programs[index]});
    check(result.status==="CONSTRUCTED"&&verifyConstraintTransferSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
      `test-only reference equations agree with the independently implemented frozen oracle ${task.taskId}`);
  } finally {session.revoke();}
}

check(COUPLED_TRANSFER_CORPUS_DIGEST!==theoryDigest(CONSTRAINT_TRANSFER_TASKS),"the common-prefix epoch uses fresh, separately frozen parameter tasks");
for(const [index,task] of COUPLED_TRANSFER_TASKS.entries()) {
  check(theoryDigest(task.problem)!==theoryDigest(CONSTRAINT_TRANSFER_TASKS[index].problem),"each fresh task differs from the previous live objective");
  const expected={outputs:coupledExpectedQuantities(task),confidence:1};
  check(verifyCoupledTransferSubmission(task,expected).accepted
    &&createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,task.publicConditions).evaluate(expected).status==="SATISFIED_NOT_ACCEPTED",
    `fresh objective oracle and public requirements agree ${task.taskId}`);
  check(throws(()=>verifyCoupledTransferSubmission({...task,objective:task.objective+" changed"},expected)),"unfrozen objective cannot borrow a frozen oracle binding");
  const session=BoundedReasoningSession.create(task.problem,{maxRequests:2,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000});
  try {const result=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:programs[index]});
    check(result.status==="CONSTRUCTED"&&verifyCoupledTransferSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
      `test-only generic reference equations fit the SAME native limits for fresh parameters ${task.taskId}`);
  } finally {session.revoke();}
}
for(const [index,task] of PROTOCOL_REPAIR_TASKS.entries()) {
  check(theoryDigest(task.problem)!==theoryDigest(COUPLED_TRANSFER_TASKS[index].problem),"protocol repair trial is frozen on new parameters, not fitted to the failed sampler");
  const expected={outputs:protocolRepairExpectedQuantities(task),confidence:1};
  check(verifyProtocolRepairSubmission(task,expected).accepted
    &&createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,task.publicConditions).evaluate(expected).status==="SATISFIED_NOT_ACCEPTED",
    `fresh protocol-repair oracle agrees with public constraints ${task.taskId}`);
  const session=BoundedReasoningSession.create(task.problem,{maxRequests:2,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000});
  try {const result=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:programs[index]});
    check(result.status==="CONSTRUCTED"&&verifyProtocolRepairSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
      `reference exists only in tests and establishes unchanged computational feasibility ${task.taskId}`);
  } finally {session.revoke();}
}
for(const [index,task] of REPAIR_CONTEXT_TASKS.entries()) {
  check(theoryDigest(task.problem)!==theoryDigest(PROTOCOL_REPAIR_TASKS[index].problem),"context trial freezes new parameters before inference");
  const expected={outputs:repairContextExpectedQuantities(task),confidence:1};
  check(verifyRepairContextSubmission(task,expected).accepted
    &&createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,task.publicConditions).evaluate(expected).status==="SATISFIED_NOT_ACCEPTED",
    `context-trial independent oracle agrees with public requirements ${task.taskId}`);
  const session=BoundedReasoningSession.create(task.problem,{maxRequests:2,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000});
  try {const result=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:programs[index]});
    check(result.status==="CONSTRUCTED"&&verifyRepairContextSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
      `test-only reference establishes feasibility without changing the live computation envelope ${task.taskId}`);
  }finally{session.revoke();}
}

// Correct the archived comparison's causal interpretation without rewriting its original result.
const unexposed=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-constraint-v1/comparison.json","utf8"));
const corrected=assessConstraintFeedbackComparison(unexposed.results,unexposed.pairs.map((p:{taskId:string})=>p.taskId),unexposed.providerStable);
check(corrected.verdict==="OBSERVED_OUTCOME_DIFFERENCE_WITHOUT_CAUSAL_FEEDBACK_EXPOSURE"
  &&corrected.exposures.length===0&&!corrected.causalPromotionEligible,"four versus three first-call outcomes cannot prove post-failure feedback benefit");
check(theoryDigest(unexposed)==="c2df9f4b69de821b96c3b60db16d0bc17a9ee4505969571ca85f33f120d5e0f7",
  "original live evidence, including its mistaken attribution, remains immutable and distinguishable from the correction");
const exposed=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-constraint-v2/comparison.json","utf8"));
const negative=assessConstraintFeedbackComparison(exposed.results,exposed.pairs.map((p:{taskId:string})=>p.taskId),exposed.providerStable);
check(theoryDigest(exposed)==="0085351a32d9365420f64bc26c115d1b338f3b97062c214763453ce7717ddea0"
  &&negative.verdict==="NO_COMPUTE_DEFENSIBLE_FEEDBACK_ADVANTAGE"&&negative.firstProposalMatched
  &&negative.exposures.length===1&&!negative.causalPromotionEligible,"real diagnostic exposure with equal acceptance does not get relabeled as cognitive improvement");
check(exposed.physicalInferenceTotals.calls===10&&exposed.summaries.reduce((n:number,s:{calls:number})=>n+s.calls,0)===14,
  "archived live comparison distinguishes ten actual inferences from fourteen prefix-allocated calls");
for(const run of exposed.results) {
  const task=COUPLED_TRANSFER_TASKS.find(t=>t.taskId===run.taskId)!;
  const feedback=createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,task.publicConditions);
  const session=BoundedReasoningSession.create(task.problem,{maxRequests:2,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000});
  try {for(const attempt of run.attempts.filter((a:{computation:unknown})=>a.computation!==null)) {
    const replay=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:attempt.executedProgram});
    const {resultDigest,...body}=attempt.computation;
    check(resultDigest===theoryDigest(body)&&replay.workUnits===attempt.computation.workUnits
      &&replay.executedProgramDigest===attempt.computation.executedProgramDigest&&theoryDigest(replay.payload)===theoryDigest(attempt.computation.payload),
      "live proposal arithmetic and custody reproduce independently of reported model confidence");
    const cert={outputs:replay.payload!.outputs,confidence:attempt.confidence};
    const verified=feedback.decorate(c=>verifyCoupledTransferSubmission(task,c),run.comparisonArm==="CONSTRAINT_FEEDBACK")(cert);
    check(verified.accepted===(attempt.outcome==="ACCEPTED")&&verified.verificationDigest===attempt.resultDigest,
      "external oracle reproduces successful domains AND rejects the same incorrectly formulated sample-space candidate");
  }}finally{session.revoke();}
}
const protocolResult=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v7/comparison.json","utf8"));
check(theoryDigest(protocolResult)==="c0571d5bae2d1044b54dc6581dfa64c0590b79f83da1559c0e34bc50e4210e3a"
  &&protocolResult.candidate==="25bb0e019e89dbdf869e77190add8afc8b69fa79"&&protocolResult.complete&&!protocolResult.providerStable
  &&protocolResult.summaries.every((s:{accepted:number;calls:number})=>s.accepted===3&&s.calls===7)
  &&protocolResult.verdict==="INCONCLUSIVE_PROVIDER_OR_BUDGET"&&!protocolResult.broadPromotion,
  "provider-contaminated trial preserves real failures and successes without manufacturing repair benefit");
check(protocolResult.results.flatMap((r:{attempts:readonly {findings:readonly string[]}[]})=>r.attempts).every((a:{findings:readonly string[]})=>
  !a.findings.includes("DERIVATION_CERTIFICATE_REQUIRES_ONLY_FINITE_CONFIDENCE_0_TO_1")),"mixed certificate envelopes disappeared, not mathematical-model rejection");

// Replay real, failed mathematical candidates. No model solution is supplied by this diagnostic.
const prior=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v6/comparison.json","utf8"));
const sampling=prior.results.find((r:{taskId:string;arm:string})=>r.taskId==="COMMAND-TRANSFER-4"&&r.arm==="REASONING_WITH_WORKBENCH");
const original=COMMAND_TRANSFER_TASKS[3];const samplingFeedback=createQuantitativeConstraintFeedback(theoryDigest(original),["probability"],
  unit.map(condition=>({...condition,terms:[{label:"probability",coefficient:"1"}]})));
for(const attempt of sampling.attempts.filter((a:{computation:unknown})=>a.computation!==null)) {
  const cert={outputs:attempt.computation.payload.outputs,confidence:attempt.confidence};
  check(!verifyCommandTransferSubmission(original,cert).accepted&&samplingFeedback.evaluate(cert).status==="VIOLATED",
    "general objective-implied interval diagnostic exposes a real wrong-model candidate without encoding its observed denominator");
}

// E3 scripted cognition verifies wiring and unchanged finite limits; NOT live reasoning evidence.
const makeProvider=()=>NvidiaNimProvider.create({providerId:"CONSTRAINT-WIRING",model:"nvidia/nemotron-3-ultra-550b-a55b",authorityMode:"TEST_DOUBLE_ONLY",
  credentialSource:{sourceIdentity:"test-double:constraint",read:()=>"test-only-credential-material"},maxPromptBytes:32000,maxOutputTokens:512,timeoutMs:1000,
  transport:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));const prompted=JSON.parse(body.messages[1].content);
    const value=prompted.verificationFeedback.some((f:string)=>f.startsWith("PUBLIC_NECESSARY_CONDITION_VIOLATED"))?"1/2":"2";
    return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({action:"SUBMIT",analysisRequest:null,certificate:certificate(value)})}}],
      usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40}}),{status:200});
  }});
for(const feedback of [false,true]) {
  const provider=makeProvider();const result=await runNyxQuantitativeTask({arm:"REASONING_WITH_WORKBENCH",taskId:"E3-WIRING",objective:"Return the specified probability 1/2.",
    problem:{kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"one",value:"1"}]},outputLabels:["p"],
    limits:{maxCalls:2,maxOutputTokens:512,maxTaskMs:10000,expiresAtEpochMs:Date.now()+10000,maxToolRequests:1,maxToolWorkUnits:100,maxToolElapsedMs:100},
    complete:request=>provider.complete(request),verify:diagnostic.decorate(cert=>({accepted:JSON.stringify(cert)===JSON.stringify(certificate("1/2")),
      findings:JSON.stringify(cert)===JSON.stringify(certificate("1/2"))?[]:["VALUE_MISMATCH"],verificationDigest:theoryDigest(cert)}),feedback)});
  check(result.accepted===feedback&&result.calls===2&&!result.authorityIncrease,`scripted wiring delivers actionable external counterexamples within the SAME two calls: ${feedback}`);
  if(result.accepted!==feedback)console.error(JSON.stringify({feedback,outcome:result.outcome,attempts:result.attempts.map(a=>({outcome:a.outcome,findings:a.findings,evidence:a.modelEvidence}))}));
}

// Common-prefix custody and physical versus allocated inference accounting. E3 ONLY.
let clock=Date.now();const captured=NvidiaNimProvider.create({providerId:"COUPLED-CUSTODY",model:"nvidia/nemotron-3-ultra-550b-a55b",authorityMode:"TEST_DOUBLE_ONLY",
  credentialSource:{sourceIdentity:"test-double:coupled",read:()=>"test-only-credential-material"},maxPromptBytes:32000,maxOutputTokens:512,timeoutMs:1000,
  transport:async()=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{role:"assistant",content:"{}"}}],
    usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40}}),{status:200})});
const request:NvidiaNimCompletionRequest={schemaVersion:1,requestId:"coupled",messages:[{role:"user",content:"same objective"}],maxTokens:512,
  temperature:0,responseFormat:"JSON_OBJECT",inferencePolicy:"REASONING_JSON",reasoningEffort:"MEDIUM",observedAtEpochMs:clock,deadlineEpochMs:clock+10000};
let physical=0;const pair=createSharedFirstProposal(async r=>{physical++;clock+=37;return captured.complete(r);},()=>clock);
const first=pair.branch(),second=pair.branch();const initial=await first.complete(request);
check(pair.prefixElapsedMs()===37,"actual prefix time is retained for both task budgets");
const replay=await second.complete({...request,observedAtEpochMs:clock,deadlineEpochMs:clock+9000});
check(initial===replay&&physical===1&&first.accounting().physicalTokens===40&&second.accounting().physicalTokens===0,
  "identical first inference is replayed as a proposal, not billed or described as a second API response");
check(first.accounting().receipt?.sourceEvidenceId===second.accounting().receipt?.sourceEvidenceId
  &&first.accounting().receipt?.replayed===false&&second.accounting().receipt?.replayed===true,
  "both arm receipts preserve exact shared proposal custody and the real source evidence identity");
await second.complete({...request,requestId:"repair",observedAtEpochMs:clock});
check(physical===2&&second.accounting().physicalTokens===40,"later repair cognition is independently executed and counted");
check(throws(()=>pair.branch()),"common-prefix replay cannot grow an unbounded worker or cache population");
check(quantitativeCognitiveIntent(request)!==quantitativeCognitiveIntent({...request,maxTokens:511})
  &&quantitativeCognitiveIntent(request)!==quantitativeCognitiveIntent({...request,messages:[{role:"user",content:"changed objective"}]}),
  "model budget and exact cognitive content participate in prefix equality");
async function rejected(f:()=>Promise<unknown>){try{await f();return false;}catch{return true;}}
const mismatch=createSharedFirstProposal(r=>captured.complete(r),()=>clock);await mismatch.branch().complete({...request,observedAtEpochMs:clock});
check(await rejected(()=>mismatch.branch().complete({...request,requestId:"changed",observedAtEpochMs:clock})),"different cognitive intent cannot reuse a response");
const expired=createSharedFirstProposal(r=>captured.complete(r),()=>clock);await expired.branch().complete({...request,observedAtEpochMs:clock});
check(await rejected(()=>expired.branch().complete({...request,observedAtEpochMs:clock,deadlineEpochMs:clock})),"cached inference cannot renew or bypass an expired arm");
const cancelled=createSharedFirstProposal(r=>captured.complete(r),()=>clock);
check(await rejected(()=>cancelled.branch().complete({...request,observedAtEpochMs:clock,signal:AbortSignal.abort()})),"cancellation is honored before either replay or inference");
let release!:()=>void;const pending=createSharedFirstProposal(async r=>{await new Promise<void>(resolve=>release=resolve);return captured.complete(r);},()=>clock);
const pendingBranch=pending.branch();const pendingResult=pendingBranch.complete({...request,observedAtEpochMs:clock});
check(throws(()=>pending.branch()),"overlapping branch creation is explicitly rejected rather than racing shared custody");release();await pendingResult;

// Detector tests: no exposure, wrong source, mismatched proposals, and unstable delivery cannot promote.
const shared=createSharedFirstProposal(r=>makeProvider().complete(r));const scripted:FeedbackComparisonRun[]=[];
for(const feedback of [false,true]) {
  const branch=shared.branch();const result=await runNyxQuantitativeTask({arm:"REASONING_WITH_WORKBENCH",taskId:"COUPLED-E3",objective:"Return probability 1/2.",
    problem:{kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"one",value:"1"}]},outputLabels:["p"],
    limits:{maxCalls:2,maxOutputTokens:512,maxTaskMs:10000,expiresAtEpochMs:Date.now()+10000,maxToolRequests:1,maxToolWorkUnits:100,maxToolElapsedMs:100},
    complete:r=>branch.complete(r),verify:diagnostic.decorate(cert=>({accepted:JSON.stringify(cert)===JSON.stringify(certificate("1/2")),
      findings:JSON.stringify(cert)===JSON.stringify(certificate("1/2"))?[]:["VALUE_MISMATCH"],verificationDigest:theoryDigest(cert)}),feedback)});
  scripted.push({...result,comparisonArm:feedback?"CONSTRAINT_FEEDBACK":"GENERIC_FEEDBACK",sharedProposal:branch.accounting().receipt});
}
const assessed=assessConstraintFeedbackComparison(scripted,["COUPLED-E3"],true);
check(assessed.firstProposalMatched&&assessed.exposures.length===1&&assessed.causalPromotionEligible&&!assessed.broadPromotion,
  "scripted equal-prefix feedback experiment exercises repair and its causal classifier, NOT live capability");
check(!assessConstraintFeedbackComparison(scripted,["COUPLED-E3"],false).causalPromotionEligible,"provider instability prevents comparison promotion");
check(!assessConstraintFeedbackComparison(scripted.slice(1),["COUPLED-E3"],true).causalPromotionEligible,"missing controls cannot yield comparative acceptance");
const changed=scripted.map(r=>r.comparisonArm==="CONSTRAINT_FEEDBACK"?{...r,sharedProposal:{...r.sharedProposal!,intentDigest:binding}}:r);
check(!assessConstraintFeedbackComparison(changed,["COUPLED-E3"],true).causalPromotionEligible,"different first-request custody cannot pass causal matching");
const outcomes=scripted.map(r=>r.comparisonArm==="CONSTRAINT_FEEDBACK"?{...r,attempts:r.attempts.map((a,i)=>i? a:{...a,outcome:"ACCEPTED"})}:r);
check(!assessConstraintFeedbackComparison(outcomes,["COUPLED-E3"],true).causalPromotionEligible,"same response identities with inconsistent first admission are not comparable");

// Candidate-state repair is tested with scripted cognition, not represented as an E4 gain.
const contextProblem={kind:"EXACT_QUANTITATIVE_DERIVATION" as const,constants:[{id:"zero",value:"0"},{id:"one",value:"1"}]};
const contextProvider=NvidiaNimProvider.create({providerId:"CONTEXT-WIRING",model:"nvidia/nemotron-3-ultra-550b-a55b",authorityMode:"TEST_DOUBLE_ONLY",
  credentialSource:{sourceIdentity:"test-double:context",read:()=>"test-only-credential-material"},maxPromptBytes:32000,maxOutputTokens:512,timeoutMs:1000,
  transport:async(_url,init)=>{
    const prompt=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    const context=prompt.lastAdmittedDerivation;
    const repair=context?.program?.cycles[0].phases[0].expressions[0].op==="ADD"
      &&context.independentEvaluation?.accepted===false&&context.programDigest===theoryDigest(context.program)
      &&context.problemDigest===theoryDigest(contextProblem);
    const program:QuantitativeEquations={schemaVersion:2,initialState:[],cycles:[{iterations:1,phases:[{
      expressions:[expression(0,repair?"DIV":"ADD","one","one")],updates:[{slot:"r0",source:"e0"}]}]}],outputs:[{label:"p",source:"r0"}]};
    return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({action:"SUBMIT_DERIVATION",
      analysisRequest:{problemDigest:theoryDigest(contextProblem),program},certificate:{confidence:0.9}})}}],
      usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40}}),{status:200});
  }});
const contextPair=createSharedFirstProposal(r=>contextProvider.complete(r));const contextRuns:FeedbackComparisonRun[]=[];
for(const retainAdmittedDerivation of [false,true]) {
  const branch=contextPair.branch();const result=await runNyxQuantitativeTask({arm:"REASONING_WITH_WORKBENCH",taskId:"CONTEXT-E3",objective:"Return p exactly equal to 1.",
    problem:contextProblem,outputLabels:["p"],retainAdmittedDerivation,
    limits:{maxCalls:2,maxOutputTokens:512,maxTaskMs:10000,expiresAtEpochMs:Date.now()+10000,maxToolRequests:2,maxToolWorkUnits:1000,maxToolElapsedMs:100},
    complete:r=>branch.complete(r),verify:diagnostic.decorate(cert=>({accepted:(cert as {outputs:{value:string}[]}).outputs[0].value==="1",
      findings:(cert as {outputs:{value:string}[]}).outputs[0].value==="1"?[]:["VALUE_MISMATCH"],verificationDigest:theoryDigest(cert)}),true)});
  check(result.accepted===retainAdmittedDerivation&&result.calls===2&&result.toolRequests===2&&!result.authorityIncrease,
    "scripted cognition needs its exact failed candidate to diagnose rather than regenerate blindly; limits and verifier are unchanged");
  check(result.attempts[0].repairContextDigest===null&&result.attempts[0].repairContextProgramDigest===null,"no repair context exists before an actually admitted candidate");
  check((result.attempts[1].repairContextProgramDigest!==null)===retainAdmittedDerivation,"only the intended ablation delivers last admitted candidate state");
  contextRuns.push({...result,sharedProposal:branch.accounting().receipt,
    comparisonArm:retainAdmittedDerivation?"PUBLIC_FEEDBACK_WITH_CONTEXT":"PUBLIC_FEEDBACK_NO_CONTEXT"});
}
const contextAssessment=assessConstraintFeedbackComparison(contextRuns,["CONTEXT-E3"],true,"ADMITTED_DERIVATION_CONTEXT");
check(contextAssessment.firstProposalMatched&&contextAssessment.exposures.length===1&&contextAssessment.causalPromotionEligible,
  "E3 detector recognizes actual equal-prefix context exposure, not a first-call stochastic difference");
const dropped=contextRuns.map(r=>({...r,attempts:r.attempts.map(a=>({...a,repairContextProgramDigest:null}))}));
check(!assessConstraintFeedbackComparison(dropped,["CONTEXT-E3"],true,"ADMITTED_DERIVATION_CONTEXT").causalPromotionEligible,
  "configuration opt-in alone cannot stand in for actual failed-program context delivery");
let boundedContextObserved=false;await runNyxQuantitativeTask({arm:"REASONING_WITH_WORKBENCH",taskId:"CONTEXT-BOUNDED",objective:"Reject a valid candidate for testing.",
  problem:contextProblem,outputLabels:["p"],retainAdmittedDerivation:true,
  limits:{maxCalls:2,maxOutputTokens:512,maxTaskMs:10000,expiresAtEpochMs:Date.now()+10000,maxToolRequests:2,maxToolWorkUnits:1000,maxToolElapsedMs:100},
  complete:async r=>{const prompt=JSON.parse(r.messages[1].content);if(prompt.lastAdmittedDerivation)boundedContextObserved=
    prompt.lastAdmittedDerivation.status==="REPAIR_CONTEXT_UNAVAILABLE_BYTE_BOUND"&&!prompt.lastAdmittedDerivation.program;
    return contextProvider.complete(r);},verify:cert=>({accepted:false,findings:["X".repeat(13000)],verificationDigest:theoryDigest(cert)})});
check(boundedContextObserved,"oversized retained candidate/evaluation state is explicitly unavailable, never silently truncated into a misleading partial program");
check(await rejected(()=>runNyxQuantitativeTask({arm:"REASONING_WITH_WORKBENCH",taskId:"CONTEXT-MALFORMED",objective:"No inference allowed.",
  problem:contextProblem,outputLabels:["p"],retainAdmittedDerivation:"yes" as unknown as boolean,
  limits:{maxCalls:2,maxOutputTokens:512,maxTaskMs:10000,expiresAtEpochMs:Date.now()+10000,maxToolRequests:2,maxToolWorkUnits:1000,maxToolElapsedMs:100},
  complete:()=>{throw Error("malformed_setting_cannot_infer");},verify:()=>{throw Error("malformed_setting_cannot_verify");}})),
  "context configuration must be an explicit boolean, not truthy coercion");
console.log(`OMEGA_QUANTITATIVE_CONSTRAINT_FEEDBACK_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if(failed)process.exitCode=1;
