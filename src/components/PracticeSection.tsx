import { useState } from 'react';
import { BookOpen, GraduationCap, Zap, Brain, Target, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Difficulty = 'beginner' | 'intermediate' | 'hard';
type PracticeType = 'examination' | 'sat';

interface PracticeSectionProps {
  type: PracticeType;
  onStartPractice: (difficulty: Difficulty, type: PracticeType) => void;
  hasLearningHistory: boolean;
}

const difficultyConfig = {
  beginner: {
    icon: Zap,
    title: 'Beginner',
    description: 'Start with foundational concepts from your learning',
    color: 'from-emerald-500 to-teal-500',
    bgGlow: 'hsl(160 80% 50% / 0.15)',
    questions: '5 questions',
    time: '10 mins',
  },
  intermediate: {
    icon: Brain,
    title: 'Intermediate',
    description: 'Challenge yourself with moderate complexity',
    color: 'from-amber-500 to-orange-500',
    bgGlow: 'hsl(35 90% 55% / 0.15)',
    questions: '7 questions',
    time: '15 mins',
  },
  hard: {
    icon: Target,
    title: 'Advanced',
    description: 'Master difficult concepts with expert-level questions',
    color: 'from-rose-500 to-pink-500',
    bgGlow: 'hsl(350 85% 55% / 0.15)',
    questions: '10 questions',
    time: '20 mins',
  },
};

const typeConfig = {
  examination: {
    icon: BookOpen,
    title: 'Exam Practice',
    subtitle: 'Test yourself on topics from your conversations',
    gradient: 'from-primary to-accent',
  },
  sat: {
    icon: GraduationCap,
    title: 'SAT Practice',
    subtitle: 'SAT-style questions based on your learning',
    gradient: 'from-violet-500 to-purple-600',
  },
};

export function PracticeSection({ type, onStartPractice, hasLearningHistory }: PracticeSectionProps) {
  const [hoveredDifficulty, setHoveredDifficulty] = useState<Difficulty | null>(null);
  const config = typeConfig[type];

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 glow-effect" 
               style={{ background: `linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)` }}>
            <config.icon className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-2 gradient-text">{config.title}</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">{config.subtitle}</p>
        </div>

        {/* No history warning */}
        {!hasLearningHistory && (
          <div className="glass-effect rounded-2xl p-4 mb-6 animate-fade-in flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="font-medium text-foreground text-sm">Start learning first</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chat with the AI about topics you want to learn. Your practice questions will be based on those conversations.
              </p>
            </div>
          </div>
        )}

        {/* Difficulty Cards */}
        <div className="grid gap-4">
          {(Object.keys(difficultyConfig) as Difficulty[]).map((difficulty, index) => {
            const diffConfig = difficultyConfig[difficulty];
            const Icon = diffConfig.icon;
            const isHovered = hoveredDifficulty === difficulty;
            const isDisabled = !hasLearningHistory;

            return (
              <div
                key={difficulty}
                className={cn(
                  "difficulty-card group",
                  isDisabled && "opacity-50 cursor-not-allowed"
                )}
                style={{ 
                  animationDelay: `${index * 100}ms`,
                } as React.CSSProperties}
                onMouseEnter={() => !isDisabled && setHoveredDifficulty(difficulty)}
                onMouseLeave={() => setHoveredDifficulty(null)}
                onClick={() => !isDisabled && onStartPractice(difficulty, type)}
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div 
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                      "bg-gradient-to-br",
                      diffConfig.color,
                      isHovered && "scale-110"
                    )}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">{diffConfig.title}</h3>
                    <p className="text-muted-foreground text-xs mt-0.5">{diffConfig.description}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="px-2 py-0.5 rounded-full bg-secondary/50">{diffConfig.questions}</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary/50">{diffConfig.time}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                    "bg-secondary/50 group-hover:bg-primary group-hover:text-primary-foreground"
                  )}>
                    <ArrowRight className={cn(
                      "w-4 h-4 transition-transform duration-300",
                      isHovered && "translate-x-0.5"
                    )} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tips */}
        <div className="mt-8 glass-effect rounded-2xl p-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-foreground text-sm">Personalized Practice</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Questions are generated based on topics you've discussed with the AI, helping you reinforce what you've learned.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}