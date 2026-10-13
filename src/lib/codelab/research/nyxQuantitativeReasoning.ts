import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult, NvidiaNimEvidence } from "../model/nvidiaNimProvider";
import { BoundedReasoningSession,snapshotBoundedReasoningData,type ReasoningToolResult } from "./boundedReasoningWorkbench";
import { EXACT_DERIVATION_OPERATIONS,EXACT_DERIVATION_POLICY,type QuantitativeProblem,type QuantitativeProgram } from "./exactQuantitativeDerivation";
import { equationNames,EQUATION_COMPILER_POLICY,type QuantitativeEquations } from "./quantitativeEquationCompiler";
import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import { materializeAnalysisArtifactFields } from "./analysisArtifactReference";
import { BoundQuantitativeProcedure } from "./quantitativeProcedureReuse";
import { quantitativeExpressionSchema, EXPRESSION_COMPILER_POLICY, type QuantitativeExpressionGraph } from "./quantitativeExpressionCompiler";
import { quantitativeAlgebraicSchema, ALGEBRAIC_COMPILER_POLICY, ALGEBRAIC_EMISSION_POLICY, algebraicEmissionDiagnostic,
  type AlgebraicEmissionDiagnostic, type QuantitativeAlgebraicForm } from "./quantitativeAlgebraicCompiler";
import { SemanticPolynomialSession, SEMANTIC_POLYNOMIAL_POLICY, type SemanticPolynomialTask } from "./semanticPolynomialProof";
import { ScientificModelSession, SCIENTIFIC_MODEL_POLICY, type ScientificModelDraft, type ScientificModelRef, type ScientificDerivationVerifier } from "./scientificModelGeneration";
import { scientificStructureSchema, SCIENTIFIC_FIT_POLICY, type ScientificModelStructure, type ScientificFitVerifier } from "./scientificModelFit";

/** Existing NYX cognition proposes models, not choices from a host answer list.
 * Independently checked point derivations remain hypotheses until prospective
 * evidence, and actual experiments still require their own Omega capability.
 */
export async function runNyxScientificModelGeneration(input:{readonly session:ScientificModelSession;
  readonly complete:(request:NvidiaNimCompletionRequest)=>Promise<NvidiaNimCompletionResult>;
  readonly verify:ScientificDerivationVerifier;readonly maxCalls:number;readonly maxOutputTokens:number;
  readonly deadlineEpochMs:number;readonly now?:()=>number;readonly nativeFit?:{readonly verify:ScientificFitVerifier}}){
  const now=input.now??Date.now,start=now(),task=input.session.task,deadline=Math.min(input.deadlineEpochMs,task.objective.expiryEpochMs,input.session.expiresAtEpochMs);
  if(!Number.isSafeInteger(input.maxCalls)||input.maxCalls<1||input.maxCalls>4||!Number.isSafeInteger(input.maxOutputTokens)
    ||input.maxOutputTokens<128||input.maxOutputTokens>8192||!Number.isSafeInteger(deadline)||deadline<=start||deadline>start+600000
    ||typeof input.complete!=="function"||typeof input.verify!=="function"
    ||input.nativeFit!==undefined&&(typeof input.nativeFit!=="object"||!input.nativeFit||typeof input.nativeFit.verify!=="function"))throw Error("scientific_generation_configuration_invalid");
  const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  const statements={type:"array",minItems:1,maxItems:5,items:{type:"string",minLength:1,maxLength:160}};
  const draftSchema=object({schemaVersion:{type:"integer",enum:[1]},parameters:{type:"array",minItems:0,maxItems:16,
    items:object({id:{type:"string",pattern:"^[A-Za-z][A-Za-z0-9_]{0,47}$"},value:{type:"string",maxLength:260,pattern:"^-?(0|[1-9][0-9]*)(/[1-9][0-9]*)?$"}})},
    program:quantitativeAlgebraicSchema(["response"],true),assumptions:statements,uncertainties:statements});
  const schema=object({schemaVersion:{type:"integer",enum:[1]},models:{type:"array",minItems:2,maxItems:4,items:input.nativeFit?scientificStructureSchema():draftSchema}});
  const models:ScientificModelRef[]=[],attempts:{call:number;outcome:string;modelEvidence:NvidiaNimEvidence;
    proposals:{state:string;reason:string|null;contradictedObservationIds:readonly string[];resultDigest:string;modelId:string|null;
      emissionBoundary?:string;fit?:{state:string;linearState:string|null;rank:number|null;resultDigest:string}}[]}[]=[];
  let previous:readonly (ScientificModelDraft|ScientificModelStructure)[]|null=null,feedback:unknown=null,sessionStopped=false;
  for(let call=1;call<=input.maxCalls&&now()<deadline&&models.length<2&&!sessionStopped&&input.session.usage().remainingRequests>=(input.nativeFit?2:1);call++){
    const result=await input.complete({schemaVersion:1,requestId:`NYX-SCIENCE-MODELS-${input.session.taskDigest.slice(0,16)}-${call}`,
      messages:[{role:"system",content:(input.nativeFit?"You are NYX cognition investigating a scientific objective under Omega. Author two genuinely competing mathematical structures. "
        +"Return the strict structure JSON contract. You choose all basis functions and structure, never a prewritten model list. "
        +"Each basis output label names a distinct coefficient, partitioned exactly into numerator and denominator. "
        +"The proposed response is sum(numerator coefficients times their basis outputs) divided by a named nonzero original constant plus sum(denominator coefficients times their basis outputs). "
        +"The bounded native tool fits coefficients ONLY from admitted measurements; rank deficiency returns uncertainty, not guessed free coefficients. "
        +"Use only original variables/constants and earlier definitions in the basis, + - * / and parentheses, no numeric literals, powers, host code or private reasoning. "
        +"No coefficient name may shadow an original binding or definition. Supply genuine assumptions and uncertainties. "
        +"Fitting and arithmetic do not establish scientific truth, novelty, or authority. Prospective experiments remain independently authorized."
        :"You are NYX cognition investigating a scientific objective under Omega. Propose two genuinely competing mathematical models consistent with the admitted measurements. "
        +"Return the strict model JSON contract, not an executable script or a success claim. Models are deterministic rational response functions over the declared inputs. "
        +"Use only named variables/constants/your explicit rational parameters; use + - * / and parentheses, no numeric literals in expressions, powers, host code or private reasoning. "
        +"Every model must include genuine assumptions and unresolved uncertainty. Training fit and correct arithmetic do not prove scientific truth. If candidate models cannot be discriminated, preserve that uncertainty.")},
      {role:"user",content:JSON.stringify({task,policy:SCIENTIFIC_MODEL_POLICY,previousCandidates:previous,feedback,...(input.nativeFit?{nativeFitPolicy:SCIENTIFIC_FIT_POLICY}: {})})}],
      maxTokens:input.maxOutputTokens,temperature:0,inferencePolicy:"REASONING_JSON",reasoningEffort:"MEDIUM",
      responseFormat:{type:"JSON_SCHEMA",name:"nyx_scientific_model_proposals",schema},observedAtEpochMs:now(),deadlineEpochMs:deadline});
    const evidence=snapshotBoundedReasoningData(result.evidence),proposals:typeof attempts[number]["proposals"]=[];
    const record=(outcome:string)=>attempts.push({call,outcome,modelEvidence:evidence,proposals});
    if(now()>=deadline){record("LATE_RESPONSE_NOT_ADMITTED");break;}
    if(result.finishReason==="length"){record("TRUNCATION");feedback={reason:"COMPLETE_JSON_REQUIRED"};continue;}
    if(result.decision!=="COMPLETED"||result.content===null){record("PROVIDER_FAILURE");feedback={reason:"DELIVERY_NOT_REASONING_FAILURE"};continue;}
    if(result.finishReason!=="stop"){record("NONSTOP_REJECTION");continue;}
    let parsed:{schemaVersion:1;models:(ScientificModelDraft|ScientificModelStructure)[]};
    try{parsed=snapshotBoundedReasoningData(JSON.parse(result.content));
      if(!keys(parsed,["schemaVersion","models"])||parsed.schemaVersion!==1||!Array.isArray(parsed.models)||parsed.models.length<2||parsed.models.length>4)throw Error("shape");}
    catch{record("JSON_OR_DATA_REJECTION");feedback={reason:"STRICT_COMPLETE_MODEL_CONTRACT_REQUIRED"};continue;}
    previous=parsed.models;
    for(const proposed of parsed.models){
      if(now()>=deadline||input.session.usage().remainingRequests===0)break;
      let admitted:ReturnType<ScientificModelSession["propose"]>;
      let draft=proposed as ScientificModelDraft,fitMeta:typeof proposals[number]["fit"];
      try{
        if(input.nativeFit){
          const fitted=input.session.fit({schemaVersion:1,operation:"FIT_SCIENTIFIC_MODEL",taskDigest:input.session.taskDigest,structure:proposed},input.nativeFit.verify);
          fitMeta={state:fitted.state,linearState:"fit"in fitted?fitted.fit.linear.state:fitted.linearState??null,
            rank:"fit"in fitted?fitted.fit.linear.rank:fitted.rank??null,resultDigest:fitted.resultDigest};
          if(fitted.state!=="FITTED_CANDIDATE_NOT_ADMITTED"||input.session.usage().remainingRequests===0){
            proposals.push({state:fitted.state==="FITTED_CANDIDATE_NOT_ADMITTED"?"INSUFFICIENT_EVIDENCE":fitted.state,
              reason:"reason"in fitted?fitted.reason:"PROPOSAL_BUDGET_EXHAUSTED",contradictedObservationIds:[],resultDigest:fitted.resultDigest,modelId:null,
              fit:fitMeta,...("emissionBoundary"in fitted?{emissionBoundary:fitted.emissionBoundary}: {})});continue;
          }
          draft=fitted.fit.draft!;
        }
        admitted=input.session.propose({schemaVersion:1,operation:"PROPOSE_SCIENTIFIC_MODEL",taskDigest:input.session.taskDigest,draft},input.verify);
      }
      catch{sessionStopped=true;break;}
      proposals.push({state:admitted.state,reason:"reason"in admitted?admitted.reason:null,
        contradictedObservationIds:"contradictedObservationIds"in admitted?admitted.contradictedObservationIds:[],resultDigest:admitted.resultDigest,
        modelId:"model"in admitted?admitted.model.modelId:null,...(fitMeta?{fit:fitMeta}: {}),
        ...("emissionBoundary"in admitted?{emissionBoundary:admitted.emissionBoundary}: {})});
      if(admitted.state==="ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH")models.push(admitted.model);
    }
    record(sessionStopped?"SESSION_UNAVAILABLE":models.length>=2?"COMPETING_MODEL_DERIVATIONS_ADMITTED":"MODEL_PROPOSALS_NOT_ADMITTED");feedback=proposals;
  }
  return Object.freeze({version:input.nativeFit?"nyx-scientific-model-generation/native-fit-1":"nyx-scientific-model-generation/1",taskDigest:input.session.taskDigest,models:Object.freeze(models),
    attempts:immutableTheoryValue(attempts),calls:attempts.length,firstAttemptAdmitted:attempts[0]?.outcome==="COMPETING_MODEL_DERIVATIONS_ADMITTED",
    competingModelsAdmitted:models.length>=2,nativeUsage:input.session.usage(),elapsedMs:Math.max(0,now()-start),
    scientificTruthEstablished:false as const,cognitiveGainDemonstrated:false as const,authorityGranted:false as const,
    generalShell:false as const,generalNetwork:false as const,productionAuthority:false as const});
}

