import {
  CAPABILITY_RELATION_KINDS,
  CORPUS_STATUSES,
  EPISTEMIC_STATES,
  EVIDENCE_CLASSES,
  MATURITY_STATES,
  PLAN_RELATION_KINDS,
  RESEARCH_MATURITY_STATES,
  VERIFICATION_STATES,
  type CapabilityRecord,
  type CapabilityCertificate,
  type CapabilityRelationKind,
  type EvidenceRecord,
  type MaturityState,
  type OmegaRegistry,
  type PlanRecord,
  type PlanRelationKind,
  type RegistryRecordBase,
  type SourceProvenance,
} from "./types";

export interface RegistryError {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type RegistryValidation =
  | { readonly ok: true; readonly registry: OmegaRegistry }
  | { readonly ok: false; readonly errors: readonly RegistryError[] };

const ACTIVE_MATURITY_PATH = Object.freeze([
  "PROPOSED",
  "SPECIFIED",
  "PROTOTYPED",
  "IMPLEMENTED",
  "INTEGRATED",
  "VERIFIED",
  "INDEPENDENTLY_REPLICATED",
  "PRODUCTION_READY",
  "ROUTINIZED",
] as const);

const INDEPENDENT_EVIDENCE = new Set(["E2", "E3", "E4", "E5"]);
const VERIFIED_MATURITY = new Set<MaturityState>([
  "VERIFIED",
  "INDEPENDENTLY_REPLICATED",
  "PRODUCTION_READY",
  "ROUTINIZED",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-zΩ][A-Za-z0-9Ω._:-]{2,127}$/.test(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function validateCorpusHonesty(
  corpusStatus: unknown,
  losslessCertification: unknown,
  path: string,
  errors: RegistryError[],
): void {
  if (!(CORPUS_STATUSES as readonly unknown[]).includes(corpusStatus)) {
    errors.push({ code: "bad_corpus_status", path, message: "Unknown corpus status." });
    return;
  }
  if (typeof losslessCertification !== "boolean") {
    errors.push({ code: "bad_lossless_flag", path, message: "losslessCertification must be boolean." });
    return;
  }
  if (corpusStatus === "PARTIAL" && losslessCertification) {
    errors.push({ code: "partial_claims_lossless", path, message: "A partial corpus cannot claim lossless certification." });
  }
  if (corpusStatus === "LOSSLESSLY_CERTIFIED" && !losslessCertification) {
    errors.push({ code: "certified_without_flag", path, message: "Losslessly certified corpus requires the certification flag." });
  }
  if (corpusStatus !== "LOSSLESSLY_CERTIFIED" && losslessCertification) {
    errors.push({ code: "uncertified_claims_lossless", path, message: "Only LOSSLESSLY_CERTIFIED may set the certification flag." });
  }
}

function validateSource(source: unknown, path: string, requireHash: boolean, errors: RegistryError[]): void {
  if (!isObject(source)) {
    errors.push({ code: "bad_provenance", path, message: "Source provenance must be an object." });
    return;
  }
  if (!isNonEmptyString(source.sourceId)) errors.push({ code: "bad_source_id", path, message: "sourceId is required." });
  if (!isNonEmptyString(source.locator)) errors.push({ code: "bad_source_locator", path, message: "Source locator is required." });
  if (!["conversation", "document", "repository", "external"].includes(String(source.sourceType))) {
    errors.push({ code: "bad_source_type", path, message: "Unknown source type." });
  }
  if (source.contentHash !== null && !/^[a-f0-9]{8,128}$/i.test(String(source.contentHash))) {
    errors.push({ code: "bad_content_hash", path, message: "Content hash must be null or hexadecimal." });
  }
  if (requireHash && source.contentHash === null) {
    errors.push({ code: "certified_source_without_hash", path, message: "Lossless source certification requires a content hash." });
  }
}

function validateEvidence(evidence: unknown, path: string, errors: RegistryError[]): EvidenceRecord[] {
  if (!Array.isArray(evidence)) {
    errors.push({ code: "bad_evidence", path, message: "Evidence must be an array." });
    return [];
  }
  const valid: EvidenceRecord[] = [];
  const ids = new Set<string>();
  evidence.forEach((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(raw)) {
      errors.push({ code: "bad_evidence_record", path: itemPath, message: "Evidence record must be an object." });
      return;
    }
    if (!isCanonicalId(raw.evidenceId)) {
      errors.push({ code: "bad_evidence_id", path: itemPath, message: "Evidence ID is invalid." });
    } else if (ids.has(raw.evidenceId)) {
      errors.push({ code: "duplicate_evidence_id", path: itemPath, message: "Evidence IDs must be unique within a record." });
    } else {
      ids.add(raw.evidenceId);
    }
    if (!(EVIDENCE_CLASSES as readonly unknown[]).includes(raw.evidenceClass)) {
      errors.push({ code: "bad_evidence_class", path: itemPath, message: "Unknown evidence class." });
    }
    if (!["SUPPORTS", "FALSIFIES", "INCONCLUSIVE"].includes(String(raw.result))) {
      errors.push({ code: "bad_evidence_result", path: itemPath, message: "Unknown evidence result." });
    }
    for (const key of ["claim", "artifactRef", "mechanism"] as const) {
      if (!isNonEmptyString(raw[key])) errors.push({ code: `bad_${key}`, path: itemPath, message: `${key} is required.` });
    }
    if (!["CURRENT", "STALE"].includes(String(raw.freshness))) {
      errors.push({ code: "bad_freshness", path: itemPath, message: "Unknown evidence freshness." });
    }
    const independent = INDEPENDENT_EVIDENCE.has(String(raw.evidenceClass));
    if (independent && !isNonEmptyString(raw.independenceBasis)) {
      errors.push({ code: "independence_unjustified", path: itemPath, message: "E2-E5 evidence requires an independence basis." });
    }
    if (!independent && raw.independenceBasis !== null) {
      errors.push({ code: "correlated_claims_independence", path: itemPath, message: "E0-E1 evidence cannot claim an independence basis." });
    }
    validateSource(raw.provenance, `${itemPath}.provenance`, false, errors);
    valid.push(raw as unknown as EvidenceRecord);
  });
  return valid;
}

function validateCriteria(value: unknown, path: string, errors: RegistryError[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push({ code: "missing_criteria", path, message: "At least one criterion is required." });
    return;
  }
  const ids = new Set<string>();
  value.forEach((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(raw)) {
      errors.push({ code: "bad_criterion", path: itemPath, message: "Criterion must be an object." });
      return;
    }
    if (!isCanonicalId(raw.criterionId)) errors.push({ code: "bad_criterion_id", path: itemPath, message: "Criterion ID is invalid." });
    else if (ids.has(raw.criterionId)) errors.push({ code: "duplicate_criterion_id", path: itemPath, message: "Criterion IDs must be unique." });
    else ids.add(raw.criterionId);
    for (const key of ["statement", "measurement", "threshold"] as const) {
      if (!isNonEmptyString(raw[key])) errors.push({ code: `bad_${key}`, path: itemPath, message: `${key} is required.` });
    }
  });
}

function validateMaturity(
  record: RegistryRecordBase,
  path: string,
  evidence: readonly EvidenceRecord[],
  errors: RegistryError[],
): void {
  if (!(MATURITY_STATES as readonly unknown[]).includes(record.maturity)) {
    errors.push({ code: "bad_maturity", path, message: "Unknown maturity state." });
    return;
  }
  if (!Array.isArray(record.maturityHistory) || record.maturityHistory.length === 0) {
    errors.push({ code: "missing_maturity_history", path, message: "Maturity history is required." });
    return;
  }

  if (record.maturityHistory.some((entry) => !isObject(entry))) {
    errors.push({ code: "bad_maturity_attestation", path, message: "Every maturity attestation must be an object." });
    return;
  }
  const states = record.maturityHistory.map((entry) => entry.state);
  if (states.at(-1) !== record.maturity) {
    errors.push({ code: "maturity_history_mismatch", path, message: "Maturity history must end at the current state." });
  }
  const terminal = record.maturity === "REJECTED_EXPERIMENTALLY" || record.maturity === "RETIRED";
  const activeStates = terminal ? states.slice(0, -1) : states;
  const expected = ACTIVE_MATURITY_PATH.slice(0, activeStates.length);
  if (activeStates.length === 0 || activeStates.some((state, index) => state !== expected[index])) {
    errors.push({ code: "maturity_gate_skipped", path, message: "Active maturity gates must be recorded in order without skips." });
  }

  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  record.maturityHistory.forEach((entry, index) => {
    if (!isNonEmptyString(entry.rationale)) {
      errors.push({ code: "missing_maturity_rationale", path: `${path}[${index}]`, message: "Maturity rationale is required." });
    }
    for (const evidenceId of entry.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push({ code: "unknown_maturity_evidence", path: `${path}[${index}]`, message: `Unknown evidence ID ${evidenceId}.` });
      }
    }
    if (VERIFIED_MATURITY.has(entry.state) && entry.evidenceIds.length === 0) {
      errors.push({ code: "verified_without_attestation_evidence", path: `${path}[${index}]`, message: "Verified gates require evidence." });
    }
  });

