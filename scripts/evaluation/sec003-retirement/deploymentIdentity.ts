import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  ALE_RETIREMENT_CONFIG_ARTIFACT,
  ALE_RETIREMENT_GATEWAY_ARTIFACT,
  ALE_RETIREMENT_HANDLER_ARTIFACT,
  ALE_RETIREMENT_MIGRATION_ARTIFACT,
  REVIEWED_ALE_RETIREMENT_ARTIFACTS,
  REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT,
} from "./contracts";

export interface Sec003DeploymentIdentityReport {
  readonly designatedDeploymentCommit: string;
  readonly reviewedImplementationCommit: string;
  readonly reviewedBaselineIsAncestor: boolean;
  readonly runtimeArtifactsExact: boolean;
  readonly migrationArtifactExact: boolean;
  readonly legacyCredentialAcceptanceReintroduced: boolean;
  readonly securityBehaviorChanged: boolean;
  readonly legacyAcceptanceScanPassed: boolean;
  readonly reviewedArtifactDigests: Readonly<Record<string, string>>;
  readonly changedPaths: readonly string[];
  readonly identityEvidenceRef: string;
  readonly legacyAcceptanceScanEvidenceRef: string;
  readonly issues: readonly string[];
}

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).replace(/\r\n?/g, "\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function commitExists(repositoryRoot: string, commit: string): boolean {
  try { git(repositoryRoot, ["cat-file", "-e", `${commit}^{commit}`]); return true; } catch { return false; }
}

function isAncestor(repositoryRoot: string, ancestor: string, descendant: string): boolean {
  try { execFileSync("git", ["-C", repositoryRoot, "merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" }); return true; } catch { return false; }
}

function grepPaths(repositoryRoot: string, commit: string, pattern: string, scope: string): readonly string[] {
  const result = spawnSync("git", ["-C", repositoryRoot, "grep", "-l", "-E", pattern, commit, "--", scope], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status === 1) return [];
  if (result.status !== 0) throw new Error(`git grep failed for ${scope}: ${result.stderr.trim()}`);
  return result.stdout.replace(/\r\n?/g, "\n").trim().split("\n").filter(Boolean).map((line) => line.replace(/^[0-9a-f]{40}:/, ""));
}

export function inspectSec003DeploymentIdentity(repositoryRootInput: string, deploymentCommit: string): Sec003DeploymentIdentityReport {
  const repositoryRoot = resolve(repositoryRootInput);
  const issues: string[] = [];
  const commitValid = /^[0-9a-f]{40}$/.test(deploymentCommit) && commitExists(repositoryRoot, deploymentCommit);
  if (!commitValid) issues.push("deployment_commit_not_found");

  const baselineIsAncestor = commitValid && isAncestor(repositoryRoot, REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT, deploymentCommit);
  if (!baselineIsAncestor) issues.push("reviewed_implementation_not_ancestor");

  const digests: Record<string, string> = {};
  if (commitValid) {
    for (const artifact of REVIEWED_ALE_RETIREMENT_ARTIFACTS) {
      try { digests[artifact.path] = sha256(git(repositoryRoot, ["show", `${deploymentCommit}:${artifact.path}`])); }
      catch { issues.push(`deployment_artifact_unavailable:${artifact.path}`); }
    }
  }
  const exact = (path: string): boolean => {
    const reviewed = REVIEWED_ALE_RETIREMENT_ARTIFACTS.find((artifact) => artifact.path === path);
    return reviewed !== undefined && digests[path] === reviewed.sha256;
  };
  const runtimeArtifactsExact = [ALE_RETIREMENT_GATEWAY_ARTIFACT, ALE_RETIREMENT_HANDLER_ARTIFACT, ALE_RETIREMENT_CONFIG_ARTIFACT].every(exact);
  const migrationArtifactExact = exact(ALE_RETIREMENT_MIGRATION_ARTIFACT);
  if (!runtimeArtifactsExact) issues.push("reviewed_runtime_artifact_changed");
  if (!migrationArtifactExact) issues.push("reviewed_migration_artifact_changed");

  const changedPaths = commitValid && baselineIsAncestor
    ? git(repositoryRoot, ["diff", "--name-only", `${REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT}..${deploymentCommit}`]).trim().split("\n").filter(Boolean)
    : [];

  const acceptanceMatches: string[] = [];
  if (commitValid) {
    const applicationMatches = grepPaths(repositoryRoot, deploymentCommit, "functions[.]invoke[[:space:]]*[(][[:space:]]*[\"'`]ale-api[\"'`]|functions/v1/ale-api", "src");
    const edgeMatches = grepPaths(repositoryRoot, deploymentCommit, "ale_api_keys|ale_live_|functions/v1/ale-api", "supabase/functions")
      .filter((path) => !path.startsWith("supabase/functions/ale-api/"));
    acceptanceMatches.push(...applicationMatches, ...edgeMatches);
  }
  const legacyAcceptanceScanPassed = commitValid && acceptanceMatches.length === 0;
  if (!legacyAcceptanceScanPassed) issues.push(...acceptanceMatches.map((path) => `legacy_acceptance_path_detected:${path}`));

  return Object.freeze({
    designatedDeploymentCommit: deploymentCommit,
    reviewedImplementationCommit: REVIEWED_ALE_RETIREMENT_IMPLEMENTATION_COMMIT,
    reviewedBaselineIsAncestor: baselineIsAncestor,
    runtimeArtifactsExact,
    migrationArtifactExact,
    legacyCredentialAcceptanceReintroduced: !legacyAcceptanceScanPassed,
    securityBehaviorChanged: !runtimeArtifactsExact || !migrationArtifactExact,
    legacyAcceptanceScanPassed,
    reviewedArtifactDigests: Object.freeze({ ...digests }),
    changedPaths: Object.freeze(changedPaths),
    identityEvidenceRef: `git://${deploymentCommit}/sec003-deployment-identity`,
    legacyAcceptanceScanEvidenceRef: `git://${deploymentCommit}/sec003-legacy-acceptance-scan`,
    issues: Object.freeze([...new Set(issues)]),
  });
}
