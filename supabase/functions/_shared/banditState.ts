// ============================================================================
//  banditState.ts — DB persistence + orchestration for the LinUCB layer.
//
//  Pattern (mirrors fsrsState / ktSequence):
//   - loadArmsForUser:   bring every arm's state into memory for selection
//   - persistArmUpdate:  Sherman–Morrison update + upsert
//   - logDecision:       append-only entry into bandit_decisions
//   - applyReward:       attach_bandit_reward RPC + arm update
//
//  Every entry point is best-effort: a failure in the bandit layer must
//  never block grading or teaching. Errors are logged and swallowed.
// ============================================================================

import {
  ARM_IDS, BANDIT_CONTEXT_DIM, LINUCB_DEFAULTS,
  hydrateArmState, newArmState, selectArm, updateArm,
  type ArmScore, type LinUcbArmState, type LinUcbConfig,
} from "./linucb.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import { softmaxPropensity } from "./propensity.ts";
import { logDecisionRegret } from "./decisionRegret.ts";

// Use the loose runtime client type so callers' typed clients pass through.
// The edge functions instantiate createClient(SUPABASE_URL, SERVICE_ROLE)
// which produces SupabaseClient<any, "public", any>; restricting the alias
// would force every call site to cast.
// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

// Default config — used until the first runtimeConfig load resolves. The
// runtime path always re-derives CFG from the active snapshot so promoted
// hyperparameters take effect within one cache window (10s).
const CFG_DEFAULT: LinUcbConfig = { ...LINUCB_DEFAULTS, d: BANDIT_CONTEXT_DIM };

async function resolveCfg(admin?: SupabaseAdmin): Promise<LinUcbConfig> {
  if (!admin) return CFG_DEFAULT;
  const rc = await getRuntimeConfig(admin);
  return { d: BANDIT_CONTEXT_DIM, alpha: rc.linucbAlpha, lambda: rc.linucbLambda };
}

/**
 * Load every arm's state for (user, subject). User-scoped rows take priority;
 * population priors fill the gap; brand-new arms get a fresh ridge prior.
 */
export async function loadArmsForUser(
  admin: SupabaseAdmin,
  userId: string,
  subject: string,
): Promise<Record<string, LinUcbArmState>> {
  const { data: userRows } = await admin
    .from("bandit_arm_state")
    .select("arm_id, a_inv, b_vector, n_pulls, dim")
    .eq("scope", "user")
    .eq("user_id", userId)
    .eq("subject", subject);

  const { data: popRows } = await admin
    .from("bandit_arm_state")
    .select("arm_id, a_inv, b_vector, n_pulls, dim")
    .eq("scope", "population")
    .eq("subject", subject);

  const userIdx = new Map<string, any>();
  for (const r of userRows ?? []) userIdx.set(r.arm_id as string, r);
  const popIdx = new Map<string, any>();
  for (const r of popRows ?? []) popIdx.set(r.arm_id as string, r);

  const arms: Record<string, LinUcbArmState> = {};
  for (const armId of ARM_IDS) {
    const src = userIdx.get(armId) ?? popIdx.get(armId);
    if (src) {
      arms[armId] = hydrateArmState({
        A_inv: src.a_inv, b: src.b_vector, n: src.n_pulls ?? 0, d: src.dim ?? CFG.d,
      }, CFG);
    } else {
      arms[armId] = newArmState(CFG);
    }
  }
  return arms;
}

/**
 * Persist a single arm's updated state back into bandit_arm_state.
 * Always writes the user-scoped row (population priors are seeded out-of-band).
 */
export async function persistArm(
  admin: SupabaseAdmin,
  args: {
    userId: string;
    subject: string;
    armId: string;
    state: LinUcbArmState;
    rewardDelta: number;
  },
): Promise<void> {
  const { userId, subject, armId, state, rewardDelta } = args;
  // Read prior cumulative_reward so we can increment monotonically.
  const { data: prior } = await admin
    .from("bandit_arm_state")
    .select("cumulative_reward")
    .eq("scope", "user")
    .eq("user_id", userId)
    .eq("subject", subject)
    .eq("arm_id", armId)
    .maybeSingle();
  const priorCum = Number(prior?.cumulative_reward ?? 0);

  const payload = {
    scope: "user" as const,
    user_id: userId,
    subject,
    arm_id: armId,
    dim: state.d,
    alpha: CFG.alpha,
    lambda: CFG.lambda,
    a_inv: state.A_inv,
    b_vector: state.b,
    n_pulls: state.n,
    cumulative_reward: priorCum + Number(rewardDelta || 0),
    last_decision_at: new Date().toISOString(),
  };
  // Upsert on the conflict key — composite (user_id, subject, arm_id) for scope='user'.
  await admin.from("bandit_arm_state").upsert(payload, {
    onConflict: "user_id,subject,arm_id",
  });
}

