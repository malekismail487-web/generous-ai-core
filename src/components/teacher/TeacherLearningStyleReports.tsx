import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import {
  Users, Brain, Search, ChevronDown, ChevronUp, Loader2,
  Eye, Lightbulb, MessageSquare, Hand, Puzzle, AlertTriangle,
  TrendingUp, TrendingDown, Minus, BarChart3
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StudentProfile {
  id: string;
  full_name: string;
  grade_level: string | null;
  email: string | null;
}

interface LearningStyleData {
  user_id: string;
  visual_score: number | null;
  logical_score: number | null;
  verbal_score: number | null;
  kinesthetic_score: number | null;
  conceptual_score: number | null;
  dominant_style: string | null;
  secondary_style: string | null;
  total_interactions: number | null;
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
  learningStyle: LearningStyleData | null;
  learningData: LearningData[];
  overallAccuracy: number;
  strongSubjects: string[];
  weakSubjects: string[];
  totalAnswered: number;
  confidence: number;
}

const STYLE_ICONS: Record<string, typeof Eye> = {
  visual: Eye,
  logical: Puzzle,
  verbal: MessageSquare,
  kinesthetic: Hand,
  conceptual: Lightbulb,
};

const STYLE_COLORS: Record<string, string> = {
  visual: 'text-blue-500',
  logical: 'text-purple-500',
  verbal: 'text-green-500',
  kinesthetic: 'text-orange-500',
  conceptual: 'text-cyan-500',
};

function getTeachingRecommendation(style: LearningStyleData | null): string {
  if (!style || !style.dominant_style || style.dominant_style === 'balanced') {
    return 'Use mixed teaching methods equally. This student benefits from varied approaches.';
  }
  const recs: Record<string, string> = {
    visual: 'Use diagrams, charts, and color-coded content first. Then reinforce with logical reasoning.',
    logical: 'Lead with step-by-step breakdowns, formulas, and cause-effect chains. Support with visual aids.',
    verbal: 'Use rich narrative explanations, analogies, and discussion. Supplement with diagrams.',
    kinesthetic: 'Start with real-world examples and hands-on activities. Then explain the theory behind them.',
    conceptual: 'Begin with the big picture and connections. Then drill down into details with visual aids.',
  };
  return recs[style.dominant_style] || recs.visual;
}

interface Props {
  schoolId: string;
}

export function TeacherLearningStyleReports({ schoolId }: Props) {
  const { t } = useThemeLanguage();
  const [insights, setInsights] = useState<StudentInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);

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

    const studentIds = students.map(s => s.id);

    // Fetch learning style profiles & performance data in parallel
    const [styleRes, perfRes] = await Promise.all([
      supabase.from('learning_style_profiles')
        .select('user_id, visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score, dominant_style, secondary_style, total_interactions')
        .in('user_id', studentIds),
      supabase.from('student_learning_profiles')
        .select('user_id, subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy')
        .in('user_id', studentIds),
    ]);

    const styles = (styleRes.data || []) as LearningStyleData[];
    const perf = (perfRes.data || []) as LearningData[];

    const studentInsights: StudentInsight[] = students.map(student => {
      const style = styles.find(s => s.user_id === student.id) || null;
      const data = perf.filter(l => l.user_id === student.id);
      const totalAnswered = data.reduce((sum, d) => sum + d.total_questions_answered, 0);
      const totalCorrect = data.reduce((sum, d) => sum + d.correct_answers, 0);
      const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
      const confidence = style ? Math.min(100, Math.round(((style.total_interactions || 0) / 100) * 100)) : 0;

      return {
        profile: student as StudentProfile,
        learningStyle: style,
        learningData: data,
        overallAccuracy,
        strongSubjects: data.filter(d => Number(d.recent_accuracy) >= 75).map(d => d.subject),
        weakSubjects: data.filter(d => Number(d.recent_accuracy) < 50 && d.total_questions_answered >= 3).map(d => d.subject),
        totalAnswered,
        confidence,
      };
    });

    studentInsights.sort((a, b) => {
      if (a.totalAnswered === 0 && b.totalAnswered > 0) return 1;
      if (a.totalAnswered > 0 && b.totalAnswered === 0) return -1;
      return b.overallAccuracy - a.overallAccuracy;
    });

    setInsights(studentInsights);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const filtered = insights.filter(i =>
    i.profile.full_name.toLowerCase().includes(search.toLowerCase()) ||
    i.profile.email?.toLowerCase().includes(search.toLowerCase())
  );

  // Class-wide learning style aggregate
  const classStyleAggregate = (() => {
    const stylesWithData = insights.filter(i => i.learningStyle && (i.learningStyle.total_interactions || 0) >= 20);
    if (stylesWithData.length === 0) return null;
    const totals = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };
    for (const i of stylesWithData) {
      const s = i.learningStyle!;
      totals.visual += s.visual_score || 0;
      totals.logical += s.logical_score || 0;
      totals.verbal += s.verbal_score || 0;
      totals.kinesthetic += s.kinesthetic_score || 0;
      totals.conceptual += s.conceptual_score || 0;
    }
    const count = stylesWithData.length;
    return {
      visual: Math.round(totals.visual / count),
      logical: Math.round(totals.logical / count),
      verbal: Math.round(totals.verbal / count),
      kinesthetic: Math.round(totals.kinesthetic / count),
      conceptual: Math.round(totals.conceptual / count),
      count,
    };
  })();

  const totalStudents = insights.length;
  const activeStudents = insights.filter(i => i.totalAnswered > 0).length;
  const profiledStudents = insights.filter(i => i.learningStyle && (i.learningStyle.total_interactions || 0) >= 20).length;
  const avgAccuracy = activeStudents > 0
    ? Math.round(insights.filter(i => i.totalAnswered > 0).reduce((s, i) => s + i.overallAccuracy, 0) / activeStudents)
    : 0;
  const struggling = insights.filter(i => i.weakSubjects.length > 0);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-effect rounded-xl p-4 text-center">
          <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
          <p className="text-2xl font-bold">{totalStudents}</p>
          <p className="text-xs text-muted-foreground">{t('Total Students', 'إجمالي الطلاب')}</p>
        </div>
        <div className="glass-effect rounded-xl p-4 text-center">
          <Brain className="w-6 h-6 mx-auto mb-2 text-violet-500" />
          <p className="text-2xl font-bold">{profiledStudents}</p>
          <p className="text-xs text-muted-foreground">{t('Profiled', 'تم تحليلهم')}</p>
        </div>
        <div className="glass-effect rounded-xl p-4 text-center">
          <BarChart3 className="w-6 h-6 mx-auto mb-2 text-green-500" />
          <p className="text-2xl font-bold">{avgAccuracy}%</p>
          <p className="text-xs text-muted-foreground">{t('Avg Accuracy', 'متوسط الدقة')}</p>
        </div>
        <div className="glass-effect rounded-xl p-4 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
          <p className="text-2xl font-bold">{struggling.length}</p>
          <p className="text-xs text-muted-foreground">{t('Need Help', 'بحاجة للمساعدة')}</p>
        </div>
      </div>

      {/* Class-Wide Learning Style Distribution */}
      {classStyleAggregate && (
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-500" />
            {t('Class Learning Style Distribution', 'توزيع أنماط التعلم للصف')}
            <Badge variant="secondary" className="ml-auto text-xs">{classStyleAggregate.count} {t('students profiled', 'طالب تم تحليلهم')}</Badge>
          </h3>
          <div className="space-y-2">
            {(['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'] as const).map(style => {
              const Icon = STYLE_ICONS[style];
              const val = classStyleAggregate[style];
              return (
                <div key={style} className="flex items-center gap-3">
                  <Icon className={cn("w-4 h-4 shrink-0", STYLE_COLORS[style])} />
                  <span className="text-xs font-medium capitalize w-20">{style}</span>
                  <Progress value={val} className="h-2 flex-1" />
                  <span className="text-xs font-bold w-10 text-right">{val}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t(
              `Your class is ${classStyleAggregate.visual}% visual. Prioritize diagrams and visual representations. ${classStyleAggregate.logical}% are logical learners — include step-by-step reasoning.`,
              `صفك ${classStyleAggregate.visual}% بصري. أعطِ الأولوية للرسوم البيانية. ${classStyleAggregate.logical}% متعلمون منطقيون — قدّم تفسيرات خطوة بخطوة.`
            )}
          </p>
        </div>
      )}

      {/* Intervention Alerts */}
      {struggling.length > 0 && (
        <div className="glass-effect rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
          <h3 className="font-semibold text-amber-600 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" />
            {t('Intervention Alerts', 'تنبيهات التدخل')}
          </h3>
          <div className="space-y-2">
            {struggling.slice(0, 5).map(s => (
              <div key={s.profile.id} className="text-sm flex items-start gap-2">
                <span className="text-amber-500 shrink-0">⚠</span>
                <span>
                  <strong>{s.profile.full_name}</strong> {t('is struggling with', 'يواجه صعوبة في')}{' '}
                  <span className="capitalize font-medium">{s.weakSubjects.join(', ')}</span>.
                  {s.learningStyle?.dominant_style && (
                    <span className="text-muted-foreground">
                      {' '}{t('Try', 'جرّب')} {s.learningStyle.dominant_style} {t('approach', 'أسلوب')}.
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(insight => {
            const isExpanded = expandedStudent === insight.profile.id;
            const ls = insight.learningStyle;

            return (
              <div key={insight.profile.id} className="glass-effect rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedStudent(isExpanded ? null : insight.profile.id)}
                  className="w-full p-4 text-left flex items-center gap-3"
                >
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
                      {insight.profile.grade_level || 'N/A'} •{' '}
                      {ls?.dominant_style && ls.dominant_style !== 'balanced'
                        ? <span className={cn("capitalize", STYLE_COLORS[ls.dominant_style])}>{ls.dominant_style} {ls.visual_score || ls.logical_score || 0}%</span>
                        : t('No profile yet', 'لا يوجد ملف بعد')
                      }
                    </p>
                  </div>

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
                        {insight.overallAccuracy >= 75 ? <TrendingUp size={14} className="text-green-500" />
                          : insight.overallAccuracy >= 50 ? <Minus size={14} className="text-amber-500" />
                          : <TrendingDown size={14} className="text-red-500" />
                        }
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('No data', 'لا بيانات')}</span>
                    )}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
                    {/* Learning Style Profile */}
                    {ls && (ls.total_interactions || 0) >= 20 ? (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('Learning Style Profile', 'ملف أسلوب التعلم')}
                          <Badge variant="outline" className="ml-2 text-[10px]">{insight.confidence}% {t('confidence', 'ثقة')}</Badge>
                        </h4>
                        <div className="grid grid-cols-5 gap-2">
                          {(['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'] as const).map(style => {
                            const Icon = STYLE_ICONS[style];
                            const score = ls[`${style}_score` as keyof typeof ls] as number || 0;
                            const isDominant = ls.dominant_style === style;
                            return (
                              <div key={style} className={cn(
                                "text-center p-2 rounded-lg border",
                                isDominant ? "border-primary bg-primary/5" : "border-border/30"
                              )}>
                                <Icon className={cn("w-4 h-4 mx-auto mb-1", STYLE_COLORS[style])} />
                                <p className="text-lg font-bold">{score}%</p>
                                <p className="text-[9px] capitalize text-muted-foreground">{style}</p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                          <strong>{t('Teaching Recommendation:', 'توصية التدريس:')}</strong>{' '}
                          {getTeachingRecommendation(ls)}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        {t(
                          `Not enough data yet (${ls?.total_interactions || 0}/20 interactions). Profile will appear after more activity.`,
                          `لا توجد بيانات كافية بعد (${ls?.total_interactions || 0}/20 تفاعل). سيظهر الملف بعد مزيد من النشاط.`
                        )}
                      </p>
                    )}

                    {/* Subject Performance */}
                    {insight.learningData.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('Subject Performance', 'أداء المواد')}
                        </h4>
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
                              <Progress value={accuracy} className="h-2" />
                              <p className="text-[10px] text-muted-foreground">
                                {ld.correct_answers}/{ld.total_questions_answered} {t('correct', 'صحيح')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Tags */}
                    <div className="flex gap-2 flex-wrap">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
