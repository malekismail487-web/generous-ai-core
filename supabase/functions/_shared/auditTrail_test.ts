import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describeLessonAudit } from "./auditTrail.ts";

Deno.test("describeLessonAudit produces canonical action and payload", () => {
  const e = describeLessonAudit({
    studentId: "stu-1", schoolId: "sch-1",
    subject: "math", topic: "fractions",
    policyHash: "abc123",
    bindingStandardCode: "MATH.G7.NS.1",
    bindingObjectiveCode: "LO1",
    overrideReasons: ["difficulty=low@student"],
  });
  assertEquals(e.action, "ai.lesson.generated");
  assertEquals(e.targetId, "abc123");
  assertEquals((e.payload as any).standard_code, "MATH.G7.NS.1");
  assertEquals((e.payload as any).override_reasons[0], "difficulty=low@student");
});

Deno.test("describeLessonAudit tolerates null binding", () => {
  const e = describeLessonAudit({
    studentId: "s", schoolId: null, subject: "x", topic: null,
    policyHash: "h", bindingStandardCode: null, bindingObjectiveCode: null,
    overrideReasons: [],
  });
  assertEquals((e.payload as any).standard_code, null);
});
