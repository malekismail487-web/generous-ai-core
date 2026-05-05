import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function gatewayFetch(body: object, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    return await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
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

function findBalancedJsonEnd(text: string, start: number): number {
  const opener = text[start];
  const stack: string[] = [opener === '[' ? ']' : '}'];
  let inString = false;
  let escaping = false;

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (escaping) { escaping = false; continue; }
    if (ch === '\\') { escaping = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }

  return -1;
}

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const jsonStart = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  if (jsonStart === -1) throw new Error("No JSON found in response");

  let jsonEnd = findBalancedJsonEnd(cleaned, jsonStart);
  if (jsonEnd === -1) {
    const closer = cleaned[jsonStart] === '[' ? ']' : '}';
    jsonEnd = cleaned.lastIndexOf(closer);
  }

  if (jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error("No valid JSON boundaries found");

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  cleaned = Array.from(cleaned).map((ch) => {
    const code = ch.charCodeAt(0);
    return (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) ? " " : ch;
  }).join("");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  const fixedChars: string[] = [];
  let inString = false;
  let i = 0;
  
  while (i < cleaned.length) {
    const ch = cleaned[i];
    
    if (ch === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && cleaned[j] === '\\') { backslashCount++; j--; }
      if (backslashCount % 2 === 0) inString = !inString;
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
    
    if (inString && ch === '\n') { fixedChars.push('\\', 'n'); i++; continue; }
    if (inString && ch === '\r') { fixedChars.push('\\', 'r'); i++; continue; }
    if (inString && ch === '\t') { fixedChars.push('\\', 't'); i++; continue; }
    
    fixedChars.push(ch);
    i++;
  }
  
  cleaned = fixedChars.join('');
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

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

  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

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
      explanation: q.explanation ? String(q.explanation) : undefined,
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
    explanation: q.explanation ? String(q.explanation) : undefined,
  };
}

function sanitizeExamText(value: unknown): string {
  return String(value ?? "")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\begin\{(?:aligned|align|equation|gather)\}/g, "")
    .replace(/\\end\{(?:aligned|align|equation|gather)\}/g, "")
    .replace(/\\displaystyle\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeQuestion(q: Record<string, unknown>, idx: number) {
  const optionValues = Array.isArray(q.options) && q.options.length >= 4
    ? (q.options as unknown[]).slice(0, 4).map(sanitizeExamText)
    : [q.option_a ?? q.optionA, q.option_b ?? q.optionB, q.option_c ?? q.optionC, q.option_d ?? q.optionD].map(sanitizeExamText);
  const correctLetter = String(q.correct_answer || q.correctAnswer || "A").trim().charAt(0).toUpperCase();
  const answerIndex = Math.max(0, ["A", "B", "C", "D"].indexOf(correctLetter));

  return {
    question: sanitizeExamText(q.question || q.questionTitle),
    option_a: optionValues[0] || `Option ${idx + 1}A`,
    option_b: optionValues[1] || `Option ${idx + 1}B`,
    option_c: optionValues[2] || `Option ${idx + 1}C`,
    option_d: optionValues[3] || `Option ${idx + 1}D`,
    correct_answer: ["A", "B", "C", "D"][answerIndex],
    explanation: sanitizeExamText(q.explanation || "Review the correct option and compare it with the distractors."),
  };
}

const examTool = {
  type: "function" as const,
  function: {
    name: "create_exam",
    description: "Create a structured exam with multiple-choice questions. Keep math as raw LaTeX text; never return rendered HTML, SVG, MathML, KaTeX output, or images.",
    parameters: {
      type: "object",
      properties: {
        exam_title: { type: "string", description: "Title of the exam" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question text. Use raw LaTeX only when needed, with $...$ or $$...$$ delimiters." },
              option_a: { type: "string", description: "Option A" },
              option_b: { type: "string", description: "Option B" },
              option_c: { type: "string", description: "Option C" },
              option_d: { type: "string", description: "Option D" },
              correct_answer: { type: "string", enum: ["A", "B", "C", "D"], description: "Correct answer letter" },
              explanation: { type: "string", description: "Brief explanation of WHY the correct answer is right." },
            },
            required: ["question", "option_a", "option_b", "option_c", "option_d", "correct_answer", "explanation"],
            additionalProperties: false,
          },
        },
      },
      required: ["exam_title", "questions"],
      additionalProperties: false,
    },
  },
};

