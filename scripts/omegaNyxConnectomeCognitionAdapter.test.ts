import {
  buildNyxConnectomeResearchContext,
  createNyxConnectomeCognitionAdapter,
} from "../src/lib/codelab/connectome/nyxConnectomeCognitionAdapter";
import type {
  NyxNemotronEngineeringCognition,
  NyxRepairCognitionRequest,
  NyxRepairCognitionResult,
} from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { validTheoryResearchContext } from "../src/lib/codelab/research/theoryContracts";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
function throws(action: () => unknown, message: string): boolean {
  try { action(); return false; }
  catch (error) { return error instanceof Error && error.message === message; }
}

const candidate = "a".repeat(40);
function request(overrides: Partial<NyxRepairCognitionRequest> = {}): NyxRepairCognitionRequest {
  return {
    schemaVersion: 1,
    cognitionRequestId: "NYX-CONNECTOME-TEST-REQUEST-1",
    objective: "Repair calculateTotal so it sums every admitted item without mutating the input.",
    observation: {
      schemaVersion: 1, observationId: "OBS-CONNECTOME-1", evidenceClass: "E3", state: "TEST_FAIL",
      baselineComparison: "PREEXISTING_FAILURE", candidateAttribution: "PREEXISTING_NOT_CANDIDATE_ATTRIBUTABLE",
      attributionConfidence: 1, epistemicState: "SUPPORTED", candidateCommit: candidate,
      disposableRepositoryId: "DISPOSABLE-1", applicationId: "APPLICATION-1", proposalDigest: "b".repeat(64),
      toolId: "TEST", toolKind: "TEST", toolIdentityDigest: "c".repeat(64), environmentIdentity: "TEST-ENV",
      diagnostics: [{ category: "TEST", channel: "STDERR", file: "src/total.mjs", line: 2, column: 1,
        code: "ASSERTION", testName: "sums all items", message: "Expected 6 but received 3." }],
      candidateFailureSignature: "d".repeat(64), baselineFailureSignature: "d".repeat(64),
      candidateEvidenceId: "EXECUTION-EVIDENCE-1", baselineEvidenceId: "BASELINE-EVIDENCE-1",
      unknowns: [], contradictions: [], observedAtEpochMs: 1_000, grantsAuthority: false,
    },
    files: [{ relativePath: "src/total.mjs", content: "export const calculateTotal = xs => xs[0];\n",
      contentSha256: "e".repeat(64) }],
    allowedMutationPaths: ["src/total.mjs"], availableEvidence: [], priorHypotheses: [],
    priorCognitionFailures: [], candidateQualityFeedback: null,
    sourceQualityConstraints: { maxLineLength: 120, requireParseableSource: true, preservePublicExports: true,
      forbidNewUnsafeRuntimeAccess: true, forbidTypeSafetySuppression: true, requireReadableFormatting: true },
    allowedVerificationToolIds: ["TEST"], maxChanges: 1, maxPatchBytes: 4_096,
    maxDiagnosisCharacters: 1_500, maxCounterexamples: 3, observedAtEpochMs: 1_000,
    ...overrides,
  };
}

const initial = buildNyxConnectomeResearchContext(request());
check(validTheoryResearchContext(initial.context, initial.context.assignment.objective, candidate),
  "adapter produces a contract-valid authority-neutral research context");
check(initial.context.grantsAuthority === false && initial.context.report.grantsAuthority === false,
  "connectome context and guardian report grant no authority");
check(initial.trace.additionalModelCalls === 0 && initial.trace.grantsAuthority === false,
  "trace records zero additional model calls and no authority");
check(initial.trace.population.materializedNeurons > 0 && initial.trace.population.materializedSynapses > 0,
  "epistemic review executes a real materialized microcircuit");
check(initial.trace.rankedHypotheses.length === 3
  && new Set(initial.trace.rankedHypotheses.map((item) => item.hypothesisId)).size === 3,
"trace retains all competing hypotheses rather than collapsing to one unexamined answer");
check(initial.trace.independentEvidenceRoots >= 3 && initial.trace.independentEvidenceCorrelationGroups >= 3,
  "objective, repository snapshot, and execution observation retain distinct provenance groups");
check(initial.context.report.confidence.calibratedProbability === null
  && initial.context.report.confidence.calibrationState === "NOT_CALIBRATED",
"neural activation is not mislabeled as calibrated confidence");
check(initial.trace.architecture.profileDigest === null
  && initial.trace.architecture.routingFanoutMultiplier === 1
  && initial.trace.architecture.recurrenceCycles === 24,
"default adapter retains the pre-biological architecture exactly");

