// POST /outcome-report
// Computes the ministry-readable dashboard JSON for a pilot (or for a
// school+subject window when pilot_id is omitted). Uses the deterministic
// helpers in _shared/outcomeValidation.ts — no IO inside the math layer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comparePilot, type ScorePair } from "../_shared/outcomeValidation.ts";
import { recordAudit } from "../_shared/auditTrail.ts";

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
  const user = auth?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin.from("profiles").select("school_id, user_type").eq("id", user.id).maybeSingle();
  if (!profile || (profile.user_type !== "school_admin" && profile.user_type !== "teacher"))
    return json({ error: "forbidden" }, 403);
  const schoolId = profile.school_id;
  if (!schoolId) return json({ error: "no school" }, 400);

  const pilotId: string | null = body.pilot_id ?? null;
  const subject: string | null = body.subject ?? null;

  // Fetch arm assignments (treatment/control)
  let assignmentRows: { student_id: string; arm: "treatment"|"control" }[] = [];
  if (pilotId) {
    const { data } = await admin.from("pilot_assignments")
      .select("student_id, arm").eq("pilot_id", pilotId);
    assignmentRows = (data ?? []) as any;
  }
  const armOf = new Map(assignmentRows.map(r => [r.student_id, r.arm]));

  // Fetch scores in scope
  let scoreQuery = admin.from("assessment_scores")
    .select("student_id, subject, phase, pct, measured_at")
    .eq("school_id", schoolId);
  if (subject) scoreQuery = scoreQuery.eq("subject", subject);
  if (pilotId) scoreQuery = scoreQuery.eq("pilot_id", pilotId);
  const { data: scoreRows, error: scoreErr } = await scoreQuery;
  if (scoreErr) return json({ error: scoreErr.message }, 400);

  // Group per student
  type Grouped = { pre?: number; post?: number; r7?: number; r14?: number; r30?: number };
  const byStudent = new Map<string, Grouped>();
  for (const r of scoreRows ?? []) {
    const g = byStudent.get(r.student_id) ?? {};
    const pct = Number(r.pct);
    if (r.phase === "pretest")        g.pre = pct;
    else if (r.phase === "posttest")  g.post = pct;
    else if (r.phase === "retention_7d")  g.r7  = pct;
    else if (r.phase === "retention_14d") g.r14 = pct;
    else if (r.phase === "retention_30d") g.r30 = pct;
    byStudent.set(r.student_id, g);
  }

  const tPairs: ScorePair[] = [];
  const cPairs: ScorePair[] = [];
  const tRet: Array<{tDays:number; retention:number}> = [];
  const cRet: Array<{tDays:number; retention:number}> = [];

  for (const [sid, g] of byStudent.entries()) {
    if (g.pre == null || g.post == null) continue;
    const pair: ScorePair = { pre: g.pre, post: g.post, max: 1 };
    const arm = armOf.get(sid);
    if (arm === "control") {
      cPairs.push(pair);
      if (g.r7  != null) cRet.push({ tDays: 7,  retention: g.r7  });
      if (g.r14 != null) cRet.push({ tDays: 14, retention: g.r14 });
      if (g.r30 != null) cRet.push({ tDays: 30, retention: g.r30 });
    } else {
      // Default unassigned students to treatment (they use Lumina).
      tPairs.push(pair);
      if (g.r7  != null) tRet.push({ tDays: 7,  retention: g.r7  });
      if (g.r14 != null) tRet.push({ tDays: 14, retention: g.r14 });
      if (g.r30 != null) tRet.push({ tDays: 30, retention: g.r30 });
    }
  }

  const cmp = comparePilot(tPairs, cPairs, { treatment: tRet, control: cRet });

  const report = {
    school_id: schoolId,
    pilot_id: pilotId,
    subject: subject,
    students_total: byStudent.size,
    students_with_pair: tPairs.length + cPairs.length,
    comparison: cmp,
    generated_at: new Date().toISOString(),
  };

  await recordAudit(admin, {
    action: "outcome.report.generated", actorId: user.id, actorRole: profile.user_type, schoolId,
    targetType: "pilot", targetId: pilotId ?? `${subject ?? "all"}`,
    payload: { students: report.students_with_pair, lift: cmp.normalisedGainLift },
  });

  return json(report);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
