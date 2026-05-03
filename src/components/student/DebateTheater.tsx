import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, GraduationCap, ShieldQuestion, Users, Target, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";

const PERSONAS = [
  { id: "prof",    name: "The Professor", icon: GraduationCap, accent: "text-sky-500"   },
  { id: "skeptic", name: "The Skeptic",   icon: ShieldQuestion, accent: "text-rose-500" },
  { id: "peer",    name: "The Peer",      icon: Users,          accent: "text-emerald-500" },
  { id: "coach",   name: "The Coach",     icon: Target,         accent: "text-amber-500"   },
] as const;

type PaneId = typeof PERSONAS[number]["id"];

interface Props {
  question: string;
  onClose: () => void;
  onSideWith?: (personaId: PaneId, personaName: string) => void;
}

export function DebateTheater({ question, onClose, onSideWith }: Props) {
  const [panes, setPanes] = useState<Record<PaneId, string>>({ prof: "", skeptic: "", peer: "", coach: "" });
  const [done, setDone] = useState<Record<PaneId, boolean>>({ prof: false, skeptic: false, peer: false, coach: false });
  const [verdict, setVerdict] = useState<string>("");
  const [phase, setPhase] = useState<"streaming" | "verdict_pending" | "complete">("streaming");
  const [error, setError] = useState<string | null>(null);
  const [sided, setSided] = useState<PaneId | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const ac = new AbortController();
        abortRef.current = ac;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/debate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ question }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error("debate failed");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancel) {
          const { value, done: rdone } = await reader.read();
          if (rdone) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.delta && ev.persona) {
                setPanes(p => ({ ...p, [ev.persona as PaneId]: (p[ev.persona as PaneId] || "") + ev.delta }));
              } else if (ev.done && ev.persona) {
                setDone(d => ({ ...d, [ev.persona as PaneId]: true }));
              } else if (ev.error && ev.persona) {
                setPanes(p => ({ ...p, [ev.persona as PaneId]: (p[ev.persona as PaneId] || "") + `\n_(error: ${ev.error})_` }));
              } else if (ev.phase === "verdict_pending") {
                setPhase("verdict_pending");
              } else if (ev.verdict) {
                setVerdict(ev.verdict);
              } else if (ev.phase === "complete") {
                setPhase("complete");
              }
            } catch { /* partial */ }
          }
        }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "debate error");
      }
    };
    run();
    return () => { cancel = true; abortRef.current?.abort(); };
  }, [question]);

  const handleSide = async (id: PaneId, name: string) => {
    setSided(id);
    onSideWith?.(id, name);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={16} className="text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">Debate Theater</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">— "{question.slice(0, 80)}{question.length > 80 ? "…" : ""}"</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/40">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-5xl mx-auto">
          {PERSONAS.map(p => {
            const Icon = p.icon;
            const isDone = done[p.id];
            const isSided = sided === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-2xl border bg-card/70 backdrop-blur-sm overflow-hidden flex flex-col",
                  "min-h-[220px] max-h-[55vh]",
                  isSided ? "border-primary ring-2 ring-primary/30" : "border-border/40",
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={p.accent} />
                    <span className="text-xs font-semibold">{p.name}</span>
                    {!isDone && <span className="text-[10px] text-muted-foreground animate-pulse">streaming…</span>}
                  </div>
                  <button
                    onClick={() => handleSide(p.id, p.name)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                      isSided
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isSided ? "Sided ✓" : "Side with"}
                  </button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 overflow-y-auto text-[13px] leading-relaxed" style={{ fontFamily: 'Source Serif 4, serif' }}>
                  {panes[p.id] ? (
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {panes[p.id]}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic text-xs">Thinking…</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Verdict */}
        <div className="max-w-5xl mx-auto mt-4">
          <div className="rounded-2xl border border-primary/40 bg-card/80 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={16} className="text-primary" />
              <span className="text-sm font-semibold">Lumina's Verdict</span>
              {phase === "verdict_pending" && <span className="text-[10px] text-muted-foreground animate-pulse">synthesizing…</span>}
              {phase === "complete" && verdict && <span className="text-[10px] text-emerald-500">final</span>}
            </div>
            {verdict ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-[13px]" style={{ fontFamily: 'Source Serif 4, serif' }}>
                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{verdict}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                The verdict appears once all four voices finish.
              </p>
            )}
            {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
