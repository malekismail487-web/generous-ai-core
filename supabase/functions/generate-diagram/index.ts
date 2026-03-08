import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, topic, grade, count } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Gemini image generation model for diagrams
    const diagramCount = Math.min(count || 2, 3);
    const images: string[] = [];

    for (let i = 0; i < diagramCount; i++) {
      try {
        const response = await fetch(LOVABLE_AI_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            messages: [
              {
                role: "user",
                content: `Create a clear, educational diagram about "${topic}" for ${subject} at ${grade || 'general'} level. The diagram should be visually clean, well-labeled, and suitable for studying. Use colors and clear labels.`,
              },
            ],
          }),
        });

        if (!response.ok) {
          console.warn(`Diagram generation ${i + 1} failed:`, response.status);
          await response.text();
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          // Check if the response contains an image URL or base64
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
