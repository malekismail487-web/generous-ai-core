import { SemanticPolynomialSession, SEMANTIC_POLYNOMIAL_POLICY, type SemanticPolynomialTask } from "../src/lib/codelab/research/semanticPolynomialProof";
import type { QuantitativeAlgebraicForm } from "../src/lib/codelab/research/quantitativeAlgebraicCompiler";
import { runNyxSemanticProofTask } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import type { NvidiaNimCompletionRequest, NvidiaNimCompletionResult } from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0, failed = 0;
function check(v: unknown, message: string) { if (v) passed++; else { failed++; console.error(`FAIL ${message}`); } }
function throws(f: () => unknown, message: string) { try { f(); check(false, message); } catch { check(true, message); } }
const form = (lhs: string, rhs: string): QuantitativeAlgebraicForm => ({ schemaVersion: 5, definitions: [], outputs: [{ label: "lhs", expression: lhs }, { label: "rhs", expression: rhs }] });
const task = (): SemanticPolynomialTask => ({ schemaVersion: 1, objective: "Construct the discrete antiderivative of x squared with zero initial value and an independent auxiliary polynomial.",
  variables: ["x"], constants: ["zero", "one", "two", "three", "four", "five", "six"].map((id, i) => ({ id, value: String(i) })), outputLabels: ["q", "r"], obligations: [
    { obligationId: "difference", dependsOn: [], substitutions: [{ id: "shift", sourceOutput: "q", bindings: [{ variable: "x", expression: "x+one" }] }], identity: form("shift-q", "x*x") },
    { obligationId: "origin", dependsOn: ["difference"], substitutions: [{ id: "initial", sourceOutput: "q", bindings: [{ variable: "x", expression: "zero" }] }], identity: form("initial", "zero") },
    { obligationId: "auxiliary", dependsOn: [], substitutions: [], identity: form("r", "x+one") },
  ] });
const limits = () => ({ maxRequests: 8, maxWorkUnits: 300000, maxElapsedMs: 2000, expiresAtEpochMs: Date.now() + 60000 });
const program = (q: string, r = "x+one"): QuantitativeAlgebraicForm => ({ schemaVersion: 5, definitions: [], outputs: [{ label: "q", expression: q }, { label: "r", expression: r }] });
const request = (s: SemanticPolynomialSession, p: QuantitativeAlgebraicForm, parentResultDigest: string | null = null) => ({ schemaVersion: 1, operation: "CHECK_POLYNOMIAL_CANDIDATE", problemDigest: s.problemDigest, parentResultDigest, program: p });
const session = SemanticPolynomialSession.create(task(), limits());
const first = session.analyze(request(session, program("x*x")));
check("observations" in first && first.observations.find(o => o.obligationId === "difference")?.state === "REFUTED_IDENTITY", "Wrong global construction produces exact refutation, not vague confidence");
check("observations" in first && first.observations.find(o => o.obligationId === "difference")?.counterexample?.assignment.x === "0", "Counterexample names the input and exact incompatible values");
if ("observations" in first) {
  const c = first.observations[0].counterexample!;
  const x = BigInt(c.assignment.x);
  check(BigInt(c.lhs) === (x + 1n) * (x + 1n) - x * x && BigInt(c.rhs) === x * x, "Independent direct arithmetic replays the reported counterexample");
  check(first.workPacket.acceptanceState === "REJECTED" && first.workPacket.unresolved.some(o => o.obligationId === "origin" && o.state === "BLOCKED"), "A locally true identity cannot discharge a falsified dependency");
}
const second = session.analyze(request(session, program("x*(x-one)*(two*x-one)/six"), "resultDigest" in first ? first.resultDigest : null));
check("observations" in second && second.workPacket.acceptanceState === "ACCEPTABLE", "Exact symbolic checking validates a construction for all rational inputs, not a sample grid");
check("observations" in second && second.observations.filter(o => o.reused).length === 1 && second.observations.find(o => o.reused)?.obligationId === "auxiliary", "Only unchanged semantic dependencies reuse earlier verified evidence");
const third = session.analyze(request(session, program("x*(two*x*x-three*x+one)/six"), "resultDigest" in second ? second.resultDigest : null));
check("observations" in third && third.observations.every(o => o.reused), "Canonical equivalent polynomial constructions share subgoal evidence across branches");
const fourth = session.analyze(request(session, program("x*(x-one)*(two*x-one)/six", "x-two")));
check("observations" in fourth && fourth.workPacket.acceptanceState === "REJECTED" && fourth.observations.filter(o => o.reused).length === 2, "Changing one output invalidates its proof without discarding unrelated solved obligations");
check("observations" in third && third.acceptanceRequiresIndependentVerifier && !third.grantsAuthority && third.evidenceClass === "E3"
  && third.naturalLanguageFormalizationFidelity === "NOT_ESTABLISHED", "One symbolic checker is not independent certification, natural-language fidelity or new authority");
