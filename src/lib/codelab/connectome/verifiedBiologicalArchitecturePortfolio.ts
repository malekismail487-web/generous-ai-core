import {
  compileBiologicalArchitecturePortfolioFromSummaries,
  validBiologicalArchitecturePortfolio,
} from "./biologicalArchitecturePortfolio";

/**
 * Compact, inference-safe compilation input derived from the pinned source artifacts.
 * Raw connectomes remain outside the product repository. The cache verifier rebuilds
 * these summaries and the resulting portfolio from the exact source commits and bytes.
 */
export const NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO =
  compileBiologicalArchitecturePortfolioFromSummaries({
    portfolioId: "nyx:biological-architecture-portfolio:v1",
    sources: [
      {
        datasetId: "flyvis:fib25-fib19-v2.2",
        organism: "Drosophila melanogaster",
        nervousSystemRegion: "optic-lobe visual system",
        circuitDigest: "edb12e319af6e579a39a65bb62114b71fc0f2063309e48479906290d40c5624d",
        sourceConfidence: 0.95,
        annotationCoverage: { nodeRoles: 1, edgeSigns: 1, edgeModalities: 1 },
        topology: {
          nodes: 65,
          edges: 605,
          density: 0.139663461538,
          sparsity: 0.860336538462,
          inputFraction: 0.123076923077,
          outputFraction: 0.523076923077,
          inhibitoryEdgeFraction: 0.376859504132,
          electricalEdgeFraction: 0,
          reciprocalEdgeFraction: 0.462809917355,
          recurrentCoreFraction: 0.938461538462,
          meanNormalizedWeight: 0.405303440927,
          outDegreeCoefficientOfVariation: 0.765969032115,
          inDegreeCoefficientOfVariation: 0.558716806298,
          hubOutflowConcentration: 0.289256198347,
          maximumOutDegree: 29,
          maximumInDegree: 24,
        },
      },
      {
        datasetId: "openworm:white-whole",
        organism: "Caenorhabditis elegans",
        nervousSystemRegion: "whole nervous system",
        circuitDigest: "2b58169961086adc1f1d6c2e3ab280233807f114932b41e7cac313a6f448d433",
        sourceConfidence: 0.9,
        annotationCoverage: { nodeRoles: 0, edgeSigns: 0, edgeModalities: 1 },
        topology: {
          nodes: 309,
          edges: 3530,
          density: 0.037027697222,
          sparsity: 0.962972302778,
          inputFraction: 0,
          outputFraction: 0,
          inhibitoryEdgeFraction: 0,
          electricalEdgeFraction: 0.324079320113,
          reciprocalEdgeFraction: 0.503966005666,
          recurrentCoreFraction: 0.970873786408,
          meanNormalizedWeight: 0.304790189996,
          outDegreeCoefficientOfVariation: 0.822052290588,
          inDegreeCoefficientOfVariation: 1.049946335532,
          hubOutflowConcentration: 0.273937677054,
          maximumOutDegree: 83,
          maximumInDegree: 114,
        },
      },
    ],
  });

export const NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO_DIGEST =
  "585e230610c5463d05cc2224a34dc5d797df2bbf73d8fc052884e34d5919ed63" as const;

if (!validBiologicalArchitecturePortfolio(NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO)
  || NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO.portfolioDigest
  !== NYX_VERIFIED_BIOLOGICAL_ARCHITECTURE_PORTFOLIO_DIGEST) {
  throw new Error("verified_biological_architecture_portfolio_invalid");
}
