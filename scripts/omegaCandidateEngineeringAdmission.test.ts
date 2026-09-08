import { createHash } from "node:crypto";
import { admitStaticEngineeringCandidate, OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V1,
  type CandidateEngineeringAdmissionRequest } from "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import type { NyxRepairHypothesis } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import type { R2GPatchProposal } from "../src/lib/codelab/executor/r2PatchProposal";
import type { R3AApplyResult, R3AEvent } from "../src/lib/codelab/executor/r3DisposablePatchApplication";

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

console.log(`Omega candidate engineering admission tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
