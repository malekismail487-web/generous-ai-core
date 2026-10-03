import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NyxNemotronEngineeringCognition, type NyxRepairCognitionEvidence } from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash, R3BenchmarkRepositorySession } from "./benchmarks/r3RepositorySession";
import { SOURCE_REPRESENTATION_TASKS, representationRepositoryFiles, scoreRepresentationArtifact } from "./benchmarks/sourceRepresentationTasks";
import { inferUsage, classifyArcLoopFailure } from "./benchmarks/nyxArcAdapter";
import { inspectNyxSourceEmission } from "./nyx-source-emission-diagnostics";
import { ARRAY_BOUND_TRANSFER_TASKS } from "./benchmarks/arrayBoundTransferTasks";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
  throw Error("source_representation_cycle_requires_injected_secret_and_explicit_network");
const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
  throw Error("source_representation_cycle_clean_candidate_required");
const original = theoryDigest(git("ls-files", "-s"));
const model = "nvidia/nemotron-3-ultra-550b-a55b";
const boundsComparison = process.env.NYX_ARRAY_BOUND_COMPARISON === "1";
const selectedTasks = boundsComparison ? ARRAY_BOUND_TRANSFER_TASKS : SOURCE_REPRESENTATION_TASKS;
const frozen = {model, temperature: 0, inferencePolicy: "CONSTRAINED_JSON", maxOutputTokens: 8192,
  providerTimeoutMs: 65000, logicalCallsPerTask: 2, candidateIterationsPerTask: 2, toolCallsPerTask: 3,
  wallClockMsPerTask: 155000, globalWallClockMs: 1350000, maxPatchBytes: 12000,
  maxPromptBytes: 48000, realizedTolerance: 0.1, changedVariable: boundsComparison
    ? "HOSTED_MAX_ITEMS_PRESERVED_VS_OMITTED_ONLY" : "EXISTING_TEXT_VS_LINES_SOURCE_REPRESENTATION_ONLY",
  publicFeedback: "IDENTICAL_PUBLIC_TEST_FAILURE_AND_STATIC_ADMISSION", authority: "EXISTING_R3_ISOLATED_ONLY",
  sourceMutations: false, generalShell: false, generalNetwork: false, production: false,
  hostileCodeSandbox: false, candidateNetworkIsolation: "NOT_PROVEN"};
const sourceDigests = Object.fromEntries(await Promise.all([
  "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts",
  "src/lib/codelab/engine/r3BoundedRepairLoop.ts", "scripts/omega/benchmarks/sourceRepresentationTasks.ts",
  "scripts/omega/benchmarks/arrayBoundTransferTasks.ts"
].map(async path => [path, contentHash(await readFile(path, "utf8"))])));
const began = Date.now(); const globalDeadline = began + frozen.globalWallClockMs;
const tasks = selectedTasks.map(t => ({id: t.id, tier: t.tier, domain: t.domain,
  inputDigest: theoryDigest({objective: t.objective, publicCases: t.publicCases, privateInputs: t.privateCases.map(c => c.input)}),
  oracleDigest: theoryDigest(t.privateCases), fixtureDigest: theoryDigest(t)}));
