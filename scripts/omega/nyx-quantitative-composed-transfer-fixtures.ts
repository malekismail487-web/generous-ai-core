import { EQUATION_TRANSFER_EPOCH,EQUATION_TRANSFER_TASKS,verifyEquationTransferSubmission } from "./nyx-quantitative-equation-transfer-fixtures";
import type { QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue,theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const COMPOSED_TRANSFER_EPOCH=Object.freeze({...EQUATION_TRANSFER_EPOCH,version:5,chunkId:"NYX-EXACT-DERIVATION-TRANSFER-005",
  protocolCorrection:"EXPLICIT_COMPUTE_AND_CHECK_REQUEST",libraryAdded:"GENERAL_EXACT_BINOMIAL",
  attributionLimit:"TWO_CO_CHANGED_MECHANISMS_NOT_INDIVIDUALLY_ABLATED"});
const values=[{x0:"31/12",y0:"23/17",ax:"9/13",bx:"4/13"},
  {x0:"-17/11",y0:"31/7",ax:"7/16",bx:"9/16",ay:"11/19",by:"8/19"},
  {initial:"5/17",supply:"23/8",capacity:"31/9",returned:"4/17"},
  {red:"31",blue:"37",draw:"8",wanted:"3"}];
export const COMPOSED_TRANSFER_TASKS:readonly QuantitativeTask[]=immutableTheoryValue(EQUATION_TRANSFER_TASKS.map((task,i)=>({...task,
  taskId:`COMPOSED-TRANSFER-${i+1}`,problem:{...task.problem,constants:task.problem.constants.map(c=>({id:c.id,value:values[i][c.id as keyof typeof values[number]]??c.value}))}})));
export const COMPOSED_TRANSFER_CORPUS_DIGEST=theoryDigest(COMPOSED_TRANSFER_TASKS);
export function verifyComposedTransferSubmission(task:QuantitativeTask,certificate:unknown) {
  const index=COMPOSED_TRANSFER_TASKS.findIndex(t=>t.taskId===task.taskId);if(index<0)throw Error("unknown_composed_transfer_task");
  const result=verifyEquationTransferSubmission({...task,taskId:EQUATION_TRANSFER_TASKS[index].taskId},certificate);
  return immutableTheoryValue({...result,verificationDigest:theoryDigest({taskDigest:theoryDigest(task),domainVerification:result.verificationDigest})});
}
