/**
 * HelpfulnessFeedback — Phase 4
 *
 * Compact thumbs-up / thumbs-down + reason chips that any AI output can
 * mount underneath itself. One-shot per mount: once the student picks a
 * signal, the controls collapse into a small "Thanks" confirmation so we
 * never nag.
 *
 * The component is presentation-only — all logging happens via
 * `recordHelpfulness()` from `@/lib/helpfulnessSignal`. Failures are
 * swallowed by that recorder; this UI never blocks the host page.
 */

import { useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  recordHelpfulness,
  type HelpfulnessSignal,
} from "@/lib/helpfulnessSignal";

interface Props {
  feature: string;
  subject?: string;
  topic?: string;
  output: string;
  profileSnapshot?: Record<string, unknown>;
  className?: string;
  /** Called after a signal is successfully recorded. */
  onRecorded?: (signal: HelpfulnessSignal) => void;
}

const NEGATIVE_REASONS: Array<{ id: HelpfulnessSignal; label: string }> = [
  { id: "too_easy", label: "Too easy" },
  { id: "too_hard", label: "Too hard" },
  { id: "confusing", label: "Confusing" },
  { id: "off_topic", label: "Off-topic" },
];

export function HelpfulnessFeedback({
  feature,
  subject,
  topic,
  output,
  profileSnapshot,
  className,
  onRecorded,
}: Props) {
  const [stage, setStage] = useState<"idle" | "picking_reason" | "done">("idle");
  const [picked, setPicked] = useState<HelpfulnessSignal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = useCallback(
    async (signal: HelpfulnessSignal, reason?: string) => {
      if (submitting || stage === "done") return;
      setSubmitting(true);
      try {
        await recordHelpfulness({
          feature,
          subject,
          topic,
          output,
          signal,
          reason,
          profileSnapshot,
        });
        setPicked(signal);
        setStage("done");
        onRecorded?.(signal);
      } finally {
        setSubmitting(false);
      }
    },
    [feature, subject, topic, output, profileSnapshot, onRecorded, submitting, stage],
  );

  if (stage === "done") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground py-2",
          className,
        )}
        role="status"
      >
        <Check className="w-3.5 h-3.5" />
        <span>
          Thanks — Lumi will adapt
          {picked === "up" || picked === "perfect" ? " (more like this)" : " (try a different approach)"}.
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-2 border-t border-border/50",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground mr-1">
        Was this helpful?
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={submitting}
        onClick={() => send("up")}
        aria-label="Helpful"
      >
        <ThumbsUp className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Yes</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={submitting}
        onClick={() => setStage("picking_reason")}
        aria-label="Not helpful"
      >
        <ThumbsDown className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">No</span>
      </Button>

      {stage === "picking_reason" && (
        <div className="w-full flex flex-wrap gap-1.5 pt-1">
          {NEGATIVE_REASONS.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={submitting}
              onClick={() => send(r.id, r.label)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
