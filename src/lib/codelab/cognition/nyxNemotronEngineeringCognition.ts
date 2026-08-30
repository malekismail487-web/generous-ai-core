import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { NvidiaNimProvider, type NvidiaNimEvidence } from "../model/nvidiaNimProvider";
import type { EngineeringObservation } from "../observation/r3EngineeringObservation";

export const NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS = Object.freeze({
  chunkId: "OMEGA-R3-D-NYX-COGNITION-001",
  maturity: "IMPLEMENTED_AND_VERIFIED_WITH_TEST_DOUBLE",
  newCapability: "NYX_NEMOTRON_REPAIR_HYPOTHESIS_PROPOSAL",
  cognitionIdentity: "NYX_PRIMARY_COGNITION",
  cognitiveSubstrate: "NVIDIA_NEMOTRON_3_ULTRA",
  externalAgentOrController: false,
  grantsOmegaAuthority: false,
  productionEligible: false,
} as const);

export interface NyxEngineeringFileContext {
  readonly relativePath: string;
  readonly content: string;
  readonly contentSha256: string;
}

export interface NyxAvailableEvidence {
  readonly evidenceRef: string;
  readonly kind: "FILE";
  readonly relativePath: string;
  readonly description: string;
}

export type NyxHypothesisDisposition = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "FALSIFIED"
  | "INSUFFICIENT_EVIDENCE" | "SUPERSEDED";

export interface NyxPriorHypothesis {
  readonly hypothesisId: string;
  readonly parentHypothesisId: string | null;
  readonly causalHypothesis: string;
  readonly expectedResult: string;
  readonly strategyDigest: string;
  readonly disposition: NyxHypothesisDisposition;
  readonly verificationEvidenceRefs: readonly string[];
}

export interface NyxRepairCognitionRequest {
  readonly schemaVersion: 1;
  readonly cognitionRequestId: string;
  readonly objective: string;
  readonly observation: EngineeringObservation;
  readonly files: readonly NyxEngineeringFileContext[];
  readonly allowedMutationPaths: readonly string[];
  readonly availableEvidence: readonly NyxAvailableEvidence[];
  readonly priorHypotheses: readonly NyxPriorHypothesis[];
  readonly allowedVerificationToolIds: readonly string[];
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
  readonly maxDiagnosisCharacters: number;
  readonly maxCounterexamples: number;
  readonly observedAtEpochMs: number;
}

export interface NyxRepairChange {
  readonly kind: "MODIFY";
  readonly relativePath: string;
  readonly expectedBaseHash: string;
  readonly replacementContent: string;
  readonly replacementContentHash: string;
}

export interface NyxRepairHypothesis {
  readonly schemaVersion: 1;
  readonly hypothesisId: string;
  readonly cognitionRequestId: string;
  readonly sourceObservationId: string;
  readonly parentHypothesisId: string | null;
  readonly diagnosis: string;
  readonly causalHypothesis: string;
  readonly evidenceRefs: readonly string[];
  readonly uncertainties: readonly string[];
  readonly invariant: string;
  readonly failureInterpretation: string;
  readonly expectedResult: string;
  readonly counterexamples: readonly string[];
  readonly assumptions: readonly string[];
  readonly changes: readonly NyxRepairChange[];
  readonly verificationToolIds: readonly string[];
  readonly confidence: number;
  readonly strategyDigest: string;
  readonly disposition: "PENDING_VERIFICATION";
  readonly proposalDigest: string;
  readonly applyAuthorized: false;
}

export interface NyxEvidenceRequest {
  readonly requestedEvidenceRefs: readonly string[];
  readonly diagnosis: string;
  readonly causalHypothesis: string;
  readonly uncertainties: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly requestDigest: string;
  readonly authorityGranted: false;
}

export interface NyxRepairCognitionEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: NvidiaNimEvidence["evidenceClass"];
  readonly sourceObservationId: string;
  readonly sourceExecutionEvidenceId: string;
  readonly modelEvidenceId: string;
  readonly model: string;
  readonly cognitiveSubstrate: "NVIDIA_NEMOTRON_3_ULTRA";
  readonly modelRequestDigest: string | null;
  readonly modelResponseDigest: string | null;
  readonly modelStatusCode: number | null;
  readonly contractVersion: typeof NYX_SEMANTIC_REPAIR_CONTRACT_VERSION;
  readonly contractDigest: string;
  readonly modelUsage: NvidiaNimEvidence["usage"];
  readonly proposalDigest: string | null;
  readonly authorityGranted: false;
}

export interface NyxRepairCognitionResult {
  readonly decision: "PROPOSED" | "REQUEST_EVIDENCE" | "NO_ACTION" | "REJECTED" | "BLOCKED" | "COGNITION_ERROR";
  readonly reason: string;
  readonly hypothesis: NyxRepairHypothesis | null;
  readonly evidenceRequest: NyxEvidenceRequest | null;
  readonly evidence: NyxRepairCognitionEvidence;
  readonly schemaDiagnostics: readonly NyxSchemaDiagnostic[];
  readonly omegaAuthorityGranted: false;
}