  const supporting = evidence.filter((item) => item.result === "SUPPORTS" && item.freshness === "CURRENT");
  const independent = supporting.filter(
    (item) => INDEPENDENT_EVIDENCE.has(item.evidenceClass) && isNonEmptyString(item.independenceBasis),
  );
  const falsifying = evidence.filter((item) => item.result === "FALSIFIES");

  if (VERIFIED_MATURITY.has(record.maturity) && supporting.length === 0) {
    errors.push({ code: "verified_without_evidence", path, message: "Verified maturity requires current supporting evidence." });
  }
  if (["INDEPENDENTLY_REPLICATED", "PRODUCTION_READY", "ROUTINIZED"].includes(record.maturity) && independent.length === 0) {
    errors.push({ code: "replicated_without_independent_evidence", path, message: "Replicated or later maturity requires independent evidence." });
  }
  if (record.maturity === "REJECTED_EXPERIMENTALLY" && falsifying.length === 0) {
    errors.push({ code: "rejected_without_falsification", path, message: "Experimental rejection requires falsification evidence." });
  }
}

function validateEpistemic(record: RegistryRecordBase, path: string, evidence: readonly EvidenceRecord[], errors: RegistryError[]): void {
  if (!(EPISTEMIC_STATES as readonly unknown[]).includes(record.epistemicState)) {
    errors.push({ code: "bad_epistemic_state", path, message: "Unknown epistemic state." });
    return;
  }
  const currentSupporting = evidence.some((item) => item.result === "SUPPORTS" && item.freshness === "CURRENT");
  const falsifying = evidence.some((item) => item.result === "FALSIFIES");
  const stale = evidence.some((item) => item.freshness === "STALE");
  if (record.epistemicState === "SUPPORTED" && !currentSupporting) {
    errors.push({ code: "supported_without_evidence", path, message: "SUPPORTED requires current supporting evidence." });
  }
  if (record.epistemicState === "REFUTED" && !falsifying) {
    errors.push({ code: "refuted_without_evidence", path, message: "REFUTED requires falsifying evidence." });
  }
  if (record.epistemicState === "CONFLICTED" && !(currentSupporting && falsifying)) {
    errors.push({ code: "conflicted_without_both_sides", path, message: "CONFLICTED requires supporting and falsifying evidence." });
  }
  if (record.epistemicState === "STALE" && !stale) {
    errors.push({ code: "stale_without_stale_evidence", path, message: "STALE requires stale evidence." });
  }
}

