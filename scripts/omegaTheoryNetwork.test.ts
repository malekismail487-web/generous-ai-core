import { TheoryNetwork, type TheoryNetworkConfig } from "../src/lib/codelab/research/theoryNetwork";
import { theoryDigest, validTheoryResearchContext, type TheoryAssignment, type TheoryLease,
  type TheoryObservation, type TheoryPrediction } from "../src/lib/codelab/research/theoryContracts";
import { runNextTheoryEngineeringInvestigation } from "../src/lib/codelab/research/theoryEngineeringDispatch";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
function throws(action: () => unknown, message: string): boolean {
  try { action(); return false; } catch (error) { return error instanceof Error && error.message === message; }
}
function fixture(overrides: Partial<TheoryNetworkConfig> = {}) {
  const coordinator = Object.freeze({ identity: "NYX_TEST_COORDINATOR" });
  let now = 1_000;
  const network = TheoryNetwork.create({ namespace: "nyx", addressCapacity: "1000000000000",
    maxAssignedPairs: 1_000, maxConcurrentActivations: 2, maxTotalActivations: 4,
    maxEvents: 100, maxPredictionsPerTheory: 8, maxObservationsPerTheory: 16,
    maxRelations: 20, maxFanout: 4, maxMessages: 20, activationLifetimeMs: 100,
    now: () => now, ...overrides }, coordinator);
  return { network, coordinator, clock: (value: number) => { now = value; } };
}
const assignment: TheoryAssignment = { objective: "Repair a scheduler without weakening invariants.",
  question: "Does a missing dependency check cause premature task execution?", domain: "SOFTWARE",
  candidateBinding: "a".repeat(40), scope: ["src/scheduler.ts"], assumptions: ["The test oracle reflects the required ordering."] };
const prediction: TheoryPrediction = { predictionId: "prediction-1", statement: "A missing dependency guard causes premature dispatch.",
  expectedResult: "The dependency-order test passes.", candidateDigest: "b".repeat(64), evidenceRefs: ["FILE:src/scheduler.ts"],
  assumptions: ["The test distinguishes ordering errors."], uncertainties: ["Concurrent cancellation is not yet tested."],
  proposedCounterexamples: ["Cancel a prerequisite before dispatch."], expectedPassingTools: ["TEST"], modelEstimate: 0.99 };
const observation: TheoryObservation = { evidenceId: "execution-1", predictionId: prediction.predictionId,
  candidateDigest: prediction.candidateDigest, toolId: "TEST", result: "PASS", evidenceClass: "E3",
  environmentIdentity: "local-test-double", provenanceRoot: "frozen-oracle-1" };
function assigned(f = fixture()) {
  const { network, coordinator } = f;
  const { firstId: id } = network.reserve(coordinator, "10");
  network.assign(coordinator, id, assignment);
  network.wake(coordinator, id, { eventId: "assigned", kind: "ASSIGNMENT", reason: "Investigate the scoped failing behavior." });
  const lease = network.take(coordinator)!;
  return { ...f, id, lease };
}

