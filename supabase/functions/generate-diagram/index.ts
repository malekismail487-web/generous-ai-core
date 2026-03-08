import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { subject, topic, grade, count } = await req.json();

    const geminiKeys = getGeminiKeys();
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API keys configured");
    }

    const diagramCount = Math.min(count || 2, 3);
    const images: string[] = [];

    for (let i = 0; i < diagramCount; i++) {
      try {
        // Key pool rotation per diagram
        const startIdx = 0; // Sequential rotation: key1 → key2 → key3 → key4
        let response: Response | null = null;

        for (let k = 0; k < geminiKeys.length; k++) {
          const keyIdx = (startIdx + k) % geminiKeys.length;
          response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geminiKeys[keyIdx]}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.0-flash",
              messages: [
                {
                  role: "user",
                  content: `Create a clear, educational diagram about "${topic}" for ${subject} at ${grade || 'general'} level. The diagram should be visually clean, well-labeled, and suitable for studying. Use colors and clear labels.`,
                },
              ],
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
          console.warn(`Diagram generation ${i + 1} failed:`, response?.status);
          await response?.text();
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const imgMatch = content.match(/!\[.*?\]\((.*?)\)/);
          if (imgMatch) {
            images.push(imgMatch[1]);
          }
        }
      } catch (e) {
        console.warn(`Diagram ${i + 1} error:`, e);
      }
    }

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-diagram error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        images: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
