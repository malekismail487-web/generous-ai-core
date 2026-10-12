import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash } from "./benchmarks/r3RepositorySession";
import { SOURCE_SITE_REPAIR_EPOCH, sourceSiteRepairTasks, sourceSitePairAssessment, type SourceSiteRepairVariant } from "./benchmarks/sourceSiteRepairFreshTasks";
import type { RepresentationTask } from "./benchmarks/sourceRepresentationTasks";
import { executeSharedGuardedStage, SHARED_GUARDED_LIMITS, sharedGuardedStageBounds } from "./nyx-shared-guarded-repair";
import { inspectNyxSourceEmission } from "./nyx-source-emission-diagnostics";

// Reuse the same executor, limits, parser, model and finite comparison design.
export const SOURCE_SITE_TRANSFER_LIMITS = Object.freeze({ ...SHARED_GUARDED_LIMITS, globalWallClockMs: 1800000,
  modelCallsMaximum: 12, perPairCallsMaximum: 3, predeclaredRepeats: 2,
  changedVariable: SOURCE_SITE_REPAIR_EPOCH.changedVariable });
export interface SourceSiteWireControl {
  model: unknown; outputTokens: unknown; effort: unknown; reasoningBudget: unknown; temperature: unknown;
  policy: unknown; initial: boolean; originalBudgetVersion: unknown; originalBudgetPolicy: unknown;
  qualityPhase: boolean; sites: number; siteVersion: unknown; binding: unknown; siteSchema: boolean;
  hostSelectionSchema: boolean; promptDigest: string; schemaDigest: string;
}
export function sourceSiteWireVerified(variant: SourceSiteRepairVariant, controls: readonly SourceSiteWireControl[]) {
  if (!["SHARED_INITIAL", "WHOLE_SOURCE", "SOURCE_SITES"].includes(variant) || controls.length !== 1) return false;
  const c = controls[0], initial = variant === "SHARED_INITIAL";
  if (c.model !== SOURCE_SITE_TRANSFER_LIMITS.model || c.outputTokens !== 8192 || c.effort !== "high"
    || c.reasoningBudget !== 2048 || c.temperature !== 0 || c.policy !== SOURCE_SITE_REPAIR_EPOCH.admissionPolicyId
    || c.initial !== initial || c.hostSelectionSchema || !/^[a-f0-9]{64}$/.test(c.promptDigest)
    || !/^[a-f0-9]{64}$/.test(c.schemaDigest) || !Number.isSafeInteger(c.sites) || c.sites < 0 || c.sites > 32) return false;
  if (initial ? c.originalBudgetVersion !== "nyx-original-state-quality-budget/2"
    || c.originalBudgetPolicy !== SOURCE_SITE_REPAIR_EPOCH.admissionPolicyId || c.qualityPhase
    : c.originalBudgetVersion !== null || c.originalBudgetPolicy !== null) return false;
  if (!c.sites) return c.siteVersion === null && c.binding === null && !c.siteSchema;
  return variant === "SOURCE_SITES" && c.qualityPhase && c.siteSchema
    && c.siteVersion === "nyx-source-bound-site-emission/1" && typeof c.binding === "string" && /^[a-f0-9]{64}$/.test(c.binding);
}
type StageRow = Awaited<ReturnType<typeof executeSharedGuardedStage>>["row"];
export function sourceSiteStageStable(row: StageRow & { wireVerified: boolean; boundsVerified: boolean }) {
  return !row.infrastructureFailure && row.toolUsageComplete && row.wireVerified && row.boundsVerified
    && row.usage.unknownUsageCalls === 0 && row.usage.providerFailures === 0 && row.usage.retries === 0;
}
export function sourceSiteRepairComputeMatched(a: StageRow, b: StageRow) {
  return ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key => {
    const values = [a, b].map(row => row.usage[key as keyof typeof row.usage] as number
      + (key === "toolWorkUnits" ? row.privateScorerWorkUnits : 0));
    return values.every(Number.isFinite) && Math.max(...values) - Math.min(...values)
      <= SOURCE_SITE_TRANSFER_LIMITS.realizedTolerance * Math.max(1, ...values);
  });
}
export async function runSourceSiteTransfer() {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("source_site_transfer_requires_explicit_endpoint_and_injected_secret");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
    throw Error("source_site_transfer_requires_clean_frozen_candidate");
  const original = theoryDigest(git("ls-files", "-s")), tasks = sourceSiteRepairTasks();
  const paths = ["scripts/omega/nyx-source-site-transfer.ts", "scripts/omega/benchmarks/sourceSiteRepairFreshTasks.ts",
    "scripts/omega/nyx-shared-guarded-repair.ts", "scripts/omega/nyx-source-emission-diagnostics.ts",
    "scripts/omega/benchmarks/r3RepositorySession.ts", "scripts/omega/benchmarks/sourceRepresentationTasks.ts",
    "scripts/omega/benchmarks/conditionalRefactorRepairTasks.ts", "scripts/omega/benchmarks/nyxArcAdapter.ts",
    "scripts/omega/benchmarks/v3NativeReasoningTransferTasks.ts", "scripts/omega/benchmarks/nativeReasoningTransferTasks.ts",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/cognition/nyxSourceSiteEmission.ts",
    "src/lib/codelab/cognition/nyxMeasuredQualityGuidance.ts", "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "src/lib/codelab/engine/r3BoundedRepairLoop.ts",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts", "src/lib/codelab/assurance/candidateEngineeringAdmission.ts",
    "src/lib/codelab/assurance/candidateQualityApplicability.ts"];
  const sourceDigests = Object.fromEntries(await Promise.all(paths.map(async path => [path, contentHash(await readFile(path, "utf8"))])));
  const taskIdentity = tasks.map(task => ({ id: task.id, domain: task.domain,
    inputDigest: theoryDigest({ objective: task.objective, publicCases: task.publicCases, privateInputs: task.privateCases.map(c => c.input) }),
    oracleDigest: theoryDigest(task.privateCases), fixtureDigest: theoryDigest(task) }));
  const frozen = { ...SOURCE_SITE_TRANSFER_LIMITS, epoch: SOURCE_SITE_REPAIR_EPOCH,
    initialSourceOrigin: "COMMON_LIVE_NYX_FIRST_ATTEMPT_NO_AUTHORED_ALGORITHM_SEED", authority: "EXISTING_R3_ISOLATED_ONLY" };
  const freezeDigest = theoryDigest({ candidate, frozen, sourceDigests, taskIdentity });
  console.log(`NYX_SOURCE_SITE_FREEZE ${JSON.stringify({ candidate, frozen, sourceDigests, taskIdentity, freezeDigest })}`);
  const began = Date.now(), deadline = began + frozen.globalWallClockMs;
  const initialResults: any[] = [], results: any[] = [], pairs: any[] = [];
  const run = async (task: RepresentationTask, variant: SourceSiteRepairVariant, remaining: number, replay?: string) => {
    const controls: SourceSiteWireControl[] = [], captures: { content: string | null; finishReason: string | null }[] = [];
    const provider = NvidiaNimProvider.create({ providerId: `NYX-SOURCE-SITES-${variant}`, model: frozen.model,
      authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
      maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 65000, transport: async (url, init) => {
        if (String(url) !== NVIDIA_NIM_CHAT_COMPLETIONS_URL) throw Error("source_site_endpoint_out_of_scope");
        const body = JSON.parse(String(init.body)), prompt = JSON.parse(body.messages[1].content), catalog = prompt.sourceSiteEmission;
        const branches = body.response_format.json_schema.schema.anyOf ?? [];
        controls.push({ model: body.model, outputTokens: body.max_tokens, effort: body.reasoning_effort,
          reasoningBudget: body.reasoning_budget ?? null, temperature: body.temperature,
          policy: prompt.constraints.publicStaticAdmission.policyId, initial: prompt.hypothesisHistory.length === 0,
          originalBudgetVersion: prompt.originalStructuralBudget?.version ?? null, originalBudgetPolicy: prompt.originalStructuralBudget?.staticPolicyId ?? null,
          qualityPhase: prompt.activeRepairDriver.kind === "QUALITY_REJECTION", sites: catalog?.entries.length ?? 0,
          siteVersion: catalog?.version ?? null, binding: catalog?.bindingDigest ?? null,
          siteSchema: branches.some((branch: any) => branch.properties?.decision?.enum?.includes("PROPOSE_SOURCE_SITES")),
          hostSelectionSchema: branches.some((branch: any) => branch.properties?.decision?.enum?.includes("SELECT_LOCAL_REFACTOR")),
          promptDigest: theoryDigest(body.messages), schemaDigest: theoryDigest(body.response_format) });
        const response = await fetch(url, init);
        if (response.ok) try { const data = await response.clone().json(), choice = data.choices?.[0];
          captures.push({ content: typeof choice?.message?.content === "string" ? choice.message.content : null,
            finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null });
        } catch { captures.push({ content: null, finishReason: null }); }
        return response;
      } });
    const stage = await executeSharedGuardedStage(task, candidate, Math.min(deadline, Date.now() + remaining), variant, provider, replay, "SOURCE_SITES_FRESH_1");
    const inspections = await Promise.all(captures.map(capture => {
      const evidence = stage.row.liveEvidence.find(e => capture.content !== null && e.responseDigest === contentHash(capture.content));
      let digest: string | null = null; if (capture.content !== null) try { digest = theoryDigest(JSON.parse(capture.content)); } catch { /* classified below */ }
      return inspectNyxSourceEmission({ ...capture, providerResponseDigest: evidence?.responseDigest ?? null,
        expectedTarget: "src/transform.mjs", representation: "LINES",
        sourceSiteEmission: stage.row.sourceSiteReceipts?.find(e => e.inputDigest === digest) });
    }));
    captures.length = 0;
    return { ...stage, row: { ...stage.row, observedInferenceControls: controls, inspections,
      wireVerified: controls.length ? sourceSiteWireVerified(variant, controls) : stage.row.retainedReplayWithoutLiveRepair,
      boundsVerified: sharedGuardedStageBounds(stage.row) } };
  };
  for (const [index, task] of tasks.entries()) {
    if (Date.now() >= deadline) { initialResults.push({ id: task.id, state: "BLOCKED_GLOBAL_BUDGET" }); continue; }
    const common = await run(task, "SHARED_INITIAL", 155000); initialResults.push(common.row);
    console.log(`NYX_SOURCE_SITE_INITIAL ${JSON.stringify(common.row)}`);
    const rows: any[] = [];
    for (const variant of (index % 2 ? ["SOURCE_SITES", "WHOLE_SOURCE"] : ["WHOLE_SOURCE", "SOURCE_SITES"]) as SourceSiteRepairVariant[]) {
      const remaining = 155000 - common.row.usage.wallClockMs;
      if (!common.returnedSource || remaining < 6000 || Date.now() >= deadline) {
        const row = { id: task.id, variant, accepted: false, state: !common.returnedSource ? "NO_SHARED_VALID_CANDIDATE" : "BLOCKED_BUDGET" };
        rows.push(row); results.push(row); continue;
      }
      const stage = await run(task, variant, remaining, common.returnedSource);
      const row = { ...stage.row, counterfactualChargedCalls: common.row.usage.physicalCalls + stage.row.usage.physicalCalls,
        counterfactualChargedTokens: common.row.usage.reportedTokens + stage.row.usage.reportedTokens,
        counterfactualChargedToolCalls: common.row.usage.toolCalls + stage.row.usage.toolCalls,
        counterfactualChargedWallClockMs: common.row.usage.wallClockMs + stage.row.usage.wallClockMs };
      rows.push(row); results.push(row); console.log(`NYX_SOURCE_SITE_TASK ${JSON.stringify(row)}`);
    }
    const stable = (row: any) => !!row?.usage && sourceSiteStageStable(row)
      && row.usage.wallClockMs <= 155000 && (row.counterfactualChargedWallClockMs ?? 0) <= 155000
      && (row.counterfactualChargedToolCalls ?? 0) <= 5 && (row.counterfactualChargedCalls ?? 0) <= 2;
    const control = rows.find(row => row.variant === "WHOLE_SOURCE"), treatment = rows.find(row => row.variant === "SOURCE_SITES");
    const matched = rows.length === 2 && rows.every(stable) && sourceSiteRepairComputeMatched(control, treatment);
    const pair = { id: task.id, providerStable: stable(common.row) && rows.every(stable),
      ...sourceSitePairAssessment({ sourceDigest: common.returnedSource ? contentHash(common.returnedSource) : null,
        live: common.row.evidenceClass === "E4", stable: stable(common.row) },
        { accepted: control?.accepted === true, perIteration: control?.perIteration ?? [] },
        { accepted: treatment?.accepted === true, perIteration: treatment?.perIteration ?? [], sourceSiteReceipts: treatment?.sourceSiteReceipts ?? [] }, matched),
      initialAccepted: common.row.accepted, initialFunctionalAccepted: common.row.functionalAccepted };
    pairs.push(pair); console.log(`NYX_SOURCE_SITE_PAIR ${JSON.stringify(pair)}`); common.returnedSource = null;
  }
  const executed = [...initialResults, ...results].filter(row => row.usage);
  const usageTotals = Object.fromEntries(["physicalCalls", "logicalCalls", "reportedTokens", "unknownUsageCalls", "providerFailures", "retries", "toolCalls", "toolWorkUnits"]
    .map(key => [key, executed.reduce((sum, row) => sum + row.usage[key], 0)]));
  const report = { schemaVersion: 1, candidate, frozen, sourceDigests, taskIdentity, freezeDigest, initialResults, results, pairs, usageTotals,
    sourceUnchanged: theoryDigest(git("ls-files", "-s")) === original && git("rev-parse", "HEAD") === candidate && !git("status", "--porcelain"),
    elapsedMs: Date.now() - began, stopReason: Date.now() >= deadline ? "GLOBAL_BUDGET" : "PREDECLARED_TASKS_COMPLETE",
    firstAttempt: { selected: tasks.length, attempted: initialResults.filter(row => row.usage?.physicalCalls > 0).length,
      graded: initialResults.filter(row => row.score && row.score.failure !== "ARTIFACT_SCHEMA").length,
      functionalAccepted: initialResults.filter(row => row.functionalAccepted).length, accepted: initialResults.filter(row => row.accepted).length },
    summary: ["WHOLE_SOURCE", "SOURCE_SITES"].map(variant => { const rows = results.filter(row => row.variant === variant); return { variant,
      selected: tasks.length, executed: rows.filter(row => row.usage).length, accepted: rows.filter(row => row.accepted).length,
      liveRepairs: rows.filter(row => row.usage?.physicalCalls > 0).length, repairedAccepted: rows.filter(row => row.repairedAccepted).length,
      retainedCommonSuccesses: rows.filter(row => row.retainedReplayWithoutLiveRepair && row.accepted).length,
      resolvedSites: rows.reduce((sum, row) => sum + (row.sourceSiteReceipts ?? []).filter((e: any) => e.outcome === "RESOLVED").length, 0) }; }),
    promotion: "NONE_REQUIRES_FRESH_REPRODUCIBLE_CONDITIONAL_GAIN_AND_UNSEEDED_TRANSFER", claimScope: SOURCE_SITE_REPAIR_EPOCH.limitations };
  console.log(`NYX_SOURCE_SITE_REPORT ${JSON.stringify(report)}`);
  await writeFile(join(process.env.RUNNER_TEMP ?? tmpdir(), `nyx-source-site-transfer-${candidate}.json`), JSON.stringify(report, null, 2) + "\n");
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) await runSourceSiteTransfer();
