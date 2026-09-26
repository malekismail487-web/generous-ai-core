import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isEmptyToolArguments, parseSchoolSubjectCatalog, parseWeeklyPlanProposal, safeWeeklyPlanText,
  singleToolCall, weeklyPlanMessages, weeklyPlanTools,
} from "../_shared/weeklyPlanAI.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, payload: Record<string, unknown>) => new Response(JSON.stringify(payload), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const grades = new Set(["All Grades", "KG1", "KG2", "KG3",
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`)]);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const bearer = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!bearer) return json(401, { error: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!url || !anonKey || !apiKey) return json(503, { error: "service_unavailable" });
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: authError } = await db.auth.getUser(bearer[1]);
  if (authError || !identity.user) return json(401, { error: "unauthorized" });
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("school_id, user_type, is_active, status")
    .eq("id", identity.user.id).maybeSingle();
  if (profileError || !profile?.school_id || profile.user_type !== "school_admin"
    || profile.is_active !== true || profile.status !== "approved") return json(403, { error: "school_admin_required" });
  const { data: membership, error: membershipError } = await db.from("school_admins")
    .select("id").eq("school_id", profile.school_id).eq("user_id", identity.user.id).maybeSingle();
  if (membershipError || !membership) return json(403, { error: "school_admin_required" });

  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 1024) return json(413, { error: "request_too_large" });
    const raw = await request.text();
    if (raw.length > 1024) return json(413, { error: "request_too_large" });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "invalid_request" });
    body = parsed as Record<string, unknown>;
  } catch { return json(400, { error: "invalid_request" }); }
  if (Object.keys(body).sort().join() !== "gradeLevel,title,weekStart"
    || typeof body.title !== "string" || body.title.trim().length < 3 || body.title.length > 120
    || !safeWeeklyPlanText(body.title)
    || typeof body.gradeLevel !== "string" || !grades.has(body.gradeLevel)
    || typeof body.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(body.weekStart)
    || Number.isNaN(Date.parse(`${body.weekStart}T00:00:00Z`))
    || new Date(`${body.weekStart}T00:00:00Z`).toISOString().slice(0, 10) !== body.weekStart) {
    return json(400, { error: "invalid_plan_context" });
  }
  const messages = weeklyPlanMessages(body.title.trim(), body.gradeLevel, body.weekStart);
  const requestModel = async (phaseMessages: unknown[], name: string, subjects?: readonly string[]) => {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol", reasoning_effort: "none", max_tokens: 2400,
        messages: phaseMessages, tools: weeklyPlanTools(subjects),
        tool_choice: { type: "function", function: { name } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { status: response.status, call: null };
    const result = await response.json();
    return { status: 200, call: singleToolCall(result?.choices?.[0]?.message?.tool_calls, name) };
  };
  try {
    const first = await requestModel(messages, "list_school_subjects");
    if (first.status !== 200) return json(first.status === 429 ? 429 : 503, { error: first.status === 429 ? "rate_limited" : "ai_unavailable" });
    if (!first.call || !isEmptyToolArguments(first.call.function.arguments)) return json(502, { error: "invalid_ai_action" });
    const { data: subjectRows, error: subjectError } = await db.from("subjects")
      .select("name").eq("school_id", profile.school_id).order("name").limit(41);
    if (subjectError || !subjectRows || subjectRows.length === 41) return json(503, { error: "subject_catalog_unavailable" });
    const subjects = parseSchoolSubjectCatalog(subjectRows);
    if (!subjects) return json(422, { error: "subject_catalog_invalid" });
    const second = await requestModel([
      ...messages,
      { role: "assistant", tool_calls: [{ id: first.call.id, type: "function", function: first.call.function }] },
      { role: "tool", tool_call_id: first.call.id, content: JSON.stringify({ subjects }) },
    ], "propose_weekly_plan", subjects);
    if (second.status !== 200) return json(second.status === 429 ? 429 : 503, { error: second.status === 429 ? "rate_limited" : "ai_unavailable" });
    if (!second.call) return json(502, { error: "invalid_ai_proposal" });
    let proposal: unknown;
    try { proposal = JSON.parse(second.call.function.arguments); } catch { return json(502, { error: "invalid_ai_proposal" }); }
    const draft = parseWeeklyPlanProposal(proposal, subjects);
    if (!draft) return json(502, { error: "invalid_ai_proposal" });
    return json(200, { draft, reviewRequired: true, catalogSubjects: subjects });
  } catch { return json(503, { error: "ai_unavailable" }); }
});
