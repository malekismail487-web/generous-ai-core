import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import {
  createNyxLocalRuntime,
  type NyxLocalRuntime,
} from "../src/lib/codelab/cli/nyxLocalRuntime";
import {
  NyxLocalApprovalBroker,
  NyxLocalWebConsole,
} from "../src/lib/codelab/cli/nyxLocalWebConsole";

let passed = 0;
let failed = 0;
function check(actual: unknown, expected: unknown, label: string): void {
  assert.deepEqual(actual, expected, label);
}
function omegaTest(name: string, run: () => Promise<void> | void): void {
  test(name, async () => {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failed += 1;
      throw error;
    }
  });
}
after(() =>
  console.log(
    `Omega NYX local web console tests - passed: ${passed}, failed: ${failed}`,
  ),
);

omegaTest(
  "local runtime exposes only requested capabilities and closes without source writes",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "nyx-web-runtime-"));
    await mkdir(join(root, "src"));
    try {
      const runtime = await createNyxLocalRuntime(
        {
          repository: root,
          scopes: ["src"],
          editablePath: null,
          verifierPath: null,
          terminalCheckPaths: [],
          desktopPid: null,
        },
        {
          environment: {
            OMEGA_ALLOW_NVIDIA_NETWORK: "1",
            NVIDIA_API_KEY: "test-only-value",
          },
          approveDesktopAction: async () => false,
        },
      );
      assert.equal(runtime.status.repository, root);
      check(
        runtime.status.sourceRepositoryWritable,
        false,
        "local runtime never grants source repository writes",
      );
      check(
        runtime.status.generalShellAvailable,
        false,
        "local runtime never grants a general shell",
      );
      assert.equal(runtime.status.desktopAvailable, false);
      assert.equal((await runtime.close()).cleaned, true);
      await assert.rejects(
        createNyxLocalRuntime(
          {
            repository: root,
            scopes: ["src"],
            editablePath: null,
            verifierPath: null,
            terminalCheckPaths: ["../other.mjs"],
            desktopPid: null,
          },
          {
            environment: {
              OMEGA_ALLOW_NVIDIA_NETWORK: "1",
              NVIDIA_API_KEY: "test-only-value",
            },
            approveDesktopAction: async () => false,
          },
        ),
      );
    } finally {
      await rm(root, { recursive: true });
    }
  },
);

omegaTest(
  "desktop approval broker resolves only matching one-time identity",
  async () => {
    const broker = new NyxLocalApprovalBroker();
    const pending = broker.request({
      kind: "DESKTOP_SET_VALUE",
      pid: 42,
      hwnd: 77,
      selector: "NyxInput",
      elementName: "Input",
      controlType: "Edit",
      value: "safe text",
      valueDigest: "abc",
    });
    const id = broker.pending?.id;
    assert.ok(id);
    assert.equal(broker.decide("wrong", true), false);
    assert.equal(broker.decide(id, true), true);
    assert.equal(await pending, true);
    assert.equal(broker.decide(id, true), false);
    broker.close();
  },
);

omegaTest(
  "loopback web console requires a session token and same origin before any action",
  async () => {
    let configured = 0;
    let turned = 0;
    const fakeRuntime = {
      status: {
        repository: "C:/fixture",
        repositoryName: "fixture",
        scopes: ["src"],
        editablePath: null,
        verifierPath: null,
        terminalCheckPaths: [],
        desktopPid: null,
        desktopAvailable: false,
        sourceRepositoryWritable: false,
        generalShellAvailable: false,
        generalNetworkAvailable: false,
        productionAuthorityAvailable: false,
      },
      session: {
        turn: async (message: string) => {
          turned += 1;
          return {
            outcome: "REPLIED",
            message: `Received: ${message}`,
            modelCalls: 1,
            modelTokens: 2,
            candidate: null,
            events: [],
            sourceRepositoryMutated: false,
            broaderAuthorityGranted: false,
          };
        },
      },
      close: async () => ({ cleaned: true, quarantinePath: null }),
    } as unknown as NyxLocalRuntime;
    const server = new NyxLocalWebConsole({
      assetRoot: resolve("scripts/omega/nyx-ui"),
      environment: { NVIDIA_API_KEY: "test-only-value" },
      defaultRepository: "C:/fixture",
      createRuntime: async () => {
        configured += 1;
        return fakeRuntime;
      },
    });
    const launch = await server.start();
    const url = new URL(launch);
    const origin = url.origin;
    const token = new URLSearchParams(url.hash.slice(1)).get("session");
    assert.ok(token);
    const headers = {
      "X-Nyx-Session": token,
      "Content-Type": "application/json",
      Origin: origin,
    };
    try {
      const page = await fetch(origin);
      assert.equal(page.status, 200);
      assert.match(
        page.headers.get("content-security-policy") ?? "",
        /frame-ancestors 'none'/,
      );
      assert.match(await page.text(), /Think with Νύξ/);
      const noToken = await fetch(`${origin}/api/status`);
      check(
        noToken.status,
        403,
        "browser actions require the ephemeral session bearer token",
      );
      const rebindingStatus = await new Promise<number | undefined>(
        (resolveStatus, reject) => {
          const rebinding = request(
            `${origin}/api/status`,
            {
              headers: { Host: "outside.example", "X-Nyx-Session": token },
            },
            (response) => {
              response.resume();
              response.on("end", () => resolveStatus(response.statusCode));
            },
          );
          rebinding.on("error", reject);
          rebinding.end();
        },
      );
      check(
        rebindingStatus,
        403,
        "host rebinding cannot reach browser actions",
      );
      const wrongOrigin = await fetch(`${origin}/api/configure`, {
        method: "POST",
        headers: { ...headers, Origin: "https://outside.example" },
        body: "{}",
      });
      check(
        wrongOrigin.status,
        403,
        "cross-origin browser posts cannot configure authority",
      );
      assert.equal(configured, 0);
      const malformed = await fetch(`${origin}/api/configure`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          repository: "C:/fixture",
          unexpectedAuthority: true,
        }),
      });
      assert.equal(malformed.status, 400);
      const setup = await fetch(`${origin}/api/configure`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          repository: "C:/fixture",
          scopes: ["src"],
          editablePath: null,
          verifierPath: null,
          terminalCheckPaths: [],
          desktopPid: null,
        }),
      });
      assert.equal(setup.status, 200);
      assert.equal(configured, 1);
      const status = await fetch(`${origin}/api/status`, { headers });
      assert.equal(status.status, 200);
      assert.equal((await status.text()).includes("test-only-value"), false);
      const answer = await fetch(`${origin}/api/turn`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: "Hello" }),
      });
      assert.equal(answer.status, 200);
      assert.equal((await answer.json()).message, "Received: Hello");
      assert.equal(turned, 1);
      const hostile = await fetch(`${origin}/api/turn`, {
        method: "POST",
        headers: { ...headers, Origin: "https://outside.example" },
        body: JSON.stringify({ message: "unsafe" }),
      });
      assert.equal(hostile.status, 403);
      assert.equal(turned, 1);
    } finally {
      assert.equal((await server.close()).cleaned, true);
    }
  },
);
