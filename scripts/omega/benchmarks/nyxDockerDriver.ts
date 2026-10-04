import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NyxContainerDriver } from "../../../src/lib/codelab/executor/nyxContainerExecution";
import { parseNyxChatAction } from "../../../src/lib/codelab/cli/nyxChatProtocol";

const runFile = promisify(execFile);
/** Fixed Docker CLI bridge. NYX cannot select the executable, flags, container, environment or host cwd. */
export class NyxDockerDriver implements NyxContainerDriver {
  async inspect(containerId: string): Promise<unknown> {
    if (!/^[a-f0-9]{64}$/.test(containerId)) throw Error("container_id_invalid");
    const result = await this.#run(["inspect", "--type", "container", containerId], 5000, 64000);
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.length !== 1) throw Error("container_inspection_not_unique");
    return parsed[0];
  }
  async exec(containerId: string, argv: readonly string[], commandMs: number) {
    if (!/^[a-f0-9]{64}$/.test(containerId) || !Number.isSafeInteger(commandMs) || commandMs < 100 || commandMs > 10000)
      throw Error("container_execution_policy_invalid");
    const action = parseNyxChatAction(JSON.stringify({kind: "CONTAINER_EXEC", argv})).action;
    if (action?.kind !== "CONTAINER_EXEC") throw Error("container_argv_invalid");
    const args = ["exec", "--user", "65534:65534", "--workdir", "/workspace", containerId,
      "/usr/bin/timeout", "--signal=KILL", `${commandMs / 1000}s`, ...action.argv];
    let output: {exitCode: number; stdout: string; stderr: string; timedOut: boolean};
    try {
      const result = await this.#run(args, commandMs + 2000, 16000);
      output = {exitCode: 0, stdout: result.stdout, stderr: result.stderr, timedOut: false};
    } catch (error) {
      const value = error as {code?: number | string; killed?: boolean; stdout?: string; stderr?: string};
      // No raw exception or inherited environment enters model/evidence.
      if (value.killed || typeof value.code !== "number") throw Error("container_execution_transport_failed");
      output = {exitCode: value.code, stdout: String(value.stdout ?? ""), stderr: String(value.stderr ?? ""),
        timedOut: value.code === 124 || value.code === 137};
    } finally {
      // Kill all same-user namespace processes except PID 1/caller (Linux kill(-1) semantics).
      // No model input participates in this command. PID 1 auto-reaps; background service authority is absent.
      await this.#run(["exec", "--user", "65534:65534", containerId, "/bin/sh", "-c", "kill -KILL -1 2>/dev/null; exit 0"], 5000, 2000);
      let quiescent = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const processes = (await this.#run(["top", containerId, "-eo", "pid"], 5000, 4000)).stdout.trim().split(/\r?\n/);
        if (processes.length === 2 && /^\s*\d+\s*$/.test(processes[1])) {quiescent = true; break;}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!quiescent) throw Error("container_background_process_fence_unconfirmed");
    }
    return output;
  }
  async #run(args: readonly string[], timeout: number, maxBuffer: number) {
    return runFile("docker", [...args], {shell: false, windowsHide: true, timeout, maxBuffer,
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DOCKER_CONFIG: "/nonexistent-nyx-docker-config"}});
  }
}
