import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult, NvidiaNimEvidence } from "../model/nvidiaNimProvider";
import { BoundedReasoningSession,type ReasoningToolResult } from "./boundedReasoningWorkbench";
import { EXACT_DERIVATION_OPERATIONS,type QuantitativeProblem,type QuantitativeProgram } from "./exactQuantitativeDerivation";
import { equationNames,type QuantitativeEquations } from "./quantitativeEquationCompiler";
import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import { materializeAnalysisArtifactFields } from "./analysisArtifactReference";

export type QuantitativeArm = "CURRENT_DIRECT" | "REASONING_MEDIUM" | "REASONING_WITH_WORKBENCH";
export interface QuantitativeRunLimits { readonly maxCalls: number; readonly maxOutputTokens: number;
  readonly maxTaskMs: number; readonly expiresAtEpochMs: number; readonly maxToolRequests: number;
  readonly maxToolWorkUnits: number; readonly maxToolElapsedMs: number }
export interface QuantitativeAcceptance { readonly accepted: boolean; readonly findings: readonly string[];
  readonly verificationDigest: string }
export interface QuantitativeAttempt { readonly call: number; readonly outcome: string; readonly findings: readonly string[];
  readonly proposalDigest: string | null; readonly resultDigest: string | null; readonly confidence: number | null;
  readonly repairContextDigest?:string|null;
  readonly repairContextProgramDigest?:string|null;
  readonly executedProgram:QuantitativeProgram|QuantitativeEquations|null;
  readonly computation:ReasoningToolResult|null;
  readonly modelEvidence: NvidiaNimEvidence }
export interface QuantitativeRun {
  readonly arm: QuantitativeArm; readonly taskId: string; readonly accepted: boolean; readonly outcome: string;
  readonly attempts: readonly QuantitativeAttempt[]; readonly elapsedMs: number; readonly calls: number;
  readonly toolRequests: number; readonly toolWorkUnits: number; readonly toolElapsedMs: number;
  readonly acceptedCertificate: unknown; readonly authorityIncrease: false;
}
function keys(v: unknown,names:string[]): v is Record<string,unknown> {return !!v && typeof v==="object" && !Array.isArray(v)
  && Object.keys(v).sort().join("\0")===names.sort().join("\0");}
const MAX_ADMITTED_DERIVATION_CONTEXT_BYTES=12000;
/** Hosted schema contains only supported structural keywords. Local limits remain stricter. */
export function quantitativeExchangeSchema(labels:readonly string[],toolAvailable:boolean,artifactAvailable:boolean,problemDigest:string,
  constantIds:readonly string[]=[],artifactDigest:string|null=null) {
  const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  const string={type:"string"};const array=(items:unknown)=>({type:"array",items});
  const constant=(value:string|number)=>({type:typeof value==="number"?"integer":"string",enum:[value]});
  const {state:slots,expressions}=equationNames(constantIds);
  const registerId={type:"string",enum:slots};const source={type:"string",enum:[...constantIds,...slots]};
  const expressionSource={type:"string",enum:[...constantIds,...slots,...expressions]};
  const program=object({schemaVersion:constant(2),initialState:array(object({slot:registerId,source:{type:"string",enum:constantIds}})),
    cycles:array(object({iterations:{type:"integer"},phases:array(object({
      expressions:array(object({id:{type:"string",enum:expressions},op:{type:"string",enum:EXACT_DERIVATION_OPERATIONS},left:expressionSource,right:expressionSource})),
      updates:array(object({slot:registerId,source:expressionSource}))}))})),
    outputs:array(object({label:{type:"string",enum:labels},source}))});
  const tool=object({problemDigest:constant(problemDigest),program});
  const artifact=object({schemaVersion:constant(1),operation:constant("SUBMIT_ANALYSIS_ARTIFACT"),problemDigest:constant(problemDigest),
    resultDigest:artifactDigest===null?string:constant(artifactDigest),confidence:{type:"number"}});
  const certificate=object({outputs:array(object({label:{type:"string",enum:labels},value:string})),confidence:{type:"number"}});
  // Tagged union, NOT the Cartesian product of independently valid fields. In particular,
  // DERIVATION cannot select a full/manual certificate or an artifact request. Guided decoding
  // should produce a coherent intent; local authority/IR/expiry/acceptance checks remain stricter.
  const exchange=(action:string,analysisRequest:unknown,certificate:unknown)=>object({action:constant(action),analysisRequest,certificate});
  const branches=[exchange("SUBMIT",{type:"null"},certificate),
    ...(toolAvailable?[exchange("SUBMIT_DERIVATION",tool,object({confidence:{type:"number"}}))]:[]),
    ...(artifactAvailable?[exchange("SUBMIT_ANALYSIS_ARTIFACT",artifact,{type:"null"}),
      exchange("DECLINE_ANALYSIS_ARTIFACT",{type:"null"},{type:"null"})]:[])];
  return {type:"object",anyOf:branches};
}
/** Composition of existing NYX inference, Omega computation, and an externally owned oracle.
 * The completion callback is cognition, not an authority mechanism. It never receives the verifier.
 */