console.log(`NYX_REPRESENTATION_FREEZE ${JSON.stringify({candidate, frozen, sourceDigests, tasks, freezeDigest: theoryDigest({candidate, frozen, sourceDigests, tasks})})}`);
const results: any[] = [];
for (const [index, task] of selectedTasks.entries()) {
  // Balanced order, not selected by the model or observed outcome.
  const variants = boundsComparison ? ["LEGACY_OMITTED", "CORRECTED_BOUNDED"] : ["LINES", "TEXT"];
  for (const variant of (index % 2 ? variants.slice().reverse() : variants)) {
    const representation = boundsComparison ? "LINES" : variant as "TEXT" | "LINES";
    const preserveProviderArrayBounds = !boundsComparison || variant === "CORRECTED_BOUNDED";
    if (Date.now() >= globalDeadline) {results.push({id: task.id, variant, representation, state: "BLOCKED_GLOBAL_BUDGET"}); continue;}
    const started = Date.now(); const deadline = Math.min(globalDeadline, started + frozen.wallClockMsPerTask);
    const captures: {content: string | null; finishReason: string | null}[] = [];
    const provider = NvidiaNimProvider.create({providerId: `NYX-REPRESENTATION-${representation}`, model,
      authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
      maxPromptBytes: 64000, maxOutputTokens: frozen.maxOutputTokens, timeoutMs: frozen.providerTimeoutMs,
      transport: async (url, init) => {
        if (String(url) !== NVIDIA_NIM_CHAT_COMPLETIONS_URL) throw Error("representation_endpoint_out_of_scope");
        const response = await fetch(url, init);
        if (response.ok) try {
          const body = await response.clone().json(); const choice = body.choices?.[0];
          captures.push({content: typeof choice?.message?.content === "string" ? choice.message.content : null,
            finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null});
        } catch {captures.push({content: null, finishReason: null});}
        return response;
      }});
    const session = await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task), candidate, deadline, frozen.maxPatchBytes);
    let loopResult: Awaited<ReturnType<R3BoundedRepairLoop["run"]>> | null = null;
    let cleanup: Awaited<ReturnType<R3BenchmarkRepositorySession["close"]>> | null = null;
    let infrastructureFailure = false;
    let baselineExecutions = 0;
    try {
      const baseline = await session.baseline();
      baselineExecutions++;
      const cognition = NyxNemotronEngineeringCognition.create({cognitionId: "NYX-SOURCE-REPRESENTATION-EXISTING-COGNITION",
        provider, maxPromptBytes: frozen.maxPromptBytes, maxOutputTokens: frozen.maxOutputTokens, sourceRepresentation: representation,
        intentCompilationMode: "SAFE_CANONICALIZATION", repairFeedbackPolicy: "TRANSIENT_REJECTED_SOURCE_WINDOW",
        experimentVariant: "CURRENT", comparisonInferencePolicy: "CONSTRAINED_JSON", preserveProviderArrayBounds});
      const loop = R3BoundedRepairLoop.create({loopId: `REPRESENTATION-${task.id}-${representation}`, evaluatorVersion: "source-representation-cycle/1",
        observerIdentity: "OMEGA-REPRESENTATION-OBSERVER", cognition,
        candidateBuilder: {builderIdentity: "OMEGA-REPRESENTATION-EXISTING-R3", prepare: h => session.prepare(h)},
        maxIterations: frozen.candidateIterationsPerTask, maxModelInteractions: frozen.logicalCallsPerTask, maxCognitionCorrections: 1,
        maxWallClockMs: Math.max(100, deadline - Date.now() - 5000), maxChangesPerIteration: 1,
        maxPatchBytesPerIteration: frozen.maxPatchBytes, maxDiagnosisCharacters: 1500});
      loopResult = await loop.run({schemaVersion: 1, repairRequestId: `REPRESENTATION-${task.id}`, objective: task.objective,
        initialObservation: baseline.observation, initialFiles: baseline.prepared.files, allowedMutationPaths: ["src/transform.mjs"],
        availableEvidence: [], allowedVerificationToolIds: ["TEST"], baselineExecutions: [{toolId: "TEST", result: baseline.result}],
        observedAtEpochMs: Date.now(), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now() - 5000))});
    } catch {infrastructureFailure = true;} finally {cleanup = await session.close();}
    const evidence = [...(loopResult?.iterations.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.cognitionFailures.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.evidenceAcquisitions.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.lastCognitionEvidence ? [loopResult.lastCognitionEvidence] : [])]
      .filter((e, i, all) => e.modelEvidenceId !== "NOT_INVOKED" && all.findIndex(v => v.evidenceId === e.evidenceId) === i) as NyxRepairCognitionEvidence[];
    const usage = inferUsage(evidence);
    usage.toolCalls = baselineExecutions + (loopResult?.iterations.reduce((n, i) => n + i.verifications.length, 0) ?? 0);
    usage.toolWorkUnits = usage.toolCalls * (task.publicCases.length + task.privateCases.length);
    usage.wallClockMs = Date.now() - started;
    const inspections = [];
    for (const capture of captures) {
      // Correlate captured bytes with the provider's independently recorded response digest.
      // This is in-process diagnostic consistency, not independent transport authentication.
      const recorded = capture.content === null ? null : evidence.find(e => e.modelResponseDigest === contentHash(capture.content));
      inspections.push(await inspectNyxSourceEmission({content: capture.content, finishReason: capture.finishReason,
        providerResponseDigest: recorded?.modelResponseDigest ?? null, expectedTarget: "src/transform.mjs", representation}));
    }
    captures.length = 0; // No raw response/source persistence.
    const last = loopResult?.iterations.at(-1);
    const qualityAccepted = last?.candidateAdmission?.decision === "ADMITTED";
    const publicAccepted = last?.functionallyPassed === true;
    const score = publicAccepted && qualityAccepted && last
      ? scoreRepresentationArtifact(task, last.verifications[0].execution.evidence.stdout) : null;
    const accepted = !!score?.accepted && loopResult?.outcome === "FUNCTIONALLY_REPAIRED_VERIFIED";
    const priorFailure = loopResult?.cognitionFailures.at(-1);
    const lastFailure = priorFailure?.cognitionEvidence.evidenceId === loopResult?.lastCognitionEvidence?.evidenceId ? priorFailure : undefined;
    const failureClass = accepted ? null : infrastructureFailure ? "INFRASTRUCTURE_FAILURE"
      : score?.failure ?? (lastFailure?.reason === "OUTPUT_TRUNCATED" ? "TRUNCATION"
        : lastFailure?.diagnostics.some(d => d.category === "SOURCE_QUALITY_INVALID" && /^syntax_error_/.test(d.observed)) ? "SYNTAX_FAILURE"
          : lastFailure?.diagnostics.some(d => d.category === "SOURCE_QUALITY_INVALID") ? "QUALITY_REJECTION"
            : last?.candidateAdmission?.decision === "REJECTED" ? "QUALITY_REJECTION"
              : last?.functionallyPassed === false ? "FUNCTIONAL_FAILURE"
                : classifyArcLoopFailure(loopResult?.reason ?? "infrastructure_failure"));
    const result = {id: task.id, tier: task.tier, domain: task.domain, variant, preserveProviderArrayBounds,
      representation, accepted, qualityAccepted, publicAccepted, score,
      firstCallAccepted: accepted && usage.logicalCalls === 1 && loopResult?.iterations.length === 1,
      repairedAccepted: accepted && (usage.logicalCalls > 1 || (loopResult?.iterations.length ?? 0) > 1),
      loopOutcome: loopResult?.outcome ?? "INFRASTRUCTURE_FAILURE", loopReason: loopResult?.reason ?? "INTEGRATION_THROW",
      failureClass,
      infrastructureFailure, inspections, usage, candidateIterations: loopResult?.iterations.length ?? 0,
      toolUsageComplete: !infrastructureFailure,
      perIteration: loopResult?.iterations.map(i => ({iteration: i.iteration, publicAccepted: i.functionallyPassed,
        quality: i.candidateAdmission?.decision ?? null,qualityFindings:i.candidateAdmission?.findings??[]})) ?? [],
      failureCodes: loopResult?.cognitionFailures.flatMap(f => f.diagnostics.map(d => ({category: d.category,
        observed: /^[a-zA-Z0-9_]{1,120}$/.test(d.observed) ? d.observed : "REDACTED_NON_CODE", digest: theoryDigest(d)}))) ?? [],
      requestDigests: evidence.flatMap(e => e.modelRequestDigest ? [e.modelRequestDigest] : []),
      responseDigests: evidence.flatMap(e => e.modelResponseDigest ? [e.modelResponseDigest] : []), cleanup,
      privateScorerWorkUnits: score ? task.privateCases.length : 0};
    results.push(result); console.log(`NYX_REPRESENTATION_TASK ${JSON.stringify(result)}`);
  }
}
const pairs = tasks.map(task => {
  const rows = results.filter(r => r.id === task.id); const stable = rows.length === 2 && rows.every(r => r.usage && !r.infrastructureFailure
    && r.toolUsageComplete
    && r.usage.unknownUsageCalls === 0 && r.usage.providerFailures === 0 && r.usage.retries === 0);
  const matched = stable && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key => {
    const values = rows.map(r => r.usage[key] + (key === "toolWorkUnits" ? r.privateScorerWorkUnits : 0));
    return Math.max(...values) - Math.min(...values) <= Math.max(1, ...values) * frozen.realizedTolerance;
  });
  return {id: task.id, tier: task.tier, providerStable: stable, matchedRealizedCompute: matched,
    outcomes: rows.map(r => ({variant: r.variant, accepted: r.accepted, failureClass: r.failureClass}))};
});
const sourceUnchanged = original === theoryDigest(git("ls-files", "-s")) && !git("status", "--porcelain");
const report = {schemaVersion: 1, candidate, frozen, sourceDigests, tasks, results, pairs, sourceUnchanged,
  hypothesis: boundsComparison
    ? "Preserving explicit hosted array bounds removes the reproduced 32-line source ceiling and improves fresh transfer without changing local acceptance."
    : "Using existing TEXT rather than LINES reduces interface/source failures across fresh engineering tasks without weakening acceptance or increasing realized compute.",
  falsification: "No reproducible syntax/correctness improvement across development and fresh transfer at matched realized compute.",
  summaries: (boundsComparison ? ["LEGACY_OMITTED", "CORRECTED_BOUNDED"] : ["LINES", "TEXT"]).map(variant => {
    const rows = results.filter(r => r.variant === variant);
    return {variant, accepted: rows.filter(r => r.accepted).length, firstCallAccepted: rows.filter(r => r.firstCallAccepted).length,
      repairedAccepted: rows.filter(r => r.repairedAccepted).length, reportedTokens: rows.reduce((n, r) => n + (r.usage?.reportedTokens ?? 0), 0),
      unknownUsageCalls: rows.reduce((n, r) => n + (r.usage?.unknownUsageCalls ?? 0), 0)};}),
  evidence: "E4_LIVE_MODEL_AND_E3_LOCAL_OMEGA_AND_PRIVATE_EXACT_SCORER",
  authorship: "SAME_SESSION_NOT_INDEPENDENTLY_AUTHORED", benchmarkTasksUsed: false,
  staticAdmissionAndParserUnchanged: true, rawSourcePersisted: false, grantsAuthority: false, broadPromotion: false};
await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-source-representation-${candidate}.json`), JSON.stringify(report, null, 2));
console.log(`NYX_REPRESENTATION_CYCLE ${JSON.stringify(report)}`);
if (!sourceUnchanged || results.some(r => r.cleanup && (!r.cleanup.sourceUnchanged || !r.cleanup.cleanupVerified))) process.exitCode = 1;
