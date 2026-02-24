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
    "Emphasize conceptual understanding.",
    "Include tricky distractor options.",
    "Mix easy recall with challenging analysis.",
    "Focus on problem-solving and computation.",
    "Compare and contrast concepts.",
    "Ask about common misconceptions.",
    "Focus on definitions and terminology.",
    "Include multi-step reasoning questions.",
    "Ask about cause-and-effect relationships.",
  ];
  const shuffled = styles.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).join(" ");
}

/**
 * ROBUST LaTeX-safe JSON extraction.
 * Strategy: Extract the raw text, fix LaTeX backslashes that break JSON,
 * then parse. This allows the AI to use full LaTeX like \frac, \sqrt, etc.
 */
function extractJsonFromResponse(response: string): unknown {
  // Strip markdown code blocks
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find JSON boundaries
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in response");

  const opener = cleaned[jsonStart];
  const closer = opener === '[' ? ']' : '}';
  const jsonEnd = cleaned.lastIndexOf(closer);

  if (jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error("No valid JSON boundaries found");

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  // Remove control characters (newlines inside strings etc)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");

  // Try direct parse first (unlikely with LaTeX but worth trying)
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // =====================================================
  // KEY FIX: Properly escape LaTeX backslashes for JSON
  // =====================================================
  // In JSON, only these escape sequences are valid after \:
  //   " \ / b f n r t u
  // LaTeX uses \frac, \sqrt, \alpha, etc. which are INVALID JSON escapes.
  // We need to double-escape them: \frac -> \\frac
  //
  // Strategy: Walk through the string character by character,
  // and when inside a JSON string, fix bad backslash escapes.
  
  const fixedChars: string[] = [];
  let inString = false;
  let i = 0;
  
  while (i < cleaned.length) {
    const ch = cleaned[i];
    
    if (ch === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
      // Check if the previous backslash was itself escaped
      // Count consecutive backslashes before this quote
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && cleaned[j] === '\\') {
        backslashCount++;
        j--;
      }
      // Quote is escaped only if odd number of backslashes precede it
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      fixedChars.push(ch);
      i++;
      continue;
    }
    
    if (inString && ch === '\\') {
      const nextCh = i + 1 < cleaned.length ? cleaned[i + 1] : '';
      // Valid JSON escapes: " \ / b f n r t u
      if ('"\\//bfnrtu'.includes(nextCh)) {
        // Valid escape, keep as-is
        fixedChars.push(ch);
        fixedChars.push(nextCh);
        i += 2;
        continue;
      }
      // Invalid escape (LaTeX command like \frac, \alpha, \sqrt, etc.)
      // Double-escape it: \ -> \\
      fixedChars.push('\\');
      fixedChars.push('\\');
      i++;
      continue;
    }
    
    // Handle actual newlines inside strings
    if (inString && ch === '\n') {
      fixedChars.push('\\');
      fixedChars.push('n');
      i++;
      continue;
    }
    if (inString && ch === '\r') {
      fixedChars.push('\\');
      fixedChars.push('r');
      i++;
      continue;
    }
    if (inString && ch === '\t') {
      fixedChars.push('\\');
      fixedChars.push('t');
      i++;
      continue;
    }
    
    fixedChars.push(ch);
    i++;
  }
  
  cleaned = fixedChars.join('');
  
  // Fix trailing commas
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Last resort: repair unbalanced braces/brackets from truncation
  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
  }
  while (brackets > 0) { cleaned += ']'; brackets--; }
  while (braces > 0) { cleaned += '}'; braces--; }

  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  return JSON.parse(cleaned);
}

function convertRawQuestion(q: Record<string, unknown>, idx: number) {
  if (q.option_a || q.optionA) {
    const ca = String(q.correct_answer || q.correctAnswer || "A");
    const optA = String(q.option_a || q.optionA || "");
    const optB = String(q.option_b || q.optionB || "");
    const optC = String(q.option_c || q.optionC || "");
    const optD = String(q.option_d || q.optionD || "");
    const answerMap: Record<string, string> = { A: optA, B: optB, C: optC, D: optD };
    return {
      id: idx + 1,
      type: "multiple_choice",
      question: String(q.question || q.questionTitle || ""),
      options: [`A) ${optA}`, `B) ${optB}`, `C) ${optC}`, `D) ${optD}`],
      correct_answer: `${ca}) ${answerMap[ca] || optA}`,
    };
  }
  const options = (q.options as string[]) || [];
  const correctAnswer = q.correct_answer ? String(q.correct_answer) : (options[0] || "A");
  return {
    id: idx + 1,
    type: String(q.type || "multiple_choice"),
    question: String(q.question || ""),
    options,
    correct_answer: correctAnswer,
  };
}

