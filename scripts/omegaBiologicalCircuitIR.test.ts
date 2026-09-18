import {
  BIOLOGICAL_CIRCUIT_AUTHORITY,
  analyzeBiologicalTopology,
  compileEpistemicArchitectureProfile,
  compileHybridBiologicalPrior,
  importFlyVisConnectome,
  importOpenWormConnectome,
  validBiologicalCircuit,
  validEpistemicArchitectureProfile,
  validHybridBiologicalPrior,
  type BiologicalSourceProvenance,
} from "../src/lib/codelab/connectome/biologicalCircuitIR";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
function throws(action: () => unknown, message: string): boolean {
  try { action(); return false; }
  catch (error) { return error instanceof Error && error.message === message; }
}
function provenance(datasetId: string, organism: string, hash: string): BiologicalSourceProvenance {
  return { datasetId, organism, nervousSystemRegion: "bounded test circuit",
    sourceRepository: "https://example.invalid/research/connectome", sourceCommit: "a".repeat(40),
    artifactPath: "connectome/data.json", artifactSha256: hash.repeat(64).slice(0, 64), licenseId: "MIT",
    evidenceClass: "E2", sourceConfidence: 0.9, retrievedAt: "2026-09-17T00:00:00.000Z" };
}

const flyRaw = {
  nodes: [{ name: "R1" }, { name: "L1" }, { name: "Mi1" }, { name: "T4a" }],
  input_units: ["R1"], output_units: ["T4a"],
  edges: [
    { src: "R1", tar: "L1", offsets: [[[[0, 0]], 40]], alpha: -1,
      alpha_references: ["Hardie1989"], edge_type: "chem" },
    { src: "L1", tar: "Mi1", offsets: [[[[0, 0]], 28]], alpha: 1,
      alpha_references: ["Takemura2017"], edge_type: "chem" },
    { src: "Mi1", tar: "L1", offsets: [[[[0, 0]], 3]], alpha: 1,
      alpha_references: ["Takemura2017"], edge_type: "chem" },
    { src: "Mi1", tar: "T4a", offsets: [[[[0, 0]], 18]], alpha: 1,
      alpha_references: ["Takemura2017"], edge_type: "chem" },
  ],
};
const fly = importFlyVisConnectome(flyRaw, provenance("fly:test", "Drosophila melanogaster", "b"));
check(validBiologicalCircuit(fly) && fly.nodes.length === 4 && fly.edges.length === 4,
  "FlyVis importer produces a digest-valid normalized graph");
check(fly.nodes.find((node) => node.nodeId === "R1")?.role === "INPUT"
  && fly.nodes.find((node) => node.nodeId === "T4a")?.role === "OUTPUT",
"FlyVis input and output roles survive normalization");
check(fly.edges.some((edge) => edge.sign === "INHIBITORY" && edge.sourceReferences.includes("Hardie1989")),
  "FlyVis sign and literature-reference information survive normalization");
check(fly.edges.every((edge) => edge.normalizedWeight > 0 && edge.normalizedWeight <= 1),
  "raw synapse counts become bounded monotonic weights");

const wormRaw = { nodes: ["A", "B", "C", "D"], connections: {
  Generic_GJ: [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]],
  Generic_CS: [[0, 3, 0, 0], [0, 0, 2, 0], [1, 0, 0, 4], [0, 0, 0, 0]],
} };
const worm = importOpenWormConnectome(wormRaw, provenance("worm:test", "Caenorhabditis elegans", "c"));
check(validBiologicalCircuit(worm) && worm.nodes.length === 4 && worm.edges.length === 8,
  "OpenWorm layered matrices become explicit typed directed edges");
check(worm.edges.filter((edge) => edge.modality === "ELECTRICAL").length === 4
  && worm.edges.filter((edge) => edge.modality === "CHEMICAL").length === 4,
"OpenWorm electrical and chemical layers remain distinct");

