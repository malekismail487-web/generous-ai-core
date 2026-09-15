import { ReasoningObligationGraph, type ObligationEvaluation,
  type ReasoningObligationDefinition } from "../src/lib/codelab/research/reasoningObligationGraph";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function rejects(action: () => unknown, pattern: RegExp, label: string): void {
  try { action(); check(false, label); }
  catch (error) { check(pattern.test(String(error)), label); }
}

let now = 1_000;
const candidate = "candidate:omega-obligation-test";
const dependency = "SOURCE:reasoning-kernel";

function definition(input: Partial<ReasoningObligationDefinition> & Pick<ReasoningObligationDefinition, "obligationId">): ReasoningObligationDefinition {
  return Object.freeze({ obligationId: input.obligationId, kind: input.kind ?? "REQUIREMENT",
    priority: input.priority ?? "REQUIRED", statement: input.statement ?? `Establish ${input.obligationId}.`,
    acceptanceCriterion: input.acceptanceCriterion ?? `Independent evidence satisfies ${input.obligationId}.`,
    falsificationCriterion: input.falsificationCriterion ?? `A counterexample falsifies ${input.obligationId}.`,
    dependsOn: Object.freeze([...(input.dependsOn ?? [])]), conflictsWith: Object.freeze([...(input.conflictsWith ?? [])]),
    ownerRoles: Object.freeze([...(input.ownerRoles ?? ["NYX"])]),
    minimumEvidenceClass: input.minimumEvidenceClass ?? "E3",
    minimumIndependentRoots: input.minimumIndependentRoots ?? 1,
    freshnessDependencies: Object.freeze([...(input.freshnessDependencies ?? [dependency])]), grantsAuthority: false });
}

const obligations = Object.freeze([
  definition({ obligationId: "O-REQUIREMENT", priority: "CRITICAL", minimumIndependentRoots: 2 }),
  definition({ obligationId: "O-COUNTEREXAMPLE", kind: "COUNTEREXAMPLE", dependsOn: ["O-REQUIREMENT"] }),
  definition({ obligationId: "O-PROVENANCE", kind: "PROVENANCE", dependsOn: ["O-COUNTEREXAMPLE"] }),
  definition({ obligationId: "O-OPTIONAL", kind: "EXPERIMENT", priority: "SUPPORTING" }),
]);

function runtime(definitions: readonly ReasoningObligationDefinition[] = obligations) {
  const coordinator = {};
  const graph = ReasoningObligationGraph.create({ graphId: "OMEGA-OBLIGATION-TEST", objective: "Prove a bounded candidate.",
    objectiveBinding: candidate, obligations: definitions, maxAttempts: 20,
    maxEvaluations: Math.max(200, definitions.length * 2),
    maxConcurrentAttempts: 2, attemptLifetimeMs: 10_000, now: () => now }, coordinator);
  return { coordinator, graph };
}

function evaluation(input: Partial<ObligationEvaluation> & Pick<ObligationEvaluation, "evaluationId" | "obligationId">): ObligationEvaluation {
  const disposition = input.disposition ?? "SATISFIES";
  const root = input.provenanceRoot ?? `ORACLE-${input.evaluationId}`;
  const summary = input.summary ?? `${disposition} ${input.obligationId}`;
  return Object.freeze({ evaluationId: input.evaluationId, obligationId: input.obligationId,
    subjectBinding: input.subjectBinding ?? "subject:candidate-1", disposition,
    evidenceClass: input.evidenceClass ?? "E3", evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [`FINDING:${input.evaluationId}`])]),
    provenanceRoot: root, summary, contentDigest: input.contentDigest ?? theoryDigest({ disposition, root, summary }),
    freshnessDependencies: Object.freeze([...(input.freshnessDependencies ?? [dependency])]),
    observedAtEpochMs: input.observedAtEpochMs ?? now, evaluatorIdentity: input.evaluatorIdentity ?? root,
    grantsAuthority: false });
}

