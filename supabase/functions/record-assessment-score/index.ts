// POST /record-assessment-score
// Records a pre-test, post-test, or retention assessment score for a
// student. Teachers and school admins may insert; students may insert
// only for themselves (self-reported retention quizzes, etc).

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

const VALID_PHASES = new Set(["pretest","posttest","retention_7d","retention_14d","retention_30d"]);

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

  const studentId = String(body.student_id ?? user.id);
  const subject = String(body.subject ?? "").trim();
  const phase = String(body.phase ?? "");
  const score = Number(body.score);
  const total = Number(body.total);
  const pilotId = body.pilot_id ?? null;

  if (!subject) return json({ error: "subject required" }, 400);
  if (!VALID_PHASES.has(phase)) return json({ error: "invalid phase" }, 400);
  if (!Number.isFinite(score) || score < 0) return json({ error: "score invalid" }, 400);
  if (!Number.isFinite(total) || total <= 0) return json({ error: "total invalid" }, 400);
  if (score > total)   return json({ error: "score > total" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", user.id).maybeSingle();
  const schoolId = profile?.school_id ?? null;
  const role = profile?.user_type ?? "student";

  // Authz: students can only record for themselves; teachers/admins for their school.
  if (studentId !== user.id) {
    if (role !== "school_admin" && role !== "teacher") return json({ error: "forbidden" }, 403);
    const { data: stu } = await admin.from("profiles").select("school_id").eq("id", studentId).maybeSingle();
    if (!stu || stu.school_id !== schoolId) return json({ error: "cross-school forbidden" }, 403);
  }

  const { data, error } = await admin.from("assessment_scores").insert({
    pilot_id: pilotId, school_id: schoolId, student_id: studentId,
    subject, phase, score, total, source: body.source ?? "manual", metadata: body.metadata ?? {},
  }).select("id, pct").single();
  if (error) return json({ error: error.message }, 400);

  await recordAudit(admin, {
    action: "outcome.score.recorded", actorId: user.id, actorRole: role, schoolId,
    targetType: "assessment_score", targetId: data.id,
    payload: { student_id: studentId, subject, phase, pct: data.pct, pilot_id: pilotId },
  });

  return json({ ok: true, id: data.id, pct: data.pct });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
