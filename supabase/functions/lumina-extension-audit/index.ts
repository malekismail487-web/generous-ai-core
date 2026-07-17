// -----------------------------------------------------------------------------
// Ministry Extension System — Super Admin Audit Assistant
// -----------------------------------------------------------------------------
// A parallel chat surface for the Super Admin reviewing a pushed extension.
// The blueprint manifest is attached to every request. The model is instructed
// to be an advisory reviewer only — it must never claim authority to approve
// or reject. The decision remains a human one.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

const SYSTEM_PROMPT = `You are the Lumina Extension Audit Assistant. You review ministry-proposed extensions for the Super Admin.

You are ADVISORY ONLY. You never claim authority to approve, reject, deploy, or roll back. Those actions require the human Super Admin.

For every question, ground your reply in the exact blueprint manifest that will be pasted into the user turn. Cover, when relevant:
- Security concerns (data exposure, permission overreach, capability creep).
- Whether the extension attempts to reference any protected core system (ALE, LSE, auth, tenant isolation).
- Performance risk (large tables, many surfaces, unbounded lists).
- Educational appropriateness for the declared roles.
- Truth preservation — the blueprint must not present opinion as fact or ideology as science.

Be direct and concise. Use short markdown bullets. End every substantive answer with a plain sentence:
"Final decision remains with the Super Admin."`;

interface UIMessage { role: "user" | "assistant" | "system"; parts: Array<{ type: string; text?: string }>; }

function messageText(m: UIMessage): string {
  return m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      request_id,
      manifest,
      user_message,
      history = [],
    }: {
      request_id: string;
      manifest: unknown;
      user_message: string;
      history?: UIMessage[];
    } = await req.json();

    if (!request_id || !manifest || !user_message?.trim()) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!LOVABLE_KEY) {
      return new Response(JSON.stringify({ error: "missing_lovable_key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate the caller as a super admin
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: isSuper } = await admin.rpc("is_super_admin_caller");
    // Note: is_super_admin_caller uses auth.uid; when called via service role
    // it returns false. Re-check via user_roles directly with the user id.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isSuperAdmin = (roleRow ?? []).some((r) => r.role === "super_admin") || isSuper === true;
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist user turn
    await admin.from("extension_audit_chats").insert({
      request_id,
      role: "user",
      parts: [{ type: "text", text: user_message }],
    });

    const manifestBlock = `Blueprint manifest under review:\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``;

    const modelMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: manifestBlock },
      ...history.slice(-30).map((m) => ({ role: m.role, content: messageText(m) })),
      { role: "user", content: user_message },
    ];

    const resp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages: modelMessages }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "credits_exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "upstream_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await resp.json();
    const answer = completion?.choices?.[0]?.message?.content?.trim()
      ?? "(no response)";

    await admin.from("extension_audit_chats").insert({
      request_id,
      role: "assistant",
      parts: [{ type: "text", text: answer }],
    });

    return new Response(JSON.stringify({ message: answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[lumina-extension-audit] fatal", e);
    return new Response(JSON.stringify({ error: "internal", detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
