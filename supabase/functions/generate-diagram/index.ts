import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, topic, grade, count } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const diagramCount = Math.min(count || 2, 3); // Max 3 diagrams
    const images: string[] = [];

    // Generate educational diagrams one at a time
    const prompts = [
      `Create a clean, professional educational diagram about "${topic}" for ${subject} at ${grade} level. Make it a labeled scientific/educational illustration with clear annotations. Use a clean white background, professional colors, and educational style similar to what you'd find in a textbook. NO text watermarks. NO people or faces. Focus purely on the educational concept.`,
      `Create a detailed infographic or visual chart about "${topic}" for ${subject} class. Include labeled parts, arrows showing relationships, and key data. Use clean design with professional colors on white background. Educational textbook style. NO people, NO faces, NO watermarks.`,
      `Create a visual concept map or process diagram about "${topic}" in ${subject}. Show how different parts connect with arrows and labels. Clean, professional, educational illustration style on white background. NO people, NO faces. Textbook-quality diagram.`,
    ];

    for (let i = 0; i < diagramCount; i++) {
      try {
        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [
                {
                  role: "user",
                  content: prompts[i % prompts.length],
                },
              ],
              modalities: ["image", "text"],
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Image generation attempt ${i + 1} failed:`, response.status, errText);
          
          if (response.status === 429) {
            // Rate limited - wait and skip
            console.log("Rate limited, skipping remaining images");
            break;
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({ error: "AI credits exhausted. Please add credits to continue.", images: [] }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          continue;
        }

        const data = await response.json();
        const generatedImages = data.choices?.[0]?.message?.images;

        if (generatedImages && generatedImages.length > 0) {
          for (const img of generatedImages) {
            const url = img.image_url?.url;
            if (url) {
              images.push(url);
            }
          }
        }
      } catch (imgErr) {
        console.error(`Image generation ${i + 1} error:`, imgErr);
      }

      // Small delay between requests to avoid rate limiting
      if (i < diagramCount - 1) {
        await new Promise((r) => setTimeout(r, 1500));
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
