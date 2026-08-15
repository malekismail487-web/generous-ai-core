import { useState } from 'react';
import { AI_EFFORT_ORDER, AI_EFFORT_TIERS, AiEffort } from '@/lib/aiEffort';
import { useAiEffort } from '@/hooks/useAiEffort';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { cn } from '@/lib/utils';
import { Gauge } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface EffortSelectorProps {
  /** Surface id — omit to edit the global default. */
  surface?: string;
  /** `compact` renders a single pill that opens a popover; `panel` renders inline. */
  variant?: 'compact' | 'panel';
  className?: string;
}

function Bars({ count, active }: { count: number; active: boolean }) {
  return (
    <span className="flex items-end gap-[2px] h-3">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-full transition-all duration-500',
            i <= count ? (active ? 'bg-primary-foreground' : 'bg-foreground') : 'bg-foreground/20',
          )}
          style={{ height: `${25 * i}%` }}
        />
      ))}
    </span>
  );
}

function TierList({ surface }: { surface?: string }) {
  const { effort, setEffort } = useAiEffort(surface);
  const { t, language } = useThemeLanguage();
  const ar = language === 'ar';

  return (
    <div className="flex flex-col gap-1.5">
      {AI_EFFORT_ORDER.map((id: AiEffort, idx) => {
        const tier = AI_EFFORT_TIERS[id];
        const isActive = effort === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setEffort(id)}
            className={cn(
              'group relative flex items-start gap-3 rounded-2xl px-3.5 py-3 text-left overflow-hidden',
              'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border',
              'opacity-0 animate-tile-in',
              isActive
                ? 'bg-primary text-primary-foreground border-transparent shadow-[var(--shadow-card)]'
                : 'bg-card/60 border-border/50 hover:border-foreground/25 hover:-translate-y-0.5',
            )}
            style={{ animationDelay: `${idx * 55}ms` }}
          >
            <span
              className={cn(
                'pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 opacity-0 transition-opacity duration-300',
                'bg-gradient-to-r from-transparent via-foreground/10 to-transparent',
                !isActive && 'group-hover:opacity-100 group-hover:animate-sheen',
              )}
            />
            <span className="mt-0.5">
              <Bars count={tier.bars} active={isActive} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-display font-semibold text-sm">
                  {t(tier.label, tier.labelAr)}
                </span>
                {id === 'medium' && (
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-[0.14em] rounded-full px-1.5 py-0.5 border',
                      isActive ? 'border-primary-foreground/40' : 'border-border text-muted-foreground',
                    )}
                  >
                    {t('Default', 'افتراضي')}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'block text-xs mt-0.5 leading-snug',
                  isActive ? 'text-primary-foreground/75' : 'text-muted-foreground',
                )}
              >
                {ar ? tier.blurbAr : tier.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EffortSelector({ surface, variant = 'compact', className }: EffortSelectorProps) {
  const { spec, isOverridden } = useAiEffort(surface);
  const { t, language } = useThemeLanguage();
  const [open, setOpen] = useState(false);

  if (variant === 'panel') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm">
            {t('How hard should Lumina think?', 'ما مقدار تفكير لومينا؟')}
          </h3>
        </div>
        <TierList surface={surface} />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 backdrop-blur-xl',
            'px-3 py-1.5 text-xs font-medium transition-all duration-300',
            'hover:border-foreground/25 hover:-translate-y-px active:scale-[0.97]',
            className,
          )}
        >
          <Bars count={spec.bars} active={false} />
          <span className="font-display">{t(spec.label, spec.labelAr)}</span>
          {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-foreground/50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-2.5 rounded-3xl">
        <p className="px-1.5 pb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {language === 'ar' ? 'مستوى التفكير' : 'Thinking level'}
        </p>
        <TierList surface={surface} />
      </PopoverContent>
    </Popover>
  );
}
