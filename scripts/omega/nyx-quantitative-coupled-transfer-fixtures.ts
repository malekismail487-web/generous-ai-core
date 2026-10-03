import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult } from "../../src/lib/codelab/model/nvidiaNimProvider";
import type { QuantitativeRun } from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { verifyQuantitativeCertificate } from "./nyx-quantitative-transfer-fixtures";
import { CONSTRAINT_TRANSFER_EPOCH, CONSTRAINT_TRANSFER_TASKS, constraintExpectedQuantities,
  type ConstraintTransferTask } from "./nyx-quantitative-constraint-transfer-fixtures";

export const COUPLED_TRANSFER_EPOCH=Object.freeze({...CONSTRAINT_TRANSFER_EPOCH,version:8,
  chunkId:"NYX-QUANTITY-COUPLED-COUNTEREXAMPLE-001",
  population:"FOUR_FRESH_PARAMETER_OBJECTIVES_EXISTING_DOMAIN_FAMILIES_SHARED_FIRST_LIVE_PROPOSAL",
  supportCriterion:"Actual delivered counterexamples followed by a compute-defensible repair advantage from shared initial proposals; independently replicate.",
  competingExplanation:"Residual post-prefix model variability, rather than useful feedback. A first-call advantage cannot be caused by post-rejection diagnostics.",
  confidenceRequirement:"Four tasks remain descriptive; lack of diagnostic exposure means the feedback hypothesis was not exercised."});
const values=[{prior:"7/330",sensitivityA:"5/7",sensitivityB:"11/13",falseA:"4/13",falseB:"3/17"},
  {red:"23",blue:"31",green:"17",draw:"10",wanted:"4"},
  {x0:"37/11",y0:"40/11",transfer:"5/19",loss:"1/43"},
  {principal:"31/7",rate:"11/127",withdrawal:"11/13"}];
