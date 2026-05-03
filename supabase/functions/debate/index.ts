// Debate Theater — spawns 4 distinct persona streams in parallel and a synthesis verdict.
// Returns a single NDJSON event-stream where each line is { persona, delta? , done? , verdict? , error? }
//
// POST /debate { question, subject?, topic? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

interface Persona { id: string; name: string; system: string; }

const PERSONAS: Persona[] = [
  {
    id: "prof",
    name: "The Professor",
    system: `You are THE PROFESSOR — a rigorous expert in this subject.
Speak with academic precision. Use definitions, derivations, and cite the underlying principles.
Keep your answer focused: 4-7 short paragraphs maximum, with clear logical structure.
You will be debated by 3 other voices (The Skeptic, The Peer, The Coach). When relevant,
acknowledge their angles ("A skeptic might object that…") but defend the rigorous answer.
Do NOT include greetings or closing remarks. Begin directly with the substance.`,
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    system: `You are THE SKEPTIC — a sharp critical thinker who challenges every assumption.
Question the question itself. Probe for hidden premises, common misconceptions, edge cases,
and where the textbook answer breaks down. Be respectful but uncompromising.
4-6 short paragraphs. Reference the Professor's view ("The Professor's framing assumes…")
when useful. Always end with at least one piercing question the student should ponder.`,
  },
  {
    id: "peer",
    name: "The Peer",
    system: `You are THE PEER — a smart classmate who learned this last week.
Use plain language, real-world analogies, and the kind of "wait so basically…" reframes
a friend would offer. You are warm, slightly informal, and you connect the topic to things
a student already knows. 4-6 short paragraphs. You may riff on what The Professor said,
making it accessible. End with a "the way I think about it…" line.`,
  },
  {
    id: "coach",
    name: "The Coach",
    system: `You are THE COACH — strategic and pragmatic.
You don't just explain — you tell the student exactly what to DO with this knowledge:
how to study it, what to practise, what mistakes to avoid on exams, and how to apply it.
4-6 short paragraphs. Provide a 3-step action plan at the end (numbered).
You may briefly acknowledge the other voices, but stay focused on actionable strategy.`,
  },
];

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = admin();
    const { data: { user } } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    return user;
  } catch { return null; }
}

async function streamPersona(
  persona: Persona,
  question: string,
  subject: string | null,
  topic: string | null,
  apiKey: string,
  emit: (obj: any) => void,
): Promise<string> {
  const collected: string[] = [];
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.6,
        messages: [
          { role: "system", content: persona.system },
          { role: "user", content: `SUBJECT: ${subject ?? "(general)"}\nTOPIC: ${topic ?? "(unspecified)"}\n\nSTUDENT'S QUESTION:\n${question}\n\nNow respond as ${persona.name}.` },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      emit({ persona: persona.id, error: `gateway ${res.status}` });
      emit({ persona: persona.id, done: true });
      return "";
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const j = line.slice(6).trim();
        if (j === "[DONE]") { break; }
        try {
          const p = JSON.parse(j);
          const delta = p.choices?.[0]?.delta?.content;
          if (delta) {
            collected.push(delta);
            emit({ persona: persona.id, delta });
          }
        } catch { /* partial */ }
      }
    }
  } catch (e) {
    emit({ persona: persona.id, error: e instanceof Error ? e.message : "stream error" });
  }
  emit({ persona: persona.id, done: true });
  return collected.join("");
}

async function buildVerdict(
  question: string,
  parts: Record<string, string>,
  apiKey: string,
): Promise<string> {
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are LUMINA, the synthesizer.
You have heard four voices debate a student's question: The Professor (rigor),
The Skeptic (challenge), The Peer (relatability), The Coach (strategy).
Produce a single VERDICT (4-6 short paragraphs) that:
1. States the best answer plainly.
2. Names which voice contributed the strongest insight and why.
3. Surfaces the single most important takeaway for the student.
Do not list bullet points; write tight prose. Begin directly with the verdict.`,
          },
          {
            role: "user",
            content: `STUDENT'S QUESTION:\n${question}\n\n--- THE PROFESSOR ---\n${parts.prof || "(no response)"}\n\n--- THE SKEPTIC ---\n${parts.skeptic || "(no response)"}\n\n--- THE PEER ---\n${parts.peer || "(no response)"}\n\n--- THE COACH ---\n${parts.coach || "(no response)"}\n\nNow write the verdict.`,
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? "";
  } catch { return ""; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  const question: string = (body.question ?? "").toString().slice(0, 4000);
  const subject: string | null = body.subject ?? null;
  const topic: string | null = body.topic ?? null;
  if (!question || question.length < 3) {
    return new Response(JSON.stringify({ error: "question required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: any) => {
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + "\n")); } catch {}
      };

      const parts: Record<string, string> = {};
      // Run all 4 personas in parallel
      const promises = PERSONAS.map(p =>
        streamPersona(p, question, subject, topic, apiKey, emit).then(text => { parts[p.id] = text; })
      );
      await Promise.all(promises);

      emit({ phase: "verdict_pending" });
      const verdict = await buildVerdict(question, parts, apiKey);
      if (verdict) emit({ verdict });
      emit({ phase: "complete" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
});
