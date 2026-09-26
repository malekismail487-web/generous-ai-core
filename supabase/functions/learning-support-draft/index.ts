import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  learningContext, learningDraftMessages, learningDraftTool, parseLearningDraft,
  type LearningDraftKind,
} from "../_shared/learningDraftContract.ts";
import {
  boundedTeacherQuestion,
} from "../_shared/teacherReplyDraftContract.ts";
import {
  replyToolChoice, runTeacherReplyWorkflow, teacherReplyTools,
} from "../_shared/teacherReplyWorkflow.ts";
import {
  eligibleLessonEvidence, nextLessonAIMessages, nextLessonAITool, parseAINextLessonDraft,
} from "../_shared/nextLessonAIDraft.ts";

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
    .select("school_id, user_type, is_active, status").eq("id", identity.user.id).maybeSingle();
  if (profileError || !profile || !profile.is_active || profile.status !== "approved" || profile.user_type !== "teacher" || !profile.school_id) {
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
  if (kind !== "support_plan" && kind !== "transfer_check" && kind !== "teacher_reply" && kind !== "next_lesson") return json(400, { error: "invalid_kind" });
  if (kind === "next_lesson") {
    if (typeof body.subjectId !== "string" || !uuid.test(body.subjectId)
      || typeof body.gradeLevel !== "string" || body.gradeLevel.trim().length < 1 || body.gradeLevel.length > 120
      || typeof body.topic !== "string" || body.topic.trim().length < 2 || body.topic.length > 180
      || (body.language !== "en" && body.language !== "ar")) return json(400, { error: "invalid_lesson_request" });
    const [subjectResult, learnerResult, planResult] = await Promise.all([
      db.from("subjects").select("name").eq("id", body.subjectId).eq("school_id", profile.school_id).maybeSingle(),
      db.from("profiles").select("id, grade_level").eq("school_id", profile.school_id)
        .eq("user_type", "student").eq("is_active", true).eq("grade_level", body.gradeLevel).limit(1001),
      db.from("learning_support_plans")
        .select("school_id, teacher_id, student_id, status, subject, topic, source_kind")
        .eq("school_id", profile.school_id).eq("teacher_id", identity.user.id).eq("status", "active").limit(1001),
    ]);
    if (subjectResult.error || learnerResult.error || planResult.error) return json(503, { error: "evidence_unavailable" });
    if (!subjectResult.data) return json(404, { error: "subject_unavailable" });
    if ((learnerResult.data?.length ?? 0) === 1001 || (planResult.data?.length ?? 0) === 1001) {
      return json(503, { error: "evidence_incomplete" });
    }
    const evidence = eligibleLessonEvidence(
      profile.school_id, identity.user.id, body.gradeLevel.trim(), subjectResult.data.name, body.topic.trim(),
      learnerResult.data ?? [], planResult.data ?? [],
    );
    if (!evidence) return json(403, { error: "cohort_threshold_not_met" });
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(503, { error: "ai_unavailable" });
    const tool = nextLessonAITool();
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-5.6-sol", reasoning_effort: "none",
          messages: nextLessonAIMessages(evidence, body.language),
          tools: [{ type: "function", function: tool }],
          tool_choice: { type: "function", function: { name: tool.name } },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) return json(response.status === 429 ? 429 : 503, { error: response.status === 429 ? "rate_limited" : "ai_unavailable" });
      const result = await response.json();
      const calls = result?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(calls) || calls.length !== 1 || calls[0]?.function?.name !== tool.name
        || typeof calls[0]?.function?.arguments !== "string") return json(502, { error: "invalid_ai_draft" });
      const draft = parseAINextLessonDraft(JSON.parse(calls[0].function.arguments));
      if (!draft) return json(502, { error: "invalid_ai_draft" });
      return json(200, { kind, draft, evidence, reviewRequired: true });
    } catch { return json(503, { error: "ai_unavailable" }); }
  }
  if (kind === "teacher_reply") {
    if (typeof body.recordId !== "string" || !uuid.test(body.recordId)) return json(400, { error: "invalid_record" });
    const { data: record, error: recordError } = await db.from("student_learning_records")
      .select("student_id, kind, subject, topic, body, teacher_reply, support_plan_id")
      .eq("id", body.recordId).eq("teacher_id", identity.user.id).eq("school_id", profile.school_id).maybeSingle();
    if (recordError || !record || record.kind !== "QUESTION" || record.teacher_reply !== null) {
      return json(404, { error: "question_unavailable" });
    }
    const context = learningContext(record.subject, record.topic);
    const question = boundedTeacherQuestion(record.body);
    if (!context || !question) return json(422, { error: "invalid_question_context" });
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(503, { error: "ai_unavailable" });
    const hasLinkedPlan = Boolean(record.support_plan_id);
    const callAI = async (messages: Array<Record<string, unknown>>, forceReply: boolean) => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-5.6-sol",
          reasoning_effort: "none",
          messages,
          tools: teacherReplyTools(hasLinkedPlan && !forceReply),
          tool_choice: replyToolChoice(forceReply),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return { status: response.status, calls: null };
      const result = await response.json();
      const calls = result?.choices?.[0]?.message?.tool_calls;
      return { status: 200, calls: Array.isArray(calls) && calls.length === 1 ? calls : null };
    };
    try {
      const result = await runTeacherReplyWorkflow(
        { ...context, question, hasLinkedPlan }, callAI, async () => {
          const { data: plan, error: planError } = await db.from("learning_support_plans")
            .select("goal, learner_step, subject, topic")
            .eq("id", record.support_plan_id).eq("student_id", record.student_id)
            .eq("teacher_id", identity.user.id).eq("school_id", profile.school_id).maybeSingle();
          if (planError || !plan) return null;
          return {
            goal: String(plan.goal).slice(0, 1000),
            practiceStep: String(plan.learner_step).slice(0, 1000),
            subject: plan.subject, topic: plan.topic,
          };
        },
      );
      if (!result.ok) return json(result.status, { error: result.error });
      const { data: stillPending } = await db.from("student_learning_records")
        .select("teacher_reply").eq("id", body.recordId).eq("teacher_id", identity.user.id)
        .eq("school_id", profile.school_id).maybeSingle();
      if (!stillPending || stillPending.teacher_reply !== null) return json(409, { error: "question_changed" });
      return json(200, { kind, draft: { reply: result.reply }, evidenceSources: result.evidenceSources, reviewRequired: true });
    } catch { return json(503, { error: "ai_unavailable" }); }
  }
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