export const COUPLED_TRANSFER_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(CONSTRAINT_TRANSFER_TASKS.map((old,index)=>{
  const publicConditions=old.publicConditions.map(c=>({...c,bound:c.id==="ledger-conserved"?values[index].principal!:c.bound}));
  const objective=old.objective.split(" Public necessary conditions (passing these does NOT establish correctness): ")[0];
  return {...old,taskId:old.taskId.replace("CONSTRAINT-","COUPLED-"),publicConditions,
    problem:{...old.problem,constants:old.problem.constants.map(c=>({...c,value:(values[index] as Record<string,string>)[c.id]??c.value}))},
    objective:`${objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(publicConditions)}`};
}));
export const COUPLED_TRANSFER_CORPUS_DIGEST=theoryDigest(COUPLED_TRANSFER_TASKS);
export function coupledExpectedQuantities(task:ConstraintTransferTask) {
  if(!COUPLED_TRANSFER_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_coupled_transfer_task");
  return constraintExpectedQuantities({...task,taskId:task.taskId.replace("COUPLED-","CONSTRAINT-")});
}
export function verifyCoupledTransferSubmission(task:ConstraintTransferTask,certificate:unknown) {
  return verifyQuantitativeCertificate(task,certificate,()=>coupledExpectedQuantities(task));
}

/** Evaluation-only common-prefix intervention. The cached object is a model PROPOSAL,
 * never an operation or an acceptance decision. Each arm owns and exercises its own Omega session.
 * Only caller timestamps/expiry/abort signal are excluded: all actual cognitive intent is identical.
 * Nothing rewrites problem/result digests, extends an expired lease, or couples later reasoning.
 */
export function quantitativeCognitiveIntent(request:NvidiaNimCompletionRequest):string {
  return theoryDigest({schemaVersion:request.schemaVersion,requestId:request.requestId,messages:request.messages,
    maxTokens:request.maxTokens,temperature:request.temperature,responseFormat:request.responseFormat??null,
    inferencePolicy:request.inferencePolicy??null,reasoningEffort:request.reasoningEffort??null,
    reasoningBudgetTokens:request.reasoningBudgetTokens??null,
    ...(request.reasoningControl!==undefined?{reasoningControl:request.reasoningControl}:{}),
    ...(request.structuredOutputMode!==undefined?{structuredOutputMode:request.structuredOutputMode}:{})});
}
export interface SharedProposalReceipt {
  readonly intentDigest:string;readonly sourceEvidenceId:string;readonly sourceResponseDigest:string|null;
  readonly prefixElapsedMs:number;readonly replayed:boolean;readonly sharedModelProposalOnly:true;
}
export function createSharedFirstProposal(complete:(r:NvidiaNimCompletionRequest)=>Promise<NvidiaNimCompletionResult>,now=Date.now) {
  let shared:{intent:string;completion:NvidiaNimCompletionResult;elapsedMs:number}|null=null;
  let branches=0,pending=false;
  return {
    prefixElapsedMs:()=>shared?.elapsedMs??0,
    branch() {
      if(pending||++branches>2)throw Error("coupled_comparison_branch_limit");
      let calls=0,physicalCalls=0,physicalTokens=0,unknownUsageCalls=0,httpAttempts=0;
      let receipt:SharedProposalReceipt|null=null;
      return {
        async complete(request:NvidiaNimCompletionRequest) {
          if(!Number.isSafeInteger(now())||!Number.isSafeInteger(request.observedAtEpochMs)||request.observedAtEpochMs>now()
            ||request.signal?.aborted||request.deadlineEpochMs!==undefined&&(!Number.isSafeInteger(request.deadlineEpochMs)||now()>=request.deadlineEpochMs))
            throw Error("coupled_proposal_expired_or_cancelled");
          if(pending)throw Error("coupled_comparison_concurrent_inference");
          const first=++calls===1;const intent=quantitativeCognitiveIntent(request);
          if(first&&shared!==null) {
            if(intent!==shared.intent)throw Error("coupled_first_intent_mismatch");
            receipt=immutableTheoryValue({intentDigest:intent,sourceEvidenceId:shared.completion.evidence.evidenceId,
              sourceResponseDigest:shared.completion.evidence.responseDigest,prefixElapsedMs:shared.elapsedMs,
              replayed:true,sharedModelProposalOnly:true});
            return shared.completion;
          }
          const began=now();pending=true;
          let completion:NvidiaNimCompletionResult;
          try {completion=immutableTheoryValue(await complete(request));}finally{pending=false;}
          physicalCalls++;const evidence=completion.evidence;
          physicalTokens+=evidence.usage.totalTokens??0;unknownUsageCalls+=Number(evidence.usage.totalTokens===null);
          httpAttempts+=evidence.delivery?.httpAttempts??Number(evidence.networkAttempted);
          if(first) {
            const elapsedMs=now()-began;
            if(!Number.isSafeInteger(elapsedMs)||elapsedMs<0)throw Error("coupled_clock_invalid");
            shared={intent,completion,elapsedMs};
            receipt=immutableTheoryValue({intentDigest:intent,sourceEvidenceId:evidence.evidenceId,
              sourceResponseDigest:evidence.responseDigest,prefixElapsedMs:elapsedMs,replayed:false,sharedModelProposalOnly:true});
          }
          return completion;
        },
        accounting:()=>immutableTheoryValue({physicalCalls,physicalTokens,unknownUsageCalls,httpAttempts,receipt}),
      };
    },
  };
}
export interface FeedbackComparisonRun extends QuantitativeRun {
  readonly comparisonArm:string;readonly sharedProposal?:SharedProposalReceipt|null;
}
/** Authoritative comparison classification, separate from both cognition and its diagnostic.
 * An outcome difference is not proof of treatment benefit when no treatment was delivered.
 */
export function assessConstraintFeedbackComparison(results:readonly FeedbackComparisonRun[],taskIds:readonly string[],providerStable:boolean,
  intervention:"PUBLIC_CONSTRAINT_FEEDBACK"|"ADMITTED_DERIVATION_CONTEXT"|"PUBLIC_MODEL_REPAIR"="PUBLIC_CONSTRAINT_FEEDBACK") {
  const selected=(arm:string)=>results.filter(r=>r.comparisonArm===arm);
  const control=selected(intervention==="PUBLIC_MODEL_REPAIR"?"PUBLIC_FEEDBACK_DIRECT_IR":intervention==="ADMITTED_DERIVATION_CONTEXT"?"PUBLIC_FEEDBACK_NO_CONTEXT":"GENERIC_FEEDBACK"),
    diagnostic=selected(intervention==="PUBLIC_MODEL_REPAIR"?"PUBLIC_FEEDBACK_MODEL_REPAIR":intervention==="ADMITTED_DERIVATION_CONTEXT"?"PUBLIC_FEEDBACK_WITH_CONTEXT":"CONSTRAINT_FEEDBACK");
  const complete=results.length===2*taskIds.length&&taskIds.every(id=>
    control.filter(r=>r.taskId===id).length===1&&diagnostic.filter(r=>r.taskId===id).length===1);
  const firstProposalMatched=complete&&taskIds.every(id=>{
    const a=control.find(r=>r.taskId===id)!,b=diagnostic.find(r=>r.taskId===id)!;
    return !!a.sharedProposal&&!!b.sharedProposal&&a.sharedProposal.replayed!==b.sharedProposal.replayed
      &&a.sharedProposal.intentDigest===b.sharedProposal.intentDigest
      &&a.sharedProposal.sourceEvidenceId===b.sharedProposal.sourceEvidenceId
      &&a.sharedProposal.sourceResponseDigest===b.sharedProposal.sourceResponseDigest
      &&a.attempts[0]?.modelEvidence.evidenceId===a.sharedProposal.sourceEvidenceId
      &&b.attempts[0]?.modelEvidence.evidenceId===b.sharedProposal.sourceEvidenceId
      &&a.attempts[0]?.proposalDigest===b.attempts[0]?.proposalDigest&&a.attempts[0]?.outcome===b.attempts[0]?.outcome;
  });
  const exposures=diagnostic.flatMap(r=>r.attempts.flatMap((a,i)=>{
    const next=r.attempts[i+1];
    if(intervention==="PUBLIC_MODEL_REPAIR"){
      const compilation=r.attempts[i+2];
      return a.outcome==="FUNCTIONAL_REJECTION"&&next?.cognitiveStage==="MODEL_FORMULATION"
        &&next.outcome==="MODEL_FORMULATION_READY_NOT_EXECUTED"&&next.formulationArtifactDigest!=null
        &&compilation?.cognitiveStage==="OMEGA_INTENT"&&compilation.formulationArtifactDigest===next.formulationArtifactDigest
        &&next.modelEvidence.statusCode===200&&next.modelEvidence.networkAttempted
        &&compilation.modelEvidence.statusCode===200&&compilation.modelEvidence.networkAttempted
        ?[{taskId:r.taskId,feedbackAfterCall:a.call,formulationCall:next.call,nextCall:compilation.call,repaired:r.accepted}]:[];
    }
    const delivered=intervention==="ADMITTED_DERIVATION_CONTEXT"?a.executedProgram!=null
      &&next?.repairContextProgramDigest===theoryDigest(a.executedProgram)&&next.repairContextDigest!=null:
        a.findings.some(f=>f.startsWith("PUBLIC_NECESSARY_CONDITION_VIOLATED:"));
    return a.outcome==="FUNCTIONAL_REJECTION"&&delivered
      &&next?.modelEvidence.statusCode===200&&next.modelEvidence.networkAttempted
      ?[{taskId:r.taskId,feedbackAfterCall:a.call,nextCall:next.call,repaired:r.accepted}]:[];
  }));
  const stats=(runs:readonly FeedbackComparisonRun[])=>({accepted:runs.filter(r=>r.accepted).length,
    calls:runs.reduce((n,r)=>n+r.calls,0),tokens:runs.reduce((n,r)=>n+r.attempts.reduce((m,a)=>m+(a.modelEvidence.usage.totalTokens??0),0),0)});
  const a=stats(control),b=stats(diagnostic);
  const usageKnown=results.every(r=>r.attempts.every(a=>a.modelEvidence.usage.totalTokens!==null));
  const advantage=b.accepted>a.accepted&&b.tokens<=a.tokens||b.accepted>0&&b.accepted===a.accepted&&b.tokens<a.tokens&&b.calls<=a.calls;
  const recoveredAdvantage=exposures.some(e=>e.repaired&&!control.find(r=>r.taskId===e.taskId)?.accepted);
  const exposed=exposures.length>0;
  const verdict=!complete||!providerStable||!usageKnown?"INCONCLUSIVE_PROVIDER_OR_BUDGET":!exposed?
    advantage?"OBSERVED_OUTCOME_DIFFERENCE_WITHOUT_CAUSAL_FEEDBACK_EXPOSURE":"FEEDBACK_HYPOTHESIS_NOT_EXERCISED":!firstProposalMatched?
      "FEEDBACK_EXERCISED_INITIAL_PROPOSAL_NOT_MATCHED":advantage&&(recoveredAdvantage||b.accepted===a.accepted)?
        "NARROW_EXPOSED_REPAIR_ADVANTAGE_REPLICATION_REQUIRED":"NO_COMPUTE_DEFENSIBLE_FEEDBACK_ADVANTAGE";
  return immutableTheoryValue({intervention,complete,firstProposalMatched,exposures,control:a,diagnostic:b,verdict,
    causalPromotionEligible:verdict==="NARROW_EXPOSED_REPAIR_ADVANTAGE_REPLICATION_REQUIRED",broadPromotion:false});
}