throws(() => session.analyze({ ...request(session, program("x")), problemDigest: "0".repeat(64) }), "Changing the immutable problem binding is rejected");
throws(() => session.analyze(request(session, program("x"), "1".repeat(64))), "Foreign or forged branch-parent receipts are rejected");
check(session.usage().requests === 6, "Malformed and stale invocations consume the same request budget");
const nonpoly = session.analyze(request(session, program("x/x")));
check("state" in nonpoly && nonpoly.state === "INSUFFICIENT_EVIDENCE" && nonpoly.reason === "NONCONSTANT_OR_ZERO_DIVISOR", "Variable division is unsupported, not silently proved under invented assumptions");
const overflow = session.analyze(request(session, program("x*x*x*x*x*x*x*x*x")));
check("state" in overflow && overflow.reason === "DEGREE_BOUND", "Degree overflow is UNKNOWN rather than mathematical refutation");
throws(() => session.analyze(request(session, program("x"))), "Eight-attempt limit cannot be bypassed by failed candidates");
session.revoke(); throws(() => session.analyze(request(session, program("x"))), "Revoked process-local computation remains unavailable");

const aliasTask = task() as any, original = SemanticPolynomialSession.create(aliasTask, limits());
aliasTask.obligations[0].identity = form("q", "q");
const aliased = original.analyze(request(original, program("x*x")));
check("observations" in aliased && aliased.workPacket.acceptanceState === "REJECTED", "Mutating the caller's statement cannot replace the owned theorem with a tautology");
let accessorCalls = 0;
throws(() => SemanticPolynomialSession.create({ ...task(), get objective() { accessorCalls++; return "host getter"; } }, limits()), "Host accessors are rejected before cloning or evaluation");
check(accessorCalls === 0, "Input checking never invokes a hostile getter");
const cyclic = task() as any; cyclic.obligations[0].dependsOn = ["origin"];
throws(() => SemanticPolynomialSession.create(cyclic, limits()), "Circular proof-obligation dependencies are rejected");
const omitted = SemanticPolynomialSession.create(task(), limits());
throws(() => omitted.analyze(request(omitted, { schemaVersion: 5, definitions: [], outputs: [{ label: "q", expression: "zero" }] })), "A candidate cannot drop required outputs");
throws(() => omitted.analyze({ ...request(omitted, program("x")), identity: form("q", "q") }), "A candidate cannot replace or inject the acceptance statement");
throws(() => omitted.analyze(request(omitted, program("require(process)"))), "Executable text cannot acquire host authority");
const setupUnits = SemanticPolynomialSession.create(task(), limits()).usage().workUnits;
const partial = SemanticPolynomialSession.create(task(), { ...limits(), maxWorkUnits: setupUnits + 1 });
const partialResult = partial.analyze(request(partial, program("x*(x-one)*(two*x-one)/six")));
check("state" in partialResult && partialResult.reason === "BUDGET_EXHAUSTED" && !partialResult.grantsAuthority, "An exhausted proof attempt cannot become a successful or refuted theorem");
let clock = 1000;
const timed = SemanticPolynomialSession.create(task(), { ...limits(), expiresAtEpochMs: 3000 }, () => clock);
clock = 3000; throws(() => timed.analyze(request(timed, program("x"))), "Expiry at the exact boundary forbids additional work");
clock = 900; throws(() => timed.analyze(request(timed, program("x"))), "Clock rollback cannot renew an expired lease");

