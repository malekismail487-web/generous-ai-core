#!/usr/bin/env bash
# Trusted infrastructure fixture, NEVER a NYX tool. GitHub-hosted disposable VM only.
set -Eeuo pipefail
umask 077
[[ $(uname -s) == Linux && ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted
  && ${OMEGA_ALLOW_QUOTA_HOST_SETUP:-} == 1
  && ${GITHUB_REPOSITORY:-} == malekismail487-web/generous-ai-core
  && ${GITHUB_REF_NAME:-} == sol/omega-institutional-spine ]] || exit 77
[[ ${GITHUB_SHA:-} =~ ^[a-f0-9]{40}$ && -n ${RUNNER_TEMP:-} && -d $RUNNER_TEMP ]] || exit 77
# All clients must use the same fixed local socket as the unchanged driver.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
taskTempRoot=$(realpath -e -- "$RUNNER_TEMP")
taskRepo=$(git rev-parse --show-toplevel)
taskRepo=$(realpath -e -- "$taskRepo")
[[ $taskTempRoot == /* && $taskTempRoot != / && $taskRepo != / && $(git rev-parse HEAD) == "$GITHUB_SHA" ]] || exit 77
case "$taskTempRoot/" in "$taskRepo/"*) exit 77;; esac
case "$taskRepo/" in "$taskTempRoot/"*) exit 77;; esac
git diff --quiet HEAD --
taskNode=$(command -v node)
taskGuard="$taskRepo/scripts/omega/ci/quota-host-guard.mjs"
taskConfig="$taskRepo/scripts/omega/ci/quota-host-daemon.json"
taskRoot=$(mktemp -d "$taskTempRoot/nyx-quota-host.XXXXXXXX")
[[ $(realpath -e -- "$taskRoot") == "$taskRoot" && $taskRoot == "$taskTempRoot"/nyx-quota-host.* && ! -L $taskRoot ]] || exit 77
taskImage=$(mktemp --suffix=.xfs "$taskRoot/backing.XXXXXXXX")
taskMount="$taskRoot/mount"
taskPidfile="$taskRoot/docker.pid"
taskData="$taskMount/docker"
taskLoop=""
taskMounted=0
taskDaemonStarted=0
taskPrepared=0
taskPhase=PREPARE_HOST

owned_loop() {
  [[ $taskLoop =~ ^/dev/loop[0-9]+$ && -b $taskLoop && -f $taskImage && ! -L $taskImage ]] || return 1
  [[ $(realpath -e -- "$taskImage") == "$taskImage" && $taskImage == "$taskRoot"/backing.*.xfs ]] || return 1
  local info
  info=$(sudo losetup --json --list --output NAME,BACK-FILE "$taskLoop") || return 1
  printf '%s' "$info" | "$taskNode" "$taskGuard" loop "$taskLoop" "$taskImage"
}
owned_mount() {
  owned_loop || return 1
  local info
  info=$(findmnt --json --target "$taskMount" --output TARGET,SOURCE,FSTYPE,OPTIONS) || return 1
  printf '%s' "$info" | "$taskNode" "$taskGuard" mount "$taskLoop" "$taskMount"
}
cleanup_owned_resources() {
  local pid
  if (( taskDaemonStarted )); then
    [[ -f $taskPidfile && ! -L $taskPidfile ]] || return 1
    pid=$(sudo head -c 32 -- "$taskPidfile") || return 1
    sudo "$taskNode" "$taskGuard" daemon "$pid" "$taskData" "$taskPidfile" || return 1
    sudo kill -TERM -- "$pid" || return 1
    for _ in {1..30}; do
      if ! sudo kill -0 -- "$pid" 2>/dev/null; then break; fi
      sleep 1
    done
    if sudo kill -0 -- "$pid" 2>/dev/null; then return 1; fi
  fi
  if (( taskMounted )); then
    owned_mount || return 1
    sudo umount -- "$taskMount" || return 1
    if mountpoint -q -- "$taskMount"; then return 1; fi
  fi
  if [[ -n $taskLoop ]]; then
    owned_loop || return 1
    # --detach REQUIRES an argument: a separate -- would become the device.
    sudo losetup --detach="$taskLoop" || return 1
    # Absence of THIS association is required, not absence of unrelated loops.
    local after
    after=$(sudo losetup --associated "$taskImage" --noheadings --output NAME) || return 1
    [[ -z $after ]] || return 1
  fi
}
finish() {
  local code=$? cleanup=0 unchanged=0
  trap - EXIT
  set +e
  if cleanup_owned_resources; then cleanup=1; else code=1; fi
  if git -C "$taskRepo" diff --quiet HEAD --; then unchanged=1; else code=1; fi
  if ! "$taskNode" "$taskGuard" report "$taskTempRoot/nyx-quota-host-$GITHUB_SHA.json" "$GITHUB_SHA" "$taskPhase" "$taskPrepared" "$cleanup" "$unchanged"; then code=1; fi
  if [[ $taskPrepared != 1 ]]; then code=1; fi
  exit "$code"
}
trap finish EXIT
[[ -f $taskImage && ! -L $taskImage && $(stat -c %s -- "$taskImage") == 0 ]] || exit 1
[[ $(realpath -e -- "$taskImage") == "$taskImage" && $taskImage == "$taskRoot"/backing.*.xfs ]] || exit 1
truncate --size=2G -- "$taskImage"
taskPhase=ATTACH_LOOP
taskLoop=$(sudo losetup --find --show --nooverlap -- "$taskImage")
owned_loop
taskPhase=FORMAT_OWNED_XFS
# No force flag: a pre-existing filesystem must make formatting fail closed.
if sudo blkid -p "$taskLoop" >/dev/null; then exit 1; else taskSignatureStatus=$?; [[ $taskSignatureStatus == 2 ]] || exit 1; fi
owned_loop
sudo mkfs.xfs -q "$taskLoop"
mkdir -m 700 -- "$taskMount"
[[ ! -L $taskMount && $(realpath -e -- "$taskMount") == "$taskMount" ]] || exit 1
taskPhase=MOUNT_PROJECT_QUOTA
owned_loop
# Docker's trusted quota controller creates a root-only backingFsBlockDev here
# and passes that node to quotactl. nodev makes that kernel lookup fail. This
# private daemon metadata mount is NOT mounted into a task container; the
# unchanged container contract still grants no devices, mounts or capabilities.
sudo mount -t xfs -o pquota,nosuid,dev -- "$taskLoop" "$taskMount"
taskMounted=1
owned_mount
taskPhase=START_OWNED_DAEMON
# Only the disposable worker's daemon is stopped. Its original data is untouched.
sudo systemctl stop docker.service docker.socket
# The private log belongs to the runner; only the daemon is elevated.
{
  sudo dockerd --config-file "$taskConfig" --data-root "$taskData" --exec-root "$taskRoot/exec" \
    --pidfile "$taskPidfile" --host unix:///var/run/docker.sock --storage-driver overlay2 \
    --iptables=false --ip6tables=false --bridge=none --ip-forward=false --ip-masq=false
} >"$taskRoot/daemon.log" 2>&1 &
taskDaemonStarted=1
ready=0
for _ in {1..60}; do
  if current=$(DOCKER_CONFIG=/nonexistent-nyx-docker-config docker info --format '{{.DockerRootDir}}' 2>/dev/null) && [[ $current == "$taskData" ]]; then ready=1; break; fi
  sleep 1
done
[[ $ready == 1 && -f $taskPidfile && ! -L $taskPidfile ]] || exit 1
pid=$(sudo head -c 32 -- "$taskPidfile")
sudo "$taskNode" "$taskGuard" daemon "$pid" "$taskData" "$taskPidfile"
owned_mount
taskPhase=RUN_EXISTING_QUOTA_PROBE
OMEGA_ALLOW_STORAGE_QUOTA_PREFLIGHT=1 node --experimental-strip-types --import ./scripts/w0rs/register-typescript-loader.mjs scripts/omega/nyx-docker-storage-preflight.ts
node --input-type=module -e 'import fs from "node:fs";const p=process.env.RUNNER_TEMP+"/nyx-storage-preflight-"+process.env.GITHUB_SHA+".json";const r=JSON.parse(fs.readFileSync(p,"utf8"));if(r.state!=="PASS"||r.cleanupVerified!==true||r.nyxCapabilityGranted!==false||r.modelCalls!==0||r.benchmarkTasksExecuted!==0)throw Error("existing_quota_probe_not_passed");'
taskPrepared=1
taskPhase=EXISTING_QUOTA_PROBE_PASSED
