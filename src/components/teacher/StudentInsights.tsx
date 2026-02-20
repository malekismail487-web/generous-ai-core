import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { BarChart3, TrendingUp, TrendingDown, Minus, Users, Brain, Loader2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface StudentProfile {
  id: string;
  full_name: string;
  grade_level: string | null;
  email: string | null;
}

interface LearningData {
  user_id: string;
  subject: string;
  difficulty_level: string;
  total_questions_answered: number;
  correct_answers: number;
  recent_accuracy: number;
}

interface StudentInsight {
  profile: StudentProfile;
  learningData: LearningData[];
  overallAccuracy: number;
  strongSubjects: string[];
  weakSubjects: string[];
  totalAnswered: number;
}

interface StudentInsightsProps {
  schoolId: string;
}

export function StudentInsights({ schoolId }: StudentInsightsProps) {
  const { t } = useThemeLanguage();
  const [insights, setInsights] = useState<StudentInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);

    // Fetch all students in this school
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, grade_level, email')
      .eq('school_id', schoolId)
      .eq('user_type', 'student')
      .eq('is_active', true)
      .order('full_name');

    if (!students || students.length === 0) {
      setInsights([]);
      setLoading(false);
      return;
    }

    // Fetch learning profiles for all students
    // Note: Teachers can see learning data for students in their school
    // We query from the student_learning_profiles table
    const studentIds = students.map(s => s.id);
    const { data: learningProfiles } = await supabase
      .from('student_learning_profiles')
      .select('user_id, subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy')
      .in('user_id', studentIds);

    const learningData = (learningProfiles || []) as LearningData[];

    // Build insights
    const studentInsights: StudentInsight[] = students.map(student => {
      const data = learningData.filter(l => l.user_id === student.id);
      const totalAnswered = data.reduce((sum, d) => sum + d.total_questions_answered, 0);
      const totalCorrect = data.reduce((sum, d) => sum + d.correct_answers, 0);
      const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

      const strongSubjects = data
        .filter(d => Number(d.recent_accuracy) >= 75)
        .map(d => d.subject);
      const weakSubjects = data
        .filter(d => Number(d.recent_accuracy) < 50 && d.total_questions_answered >= 3)
        .map(d => d.subject);

      return {
        profile: student as StudentProfile,
        learningData: data,
        overallAccuracy,
        strongSubjects,
        weakSubjects,
        totalAnswered,
      };
    });

    // Sort: students with data first, then by accuracy
    studentInsights.sort((a, b) => {
      if (a.totalAnswered === 0 && b.totalAnswered > 0) return 1;
      if (a.totalAnswered > 0 && b.totalAnswered === 0) return -1;
      return b.overallAccuracy - a.overallAccuracy;
    });

    setInsights(studentInsights);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const filtered = insights.filter(i =>
    i.profile.full_name.toLowerCase().includes(search.toLowerCase()) ||
    i.profile.email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalStudents = insights.length;
  const activeStudents = insights.filter(i => i.totalAnswered > 0).length;
  const avgAccuracy = activeStudents > 0
    ? Math.round(insights.filter(i => i.totalAnswered > 0).reduce((s, i) => s + i.overallAccuracy, 0) / activeStudents)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-effect rounded-xl p-4 text-center">
          <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
          <p className="text-2xl font-bold">{totalStudents}</p>
          <p className="text-xs text-muted-foreground">{t('Total Students', 'إجمالي الطلاب')}</p>
        </div>
        <div className="glass-effect rounded-xl p-4 text-center">
          <Brain className="w-6 h-6 mx-auto mb-2 text-violet-500" />
          <p className="text-2xl font-bold">{activeStudents}</p>
          <p className="text-xs text-muted-foreground">{t('Active Learners', 'المتعلمين النشطين')}</p>
        </div>
        <div className="glass-effect rounded-xl p-4 text-center">
          <BarChart3 className="w-6 h-6 mx-auto mb-2 text-green-500" />
          <p className="text-2xl font-bold">{avgAccuracy}%</p>
          <p className="text-xs text-muted-foreground">{t('Avg Accuracy', 'متوسط الدقة')}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('Search students...', 'البحث عن طلاب...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Student List */}
      {filtered.length === 0 ? (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">{t('No Students Found', 'لم يتم العثور على طلاب')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Student insights will appear here once students start using the app.', 'ستظهر رؤى الطلاب هنا بمجرد بدء الطلاب في استخدام التطبيق.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(insight => {
            const isExpanded = expandedStudent === insight.profile.id;
            
            return (
              <div key={insight.profile.id} className="glass-effect rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedStudent(isExpanded ? null : insight.profile.id)}
                  className="w-full p-4 text-left flex items-center gap-3"
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                    insight.overallAccuracy >= 75 ? "bg-gradient-to-br from-green-500 to-emerald-600"
                      : insight.overallAccuracy >= 50 ? "bg-gradient-to-br from-amber-500 to-orange-600"
                      : insight.totalAnswered === 0 ? "bg-gradient-to-br from-slate-400 to-slate-500"
                      : "bg-gradient-to-br from-red-500 to-rose-600"
                  )}>
                    {insight.profile.full_name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{insight.profile.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {insight.profile.grade_level || 'N/A'} • {insight.totalAnswered} {t('answers', 'إجابة')}
                    </p>
                  </div>

                  {/* Accuracy + Trend */}
                  <div className="flex items-center gap-2 shrink-0">
                    {insight.totalAnswered > 0 ? (
                      <>
                        <span className={cn(
                          "text-sm font-bold",
                          insight.overallAccuracy >= 75 ? "text-green-500"
                            : insight.overallAccuracy >= 50 ? "text-amber-500"
                            : "text-red-500"
                        )}>
                          {insight.overallAccuracy}%
                        </span>
                        {insight.overallAccuracy >= 75 ? (
                          <TrendingUp size={14} className="text-green-500" />
                        ) : insight.overallAccuracy >= 50 ? (
                          <Minus size={14} className="text-amber-500" />
                        ) : (
                          <TrendingDown size={14} className="text-red-500" />
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('No data', 'لا توجد بيانات')}</span>
                    )}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && insight.learningData.length > 0 && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                    {/* Subject breakdown */}
                    {insight.learningData.map(ld => {
                      const accuracy = Number(ld.recent_accuracy);
                      return (
                        <div key={ld.subject} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="capitalize font-medium">{ld.subject}</span>
                            <span className={cn(
                              "font-medium",
                              accuracy >= 75 ? "text-green-500" : accuracy >= 50 ? "text-amber-500" : "text-red-500"
                            )}>
                              {accuracy}% • {ld.difficulty_level}
                            </span>
                          </div>
                          <Progress
                            value={accuracy}
                            className="h-2"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {ld.correct_answers}/{ld.total_questions_answered} {t('correct', 'صحيح')}
                          </p>
                        </div>
                      );
                    })}

                    {/* Strengths & Weaknesses */}
                    <div className="flex gap-2 flex-wrap mt-2">
                      {insight.strongSubjects.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 capitalize">
                          ✓ {s}
                        </span>
                      ))}
                      {insight.weakSubjects.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 capitalize">
                          ⚠ {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && insight.learningData.length === 0 && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3">
                    <p className="text-xs text-muted-foreground text-center">
                      {t('This student hasn\'t completed any adaptive activities yet.', 'لم يكمل هذا الطالب أي نشاط تكيفي بعد.')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
