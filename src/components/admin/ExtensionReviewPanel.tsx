// -----------------------------------------------------------------------------
// Super Admin — Extension Review
// -----------------------------------------------------------------------------
// Queue of pushed ministry extensions. For each request the Super Admin can:
//   1. Read the full blueprint manifest.
//   2. Preview it in the sandbox renderer (same runtime as production).
//   3. Chat with the Lumina Audit Assistant for security / policy analysis.
//   4. Approve — deploys a signed version to that ministry's tenant only.
//   5. Reject — records notes; ministry can revise & resubmit.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check, X, RefreshCw, Rocket, Eye, MessageSquare, Loader2, Sparkles, FileJson,
} from "lucide-react";
import { ExtensionRenderer } from "@/components/extensions/ExtensionRenderer";
import {
  validateManifest, type ExtensionManifest, ALLOWED_ROLES, type SurfaceRole,
} from "@/lib/extensions/blueprint";
import ReactMarkdown from "react-markdown";

interface PendingRequest {
  request_id: string;
  submitted_at: string;
  tenant_id: string;
  tenant_name: string;
  blueprint_id: string;
  blueprint_name: string;
  blueprint_summary: string;
  blueprint_version: number;
  requested_capabilities: string[];
  manifest: unknown;
  status: string;
}

interface AuditMessage { id: string; role: string; parts: Array<{ type: string; text?: string }>; created_at: string; }

