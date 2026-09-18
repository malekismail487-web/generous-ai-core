if (process.env.NYX_QUALITY_SUITE
  && process.env.NYX_QUALITY_SUITE !== "BIOLOGICAL_CONNECTOME_ABLATION") {
  throw new Error("biological_connectome_ablation_suite_override_rejected");
}

process.env.NYX_QUALITY_SUITE = "BIOLOGICAL_CONNECTOME_ABLATION";
await import("./nyx-quality-v4-live-eval.ts");

