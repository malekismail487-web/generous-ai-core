import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, subject, questionCount, gradeLevel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!title || !subject || !questionCount) {
      throw new Error("title, subject, and questionCount are required");
    }

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
${description ? `- Additional context from the teacher: "${description}"` : ''}`;

    const userPrompt = `The teacher created an assignment titled "${title}" for the subject "${subject}" at the ${gradeLevel || 'general'} level. Generate exactly ${questionCount} multiple-choice questions that are specifically about "${title}".${description ? ` The teacher also provided this description: "${description}"` : ''}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_assignment_questions",
              description: "Create a set of multiple-choice assignment questions",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "A suitable title for the assignment"
                  },
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
                        correctAnswer: {
                          type: "string",
                          enum: ["A", "B", "C", "D"],
                          description: "The correct answer letter"
                        },
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
        ],
        tool_choice: { type: "function", function: { name: "create_assignment_questions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate questions");
    }

    const data = await response.json();
    
    // Extract the tool call result
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