export function ExtensionReviewPanel() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "manifest" | "audit">("preview");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewRole, setPreviewRole] = useState<SurfaceRole>("student");

  const [auditMessages, setAuditMessages] = useState<AuditMessage[]>([]);
  const [auditInput, setAuditInput] = useState("");
  const [auditSending, setAuditSending] = useState(false);
  const auditScrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("ext_list_pending_requests");
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    else setRequests((data ?? []) as PendingRequest[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = requests.find((r) => r.request_id === activeId);

  const loadAudit = useCallback(async (reqId: string) => {
    const { data, error } = await supabase.rpc("ext_load_audit_chat", { p_request_id: reqId });
    if (!error) setAuditMessages((data ?? []) as AuditMessage[]);
  }, []);

  useEffect(() => {
    if (activeId) void loadAudit(activeId);
    else setAuditMessages([]);
  }, [activeId, loadAudit]);

  useEffect(() => {
    if (auditScrollRef.current) auditScrollRef.current.scrollTop = auditScrollRef.current.scrollHeight;
  }, [auditMessages, auditSending]);

  const validation = useMemo(
    () => (active ? validateManifest(active.manifest) : null),
    [active],
  );
  const previewManifest: ExtensionManifest | null = validation?.ok ? validation.manifest ?? null : null;

  const approve = useCallback(async () => {
    if (!active) return;
    if (!confirm(`Approve and deploy "${active.blueprint_name}" to ${active.tenant_name}?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("ext_approve_request", {
      p_request_id: active.request_id, p_notes: notes || null,
    });
    setBusy(false);
    if (error) return toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    const p = data as { success: boolean; error?: string; signature?: string } | null;
    if (!p?.success) return toast({ title: "Cannot approve", description: p?.error ?? "unknown", variant: "destructive" });
    toast({ title: "Deployed", description: `Signature ${p.signature?.slice(0, 12)}…` });
    setNotes(""); setActiveId(null); await refresh();
  }, [active, notes, toast, refresh]);

  const reject = useCallback(async () => {
    if (!active) return;
    if (!notes.trim()) return toast({ title: "Add rejection notes first", variant: "destructive" });
    setBusy(true);
    const { data, error } = await supabase.rpc("ext_reject_request", {
      p_request_id: active.request_id, p_notes: notes,
    });
    setBusy(false);
    if (error) return toast({ title: "Reject failed", description: error.message, variant: "destructive" });
    const p = data as { success: boolean; error?: string } | null;
    if (!p?.success) return toast({ title: "Cannot reject", description: p?.error ?? "unknown", variant: "destructive" });
    toast({ title: "Rejected" });
    setNotes(""); setActiveId(null); await refresh();
  }, [active, notes, toast, refresh]);

  const sendAudit = useCallback(async () => {
    if (!active || !auditInput.trim()) return;
    const text = auditInput.trim();
    setAuditInput("");
    setAuditSending(true);
    setAuditMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: "user", parts: [{ type: "text", text }], created_at: new Date().toISOString() },
    ]);
    try {
      const historyForModel = auditMessages.map((m) => ({ role: m.role, parts: m.parts }));
      const { data, error } = await supabase.functions.invoke("lumina-extension-audit", {
        body: { request_id: active.request_id, manifest: active.manifest, user_message: text, history: historyForModel },
      });
      if (error) throw error;
      const payload = data as { message: string };
      await loadAudit(active.request_id);
      void payload; // message will be reloaded from server
    } catch (e: unknown) {
      toast({ title: "Audit failed", description: e instanceof Error ? e.message : "unknown", variant: "destructive" });
    } finally {
      setAuditSending(false);
    }
  }, [active, auditInput, auditMessages, loadAudit, toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ministry Extension Review</h2>
          <p className="text-xs text-muted-foreground">
            Extensions pushed by ministries. Approving deploys the extension to that ministry's tenant only.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-260px)]">
        {/* Queue */}
        <aside className="border rounded-lg bg-card flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b text-xs uppercase tracking-wider text-muted-foreground">
            Queue ({requests.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <p className="text-xs text-muted-foreground px-2 py-3">Loading…</p>
              ) : requests.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-3">No requests.</p>
              ) : (
                requests.map((r) => (
                  <button
                    key={r.request_id}
                    onClick={() => setActiveId(r.request_id)}
                    className={`w-full text-left rounded px-2 py-2 text-xs border-l-2 ${
                      activeId === r.request_id
                        ? "bg-primary/10 border-primary text-foreground"
                        : "text-muted-foreground hover:bg-accent border-transparent"
                    }`}
                  >
                    <p className="truncate font-medium text-foreground">{r.blueprint_name}</p>
                    <p className="text-[10px]">{r.tenant_name} · v{r.blueprint_version}</p>
                    <p className="text-[10px] uppercase mt-0.5 tracking-wider">
                      <span className={r.status === "in_review" ? "text-yellow-500" : r.status === "approved" ? "text-emerald-500" : "text-red-500"}>
                        {r.status}
                      </span>
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Detail */}
        <section className="border rounded-lg bg-card flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a request to review.
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{active.tenant_name}</p>
                    <h3 className="text-base font-semibold">{active.blueprint_name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{active.blueprint_summary}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={reject} disabled={busy || active.status !== "in_review"}>
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={approve} disabled={busy || active.status !== "in_review" || !validation?.ok}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                      Approve & Deploy
                    </Button>
                  </div>
                </div>
                {active.requested_capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {active.requested_capabilities.map((c) => (
                      <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 bg-muted rounded">{c}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 text-xs">
                  {(["preview","manifest","audit"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-2 py-1 rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                    >
                      {t === "preview" && <Eye className="w-3 h-3 inline mr-1" />}
                      {t === "manifest" && <FileJson className="w-3 h-3 inline mr-1" />}
                      {t === "audit" && <MessageSquare className="w-3 h-3 inline mr-1" />}
                      {t}
                    </button>
                  ))}
                </div>
              </header>

              <div className="flex-1 overflow-hidden">
                {tab === "preview" && (
                  <div className="h-full overflow-y-auto p-4 space-y-3">
                    {validation?.ok && previewManifest ? (
                      <>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Role:</span>
                          <select
                            value={previewRole}
                            onChange={(e) => setPreviewRole(e.target.value as SurfaceRole)}
                            className="bg-background border rounded px-1.5 py-0.5"
                          >
                            {ALLOWED_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div className="rounded border p-3 bg-background">
                          <ExtensionRenderer
                            manifest={previewManifest}
                            role={previewRole}
                            blueprintId={active.blueprint_id}
                            tenantId={active.tenant_id}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-destructive space-y-1">
                        <p>Blueprint failed validation. Approval is disabled:</p>
                        <ul className="list-disc pl-4">
                          {(validation?.errors ?? []).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {tab === "manifest" && (
                  <pre className="h-full overflow-auto p-4 text-[11px] font-mono bg-muted/30">
                    {JSON.stringify(active.manifest, null, 2)}
                  </pre>
                )}
                {tab === "audit" && (
                  <div className="h-full flex flex-col">
                    <div ref={auditScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                      {auditMessages.length === 0 && !auditSending ? (
                        <div className="text-center text-xs text-muted-foreground py-8">
                          Ask Lumina to audit this extension. Try: "Are there security concerns?" or
                          "Could this affect performance?"
                        </div>
                      ) : (
                        auditMessages.map((m) => {
                          const isUser = m.role === "user";
                          const text = m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
                          return (
                            <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                              <div className={
                                isUser
                                  ? "max-w-[85%] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm"
                                  : "max-w-[85%] text-sm text-foreground"
                              }>
                                {!isUser && (
                                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                                    <Sparkles className="w-3 h-3" /> audit
                                  </div>
                                )}
                                {isUser ? (
                                  <p className="whitespace-pre-wrap">{text}</p>
                                ) : (
                                  <div className="prose prose-sm max-w-none dark:prose-invert">
                                    <ReactMarkdown>{text}</ReactMarkdown>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      {auditSending && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" /> auditing…
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t flex items-end gap-2">
                      <Textarea
                        value={auditInput}
                        onChange={(e) => setAuditInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendAudit(); }
                        }}
                        placeholder="Ask the audit assistant about this extension…"
                        className="min-h-[50px] resize-none text-sm"
                        disabled={auditSending}
                      />
                      <Button onClick={sendAudit} disabled={auditSending || !auditInput.trim()} size="icon">
                        {auditSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {active.status === "in_review" && tab !== "audit" && (
                <div className="border-t p-3">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Decision notes (required for rejection)…"
                    className="text-xs min-h-[50px] resize-none"
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
