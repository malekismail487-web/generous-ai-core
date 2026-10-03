import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { NvidiaNimCompletionRequest } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { verifyQuantitativeCertificate } from "./nyx-quantitative-transfer-fixtures";
import { constraintExpectedQuantities,type ConstraintTransferTask } from "./nyx-quantitative-constraint-transfer-fixtures";
import { REPAIR_CONTEXT_EPOCH,REPAIR_CONTEXT_TASKS } from "./nyx-quantitative-repair-context-fixtures";

// Primary sources motivate a CONFIGURATION HYPOTHESIS, not a diagnosis of the hosted runtime.
// https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer
// https://docs.nvidia.com/dynamo/dev/recipes/nemotron-3-ultra (self-hosted OSS limitation ONLY)
export const PROVIDER_DIAGNOSTIC_EPOCH=Object.freeze({...REPAIR_CONTEXT_EPOCH,version:11,
  chunkId:"NYX-REASONING-WIRE-CONFIGURATION-DIAGNOSTIC-001",maxCallsPerTask:1,maxToolRequests:1,
  hypothesis:"Native reasoning controls or removing hosted grammar changes reasoning/serialization behavior under the SAME strict local contract.",
  supportCriterion:"Record exact paired validity/acceptance, observed reasoning presence, usage and failures for four wire configurations; replicate before promotion.",
  falsificationCriterion:"No acceptance advantage, unsupported wire settings, invalid JSON, truncation, or an advantage explained only by more realized compute.",
  population:"FOUR_NEW_PARAMETER_OBJECTIVES_FOUR_CONFIGURATIONS_SINGLE_CALL_NO_REPAIR",
  competingExplanation:"Provider instability, stochastic first proposals, or increased reasoning tokens; missing reasoning_content does not establish disabled thinking.",
  planCoverage:{...REPAIR_CONTEXT_EPOCH.planCoverage,direct:["CONFIGURATION_IS_NOT_CAPABILITY","TRANSPORT_FAILURE_IS_NOT_REASONING_FAILURE",
    "STRICT_LOCAL_AUTHORIZATION_REGARDLESS_OF_MODEL_DECODING","MEASURE_REALIZED_COMPUTE"],deferred:["ADDITIONAL_COGNITIVE_LAYERS","BROAD_PROMOTION"]}});
const values=[{prior:"17/500",sensitivityA:"13/17",sensitivityB:"19/23",falseA:"5/23",falseB:"3/29"},
  {red:"37",blue:"31",green:"29",draw:"13",wanted:"6"},
  {x0:"61/19",y0:"72/19",transfer:"7/29",loss:"1/59"},
  {principal:"43/13",rate:"19/157",withdrawal:"19/23"}];
export const PROVIDER_DIAGNOSTIC_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(REPAIR_CONTEXT_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?values[index].principal!:c.bound}));
  const objective=old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0];
  return {...old,taskId:old.taskId.replace("CONTEXT-","WIRE-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(values[index] as Record<string,string>)[c.id]??c.value}))},
    objective:`${objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const PROVIDER_DIAGNOSTIC_CORPUS_DIGEST=theoryDigest(PROVIDER_DIAGNOSTIC_TASKS);
export const PROVIDER_DIAGNOSTIC_MODES=Object.freeze(["TEMPLATE_GUIDED","NATIVE_GUIDED","TEMPLATE_STRICT_LOCAL","NATIVE_STRICT_LOCAL"] as const);
export type ProviderDiagnosticMode=typeof PROVIDER_DIAGNOSTIC_MODES[number];
/** Identical semantic schema in ALL prompts: removing hosted grammar must not hide allowed names. */
export function providerDiagnosticRequest(request:NvidiaNimCompletionRequest,mode:ProviderDiagnosticMode):NvidiaNimCompletionRequest {
  if(!PROVIDER_DIAGNOSTIC_MODES.includes(mode)||request.inferencePolicy!=="REASONING_JSON"||request.reasoningEffort!=="MEDIUM"
    ||typeof request.responseFormat!=="object"||request.responseFormat.type!=="JSON_SCHEMA"
    ||request.reasoningControl!==undefined||request.structuredOutputMode!==undefined)throw Error("provider_diagnostic_request_invalid");
  const last=request.messages.at(-1);
  if(last?.role!=="user")throw Error("provider_diagnostic_last_message_invalid");
  const prompt=JSON.parse(last.content);
  if(!prompt||typeof prompt!=="object"||Array.isArray(prompt))throw Error("provider_diagnostic_prompt_invalid");
  const schema=request.responseFormat.schema;
  return {...request,messages:request.messages.map((m,i)=>i===request.messages.length-1?{...m,
    content:JSON.stringify({...prompt,expectedExchangeSchema:schema})}:m),
    ...(mode.startsWith("NATIVE")?{reasoningControl:"ULTRA_NATIVE" as const}:{}),
    ...(mode.endsWith("STRICT_LOCAL")?{structuredOutputMode:"STRICT_LOCAL" as const}:{})};
}
export function providerDiagnosticExpectedQuantities(task:ConstraintTransferTask) {
  if(!PROVIDER_DIAGNOSTIC_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_provider_diagnostic_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("WIRE-","CONSTRAINT-")});
}
export function verifyProviderDiagnosticSubmission(task:ConstraintTransferTask,certificate:unknown) {
  return verifyQuantitativeCertificate(task,certificate,()=>providerDiagnosticExpectedQuantities(task));
}