function validateVerification(record: RegistryRecordBase, path: string, evidence: readonly EvidenceRecord[], errors: RegistryError[]): void {
  if (!(VERIFICATION_STATES as readonly unknown[]).includes(record.verificationState)) {
    errors.push({ code: "bad_verification_state", path, message: "Unknown verification state." });
    return;
  }
  const supporting = evidence.some((item) => item.result === "SUPPORTS" && item.freshness === "CURRENT");
  const independent = evidence.some(
    (item) => item.result === "SUPPORTS" && item.freshness === "CURRENT" && INDEPENDENT_EVIDENCE.has(item.evidenceClass),
  );
  if (["VERIFIED", "INDEPENDENTLY_REPLICATED"].includes(record.verificationState) && !supporting) {
    errors.push({ code: "verification_without_evidence", path, message: "Verification requires current supporting evidence." });
  }
  if (record.verificationState === "INDEPENDENTLY_REPLICATED" && !independent) {
    errors.push({ code: "independent_verification_missing", path, message: "Independent replication requires E2-E5 supporting evidence." });
  }
  if (record.maturity === "REJECTED_EXPERIMENTALLY" && record.verificationState !== "REJECTED") {
    errors.push({ code: "rejected_verification_mismatch", path, message: "Rejected maturity requires REJECTED verification state." });
  }
}

