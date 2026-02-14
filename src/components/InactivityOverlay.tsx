import { useState, useEffect, useRef, useCallback } from 'react';
import { Moon, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

const INACTIVITY_TIMEOUT = 30_000; // 30 seconds
const MUSIC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ambient-music`;

// Cache the audio blob so we only generate once per session
let cachedAudioUrl: string | null = null;
let fetchingMusic = false;
const fetchQueue: Array<(url: string) => void> = [];

async function getAmbientMusicUrl(): Promise<string> {
  if (cachedAudioUrl) return cachedAudioUrl;

  if (fetchingMusic) {
    return new Promise<string>((resolve) => fetchQueue.push(resolve));
  }

  fetchingMusic = true;
  try {
    const response = await fetch(MUSIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) throw new Error("Failed to generate music");

    const blob = await response.blob();
    cachedAudioUrl = URL.createObjectURL(blob);
    fetchQueue.forEach(cb => cb(cachedAudioUrl!));
    fetchQueue.length = 0;
    return cachedAudioUrl;
  } finally {
    fetchingMusic = false;
  }
}

export function InactivityOverlay() {
  const [isInactive, setIsInactive] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { t } = useThemeLanguage();

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
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

  // When inactive, show overlay and play music
  useEffect(() => {
    if (!isInactive) return;

    requestAnimationFrame(() => setVisible(true));

    // Start music
    getAmbientMusicUrl()
      .then((url) => {
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = 0;
        audioRef.current = audio;
        audio.play().catch(() => {});
        // Fade in volume
        let vol = 0;
        const fadeIn = setInterval(() => {
          vol = Math.min(vol + 0.01, 0.4);
          audio.volume = vol;
          if (vol >= 0.4) clearInterval(fadeIn);
        }, 50);
      })
      .catch(() => {
        // Silently fail — overlay still works without music
      });
  }, [isInactive]);

  const handleBackToApp = useCallback(() => {
    setVisible(false);

    // Fade out music
    const audio = audioRef.current;
    if (audio) {
      let vol = audio.volume;
      const fadeOut = setInterval(() => {
        vol = Math.max(vol - 0.02, 0);
        audio.volume = vol;
        if (vol <= 0) {
          clearInterval(fadeOut);
          audio.pause();
          audioRef.current = null;
        }
      }, 30);
    }

    setTimeout(() => {
      setIsInactive(false);
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
