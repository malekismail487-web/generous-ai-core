// -----------------------------------------------------------------------------
// Ministry Extension Workspace — the 13th Control Center tool
// -----------------------------------------------------------------------------
// A conversational workspace where the ministry designs new educational tools
// with Lumina. Every response is either a plan, a full blueprint, or a
// principled refusal. Blueprints render live in a sandbox preview panel. When
// the ministry is satisfied, one click pushes the extension forward to Super
// Admin review — nothing deploys until a human approves.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Send,
  Loader2,
  Sparkles,
  ShieldAlert,
  Eye,
  Rocket,
  MessageSquare,
  History,
  Ban,
} from "lucide-react";
import { ExtensionRenderer } from "@/components/extensions/ExtensionRenderer";
import {
  validateManifest,
  type ExtensionManifest,
  ALLOWED_ROLES,
  type SurfaceRole,
} from "@/lib/extensions/blueprint";
import ReactMarkdown from "react-markdown";

interface Conversation {
  id: string;
  title: string;
  archived: boolean;
  updated_at: string;
  message_count: number;
  latest_blueprint_status: string | null;
}

interface MessagePart { type: string; text?: string; mode?: string; blueprint_id?: string; blueprint_version?: number }
interface StoredMessage { id: string; role: string; parts: MessagePart[]; created_at: string }
interface Blueprint {
  id: string; version: number; name: string; summary: string;
  manifest: unknown; requested_capabilities: string[]; status: string; created_at: string;
}

