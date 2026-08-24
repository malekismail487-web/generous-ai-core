import { INHERITED_OMEGA_CONSTRAINTS, OMEGA_CORPUS_STATUS, OMEGA_COVERAGE_STATUS, type PlanCoverageRecord } from "../../../src/lib/codelab/registry/planCoverage";
export interface AuthorityImplicationMapping { readonly from:string; readonly relation:"IMPLIES"|"DOES_NOT_IMPLY"|"REQUIRES"|"BOUNDED_BY"|"EXPIRES_WITH"; readonly to:string; readonly evidenceRefs:readonly string[] }
export interface AuthorityChangingCoverageSubmission { readonly schemaVersion:1; readonly submissionId:string; readonly workstream:PlanCoverageRecord; readonly authorityChangingCandidate:boolean; readonly authorityImplications:readonly AuthorityImplicationMapping[]; readonly candidateEvidenceRefs:readonly string[] }
export interface PlanCoverageGateResult { readonly decision:"ELIGIBLE_FOR_ASSURANCE_REVIEW"|"NOT_ELIGIBLE"|"INSUFFICIENT_EVIDENCE"; readonly reasons:readonly string[]; readonly coverageStatus:typeof OMEGA_COVERAGE_STATUS; readonly corpusStatus:typeof OMEGA_CORPUS_STATUS; readonly verificationStatus:"NOT_EVALUATED"; readonly capabilityAcceptance:"NOT_EVALUATED"; readonly grantsAuthority:false }
export interface ArchitectureConsolidationSnapshot { readonly plansRepresented:number; readonly plansMergedOperationally:number; readonly plansRejectedExperimentally:number; readonly plansDeferred:number; readonly plansSuperseded:number; readonly capabilitiesCreated:number; readonly activeArchitecturalMechanisms:number }
function sameSet(a:readonly string[],b:readonly string[]):boolean{return a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i])}
function unique(values:readonly string[]):readonly string[]{return[...new Set(values)]}
export function evaluatePlanCoverageGate(input:AuthorityChangingCoverageSubmission):PlanCoverageGateResult{
  const notEligible:string[]=[];const insufficient:string[]=[];const item=input.workstream;
  if(input.schemaVersion!==1||!input.submissionId.trim())insufficient.push("malformed_submission_identity");
  if(item.coverageStatus!==OMEGA_COVERAGE_STATUS||item.corpusStatus!==OMEGA_CORPUS_STATUS)notEligible.push("dishonest_or_unsupported_corpus_claim");
  if(item.directlyImplemented.length===0)notEligible.push("direct_plan_mapping_missing");if(item.deferred.length===0||item.deferredRequirements.length===0)notEligible.push("deferred_scope_missing");
  if(!sameSet(item.inheritedConstraints,INHERITED_OMEGA_CONSTRAINTS))notEligible.push("inherited_constraints_incomplete");
  if(item.conflicts.length===0)notEligible.push("conflict_review_missing");if(item.conflicts.some((conflict)=>conflict.disposition==="OPEN"))notEligible.push("authority_conflict_unresolved");
  if(item.testEvidenceRefs.length===0||item.assuranceEvidenceRefs.length===0||input.candidateEvidenceRefs.length===0)insufficient.push("evidence_references_missing");
  if(input.authorityChangingCandidate&&input.authorityImplications.length===0)notEligible.push("authority_implications_unmapped");
  if(input.authorityImplications.some((mapping)=>!mapping.from.trim()||!mapping.to.trim()||mapping.evidenceRefs.length===0))insufficient.push("authority_implication_unevidenced");
  if(item.authority.grantedByArtifact.length>0)notEligible.push("coverage_artifact_attempts_authority_grant");
  return Object.freeze({decision:notEligible.length?"NOT_ELIGIBLE":insufficient.length?"INSUFFICIENT_EVIDENCE":"ELIGIBLE_FOR_ASSURANCE_REVIEW",reasons:unique([...notEligible,...insufficient]),coverageStatus:OMEGA_COVERAGE_STATUS,corpusStatus:OMEGA_CORPUS_STATUS,verificationStatus:"NOT_EVALUATED",capabilityAcceptance:"NOT_EVALUATED",grantsAuthority:false});
}
export function measureArchitectureConsolidation(records:readonly PlanCoverageRecord[],activeMechanismIds:readonly string[],rejectedPlanIds:readonly string[]=[]):ArchitectureConsolidationSnapshot{
  const direct=records.flatMap((record)=>record.directlyImplemented.map((concept)=>concept.conceptId));const all=records.flatMap((record)=>[...record.directlyImplemented,...record.supporting,...record.deferred].map((concept)=>concept.conceptId));const superseded=records.flatMap((record)=>record.supersededOperationalApproaches);
  return Object.freeze({plansRepresented:new Set(all).size,plansMergedOperationally:Math.max(0,direct.length-new Set(direct).size),plansRejectedExperimentally:new Set(rejectedPlanIds).size,plansDeferred:new Set(records.flatMap((record)=>record.deferred.map((concept)=>concept.conceptId))).size,plansSuperseded:new Set(superseded).size,capabilitiesCreated:new Set(records.map((record)=>record.capabilityObjectiveId)).size,activeArchitecturalMechanisms:new Set(activeMechanismIds).size});
}
