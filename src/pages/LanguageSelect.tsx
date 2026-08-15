import { useState } from 'react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { LuminaLogo } from '@/components/LuminaLogo';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Manifesto } from '@/components/brand/Manifesto';

const OPTIONS = [
  {
    id: 'en' as const,
    name: 'English',
    native: 'English',
    caption: 'Continue in English',
    glyph: 'Aa',
  },
  {
    id: 'ar' as const,
    name: 'Arabic',
    native: 'العربية',
    caption: 'المتابعة بالعربية',
    glyph: 'أب',
  },
];

export default function LanguageSelect() {
  const { setLanguage } = useThemeLanguage();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<'en' | 'ar' | null>(null);

  const handleSelect = (lang: 'en' | 'ar') => {
    setLeaving(lang);
    setLanguage(lang);
    localStorage.setItem('language-selected', 'true');
    sessionStorage.setItem('language-selected-tab', 'true');
    window.setTimeout(() => navigate('/country'), 380);
  };

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center p-6">
      {/* Aurora depth field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/3 left-1/4 w-[70vw] h-[70vw] rounded-full blur-[120px] animate-aurora-drift"
          style={{ background: 'radial-gradient(circle, hsl(var(--ink) / 0.035), transparent 60%)' }}
        />
        <div
          className="absolute -bottom-1/3 right-1/4 w-[60vw] h-[60vw] rounded-full blur-[120px] animate-aurora-drift"
          style={{
            background: 'radial-gradient(circle, hsl(var(--ink) / 0.025), transparent 60%)',
            animationDelay: '-8s',
          }}
        />
      </div>
      <div className="grain-overlay" />

      <div
        className={cn(
          'relative z-10 w-full max-w-3xl scene-3d transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          leaving && 'opacity-0 -translate-y-4 blur-sm',
        )}
      >

        <div className="flex flex-col items-center mb-12 animate-rise-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-40 nucleus-pulse" />
            <LuminaLogo size={72} />
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tighter">Lumina</h1>
          <p className="mt-3 text-xs uppercase tracking-[0.34em] text-muted-foreground">
            Choose your language · اختر لغتك
          </p>
        </div>

        <div className="stagger space-y-3 max-w-md mx-auto">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className={cn(
                'group relative w-full onyx-surface onyx-edge depth-press layer-3d overflow-hidden',
                'flex items-center gap-5 px-5 py-5 text-left',
                opt.id === 'ar' && 'flex-row-reverse text-right',
              )}
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-foreground/10 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

              <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/60 border border-border/50 font-display text-xl font-bold transition-transform duration-500 group-hover:scale-110">
                {opt.glyph}
              </span>

              <span className="flex-1 min-w-0">
                <span className="block font-display text-xl font-bold">{opt.native}</span>
                <span className="block text-sm text-muted-foreground">{opt.caption}</span>
              </span>

              <ArrowRight
                className={cn(
                  'w-5 h-5 text-muted-foreground transition-all duration-500',
                  opt.id === 'ar'
                    ? 'rotate-180 group-hover:-translate-x-1'
                    : 'group-hover:translate-x-1',
                  'group-hover:text-foreground',
                )}
              />
            </button>
          ))}
        </div>

        <Manifesto className="mt-14 animate-rise-in" />

      </div>
    </div>
  );
}