// ========== SELF-VALIDATION ==========
async function validateAndFixQuestions(
  questions: Record<string, unknown>[],
  subject: string,
  apiKey: string,
  targetCount: number
): Promise<Record<string, unknown>[]> {
  if (questions.length === 0) return questions;

  if (questions.length > targetCount) {
    questions = questions.slice(0, targetCount);
  }

  const CHUNK_SIZE = 15;
  const validatedQuestions: Record<string, unknown>[] = [];
  
  for (let chunkStart = 0; chunkStart < questions.length; chunkStart += CHUNK_SIZE) {
    const chunk = questions.slice(chunkStart, chunkStart + CHUNK_SIZE);
    if (chunkStart > 0) {
      await new Promise(r => setTimeout(r, 2000));
    }
    try {
      const validated = await validateChunk(chunk, subject, apiKey);
      validatedQuestions.push(...validated);
    } catch (e) {
      console.warn(`Validation chunk failed, keeping unvalidated:`, e);
      validatedQuestions.push(...chunk);
    }
  }

  if (validatedQuestions.length < targetCount) {
    const deficit = targetCount - validatedQuestions.length;
    console.log(`Validation removed ${deficit} questions. Skipping replacement to avoid extra calls.`);
  }

  return validatedQuestions.slice(0, targetCount);
}