export type NyxSchemaDiagnosticCategory =
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_TYPE"
  | "INVALID_ENUM_VALUE"
  | "UNEXPECTED_STRUCTURE"
  | "UNKNOWN_CAPABILITY"
  | "INVALID_TARGET_REFERENCE"
  | "STALE_TARGET_REFERENCE"
  | "UNSUPPORTED_FILE_TARGET"
  | "MODEL_GENERATED_INFRASTRUCTURE_METADATA"
  | "UNSUPPORTED_EVIDENCE_REFERENCE"
  | "UNJUSTIFIED_EPISTEMIC_EXIT"
  | "REPEATED_FALSIFIED_STRATEGY"
  | "HIDDEN_EVALUATOR_TARGETING"
  | "SEMANTIC_REPAIR_ABSENT"
  | "SEMANTIC_REPAIR_INVALID"
  | "OTHER_SCHEMA_MISMATCH";

export interface NyxSchemaDiagnostic {
  readonly category: NyxSchemaDiagnosticCategory;
  readonly path: string;
  readonly expected: string;
  readonly observed: string;
}

interface RawRepairIntent {
  readonly decision?: unknown;
  readonly diagnosis?: unknown;
  readonly causalHypothesis?: unknown;
  readonly evidenceRefs?: unknown;
  readonly uncertainties?: unknown;
  readonly invariant?: unknown;
  readonly failureInterpretation?: unknown;
  readonly expectedResult?: unknown;
  readonly counterexamples?: unknown;
  readonly requestedEvidenceRefs?: unknown;
  readonly assumptions?: unknown;
  readonly changes?: unknown;
  readonly confidence?: unknown;
  readonly [key: string]: unknown;
}

export const NYX_REPAIR_INTENT_JSON_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  type: "object",
  properties: {
    decision: { type: "string", enum: ["PROPOSE_EDIT", "REQUEST_EVIDENCE", "NO_ACTION"] },
    diagnosis: { type: "string" },
    causalHypothesis: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
    invariant: { type: "string" },
    failureInterpretation: { type: "string" },
    expectedResult: { type: "string" },
    counterexamples: { type: "array", items: { type: "string" } },
    requestedEvidenceRefs: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    changes: { type: "array", items: { type: "object", properties: {
      target: { type: "string" }, replacement: { type: "string" },
    }, required: ["target", "replacement"], additionalProperties: false } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["decision", "diagnosis", "causalHypothesis", "evidenceRefs", "uncertainties", "invariant",
    "failureInterpretation", "expectedResult", "counterexamples", "requestedEvidenceRefs", "assumptions", "changes", "confidence"],
  additionalProperties: false,
});

export const NYX_SEMANTIC_REPAIR_CONTRACT_VERSION = "nyx-causal-engineering-intent/2" as const;
export const NYX_SEMANTIC_ACTIONS = Object.freeze(["PROPOSE_EDIT", "REQUEST_EVIDENCE", "NO_ACTION"] as const);
export const NYX_FORBIDDEN_INFRASTRUCTURE_FIELDS = Object.freeze(["expectedBaseHash", "replacementContentHash",
  "verificationToolIds", "sandboxId", "candidateId", "transactionId", "authorization", "evidenceId",
  "kind", "relativePath", "replacementContent"] as const);
export const NYX_FORBIDDEN_SEMANTIC_REPLACEMENT_PATTERNS = Object.freeze([
  "shell_recursive_delete", "shell_command_interpreter", "node_child_process", "runtime_process_spawn",
] as const);
export const NYX_REPAIR_SYSTEM_INSTRUCTION = "You are Νύξ engineering cognition running on NVIDIA Nemotron 3 Ultra. Act like a disciplined software engineer: diagnose causally, cite admitted evidence, state the invariant, challenge the repair with bounded counterexamples, and revise falsified hypotheses instead of perturbing failed patches. Return only one strict JSON semantic engineering intent with no markdown or commentary. You propose; Omega authorizes.";
export const NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST = sha256(canonical({
  version: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  actions: NYX_SEMANTIC_ACTIONS,
  schema: NYX_REPAIR_INTENT_JSON_SCHEMA,
  systemInstruction: NYX_REPAIR_SYSTEM_INSTRUCTION,
  forbiddenReplacementPatterns: NYX_FORBIDDEN_SEMANTIC_REPLACEMENT_PATTERNS,
  authorityBoundary: "Omega derives trusted execution metadata and independently authorizes every action.",
}));

export interface NyxNemotronEngineeringCognitionConfig {
  readonly cognitionId: string;
  readonly provider: NvidiaNimProvider;
  readonly maxPromptBytes: number;
  readonly maxOutputTokens: number;
}

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function validRelativePath(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !value.includes("\0") && !isAbsolute(value)
    && value.replace(/\\/g, "/").split("/").every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}