export function ExtensionsPanel() {
  const { toast } = useToast();
  const [sessionToken] = useState(
    () => sessionStorage.getItem("ministry_session_token") ?? "",
  );

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [previewRole, setPreviewRole] = useState<SurfaceRole>("student");
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------- Load conversations ----------
  const refreshConversations = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingConvs(true);
    const { data, error } = await supabase.rpc("ext_list_conversations", {
      p_session_token: sessionToken,
    });
    if (error) {
      toast({ title: "Couldn't load workspaces", description: error.message, variant: "destructive" });
    } else {
      setConversations((data ?? []) as Conversation[]);
    }
    setLoadingConvs(false);
  }, [sessionToken, toast]);

  useEffect(() => { void refreshConversations(); }, [refreshConversations]);

  // ---------- Load a specific conversation ----------
  const loadConversation = useCallback(async (id: string) => {
    if (!sessionToken) return;
    const { data, error } = await supabase.rpc("ext_load_conversation", {
      p_session_token: sessionToken, p_conversation_id: id,
    });
    if (error) { toast({ title: "Load failed", description: error.message, variant: "destructive" }); return; }
    const payload = data as { success: boolean; messages?: StoredMessage[]; blueprints?: Blueprint[] } | null;
    if (!payload?.success) return;
    setMessages(payload.messages ?? []);
    setBlueprints(payload.blueprints ?? []);
  }, [sessionToken, toast]);

  useEffect(() => {
    if (activeConvId) void loadConversation(activeConvId);
    else { setMessages([]); setBlueprints([]); }
  }, [activeConvId, loadConversation]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // ---------- New conversation ----------
  const startConversation = useCallback(async () => {
    if (!sessionToken) return;
    const { data, error } = await supabase.rpc("ext_create_conversation", {
      p_session_token: sessionToken, p_title: "New extension design",
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    const payload = data as { success: boolean; id?: string } | null;
    if (payload?.success && payload.id) {
      await refreshConversations();
      setActiveConvId(payload.id);
    }
  }, [sessionToken, toast, refreshConversations]);

  // ---------- Send message ----------
  const sendMessage = useCallback(async () => {
    if (!sessionToken || !activeConvId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic user turn
    const optimistic: StoredMessage = {
      id: `tmp-${Date.now()}`, role: "user",
      parts: [{ type: "text", text }], created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const historyForModel = messages.map((m) => ({ role: m.role, parts: m.parts }));
      const { data, error } = await supabase.functions.invoke("lumina-extension-chat", {
        body: {
          session_token: sessionToken,
          conversation_id: activeConvId,
          user_message: text,
          history: historyForModel,
        },
      });
      if (error) throw error;
      const payload = data as {
        mode: string; message: string;
        blueprint_id?: string | null; blueprint_version?: number | null;
        refusal_reason?: string | null;
      };
      await loadConversation(activeConvId);
      await refreshConversations();
      if (payload.mode === "refusal") {
        toast({ title: "Lumina refused this request", description: payload.refusal_reason ?? "Protected system." });
      } else if (payload.blueprint_id) {
        toast({ title: "New blueprint saved", description: `Version ${payload.blueprint_version}` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
      // Re-add input so user doesn't lose their text
      setInput(text);
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [sessionToken, activeConvId, input, sending, messages, loadConversation, refreshConversations, toast]);

  // ---------- Push forward ----------
  const pushForward = useCallback(async (blueprintId: string) => {
    if (!sessionToken) return;
    if (!confirm("Push this blueprint to Super Admin for review? Nothing deploys until they approve.")) return;
    const { data, error } = await supabase.rpc("ext_push_forward", {
      p_session_token: sessionToken, p_blueprint_id: blueprintId,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    const payload = data as { success: boolean; error?: string } | null;
    if (!payload?.success) {
      toast({ title: "Cannot push", description: payload?.error ?? "unknown", variant: "destructive" });
      return;
    }
    toast({ title: "Pushed to Super Admin", description: "You'll see the decision here shortly." });
    if (activeConvId) void loadConversation(activeConvId);
  }, [sessionToken, activeConvId, loadConversation, toast]);

  // ---------- Derived state ----------
  const latestBlueprint = blueprints[0]; // ordered version DESC
  const validation = useMemo(
    () => (latestBlueprint ? validateManifest(latestBlueprint.manifest) : null),
    [latestBlueprint],
  );
  const previewManifest: ExtensionManifest | null = validation?.ok ? validation.manifest ?? null : null;
  const activeConv = conversations.find((c) => c.id === activeConvId);

  // ---------- Render ----------
  if (!sessionToken) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No ministry session detected. Sign in again.
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-260px)]">
      {/* Conversation list */}
      <aside className="w-full md:w-56 shrink-0 border border-gray-800 rounded-lg bg-gray-950 flex flex-col">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-gray-500">Workspaces</span>
          <Button size="icon" variant="ghost" onClick={startConversation} className="h-7 w-7">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvs ? (
              <p className="text-xs text-gray-600 px-2 py-3">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 py-3">
                No workspaces yet. Click + to start designing.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs border-l-2 ${
                    activeConvId === c.id
                      ? "bg-emerald-950/40 text-emerald-300 border-emerald-500"
                      : "text-gray-400 hover:bg-gray-900 border-transparent"
                  }`}
                >
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-[10px] text-gray-600">
                    {c.message_count} msgs · {c.latest_blueprint_status ?? "no blueprint"}
                  </p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat column */}
      <section className="flex-1 min-w-0 flex flex-col border border-gray-800 rounded-lg bg-gray-950 overflow-hidden">
        <header className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-500" />
          <span className="text-sm text-gray-300 truncate">
            {activeConv?.title ?? "Start or select a workspace"}
          </span>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {!activeConvId ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-3">
              <Sparkles className="w-8 h-8 text-emerald-500/60" />
              <p className="text-sm max-w-sm">
                Start a workspace, then describe an educational tool you want built for your ministry —
                Lumina will propose a plan first, then a blueprint you can preview and push forward.
              </p>
            </div>
          ) : messages.length === 0 && !sending ? (
            <p className="text-center text-xs text-gray-600">
              No messages yet. Say what you'd like to build.
            </p>
          ) : (
            messages.map((m) => <ChatMessage key={m.id} message={m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Lumina is thinking…
            </div>
          )}
        </div>
        {activeConvId && (
          <div className="p-3 border-t border-gray-800 flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
              }}
              placeholder="Describe the tool you want Lumina to design…"
              className="min-h-[60px] resize-none bg-gray-900 border-gray-800 text-sm"
              disabled={sending}
              autoFocus
            />
            <Button onClick={sendMessage} disabled={sending || !input.trim()} size="icon">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </section>

      {/* Sandbox preview column */}
      <section className="w-full md:w-[420px] shrink-0 flex flex-col border border-gray-800 rounded-lg bg-gray-950 overflow-hidden">
        <header className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-gray-300">Sandbox Preview</span>
          </div>
          {latestBlueprint && (
            <span className="text-[10px] font-mono text-gray-500">
              v{latestBlueprint.version} · {latestBlueprint.status}
            </span>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!latestBlueprint ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2">
              <History className="w-6 h-6 opacity-50" />
              <p className="text-xs max-w-xs">
                No blueprint yet. Once Lumina proposes one, it will render here in a live sandbox.
              </p>
            </div>
          ) : validation?.ok && previewManifest ? (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Role:</span>
                  <select
                    value={previewRole}
                    onChange={(e) => setPreviewRole(e.target.value as SurfaceRole)}
                    className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5"
                  >
                    {ALLOWED_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={() => pushForward(latestBlueprint.id)}
                  disabled={latestBlueprint.status === "pushed" || latestBlueprint.status === "deployed"}
                  className="gap-1.5"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  {latestBlueprint.status === "pushed"
                    ? "Under review"
                    : latestBlueprint.status === "deployed"
                    ? "Deployed"
                    : "Push forward"}
                </Button>
              </div>
              <div className="rounded-md border border-gray-800 bg-background p-3">
                <ExtensionRenderer
                  manifest={previewManifest}
                  role={previewRole}
                  blueprintId={latestBlueprint.id}
                  tenantId="preview"
                />
              </div>
              <div className="text-[10px] text-gray-600 space-y-1">
                <p><Ban className="inline w-3 h-3 mr-1" />Sandbox writes are stored separately from live data.</p>
                <p>Signature: <span className="font-mono">{latestBlueprint.id.slice(0, 8)}</span></p>
              </div>
            </>
          ) : (
            <div className="text-xs text-red-400 space-y-1">
              <p className="flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Blueprint failed validation:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {(validation?.errors ?? []).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chat bubble
// -----------------------------------------------------------------------------

function ChatMessage({ message }: { message: StoredMessage }) {
  const isUser = message.role === "user";
  const text = message.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
  const mode = message.parts[0]?.mode;
  const blueprintVersion = message.parts[0]?.blueprint_version;
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={
        isUser
          ? "max-w-[85%] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm"
          : "max-w-[85%] text-sm text-gray-200"
      }>
        {!isUser && mode && (
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-500">
            {mode === "refusal" ? <ShieldAlert className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {mode}
            {blueprintVersion ? ` · v${blueprintVersion}` : ""}
          </div>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
