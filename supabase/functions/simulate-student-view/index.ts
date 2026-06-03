// POST /admin/simulate/student-view
// Runs the deterministic policy engine against a hypothetical curriculum
// change WITHOUT persisting anything. Read-only.
// Body: {
//   studentId: string,
//   conceptOverrides?: { conceptId: string, difficulty_weight?: number }[],
//   syntheticConcept?: { name: string, difficulty_weight: number, lectureId?: string }
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

type Difficulty = "low" | "medium" | "high";
type Pacing = "slow" | "normal" | "fast";
type Strategy = "worked_example" | "explanation" | "quiz" | "visual";
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function derivePolicy(i: any) {
  const theta = i.theta ?? 0;
  const se = i.standardError ?? 1.0;
  const concept = clamp(i.conceptMastery ?? 0.5, 0, 1);
  const lecture = clamp(i.lectureMastery ?? 0.5, 0, 1);
  const cDiff = clamp(i.conceptDifficulty ?? 1.0, 0, 3);
  const errs = Math.max(0, i.recentErrorCount ?? 0);
  const visual = !!i.visualPreference;
  const eff = theta + (concept - 0.5) * 1.5 - (cDiff - 1.0) * 0.4;
  const difficulty: Difficulty = eff < -0.4 ? "low" : eff > 0.5 ? "high" : "medium";
  const pacing: Pacing =
    (se > 0.55 || errs >= 3 || concept < 0.35) ? "slow" :
    (se < 0.30 && concept > 0.75 && errs === 0) ? "fast" : "normal";
  let strategy: Strategy;
  if (concept < 0.35 || errs >= 3) strategy = "worked_example";
  else if (concept < 0.65) strategy = "explanation";
  else if (visual && concept < 0.85) strategy = "visual";
  else strategy = "quiz";
  return {
    difficulty, pacing, strategy,
    cognitiveLoad: r2(clamp(0.35 + concept * 0.4 - errs * 0.05, 0.2, 0.85)),
    remediationLevel: r2(clamp((1 - concept) * 0.8 + Math.min(errs, 5) * 0.05, 0, 1)),
    verificationFrequency: r2(clamp(0.25 + se * 0.4 + (1 - concept) * 0.3, 0.2, 0.95)),
    abstractionLevel: r2(clamp(lecture * 0.7 + concept * 0.3, 0.1, 0.95)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = u.user.id;

    // Caller must be school_admin / teacher / super admin (simulation is an admin tool)
    const { data: prof } = await admin.from("profiles").select("user_type, school_id").eq("id", callerId).maybeSingle();
    const role = prof?.user_type;
    const isSuper = (await admin.rpc("is_super_admin_user", { uid: callerId })).data === true;
    if (!isSuper && role !== "school_admin" && role !== "teacher") {
      return json({ error: "Forbidden — admin tool" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const studentId: string = body.studentId;
    if (!studentId) return json({ error: "studentId required" }, 400);

    // Cross-school guard
    const { data: studProf } = await admin.from("profiles").select("school_id").eq("id", studentId).maybeSingle();
    if (!isSuper && studProf?.school_id !== prof?.school_id) {
      return json({ error: "Forbidden — cross-school" }, 403);
    }

    const overrides: Array<{ conceptId: string; difficulty_weight?: number }> = body.conceptOverrides || [];
    const synthetic = body.syntheticConcept as
      | { name: string; difficulty_weight: number; lectureId?: string }
      | undefined;

    // Pull all concept masteries for this student
    const { data: cm } = await admin
      .from("concept_mastery")
      .select("concept_id, mastery_score, subject")
      .eq("user_id", studentId);

    const results: any[] = [];

    // Simulate overrides
    for (const ov of overrides) {
      const { data: c } = await admin.from("concepts").select("*").eq("id", ov.conceptId).maybeSingle();
      if (!c) continue;
      const mastery = cm?.find((m: any) => m.concept_id === c.id)?.mastery_score ?? 0.5;
      const policy = derivePolicy({
        conceptMastery: mastery,
        conceptDifficulty: ov.difficulty_weight ?? c.difficulty_weight,
      });
      results.push({ kind: "override", conceptId: c.id, name: c.name, policy });
    }

    // Simulate a brand-new concept that doesn't exist yet
    if (synthetic) {
      const policy = derivePolicy({
        conceptMastery: 0.5,
        conceptDifficulty: synthetic.difficulty_weight,
      });
      results.push({ kind: "synthetic", name: synthetic.name, policy });
    }

    return json({ simulated: true, studentId, results });
  } catch (e) {
    console.error("simulate-student-view error", e);
    return json({ error: "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
