import { SLOT_TRANSFER_EPOCH,SLOT_TRANSFER_TASKS,verifySlotTransferSubmission } from "./nyx-quantitative-slot-transfer-fixtures";
import type { QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue,theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const EQUATION_TRANSFER_EPOCH=Object.freeze({...SLOT_TRANSFER_EPOCH,version:4,chunkId:"NYX-EXACT-DERIVATION-TRANSFER-004",
  protocolCorrection:"IMMUTABLE_EXPRESSION_PHASES_LOWERED_TO_EXISTING_EXACT_IR"});
const values=[{x0:"23/9",y0:"17/13",ax:"8/11",bx:"3/11"},
  {x0:"-9/7",y0:"23/5",ax:"5/12",bx:"7/12",ay:"7/15",by:"8/15"},
  {initial:"3/11",supply:"17/6",capacity:"29/7",returned:"3/13"},
  {red:"29",blue:"31",draw:"8",wanted:"3"}];
export const EQUATION_TRANSFER_TASKS:readonly QuantitativeTask[]=immutableTheoryValue(SLOT_TRANSFER_TASKS.map((task,i)=>({...task,
  taskId:`EQUATION-TRANSFER-${i+1}`,problem:{...task.problem,constants:task.problem.constants.map(c=>({id:c.id,value:values[i][c.id as keyof typeof values[number]]??c.value}))}})));
export const EQUATION_TRANSFER_CORPUS_DIGEST=theoryDigest(EQUATION_TRANSFER_TASKS);
export function verifyEquationTransferSubmission(task:QuantitativeTask,certificate:unknown) {
  const index=EQUATION_TRANSFER_TASKS.findIndex(t=>t.taskId===task.taskId);if(index<0)throw Error("unknown_equation_transfer_task");
  const result=verifySlotTransferSubmission({...task,taskId:SLOT_TRANSFER_TASKS[index].taskId},certificate);
  return immutableTheoryValue({...result,verificationDigest:theoryDigest({taskDigest:theoryDigest(task),domainVerification:result.verificationDigest})});
}