function validateSecurity(record: RegistryRecordBase, path: string, evidenceIds: Set<string>, errors: RegistryError[]): void {
  const security = record.securityProfile;
  if (!isObject(security)) {
    errors.push({ code: "missing_security_profile", path, message: "Security profile is required." });
    return;
  }
  const requiredArrays = [
    "threatModel",
    "privilegeRequirements",
    "isolationRequirements",
    "attackSurface",
    "trustAssumptions",
    "possibleMisuse",
    "compromisePaths",
    "containmentMechanisms",
    "rollbackMechanisms",
    "securityEvidenceIds",
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(security[key])) errors.push({ code: "bad_security_field", path: `${path}.${key}`, message: `${key} must be an array.` });
  }
  if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(security.dataSensitivity))) {
    errors.push({ code: "bad_data_sensitivity", path, message: "Unknown data sensitivity." });
  }
  if (!isNonEmptyString(security.blastRadius)) errors.push({ code: "missing_blast_radius", path, message: "Blast radius is required." });
  if (Array.isArray(security.securityEvidenceIds)) {
    for (const id of security.securityEvidenceIds) {
      if (!evidenceIds.has(id)) errors.push({ code: "unknown_security_evidence", path, message: `Unknown security evidence ID ${id}.` });
    }
  }
}

function validateRecord(record: RegistryRecordBase, path: string, errors: RegistryError[]): void {
  if (!isCanonicalId(record.canonicalId)) errors.push({ code: "bad_canonical_id", path, message: "Canonical ID is invalid." });
  if (!isNonEmptyString(record.originalSourceId)) errors.push({ code: "bad_original_id", path, message: "Original/source ID is required." });
  if (!isNonEmptyString(record.title)) errors.push({ code: "bad_title", path, message: "Title is required." });
  validateCorpusHonesty(record.corpusStatus, record.losslessCertification, `${path}.corpus`, errors);
  validateSource(record.source, `${path}.source`, record.losslessCertification, errors);
  const evidence = validateEvidence(record.evidence, `${path}.evidence`, errors);
  validateCriteria(record.acceptanceCriteria, `${path}.acceptanceCriteria`, errors);
  validateCriteria(record.falsificationCriteria, `${path}.falsificationCriteria`, errors);
  validateMaturity(record, `${path}.maturityHistory`, evidence, errors);
  validateEpistemic(record, `${path}.epistemicState`, evidence, errors);
  validateVerification(record, `${path}.verificationState`, evidence, errors);
  validateSecurity(record, `${path}.securityProfile`, new Set(evidence.map((item) => item.evidenceId)), errors);
  if (!(RESEARCH_MATURITY_STATES as readonly unknown[]).includes(record.researchMaturity)) {
    errors.push({ code: "bad_research_maturity", path, message: "Unknown research maturity." });
  }
  if (!Array.isArray(record.dependencies) || !Array.isArray(record.implementationMappings)) {
    errors.push({ code: "bad_record_collections", path, message: "Dependencies and implementation mappings must be arrays." });
  } else {
    record.implementationMappings.forEach((mapping, index) => {
      const mappingPath = `${path}.implementationMappings[${index}]`;
      if (!isObject(mapping)) {
        errors.push({ code: "bad_implementation_mapping", path: mappingPath, message: "Implementation mapping must be an object." });
        return;
      }
      if (!["repository", "service", "model", "tool", "process"].includes(String(mapping.kind))) {
        errors.push({ code: "bad_implementation_kind", path: mappingPath, message: "Unknown implementation mapping kind." });
      }
      if (!isNonEmptyString(mapping.ref)) {
        errors.push({ code: "bad_implementation_ref", path: mappingPath, message: "Implementation reference is required." });
      }
      if (!["active", "experimental", "historical"].includes(String(mapping.status))) {
        errors.push({ code: "bad_implementation_status", path: mappingPath, message: "Unknown implementation mapping status." });
      }
    });
  }
  if (record.hypothesis !== undefined) {
    const hypothesis = record.hypothesis;
    if (!isObject(hypothesis)) {
      errors.push({ code: "bad_hypothesis", path: `${path}.hypothesis`, message: "Hypothesis must be an object." });
      return;
    }
    for (const key of [
      "statement",
      "supportCriterion",
      "falsificationCriterion",
      "baseline",
      "measurementMethod",
      "requiredPopulation",
      "computeBudget",
      "calibrationRequirement",
    ] as const) {
      if (!isNonEmptyString(hypothesis[key])) errors.push({ code: "bad_hypothesis", path: `${path}.hypothesis.${key}`, message: `${key} is required.` });
    }
    if (!Array.isArray(hypothesis.competingExplanations) || hypothesis.competingExplanations.length === 0) {
      errors.push({ code: "bad_hypothesis", path: `${path}.hypothesis.competingExplanations`, message: "At least one competing explanation is required." });
    }
  }
}

