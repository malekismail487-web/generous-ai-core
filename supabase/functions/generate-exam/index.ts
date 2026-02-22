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

function getVarietyInstructions(): string {
  const styles = [
    "Focus on application and real-world scenarios.",
    "Emphasize conceptual understanding and 'why' questions.",
    "Include tricky distractor options that test deep understanding.",
    "Mix easy recall questions with challenging analysis questions.",
    "Focus on problem-solving and computation.",
    "Include questions that require comparing and contrasting concepts.",
    "Ask questions about common misconceptions and exceptions.",
    "Focus on definitions, terminology, and precise language.",
    "Include multi-step reasoning questions.",
    "Ask about cause-and-effect relationships.",
  ];
  const shuffled = styles.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).join(" ");
}

const examTool = {
  type: "function" as const,
  function: {
    name: "create_exam",
    description: "Create a structured exam with multiple-choice questions. Use LaTeX notation for math: \\\\( ... \\\\) for inline math, $$ ... $$ for display math.",
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
              question: { type: "string", description: "The question text. Use LaTeX for math expressions." },
              option_a: { type: "string", description: "Option A text" },
              option_b: { type: "string", description: "Option B text" },
              option_c: { type: "string", description: "Option C text" },
              option_d: { type: "string", description: "Option D text" },
              correct_answer: { type: "string", enum: ["A", "B", "C", "D"], description: "The correct answer letter" },
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

function tryParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch (e1) {
    try {
      // Attempt 1: double-escape lone backslashes
      const sanitized = str.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(sanitized);
    } catch (e2) {
      try {
        // Attempt 2: remove all backslashes that aren't valid JSON escapes
        const stripped = str.replace(/\\(?!["\\/bfnrtu])/g, '');
        return JSON.parse(stripped);
      } catch (e3) {
        // Attempt 3: aggressively remove all non-standard chars and try
        const aggressive = str
          .replace(/[\x00-\x1F\x7F]/g, ' ')  // control chars
          .replace(/\\(?!["\\/bfnrtu])/g, ''); // bad escapes
        return JSON.parse(aggressive);
      }
    }
  }
}

function convertRawQuestion(q: Record<string, unknown>, idx: number) {
  if (q.option_a) {
    const ca = String(q.correct_answer || "A");
    const answerKey = `option_${ca.toLowerCase()}`;
    return {
      id: idx + 1,
      type: "multiple_choice",
      question: String(q.question),
      options: [`A) ${q.option_a}`, `B) ${q.option_b}`, `C) ${q.option_c}`, `D) ${q.option_d}`],
      correct_answer: `${ca}) ${q[answerKey] || q.option_a}`,
    };
  }
  const options = (q.options as string[]) || [];
  const correctAnswer = q.correct_answer ? String(q.correct_answer) : (options[0] || "A");
  return {
    id: idx + 1,
    type: String(q.type || "multiple_choice"),
    question: String(q.question),
    options,
    correct_answer: correctAnswer,
  };
}

// Distribute question counts across materials
function distributeCounts(total: number, buckets: number): number[] {
  if (buckets <= 0) return [total];
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  const result: number[] = [];
  for (let i = 0; i < buckets; i++) {
    result.push(base + (i < remainder ? 1 : 0));
  }
  // Shuffle so the "extra" questions aren't always on the first materials
  return result.sort(() => Math.random() - 0.5);
}

interface GenerateBatchParams {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  count: number;
}

async function generateBatch(params: GenerateBatchParams): Promise<Record<string, unknown>[]> {
  const { apiKey, systemPrompt, userPrompt, count } = params;
  // ~300 tokens per question is a safe estimate for tool-call JSON
  const maxTokens = Math.min(Math.max(count * 350, 4000), 16000);

  const fetchHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let response: Response | null = null;

  for (const model of models) {
    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [examTool],
      tool_choice: { type: "function", function: { name: "create_exam" } },
      temperature: 0.9 + Math.random() * 0.1,
      max_tokens: maxTokens,
    });

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: fetchHeaders,
        body,
      });
      if (response.status !== 429) break;
      const waitMs = Math.pow(2, attempt) * 2000;
      console.log(`Rate limited on ${model}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, waitMs));
    }
    if (response && response.status !== 429) {
      console.log(`Using model: ${model} for batch of ${count}`);
      break;
    }
    console.log(`Model ${model} exhausted retries, trying fallback...`);
  }

  if (!response || response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  let raw: Record<string, unknown>;

  if (!response.ok) {
    const errorBody = await response.text();
    let failedGen: string | null = null;
    try {
      const errJson = JSON.parse(errorBody);
      failedGen = errJson?.error?.failed_generation || null;
    } catch { /* ignore */ }

    if (failedGen) {
      const jsonMatch = failedGen.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        raw = tryParseJson(jsonMatch[0]);
      } else {
        console.error("Groq API error:", response.status, errorBody);
        throw new Error("Failed to generate exam questions");
      }
    } else {
      console.error("Groq API error:", response.status, errorBody);
      throw new Error("Failed to generate exam questions");
    }
  } else {
    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall && toolCall.function?.name === "create_exam") {
      raw = tryParseJson(toolCall.function.arguments);
    } else {
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
      if (jsonMatch) {
        raw = tryParseJson(jsonMatch[0]);
      } else {
        console.error("No structured data in response:", JSON.stringify(data).substring(0, 500));
        throw new Error("AI did not return structured exam data");
      }
    }
  }

  const rawQuestions = (raw.questions || []) as Record<string, unknown>[];
  return rawQuestions.filter(q => q && q.question);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, grade, difficulty, count, materials, examType, adaptiveLevel } = await req.json();

    const userKey = await getUserApiKey(req.headers.get("authorization"));
    const GROQ_API_KEY = userKey || Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("No AI API key configured. Please add your Groq API key in the settings.");
    }
    if (!count || count <= 0) {
      throw new Error("count is required and must be positive");
    }

    const seed = Math.floor(Math.random() * 100000);
    const timestamp = Date.now();
    const varietyInstructions = getVarietyInstructions();
    const adaptiveLevelHint = adaptiveLevel
      ? `\n\nIMPORTANT ADAPTIVE LEVEL: The student is at a "${adaptiveLevel}" level. ${adaptiveLevel === 'beginner' ? 'Generate simpler questions with clear, straightforward language. Focus on foundational concepts.' : adaptiveLevel === 'advanced' ? 'Generate challenging questions that test deeper understanding, edge cases, and multi-step reasoning.' : 'Generate questions at a moderate difficulty with a mix of recall and application.'}`
      : '';
    const dynamicDirective = `CRITICAL: This is generation #${seed}-${timestamp}. You MUST generate completely NEW and DIFFERENT questions from any previous generation. ${varietyInstructions} Shuffle the order of topics you cover. Vary which aspects of each topic you test. Never repeat the same question patterns.${adaptiveLevelHint}`;

    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n').substring(0, 10000)
      : null;
    const materialCount = materials?.length || 0;

    // Determine batch strategy: for <= 15 questions, single batch. For more, split into batches of ~15.
    const MAX_PER_BATCH = 15;
    let allQuestions: Record<string, unknown>[] = [];

    if (examType === 'SAT_FULL') {
      // SAT: split into batches
      const batches = Math.ceil(count / MAX_PER_BATCH);
      const batchSizes = distributeCounts(count, batches);

      for (let b = 0; b < batchSizes.length; b++) {
        const batchCount = batchSizes[b];
        if (batchCount <= 0) continue;
        const batchSeed = Math.floor(Math.random() * 100000);
        const systemPrompt = `You are an expert SAT exam generator. Use LaTeX notation for all math: \\( ... \\) for inline, $$ ... $$ for display. ${dynamicDirective} Batch seed: ${batchSeed}.`;
        const userPrompt = `Generate EXACTLY ${batchCount} multiple-choice SAT questions. Cover: Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar, Vocabulary. Each question must have exactly 4 options (A, B, C, D). Use LaTeX for mathematical expressions. This is batch ${b + 1} of ${batchSizes.length} — make questions unique.`;

        const batchQuestions = await generateBatch({ apiKey: GROQ_API_KEY, systemPrompt, userPrompt, count: batchCount });
        allQuestions.push(...batchQuestions);
      }
    } else if (materialContext && materialCount > 0) {
      // Material-based: distribute questions across materials
      const distribution = distributeCounts(count, materialCount);
      const materialsList = materials as { topic: string; content: string }[];

      for (let m = 0; m < materialsList.length; m++) {
        const batchCount = distribution[m];
        if (batchCount <= 0) continue;
        const mat = materialsList[m];
        const batchSeed = Math.floor(Math.random() * 100000);
        const systemPrompt = `You are an expert exam generator. Use LaTeX notation for math: \\( ... \\) for inline, $$ ... $$ for display. ${dynamicDirective} Batch seed: ${batchSeed}.`;
        const userPrompt = `Generate EXACTLY ${batchCount} multiple-choice questions based on this study material:

Topic: ${mat.topic}
${mat.content?.substring(0, 5000) || ''}

Subject: ${subject}, Grade: ${grade || 'General'}, Difficulty: ${difficulty}.
Generate COMPLETELY UNIQUE questions. Use LaTeX for math. Each question must have exactly 4 options (A, B, C, D).`;

        const batchQuestions = await generateBatch({ apiKey: GROQ_API_KEY, systemPrompt, userPrompt, count: batchCount });
        allQuestions.push(...batchQuestions);
      }

      // If we didn't get enough from material batches, generate remaining as general
      if (allQuestions.length < count) {
        const remaining = count - allQuestions.length;
        console.log(`Got ${allQuestions.length}/${count} from materials, generating ${remaining} more`);
        const batchSeed = Math.floor(Math.random() * 100000);
        const systemPrompt = `You are an expert exam generator. Use LaTeX notation for math: \\( ... \\) for inline, $$ ... $$ for display. ${dynamicDirective} Batch seed: ${batchSeed}.`;
        const userPrompt = `Generate EXACTLY ${remaining} multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. Each question must have exactly 4 options (A, B, C, D). Use LaTeX for math. Make each question unique.`;
        const extraQuestions = await generateBatch({ apiKey: GROQ_API_KEY, systemPrompt, userPrompt, count: remaining });
        allQuestions.push(...extraQuestions);
      }
    } else {
      // No materials: split into batches for large counts
      const batches = Math.ceil(count / MAX_PER_BATCH);
      const batchSizes = distributeCounts(count, batches);

      for (let b = 0; b < batchSizes.length; b++) {
        const batchCount = batchSizes[b];
        if (batchCount <= 0) continue;
        const batchSeed = Math.floor(Math.random() * 100000);
        const systemPrompt = `You are an expert exam generator. Use LaTeX notation for math: \\( ... \\) for inline, $$ ... $$ for display. ${dynamicDirective} Batch seed: ${batchSeed}.`;
        const userPrompt = `Generate EXACTLY ${batchCount} multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. Cover DIVERSE sub-topics within ${subject}. Each question must have exactly 4 options (A, B, C, D). Use LaTeX for math. This is batch ${b + 1} of ${batchSizes.length} — make questions unique and different.`;

        const batchQuestions = await generateBatch({ apiKey: GROQ_API_KEY, systemPrompt, userPrompt, count: batchCount });
        allQuestions.push(...batchQuestions);
      }

      // Fill remaining if needed
      if (allQuestions.length < count) {
        const remaining = count - allQuestions.length;
        console.log(`Got ${allQuestions.length}/${count}, generating ${remaining} more`);
        const batchSeed = Math.floor(Math.random() * 100000);
        const systemPrompt = `You are an expert exam generator. Use LaTeX notation for math: \\( ... \\) for inline, $$ ... $$ for display. ${dynamicDirective} Batch seed: ${batchSeed}.`;
        const userPrompt = `Generate EXACTLY ${remaining} multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. Each question must have exactly 4 options (A, B, C, D). Use LaTeX for math.`;
        const extraQuestions = await generateBatch({ apiKey: GROQ_API_KEY, systemPrompt, userPrompt, count: remaining });
        allQuestions.push(...extraQuestions);
      }
    }

    // Convert all to frontend format
    const questions = allQuestions.map((q, idx) => convertRawQuestion(q, idx));

    console.log(`Generated ${questions.length}/${count} questions total`);

    const result = {
      exam_title: `${subject || 'SAT'} ${difficulty || ''} Exam`.trim(),
      grade_level: grade || "General",
      subject: subject || "Mixed",
      total_questions: questions.length,
      questions,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate exam error:", error);
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "All AI models are busy. Please wait 10-15 seconds and try again." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
