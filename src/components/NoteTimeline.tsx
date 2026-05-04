import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Clock, Loader2, Sparkles } from "lucide-react";
import { diffWords } from "diff";
import { format } from "date-fns";

interface Snapshot {
  id: string;
  snapshot_at: string;
  title: string;
  content: string;
  word_count: number;
}

interface NoteTimelineProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Time-Travel Notes overlay.
 * Scrub through every saved version of a note. Side-by-side diff vs. current.
 * AI growth-highlights summary on demand.
 */
export function NoteTimeline({ noteId, open, onClose }: NoteTimelineProps) {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    (async () => {
      const { data } = await supabase
        .from("note_snapshots")
        .select("id, snapshot_at, title, content, word_count")
        .eq("note_id", noteId)
        .order("snapshot_at", { ascending: true });
      if (cancelled) return;
      const list = (data ?? []) as Snapshot[];
      setSnaps(list);
      setIdx(Math.max(0, list.length - 1));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [noteId, open]);

  const current = snaps[idx];
  const latest = snaps[snaps.length - 1];

  const diffParts = useMemo(() => {
    if (!current || !latest || current.id === latest.id) return null;
    return diffWords(current.content, latest.content);
  }, [current, latest]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "note-timeline-summary",
        { body: { note_id: noteId } },
      );
      if (!error && data) setSummary((data as any).summary_md ?? null);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 shrink-0" />
          <h2 className="text-base font-semibold truncate">
            {current?.title ?? "Timeline"}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close timeline">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading history...
          </div>
        ) : snaps.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
            No history yet — save this note a few times to start tracking your growth.
          </div>
        ) : (
          <div className="h-full grid grid-rows-[auto_1fr] md:grid-rows-1 md:grid-cols-[1fr_1fr]">
            {/* This version */}
            <div className="border-b md:border-b-0 md:border-r border-border flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>This version · {format(new Date(current.snapshot_at), "MMM d, yyyy h:mm a")}</span>
                <span>{current.word_count} words</span>
              </div>
              <ScrollArea className="flex-1">
                <div
                  className="p-4 text-sm whitespace-pre-wrap"
                  style={{ fontFamily: '"Source Serif 4", serif' }}
                >
                  {current.content || <span className="text-muted-foreground italic">(empty)</span>}
                </div>
              </ScrollArea>
            </div>

            {/* Diff vs current */}
            <div className="flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground">
                {current?.id === latest?.id
                  ? "Latest version (no diff to show)"
                  : `Changes from this version → latest (${format(new Date(latest.snapshot_at), "MMM d, yyyy")})`}
              </div>
              <ScrollArea className="flex-1">
                <div
                  className="p-4 text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ fontFamily: '"Source Serif 4", serif' }}
                >
                  {!diffParts ? (
                    <span className="text-muted-foreground italic">No changes — this is the current version.</span>
                  ) : (
                    diffParts.map((p, i) => (
                      <span
                        key={i}
                        className={
                          p.added
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded px-0.5"
                            : p.removed
                            ? "bg-red-500/15 text-red-700 dark:text-red-300 line-through rounded px-0.5"
                            : ""
                        }
                      >
                        {p.value}
                      </span>
                    ))
                  )}
                </div>

                {/* AI growth summary */}
                <div className="border-t border-border mt-4 p-4">
                  {!summary && !summaryLoading && (
                    <Button
                      onClick={generateSummary}
                      variant="outline"
                      size="sm"
                      disabled={snaps.length < 2}
                      className="gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Show growth highlights
                    </Button>
                  )}
                  {summaryLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing your growth...
                    </div>
                  )}
                  {summary && (
                    <div
                      className="text-sm whitespace-pre-wrap"
                      style={{ fontFamily: '"Source Serif 4", serif' }}
                    >
                      {summary}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* Slider footer */}
      {snaps.length > 0 && (
        <div className="border-t border-border px-4 py-3 shrink-0 pb-24 md:pb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{format(new Date(snaps[0].snapshot_at), "MMM d")}</span>
            <span>
              Version {idx + 1} of {snaps.length}
            </span>
            <span>{format(new Date(snaps[snaps.length - 1].snapshot_at), "MMM d")}</span>
          </div>
          <Slider
            value={[idx]}
            min={0}
            max={Math.max(0, snaps.length - 1)}
            step={1}
            onValueChange={(v) => setIdx(v[0] ?? 0)}
            disabled={snaps.length < 2}
          />
        </div>
      )}
    </div>
  );
}
