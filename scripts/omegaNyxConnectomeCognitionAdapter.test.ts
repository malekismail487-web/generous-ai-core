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
import { NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO } from
  "../src/lib/codelab/connectome/verifiedBiologicalArchitecturePortfolio";
import { selectAdaptiveBiologicalArchitecture, validBiologicalAdaptiveSelection } from
  "../src/lib/codelab/connectome/biologicalAdaptivePolicy";

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

const contrastive = buildNyxConnectomeResearchContext(request(), {
  architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE, contextMode: "CONTRASTIVE",
});
check(validTheoryResearchContext(contrastive.context, request().objective, candidate)
  && contrastive.context.report.weakPoints.some((item) => item.includes("unchanged failure falsifies"))
  && contrastive.context.report.weakPoints.some((item) => item.includes("Competing conjecture")),
"contrastive circuit emits evidence-bound competing and falsifiable repair probes");
check(contrastive.trace.population.traceDigest === profiled.trace.population.traceDigest
  && contrastive.trace.contextDigest !== profiled.trace.contextDigest
  && contrastive.trace.additionalModelCalls === 0 && contrastive.trace.grantsAuthority === false,
"contrastive context changes the interpretation, not the biological circuit, compute calls, or authority");
const evidenceGated = buildNyxConnectomeResearchContext(request(), {
  architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE, contextMode: "EVIDENCE_GATED",
});
check(evidenceGated.trace.rankedHypotheses.length === 2
  && !evidenceGated.trace.rankedHypotheses.some((item) => item.hypothesisId === "revise-falsified-strategy"),
"evidence-gated circuit does not activate a revision hypothesis without a prior falsifier");
check(evidenceGated.trace.circuitState === "SUPPORTED_CANDIDATE"
  && evidenceGated.trace.selectedHypothesis === "repair-observed-cause",
"ordinary observed failures yield a supported repair candidate instead of a phantom conflict");
const identityReplays = Array.from({ length: 48 }, (_, index) => buildNyxConnectomeResearchContext(request({
  cognitionRequestId: `NYX-GATED-IDENTITY-${index}`,
}), { architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE, contextMode: "EVIDENCE_GATED" }));
check(identityReplays.every((item) => item.trace.circuitState === evidenceGated.trace.circuitState
  && item.trace.selectedHypothesis === evidenceGated.trace.selectedHypothesis
  && item.trace.population.traceDigest === evidenceGated.trace.population.traceDigest),
"identical evidence cannot change gated topology or decision merely by renaming the request");
check(new Set(identityReplays.map((item) => item.trace.contextDigest)).size === identityReplays.length,
"stable topology does not collapse distinct request-bound research contexts");
check(evidenceGated.context.report.weakPoints.length < contrastive.context.report.weakPoints.length
  && evidenceGated.trace.additionalModelCalls === 0 && !evidenceGated.trace.grantsAuthority,
"evidence-gated circuit transmits a smaller advisory context without extra calls or authority");
check(throws(() => buildNyxConnectomeResearchContext(request(), {
  contextMode: "UNKNOWN" as "LEGACY",
}), "nyx_connectome_context_mode_invalid"),
"unknown contrastive mode fails closed");

