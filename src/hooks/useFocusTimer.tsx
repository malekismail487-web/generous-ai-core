import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

const TIMER_PRESETS: Record<TimerMode, { minutes: number; label: string; labelAr: string; color: string }> = {
  focus: { minutes: 25, label: 'Focus', labelAr: 'تركيز', color: 'from-red-500 to-orange-500' },
  shortBreak: { minutes: 5, label: 'Short Break', labelAr: 'استراحة قصيرة', color: 'from-green-500 to-emerald-500' },
  longBreak: { minutes: 15, label: 'Long Break', labelAr: 'استراحة طويلة', color: 'from-blue-500 to-cyan-500' },
};

const STATS_KEY = 'focus-timer-stats';

interface TimerStats {
  totalFocusMinutes: number;
  sessionsCompleted: number;
  todaySessions: number;
  todayDate: string;
}

function loadStats(): TimerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const stats: TimerStats = JSON.parse(raw);
      const today = new Date().toDateString();
      if (stats.todayDate !== today) {
        stats.todaySessions = 0;
        stats.todayDate = today;
      }
      return stats;
    }
  } catch {}
  return { totalFocusMinutes: 0, sessionsCompleted: 0, todaySessions: 0, todayDate: new Date().toDateString() };
}

function saveStats(stats: TimerStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

interface FocusTimerContextType {
  mode: TimerMode;
  timeLeft: number;
  isRunning: boolean;
  pomodoroCount: number;
  stats: TimerStats;
  preset: typeof TIMER_PRESETS[TimerMode];
  progress: number;
  switchMode: (mode: TimerMode) => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  stopAndClear: () => void;
  TIMER_PRESETS: typeof TIMER_PRESETS;
}

const FocusTimerContext = createContext<FocusTimerContextType | null>(null);

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(TIMER_PRESETS.focus.minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [stats, setStats] = useState<TimerStats>(loadStats);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playAlarm = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        osc2.connect(gain);
        osc2.frequency.value = 1000;
        osc2.start();
        osc2.stop(ctx.currentTime + 0.5);
      }, 600);
    } catch {}
  }, []);

  const switchMode = useCallback((newMode: TimerMode) => {
    setMode(newMode);
    setTimeLeft(TIMER_PRESETS[newMode].minutes * 60);
    setIsRunning(false);
  }, []);

  const handleSessionComplete = useCallback(() => {
    if (mode === 'focus') {
      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);

      const newStats: TimerStats = {
        ...stats,
        totalFocusMinutes: stats.totalFocusMinutes + TIMER_PRESETS.focus.minutes,
        sessionsCompleted: stats.sessionsCompleted + 1,
        todaySessions: stats.todaySessions + 1,
        todayDate: new Date().toDateString(),
      };
      setStats(newStats);
      saveStats(newStats);

      toast.success('🎉 Focus session complete! Great work!');

      if (newCount % 4 === 0) {
        switchMode('longBreak');
      } else {
        switchMode('shortBreak');
      }
    } else {
      toast.success('Break over! Ready for another focus session?');
      switchMode('focus');
    }
  }, [mode, pomodoroCount, stats, switchMode]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      playAlarm();
      handleSessionComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft, playAlarm, handleSessionComplete]);

  const toggleTimer = () => setIsRunning(prev => !prev);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(TIMER_PRESETS[mode].minutes * 60);
  };

  const stopAndClear = () => {
    setIsRunning(false);
    setMode('focus');
    setTimeLeft(TIMER_PRESETS.focus.minutes * 60);
  };

  const progress = 1 - timeLeft / (TIMER_PRESETS[mode].minutes * 60);
  const preset = TIMER_PRESETS[mode];

  return (
    <FocusTimerContext.Provider value={{
      mode, timeLeft, isRunning, pomodoroCount, stats, preset, progress,
      switchMode, toggleTimer, resetTimer, stopAndClear, TIMER_PRESETS,
    }}>
      {children}
    </FocusTimerContext.Provider>
  );
}

export function useFocusTimer() {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) throw new Error('useFocusTimer must be used within FocusTimerProvider');
  return ctx;
}