const profiled = buildNyxConnectomeResearchContext(request(), {
  architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE,
});
check(profiled.trace.architecture.profileDigest === NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileDigest
  && profiled.trace.architecture.sourcePriorDigest === NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.sourcePriorDigest,
"profiled circuit trace binds the exact verified biological profile and source prior");
check(profiled.trace.architecture.recurrenceCycles === 28
  && profiled.trace.architecture.routingFanoutMultiplier < 1,
"biological recurrent-core and sparse-routing motifs alter bounded local circuit structure");
check(profiled.trace.population.materializedNeurons !== initial.trace.population.materializedNeurons
  && profiled.trace.population.materializedSynapses !== initial.trace.population.materializedSynapses
  && profiled.trace.contextDigest !== initial.trace.contextDigest,
"biological profile produces an attributable structural treatment distinct from the control");
const profiledReplay = buildNyxConnectomeResearchContext(request(), {
  architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE,
});
check(profiledReplay.trace.contextDigest === profiled.trace.contextDigest
  && profiledReplay.trace.population.traceDigest === profiled.trace.population.traceDigest,
"biological-profile circuit execution is deterministic for an identical evidence-bound request");
check(throws(() => buildNyxConnectomeResearchContext(request(), {
  architectureProfile: { ...NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE,
    evidenceCopiesMultiplier: 1.5 },
}), "nyx_connectome_architecture_profile_invalid"),
"tampered biological profiles fail closed before influencing cognition");
check(profiled.trace.additionalModelCalls === 0 && profiled.trace.grantsAuthority === false,
  "biological topology adds neither model calls nor authority");

const revised = buildNyxConnectomeResearchContext(request({
  cognitionRequestId: "NYX-CONNECTOME-TEST-REQUEST-2",
  availableEvidence: [{ evidenceRef: "FILE:src/policy.mjs", kind: "FILE", relativePath: "src/policy.mjs",
    description: "Repository-owned calculation policy." }],
  priorHypotheses: [{ hypothesisId: "PRIOR-1", parentHypothesisId: null,
    causalHypothesis: "Only the first element should count.", expectedResult: "Visible test passes.",
    strategyDigest: "f".repeat(64), disposition: "FALSIFIED", verificationEvidenceRefs: ["EXECUTION-EVIDENCE-2"] }],
  candidateQualityFeedback: { assessmentId: "QUALITY-1", evidenceId: "QUALITY-EVIDENCE-1",
    hypothesisId: "PRIOR-1", proposalDigest: "1".repeat(64), applicationId: "APPLICATION-2",
    findings: [{ dimension: "MAINTAINABILITY", code: "DUPLICATED_POLICY", paths: ["src/total.mjs"] }],
    hiddenEvidenceUsed: false, authorityGranted: false },
}));
check(revised.context.report.causalTheoryState === "REQUIRES_REVALIDATION",
  "falsification and public quality evidence force revalidation");
check(revised.context.report.weakPoints.some((item) => item.includes("do not repeat"))
  && revised.context.report.weakPoints.some((item) => item.includes("DUPLICATED_POLICY")),
"guardian feedback exposes prior-strategy and quality falsifiers to cognition");
check(revised.context.report.requests.length === 1
  && revised.context.report.requests[0].question.includes("FILE:src/policy.mjs"),
"available discriminating evidence is represented as a focused request, not assumed truth");
check(revised.trace.contextDigest !== initial.trace.contextDigest,
  "materially different evidence produces a different bound context identity");

let delegatedCalls = 0;
let delegatedContextValid = false;
const fakeBase = {
  async proposeRepair(input: NyxRepairCognitionRequest): Promise<NyxRepairCognitionResult> {
    delegatedCalls += 1;
    delegatedContextValid = Boolean(input.theoryResearchContext
      && validTheoryResearchContext(input.theoryResearchContext, input.objective, input.observation.candidateCommit));
    return { decision: "NO_ACTION", reason: "test_double", hypothesis: null, evidenceRequest: null,
      evidence: {} as NyxRepairCognitionResult["evidence"], schemaDiagnostics: [], omegaAuthorityGranted: false };
  },
} as unknown as NyxNemotronEngineeringCognition;
const adapter = createNyxConnectomeCognitionAdapter(fakeBase);
await adapter.cognition.proposeRepair(request({ cognitionRequestId: "NYX-CONNECTOME-DELEGATION" }));
check(delegatedCalls === 1 && delegatedContextValid,
  "one connectome-augmented request delegates to exactly one established cognition call");
check(adapter.traces().length === 1 && adapter.traces()[0].cognitionRequestId === "NYX-CONNECTOME-DELEGATION",
  "adapter exposes one attributable trace for the delegated cognition call");
check(throws(() => buildNyxConnectomeResearchContext(request({ theoryResearchContext: initial.context })),
  "nyx_connectome_context_conflicts_with_existing_research_context"),
"adapter fails closed instead of silently replacing an existing research context");

console.log(`OMEGA_NYX_CONNECTOME_COGNITION_ADAPTER_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
