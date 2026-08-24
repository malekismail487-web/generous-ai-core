import {
  OMEGA_R1_BASELINE_GENEALOGY,
  OMEGA_R1_TRACEABLE_BASELINE_REF,
} from "../../../src/lib/codelab/registry/baselineGenealogy";

export { OMEGA_R1_BASELINE_GENEALOGY };
export type BaselineDeltaDomain = "CAPABILITIES"|"AUTHORITIES"|"TESTS"|"EVIDENCE"|"SECURITY_INVARIANTS"|"ENVIRONMENT_ASSUMPTIONS"|"REGISTRY_MAPPINGS"|"EVALUATORS"|"EVIDENCE_REQUIREMENTS";
export interface InstitutionalSnapshot { readonly candidateCommit:string; readonly capabilities:readonly string[]; readonly authorities:readonly string[]; readonly tests:readonly string[]; readonly evidence:readonly string[]; readonly securityInvariants:readonly string[]; readonly environmentAssumptions:readonly string[]; readonly registryMappings:readonly string[]; readonly evaluators:readonly string[]; readonly evidenceRequirements:readonly string[] }
export type DeltaClassificationKind="INTENTIONAL_SUPERSESSION"|"DUPLICATE_REMOVAL"|"UNRELATED_CHANGE"|"REGRESSION"|"UNKNOWN";
export interface DeltaClassification { readonly deltaId:string; readonly classification:DeltaClassificationKind; readonly rationale:string; readonly evidenceRefs:readonly string[] }
export interface InstitutionalDelta { readonly deltaId:string; readonly domain:BaselineDeltaDomain; readonly change:"ADDED"|"REMOVED"; readonly identity:string; readonly trustBoundary:boolean; readonly classification:DeltaClassification|null }
export interface BaselineDiffAssurance { readonly decision:"ACCEPT"|"REJECT"|"INSUFFICIENT_EVIDENCE"; readonly baselineRef:string; readonly deltas:readonly InstitutionalDelta[]; readonly reasons:readonly string[]; readonly certifiesOperationalCapability:false; readonly grantsAuthority:false }
const DOMAINS:readonly [BaselineDeltaDomain,keyof Omit<InstitutionalSnapshot,"candidateCommit">][]=[
  ["CAPABILITIES","capabilities"],["AUTHORITIES","authorities"],["TESTS","tests"],["EVIDENCE","evidence"],["SECURITY_INVARIANTS","securityInvariants"],["ENVIRONMENT_ASSUMPTIONS","environmentAssumptions"],["REGISTRY_MAPPINGS","registryMappings"],["EVALUATORS","evaluators"],["EVIDENCE_REQUIREMENTS","evidenceRequirements"],
];
function unique(values:readonly string[]):readonly string[]{return[...new Set(values)].sort()}
export function evaluateInstitutionalBaselineDiff(baseline:InstitutionalSnapshot,candidate:InstitutionalSnapshot,classifications:readonly DeltaClassification[]):BaselineDiffAssurance{
  const reasons:string[]=[];if(baseline.candidateCommit!==OMEGA_R1_BASELINE_GENEALOGY[2].commit)reasons.push("wrong_traceable_r1_baseline");if(!/^[0-9a-f]{40}$/.test(candidate.candidateCommit))reasons.push("malformed_candidate_commit");
  const classMap=new Map(classifications.map((item)=>[item.deltaId,item]));const deltas:InstitutionalDelta[]=[];
  for(const[domain,key]of DOMAINS){const before=new Set(baseline[key]);const after=new Set(candidate[key]);for(const identity of unique([...after].filter((item)=>!before.has(item)))){const deltaId=`${domain}:ADDED:${identity}`;deltas.push({deltaId,domain,change:"ADDED",identity,trustBoundary:domain!=="ENVIRONMENT_ASSUMPTIONS",classification:classMap.get(deltaId)??null})}for(const identity of unique([...before].filter((item)=>!after.has(item)))){const deltaId=`${domain}:REMOVED:${identity}`;deltas.push({deltaId,domain,change:"REMOVED",identity,trustBoundary:domain!=="ENVIRONMENT_ASSUMPTIONS",classification:classMap.get(deltaId)??null})}}
  for(const delta of deltas){const classification=delta.classification;if(!classification){reasons.push(`unclassified_delta:${delta.deltaId}`);continue}if(!classification.rationale.trim()||classification.evidenceRefs.length===0)reasons.push(`unevidenced_classification:${delta.deltaId}`);if(classification.classification==="REGRESSION")reasons.push(`classified_regression:${delta.deltaId}`);if(classification.classification==="UNKNOWN")reasons.push(`${delta.trustBoundary?"unknown_trust_boundary_delta":"unknown_delta"}:${delta.deltaId}`);if(delta.change==="REMOVED"&&delta.trustBoundary&&classification.classification==="UNRELATED_CHANGE")reasons.push(`trust_boundary_deletion_misclassified_unrelated:${delta.deltaId}`)}
  const reject=reasons.some((reason)=>reason.startsWith("classified_regression:")||reason.startsWith("unknown_trust_boundary_delta:")||reason.startsWith("trust_boundary_deletion_misclassified_unrelated:")||reason==="wrong_traceable_r1_baseline");
  return Object.freeze({decision:reject?"REJECT":reasons.length>0?"INSUFFICIENT_EVIDENCE":"ACCEPT",baselineRef:OMEGA_R1_TRACEABLE_BASELINE_REF,deltas:Object.freeze(deltas),reasons:unique(reasons),certifiesOperationalCapability:false,grantsAuthority:false});
}
