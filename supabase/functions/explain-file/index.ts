import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const key1 = Deno.env.get("GEMINI_API_KEY");
  if (key1 && key1.trim()) keys.push(key1.trim());
  const pool = Deno.env.get("GEMINI_API_KEY_POOL");
  if (pool) {
    for (const k of pool.split(",")) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }
  console.log(`Gemini key pool: ${keys.length} unique key(s) loaded [${keys.map((k, i) => `Key${i+1}:${k.substring(0,8)}...`).join(', ')}]`);
  return keys;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, adaptiveLevel, learningStyle, customPrompt } = await req.json();
    
    const geminiKeys = getGeminiKeys();
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API keys configured");
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
    const MAX_WAVES = 3;
    const WAVE_DELAYS = [15000, 30000, 45000];
    let success = false;

    for (let wave = 0; wave < MAX_WAVES && !success; wave++) {
      if (wave > 0) {
        const delay = WAVE_DELAYS[wave - 1];
        console.log(`All keys exhausted. Waiting ${delay / 1000}s (wave ${wave + 1}/${MAX_WAVES})...`);
        await new Promise(r => setTimeout(r, delay));
      }
      for (let i = 0; i < geminiKeys.length; i++) {
        console.log(`Trying key ${i + 1}/${geminiKeys.length} (wave ${wave + 1})`);
        try {
          response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geminiKeys[i]}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.0-flash",
              messages: aiMessages,
              temperature: 0.7,
              stream: true,
            }),
          });
          if (response.status === 429) {
            console.log(`Key ${i + 1} rate limited, rotating...`);
            await response.text();
            continue;
          }
          success = true;
          break;
        } catch (e) {
          console.warn("Fetch error:", e);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response?.text() || "No response";
      console.error("Gemini API failed:", response?.status, errorText);
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
