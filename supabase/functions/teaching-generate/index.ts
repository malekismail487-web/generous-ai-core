// POST /teaching/generate
// Deterministic TeachingPolicy → AI-generated lesson output.
// Body: { studentId, lectureId?, conceptId?, context?: string }
// School isolation enforced via the caller's JWT + concept_mastery RLS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---- Inlined deterministic policy (mirrors src/lib/adaptive/teachingPolicy.ts) ----
type Difficulty = "low" | "medium" | "high";
type Pacing = "slow" | "normal" | "fast";
type Strategy = "worked_example" | "explanation" | "quiz" | "visual";
interface TeachingPolicy {
  difficulty: Difficulty; pacing: Pacing; strategy: Strategy;
  cognitiveLoad: number; remediationLevel: number;
  verificationFrequency: number; abstractionLevel: number;
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function derivePolicy(i: {
  theta?: number; standardError?: number; conceptMastery?: number;
  lectureMastery?: number; conceptDifficulty?: number;
  recentErrorCount?: number; visualPreference?: boolean;
}): TeachingPolicy {
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

function policyPrompt(p: TeachingPolicy): string {
  return [
    "=== TEACHING POLICY (deterministic) ===",
    `Difficulty: ${p.difficulty}`,
    `Pacing: ${p.pacing}`,
    `Strategy: ${p.strategy}`,
    `Cognitive load target: ${p.cognitiveLoad}`,
    `Remediation level: ${p.remediationLevel}`,
    `Verification frequency: ${p.verificationFrequency}`,
    `Abstraction level: ${p.abstractionLevel}`,
    "Generate the lesson strictly within these constraints.",
  ].join("\n");
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
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Invalid auth" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const studentId: string = body.studentId || callerId;
    const lectureId: string | undefined = body.lectureId;
    const conceptId: string | undefined = body.conceptId;
    const context: string = (body.context || "").toString().slice(0, 2000);

    // Authorization: self, or someone who can_view_student_mastery
    if (studentId !== callerId) {
      const { data: ok } = await admin.rpc("can_view_student_mastery", {
        p_viewer: callerId, p_student: studentId,
      });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }

    // Load concept (if provided) for difficulty_weight
    let conceptRow: any = null;
    let lectureRow: any = null;
    if (conceptId) {
      const { data } = await admin.from("concepts").select("*").eq("id", conceptId).maybeSingle();
      conceptRow = data;
      if (conceptRow?.lecture_id) {
        const { data: l } = await admin.from("lectures").select("*").eq("id", conceptRow.lecture_id).maybeSingle();
        lectureRow = l;
      }
    } else if (lectureId) {
      const { data: l } = await admin.from("lectures").select("*").eq("id", lectureId).maybeSingle();
      lectureRow = l;
    }

    // Subject IRT state
    const subjectName = lectureRow ? await resolveSubjectName(lectureRow.subject_id) : undefined;
    let theta = 0, se = 1.0;
    if (subjectName) {
      const { data: prof } = await admin
        .from("student_learning_profiles")
        .select("theta, standard_error")
        .eq("user_id", studentId).eq("subject", subjectName).maybeSingle();
      if (prof) { theta = Number(prof.theta ?? 0); se = Number(prof.standard_error ?? 1.0); }
    }

    // Concept mastery
    let conceptMastery = 0.5, lectureMastery = 0.5, recentErrors = 0;
    if (conceptRow) {
      const { data: cm } = await admin
        .from("concept_mastery")
        .select("mastery_score")
        .eq("user_id", studentId).eq("concept_id", conceptRow.id).maybeSingle();
      if (cm) conceptMastery = Number(cm.mastery_score ?? 0.5);
    }
    if (lectureRow) {
      // Average mastery across all concepts in lecture for "lectureMastery"
      const { data: lc } = await admin
        .from("concepts").select("id").eq("lecture_id", lectureRow.id);
      const ids = (lc || []).map((c: any) => c.id);
      if (ids.length) {
        const { data: rows } = await admin
          .from("concept_mastery").select("mastery_score")
          .eq("user_id", studentId).in("concept_id", ids);
        if (rows && rows.length) {
          lectureMastery = rows.reduce((s: number, r: any) => s + Number(r.mastery_score ?? 0.5), 0) / rows.length;
        }
      }
    }

    // Visual preference (best-effort)
    let visual = false;
    const { data: ls } = await admin
      .from("user_learning_styles" as any).select("dominant_style")
      .eq("user_id", studentId).maybeSingle();
    if (ls && (ls as any).dominant_style === "visual") visual = true;

    const policy = derivePolicy({
      theta, standardError: se,
      conceptMastery, lectureMastery,
      conceptDifficulty: conceptRow ? Number(conceptRow.difficulty_weight ?? 1.0) : 1.0,
      recentErrorCount: recentErrors,
      visualPreference: visual,
    });

    // Generate lesson content via Lovable AI Gateway
    const systemPrompt = [
      "You are Lumina, an adaptive tutor. Output a single short lesson segment that strictly follows the teaching policy below.",
      policyPrompt(policy),
      conceptRow ? `Concept: ${conceptRow.name}` : "",
      lectureRow ? `Lecture: ${lectureRow.title}` : "",
      context ? `Additional context: ${context}` : "",
      "Keep the response focused. No meta-commentary about the policy itself.",
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context || "Teach me this concept now." },
        ],
      }),
    });

    if (!aiResp.ok) {
      const code = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      return json({ error: "AI generation failed", policy }, code);
    }
    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content ?? "";

    return json({ policy, content, theta, standardError: se, conceptMastery, lectureMastery });
  } catch (e) {
    console.error("teaching-generate error", e);
    return json({ error: "Internal error" }, 500);
  }
});

async function resolveSubjectName(subjectId: string): Promise<string | undefined> {
  const { data } = await admin.from("subjects").select("name").eq("id", subjectId).maybeSingle();
  return data?.name as string | undefined;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
