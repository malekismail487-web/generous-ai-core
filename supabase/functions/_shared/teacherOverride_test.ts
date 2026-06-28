import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  projectOverrides, applyOverridesToPolicy,
  type OverrideRow, type TopicLockRow,
} from "./teacherOverride.ts";

const NOW = Date.parse("2026-06-28T00:00:00Z");

const row = (over: Partial<OverrideRow>): OverrideRow => ({
  id: crypto.randomUUID(),
  scope: "school", override_type: "difficulty_lock",
  student_id: null, class_id: null, subject: null, topic: null,
  payload: {}, active: true,
  effective_from: "2026-01-01T00:00:00Z", expires_at: null,
  ...over,
});

Deno.test("expired override is ignored", () => {
  const r = row({ override_type: "freeze_progression", expires_at: "2026-06-27T00:00:00Z" });
  const p = projectOverrides([r], [], { studentId: "S" }, NOW);
  assertEquals(p.freezeProgression, false);
});

Deno.test("student scope beats school scope", () => {
  const school = row({ scope: "school", override_type: "difficulty_lock", payload: { value: "high" } });
  const student = row({ scope: "student", student_id: "S", override_type: "difficulty_lock", payload: { value: "low" } });
  const p = projectOverrides([school, student], [], { studentId: "S" }, NOW);
  assertEquals(p.difficultyLock, "low");
});

Deno.test("subject filter excludes non-matching subjects", () => {
  const r = row({ override_type: "pacing_lock", payload: { value: "slow" }, subject: "math" });
  const p = projectOverrides([r], [], { studentId: "S", subject: "english" }, NOW);
  assertEquals(p.pacingLock, null);
});

Deno.test("topic lock locks when scope matches", () => {
  const lock: TopicLockRow = {
    id: "l1", scope: "school", student_id: null, class_id: null,
    subject: "math", topic: "calc", state: "locked",
  };
  const p = projectOverrides([], [lock], { studentId: "S", subject: "math", topic: "calc" }, NOW);
  assertEquals(p.topicLocked, true);
});

Deno.test("student-scope unlock beats school-scope lock", () => {
  const locks: TopicLockRow[] = [
    { id: "l1", scope: "school", student_id: null, class_id: null, subject: "math", topic: "calc", state: "locked" },
    { id: "l2", scope: "student", student_id: "S", class_id: null, subject: "math", topic: "calc", state: "unlocked" },
  ];
  const p = projectOverrides([], locks, { studentId: "S", subject: "math", topic: "calc" }, NOW);
  assertEquals(p.topicLocked, false);
});

Deno.test("applyOverridesToPolicy substitutes locked dimensions only", () => {
  const base = { difficulty: "medium" as const, pacing: "fast" as const, strategy: "explanation" as const };
  const prof = projectOverrides([
    row({ override_type: "difficulty_lock", payload: { value: "low" } }),
  ], [], { studentId: "S" }, NOW);
  const out = applyOverridesToPolicy(base, prof);
  assertEquals(out.difficulty, "low");
  assertEquals(out.pacing, "fast");
  assertEquals(out.strategy, "explanation");
});

Deno.test("freeze_progression flag flows through and is auditable", () => {
  const p = projectOverrides([row({ override_type: "freeze_progression" })], [], { studentId: "S" }, NOW);
  assertEquals(p.freezeProgression, true);
  assertEquals(p.reasons.includes("freeze@school"), true);
  assertEquals(p.sourceIds.length, 1);
});

Deno.test("curriculum_pacing parses day index", () => {
  const p = projectOverrides([
    row({ override_type: "curriculum_pacing", payload: { day_index: 12 } }),
  ], [], { studentId: "S" }, NOW);
  assertEquals(p.curriculumPacingDayIndex, 12);
});
