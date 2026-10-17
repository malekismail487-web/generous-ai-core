/** Two synthetic requests, no benchmark data, tool execution or default change. */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile, writeFile, rename} from "node:fs/promises";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, NVIDIA_NIM_CHAT_COMPLETIONS_URL,
  type NvidiaNimTransport} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {newNvidiaStreamDiagnostics, readNvidiaEventStream, type NvidiaStreamDiagnostics} from "../../src/lib/codelab/model/nvidiaEventStream";
import {liveNvidiaCapacity} from "../../src/lib/codelab/model/nvidiaCapacity";
import {runUltraResearchArm, ultraResearchModel} from "./benchmarks/ultraResearchPair";

export const ULTRA_SERVING_DIAGNOSTIC = Object.freeze({version: "ultra-serving-diagnostic/1",
  model: "nvidia/nemotron-3-ultra-550b-a55b", maxHttpAttempts: 2, maxOutputTokens: 16384,
  maxRequestMs: 120000, maxEpochMs: 330000, reasoningEffort: "high", temperature: 0.2,
  arms: ["MINIMAL_OFFICIAL_REQUEST", "EXISTING_NYX_SESSION"] as const});
const P = ULTRA_SERVING_DIAGNOSTIC;
const question = "A box contains three red counters and four blue counters. How many counters are in the box? Return only the final integer.";
export function minimalUltraServingPayload() {
  return {model: P.model, messages: [{role: "user", content: question}], max_tokens: P.maxOutputTokens,
    temperature: P.temperature, reasoning_effort: "high", stream: true, stream_options: {include_usage: true}};
}

/** One shared debit, including failed dispatches. No redirect may forward a key. */
export function ultraServingTransport(transport: NvidiaNimTransport, shape: (value: object) => void = () => {}) {
  let dispatched = 0;
  return {count: () => dispatched, send: (async (url, init) => {
    if (url !== NVIDIA_NIM_CHAT_COMPLETIONS_URL || init?.method !== "POST" || typeof init.body !== "string" || !init.signal)
      throw Error("serving_diagnostic_endpoint_rejected");
    const payload = JSON.parse(init.body);
    if (payload.model !== P.model || payload.reasoning_effort !== "high" || payload.stream !== true
      || payload.max_tokens !== P.maxOutputTokens || payload.temperature !== P.temperature
      || Buffer.byteLength(init.body) > 64000) throw Error("serving_diagnostic_profile_rejected");
    if (dispatched >= P.maxHttpAttempts) throw Error("serving_diagnostic_attempt_limit");
    dispatched++;
    shape({keys: Object.keys(payload).sort(), requestDigest: createHash("sha256").update(init.body).digest("hex"),
      model: payload.model, maxTokens: payload.max_tokens, reasoningEffort: payload.reasoning_effort,
      hostedResponseFormat: payload.response_format?.type ?? null, stream: true});
    return transport(url, {...init, redirect: "error"});
  }) as NvidiaNimTransport};
}
export interface UltraServingProbe {
  arm: typeof P.arms[number]; state: string; delivered: boolean; syntheticResponseAccepted: boolean | null;
  httpStatus: number | null; providerStatus: number | null; finishReason: string | null;
  httpAttempts: number; reportedTokens: number | null; elapsedMs: number;
  stream: Readonly<NvidiaStreamDiagnostics> | null; cleanupVerified: boolean | null;
}
export function summarizeUltraServing(rows: readonly UltraServingProbe[]) {
  if (rows.length > 2 || new Set(rows.map(r => r.arm)).size !== rows.length
    || rows.some(r => !P.arms.includes(r.arm) || !Number.isSafeInteger(r.httpAttempts) || r.httpAttempts < 0 || r.httpAttempts > 1
      || !Number.isSafeInteger(r.elapsedMs) || r.elapsedMs < 0
      || r.reportedTokens !== null && (!Number.isSafeInteger(r.reportedTokens) || r.reportedTokens < 0)
      || r.providerStatus !== null && (!Number.isSafeInteger(r.providerStatus) || r.providerStatus < 400 || r.providerStatus > 599)
      || r.delivered && (r.httpAttempts !== 1 || r.providerStatus !== null || r.finishReason === null)
      || r.syntheticResponseAccepted === true && (!r.delivered || r.finishReason !== "stop"))
    || rows.reduce((n, r) => n + r.httpAttempts, 0) > 2) throw Error("serving_diagnostic_result_identity");
  const complete = rows.length === 2;
  return {complete, finding: !complete ? "INCOMPLETE_DIAGNOSIS"
    : rows.every(r => r.providerStatus === 503) ? "503_REPRODUCED_OUTSIDE_NYX_AND_IN_NYX"
    : rows.every(r => r.delivered) ? "BOTH_DELIVERED_AT_THIS_TIME_NOT_PROOF_OF_STABILITY"
    : "DIFFERENT_OR_INCONCLUSIVE_OUTCOMES_REQUIRE_TARGETED_INVESTIGATION",
  physicalCalls: rows.reduce((n, r) => n + r.httpAttempts, 0),
  reportedTokens: rows.reduce((n, r) => n + (r.reportedTokens ?? 0), 0),
  unknownUsageCalls: rows.reduce((n, r) => n + (r.reportedTokens === null ? r.httpAttempts : 0), 0),
  benchmarkScore: null, cognitiveGain: false, causalFormatDefectEstablished: false,
  limitations: "TWO_SEQUENTIAL_SYNTHETIC_REQUESTS_WITH_DIFFERENT_PROMPTS_NOT_MATCHED_COGNITIVE_COMPARISON_OR_GLOBAL_OUTAGE_PROOF"};
}

