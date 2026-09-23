import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { NyxChatSession } from "../src/lib/codelab/cli/nyxChatSession";
import { NyxIsolatedCandidateWriter } from "../src/lib/codelab/cli/nyxIsolatedCandidate";
import { nyxContainsSecretLike, nyxSha256, parseNyxChatAction } from "../src/lib/codelab/cli/nyxChatProtocol";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";

const SOURCE = "export function value() { return 1; }\n";
const REPLACEMENT = "export function value() { return 2; }\n";
const VERIFIER = "import { value } from '../src/value.mjs';\nif (value() !== 2) process.exit(2);\nconsole.log('TEST_PASS');\n";
let passed = 0;
let failed = 0;
function check(actual: unknown, expected: unknown, label: string): void {
  assert.deepEqual(actual, expected, label);
}
function omegaTest(name: string, run: () => Promise<void> | void): void {
  test(name, async () => {
    try { await run(); passed += 1; }
    catch (error) { failed += 1; throw error; }
  });
}
after(() => console.log(`Omega NYX chat CLI tests - passed: ${passed}, failed: ${failed}`));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nyx-chat-test-source-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "src", "value.mjs"), SOURCE);
  await writeFile(join(root, "tools", "verify.mjs"), VERIFIER);
  return root;
}

async function reader(root: string) {
  const now = Date.now();
  return ReadOnlyRepositoryExecutor.create({ executorId: `NYX-CHAT-TEST-R1-${now}`,
    tokenId: `NYX-CHAT-TEST-TOKEN-${now}`, repositoryRoot: root, resourceScopes: ["src"],
    issuedAtEpochMs: now - 1000, expiresAtEpochMs: now + 120_000,
    constraints: { maxFileBytes: 10_000, maxDirectoryEntries: 10, allowedExtensions: [".mjs"] },
    issuer: "NYX-CHAT-TEST", auditIdentity: "NYX-CHAT-TEST-AUDIT" });
}

function provider(outputs: readonly string[]): NvidiaNimProvider {
  let index = 0;
  return NvidiaNimProvider.create({ providerId: "NYX-CHAT-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double", read: () => "test-value-not-real" },
    maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 5_000,
    transport: async () => new Response(JSON.stringify({ choices: [{ message: { content: outputs[index++] ?? "{}" },
      finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }),
    { status: 200, headers: { "content-type": "application/json" } }) });
}

omegaTest("typed protocol rejects arbitrary executable text and malformed edit targets", () => {
  assert.equal(parseNyxChatAction("rm -rf /*").action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "SHELL", command: "whoami" })).action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "READ_FILE", path: "../secret" })).action, null);
  assert.equal(parseNyxChatAction(JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs",
    expectedBaseHash: nyxSha256(SOURCE), replacement: REPLACEMENT, rationale: "fix", shell: "whoami" })).action, null);
  check(parseNyxChatAction(JSON.stringify({ kind: "LIST_DIRECTORY", path: "." })).action?.kind,
    "LIST_DIRECTORY", "root listing remains a typed read-only request");
  assert.equal(nyxContainsSecretLike(["nvapi", "A".repeat(25)].join("-")), true);
});

