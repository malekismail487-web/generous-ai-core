import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { NyxChatSession, type NyxComputerAction, type NyxComputerHost } from "../../src/lib/codelab/cli/nyxChatSession";
import { NyxScopedComputerHost } from "../../src/lib/codelab/cli/nyxScopedComputerHost";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

if (process.platform !== "win32" || process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1"
  || !process.env.NVIDIA_API_KEY?.trim()) throw new Error("Windows and injected live-model authorization required");

const winapp = execFileSync("where.exe", ["winapp.exe"], { encoding: "utf8", timeout: 5_000 })
  .split(/\r?\n/).find((path) => path.toLowerCase().endsWith("winapp.exe"));
if (!winapp) throw new Error("WinApp CLI executable unavailable");
const fixture = spawn("powershell.exe", ["-NoProfile", "-STA", "-File",
  resolve("scripts/omega/nyx-desktop-ui-fixture.ps1")], { cwd: resolve("."), windowsHide: true,
  stdio: "ignore", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    WINAPP_CLI_TELEMETRY_OPTOUT: "1" } });
if (!fixture.pid) throw new Error("Disposable UI fixture failed to start");

const pid = fixture.pid;
const now = Date.now();
const reader = await ReadOnlyRepositoryExecutor.create({ executorId: "NYX-DESKTOP-MODEL-R1",
  tokenId: "NYX-DESKTOP-MODEL-TOKEN", repositoryRoot: resolve("."), resourceScopes: ["scripts/omega"],
  issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + 360_000,
  constraints: { maxFileBytes: 32_000, maxDirectoryEntries: 100, allowedExtensions: [".ps1"] },
  issuer: "NYX-DESKTOP-MODEL-EVAL", auditIdentity: "NYX-DESKTOP-MODEL-AUDIT" });
const actions: NyxComputerAction["kind"][] = [];
try {
  let initialReady = false;
  const host = NyxScopedComputerHost.create({ reader, allowedCheckPaths: [], desktopPid: pid,
    winappPath: winapp.trim(), approveDesktopAction: async (request) => initialReady && request.pid === pid
      && ((request.kind === "DESKTOP_SET_VALUE" && request.selector === "NyxInput"
          && request.value === "NYX fixture input")
        || (request.kind === "DESKTOP_INVOKE" && request.selector === "NyxRun")) });
  let initial = await host.execute({ kind: "DESKTOP_INSPECT" }, "model-eval-preflight");
  for (let attempt = 0; attempt < 8 && initial.decision !== "OBSERVED"; attempt += 1) {
    await delay(1_000);
    initial = await host.execute({ kind: "DESKTOP_INSPECT" }, `model-eval-preflight-${attempt}`);
  }
  assert.equal(initial.decision, "OBSERVED", "Windows runner has no inspectable fixture UI");
  assert.equal(initial.observation?.title, "NYX Disposable UI Fixture");
  initialReady = true;
  const computer: NyxComputerHost = { terminalCheckAvailable: false, desktopAvailable: true,
    execute: async (action, requestId) => { actions.push(action.kind); return host.execute(action, requestId); } };
  const provider = NvidiaNimProvider.create({ providerId: "NYX-DESKTOP-LIVE-EVAL",
    model: "nvidia/nemotron-3-ultra-550b-a55b", authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64_000,
    maxOutputTokens: 4_096, timeoutMs: 90_000 });
  const session = NyxChatSession.create({ sessionId: "NYX-DESKTOP-LIVE-EVAL", model: provider,
    reader, computerHost: computer, candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 7,
    maxCandidatesPerTurn: 0, maxTurnMs: 300_000, maxOutputTokens: 1_024 });
  const turn = await session.turn("Use only the selected disposable desktop fixture. Inspect it, set NyxInput to exactly 'NYX fixture input', inspect again, invoke NyxRun, inspect the changed status, then explain the observed result. Use only typed desktop actions and fresh observation digests. Do not claim success without observed evidence.");
  const final = await host.execute({ kind: "DESKTOP_INSPECT" }, "model-eval-independent-final");
  const elements = (final.observation?.elements ?? []) as readonly { selector: string; name: string }[];
  const status = elements.find((item) => item.selector === "NyxStatus")?.name ?? null;
  const modelSelectedSet = actions.includes("DESKTOP_SET_VALUE");
  const modelSelectedInvoke = actions.includes("DESKTOP_INVOKE");
  const verified = final.decision === "OBSERVED" && status === "Count: 1"
    && modelSelectedSet && modelSelectedInvoke;
  console.log(`NYX_DESKTOP_MODEL_LIVE_SUMMARY ${JSON.stringify({
    result: verified ? "VERIFIED_IN_DISPOSABLE_UI" : "EMPIRICALLY_NOT_YET_VERIFIED",
    model: "nvidia/nemotron-3-ultra-550b-a55b", modelOutcome: turn.outcome,
    modelCalls: turn.modelCalls, modelTokens: turn.modelTokens, typedActionKinds: actions,
    finalObservationEvidenceClass: final.evidenceClass, finalStatus: status,
    sourceRepositoryMutated: false, generalDesktopAuthorityGranted: false,
    generalShellAuthorityGranted: false, productionAuthorityGranted: false })}`);
  assert.equal(verified, true, "live model did not complete the bounded disposable UI task");
} finally {
  reader.terminate(Date.now(), "desktop_model_evaluation_done");
  if (!fixture.killed) fixture.kill();
}