{
  const { graph } = runtime();
  const initial = graph.workPacket();
  check(initial.acceptanceState === "INCOMPLETE" && initial.subjectBinding === null,
    "blank graph is incomplete rather than accepted");
  check(initial.nextEligibleObligationIds.join(",") === "O-REQUIREMENT,O-OPTIONAL",
    "only dependency-ready obligations are initially eligible in priority order");
  check(initial.unresolved.length === 4 && initial.grantsAuthority === false,
    "work packet exposes every unresolved obligation without granting authority");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-E1", subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "EVAL-E1", obligationId: "O-REQUIREMENT",
    evidenceClass: "E1" }));
  graph.finishAttempt(coordinator, lease);
  const root = graph.assessment("O-REQUIREMENT");
  check(root.state === "INCONCLUSIVE" && root.findings.includes("EVIDENCE_CLASS_INSUFFICIENT"),
    "model claim cannot satisfy an E3 obligation");
  check(graph.assessment("O-COUNTEREXAMPLE").state === "BLOCKED",
    "dependent obligation stays blocked behind insufficient evidence");
  check(graph.workPacket().acceptanceState === "INCOMPLETE", "correlated model confidence cannot create acceptance");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-E1-FALSIFIER",
    subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "EVAL-E1-FALSIFIER",
    obligationId: "O-REQUIREMENT", evidenceClass: "E1", disposition: "FALSIFIES" }));
  graph.finishAttempt(coordinator, lease);
  check(graph.assessment("O-REQUIREMENT").state === "INCONCLUSIVE"
    && graph.assessment("O-REQUIREMENT").findings.includes("FALSIFICATION_EVIDENCE_CLASS_INSUFFICIENT"),
  "model-generated counterexample claim cannot refute an E3 obligation without external evidence");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-COMPLETE", subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "ROOT-A", obligationId: "O-REQUIREMENT",
    provenanceRoot: "ORACLE-A" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "ROOT-B", obligationId: "O-REQUIREMENT",
    provenanceRoot: "ORACLE-B" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "COUNTEREXAMPLE", obligationId: "O-COUNTEREXAMPLE" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "PROVENANCE", obligationId: "O-PROVENANCE" }));
  const completion = graph.finishAttempt(coordinator, lease);
  check(completion.length === 64, "completed attempt receives deterministic integrity digest");
  check(graph.assessment("O-REQUIREMENT").distinctQualifyingRoots === 2,
    "independent evidence roots are counted rather than raw votes");
  check(graph.workPacket().acceptanceState === "ACCEPTABLE",
    "all critical and required obligations can accept while supporting work remains open");
  check(graph.workPacket().satisfiedToPreserve.length === 3,
    "accepted obligations become explicit preservation constraints for later revision");
  check(graph.snapshot().metrics.authorityGranted === false && graph.snapshot().integrityDigest.length === 64,
    "snapshot is integrity-addressed and authority-neutral");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-FALSIFIED", subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "SUPPORT-A", obligationId: "O-REQUIREMENT",
    provenanceRoot: "ORACLE-A" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "SUPPORT-B", obligationId: "O-REQUIREMENT",
    provenanceRoot: "ORACLE-B" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "FALSIFIER", obligationId: "O-REQUIREMENT",
    disposition: "FALSIFIES", provenanceRoot: "ADVERSARIAL-ORACLE" }));
  graph.finishAttempt(coordinator, lease);
  check(graph.assessment("O-REQUIREMENT").state === "FALSIFIED",
    "one critical falsification outranks multiple positive evaluations");
  check(graph.workPacket().acceptanceState === "REJECTED" && graph.workPacket().falsified.length === 1,
    "falsified critical obligation rejects the candidate and remains visible");
}

{
  const conflicting = Object.freeze([
    definition({ obligationId: "O-A", conflictsWith: ["O-B"] }),
    definition({ obligationId: "O-B", conflictsWith: ["O-A"] }),
  ]);
  const { graph, coordinator } = runtime(conflicting);
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-CONFLICT", subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "A", obligationId: "O-A" }));
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "B", obligationId: "O-B" }));
  graph.finishAttempt(coordinator, lease);
  check(graph.workPacket().acceptanceState === "REJECTED", "mutually exclusive supported claims cannot silently merge");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-STALE", subjectBinding: "subject:candidate-1", ownerRole: "NYX" });
  for (const item of [
    evaluation({ evaluationId: "STALE-ROOT-A", obligationId: "O-REQUIREMENT", provenanceRoot: "ORACLE-A" }),
    evaluation({ evaluationId: "STALE-ROOT-B", obligationId: "O-REQUIREMENT", provenanceRoot: "ORACLE-B" }),
  ]) graph.recordEvaluation(coordinator, lease, item);
  graph.finishAttempt(coordinator, lease);
  const invalidated = graph.invalidateDependency(coordinator, dependency);
  check(invalidated.length === 2 && graph.assessment("O-REQUIREMENT").state === "STALE",
    "dependency change stales supporting evidence without refuting the claim");
  check(graph.workPacket().acceptanceState === "STALE", "stale required evidence prevents acceptance");
  now += 1;
  const fresh = graph.beginAttempt(coordinator, { attemptId: "ATTEMPT-FRESH", subjectBinding: "subject:candidate-2", ownerRole: "NYX" });
  graph.recordEvaluation(coordinator, fresh, evaluation({ evaluationId: "FRESH-ROOT-A", obligationId: "O-REQUIREMENT",
    subjectBinding: "subject:candidate-2", provenanceRoot: "ORACLE-A", observedAtEpochMs: now }));
  graph.recordEvaluation(coordinator, fresh, evaluation({ evaluationId: "FRESH-ROOT-B", obligationId: "O-REQUIREMENT",
    subjectBinding: "subject:candidate-2", provenanceRoot: "ORACLE-B", observedAtEpochMs: now }));
  graph.finishAttempt(coordinator, fresh);
  check(graph.assessment("O-REQUIREMENT").state === "SATISFIED",
    "fresh evidence for a new subject can revalidate an invalidated obligation");
}

