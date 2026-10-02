import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import test, { after } from "node:test";
import ts from "typescript";

// Execute the actual Edge handler, not a reimplementation of its decisions.
// Auth/database/gateway are synthetic local doubles: this is E3 boundary
// evidence, not production RLS, JWT-revocation, deployment, or E4 evidence.
const path = "supabase/functions/lumina-live/index.ts";
const source = readFileSync(path, "utf8");
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const imports = ast.statements.filter(ts.isImportDeclaration);
assert.deepEqual(imports.map(item => (item.moduleSpecifier as ts.StringLiteral).text), [
  "https://deno.land/std@0.168.0/http/server.ts", "https://esm.sh/@supabase/supabase-js@2",
]);
let executable = source;
for (const item of [...imports].reverse()) executable = executable.slice(0, item.getFullStart()) + executable.slice(item.end);
const compiled = ts.transpileModule(executable, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.None }, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
let passed = 0; let failed = 0;
function check(actual: unknown, expected: unknown, label: string): void { assert.deepEqual(actual, expected, label); }
function omegaTest(name: string, body: () => Promise<void>): void {
  test(name, async () => { try { await body(); passed++; } catch (error) { failed++; throw error; } });
}
after(() => console.log(`Omega Lumina live boundary tests - passed: ${passed}, failed: ${failed}`));

