import { useState, useEffect, useRef, useCallback } from 'react';
import { Moon, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

const INACTIVITY_TIMEOUT = 30_000; // 30 seconds

/**
 * Generates a calm ambient drone using the Web Audio API.
 * Returns a cleanup function that stops everything.
 */
function startAmbientMusic(audioCtxRef: React.MutableRefObject<AudioContext | null>): () => void {
  const ctx = new AudioContext();
  audioCtxRef.current = ctx;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 2);
  masterGain.connect(ctx.destination);

  // Pad layer 1 — deep warm tone
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(174.61, ctx.currentTime); // F3
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.4, ctx.currentTime);
  osc1.connect(g1).connect(masterGain);
  osc1.start();

  // Pad layer 2 — gentle fifth
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(261.63, ctx.currentTime); // C4
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.25, ctx.currentTime);
  osc2.connect(g2).connect(masterGain);
  osc2.start();

  // Pad layer 3 — shimmery high
  const osc3 = ctx.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0.08, ctx.currentTime);
  osc3.connect(g3).connect(masterGain);
  osc3.start();

  // Subtle LFO to modulate pitch gently
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.1, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(2, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);
  lfo.start();

  return () => {
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
    setTimeout(() => {
      [osc1, osc2, osc3, lfo].forEach(o => { try { o.stop(); } catch {} });
      ctx.close();
      audioCtxRef.current = null;
    }, 1100);
  };
}

export function InactivityOverlay() {
  const [isInactive, setIsInactive] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);
  const { t } = useThemeLanguage();

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // If currently inactive, dismiss overlay
    if (isInactive) return;

    timerRef.current = setTimeout(() => {
      setIsInactive(true);
    }, INACTIVITY_TIMEOUT);
  }, [isInactive]);

  // Set up activity listeners
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  // When inactive state triggers, show overlay and start music
  useEffect(() => {
    if (isInactive) {
      // Small delay for the CSS transition to work
      requestAnimationFrame(() => setVisible(true));
      stopMusicRef.current = startAmbientMusic(audioCtxRef);
    }
  }, [isInactive]);

  const handleBackToApp = useCallback(() => {
    setVisible(false);
    // Stop music
    if (stopMusicRef.current) {
      stopMusicRef.current();
      stopMusicRef.current = null;
    }
    // Wait for fade-out before removing
    setTimeout(() => {
      setIsInactive(false);
      // Restart the inactivity timer
    }, 500);
  }, []);

  if (!isInactive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-all duration-700 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: 'radial-gradient(ellipse at center, hsl(var(--background)) 0%, hsl(var(--background) / 0.98) 50%, hsl(var(--background)) 100%)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/5 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full bg-accent/5 animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 w-32 h-32 rounded-full bg-primary/3 animate-pulse" style={{ animationDuration: '5s' }} />
      </div>

      {/* Content */}
      <div
        className={`flex flex-col items-center text-center px-8 transition-all duration-1000 delay-300 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-8">
          <Moon className="w-9 h-9 text-primary" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-3 max-w-sm leading-relaxed">
          {t(
            'You have not been active for a while',
            'لم تكن نشطاً منذ فترة'
          )}
        </h2>
        <p className="text-muted-foreground text-sm mb-8">
          {t('Back to app?', 'العودة إلى التطبيق؟')}
        </p>

        <Button
          onClick={handleBackToApp}
          size="lg"
          className="rounded-2xl px-8 gap-2 text-base shadow-lg shadow-primary/20"
        >
          {t('Back to App', 'العودة للتطبيق')}
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
