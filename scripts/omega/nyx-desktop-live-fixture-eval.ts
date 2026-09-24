import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { NyxScopedComputerHost } from "../../src/lib/codelab/cli/nyxScopedComputerHost";
import { ReadOnlyRepositoryExecutor } from "../../src/lib/codelab/executor/readOnlyExecutor";

const pid = Number(process.argv[2]);
if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid < 1 || !process.env.LOCALAPPDATA) {
  throw new Error("Windows fixture PID and WinApp installation required");
}
const now = Date.now();
const reader = await ReadOnlyRepositoryExecutor.create({ executorId: "NYX-DESKTOP-FIXTURE-R1",
  tokenId: "NYX-DESKTOP-FIXTURE-TOKEN", repositoryRoot: resolve("."), resourceScopes: ["scripts/omega"],
  issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + 120_000,
  constraints: { maxFileBytes: 32_000, maxDirectoryEntries: 100, allowedExtensions: [".ps1"] },
  issuer: "NYX-DESKTOP-FIXTURE", auditIdentity: "NYX-DESKTOP-FIXTURE-AUDIT" });
let fixtureConfirmed = false;
const host = NyxScopedComputerHost.create({ reader, allowedCheckPaths: [], desktopPid: pid,
  winappPath: join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "winapp.exe"),
  approveDesktopAction: async (request) => fixtureConfirmed && request.pid === pid
    && ["NyxInput", "NyxRun", "Close"].includes(request.selector) });
try {
  const initial = await host.execute({ kind: "DESKTOP_INSPECT" }, "fixture-inspect-1");
  assert.equal(initial.decision, "OBSERVED", initial.reason);
  assert.equal(initial.observation?.title, "NYX Disposable UI Fixture");
  const selectors = initial.observation?.elements as readonly { selector: string }[];
  for (const selector of ["NyxInput", "NyxRun", "NyxStatus", "Close"]) {
    assert.equal(selectors.some((item) => item.selector === selector), true, `missing ${selector}`);
  }
  fixtureConfirmed = true;
  const set = await host.execute({ kind: "DESKTOP_SET_VALUE", selector: "NyxInput",
    observationDigest: String(initial.observation?.observationDigest), value: "NYX fixture input" }, "fixture-set");
  assert.equal(set.decision, "EXECUTED", set.reason);
  const beforeInvoke = await host.execute({ kind: "DESKTOP_INSPECT" }, "fixture-inspect-2");
  assert.equal(beforeInvoke.decision, "OBSERVED");
  const invoke = await host.execute({ kind: "DESKTOP_INVOKE", selector: "NyxRun",
    observationDigest: String(beforeInvoke.observation?.observationDigest) }, "fixture-invoke");
  assert.equal(invoke.decision, "UNVERIFIED", "invocation alone must not self-certify its semantic effect");
  const afterInvoke = await host.execute({ kind: "DESKTOP_INSPECT" }, "fixture-inspect-3");
  assert.equal(afterInvoke.decision, "OBSERVED");
  const afterElements = afterInvoke.observation?.elements as readonly { selector: string; name: string }[];
  assert.equal(afterElements.find((item) => item.selector === "NyxStatus")?.name, "Count: 1");
  console.log(`NYX_DESKTOP_LIVE_SUMMARY ${JSON.stringify({ result: "VERIFIED_ON_DISPOSABLE_WINDOWS_FIXTURE",
    observationEvidenceClass: initial.evidenceClass, mutationEvidenceClass: set.evidenceClass,
    valueReadbackConfirmed: set.observation?.confirmed === true, actionEffectObserved: true,
    targetPid: pid, operatorApprovalRule: "FIXTURE_ONLY", generalDesktopAuthorityGranted: false })}`);
  await host.execute({ kind: "DESKTOP_INVOKE", selector: "Close",
    observationDigest: String(afterInvoke.observation?.observationDigest) }, "fixture-close");
} finally {
  reader.terminate(Date.now(), "desktop_fixture_evaluation_done");
}
