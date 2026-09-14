import {
  FRONTIER_CAUSAL_CONCLUSION_SCHEMA,
  FRONTIER_CAUSAL_PLAN_SCHEMA,
  FRONTIER_GRAPH_SCHEMA,
  FRONTIER_PROTOCOL_SCHEMA,
  NYX_FRONTIER_GAUNTLET,
  causalPlanPrompt,
  executeCausalExperiments,
  frontierDigest,
  frontierProviderSchema,
  frontierRevisionPrompt,
  graphPrompt,
  protocolPrompt,
  referenceCausalConclusion,
  referenceCausalPlan,
  referenceGraphSubmission,
  referenceProtocolSubmission,
  verifyCausalConclusion,
  verifyCausalPlan,
  verifyGraphSubmission,
  verifyProtocolSubmission,
} from "./omega/nyx-frontier-reasoning-fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

function schemaKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(schemaKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [key, ...schemaKeys(nested)]);
}

check(NYX_FRONTIER_GAUNTLET.maxModelCalls === 12 && NYX_FRONTIER_GAUNTLET.maxAttemptsPerStage === 3
  && NYX_FRONTIER_GAUNTLET.maxCumulativeOutputTokens === 24_576,
  "frontier live evaluation is bounded and retry-limited");
check(NYX_FRONTIER_GAUNTLET.authorityGranted === false
  && NYX_FRONTIER_GAUNTLET.scope.includes("NOT_AGI_CERTIFICATION"),
"bounded frontier evaluation grants no authority and cannot masquerade as AGI certification");
check(frontierDigest(graphPrompt()) === frontierDigest(graphPrompt()), "frontier prompts have deterministic identities");
const rejectedCandidate = Object.freeze({ schemaVersion: 1, decision: "ABSTAIN" });
const revision = frontierRevisionPrompt(graphPrompt(), rejectedCandidate, ["GRAPH_EDGE_CONFLICT:Aster:Kepler"]);
check(revision.previousRejectedCandidate === rejectedCandidate
  && (revision.verifierFeedback as string[])[0] === "GRAPH_EDGE_CONFLICT:Aster:Kepler"
  && revision.authorityGranted === false,
"revision prompt preserves the rejected candidate and exact verifier finding without granting authority");
check(!JSON.stringify(graphPrompt()).includes("GRAPH_REFERENCE_COLORS"), "graph prompt does not expose reference-color metadata");
check(!JSON.stringify(protocolPrompt()).includes("PREPARE_A,VOTE_A,VOTE_B,TRANSFER_B,COMMIT"),
  "protocol prompt does not expose the reference counterexample trace");
check(!JSON.stringify(causalPlanPrompt()).includes("CAUSAL_TARGET"), "causal planning prompt does not expose target metadata");

for (const schema of [FRONTIER_GRAPH_SCHEMA, FRONTIER_PROTOCOL_SCHEMA,
  FRONTIER_CAUSAL_PLAN_SCHEMA, FRONTIER_CAUSAL_CONCLUSION_SCHEMA]) {
  const full = new Set(schemaKeys(schema));
  const hosted = frontierProviderSchema(schema);
  const hostedKeys = new Set(schemaKeys(hosted));
  check(["minimum", "maximum", "minLength", "maxLength", "maxItems", "uniqueItems"]
    .filter((key) => full.has(key)).every((key) => !hostedKeys.has(key)),
  "hosted schemas omit only locally enforced unsupported bounds");
  const root = hosted as { required?: unknown; additionalProperties?: unknown };
  check(Array.isArray(root.required) && root.additionalProperties === false,
    "hosted schemas preserve closed required output structures");
}

const graphReference = referenceGraphSubmission();
check(verifyGraphSubmission(graphReference).accepted, "independent graph oracle accepts the reference certificate");
const graphAssignments = (graphReference.coloring as Array<{ vertex: string; color: number }>).map((item) => ({ ...item }));
graphAssignments[1].color = graphAssignments[0].color;
check(!verifyGraphSubmission({ ...graphReference, coloring: graphAssignments }).accepted,
  "graph oracle rejects an edge-conflicting coloring");
check(!verifyGraphSubmission({ ...graphReference, clique: ["Aster", "Elara", "Iris", "Mira"] }).accepted,
  "graph oracle rejects a non-clique lower-bound certificate");
check(!verifyGraphSubmission({ ...graphReference, coloring: graphAssignments.slice(1) }).accepted,
  "graph oracle rejects incomplete vertex coverage");
check(verifyGraphSubmission(graphReference).evidenceDigest.length === 64,
  "graph acceptance produces deterministic digest evidence");

const protocolReference = referenceProtocolSubmission();
check(verifyProtocolSubmission(protocolReference).accepted,
  "protocol oracle accepts a shortest executable violation and safe repaired guard");
check(!verifyProtocolSubmission({ ...protocolReference,
  trace: ["PREPARE_A", "VOTE_A", "VOTE_B", "COMMIT"] }).accepted,
"protocol oracle rejects a trace that reaches a safe commit");
check(!verifyProtocolSubmission({ ...protocolReference,
  trace: [...protocolReference.trace as string[], "RESET"] }).accepted,
"protocol oracle rejects a nonminimal counterexample");
check(!verifyProtocolSubmission({ ...protocolReference, replacementGuardId: "GUARD_LEASE_ONLY" }).accepted,
  "protocol oracle independently falsifies an unsafe replacement guard");
check(verifyProtocolSubmission(protocolReference).evidenceDigest.length === 64,
  "protocol exhaustive verification produces digest evidence");

const causalPlan = referenceCausalPlan();
const causalPlanResult = verifyCausalPlan(causalPlan);
check(causalPlanResult.accepted, "causal oracle accepts a complete minimal separating experiment plan");
check(!verifyCausalPlan({ ...causalPlan, experimentIds: ["PULSE_SHORT"],
  forecasts: (causalPlan.forecasts as unknown[]).filter((item) =>
    (item as { experimentId: string }).experimentId === "PULSE_SHORT") }).accepted,
"causal oracle rejects a non-separating single experiment");
const badForecasts = (causalPlan.forecasts as Array<Record<string, unknown>>).map((item, index) =>
  index === 0 ? { ...item, expectedOutcome: "IMPOSSIBLE" } : item);
check(!verifyCausalPlan({ ...causalPlan, forecasts: badForecasts }).accepted,
  "causal oracle rejects an incorrect precommitted forecast");
const observations = executeCausalExperiments(causalPlan.experimentIds as string[]);
check(observations.length === 2 && observations.every((item) => item.evidenceClass === "E3"
  && item.grantsAuthority === false && item.evidenceRef.startsWith("OBSERVATION:")),
"admitted causal experiments create bounded non-authorizing E3 observations");
const causalConclusion = referenceCausalConclusion(observations);
check(verifyCausalConclusion(causalConclusion, observations).accepted,
  "causal oracle accepts the uniquely supported mechanism and complete eliminations");
check(!verifyCausalConclusion({ ...causalConclusion, mechanismId: "M-01" }, observations).accepted,
  "causal oracle rejects a conclusion contradicted by experiment evidence");
check(!verifyCausalConclusion({ ...causalConclusion,
  evidenceRefs: [observations[0].evidenceRef] }, observations).accepted,
"causal oracle rejects incomplete evidence provenance");
check(!JSON.stringify(observations).includes("NVIDIA_API_KEY"), "experiment observations contain no credential material");

console.log(`OMEGA_FRONTIER_REASONING_GAUNTLET_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