export type QuantitativeArm = "CURRENT_DIRECT" | "REASONING_MEDIUM" | "REASONING_WITH_WORKBENCH";
export interface QuantitativeRunLimits { readonly maxCalls: number; readonly maxOutputTokens: number;
  readonly maxTaskMs: number; readonly expiresAtEpochMs: number; readonly maxToolRequests: number;
  readonly maxToolWorkUnits: number; readonly maxToolElapsedMs: number }
export interface QuantitativeAcceptance { readonly accepted: boolean; readonly findings: readonly string[];
  readonly verificationDigest: string }

/** The same NYX cognition/provider boundary, now operating immutable symbolic
 * construction goals. Not a new model controller, provider or executor. The
 * independent evaluator is supplied by the trusted host, never the model.
 */
export async function runNyxSemanticProofTask(input: {
  readonly task: SemanticPolynomialTask;
  readonly complete: (request: NvidiaNimCompletionRequest) => Promise<NvidiaNimCompletionResult>;
  readonly verify: (task: SemanticPolynomialTask, candidate: QuantitativeAlgebraicForm) => QuantitativeAcceptance;
  readonly limits: QuantitativeRunLimits;
  readonly obligationGuidance: boolean;
  readonly now?: () => number;
}) {
  const now = input.now ?? Date.now, limits = snapshotBoundedReasoningData(input.limits), start = now();
  if (!keys(limits, ["maxCalls", "maxOutputTokens", "maxTaskMs", "expiresAtEpochMs", "maxToolRequests", "maxToolWorkUnits", "maxToolElapsedMs"])
    || !Number.isSafeInteger(limits.maxCalls) || limits.maxCalls < 1 || limits.maxCalls > 4
    || !Number.isSafeInteger(limits.maxOutputTokens) || limits.maxOutputTokens < 128 || limits.maxOutputTokens > 8192
    || !Number.isSafeInteger(limits.maxTaskMs) || limits.maxTaskMs < 1000 || limits.maxTaskMs > 600000
    || typeof input.obligationGuidance !== "boolean" || typeof input.complete !== "function" || typeof input.verify !== "function")
    throw Error("semantic_nyx_configuration_invalid");
  const deadline = Math.min(limits.expiresAtEpochMs, start + limits.maxTaskMs);
  const session = SemanticPolynomialSession.create(input.task, { maxRequests: limits.maxToolRequests,
    maxWorkUnits: limits.maxToolWorkUnits, maxElapsedMs: limits.maxToolElapsedMs, expiresAtEpochMs: deadline }, now);
  const task = session.task;
  let previous: QuantitativeAlgebraicForm | null = null, parent: string | null = null, accepted = false;
  let feedback: unknown = null, acceptedCandidate: QuantitativeAlgebraicForm | null = null;
  const independentFailures: { candidateDigest: string; findings: readonly string[]; verificationDigest: string }[] = [];
  const attempts: { call: number; outcome: string; candidateDigest: string | null; resultDigest: string | null;
    independentVerificationDigest: string | null; modelEvidence: NvidiaNimEvidence }[] = [];
  try {
    for (let call = 1; call <= limits.maxCalls && now() < deadline; call++) {
      const completion = await input.complete({ schemaVersion: 1, requestId: `NYX-SEMANTIC-${session.problemDigest.slice(0,16)}-${call}`,
        messages: [{ role: "system", content: "You are NYX cognition constructing a mathematical candidate under Omega. "
          + "Return one strict algebraic-form JSON object using only the original symbols/constants. "
          + "Every required output is an expression, not a claim of success. No numeric literals, powers, Markdown, executable text or private reasoning. "
          + "A verifier's exact counterexample refutes a candidate, not the existence of a solution. Revise the mathematical construction; do not change its task." },
        { role: "user", content: JSON.stringify({ task, policy: SEMANTIC_POLYNOMIAL_POLICY,
          previousCandidate: previous, feedback, independentFailures, ...(input.obligationGuidance ? { obligations: session.workPacket(),
            searchInstruction: "Preserve verified independent subgoals whose candidate dependencies are unchanged. "
              + "Prioritize falsified/eligible obligations; revise the global construction when its model is wrong, not just its formatting." } : {}) }) }],
        maxTokens: limits.maxOutputTokens, temperature: 0, inferencePolicy: "REASONING_JSON", reasoningEffort: "MEDIUM",
        responseFormat: { type: "JSON_SCHEMA", name: "nyx_semantic_polynomial_candidate", schema: quantitativeAlgebraicSchema(task.outputLabels, true) },
        observedAtEpochMs: now(), deadlineEpochMs: deadline });
      const evidence = snapshotBoundedReasoningData(completion.evidence);
      const record = (outcome: string, candidateDigest: string | null = null, resultDigest: string | null = null,
        independentVerificationDigest: string | null = null) => attempts.push({ call, outcome, candidateDigest, resultDigest, independentVerificationDigest, modelEvidence: evidence });
      if (now() >= deadline) { record("LATE_RESPONSE_NOT_ADMITTED"); break; }
      if (completion.finishReason === "length") { record("TRUNCATION"); feedback = { reason: "COMPLETE_JSON_REQUIRED" }; continue; }
      if (completion.decision !== "COMPLETED" || completion.content === null) { record("PROVIDER_FAILURE"); feedback = { reason: "PROVIDER_DELIVERY_FAILURE_NOT_REASONING" }; continue; }
      if (completion.finishReason !== "stop") { record("NONSTOP_REJECTION"); continue; }
      let candidate: QuantitativeAlgebraicForm;
      try { candidate = snapshotBoundedReasoningData(JSON.parse(completion.content)); }
      catch { record("JSON_OR_DATA_REJECTION"); feedback = { reason: "STRICT_DATA_JSON_REQUIRED" }; continue; }
      const candidateDigest = theoryDigest(candidate);
      let result: ReturnType<SemanticPolynomialSession["analyze"]>;
      try { result = session.analyze({ schemaVersion: 1, operation: "CHECK_POLYNOMIAL_CANDIDATE",
        problemDigest: session.problemDigest, parentResultDigest: parent, program: candidate }); }
      catch { record("AUTHORIZATION_OR_IR_REJECTION", candidateDigest); feedback = { reason: "ORIGINAL_SYMBOLS_OUTPUTS_AND_BOUNDED_FORM_REQUIRED" }; continue; }
      if ("state" in result) { record("NATIVE_INSUFFICIENT_EVIDENCE", candidateDigest); feedback = { reason: result.reason }; continue; }
      previous = candidate; parent = result.resultDigest; feedback = result.observations;
      if (result.workPacket.acceptanceState !== "ACCEPTABLE") { record("SEMANTIC_REFUTATION", candidateDigest, parent); continue; }
      if (now() >= deadline) { record("LATE_VERIFICATION_NOT_ADMITTED", candidateDigest, parent); break; }
      const independent = snapshotBoundedReasoningData(input.verify(task, candidate));
      if (!keys(independent, ["accepted", "findings", "verificationDigest"]) || typeof independent.accepted !== "boolean"
        || !Array.isArray(independent.findings) || independent.findings.length > 32
        || independent.findings.some(f => typeof f !== "string" || f.length > 1000) || !/^[a-f0-9]{64}$/.test(independent.verificationDigest))
        throw Error("semantic_independent_verifier_contract_invalid");
      if (now() >= deadline) { record("LATE_VERIFICATION_NOT_ADMITTED", candidateDigest, parent); break; }
      // A later positive vote for the identical artifact cannot erase an owned
      // falsification. Real evaluator corrections require a separately frozen
      // context/epoch, not a silently successful retry inside this run.
      const contradicted = independentFailures.some(f => f.candidateDigest === candidateDigest);
      accepted = independent.accepted && !contradicted;
      if (!independent.accepted) independentFailures.push({ candidateDigest, findings: independent.findings,
        verificationDigest: independent.verificationDigest });
      record(accepted ? "ACCEPTED" : independent.accepted && contradicted ? "INDEPENDENT_VERIFIER_CONFLICT"
        : "INDEPENDENT_VERIFICATION_REJECTION", candidateDigest, parent, independent.verificationDigest);
      if (accepted) { acceptedCandidate = candidate; break; }
      feedback = { native: result.observations, independent: independent.findings };
    }
    const usage = session.usage();
    return immutableTheoryValue({ version: "nyx-semantic-proof-loop/1", taskDigest: session.problemDigest,
      accepted, firstAttemptAccepted: attempts[0]?.outcome === "ACCEPTED", attempts, independentFailures, calls: attempts.length,
      acceptedCandidate, nativeUsage: usage, elapsedMs: Math.max(0, now()-start), deadlineEpochMs: deadline,
      authorityIncrease: false, generalShell: false, generalNetwork: false, productionAuthority: false,
      cognitivePromotion: "UNVERIFIED_REQUIRES_FRESH_MATCHED_COMPARISON" });
  } finally { session.revoke(); }
}
export interface QuantitativeAttempt { readonly call: number; readonly outcome: string; readonly findings: readonly string[];
  readonly nativeRejectionStructure?: QuantitativeRejectionStructure;
  readonly algebraicEmissionDiagnostic?: AlgebraicEmissionDiagnostic;
  readonly outputStructure?: QuantitativeOutputStructure;
  readonly cognitiveStage?: "OMEGA_INTENT"|"MODEL_FORMULATION";
  readonly formulationArtifactDigest?:string|null;
  readonly formulationStructure?:QuantitativeModelFormulationStructure;
  readonly proposalDigest: string | null; readonly resultDigest: string | null; readonly confidence: number | null;
  readonly repairContextDigest?:string|null;
  readonly repairContextProgramDigest?:string|null;
  readonly executedProgram:QuantitativeProgram|QuantitativeEquations|QuantitativeExpressionGraph|QuantitativeAlgebraicForm|null;
  readonly computation:ReasoningToolResult|null;
  readonly procedureReference?: Readonly<{ procedureId: string; programDigest: string; scopeDigest: string }>;
  readonly modelEvidence: NvidiaNimEvidence }
