import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getUserApiKey(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return null;
    const { data } = await supabase
      .from("user_api_keys")
      .select("groq_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.groq_api_key || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, grade, difficulty, count, materials, examType } = await req.json();
    
    const userKey = await getUserApiKey(req.headers.get("authorization"));
    const GROQ_API_KEY = userKey || Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("No AI API key configured. Please add your Groq API key in the settings.");
    }

    if (!count || count <= 0) {
      throw new Error("count is required and must be positive");
    }

    // Add randomness seed to ensure different results each time
    const randomSeed = Math.floor(Math.random() * 10000);
    const shuffleInstruction = `Variation seed: ${randomSeed}. Generate FRESH, UNIQUE questions different from any previous generation. Randomize question order and vary topics covered.`;

    // Build material context
    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n').substring(0, 10000)
      : null;

    const materialCount = materials?.length || 0;

    let systemPrompt: string;
    let userPrompt: string;

    if (examType === 'SAT_FULL') {
      systemPrompt = `You are an expert SAT exam generator. You ONLY output valid JSON exam objects. You never add explanations, markdown, or extra text outside the JSON. ${shuffleInstruction}`;
      userPrompt = `Generate a complete Full SAT Practice Exam with EXACTLY ${count} multiple-choice questions.
Structure: ~70 Reading/Writing + ~70 Math questions.
Cover: Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar, Vocabulary.
${shuffleInstruction}

RESPOND WITH ONLY THIS JSON (no extra text, no markdown, no backticks):
{
  "exam_title": "Full SAT Practice Exam",
  "grade_level": "High School",
  "subject": "SAT",
  "total_questions": ${count},
  "questions": [
    {"id": 1, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A) ..."},
    {"id": 2, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "B) ..."}
  ]
}

Rules:
- id must be sequential 1 to ${count}
- options must have EXACTLY 4 items
- correct_answer must EXACTLY match one option
- questions array must have EXACTLY ${count} items
- Use LaTeX for math: \\( ... \\) inline, $$ ... $$ display`;
    } else if (materialContext) {
      const questionsPerMaterial = materialCount > 0 ? Math.floor(count / materialCount) : count;
      const extra = materialCount > 0 ? count % materialCount : 0;

      systemPrompt = `You are an expert exam generator. You ONLY output valid JSON exam objects. You never add explanations, markdown, or extra text outside the JSON.`;
      userPrompt = `Generate EXACTLY ${count} multiple-choice exam questions based on the saved study materials below.
${shuffleInstruction}

STUDY MATERIALS (${materialCount} topics):
${materialContext}

Exam Details:
- Subject: ${subject}
- Grade: ${grade || 'General'}
- Difficulty: ${difficulty}
- Total Questions: EXACTLY ${count}

Rules:
1. Distribute questions EVENLY: ~${questionsPerMaterial} per topic${extra > 0 ? ` (+${extra} extra from any topic)` : ''}
2. Every topic MUST have at least 1 question
3. Questions MUST come from the materials above
4. 4 options per question (A, B, C, D format)
5. correct_answer must EXACTLY match one option
6. Use LaTeX for math: \\( ... \\) inline, $$ ... $$ display
7. Generate FRESH questions — do not repeat previous exams

RESPOND WITH ONLY THIS JSON (no extra text, no markdown, no backticks):
{
  "exam_title": "${subject} ${difficulty} Exam",
  "grade_level": "${grade || 'General'}",
  "subject": "${subject}",
  "total_questions": ${count},
  "questions": [
    {"id": 1, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A) ..."},
    {"id": 2, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "B) ..."}
  ]
}

id must be sequential 1 to ${count}. Generate ALL ${count} questions now.`;
    } else {
      systemPrompt = `You are an expert exam generator. You ONLY output valid JSON exam objects. You never add explanations, markdown, or extra text outside the JSON.`;
      userPrompt = `Generate EXACTLY ${count} multiple-choice exam questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty.
${shuffleInstruction}

RESPOND WITH ONLY THIS JSON (no extra text, no markdown, no backticks):
{
  "exam_title": "${subject} ${difficulty} Exam",
  "grade_level": "${grade || 'General'}",
  "subject": "${subject}",
  "total_questions": ${count},
  "questions": [
    {"id": 1, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A) ..."},
    {"id": 2, "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "B) ..."}
  ]
}

id must be sequential 1 to ${count}. Use LaTeX for math. Generate ALL ${count} questions now.`;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8 + Math.random() * 0.2,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("Groq API error:", response.status, errorText);
      throw new Error("Failed to generate exam questions");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI did not return valid JSON");
      }
    }

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error("Invalid exam structure returned");
    }

    const fixedQuestions = parsed.questions.map((q: Record<string, unknown>, idx: number) => ({
      ...q,
      id: idx + 1,
      type: q.type || "multiple_choice",
    }));

    const result = {
      ...parsed,
      total_questions: fixedQuestions.length,
      questions: fixedQuestions,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate exam error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
