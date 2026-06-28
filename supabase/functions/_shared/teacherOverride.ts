// ════════════════════════════════════════════════════════════════════
// Stage 13 §3.3 — Teacher Override / Human Control Layer
//
// Pure projection: given a set of active override records + topic locks,
// produce a deterministic Override Profile that downstream systems
// (teaching-generate, fsrs scheduler, bandit) must respect.
//
// Precedence (strongest → weakest):
//   1. student-scoped override
//   2. class-scoped override
//   3. school-scoped override
//
// `freeze_progression` is global — once active for the student it
// overrides everything else (adaptive stays at current difficulty).
// ════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type OverrideType =
  | "difficulty_lock" | "pacing_lock" | "strategy_lock"
  | "manual_lesson"   | "freeze_progression" | "curriculum_pacing";

export interface OverrideRow {
  id: string;
  scope: "student" | "class" | "school";
  override_type: OverrideType;
  student_id: string | null;
  class_id: string | null;
  subject: string | null;
  topic: string | null;
  payload: Record<string, unknown>;
  active: boolean;
  effective_from: string;
  expires_at: string | null;
}

export interface TopicLockRow {
  id: string;
  scope: "student" | "class" | "school";
  student_id: string | null;
  class_id: string | null;
  subject: string;
  topic: string;
  state: "locked" | "unlocked";
}

export interface OverrideProfile {
  freezeProgression: boolean;
  difficultyLock: "low" | "medium" | "high" | null;
  pacingLock: "slow" | "normal" | "fast" | null;
  strategyLock: "worked_example" | "explanation" | "quiz" | "visual" | null;
  manualLessonRef: string | null;
  curriculumPacingDayIndex: number | null;
  topicLocked: boolean;
  reasons: string[];
  sourceIds: string[];
}

const SCOPE_RANK: Record<OverrideRow["scope"], number> = { student: 3, class: 2, school: 1 };

function applicable(row: OverrideRow, ctx: { studentId: string; classId?: string|null; subject?: string|null; topic?: string|null }, now: number): boolean {
  if (!row.active) return false;
  if (new Date(row.effective_from).getTime() > now) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  if (row.scope === "student"  && row.student_id !== ctx.studentId) return false;
  if (row.scope === "class"    && row.class_id   !== (ctx.classId ?? "")) return false;
  if (row.subject && ctx.subject && row.subject !== ctx.subject) return false;
  if (row.topic   && ctx.topic   && row.topic   !== ctx.topic)   return false;
  return true;
}

export function projectOverrides(
  rows: readonly OverrideRow[],
  locks: readonly TopicLockRow[],
  ctx: { studentId: string; classId?: string|null; subject?: string|null; topic?: string|null },
  nowMs: number = Date.now(),
): OverrideProfile {
  const profile: OverrideProfile = {
    freezeProgression: false,
    difficultyLock: null,
    pacingLock: null,
    strategyLock: null,
    manualLessonRef: null,
    curriculumPacingDayIndex: null,
    topicLocked: false,
    reasons: [],
    sourceIds: [],
  };

  // Group rows by override_type, take the strongest scope.
  const byType = new Map<OverrideType, OverrideRow>();
  for (const r of rows) {
    if (!applicable(r, ctx, nowMs)) continue;
    const existing = byType.get(r.override_type);
    if (!existing || SCOPE_RANK[r.scope] > SCOPE_RANK[existing.scope]) {
      byType.set(r.override_type, r);
    }
  }

  for (const [type, row] of byType.entries()) {
    profile.sourceIds.push(row.id);
    switch (type) {
      case "freeze_progression":
        profile.freezeProgression = true;
        profile.reasons.push(`freeze@${row.scope}`);
        break;
      case "difficulty_lock": {
        const v = String(row.payload.value ?? "").toLowerCase();
        if (v === "low" || v === "medium" || v === "high") {
          profile.difficultyLock = v;
          profile.reasons.push(`difficulty=${v}@${row.scope}`);
        }
        break;
      }
      case "pacing_lock": {
        const v = String(row.payload.value ?? "").toLowerCase();
        if (v === "slow" || v === "normal" || v === "fast") {
          profile.pacingLock = v;
          profile.reasons.push(`pacing=${v}@${row.scope}`);
        }
        break;
      }
      case "strategy_lock": {
        const v = String(row.payload.value ?? "");
        if (v === "worked_example" || v === "explanation" || v === "quiz" || v === "visual") {
          profile.strategyLock = v;
          profile.reasons.push(`strategy=${v}@${row.scope}`);
        }
        break;
      }
      case "manual_lesson":
        if (typeof row.payload.lesson_ref === "string" && row.payload.lesson_ref.length > 0) {
          profile.manualLessonRef = row.payload.lesson_ref;
          profile.reasons.push(`manual_lesson@${row.scope}`);
        }
        break;
      case "curriculum_pacing": {
        const n = Number(row.payload.day_index);
        if (Number.isFinite(n) && n >= 0) {
          profile.curriculumPacingDayIndex = Math.floor(n);
          profile.reasons.push(`pacing_day=${n}@${row.scope}`);
        }
        break;
      }
    }
  }

  // Topic-lock projection: any 'locked' row matching (subject, topic) wins
  // unless an explicit 'unlocked' override exists at student scope.
  if (ctx.subject && ctx.topic) {
    let locked = false;
    let explicitlyUnlocked = false;
    for (const l of locks) {
      if (l.subject !== ctx.subject || l.topic !== ctx.topic) continue;
      if (l.scope === "student" && l.student_id !== ctx.studentId) continue;
      if (l.scope === "class"   && l.class_id   !== (ctx.classId ?? "")) continue;
      if (l.state === "locked") locked = true;
      if (l.state === "unlocked" && l.scope === "student" && l.student_id === ctx.studentId) {
        explicitlyUnlocked = true;
      }
    }
    profile.topicLocked = locked && !explicitlyUnlocked;
    if (profile.topicLocked) profile.reasons.push(`topic_locked:${ctx.subject}/${ctx.topic}`);
  }

  return profile;
}

// Apply the override profile to the deterministic teaching trajectory
// outputs (difficulty/pacing/strategy). Caller must not mutate inputs.
export interface PolicyShape {
  difficulty: "low"|"medium"|"high";
  pacing: "slow"|"normal"|"fast";
  strategy: "worked_example"|"explanation"|"quiz"|"visual";
}
export function applyOverridesToPolicy(p: PolicyShape, prof: OverrideProfile): PolicyShape {
  return {
    difficulty: prof.difficultyLock ?? p.difficulty,
    pacing:     prof.pacingLock     ?? p.pacing,
    strategy:   prof.strategyLock   ?? p.strategy,
  };
}

// ─── IO ─────────────────────────────────────────────────────────────
export async function loadActiveOverrides(
  admin: SupabaseClient,
  schoolId: string,
): Promise<{ overrides: OverrideRow[]; locks: TopicLockRow[] }> {
  const [o, l] = await Promise.all([
    admin.from("teacher_overrides")
      .select("id, scope, override_type, student_id, class_id, subject, topic, payload, active, effective_from, expires_at")
      .eq("school_id", schoolId)
      .eq("active", true),
    admin.from("topic_locks")
      .select("id, scope, student_id, class_id, subject, topic, state")
      .eq("school_id", schoolId),
  ]);
  return {
    overrides: (o.data ?? []) as OverrideRow[],
    locks: (l.data ?? []) as TopicLockRow[],
  };
}
