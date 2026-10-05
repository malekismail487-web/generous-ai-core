import { quotaProbeArgs, quotaProbeInspection, quotaCreationFailure } from "./omega/nyx-docker-storage-preflight";
import { NYX_CONTAINER_SUPERVISOR, validateNyxContainerInspection } from "../src/lib/codelab/executor/nyxContainerExecution";

let passed = 0; let failed = 0;
function check(value: unknown, label: string) { if (value) passed++; else { failed++; console.error(`x ${label}`); } }
const id = "a".repeat(64), image = `sha256:${"b".repeat(64)}`, owner = "c".repeat(32);
const fixture = () => ({Id: id, Image: image, Mounts: [], State: {Running: true},
  Config: {User: "65534:65534", WorkingDir: "/tmp", Cmd: [...NYX_CONTAINER_SUPERVISOR],
    Labels: {"org.lumina.nyx.storage-probe-owner": owner}, Env: ["PATH=/usr/local/bin:/usr/bin", "PYTHON_VERSION=3.12.3"]},
  HostConfig: {NetworkMode: "none", PortBindings: {}, Links: null, Privileged: false, ReadonlyRootfs: false,
    PidMode: "", IpcMode: "private", Binds: null, CapAdd: null, Devices: [], DeviceRequests: null, VolumesFrom: null,
    CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Memory: 134217728, MemorySwap: 134217728,
    NanoCpus: 1000000000, PidsLimit: 32, StorageOpt: {size: "64m"}, Tmpfs: null}});
const accepts = (raw: unknown) => quotaProbeInspection(raw, id, image, owner);
check(accepts(fixture()), "fixed offline bounded probe inspection accepted");
check(Object.isFrozen(quotaProbeArgs(image, owner)) && quotaProbeArgs(image, owner).includes("--storage-opt=size=64m"),
  "quota required before any writable-layer provisioning");
check(!quotaProbeArgs(image, owner).some(x => /mount|volume|privileged|NVIDIA_API_KEY/.test(x)),
  "no host mounts, extra privilege or credentials in fixed create request");
check(validateNyxContainerInspection(fixture(), {containerId: id, imageId: image, owner}).length > 0,
  "environment diagnostic cannot be admitted as existing NYX container authority");
for (const [label, change] of [
  ["quota removed", (v: ReturnType<typeof fixture>) => { v.HostConfig.StorageOpt = {} as never; }],
  ["extra storage option", (v: ReturnType<typeof fixture>) => { v.HostConfig.StorageOpt = {size: "64m", other: "1"} as never; }],
  ["quota inflated", (v: ReturnType<typeof fixture>) => { v.HostConfig.StorageOpt.size = "1g"; }],
  ["network", (v: ReturnType<typeof fixture>) => { v.HostConfig.NetworkMode = "bridge"; }],
  ["host pid", (v: ReturnType<typeof fixture>) => { v.HostConfig.PidMode = "host"; }],
  ["privilege", (v: ReturnType<typeof fixture>) => { v.HostConfig.Privileged = true; }],
  ["capability", (v: ReturnType<typeof fixture>) => { v.HostConfig.CapAdd = ["SYS_ADMIN"] as never; }],
  ["mount", (v: ReturnType<typeof fixture>) => { v.Mounts = [{Type: "bind", Source: "/"}] as never; }],
  ["bind", (v: ReturnType<typeof fixture>) => { v.HostConfig.Binds = ["/:/host"] as never; }],
  ["root user", (v: ReturnType<typeof fixture>) => { v.Config.User = "0"; }],
  ["unbounded swap", (v: ReturnType<typeof fixture>) => { v.HostConfig.MemorySwap = -1; }],
  ["owner mismatch", (v: ReturnType<typeof fixture>) => { v.Config.Labels["org.lumina.nyx.storage-probe-owner"] = "d".repeat(32); }],
  ["image mismatch", (v: ReturnType<typeof fixture>) => { v.Image = `sha256:${"d".repeat(64)}`; }],
  ["unknown environment", (v: ReturnType<typeof fixture>) => { v.Config.Env.push("CUSTOM_AUTH_TOKEN=synthetic-not-a-secret"); }],
  ["tmpfs bypass", (v: ReturnType<typeof fixture>) => { v.HostConfig.Tmpfs = {"/tmp": "rw,size=1g"} as never; }],
] as const) { const raw = fixture(); change(raw); check(!accepts(raw), `${label} rejected`); }
check(!quotaProbeInspection(fixture(), "--all", image, owner) && !accepts(null), "malformed identity and inspection reject");
const malformed = fixture(); malformed.HostConfig.CapDrop = undefined as never;
check(!accepts(malformed), "malformed inspection returns rejection rather than throwing");
for (const message of ["--storage-opt is supported only for overlay over xfs with pquota", "storage-opt size is not supported"])
  check(quotaCreationFailure(message) === "STORAGE_QUOTA_UNSUPPORTED", "known unsupported quota classified, no fallback");
check(quotaCreationFailure("daemon unavailable") === "CONTAINER_CREATION_FAILED", "unknown errors are not invented quota evidence");
check(quotaCreationFailure("memory size is not supported") === "CONTAINER_CREATION_FAILED", "unrelated unsupported resource is not a quota diagnosis");
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
