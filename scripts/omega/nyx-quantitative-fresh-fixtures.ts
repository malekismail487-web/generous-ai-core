import { QUANTITATIVE_EPOCH, QUANTITATIVE_TASKS, verifyQuantitativeSubmission, referenceQuantitativeProgram,
  type QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const FRESH_QUANTITATIVE_EPOCH=Object.freeze({...QUANTITATIVE_EPOCH,version:2,
  chunkId:"NYX-EXACT-DERIVATION-TRANSFER-002",protocolCorrection:"AVAILABLE_ACTION_SCHEMA_AND_EXISTING_ARTIFACT_CUSTODY",
  population:"FRESH_MODEL_UNSEEN_PARAMETERS_EXISTING_FOUR_FAMILIES_AFTER_PROTOCOL_REPAIR_NOT_NEW_DOMAIN_FAMILIES"});
const freshValues=[{x0:"13/8",y0:"37/19",ax:"4/5",bx:"1/5"},
  {x0:"-2/7",y0:"12/5",ax:"3/8",bx:"5/8",ay:"4/13",by:"9/13"},
  {initial:"1/3",supply:"19/7",capacity:"23/6",returned:"3/11"},
  {red:"23",blue:"19",draw:"8",wanted:"3"}];
export const FRESH_QUANTITATIVE_TASKS:readonly QuantitativeTask[]=immutableTheoryValue(QUANTITATIVE_TASKS.map((task,index)=>({
  ...task,taskId:`FRESH-${index+1}`,problem:{kind:"EXACT_QUANTITATIVE_DERIVATION",constants:task.problem.constants.map(c=>({
    id:c.id,value:freshValues[index][c.id as keyof typeof freshValues[number]]??c.value}))}})));
export const FRESH_QUANTITATIVE_CORPUS_DIGEST=theoryDigest(FRESH_QUANTITATIVE_TASKS);
function domainBinding(task:QuantitativeTask):QuantitativeTask {
  const index=FRESH_QUANTITATIVE_TASKS.findIndex(t=>t.taskId===task.taskId);
  if(index<0)throw Error("unknown_fresh_quantitative_task");
  // Select the independent DOMAIN oracle; never inject expected quantities into cognition.
  return {...task,taskId:QUANTITATIVE_TASKS[index].taskId};
}
export function verifyFreshQuantitativeSubmission(task:QuantitativeTask,certificate:unknown) {
  const result=verifyQuantitativeSubmission(domainBinding(task),certificate);
  return immutableTheoryValue({...result,verificationDigest:theoryDigest({freshTaskDigest:theoryDigest(task),domainVerification:result.verificationDigest})});
}
export const referenceFreshQuantitativeProgram=(task:QuantitativeTask)=>referenceQuantitativeProgram(domainBinding(task));
