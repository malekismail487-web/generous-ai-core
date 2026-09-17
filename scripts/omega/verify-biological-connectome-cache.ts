import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  analyzeBiologicalTopology,
  compileEpistemicArchitectureProfile,
  compileHybridBiologicalPrior,
  importFlyVisConnectome,
  importOpenWormConnectome,
} from "../../src/lib/codelab/connectome/biologicalCircuitIR";
import { NYX_BIOLOGICAL_SOURCE_REGISTRY } from "../../src/lib/codelab/connectome/biologicalSourceRegistry";

const rootInput = process.env.NYX_CONNECTOME_CACHE_ROOT?.trim();
if (!rootInput || !isAbsolute(rootInput)) {
  console.error("NYX_BIOLOGICAL_CACHE result=BLOCKED reason=absolute_cache_root_required");
  process.exit(2);
}
const root = resolve(rootInput);
const inside = (base: string, target: string): boolean => {
  const rel = relative(base, target);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
function repositoryPath(name: string): string {
  const path = resolve(root, name);
  if (!inside(root, path)) throw new Error("biological_cache_repository_escape");
  return path;
}
async function artifact(repository: string, artifactPath: string, expectedHash: string): Promise<string> {
  const absolute = resolve(repository, artifactPath);
  if (!inside(repository, absolute)) throw new Error("biological_cache_artifact_escape");
  const content = await readFile(absolute, "utf8");
  const observed = createHash("sha256").update(content).digest("hex");
  if (observed !== expectedHash.toLowerCase()) throw new Error("biological_cache_artifact_digest_mismatch");
  return content;
}
function commit(repository: string, expected: string): void {
  const observed = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  if (observed !== expected) throw new Error("biological_cache_source_commit_mismatch");
}

const flySource = NYX_BIOLOGICAL_SOURCE_REGISTRY.sources.flyvisFib25Fib19;
const wormSource = NYX_BIOLOGICAL_SOURCE_REGISTRY.sources.openWormWhiteWhole;
const flyRepository = repositoryPath("flyvis");
const wormRepository = repositoryPath("openworm-connectome-toolbox");
commit(flyRepository, flySource.sourceCommit);
commit(wormRepository, wormSource.sourceCommit);
const flyRaw = JSON.parse(await artifact(flyRepository, flySource.artifactPath, flySource.artifactSha256));
const wormRaw = JSON.parse(await artifact(wormRepository, wormSource.artifactPath, wormSource.artifactSha256));
const fly = importFlyVisConnectome(flyRaw, flySource);
const worm = importOpenWormConnectome(wormRaw, wormSource);
const prior = compileHybridBiologicalPrior([fly, worm], "nyx:hybrid-biological-prior:v1");
const profile = compileEpistemicArchitectureProfile(prior);
console.log(JSON.stringify({ result: "VERIFIED", rawDataCommittedToProductRepository: false,
  sources: [
    { datasetId: fly.provenance.datasetId, circuitDigest: fly.circuitDigest,
      topology: analyzeBiologicalTopology(fly) },
    { datasetId: worm.provenance.datasetId, circuitDigest: worm.circuitDigest,
      topology: analyzeBiologicalTopology(worm) },
  ], prior: { priorId: prior.priorId, priorDigest: prior.priorDigest,
    motifs: prior.motifs.map((item) => ({ kind: item.kind, strength: item.strength })) },
  profile, secretsAccessed: false, networkAccessed: false, filesModified: false }, null, 2));