export async function runNyxQuantitativeTask(input: {
  readonly arm: QuantitativeArm; readonly taskId: string; readonly objective: string;
  readonly problem: QuantitativeProblem; readonly outputLabels: readonly string[]; readonly limits: QuantitativeRunLimits;
  readonly complete: (request: NvidiaNimCompletionRequest) => Promise<NvidiaNimCompletionResult>;
  readonly verify: (certificate: unknown) => QuantitativeAcceptance; readonly now?: () => number;
  /** Experimental cognitive-context ablation. No raw reasoning or new execution authority. */
  readonly retainAdmittedDerivation?:boolean;
}): Promise<QuantitativeRun> {
  if(input.retainAdmittedDerivation!==undefined&&typeof input.retainAdmittedDerivation!=="boolean")throw Error("quantitative_repair_context_setting_invalid");
  const now=input.now??Date.now;const started=now();
  const limits=Object.freeze({...input.limits});
  for(const [key,value] of Object.entries(limits)) if(!Number.isSafeInteger(value)||value<1) throw Error(`quantitative_limit_invalid:${key}`);
  if(limits.maxCalls>8||limits.maxOutputTokens>8192||limits.maxTaskMs>900000||limits.maxToolRequests>8
    ||limits.maxToolWorkUnits>1000000||limits.maxToolElapsedMs>10000||limits.expiresAtEpochMs<=started)
    throw Error("quantitative_limits_not_authorized");
  if(!["CURRENT_DIRECT","REASONING_MEDIUM","REASONING_WITH_WORKBENCH"].includes(input.arm)) throw Error("quantitative_arm_invalid");
  const expires=Math.min(limits.expiresAtEpochMs,started+limits.maxTaskMs);
  // Validate and own the finite constants even in controls. No model-supplied input replacement.
  const session=BoundedReasoningSession.create(input.problem,{maxWorkUnits:limits.maxToolWorkUnits,
    maxElapsedMs:limits.maxToolElapsedMs,maxRequests:limits.maxToolRequests,expiresAtEpochMs:expires},now);
  const task=immutableTheoryValue(JSON.parse(JSON.stringify({taskId:input.taskId,objective:input.objective,
    problem:input.problem,outputLabels:input.outputLabels})));
  const complete=input.complete;const verify=input.verify;const arm=input.arm;
  const attempts:QuantitativeAttempt[]=[];let observation:Readonly<Record<string,unknown>>|null=null;let feedback:readonly string[]=[];
  let admittedDerivation:Readonly<Record<string,unknown>>|null=null;
  let accepted=false;let acceptedCertificate:unknown=null;let outcome="BUDGET_UNEXECUTED";
  let toolRequests=0;let toolWorkUnits=0;let toolElapsedMs=0;
  const contract={action:"SUBMIT_DERIVATION computes YOUR program and submits its outputs to an INDEPENDENT checker in this call. SUBMIT submits manually.",
    analysisRequest:"On SUBMIT_DERIVATION EXACTLY {problemDigest,program}. NO operation, outer schemaVersion, confidence, or extra fields. The adapter owns the native tool header. On SUBMIT: null.",
    certificate:"SUBMIT_DERIVATION requires ONLY {confidence:number 0..1}. SUBMIT requires {outputs:[{label:string,value:canonical reduced rational string}],confidence:number 0..1}",
    program:"{schemaVersion:2,initialState:[{slot,source}],cycles:[{iterations,phases:[{expressions:[{id,op,left,right}],updates:[{slot,source}]}]}],outputs:[{label,source}]}",
    programSemantics:"All 16 state slots in the schema exist and start at zero; initialState overrides selected slots from named constants. "
      +"A phase evaluates immutable expressions in listed dependency order, then commits its distinct slot updates SIMULTANEOUSLY. "
      +"Expression sources can be constants, state slots, or EARLIER expression IDs in THIS phase. They are not writable state. "
      +"All phases in a cycle run SEQUENTIALLY and that full phase sequence repeats iterations times. "
      +"Separate ordered phases when a later equation needs newly updated state. Use multiple expression nodes to build a multi-operation equation, not repeated writes to a slot. "
      +"Expression IDs are local to each phase and must be distinct. Output sources are constants or state slots, not expression IDs. "
      +"Constants are immutable. No literal source strings '0'/'1': use named zero/one. Iterations follow the objective, not the policy maximum. "
      +"Only schema-listed slots/IDs and ADD/SUB/MUL/DIV/MIN/MAX/BINOMIAL exist. BINOMIAL(n,k) counts unordered k-element subsets of n distinct elements, with nonnegative integer operands; k>n yields zero. "
      +"No code, shell, files, or extra tools. Exact reduced rationals only.",
    acceptance:"The tool only evaluates YOUR equations. Correct arithmetic does not prove the model is appropriate. Independent verification judges the original objective."};
  try {
    for(let call=1;call<=limits.maxCalls && now()<expires;call++) {
      const available=arm==="REASONING_WITH_WORKBENCH" && session.descriptor().available===true;
      const artifactAvailable=observation?.decision==="CANDIDATE_CONSTRUCTED_NOT_ACCEPTED";
      // Cognition is stateless across calls unless we explicitly provide candidate state.
      // Retain only IR that Omega actually admitted, not rejected executable text, hidden oracle
      // outputs, or private reasoning. The original scope/custody and independent verdict travel
      // with it. A fixed byte ceiling bounds context; omission is explicit, never a partial IR.
      const repairContext:Readonly<Record<string,unknown>>|null=input.retainAdmittedDerivation&&admittedDerivation!==null?
        new TextEncoder().encode(JSON.stringify(admittedDerivation)).byteLength<=MAX_ADMITTED_DERIVATION_CONTEXT_BYTES?admittedDerivation:
          immutableTheoryValue({problemDigest:session.problemDigest,programDigest:admittedDerivation.programDigest,
            status:"REPAIR_CONTEXT_UNAVAILABLE_BYTE_BOUND",grantsAuthority:false}):null;
      const repairContextDigest=repairContext===null?null:theoryDigest(repairContext);
      const repairContextProgramDigest=repairContext?.program?String(repairContext.programDigest):null;
      const prompt={...task,contract:available||artifactAvailable?{...contract,
        artifactSubmission:"After a constructed result, submit {action:SUBMIT_ANALYSIS_ARTIFACT,analysisRequest:{schemaVersion:1,operation:SUBMIT_ANALYSIS_ARTIFACT,problemDigest,resultDigest,confidence},certificate:null}. "
          +"This submits the bound computed quantities to the SAME independent oracle. It neither accepts them automatically nor certifies your mathematical model. "
          +"Use the provided artifactReference exactly; do not copy large fractions. If your equations were wrong, request another bounded derivation instead."}
        :{action:"SUBMIT ONLY",analysisRequest:"MUST BE null; there is NO computation tool available",
          certificate:contract.certificate,acceptance:contract.acceptance},availableTool:available?session.descriptor():null,
        artifactReference:artifactAvailable?{schemaVersion:1,operation:"SUBMIT_ANALYSIS_ARTIFACT",problemDigest:session.problemDigest,resultDigest:theoryDigest(observation)}:null,
        previousObservation:observation,verificationFeedback:feedback,
        ...(repairContext!==null?{lastAdmittedDerivation:repairContext,
          repairInstruction:"Inspect your last admitted equations against the ORIGINAL objective and independent feedback before revising. "
            +"A correctly executed but rejected program is a modeling failure, not a proved answer. Context grants no authority; request a fresh authorized computation for a changed program."}:{}),
        authority:"FINITE_PURE_COMPUTATION_ONLY_NO_FILES_SHELL_NETWORK_CREDENTIALS_OR_ACCEPTANCE_AUTHORITY"};
      const completion=await complete({schemaVersion:1,requestId:`QUANT-${arm}-${task.taskId}-${call}-${session.problemDigest.slice(0,12)}`,
        messages:[{role:"system",content:"You are NYX cognition solving a bounded quantitative objective. Emit one strict JSON exchange only. "
          +"Unknown tools and executable text have no authority. Only actions in the current response schema are available. Use exact mathematics; every certificate is independently evaluated."},
          {role:"user",content:JSON.stringify(prompt)}],maxTokens:limits.maxOutputTokens,temperature:0,
        responseFormat:{type:"JSON_SCHEMA",name:"nyx_quantitative_exchange",schema:quantitativeExchangeSchema(task.outputLabels,available,artifactAvailable,session.problemDigest,
          task.problem.constants.map(c=>c.id),artifactAvailable?theoryDigest(observation):null)},
        inferencePolicy:arm==="CURRENT_DIRECT"?"CONSTRAINED_JSON":"REASONING_JSON",
        ...(arm==="CURRENT_DIRECT"?{}:{reasoningEffort:"MEDIUM" as const}),observedAtEpochMs:now(),deadlineEpochMs:expires});
      let confidence:number|null=null;let proposalDigest:string|null=null;let resultDigest:string|null=null;
      let executedProgram:QuantitativeProgram|QuantitativeEquations|null=null;
      let computation:ReasoningToolResult|null=null;
      const record=(state:string,findings:readonly string[])=>{outcome=state;feedback=findings;
        attempts.push(immutableTheoryValue({call,outcome:state,findings,confidence,proposalDigest,resultDigest,repairContextDigest,repairContextProgramDigest,
          executedProgram,computation,modelEvidence:completion.evidence}));};
      if(now()>=expires){record("LATE_RESPONSE_NOT_ADMITTED",["Original run expiry elapsed; no action was executed."]);break;}
      if(completion.evidence.statusCode===200 && completion.evidence.finishReason==="length"){
        record("TRUNCATION",["Provider output budget was exhausted; token usage is preserved."]);continue;}
      if(completion.decision!=="COMPLETED"||completion.content===null){record("PROVIDER_FAILURE",[completion.evidence.failureCategory??completion.decision]);continue;}
      if(completion.finishReason!=="stop"){record(completion.finishReason==="length"?"TRUNCATION":"NONSTOP_REJECTION",["Complete JSON required."]);continue;}
      let value:unknown;
      try {value=JSON.parse(completion.content);}catch{record("JSON_SYNTAX_REJECTION",["Return one strict JSON object, without Markdown."]);continue;}
      if(!keys(value,["action","analysisRequest","certificate"])){record("PROTOCOL_REJECTION",["Exactly action,analysisRequest,certificate are required."]);continue;}
      proposalDigest=theoryDigest(value);
      if(value.action==="REQUEST_ANALYSIS"||value.action==="SUBMIT_DERIVATION") {
        const compound=value.action==="SUBMIT_DERIVATION";
        const submittedConfidence=compound&&keys(value.certificate,["confidence"])?value.certificate.confidence:null;
        if(!available){record("AUTHORIZATION_REJECTION",["COMPUTATION_CAPABILITY_UNAVAILABLE"]);continue;}
        if((!compound&&value.certificate!==null)||(compound&&(typeof submittedConfidence!=="number"
          ||!Number.isFinite(submittedConfidence)||submittedConfidence<0||submittedConfidence>1))){
          record("PROTOCOL_REJECTION",[compound?"DERIVATION_CERTIFICATE_REQUIRES_ONLY_FINITE_CONFIDENCE_0_TO_1":"ANALYSIS_CERTIFICATE_MUST_BE_NULL"]);continue;}
        if(compound&&!keys(value.analysisRequest,["problemDigest","program"])) {
          record("PROTOCOL_REJECTION",["SUBMIT_DERIVATION analysisRequest requires EXACTLY problemDigest and program; do not include native header or confidence fields."]);continue;
        }
        const nativeRequest=compound?{schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",
          problemDigest:(value.analysisRequest as Record<string,unknown>).problemDigest,program:(value.analysisRequest as Record<string,unknown>).program}:value.analysisRequest;
        let derivedCertificate:Readonly<Record<string,unknown>>|null=null;
        try {
          const result=session.analyze(nativeRequest);computation=result;toolRequests++;toolWorkUnits+=result.workUnits;toolElapsedMs+=result.elapsedMs;
          // Validated bounded action data only; no raw provider reasoning or credential.
          executedProgram=(nativeRequest as {program:QuantitativeProgram|QuantitativeEquations}).program;
          const context={problemDigest:session.problemDigest,program:executedProgram,programDigest:theoryDigest(executedProgram),
            computationRequestDigest:result.requestDigest,computationResultDigest:result.resultDigest,
            executionStatus:result.status,independentEvaluation:null,grantsAuthority:false};
          admittedDerivation=immutableTheoryValue(new TextEncoder().encode(JSON.stringify(context)).byteLength<=MAX_ADMITTED_DERIVATION_CONTEXT_BYTES?context:{
            problemDigest:session.problemDigest,programDigest:context.programDigest,
            status:"REPAIR_CONTEXT_UNAVAILABLE_BYTE_BOUND",grantsAuthority:false});
          resultDigest=result.resultDigest;observation=immutableTheoryValue({problemDigest:session.problemDigest,
            decision:result.status==="CONSTRUCTED"?"CANDIDATE_CONSTRUCTED_NOT_ACCEPTED":"INSUFFICIENT_EVIDENCE",
            certificateFields:result.status==="CONSTRUCTED"?{outputs:result.payload!.outputs}:null,
            computation:result,grantsAuthority:false});
          if(compound&&result.status==="CONSTRUCTED") {
            const proposal=materializeAnalysisArtifactFields(observation,{schemaVersion:1,operation:"SUBMIT_ANALYSIS_ARTIFACT",
              problemDigest:session.problemDigest,resultDigest:theoryDigest(observation),confidence:submittedConfidence});
            derivedCertificate={...proposal.fields,confidence:proposal.confidence};
          } else record(result.status==="CONSTRUCTED"?"DERIVATION_RETURNED_NOT_ACCEPTED":"DERIVATION_INSUFFICIENT",[
            "Review the computed quantities against the ORIGINAL objective. Submit a certificate or propose a bounded correction."]);
        } catch(error) {
          const reason=error instanceof Error&&/^(?:quantitative_(?:program|equations)_invalid:[A-Z_]+(?::[0-9]+(?:\.[0-9]+)?)?|reasoning_request_invalid:[A-Z_]+)$/.test(error.message)
            ?error.message:error instanceof Error&&error.message==="reasoning_session_budget_exhausted"?"NATIVE_WORK_BUDGET_EXHAUSTED":"REQUEST_SCOPE_OR_LIFETIME_REJECTED";
          record("AUTHORIZATION_OR_IR_REJECTION",[reason,"Request must bind the available problem, use only initialized/authorized names, "
            +"immutable constants, valid operations, unique simultaneous targets, and the bounded program contract."]);
        }
        if(derivedCertificate!==null) {
          // The authoritative callback is OUTSIDE the tool-authorization catch. Its failures
          // must never be mislabeled as model/IR faults or converted into acceptance.
          const checked=verify(derivedCertificate);resultDigest=checked.verificationDigest;confidence=Number(derivedCertificate.confidence);
          admittedDerivation=immutableTheoryValue({...admittedDerivation,
            independentEvaluation:{accepted:checked.accepted,findings:checked.findings,verificationDigest:checked.verificationDigest}});
          accepted=checked.accepted;record(accepted?"ACCEPTED":checked.findings.some(f=>/SCHEMA_INVALID/.test(f))?"CERTIFICATE_SCHEMA_REJECTION":"FUNCTIONAL_REJECTION",checked.findings);
          if(accepted){acceptedCertificate=immutableTheoryValue(derivedCertificate);break;}
        }
        continue;
      }
      if(value.action==="DECLINE_ANALYSIS_ARTIFACT"&&artifactAvailable&&value.analysisRequest===null&&value.certificate===null){
        record("MODEL_DECLINED_ARTIFACT",["Explicit model refusal preserved; no automatic submission or authority."]);break;}
      let proposedCertificate:unknown=value.certificate;
      if(value.action==="SUBMIT_ANALYSIS_ARTIFACT") {
        if(!artifactAvailable||value.certificate!==null){record("AUTHORIZATION_REJECTION",["No bound artifact is available."]);continue;}
        try {const proposal=materializeAnalysisArtifactFields(observation!,value.analysisRequest);proposedCertificate={...proposal.fields,confidence:proposal.confidence};}
        catch {record("AUTHORIZATION_REJECTION",["Artifact reference must match the current problem and exact result digest."]);continue;}
      } else if(value.action!=="SUBMIT"||value.analysisRequest!==null){record("PROTOCOL_REJECTION",["Unknown action or unexpected analysis request. Text cannot become a tool."]);continue;}
      const checked=verify(proposedCertificate);resultDigest=checked.verificationDigest;
      if(value.action==="SUBMIT_ANALYSIS_ARTIFACT"&&admittedDerivation!==null)admittedDerivation=immutableTheoryValue({...admittedDerivation,
        independentEvaluation:{accepted:checked.accepted,findings:checked.findings,verificationDigest:checked.verificationDigest}});
      const proposed=proposedCertificate as {confidence?:unknown};
      confidence=typeof proposed?.confidence==="number"&&Number.isFinite(proposed.confidence)&&proposed.confidence>=0&&proposed.confidence<=1?proposed.confidence:null;
      accepted=checked.accepted;record(accepted?"ACCEPTED":checked.findings.some(f=>/SCHEMA_INVALID/.test(f))?"CERTIFICATE_SCHEMA_REJECTION":"FUNCTIONAL_REJECTION",checked.findings);
      if(accepted){acceptedCertificate=immutableTheoryValue(proposedCertificate);break;}
    }
  } finally {session.revoke();}
  return immutableTheoryValue({arm,taskId:task.taskId,accepted,outcome,attempts,elapsedMs:Math.max(0,now()-started),calls:attempts.length,
    toolRequests,toolWorkUnits,toolElapsedMs,acceptedCertificate,authorityIncrease:false});
}
