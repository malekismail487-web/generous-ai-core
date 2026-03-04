import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserKeys {
  primaryKey: string | null;
  fallbackKey: string | null;
}

async function getUserApiKeys(authHeader: string | null): Promise<UserKeys> {
  if (!authHeader) return { primaryKey: null, fallbackKey: null };
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return { primaryKey: null, fallbackKey: null };
    const { data } = await supabase
      .from("user_api_keys")
      .select("groq_api_key, groq_fallback_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    return {
      primaryKey: data?.groq_api_key || null,
      fallbackKey: data?.groq_fallback_api_key || null,
    };
  } catch {
    return { primaryKey: null, fallbackKey: null };
  }
}

function getVarietyInstructions(): string {
  const styles = [
    "Focus on application and real-world scenarios with specific numerical examples.",
    "Emphasize conceptual understanding through analogies and comparisons.",
    "Include tricky distractor options that test common misconceptions.",
    "Mix easy recall with challenging multi-step analysis problems.",
    "Focus on problem-solving and computation with unique numerical values.",
    "Compare and contrast two or more related concepts in each question.",
    "Ask about common misconceptions and why they are wrong.",
    "Focus on definitions, terminology, and precise language distinctions.",
    "Include multi-step reasoning questions requiring 2-3 logical steps.",
    "Ask about cause-and-effect relationships and chain reactions.",
    "Frame questions as real-world case studies or experiments.",
    "Use reverse reasoning: give the answer and ask what question it solves.",
    "Test ability to identify errors in given solutions or statements.",
    "Ask about edge cases, exceptions, and boundary conditions.",
    "Frame questions around diagrams, charts, or data interpretation.",
    "Test sequencing: ask about correct order of steps or processes.",
    "Use 'which of the following is NOT' style negative questions.",
    "Ask students to identify the BEST answer among plausible options.",
    "Frame questions as student debates where each option represents an argument.",
    "Test transfer: apply a concept from one context to a completely different one.",
  ];
  const shuffled = styles.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5).join(" ");
}

