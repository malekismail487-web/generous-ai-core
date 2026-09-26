import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  learningContext, learningDraftMessages, learningDraftTool, parseLearningDraft,
  type LearningDraftKind,
} from "../_shared/learningDraftContract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const bearer = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!bearer) return json(401, { error: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json(503, { error: "service_unavailable" });
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: authError } = await db.auth.getUser(bearer[1]);
  if (authError || !identity.user) return json(401, { error: "unauthorized" });
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("school_id, user_type, is_active").eq("id", identity.user.id).maybeSingle();
  if (profileError || !profile || !profile.is_active || profile.user_type !== "teacher" || !profile.school_id) {
    return json(403, { error: "teacher_required" });
  }
  const { data: hasTeacherRole, error: roleError } = await db.rpc("has_role", {
    _user_id: identity.user.id, _role: "teacher",
  });
  if (roleError || hasTeacherRole !== true) return json(403, { error: "teacher_required" });
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 4096) return json(413, { error: "request_too_large" });
    const raw = await request.text();
    if (raw.length > 4096) return json(413, { error: "request_too_large" });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "invalid_request" });
    body = parsed as Record<string, unknown>;
  } catch { return json(400, { error: "invalid_request" }); }
  const kind = body.kind;
  if (kind !== "support_plan" && kind !== "transfer_check") return json(400, { error: "invalid_kind" });
  const typedKind: LearningDraftKind = kind;
  let context: { subject: string; topic: string; goal?: string; learnerStep?: string };
  if (typedKind === "transfer_check") {
    if (typeof body.planId !== "string" || !uuid.test(body.planId)) return json(400, { error: "invalid_plan" });
    const { data: plan, error: planError } = await db.from("learning_support_plans")
      .select("subject, topic, goal, learner_step, status")
      .eq("id", body.planId).eq("teacher_id", identity.user.id).eq("school_id", profile.school_id).maybeSingle();
    if (planError || !plan || plan.status === "closed") return json(404, { error: "plan_unavailable" });
    const subjectTopic = learningContext(plan.subject, plan.topic);
    if (!subjectTopic) return json(422, { error: "invalid_plan_context" });
    context = {
      ...subjectTopic,
      goal: String(plan.goal ?? "").slice(0, 1000),
      learnerStep: String(plan.learner_step ?? "").slice(0, 1000),
    };
  } else {
    const subjectTopic = learningContext(body.subject, body.topic);
    if (!subjectTopic) return json(400, { error: "invalid_curriculum_context" });
    context = subjectTopic;
  }
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json(503, { error: "ai_unavailable" });
  const tool = learningDraftTool(typedKind);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        messages: learningDraftMessages(typedKind, context),
        tools: [{ type: "function", function: tool }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return json(response.status === 429 ? 429 : 503, { error: response.status === 429 ? "rate_limited" : "ai_unavailable" });
    const result = await response.json();
    const call = result?.choices?.[0]?.message?.tool_calls?.find((item: { function?: { name?: string } }) => item.function?.name === tool.name);
    if (!call || typeof call.function?.arguments !== "string") return json(502, { error: "invalid_ai_draft" });
    const parsed = JSON.parse(call.function.arguments);
    const draft = typedKind === "support_plan" ? parseLearningDraft("support_plan", parsed) : parseLearningDraft("transfer_check", parsed);
    if (!draft) return json(502, { error: "invalid_ai_draft" });
    return json(200, { kind: typedKind, draft, reviewRequired: true });
  } catch {
    return json(503, { error: "ai_unavailable" });
  }
});
