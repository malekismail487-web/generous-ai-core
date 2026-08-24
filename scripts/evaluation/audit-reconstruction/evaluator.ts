import { createHash } from "node:crypto";

export const R2_A_AUDIT_OBLIGATIONS = Object.freeze([
  "REQUEST", "AUTHORIZATION", "PARENT_IDENTITY_VALIDATION", "DISJOINTNESS_VALIDATION", "PROVISION",
  "CREATED_OBJECT_IDENTITY", "TERMINATION_REQUEST", "CLEANUP", "POST_CLEANUP_OBSERVATION", "REVOCATION",
] as const);
export type AuditEventType = (typeof R2_A_AUDIT_OBLIGATIONS)[number];
export interface AdmittedAuditEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: AuditEventType;
  readonly requestId: string;
  readonly actorIdentity: string;
  readonly authority: string;
  readonly resourceIdentity: string;
  readonly objectIdentity: string | null;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "SUCCEEDED" | "FAILED" | "OBSERVED_CLEAN" | "REVOKED";
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}
export interface AuditReconstruction {
  readonly decision: "COMPLETE" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly missingEvents: readonly AuditEventType[];
  readonly requestor: string | null;
  readonly authorityAtAuthorization: string | null;
  readonly targetedResource: string | null;
  readonly authorizedObjectIdentity: string | null;
  readonly affectedObjectIdentity: string | null;
  readonly actionResult: string | null;
  readonly cleanupResult: string | null;
  readonly supportingEvidenceRefs: readonly string[];
  readonly authorityAfterward: "REVOKED" | "UNKNOWN";
  readonly reconstructsFromAdmittedRecordsOnly: true;
  readonly grantsAuthority: false;
}
function canonical(value: unknown): string { if(value===null||typeof value!=="object")return JSON.stringify(value)??"null";if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;const object=value as Record<string,unknown>;return`{${Object.keys(object).sort().map((key)=>`${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`; }
export function computeAuditEventHash(event: Omit<AdmittedAuditEvent, "eventHash">): string { return createHash("sha256").update(canonical(event), "utf8").digest("hex"); }
function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }
export function reconstructR2AAudit(events: readonly AdmittedAuditEvent[]): AuditReconstruction {
  const reasons: string[]=[]; const byType=new Map<AuditEventType,AdmittedAuditEvent>();
  let previous="GENESIS"; const requestIds=new Set<string>();
  for(const event of events){
    requestIds.add(event.requestId);
    if(event.schemaVersion!==1||!event.eventId.trim()||!event.evidenceRef.trim())reasons.push("malformed_admitted_event");
    if(byType.has(event.eventType))reasons.push(`duplicate_mandatory_event:${event.eventType}`);else byType.set(event.eventType,event);
    const { eventHash: observedHash, ...hashInput } = event;
    if(event.previousHash!==previous||computeAuditEventHash(hashInput)!==observedHash)reasons.push(`hash_chain_invalid:${event.eventId}`);
    previous=event.eventHash;
  }
  if(requestIds.size>1)reasons.push("mixed_request_transcript");
  const missing=R2_A_AUDIT_OBLIGATIONS.filter((event)=>!byType.has(event));
  const authorization=byType.get("AUTHORIZATION"); const provision=byType.get("PROVISION"); const created=byType.get("CREATED_OBJECT_IDENTITY"); const cleanup=byType.get("CLEANUP"); const postCleanup=byType.get("POST_CLEANUP_OBSERVATION"); const revocation=byType.get("REVOCATION");
  if(authorization&&authorization.result!=="AUTHORIZED")reasons.push("operation_not_authorized");
  if(provision&&provision.result!=="SUCCEEDED")reasons.push("provision_not_successful");
  if(authorization&&provision&&authorization.result!=="AUTHORIZED"&&provision.result==="SUCCEEDED")reasons.push("action_after_denial");
  if(created&&provision&&created.objectIdentity!==provision.objectIdentity)reasons.push("created_identity_mismatch");
  if(cleanup&&cleanup.result!=="SUCCEEDED")reasons.push("cleanup_not_successful");
  if(postCleanup&&postCleanup.result!=="OBSERVED_CLEAN")reasons.push("post_cleanup_not_clean");
  if(revocation&&revocation.result!=="REVOKED")reasons.push("authority_not_revoked");
  const semanticViolation=reasons.some((reason)=>reason.startsWith("hash_chain_invalid")||reason==="mixed_request_transcript"||reason==="action_after_denial"||reason==="created_identity_mismatch"||reason==="operation_not_authorized"||reason==="provision_not_successful"||reason==="cleanup_not_successful"||reason==="post_cleanup_not_clean"||reason==="authority_not_revoked");
  return Object.freeze({decision:semanticViolation?"REJECT":missing.length>0||reasons.length>0?"INSUFFICIENT_EVIDENCE":"COMPLETE",reasons:unique(reasons),missingEvents:missing,
    requestor:byType.get("REQUEST")?.actorIdentity??null,authorityAtAuthorization:authorization?.authority??null,targetedResource:byType.get("REQUEST")?.resourceIdentity??null,
    authorizedObjectIdentity:authorization?.objectIdentity??null,affectedObjectIdentity:created?.objectIdentity??null,actionResult:provision?.result??null,cleanupResult:postCleanup?.result??cleanup?.result??null,
    supportingEvidenceRefs:unique(events.map((event)=>event.evidenceRef)),authorityAfterward:revocation?.result==="REVOKED"?"REVOKED":"UNKNOWN",reconstructsFromAdmittedRecordsOnly:true,grantsAuthority:false});
}
