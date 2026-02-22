import { useFocusTimer } from '@/hooks/useFocusTimer';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Play, Pause, X, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingTimerProps {
  onNavigate: () => void;
}

export function FloatingTimer({ onNavigate }: FloatingTimerProps) {
  const { mode, timeLeft, isRunning, preset, toggleTimer, stopAndClear, TIMER_PRESETS } = useFocusTimer();
  const { t } = useThemeLanguage();

  // Only show if timer has been started (time differs from default OR is running)
  const defaultTime = TIMER_PRESETS[mode].minutes * 60;
  const hasStarted = isRunning || timeLeft < defaultTime;

  if (!hasStarted) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] animate-in slide-in-from-top duration-300"
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5 text-white cursor-pointer",
          mode === 'focus'
            ? "bg-gradient-to-r from-red-500 to-orange-500"
            : mode === 'shortBreak'
            ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-blue-500 to-cyan-500"
        )}
        onClick={onNavigate}
      >
        <div className="flex items-center gap-2.5">
          <Timer className="w-4 h-4" />
          <span className="text-sm font-semibold">
            {t(preset.label, preset.labelAr)}
          </span>
          <span className="text-sm font-mono font-bold tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={toggleTimer}
            className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <button
            onClick={stopAndClear}
            className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
