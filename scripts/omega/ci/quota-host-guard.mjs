import {createHash} from "node:crypto";
import {readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, posix, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const reject = code => {throw Error(code);};
const absolute = value => typeof value === "string" && value.startsWith("/") && value !== "/"
  && !/[\x00-\x1f\x7f]/.test(value) && posix.normalize(value) === value;
const loopId = value => typeof value === "string" && /^\/dev\/loop[0-9]+$/.test(value);
export function assertLoopAssociation(raw, device, image) {
  if (!loopId(device) || !absolute(image)) reject("LOOP_EXPECTATION_INVALID");
  const rows = raw?.loopdevices;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.name !== device || rows[0]?.["back-file"] !== image)
    reject("LOOP_BACKING_FILE_NOT_OWNED");
}
export function assertMountIdentity(raw, device, target) {
  if (!loopId(device) || !absolute(target)) reject("MOUNT_EXPECTATION_INVALID");
  const rows = raw?.filesystems, row = rows?.[0];
  if (!Array.isArray(rows) || rows.length !== 1 || row?.source !== device || row?.target !== target
    || row?.fstype !== "xfs" || typeof row?.options !== "string" || row.children?.length) reject("MOUNT_IDENTITY_NOT_OWNED");
  const flags = new Set(row.options.split(","));
  if (!flags.has("rw") || !flags.has("nosuid") || !flags.has("nodev")
    || !(flags.has("pquota") || flags.has("prjquota"))) reject("PROJECT_QUOTA_MOUNT_NOT_PROVEN");
}
function uniqueFlag(argv, flag) {
  const values = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === flag) values.push(argv[++i]);
    else if (argv[i].startsWith(flag + "=")) values.push(argv[i].slice(flag.length + 1));
  }
  return values.length === 1 ? values[0] : undefined;
}
export function assertOwnedDaemonArgs(argv, dataRoot, pidfile) {
  if (!absolute(dataRoot) || !absolute(pidfile) || !Array.isArray(argv) || argv.some(x => typeof x !== "string")
    || posix.basename(argv[0] ?? "") !== "dockerd" || uniqueFlag(argv, "--data-root") !== dataRoot
    || uniqueFlag(argv, "--pidfile") !== pidfile || uniqueFlag(argv, "--storage-driver") !== "overlay2"
    || uniqueFlag(argv, "--host") !== "unix:///var/run/docker.sock" || uniqueFlag(argv, "--bridge") !== "none"
    || uniqueFlag(argv, "--iptables") !== "false" || uniqueFlag(argv, "--ip6tables") !== "false"
    || uniqueFlag(argv, "--ip-forward") !== "false" || uniqueFlag(argv, "--ip-masq") !== "false") reject("DAEMON_PROCESS_NOT_OWNED");
  const allowed = new Set(["--config-file", "--data-root", "--exec-root", "--pidfile", "--host", "--storage-driver",
    "--iptables", "--ip6tables", "--bridge", "--ip-forward", "--ip-masq"]);
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i].split("=", 1)[0];
    if (!allowed.has(flag)) reject("DAEMON_UNEXPECTED_ARGUMENT");
    if (!argv[i].includes("=") && (++i >= argv.length || argv[i].startsWith("-"))) reject("DAEMON_ARGUMENT_VALUE_MISSING");
  }
  const config = uniqueFlag(argv, "--config-file");
  if (dataRoot !== `${posix.dirname(pidfile)}/mount/docker` || uniqueFlag(argv, "--exec-root") !== `${posix.dirname(pidfile)}/exec`
    || !absolute(config) || !config.endsWith("/scripts/omega/ci/quota-host-daemon.json")) reject("DAEMON_LAYOUT_NOT_OWNED");
}
export function assertReportTarget(path, runnerTemp, candidate) {
  if (!absolute(runnerTemp) || !absolute(path) || !/^[a-f0-9]{40}$/.test(candidate)
    || path !== `${runnerTemp}/nyx-quota-host-${candidate}.json`) reject("REPORT_TARGET_INVALID");
}
function boundedJson() {
  const bytes = readFileSync(0); if (bytes.length > 65536) reject("HOST_METADATA_TOO_LARGE");
  return JSON.parse(bytes.toString("utf8"));
}
function writeReport(path, candidate, phase, prepared, cleanup, sourceUnchanged) {
  assertReportTarget(path, process.env.RUNNER_TEMP, candidate);
  if (!/^[A-Z_]{1,64}$/.test(phase) || [prepared, cleanup, sourceUnchanged].some(x => !["0", "1"].includes(x))) reject("REPORT_FIELDS_INVALID");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const paths = ["scripts/omega/ci/run-quota-backed-preflight.sh", "scripts/omega/ci/quota-host-guard.mjs",
    "scripts/omega/ci/quota-host-daemon.json", "scripts/omega/nyx-docker-storage-preflight.ts",
    "scripts/omega/benchmarks/nyxDockerDriver.ts", "src/lib/codelab/executor/nyxContainerExecution.ts"];
  const receipt = {schemaVersion: 1, identity: "NYX-QUOTA-BACKED-CI-HOST-PREFLIGHT-001", candidate, phase,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID ?? "unknown"}`, evidenceClass: "E3",
    state: prepared === "1" && cleanup === "1" && sourceUnchanged === "1" ? "PASS" : "FAIL",
    existingQuotaProbePassed: prepared === "1", hostResourceCleanupVerified: cleanup === "1", sourceUnchanged: sourceUnchanged === "1",
    hostCleanupScope: "OWNED_DAEMON_MOUNT_AND_LOOP_DEVICE_TEMP_FILES_LEFT_TO_EPHEMERAL_VM_TEARDOWN",
    trustedCiHostMutationUsed: true, nyxCapabilityGranted: false, modelCalls: 0, benchmarkTasksExecuted: 0, productionAuthority: false,
    pythonOrModelCredentialsRequested: false, tools: {node: process.version, platform: process.platform},
    sourceBindings: Object.fromEntries(paths.map(p => [p, createHash("sha256").update(readFileSync(resolve(root, p))).digest("hex")])),
    limitation: "STORAGE_PREREQUISITE_ONLY_NOT_A_BENCHMARK_PROFILE_AGENT_SCORE_OR_KERNEL_ESCAPE_PROOF"};
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n", {flag: "wx", mode: 0o600});
  console.log(`NYX_QUOTA_CI_HOST ${JSON.stringify(receipt)}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, ...args] = process.argv.slice(2);
    if (operation === "loop" && args.length === 2) assertLoopAssociation(boundedJson(), ...args);
    else if (operation === "mount" && args.length === 2) assertMountIdentity(boundedJson(), ...args);
    else if (operation === "daemon" && args.length === 3) {
      const [pid, data, file] = args;
      if (!/^[1-9][0-9]{1,8}$/.test(pid) || statSync(`/proc/${pid}`).uid !== 0) reject("DAEMON_PID_INVALID");
      assertOwnedDaemonArgs(readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean), data, file);
    } else if (operation === "report" && args.length === 6) writeReport(...args);
    else reject("HOST_GUARD_OPERATION_INVALID");
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{1,64}$/.test(error.message) ? error.message : "HOST_GUARD_REJECTED";
    console.error(`NYX_QUOTA_HOST_GUARD ${code}`); process.exitCode = 1;
  }
}