function fixture() {
  const state = { validUser: true, schoolId: "school-A" as string | null, authError: false,
    profileError: false, authCalls: 0, profileCalls: 0, gatewayCalls: 0, tokens: [] as string[],
    upstream: 'data: {"choices":[{"delta":{"content":"Measured explanation."}}]}\n\ndata: [DONE]\n\n' };
  let handler!: (req: Request) => Promise<Response>;
  const context = createContext({ Request, Response, ReadableStream, TextEncoder, TextDecoder,
    AbortController, DOMException, console,
    Deno: { env: { get: (name: string) => name === "SUPABASE_URL" ? "https://synthetic.invalid"
      : "synthetic-non-secret-test-value" } },
    serve: (fn: typeof handler) => { handler = fn; },
    createClient: () => ({ auth: { getUser: async (token: string) => {
      state.authCalls++; state.tokens.push(token);
      return { data: { user: state.validUser ? { id: "student-A" } : null }, error: state.authError ? { message: "synthetic" } : null };
    } }, from: (table: string) => {
      assert.equal(table, "profiles");
      return { select: (columns: string) => {
        assert.equal(columns, "school_id");
        return { eq: (column: string, value: string) => {
          assert.equal(column, "id"); assert.equal(value, "student-A");
          return { maybeSingle: async () => { state.profileCalls++;
            return { data: { school_id: state.schoolId }, error: state.profileError ? { message: "synthetic" } : null }; } };
        } };
      } };
    } }),
    fetch: async (url: string) => {
      assert.equal(url, "https://ai.gateway.lovable.dev/v1/chat/completions"); state.gatewayCalls++;
      return new Response(state.upstream, { headers: { "content-type": "text/event-stream" } });
    },
  });
  new Script(compiled.outputText, { filename: path }).runInContext(context, { timeout: 1_000 });
  assert.equal(typeof handler, "function");
  const payload = (kind = "silence") => ({ lessonId: "lesson-A", event: { id: "event-A", lessonId: "lesson-A",
    ts: 1, kind, text: "A lesson event.", priority: 3, teacherVisible: false },
    cachedContext: { currentConcept: null, conceptStack: [], recentTimeline: [], prerequisitesCovered: [] } });
  const request = (body: unknown = payload(), auth = "Bearer synthetic-student-token") => handler(new Request(
    "https://synthetic.invalid/functions/v1/lumina-live", { method: "POST",
      headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { state, request, payload };
}

omegaTest("repeated requests honor the current auth backend decision instead of cached admission", async () => {
  const f = fixture(); assert.equal((await f.request()).status, 200);
  f.state.validUser = false;
  check((await f.request()).status, 401, "current backend denial overrides prior admission");
  assert.equal(f.state.authCalls, 2); assert.equal(f.state.gatewayCalls, 0);
});
omegaTest("school membership removal is checked on the next request", async () => {
  const f = fixture(); assert.equal((await f.request()).status, 200);
  f.state.schoolId = null;
  check((await f.request()).status, 401, "removed school membership cannot reuse a prior profile");
  assert.equal(f.state.profileCalls, 2); assert.equal(f.state.gatewayCalls, 0);
});
omegaTest("authorization requires Bearer syntax before consulting the backend", async () => {
  const f = fixture(); check((await f.request(undefined, "synthetic-student-token")).status, 401,
    "only correctly framed Bearer authorization reaches backend authentication");
  assert.equal(f.state.authCalls, 0);
  assert.equal((await f.request(undefined, "bEaReR synthetic-student-token")).status, 200);
  assert.deepEqual(f.state.tokens, ["synthetic-student-token"]);
});
omegaTest("backend errors fail closed even if a stale data value accompanies the error", async () => {
  for (const key of ["authError", "profileError"] as const) {
    const f = fixture(); f.state[key] = true;
    check((await f.request()).status, 401, "backend errors veto stale auth and profile data"); assert.equal(f.state.gatewayCalls, 0);
  }
});
omegaTest("nested context is validated before prompt assembly rather than throwing or coercing", async () => {
  for (const patch of [{ conceptStack: [null] }, { recentTimeline: [{ kind: "concept", text: null }] },
    { currentConcept: "not-a-concept" }, { prerequisitesCovered: [{ unsafe: true }] }]) {
    const f = fixture(); const body = f.payload("concept"); Object.assign(body.cachedContext, patch);
    const response = await f.request(body); check(response.status, 400, "malformed nested context fails before gateway prompt assembly");
    assert.equal(f.state.gatewayCalls, 0);
  }
});
omegaTest("malformed optional concept references cannot enter the model prompt", async () => {
  const f = fixture(); const body = f.payload("concept"); Object.assign(body.event, { conceptRef: { unsafe: true } });
  check((await f.request(body)).status, 400, "malformed optional event references are rejected"); assert.equal(f.state.gatewayCalls, 0);
});
omegaTest("normal streamed inference retains token content and one successful terminal event", async () => {
  const f = fixture(); const response = await f.request(f.payload("concept")); const body = await response.text();
  check(response.status, 200, "valid authenticated inference preserves normal streaming"); assert.equal(f.state.gatewayCalls, 1);
  assert.match(body, /Measured explanation/); assert.match(body, /event: done\ndata: {"reason":"stop"}/);
  assert.equal((body.match(/event: done/g) ?? []).length, 1); assert.doesNotMatch(body, /event: error/);
});
omegaTest("unexpected upstream EOF reports partial failure, never a successful stop", async () => {
  const f = fixture(); f.state.upstream = 'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n';
  const body = await (await f.request(f.payload("concept"))).text();
  assert.match(body, /Partial/); assert.match(body, /upstream_stream_incomplete/);
  check(body.includes('event: done\ndata: {"reason":"error"}'), true, "incomplete upstream output never claims a successful terminal state");
  assert.doesNotMatch(body, /"reason":"stop"/);
});
omegaTest("a complete final sentinel without a trailing newline is still recognized", async () => {
  const f = fixture(); f.state.upstream = 'data: {"choices":[{"delta":{"content":"Complete"}}]}\n\ndata: [DONE]';
  const body = await (await f.request(f.payload("concept"))).text();
  assert.match(body, /Complete/); check(body.includes('"reason":"stop"'), true,
    "final complete sentinel without newline remains compatible"); assert.doesNotMatch(body, /event: error/);
});
omegaTest("silence remains an authenticated no-op with no gateway inference", async () => {
  const f = fixture(); const body = await (await f.request()).text();
  assert.match(body, /"reason":"noop"/); check(f.state.gatewayCalls, 0, "authenticated silence never spends inference compute");
});