{
  const { network, coordinator } = fixture();
  const before = performance.now();
  const range = network.reserve(coordinator, "1000000000000");
  const elapsed = performance.now() - before;
  check(range.lastId === "nyx:theory:999999999999", "trillion-sized address range uses exact decimal arithmetic");
  check(network.metrics().assignedPairs === 0 && network.metrics().activePairs === 0,
    "reserving a trillion slots creates no resident entities or running cognition");
  check(network.inspect(range.lastId).state === "BLANK" && network.inspect(range.lastId).guardianId === null,
    "unassigned high-address entity remains blank and inactive");
  check(throws(() => network.wake(coordinator, range.lastId, { eventId: "bad", kind: "FOLLOW_UP", reason: "act" }),
    "blank_theory_cannot_act"), "blank entities cannot enter the work queue");
  check(throws(() => network.reserve(coordinator, "1"), "theory_address_capacity_exhausted"), "address reservation respects capacity");
  for (let index = 0; index < 1_000; index += 1) network.assign(coordinator, `nyx:theory:${index * 1_000_000}`, assignment);
  check(network.metrics().assignedPairs === 1_000 && network.metrics().unassignedAddressSlots === "999999999000",
    "sparse population materializes only a thousand pairs across a trillion-address space");
  check(throws(() => network.assign(coordinator, range.lastId, assignment), "theory_resident_capacity_exhausted"),
    "resident population budget is independent of address capacity");
  check(!network.metrics().residentScaleVerified && !network.metrics().distributedExecutionImplemented,
    "addressability does not certify trillion-record storage or distributed execution");
  console.log(`THEORY_ADDRESS_EXPERIMENT ${JSON.stringify({ addressSlots: range.count, materializedPairs: 1_000,
    reservationMs: elapsed, activeModelExecutions: 0, trillionPopulationDemonstrated: false })}`);
}
{
  const { network, coordinator, id, lease } = assigned();
  check(throws(() => network.reserve({}, "1"), "theory_coordinator_ownership_required"), "unowned coordinator cannot allocate identities");
  check(throws(() => network.assertActive(coordinator, { ...lease }), "theory_activation_not_owned"), "serialized or forged activation cannot exercise ownership");
  check(throws(() => network.assign(coordinator, id, assignment), "theory_already_assigned"), "guardian assignment cannot be silently replaced");
  check(network.inspect(id).guardianId === "nyx:guardian:0", "every assigned theory owns a uniquely corresponding guardian identity");
  check(throws(() => network.observe(coordinator, lease, observation), "theory_observation_binding_invalid"),
    "observations cannot retroactively invent a prediction");
  const digest = network.commitPrediction(coordinator, lease, prediction);
  check(digest === theoryDigest(prediction), "committed prediction digest preserves the original pre-experiment statement");
  check(throws(() => network.commitPrediction(coordinator, lease, { ...prediction, statement: "rewrite after result" }),
    "theory_prediction_already_committed"), "a prediction cannot be rewritten to match an observed outcome");
  check(throws(() => network.observe(coordinator, lease, { ...observation, candidateDigest: "c".repeat(64) }),
    "theory_observation_binding_invalid"), "evidence from another candidate is rejected");
  network.observe(coordinator, lease, observation);
  const snapshot = network.inspect(id);
  check("predictions" in snapshot && snapshot.predictions[0].committedAtOrder < snapshot.observations[0].observedAtOrder,
    "prediction is ordered before its attributed observation");
  check(Object.isFrozen(snapshot) && "assignment" in snapshot && Object.isFrozen(snapshot.assignment.scope),
    "external snapshots cannot mutate retained assignment or evidence");
  check(throws(() => network.observe(coordinator, lease, { ...observation, evidenceId: "another-id" }),
    "theory_observation_duplicate"), "relabeling one tool result cannot manufacture extra evidence");
  const report = network.guardianReport(id);
  check(report.predictionResults[0].disposition === "SUPPORTED_WITHIN_TEST_SCOPE" && report.causalTheoryState === "UNKNOWN",
    "passing software tests does not certify a causal scientific theory");
  check(report.predictionAudits.length === 1
    && report.predictionAudits[0].observed[0].evidenceId === observation.evidenceId
    && report.predictionAudits[0].unobservedTools.length === 0
    && report.predictionAudits[0].falsifyingEvidenceIds.length === 0,
    "guardian exposes the exact observed prediction outcome without inventing a discrepancy");
  check(report.confidence.lastModelEstimate === 0.99 && report.confidence.calibratedProbability === null
    && report.confidence.numericalTarget === null && !report.confidence.independenceEstablished,
    "guardian refuses to convert self-reported confidence into calibrated certainty or a target of one hundred percent");
  check(report.weakPoints.includes(prediction.uncertainties[0]) && report.requests.every((item) => !item.grantsAuthority),
    "guardian turns unresolved questions into authority-neutral research requests");
  check(report.weakPoints.includes("Proposed counterexamples are not executed test evidence."),
    "counterexample suggestions remain distinguishable from executed challenges");
  const context = network.context(coordinator, lease);
  check(validTheoryResearchContext(context, assignment.objective, assignment.candidateBinding), "bound research context validates");
  const forgedAudit = { ...context, report: { ...context.report, predictionAudits: [{
    ...context.report.predictionAudits[0], falsifyingEvidenceIds: [observation.evidenceId],
  }] } } as typeof context;
  check(!validTheoryResearchContext(forgedAudit, assignment.objective, assignment.candidateBinding),
    "research context rejects a fabricated falsifying evidence reference");
  const forgedDisposition = { ...context, report: { ...context.report, predictionResults: [{
    predictionId: prediction.predictionId, disposition: "FALSIFIED_PREDICTION" as const,
  }] } };
  check(!validTheoryResearchContext(forgedDisposition, assignment.objective, assignment.candidateBinding),
    "research context rejects a falsified label when the bound tool evidence passed");
  check(!validTheoryResearchContext(context, "different objective", assignment.candidateBinding), "cross-objective context is rejected");
  check(!validTheoryResearchContext({ ...context, grantsAuthority: true } as unknown as typeof context,
    assignment.objective, assignment.candidateBinding), "research context cannot declare its own execution authority");
  network.release(coordinator, lease);
  check(network.inspect(id).state === "DORMANT" && network.metrics().activePairs === 0,
    "completed activation returns entity to dormancy without losing its learned record");
  check(throws(() => network.assertActive(coordinator, lease), "theory_activation_not_owned"), "released worker lease cannot be reused");
}
{
  const { network, coordinator, id, lease, clock } = assigned(fixture({ maxConcurrentActivations: 1, maxTotalActivations: 2 }));
  network.wake(coordinator, id, { eventId: "follow", kind: "FOLLOW_UP", reason: "A fresh question remains." });
  check(network.wake(coordinator, id, { eventId: "follow", kind: "FOLLOW_UP", reason: "duplicate" }) === "DUPLICATE",
    "duplicate wake event cannot amplify scheduling");
  check(network.take(coordinator) === null && network.metrics().queuedPairs === 1, "active concurrency stays bounded despite pending work");
  clock(1_100);
  check(throws(() => network.assertActive(coordinator, lease), "theory_activation_expired"), "expired activation fails closed");
  const next = network.take(coordinator)!;
  check(next.activationId !== lease.activationId && next.theoryId === id, "replacement worker resumes the same theory through a fresh bounded activation");
  check(throws(() => network.release(coordinator, lease), "theory_activation_not_owned"), "stale worker cannot release a newer worker");
  network.release(coordinator, next);
  network.wake(coordinator, id, { eventId: "again", kind: "FOLLOW_UP", reason: "Further research requested." });
  check(network.take(coordinator) === null, "autonomous follow-up cannot exceed the total activation budget");
  check(network.eventHistory(coordinator, id).length === 3, "wake reasons retain attributable event history without duplicating events");
}
{
  const { network, coordinator, id, lease } = assigned();
  network.commitPrediction(coordinator, lease, prediction);
  network.observe(coordinator, lease, { ...observation, result: "FAIL" });
  const report = network.guardianReport(id);
  check(report.predictionResults[0].disposition === "FALSIFIED_PREDICTION"
    && report.predictionAudits[0].falsifyingEvidenceIds.join(",") === observation.evidenceId
    && report.weakPoints.some((item) => item.includes("predictionAudits evidence")),
    "negative execution evidence defeats positive model confidence and identifies its exact falsifier");
  network.wake(coordinator, id, { eventId: "dependency", kind: "DEPENDENCY_CHANGED", reason: "The verified source dependency changed." });
  check(network.guardianReport(id).causalTheoryState === "REQUIRES_REVALIDATION" && network.take(coordinator) === null,
    "dependency invalidation suspends cognition until a fresh assignment instead of calling the theory refuted");
  check(throws(() => network.assertActive(coordinator, lease), "theory_activation_not_owned"), "dependency changes revoke in-flight research ownership");
  network.retire(coordinator, id);
  check(network.inspect(id).state === "RETIRED" && "observations" in network.inspect(id), "retirement preserves failed theory evidence");
}
{
  const { network, coordinator, id, lease } = assigned();
  const multiToolPrediction = { ...prediction, expectedPassingTools: ["TEST", "TYPECHECK", "BUILD"] };
  network.commitPrediction(coordinator, lease, multiToolPrediction);
  network.observe(coordinator, lease, { ...observation, result: "INCONCLUSIVE" });
  network.observe(coordinator, lease, { ...observation, evidenceId: "typecheck-evidence", toolId: "TYPECHECK", result: "FAIL" });
  const report = network.guardianReport(id);
  const audit = report.predictionAudits[0];
  check(report.predictionResults[0].disposition === "FALSIFIED_PREDICTION"
    && audit.unobservedTools.join(",") === "BUILD"
    && audit.falsifyingEvidenceIds.join(",") === "typecheck-evidence"
    && audit.inconclusiveEvidenceIds.join(",") === observation.evidenceId,
    "guardian separates falsified, inconclusive, and still-unobserved checks on one prediction");
  check(validTheoryResearchContext(network.context(coordinator, lease), assignment.objective, assignment.candidateBinding),
    "mixed prediction outcomes retain a valid evidence-bound cognition context");
}
{
  const { network, coordinator, id, lease } = assigned();
  const other = "nyx:theory:1";
  network.assign(coordinator, other, assignment);
  network.relate(coordinator, { relationId: "edge-1", from: id, to: other, kind: "COMPETING",
    justification: "Competing explanations of the same ordering failure.", disposition: "PROPOSED_NOT_PROVEN" });
  network.relate(coordinator, { relationId: "edge-2", from: other, to: id, kind: "RELATED",
    justification: "Return observations for investigation, not copied belief.", disposition: "PROPOSED_NOT_PROVEN" });
  network.commitPrediction(coordinator, lease, prediction);
  network.observe(coordinator, lease, observation);
  check(network.publish(coordinator, lease, observation.evidenceId) === 1
    && network.publish(coordinator, lease, observation.evidenceId) === 0, "relevant evidence is delivered once despite repeated publication");
  const report = network.guardianReport(other);
  check(report.relatedEvidenceNotices.length === 1 && report.predictionResults.length === 0
    && report.confidence.distinctEvidenceRoots === 0, "received claims do not become independently observed evidence");
  const recipient = network.take(coordinator)!;
  check(recipient.theoryId === other, "related evidence can activate a dormant assigned entity without another user prompt");
  check(throws(() => network.publish(coordinator, recipient, observation.evidenceId), "theory_message_evidence_not_observed"),
    "cyclic neighbors cannot autonomously echo unobserved evidence around the graph");
}
{
  const { network, coordinator } = fixture();
  network.reserve(coordinator, "10");
  let rejected = 0;
  for (let index = 0; index < 1_000; index += 1) {
    try { network.inspect(`nyx:theory:0${index}`); } catch { rejected += 1; }
  }
  check(rejected === 1_000, "noncanonical leading-zero addresses cannot alias assigned entities");
  check(throws(() => network.reserve(coordinator, 1 as unknown as string), "theory_reservation_invalid"),
    "unsafe numeric reservation input is rejected rather than coerced");
  check(throws(() => network.assign(coordinator, "nyx:theory:0", { ...assignment, command: "arbitrary shell" } as TheoryAssignment),
    "theory_assignment_invalid"), "assignment rejects undeclared executable or unbounded payload fields");
}
{
  const { network, coordinator, lease } = assigned(fixture({ maxPredictionsPerTheory: 1 }));
  network.commitPrediction(coordinator, lease, prediction);
  check(throws(() => network.commitPrediction(coordinator, lease, { ...prediction, predictionId: "another" }),
    "theory_prediction_budget_exhausted"), "prediction expansion is bounded independently of model willingness");
  check(throws(() => network.observe(coordinator, lease, { ...observation, toolId: "SHELL" }),
    "theory_observation_binding_invalid"), "unsupported tool cannot acquire legitimacy through a research observation");
}
{
  const { network, coordinator } = fixture();
  let invoked = false;
  const empty = await runNextTheoryEngineeringInvestigation(network, coordinator, async () => { invoked = true; throw new Error(); });
  check(empty.state === "IDLE" && !invoked, "idle network does not invoke a model or create background execution");
  const { firstId } = network.reserve(coordinator, "1");
  network.assign(coordinator, firstId, { ...assignment, domain: "MATHEMATICS" });
  network.wake(coordinator, firstId, { eventId: "math", kind: "ASSIGNMENT", reason: "A proof request needs a future adapter." });
  const unsupported = await runNextTheoryEngineeringInvestigation(network, coordinator, async () => { invoked = true; throw new Error(); });
  check(unsupported.state === "BLOCKED" && unsupported.reason === "domain_execution_adapter_not_implemented" && !invoked,
    "software integration cannot pretend to execute a mathematical proof or laboratory experiment");
  check(network.metrics().activePairs === 0 && !unsupported.grantsAuthority, "blocked domain releases activation without promoting authority");
}
console.log(`Omega theory network tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
