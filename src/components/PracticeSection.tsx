import { useState } from 'react';
import { BookOpen, GraduationCap, Zap, Brain, Target, ArrowRight, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Difficulty = 'beginner' | 'intermediate' | 'hard';
type PracticeType = 'examination' | 'sat';

interface PracticeSectionProps {
  type: PracticeType;
  onStartPractice: (difficulty: Difficulty, type: PracticeType) => void;
}

const difficultyConfig = {
  beginner: {
    icon: Zap,
    title: 'Beginner',
    description: 'Start with foundational concepts and build your confidence',
    color: 'from-emerald-500 to-teal-500',
    bgGlow: 'hsl(160 80% 50% / 0.15)',
    questions: '15 questions',
    time: '20 mins',
  },
  intermediate: {
    icon: Brain,
    title: 'Intermediate',
    description: 'Challenge yourself with more complex problems and scenarios',
    color: 'from-amber-500 to-orange-500',
    bgGlow: 'hsl(35 90% 55% / 0.15)',
    questions: '25 questions',
    time: '35 mins',
  },
  hard: {
    icon: Target,
    title: 'Advanced',
    description: 'Master difficult concepts with expert-level questions',
    color: 'from-rose-500 to-pink-500',
    bgGlow: 'hsl(350 85% 55% / 0.15)',
    questions: '30 questions',
    time: '45 mins',
  },
};

const typeConfig = {
  examination: {
    icon: BookOpen,
    title: 'Examination Practice',
    subtitle: 'Prepare for your exams with AI-powered practice sessions',
    gradient: 'from-primary to-accent',
  },
  sat: {
    icon: GraduationCap,
    title: 'SAT Preparation',
    subtitle: 'Master the SAT with targeted practice and expert guidance',
    gradient: 'from-violet-500 to-purple-600',
  },
};

export function PracticeSection({ type, onStartPractice }: PracticeSectionProps) {
  const [hoveredDifficulty, setHoveredDifficulty] = useState<Difficulty | null>(null);
  const config = typeConfig[type];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 glow-effect" 
               style={{ background: `linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)` }}>
            <config.icon className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold mb-3 gradient-text">{config.title}</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">{config.subtitle}</p>
        </div>

        {/* Difficulty Cards */}
        <div className="grid gap-6">
          {(Object.keys(difficultyConfig) as Difficulty[]).map((difficulty, index) => {
            const diffConfig = difficultyConfig[difficulty];
            const Icon = diffConfig.icon;
            const isHovered = hoveredDifficulty === difficulty;

            return (
              <div
                key={difficulty}
                className="difficulty-card group"
                style={{ 
                  animationDelay: `${index * 100}ms`,
                  '--hover-glow': diffConfig.bgGlow,
                } as React.CSSProperties}
                onMouseEnter={() => setHoveredDifficulty(difficulty)}
                onMouseLeave={() => setHoveredDifficulty(null)}
                onClick={() => onStartPractice(difficulty, type)}
              >
                <div className="flex items-center gap-6">
                  {/* Icon */}
                  <div 
                    className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300",
                      "bg-gradient-to-br",
                      diffConfig.color,
                      isHovered && "scale-110 shadow-lg"
                    )}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-foreground mb-1">{diffConfig.title}</h3>
                    <p className="text-muted-foreground text-sm mb-3">{diffConfig.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="px-2.5 py-1 rounded-full bg-secondary/50">{diffConfig.questions}</span>
                      <span className="px-2.5 py-1 rounded-full bg-secondary/50">{diffConfig.time}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                    "bg-secondary/50 group-hover:bg-primary group-hover:text-primary-foreground"
                  )}>
                    <ArrowRight className={cn(
                      "w-5 h-5 transition-transform duration-300",
                      isHovered && "translate-x-1"
                    )} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tips Section */}
        <div className="mt-12 glass-effect rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-1">AI-Powered Practice</h4>
              <p className="text-sm text-muted-foreground">
                Our AI adapts to your performance, providing personalized feedback and explanations for each question. 
                Track your progress and focus on areas that need improvement.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}