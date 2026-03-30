import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const diagramCount = Math.min(count || 2, 3);
    const images: string[] = [];

    for (let i = 0; i < diagramCount; i++) {
      try {
        const response = await fetch(AI_GATEWAY_URL, {
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
                content: `Create a clear, professional educational diagram about "${topic}" for ${subject} at ${grade || 'general'} level. The diagram should be:
- Visually clean with a white or light background
- Well-labeled with clear text annotations
- Use colors to distinguish different parts
- Suitable for a textbook or educational presentation
- Scientific and accurate
Do NOT include any text outside the diagram. Generate ONLY the image.`,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (!response.ok) {
          console.warn(`Diagram generation ${i + 1} failed:`, response.status);
          if (response.status === 429 || response.status === 402) {
            await response.text();
            break;
          }
          await response.text();
          continue;
        }

        const data = await response.json();
        const messageImages = data.choices?.[0]?.message?.images;
        
        if (messageImages && messageImages.length > 0) {
          const imageDataUrl = messageImages[0]?.image_url?.url;
          if (imageDataUrl && imageDataUrl.startsWith("data:image/")) {
            // Extract base64 data
            const matches = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
              const base64Data = matches[2];
              const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              
              const fileName = `${crypto.randomUUID()}.${ext}`;
              const { error: uploadError } = await supabase.storage
                .from("generated-diagrams")
                .upload(fileName, binaryData, {
                  contentType: `image/${matches[1]}`,
                  upsert: false,
                });

              if (uploadError) {
                console.warn(`Upload failed for diagram ${i + 1}:`, uploadError.message);
                continue;
              }

              const { data: publicData } = supabase.storage
                .from("generated-diagrams")
                .getPublicUrl(fileName);

              if (publicData?.publicUrl) {
                images.push(publicData.publicUrl);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Diagram ${i + 1} error:`, e);
      }

      // Small delay between requests to avoid rate limits
      if (i < diagramCount - 1) {
        await new Promise(r => setTimeout(r, 1000));
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
