import { useState, useEffect } from 'react';
import { Loader2, Brain, ShieldCheck, CheckCircle2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface ExamLoadingProgressProps {
  questionCount?: number;
  label?: string;
}

const stages = [
  { icon: Brain, label: 'Crafting unique questions', duration: 8000 },
  { icon: ShieldCheck, label: 'Validating accuracy', duration: 12000 },
  { icon: Star, label: 'Finalizing your exam', duration: 6000 },
];

const tips = [
  '💡 Every question is solved step-by-step by AI before delivery',
  '🔬 Questions are cross-verified for factual accuracy',
  '🎯 Difficulty adapts to your learning profile',
  '🧮 Math questions are double-checked with reverse operations',
  '📊 Each exam is uniquely generated — no two are alike',
  '✅ Wrong answers are validated to be plausible but incorrect',
];

export function ExamLoadingProgress({ questionCount, label }: ExamLoadingProgressProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Animate progress smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        // Slow down as we approach 95% (never reach 100 until done)
        if (prev >= 92) return Math.min(prev + 0.05, 95);
        if (prev >= 80) return prev + 0.15;
        if (prev >= 60) return prev + 0.3;
        return prev + 0.6;
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Stage progression
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let accumulated = 0;
    stages.forEach((stage, i) => {
      if (i === 0) return; // Start at stage 0
      accumulated += stages[i - 1].duration;
      timers.push(setTimeout(() => setCurrentStage(i), accumulated));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  // Tip rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % tips.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center pt-16 pb-20">
      <div className="text-center animate-fade-in max-w-sm w-full px-4">
        {/* Animated icon */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 animate-pulse" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary-foreground animate-spin" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold mb-1">
          {label || 'Generating Your Exam'}
        </h2>
        {questionCount && (
          <p className="text-xs text-muted-foreground mb-5">
            {questionCount} questions • AI-verified
          </p>
        )}

        {/* Progress bar */}
        <div className="mb-5">
          <Progress value={progress} className="h-2 mb-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(progress)}%</span>
            <span>{elapsedSeconds}s</span>
          </div>
        </div>

        {/* Stages */}
        <div className="glass-effect rounded-xl p-4 mb-4 space-y-2.5">
          {stages.map((stage, i) => {
            const StageIcon = stage.icon;
            const isActive = i === currentStage;
            const isDone = i < currentStage;

            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 text-xs transition-all duration-500",
                  isActive && "text-primary font-medium",
                  isDone && "text-emerald-500",
                  !isActive && !isDone && "text-muted-foreground/50"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all",
                  isActive && "bg-primary/20",
                  isDone && "bg-emerald-500/20",
                  !isActive && !isDone && "bg-secondary/50"
                )}>
                  {isDone ? (
                    <CheckCircle2 size={13} />
                  ) : isActive ? (
                    <StageIcon size={13} className="animate-pulse" />
                  ) : (
                    <StageIcon size={13} />
                  )}
                </div>
                <span>{stage.label}</span>
                {isActive && (
                  <Loader2 size={11} className="animate-spin ml-auto" />
                )}
              </div>
            );
          })}
        </div>

        {/* Rotating tip */}
        <div className="text-[11px] text-muted-foreground px-2 transition-all duration-500 min-h-[2rem] flex items-center justify-center">
          <span key={tipIndex} className="animate-fade-in">
            {tips[tipIndex]}
          </span>
        </div>
      </div>
    </div>
  );
}
