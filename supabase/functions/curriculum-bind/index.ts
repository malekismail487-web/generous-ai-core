// POST /curriculum-bind
// Read-only resolver: given (subject, topic, conceptId?) returns the
// strongest standard+objective binding for the caller's school. Used by
// teacher dashboards and by teaching-generate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBinding } from "../_shared/curriculumBinding.ts";

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
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const subject = String(body.subject ?? "").trim();
  if (!subject) return json({ error: "subject required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id").eq("id", auth.user.id).maybeSingle();
  const schoolId = profile?.school_id ?? null;

  const result = await resolveBinding(admin, {
    schoolId,
    subject,
    topic: body.topic ?? null,
    conceptId: body.concept_id ?? null,
  });

  return json({ ok: true, ...result });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
