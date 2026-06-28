// ════════════════════════════════════════════════════════════════════
// Stage 13 §3.4 — Governance Audit Trail (append-only)
//
// Tiny, schema-stable helper. All callers should go through `recordAudit`
// so the action taxonomy stays consistent (governance dashboards depend
// on it). Failures are swallowed and reported via console — audit must
// never break a user-facing flow.
// ════════════════════════════════════════════════════════════════════

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Canonical action namespace — extend only by appending. NEVER rename.
export type AuditAction =
  | "ai.lesson.generated"
  | "ai.lesson.repair_attempted"
  | "ai.bandit.decided"
  | "ai.ability.updated"
  | "teacher.override.set"
  | "teacher.override.cleared"
  | "teacher.topic.locked"
  | "teacher.topic.unlocked"
  | "pilot.created"
  | "pilot.enrolled"
  | "pilot.closed"
  | "outcome.score.recorded"
  | "outcome.report.generated"
  | "data.export.requested"
  | "data.export.completed"
  | "curriculum.standard.registered"
  | "curriculum.objective.registered"
  | "curriculum.binding.applied";

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  actorRole?: string | null;
  schoolId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordAudit(
  admin: SupabaseClient,
  e: AuditEntry,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  try {
    const { data, error } = await admin
      .from("governance_audit_trail")
      .insert({
        action: e.action,
        actor_id: e.actorId ?? null,
        actor_role: e.actorRole ?? null,
        school_id: e.schoolId ?? null,
        target_type: e.targetType ?? null,
        target_id: e.targetId ?? null,
        ip_address: e.ipAddress ?? null,
        user_agent: e.userAgent ?? null,
        payload: e.payload ?? {},
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[audit] insert failed", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.warn("[audit] threw", err);
    return { ok: false, error: String(err) };
  }
}

// Convenience wrapper for AI-generated lessons: stamps the standard +
// objective binding result alongside the trajectory hash.
export function describeLessonAudit(args: {
  studentId: string;
  schoolId: string | null;
  subject: string;
  topic: string | null;
  policyHash: string;
  bindingStandardCode: string | null;
  bindingObjectiveCode: string | null;
  overrideReasons: string[];
}): AuditEntry {
  return {
    action: "ai.lesson.generated",
    actorId: args.studentId,
    actorRole: "student",
    schoolId: args.schoolId,
    targetType: "lesson",
    targetId: args.policyHash,
    payload: {
      subject: args.subject,
      topic: args.topic,
      standard_code: args.bindingStandardCode,
      objective_code: args.bindingObjectiveCode,
      override_reasons: args.overrideReasons,
    },
  };
}
