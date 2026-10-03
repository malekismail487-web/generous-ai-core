import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { verifyQuantitativeCertificate } from "./nyx-quantitative-transfer-fixtures";
import { constraintExpectedQuantities,type ConstraintTransferTask } from "./nyx-quantitative-constraint-transfer-fixtures";
import { PROTOCOL_REPAIR_EPOCH,PROTOCOL_REPAIR_TASKS } from "./nyx-quantitative-protocol-repair-fixtures";

export const REPAIR_CONTEXT_EPOCH=Object.freeze({...PROTOCOL_REPAIR_EPOCH,version:10,chunkId:"NYX-ADMITTED-DERIVATION-CONTEXT-001",
  hypothesis:"Showing NYX its previously executed equations and independent rejection enables model correction, rather than repeated fresh re-derivation.",
  supportCriterion:"Exposed same-prefix repairs increase independent acceptance or reduce repair compute at unchanged budgets; replicate before promotion.",
  falsificationCriterion:"No compute-defensible repair advantage, repeated wrong-model formulation, or candidate context mistaken for authority.",
  competingExplanation:"Post-prefix model variability or extra prompt tokens rather than useful diagnosis.",
  population:"FOUR_NEW_PARAMETER_OBJECTIVES_EXISTING_DOMAINS_IDENTICAL_PUBLIC_FEEDBACK_DIFFERENT_ADMITTED_PROGRAM_CONTEXT",
  planCoverage:{...PROTOCOL_REPAIR_EPOCH.planCoverage,direct:["REPAIR_REQUIRES_THE_FAILED_CANDIDATE","EVIDENCE_LINKED_WORKING_STATE",
    "GENERATOR_REQUIRES_DETECTOR","VERIFIED_CAPABILITY_PER_COMPUTE"],deferred:["PERSISTENT_MEMORY","MODEL_TRAINING","DEVICE_INTEGRATION"]}});
const values=[{prior:"13/450",sensitivityA:"11/13",sensitivityB:"17/19",falseA:"3/17",falseB:"4/23"},
  {red:"31",blue:"29",green:"23",draw:"12",wanted:"5"},
  {x0:"55/17",y0:"64/17",transfer:"5/17",loss:"1/53"},
  {principal:"41/11",rate:"17/149",withdrawal:"17/19"}];
export const REPAIR_CONTEXT_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(PROTOCOL_REPAIR_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?values[index].principal!:c.bound}));
  const objective=old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0];
  return {...old,taskId:old.taskId.replace("REPAIR-","CONTEXT-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(values[index] as Record<string,string>)[c.id]??c.value}))},
    objective:`${objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const REPAIR_CONTEXT_CORPUS_DIGEST=theoryDigest(REPAIR_CONTEXT_TASKS);
export function repairContextExpectedQuantities(task:ConstraintTransferTask) {
  if(!REPAIR_CONTEXT_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_repair_context_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("CONTEXT-","CONSTRAINT-")});
}
export function verifyRepairContextSubmission(task:ConstraintTransferTask,certificate:unknown) {
  return verifyQuantitativeCertificate(task,certificate,()=>repairContextExpectedQuantities(task));
}
