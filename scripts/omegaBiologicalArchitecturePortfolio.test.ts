import { compileBiologicalArchitecturePortfolioFromSummaries,
  validBiologicalArchitecturePortfolio, knownMetricValue } from
  "../src/lib/codelab/connectome/biologicalArchitecturePortfolio";
import { NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO as pinned } from
  "../src/lib/codelab/connectome/verifiedBiologicalArchitecturePortfolio";
import { NYX_BIOLOGICAL_SOURCE_REGISTRY } from
  "../src/lib/codelab/connectome/biologicalSourceRegistry";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}
const sources = pinned.members.map((member) => ({ datasetId: member.datasetId,
  organism: member.organism, nervousSystemRegion: member.nervousSystemRegion,
  circuitDigest: member.circuitDigest, sourceConfidence: member.sourceConfidence,
  topology: member.topology, annotationCoverage: member.annotationCoverage }));
const rebuilt = compileBiologicalArchitecturePortfolioFromSummaries({
  portfolioId: pinned.portfolioId, sources: [...sources].reverse(),
});
check(validBiologicalArchitecturePortfolio(pinned) && validBiologicalArchitecturePortfolio(rebuilt),
  "pinned and reordered-source portfolios satisfy their integrity contracts");
check(rebuilt.portfolioDigest === pinned.portfolioDigest,
  "source input order does not alter the deterministic architecture portfolio");
check(pinned.members.length === 2 && new Set(pinned.members.map((member) => member.organism)).size === 2,
  "source-specific organism profiles survive rather than collapsing into an unlabeled average");
const worm = pinned.members.find((member) => member.organism.startsWith("Caenorhabditis"))!;
const fly = pinned.members.find((member) => member.organism.startsWith("Drosophila"))!;
check(worm.annotationCoverage.nodeRoles === 0 && worm.annotationCoverage.edgeSigns === 0
  && knownMetricValue(worm, "inhibitoryEdgeFraction") === null
  && knownMetricValue(worm, "inputFraction") === null,
"unannotated OpenWorm roles and signs are unknown, not measured zeros");
check(knownMetricValue(fly, "inhibitoryEdgeFraction") === fly.topology.inhibitoryEdgeFraction,
  "annotated FlyVis inhibition remains measured data");
for (const metric of ["inputFraction", "outputFraction", "inhibitoryEdgeFraction"] as const) {
  const result = pinned.metricConsensus.find((item) => item.metric === metric)!;
  check(result.observations.length === 1 && result.observations[0].datasetId === fly.datasetId
    && result.confidence < 0.5, `${metric} excludes unknown observations and lowers confidence`);
}
check(pinned.metricConsensus.find((item) => item.metric === "electricalEdgeFraction")?.observations.length === 2,
  "genuinely annotated electrical modalities retain both organisms");
check(pinned.envelope.maximumSourceSpecificInfluence <= 0.3
  && pinned.envelope.maximumPopulationBudgetRatio <= 1.2
  && pinned.modelCallsAdded === 0 && pinned.toolsAdded === 0 && !pinned.grantsAuthority,
"portfolio influence and execution authority remain bounded");
check(!validBiologicalArchitecturePortfolio({ ...pinned, portfolioDigest: "0".repeat(64) }),
  "tampered portfolio digest is rejected");
const flywireMap = NYX_BIOLOGICAL_SOURCE_REGISTRY.sources.flyWireWholeBrain;
check(flywireMap.accessState === "PINNED_MODEL_INPUT_REQUIRES_VERIFIED_LOCAL_CACHE"
  && flywireMap.admissionState === "RESEARCH_RUNTIME_ONLY_NOT_COGNITIVELY_ADMITTED"
  && flywireMap.nodeCount === 138639 && flywireMap.connectionRows === 15091983
  && !pinned.sourceDatasetIds.includes(flywireMap.datasetId),
"full FlyWire model input is tracked without falsely promoting its cognitive value");
const deferredMaps = [NYX_BIOLOGICAL_SOURCE_REGISTRY.sources.micronsCortical,
  NYX_BIOLOGICAL_SOURCE_REGISTRY.sources.wormWiringWholeAnimal];
check(deferredMaps.every((source) => source.officialMap.startsWith("https://")
  && source.admissionState.startsWith("DEFERRED")
  && !pinned.sourceDatasetIds.includes(source.datasetId)),
"official online maps are tracked as candidates, not misrepresented as admitted circuit evidence");
check(!validBiologicalArchitecturePortfolio({ ...pinned, members: [{ ...pinned.members[0],
  annotationCoverage: { ...pinned.members[0].annotationCoverage, edgeSigns: 0 } }, ...pinned.members.slice(1)] }),
"tampered annotation knowledge is rejected");
let rejected = false;
try { compileBiologicalArchitecturePortfolioFromSummaries({ portfolioId: pinned.portfolioId,
  sources: [sources[0], { ...sources[1], annotationCoverage: { ...sources[1].annotationCoverage,
    nodeRoles: -0.1 } }] }); } catch { rejected = true; }
check(rejected, "invalid annotation coverage fails closed");
const allUnknown = compileBiologicalArchitecturePortfolioFromSummaries({ portfolioId: pinned.portfolioId,
  sources: sources.map((source) => ({ ...source,
    annotationCoverage: { ...source.annotationCoverage, edgeSigns: 0 },
    topology: { ...source.topology, inhibitoryEdgeFraction: 0 },
  })) });
const missingInhibition = allUnknown.metricConsensus.find((item) => item.metric === "inhibitoryEdgeFraction")!;
check(missingInhibition.observations.length === 0 && missingInhibition.confidence === 0
  && missingInhibition.weightedMean === 0.5,
"when all sources lack sign annotations, the portfolio keeps uncertainty rather than inventing inhibition");
let inconsistentRejected = false;
try { compileBiologicalArchitecturePortfolioFromSummaries({ portfolioId: pinned.portfolioId,
  sources: [sources[0], { ...sources[1], annotationCoverage: { ...sources[1].annotationCoverage,
    edgeModalities: 0 } }] }); } catch { inconsistentRejected = true; }
check(inconsistentRejected, "coverage contradictory to observed topology is rejected");

console.log(`OMEGA_BIOLOGICAL_ARCHITECTURE_PORTFOLIO_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
