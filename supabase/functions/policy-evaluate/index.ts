// ============================================================================
//  policy-evaluate — Stage 11 edge function
// ----------------------------------------------------------------------------
//  Counterfactual off-policy evaluation. Pulls a window of bandit_decisions
//  (joined to their realised rewards), then scores three candidate policies
//    1. linucb_current   — the live LinUCB θ at evaluation time
//    2. uniform_random   — sanity lower bound
//    3. greedy_2pl       — argmax over the 2PL prior of expected reward
//  with three estimators (IPS, SNIPS, Doubly-Robust). Also computes
//  cumulative regret against an empirical oracle. Results persist to
//  policy_evaluation_runs / _results for the admin dashboard.
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  cumulativeRegret,
  type DecisionLogRow,
  epsilonGreedyPolicy,
  evaluateDR,
  evaluateIPS,
  evaluateSNIPS,
  type TargetPolicy,
  uniformPolicy,
} from "../_shared/doublyRobust.ts";
import {
  ARM_IDS,
  type LinUcbArmState,
  LINUCB_DEFAULTS,
  scoreArm,
} from "../_shared/linucb.ts";
import { softmaxPropensity } from "../_shared/propensity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  subject?: string;
  windowDays?: number;
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const windowDays = Math.max(1, Math.min(90, body.windowDays ?? 14));
    const start = new Date(Date.now() - windowDays * 86400_000).toISOString();
    const end = new Date().toISOString();

    // 1) Pull decisions in window. Only rows with realised reward + behaviour_prob
    //    are usable for OPE.
    let q = admin.from("bandit_decisions").select(
      "id,user_id,subject,arm_id,context_vec,behaviour_prob,propensity_dist,reward,rewarded,created_at",
    )
      .eq("rewarded", true)
      .not("behaviour_prob", "is", null)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (body.subject) q = q.eq("subject", body.subject);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "no eligible decisions", n: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const log: DecisionLogRow[] = rows.map((r: any) => ({
      x: Array.isArray(r.context_vec) ? r.context_vec : [],
      chosenArm: r.arm_id,
      behaviourProb: Math.max(0.01, Number(r.behaviour_prob) || 0.01),
      reward: Math.max(0, Math.min(1, Number(r.reward) || 0)),
    })).filter((r) => r.x.length > 0);

    const meanBehaviourReward =
      log.reduce((s, r) => s + r.reward, 0) / log.length;

    // 2) Build candidate target policies.
    // (a) Current LinUCB — load latest arm state per subject. We average over
    //     decisions' subjects in the window for a coherent policy.
    const subjects = body.subject
      ? [body.subject]
      : Array.from(new Set(rows.map((r: any) => r.subject as string)));
    const armStateBySubject: Record<string, Record<string, LinUcbArmState>> = {};
    for (const subj of subjects) {
      const { data: armRows } = await admin.from("bandit_arm_state")
        .select("arm_id,state").eq("subject", subj);
      const map: Record<string, LinUcbArmState> = {};
      for (const a of armRows ?? []) {
        try { map[a.arm_id] = a.state as LinUcbArmState; } catch { /* skip */ }
      }
      armStateBySubject[subj] = map;
    }

    const linucbCurrent: TargetPolicy = (x, armIds) => {
      // Use the first available subject's arms; in a per-subject run there's one.
      const subj = subjects[0];
      const arms = armStateBySubject[subj] ?? {};
      const scores: Record<string, number> = {};
      for (const id of armIds) {
        const st = arms[id];
        if (!st || st.d !== x.length) { scores[id] = 0; continue; }
        const s = scoreArm(st, x, LINUCB_DEFAULTS);
        scores[id] = s.ucb;
      }
      const ranking = armIds.map((id) => ({
        armId: id, ucb: scores[id], mean: scores[id], bonus: 0, n: 0,
      }));
      const dist = softmaxPropensity(ranking, ranking[0]?.armId ?? armIds[0], 0.15);
      const out: Record<string, number> = {};
      for (const e of dist.entries) out[e.armId] = e.prob;
      return out;
    };

    // (b) Greedy-2PL — pick the arm whose difficulty best matches ensembleP at
    //     context index 6 (frozen feature ordering, see linucb.ts:227).
    const greedy2PL = epsilonGreedyPolicy((x, armId) => {
      const ensembleP = x[6] ?? 0.5;
      // Prefer "medium" near 0.6, "low" near 0.85, "high" near 0.35 — the
      // standard adaptive-difficulty heuristic.
      const target = ensembleP > 0.75 ? "low" : ensembleP > 0.5 ? "medium" : "high";
      return armId.endsWith(`:${target}`) ? 1 : 0;
    }, 0.1);

    // (c) Reward model for DR — calibrated mean reward per arm in the log.
    const armMeans: Record<string, { sum: number; n: number }> = {};
    for (const r of log) {
      (armMeans[r.chosenArm] ??= { sum: 0, n: 0 });
      armMeans[r.chosenArm].sum += r.reward;
      armMeans[r.chosenArm].n += 1;
    }
    const fallback = meanBehaviourReward;
    const rewardModel = (_x: number[], armId: string) => {
      const m = armMeans[armId];
      return m && m.n > 0 ? m.sum / m.n : fallback;
    };

    // 3) Empirical-oracle regret (bucket by ⌊theta·3⌋, ⌊mastery·3⌋).
    const bucketize = (x: number[]) =>
      `${Math.floor((x[1] ?? 0) * 3)}|${Math.floor((x[2] ?? 0) * 3)}`;
    const regret = cumulativeRegret(log, bucketize);

    // 4) Persist run header.
    const { data: runRow, error: runErr } = await admin
      .from("policy_evaluation_runs")
      .insert({
        subject: body.subject ?? null,
        window_start: start,
        window_end: end,
        n_decisions: log.length,
        mean_behaviour_reward: meanBehaviourReward,
        notes: body.notes ?? null,
      })
      .select("id").single();
    if (runErr) throw runErr;
    const runId = runRow.id;

    // 5) Score every (policy, estimator) pair.
    const policies: { name: string; pol: TargetPolicy }[] = [
      { name: "linucb_current", pol: linucbCurrent },
      { name: "uniform_random", pol: uniformPolicy },
      { name: "greedy_2pl",     pol: greedy2PL },
    ];
    const results: any[] = [];
    for (const { name, pol } of policies) {
      const ips   = evaluateIPS  (log, pol, [...ARM_IDS]);
      const snips = evaluateSNIPS(log, pol, [...ARM_IDS]);
      const dr    = evaluateDR   (log, pol, rewardModel, [...ARM_IDS]);
      for (const r of [ips, snips, dr]) {
        results.push({
          run_id: runId,
          policy_name: name,
          estimator: r.estimator,
          value: r.value,
          stderr: r.stderr,
          ci95_lo: r.ci95Lo,
          ci95_hi: r.ci95Hi,
          effective_sample_size: r.effectiveSampleSize,
          n_used: r.nUsed,
          cumulative_regret: name === "linucb_current" ? regret.cumulative : null,
        });
      }
    }
    await admin.from("policy_evaluation_results").insert(results);

    return new Response(
      JSON.stringify({
        ok: true,
        runId,
        nDecisions: log.length,
        meanBehaviourReward,
        empiricalRegret: regret,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[policy-evaluate]", err);
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
