// -----------------------------------------------------------------------------
// Ministry Extension System — Design Chat
// -----------------------------------------------------------------------------
// Ministry chats with Lumina to design a new educational tool for its tenant.
//
// Flow per user turn:
//   1. Verify the ministry session token → resolve tenant_id.
//   2. Append the user message to `extension_messages` (via ext_append_message).
//   3. Ask Lumina for a JSON response with:
//        { mode: "plan" | "blueprint" | "refusal",
//          message: string,              // markdown shown in chat
//          blueprint?: ExtensionManifest // only when mode === "blueprint"
//          refusal_reason?: string }
//   4. If a blueprint is returned, save it via ext_save_blueprint.
//   5. Append the assistant message. Return both to the client.
//
// Protection rules baked into the system prompt AND enforced server-side:
//   - Any user mention of protected systems → refusal.
//   - Blueprint must reference only allowlisted widgets / capabilities / roles.
//   - Blueprint must never name real database tables.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

const PROTECTED_KEYWORDS = [
  "adaptive learning engine", "adaptive_learning_engine",
  "learning synchronization engine",
  "ability_estimates", "ensemble_predictions", "lesson_events",
  "kt_sequence_state", "fsrs_card_state",
  "auth.users", "user_roles", "hardcoded_admins",
  "tenants table", "ministry_sessions",
];

const ALLOWED_WIDGETS = ["heading","text","stat","table","form","list","chart","kanban"];
const ALLOWED_CAPS = ["data.read","data.write","file.upload","notification.send","export.csv"];
const ALLOWED_ROLES = ["student","teacher","parent","school_admin","ministry"];
const ALLOWED_COL_TYPES = ["text","number","date","boolean","select"];

const SYSTEM_PROMPT = `You are Lumina, an AI engineering assistant for the Ministry Extension Workspace.

Your role: help a ministry design NEW educational tools that will be deployed ONLY to their own country's schools and accounts after Super Admin approval.

You NEVER write code. You produce structured JSON blueprints that a runtime interpreter renders. That is a hard, structural limit — not a preference.

# Response format (ALWAYS a single JSON object, nothing else)

{
  "mode": "plan" | "blueprint" | "refusal",
  "message": "markdown message shown in chat",
  "blueprint": <ExtensionManifest>   // ONLY when mode is "blueprint"
  "refusal_reason": "..."             // ONLY when mode is "refusal"
}

# Modes

- "plan"  — Default first response for any new feature request. Return a proposed plan in "message" as a numbered markdown outline covering: goal, target roles, screens, data stored, permissions, capabilities needed. Ask the ministry to approve, refine, or reject the plan. DO NOT emit a blueprint yet.
- "blueprint" — Only after the ministry approves a plan or asks for a revision. Return the message summarising what changed, and the full manifest under "blueprint".
- "refusal" — If the request would modify a protected system (see below), OR would compromise educational truth, OR would harm students, refuse cleanly. Explain briefly why.

# HARD refusals (mode = "refusal")

Refuse if the request touches ANY of these:
- The Adaptive Learning Engine (ALE), Learning Synchronization Engine (LSE), ability estimates, ensemble predictions, lesson_events, kt_sequence_state, fsrs_card_state, or any core educational reasoning.
- Authentication, authorization, user_roles, tenant isolation, ministry_sessions, or the tenants table.
- Any request to weaken factual correctness, obscure scientific truth, or violate educational integrity.
- Any request that would affect a different country / tenant.

# Blueprint schema (STRICT)

{
  "name": "snake_case_name",
  "displayName": "Human name",
  "description": "one-line",
  "surfaces": [ { "role": <role>, "title": "...", "route": "kebab-case-path",
                  "widgets": [ <widget>, ... ] } ],
  "data": [ { "key": "snake_case", "columns":[{"key","label","type","options?","required?"}] } ],
  "permissions": { "read": [<role>...], "write": [<role>...] },
  "capabilities_required": [ <capability> ... ]
}

Allowed roles: ${ALLOWED_ROLES.join(", ")}
Allowed widget types: ${ALLOWED_WIDGETS.join(", ")}
Allowed capabilities: ${ALLOWED_CAPS.join(", ")}
Allowed column types: ${ALLOWED_COL_TYPES.join(", ")}

Widget shapes:
- heading: { type, text }
- text: { type, text }
- stat: { type, label, value }
- table: { type, title, dataKey, columns:[{key,label,type,options?,required?}] }
- form: { type, title, dataKey, submitLabel, fields:[{key,label,type,options?,required?}] }
- list: { type, title, dataKey, titleField, subtitleField? }
- chart: { type, title, dataKey, xField, yField, kind:"bar"|"line" }
- kanban: { type, title, dataKey, titleField, statusField, statuses:[...] }

Every widget.dataKey MUST match one of data[].key. Never reference real database tables — dataKey is a logical name that will be stored in the extension sandbox / extension_data table automatically.

# Communication rules

- Always plan before you build. Never jump straight to a blueprint on the first user message.
- Be concise and professional. Use markdown lists.
- Ask clarifying questions when the request is ambiguous.
- Confirm changes explicitly before regenerating a blueprint.

Return ONLY the JSON object. No code fences, no prose outside it.`;

