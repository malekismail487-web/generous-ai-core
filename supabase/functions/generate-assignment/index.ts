import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const single = Deno.env.get("GEMINI_API_KEY");
  if (single) keys.push(single.trim());
  const pool = Deno.env.get("GEMINI_API_KEY_POOL");
  if (pool) {
    for (const k of pool.split(",")) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }
  return keys;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, subject, questionCount, gradeLevel, adaptiveLevel } = await req.json();
    
    const geminiKeys = getGeminiKeys();
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API keys configured");
    }

    if (!title || !subject || !questionCount) {
      throw new Error("title, subject, and questionCount are required");
    }

    const randomSeed = Math.floor(Math.random() * 99999);
    const variationHint = `Seed: ${randomSeed}. Make this UNIQUE — vary which subtopics, question styles, and angles you cover. Do not repeat patterns from previous generations.`;

    const systemPrompt = `You are an expert educational content creator. Generate multiple-choice quiz questions based on the assignment title and subject provided by the teacher.

Rules:
- The questions MUST be directly related to the assignment title: "${title}"
- Questions must be for the subject: ${subject}
- Questions must be grade-appropriate for ${gradeLevel || 'general'} level
- Each question must have exactly 4 options (A, B, C, D)
- Exactly one option must be correct
- Questions should test understanding, not just memorization
- Vary difficulty within the set
- Questions should be clear, unambiguous, and educational
- ${variationHint}
${adaptiveLevel ? `- ADAPTIVE LEVEL: Student is "${adaptiveLevel}". ${adaptiveLevel === 'beginner' ? 'Generate simpler questions with clear language and foundational concepts.' : adaptiveLevel === 'advanced' ? 'Generate challenging questions testing deeper understanding and multi-step reasoning.' : 'Generate moderate difficulty questions mixing recall and application.'}` : ''}
${description ? `- Additional context from the teacher: "${description}"` : ''}`;

    const userPrompt = `The teacher created an assignment titled "${title}" for the subject "${subject}" at the ${gradeLevel || 'general'} level. Generate exactly ${questionCount} multiple-choice questions that are specifically about "${title}". ${variationHint}${description ? ` The teacher also provided this description: "${description}"` : ''}`;

    const toolDef = [
      {
        type: "function",
        function: {
          name: "create_assignment_questions",
          description: "Create a set of multiple-choice assignment questions",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "A suitable title for the assignment" },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    questionTitle: { type: "string", description: "The question text" },
                    optionA: { type: "string", description: "Option A text" },
                    optionB: { type: "string", description: "Option B text" },
                    optionC: { type: "string", description: "Option C text" },
                    optionD: { type: "string", description: "Option D text" },
                    correctAnswer: { type: "string", enum: ["A", "B", "C", "D"], description: "The correct answer letter" },
                  },
                  required: ["questionTitle", "optionA", "optionB", "optionC", "optionD", "correctAnswer"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "questions"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let response: Response | null = null;

    // Key pool rotation with retries
    const startIdx = Math.floor(Math.random() * geminiKeys.length);
    const maxAttempts = Math.max(geminiKeys.length, 3);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const keyIdx = (startIdx + attempt) % geminiKeys.length;
      console.log(`Trying key ${keyIdx + 1}/${geminiKeys.length} (attempt ${attempt + 1})`);

      response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiKeys[keyIdx]}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: aiMessages,
          tools: toolDef,
          tool_choice: { type: "function", function: { name: "create_assignment_questions" } },
          temperature: 0.85,
        }),
      });

      if (response.status === 429) {
        console.log(`Key ${keyIdx + 1} rate limited, rotating...`);
        await response.text();
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response?.text() || "No response";
      console.error("Gemini API failed:", response?.status, errorText);
      throw new Error("Failed to generate questions");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "create_assignment_questions") {
      throw new Error("AI did not return structured questions");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate assignment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
