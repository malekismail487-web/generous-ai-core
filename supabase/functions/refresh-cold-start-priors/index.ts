// ============================================================================
//  refresh-cold-start-priors  —  Stage 8 nightly aggregator
// ----------------------------------------------------------------------------
//  Reads non-provisional `ability_estimates`, `concept_mastery`, and personal
//  `ensemble_weights`, then upserts the population posteriors into
//  `population_priors` at every scope:
//
//     global           — one row aggregating *everything*
//     subject_global   — one row per subject
//     subject_school   — one row per (school, subject)
//     concept_global   — one row per concept
//     concept_school   — one row per (school, concept)
//
//  Triggered by:
//    - The Super Admin analytics center (manual button).
//    - A cron job (set up separately in DB) on a daily cadence.
//
//  Auth model:
//    - Requires a valid Lovable Cloud JWT.
//    - Body may include `{ scope_filter?: string }` to refresh only one
//      scope (cheaper for ad-hoc invocations from the dashboard).
//    - Only admins can trigger; verified via `has_role` to prevent students
//      from churning the priors table.
//
//  Statistical method:
//    - Mean: arithmetic mean of the underlying θ / mastery samples.
//    - Variance: population variance (Var = E[X²] − E[X]²). For sparse
//      groups (n < 5) we set a floor of 1.0 (θ) / 0.08 (mastery) so the
//      shrinkage formula treats them as uninformative.
//    - se_seed: max(0.55, average of per-row theta_se ÷ 1.2). Dividing by
//      1.2 nudges new students toward slightly faster lock-in once we have
//      population evidence, without ever going below the SE floor.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ENSEMBLE_DEFAULTS, type EnsembleWeights } from "../_shared/ensemble.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody { scope_filter?: string; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let triggeredBy: string | null = null;
  let scopeFilter: string | null = null;

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    triggeredBy = userData.user.id;

    // Admin gate.
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: triggeredBy, _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    scopeFilter = typeof body.scope_filter === "string" ? body.scope_filter : null;

    // ── Pull source data in bulk ─────────────────────────────────────────
    // ability_estimates: only non-provisional rows are stable enough to use.
    const { data: abilRows, error: abilErr } = await admin
      .from("ability_estimates")
      .select("school_id, subject, concept_id, theta, theta_se, provisional, graded_count")
      .eq("provisional", false)
      .limit(50000);
    if (abilErr) throw abilErr;

    const { data: masteryRows, error: mErr } = await admin
      .from("concept_mastery")
      .select("user_id, concept_id, mastery_score, school_id")
      .limit(100000);
    if (mErr) throw mErr;

    const { data: weightRows, error: wErr } = await admin
      .from("ensemble_weights")
      .select("user_id, subject, w_2pl, w_elo, w_akt, w_dash, w_fsrs, w_hawkes, bias")
      .not("user_id", "is", null)
      .limit(50000);
    if (wErr) throw wErr;

    // Optional school lookup so concept_school can group mastery rows.
    const studentSchools = new Map<string, string | null>();
    if (masteryRows && masteryRows.length) {
      const uniqUsers = Array.from(new Set(masteryRows
        .filter((r: any) => !r.school_id && r.user_id)
        .map((r: any) => r.user_id))) as string[];
      if (uniqUsers.length) {
        const chunk = 500;
        for (let i = 0; i < uniqUsers.length; i += chunk) {
          const ids = uniqUsers.slice(i, i + chunk);
          const { data: profs } = await admin
            .from("profiles").select("id, school_id").in("id", ids);
          for (const p of profs ?? []) studentSchools.set(p.id, p.school_id ?? null);
        }
      }
    }

    // Subjects per concept (so concept-scoped priors carry a subject label
    // for joins downstream — keeps queries cheap).
    const conceptIds = Array.from(new Set(
      (masteryRows ?? []).map((r: any) => r.concept_id).filter(Boolean),
    )) as string[];
    const conceptSubject = new Map<string, string | null>();
    if (conceptIds.length) {
      const chunk = 500;
      for (let i = 0; i < conceptIds.length; i += chunk) {
        const ids = conceptIds.slice(i, i + chunk);
        const { data: cs } = await admin
          .from("concepts").select("id, subject_id").in("id", ids);
        for (const c of cs ?? []) conceptSubject.set(c.id, c.subject_id ?? null);
      }
    }

    // ── Aggregate ────────────────────────────────────────────────────────
    type Agg = {
      theta: number[]; theta_se: number[];
      mastery: number[];
      weights: EnsembleWeights[];
    };
    const empty = (): Agg => ({ theta: [], theta_se: [], mastery: [], weights: [] });

    const global: Agg = empty();
    const subjectGlobal = new Map<string, Agg>();
    const subjectSchool = new Map<string, Agg>(); // key: `${school}|${subject}`
    const conceptGlobal = new Map<string, Agg>();
    const conceptSchool = new Map<string, Agg>(); // key: `${school}|${concept}`

    const get = <K>(m: Map<K, Agg>, k: K): Agg => {
      let v = m.get(k); if (!v) { v = empty(); m.set(k, v); } return v;
    };

    for (const r of abilRows ?? []) {
      const theta = Number((r as any).theta);
      const se = Number((r as any).theta_se);
      if (!Number.isFinite(theta) || !Number.isFinite(se)) continue;
      global.theta.push(theta); global.theta_se.push(se);

      const subj = (r as any).subject ?? null;
      const school = (r as any).school_id ?? null;
      const concept = (r as any).concept_id ?? null;

      if (subj) {
        const sg = get(subjectGlobal, subj);
        sg.theta.push(theta); sg.theta_se.push(se);
        if (school) {
          const ss = get(subjectSchool, `${school}|${subj}`);
          ss.theta.push(theta); ss.theta_se.push(se);
        }
      }
      if (concept) {
        const cg = get(conceptGlobal, concept);
        cg.theta.push(theta); cg.theta_se.push(se);
        if (school) {
          const cs = get(conceptSchool, `${school}|${concept}`);
          cs.theta.push(theta); cs.theta_se.push(se);
        }
      }
    }

    for (const r of masteryRows ?? []) {
      const m = Number((r as any).mastery_score);
      if (!Number.isFinite(m)) continue;
      global.mastery.push(m);
      const concept = (r as any).concept_id;
      const school = (r as any).school_id ?? studentSchools.get((r as any).user_id) ?? null;
      const subj = concept ? conceptSubject.get(concept) ?? null : null;

      if (subj) {
        get(subjectGlobal, subj).mastery.push(m);
        if (school) get(subjectSchool, `${school}|${subj}`).mastery.push(m);
      }
      if (concept) {
        get(conceptGlobal, concept).mastery.push(m);
        if (school) get(conceptSchool, `${school}|${concept}`).mastery.push(m);
      }
    }

    for (const r of weightRows ?? []) {
      const w = normWeights(r as any);
      global.weights.push(w);
      const subj = (r as any).subject ?? null;
      if (subj && subj !== "*") {
        get(subjectGlobal, subj).weights.push(w);
      }
    }

    // ── Build upsert payloads ────────────────────────────────────────────
    const payloads: any[] = [];

    if (!scopeFilter || scopeFilter === "global") {
      payloads.push(summarize("global", global, { school_id: null, subject: null, concept_id: null }));
    }
    if (!scopeFilter || scopeFilter === "subject_global") {
      for (const [subj, a] of subjectGlobal)
        payloads.push(summarize("subject_global", a, { school_id: null, subject: subj, concept_id: null }));
    }
    if (!scopeFilter || scopeFilter === "subject_school") {
      for (const [k, a] of subjectSchool) {
        const [school, subj] = k.split("|");
        payloads.push(summarize("subject_school", a, { school_id: school, subject: subj, concept_id: null }));
      }
    }
    if (!scopeFilter || scopeFilter === "concept_global") {
      for (const [cid, a] of conceptGlobal)
        payloads.push(summarize("concept_global", a, { school_id: null, subject: null, concept_id: cid }));
    }
    if (!scopeFilter || scopeFilter === "concept_school") {
      for (const [k, a] of conceptSchool) {
        const [school, cid] = k.split("|");
        payloads.push(summarize("concept_school", a, { school_id: school, subject: null, concept_id: cid }));
      }
    }

    // ── Upsert in batches (PostgREST conflict targets vary by scope, so we
    // route each scope's batch through its own onConflict path). ─────────
    let written = 0;
    written += await writeScope(admin, payloads, "global",         "scope,((1))");
    written += await writeScope(admin, payloads, "subject_global", "scope,subject");
    written += await writeScope(admin, payloads, "subject_school", "scope,school_id,subject");
    written += await writeScope(admin, payloads, "concept_global", "scope,concept_id");
    written += await writeScope(admin, payloads, "concept_school", "scope,school_id,concept_id");

    const elapsed = Date.now() - startedAt;
    await admin.from("population_prior_runs").insert({
      triggered_by: triggeredBy, scope_filter: scopeFilter,
      rows_examined: (abilRows?.length ?? 0) + (masteryRows?.length ?? 0) + (weightRows?.length ?? 0),
      rows_written: written, ms_elapsed: elapsed, ok: true,
      metrics: {
        subject_global: subjectGlobal.size,
        subject_school: subjectSchool.size,
        concept_global: conceptGlobal.size,
        concept_school: conceptSchool.size,
      },
    });

    return json({ ok: true, rows_written: written, ms_elapsed: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error("[refresh-cold-start-priors] error", err);
    try {
      await admin.from("population_prior_runs").insert({
        triggered_by: triggeredBy, scope_filter: scopeFilter,
        ms_elapsed: elapsed, ok: false,
        error_message: (err as Error).message?.slice(0, 1000) ?? "unknown",
      });
    } catch (_) { /* swallow audit failure */ }
    return json({ error: (err as Error).message ?? "Unknown error" }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0; for (const x of xs) s += x; return s / xs.length;
}
function variance(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  let s = 0; for (const x of xs) { const d = x - mu; s += d * d; }
  return s / xs.length;
}

function summarize(scope: string, a: { theta: number[]; theta_se: number[]; mastery: number[]; weights: EnsembleWeights[] },
                   key: { school_id: string | null; subject: string | null; concept_id: string | null }) {
  const tMean = mean(a.theta);
  const tVar = Math.max(variance(a.theta, tMean), a.theta.length < 5 ? 1 : 0.05);
  const seSeed = a.theta_se.length ? Math.max(0.55, mean(a.theta_se) / 1.2) : 1.5;
  const mMean = a.mastery.length ? mean(a.mastery) : 0.5;
  const mVar = Math.max(variance(a.mastery, mMean), a.mastery.length < 5 ? 0.08 : 0.005);

  let ew: EnsembleWeights | null = null;
  if (a.weights.length) {
    const acc: EnsembleWeights = {
      w_2pl: 0, w_elo: 0, w_akt: 0, w_dash: 0, w_fsrs: 0, w_hawkes: 0, bias: 0,
    };
    for (const w of a.weights) {
      acc.w_2pl  += w.w_2pl;  acc.w_elo  += w.w_elo;
      acc.w_akt  += w.w_akt;  acc.w_dash += w.w_dash;
      acc.w_fsrs = (acc.w_fsrs ?? 0) + (w.w_fsrs  ?? ENSEMBLE_DEFAULTS.w_fsrs  ?? 0);
      acc.w_hawkes = (acc.w_hawkes ?? 0) + (w.w_hawkes ?? ENSEMBLE_DEFAULTS.w_hawkes ?? 0);
      acc.bias   += w.bias ?? 0;
    }
    const n = a.weights.length;
    ew = {
      w_2pl: acc.w_2pl / n,   w_elo: acc.w_elo / n,
      w_akt: acc.w_akt / n,   w_dash: acc.w_dash / n,
      w_fsrs: (acc.w_fsrs ?? 0) / n, w_hawkes: (acc.w_hawkes ?? 0) / n,
      bias: acc.bias / n,
    };
  }

  return {
    scope,
    school_id: key.school_id,
    subject: key.subject,
    concept_id: key.concept_id,
    theta_mean: tMean,
    theta_var: tVar,
    se_seed: seSeed,
    mastery_mean: Math.min(0.95, Math.max(0.05, mMean)),
    mastery_var: mVar,
    ensemble_weights: ew,
    n_theta: a.theta.length,
    n_mastery: a.mastery.length,
    n_weights: a.weights.length,
    computed_at: new Date().toISOString(),
  };
}

function normWeights(r: any): EnsembleWeights {
  return {
    w_2pl: Number(r.w_2pl ?? ENSEMBLE_DEFAULTS.w_2pl),
    w_elo: Number(r.w_elo ?? ENSEMBLE_DEFAULTS.w_elo),
    w_akt: Number(r.w_akt ?? ENSEMBLE_DEFAULTS.w_akt),
    w_dash: Number(r.w_dash ?? ENSEMBLE_DEFAULTS.w_dash),
    w_fsrs: Number(r.w_fsrs ?? ENSEMBLE_DEFAULTS.w_fsrs ?? 0),
    w_hawkes: Number(r.w_hawkes ?? ENSEMBLE_DEFAULTS.w_hawkes ?? 0),
    bias: Number(r.bias ?? 0),
  };
}

// deno-lint-ignore no-explicit-any
async function writeScope(admin: any, all: any[], scope: string, _conflict: string): Promise<number> {
  const rows = all.filter((p) => p.scope === scope);
  if (rows.length === 0) return 0;

  // PostgREST `upsert(... onConflict)` doesn't support partial-index targets,
  // so we manually delete+insert for the (scope-filtered) rows. Wrapped per
  // row to avoid one bad row aborting the whole scope.
  let written = 0;
  for (const r of rows) {
    let q = admin.from("population_priors").delete().eq("scope", scope);
    if (r.school_id) q = q.eq("school_id", r.school_id); else q = q.is("school_id", null);
    if (r.subject) q = q.eq("subject", r.subject); else q = q.is("subject", null);
    if (r.concept_id) q = q.eq("concept_id", r.concept_id); else q = q.is("concept_id", null);
    await q;
    const { error } = await admin.from("population_priors").insert(r);
    if (!error) written++;
    else console.warn("[refresh-cold-start-priors] insert error:", error.message);
  }
  return written;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