function failureObservation(observation: EngineeringObservation): boolean {
  return observation.state.endsWith("_FAIL") || ["TIMEOUT", "BLOCKED", "INFRASTRUCTURE_ERROR"].includes(observation.state);
}
function observedType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function diagnostic(category: NyxSchemaDiagnosticCategory, path: string, expected: string, observed: string): NyxSchemaDiagnostic {
  return Object.freeze({ category, path, expected, observed });
}

export class NyxNemotronEngineeringCognition {
  readonly #config: NyxNemotronEngineeringCognitionConfig;
  readonly #model: string;

  private constructor(config: NyxNemotronEngineeringCognitionConfig, model: string) { this.#config = config; this.#model = model; }

  static create(config: NyxNemotronEngineeringCognitionConfig): NyxNemotronEngineeringCognition {
    const profile = config.provider.profile();
    if (!config.cognitionId.trim() || !Number.isInteger(config.maxPromptBytes) || config.maxPromptBytes < 1
      || !Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1) throw new Error("nyx_cognition_configuration_invalid");
    if (!/nemotron[-_/ ]?3[-_/ ]?ultra/i.test(profile.model)) throw new Error("nyx_primary_substrate_must_be_nemotron_3_ultra");
    return new NyxNemotronEngineeringCognition(config, profile.model);
  }

  profile(): typeof NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS & { readonly model: string } {
    return Object.freeze({ ...NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS, model: this.#model });
  }

  async proposeRepair(request: NyxRepairCognitionRequest): Promise<NyxRepairCognitionResult> {
    const inputIssues = this.#validateInput(request);
    if (inputIssues.length > 0) return this.#result("REJECTED", inputIssues.join(","), request, null, null, null,
      inputIssues.map((issue) => diagnostic(issue === "nyx_cognition_file_context_invalid"
        ? "STALE_TARGET_REFERENCE" : "OTHER_SCHEMA_MISMATCH", "$request", "valid admitted cognition request", issue)));
    const promptObject = { role: "NYX_ENGINEERING_COGNITION", objective: request.objective,
      assignment: "Determine the causal defect, required invariant, and smallest justified action. A failed prior candidate must change the hypothesis or strategy. Request available evidence before guessing when it can discriminate among plausible causes.",
      contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
      contractDigest: NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST,
      availableSemanticActions: NYX_SEMANTIC_ACTIONS,
      constraints: { output: "JSON_SCHEMA", maxChanges: request.maxChanges, maxPatchBytes: request.maxPatchBytes,
        maxCounterexamples: request.maxCounterexamples,
        omegaVerificationPlan: request.allowedVerificationToolIds,
        forbiddenModelFields: NYX_FORBIDDEN_INFRASTRUCTURE_FIELDS,
        evidenceBehavior: "Use REQUEST_EVIDENCE for listed available evidence that would discriminate among hypotheses. Use NO_ACTION only when required evidence is unavailable; both actions require no changes.",
        repairDiscipline: "For PROPOSE_EDIT, cite admitted evidence, state one causal hypothesis and invariant, predict the verifier-visible effect, and challenge the proposal with 1..maxCounterexamples structurally relevant cases. Do not target or mention hidden evaluators.",
        authorityStatement: "This is semantic intent only. Omega derives freshness hashes and execution metadata, then independently authorizes and executes." },
      observation: { observationId: request.observation.observationId, state: request.observation.state,
        baselineComparison: request.observation.baselineComparison, candidateAttribution: request.observation.candidateAttribution,
        attributionConfidence: request.observation.attributionConfidence, epistemicState: request.observation.epistemicState,
        diagnostics: request.observation.diagnostics, unknowns: request.observation.unknowns },
      admittedEvidence: [{ evidenceRef: "OBJECTIVE", kind: "REQUIREMENT", value: request.objective },
        { evidenceRef: `OBSERVATION:${request.observation.observationId}`, kind: "EXECUTION_OBSERVATION",
          value: { state: request.observation.state, diagnostics: request.observation.diagnostics, unknowns: request.observation.unknowns } },
        ...request.files.map((file) => ({ evidenceRef: `FILE:${file.relativePath}`, kind: "FILE", target: file.relativePath,
          mutationAllowed: request.allowedMutationPaths.includes(file.relativePath), content: file.content }))],
      availableEvidence: request.availableEvidence,
      hypothesisHistory: request.priorHypotheses,
      requiredSchema: NYX_REPAIR_INTENT_JSON_SCHEMA,
      minimalExample: { decision: "PROPOSE_EDIT", diagnosis: "bounded symptom and cause distinction",
        causalHypothesis: "specific mechanism explaining the observation", evidenceRefs: ["OBJECTIVE", `FILE:${request.files[0].relativePath}`],
        uncertainties: [], invariant: "behavior that must hold beyond the visible example",
        failureInterpretation: request.priorHypotheses.length === 0 ? "No prior candidate exists." : "The prior verification falsifies its predicted behavior.",
        expectedResult: "specific observable verification change", counterexamples: ["one boundary or regression case"],
        requestedEvidenceRefs: [], assumptions: [],
        changes: [{ target: request.files[0].relativePath, replacement: "complete replacement content" }], confidence: 0.8 } };
    const serializedPrompt = canonical(promptObject);
    if (Buffer.byteLength(serializedPrompt, "utf8") > this.#config.maxPromptBytes) {
      return this.#result("REJECTED", "nyx_cognition_prompt_bound_exceeded", request, null, null, null,
        [diagnostic("OTHER_SCHEMA_MISMATCH", "$prompt", "prompt within configured byte bound", "bound_exceeded")]);
    }
    const completion = await this.#config.provider.complete({ schemaVersion: 1, requestId: request.cognitionRequestId,
      messages: [{ role: "system", content: NYX_REPAIR_SYSTEM_INSTRUCTION },
        { role: "user", content: serializedPrompt }], maxTokens: this.#config.maxOutputTokens, temperature: 0,
      responseFormat: { type: "JSON_SCHEMA", name: "nyx_repair_intent", schema: NYX_REPAIR_INTENT_JSON_SCHEMA },
      observedAtEpochMs: request.observedAtEpochMs });
    if (completion.decision !== "COMPLETED" || completion.content === null) {
      const decision = completion.decision === "BLOCKED" ? "BLOCKED" : completion.decision === "REJECTED" ? "REJECTED" : "COGNITION_ERROR";
      return this.#result(decision, completion.reason, request, null, null, completion.evidence, []);
    }
    let parsed: RawRepairIntent;
    try { parsed = JSON.parse(completion.content) as RawRepairIntent; }
    catch { return this.#result("COGNITION_ERROR", "nyx_cognition_output_not_strict_json", request, null, null, completion.evidence,
      [diagnostic("UNEXPECTED_STRUCTURE", "$", "one JSON object", "non_json_content")]); }
    const validated = this.#validateIntent(parsed, request);
    if (validated.diagnostics.length > 0) return this.#result("COGNITION_ERROR", "nyx_cognition_output_schema_invalid",
      request, null, null, completion.evidence, validated.diagnostics);
    if (validated.evidenceRequest) {
      const requestBase = { requestedEvidenceRefs: Object.freeze(validated.requestedEvidenceRefs), diagnosis: validated.diagnosis!,
        causalHypothesis: validated.causalHypothesis!, uncertainties: Object.freeze(validated.uncertainties),
        evidenceRefs: Object.freeze(validated.evidenceRefs), authorityGranted: false as const };
      const evidenceRequest: NyxEvidenceRequest = Object.freeze({ ...requestBase, requestDigest: sha256(canonical(requestBase)) });
      return this.#result("REQUEST_EVIDENCE", "nyx_cognition_requests_admitted_evidence", request, null, evidenceRequest,
        completion.evidence, []);
    }
    if (validated.noAction) return this.#result("NO_ACTION", "nyx_cognition_no_action", request, null, null, completion.evidence, []);
    const strategyDigest = sha256(canonical({ causalHypothesis: validated.causalHypothesis,
      expectedResult: validated.expectedResult, changes: validated.changes.map((change) => ({ path: change.relativePath,
        replacementContentHash: change.replacementContentHash })) }));
    const proposalBase = { schemaVersion: 1 as const, hypothesisId: `NYX-REPAIR-${sha256(canonical({ request: request.cognitionRequestId,
      observation: request.observation.observationId, output: parsed })).slice(0, 32)}`, cognitionRequestId: request.cognitionRequestId,
      sourceObservationId: request.observation.observationId,
      parentHypothesisId: request.priorHypotheses.at(-1)?.hypothesisId ?? null, diagnosis: validated.diagnosis!,
      causalHypothesis: validated.causalHypothesis!, evidenceRefs: Object.freeze(validated.evidenceRefs),
      uncertainties: Object.freeze(validated.uncertainties), invariant: validated.invariant!,
      failureInterpretation: validated.failureInterpretation!, expectedResult: validated.expectedResult!,
      counterexamples: Object.freeze(validated.counterexamples),
      assumptions: Object.freeze(validated.assumptions), changes: Object.freeze(validated.changes),
      verificationToolIds: Object.freeze([...request.allowedVerificationToolIds]), confidence: validated.confidence!,
      strategyDigest, disposition: "PENDING_VERIFICATION" as const, applyAuthorized: false as const };
    const hypothesis: NyxRepairHypothesis = Object.freeze({ ...proposalBase, proposalDigest: sha256(canonical(proposalBase)) });
    return this.#result("PROPOSED", "nyx_repair_hypothesis_validated", request, hypothesis, null, completion.evidence, []);
  }

  #validateInput(request: NyxRepairCognitionRequest): readonly string[] {
    const issues: string[] = [];
    if (request.schemaVersion !== 1 || !request.cognitionRequestId?.trim() || typeof request.objective !== "string"
      || !request.objective.trim() || request.objective.length > 2_000 || !Number.isFinite(request.observedAtEpochMs)) issues.push("nyx_cognition_request_malformed");
    if (!request.observation || !request.observation.observationId?.trim() || request.observation.grantsAuthority
      || !failureObservation(request.observation)) issues.push("nyx_cognition_failure_observation_required");
    if (!Number.isInteger(request.maxChanges) || request.maxChanges < 1 || !Number.isInteger(request.maxPatchBytes)
      || request.maxPatchBytes < 1 || !Number.isInteger(request.maxDiagnosisCharacters) || request.maxDiagnosisCharacters < 1
      || !Number.isInteger(request.maxCounterexamples) || request.maxCounterexamples < 1 || request.maxCounterexamples > 5) issues.push("nyx_cognition_policy_invalid");
    if (!Array.isArray(request.files) || request.files.length < 1 || !Array.isArray(request.allowedVerificationToolIds)
      || request.allowedVerificationToolIds.length < 1 || !Array.isArray(request.availableEvidence)
      || !Array.isArray(request.priorHypotheses) || !Array.isArray(request.allowedMutationPaths)
      || request.allowedMutationPaths.length < 1) issues.push("nyx_cognition_context_missing");
    const paths = new Set<string>();
    for (const file of request.files ?? []) {
      if (!validRelativePath(file?.relativePath) || paths.has(file.relativePath) || typeof file.content !== "string"
        || file.contentSha256 !== sha256(file.content)) issues.push("nyx_cognition_file_context_invalid");
      else paths.add(file.relativePath);
    }
    const tools = request.allowedVerificationToolIds ?? [];
    if (new Set(tools).size !== tools.length || tools.some((tool) => typeof tool !== "string" || !tool.trim())) issues.push("nyx_cognition_verification_catalog_invalid");
    const mutationPaths = request.allowedMutationPaths ?? [];
    if (new Set(mutationPaths).size !== mutationPaths.length || mutationPaths.some((path) => !paths.has(path))) {
      issues.push("nyx_cognition_mutation_scope_invalid");
    }
    const availableRefs = new Set<string>();
    const availablePaths = new Set<string>();
    for (const item of request.availableEvidence ?? []) {
      if (!item || typeof item.evidenceRef !== "string" || !item.evidenceRef.trim() || item.evidenceRef.length > 200
        || item.kind !== "FILE" || !validRelativePath(item.relativePath) || paths.has(item.relativePath)
        || availableRefs.has(item.evidenceRef) || availablePaths.has(item.relativePath)
        || typeof item.description !== "string" || !item.description.trim() || item.description.length > 500) {
        issues.push("nyx_cognition_available_evidence_invalid");
      } else { availableRefs.add(item.evidenceRef); availablePaths.add(item.relativePath); }
    }
    const priorIds = new Set<string>();
    let expectedParent: string | null = null;
    for (const item of request.priorHypotheses ?? []) {
      if (!item || typeof item.hypothesisId !== "string" || !item.hypothesisId.trim() || priorIds.has(item.hypothesisId)
        || item.parentHypothesisId !== expectedParent || typeof item.causalHypothesis !== "string" || !item.causalHypothesis.trim()
        || typeof item.expectedResult !== "string" || !item.expectedResult.trim() || !/^[a-f0-9]{64}$/.test(item.strategyDigest)
        || !["SUPPORTED", "PARTIALLY_SUPPORTED", "FALSIFIED", "INSUFFICIENT_EVIDENCE", "SUPERSEDED"].includes(item.disposition)
        || !Array.isArray(item.verificationEvidenceRefs) || item.verificationEvidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim())) {
        issues.push("nyx_cognition_hypothesis_history_invalid");
      } else { priorIds.add(item.hypothesisId); expectedParent = item.hypothesisId; }
    }
    return Object.freeze([...new Set(issues)]);
  }

  #validateIntent(raw: RawRepairIntent, request: NyxRepairCognitionRequest): { diagnostics: NyxSchemaDiagnostic[];
    noAction: boolean; evidenceRequest: boolean; diagnosis: string | null; causalHypothesis: string | null;
    evidenceRefs: string[]; uncertainties: string[]; invariant: string | null; failureInterpretation: string | null;
    expectedResult: string | null; counterexamples: string[]; requestedEvidenceRefs: string[]; assumptions: string[];
    changes: NyxRepairChange[]; confidence: number | null } {
    const diagnostics: NyxSchemaDiagnostic[] = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { diagnostics: [diagnostic("UNEXPECTED_STRUCTURE", "$", "object", observedType(raw))], noAction: false,
        evidenceRequest: false, diagnosis: null, causalHypothesis: null, evidenceRefs: [], uncertainties: [], invariant: null,
        failureInterpretation: null, expectedResult: null, counterexamples: [], requestedEvidenceRefs: [], assumptions: [],
        changes: [], confidence: null };
    }
    const allowedTop = new Set(["decision", "diagnosis", "causalHypothesis", "evidenceRefs", "uncertainties", "invariant",
      "failureInterpretation", "expectedResult", "counterexamples", "requestedEvidenceRefs", "assumptions", "changes", "confidence"]);
    const infrastructureFields = new Set<string>(NYX_FORBIDDEN_INFRASTRUCTURE_FIELDS);
    for (const key of Object.keys(raw)) {
      if (!allowedTop.has(key)) diagnostics.push(diagnostic(infrastructureFields.has(key)
        ? "MODEL_GENERATED_INFRASTRUCTURE_METADATA" : "UNEXPECTED_STRUCTURE", `$.${key}`, "field omitted", "unexpected_field"));
    }
    for (const key of ["decision", "diagnosis", "causalHypothesis", "evidenceRefs", "uncertainties", "invariant",
      "failureInterpretation", "expectedResult", "counterexamples", "requestedEvidenceRefs", "assumptions", "changes", "confidence"] as const) {
      if (!(key in raw)) diagnostics.push(diagnostic("MISSING_REQUIRED_FIELD", `$.${key}`, "required field", "missing"));
    }
    const decision = raw.decision;
    if (decision !== undefined && typeof decision !== "string") diagnostics.push(diagnostic("INVALID_FIELD_TYPE", "$.decision", "string enum", observedType(decision)));
    else if (typeof decision === "string" && !["PROPOSE_EDIT", "REQUEST_EVIDENCE", "NO_ACTION"].includes(decision)) {
      diagnostics.push(diagnostic(decision === "RUN_SHELL" || decision === "NETWORK" || decision === "DEPLOY"
        ? "UNKNOWN_CAPABILITY" : "INVALID_ENUM_VALUE", "$.decision", "PROPOSE_EDIT|REQUEST_EVIDENCE|NO_ACTION", "unsupported_string"));
    }
    const boundedString = (key: "diagnosis" | "causalHypothesis" | "invariant" | "failureInterpretation" | "expectedResult",
      maximum = request.maxDiagnosisCharacters): string | null => {
      const value = raw[key];
      if (value !== undefined && typeof value !== "string") {
        diagnostics.push(diagnostic("INVALID_FIELD_TYPE", `$.${key}`, "string", observedType(value))); return null;
      }
      const text = typeof value === "string" ? value.trim() : null;
      if (text !== null && (!text || text.length > maximum)) {
        diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", `$.${key}`, `non-empty string <= ${maximum} chars`, "invalid_length"));
      }
      return text;
    };
    const boundedArray = (key: "evidenceRefs" | "uncertainties" | "counterexamples" | "requestedEvidenceRefs" | "assumptions",
      maximum: number): string[] => {
      const value = raw[key];
      if (value !== undefined && !Array.isArray(value)) {
        diagnostics.push(diagnostic("INVALID_FIELD_TYPE", `$.${key}`, "array<string>", observedType(value))); return [];
      }
      if (!Array.isArray(value)) return [];
      if (value.length > maximum || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 500)) {
        diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", `$.${key}`, `at most ${maximum} unique bounded strings`, "invalid_array"));
        return [];
      }
      const output = (value as string[]).map((item) => item.trim());
      if (new Set(output).size !== output.length) diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", `$.${key}`, "unique entries", "duplicates"));
      return output;
    };
    const diagnosis = boundedString("diagnosis");
    const causalHypothesis = boundedString("causalHypothesis");
    const invariant = boundedString("invariant");
    const failureInterpretation = boundedString("failureInterpretation");
    const expectedResult = boundedString("expectedResult");
    const evidenceRefs = boundedArray("evidenceRefs", 20);
    const uncertainties = boundedArray("uncertainties", 10);
    const counterexamples = boundedArray("counterexamples", request.maxCounterexamples);
    const requestedEvidenceRefs = boundedArray("requestedEvidenceRefs", 10);
    const assumptions = boundedArray("assumptions", 10);
    const admittedEvidenceRefs = new Set(["OBJECTIVE", `OBSERVATION:${request.observation.observationId}`,
      ...request.files.map((file) => `FILE:${file.relativePath}`)]);
    for (const [index, ref] of evidenceRefs.entries()) if (!admittedEvidenceRefs.has(ref)) {
      diagnostics.push(diagnostic("UNSUPPORTED_EVIDENCE_REFERENCE", `$.evidenceRefs[${index}]`, "admitted evidence reference", "unadmitted_reference"));
    }
    const availableEvidenceRefs = new Set(request.availableEvidence.map((item) => item.evidenceRef));
    for (const [index, ref] of requestedEvidenceRefs.entries()) if (!availableEvidenceRefs.has(ref)) {
      diagnostics.push(diagnostic("UNSUPPORTED_EVIDENCE_REFERENCE", `$.requestedEvidenceRefs[${index}]`, "listed available evidence reference", "unavailable_reference"));
    }
    const reasoningText = [diagnosis, causalHypothesis, invariant, failureInterpretation, expectedResult,
      ...uncertainties, ...counterexamples, ...assumptions].filter((item): item is string => item !== null).join("\n");
    if (/\b(?:hidden[-_ ]?(?:test|oracle|acceptance)|verify-hidden)\b/i.test(reasoningText)) {
      diagnostics.push(diagnostic("HIDDEN_EVALUATOR_TARGETING", "$", "general invariant and counterexample reasoning", "hidden_evaluator_targeting"));
    }
    if (decision === "PROPOSE_EDIT" && evidenceRefs.length < 1) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.evidenceRefs", "at least one admitted evidence reference", "empty_array"));
    }
    if (decision === "PROPOSE_EDIT" && (counterexamples.length < 1 || counterexamples.length > request.maxCounterexamples)) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.counterexamples", `1..${request.maxCounterexamples} bounded challenges`, `array_length_${counterexamples.length}`));
    }
    if (decision === "REQUEST_EVIDENCE" && (requestedEvidenceRefs.length < 1 || uncertainties.length < 1)) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.requestedEvidenceRefs", "available evidence request with stated uncertainty", "missing_request_or_uncertainty"));
    }
    if (decision !== "REQUEST_EVIDENCE" && requestedEvidenceRefs.length > 0) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.requestedEvidenceRefs", "empty unless REQUEST_EVIDENCE", "unexpected_request"));
    }
    if (decision === "NO_ACTION" && uncertainties.length < 1) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.uncertainties", "at least one unresolved uncertainty", "empty_array"));
    }
    if (decision === "NO_ACTION" && request.availableEvidence.length > 0) {
      diagnostics.push(diagnostic("UNJUSTIFIED_EPISTEMIC_EXIT", "$.decision", "REQUEST_EVIDENCE while relevant admitted evidence remains available", "premature_no_action"));
    }
    const confidence = typeof raw.confidence === "number" ? raw.confidence : null;
    if (raw.confidence !== undefined && typeof raw.confidence !== "number") diagnostics.push(diagnostic("INVALID_FIELD_TYPE", "$.confidence", "number", observedType(raw.confidence)));
    else if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.confidence", "number from 0 to 1", "out_of_range"));
    }
    if (raw.changes !== undefined && !Array.isArray(raw.changes)) diagnostics.push(diagnostic("INVALID_FIELD_TYPE", "$.changes", "array", observedType(raw.changes)));
    const rawChanges = Array.isArray(raw.changes) ? raw.changes : [];
    if ((decision === "NO_ACTION" || decision === "REQUEST_EVIDENCE") && rawChanges.length > 0) diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", "$.changes", "empty for non-mutation action", "nonempty_array"));
    if (decision === "PROPOSE_EDIT" && (rawChanges.length < 1 || rawChanges.length > request.maxChanges)) {
      diagnostics.push(diagnostic(rawChanges.length < 1 ? "SEMANTIC_REPAIR_ABSENT" : "SEMANTIC_REPAIR_INVALID", "$.changes",
        `1..${request.maxChanges} changes`, `array_length_${rawChanges.length}`));
    }
    const contexts = new Map(request.files.map((file) => [file.relativePath, file]));
    const changes: NyxRepairChange[] = [];
    const paths = new Set<string>();
    let bytes = 0;
    for (const [index, unknownChange] of rawChanges.entries()) {
      const base = `$.changes[${index}]`;
      if (!unknownChange || typeof unknownChange !== "object" || Array.isArray(unknownChange)) {
        diagnostics.push(diagnostic("UNEXPECTED_STRUCTURE", base, "object", observedType(unknownChange))); continue;
      }
      const change = unknownChange as Record<string, unknown>;
      const allowedChange = new Set(["target", "replacement"]);
      for (const key of Object.keys(change)) {
        if (!allowedChange.has(key)) diagnostics.push(diagnostic(infrastructureFields.has(key)
          ? "MODEL_GENERATED_INFRASTRUCTURE_METADATA" : "UNEXPECTED_STRUCTURE", `${base}.${key}`, "field omitted", "unexpected_field"));
      }
      for (const key of ["target", "replacement"] as const) {
        if (!(key in change)) diagnostics.push(diagnostic("MISSING_REQUIRED_FIELD", `${base}.${key}`, "required field", "missing"));
        else if (typeof change[key] !== "string") diagnostics.push(diagnostic("INVALID_FIELD_TYPE", `${base}.${key}`, "string", observedType(change[key])));
      }
      if (typeof change.target !== "string" || typeof change.replacement !== "string") continue;
      if (!validRelativePath(change.target)) { diagnostics.push(diagnostic("INVALID_TARGET_REFERENCE", `${base}.target`, "admitted relative target", "malformed_reference")); continue; }
      const context = contexts.get(change.target);
      if (!context) { diagnostics.push(diagnostic("UNSUPPORTED_FILE_TARGET", `${base}.target`, "currently admitted target", "unadmitted_reference")); continue; }
      if (!request.allowedMutationPaths.includes(change.target)) {
        diagnostics.push(diagnostic("UNSUPPORTED_FILE_TARGET", `${base}.target`, "explicitly authorized mutation target", "read_only_evidence_target")); continue;
      }
      if (paths.has(change.target)) { diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", `${base}.target`, "unique target", "duplicate_reference")); continue; }
      if (sha256(change.replacement) === context.contentSha256) {
        diagnostics.push(diagnostic("REPEATED_FALSIFIED_STRATEGY", `${base}.replacement`, "a semantic change from the currently failed candidate", "no_op_repair")); continue;
      }
      if (/\brm\s+-rf\b/i.test(change.replacement) || /\b(?:bash|sh|cmd|powershell)(?:\.exe)?\s+(?:-c|\/c)\b/i.test(change.replacement)
        || /(?:node:)?child_process/.test(change.replacement) || /\b(?:spawn|spawnSync|execFile|execSync)\s*\(/.test(change.replacement)) {
        diagnostics.push(diagnostic("UNKNOWN_CAPABILITY", `${base}.replacement`,
          "source content without ungranted shell or child-process execution", "forbidden_execution_primitive")); continue;
      }
      bytes += Buffer.byteLength(change.replacement, "utf8");
      if (bytes > request.maxPatchBytes) { diagnostics.push(diagnostic("SEMANTIC_REPAIR_INVALID", `${base}.replacement`, `total <= ${request.maxPatchBytes} bytes`, "patch_bound_exceeded")); continue; }
      paths.add(change.target);
      changes.push(Object.freeze({ kind: "MODIFY", relativePath: change.target, expectedBaseHash: context.contentSha256,
        replacementContent: change.replacement, replacementContentHash: sha256(change.replacement) }));
    }
    if (decision === "PROPOSE_EDIT" && changes.length > 0) {
      const strategyDigest = sha256(canonical({ causalHypothesis, expectedResult,
        changes: changes.map((change) => ({ path: change.relativePath, replacementContentHash: change.replacementContentHash })) }));
      if (request.priorHypotheses.some((item) => item.disposition === "FALSIFIED" && item.strategyDigest === strategyDigest)) {
        diagnostics.push(diagnostic("REPEATED_FALSIFIED_STRATEGY", "$", "a revised strategy after falsification", "repeated_strategy_digest"));
      }
    }
    return { diagnostics, noAction: decision === "NO_ACTION" && diagnostics.length === 0,
      evidenceRequest: decision === "REQUEST_EVIDENCE" && diagnostics.length === 0, diagnosis, causalHypothesis,
      evidenceRefs, uncertainties, invariant, failureInterpretation, expectedResult, counterexamples,
      requestedEvidenceRefs, assumptions, changes, confidence };
  }

  #result(decision: NyxRepairCognitionResult["decision"], reason: string, request: NyxRepairCognitionRequest,
    hypothesis: NyxRepairHypothesis | null, evidenceRequest: NyxEvidenceRequest | null, modelEvidence: NvidiaNimEvidence | null,
    schemaDiagnostics: readonly NyxSchemaDiagnostic[]): NyxRepairCognitionResult {
    const sourceObservationId = request.observation?.observationId ?? "UNKNOWN";
    const sourceEvidenceId = request.observation?.candidateEvidenceId ?? "UNKNOWN";
    const evidence: NyxRepairCognitionEvidence = Object.freeze({ evidenceId: `NYX-COGNITION-${sha256(canonical({
      requestId: request.cognitionRequestId ?? "MALFORMED", sourceObservationId, modelEvidenceId: modelEvidence?.evidenceId ?? null,
      proposalDigest: hypothesis?.proposalDigest ?? null, evidenceRequestDigest: evidenceRequest?.requestDigest ?? null,
      decision, reason })).slice(0, 32)}`,
      evidenceClass: modelEvidence?.evidenceClass ?? "E3", sourceObservationId, sourceExecutionEvidenceId: sourceEvidenceId,
      modelEvidenceId: modelEvidence?.evidenceId ?? "NOT_INVOKED", model: this.#model,
      cognitiveSubstrate: "NVIDIA_NEMOTRON_3_ULTRA", modelRequestDigest: modelEvidence?.requestDigest ?? null,
      modelResponseDigest: modelEvidence?.responseDigest ?? null,
      modelStatusCode: modelEvidence?.statusCode ?? null,
      contractVersion: NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
      contractDigest: NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST,
      modelUsage: modelEvidence?.usage ?? Object.freeze({ promptTokens: null, completionTokens: null, totalTokens: null }),
      proposalDigest: hypothesis?.proposalDigest ?? null, authorityGranted: false });
    return Object.freeze({ decision, reason, hypothesis, evidenceRequest, evidence,
      schemaDiagnostics: Object.freeze([...schemaDiagnostics]), omegaAuthorityGranted: false });
  }
}
