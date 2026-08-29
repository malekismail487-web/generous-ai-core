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

export interface NyxRepairCognitionRequest {
  readonly schemaVersion: 1;
  readonly cognitionRequestId: string;
  readonly observation: EngineeringObservation;
  readonly files: readonly NyxEngineeringFileContext[];
  readonly allowedVerificationToolIds: readonly string[];
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
  readonly maxDiagnosisCharacters: number;
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
  readonly diagnosis: string;
  readonly assumptions: readonly string[];
  readonly changes: readonly NyxRepairChange[];
  readonly verificationToolIds: readonly string[];
  readonly confidence: number;
  readonly proposalDigest: string;
  readonly applyAuthorized: false;
}

export interface NyxRepairCognitionEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: NvidiaNimEvidence["evidenceClass"];
  readonly sourceObservationId: string;
  readonly sourceExecutionEvidenceId: string;
  readonly modelEvidenceId: string;
  readonly model: string;
  readonly cognitiveSubstrate: "NVIDIA_NEMOTRON_3_ULTRA";
  readonly proposalDigest: string | null;
  readonly authorityGranted: false;
}

export interface NyxRepairCognitionResult {
  readonly decision: "PROPOSED" | "REJECTED" | "BLOCKED" | "COGNITION_ERROR";
  readonly reason: string;
  readonly hypothesis: NyxRepairHypothesis | null;
  readonly evidence: NyxRepairCognitionEvidence;
  readonly omegaAuthorityGranted: false;
}