export interface QuantitativeRun {
  readonly arm: QuantitativeArm; readonly taskId: string; readonly accepted: boolean; readonly outcome: string;
  readonly attempts: readonly QuantitativeAttempt[]; readonly elapsedMs: number; readonly calls: number;
  readonly toolRequests: number; readonly toolWorkUnits: number; readonly toolElapsedMs: number;
  readonly acceptedCertificate: unknown; readonly authorityIncrease: false;
}
function keys(v: unknown,names:string[]): v is Record<string,unknown> {return !!v && typeof v==="object" && !Array.isArray(v)
  && Object.keys(v).sort().join("\0")===names.sort().join("\0");}
export const OBJECTIVE_OUTPUT_POLICY=Object.freeze({version:"nyx-objective-output-contract/1",maxOutputs:16,
  authorityGranted:false,mathematicsSupplied:false,orderingRequired:false});
export interface QuantitativeOutputStructure {
  readonly version:string; readonly origin:"PROGRAM_OUTPUTS"|"CERTIFICATE_OUTPUTS";
  readonly matches:boolean; readonly inputState:"ARRAY"|"NOT_ARRAY"|"UNINSPECTABLE_DATA";
  readonly expectedCount:number; readonly actualCount:number|null; readonly inspectedCount:number;
  readonly missingLabels:number; readonly duplicateLabels:number; readonly unexpectedLabels:number;
  readonly malformedEntries:number; readonly inspectionComplete:boolean;
}
function objectiveLabels(value:readonly string[]):readonly string[]{
  let owned:unknown;try{owned=snapshotBoundedReasoningData(value);}catch{throw Error("quantitative_objective_labels_invalid");}
  if(!Array.isArray(owned)||owned.length<1||owned.length>OBJECTIVE_OUTPUT_POLICY.maxOutputs
    ||!owned.every(v=>typeof v==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(v))||new Set(owned).size!==owned.length)
    throw Error("quantitative_objective_labels_invalid");
  return immutableTheoryValue(owned);
}
/** Counts-only structural diagnosis. It never inspects numerical values, fixes
 * labels, inserts missing outputs, reorders proposals or establishes correctness.
 * Reuse the existing plain-data/byte guard; hostile accessors are never read.
 */
export function quantitativeOutputStructure(labels:readonly string[],outputs:unknown,
  origin:QuantitativeOutputStructure["origin"]="PROGRAM_OUTPUTS"):QuantitativeOutputStructure {
  if(!["PROGRAM_OUTPUTS","CERTIFICATE_OUTPUTS"].includes(origin))throw Error("quantitative_output_origin_invalid");
  const expected=new Set(objectiveLabels(labels));let owned:unknown,inputState:QuantitativeOutputStructure["inputState"]="ARRAY";
  try{owned=snapshotBoundedReasoningData(outputs);}catch{inputState="UNINSPECTABLE_DATA";}
  if(inputState==="ARRAY"&&!Array.isArray(owned))inputState="NOT_ARRAY";
  const entries=Array.isArray(owned)?owned:[],seen=new Set<string>();let duplicateLabels=0,unexpectedLabels=0,malformedEntries=0;
  for(const entry of entries.slice(0,OBJECTIVE_OUTPUT_POLICY.maxOutputs)){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||typeof entry.label!=="string"){malformedEntries++;continue;}
    if(seen.has(entry.label))duplicateLabels++;seen.add(entry.label);if(!expected.has(entry.label))unexpectedLabels++;
  }
  const missingLabels=[...expected].filter(label=>!seen.has(label)).length;
  const inspectionComplete=inputState==="ARRAY"&&entries.length<=OBJECTIVE_OUTPUT_POLICY.maxOutputs;
  return immutableTheoryValue({version:OBJECTIVE_OUTPUT_POLICY.version,origin,inputState,expectedCount:expected.size,
    actualCount:inputState==="ARRAY"?entries.length:null,inspectedCount:Math.min(entries.length,OBJECTIVE_OUTPUT_POLICY.maxOutputs),
    missingLabels,duplicateLabels,unexpectedLabels,malformedEntries,inspectionComplete,
    matches:inspectionComplete&&entries.length===expected.size&&missingLabels===0&&duplicateLabels===0&&unexpectedLabels===0&&malformedEntries===0});
}
export interface QuantitativeRejectionStructure {
  readonly format: "EQUATIONS_V2" | "OTHER";
  readonly cycleCount: number | null;
  readonly inspectedCycles: number;
  readonly phases: readonly { readonly cycle: number; readonly phase: number; readonly fieldShapeValid: boolean;
    readonly expressionCount: number | null; readonly updateCount: number | null; readonly inspectedExpressions: number;
    readonly malformedExpressions: number; readonly duplicateExpressionIds: number; readonly unknownExpressionIds: number }[];
}
/** Input comes ONLY from parsed JSON or an owned procedure, not executable host
 * objects. Preserve bounded shape measurements, never arbitrary names/source or
 * values. Counts beyond the inspection ceiling remain explicitly uninspected.
 * This observes rejection; it never repairs, validates or authorizes a program.
 */
