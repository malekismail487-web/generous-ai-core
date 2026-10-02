import { FRESH_QUANTITATIVE_EPOCH,FRESH_QUANTITATIVE_TASKS,verifyFreshQuantitativeSubmission,
  referenceFreshQuantitativeProgram } from "./nyx-quantitative-fresh-fixtures";
import type { QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue,theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const SLOT_TRANSFER_EPOCH=Object.freeze({...FRESH_QUANTITATIVE_EPOCH,version:3,chunkId:"NYX-EXACT-DERIVATION-TRANSFER-003",
  protocolCorrection:"FINITE_SLOT_GENERATION_AND_EXHAUSTED_TOOL_WITHDRAWAL"});
const values=[{x0:"19/6",y0:"11/17",ax:"5/8",bx:"3/8"},
  {x0:"-11/4",y0:"19/9",ax:"4/9",bx:"5/9",ay:"3/8",by:"5/8"},
  {initial:"2/7",supply:"11/4",capacity:"19/5",returned:"2/9"},
  {red:"19",blue:"27",draw:"8",wanted:"3"}];
export const SLOT_TRANSFER_TASKS:readonly QuantitativeTask[]=immutableTheoryValue(FRESH_QUANTITATIVE_TASKS.map((task,i)=>({...task,
  taskId:`SLOT-TRANSFER-${i+1}`,problem:{...task.problem,constants:task.problem.constants.map(c=>({id:c.id,value:values[i][c.id as keyof typeof values[number]]??c.value}))}})));
export const SLOT_TRANSFER_CORPUS_DIGEST=theoryDigest(SLOT_TRANSFER_TASKS);
function original(task:QuantitativeTask):QuantitativeTask {
  const index=SLOT_TRANSFER_TASKS.findIndex(t=>t.taskId===task.taskId);if(index<0)throw Error("unknown_slot_transfer_task");
  return {...task,taskId:FRESH_QUANTITATIVE_TASKS[index].taskId};
}
export function verifySlotTransferSubmission(task:QuantitativeTask,certificate:unknown) {
  const result=verifyFreshQuantitativeSubmission(original(task),certificate);
  return immutableTheoryValue({...result,verificationDigest:theoryDigest({taskDigest:theoryDigest(task),domainVerification:result.verificationDigest})});
}
export const referenceSlotTransferProgram=(task:QuantitativeTask)=>referenceFreshQuantitativeProgram(original(task));
