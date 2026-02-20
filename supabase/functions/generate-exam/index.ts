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

function buildPrompts(subject: string, grade: string, difficulty: string, count: number, materialContext: string | null, materialCount: number, examType: string) {
  const randomSeed = Math.floor(Math.random() * 10000);
  const variation = `Seed: ${randomSeed}. Generate FRESH, UNIQUE questions. Vary topics and angles.`;

  let systemPrompt: string;
  let userPrompt: string;

  if (examType === 'SAT_FULL') {
    systemPrompt = `You are an expert SAT exam generator. ${variation}`;
    userPrompt = `Generate a Full SAT Practice Exam with EXACTLY ${count} multiple-choice questions. Cover: Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar, Vocabulary. For math, write expressions in plain text (e.g. "x^2 + 3x - 5 = 0", "sqrt(16)", "x/y"). Do NOT use LaTeX backslash notation.`;
  } else if (materialContext) {
    const qPerTopic = materialCount > 0 ? Math.floor(count / materialCount) : count;
    systemPrompt = `You are an expert exam generator. ${variation}`;
    userPrompt = `Generate EXACTLY ${count} multiple-choice questions based on these study materials:\n\n${materialContext}\n\nSubject: ${subject}, Grade: ${grade || 'General'}, Difficulty: ${difficulty}. Distribute ~${qPerTopic} questions per topic. Every topic must have at least 1 question. For math, write in plain text (e.g. "x^2", "sqrt(x)"). Do NOT use LaTeX.`;
  } else {
    systemPrompt = `You are an expert exam generator. ${variation}`;
    userPrompt = `Generate EXACTLY ${count} multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. For math, write in plain text (e.g. "x^2", "sqrt(x)"). Do NOT use LaTeX.`;
  }

  return { systemPrompt, userPrompt };
}

const examTool = {
  type: "function" as const,
  function: {
    name: "create_exam",
    description: "Create a structured exam with multiple-choice questions",
    parameters: {
      type: "object",
      properties: {
        exam_title: { type: "string", description: "Title of the exam" },
        grade_level: { type: "string", description: "Grade level" },
        subject: { type: "string", description: "Subject name" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question text" },
              option_a: { type: "string", description: "Option A" },
              option_b: { type: "string", description: "Option B" },
              option_c: { type: "string", description: "Option C" },
              option_d: { type: "string", description: "Option D" },
              correct_answer: { type: "string", enum: ["A", "B", "C", "D"], description: "Correct answer letter" },
            },
            required: ["question", "option_a", "option_b", "option_c", "option_d", "correct_answer"],
            additionalProperties: false,
          },
        },
      },
      required: ["exam_title", "grade_level", "subject", "questions"],
      additionalProperties: false,
    },
  },
};

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

    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n').substring(0, 10000)
      : null;
    const materialCount = materials?.length || 0;

    const { systemPrompt, userPrompt } = buildPrompts(subject, grade, difficulty, count, materialContext, materialCount, examType);

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
        tools: [examTool],
        tool_choice: { type: "function", function: { name: "create_exam" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "create_exam") {
      throw new Error("AI did not return structured exam data");
    }

    const raw = JSON.parse(toolCall.function.arguments);

    // Convert tool-call format to the expected frontend format
    const questions = (raw.questions || []).map((q: Record<string, string>, idx: number) => ({
      id: idx + 1,
      type: "multiple_choice",
      question: q.question,
      options: [`A) ${q.option_a}`, `B) ${q.option_b}`, `C) ${q.option_c}`, `D) ${q.option_d}`],
      correct_answer: `${q.correct_answer}) ${q[`option_${q.correct_answer.toLowerCase()}`]}`,
    }));

    const result = {
      exam_title: raw.exam_title || `${subject} ${difficulty} Exam`,
      grade_level: raw.grade_level || grade || "General",
      subject: raw.subject || subject,
      total_questions: questions.length,
      questions,
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
