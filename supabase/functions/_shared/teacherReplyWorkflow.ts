import {
  DRAFT_TEACHER_REPLY, parseReplyToolCall, teacherReplyMessages, teacherReplyTools,
} from "./teacherReplyDraftContract.ts";

export type TeacherReplyContext = {
  subject: string;
  topic: string;
  question: string;
  hasLinkedPlan: boolean;
};

export type LinkedPlanContext = {
  goal: string;
  practiceStep: string;
  subject: string;
  topic: string;
};

export type TeacherReplyCompletion = {
  status: number;
  calls: unknown[] | null;
};

export type TeacherReplyResult =
  | { ok: true; reply: string; evidenceSources: ("student_question" | "linked_support_plan")[] }
  | { ok: false; status: number; error: string };

/** One optional scoped read and at most two model calls. No mutation capability exists here. */
export async function runTeacherReplyWorkflow(
  context: TeacherReplyContext,
  complete: (messages: Array<Record<string, unknown>>, forceReply: boolean) => Promise<TeacherReplyCompletion>,
  loadLinkedPlan: () => Promise<LinkedPlanContext | null>,
): Promise<TeacherReplyResult> {
  const messages: Array<Record<string, unknown>> = teacherReplyMessages(context);
  const sources: ("student_question" | "linked_support_plan")[] = ["student_question"];
  const first = await complete(messages, false);
  if (first.status !== 200) return {
    ok: false, status: first.status === 429 ? 429 : 503,
    error: first.status === 429 ? "rate_limited" : "ai_unavailable",
  };
  if (first.calls?.length !== 1) return { ok: false, status: 502, error: "invalid_ai_draft" };
  const firstCall = first.calls[0];
  let result = parseReplyToolCall(firstCall, context.hasLinkedPlan);
  if (result?.kind === "READ_PLAN") {
    const plan = await loadLinkedPlan();
    if (!plan) return { ok: false, status: 409, error: "linked_plan_unavailable" };
    messages.push({ role: "assistant", content: null, tool_calls: [firstCall] });
    messages.push({ role: "tool", tool_call_id: result.id, content: JSON.stringify(plan) });
    sources.push("linked_support_plan");
    const second = await complete(messages, true);
    if (second.status !== 200) return {
      ok: false, status: second.status === 429 ? 429 : 503,
      error: second.status === 429 ? "rate_limited" : "ai_unavailable",
    };
    if (second.calls?.length !== 1) return { ok: false, status: 502, error: "invalid_ai_draft" };
    result = parseReplyToolCall(second.calls[0], false);
  }
  if (result?.kind !== "DRAFT") return { ok: false, status: 502, error: "invalid_ai_draft" };
  return { ok: true, reply: result.reply, evidenceSources: sources };
}

export function replyToolChoice(forceReply: boolean) {
  return forceReply ? { type: "function", function: { name: DRAFT_TEACHER_REPLY } } : "required";
}

export { teacherReplyTools };
