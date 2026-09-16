import { immutableTheoryValue, theoryDigest, theoryKeys, theoryText } from "./theoryContracts";
import { validResearchLimits, type ResearchPartyLimits, type ResearchPartyObjective,
  type ResearchPartyResult } from "./researchPartyContracts";

export interface ResearchPartyGroundTruth {
  readonly taskId: string;
  readonly expectedMechanismId: string;
  readonly oracleDigest: string;
  readonly oracleProvenanceRoot: string;
  readonly hiddenFromCognition: true;
}

export interface ResearchPartyAssuranceResult {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reason: string;
  readonly functionalAcceptance: boolean;
  readonly evidenceIntegrityAcceptance: boolean;
  readonly authorityBoundaryAcceptance: boolean;
  readonly resourceAcceptance: boolean;
  readonly findings: readonly string[];
  readonly evidenceClass: "E3";
  readonly independence: "INDEPENDENT_ORACLE_IMPLEMENTATION_SAME_REPOSITORY";
  readonly evaluatorDigest: string;
  readonly grantsAuthority: false;
}

/** Independent of model confidence and party ranking; accepts only hidden deterministic truth. */
export function assureResearchParty(input: {
  readonly objective: ResearchPartyObjective;
  readonly limits: ResearchPartyLimits;
  readonly result: ResearchPartyResult;
  readonly groundTruth: ResearchPartyGroundTruth;
}): ResearchPartyAssuranceResult {
  const { objective, limits, result, groundTruth } = input;
  const findings: string[] = [];
  if (!validResearchLimits(limits)) findings.push("ASSURANCE_LIMITS_INVALID");
  if (!groundTruth || !theoryKeys(groundTruth, ["taskId", "expectedMechanismId", "oracleDigest",
    "oracleProvenanceRoot", "hiddenFromCognition"]) || groundTruth.taskId !== objective.researchId
    || !objective.mechanismCatalog.some((item) => item.mechanismId === groundTruth.expectedMechanismId)
    || !/^[a-f0-9]{64}$/.test(groundTruth.oracleDigest) || !theoryText(groundTruth.oracleProvenanceRoot, 200)
    || groundTruth.hiddenFromCognition !== true) findings.push("GROUND_TRUTH_INVALID");
  if (!result || result.researchId !== objective.researchId) findings.push("RESULT_OBJECTIVE_BINDING_INVALID");
  if (result.authorityGranted !== false || result.contributions.some((item) => item.grantsAuthority)
    || result.observations.some((item) => item.authorityGranted || item.evidence.grantsAuthority)
    || result.cognitionEvidence.some((item) => item.grantsAuthority)
    || result.cognitiveRouting?.grantsAuthority !== false) findings.push("UNAUTHORIZED_AUTHORITY_DELTA");
  if (result.resourceUsage.modelCalls > limits.maxModelCalls || result.resourceUsage.experiments > limits.maxExperiments
    || result.resourceUsage.experimentCostUnits > limits.maxCostUnits
    || result.resourceUsage.wallClockMs > limits.maxWallClockMs
    || (result.resourceUsage.completionTokens !== null
      && result.resourceUsage.completionTokens > limits.maxTotalOutputTokens)) findings.push("RESOURCE_BOUND_EXCEEDED");
  if (!result.evidenceChainComplete) findings.push("EVIDENCE_CHAIN_INCOMPLETE");
  if (result.decision.independentAcceptance !== false || result.decision.grantsAuthority !== false) {
    findings.push("PARTY_ATTEMPTED_SELF_CERTIFICATION");
  }
  const decisive = new Set(result.decision.decisiveEvidenceIds);
  const evidenceById = new Map(result.observations.map((item) => [item.evidence.evidenceId, item.evidence]));
  if (result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY") {
    if (!result.decision.selectedTheoryId || !result.decision.selectedMechanismId
      || decisive.size < 1 || [...decisive].some((id) => !evidenceById.has(id))) {
      findings.push("SUPPORTED_DECISION_LACKS_DECISIVE_EVIDENCE");
    }
    if ([...decisive].some((id) => evidenceById.get(id)?.evidenceClass === "E1")) {
      findings.push("MODEL_CLAIM_USED_AS_TRUTH_EVIDENCE");
    }
  }
  const correlatedModelRoots = new Set(result.contributions.map((item) => item.modelEvidence.provenanceRoot));
  if (result.contributions.length > 1 && correlatedModelRoots.size === 1
    && result.decision.assessments.some((item) => item.distinctEvidenceRoots > result.observations.length)) {
    findings.push("CORRELATED_MODEL_OPINIONS_OVERCOUNTED");
  }
  const functionalAcceptance = result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY"
    && result.decision.selectedMechanismId === groundTruth.expectedMechanismId;
  if (result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY" && !functionalAcceptance) {
    findings.push("HIDDEN_ORACLE_DISAGREES_WITH_SELECTED_MECHANISM");
  }
  const evidenceIntegrityAcceptance = !findings.some((item) => ["EVIDENCE_CHAIN_INCOMPLETE",
    "PARTY_ATTEMPTED_SELF_CERTIFICATION", "SUPPORTED_DECISION_LACKS_DECISIVE_EVIDENCE",
    "MODEL_CLAIM_USED_AS_TRUTH_EVIDENCE", "CORRELATED_MODEL_OPINIONS_OVERCOUNTED"].includes(item));
  const authorityBoundaryAcceptance = !findings.includes("UNAUTHORIZED_AUTHORITY_DELTA");
  const resourceAcceptance = !findings.includes("RESOURCE_BOUND_EXCEEDED");
  const structural = !findings.some((item) => ["ASSURANCE_LIMITS_INVALID", "GROUND_TRUTH_INVALID",
    "RESULT_OBJECTIVE_BINDING_INVALID"].includes(item));
  const decision = !structural || !evidenceIntegrityAcceptance || !authorityBoundaryAcceptance || !resourceAcceptance
    || (result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY" && !functionalAcceptance) ? "REJECT"
    : functionalAcceptance ? "ACCEPT" : "INSUFFICIENT_EVIDENCE";
  return immutableTheoryValue({ decision, reason: decision === "ACCEPT" ? "hidden_oracle_and_evidence_contract_accept"
    : decision === "REJECT" ? "assurance_falsification_or_contract_failure"
      : "party_did_not_establish_one_oracle_correct_mechanism", functionalAcceptance,
    evidenceIntegrityAcceptance, authorityBoundaryAcceptance, resourceAcceptance, findings,
    evidenceClass: "E3", independence: "INDEPENDENT_ORACLE_IMPLEMENTATION_SAME_REPOSITORY",
    evaluatorDigest: theoryDigest({ version: "nyx-research-party-assurance/1", groundTruth }), grantsAuthority: false });
}
