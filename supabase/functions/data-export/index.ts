// POST /data-export
// Scope: 'student' (self or admin) | 'school' (admin only)
// Returns inline JSON for small exports; large exports are persisted to
// data_export_requests.payload for asynchronous download.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAudit } from "../_shared/auditTrail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON         = Deno.env.get("SUPABASE_ANON_KEY")!;

// Tables included in a student export. Each table must be filtered by
// student_id (column name listed). Cross-school leakage is impossible
// because RLS is service-bypassed but we explicitly filter on student_id.
const STUDENT_TABLES: Array<{ table: string; column: string; cap?: number }> = [
  { table: "profiles",                  column: "id",         cap: 1 },
  { table: "ability_estimates",         column: "user_id",    cap: 5000 },
  { table: "concept_mastery",           column: "user_id",    cap: 5000 },
  { table: "student_answer_history",    column: "user_id",    cap: 10000 },
  { table: "student_learning_profiles", column: "user_id",    cap: 1000 },
  { table: "assessment_scores",         column: "student_id", cap: 5000 },
  { table: "learning_outcomes",         column: "student_id", cap: 5000 },
  { table: "lesson_objective_bindings", column: "student_id", cap: 5000 },
  { table: "graded_events",             column: "user_id",    cap: 10000 },
  { table: "ensemble_predictions",      column: "user_id",    cap: 10000 },
  { table: "fsrs_card_state",           column: "user_id",    cap: 5000 },
  { table: "lesson_explanations",       column: "user_id",    cap: 2000 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const scope = body.scope === "school" ? "school" : "student";
  const targetId = String(body.target_id ?? user.id);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", user.id).maybeSingle();
  const callerSchool = profile?.school_id ?? null;
  const role = profile?.user_type ?? "student";
  const isAdmin = role === "school_admin";

  // AuthZ
  if (scope === "student") {
    if (targetId !== user.id && !isAdmin) return json({ error: "forbidden" }, 403);
    if (targetId !== user.id) {
      const { data: stu } = await admin.from("profiles").select("school_id").eq("id", targetId).maybeSingle();
      if (!stu || stu.school_id !== callerSchool) return json({ error: "cross-school" }, 403);
    }
  } else {
    if (!isAdmin || targetId !== callerSchool) return json({ error: "forbidden" }, 403);
  }

  // Open request row
  const { data: reqRow, error: reqErr } = await admin.from("data_export_requests").insert({
    school_id: callerSchool, requested_by: user.id, scope, target_id: targetId, status: "running",
  }).select("id").single();
  if (reqErr) return json({ error: reqErr.message }, 400);

  await recordAudit(admin, {
    action: "data.export.requested", actorId: user.id, actorRole: role, schoolId: callerSchool,
    targetType: scope, targetId, payload: { request_id: reqRow.id },
  });

  const payload: Record<string, unknown> = { scope, target_id: targetId, exported_at: new Date().toISOString() };

  try {
    if (scope === "student") {
      for (const t of STUDENT_TABLES) {
        const { data } = await admin.from(t.table).select("*").eq(t.column, targetId).limit(t.cap ?? 1000);
        payload[t.table] = data ?? [];
      }
    } else {
      // School-wide: ship aggregates + per-table caps to keep payload sane.
      const { data: profiles } = await admin.from("profiles").select("*").eq("school_id", targetId).limit(5000);
      const { data: outcomes } = await admin.from("learning_outcomes").select("*").eq("school_id", targetId).limit(20000);
      const { data: pilots }   = await admin.from("pilot_studies").select("*").eq("school_id", targetId);
      const { data: bindings } = await admin.from("lesson_objective_bindings").select("*").eq("school_id", targetId).limit(20000);
      const { data: audit }    = await admin.from("governance_audit_trail").select("*").eq("school_id", targetId).order("occurred_at", { ascending: false }).limit(5000);
      payload.profiles = profiles ?? [];
      payload.learning_outcomes = outcomes ?? [];
      payload.pilot_studies = pilots ?? [];
      payload.lesson_objective_bindings = bindings ?? [];
      payload.recent_audit_trail = audit ?? [];
    }

    await admin.from("data_export_requests")
      .update({ status: "completed", payload, completed_at: new Date().toISOString() })
      .eq("id", reqRow.id);
    await recordAudit(admin, {
      action: "data.export.completed", actorId: user.id, actorRole: role, schoolId: callerSchool,
      targetType: scope, targetId, payload: { request_id: reqRow.id, sections: Object.keys(payload).length },
    });
    return json({ ok: true, request_id: reqRow.id, payload });
  } catch (err) {
    await admin.from("data_export_requests")
      .update({ status: "failed", error: String(err), completed_at: new Date().toISOString() })
      .eq("id", reqRow.id);
    return json({ error: "export failed", detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
