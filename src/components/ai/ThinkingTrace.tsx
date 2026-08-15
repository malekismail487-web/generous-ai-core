import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface ThinkingTraceProps {
  /** Reasoning text streamed from the model. */
  text: string;
  /** True while the model is still reasoning. */
  active: boolean;
  className?: string;
}

/**
 * The visible thinking panel used by the High and Maximum effort tiers.
 * While Lumina reasons it shows a live equaliser and the latest line of
 * thought; once the answer starts it collapses into a reviewable summary.
 */
export function ThinkingTrace({ text, active, className }: ThinkingTraceProps) {
  const { t } = useThemeLanguage();
  const [expanded, setExpanded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (active && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, active]);

  if (!text && !active) return null;

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const latest = lines[lines.length - 1] ?? '';

  return (
    <div
      className={cn(
        'onyx-surface overflow-hidden rounded-2xl border-foreground/10 animate-rise-in',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="relative flex items-center gap-[3px] h-4">
          {active ? (
            [0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-[3px] h-4 rounded-full bg-foreground/70 origin-center animate-think-pulse"
                style={{ animationDelay: `${i * 130}ms` }}
              />
            ))
          ) : (
            <Sparkles className="w-4 h-4 text-muted-foreground" />
          )}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block font-display text-sm font-semibold">
            {active
              ? t('Lumina is thinking…', '...لومينا تفكر')
              : t('Thought process', 'مسار التفكير')}
          </span>
          {!expanded && (
            <span className="block text-xs text-muted-foreground truncate">
              {active && latest ? latest : t(`Reasoned for ${seconds}s`, `فكرت لمدة ${seconds} ثانية`)}
            </span>
          )}
        </span>

        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-500',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <div
        ref={scrollRef}
        className={cn(
          'px-4 overflow-y-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          expanded ? 'max-h-64 pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0',
        )}
      >
        <div className="border-l border-foreground/10 pl-3 space-y-2">
          {lines.map((line, i) => (
            <p
              key={i}
              className="text-xs leading-relaxed text-muted-foreground"
              style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
