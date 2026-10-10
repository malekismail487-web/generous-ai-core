import { createHash } from "node:crypto";
import ts from "typescript";
import { admitStaticEngineeringCandidate, OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1,
  OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT,
  validPublicQualityObligations, type CandidateEngineeringAdmissionRequest } from "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import { NYX_ENGINEERING_QUALITY_V5 } from "./omega/nyx-quality-v5-fixtures";
import type { NyxRepairHypothesis } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import type { R2GPatchProposal } from "../src/lib/codelab/executor/r2PatchProposal";
import type { R3AApplyResult, R3AEvent } from "../src/lib/codelab/executor/r3DisposablePatchApplication";
import { measureEngineeringStructure } from "../src/lib/codelab/assurance/engineeringQualityOracle";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
const CANDIDATE = "a".repeat(40);
const PATH = "src/math.mjs";
const FILE_MODE = 0o100644;

interface FileTransition {
  readonly relativePath: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly existedBefore: boolean;
  readonly existsAfter: boolean;
  readonly mode: number | null;
}

function event(input: Omit<R3AEvent, "schemaVersion" | "eventId" | "evidenceRef" | "previousHash" | "eventHash">,
  sequence: number, previousHash: string): R3AEvent {
  const base = { schemaVersion: 1 as const,
    eventId: `R3A-${input.applicationId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input, evidenceRef: `r3a-local://${input.applicationId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash };
  return Object.freeze({ ...base, eventHash: hash(canonical(base)) });
}

function repositoryStateDigest(transitions: readonly FileTransition[], poststate: boolean): string {
  return hash(canonical(transitions.map((item) => ({
    relativePath: item.relativePath,
    exists: poststate ? item.existsAfter : item.existedBefore,
    hash: poststate ? item.afterHash : item.beforeHash,
    mode: item.mode,
  }))));
}

function fullAppliedEventChain(applicationId: string, proposalDigest: string,
  transitions: readonly FileTransition[]): readonly R3AEvent[] {
  const requestId = "APPLY-1";
  const prestateDigest = repositoryStateDigest(transitions, false);
  const poststateDigest = repositoryStateDigest(transitions, true);
  const eventInputs: Array<Omit<R3AEvent,
    "schemaVersion" | "eventId" | "evidenceRef" | "previousHash" | "eventHash">> = [
    { eventType: "APPLICATION_REQUESTED", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "REQUESTED", proposalDigest, stateDigest: null },
    { eventType: "APPLICATION_AUTHORIZED", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "AUTHORIZED", proposalDigest, stateDigest: null },
    { eventType: "SOURCE_BASE_REVALIDATED", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "VERIFIED", proposalDigest, stateDigest: prestateDigest },
    { eventType: "CLONE_PRESTATE_VERIFIED", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "VERIFIED", proposalDigest, stateDigest: prestateDigest },
    ...transitions.map((item) => ({ eventType: "CHANGE_APPLIED" as const, requestId, applicationId,
      actorIdentity: "OMEGA-R3A", result: "SUCCEEDED" as const, proposalDigest,
      stateDigest: hash(canonical({ relativePath: item.relativePath, hash: item.afterHash,
        exists: item.existsAfter })) })),
    { eventType: "CLONE_POSTSTATE_VERIFIED", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "VERIFIED", proposalDigest, stateDigest: poststateDigest },
    { eventType: "APPLICATION_PROVEN", requestId, applicationId, actorIdentity: "OMEGA-R3A",
      result: "VERIFIED", proposalDigest, stateDigest: poststateDigest },
  ];
  const events: R3AEvent[] = [];
  for (const input of eventInputs) events.push(event(input, events.length + 1, events.at(-1)?.eventHash ?? "GENESIS"));
  return Object.freeze(events);
}

function fixture(before = "export function add(a, b) { return a - b; }\n",
  after = "export function add(a, b) { return a + b; }\n", path = PATH,
  allowedMutationPaths: readonly string[] = [path]): CandidateEngineeringAdmissionRequest {
  const hypothesisBase = { schemaVersion: 1 as const, hypothesisId: "NYX-HYPOTHESIS-1", cognitionRequestId: "COGNITION-1",
    sourceObservationId: "OBSERVATION-1", parentHypothesisId: null, diagnosis: "The arithmetic operator is incorrect.",
    causalHypothesis: "Subtraction causes the observed addition failure.", evidenceRefs: Object.freeze(["OBSERVATION-1"]),
    uncertainties: Object.freeze([]), invariant: "Addition returns the sum of both operands.",
    failureInterpretation: "The candidate has not yet been verified.", expectedResult: "The addition verification passes.",
    counterexamples: Object.freeze(["negative operands remain supported"]), assumptions: Object.freeze([]),
    changes: Object.freeze([{ kind: "MODIFY" as const, relativePath: path, expectedBaseHash: hash(before),
      replacementContent: after, replacementContentHash: hash(after) }]), verificationToolIds: Object.freeze(["TEST"]),
    confidence: 0.9, strategyDigest: hash("replace-wrong-operator"), disposition: "PENDING_VERIFICATION" as const,
    applyAuthorized: false as const };
  const hypothesis: NyxRepairHypothesis = Object.freeze({ ...hypothesisBase, proposalDigest: hash(canonical(hypothesisBase)) });
  const change = Object.freeze({ kind: "MODIFY" as const, relativePath: path, expectedBaseHash: hash(before),
    proposedContentHash: hash(after), proposedContent: after, baselineEvidenceId: "BASELINE-EVIDENCE-1",
    baselineObservationId: "BASELINE-OBSERVATION-1", sandboxArtifactId: "SANDBOX-ARTIFACT-1" });
  const proposalBase = { schemaVersion: 1 as const, proposalId: "OMEGA-PROPOSAL-1", requestId: "PROPOSAL-REQUEST-1",
    repositoryRoot: "C:/disposable/source", baseCandidateCommit: CANDIDATE, changes: Object.freeze([change]),
    applyAuthorized: false as const, rollbackRequiredBeforeApply: true as const };
  const proposal: R2GPatchProposal = Object.freeze({ ...proposalBase, proposalDigest: hash(canonical(proposalBase)) });
  const applicationId = "OMEGA-APPLICATION-1";
  const transitions = Object.freeze([{ relativePath: path, beforeHash: hash(before), afterHash: hash(after),
    existedBefore: true, existsAfter: true, mode: FILE_MODE }]);
  const events = fullAppliedEventChain(applicationId, proposal.proposalDigest, transitions);
  const application: R3AApplyResult = Object.freeze({ decision: "APPLIED", reason: "reviewed_patch_applied_to_disposable_repository",
    applicationId, proposalDigest: proposal.proposalDigest, disposableRepositoryId: "DISPOSABLE-REPOSITORY-1",
    prestateDigest: repositoryStateDigest(transitions, false), poststateDigest: repositoryStateDigest(transitions, true),
    changedPaths: Object.freeze([path]), events, evidenceClass: "E3", sourceRepositoryMutated: false, authorityGranted: false });
  return Object.freeze({ schemaVersion: 1, reviewId: "OMEGA-CANDIDATE-REVIEW-1", evaluatorVersion: "candidate-admission/1",
    candidateCommit: CANDIDATE, lineage: Object.freeze({ hypothesisId: hypothesis.hypothesisId,
      hypothesisDigest: hypothesis.proposalDigest, proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
      applicationId }), hypothesis, proposal, application,
    baselineFiles: Object.freeze({ [path]: before }), candidateFiles: Object.freeze({ [path]: after }),
    allowedMutationPaths: Object.freeze([...allowedMutationPaths]) });
}

const clean = admitStaticEngineeringCandidate(fixture());
check(clean.decision === "ADMITTED", "clean bounded candidate is admitted");
check(clean.evidenceClass === "E3" && /^[0-9a-f]{64}$/.test(clean.evidenceDigest), "admission carries deterministic E3 digest");
check(clean.evidenceIndependence === "IMPLEMENTATION_ADJACENT_SHARED_STATIC_ORACLE",
  "admission explicitly discloses its implementation-adjacent evidence independence");
check(clean.eventIntegrity === "HASH_CHAINED_NOT_AUTHENTICATED",
  "admission does not misrepresent a hash chain as authenticated evidence");
check(!clean.hiddenEvidenceUsed && !clean.authorityGranted && !clean.functionalEvidenceConsidered,
  "static admission uses no hidden evidence, execution claim, or authority");
check(OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1.invariants.length === 0, "public policy contains no task-specific invariants");
check(NYX_ENGINEERING_QUALITY_V5.every((task) => validPublicQualityObligations(task.objective,
  task.mutationPaths, task.publicQualityObligations ?? [])),
"every published V5 obligation is independently anchored in public objective text and mutation scope");

const objective = "Use the repository-owned comparePriority helper to order jobs.";
const publicObligation = Object.freeze({ objectiveQuote: "comparePriority helper", invariant: Object.freeze({
  invariantId: "PUBLIC_COMPARATOR_CALL", dimension: "ARCHITECTURAL_FIT" as const,
  kind: "REQUIRED_CALL" as const, path: PATH, value: "comparePriority",
}) });
const missingRequiredCall = admitStaticEngineeringCandidate({ ...fixture(), objective,
  publicQualityObligations: [publicObligation] });
check(missingRequiredCall.decision === "REJECTED" && missingRequiredCall.findings.some((item) =>
  item.dimension === "ARCHITECTURAL_FIT" && item.code === "INVARIANT_FAILED"
    && item.paths.includes(PATH)),
"a public objective-bound architecture obligation rejects a missing helper call");
check(missingRequiredCall.appliedPolicyDigest !== clean.appliedPolicyDigest
  && missingRequiredCall.staticPolicyId === "omega-public-static-candidate/2",
"objective-bound obligations and revised public policy are reflected in evidence identity");
const satisfiedRequiredCall = admitStaticEngineeringCandidate({ ...fixture(undefined,
  "export function add(a, b) { return comparePriority(a, b); }\n"), objective,
  publicQualityObligations: [publicObligation] });
check(satisfiedRequiredCall.decision === "ADMITTED", "an objective-bound helper call can be satisfied");
const forgedQuote = admitStaticEngineeringCandidate({ ...fixture(), objective,
  publicQualityObligations: [{ ...publicObligation, objectiveQuote: "secret hidden assertion" }] });
check(forgedQuote.decision === "INSUFFICIENT_EVIDENCE" && forgedQuote.findings.some((item) =>
  item.code === "PUBLIC_OBJECTIVE_OBLIGATIONS_INVALID"),
"a requirement absent from the public objective cannot be smuggled into admission");
const unauthorizedObligation = admitStaticEngineeringCandidate({ ...fixture(), objective,
  publicQualityObligations: [{ ...publicObligation, invariant: { ...publicObligation.invariant,
    path: "src/other.mjs" } }] });
check(unauthorizedObligation.decision === "INSUFFICIENT_EVIDENCE",
  "a public obligation cannot expand the authorized mutation scope");
const immutableObligation = { objectiveQuote: OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT,
  invariant: { invariantId: "PUBLIC_IMMUTABILITY", dimension: "ARCHITECTURAL_FIT" as const,
    kind: "NO_PARAMETER_MUTATION" as const, path: PATH } };
const immutableReview = (after: string) => admitStaticEngineeringCandidate({
  ...fixture("export function add(values) { return values; }\n", after),
  objective: OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT, publicQualityObligations: [immutableObligation] });
const mutatingReview = immutableReview("export function add(values) { return values.sort(); }\n");
check(mutatingReview.decision === "REJECTED" && mutatingReview.findings.some((finding) =>
  finding.code === "INPUT_PARAMETER_MUTATION_RISK" && finding.paths.includes(PATH)),
  "objective-bound input immutability rejects in-place sorting before final evaluation");
check(immutableReview("export function add(values) { return [...values].sort(); }\n").decision === "ADMITTED",
  "explicit owned-container sorting satisfies the same unweakened mutation detector");
check(immutableReview("export function add(values) { const borrowed=untrusted(values); return borrowed.reverse(); }\n")
  .decision === "REJECTED", "unknown helper returns are conservatively treated as borrowed input");
check(!validPublicQualityObligations("Changing inputs is allowed.", [PATH], [immutableObligation])
  && !validPublicQualityObligations(OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT, [PATH],
    [{ ...immutableObligation, invariant: { ...immutableObligation.invariant, value: "bypass" } }])
  && !validPublicQualityObligations(OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT, [PATH],
    [{ ...immutableObligation, invariant: { ...immutableObligation.invariant, path: "src/other.mjs" } }]),
  "input immutability requires explicit public language, no arbitrary value and authorized scope");
check(!validPublicQualityObligations(OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT, ["src/data.txt"],
  [{ ...immutableObligation, invariant: { ...immutableObligation.invariant, path: "src/data.txt" } }]),
  "a plaintext resource cannot claim source-level input-ownership verification");
const declarationHeavy = admitStaticEngineeringCandidate(fixture(undefined,
  "export function add(a, b) { const x=0; const y=0; const z=0; const q=0; const r=0; return a+b+x+y+z+q+r; }\n"));
check(declarationHeavy.decision === "REJECTED" && declarationHeavy.findings.some((item) =>
  item.dimension === "UNNECESSARY_COMPLEXITY" && item.code === "DECLARATION_DELTA"
    && item.measurement?.observed === 5 && item.measurement.limit === 4
    && item.paths.includes(PATH)),
"the public complexity bound reports the measured excess and affected scope without hidden evidence");
const branchHeavy = admitStaticEngineeringCandidate(fixture(undefined,
  `export function add(a, b) {\n${Array.from({ length: 13 }, (_, index) =>
    `  if (a === ${index}) return b + ${index};`).join("\n")}\n  return a + b;\n}\n`));
check(branchHeavy.decision === "REJECTED" && branchHeavy.findings.some((item) =>
  item.code === "COMPLEXITY_LIMIT" && item.paths.includes(PATH)
    && item.measurement?.observed === 14 && item.measurement.limit === 12),
"public per-file complexity rejection carries exact observed and allowed values");
const nestedHeavy = admitStaticEngineeringCandidate(fixture(undefined,
  `export function add(a, b) { ${"if (a) { ".repeat(5)}return a + b; ${"} ".repeat(5)} }\n`));
check(nestedHeavy.decision === "REJECTED" && nestedHeavy.findings.some((item) =>
  item.code === "NESTING_LIMIT" && item.paths.includes(PATH)
    && item.measurement?.observed === 5 && item.measurement.limit === 4),
"public nesting rejection carries exact observed and allowed values");
const originalTinySource = "export function add(a, b) { return a - b; }\n";
const firstHeavyCandidate = `export function add(a, b) {
  const first = 0;
  const second = 0;
  const third = 0;
  const fourth = 0;
  const fifth = 0;
  const sixth = 0;
  return a + b + first + second + third + fourth + fifth + sixth;
}\n`;
const revisedHeavyCandidate = firstHeavyCandidate.replace("const sixth = 0;", "const sixth = 1;")
  .replace("+ fifth + sixth;", "+ fifth + sixth - 1;");
const incrementalOnly = admitStaticEngineeringCandidate(fixture(firstHeavyCandidate, revisedHeavyCandidate));
const cumulativeReview = admitStaticEngineeringCandidate({ ...fixture(firstHeavyCandidate, revisedHeavyCandidate),
  qualityBaselineFiles: { [PATH]: originalTinySource } });
check(incrementalOnly.decision === "ADMITTED", "the incremental-only review reproduces the hidden cumulative-quality gap");
check(cumulativeReview.decision === "REJECTED" && cumulativeReview.findings.some((item) =>
  item.dimension === "UNNECESSARY_COMPLEXITY" && item.code === "DECLARATION_DELTA"
    && item.measurement?.observed === 6 && item.measurement.limit === 4),
"the cumulative review rejects a second repair that remains excessive relative to the original baseline");
check(cumulativeReview.qualityBaselineDigest === hash(canonical({ [PATH]: originalTinySource }))
  && cumulativeReview.reviewedPaths.length === 1 && cumulativeReview.reviewedPaths[0] === PATH,
"admission evidence identifies the original quality baseline and cumulative review scope");
const missingCumulativeCandidate = admitStaticEngineeringCandidate({ ...fixture(firstHeavyCandidate, revisedHeavyCandidate),
  qualityBaselineFiles: { [PATH]: originalTinySource, "src/unobserved.mjs": "export const x = 1;\n" } });
check(missingCumulativeCandidate.decision === "INSUFFICIENT_EVIDENCE" && missingCumulativeCandidate.findings.some((item) =>
  item.code === "QUALITY_BASELINE_FILES_INVALID"), "cumulative review fails closed when a baseline file has no candidate state");
const largerBaseline = "export function add(a,b) {\n  const left = a;\n  const right = b;\n  const prior = left + right;\n  return prior;\n}\n";
const largerCandidate = "export function add(a,b) { const x=0; const y=0; const z=0; const q=0; const r=0; return a+b+x+y+z+q+r; }\n";
const largerRepair = admitStaticEngineeringCandidate(fixture(largerBaseline, largerCandidate));
check(largerRepair.decision === "ADMITTED" && largerRepair.appliedPolicyDigest !== declarationHeavy.appliedPolicyDigest,
"the stricter declaration limit is confined to tiny one-file repairs, not all substantial patches");

const longLine = `export function add(a, b) { const explanation = "${"x".repeat(190)}"; return explanation ? a + b : 0; }\n`;
const longLineResult = admitStaticEngineeringCandidate(fixture(undefined, longLine));
check(longLineResult.decision === "REJECTED" && longLineResult.findings.some((item) => item.dimension === "READABILITY"
  && item.code === "EXCESSIVE_LINE_LENGTH"), "excessive line length is rejected by a generic readability finding");

const parseResult = admitStaticEngineeringCandidate(fixture(undefined, "export function add(a, b) { return a + ; }\n"));
check(parseResult.decision === "REJECTED" && parseResult.findings.some((item) => item.code === "PARSE_ERROR"),
  "syntax error is rejected");

const apiResult = admitStaticEngineeringCandidate(fixture(undefined, "export function sum(a, b) { return a + b; }\n"));
check(apiResult.decision === "REJECTED" && apiResult.findings.some((item) => item.dimension === "API_COMPATIBILITY"
  && item.code === "EXPORT_CONTRACT_CHANGED"), "public API change is rejected");

const unsafeResult = admitStaticEngineeringCandidate(fixture(undefined,
  "export function add(a, b) { return eval(`${a} + ${b}`); }\n"));
check(unsafeResult.decision === "REJECTED" && unsafeResult.findings.some((item) => item.dimension === "SECURITY_IMPLICATIONS"
  && item.code === "UNSAFE_RUNTIME_ACCESS"), "unsafe runtime access is rejected");

const unauthorized = admitStaticEngineeringCandidate(fixture(undefined, undefined, PATH, ["src/other.mjs"]));
check(unauthorized.decision === "REJECTED" && unauthorized.findings.some((item) => item.dimension === "SCOPE_DISCIPLINE"
  && item.code === "UNAUTHORIZED_CHANGE"), "candidate outside the authorized path set is rejected");

const withInheritedDebt = fixture();
const inheritedLine = `export const legacy = "${"y".repeat(220)}";\n`;
const inheritedResult = admitStaticEngineeringCandidate({ ...withInheritedDebt,
  baselineFiles: { ...withInheritedDebt.baselineFiles, "src/readonly-legacy.mjs": inheritedLine },
  candidateFiles: { ...withInheritedDebt.candidateFiles, "src/readonly-legacy.mjs": inheritedLine } });
check(inheritedResult.decision === "ADMITTED", "unchanged read-only debt does not cause candidate rejection");

const provenance = fixture();
const mismatch = admitStaticEngineeringCandidate({ ...provenance, application: { ...provenance.application,
  proposalDigest: "f".repeat(64) } });
check(mismatch.decision === "INSUFFICIENT_EVIDENCE" && mismatch.findings.some((item) => item.code === "APPLICATION_BINDING_MISMATCH"),
  "proposal/application provenance mismatch cannot be admitted or mislabeled as a quality failure");

const malformed = admitStaticEngineeringCandidate({ schemaVersion: 999 });
check(malformed.decision === "INSUFFICIENT_EVIDENCE" && malformed.findings.some((item) => item.dimension === "CONTRACT"),
  "malformed request produces explicit insufficient evidence");
check(malformed.candidateCommit === null && !malformed.authorityGranted, "invalid input remains inert and grants no authority");

let deeplyMalformedResult: ReturnType<typeof admitStaticEngineeringCandidate> | null = null;
let deeplyMalformedThrew = false;
try {
  const base = fixture();
  deeplyMalformedResult = admitStaticEngineeringCandidate({ ...base,
    hypothesis: { ...base.hypothesis, changes: [{ relativePath: { nested: [null, { unexpected: true }] } }] },
    proposal: { ...base.proposal, changes: { nested: { insteadOfArray: true } } },
    application: { ...base.application, changedPaths: { nested: [PATH] },
      events: [{ nested: { event: true } }] } });
} catch {
  deeplyMalformedThrew = true;
}
check(!deeplyMalformedThrew && deeplyMalformedResult?.decision === "INSUFFICIENT_EVIDENCE",
  "deeply malformed nested contract fails closed without throwing");

const emptyBase = fixture();
const { proposalDigest: _oldHypothesisDigest, ...emptyHypothesisBody } = emptyBase.hypothesis;
const emptyHypothesisUnsigned = { ...emptyHypothesisBody, changes: Object.freeze([]) };
const emptyHypothesis: NyxRepairHypothesis = Object.freeze({ ...emptyHypothesisUnsigned,
  proposalDigest: hash(canonical(emptyHypothesisUnsigned)) });
const { proposalDigest: _oldProposalDigest, ...emptyProposalBody } = emptyBase.proposal;
const emptyProposalUnsigned = { ...emptyProposalBody, changes: Object.freeze([]) };
const emptyProposal: R2GPatchProposal = Object.freeze({ ...emptyProposalUnsigned,
  proposalDigest: hash(canonical(emptyProposalUnsigned)) });
const emptyApplicationId = emptyBase.application.applicationId;
const emptyTransitions = Object.freeze([] as FileTransition[]);
const emptyEvents = fullAppliedEventChain(emptyApplicationId, emptyProposal.proposalDigest, emptyTransitions);
const emptyProposalChangedCandidate = admitStaticEngineeringCandidate({ ...emptyBase,
  lineage: { ...emptyBase.lineage, hypothesisDigest: emptyHypothesis.proposalDigest,
    proposalDigest: emptyProposal.proposalDigest },
  hypothesis: emptyHypothesis, proposal: emptyProposal,
  application: { ...emptyBase.application, proposalDigest: emptyProposal.proposalDigest,
    prestateDigest: repositoryStateDigest(emptyTransitions, false),
    poststateDigest: repositoryStateDigest(emptyTransitions, true), changedPaths: Object.freeze([]), events: emptyEvents } });
check(emptyProposalChangedCandidate.decision !== "ADMITTED",
  "an empty proposal cannot admit an independently changed candidate snapshot");

const fabricatedBase = fixture();
const fabricatedInput = { eventType: "APPLICATION_PROVEN" as const, requestId: "APPLY-1",
  applicationId: fabricatedBase.application.applicationId, actorIdentity: "OMEGA-R3A", result: "VERIFIED" as const,
  proposalDigest: fabricatedBase.proposal.proposalDigest, stateDigest: fabricatedBase.application.poststateDigest };
const fabricatedEvent = event(fabricatedInput, 1, "GENESIS");
const oneEventFabrication = admitStaticEngineeringCandidate({ ...fabricatedBase,
  application: { ...fabricatedBase.application, events: Object.freeze([fabricatedEvent]) } });
check(oneEventFabrication.decision !== "ADMITTED",
  "a self-consistent one-event APPLICATION_PROVEN fabrication cannot substitute for the R3A event grammar");

const undeclaredBase = fixture();
const undeclaredTransition = admitStaticEngineeringCandidate({ ...undeclaredBase,
  baselineFiles: { ...undeclaredBase.baselineFiles, "src/undeclared.mjs": "export const flag = false;\n" },
  candidateFiles: { ...undeclaredBase.candidateFiles, "src/undeclared.mjs": "export const flag = true;\n" } });
check(undeclaredTransition.decision !== "ADMITTED",
  "a candidate snapshot transition absent from hypothesis, proposal, and application cannot be admitted");

const missingCandidateBase = fixture();
const { [PATH]: _missingCandidate, ...candidateWithoutDeclaredPath } = missingCandidateBase.candidateFiles;
const missingCandidateTransition = admitStaticEngineeringCandidate({ ...missingCandidateBase,
  candidateFiles: candidateWithoutDeclaredPath });
check(missingCandidateTransition.decision !== "ADMITTED",
  "a declared transition with no candidate file cannot be admitted");

const extraApplicationBase = fixture();
const extraApplicationTransition = admitStaticEngineeringCandidate({ ...extraApplicationBase,
  application: { ...extraApplicationBase.application,
    changedPaths: Object.freeze([...extraApplicationBase.application.changedPaths, "src/extra.mjs"]) } });
check(extraApplicationTransition.decision !== "ADMITTED",
  "an application transition absent from the proposal cannot be admitted");

// Development-only applicability counterexample. This preserves the existing
// oracle, including its rejection; it does not regrade any frozen model result.
// A differently formatted original stub must not be mistaken for a different
// algorithm or for evidence that the candidate's engineering quality improved.
{
  const originals = [
    'export function transform(input) {\n  throw new Error("Not implemented");\n}\n',
    'export function transform(input) {\n  throw new Error(\n    "Not implemented");\n}\n',
    'export function transform(input) {\n  // Implementation remains absent.\n  throw new Error("Not implemented");\n}\n',
    'export function transform(input) {\n\n  throw new Error("Not implemented");\n\n}\n',
  ];
  const canonicalAst = (source: string) => ts.createPrinter({ removeComments: true }).printFile(
    ts.createSourceFile(PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  const candidate = `export function transform(input) {
  const values = input.values;
  const target = input.target;
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (values[middle] < target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}
`;
  const directReads = `export function transform(input) {
  let lower = 0;
  let upper = input.values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (input.values[middle] < input.target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}
`;
  const transforms = await Promise.all([candidate, directReads].map(async source =>
    (await import(`data:text/javascript,${encodeURIComponent(source)}`)).transform));
  let checkedCases = 0;
  let functionalFailures = 0;
  let inputMutationFailures = 0;
  // Independent linear-search oracle, not a second copy of binary search.
  for (let length = 0; length <= 4; length++) {
    for (let encoding = 0; encoding < 5 ** length; encoding++) {
      const values = Array.from({ length }, (_, position) => Math.floor(encoding / 5 ** position) % 5 - 2);
      if (values.some((value, position) => position > 0 && value < values[position - 1])) continue;
      for (let target = -3; target <= 3; target++) {
        const input = { values: values.slice(), target };
        const before = JSON.stringify(input);
        const found = values.findIndex(value => value >= target);
        const expected = found < 0 ? values.length : found;
        for (const transform of transforms) {
          if (transform(input) !== expected) functionalFailures++;
          if (JSON.stringify(input) !== before) inputMutationFailures++;
        }
        checkedCases++;
      }
    }
  }
  check(checkedCases === 882 && functionalFailures === 0 && inputMutationFailures === 0,
    "applicability witness passes independent exhaustive finite lower-bound checks with unchanged inputs");
  check(originals.every(source => canonicalAst(source) === canonicalAst(originals[0])),
    "formatting and comment variants of original stub have identical normalized TypeScript ASTs");
  const originalMeasurements = originals.map(source => measureEngineeringStructure(PATH, source));
  check(originalMeasurements.every(value => JSON.stringify(value) === JSON.stringify(originalMeasurements[0])),
    "stub formatting does not change original declaration, complexity or nesting measurements");
  check(measureEngineeringStructure(PATH, candidate).declarations === 6,
    "readable witness has one function and five ordinary named variable bindings, not declaration packing");
  const review = (before: string, after: string) => admitStaticEngineeringCandidate({
    ...fixture(before, after), objective: OMEGA_PUBLIC_INPUT_IMMUTABILITY_REQUIREMENT,
    publicQualityObligations: [immutableObligation],
  });
  const outcomes = originals.map(before => review(before, candidate));
  check(outcomes[0].decision === "REJECTED" && outcomes[3].decision === "REJECTED"
    && outcomes[0].findings.length === 1 && outcomes[0].findings[0].code === "DECLARATION_DELTA"
    && outcomes[0].findings[0].measurement?.observed === 5
    && outcomes[0].findings[0].measurement?.limit === 4,
    "current tiny-baseline contract still rejects the independently correct candidate only for declaration delta");
  check(outcomes[1].decision === "ADMITTED" && outcomes[2].decision === "ADMITTED"
    && outcomes[1].findings.length === 0 && outcomes[2].findings.length === 0,
    "known applicability discrepancy is reproduced: wrapping a throw or adding a comment changes admission without changing code semantics");
  check(outcomes[0].appliedPolicyDigest !== outcomes[1].appliedPolicyDigest
    && outcomes.every(value => value.staticPolicyId === "omega-public-static-candidate/2"),
    "policy evidence exposes the different effective limits even though the public policy version is unchanged");
  const directReadOutcomes = originals.map(before => review(before, directReads));
  check(measureEngineeringStructure(PATH, directReads).declarations === 4
    && directReadOutcomes.every(value => value.decision === "ADMITTED"),
    "the same finite JSON-input objective has a readable admitted implementation without threshold relaxation or code packing");
  for (const original of originals) {
    check(review(original, 'export function transform(input) { return fetch("https://example.invalid"); }\n')
      .decision === "REJECTED", "formatting discrepancy cannot waive the network-access detector");
    check(review(original, 'export function transform(input) { input.values.sort(); return 0; }\n')
      .findings.some(value => value.code === "INPUT_PARAMETER_MUTATION_RISK"),
      "formatting discrepancy cannot waive the objective-bound input ownership detector");
    check(review(original, 'export function transform(input) { return ; invalid syntax here }\n')
      .decision !== "ADMITTED", "formatting discrepancy cannot waive syntax rejection");
  }
  console.log(`NYX_QUALITY_APPLICABILITY_DIAGNOSTIC ${JSON.stringify({
    schemaVersion: 1, evidenceClass: "E3", evidenceIndependence: "SAME_AUTHOR_DEVELOPMENT_FIXTURE_SHARED_STATIC_ORACLE",
    study: "BASELINE_FORMATTING_METAMORPHIC_COUNTEREXAMPLE", originalNonblankLines: originals.map(source =>
      source.split(/\r?\n/).filter(line => line.trim()).length),
    originalNormalizedAstEqual: originals.every(source => canonicalAst(source) === canonicalAst(originals[0])),
    originalMeasurements, candidateDigest: hash(candidate), candidateMeasurement: measureEngineeringStructure(PATH, candidate),
    checkedCases, candidateEvaluations: checkedCases * transforms.length, functionalFailures, inputMutationFailures,
    directReadVariant: { candidateDigest: hash(directReads), candidateMeasurement: measureEngineeringStructure(PATH, directReads),
      decisions: directReadOutcomes.map(value => value.decision),
      equivalenceScope: "FINITE_PLAIN_JSON_INPUTS_NOT_GETTERS_PROXIES_OR_ARBITRARY_REFACTORING" },
    outcomes: outcomes.map(value => ({
      decision: value.decision, staticPolicyId: value.staticPolicyId, appliedPolicyDigest: value.appliedPolicyDigest,
      findings: value.findings,
    })), frozenResultsRegraded: false, policyChanged: false, modelCalls: 0, cognitiveGainEstablished: false,
    semanticsScope: "CONTROLLED_STUB_FORMATTING_NOT_ARBITRARY_PROGRAM_EQUIVALENCE",
    feasibilityScope: "WITNESS_IS_CORRECT_NOT_PROOF_THAT_TINY_LIMIT_IS_UNSATISFIABLE",
    authorityGranted: false,
  })}`);
}

console.log(`Omega candidate engineering admission tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
