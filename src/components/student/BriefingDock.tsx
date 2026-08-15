import { useState } from 'react';
import { X, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { MorningBriefing } from '@/components/student/MorningBriefing';
import { MorningBriefingCard } from '@/components/student/MorningBriefingCard';

/**
 * A single quiet bar instead of two blocking cards.
 * The briefing only ever takes one line until the student chooses to open it.
 */
export function BriefingDock({ onNavigate }: { onNavigate: (action: string & {}) => void }) {
  const { t } = useThemeLanguage();
  const [open, setOpen] = useState(false);
  const [briefCount, setBriefCount] = useState(0);
  const [quizCount, setQuizCount] = useState(0);

  const total = briefCount + quizCount;

  return (
    <>
      {/* Hidden mount — the briefings load in the background and report their size */}
      <div className={open ? 'contents' : 'hidden'}>
        {open && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <button
              aria-label="Close briefing"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in"
            />
            <div className="relative z-10 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-2xl backdrop-blur-2xl py-4 animate-[slideUpFade_0.35s_cubic-bezier(0.16,1,0.3,1)_forwards]">
              <div className="flex items-center gap-2 px-5 pb-2">
                <Moon size={15} className="text-muted-foreground" />
                <span className="font-display text-sm font-bold tracking-tight">
                  {t('Daily briefing', 'الملخص اليومي')}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <MorningBriefing onNavigate={onNavigate} onCount={setBriefCount} />
              <MorningBriefingCard onCount={setQuizCount} />
            </div>
          </div>
        )}
      </div>
      {!open && (
        <div className="hidden">
          <MorningBriefing onNavigate={onNavigate} onCount={setBriefCount} />
          <MorningBriefingCard onCount={setQuizCount} />
        </div>
      )}

      {total > 0 && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'group mx-3 mb-4 w-[calc(100%-1.5rem)] flex items-center gap-3 rounded-2xl',
            'border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-left',
            'transition-colors duration-300 hover:border-foreground/25 hover:bg-foreground/[0.06]',
          )}
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-background">
            <Moon size={13} className="text-muted-foreground" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
              {total}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              {t('Briefing', 'الملخص')}
            </span>
            <span className="block truncate text-xs text-foreground/90">
              {t('Lumina left you something this morning', 'تركت لك لومينا شيئاً هذا الصباح')}
            </span>
          </span>
          <span className="relative h-px w-8 overflow-hidden bg-border/60">
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/60 to-transparent animate-sheen" />
          </span>
        </button>
      )}
    </>
  );
}