function rejectedProgramStructure(program: unknown, constantIds: readonly string[]): QuantitativeRejectionStructure {
  const p = program as {schemaVersion?:unknown;cycles?:unknown};
  if (!p || p.schemaVersion!==2) return {format:"OTHER",cycleCount:null,inspectedCycles:0,phases:[]};
  const cycles = Array.isArray(p.cycles)?p.cycles:[], phases: QuantitativeRejectionStructure["phases"][number][]=[];
  const allowed = new Set(equationNames(constantIds).expressions);
  for (const [cycle,c] of cycles.slice(0,16).entries()) {
    if (!c || !Array.isArray(c.phases)) continue;
    for (const [phase,s] of c.phases.slice(0,8).entries()) {
      const expressions = Array.isArray(s?.expressions)?s.expressions:[], seen=new Set<string>();
      let malformedExpressions=0,duplicateExpressionIds=0,unknownExpressionIds=0;
      for (const e of expressions.slice(0,32)) {
        if(!keys(e,["id","op","left","right"]) || typeof e.op!=="string"
          || !(EXACT_DERIVATION_OPERATIONS as readonly string[]).includes(e.op)) malformedExpressions++;
        const id=e?.id;
        if(typeof id!=="string"||!allowed.has(id))unknownExpressionIds++;
        if(typeof id==="string"){if(seen.has(id))duplicateExpressionIds++;seen.add(id);}
      }
      phases.push({cycle,phase,fieldShapeValid:keys(s,["expressions","updates"]),
        expressionCount:Array.isArray(s?.expressions)?s.expressions.length:null,
        updateCount:Array.isArray(s?.updates)?s.updates.length:null,inspectedExpressions:Math.min(expressions.length,32),
        malformedExpressions,duplicateExpressionIds,unknownExpressionIds});
    }
  }
  return {format:"EQUATIONS_V2",cycleCount:Array.isArray(p.cycles)?p.cycles.length:null,inspectedCycles:Math.min(cycles.length,16),phases};
}
const MAX_ADMITTED_DERIVATION_CONTEXT_BYTES=12000;
const MAX_MODEL_FORMULATION_BYTES=4096;
export interface QuantitativeModelFormulationStructure {
  readonly version:"nyx-public-formulation-diagnosis/1";
  readonly structurallyValid:boolean;readonly inspectionComplete:boolean;
  readonly problemBinding:"MATCH"|"MISMATCH"|"MALFORMED"|"UNINSPECTABLE";
  readonly byteCount:number|null;readonly expectedOutputs:number;readonly actualEquations:number|null;
  readonly inspectedEquations:number;readonly malformedEquations:number;readonly emptyExpressions:number;
  readonly missingLabels:number;readonly duplicateLabels:number;readonly unexpectedLabels:number;
  readonly assumptionCount:number|null;readonly inspectedAssumptions:number;readonly malformedAssumptions:number;
  readonly reasons:readonly string[];readonly grantsAuthority:false;
}
/** Observation only. No proposed equations, assumptions, labels, values or
 * digests leave this bounded inspector. The original admission predicate below
 * remains authoritative; this detector never repairs a proposal or adds feedback. */
export function quantitativeModelFormulationStructure(problemDigest:string,labels:readonly string[],value:unknown):QuantitativeModelFormulationStructure {
  const expected=objectiveLabels(labels);let owned:unknown;
  try{owned=snapshotBoundedReasoningData(value);}catch{
    return immutableTheoryValue({version:"nyx-public-formulation-diagnosis/1",structurallyValid:false,inspectionComplete:false,
      problemBinding:"UNINSPECTABLE",byteCount:null,expectedOutputs:expected.length,actualEquations:null,
      inspectedEquations:0,malformedEquations:0,emptyExpressions:0,missingLabels:expected.length,duplicateLabels:0,unexpectedLabels:0,
      assumptionCount:null,inspectedAssumptions:0,malformedAssumptions:0,reasons:["UNINSPECTABLE_DATA"],grantsAuthority:false});
  }
  const p=owned&&typeof owned==="object"&&!Array.isArray(owned)?owned as Record<string,unknown>:null,reasons:string[]=[];
  const shape=keys(owned,["problemDigest","equations","assumptions"]);
  if(!shape)reasons.push("OBJECT_SHAPE");
  const problemBinding=typeof p?.problemDigest!=="string"?"MALFORMED":p.problemDigest===problemDigest?"MATCH":"MISMATCH";
  if(problemBinding!=="MATCH")reasons.push("PROBLEM_BINDING");
  const equations=Array.isArray(p?.equations)?p.equations:[],outputs=quantitativeOutputStructure(expected,p?.equations);
  if(!Array.isArray(p?.equations))reasons.push("EQUATION_CONTAINER");
  if(equations.length!==expected.length)reasons.push("EQUATION_COUNT");
  let malformedEquations=0,emptyExpressions=0;
  for(const e of equations.slice(0,OBJECTIVE_OUTPUT_POLICY.maxOutputs)){
    if(!keys(e,["label","expression"])||typeof e.label!=="string"||typeof e.expression!=="string")malformedEquations++;
    if(typeof e?.expression==="string"&&!e.expression.trim())emptyExpressions++;
  }
  if(malformedEquations)reasons.push("EQUATION_SHAPE");
  if(emptyExpressions)reasons.push("EMPTY_EXPRESSION");
  if(outputs.missingLabels||outputs.duplicateLabels||outputs.unexpectedLabels||outputs.malformedEntries)reasons.push("OUTPUT_LABEL_SET");
  const assumptions=Array.isArray(p?.assumptions)?p.assumptions:[];
  if(!Array.isArray(p?.assumptions))reasons.push("ASSUMPTION_CONTAINER");
  if(assumptions.length>8)reasons.push("ASSUMPTION_COUNT");
  const malformedAssumptions=assumptions.slice(0,8).filter(v=>typeof v!=="string"||!v.trim()).length;
  if(malformedAssumptions)reasons.push("ASSUMPTION_CONTENT");
  const byteCount=new TextEncoder().encode(JSON.stringify(owned)).byteLength;
  if(byteCount>MAX_MODEL_FORMULATION_BYTES)reasons.push("BYTE_BOUND");
  const inspectionComplete=outputs.inspectionComplete&&Array.isArray(p?.assumptions)&&assumptions.length<=8;
  return immutableTheoryValue({version:"nyx-public-formulation-diagnosis/1",structurallyValid:inspectionComplete&&reasons.length===0,
    inspectionComplete,problemBinding,byteCount,expectedOutputs:expected.length,actualEquations:Array.isArray(p?.equations)?equations.length:null,
    inspectedEquations:outputs.inspectedCount,malformedEquations,emptyExpressions,missingLabels:outputs.missingLabels,
    duplicateLabels:outputs.duplicateLabels,unexpectedLabels:outputs.unexpectedLabels,
    assumptionCount:Array.isArray(p?.assumptions)?assumptions.length:null,inspectedAssumptions:Math.min(assumptions.length,8),
    malformedAssumptions,reasons,grantsAuthority:false});
}
/** Public mathematical artifact, NOT private reasoning, executable syntax, or a certificate. */
export function quantitativeModelFormulationSchema(problemDigest:string,labels:readonly string[],boundedCollections=false){
  if(typeof boundedCollections!=="boolean")throw Error("quantitative_formulation_bounds_setting_invalid");
  const requiredLabels=boundedCollections?objectiveLabels(labels):labels;
  const object=<T extends Record<string,unknown>>(properties:T)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  return object({problemDigest:{type:"string",enum:[problemDigest]},
    equations:{type:"array",...(boundedCollections?{minItems:requiredLabels.length,maxItems:requiredLabels.length}:{}),
      items:object({label:{type:"string",enum:requiredLabels},expression:{type:"string",...(boundedCollections?{minLength:1}:{})}})},
    assumptions:{type:"array",...(boundedCollections?{maxItems:8}:{}),items:{type:"string",...(boundedCollections?{minLength:1}:{})}}});
}
/** Legacy guidance uses structural keywords; stricter collection bounds are opt-in.
 * Native semantic and whole-program resource validation always remain independent. */
