if (process.env.NYX_QUALITY_SUITE
  && process.env.NYX_QUALITY_SUITE !== "CONTRASTIVE_CIRCUIT_ABLATION") {
  throw new Error("contrastive_circuit_ablation_suite_override_rejected");
}
process.env.NYX_QUALITY_SUITE = "CONTRASTIVE_CIRCUIT_ABLATION";
await import("./nyx-quality-v4-live-eval.ts");
