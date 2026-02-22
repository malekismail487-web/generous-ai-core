import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useFocusTimer } from '@/hooks/useFocusTimer';
import { Timer, Play, Pause, RotateCcw, Coffee, Brain, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

export function FocusTimer() {
  const { t } = useThemeLanguage();
  const {
    mode, timeLeft, isRunning, pomodoroCount, stats, preset, progress,
    switchMode, toggleTimer, resetTimer, TIMER_PRESETS,
  } = useFocusTimer();

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 mb-3 shadow-lg">
            <Timer className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold">{t('Focus Timer', 'مؤقت التركيز')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('Pomodoro technique: Focus, then rest', 'تقنية بومودورو: ركز، ثم ارتح')}
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-2 mb-8 justify-center">
          {(Object.keys(TIMER_PRESETS) as TimerMode[]).map((m) => {
            const p = TIMER_PRESETS[m];
            return (
              <button
                key={m}
                onClick={() => !isRunning && switchMode(m)}
                disabled={isRunning}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                  mode === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/40 disabled:opacity-50"
                )}
              >
                {m === 'focus' && <Brain className="w-3.5 h-3.5 inline mr-1" />}
                {m === 'shortBreak' && <Coffee className="w-3.5 h-3.5 inline mr-1" />}
                {m === 'longBreak' && <Coffee className="w-3.5 h-3.5 inline mr-1" />}
                {t(p.label, p.labelAr)}
              </button>
            );
          })}
        </div>

        {/* Timer Circle */}
        <div className="flex justify-center mb-8">
          <div className="relative w-64 h-64">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="6" className="text-border/30" />
              <circle
                cx="130" cy="130" r="120" fill="none" stroke="url(#timerGradient)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-linear"
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={mode === 'focus' ? '#ef4444' : mode === 'shortBreak' ? '#22c55e' : '#3b82f6'} />
                  <stop offset="100%" stopColor={mode === 'focus' ? '#f97316' : mode === 'shortBreak' ? '#10b981' : '#06b6d4'} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-mono font-bold tracking-tight">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
              <span className="text-sm text-muted-foreground mt-1 capitalize">
                {t(preset.label, preset.labelAr)}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button onClick={resetTimer} className="w-12 h-12 rounded-xl bg-card border border-border/50 flex items-center justify-center hover:bg-secondary/50 transition-all">
            <RotateCcw className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            onClick={toggleTimer}
            className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-95", `bg-gradient-to-br ${preset.color} text-white`)}
          >
            {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <div className="w-12 h-12 rounded-xl bg-card border border-border/50 flex items-center justify-center">
            <span className="text-sm font-bold">{pomodoroCount}</span>
          </div>
        </div>

        {/* Pomodoro dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={cn("w-3 h-3 rounded-full transition-all", (pomodoroCount % 4) >= i ? "bg-primary shadow-sm" : "bg-border/40")} />
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {t(`${4 - (pomodoroCount % 4)} to long break`, `${4 - (pomodoroCount % 4)} للاستراحة الطويلة`)}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-xl border border-border/50 p-4 text-center">
            <Zap className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-xl font-bold">{stats.todaySessions}</p>
            <p className="text-[11px] text-muted-foreground">{t('Today', 'اليوم')}</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-4 text-center">
            <Timer className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xl font-bold">{stats.totalFocusMinutes}</p>
            <p className="text-[11px] text-muted-foreground">{t('Total min', 'إجمالي دق')}</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-4 text-center">
            <Brain className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-xl font-bold">{stats.sessionsCompleted}</p>
            <p className="text-[11px] text-muted-foreground">{t('Sessions', 'جلسات')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
