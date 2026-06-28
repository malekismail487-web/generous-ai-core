// POST /teacher-override
// Actions: set | clear | lock_topic | unlock_topic | list
// Caller must be the teacher of the school OR a school admin.

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

const TYPES = new Set([
  "difficulty_lock","pacing_lock","strategy_lock",
  "manual_lesson","freeze_progression","curriculum_pacing",
]);

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
  const action = String(body.action ?? "");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", user.id).maybeSingle();
  const schoolId = profile?.school_id;
  const role = profile?.user_type;
  if (!schoolId || (role !== "school_admin" && role !== "teacher")) return json({ error: "forbidden" }, 403);

  switch (action) {
    case "list": {
      const [{ data: overrides }, { data: locks }] = await Promise.all([
        admin.from("teacher_overrides").select("*").eq("school_id", schoolId).eq("active", true),
        admin.from("topic_locks").select("*").eq("school_id", schoolId),
      ]);
      return json({ overrides: overrides ?? [], locks: locks ?? [] });
    }
    case "set": {
      const ot = String(body.override_type ?? "");
      if (!TYPES.has(ot)) return json({ error: "invalid override_type" }, 400);
      const scope = ["student","class","school"].includes(body.scope) ? body.scope : "student";
      const payload = body.payload ?? {};
      const studentId = body.student_id ?? null;
      const classId   = body.class_id ?? null;
      if (scope === "student" && !studentId) return json({ error: "student_id required" }, 400);
      if (scope === "class" && !classId) return json({ error: "class_id required" }, 400);

      // Cross-school safety
      if (studentId) {
        const { data: stu } = await admin.from("profiles").select("school_id").eq("id", studentId).maybeSingle();
        if (!stu || stu.school_id !== schoolId) return json({ error: "cross-school student" }, 403);
      }

      const { data, error } = await admin.from("teacher_overrides").insert({
        school_id: schoolId, teacher_id: user.id, scope,
        student_id: studentId, class_id: classId,
        subject: body.subject ?? null, topic: body.topic ?? null,
        override_type: ot, payload, reason: body.reason ?? null,
        effective_from: body.effective_from ?? new Date().toISOString(),
        expires_at: body.expires_at ?? null,
      }).select("id").single();
      if (error) return json({ error: error.message }, 400);

      await recordAudit(admin, {
        action: "teacher.override.set", actorId: user.id, actorRole: role, schoolId,
        targetType: "override", targetId: data.id,
        payload: { override_type: ot, scope, payload },
      });
      return json({ ok: true, id: data.id });
    }
    case "clear": {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("teacher_overrides")
        .update({ active: false }).eq("id", id).eq("school_id", schoolId);
      if (error) return json({ error: error.message }, 400);
      await recordAudit(admin, {
        action: "teacher.override.cleared", actorId: user.id, actorRole: role, schoolId,
        targetType: "override", targetId: id, payload: {},
      });
      return json({ ok: true });
    }
    case "lock_topic":
    case "unlock_topic": {
      const subject = String(body.subject ?? "");
      const topic = String(body.topic ?? "");
      const scope = ["student","class","school"].includes(body.scope) ? body.scope : "school";
      if (!subject || !topic) return json({ error: "subject+topic required" }, 400);
      const state = action === "lock_topic" ? "locked" : "unlocked";
      const { data, error } = await admin.from("topic_locks").insert({
        school_id: schoolId, teacher_id: user.id,
        subject, topic, scope, state,
        student_id: body.student_id ?? null,
        class_id: body.class_id ?? null,
        reason: body.reason ?? null,
      }).select("id").single();
      if (error) return json({ error: error.message }, 400);
      await recordAudit(admin, {
        action: action === "lock_topic" ? "teacher.topic.locked" : "teacher.topic.unlocked",
        actorId: user.id, actorRole: role, schoolId,
        targetType: "topic_lock", targetId: data.id,
        payload: { subject, topic, scope, state },
      });
      return json({ ok: true, id: data.id });
    }
    default:
      return json({ error: "unknown action" }, 400);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