export function validateRegistry(candidate: unknown): RegistryValidation {
  const errors: RegistryError[] = [];
  if (!isObject(candidate) || candidate.schemaVersion !== 1) {
    return { ok: false, errors: [{ code: "bad_schema_version", path: "$", message: "Registry schemaVersion must be 1." }] };
  }
  const registry = candidate as unknown as OmegaRegistry;
  validateCorpusHonesty(registry.corpusStatus, registry.losslessCertification, "$.corpus", errors);
  if (!Array.isArray(registry.plans) || !Array.isArray(registry.capabilities) || !Array.isArray(registry.regressions)) {
    return { ok: false, errors: [...errors, { code: "bad_registry_collections", path: "$", message: "Registry collections must be arrays." }] };
  }

  const malformedPlan = registry.plans.findIndex((record) => !isObject(record) || record.recordType !== "PLAN");
  const malformedCapability = registry.capabilities.findIndex(
    (record) => !isObject(record) || record.recordType !== "CAPABILITY",
  );
  const malformedRegression = registry.regressions.findIndex((record) => !isObject(record));
  if (malformedPlan >= 0 || malformedCapability >= 0 || malformedRegression >= 0) {
    if (malformedPlan >= 0) {
      errors.push({ code: "bad_plan_record", path: `$.plans[${malformedPlan}]`, message: "Plan recordType must be PLAN." });
    }
    if (malformedCapability >= 0) {
      errors.push({
        code: "bad_capability_record",
        path: `$.capabilities[${malformedCapability}]`,
        message: "Capability recordType must be CAPABILITY.",
      });
    }
    if (malformedRegression >= 0) {
      errors.push({
        code: "bad_regression_record",
        path: `$.regressions[${malformedRegression}]`,
        message: "Regression record must be an object.",
      });
    }
    return { ok: false, errors };
  }

  const allRecords = [...registry.plans, ...registry.capabilities];
  const allIds = new Set<string>();
  allRecords.forEach((record, index) => {
    const path = record.recordType === "PLAN" ? `$.plans[${index}]` : `$.capabilities[${index - registry.plans.length}]`;
    validateRecord(record, path, errors);
    if (registry.losslessCertification && !record.losslessCertification) {
      errors.push({
        code: "registry_certified_with_uncertified_record",
        path,
        message: "A losslessly certified registry cannot contain an uncertified record.",
      });
    }
    if (allIds.has(record.canonicalId)) errors.push({ code: "duplicate_canonical_id", path, message: `Duplicate canonical ID ${record.canonicalId}.` });
    allIds.add(record.canonicalId);
  });

  const planIds = new Set(registry.plans.map((record) => record.canonicalId));
  const capabilityIds = new Set(registry.capabilities.map((record) => record.canonicalId));
  registry.plans.forEach((record, index) => {
    validateRelationships(record, PLAN_RELATION_KINDS, planIds, `$.plans[${index}].relationships`, errors);
  });
  registry.capabilities.forEach((record, index) => {
    validateRelationships(record, CAPABILITY_RELATION_KINDS, capabilityIds, `$.capabilities[${index}].relationships`, errors);
    if (!Array.isArray(record.expectedEvidence) || record.expectedEvidence.length === 0) {
      errors.push({
        code: "missing_expected_evidence",
        path: `$.capabilities[${index}].expectedEvidence`,
        message: "Capabilities require expected evidence descriptions.",
      });
    }
    if (record.certificates !== undefined) {
      const path = `$.capabilities[${index}].certificates`;
      if (!Array.isArray(record.certificates)) {
        errors.push({ code: "bad_capability_certificates", path, message: "Capability certificates must be an array." });
      } else {
        const certificateIds = new Set<string>();
        const evidenceIds = new Set(record.evidence.map((item: EvidenceRecord) => item.evidenceId));
        record.certificates.forEach((certificate: CapabilityCertificate, certificateIndex: number) => {
          const certificatePath = `${path}[${certificateIndex}]`;
          if (!isObject(certificate)) {
            errors.push({ code: "bad_capability_certificate", path: certificatePath, message: "Certificate must be an object." });
            return;
          }
          if (!isCanonicalId(certificate.certificateId)) {
            errors.push({ code: "bad_certificate_id", path: certificatePath, message: "Certificate ID is invalid." });
          } else if (certificateIds.has(certificate.certificateId)) {
            errors.push({ code: "duplicate_certificate_id", path: certificatePath, message: "Certificate IDs must be unique within a capability." });
          } else certificateIds.add(certificate.certificateId);
          if (!isNonEmptyString(certificate.title) || !isNonEmptyString(certificate.threshold) || !isNonEmptyString(certificate.result)) {
            errors.push({ code: "bad_certificate_description", path: certificatePath, message: "Certificate title, threshold, and result are required." });
          }
          if (!(MATURITY_STATES as readonly unknown[]).includes(certificate.maturity)) {
            errors.push({ code: "bad_certificate_maturity", path: certificatePath, message: "Unknown certificate maturity." });
          }
          if (!(EPISTEMIC_STATES as readonly unknown[]).includes(certificate.epistemicState)) {
            errors.push({ code: "bad_certificate_epistemic_state", path: certificatePath, message: "Unknown certificate epistemic state." });
          }
          if (!(VERIFICATION_STATES as readonly unknown[]).includes(certificate.verificationState)) {
            errors.push({ code: "bad_certificate_verification_state", path: certificatePath, message: "Unknown certificate verification state." });
          }
          if (!Array.isArray(certificate.evidenceIds)) {
            errors.push({ code: "bad_certificate_evidence", path: certificatePath, message: "Certificate evidence IDs must be an array." });
          } else {
            for (const evidenceId of certificate.evidenceIds) {
              if (!evidenceIds.has(evidenceId)) errors.push({ code: "unknown_certificate_evidence", path: certificatePath, message: `Unknown certificate evidence ${evidenceId}.` });
            }
            if (["VERIFIED", "INDEPENDENTLY_REPLICATED", "PRODUCTION_READY", "ROUTINIZED"].includes(String(certificate.maturity)) && certificate.evidenceIds.length === 0) {
              errors.push({ code: "verified_certificate_without_evidence", path: certificatePath, message: "Verified certificate maturity requires evidence." });
            }
          }
          if (typeof certificate.confidence !== "number" || !Number.isFinite(certificate.confidence) || certificate.confidence < 0 || certificate.confidence > 1) {
            errors.push({ code: "bad_certificate_confidence", path: certificatePath, message: "Certificate confidence must be between 0 and 1." });
          }
        });
      }
    }
  });
  allRecords.forEach((record) => {
    const seen = new Set<string>();
    for (const dependency of Array.isArray(record.dependencies) ? record.dependencies : []) {
      if (!allIds.has(dependency)) errors.push({ code: "unknown_dependency", path: record.canonicalId, message: `Unknown dependency ${dependency}.` });
      if (dependency === record.canonicalId) errors.push({ code: "self_dependency", path: record.canonicalId, message: "A record cannot depend on itself." });
      if (seen.has(dependency)) errors.push({ code: "duplicate_dependency", path: record.canonicalId, message: `Duplicate dependency ${dependency}.` });
      seen.add(dependency);
    }
  });

  registry.regressions.forEach((record, index) => {
    const path = `$.regressions[${index}]`;
    const capability = registry.capabilities.find((candidate) => candidate.canonicalId === record.capabilityId);
    if (!capability) errors.push({ code: "unknown_regression_capability", path, message: `Unknown capability ${record.capabilityId}.` });
    if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) {
      errors.push({ code: "bad_regression_confidence", path, message: "Regression confidence must be between 0 and 1." });
    }
    if (!Array.isArray(record.expectedEvidence) || !Array.isArray(record.previousEvidenceIds) || !Array.isArray(record.currentEvidenceIds)) {
      errors.push({ code: "bad_regression_collections", path, message: "Regression evidence fields must be arrays." });
      return;
    }
    if (!["IMPROVED", "UNCHANGED", "REGRESSED", "NEW", "UNKNOWN"].includes(String(record.change))) {
      errors.push({ code: "bad_regression_change", path, message: "Unknown regression change state." });
    }
    if (!isNonEmptyString(record.previousResult) || !isNonEmptyString(record.currentResult)) {
      errors.push({ code: "bad_regression_result", path, message: "Previous and current regression results are required." });
    }
    const currentEvidence = new Set(capability?.evidence.map((item) => item.evidenceId) ?? []);
    for (const evidenceId of record.currentEvidenceIds) {
      if (!currentEvidence.has(evidenceId)) errors.push({ code: "unknown_current_regression_evidence", path, message: `Unknown current evidence ${evidenceId}.` });
    }
  });

  return errors.length === 0 ? { ok: true, registry } : { ok: false, errors };
}

