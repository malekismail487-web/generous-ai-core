export const NYX_CONNECTOME_ABLATION = Object.freeze({
  chunkId: "OMEGA-NYX-CONNECTOME-ABLATION-001",
  version: "nyx-connectome-ablation/1",
  frozenTaskSuite: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V5",
  arms: Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_CONNECTOME"] as const),
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  taskExecutionsPerArm: 7,
  maxCognitionCyclesPerTask: 3,
  maxCandidateIterationsPerTask: 3,
  maxCognitionCorrectionsPerTask: 2,
  maxOutputTokensPerCall: 1_536,
  maxPromptBytesPerCall: 48_000,
  maxWallClockMsPerTask: 180_000,
  matchedControls: Object.freeze(["MODEL", "TASK_CONTENT", "CALL_CEILING", "OUTPUT_TOKEN_CEILING",
    "TOOL_SET", "VERIFIER", "REPAIR_CEILING", "WALL_CLOCK_CEILING", "MUTATION_SCOPE"]),
  authorityIncrease: false,
  defaultConfigurationChanged: false,
} as const);

/** The established A/B reasoning and assurance substrate, frozen before the connectome ablation was authored. */
export const NYX_CONNECTOME_ABLATION_FROZEN_CORE = Object.freeze({
  commit: "0ae64b010511106d08ae1b78dad8df43611fac0a",
  files: Object.freeze({
    "src/lib/codelab/model/nvidiaNimProvider.ts": "b4254ef147ca1855a3ce969323411a6953f76eac37b89e0a775eec3ab7f6e6c8",
    "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts": "65c488963e216a38dd83eb6f8dcf83503f195b39c0849b6eb71805455ae6de26",
    "src/lib/codelab/engine/r3BoundedRepairLoop.ts": "23337f97b70e9bfb13df84560b52199e55cb67500a7ef70e6dea9b76254b6e2d",
    "src/lib/codelab/assurance/candidateEngineeringAdmission.ts": "1fb618d25616c51757e664f5e4ca6e8390de4ec2bd8da4789c2c30d0050a6ffa",
    "src/lib/codelab/assurance/engineeringQualityOracle.ts": "af21863b9f3680330215e5464c5adcbbd050e2f313e7d71741822714e7594931",
    "src/lib/codelab/assurance/r3EvaluatorIsolation.ts": "88fc1041a194cb2900959212e644dbfa0419a6cf1a994916c233fe13e09d7cfe",
    "src/lib/codelab/assurance/holdoutAcceptanceIntegrity.ts": "5cf5edf2706dcc5be36683444e4699c5ef962dfee1668a8181e98cb251946c6e",
  }),
});