function getAntiRepetitionDirective(): string {
  const angles = [
    "historical context", "modern applications", "mathematical proof", "experimental design",
    "ethical implications", "cross-disciplinary connections", "future predictions", "error analysis",
    "optimization problems", "classification tasks", "comparative analysis", "process explanation",
    "data interpretation", "hypothesis testing", "model evaluation", "resource allocation",
    "risk assessment", "pattern recognition", "system design", "troubleshooting scenarios",
  ];
  const shuffled = angles.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 4);
  return `MANDATORY QUESTION ANGLES for this generation (use at least 3): ${selected.join(", ")}. Each question MUST approach the topic from a DIFFERENT angle than typical textbook questions.`;
}

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in response");

  const opener = cleaned[jsonStart];
  const closer = opener === '[' ? ']' : '}';
  const jsonEnd = cleaned.lastIndexOf(closer);

  if (jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error("No valid JSON boundaries found");

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  const fixedChars: string[] = [];
  let inString = false;
  let i = 0;
  
  while (i < cleaned.length) {
    const ch = cleaned[i];
    
    if (ch === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && cleaned[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      fixedChars.push(ch);
      i++;
      continue;
    }
    
    if (inString && ch === '\\') {
      const nextCh = i + 1 < cleaned.length ? cleaned[i + 1] : '';
      if ('"\\/bfnrtu'.includes(nextCh)) {
        fixedChars.push(ch);
        fixedChars.push(nextCh);
        i += 2;
        continue;
      }
      fixedChars.push('\\');
      fixedChars.push('\\');
      i++;
      continue;
    }
    
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
  
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

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

// ========== SELF-VALIDATION STEP ==========
// After generating questions, the AI reviews its own work to fix wrong answers
async function validateAndFixQuestions(
  questions: Record<string, unknown>[],
  subject: string,
  apiKey: string,
  fallbackKey: string | null
): Promise<Record<string, unknown>[]> {
  if (questions.length === 0) return questions;

  // Build a compact representation for review
  const questionsForReview = questions.slice(0, 20).map((q, i) => {
    const ca = String(q.correct_answer || q.correctAnswer || "A");
    const optA = String(q.option_a || q.optionA || "");
    const optB = String(q.option_b || q.optionB || "");
    const optC = String(q.option_c || q.optionC || "");
    const optD = String(q.option_d || q.optionD || "");
    return `Q${i + 1}: ${String(q.question || "")}\nA) ${optA}\nB) ${optB}\nC) ${optC}\nD) ${optD}\nMarked correct: ${ca}`;
  }).join("\n\n");

  const reviewPrompt = `You are a strict academic reviewer. Review these ${subject} exam questions. For EACH question:
1. Verify the marked correct answer is actually correct. Solve the problem yourself.
2. Verify all 4 options are plausible (not obviously wrong or duplicate).
3. If a question has the WRONG correct answer, or if ALL options are wrong, fix it.

Return ONLY a JSON array of corrections. If a question is correct, skip it. Only include questions that need fixing:
[{"index": 0, "correct_answer": "B", "fixed_option_a": "...", "fixed_option_b": "...", "fixed_option_c": "...", "fixed_option_d": "...", "reason": "why it was wrong"}]

If ALL questions are correct, return: []

Questions to review:
${questionsForReview}`;

  const modelConfigs = [
    { model: "llama-3.3-70b-versatile", apiKey },
    { model: "llama-3.1-8b-instant", apiKey: fallbackKey || apiKey },
  ];

  for (const { model, apiKey: key } of modelConfigs) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are an expert academic exam reviewer. Return ONLY valid JSON." },
            { role: "user", content: reviewPrompt },
          ],
          temperature: 0.1,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) continue;
        console.warn("Validation API error:", response.status);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "[]";

      try {
        const corrections = extractJsonFromResponse(content) as any[];
        if (!Array.isArray(corrections) || corrections.length === 0) {
          console.log("AI validation: all questions verified correct");
          return questions;
        }

        console.log(`AI validation: fixing ${corrections.length} questions`);
        for (const fix of corrections) {
          const idx = fix.index;
          if (idx >= 0 && idx < questions.length) {
            const q = questions[idx];
            if (fix.correct_answer) {
              q.correct_answer = fix.correct_answer;
              q.correctAnswer = fix.correct_answer;
            }
            if (fix.fixed_option_a) { q.option_a = fix.fixed_option_a; q.optionA = fix.fixed_option_a; }
            if (fix.fixed_option_b) { q.option_b = fix.fixed_option_b; q.optionB = fix.fixed_option_b; }
            if (fix.fixed_option_c) { q.option_c = fix.fixed_option_c; q.optionC = fix.fixed_option_c; }
            if (fix.fixed_option_d) { q.option_d = fix.fixed_option_d; q.optionD = fix.fixed_option_d; }
            console.log(`Fixed Q${idx + 1}: ${fix.reason}`);
          }
        }
        return questions;
      } catch (e) {
        console.warn("Could not parse validation response, skipping:", e);
        return questions;
      }
    } catch (e) {
      console.warn("Validation call failed:", e);
      continue;
    }
  }

  console.warn("All validation attempts failed, returning unvalidated questions");
  return questions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, grade, difficulty, count, materials, examType, adaptiveLevel } = await req.json();

    const userKeys = await getUserApiKeys(req.headers.get("authorization"));
    const systemGroqKey = Deno.env.get("GROQ_API_KEY");
    const primaryApiKey = userKeys.primaryKey || systemGroqKey;
    const fallbackApiKey = userKeys.fallbackKey || systemGroqKey;

    if (!primaryApiKey) {
      throw new Error("No AI API key configured. Please add your Groq API key in the settings.");
    }
    if (!count || count <= 0) {
      throw new Error("count is required and must be positive");
    }

    const seed = Math.floor(Math.random() * 1000000);
    const timestamp = Date.now();
    const varietyInstructions = getVarietyInstructions();
    const adaptiveLevelHint = adaptiveLevel
      ? `\nADAPTIVE LEVEL: "${adaptiveLevel}". ${adaptiveLevel === 'beginner' ? 'Simpler questions, clear language, foundational concepts.' : adaptiveLevel === 'advanced' ? 'Challenging questions, deeper understanding, multi-step reasoning.' : 'Moderate difficulty, mix of recall and application.'}`
      : '';

    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n---\n').substring(0, 8000)
      : null;

    // Detect if subject is math-related for 50/50 word problem vs equation balance
    const isMathSubject = /math|algebra|calculus|geometry|trigonometry|statistics|arithmetic|رياضيات/i.test(subject || '');

    const MAX_SINGLE_BATCH = 30;
    let allQuestions: Record<string, unknown>[] = [];

    const generateBatch = async (batchCount: number, batchContext?: string): Promise<Record<string, unknown>[]> => {
      const batchSeed = Math.floor(Math.random() * 1000000);
      const uniqueId = `${timestamp}-${batchSeed}-${Math.random().toString(36).slice(2, 8)}`;

      const antiRepetition = getAntiRepetitionDirective();
      const nonce = crypto.randomUUID();

      // Math balance instruction
      const mathBalanceRule = isMathSubject
        ? `\n\nMATH QUESTION BALANCE (CRITICAL): Exactly HALF of your questions must be direct equations/computations (e.g., "Solve: 3x + 7 = 22", "Evaluate: \\int_0^1 x^2 dx", "Find the derivative of f(x) = x^3 + 2x"). The other HALF must be word problems that apply math concepts to real-world scenarios. Do NOT make all questions word problems.`
        : '';

      const systemPrompt = `You are an expert exam question generator. Generate EXACTLY ${batchCount} multiple-choice questions.

ABSOLUTE UNIQUENESS REQUIREMENTS:
- You MUST generate COMPLETELY NOVEL questions that have NEVER appeared in any textbook, past exam, or study guide.
- NEVER reuse standard example questions. Invent entirely new scenarios, numbers, names, and contexts.
- Each question must use DIFFERENT numerical values, variable names, and real-world contexts.
- ${antiRepetition}
- Vary question structures: definitional, computational, analytical, scenario-based, error-identification, best-answer, negative (which is NOT), and multi-step.
- For math/science: use random non-round numbers (e.g., 37 instead of 10, 4.7 instead of 5).
- For reading/language: create original passages and sentences, do NOT quote existing texts.
- Each question MUST have exactly 4 options (A, B, C, D) with plausible distractors.
- You MAY use LaTeX math notation freely: \\frac{a}{b}, \\sqrt{x}, \\alpha, \\int, x^{2}, etc.
- Wrap inline math in $...$ delimiters for clarity.
- ${varietyInstructions}${adaptiveLevelHint}${mathBalanceRule}

ANSWER ACCURACY (CRITICAL):
- You MUST solve every question yourself BEFORE writing the answer key.
- Double-check every computation, especially for math questions.
- ALL FOUR options must be plausible and distinct. Never have all options be wrong.
- The correct_answer field MUST match the actually correct option.
- If you are unsure of an answer, work it out step by step internally before committing.

- Generation nonce (ensures uniqueness): ${nonce}
- Random seed: ${batchSeed}`;

      let userPrompt = '';
      if (examType === 'SAT_FULL') {
        userPrompt = `Generate EXACTLY ${batchCount} completely original SAT-style multiple-choice questions. Cover: Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar. Each with 4 options (A-D). CRITICAL: Every single question must be freshly invented with unique numbers, names, and scenarios. Do NOT reproduce any known SAT practice question. Use unusual but realistic values. Nonce: ${nonce}`;
      } else if (batchContext) {
        userPrompt = `Generate EXACTLY ${batchCount} BRAND NEW multiple-choice questions based on this study material:\n\n${batchContext}\n\nSubject: ${subject}, Grade: ${grade || 'General'}, Difficulty: ${difficulty}. Each question must have 4 options (A-D).\n\nCRITICAL ANTI-REPETITION RULES:\n- Even though the material is the same as previous requests, you MUST create ENTIRELY DIFFERENT questions.\n- Use different angles, different numerical values, different scenarios, different phrasings.\n- Approach the material from perspectives not typically covered in textbooks.\n- Invent novel real-world scenarios that apply the concepts.\n- Use random specific numbers (not round numbers like 10, 100, 50).\n- ${antiRepetition}\nNonce: ${nonce}`;
      } else {
        userPrompt = `Generate EXACTLY ${batchCount} COMPLETELY ORIGINAL multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. Cover diverse sub-topics. Each question must have 4 options (A-D).\n\nCRITICAL: Do NOT use any standard textbook questions. Create novel questions with unique specific values (avoid round numbers), original scenarios, and fresh phrasings. ${antiRepetition}\nNonce: ${nonce}`;
      }

      const modelConfigs = [
        { model: "llama-3.3-70b-versatile", apiKey: primaryApiKey },
        { model: "llama-3.1-8b-instant", apiKey: fallbackApiKey || primaryApiKey },
      ];
      let response: Response | null = null;

      for (const { model, apiKey } of modelConfigs) {
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
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
              temperature: 0.9 + Math.random() * 0.1,
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

    // ========== AI SELF-VALIDATION STEP ==========
    // Review all generated questions for correctness before presenting
    console.log("Starting AI self-validation of exam questions...");
    allQuestions = await validateAndFixQuestions(
      allQuestions,
      subject || 'General',
      primaryApiKey!,
      fallbackApiKey
    );

    // Shuffle all questions for random order
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    // Also shuffle options within each question for extra randomness
    const questions = allQuestions.map((q, idx) => {
      const converted = convertRawQuestion(q, idx);
      // Randomly shuffle options and update correct_answer
      if (converted.options && converted.options.length === 4) {
        const optionData = converted.options.map((opt: string) => {
          const letter = opt.charAt(0);
          const text = opt.substring(3); // Remove "A) " prefix
          const isCorrect = converted.correct_answer.startsWith(letter);
          return { text, isCorrect };
        });
        // Fisher-Yates shuffle
        for (let i = optionData.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [optionData[i], optionData[j]] = [optionData[j], optionData[i]];
        }
        const letters = ['A', 'B', 'C', 'D'];
        converted.options = optionData.map((o: { text: string; isCorrect: boolean }, i: number) => `${letters[i]}) ${o.text}`);
        const correctIdx = optionData.findIndex((o: { text: string; isCorrect: boolean }) => o.isCorrect);
        converted.correct_answer = `${letters[correctIdx]}) ${optionData[correctIdx].text}`;
      }
      return converted;
    });
    console.log(`Generated ${questions.length}/${count} questions total (validated)`);

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
