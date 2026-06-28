// POST /pilot-study-manage
// Actions: create | enroll | close | list
// Strictly school-scoped; only school admins may mutate.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = String(body.action ?? "");

  // Resolve caller school + admin status
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", user.id).maybeSingle();
  const schoolId = profile?.school_id ?? null;
  const isAdmin = profile?.user_type === "school_admin";

  switch (action) {
    case "list": {
      const q = admin.from("pilot_studies").select("*").order("created_at", { ascending: false });
      if (schoolId) q.eq("school_id", schoolId);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 400);
      return json({ pilots: data ?? [] });
    }
    case "create": {
      if (!isAdmin || !schoolId) return json({ error: "forbidden" }, 403);
      const name = String(body.name ?? "").trim();
      const hypothesis = String(body.hypothesis ?? "").trim();
      if (name.length < 3 || hypothesis.length < 5) return json({ error: "name+hypothesis required" }, 400);
      const { data, error } = await admin.from("pilot_studies").insert({
        school_id: schoolId,
        name, hypothesis,
        treatment_description: body.treatment ?? "Lumina adaptive",
        control_description:   body.control   ?? "Traditional teaching",
        subject: body.subject ?? null,
        grade_level: body.grade_level ?? null,
        status: "draft",
        created_by: user.id,
      }).select("*").single();
      if (error) return json({ error: error.message }, 400);
      await recordAudit(admin, {
        action: "pilot.created", actorId: user.id, actorRole: "school_admin",
        schoolId, targetType: "pilot", targetId: data.id, payload: { name },
      });
      return json({ pilot: data });
    }
    case "enroll": {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const pilotId = String(body.pilot_id ?? "");
      const studentId = String(body.student_id ?? "");
      const arm = body.arm === "control" ? "control" : "treatment";
      if (!pilotId || !studentId) return json({ error: "pilot_id+student_id required" }, 400);
      const { error } = await admin.from("pilot_assignments")
        .upsert({ pilot_id: pilotId, student_id: studentId, arm }, { onConflict: "pilot_id,student_id" });
      if (error) return json({ error: error.message }, 400);
      await recordAudit(admin, {
        action: "pilot.enrolled", actorId: user.id, actorRole: "school_admin",
        schoolId, targetType: "pilot_assignment", targetId: `${pilotId}/${studentId}`, payload: { arm },
      });
      return json({ ok: true });
    }
    case "start":
    case "close":
    case "archive": {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const pilotId = String(body.pilot_id ?? "");
      if (!pilotId) return json({ error: "pilot_id required" }, 400);
      const status = action === "start" ? "running" : action === "close" ? "closed" : "archived";
      const patch: any = { status };
      if (status === "running") patch.started_at = new Date().toISOString();
      if (status === "closed")  patch.ended_at   = new Date().toISOString();
      const { error } = await admin.from("pilot_studies").update(patch).eq("id", pilotId);
      if (error) return json({ error: error.message }, 400);
      await recordAudit(admin, {
        action: status === "closed" ? "pilot.closed" : "pilot.created",
        actorId: user.id, actorRole: "school_admin",
        schoolId, targetType: "pilot", targetId: pilotId, payload: { status },
      });
      return json({ ok: true });
    }
    default:
      return json({ error: "unknown action" }, 400);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
