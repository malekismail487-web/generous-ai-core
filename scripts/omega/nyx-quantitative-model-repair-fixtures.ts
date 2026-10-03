import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { verifyQuantitativeCertificate } from "./nyx-quantitative-transfer-fixtures";
import { constraintExpectedQuantities,type ConstraintTransferTask } from "./nyx-quantitative-constraint-transfer-fixtures";
import { REPAIR_CONTEXT_EPOCH,REPAIR_CONTEXT_TASKS } from "./nyx-quantitative-repair-context-fixtures";
export const MODEL_REPAIR_EPOCH=Object.freeze({...REPAIR_CONTEXT_EPOCH,version:12,
  chunkId:"NYX-PUBLIC-MODEL-REFORMULATION-REPAIR-001",
  hypothesis:"After falsification, separating public mathematical reformulation from execution syntax improves bounded model correction.",
  supportCriterion:"An actually exposed same-first-proposal repair improves independent acceptance without more realized model tokens; replicate before promotion.",
  falsificationCriterion:"No compute-defensible repair advantage, incorrect mathematical formulations, protocol failures, or authority inferred from public proposals.",
  population:"FOUR_NEW_PARAMETER_OBJECTIVES_EXISTING_FAMILIES_SAME_FIRST_PROPOSAL_AND_FOUR_CALL_TWO_TOOL_LIMIT",
  competingExplanation:"Post-prefix model randomness, not useful representation change; context alone previously failed to repair.",
  planCoverage:{...REPAIR_CONTEXT_EPOCH.planCoverage,direct:["UNDERSTAND_MODEL_BEFORE_EMITTING_EXECUTION_SYNTAX",
    "FALSIFICATION_DRIVES_BOUNDED_REFORMULATION","PLAN_IS_NOT_AUTHORITY","GENERATOR_REQUIRES_DETECTOR"],
    supporting:["EVIDENCE_LINKED_WORKING_STATE","INDEPENDENT_ORACLE"],deferred:["PERSISTENT_MEMORY","BRAIN_EXPANSION","BROAD_FRONTIER_PROMOTION"]}});
const values=[{prior:"19/600",sensitivityA:"17/19",sensitivityB:"23/29",falseA:"7/31",falseB:"5/37"},
  {red:"41",blue:"37",green:"31",draw:"14",wanted:"6"},
  {x0:"73/23",y0:"88/23",transfer:"9/31",loss:"1/61"},
  {principal:"47/17",rate:"23/163",withdrawal:"23/29"}];
export const MODEL_REPAIR_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(REPAIR_CONTEXT_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?values[index].principal!:c.bound}));
  const objective=old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0];
  return {...old,taskId:old.taskId.replace("CONTEXT-","MODEL-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(values[index] as Record<string,string>)[c.id]??c.value}))},
    objective:`${objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const MODEL_REPAIR_CORPUS_DIGEST=theoryDigest(MODEL_REPAIR_TASKS);
export function modelRepairExpectedQuantities(task:ConstraintTransferTask){
  if(!MODEL_REPAIR_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_model_repair_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("MODEL-","CONSTRAINT-")});
}
export function verifyModelRepairSubmission(task:ConstraintTransferTask,certificate:unknown){
  return verifyQuantitativeCertificate(task,certificate,()=>modelRepairExpectedQuantities(task));
}
// Replication freezes a NEW parameter corpus. No observed solution or task-specific repair
// rule is copied into cognition; model, mechanism, oracle, and finite limits are unchanged.
export const MODEL_REPAIR_REPLICATION_EPOCH=Object.freeze({...MODEL_REPAIR_EPOCH,version:13,
  chunkId:"NYX-PUBLIC-MODEL-REFORMULATION-TRANSFER-001",
  population:"FRESH_PARAMETER_TRANSFER_SAME_FOUR_DOMAIN_FAMILIES_NOT_INSTITUTIONAL_OR_EXTERNAL_REPLICATION"});
const replicationValues=[{prior:"23/701",sensitivityA:"19/23",sensitivityB:"29/37",falseA:"11/43",falseB:"7/41"},
  {red:"43",blue:"41",green:"37",draw:"16",wanted:"7"},
  {x0:"79/29",y0:"124/29",transfer:"8/37",loss:"5/67"},
  {principal:"59/19",rate:"29/211",withdrawal:"31/43"}];
export const MODEL_REPAIR_REPLICATION_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(MODEL_REPAIR_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?replicationValues[index].principal!:c.bound}));
  return {...old,taskId:old.taskId.replace("MODEL-","REPLICATE-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(replicationValues[index] as Record<string,string>)[c.id]??c.value}))},
    objective:old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0]
      +` Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const MODEL_REPAIR_REPLICATION_CORPUS_DIGEST=theoryDigest(MODEL_REPAIR_REPLICATION_TASKS);
export function modelRepairReplicationExpectedQuantities(task:ConstraintTransferTask){
  if(!MODEL_REPAIR_REPLICATION_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_model_repair_replication_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("REPLICATE-","CONSTRAINT-")});
}
export function verifyModelRepairReplicationSubmission(task:ConstraintTransferTask,certificate:unknown){
  return verifyQuantitativeCertificate(task,certificate,()=>modelRepairReplicationExpectedQuantities(task));
}
