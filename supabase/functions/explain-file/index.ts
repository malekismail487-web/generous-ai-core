import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZENMUX_API_URL = "https://ling-1t.ai/api/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, adaptiveLevel, learningStyle, customPrompt } = await req.json();
    
    const ZENMUX_API_KEY = Deno.env.get("ZENMUX_API_KEY");
    if (!ZENMUX_API_KEY) {
      throw new Error("ZENMUX_API_KEY is not configured");
    }

    if (!fileContent) {
      return new Response(JSON.stringify({ error: "No file content provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const randomSeed = Math.floor(Math.random() * 99999);

    const defaultTask = `Deliver a complete, structured educational lecture explaining everything in the file, exactly like you would in the Subjects section. This is NOT a summary — it's a full lesson.

## Lecture Structure
1. **Introduction** — What is this topic about? Set context.
2. **Core Concepts** — Explain every key idea, definition, and concept from the file thoroughly.
3. **Detailed Explanation** — Break down complex parts step by step with examples.
4. **Key Formulas / Rules / Facts** — Highlight important formulas, dates, rules, or facts.
5. **Common Mistakes & Misconceptions** — Warn about typical errors students make.
6. **Examples** — Provide clear, grade-appropriate examples.
7. **Summary** — Recap the most important takeaways.`;

    const taskInstructions = customPrompt || defaultTask;

    const systemPrompt = `You are Lumina, an expert educational AI tutor. The user has uploaded a study file. Your job is to:

1. READ and ANALYZE the entire file content carefully
2. DETECT the language of the file (English or Arabic)
3. RESPOND IN THE SAME LANGUAGE as the file content — if the file is in English, explain in English. If in Arabic, explain in Arabic. If mixed, use the dominant language.

## Your Task
${taskInstructions}

## Rules
- Be thorough — cover ALL content in the file, not just highlights
- Use clear, student-friendly language
- Use markdown formatting for structure with emoji section headers (📌, 🧠, 📊, ✅, ⚠️, 📝, 💡, ⚡)
- Bold all key terms on first use
- Use tables for comparisons between concepts
- For math/science, show step-by-step reasoning with LaTeX notation
- Create ASCII diagrams or visual representations where helpful
- Include "💡 Pro Tip" boxes for study advice
- Do NOT skip any section of the file
- Do NOT say "I can't read the file" — the content is provided to you directly
- Session ID: ${randomSeed} — Generate a fresh, unique explanation each time
${adaptiveLevel === 'beginner' ? '\n## Adaptive Level: BEGINNER\nUse very simple vocabulary, short sentences, basic analogies, and explain every concept from scratch. Avoid jargon entirely.' : adaptiveLevel === 'advanced' ? '\n## Adaptive Level: ADVANCED\nUse precise technical language, go deeper into theory, include challenging details and connections to broader concepts.' : '\n## Adaptive Level: INTERMEDIATE\nUse standard academic language with moderate detail and practical examples.'}
${learningStyle ? `\n## Learning Style Personalization\n${learningStyle}` : ''}`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `File: "${fileName}"\n\nContent:\n${fileContent}` },
    ];

    let response: Response | null = null;

    // Use Ling-1T via ZenMux API with retries
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(ZENMUX_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ZENMUX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "inclusionai/ling-1t",
          messages: aiMessages,
          temperature: 0.7,
          stream: true,
        }),
      });
      if (response.status !== 429) break;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 2000));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "AI model is busy. Please wait and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response?.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please check your plan." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response?.text() || "No response";
      console.error("ZenMux failed:", response?.status, errorText);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Explain file error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