const portfolio = NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO;
const adaptive = selectAdaptiveBiologicalArchitecture({ portfolio, request: request() });
const adaptiveReplay = selectAdaptiveBiologicalArchitecture({ portfolio, request: request() });
check(validBiologicalAdaptiveSelection(adaptive, portfolio)
  && adaptive.selectionDigest === adaptiveReplay.selectionDigest,
"adaptive profile is valid and deterministic for identical admitted evidence");
check(adaptive.sourceSelections.length === 2
  && adaptive.homeostasis.populationBudgetRatio <= portfolio.envelope.maximumPopulationBudgetRatio
  && adaptive.homeostasis.routingRecurrenceProduct <= portfolio.envelope.maximumRoutingRecurrenceProduct,
"source selection preserves both organisms and homeostatic bounds");
const adaptiveContext = buildNyxConnectomeResearchContext(request(), { architecturePortfolio: portfolio });
check(adaptiveContext.trace.architecture.portfolioDigest === portfolio.portfolioDigest
  && adaptiveContext.trace.architecture.adaptiveSelectionDigest === adaptive.selectionDigest
  && adaptiveContext.trace.architecture.cognitiveMode === adaptive.primaryMode,
"bounded live adapter binds its trace to the exact portfolio and selected cognitive mode");
check(adaptiveContext.context.report.weakPoints.some((item) => item.includes("absence is not evidence of zero"))
  && adaptiveContext.context.report.confidence.calibratedProbability === null,
"cognition receives explicit unknown-annotation limits without invented confidence");
check(throws(() => buildNyxConnectomeResearchContext(request(), {
  architectureProfile: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE, architecturePortfolio: portfolio,
}), "nyx_connectome_architecture_configuration_ambiguous"),
"two competing architecture authorities cannot be silently combined");
check(throws(() => buildNyxConnectomeResearchContext(request(), {
  architecturePortfolio: { ...portfolio, grantsAuthority: true as false },
}), "nyx_connectome_architecture_portfolio_invalid"),
"tampered authority-bearing portfolio fails closed");

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
const contrastiveRevision = buildNyxConnectomeResearchContext(request({
  cognitionRequestId: "NYX-CONNECTOME-CONTRASTIVE-REVISION",
  availableEvidence: [{ evidenceRef: "FILE:src/policy.mjs", kind: "FILE", relativePath: "src/policy.mjs",
    description: "Repository-owned calculation policy." }],
  priorHypotheses: [{ hypothesisId: "PRIOR-CONTRASTIVE", parentHypothesisId: null,
    causalHypothesis: "Only the first element should count.", expectedResult: "Visible test passes.",
    strategyDigest: "f".repeat(64), disposition: "FALSIFIED", verificationEvidenceRefs: ["EXECUTION-EVIDENCE-2"] }],
  candidateQualityFeedback: { assessmentId: "QUALITY-CONTRASTIVE", evidenceId: "QUALITY-EVIDENCE-2",
    hypothesisId: "PRIOR-CONTRASTIVE", proposalDigest: "1".repeat(64), applicationId: "APPLICATION-3",
    findings: [{ dimension: "UNNECESSARY_COMPLEXITY", code: "DECLARATION_DELTA", paths: ["src/total.mjs"],
      measurement: { observed: 7, limit: 4 } }], hiddenEvidenceUsed: false, authorityGranted: false },
}), { contextMode: "CONTRASTIVE" });
check(contrastiveRevision.context.report.weakPoints.some((item) => item.includes("measured 7 against limit 4"))
  && contrastiveRevision.context.report.weakPoints.some((item) => item.includes("FILE:src/policy.mjs"))
  && contrastiveRevision.context.report.weakPoints.some((item) => item.includes("materially different prediction")),
"contrastive circuit binds quality, available evidence, and prior falsification without asserting a repair");
const evidenceGatedRevision = buildNyxConnectomeResearchContext(request({
  cognitionRequestId: "NYX-CONNECTOME-GATED-REVISION",
  candidateQualityFeedback: { assessmentId: "QUALITY-GATED", evidenceId: "QUALITY-GATED-EVIDENCE",
    hypothesisId: "PRIOR-GATED", proposalDigest: "1".repeat(64), applicationId: "APPLICATION-GATED",
    findings: [{ dimension: "ARCHITECTURAL_FIT", code: "PUBLIC_POLICY_FAILURE", paths: ["src/total.mjs"] }],
    hiddenEvidenceUsed: false, authorityGranted: false },
}), { contextMode: "EVIDENCE_GATED" });
check(evidenceGatedRevision.trace.rankedHypotheses.length === 3
  && evidenceGatedRevision.context.report.weakPoints.some((item) => item.includes("PUBLIC_POLICY_FAILURE")),
"evidence-gated circuit restores revision competition only after an admitted quality falsifier");
const revisedAdaptive = selectAdaptiveBiologicalArchitecture({ portfolio, request: request({
  cognitionRequestId: "NYX-CONNECTOME-ADAPTIVE-REVISED",
  observation: { ...request().observation, observationId: "OBS-ADAPTIVE-REVISED",
    epistemicState: "CONFLICTED", unknowns: ["cause unknown"],
    contradictions: ["two results disagree"] },
  priorHypotheses: [{ hypothesisId: "PRIOR-ADAPTIVE", parentHypothesisId: null,
    causalHypothesis: "Only the first element counts.", expectedResult: "All items count.",
    strategyDigest: "f".repeat(64), disposition: "FALSIFIED", verificationEvidenceRefs: ["EVIDENCE-1"] }],
}) });
check(validBiologicalAdaptiveSelection(revisedAdaptive, portfolio)
  && revisedAdaptive.selectionDigest !== adaptive.selectionDigest
  && revisedAdaptive.demand.uncertainty > adaptive.demand.uncertainty,
"conflicting, falsified evidence changes the bounded adaptive selection rather than reusing a fixed profile");
let boundedSelections = true;
for (let index = 0; index < 48; index += 1) {
  const seed = request();
  const changed = request({ cognitionRequestId: `NYX-CONNECTOME-BOUNDS-${index}`,
    observation: { ...seed.observation, observationId: `OBS-BOUNDS-${index}`,
      epistemicState: index % 3 === 0 ? "CONFLICTED" : "SUPPORTED",
      unknowns: Array.from({ length: index % 7 }, (_, n) => `unknown-${n}`),
      contradictions: Array.from({ length: index % 5 }, (_, n) => `contradiction-${n}`) },
    availableEvidence: index % 2 === 0 ? [] : [{ evidenceRef: "FILE:src/total.mjs",
      kind: "FILE", relativePath: "src/total.mjs", description: "bounded source" }],
  });
  const selection = selectAdaptiveBiologicalArchitecture({ portfolio, request: changed });
  if (!validBiologicalAdaptiveSelection(selection, portfolio)) boundedSelections = false;
}
check(boundedSelections, "48 deterministic stress scenarios preserve profile integrity and homeostatic bounds");

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
