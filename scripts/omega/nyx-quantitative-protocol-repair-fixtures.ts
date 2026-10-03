import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { verifyQuantitativeCertificate } from "./nyx-quantitative-transfer-fixtures";
import { constraintExpectedQuantities,type ConstraintTransferTask } from "./nyx-quantitative-constraint-transfer-fixtures";
import { COUPLED_TRANSFER_EPOCH,COUPLED_TRANSFER_TASKS } from "./nyx-quantitative-coupled-transfer-fixtures";

export const PROTOCOL_REPAIR_EPOCH=Object.freeze({...COUPLED_TRANSFER_EPOCH,version:9,chunkId:"NYX-QUANTITATIVE-TAGGED-INTENT-RECOVERY-001",
  hypothesis:"Action-coherent guided decoding removes interface obstruction while preserving separate mathematical-model failures.",
  supportCriterion:"Fresh frozen objectives yield fewer mixed-envelope rejections under unchanged authority/IR/oracle/call ceilings. Report cognitive repair separately.",
  falsificationCriterion:"Mixed-envelope rejection persists, or hosted schema is unsupported, or mathematical failures are mislabeled as successful repair.",
  competingExplanation:"Provider/output variability; absence of rejected first candidates does not prove repair improved.",
  planCoverage:{...COUPLED_TRANSFER_EPOCH.planCoverage,direct:["STRUCTURED_INTENT_IS_NOT_AUTHORITY","INTERFACE_FAILURE_IS_NOT_REASONING_FAILURE",
    "GENERATOR_REQUIRES_DETECTOR","COUNTEREXAMPLES_RETURN_TO_COGNITION"],superseded:["CARTESIAN_ACTION_SCHEMA_WITH_INCOHERENT_FIELD_COMBINATIONS"]}});
const values=[{prior:"11/400",sensitivityA:"7/9",sensitivityB:"13/17",falseA:"5/19",falseB:"2/13"},
  {red:"29",blue:"23",green:"31",draw:"11",wanted:"4"},
  {x0:"43/13",y0:"48/13",transfer:"7/23",loss:"1/47"},
  {principal:"37/9",rate:"13/137",withdrawal:"13/17"}];
export const PROTOCOL_REPAIR_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(COUPLED_TRANSFER_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?values[index].principal!:c.bound}));
  const objective=old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0];
  return {...old,taskId:old.taskId.replace("COUPLED-","REPAIR-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(values[index] as Record<string,string>)[c.id]??c.value}))},
    objective:`${objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const PROTOCOL_REPAIR_CORPUS_DIGEST=theoryDigest(PROTOCOL_REPAIR_TASKS);
export function protocolRepairExpectedQuantities(task:ConstraintTransferTask) {
  if(!PROTOCOL_REPAIR_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_protocol_repair_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("REPAIR-","CONSTRAINT-")});
}
export function verifyProtocolRepairSubmission(task:ConstraintTransferTask,certificate:unknown) {
  return verifyQuantitativeCertificate(task,certificate,()=>protocolRepairExpectedQuantities(task));
}