function validateRelationships(
  record: PlanRecord | CapabilityRecord,
  allowedKinds: readonly string[],
  targetIds: ReadonlySet<string>,
  path: string,
  errors: RegistryError[],
): void {
  if (!Array.isArray(record.relationships)) {
    errors.push({ code: "bad_relationships", path, message: "Relationships must be an array." });
    return;
  }
  const seen = new Set<string>();
  record.relationships.forEach((relationship) => {
    if (!isObject(relationship)) {
      errors.push({ code: "bad_relationship", path, message: "Relationship must be an object." });
      return;
    }
    const kind = String(relationship.kind);
    const targetId = String(relationship.targetId);
    const key = `${kind}:${targetId}`;
    if (!allowedKinds.includes(kind)) errors.push({ code: "bad_relationship_kind", path, message: `Unknown relationship ${kind}.` });
    if (!targetIds.has(targetId)) errors.push({ code: "unknown_relationship_target", path, message: `Unknown target ${targetId}.` });
    if (targetId === record.canonicalId) errors.push({ code: "self_relationship", path, message: "Self relationships are forbidden." });
    if (seen.has(key)) errors.push({ code: "duplicate_relationship", path, message: `Duplicate relationship ${key}.` });
    seen.add(key);
  });
}

export function planRelationships(
  registry: OmegaRegistry,
  canonicalId: string,
  kind?: PlanRelationKind,
): readonly PlanRecord[] {
  const record = registry.plans.find((candidate) => candidate.canonicalId === canonicalId);
  if (!record) return [];
  const targets = new Set(record.relationships.filter((relation) => kind === undefined || relation.kind === kind).map((relation) => relation.targetId));
  return registry.plans.filter((candidate) => targets.has(candidate.canonicalId));
}

