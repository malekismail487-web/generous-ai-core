import { immutableTheoryValue, theoryDigest } from "./theoryContracts";

/** Shared proposal custody, NOT an acceptance oracle. Existing frontier and quantitative
 * cognition use the same reference law instead of re-emitting large constructed artifacts.
 */
export function materializeAnalysisArtifactFields(observation: Readonly<Record<string, unknown>>, value: unknown) {
  if(!value||typeof value!=="object"||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value))
    ||Reflect.ownKeys(value).some(key=>typeof key!=="string")
    ||Reflect.ownKeys(value).sort().join()!=="confidence,operation,problemDigest,resultDigest,schemaVersion"
    ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!d.enumerable||!Object.prototype.hasOwnProperty.call(d,"value")))
    throw Error("frontier_artifact_reference_not_authorized");
  const request=value as Record<string,unknown>;
  if(request.schemaVersion!==1||request.operation!=="SUBMIT_ANALYSIS_ARTIFACT"
    ||request.problemDigest!==observation.problemDigest||request.resultDigest!==theoryDigest(observation)
    ||typeof request.confidence!=="number"||!Number.isFinite(request.confidence)||request.confidence<0||request.confidence>1
    ||observation.decision!=="CANDIDATE_CONSTRUCTED_NOT_ACCEPTED"||!observation.certificateFields)
    throw Error("frontier_artifact_reference_not_authorized");
  return immutableTheoryValue({fields:observation.certificateFields as Readonly<Record<string,unknown>>,confidence:request.confidence});
}