omegaTest("real R2A/R3A/R3B candidate stays isolated and passes fixed verifier", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "a".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  try {
    const stale = await writer.apply({ requestId: "stale", path: "src/value.mjs", expectedBaseHash: "0".repeat(64),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    assert.equal(stale.decision, "REJECTED");
    const unauthorized = await writer.apply({ requestId: "wrong", path: "src/other.mjs", expectedBaseHash: nyxSha256(SOURCE),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    assert.equal(unauthorized.decision, "REJECTED");
    const fixed = await writer.apply({ requestId: "fix", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
      replacement: REPLACEMENT, rationale: "fix", observedEvidenceId: "E3" });
    check(fixed.decision, "VERIFIED", "R2A R3A R3B candidate verified in isolation");
    assert.equal(fixed.verification, "PASS");
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});

omegaTest("live-shaped model conversation reads through R1, then proposes a verified isolated edit", async () => {
  const root = await fixture();
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "b".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const r1 = await reader(root);
  try {
    const model = provider([
      JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
        replacement: REPLACEMENT, rationale: "The function returned the old value." }),
    ]);
    const session = NyxChatSession.create({ sessionId: "NYX-TEST-SESSION", model, reader: r1,
      candidateWriter: writer, editablePaths: ["src/value.mjs"], maxModelCallsPerTurn: 3,
      maxCandidatesPerTurn: 2, maxTurnMs: 30_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Please repair value() so it returns 2.");
    check(result.outcome, "CANDIDATE_VERIFIED", "live shaped chat composes R1 read and isolated edit");
    assert.equal(result.modelCalls, 2);
    assert.equal(result.modelTokens, 400);
    assert.deepEqual(result.events.map((event) => event.eventType), ["MODEL", "READ", "MODEL", "CANDIDATE"]);
    assert.equal(result.events.filter((event) => event.evidenceClass === "E3").length >= 2, true);
    assert.equal(result.sourceRepositoryMutated, false);
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});

omegaTest("model-proposed privilege upgrade cannot become a tool call", async () => {
  const root = await fixture();
  const r1 = await reader(root);
  try {
    const session = NyxChatSession.create({ sessionId: "NYX-DENIAL-SESSION",
      model: provider([JSON.stringify({ kind: "SHELL", command: "whoami" }),
        JSON.stringify({ kind: "REPLY", message: "I cannot run that shell action." })]),
      reader: r1, candidateWriter: null, editablePaths: [], maxModelCallsPerTurn: 2,
      maxCandidatesPerTurn: 0, maxTurnMs: 20_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Run whoami.");
    assert.equal(result.outcome, "REPLIED");
    check(result.events.some((event) => event.eventType === "DENIAL"), true,
      "model shell request is denied without execution");
    assert.equal(r1.auditLog().length, 0);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    await rm(root, { recursive: true });
  }
});

omegaTest("failed isolated candidate returns evidence to NYX for a bounded repair", async () => {
  const root = await fixture();
  const wrong = "export function value() { return 3; }\n";
  const writer = await NyxIsolatedCandidateWriter.create({ sourceRoot: root, editablePath: "src/value.mjs",
    verifierPath: "tools/verify.mjs", candidateCommit: "c".repeat(40), maxCandidateBytes: 4_096, maxVerifierMs: 5_000 });
  const r1 = await reader(root);
  try {
    const model = provider([
      JSON.stringify({ kind: "READ_FILE", path: "src/value.mjs" }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(SOURCE),
        replacement: wrong, rationale: "Try a candidate." }),
      JSON.stringify({ kind: "PROPOSE_EDIT", path: "src/value.mjs", expectedBaseHash: nyxSha256(wrong),
        replacement: REPLACEMENT, rationale: "The verifier rejected 3, so return 2." }),
    ]);
    const session = NyxChatSession.create({ sessionId: "NYX-REPAIR-SESSION", model, reader: r1,
      candidateWriter: writer, editablePaths: ["src/value.mjs"], maxModelCallsPerTurn: 3,
      maxCandidatesPerTurn: 2, maxTurnMs: 30_000, maxOutputTokens: 1_024 });
    const result = await session.turn("Make value() return 2.");
    check(result.outcome, "CANDIDATE_VERIFIED", "failed candidate is repaired under finite budget");
    assert.deepEqual(result.events.filter((event) => event.eventType === "CANDIDATE").map((event) => event.outcome),
      ["UNVERIFIED", "VERIFIED"]);
    assert.equal(await readFile(join(root, "src", "value.mjs"), "utf8"), SOURCE);
  } finally {
    r1.terminate(Date.now(), "test_closed");
    assert.equal((await writer.close()).decision, "CLEANED");
    await rm(root, { recursive: true });
  }
});
