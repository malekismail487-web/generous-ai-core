// ============================================================================
//  unified-optimize — Stage 14 edge function
// ----------------------------------------------------------------------------
//  Runs one end-to-end optimisation pass against the unified objective using
//  a recent slice of `unified_policy_decisions` + `graded_events`. Persists
//  the candidate weights to `unified_policy_weights` (inactive by default)
//  and the run breakdown to `unified_objective_runs`. Promotion is a
//  separate, explicit action (`promote=true`) so a faulty gradient step can
//  never silently degrade live behaviour.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  evaluateObjective, gradientStep, LAMBDA_DEFAULTS, DEFAULT_UNIFIED_WEIGHTS,
} from "../_shared/unifiedObjective.ts";
import { buildAlignmentFromSeed } from "../_shared/symbolicNeuralAlignment.ts";
import type { PolicyWeights } from "../_shared/unifiedPolicy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { sampleLimit?: number; learningRate?: number; promote?: boolean } = {};
  try { body = await req.json(); } catch { /* default */ }
  const limit = Math.min(2000, Math.max(50, body.sampleLimit ?? 500));
  const lr = body.learningRate ?? 0.02;
  const promote = body.promote === true;

  const started = new Date().toISOString();

  // Fetch active weights & alignment.
  const { data: activeWeightsRow } = await admin
    .from("unified_policy_weights").select("*")
    .eq("is_active", true).order("promoted_at", { ascending: false })
    .limit(1).maybeSingle();
  const weights: PolicyWeights = activeWeightsRow?.weights as PolicyWeights
    ?? DEFAULT_UNIFIED_WEIGHTS;

  const { data: alignmentRow } = await admin
    .from("symbolic_alignment_matrices").select("*")
    .eq("is_active", true).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  const alignment = alignmentRow
    ? {
        standardIds: alignmentRow.standard_ids as string[],
        forward: alignmentRow.forward as number[][],
        inverse: alignmentRow.inverse as number[][],
        forwardBias: alignmentRow.forward_bias as number[],
      }
    : buildAlignmentFromSeed([]);

  // Pull samples from the decisions log; join realised reward.
  const { data: decisions, error } = await admin
    .from("unified_policy_decisions")
    .select("z_vector, action, joint_propensity, realised_reward, created_at")
    .not("realised_reward", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const samples = (decisions ?? []).map((d) => ({
    z: d.z_vector as number[],
    reward: Number(d.realised_reward ?? 0),
    behaviourPropensity: Number(d.joint_propensity ?? 1e-3),
    nextCorrect: (Number(d.realised_reward ?? 0) >= 0.5 ? 1 : 0) as 0 | 1,
    predictedP: 0.5 + 0.4 * Number(d.realised_reward ?? 0),
  }));

  if (samples.length < 20) {
    return new Response(JSON.stringify({
      status: "skipped",
      reason: "insufficient samples",
      sampleCount: samples.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const breakdownBefore = evaluateObjective({
    samples, weights, alignment, lambdas: LAMBDA_DEFAULTS,
  });
  const step = gradientStep({
    samples, weights, alignment, learningRate: lr, lambdas: LAMBDA_DEFAULTS,
  });
  const breakdownAfter = evaluateObjective({
    samples, weights: step.newWeights, alignment, lambdas: LAMBDA_DEFAULTS,
  });

  const candidateVersion = `cand-${Date.now()}`;
  const improved = step.lossAfter < step.lossBefore;

  await admin.from("unified_policy_weights").insert({
    version: candidateVersion,
    weights: { ...step.newWeights, version: candidateVersion },
    lambdas: LAMBDA_DEFAULTS,
    is_active: false,
  });

  if (promote && improved) {
    await admin.from("unified_policy_weights").update({ is_active: false }).eq("is_active", true);
    await admin.from("unified_policy_weights")
      .update({ is_active: true, promoted_at: new Date().toISOString() })
      .eq("version", candidateVersion);
  }

  await admin.from("unified_objective_runs").insert({
    started_at: started, finished_at: new Date().toISOString(),
    sample_count: samples.length,
    loss_before: step.lossBefore, loss_after: step.lossAfter,
    breakdown_before: breakdownBefore, breakdown_after: breakdownAfter,
    candidate_version: candidateVersion,
    promoted: promote && improved,
    notes: improved ? "loss decreased" : "loss did not improve",
  });

  return new Response(JSON.stringify({
    status: "ok",
    sampleCount: samples.length,
    candidateVersion,
    improved,
    promoted: promote && improved,
    lossBefore: step.lossBefore,
    lossAfter: step.lossAfter,
    breakdownBefore,
    breakdownAfter,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