{
  const cycle = Object.freeze([
    definition({ obligationId: "O-A", dependsOn: ["O-B"] }),
    definition({ obligationId: "O-B", dependsOn: ["O-A"] }),
  ]);
  rejects(() => runtime(cycle), /dependency_cycle/, "dependency cycles fail closed");
  rejects(() => runtime(Object.freeze([
    definition({ obligationId: "O-A", conflictsWith: ["O-B"] }),
    definition({ obligationId: "O-B" }),
  ])), /conflict_not_symmetric/, "asymmetric conflicts fail closed");
  const { graph, coordinator } = runtime();
  const forgedCoordinator = {};
  rejects(() => graph.beginAttempt(forgedCoordinator, { attemptId: "FORGED", subjectBinding: "subject:x", ownerRole: "NYX" }),
    /ownership_required/, "unowned coordinator cannot create an attempt");
  const lease = graph.beginAttempt(coordinator, { attemptId: "OWNED", subjectBinding: "subject:x", ownerRole: "NYX" });
  const forgedLease = Object.freeze({ ...lease });
  rejects(() => graph.finishAttempt(coordinator, forgedLease), /not_active_or_owned/,
    "structurally identical forged lease has no operational ownership");
  rejects(() => graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "WRONG-SUBJECT",
    obligationId: "O-REQUIREMENT", subjectBinding: "subject:y" })), /not_admitted/,
  "evidence for a different subject cannot enter the attempt");
  graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "DUPLICATE-ROOT-A", obligationId: "O-REQUIREMENT",
    subjectBinding: "subject:x", provenanceRoot: "SAME-ORACLE" }));
  rejects(() => graph.recordEvaluation(coordinator, lease, evaluation({ evaluationId: "DUPLICATE-ROOT-B",
    obligationId: "O-REQUIREMENT", subjectBinding: "subject:x", provenanceRoot: "SAME-ORACLE" })),
  /correlated_duplicate/, "duplicate correlated evaluation cannot inflate independence");
  graph.abortAttempt(coordinator, lease);
  rejects(() => graph.finishAttempt(coordinator, lease), /not_active_or_owned/,
    "aborted attempt cannot later be committed");
}

{
  const { graph, coordinator } = runtime();
  const lease = graph.beginAttempt(coordinator, { attemptId: "EXPIRING", subjectBinding: "subject:x", ownerRole: "NYX" });
  now = lease.expiresAtEpochMs;
  rejects(() => graph.finishAttempt(coordinator, lease), /expired/, "expired reasoning attempt fails closed");
}

{
  now += 1;
  const many = Object.freeze(Array.from({ length: 1_024 }, (_, index) => definition({
    obligationId: `O-SCALE-${index.toString().padStart(4, "0")}`,
    priority: index < 10 ? "CRITICAL" : "SUPPORTING",
  })));
  const started = performance.now();
  const { graph } = runtime(many);
  const packet = graph.workPacket();
  check(packet.unresolved.length === 1_024 && packet.nextEligibleObligationIds.length === 1_024,
    "graph preserves the maximum bounded obligation population without pretending it is active cognition");
  check(performance.now() - started < 5_000, "bounded thousand-obligation work packet remains operationally tractable");
}

console.log(`OMEGA_REASONING_OBLIGATION_GRAPH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