// A polynomial can agree with seven samples yet still be false. Exact normal
// form and an eighth counterexample must prevent numerical-test certification.
const gridTask: SemanticPolynomialTask = { ...task(), outputLabels: ["q"], obligations: [{ obligationId: "identity", dependsOn: [], substitutions: [], identity: form("q", "zero") }] };
const grid = SemanticPolynomialSession.create(gridTask, limits());
const deceptive = { schemaVersion: 5 as const, definitions: [], outputs: [{ label: "q", expression: "x*(x-one)*(x-two)*(x-three)*(x-four)*(x-five)*(x-six)" }] };
const gridResult = grid.analyze(request(grid, deceptive));
check("observations" in gridResult && gridResult.observations[0].state === "REFUTED_IDENTITY" && gridResult.observations[0].counterexample?.assignment.x === "7", "Passing a fixed sample set is never confused with universal proof");

// Independent distributivity identities across rational coefficients and
// multivariate constructions; deliberately wrong siblings test false acceptance.
for (let seed = 1; seed <= 48; seed++) {
  const t: SemanticPolynomialTask = { schemaVersion: 1, objective: "Construct the expanded product over rational variables; immutable distributivity specification.",
    variables: ["x", "y"], constants: [{ id: "zero", value: "0" }, { id: "a", value: `${seed - 25}/${seed % 5 + 1}` },
      { id: "b", value: String(seed % 7 - 3) }, { id: "c", value: `${seed % 11 + 1}/3` }, { id: "d", value: String(seed % 13 - 6) }], outputLabels: ["p"],
    obligations: [{ obligationId: "product", dependsOn: [], substitutions: [], identity: form("p", "(a*x+b)*(c*y+d)") }] };
  const s = SemanticPolynomialSession.create(t, limits());
  const candidate = (expression: string) => ({ schemaVersion: 5 as const, definitions: [], outputs: [{ label: "p", expression }] });
  const good = s.analyze(request(s, candidate("a*c*x*y+a*d*x+b*c*y+b*d")));
  const bad = s.analyze(request(s, candidate("a*c*x*y+a*d*x+b*c*y+b*d+x*y")));
  check("observations" in good && good.observations[0].state === "PROVED_IDENTITY", `Universal rational distributivity passes at seed ${seed}`);
  check("observations" in bad && bad.observations[0].state === "REFUTED_IDENTITY", `An extra cross-term cannot falsely pass at seed ${seed}`);
  if ("observations" in bad) {
    const ce = bad.observations[0].counterexample!;
    check(ce.assignment.x !== "0" && ce.assignment.y !== "0" && ce.lhs !== ce.rhs, `Independent cross-term condition replays seed ${seed}`);
  }
}
check(!SEMANTIC_POLYNOMIAL_POLICY.grantsAuthority && !SEMANTIC_POLYNOMIAL_POLICY.cognitiveGainDemonstrated, "The prototype does not self-promote frontier cognition");

// Explicit TEST DOUBLE, not a live model, reasoning score or E4 demonstration.
const mock = (request: NvidiaNimCompletionRequest, value: unknown): NvidiaNimCompletionResult => ({
  decision: "COMPLETED", reason: "TEST_DOUBLE_NOT_LIVE", content: JSON.stringify(value), finishReason: "stop", executorAuthorityGranted: false,
  evidence: { evidenceId: request.requestId, evidenceClass: "E4", providerId: "TEST_DOUBLE_NOT_LIVE", endpointOrigin: "https://integrate.api.nvidia.com",
    model: "TEST_DOUBLE_NOT_LIVE", requestDigest: theoryDigest(request), responseDigest: theoryDigest(value), credentialSourceIdentity: "NONE",
    credentialPersisted: false, promptPersisted: false, networkAttempted: false, statusCode: 200, failureCategory: null,
    retryability: null, providerRequestId: null, finishReason: "stop", usage: {promptTokens: 10, completionTokens: 20, totalTokens: 30} } });
