import { COMPOSED_TRANSFER_EPOCH,COMPOSED_TRANSFER_TASKS,verifyComposedTransferSubmission } from "./nyx-quantitative-composed-transfer-fixtures";
import type { QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue,theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const COMMAND_TRANSFER_EPOCH=Object.freeze({...COMPOSED_TRANSFER_EPOCH,version:6,chunkId:"NYX-EXACT-DERIVATION-TRANSFER-006",
  protocolCorrection:"MODEL_INTENT_NATIVE_ENVELOPE_SEPARATION_AND_SAFE_DIAGNOSTICS",libraryAdded:null,
  attributionLimit:"FIXED_COMMAND_CONTRACT_WITH_UNCHANGED_EQUATION_AND_BINOMIAL_SEMANTICS"});
const values=[{x0:"37/13",y0:"29/19",ax:"11/17",bx:"6/17"},
  {x0:"-23/13",y0:"37/9",ax:"9/20",bx:"11/20",ay:"13/23",by:"10/23"},
  {initial:"7/19",supply:"29/10",capacity:"37/11",returned:"5/19"},
  {red:"37",blue:"41",draw:"8",wanted:"3"}];
export const COMMAND_TRANSFER_TASKS:readonly QuantitativeTask[]=immutableTheoryValue(COMPOSED_TRANSFER_TASKS.map((task,i)=>({...task,
  taskId:`COMMAND-TRANSFER-${i+1}`,problem:{...task.problem,constants:task.problem.constants.map(c=>({id:c.id,value:values[i][c.id as keyof typeof values[number]]??c.value}))}})));
export const COMMAND_TRANSFER_CORPUS_DIGEST=theoryDigest(COMMAND_TRANSFER_TASKS);
export function verifyCommandTransferSubmission(task:QuantitativeTask,certificate:unknown) {
  const index=COMMAND_TRANSFER_TASKS.findIndex(t=>t.taskId===task.taskId);if(index<0)throw Error("unknown_command_transfer_task");
  const result=verifyComposedTransferSubmission({...task,taskId:COMPOSED_TRANSFER_TASKS[index].taskId},certificate);
  return immutableTheoryValue({...result,verificationDigest:theoryDigest({taskDigest:theoryDigest(task),domainVerification:result.verificationDigest})});
}
