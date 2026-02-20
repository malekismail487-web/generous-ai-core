import { useState } from 'react';
import { useStudentGoals, StudentGoal } from '@/hooks/useStudentGoals';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Target, Plus, Trash2, CheckCircle2, Circle, Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const PRESET_GOALS = [
  { title: 'Complete 5 quizzes', target: 5, type: 'quizzes' },
  { title: 'Study 3 subjects', target: 3, type: 'subjects' },
  { title: 'Review 10 flashcards', target: 10, type: 'flashcards' },
  { title: 'Take 2 exams', target: 2, type: 'exams' },
  { title: 'Write 3 notes', target: 3, type: 'notes' },
];

export function GoalTracker() {
  const { goals, loading, addGoal, incrementGoal, deleteGoal, completedCount, totalCount, overallProgress } = useStudentGoals();
  const { t } = useThemeLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customTarget, setCustomTarget] = useState(5);

  const handleAddPreset = async (preset: typeof PRESET_GOALS[0]) => {
    await addGoal(preset.title, preset.target, preset.type);
  };

  const handleAddCustom = async () => {
    if (!customTitle.trim()) return;
    await addGoal(customTitle.trim(), customTarget);
    setCustomTitle('');
    setCustomTarget(5);
    setShowAdd(false);
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

        {/* Add Goal */}
        {!showAdd ? (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full gap-2 border-dashed"
              onClick={() => setShowAdd(true)}
            >
              <Plus size={16} />
              {t('Add Custom Goal', 'إضافة هدف مخصص')}
            </Button>

            {goals.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center mb-3">
                  {t('Or pick a preset goal:', 'أو اختر هدفًا جاهزًا:')}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PRESET_GOALS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddPreset(preset)}
                      className="glass-effect rounded-xl p-3 text-left hover:border-primary/40 transition-all flex items-center gap-3 border border-border/50"
                    >
                      <Target size={16} className="text-primary shrink-0" />
                      <span className="text-sm font-medium">{preset.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">×{preset.target}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-effect rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold">{t('New Goal', 'هدف جديد')}</h3>
            <Input
              placeholder={t('e.g., Read 20 pages', 'مثال: قراءة 20 صفحة')}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('Target:', 'الهدف:')}</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={customTarget}
                onChange={(e) => setCustomTarget(parseInt(e.target.value) || 1)}
                className="w-20"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1">
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button onClick={handleAddCustom} disabled={!customTitle.trim()} className="flex-1">
                {t('Add Goal', 'إضافة')}
              </Button>
            </div>
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