export async function runUltraServingDiagnostic() {
  ultraResearchModel(process.env);
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim() || !process.env.RUNNER_TEMP)
    throw Error("serving_diagnostic_authorized_ci_secret_required");
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
  const candidate = git("rev-parse", "HEAD"), indexed = git("ls-files", "-s");
  if (candidate !== process.env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(candidate) || git("status", "--porcelain"))
    throw Error("serving_diagnostic_clean_candidate_required");
  const sources = ["scripts/omega/nyx-ultra-serving-diagnostic.ts", "scripts/omega/benchmarks/ultraResearchPair.ts",
    "scripts/omega/benchmarks/nyxTextBenchmark.ts", "scripts/omega/benchmarks/r3RepositorySession.ts",
    "src/lib/codelab/cli/nyxChatSession.ts", "src/lib/codelab/cli/nyxChatProtocol.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "src/lib/codelab/model/nvidiaEventStream.ts",
    "src/lib/codelab/model/nvidiaCapacity.ts", "src/lib/codelab/executor/readOnlyExecutor.ts",
    "scripts/omega/nyx-aime26-live-eval.ts", ".github/workflows/omega-ultra-serving-diagnostic.yml"];
  const sourceBindings = Object.fromEntries(await Promise.all(sources.map(async p =>
    [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
  const began = Date.now(), deadline = began + P.maxEpochMs, rows: UltraServingProbe[] = [], wireProfiles: object[] = [];
  let activeArm: string | null = null, stopReason = "IN_PROGRESS", infrastructureCode: string | null = null;
  const budget = ultraServingTransport(fetch, shape => wireProfiles.push({arm: activeArm, ...shape}));
  const snapshot = () => ({schemaVersion: 1, identity: "NYX-ULTRA-TWO-REQUEST-SERVING-DIAGNOSTIC-001",
    candidate, executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID}`, policy: P, sourceBindings,
    rows, wireProfiles, httpDispatches: budget.count(), summary: summarizeUltraServing(rows), activeArm, stopReason,
    infrastructureCode, elapsedMs: Date.now() - began,
    sourceUnchanged: indexed === git("ls-files", "-s") && !git("status", "--porcelain"),
    benchmarkDataLoaded: false, rawContentStored: false, rawReasoningStored: false, credentialsStored: false,
    sourceRepositoryMutation: false, authorityDelta: "NONE", defaultModelChanged: false, endpointChanged: false});
  const checkpoint = async () => {
    const path = join(process.env.RUNNER_TEMP!, `ultra-serving-${candidate}.json`);
    await writeFile(path + ".pending", JSON.stringify(snapshot())); await rename(path + ".pending", path);
  };
  try {
    activeArm = P.arms[0]; await checkpoint();
    const ready = await liveNvidiaCapacity.waitUntilReady(deadline, new AbortController().signal);
    if (ready.state !== "READY") throw Error("serving_diagnostic_capacity_limit");
    const started = Date.now(), controller = new AbortController(), stats = newNvidiaStreamDiagnostics();
    const timer = setTimeout(() => controller.abort(), Math.min(P.maxRequestMs, deadline - started));
    let httpStatus: number | null = null, finishReason: string | null = null, accepted: boolean | null = null, retryAfter: string | null = null;
    let state = "TRANSPORT_FAILURE", delivered = false;
    try {
      const credential = nvidiaNimCredentialFromEnvironment(process.env).read();
      if (!credential || !/^nvapi-[A-Za-z0-9_-]{20,}$/.test(credential)) throw Error("serving_diagnostic_credential_invalid");
      liveNvidiaCapacity.recordDispatch();
      const response = await budget.send(NVIDIA_NIM_CHAT_COMPLETIONS_URL, {method: "POST", signal: controller.signal,
        headers: {Authorization: `Bearer ${credential}`, Accept: "text/event-stream", "Content-Type": "application/json"},
        body: JSON.stringify(minimalUltraServingPayload())});
      httpStatus = response.status;
      retryAfter = response.headers.get("retry-after");
      if (response.ok) {
        const value = await readNvidiaEventStream(response, controller.signal, stats);
        finishReason = value.choices[0].finish_reason; delivered = true;
        accepted = finishReason === "stop" && value.choices[0].message.content.trim() === "7";
        state = finishReason === "length" ? "TRUNCATION" : accepted ? "SYNTHETIC_RESPONSE_ACCEPTED" : "SYNTHETIC_OUTPUT_MISMATCH";
      } else {state = "HTTP_FAILURE"; void response.body?.cancel().catch(() => undefined);}
    } catch {state = controller.signal.aborted ? "TIMEOUT" : stats.providerErrorStatusCode !== null ? "PROVIDER_ERROR" : "TRANSPORT_OR_STREAM_FAILURE";}
    finally {clearTimeout(timer);}
    const status = stats.providerErrorStatusCode ?? (httpStatus !== null && httpStatus >= 400 ? httpStatus : null);
    if (status === 429 || status !== null && status >= 500) liveNvidiaCapacity.defer(retryAfter);
    rows.push({arm: P.arms[0], state, delivered, syntheticResponseAccepted: accepted, httpStatus, providerStatus: status,
      finishReason, httpAttempts: budget.count(), reportedTokens: stats.usageReceived ? stats.reportedUsage.totalTokens : null,
      elapsedMs: Date.now() - started, stream: stats, cleanupVerified: null});
    activeArm = P.arms[1]; await checkpoint();
    const provider = NvidiaNimProvider.create({providerId: "ULTRA-SERVING-DIAGNOSTIC", model: P.model,
      authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
      maxPromptBytes: 64000, maxOutputTokens: P.maxOutputTokens, timeoutMs: P.maxRequestMs,
      responseMode: "BOUNDED_SSE", transport: budget.send}).withHttpAttemptBudget(1);
    const readyNyx = await liveNvidiaCapacity.waitUntilReady(deadline, new AbortController().signal);
    if (readyNyx.state !== "READY" || Date.now() >= deadline) throw Error("serving_diagnostic_capacity_limit");
    let nyxCalls = 0;
    const row = await runUltraResearchArm({family: "DEVELOPMENT_DIAGNOSTIC", taskId: "ULTRA-SERVING-SYNTHETIC", question, answer: "7"},
      "CURRENT_NYX_CLOSED_BOOK", {complete: request => {
        if (++nyxCalls > 1) throw Error("serving_diagnostic_logical_limit");
        return provider.complete({...request, deadlineEpochMs: Math.min(request.deadlineEpochMs!, deadline, Date.now() + P.maxRequestMs)});
      }}, candidate, deadline);
    const evidence = row.modelEvidence[0];
    rows.push({arm: P.arms[1], state: row.state, delivered: evidence?.streamDelivery?.terminal === "DONE",
      syntheticResponseAccepted: row.correct, httpStatus: evidence?.statusCode ?? null,
      providerStatus: evidence?.streamDelivery?.providerErrorStatusCode ?? (evidence?.statusCode && evidence.statusCode >= 400 ? evidence.statusCode : null),
      finishReason: evidence?.finishReason ?? null, httpAttempts: row.usage.httpAttempts,
      reportedTokens: row.usage.unknownUsageCalls ? null : row.usage.reportedTokens, elapsedMs: row.usage.wallClockMs,
      stream: evidence?.streamDelivery ?? null, cleanupVerified: row.cleanup.cleanupVerified});
    activeArm = null; stopReason = "TWO_REQUEST_DIAGNOSIS_COMPLETE";
  } catch {infrastructureCode = "SANITIZED_DIAGNOSTIC_INCOMPLETE"; stopReason = "DIAGNOSIS_INCOMPLETE";}
  if (indexed !== git("ls-files", "-s") || git("status", "--porcelain")) stopReason = "SOURCE_INTEGRITY_FAILURE";
  await checkpoint(); const report = snapshot(); console.log(`NYX_ULTRA_SERVING_DIAGNOSTIC ${JSON.stringify(report)}`);
  if (stopReason !== "TWO_REQUEST_DIAGNOSIS_COMPLETE" || !report.sourceUnchanged) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runUltraServingDiagnostic().catch(() => {console.error("ULTRA_SERVING_DIAGNOSTIC_INPUT_REJECTED_NO_RAW_ERROR_LOGGED"); process.exitCode = 1;});
