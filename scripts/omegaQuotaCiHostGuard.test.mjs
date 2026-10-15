import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertLoopAssociation, assertMountIdentity, assertOwnedDaemonArgs, assertReportTarget} from "./omega/ci/quota-host-guard.mjs";
let passed = 0, failed = 0;
function check(label, fn) {try {fn(); passed++;} catch (e) {failed++; console.error(`FAIL ${label}: ${e.message}`);}}
const image = "/tmp/job/nyx-quota-host.12345678/backing.abcdefgh.xfs", device = "/dev/loop27";
const mount = "/tmp/job/nyx-quota-host.12345678/mount", data = mount + "/docker", pidfile = "/tmp/job/nyx-quota-host.12345678/docker.pid";
const loopInfo = () => ({loopdevices: [{name: device, "back-file": image}]});
const mountInfo = () => ({filesystems: [{source: device, target: mount, fstype: "xfs", options: "rw,nosuid,relatime,prjquota"}]});
const args = () => ["/usr/bin/dockerd", "--data-root", data, "--pidfile", pidfile, "--storage-driver", "overlay2",
  "--host", "unix:///var/run/docker.sock", "--bridge=none", "--iptables=false", "--ip6tables=false", "--ip-forward=false", "--ip-masq=false",
  "--config-file", "/repo/scripts/omega/ci/quota-host-daemon.json", "--exec-root", "/tmp/job/nyx-quota-host.12345678/exec"];
check("Only the one owned file-backed loop is accepted", () => assert.doesNotThrow(() => assertLoopAssociation(loopInfo(), device, image)));
for (const raw of [null, {}, {loopdevices: []}, {loopdevices: [loopInfo().loopdevices[0], loopInfo().loopdevices[0]]},
  {loopdevices: [{name: "/dev/sda", "back-file": image}]}, {loopdevices: [{name: device, "back-file": "/home/runner/user-data.img"}]}])
  check("Missing, duplicate, raw-disk or foreign backing identities fail closed", () => assert.throws(() => assertLoopAssociation(raw, device, image)));
check("Root and traversal expectations are forbidden", () => {
  assert.throws(() => assertLoopAssociation(loopInfo(), device, "/"));
  assert.throws(() => assertLoopAssociation(loopInfo(), device, "/tmp/../data"));
  assert.throws(() => assertLoopAssociation(loopInfo(), "/dev/sda", image));
});
check("Owned writable XFS project quota mount is accepted", () => assert.doesNotThrow(() => assertMountIdentity(mountInfo(), device, mount)));
for (const change of [r => {r.source = "/dev/sda";}, r => {r.target = "/";}, r => {r.fstype = "ext4";},
  r => {r.options = "rw,nosuid";}, r => {r.options = "ro,nosuid,pquota";}, r => {r.options = "rw,pquota";}]) {
  check("Wrong mount, missing quota and weakened mount flags fail closed", () => {const raw = mountInfo(); change(raw.filesystems[0]); assert.throws(() => assertMountIdentity(raw, device, mount));});
}
check("nodev blocks the daemon's required quota-device lookup, not a task privilege", () => {
  const raw = mountInfo(); raw.filesystems[0].options += ",nodev";
  assert.throws(() => assertMountIdentity(raw, device, mount));
});
check("Detach passes its one validated device as the required option argument", () => {
  const shell = readFileSync(new URL("./omega/ci/run-quota-backed-preflight.sh", import.meta.url), "utf8");
  assert.match(shell, /owned_loop \|\| return 1\s+#.*\s+sudo losetup --detach="\$taskLoop" \|\| return 1/);
  assert.doesNotMatch(shell, /sudo losetup --detach --/);
});
check("Daemon refuses startup when its original writable-layer quota is unsupported", () => {
  const config = JSON.parse(readFileSync(new URL("./omega/ci/quota-host-daemon.json", import.meta.url), "utf8"));
  assert.deepEqual(config, {features: {"containerd-snapshotter": false}, "storage-opts": ["overlay2.size=64m"]});
});
check("An unrelated parent mount cannot be mistaken for the exact target", () => {
  const raw = mountInfo(); raw.filesystems[0].target = "/tmp/job"; assert.throws(() => assertMountIdentity(raw, device, mount));
});
check("Only the uniquely owned constrained daemon argv can authorize stopping it", () => assert.doesNotThrow(() => assertOwnedDaemonArgs(args(), data, pidfile)));
for (const change of [a => {a[0] = "/bin/sh";}, a => {a[2] = "/var/lib/docker";}, a => {a[4] = "/var/run/docker.pid";},
  a => {a[8] = "tcp://0.0.0.0:2375";}, a => {a.push("--data-root", "/foreign");},
  a => {a[a.indexOf("--iptables=false")] = "--iptables=true";}]) {
  check("Foreign, ambiguous and network-expanded daemon identities are rejected", () => {const a = args(); change(a); assert.throws(() => assertOwnedDaemonArgs(a, data, pidfile));});
}
check("Report cannot overwrite arbitrary source or host files", () => {
  const sha = "a".repeat(40); assert.doesNotThrow(() => assertReportTarget(`/tmp/job/nyx-quota-host-${sha}.json`, "/tmp/job", sha));
  assert.throws(() => assertReportTarget("/etc/config", "/tmp/job", sha));
  assert.throws(() => assertReportTarget(`/tmp/job/../nyx-quota-host-${sha}.json`, "/tmp/job", sha));
  assert.throws(() => assertReportTarget(`/tmp/job/nyx-quota-host-${sha}.json`, "/tmp/job", "not-a-commit"));
});
check("Short host aliases and unknown daemon options cannot evade long-option validation", () => {
  assert.throws(() => assertOwnedDaemonArgs([...args(), "-H", "tcp://0.0.0.0:2375"], data, pidfile));
  assert.throws(() => assertOwnedDaemonArgs([...args(), "--tlskey", "/foreign"], data, pidfile));
});
console.log(`OMEGA_QUOTA_CI_HOST_GUARD_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