export function capabilityRelationships(
  registry: OmegaRegistry,
  canonicalId: string,
  kind?: CapabilityRelationKind,
): readonly CapabilityRecord[] {
  const record = registry.capabilities.find((candidate) => candidate.canonicalId === canonicalId);
  if (!record) return [];
  const targets = new Set(record.relationships.filter((relation) => kind === undefined || relation.kind === kind).map((relation) => relation.targetId));
  return registry.capabilities.filter((candidate) => targets.has(candidate.canonicalId));
}

export function dependenciesOf(registry: OmegaRegistry, canonicalId: string): readonly (PlanRecord | CapabilityRecord)[] {
  const all = [...registry.plans, ...registry.capabilities];
  const record = all.find((candidate) => candidate.canonicalId === canonicalId);
  if (!record) return [];
  const dependencies = new Set(record.dependencies);
  return all.filter((candidate) => dependencies.has(candidate.canonicalId));
}

export type SerializationResult =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly errors: readonly RegistryError[] };

export function serializeRegistry(registry: OmegaRegistry): SerializationResult {
  const validation = validateRegistry(registry);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, json: canonicalJson(registry) };
}

export function deserializeRegistry(json: string): RegistryValidation {
  try {
    return validateRegistry(JSON.parse(json) as OmegaRegistry);
  } catch {
    return { ok: false, errors: [{ code: "invalid_json", path: "$", message: "Registry JSON is invalid." }] };
  }
}

export function evidenceIsIndependent(evidence: EvidenceRecord): boolean {
  return INDEPENDENT_EVIDENCE.has(evidence.evidenceClass) && isNonEmptyString(evidence.independenceBasis);
}

export function sourceProvenanceEqual(a: SourceProvenance, b: SourceProvenance): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
