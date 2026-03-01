import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import {
  Users, BookOpen, FileText, BarChart3, TrendingUp, Clock,
  Loader2, Brain, GraduationCap, Sparkles
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Props {
  schoolId: string;
}

interface Metrics {
  totalStudents: number;
  activeStudents: number;
  totalTeachers: number;
  totalAssignments: number;
  totalMaterials: number;
  totalSubmissions: number;
  avgAccuracy: number;
  subjectBreakdown: { subject: string; count: number; avgAccuracy: number }[];
  recentActivity: { action: string; date: string }[];
  teacherProductivity: { assignmentsGenerated: number; timeSaved: string };
}

export function SchoolPerformanceDashboard({ schoolId }: Props) {
  const { t } = useThemeLanguage();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);

    // Parallel queries
    const [
      studentsRes, teachersRes, assignmentsRes, materialsRes,
      submissionsRes, learningRes, logsRes
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact' })
        .eq('school_id', schoolId).eq('user_type', 'student').eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact' })
        .eq('school_id', schoolId).eq('user_type', 'teacher').eq('is_active', true),
      supabase.from('assignments').select('id, subject, created_at', { count: 'exact' })
        .eq('school_id', schoolId),
      supabase.from('course_materials').select('id', { count: 'exact' })
        .eq('school_id', schoolId),
      supabase.from('submissions').select('id, assignment_id, grade')
        .in('assignment_id', (await supabase.from('assignments').select('id').eq('school_id', schoolId)).data?.map(a => a.id) || []),
      supabase.from('student_learning_profiles').select('*')
        .in('user_id', (await supabase.from('profiles').select('id').eq('school_id', schoolId).eq('user_type', 'student')).data?.map(p => p.id) || []),
      supabase.from('activity_logs').select('action, created_at')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10),
    ]);

    const totalStudents = studentsRes.count || 0;
    const totalTeachers = teachersRes.count || 0;
    const totalAssignments = assignmentsRes.count || 0;
    const totalMaterials = materialsRes.count || 0;
    const submissions = submissionsRes.data || [];
    const learningData = learningRes.data || [];
    const logs = logsRes.data || [];

    // Calculate average accuracy
    const totalAnswered = learningData.reduce((s, d) => s + (d.total_questions_answered || 0), 0);
    const totalCorrect = learningData.reduce((s, d) => s + (d.correct_answers || 0), 0);
    const avgAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    // Active students (those with learning data)
    const activeStudentIds = new Set(learningData.map(d => d.user_id));

    // Subject breakdown
    const subjectMap = new Map<string, { count: number; totalAcc: number; n: number }>();
    for (const d of learningData) {
      const cur = subjectMap.get(d.subject) || { count: 0, totalAcc: 0, n: 0 };
      cur.count += d.total_questions_answered || 0;
      cur.totalAcc += Number(d.recent_accuracy) || 0;
      cur.n += 1;
      subjectMap.set(d.subject, cur);
    }
    const subjectBreakdown = Array.from(subjectMap.entries())
      .map(([subject, data]) => ({
        subject,
        count: data.count,
        avgAccuracy: data.n > 0 ? Math.round(data.totalAcc / data.n) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Teacher productivity
    const timeSavedMinutes = totalAssignments * 18; // 18 min saved per AI-generated assignment
    const timeSavedHours = Math.round(timeSavedMinutes / 60);

    setMetrics({
      totalStudents,
      activeStudents: activeStudentIds.size,
      totalTeachers,
      totalAssignments,
      totalMaterials,
      totalSubmissions: submissions.length,
      avgAccuracy,
      subjectBreakdown,
      recentActivity: logs.map(l => ({ action: l.action, date: l.created_at })),
      teacherProductivity: {
        assignmentsGenerated: totalAssignments,
        timeSaved: `${timeSavedHours} ${t('hours', 'ساعة')}`,
      },
    });

    setLoading(false);
  }, [schoolId, t]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) return null;

  const engagementRate = metrics.totalStudents > 0
    ? Math.round((metrics.activeStudents / metrics.totalStudents) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-effect rounded-xl p-5 bg-gradient-to-r from-primary/10 to-accent/10">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          {t('School Performance Dashboard', 'لوحة أداء المدرسة')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('Real-time metrics for your school', 'مقاييس الأداء في الوقت الفعلي')}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Users className="w-5 h-5 text-blue-500" />}
          value={metrics.totalStudents}
          label={t('Total Students', 'إجمالي الطلاب')}
          sub={`${metrics.activeStudents} ${t('active', 'نشط')}`}
        />
        <MetricCard
          icon={<GraduationCap className="w-5 h-5 text-violet-500" />}
          value={metrics.totalTeachers}
          label={t('Teachers', 'المعلمين')}
        />
        <MetricCard
          icon={<FileText className="w-5 h-5 text-green-500" />}
          value={metrics.totalAssignments}
          label={t('Assignments', 'الواجبات')}
          sub={`${metrics.totalSubmissions} ${t('submissions', 'تسليم')}`}
        />
        <MetricCard
          icon={<BookOpen className="w-5 h-5 text-amber-500" />}
          value={metrics.totalMaterials}
          label={t('Materials', 'المواد')}
        />
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Engagement */}
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            {t('Student Engagement', 'مشاركة الطلاب')}
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{t('Engagement Rate', 'معدل المشاركة')}</span>
                <span className="font-bold">{engagementRate}%</span>
              </div>
              <Progress value={engagementRate} className="h-3" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{t('Average Accuracy', 'متوسط الدقة')}</span>
                <span className={cn("font-bold", metrics.avgAccuracy >= 70 ? "text-green-500" : "text-amber-500")}>
                  {metrics.avgAccuracy}%
                </span>
              </div>
              <Progress value={metrics.avgAccuracy} className="h-3" />
            </div>
          </div>
        </div>

        {/* Teacher Productivity */}
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            {t('Teacher Productivity', 'إنتاجية المعلمين')}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('Assignments Generated', 'واجبات تم إنشاؤها')}</span>
              <span className="text-lg font-bold">{metrics.teacherProductivity.assignmentsGenerated}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('Time Saved (est.)', 'الوقت الموفر (تقديري)')}</span>
              <span className="text-lg font-bold text-green-500">{metrics.teacherProductivity.timeSaved}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'Based on 18 minutes saved per AI-generated assignment vs manual creation.',
                'استناداً إلى 18 دقيقة موفرة لكل واجب تم إنشاؤه بالذكاء الاصطناعي.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Subject Breakdown */}
      {metrics.subjectBreakdown.length > 0 && (
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            {t('Subject Performance', 'أداء المواد')}
          </h3>
          <div className="space-y-3">
            {metrics.subjectBreakdown.map(sub => (
              <div key={sub.subject} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize font-medium">{sub.subject}</span>
                  <span className={cn(
                    "font-medium",
                    sub.avgAccuracy >= 70 ? "text-green-500" : sub.avgAccuracy >= 50 ? "text-amber-500" : "text-red-500"
                  )}>
                    {sub.avgAccuracy}% • {sub.count} {t('questions', 'سؤال')}
                  </span>
                </div>
                <Progress value={sub.avgAccuracy} className="h-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {metrics.recentActivity.length > 0 && (
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {t('Recent Activity', 'النشاط الأخير')}
          </h3>
          <div className="space-y-2">
            {metrics.recentActivity.map((log, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b border-border/20 last:border-0">
                <span className="text-muted-foreground capitalize">{log.action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub?: string }) {
  return (
    <div className="glass-effect rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