async function validateChunk(
  questions: Record<string, unknown>[],
  subject: string,
  apiKey: string
): Promise<Record<string, unknown>[]> {
  const questionsForReview = questions.map((q, i) => {
    const ca = String(q.correct_answer || q.correctAnswer || "A");
    const optA = String(q.option_a || q.optionA || "");
    const optB = String(q.option_b || q.optionB || "");
    const optC = String(q.option_c || q.optionC || "");
    const optD = String(q.option_d || q.optionD || "");
    return `Q${i + 1}: ${String(q.question || "")}\nA) ${optA}\nB) ${optB}\nC) ${optC}\nD) ${optD}\nMarked correct: ${ca}`;
  }).join("\n\n");

  const reviewPrompt = `You are a strict academic exam validator for ${subject}. Your job is to verify EVERY question is factually and mathematically correct.

FOR EACH QUESTION you MUST:
1. Read the question carefully.
2. Solve it yourself independently step-by-step.
3. Check if the marked answer matches YOUR answer.
4. Check that ALL 4 options are distinct, plausible, and well-formed.
5. Check that EXACTLY ONE option is correct.

Return a JSON array. For EACH question include an entry:
[
  {"index": 0, "status": "PASS", "my_answer": "A", "verification": "Brief work"},
  {"index": 1, "status": "FAIL", "my_answer": "C", "correct_answer": "C", "fixed_option_a": "...", "fixed_option_b": "...", "fixed_option_c": "...", "fixed_option_d": "...", "reason": "explanation"},
  {"index": 2, "status": "DELETE", "reason": "fundamentally flawed"}
]

Questions to validate:
${questionsForReview}`;

  const response = await gatewayFetch({
    model: "google/gemini-2.5-flash-lite",
    messages: [
      { role: "system", content: "You are an expert academic exam validator. Return ONLY valid JSON array." },
      { role: "user", content: reviewPrompt },
    ],
    temperature: 0.1,
    max_tokens: 4000,
  }, apiKey);

  if (!response.ok) {
    console.warn(`Validation API error:`, response.status);
    await response.text();
    return questions;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "[]";

  try {
    const results = extractJsonFromResponse(content) as any[];
    if (!Array.isArray(results)) return questions;

    const validQuestions: Record<string, unknown>[] = [];
    let fixed = 0, deleted = 0, passed = 0;

    for (let i = 0; i < questions.length; i++) {
      const result = results.find((r: any) => r.index === i);
      
      if (!result || result.status === "PASS") { validQuestions.push(questions[i]); passed++; continue; }
      
      if (result.status === "DELETE") { console.log(`Deleted Q${i + 1}: ${result.reason}`); deleted++; continue; }
      
      if (result.status === "FAIL") {
        const q = { ...questions[i] };
        if (result.correct_answer) { q.correct_answer = result.correct_answer; q.correctAnswer = result.correct_answer; }
        if (result.fixed_option_a) { q.option_a = result.fixed_option_a; q.optionA = result.fixed_option_a; }
        if (result.fixed_option_b) { q.option_b = result.fixed_option_b; q.optionB = result.fixed_option_b; }
        if (result.fixed_option_c) { q.option_c = result.fixed_option_c; q.optionC = result.fixed_option_c; }
        if (result.fixed_option_d) { q.option_d = result.fixed_option_d; q.optionD = result.fixed_option_d; }
        validQuestions.push(q);
        fixed++;
      }
    }

    console.log(`Validation: ${passed} passed, ${fixed} fixed, ${deleted} deleted out of ${questions.length}`);
    return validQuestions;
  } catch (e) {
    console.warn(`Could not parse validation response:`, e);
    return questions;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, grade, difficulty, count, materials, examType, adaptiveLevel, weakTopics } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    // Phase 2B: Cross-Surface Mastery — bias toward student's weakest topics.
    const masteryHint = Array.isArray(weakTopics) && weakTopics.length > 0
      ? `\nMASTERY FOCUS: Bias roughly half of the questions toward these specific topics where the student is weakest: ${weakTopics.slice(0, 6).map((t: string) => `"${t}"`).join(', ')}. Do NOT label them as "weak" in the question text.`
      : '';

    const materialContext = materials && materials.length > 0
      ? materials.map((m: { topic: string; content: string }) => `Topic: ${m.topic}\n${m.content}`).join('\n---\n').substring(0, 8000)
      : null;

    const isMathSubject = /math|algebra|calculus|geometry|trigonometry|statistics|arithmetic|رياضيات/i.test(subject || '');
    const requestedCount = Math.min(Number(count), examType === 'SAT_FULL' ? 70 : 30);

    const MAX_SINGLE_BATCH = 30;
    let allQuestions: Record<string, unknown>[] = [];

    const generateBatch = async (batchCount: number, batchContext?: string): Promise<Record<string, unknown>[]> => {
      const batchSeed = Math.floor(Math.random() * 1000000);
      const antiRepetition = getAntiRepetitionDirective();
      const nonce = crypto.randomUUID();

      const mathBalanceRule = isMathSubject
        ? `\n\nMATH QUESTION BALANCE (CRITICAL): Exactly HALF must be direct equations/computations. The other HALF must be word problems.`
        : '';

      const systemPrompt = `You are an expert exam question generator. Generate EXACTLY ${batchCount} multiple-choice questions. NOT ${batchCount - 1}, NOT ${batchCount + 1}. EXACTLY ${batchCount}.

ABSOLUTE UNIQUENESS REQUIREMENTS:
- Generate COMPLETELY NOVEL questions.
- NEVER reuse standard example questions.
- Each question must use DIFFERENT numerical values, variable names, and contexts.
- ${antiRepetition}
- Vary question structures: definitional, computational, analytical, scenario-based, error-identification, best-answer, negative, and multi-step.
- For math/science: use random non-round numbers.
- Each question MUST have exactly 4 options (A, B, C, D) with plausible distractors.
- Keep math as raw LaTeX text only. Do NOT render LaTeX to HTML, SVG, KaTeX, MathML, images, or pre-rendered markup.
- Use simple inline delimiters only: $...$ for inline math and $$...$$ for short display equations. Avoid complex align environments.
- ${varietyInstructions}${adaptiveLevelHint}${masteryHint}${mathBalanceRule}

ANSWER ACCURACY - MANDATORY SELF-VERIFICATION:
- For EVERY question, solve it yourself step-by-step BEFORE writing the answer.
- Double-check every computation.
- The correct_answer MUST be the letter of the actually correct option.

EXPLANATION REQUIREMENT:
- For EVERY question, include a brief "explanation" field (1-2 sentences).

QUESTION COUNT ENFORCEMENT:
- You MUST return EXACTLY ${batchCount} questions.

- Generation nonce: ${nonce}
- Random seed: ${batchSeed}`;

      let userPrompt = '';
      if (examType === 'SAT_FULL') {
        userPrompt = `Generate EXACTLY ${batchCount} completely original SAT-style multiple-choice questions. Cover: Algebra, Geometry, Probability, Statistics, Reading Comprehension, Grammar. Nonce: ${nonce}`;
      } else if (batchContext) {
        userPrompt = `Generate EXACTLY ${batchCount} BRAND NEW multiple-choice questions based on this study material:\n\n${batchContext}\n\nSubject: ${subject}, Grade: ${grade || 'General'}, Difficulty: ${difficulty}.\n${antiRepetition}\nNonce: ${nonce}`;
      } else {
        userPrompt = `Generate EXACTLY ${batchCount} COMPLETELY ORIGINAL multiple-choice questions for ${subject}${grade ? ` at ${grade} level` : ''} with ${difficulty} difficulty. ${antiRepetition}\nNonce: ${nonce}`;
      }

      const response = await gatewayFetch({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [examTool],
        tool_choice: { type: "function", function: { name: "create_exam" } },
        temperature: 0.9 + Math.random() * 0.1,
        max_tokens: Math.min(Math.max(batchCount * 400, 4000), 16000),
      }, LOVABLE_API_KEY);

      if (!response.ok) {
        if (response.status === 429) throw new Error("RATE_LIMITED");
        if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
        const errText = await response.text();
        console.error(`AI Gateway failed with ${response.status}: ${errText.substring(0, 300)}`);
        throw new Error("Failed to generate exam questions");
      }

      let raw: Record<string, unknown>;
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

      const rawQuestions = (raw.questions || []) as Record<string, unknown>[];
      return rawQuestions.filter(q => q && (q.question || q.questionTitle));
    };

    const safeBatch = async (n: number, ctx?: string) => {
      try { return await generateBatch(n, ctx); }
      catch (e) { console.warn("Batch failed, continuing:", e instanceof Error ? e.message : e); return []; }
    };

    if (requestedCount <= MAX_SINGLE_BATCH) {
      allQuestions = await safeBatch(requestedCount, materialContext || undefined);
    } else {
      const batchSize = 15;
      const numBatches = Math.ceil(requestedCount / batchSize);
      for (let b = 0; b < numBatches; b++) {
        const remaining = requestedCount - allQuestions.length;
        const thisCount = Math.min(batchSize, remaining);
        if (thisCount <= 0) break;
        const questions = await safeBatch(thisCount, materialContext || undefined);
        allQuestions.push(...questions);
        if (allQuestions.length >= requestedCount) break;
      }
    }

    // If everything failed, retry once with a smaller batch
    if (allQuestions.length === 0) {
      console.warn("All batches empty — retrying with reduced count");
      allQuestions = await safeBatch(Math.min(10, requestedCount), materialContext || undefined);
    }

    if (allQuestions.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI returned no parseable questions. Please try again." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fill if we got fewer than requested
    if (allQuestions.length < requestedCount) {
      const remaining = requestedCount - allQuestions.length;
      console.log(`Got ${allQuestions.length}/${requestedCount}, filling ${remaining} more`);
      try {
        const extra = await generateBatch(remaining);
        allQuestions.push(...extra);
      } catch (e) {
        console.warn("Fill batch failed:", e);
      }
    }

    allQuestions = allQuestions.slice(0, requestedCount).map(normalizeQuestion);

    // Shuffle all questions for random order
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    // Convert and shuffle options within each question
    const questions = allQuestions.map((q, idx) => {
      const converted = convertRawQuestion(q, idx);
      if (converted.options && converted.options.length === 4) {
        const optionData = converted.options.map((opt: string) => {
          const letter = opt.charAt(0);
          const text = opt.substring(3);
          const isCorrect = converted.correct_answer.startsWith(letter);
          return { text, isCorrect };
        });
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
    console.log(`Final output: ${questions.length} validated questions`);

    const result = {
      exam_title: `${subject || 'SAT'} ${difficulty || ''} Exam`.trim(),
      grade_level: grade || "General",
      subject: subject || "Mixed",
      total_questions: questions.length,
      requested_questions: count,
      generated_questions: questions.length,
      note: count > requestedCount ? `Generated ${questions.length} reliable questions now. Start another exam for more practice.` : undefined,
      questions,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate exam error:", error);
    if (error instanceof Error && error.message === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "Payment required, please add credits to your workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
