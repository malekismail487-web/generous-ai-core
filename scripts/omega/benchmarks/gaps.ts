import { z } from "zod";
import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import { digestSchema, FAILURE_CLASSES, jsonValue } from "./contracts";

// A small, exportable record for the existing capability-gap program, not another durable service.
export const GAP_STEPS = ["CLASSIFIED", "DEVELOPMENT_REPRODUCED", "MECHANISM_TESTED", "ABLATED",
  "FRESH_TRANSFER_VERIFIED", "BENCHMARK_REEVALUATION_ELIGIBLE"] as const;
const stepEvidenceSchema = z.object({ step: z.enum(GAP_STEPS), evidenceDigest: digestSchema,
  corpusDigest: digestSchema, tier: z.enum(["DEVELOPMENT", "VALIDATION"]),
  inputDigests: z.array(digestSchema).min(1).max(10000),
  comparison: z.enum(["NOT_APPLICABLE", "MECHANISM_OFF_VS_ON"]), matchedCompute: z.boolean(),
  improvement: z.enum(["NOT_MEASURED", "SUPPORTED", "REFUTED", "INCONCLUSIVE"]),
}).strict();
export type GapEvidence = z.infer<typeof stepEvidenceSchema>;
const gapSchema = z.object({ schemaVersion: z.literal(1), gapId: z.string().min(1).max(200),
  failureClass: z.enum(FAILURE_CLASSES), capabilityClass: z.string().min(1).max(500),
  benchmarkTaskDigest: digestSchema, failureEvidenceDigest: digestSchema,
  benchmarkInputDigest: digestSchema,
  steps: z.array(stepEvidenceSchema).max(GAP_STEPS.length), grantsAuthority: z.literal(false),
}).strict();
export type CapabilityGap = z.infer<typeof gapSchema>;
export function createCapabilityGap(gap: Omit<CapabilityGap, "schemaVersion" | "steps" | "grantsAuthority">): CapabilityGap {
  return immutableTheoryValue(gapSchema.parse({ ...gap, schemaVersion: 1, steps: [], grantsAuthority: false }));
}
export function advanceCapabilityGap(raw: CapabilityGap, rawEvidence: GapEvidence): CapabilityGap {
  const gap = gapSchema.parse(jsonValue(raw)); const evidence = stepEvidenceSchema.parse(jsonValue(rawEvidence));
  // Revalidate full history as well as the newly appended event. Serialized bogus progress fails closed.
  const next = [...gap.steps, evidence];
  if (next.length > GAP_STEPS.length) throw Error("benchmark_gap_already_resolved");
  for (let index = 0; index < next.length; index++) {
    const item = next[index];
    if (item.step !== GAP_STEPS[index] || item.corpusDigest === gap.benchmarkTaskDigest)
      throw Error("benchmark_gap_requires_general_development_reproduction");
    if (item.inputDigests.includes(gap.benchmarkInputDigest)) throw Error("benchmark_gap_exact_benchmark_input_reuse");
    if (index <= 3 && item.tier !== "DEVELOPMENT") throw Error("benchmark_gap_development_tier");
    if (index === 2 && item.inputDigests.some(d => next[1].inputDigests.includes(d)))
      throw Error("benchmark_gap_separate_development_examples");
    if (index === 3 && (item.comparison !== "MECHANISM_OFF_VS_ON" || !item.matchedCompute || item.improvement !== "SUPPORTED"))
      throw Error("benchmark_gap_ablation_not_supported");
    if (index >= 4 && (item.tier !== "VALIDATION" || item.improvement !== "SUPPORTED" || !item.matchedCompute
      || next.slice(0, 4).some(prior => prior.corpusDigest === item.corpusDigest
        || prior.inputDigests.some(d => item.inputDigests.includes(d))))) throw Error("benchmark_gap_fresh_transfer_required");
  }
  return immutableTheoryValue({ ...gap, steps: next });
}
export function gapExport(gap: CapabilityGap) {
  const checked = gapSchema.parse(jsonValue(gap));
  // Final flag is derived from a revalidated sequence, not trusted from serialized input.
  if (checked.steps.length) advanceCapabilityGap({ ...checked, steps: checked.steps.slice(0, -1) }, checked.steps.at(-1)!);
  const body = { ...checked, benchmarkReevaluationEligible: checked.steps.length === GAP_STEPS.length,
    status: checked.steps.at(-1)?.step ?? "OBSERVED", corpusCoverage: "PARTIAL_JUST_IN_TIME",
    custody: "CALLER_ATTESTED_NOT_AUTHENTICATED", semanticIndependenceProvedByDigests: false };
  return immutableTheoryValue({ ...body, recordDigest: theoryDigest(body) });
}