/**
 * Run LinUCB selection + log the decision. Returns the chosen arm score and
 * the decision row id (or null on any failure).
 */
export async function selectAndLog(
  admin: SupabaseAdmin,
  args: {
    userId: string;
    subject: string;
    contextVec: number[];
    conceptId?: string | null;
    lectureId?: string | null;
    ensembleP?: number | null;
    source?: string;
  },
): Promise<{ chosen: ArmScore; ranking: ArmScore[]; decisionId: string | null } | null> {
  try {
    const arms = await loadArmsForUser(admin, args.userId, args.subject);
    const { chosen, ranking } = selectArm(arms, args.contextVec, CFG);

    // Stage 11 — log a softmax-over-UCB propensity so every decision is
    // usable downstream by IPS / SNIPS / DR off-policy estimators.
    const { softmaxPropensity, DEFAULT_TEMPERATURE } = await import("./propensity.ts");
    const propDist = softmaxPropensity(ranking, chosen.armId, DEFAULT_TEMPERATURE);

    const { data: inserted, error } = await admin
      .from("bandit_decisions")
      .insert({
        user_id: args.userId,
        subject: args.subject,
        arm_id: chosen.armId,
        concept_id: args.conceptId ?? null,
        lecture_id: args.lectureId ?? null,
        context_vec: args.contextVec,
        ucb: Number(chosen.ucb.toFixed(6)),
        mean: Number(chosen.mean.toFixed(6)),
        bonus: Number(chosen.bonus.toFixed(6)),
        alternatives: ranking.slice(0, 5).map((r) => ({
          arm_id: r.armId,
          ucb: Number(r.ucb.toFixed(6)),
          mean: Number(r.mean.toFixed(6)),
          bonus: Number(r.bonus.toFixed(6)),
          n: r.n,
        })),
        ensemble_p_at_decision: args.ensembleP ?? null,
        source: args.source ?? "teaching-generate",
        behaviour_prob: Number(propDist.chosenProb.toFixed(6)),
        softmax_temp: Number(propDist.temperature.toFixed(4)),
        propensity_dist: propDist.entries.map((e) => ({
          arm_id: e.armId, prob: Number(e.prob.toFixed(6)),
        })),
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[banditState.selectAndLog] insert failed:", error.message);
      return { chosen, ranking, decisionId: null };
    }
    return { chosen, ranking, decisionId: (inserted?.id as string) ?? null };
  } catch (e) {
    console.error("[banditState.selectAndLog] error:", e);
    return null;
  }
}

/**
 * Apply the LinUCB reward update for the most-recent unrewarded decision
 * matching (user, subject, concept). Called from ability-update.
 *
 * Reward signal v1: simple correctness in {0, 1}. Future versions can blend
 * accuracy with response-time normalization and engagement.
 */
export async function applyReward(
  admin: SupabaseAdmin,
  args: {
    userId: string;
    subject: string;
    conceptId?: string | null;
    isCorrect: boolean;
  },
): Promise<{ armId: string; reward: number } | null> {
  try {
    const reward = args.isCorrect ? 1 : 0;
    const { data, error } = await admin.rpc("attach_bandit_reward", {
      p_user_id: args.userId,
      p_subject: args.subject,
      p_concept_id: args.conceptId ?? null,
      p_reward: reward,
    });
    if (error) {
      console.warn("[banditState.applyReward] rpc error:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.arm_id || !Array.isArray(row.context_vec)) return null;

    // Load → update → persist the matched arm.
    const { data: armRow } = await admin
      .from("bandit_arm_state")
      .select("a_inv, b_vector, n_pulls, dim")
      .eq("scope", "user")
      .eq("user_id", args.userId)
      .eq("subject", args.subject)
      .eq("arm_id", row.arm_id)
      .maybeSingle();
    const prior = armRow
      ? hydrateArmState({
          A_inv: armRow.a_inv, b: armRow.b_vector,
          n: armRow.n_pulls ?? 0, d: armRow.dim ?? CFG.d,
        }, CFG)
      : newArmState(CFG);
    const next = updateArm(prior, row.context_vec as number[], reward, CFG);
    await persistArm(admin, {
      userId: args.userId,
      subject: args.subject,
      armId: row.arm_id as string,
      state: next,
      rewardDelta: reward,
    });
    return { armId: row.arm_id as string, reward };
  } catch (e) {
    console.error("[banditState.applyReward] error:", e);
    return null;
  }
}
