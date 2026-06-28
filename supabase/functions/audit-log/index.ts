// POST /audit-log
// Generic append-only audit appender. Used by client UIs to log
// teacher-side governance events that don't pass through other functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordAudit, type AuditAction } from "../_shared/auditTrail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON         = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED: Set<AuditAction> = new Set([
  "teacher.override.set","teacher.override.cleared",
  "teacher.topic.locked","teacher.topic.unlocked",
  "pilot.created","pilot.enrolled","pilot.closed",
  "outcome.score.recorded","outcome.report.generated",
  "data.export.requested","data.export.completed",
  "curriculum.standard.registered","curriculum.objective.registered",
  "curriculum.binding.applied",
] as AuditAction[]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: corsHeaders }); }
  const action = body.action as AuditAction;
  if (!ALLOWED.has(action)) return new Response(JSON.stringify({ error: "action not allowed via this endpoint" }), { status: 400, headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", auth.user.id).maybeSingle();

  const res = await recordAudit(admin, {
    action,
    actorId: auth.user.id,
    actorRole: profile?.user_type ?? null,
    schoolId: profile?.school_id ?? null,
    targetType: body.target_type ?? null,
    targetId: body.target_id ?? null,
    payload: body.payload ?? {},
  });

  return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