interface RawRepairHypothesis {
  readonly diagnosis?: unknown;
  readonly assumptions?: unknown;
  readonly changes?: unknown;
  readonly verificationToolIds?: unknown;
  readonly confidence?: unknown;
}

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
    if (inputIssues.length > 0) return this.#result("REJECTED", inputIssues.join(","), request, null, null);
    const promptObject = { role: "NYX_ENGINEERING_COGNITION", objective: "Diagnose the observed engineering failure and propose the smallest bounded repair.",
      constraints: { output: "JSON_ONLY", allowedChangeKind: "MODIFY", maxChanges: request.maxChanges,
        maxPatchBytes: request.maxPatchBytes, allowedVerificationToolIds: request.allowedVerificationToolIds,
        authorityStatement: "This is a proposal. Omega alone authorizes and executes actions." },
      observation: { observationId: request.observation.observationId, state: request.observation.state,
        baselineComparison: request.observation.baselineComparison, candidateAttribution: request.observation.candidateAttribution,
        attributionConfidence: request.observation.attributionConfidence, epistemicState: request.observation.epistemicState,
        diagnostics: request.observation.diagnostics, unknowns: request.observation.unknowns },
      files: request.files, requiredSchema: { diagnosis: "string", assumptions: ["string"],
        changes: [{ kind: "MODIFY", relativePath: "authorized path", expectedBaseHash: "supplied SHA-256", replacementContent: "string" }],
        verificationToolIds: ["authorized tool id"], confidence: "number from 0 to 1" } };
    const serializedPrompt = canonical(promptObject);
    if (Buffer.byteLength(serializedPrompt, "utf8") > this.#config.maxPromptBytes) {
      return this.#result("REJECTED", "nyx_cognition_prompt_bound_exceeded", request, null, null);
    }
    const completion = await this.#config.provider.complete({ schemaVersion: 1, requestId: request.cognitionRequestId,
      messages: [{ role: "system", content: "You are Νύξ engineering cognition running on NVIDIA Nemotron 3 Ultra. Return one strict JSON repair hypothesis. You propose; Omega authorizes." },
        { role: "user", content: serializedPrompt }], maxTokens: this.#config.maxOutputTokens, temperature: 0,
      observedAtEpochMs: request.observedAtEpochMs });
    if (completion.decision !== "COMPLETED" || completion.content === null) {
      const decision = completion.decision === "BLOCKED" ? "BLOCKED" : completion.decision === "REJECTED" ? "REJECTED" : "COGNITION_ERROR";
      return this.#result(decision, completion.reason, request, null, completion.evidence);
    }
    let parsed: RawRepairHypothesis;
    try { parsed = JSON.parse(completion.content) as RawRepairHypothesis; }
    catch { return this.#result("COGNITION_ERROR", "nyx_cognition_output_not_strict_json", request, null, completion.evidence); }
    const validated = this.#validateHypothesis(parsed, request);
    if (typeof validated === "string") return this.#result("COGNITION_ERROR", validated, request, null, completion.evidence);
    const proposalBase = { schemaVersion: 1 as const, hypothesisId: `NYX-REPAIR-${sha256(canonical({ request: request.cognitionRequestId,
      observation: request.observation.observationId, output: parsed })).slice(0, 32)}`, cognitionRequestId: request.cognitionRequestId,
      sourceObservationId: request.observation.observationId, diagnosis: validated.diagnosis,
      assumptions: Object.freeze(validated.assumptions), changes: Object.freeze(validated.changes),
      verificationToolIds: Object.freeze(validated.verificationToolIds), confidence: validated.confidence, applyAuthorized: false as const };
    const hypothesis: NyxRepairHypothesis = Object.freeze({ ...proposalBase, proposalDigest: sha256(canonical(proposalBase)) });
    return this.#result("PROPOSED", "nyx_repair_hypothesis_validated", request, hypothesis, completion.evidence);
  }

  #validateInput(request: NyxRepairCognitionRequest): readonly string[] {
    const issues: string[] = [];
    if (request.schemaVersion !== 1 || !request.cognitionRequestId?.trim() || !Number.isFinite(request.observedAtEpochMs)) issues.push("nyx_cognition_request_malformed");
    if (!request.observation || !request.observation.observationId?.trim() || request.observation.grantsAuthority
      || !failureObservation(request.observation)) issues.push("nyx_cognition_failure_observation_required");
    if (!Number.isInteger(request.maxChanges) || request.maxChanges < 1 || !Number.isInteger(request.maxPatchBytes)
      || request.maxPatchBytes < 1 || !Number.isInteger(request.maxDiagnosisCharacters) || request.maxDiagnosisCharacters < 1) issues.push("nyx_cognition_policy_invalid");
    if (!Array.isArray(request.files) || request.files.length < 1 || !Array.isArray(request.allowedVerificationToolIds)
      || request.allowedVerificationToolIds.length < 1) issues.push("nyx_cognition_context_missing");
    const paths = new Set<string>();
    for (const file of request.files ?? []) {
      if (!validRelativePath(file?.relativePath) || paths.has(file.relativePath) || typeof file.content !== "string"
        || file.contentSha256 !== sha256(file.content)) issues.push("nyx_cognition_file_context_invalid");
      else paths.add(file.relativePath);
    }
    const tools = request.allowedVerificationToolIds ?? [];
    if (new Set(tools).size !== tools.length || tools.some((tool) => typeof tool !== "string" || !tool.trim())) issues.push("nyx_cognition_verification_catalog_invalid");
    return Object.freeze([...new Set(issues)]);
  }

  #validateHypothesis(raw: RawRepairHypothesis, request: NyxRepairCognitionRequest): string | {
    diagnosis: string; assumptions: string[]; changes: NyxRepairChange[]; verificationToolIds: string[]; confidence: number;
  } {
    if (!raw || typeof raw !== "object" || typeof raw.diagnosis !== "string" || !raw.diagnosis.trim()
      || raw.diagnosis.length > request.maxDiagnosisCharacters || !Array.isArray(raw.assumptions)
      || raw.assumptions.some((item) => typeof item !== "string" || !item.trim() || item.length > 500)
      || !Array.isArray(raw.changes) || raw.changes.length < 1 || raw.changes.length > request.maxChanges
      || !Array.isArray(raw.verificationToolIds) || raw.verificationToolIds.length < 1
      || typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
      return "nyx_cognition_output_schema_invalid";
    }
    const contexts = new Map(request.files.map((file) => [file.relativePath, file]));
    const changes: NyxRepairChange[] = [];
    const paths = new Set<string>();
    let bytes = 0;
    for (const unknownChange of raw.changes) {
      if (!unknownChange || typeof unknownChange !== "object") return "nyx_cognition_change_invalid";
      const change = unknownChange as Record<string, unknown>;
      if (change.kind !== "MODIFY" || !validRelativePath(change.relativePath) || paths.has(change.relativePath)
        || typeof change.expectedBaseHash !== "string" || typeof change.replacementContent !== "string") return "nyx_cognition_change_invalid";
      const context = contexts.get(change.relativePath);
      if (!context) return "nyx_cognition_change_outside_authorized_context";
      if (change.expectedBaseHash !== context.contentSha256) return "nyx_cognition_change_base_hash_mismatch";
      bytes += Buffer.byteLength(change.replacementContent, "utf8");
      if (bytes > request.maxPatchBytes) return "nyx_cognition_patch_byte_limit_exceeded";
      paths.add(change.relativePath);
      changes.push(Object.freeze({ kind: "MODIFY", relativePath: change.relativePath, expectedBaseHash: change.expectedBaseHash,
        replacementContent: change.replacementContent, replacementContentHash: sha256(change.replacementContent) }));
    }
    const allowedTools = new Set(request.allowedVerificationToolIds);
    const verificationToolIds = raw.verificationToolIds as unknown[];
    if (new Set(verificationToolIds).size !== verificationToolIds.length
      || verificationToolIds.some((tool) => typeof tool !== "string" || !allowedTools.has(tool))) return "nyx_cognition_verification_tool_not_authorized";
    return { diagnosis: raw.diagnosis.trim(), assumptions: (raw.assumptions as string[]).map((item) => item.trim()), changes,
      verificationToolIds: verificationToolIds as string[], confidence: raw.confidence };
  }

  #result(decision: NyxRepairCognitionResult["decision"], reason: string, request: NyxRepairCognitionRequest,
    hypothesis: NyxRepairHypothesis | null, modelEvidence: NvidiaNimEvidence | null): NyxRepairCognitionResult {
    const sourceObservationId = request.observation?.observationId ?? "UNKNOWN";
    const sourceEvidenceId = request.observation?.candidateEvidenceId ?? "UNKNOWN";
    const evidence: NyxRepairCognitionEvidence = Object.freeze({ evidenceId: `NYX-COGNITION-${sha256(canonical({
      requestId: request.cognitionRequestId ?? "MALFORMED", sourceObservationId, modelEvidenceId: modelEvidence?.evidenceId ?? null,
      proposalDigest: hypothesis?.proposalDigest ?? null, decision, reason })).slice(0, 32)}`,
      evidenceClass: modelEvidence?.evidenceClass ?? "E3", sourceObservationId, sourceExecutionEvidenceId: sourceEvidenceId,
      modelEvidenceId: modelEvidence?.evidenceId ?? "NOT_INVOKED", model: this.#model,
      cognitiveSubstrate: "NVIDIA_NEMOTRON_3_ULTRA", proposalDigest: hypothesis?.proposalDigest ?? null, authorityGranted: false });
    return Object.freeze({ decision, reason, hypothesis, evidence, omegaAuthorityGranted: false });
  }
}
