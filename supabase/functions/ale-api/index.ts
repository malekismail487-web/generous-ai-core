// ============================================================================
//  ale-api — Adaptive Learning Engine public gateway
// ----------------------------------------------------------------------------
//  A single, separate API key (prefix `ale_live_`) that exposes EVERY adaptive
//  learning engine capability to an external client (e.g. the standalone AI
//  coder) without having to move or duplicate any engine code.
//
//  Auth:      Authorization: Bearer ale_live_...
//  Transport: POST { action, student_id? | external_student_id?, payload? }
//  Discovery: POST { action: "capabilities" }
//
//  The gateway authenticates the partner key, resolves (or provisions) the
//  learner the call acts for, mints a short-lived Supabase session for that
//  learner, and forwards the payload to the real ALE edge function. Every
//  engine subsystem therefore runs EXACTLY as it does inside Lumina — same
//  IRT/θ updates, same AKT/DASH/Hawkes ensemble, same FSRS scheduling, same
//  teaching policy — with no logic forked into this file.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
//  Capability registry — action → real ALE edge function
// ---------------------------------------------------------------------------
type Capability = {
  fn: string;
  group: string;
  summary: string;
  /** true → operates on a learner, requires student resolution */
  learner: boolean;
  /** true → engine-wide maintenance/ops, requires allow_admin_ops on the key */
  admin?: boolean;
};

const CAPABILITIES: Record<string, Capability> = {
  // ── Ability estimation & knowledge tracing ───────────────────────────────
  "ability.update": { fn: "ability-update", group: "ability", learner: true,
    summary: "Record an answer; runs IRT-2PL θ update, item calibration and concept propagation." },
  "ability.predict": { fn: "kt-predict", group: "ability", learner: true,
    summary: "Ensemble knowledge-tracing prediction (AKT + DASH + Hawkes + IRT) for a concept/item." },
  "ability.simulate": { fn: "simulate-student-view", group: "ability", learner: true,
    summary: "Simulate what the engine currently believes about a learner." },
  "ability.cold_start": { fn: "cold-start-probe", group: "ability", learner: true,
    summary: "Cold-start probe sequence for a learner with no history." },
  "ability.confidence": { fn: "confidence-record", group: "ability", learner: true,
    summary: "Record a confidence judgement and update calibration/mastery." },
  "ability.assessment_score": { fn: "record-assessment-score", group: "ability", learner: true,
    summary: "Record an external assessment score into the ability model." },

  // ── Concepts & curriculum graph ──────────────────────────────────────────
  "concept.infer": { fn: "infer-concept", group: "concept", learner: false,
    summary: "Infer the concept distribution for a piece of text (keyword + embedding)." },
  "concept.bind_curriculum": { fn: "curriculum-bind", group: "concept", learner: false,
    summary: "Bind content to the curriculum graph (concepts, prerequisites, versions)." },

  // ── Scheduling & memory ──────────────────────────────────────────────────
  "review.schedule": { fn: "review-schedule", group: "memory", learner: true,
    summary: "FSRS review scheduling — due items, stability/difficulty, next intervals." },
  "review.decay_refresher": { fn: "decay-generate-refresher", group: "memory", learner: true,
    summary: "Generate a decay-driven refresher item set." },
  "review.grade_refresher": { fn: "decay-grade-refresher", group: "memory", learner: true,
    summary: "Grade a refresher attempt and feed memory decay/FSRS." },
  "memory.consolidate": { fn: "dream-consolidate", group: "memory", learner: true,
    summary: "Offline consolidation pass over the learner's knowledge state." },
  "memory.extract": { fn: "extract-memories", group: "memory", learner: true,
    summary: "Extract durable learner memories from an interaction transcript." },

  // ── Teaching, tutoring & pedagogy ────────────────────────────────────────
  "teaching.generate": { fn: "teaching-generate", group: "teaching", learner: true,
    summary: "Full adaptive teaching turn — policy selection + generated lesson output." },
  "teaching.socratic_turn": { fn: "socratic-next-turn", group: "teaching", learner: true,
    summary: "Next Socratic dialogue turn given the conversation state." },
  "teaching.teach_back_grade": { fn: "teach-back-grade", group: "teaching", learner: true,
    summary: "Grade a teach-back explanation and update mastery evidence." },
  "teaching.debate": { fn: "debate", group: "teaching", learner: true,
    summary: "Adaptive debate/argumentation exercise turn." },
  "teaching.misconception_generate": { fn: "misconception-hunt-generate", group: "teaching", learner: true,
    summary: "Generate misconception-hunting probes for the learner's weak concepts." },
  "teaching.misconception_grade": { fn: "misconception-hunt-grade", group: "teaching", learner: true,
    summary: "Grade a misconception hunt and record the mistake taxonomy." },
  "teaching.override": { fn: "teacher-override", group: "teaching", learner: true,
    summary: "Apply a human override to the engine's teaching decision." },
  "teaching.validate": { fn: "adaptive-validate", group: "teaching", learner: true,
    summary: "Run the 7-rule adaptive validation pipeline over generated output." },

  // ── Prediction & analytics ───────────────────────────────────────────────
  "predict.student": { fn: "predict-student", group: "analytics", learner: true,
    summary: "Predict the learner's answer/behaviour before they respond (snapshot + resolve)." },
  "analytics.policy_evaluate": { fn: "policy-evaluate", group: "analytics", learner: false,
    summary: "Evaluate teaching-policy performance over a time window." },
  "analytics.outcome_report": { fn: "outcome-report", group: "analytics", learner: false,
    summary: "Learning-outcome loop report (gains, retention, transfer)." },

  // ── Engine operations (admin scope) ──────────────────────────────────────
  "ops.calibrate_predictions": { fn: "calibrate-predictions", group: "ops", learner: false, admin: true,
    summary: "Recalibrate prediction probabilities against observed outcomes." },
  "ops.recalibrate_anchors": { fn: "recalibrate-anchors", group: "ops", learner: false, admin: true,
    summary: "Recalibrate anchor items on the IRT scale." },
  "ops.retrain_ensemble": { fn: "retrain-ensemble", group: "ops", learner: false, admin: true,
    summary: "Retrain the KT ensemble blend weights." },
  "ops.unified_optimize": { fn: "unified-optimize", group: "ops", learner: false, admin: true,
    summary: "Optimise the unified latent-state policy." },
  "ops.evaluate_models": { fn: "evaluate-models", group: "ops", learner: false, admin: true,
    summary: "Score all KT/IRT models against held-out interactions." },
  "ops.auto_tune": { fn: "auto-tune-hyperparams", group: "ops", learner: false, admin: true,
    summary: "Auto-tune engine hyperparameters." },
  "ops.continuous_validate": { fn: "continuous-validate", group: "ops", learner: false, admin: true,
    summary: "Continuous validation sweep across the engine." },
  "ops.refresh_cold_start_priors": { fn: "refresh-cold-start-priors", group: "ops", learner: false, admin: true,
    summary: "Recompute cold-start priors from the population." },
  "ops.pilot_study": { fn: "pilot-study-manage", group: "ops", learner: false, admin: true,
    summary: "Manage pilot studies / experiment arms." },
};

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const rpm = new Map<string, { count: number; resetAt: number }>();
const sessionCache = new Map<string, { token: string; expiresAt: number }>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logUsage(
  keyId: string | null,
  action: string,
  status: number,
  latency: number,
  err: string | null,
) {
  try {
    await admin.from("ale_api_usage").insert({
      api_key_id: keyId,
      action,
      status_code: status,
      latency_ms: latency,
      error_message: err ? err.slice(0, 500) : null,
    });
  } catch { /* logging must never break the request */ }
}

