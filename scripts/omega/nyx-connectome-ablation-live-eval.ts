if (process.env.NYX_QUALITY_SUITE && process.env.NYX_QUALITY_SUITE !== "CONNECTOME_ABLATION") {
  throw new Error("connectome_ablation_suite_override_rejected");
}

process.env.NYX_QUALITY_SUITE = "CONNECTOME_ABLATION";
await import("./nyx-quality-v4-live-eval.ts");
