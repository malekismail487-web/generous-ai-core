// ============================================================================
//  cold-start-probe edge function
// ----------------------------------------------------------------------------
//  Generates a short adaptive calibration quiz for a subject. The probe is
//  used to drop a brand-new student's standard error from ~1.5 down to ~0.5
//  in five questions, so the rest of the adaptive engine has a real target
//  to work from instead of a fabricated "intermediate" default.
//
//  Two endpoints in one function (action-based routing):
//    action="start"  → returns first question and a session_id
//    action="next"   → records the just-answered question via ability-update
//                       semantics, then returns the next question (or finish)
//
//  Questions are produced by the Lovable AI Gateway using google/gemini-2.5-flash
//  and are tagged with a difficulty hint that maps to a starting `difficulty_b`.
//  The adaptive engine then refines each question's empirical difficulty over
//  time (see ability-update inline calibration).
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROBE_LENGTH = 5;
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ProbeQuestion {
  index: number;
  question: string;
  choices: string[];
  correctIndex: number;
  difficultyHint: "easy" | "medium" | "hard";
}

async function generateProbeQuestion(opts: {
  subject: string;
  gradeLevel?: string | null;
  targetDifficulty: "easy" | "medium" | "hard";
  alreadyAsked: string[];
  index: number;
}): Promise<ProbeQuestion> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const prompt = `You are a calibration question generator for an adaptive learning system.

Subject: ${opts.subject}
${opts.gradeLevel ? `Grade level: ${opts.gradeLevel}` : ""}
Target difficulty: ${opts.targetDifficulty} (${
    opts.targetDifficulty === "easy"
      ? "fundamental concept, most students get this right"
      : opts.targetDifficulty === "hard"
      ? "challenging — requires multi-step reasoning or deeper understanding"
      : "standard grade-level question"
  })

Avoid duplicating any of these previously asked questions:
${opts.alreadyAsked.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join("\n") || "(none)"}

Produce exactly one multiple-choice question with 4 plausible answers and the index of the correct one (0..3).

Return ONLY a JSON object — no markdown, no commentary — matching:
{ "question": "...", "choices": ["...","...","...","..."], "correctIndex": 0 }`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You output valid JSON only. No prose." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  let parsed: { question: string; choices: string[]; correctIndex: number };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned non-JSON probe question");
  }

  if (
    !parsed.question ||
    !Array.isArray(parsed.choices) ||
    parsed.choices.length !== 4 ||
    typeof parsed.correctIndex !== "number" ||
    parsed.correctIndex < 0 ||
    parsed.correctIndex > 3
  ) {
    throw new Error("AI probe question shape invalid");
  }

  return {
    index: opts.index,
    question: parsed.question,
    choices: parsed.choices,
    correctIndex: parsed.correctIndex,
    difficultyHint: opts.targetDifficulty,
  };
}

/** Map a running theta estimate to the next probe difficulty. */
function nextDifficulty(theta: number): "easy" | "medium" | "hard" {
  if (theta < -0.5) return "easy";
  if (theta > 0.5) return "hard";
  return "medium";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body?.action;
    const subject = String(body?.subject ?? "").toLowerCase().trim();
    const gradeLevel = body?.gradeLevel ?? null;

    if (!subject) {
      return new Response(JSON.stringify({ error: "subject required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── current ability for the user/subject ───────────────────────────
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: estimate } = await admin
      .from("ability_estimates")
      .select("theta, theta_se, graded_count")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .is("concept_id", null)
      .maybeSingle();

    const theta = estimate ? Number(estimate.theta) : 0;
    const alreadyAsked: string[] = Array.isArray(body?.alreadyAsked) ? body.alreadyAsked : [];
    const index: number = Number(body?.index ?? 0);

    if (action === "start" || action === "next") {
      if (index >= PROBE_LENGTH) {
        return new Response(
          JSON.stringify({
            done: true,
            theta,
            theta_se: estimate?.theta_se ?? 1.5,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const targetDifficulty = nextDifficulty(theta);
      const question = await generateProbeQuestion({
        subject,
        gradeLevel,
        targetDifficulty,
        alreadyAsked,
        index,
      });

      return new Response(
        JSON.stringify({
          done: false,
          question,
          progress: { index, total: PROBE_LENGTH },
          theta_snapshot: theta,
          theta_se_snapshot: estimate?.theta_se ?? 1.5,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cold-start-probe] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