/** Resolve the learner this call acts for, provisioning a shadow learner when needed. */
async function resolveLearner(
  keyId: string,
  studentId: string | undefined,
  externalRef: string | undefined,
): Promise<{ userId: string; email: string } | { error: string; status: number }> {
  if (studentId) {
    const { data, error } = await admin.auth.admin.getUserById(studentId);
    if (error || !data?.user?.email) {
      return { error: "Unknown student_id (no such Lumina learner)", status: 404 };
    }
    return { userId: data.user.id, email: data.user.email };
  }

  if (!externalRef) {
    return { error: "This action requires `student_id` or `external_student_id`", status: 400 };
  }

  const { data: existing } = await admin
    .from("ale_api_students")
    .select("user_id")
    .eq("api_key_id", keyId)
    .eq("external_ref", externalRef)
    .maybeSingle();

  if (existing?.user_id) {
    const { data } = await admin.auth.admin.getUserById(existing.user_id);
    if (data?.user?.email) return { userId: data.user.id, email: data.user.email };
  }

  // Provision an isolated shadow learner for this external reference.
  const digest = (await sha256Hex(`${keyId}:${externalRef}`)).slice(0, 32);
  const email = `ale.${digest}@api.lumina.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { ale_api: true, external_ref: externalRef, full_name: `API Learner ${externalRef}` },
  });
  if (createErr || !created?.user) {
    return { error: `Could not provision learner: ${createErr?.message ?? "unknown"}`, status: 500 };
  }

  await admin.from("ale_api_students").insert({
    api_key_id: keyId,
    external_ref: externalRef,
    user_id: created.user.id,
  });

  return { userId: created.user.id, email };
}

/** Mint (and cache) a short-lived learner access token so ALE functions run as that learner. */
async function mintLearnerToken(userId: string, email: string): Promise<string | null> {
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (linkErr || !hashedToken) return null;

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  const token = verified?.session?.access_token;
  if (verifyErr || !token) return null;

  const expiresAt = (verified.session!.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
  sessionCache.set(userId, { token, expiresAt });
  return token;
}

// ---------------------------------------------------------------------------
//  Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let keyId: string | null = null;
  let action = "unknown";

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);

    // 1 ── Authenticate the partner key
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token.startsWith("ale_live_")) {
      return json({ error: "Missing or invalid key. Use Authorization: Bearer ale_live_..." }, 401);
    }
    const keyHash = await sha256Hex(token);
    const { data: key } = await admin
      .from("ale_api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();
    if (!key) return json({ error: "Invalid or revoked API key" }, 401);
    keyId = key.id;

    // 2 ── Quota + rate limit
    if (new Date(key.quota_reset_at).getTime() < Date.now()) {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      await admin.from("ale_api_keys")
        .update({ requests_this_month: 0, quota_reset_at: next.toISOString() })
        .eq("id", key.id);
      key.requests_this_month = 0;
    }
    if (key.requests_this_month >= key.monthly_request_quota) {
      await logUsage(key.id, action, 429, Date.now() - startedAt, "Monthly quota exceeded");
      return json({ error: "Monthly quota exceeded for this API key" }, 429);
    }
    const now = Date.now();
    const bucket = rpm.get(key.id) ?? { count: 0, resetAt: now + 60_000 };
    if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + 60_000; }
    bucket.count++;
    rpm.set(key.id, bucket);
    if (bucket.count > key.rate_limit_per_minute) {
      await logUsage(key.id, action, 429, Date.now() - startedAt, "Rate limit exceeded");
      return json({ error: `Rate limit exceeded (${key.rate_limit_per_minute}/min)` }, 429);
    }

    // 3 ── Parse + resolve the action
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    action = String((body as { action?: string }).action ?? "").trim();

    if (!action || action === "capabilities") {
      await logUsage(key.id, "capabilities", 200, Date.now() - startedAt, null);
      return json({
        service: "Lumina Adaptive Learning Engine API",
        version: "1.0",
        usage: {
          endpoint: `${SUPABASE_URL}/functions/v1/ale-api`,
          method: "POST",
          auth: "Authorization: Bearer ale_live_...",
          body: {
            action: "<action name>",
            student_id: "<optional Lumina user uuid>",
            external_student_id: "<optional stable id from your system>",
            payload: "<action-specific object>",
          },
        },
        actions: Object.entries(CAPABILITIES).map(([name, c]) => ({
          action: name,
          group: c.group,
          summary: c.summary,
          requires_learner: c.learner,
          admin_scope: !!c.admin,
        })),
      });
    }

    const cap = CAPABILITIES[action];
    if (!cap) {
      await logUsage(key.id, action, 400, Date.now() - startedAt, "Unknown action");
      return json({ error: `Unknown action "${action}". POST { "action": "capabilities" } to list them.` }, 400);
    }
    if (cap.admin && !key.allow_admin_ops) {
      await logUsage(key.id, action, 403, Date.now() - startedAt, "Admin scope denied");
      return json({ error: `Action "${action}" requires admin scope on this key.` }, 403);
    }

    // 4 ── Build the forwarded request (learner-scoped or service-scoped)
    const payload = ((body as { payload?: Record<string, unknown> }).payload ?? {}) as Record<string, unknown>;
    const headers: Record<string, string> = { "Content-Type": "application/json", apikey: ANON_KEY };
    let learnerId: string | null = null;

    const requestedStudent = (body as { student_id?: string }).student_id;
    const requestedExternal = (body as { external_student_id?: string }).external_student_id;
    // Every ALE edge function authenticates its caller, so the gateway always
    // acts as a real Lumina account: the requested learner when one is given,
    // otherwise this key's own dedicated service account.
    const resolved = await resolveLearner(
      key.id,
      requestedStudent,
      requestedExternal ?? (cap.learner ? undefined : "__service_account__"),
    );
    if ("error" in resolved) {
      await logUsage(key.id, action, resolved.status, Date.now() - startedAt, resolved.error);
      return json({ error: resolved.error }, resolved.status);
    }
    learnerId = resolved.userId;
    const actorToken = await mintLearnerToken(resolved.userId, resolved.email);
    if (!actorToken) {
      await logUsage(key.id, action, 500, Date.now() - startedAt, "Could not mint session");
      return json({ error: "Could not establish a session for this request" }, 500);
    }
    headers.Authorization = `Bearer ${actorToken}`;
    if (cap.learner) payload.studentId = payload.studentId ?? resolved.userId;

    // 5 ── Forward to the real ALE edge function — no engine logic is duplicated here
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/${cap.fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const raw = await upstream.text();
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    await logUsage(
      key.id,
      action,
      upstream.status,
      Date.now() - startedAt,
      upstream.ok ? null : raw.slice(0, 500),
    );

    // Count only successful billable calls
    if (upstream.ok) {
      admin.from("ale_api_keys").update({
        requests_this_month: key.requests_this_month + 1,
        last_used_at: new Date().toISOString(),
      }).eq("id", key.id).then(() => {});
    }

    return json({
      action,
      engine_function: cap.fn,
      student_id: learnerId,
      ok: upstream.ok,
      status: upstream.status,
      data: parsed,
    }, upstream.ok ? 200 : upstream.status);
  } catch (e) {
    console.error("ale-api error:", e);
    await logUsage(keyId, action, 500, Date.now() - startedAt, String(e));
    return json({ error: "Internal server error" }, 500);
  }
});
