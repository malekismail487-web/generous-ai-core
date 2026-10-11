import { createHash } from "node:crypto";
import { nyxLocalRefactorGuidance } from "./nyxLocalRefactorProposals";
import { immutableTheoryValue } from "../research/theoryContracts";
import type { NyxRepairCognitionRequest, NyxSourceRepresentation } from "./nyxNemotronEngineeringCognition";

export const NYX_SOURCE_BOUND_SELECTION_POLICY = "nyx-source-bound-refactor-selection/1" as const;
export const NYX_SOURCE_BOUND_SELECTION_POLICY_V2 = "nyx-source-bound-refactor-selection/2" as const;
const SELECT = "SELECT_LOCAL_REFACTOR";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** Request-local proposal identities are descriptions, never capabilities or approvals.
 * Source remains visible for review; only its emission is avoided. No hidden oracle is used.
 */
export function buildNyxRefactorSelection(request: NyxRepairCognitionRequest, evaluationOrder: boolean,
  extendedEvaluationOrder = false) {
  const guidance = nyxLocalRefactorGuidance(request, evaluationOrder, extendedEvaluationOrder);
  if (!guidance) return null;
  const policy = extendedEvaluationOrder ? NYX_SOURCE_BOUND_SELECTION_POLICY_V2 : NYX_SOURCE_BOUND_SELECTION_POLICY;
  const { signal: _signal, ...boundRequest } = request;
  const bindingDigest = digest({ policy, evaluationOrder, request: boundRequest,
    ...(extendedEvaluationOrder ? { extendedEvaluationOrder: true, proposerVersion: guidance.version } : {}) });
  const proposals = guidance.proposals.map(proposal => ({ ...proposal,
    proposalRef: `LOCAL-REFACTOR-${digest({ bindingDigest, proposal })}` }));
  return immutableTheoryValue({ ...guidance, version: policy, bindingDigest, proposals,
    ...(extendedEvaluationOrder ? { proposerVersion: guidance.version } : {}),
    instruction: "Review the objective, exact proposedSource, and guards. To propose one unchanged listed source, use SELECT_LOCAL_REFACTOR with selectedProposalRef and all ordinary repair reasoning fields; cite its FILE, passing observation, and quality evidence. Omit changes entirely. Alternatively use ordinary PROPOSE_EDIT for a different repair. A selection only expands to an ordinary edit proposal: syntax, scope, freshness, execution and unchanged cumulative quality admission remain mandatory. Nothing is applied or certified automatically.",
    semanticEquivalenceCertified: false, authorityGranted: false });
}
export type NyxRefactorSelectionCatalog = NonNullable<ReturnType<typeof buildNyxRefactorSelection>>;
export interface NyxRefactorSelectionEvidence {
  readonly policy: typeof NYX_SOURCE_BOUND_SELECTION_POLICY | typeof NYX_SOURCE_BOUND_SELECTION_POLICY_V2;
  readonly outcome: "RESOLVED" | "REFUSED";
  readonly reason: string;
  readonly bindingDigest: string | null;
  readonly selectedProposalRef: string | null;
  readonly path: string | null;
  readonly baseSourceDigest: string | null;
  readonly proposedSourceDigest: string | null;
  readonly inputDigest: string;
  readonly outputDigest: string | null;
  readonly sourceOrigin: "HOST_PROPOSAL_MODEL_SELECTED";
  readonly authorityGranted: false;
  readonly acceptanceGranted: false;
}

/** Add a separate, strict wire branch. Do not relax the existing action schemas. */
export function withNyxRefactorSelectionSchema(schema: Readonly<Record<string, unknown>>,
  catalog: NyxRefactorSelectionCatalog | null) {
  if (!catalog) return schema;
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf as Record<string, unknown>[] : [schema];
  const ordinary = variants.find(branch => ((branch.properties as Record<string, { enum?: string[] }> | undefined)
    ?.decision?.enum ?? []).includes("PROPOSE_EDIT"));
  if (!ordinary || ordinary.additionalProperties !== false) throw Error("nyx_selection_schema_invalid");
  const { changes: _changes, ...properties } = ordinary.properties as Record<string, unknown>;
  const required = ["decision", "diagnosis", "causalHypothesis", "evidenceRefs", "invariant", "expectedResult", "counterexamples", "selectedProposalRef"];
  return immutableTheoryValue({ type: "object", anyOf: [...variants, { ...ordinary,
    properties: { ...properties, decision: { type: "string", enum: [SELECT] },
      selectedProposalRef: { type: "string", enum: catalog.proposals.map(proposal => proposal.proposalRef) } }, required }] });
}

/** Resolve only the current host-owned proposal; never infer selection from free-form text.
 * Recompute the catalog after the await to detect request/source/evidence changes. The
 * returned intent still goes through the existing compiler, parser and Omega gates.
 */
export function resolveNyxRefactorSelection(input: unknown, catalog: NyxRefactorSelectionCatalog | null,
  request: NyxRepairCognitionRequest, representation: NyxSourceRepresentation, evaluationOrder: boolean,
  extendedEvaluationOrder = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as Record<string, unknown>).decision !== SELECT) return null;
  const raw = input as Record<string, unknown>;
  let current: NyxRefactorSelectionCatalog | null = null;
  try { current = buildNyxRefactorSelection(request, evaluationOrder, extendedEvaluationOrder); } catch { /* changed host input fails closed */ }
  const proposal = typeof raw.selectedProposalRef === "string"
    ? current?.proposals.find(item => item.proposalRef === raw.selectedProposalRef) : undefined;
  const cited = Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : [];
  const refusal = !catalog ? "selection_not_offered"
    : !current || digest(catalog) !== digest(current) ? "selection_request_changed"
    : Object.prototype.hasOwnProperty.call(raw, "changes") ? "selection_mixed_with_source"
    : !proposal ? "selection_reference_not_current"
    : ![current.evidenceRef, current.passingObservationRef, `FILE:${proposal.path}`]
      .every(ref => cited.includes(ref)) ? "selection_evidence_not_cited" : null;
  const { selectedProposalRef: _selected, ...intent } = raw;
  const value = refusal ? null : { ...intent, decision: "PROPOSE_EDIT", changes: [{ target: proposal!.path,
    replacement: representation === "TEXT" ? proposal!.proposedSource
      : { lines: proposal!.proposedSource.split(proposal!.proposedSource.includes("\r\n") ? "\r\n" : "\n"),
        lineEnding: proposal!.proposedSource.includes("\r\n") ? "CRLF" : "LF" } }] };
  const evidence: NyxRefactorSelectionEvidence = immutableTheoryValue({
    policy: extendedEvaluationOrder ? NYX_SOURCE_BOUND_SELECTION_POLICY_V2 : NYX_SOURCE_BOUND_SELECTION_POLICY,
    outcome: refusal ? "REFUSED" : "RESOLVED", reason: refusal ?? "current_proposal_expanded_not_authorized",
    bindingDigest: catalog?.bindingDigest ?? null,
    selectedProposalRef: proposal?.proposalRef ?? null, path: proposal?.path ?? null,
    baseSourceDigest: proposal?.baseSourceDigest ?? null, proposedSourceDigest: proposal?.proposedSourceDigest ?? null,
    inputDigest: digest(input), outputDigest: value ? digest(value) : null,
    sourceOrigin: "HOST_PROPOSAL_MODEL_SELECTED", authorityGranted: false, acceptanceGranted: false });
  return { value: value ? immutableTheoryValue(value) : null, evidence };
}
