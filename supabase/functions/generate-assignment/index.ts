import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, subject, questionCount, gradeLevel, adaptiveLevel } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    // Use Lovable AI Gateway with retries
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: toolDef,
          tool_choice: { type: "function", function: { name: "create_assignment_questions" } },
          temperature: 0.85,
        }),
      });
      if (response.status !== 429) break;
      const waitMs = Math.pow(2, attempt) * 3000 + Math.random() * 2000;
      await response.text();
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response?.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response?.text() || "No response";
      console.error("Lovable AI failed:", response?.status, errorText);
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