const loopLimits = { maxCalls: 2, maxOutputTokens: 1024, maxTaskMs: 60000, expiresAtEpochMs: Date.now()+60000,
  maxToolRequests: 2, maxToolWorkUnits: 100000, maxToolElapsedMs: 2000 };
for (const obligationGuidance of [false,true]) {
  let modelCalls = 0, verifierCalls = 0;
  const repaired = await runNyxSemanticProofTask({ task: task(), limits: loopLimits, obligationGuidance,
    complete: async req => {
      const prompt = JSON.parse(req.messages[1].content);
      check(!!prompt.obligations === obligationGuidance && prompt.task.objective === task().objective, "Only host-owned obligation guidance varies between matched loop profiles");
      if (modelCalls) check(prompt.feedback[0].state === "REFUTED_IDENTITY" && prompt.previousCandidate !== null, "NYX receives the exact counterexample and its owned prior construction, not an invented solution");
      return mock(req, program(modelCalls++ ? "x*(x-one)*(two*x-one)/six" : "x*x"));
    }, verify: () => { verifierCalls++; return {accepted: true, findings: [], verificationDigest: theoryDigest("TEST-OWNED-INDEPENDENT-EVALUATOR")}; } });
  check(repaired.accepted && !repaired.firstAttemptAccepted && repaired.calls === 2 && verifierCalls === 1, "Typed NYX candidate/refutation/repair/independent-acceptance composition works under a finite budget");
  check(!repaired.authorityIncrease && !repaired.generalShell && !repaired.generalNetwork && !repaired.productionAuthority, "The new cognition path does not grant broader environment authority");
}
const rejected = await runNyxSemanticProofTask({ task: task(), limits: loopLimits, obligationGuidance: true,
  complete: async req => mock(req, program("x*(x-one)*(two*x-one)/six")),
  verify: () => ({accepted: false, findings: ["INDEPENDENT_CHECKER_DISAGREEMENT"], verificationDigest: theoryDigest("INDEPENDENT-REJECTION")}) });
check(!rejected.accepted && rejected.attempts.every(a => a.outcome === "INDEPENDENT_VERIFICATION_REJECTION"), "Native graph completion cannot overrule the independent acceptance oracle");
let independentVotes = 0;
const conflicted = await runNyxSemanticProofTask({ task: task(), limits: loopLimits, obligationGuidance: true,
  complete: async req => mock(req, program("x*(x-one)*(two*x-one)/six")),
  verify: () => ({accepted: ++independentVotes > 1, findings: independentVotes === 1 ? ["CRITICAL_FALSIFICATION"] : [], verificationDigest: theoryDigest(["FLAKY-VERIFIER",independentVotes])}) });
check(!conflicted.accepted && conflicted.attempts[1]?.outcome === "INDEPENDENT_VERIFIER_CONFLICT" && conflicted.independentFailures.length === 1,
  "A later positive verdict cannot erase an earlier critical rejection of the identical artifact");
const untyped = await runNyxSemanticProofTask({ task: task(), limits: loopLimits, obligationGuidance: true,
  complete: async req => mock(req, {tool: "SHELL", arguments: "host mutation"}),
  verify: () => { throw Error("untyped candidate must not reach independent acceptance"); } });
check(!untyped.accepted && untyped.attempts.every(a => a.outcome === "AUTHORIZATION_OR_IR_REJECTION"), "Unknown model tools remain inert data");
console.log(`OMEGA_SEMANTIC_POLYNOMIAL_PROOF_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
