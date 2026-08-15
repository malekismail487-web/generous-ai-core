import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * WordCycle — a single word that dissolves into the next.
 * Used to say many things in one line without shouting.
 */
export function WordCycle({
  words,
  className,
  interval = 2600,
}: {
  words: string[];
  className?: string;
  interval?: number;
}) {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (words.length < 2) return;
    const t = window.setInterval(() => {
      setOut(true);
      window.setTimeout(() => {
        setI((prev) => (prev + 1) % words.length);
        setOut(false);
      }, 320);
    }, interval);
    return () => window.clearInterval(t);
  }, [words, interval]);

  return (
    <span
      className={cn(
        'inline-block transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        out ? 'opacity-0 -translate-y-1 blur-[2px]' : 'opacity-100 translate-y-0 blur-0',
        className,
      )}
    >
      {words[i]}
    </span>
  );
}

const PILLARS = [
  {
    k: '01',
    title: 'It watches how you think',
    body:
      'Every question, hesitation and second attempt feeds a live model of your understanding — not a score, a picture.',
  },
  {
    k: '02',
    title: 'It teaches to that picture',
    body:
      'Explanations reshape themselves around your pace, your gaps and the way your mind prefers to receive an idea.',
  },
  {
    k: '03',
    title: 'It stays inside your school',
    body:
      'Your work, your class and your country are sealed off from everyone else. Isolation is the architecture, not a setting.',
  },
];

/**
 * Manifesto — the narrative surface of Lumina.
 * Pure presentation: a hairline rule, three pillars, one closing line.
 */
export function Manifesto({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <section className={cn('relative w-full', className)} aria-label="About Lumina">
      {/* Hairline with a travelling glint */}
      <div className="relative h-px w-full overflow-hidden bg-border/60">
        <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-foreground/50 to-transparent animate-sheen" />
      </div>

      <p className="mt-6 text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
        A learning engine, not an app
      </p>

      <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold leading-[1.15] tracking-tight">
        Lumina learns you while you{' '}
        <WordCycle
          words={['learn.', 'struggle.', 'revise.', 'return.', 'master it.']}
          className="text-muted-foreground"
        />
      </h2>

      {!compact && (
        <div className="stagger mt-8 grid gap-3 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <article
              key={p.k}
              className="group relative overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-foreground/20 hover:bg-foreground/[0.045]"
            >
              <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
                {p.k}
              </span>
              <h3 className="mt-3 font-display text-sm font-semibold leading-snug">{p.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
            </article>
          ))}
        </div>
      )}

      <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">
        Ask in your own words. Upload the page you are stuck on. Sit an exam, build a mind map,
        rehearse with flashcards or hand the whole chapter over and let Lumina turn it into a
        lecture. Everything you do here is remembered, weighted and used to make the next
        explanation better than the last.
      </p>
    </section>
  );
}