const flyMetrics = analyzeBiologicalTopology(fly);
const wormMetrics = analyzeBiologicalTopology(worm);
check(flyMetrics.inputFraction === 0.25 && flyMetrics.outputFraction === 0.25
  && flyMetrics.inhibitoryEdgeFraction === 0.25,
"topology analysis measures role and sign structure deterministically");
check(wormMetrics.electricalEdgeFraction === 0.5 && wormMetrics.reciprocalEdgeFraction > 0,
  "topology analysis measures multi-modal reciprocal coupling");
check(flyMetrics.recurrentCoreFraction > 0 && wormMetrics.recurrentCoreFraction > 0,
  "strongly connected recurrent cores are derived from graph structure");

const prior = compileHybridBiologicalPrior([worm, fly], "nyx:test-hybrid-prior");
check(validHybridBiologicalPrior(prior) && prior.sourceOrganisms.length === 2,
  "hybrid prior requires and preserves distinct organism sources");
check(prior.motifs.length === 7 && new Set(prior.motifs.map((item) => item.kind)).size === 7,
  "compiler emits explicit non-duplicated computational motifs");
check(prior.motifs.every((item) => item.grantsAuthority === false
  && item.falsificationCondition.length > 10 && item.limitations.length > 0),
"every motif is authority-neutral, falsifiable, and limitation-bearing");
check(prior.sourceDatasetIds.join(",") === "fly:test,worm:test",
  "source ordering is deterministic rather than dependent on caller order");

const profile = compileEpistemicArchitectureProfile(prior);
check(validEpistemicArchitectureProfile(profile) && profile.sourcePriorDigest === prior.priorDigest
  && profile.modelCallsAdded === 0
  && profile.toolsAdded === 0 && profile.grantsAuthority === false,
"architecture profile can tune local structure without adding model, tool, or execution authority");
check([profile.evidenceCopiesMultiplier, profile.hypothesisCopiesMultiplier,
  profile.falsifierCopiesMultiplier, profile.integratorCopiesMultiplier,
  profile.inhibitoryCopiesMultiplier, profile.uncertaintyCopiesMultiplier,
  profile.actionCopiesMultiplier, profile.routingFanoutMultiplier,
  profile.recurrenceCyclesMultiplier].every((value) => value >= 0.5 && value <= 1.5),
"biological influence is bounded rather than allowed to destabilize population scale");
check(prior.authority === BIOLOGICAL_CIRCUIT_AUTHORITY && prior.grantsAuthority === false,
  "compiled biological knowledge is not an Omega authority primitive");

check(throws(() => importFlyVisConnectome({ ...flyRaw, edges: [{ ...flyRaw.edges[0], tar: "missing" }] },
  provenance("fly:bad", "Drosophila melanogaster", "d")), "flyvis_edge_invalid"),
"FlyVis importer fails closed on dangling anatomy");
check(throws(() => importOpenWormConnectome({ nodes: ["A", "B"], connections: {
  Generic_CS: [[0, 1]],
} }, provenance("worm:bad", "Caenorhabditis elegans", "e")), "openworm_matrix_invalid"),
"OpenWorm importer fails closed on malformed matrices");
check(throws(() => compileHybridBiologicalPrior([fly, fly], "nyx:duplicate"),
  "hybrid_biological_prior_sources_invalid"),
"a duplicate dataset cannot masquerade as cross-species corroboration");
check(!validBiologicalCircuit({ ...fly, grantsAuthority: true } as unknown as typeof fly),
  "tampering biological IR into an authority-bearing object invalidates it");
check(!validBiologicalCircuit({ ...fly, edges: [{ ...fly.edges[0], normalizedWeight: 0 }, ...fly.edges.slice(1)] }),
  "normalized edge-weight tampering invalidates the circuit rather than being silently recomputed");
check(!validHybridBiologicalPrior({ ...prior, priorDigest: "f".repeat(64) }),
  "hybrid prior digest detects post-compilation mutation");
check(!validEpistemicArchitectureProfile({ ...profile, recurrenceCyclesMultiplier: 1.5 }),
  "architecture profile digest detects post-compilation mutation");
check(!validEpistemicArchitectureProfile({ ...profile, modelCallsAdded: 1 } as unknown as typeof profile),
  "architecture profile cannot silently add model computation");

console.log(`OMEGA_BIOLOGICAL_CIRCUIT_IR_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
