import { useState, useEffect } from 'react';
import { useStudentGoals, StudentGoal } from '@/hooks/useStudentGoals';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Target, Trash2, CheckCircle2, Circle, Loader2, Trophy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const GOAL_TEMPLATES = [
  { titleEn: 'Complete {n} exams', titleAr: 'أكمل {n} اختبارات', type: 'exams', min: 1, max: 5 },
  { titleEn: 'Listen to {n} podcasts', titleAr: 'استمع إلى {n} بودكاست', type: 'podcasts', min: 2, max: 8 },
  { titleEn: 'Review {n} flashcard sets', titleAr: 'راجع {n} مجموعات بطاقات', type: 'flashcards', min: 3, max: 15 },
  { titleEn: 'Complete {n} quizzes', titleAr: 'أكمل {n} اختبارات قصيرة', type: 'quizzes', min: 2, max: 10 },
  { titleEn: 'Write {n} notes', titleAr: 'اكتب {n} ملاحظات', type: 'notes', min: 1, max: 5 },
  { titleEn: 'Study {n} subjects', titleAr: 'ادرس {n} مواد', type: 'subjects', min: 1, max: 4 },
  { titleEn: 'Use AI Tutor {n} times', titleAr: 'استخدم المعلم الذكي {n} مرات', type: 'tutor', min: 2, max: 8 },
  { titleEn: 'Complete {n} assignments', titleAr: 'أكمل {n} واجبات', type: 'assignments', min: 1, max: 5 },
  { titleEn: 'Focus for {n} Pomodoro sessions', titleAr: 'ركّز لمدة {n} جلسات بومودورو', type: 'focus', min: 2, max: 8 },
  { titleEn: 'Read {n} study materials', titleAr: 'اقرأ {n} مواد دراسية', type: 'materials', min: 2, max: 10 },
];

function generateRandomGoals(language: string): { title: string; target: number; type: string }[] {
  const shuffled = [...GOAL_TEMPLATES].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  
  return picked.map(template => {
    const n = Math.floor(Math.random() * (template.max - template.min + 1)) + template.min;
    const title = language === 'ar'
      ? template.titleAr.replace('{n}', String(n))
      : template.titleEn.replace('{n}', String(n));
    return { title, target: n, type: template.type };
  });
}

export function GoalTracker() {
  const { goals, loading, addGoal, incrementGoal, deleteGoal, completedCount, totalCount, overallProgress } = useStudentGoals();
  const { t, language } = useThemeLanguage();
  const [suggestedGoals, setSuggestedGoals] = useState<{ title: string; target: number; type: string }[]>([]);

  useEffect(() => {
    if (!loading && goals.length === 0) {
      setSuggestedGoals(generateRandomGoals(language));
    }
  }, [loading, goals.length, language]);

  const handleAddSuggested = async (goal: { title: string; target: number; type: string }) => {
    await addGoal(goal.title, goal.target, goal.type);
    setSuggestedGoals(prev => prev.filter(g => g.type !== goal.type));
  };

  const handleAddAll = async () => {
    for (const goal of suggestedGoals) {
      await addGoal(goal.title, goal.target, goal.type);
    }
    setSuggestedGoals([]);
  };

  const refreshSuggestions = () => {
    setSuggestedGoals(generateRandomGoals(language));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Weekly Overview */}
        <div className="glass-effect rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{t('Weekly Goals', 'أهداف الأسبوع')}</h2>
              <p className="text-sm text-muted-foreground">
                {completedCount} / {totalCount} {t('completed', 'مكتمل')}
              </p>
            </div>
            <div className="text-2xl font-bold text-primary">{overallProgress}%</div>
          </div>
          <Progress value={overallProgress} className="h-3" />
        </div>

        {/* Goals List */}
        {goals.length > 0 && (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onIncrement={() => incrementGoal(goal.id)}
                onDelete={() => deleteGoal(goal.id)}
              />
            ))}
          </div>
        )}

        {/* Suggested Goals - show when no goals exist */}
        {goals.length === 0 && suggestedGoals.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {t('Suggested goals for this week:', 'أهداف مقترحة لهذا الأسبوع:')}
              </p>
              <Button variant="ghost" size="sm" onClick={refreshSuggestions} className="gap-1.5">
                <RefreshCw size={14} />
                {t('Shuffle', 'تبديل')}
              </Button>
            </div>

            <div className="space-y-2">
              {suggestedGoals.map((goal, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAddSuggested(goal)}
                  className="w-full glass-effect rounded-xl p-4 text-left hover:border-primary/40 transition-all flex items-center gap-3 border border-border/50"
                >
                  <Target size={18} className="text-primary shrink-0" />
                  <span className="text-sm font-medium flex-1">{goal.title}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                    {t('+ Add', '+ إضافة')}
                  </span>
                </button>
              ))}
            </div>

            <Button onClick={handleAddAll} className="w-full gap-2">
              <Target size={16} />
              {t('Add All 3 Goals', 'إضافة كل الأهداف الثلاثة')}
            </Button>
          </div>
        )}

        {/* Show new suggestions when goals exist */}
        {goals.length > 0 && goals.length < 5 && (
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed"
            onClick={() => {
              const newGoals = generateRandomGoals(language);
              const existingTypes = goals.map(g => g.goal_type);
              const filtered = newGoals.filter(g => !existingTypes.includes(g.type));
              if (filtered.length > 0) {
                setSuggestedGoals(filtered.slice(0, 1));
              }
            }}
          >
            <RefreshCw size={14} />
            {t('Suggest Another Goal', 'اقترح هدفًا آخر')}
          </Button>
        )}

        {suggestedGoals.length > 0 && goals.length > 0 && (
          <div className="space-y-2">
            {suggestedGoals.map((goal, idx) => (
              <button
                key={idx}
                onClick={() => handleAddSuggested(goal)}
                className="w-full glass-effect rounded-xl p-4 text-left hover:border-primary/40 transition-all flex items-center gap-3 border border-border/50"
              >
                <Target size={18} className="text-primary shrink-0" />
                <span className="text-sm font-medium flex-1">{goal.title}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                  {t('+ Add', '+ إضافة')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalCard({ goal, onIncrement, onDelete }: { goal: StudentGoal; onIncrement: () => void; onDelete: () => void }) {
  const progress = goal.target_count > 0 ? Math.round((goal.current_count / goal.target_count) * 100) : 0;

  return (
    <div className={cn(
      "glass-effect rounded-2xl p-4 transition-all border",
      goal.completed ? "border-green-500/30 bg-green-500/5" : "border-border/50"
    )}>
      <div className="flex items-start gap-3">
        <button onClick={onIncrement} disabled={goal.completed} className="mt-0.5 shrink-0">
          {goal.completed ? (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          ) : (
            <Circle className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-medium text-sm",
            goal.completed && "line-through text-muted-foreground"
          )}>
            {goal.title}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Progress value={progress} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">
              {goal.current_count}/{goal.target_count}
            </span>
          </div>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