function findProtected(text: string): string | null {
  const l = text.toLowerCase();
  for (const k of PROTECTED_KEYWORDS) if (l.includes(k)) return k;
  return null;
}

interface UIMessage { role: "user" | "assistant" | "system"; parts: Array<{ type: string; text?: string }>; }

function messageText(m: UIMessage): string {
  return m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      session_token,
      conversation_id,
      user_message,
      history = [],
    }: {
      session_token: string;
      conversation_id: string;
      user_message: string;
      history?: UIMessage[];
    } = await req.json();

    if (!session_token || !conversation_id || !user_message?.trim()) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_KEY) {
      return new Response(JSON.stringify({ error: "missing_lovable_key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Verify session & get tenant
    const { data: tenantId, error: tenErr } = await admin.rpc("ext_tenant_from_session", {
      p_session_token: session_token,
    });
    if (tenErr || !tenantId) {
      return new Response(JSON.stringify({ error: "invalid_session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist the user turn first
    await admin.rpc("ext_append_message", {
      p_session_token: session_token,
      p_conversation_id: conversation_id,
      p_role: "user",
      p_parts: [{ type: "text", text: user_message }],
    });

    // Guard: user request itself names a protected system
    const guarded = findProtected(user_message);
    if (guarded) {
      const refusalMsg = `I can't help with that. The **${guarded}** is a protected core system. I'm here to help you design new tools around the platform, not modify its foundations. Try describing an educational tool your ministry would like students, teachers, parents, or administrators to have.`;
      await admin.rpc("ext_append_message", {
        p_session_token: session_token,
        p_conversation_id: conversation_id,
        p_role: "assistant",
        p_parts: [{ type: "text", text: refusalMsg }],
      });
      return new Response(JSON.stringify({
        mode: "refusal", message: refusalMsg, refusal_reason: `protected_system:${guarded}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build message history for the model
    const modelMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-30).map((m) => ({ role: m.role, content: messageText(m) })),
      { role: "user", content: user_message },
    ];

    // Call Lovable AI Gateway
    const resp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: modelMessages,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const bodyText = await resp.text();
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
      return new Response(JSON.stringify({ error: "upstream_error", detail: bodyText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await resp.json();
    const raw = completion?.choices?.[0]?.message?.content ?? "{}";

    let parsed: {
      mode: "plan" | "blueprint" | "refusal";
      message: string;
      blueprint?: unknown;
      refusal_reason?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        mode: "plan",
        message: "I had trouble structuring my response. Could you restate what you'd like to build?",
      };
    }

    // Guard: assistant tried to mention a protected system
    if (findProtected(parsed.message ?? "") || (parsed.blueprint && findProtected(JSON.stringify(parsed.blueprint)))) {
      parsed = {
        mode: "refusal",
        message: "That request touches a protected core system. I can't help with it. Try describing an educational tool built on top of the platform instead.",
        refusal_reason: "protected_mention",
      };
    }

    // If a blueprint was returned, persist it
    let savedBlueprintId: string | null = null;
    let savedVersion: number | null = null;
    if (parsed.mode === "blueprint" && parsed.blueprint && typeof parsed.blueprint === "object") {
      const bp = parsed.blueprint as { name?: string; displayName?: string; description?: string; capabilities_required?: string[] };
      const saveResult = await admin.rpc("ext_save_blueprint", {
        p_session_token: session_token,
        p_conversation_id: conversation_id,
        p_name: bp.name ?? "unnamed_extension",
        p_summary: bp.description ?? bp.displayName ?? "",
        p_manifest: parsed.blueprint,
        p_capabilities: bp.capabilities_required ?? [],
      });
      const save = saveResult.data as unknown as { success?: boolean; id?: string; version?: number } | null;
      if (save?.success) {
        savedBlueprintId = save.id ?? null;
        savedVersion = save.version ?? null;
      }
    }

    // Persist the assistant turn
    await admin.rpc("ext_append_message", {
      p_session_token: session_token,
      p_conversation_id: conversation_id,
      p_role: "assistant",
      p_parts: [{
        type: "text",
        text: parsed.message,
        blueprint_id: savedBlueprintId,
        blueprint_version: savedVersion,
        mode: parsed.mode,
      }],
    });

    return new Response(JSON.stringify({
      mode: parsed.mode,
      message: parsed.message,
      blueprint_id: savedBlueprintId,
      blueprint_version: savedVersion,
      refusal_reason: parsed.refusal_reason ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[lumina-extension-chat] fatal", e);
    return new Response(JSON.stringify({ error: "internal", detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
