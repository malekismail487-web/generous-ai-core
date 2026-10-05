import { execFileSync } from "node:child_process";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { NYX_HARBOR_BRIDGE_POLICY, parseNyxHarborTaskRequest, runNyxHarborCandidate } from "./benchmarks/nyxHarborBridge";
import { NyxDockerDriver } from "./benchmarks/nyxDockerDriver";
import { nyxSha256 } from "../../src/lib/codelab/cli/nyxChatProtocol";

try {
  if (process.platform !== "linux" || process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1"
    || process.env.OMEGA_ALLOW_NYX_HARBOR_BRIDGE !== "1" || !process.env.NVIDIA_API_KEY?.trim())
    throw Error("harbor_requires_explicit_linux_model_and_container_authorization");
  let input = "";
  process.stdin.setEncoding("utf8"); // Preserve Unicode instructions across arbitrary stdin byte boundaries.
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input) > 40000) throw Error("harbor_input_oversized");
  }
  const request = parseNyxHarborTaskRequest(JSON.parse(input));
  const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8", timeout: 5000, maxBuffer: 2000000,
    env: {PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT}}).trim();
  if (request.candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
    throw Error("harbor_requires_clean_exact_candidate");
  const sourceIndexBefore = nyxSha256(git("ls-files", "-s"));
  const model = NvidiaNimProvider.create({providerId: "NYX-HARBOR-NEMOTRON-COGNITION",
    model: NYX_HARBOR_BRIDGE_POLICY.model, authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: nvidiaNimCredentialFromEnvironment(process.env), maxPromptBytes: 64000,
    maxOutputTokens: NYX_HARBOR_BRIDGE_POLICY.maxOutputTokens, timeoutMs: 120000});
  const result = await runNyxHarborCandidate(request, {model, driver: new NyxDockerDriver()});
  if (request.candidate !== git("rev-parse", "HEAD") || sourceIndexBefore !== nyxSha256(git("ls-files", "-s"))
    || git("status", "--porcelain")) throw Error("harbor_authoritative_source_changed");
  console.log(JSON.stringify({...result, sourceRepositoryUnchanged: true}));
} catch (error) {
  const reason = error instanceof Error && /^(harbor_|nyx_container_)[a-z_]+$/.test(error.message)
    ? error.message : "harbor_bridge_infrastructure_failure";
  console.log(JSON.stringify({schemaVersion: 1, identity: "NYX-HARBOR-EXISTING-SUBSTRATE-CANDIDATE-001",
    outcome: "BLOCKED", reason, taskSuccessClaimed: false, officialVerification: "NOT_EXECUTED_BY_AGENT",
    sourceRepositoryMutation: false, hostAuthority: false, productionAuthority: false}));
  process.exitCode = 1;
}