export function quantitativeProgramSchema(labels:readonly string[],constantIds:readonly string[],boundedCollections=false,exactOutputs=false) {
  if(typeof boundedCollections!=="boolean"||typeof exactOutputs!=="boolean")throw Error("quantitative_generation_profile_invalid");
  const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  // Opt-in generation constraints mirror, never replace or relax, native validation.
  // Hosted support is empirical; a provider rejection must not silently fall back.
  const array=(items:unknown,min=0,max:number=EQUATION_COMPILER_POLICY.stateSlots)=>({type:"array",items,...(boundedCollections?{minItems:min,maxItems:max}:{})});
  const constant=(value:string|number)=>({type:typeof value==="number"?"integer":"string",enum:[value]});
  const {state:slots,expressions}=equationNames(constantIds);
  const registerId={type:"string",enum:slots};const source={type:"string",enum:[...constantIds,...slots]};
  const expressionSource={type:"string",enum:[...constantIds,...slots,...expressions]};
  return object({schemaVersion:constant(2),initialState:array(object({slot:registerId,source:{type:"string",enum:constantIds}})),
    cycles:array(object({iterations:{type:"integer",...(boundedCollections?{minimum:1,maximum:EXACT_DERIVATION_POLICY.maxIterations}:{})},phases:array(object({
      expressions:array(object({id:{type:"string",enum:expressions},op:{type:"string",enum:EXACT_DERIVATION_OPERATIONS},left:expressionSource,right:expressionSource})),
      updates:array(object({slot:registerId,source:expressionSource}),1)}),1,EQUATION_COMPILER_POLICY.maxPhasesPerCycle)}),1,EQUATION_COMPILER_POLICY.maxCycles),
    outputs:{...array(object({label:{type:"string",enum:labels},source}),1),...(exactOutputs?{minItems:labels.length,maxItems:labels.length}:{})}});
}
export function quantitativeExchangeSchema(labels:readonly string[],toolAvailable:boolean,artifactAvailable:boolean,problemDigest:string,
  constantIds:readonly string[]=[],artifactDigest:string|null=null,procedureId:string|null=null,boundedCollections=false,expressionGraph=false,exactOutputs=false,algebraicForm=false,algebraicEmissionGuide=false) {
  if(typeof expressionGraph!=="boolean"||typeof exactOutputs!=="boolean"||typeof algebraicForm!=="boolean"
    ||expressionGraph&&algebraicForm||typeof algebraicEmissionGuide!=="boolean"||algebraicEmissionGuide&&!algebraicForm)throw Error("quantitative_expression_profile_invalid");
  if(exactOutputs)objectiveLabels(labels);
  const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
  const string={type:"string"};const array=(items:unknown)=>({type:"array",items});
  const constant=(value:string|number)=>({type:typeof value==="number"?"integer":"string",enum:[value]});
  const tool=object({problemDigest:constant(problemDigest),program:algebraicForm?quantitativeAlgebraicSchema(labels,exactOutputs,algebraicEmissionGuide)
    :expressionGraph?quantitativeExpressionSchema(labels,constantIds,exactOutputs)
    :quantitativeProgramSchema(labels,constantIds,boundedCollections,exactOutputs)});
  const artifact=object({schemaVersion:constant(1),operation:constant("SUBMIT_ANALYSIS_ARTIFACT"),problemDigest:constant(problemDigest),
    resultDigest:artifactDigest===null?string:constant(artifactDigest),confidence:{type:"number"}});
  const certificate=object({outputs:{...array(object({label:{type:"string",enum:labels},value:string})),
    ...(exactOutputs?{minItems:labels.length,maxItems:labels.length}:{})},confidence:{type:"number"}});
  // Tagged union, NOT the Cartesian product of independently valid fields. In particular,
  // DERIVATION cannot select a full/manual certificate or an artifact request. Guided decoding
  // should produce a coherent intent; local authority/IR/expiry/acceptance checks remain stricter.
  const exchange=(action:string,analysisRequest:unknown,certificate:unknown)=>object({action:constant(action),analysisRequest,certificate});
  const branches=[exchange("SUBMIT",{type:"null"},certificate),
    ...(toolAvailable?[exchange("SUBMIT_DERIVATION",tool,object({confidence:{type:"number"}}))]:[]),
    ...(toolAvailable&&procedureId!==null?[exchange("SUBMIT_PROCEDURE",object({problemDigest:constant(problemDigest),
      procedureId:constant(procedureId)}),object({confidence:{type:"number"}}))]:[]),
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
  /** Experimental repair-only representation change in reasoning-enabled arms.
   * Consumes an EXISTING call; no tool or authority. Reasoning-only repair still
   * submits manual certificates and cannot acquire the workbench capability. */
  readonly reformulateAfterRejection?:boolean;
  /** Host opt-in counts-only diagnosis. Does not alter model requests, admission,
   * verification feedback, budgets or authority; no raw formulation is retained. */
  readonly observeModelFormulation?:boolean;
  /** Host-selected generation guidance only. Mirrors existing formulation bounds;
   * does not fill equations, accept duplicates, alter verification or add calls. */
  readonly boundedModelFormulation?:boolean;
  /** Host-only experimental procedure reuse. The actual model must select the
   * bound invocation; a descriptor is not automatic execution or acceptance. */
  readonly procedure?: Readonly<{ artifact: BoundQuantitativeProcedure; mode: "CONTEXT_ONLY" | "BOUND_INVOCATION" }>;
  readonly createReusableProcedure?: boolean;
  /** Development-only generation aid mirrors unchanged native bounds. Hosted
   * grammar support is empirical; no fallback or automatic program rewriting. */
  readonly nativeGenerationBounds?: boolean;
  /** Host-selected, development-only representation ablation. It grants no new
   * operations or authority, and is unavailable to the procedure-reuse path. */
  readonly nativeExpressionGraph?: boolean;
  /** Experimental surface notation lowers to the SAME native interpreter. No
   * constants, operations, equation solving or acceptance are supplied by it. */
  readonly nativeAlgebraicForm?: boolean;
  /** Optional sanitized rejection observation, no model-request changes. */
  readonly observeAlgebraicEmission?: boolean;
  /** Experimental lexer-compatible generation guidance and public enum feedback.
   * Neither rewrites model source nor changes native admission/acceptance. */
  readonly algebraicEmissionGuide?: boolean;
  /** Host-selected experiment only. OBSERVE records bounded structural counts;
   * ENFORCE also checks the exact objective label set before native execution or
   * submission. Neither mode modifies a proposal or replaces the external oracle. */
  readonly objectiveOutputContract?:"OBSERVE"|"ENFORCE";
}): Promise<QuantitativeRun> {
  if(input.objectiveOutputContract!==undefined&&!["OBSERVE","ENFORCE"].includes(input.objectiveOutputContract))
    throw Error("quantitative_output_contract_setting_invalid");
  if(input.objectiveOutputContract!==undefined)objectiveLabels(input.outputLabels);
  if(input.retainAdmittedDerivation!==undefined&&typeof input.retainAdmittedDerivation!=="boolean")throw Error("quantitative_repair_context_setting_invalid");
  for (const option of [input.observeAlgebraicEmission,input.algebraicEmissionGuide])
    if(option!==undefined&&(typeof option!=="boolean"||option&&!input.nativeAlgebraicForm))throw Error("quantitative_algebraic_emission_setting_invalid");
  if(input.observeModelFormulation!==undefined&&typeof input.observeModelFormulation!=="boolean")throw Error("quantitative_formulation_observation_setting_invalid");
  if(input.boundedModelFormulation!==undefined&&(typeof input.boundedModelFormulation!=="boolean"
    ||input.boundedModelFormulation&&!input.reformulateAfterRejection))throw Error("quantitative_formulation_bounds_setting_invalid");
  if(input.boundedModelFormulation)objectiveLabels(input.outputLabels);
  if(input.reformulateAfterRejection!==undefined&&(typeof input.reformulateAfterRejection!=="boolean"
    ||input.reformulateAfterRejection&&!["REASONING_MEDIUM","REASONING_WITH_WORKBENCH"].includes(input.arm)))throw Error("quantitative_model_formulation_setting_invalid");
  if(input.createReusableProcedure!==undefined&&(typeof input.createReusableProcedure!=="boolean"
    ||input.createReusableProcedure&&input.arm!=="REASONING_WITH_WORKBENCH"))throw Error("quantitative_procedure_creation_setting_invalid");
  if(input.nativeGenerationBounds!==undefined&&(typeof input.nativeGenerationBounds!=="boolean"
    ||input.nativeGenerationBounds&&input.arm!=="REASONING_WITH_WORKBENCH"))throw Error("quantitative_generation_bounds_setting_invalid");
  if(input.nativeExpressionGraph!==undefined&&(typeof input.nativeExpressionGraph!=="boolean"
    ||input.nativeExpressionGraph&&(input.arm!=="REASONING_WITH_WORKBENCH"||input.createReusableProcedure||input.procedure!==undefined)))
    throw Error("quantitative_expression_graph_setting_invalid");
  if(input.nativeAlgebraicForm!==undefined&&(typeof input.nativeAlgebraicForm!=="boolean"
    ||input.nativeAlgebraicForm&&(input.arm!=="REASONING_WITH_WORKBENCH"||input.nativeExpressionGraph)))
    throw Error("quantitative_algebraic_form_setting_invalid");
  if(input.procedure!==undefined&&(!keys(input.procedure,["artifact","mode"])
    ||!BoundQuantitativeProcedure.isOwned(input.procedure.artifact)
    ||!["CONTEXT_ONLY","BOUND_INVOCATION"].includes(input.procedure.mode)
    ||input.arm!=="REASONING_WITH_WORKBENCH"))throw Error("quantitative_procedure_setting_invalid");
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
    maxElapsedMs:limits.maxToolElapsedMs,maxRequests:limits.maxToolRequests,expiresAtEpochMs:expires},now,
    {expressionGraphs:!!input.nativeExpressionGraph,algebraicForms:!!input.nativeAlgebraicForm});
  const task=immutableTheoryValue(JSON.parse(JSON.stringify({taskId:input.taskId,objective:input.objective,
    problem:input.problem,outputLabels:input.outputLabels})));
  const complete=input.complete;const verify=input.verify;const arm=input.arm;
  const attempts:QuantitativeAttempt[]=[];let observation:Readonly<Record<string,unknown>>|null=null;let feedback:readonly string[]=[];
  let admittedDerivation:Readonly<Record<string,unknown>>|null=null;
  let modelFormulation:Readonly<Record<string,unknown>>|null=null;let formulationAttempted=false;
  let accepted=false;let acceptedCertificate:unknown=null;let outcome="BUDGET_UNEXECUTED";
  let toolRequests=0;let toolWorkUnits=0;let toolElapsedMs=0;
  const contract={action:"SUBMIT_DERIVATION computes YOUR program and submits its outputs to an INDEPENDENT checker in this call. SUBMIT submits manually.",
    analysisRequest:"On SUBMIT_DERIVATION EXACTLY {problemDigest,program}. NO operation, outer schemaVersion, confidence, or extra fields. The adapter owns the native tool header. On SUBMIT: null.",
    certificate:"SUBMIT_DERIVATION requires ONLY {confidence:number 0..1}. SUBMIT requires {outputs:[{label:string,value:canonical reduced rational string}],confidence:number 0..1}",
    program:input.nativeAlgebraicForm?"{schemaVersion:5,definitions:[{id,expression}],outputs:[{label,expression}]}"
      :input.nativeExpressionGraph?"{schemaVersion:4,expressions:[{op,left,right}],outputs:[{label,source}]}"
      :"{schemaVersion:2,initialState:[{slot,source}],cycles:[{iterations,phases:[{expressions:[{id,op,left,right}],updates:[{slot,source}]}]}],outputs:[{label,source}]}",
    programSemantics:input.nativeAlgebraicForm?"Expressions are mathematical STRINGS using named original constants and earlier definitions. "
      +"Use +,-,*,/ and parentheses with usual precedence and LEFT associativity. Unary + and - exist; unary - requires an original zero constant. "
      +"MIN(a,b), MAX(a,b), BINOMIAL(a,b) are the only functions; BINOMIAL requires nonnegative integer arguments. "
      +"Definitions have unique ASCII letter-first names of at most 48 characters; they cannot overwrite constants or reserved function names. "
      +"Each definition can use ONLY original constants and PREVIOUS definitions. Output labels are NOT variables. "
      +"No numeric literals, powers, assignments, implicit multiplication, code or extra fields. Write products explicitly. "
      +"At most 32 definitions, 16 outputs, 512 characters per expression, 4096 total, parse nesting 16, and 64 arithmetic operations total. "
      +"Repeated subexpressions each count as operations; factor shared mathematics into named definitions yourself. "
      +"Every definition executes even if unused. The compiler assigns references but supplies no missing equations, signs or solutions. "
      +"Only the existing exact engine executes your formulas; mathematical correctness still requires independent verification."
      :input.nativeExpressionGraph?"Expression positions are implicit unique ZERO-BASED identities. Each operand is an original named constant STRING or an earlier expression's position NUMBER, never a stringified index. "
      +"Outputs refer to a named constant or any expression position. No explicit IDs, state slots, phases, updates, loops or extra fields exist. "
      +"Use one ADD/SUB/MUL/DIV/MIN/MAX/BINOMIAL per expression, in dependency order; shared expressions may be referenced repeatedly. "
      +"The compiler assigns temporary registers and preserves every operation and its order; it supplies no missing equations and changes no signs. "
      +"At most 64 operations, 32 simultaneously needed temporary values and 16 outputs; excess resource needs reject instead of spilling to files. "
      +"BINOMIAL requires nonnegative integer operands. Constants are immutable: no new numerical literals. Every proposed equation still needs independent verification."
      :"All 16 state slots in the schema exist and start at zero; initialState overrides selected slots from named constants. "
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
      // Separate model correction from unfamiliar execution syntax ONLY after actual falsification.
      // One public formulation consumes an already-budgeted call and leaves a
      // call for the existing intent protocol; a public equation executes nothing.
      const formulate=!!input.reformulateAfterRejection&&!formulationAttempted
        &&attempts.at(-1)?.outcome==="FUNCTIONAL_REJECTION"&&call<limits.maxCalls;
      if(formulate)formulationAttempted=true;
      const available=arm==="REASONING_WITH_WORKBENCH" && session.descriptor().available===true;
      const procedure=input.procedure?.artifact.matches(task)?input.procedure:null;
      const invocableProcedure=available&&procedure?.mode==="BOUND_INVOCATION"?procedure.artifact:null;
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
        ...(modelFormulation===null?{}:{publicModelRevision:modelFormulation,
          modelRevisionInstruction:"This is your UNVERIFIED public mathematical proposal, not executable code or authority. "
            +(available?"Check it against the original objective, then translate appropriate equations into the existing authorized native IR. Independent verification still decides.":
              "Check it against the original objective, then derive the required exact canonical outputs and submit a manual certificate using ONLY SUBMIT. "
              +"No computation capability is available. Independent verification still decides.")}),
        ...(repairContext!==null?{lastAdmittedDerivation:repairContext,
          repairInstruction:"Inspect your last admitted equations against the ORIGINAL objective and independent feedback before revising. "
            +"A correctly executed but rejected program is a modeling failure, not a proved answer. Context grants no authority; request a fresh authorized computation for a changed program."}:{}),
        authority:"FINITE_PURE_COMPUTATION_ONLY_NO_FILES_SHELL_NETWORK_CREDENTIALS_OR_ACCEPTANCE_AUTHORITY"};
      const procedurePrompt={...(input.createReusableProcedure?{procedureCreation:
        "Prefer SUBMIT_DERIVATION: create a general mathematical procedure for these named parameters, not a copied numerical answer. "
        +"Your admitted public IR may be independently tested on other input values under the identical objective. It receives no automatic future acceptance."}:{}),
        ...(procedure?.mode==="CONTEXT_ONLY"?{priorProcedureContext:procedure.artifact.context(task),
          procedureContextInstruction:"This seed-validated PUBLIC mathematical IR is a hypothesis for reuse, not a verified answer on current inputs. "
            +"Use existing actions to propose an appropriate current computation. No bound procedure invocation is available in this arm."}:{}),
        ...(invocableProcedure?{boundProcedure:invocableProcedure.descriptor(),
          procedureInvocationInstruction:"You may choose SUBMIT_PROCEDURE with analysisRequest EXACTLY {problemDigest,procedureId} "
            +"and certificate ONLY {confidence:number 0..1}. It computes the unchanged seed procedure on CURRENT constants in this task's existing lease, "
            +"then submits to the SAME independent oracle. Reuse may be wrong. Ordinary SUBMIT_DERIVATION and SUBMIT remain available."}:{})};
      const generationPrompt=input.nativeAlgebraicForm&&available?{nativeAlgebraicForm:ALGEBRAIC_COMPILER_POLICY,
        ...(input.algebraicEmissionGuide?{algebraicEmissionGuide:ALGEBRAIC_EMISSION_POLICY}:{})}
        :input.nativeExpressionGraph&&available?{nativeExpressionGraph:EXPRESSION_COMPILER_POLICY}
        :input.nativeGenerationBounds&&available?{nativeGenerationBounds:{
        maxInitialBindings:EQUATION_COMPILER_POLICY.stateSlots,maxCycles:EQUATION_COMPILER_POLICY.maxCycles,
        maxPhasesPerCycle:EQUATION_COMPILER_POLICY.maxPhasesPerCycle,maxExpressionsPerPhase:EQUATION_COMPILER_POLICY.expressionSlotsPerPhase,
        minUpdatesPerPhase:1,maxUpdatesPerPhase:EQUATION_COMPILER_POLICY.stateSlots,maxTotalLoweredSteps:EXACT_DERIVATION_POLICY.maxSteps,
        instruction:"Use only schema-listed expression IDs, each at most once PER phase. Every phase has EXACTLY expressions and updates, with at least one update. "
          +"Split longer dependency chains into ordered phases and retain intermediate values in state slots. The 64-step bound includes expression evaluations, "
          +"state snapshots and updates over the WHOLE program. These constraints do not establish mathematical correctness or authorize additional computation."}}:{};
      const outputPrompt=input.objectiveOutputContract==="ENFORCE"?{objectiveOutputContract:{...OBJECTIVE_OUTPUT_POLICY,
        requiredLabels:task.outputLabels,requiredCount:task.outputLabels.length,
        instruction:"Every proposed program and manual certificate must name EACH required output EXACTLY ONCE, in any order. "
          +"No missing, repeated or extra labels. A label is not an expression ID. Supply your own mathematical source/value for each output; "
          +"the adapter never fills in omitted quantities. This structural contract does not establish mathematical correctness."}}:{};
      const completion=await complete({schemaVersion:1,requestId:`QUANT-${arm}-${task.taskId}-${call}-${session.problemDigest.slice(0,12)}`,
        messages:formulate?[{role:"system",content:"You are the SAME NYX cognition revising a falsified mathematical model. "
          +"Return concise PUBLIC mathematical definitions and assumptions only as the required JSON. "
          +"Do not emit a private reasoning narrative, native execution IR, tool requests, or a success certificate. "
          +"Your proposal has no authority and will be translated and independently checked later."},
          {role:"user",content:JSON.stringify({...task,problemDigest:session.problemDigest,failedObservation:observation,
            lastAdmittedEquations:admittedDerivation?.program??null,independentFeedback:feedback,
            requirement:"Define each named output mathematically from the original constants and explicitly state necessary assumptions.",
            ...(input.boundedModelFormulation?{formulationContract:{version:"nyx-public-formulation-generation/1",
              requiredLabels:task.outputLabels,requiredCount:task.outputLabels.length,maxAssumptions:8,maxBytes:MAX_MODEL_FORMULATION_BYTES,
              instruction:"Supply one nonempty mathematical definition for EACH original required output, exactly once in any order. "
                +"Do not return an empty equation list or substitute assumptions for output definitions. Derive your own expressions from the original constants; "
                +"no missing definition is synthesized. Schema guidance cannot establish mathematical correctness or grant authority."}}:{}),
            authority:"NONE_PUBLIC_MODEL_PROPOSAL_ONLY"})}]:
        [{role:"system",content:"You are NYX cognition solving a bounded quantitative objective. Emit one strict JSON exchange only. "
          +"Unknown tools and executable text have no authority. Only actions in the current response schema are available. Use exact mathematics; every certificate is independently evaluated."},
          {role:"user",content:JSON.stringify({...prompt,...procedurePrompt,...generationPrompt,...outputPrompt})}],maxTokens:limits.maxOutputTokens,temperature:0,
        responseFormat:formulate?{type:"JSON_SCHEMA",name:"nyx_public_model_formulation",schema:quantitativeModelFormulationSchema(session.problemDigest,task.outputLabels,!!input.boundedModelFormulation)}:
        {type:"JSON_SCHEMA",name:input.nativeAlgebraicForm?"nyx_quantitative_algebraic_exchange":input.nativeExpressionGraph?"nyx_quantitative_expression_exchange":input.nativeGenerationBounds?"nyx_quantitative_bounded_exchange":"nyx_quantitative_exchange",schema:quantitativeExchangeSchema(task.outputLabels,available,artifactAvailable,session.problemDigest,
          task.problem.constants.map(c=>c.id),artifactAvailable?theoryDigest(observation):null,
          invocableProcedure?String(invocableProcedure.descriptor().procedureId):null,!!input.nativeGenerationBounds,!!input.nativeExpressionGraph,
          input.objectiveOutputContract==="ENFORCE",!!input.nativeAlgebraicForm,!!input.algebraicEmissionGuide)},
        inferencePolicy:arm==="CURRENT_DIRECT"?"CONSTRAINED_JSON":"REASONING_JSON",
        ...(arm==="CURRENT_DIRECT"?{}:{reasoningEffort:"MEDIUM" as const}),observedAtEpochMs:now(),deadlineEpochMs:expires});
      let confidence:number|null=null;let proposalDigest:string|null=null;let resultDigest:string|null=null;
      let executedProgram:QuantitativeProgram|QuantitativeEquations|QuantitativeExpressionGraph|QuantitativeAlgebraicForm|null=null;
      let computation:ReasoningToolResult|null=null;
      let nativeRejectionStructure:QuantitativeRejectionStructure|undefined;
      let emissionDiagnostic:AlgebraicEmissionDiagnostic|undefined;
      let outputStructure:QuantitativeOutputStructure|undefined;
      let formulationStructure:QuantitativeModelFormulationStructure|undefined;
      const outputConforms=(outputs:unknown,origin:QuantitativeOutputStructure["origin"]):boolean=>{
        if(input.objectiveOutputContract===undefined)return true;
        outputStructure=quantitativeOutputStructure(task.outputLabels,outputs,origin);
        if(input.objectiveOutputContract!=="ENFORCE"||outputStructure.matches)return true;
        record("OUTPUT_CONTRACT_REJECTION",["OBJECTIVE_OUTPUT_LABEL_SET_INVALID",
          "Name every ORIGINAL required output exactly once, with no extra labels, in any order. Supply a source/value for each; no omitted quantity is synthesized."]);
        return false;
      };
      let procedureReference:QuantitativeAttempt["procedureReference"];
      const record=(state:string,findings:readonly string[])=>{outcome=state;feedback=findings;
        attempts.push(immutableTheoryValue({call,outcome:state,findings,confidence,proposalDigest,resultDigest,repairContextDigest,repairContextProgramDigest,
          cognitiveStage:formulate?"MODEL_FORMULATION":"OMEGA_INTENT",formulationArtifactDigest:modelFormulation===null?null:theoryDigest(modelFormulation),
          executedProgram,computation,...(procedureReference?{procedureReference}:{}),
          ...(nativeRejectionStructure?{nativeRejectionStructure}:{}),...(outputStructure?{outputStructure}:{}),
          ...(emissionDiagnostic?{algebraicEmissionDiagnostic:emissionDiagnostic}:{}),
          ...(formulationStructure?{formulationStructure}:{}),modelEvidence:completion.evidence}));};
      if(now()>=expires){record("LATE_RESPONSE_NOT_ADMITTED",["Original run expiry elapsed; no action was executed."]);break;}
      if(completion.evidence.statusCode===200 && completion.evidence.finishReason==="length"){
        record("TRUNCATION",["Provider output budget was exhausted; token usage is preserved."]);continue;}
      if(completion.decision!=="COMPLETED"||completion.content===null){record("PROVIDER_FAILURE",[completion.evidence.failureCategory??completion.decision]);continue;}
      if(completion.finishReason!=="stop"){record(completion.finishReason==="length"?"TRUNCATION":"NONSTOP_REJECTION",["Complete JSON required."]);continue;}
      let value:unknown;
      try {value=JSON.parse(completion.content);}catch{record("JSON_SYNTAX_REJECTION",["Return one strict JSON object, without Markdown."]);continue;}
      if(formulate){
        if(input.observeModelFormulation)formulationStructure=quantitativeModelFormulationStructure(session.problemDigest,task.outputLabels,value);
        if(!keys(value,["problemDigest","equations","assumptions"])||value.problemDigest!==session.problemDigest
          ||!Array.isArray(value.equations)||value.equations.length!==task.outputLabels.length
          ||!value.equations.every(v=>keys(v,["label","expression"])&&typeof v.label==="string"&&task.outputLabels.includes(v.label)
            &&typeof v.expression==="string"&&v.expression.trim().length>0)
          ||new Set(value.equations.map(v=>(v as Record<string,unknown>).label)).size!==task.outputLabels.length
          ||!Array.isArray(value.assumptions)||value.assumptions.length>8
          ||!value.assumptions.every(v=>typeof v==="string"&&v.trim().length>0)
          ||new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_MODEL_FORMULATION_BYTES){
          record("MODEL_FORMULATION_REJECTION",[...feedback,"Public model must bind the original problem, name each output once, and fit the fixed byte/assumption limits."]);continue;
        }
        proposalDigest=theoryDigest(value);
        modelFormulation=immutableTheoryValue({...value,sourceEvidenceId:completion.evidence.evidenceId,
          responseDigest:completion.evidence.responseDigest,verificationState:"UNVERIFIED_MODEL_PROPOSAL",grantsAuthority:false});
        const originalFalsification=feedback;
        record("MODEL_FORMULATION_READY_NOT_EXECUTED",["Public equations are a hypothesis, not a verified result or operation."]);
        feedback=originalFalsification;continue;
      }
      if(!keys(value,["action","analysisRequest","certificate"])){record("PROTOCOL_REJECTION",["Exactly action,analysisRequest,certificate are required."]);continue;}
      proposalDigest=theoryDigest(value);
      if(value.action==="REQUEST_ANALYSIS"||value.action==="SUBMIT_DERIVATION"||value.action==="SUBMIT_PROCEDURE") {
        const useProcedure=value.action==="SUBMIT_PROCEDURE";
        const compound=value.action!=="REQUEST_ANALYSIS";
        const submittedConfidence=compound&&keys(value.certificate,["confidence"])?value.certificate.confidence:null;
        if(!available){record("AUTHORIZATION_REJECTION",["COMPUTATION_CAPABILITY_UNAVAILABLE"]);continue;}
        if((!compound&&value.certificate!==null)||(compound&&(typeof submittedConfidence!=="number"
          ||!Number.isFinite(submittedConfidence)||submittedConfidence<0||submittedConfidence>1))){
          record("PROTOCOL_REJECTION",[compound?"DERIVATION_CERTIFICATE_REQUIRES_ONLY_FINITE_CONFIDENCE_0_TO_1":"ANALYSIS_CERTIFICATE_MUST_BE_NULL"]);continue;}
        if(compound&&!keys(value.analysisRequest,useProcedure?["problemDigest","procedureId"]:["problemDigest","program"])) {
          record("PROTOCOL_REJECTION",[useProcedure?"SUBMIT_PROCEDURE analysisRequest requires EXACTLY problemDigest and procedureId; no program override.":
            "SUBMIT_DERIVATION analysisRequest requires EXACTLY problemDigest and program; do not include native header or confidence fields."]);continue;
        }
        let nativeRequest:unknown=compound?{schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",
          problemDigest:(value.analysisRequest as Record<string,unknown>).problemDigest,program:(value.analysisRequest as Record<string,unknown>).program}:value.analysisRequest;
        if(useProcedure){
          if(!invocableProcedure){record("AUTHORIZATION_REJECTION",["BOUND_PROCEDURE_UNAVAILABLE"]);continue;}
          try {nativeRequest=invocableProcedure.request(task,value.analysisRequest,session.problemDigest);
            const d=invocableProcedure.descriptor();procedureReference={procedureId:d.procedureId,programDigest:d.programDigest,scopeDigest:d.scopeDigest};}
          catch {record("AUTHORIZATION_REJECTION",["BOUND_PROCEDURE_REFERENCE_SCOPE_OR_LIFETIME_REJECTED"]);continue;}
        }
        if(input.nativeExpressionGraph&&(nativeRequest as {program?:{schemaVersion?:unknown}}|null)?.program?.schemaVersion!==4){
          record("PROTOCOL_REJECTION",["EXPRESSION_GRAPH_PROFILE_REQUIRES_SCHEMA_4_NO_LEGACY_FALLBACK"]);continue;
        }
        if(input.nativeAlgebraicForm&&(nativeRequest as {program?:{schemaVersion?:unknown}}|null)?.program?.schemaVersion!==5){
          record("PROTOCOL_REJECTION",["ALGEBRAIC_FORM_PROFILE_REQUIRES_SCHEMA_5_NO_LEGACY_FALLBACK"]);continue;
        }
        if(!outputConforms((nativeRequest as {program?:{outputs?:unknown}}|null)?.program?.outputs,"PROGRAM_OUTPUTS"))continue;
        let derivedCertificate:Readonly<Record<string,unknown>>|null=null;
        try {
          const result=session.analyze(nativeRequest);computation=result;
          // Validated bounded action data only; no raw provider reasoning or credential.
          executedProgram=(nativeRequest as {program:QuantitativeProgram|QuantitativeEquations|QuantitativeExpressionGraph|QuantitativeAlgebraicForm}).program;
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
          const diagnostic=algebraicEmissionDiagnostic(error);
          if(input.observeAlgebraicEmission&&diagnostic)emissionDiagnostic=diagnostic;
          nativeRejectionStructure=rejectedProgramStructure((nativeRequest as {program?:unknown}|null)?.program,
            task.problem.constants.map(c=>c.id));
          const reason=error instanceof Error&&/^(?:quantitative_(?:program|equations|expressions|algebraic)_invalid:[A-Z_]+(?::[0-9]+(?:\.[0-9]+)?)?|reasoning_request_invalid:[A-Z_]+)$/.test(error.message)
            ?error.message:error instanceof Error&&error.message==="reasoning_session_budget_exhausted"?"NATIVE_WORK_BUDGET_EXHAUSTED":"REQUEST_SCOPE_OR_LIFETIME_REJECTED";
          const generationFeedback=input.nativeExpressionGraph&&reason==="quantitative_expressions_invalid:SOURCE_NOT_BOUND"?
            ["SOURCE_NOT_BOUND: use an original named constant string or an integer index strictly LESS than this expression's zero-based position. No forward references or stringified indices."]:
            input.nativeExpressionGraph&&reason==="quantitative_expressions_invalid:REGISTER_PRESSURE"?
            ["REGISTER_PRESSURE: at most 32 simultaneously needed temporary values. Keep 64 total operations and preserve the objective; no memory spilling or automatic limit increase."]:
            input.nativeGenerationBounds&&reason==="quantitative_equations_invalid:PHASE_BOUND"?
            ["PHASE_BOUND: each phase requires exactly expressions and updates; 0..16 expressions and 1..16 updates. Check shape and counts before resubmitting."]:
            input.nativeGenerationBounds&&reason==="quantitative_equations_invalid:EXPRESSION_SHAPE"?
              ["EXPRESSION_SHAPE: each expression requires exactly id,op,left,right; use only schema-listed IDs once per phase and listed operations. No new names or fields."]:[];
          const emissionFeedback=input.algebraicEmissionGuide&&diagnostic?
            [`ALGEBRAIC_EMISSION_${diagnostic.category}: ${ALGEBRAIC_EMISSION_POLICY.instruction}`]:[];
          record("AUTHORIZATION_OR_IR_REJECTION",[reason,...generationFeedback,...emissionFeedback,"Request must bind the available problem, use only initialized/authorized names, "
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
      if(!outputConforms((proposedCertificate as {outputs?:unknown}|null)?.outputs,"CERTIFICATE_OUTPUTS"))continue;
      const checked=verify(proposedCertificate);resultDigest=checked.verificationDigest;
      if(value.action==="SUBMIT_ANALYSIS_ARTIFACT"&&admittedDerivation!==null)admittedDerivation=immutableTheoryValue({...admittedDerivation,
        independentEvaluation:{accepted:checked.accepted,findings:checked.findings,verificationDigest:checked.verificationDigest}});
      const proposed=proposedCertificate as {confidence?:unknown};
      confidence=typeof proposed?.confidence==="number"&&Number.isFinite(proposed.confidence)&&proposed.confidence>=0&&proposed.confidence<=1?proposed.confidence:null;
      accepted=checked.accepted;record(accepted?"ACCEPTED":checked.findings.some(f=>/SCHEMA_INVALID/.test(f))?"CERTIFICATE_SCHEMA_REJECTION":"FUNCTIONAL_REJECTION",checked.findings);
      if(accepted){acceptedCertificate=immutableTheoryValue(proposedCertificate);break;}
    }
  } finally {const usage=session.usage();toolRequests=usage.requests;toolWorkUnits=usage.workUnits;toolElapsedMs=usage.elapsedMs;session.revoke();}
  return immutableTheoryValue({arm,taskId:task.taskId,accepted,outcome,attempts,elapsedMs:Math.max(0,now()-started),calls:attempts.length,
    toolRequests,toolWorkUnits,toolElapsedMs,acceptedCertificate,authorityIncrease:false});
}
