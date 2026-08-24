import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOADER = resolve(ROOT, "scripts/w0rs/register-typescript-loader.mjs");

const TESTS = Object.freeze([
  ["scripts/codelabAgentProtocol.test.ts", 26],
  ["scripts/codelabAgentReducer.test.ts", 55],
  ["scripts/orchestraO0.test.ts", 54],
  ["scripts/orchestraO1.test.ts", 36],
  ["scripts/orchestraO2.test.ts", 44],
  ["scripts/orchestraO3.test.ts", 45],
  ["scripts/orchestraO4.test.ts", 31],
  ["scripts/orchestraO5.test.ts", 37],
  ["scripts/orchestraO6.test.ts", 32],
  ["scripts/orchestraO7a.test.ts", 19],
  ["scripts/orchestraO7perception.test.ts", 19],
  ["scripts/omegaRegistry.test.ts", 80],
  ["scripts/omegaReadOnlyExecutor.test.ts", 34],
  ["scripts/evaluation/omegaR1PrivateEval.ts", 31],
  ["scripts/omegaR2Design.test.ts", 51],
  ["scripts/omegaR2ASpecEval.test.ts", 51],
  ["scripts/omegaTsRatchet.test.mjs", 25],
  ["scripts/omegaAssureR2Spec.test.ts", 37],
  ["scripts/omegaR2AImplSpec.test.ts", 82],
  ["scripts/omegaR2HostEval.test.ts", 43],
  ["scripts/omegaAssureR2Evaluator.test.ts", 34],
]);

let passedChecks = 0;
let failedFiles = 0;

for (const [file, expectedChecks] of TESTS) {
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      pathToFileURL(LOADER).href,
      file,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const summary = output.match(/passed:\s*(\d+),\s*failed:\s*(\d+)/i);
  const observedPassed = summary ? Number(summary[1]) : 0;
  const observedFailed = summary ? Number(summary[2]) : 1;
  const ok = run.status === 0 && observedPassed === expectedChecks && observedFailed === 0;
  if (ok) {
    passedChecks += observedPassed;
    console.log(`PASSED ${file} checks=${observedPassed}`);
  } else {
    failedFiles += 1;
    console.error(`FAILED ${file} exit=${run.status} expectedChecks=${expectedChecks} observedPassed=${observedPassed} observedFailed=${observedFailed}`);
    const detail = output.trim();
    if (detail) console.error(detail);
  }
}

console.log(`OMEGA_TEST_SUMMARY files=${TESTS.length} failedFiles=${failedFiles} passedChecks=${passedChecks}`);
if (failedFiles > 0) process.exit(1);