// Tool definition - NOW allows LaTeX since our parser handles it
const examTool = {
  type: "function" as const,
  function: {
    name: "create_exam",
    description: "Create a structured exam with multiple-choice questions. You MAY use LaTeX math notation freely (e.g. \\frac{a}{b}, \\sqrt{x}, \\alpha). The system handles rendering.",
    parameters: {
      type: "object",
      properties: {
        exam_title: { type: "string", description: "Title of the exam" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question text. You may use LaTeX math like \\frac{a}{b}, \\sqrt{x}, x^2, etc." },
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
      required: ["exam_title", "questions"],
      additionalProperties: false,
    },
  },
};

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
    const varietyInstructions = getVarietyInstructions();
    const adaptiveLevelHint = adaptiveLevel
      ? `\nADAPTIVE LEVEL: "${adaptiveLevel}". ${adaptiveLevel === 'beginner' ? 'Simpler questions, clear language, foundational concepts.' : adaptiveLevel === 'advanced' ? 'Challenging questions, deeper understanding, multi-step reasoning.' : 'Moderate difficulty, mix of recall and application.'}`
      : '';

    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n---\n').substring(0, 8000)
      : null;

    const MAX_SINGLE_BATCH = 30;
    let allQuestions: Record<string, unknown>[] = [];

    const generateBatch = async (batchCount: number, batchContext?: string): Promise<Record<string, unknown>[]> => {
      const batchSeed = Math.floor(Math.random() * 100000);

      // CRITICAL: Allow LaTeX freely. Our extractJsonFromResponse handles the escaping.
      const systemPrompt = `You are an expert exam question generator. Generate EXACTLY ${batchCount} multiple-choice questions.

RULES:
- Each question MUST have exactly 4 options (A, B, C, D)
- You MAY use LaTeX math notation freely: \\frac{a}{b}, \\sqrt{x}, \\alpha, \\int, x^{2}, etc.
- Wrap inline math in $...$ delimiters for clarity
- Every question must be unique and educational
- Seed: ${batchSeed}. ${varietyInstructions}${adaptiveLevelHint}`;

      let userPrompt = '';
      if (examType === 'SAT_FULL') {
        userPrompt = `Generate EXACTLY ${batchCount} SAT-style multiple-choice questions covering Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar. Each with 4 options (A-D). Make every question unique. Seed: ${batchSeed}`;
      } else if (batchContext) {
        userPrompt = `Generate EXACTLY ${batchCount} multiple-choice questions based on this study material:\n\n${batchContext}\n\nSubject: ${subject}, Grade: ${grade || 'General'}, Difficulty: ${difficulty}. Each question must have 4 options (A-D).`;
      } else {
        userPrompt = `Generate EXACTLY ${batchCount} multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. Cover diverse sub-topics. Each question must have 4 options (A-D). Seed: ${batchSeed}`;
      }

      const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
      let response: Response | null = null;

      for (const model of models) {
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              tools: [examTool],
              tool_choice: { type: "function", function: { name: "create_exam" } },
              temperature: 0.85 + Math.random() * 0.1,
              max_tokens: Math.min(Math.max(batchCount * 400, 4000), 16000),
            }),
          });
          if (response.status !== 429) break;
          const waitMs = Math.pow(2, attempt) * 2000;
          console.log(`Rate limited on ${model}, retrying in ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
        }
        if (response && response.status !== 429) {
          console.log(`Using model: ${model} for batch of ${batchCount}`);
          break;
        }
      }

      if (!response || response.status === 429) throw new Error("RATE_LIMITED");

      let raw: Record<string, unknown>;

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Groq API error:", response.status, errorBody.substring(0, 500));

        try {
          const errJson = JSON.parse(errorBody);
          const failedGen = errJson?.error?.failed_generation;
          if (failedGen) {
            raw = extractJsonFromResponse(failedGen) as Record<string, unknown>;
          } else {
            throw new Error("No recoverable data");
          }
        } catch (e) {
          if (e instanceof SyntaxError || (e instanceof Error && e.message === "No recoverable data")) {
            throw new Error("Failed to generate exam questions");
          }
          throw e;
        }
      } else {
        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

        if (toolCall?.function?.name === "create_exam") {
          try {
            raw = extractJsonFromResponse(toolCall.function.arguments) as Record<string, unknown>;
          } catch {
            const content = data.choices?.[0]?.message?.content || "";
            raw = extractJsonFromResponse(content) as Record<string, unknown>;
          }
        } else {
          const content = data.choices?.[0]?.message?.content || "";
          raw = extractJsonFromResponse(content) as Record<string, unknown>;
        }
      }

      const rawQuestions = (raw.questions || []) as Record<string, unknown>[];
      return rawQuestions.filter(q => q && (q.question || q.questionTitle));
    };

    if (count <= MAX_SINGLE_BATCH) {
      allQuestions = await generateBatch(count, materialContext || undefined);
    } else {
      const batchSize = 15;
      const numBatches = Math.ceil(count / batchSize);
      for (let b = 0; b < numBatches; b++) {
        const remaining = count - allQuestions.length;
        const thisCount = Math.min(batchSize, remaining);
        if (thisCount <= 0) break;
        const questions = await generateBatch(thisCount, materialContext || undefined);
        allQuestions.push(...questions);
        if (allQuestions.length >= count) break;
      }
    }

    if (allQuestions.length < count) {
      const remaining = count - allQuestions.length;
      console.log(`Got ${allQuestions.length}/${count}, filling ${remaining} more`);
      try {
        const extra = await generateBatch(remaining);
        allQuestions.push(...extra);
      } catch (e) {
        console.warn("Fill batch failed:", e);
      }
    }

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
