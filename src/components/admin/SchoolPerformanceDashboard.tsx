import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import {
  Users, BookOpen, FileText, BarChart3, TrendingUp, Clock,
  Loader2, Brain, GraduationCap, CheckCircle2
} from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
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
  copilotAssignments: number;
  totalMaterials: number;
  totalSubmissions: number;
  avgAccuracy: number;
  completionRate: number;
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries
    const [
      studentsRes, teachersRes, assignmentsRes, materialsRes,
      learningRes, logsRes, recentActivityRes
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact' })
        .eq('school_id', schoolId).eq('user_type', 'student').eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact' })
        .eq('school_id', schoolId).eq('user_type', 'teacher').eq('is_active', true),
      supabase.from('assignments').select('id, subject, created_at, source')
        .eq('school_id', schoolId),
      supabase.from('course_materials').select('id', { count: 'exact' })
        .eq('school_id', schoolId),
      supabase.from('student_learning_profiles').select('*')
        .in('user_id', (await supabase.from('profiles').select('id').eq('school_id', schoolId).eq('user_type', 'student')).data?.map(p => p.id) || []),
      supabase.from('activity_logs').select('action, created_at')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10),
      // Engagement: unique users active in last 7 days
      supabase.from('activity_logs').select('user_id')
        .eq('school_id', schoolId).gte('created_at', sevenDaysAgo),
    ]);

    const totalStudents = studentsRes.count || 0;
    const totalTeachers = teachersRes.count || 0;
    const assignments = assignmentsRes.data || [];
    const totalAssignments = assignments.length;
    const totalMaterials = materialsRes.count || 0;
    const learningData = learningRes.data || [];
    const logs = logsRes.data || [];

    // Copilot vs manual assignments
    const copilotAssignments = assignments.filter((a: any) => a.source === 'copilot').length;

    // Engagement: unique users from activity_logs in last 7 days
    const recentUsers = recentActivityRes.data || [];
    const activeStudentIds = new Set(recentUsers.map((r: any) => r.user_id));

    // Weighted accuracy: totalCorrect / totalQuestions
    const globalTotalQ = learningData.reduce((s, d) => s + (d.total_questions_answered || 0), 0);
    const globalTotalC = learningData.reduce((s, d) => s + (d.correct_answers || 0), 0);
    const avgAccuracy = globalTotalQ > 0 ? Math.round((globalTotalC / globalTotalQ) * 100) : 0;

    // Subject breakdown - weighted by questions answered
    const subjectMap = new Map<string, { totalCorrect: number; totalQuestions: number }>();
    for (const d of learningData) {
      const cur = subjectMap.get(d.subject) || { totalCorrect: 0, totalQuestions: 0 };
      cur.totalCorrect += d.correct_answers || 0;
      cur.totalQuestions += d.total_questions_answered || 0;
      subjectMap.set(d.subject, cur);
    }
    const subjectBreakdown = Array.from(subjectMap.entries())
      .map(([subject, data]) => ({
        subject,
        count: data.totalQuestions,
        avgAccuracy: data.totalQuestions > 0 ? Math.round((data.totalCorrect / data.totalQuestions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Assignment completion rate
    let totalSubmissions = 0;
    if (assignments.length > 0) {
      const assignmentIds = assignments.map((a: any) => a.id);
      const { count } = await supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .in('assignment_id', assignmentIds);
      totalSubmissions = count || 0;
    }
    const completionRate = totalAssignments > 0 ? Math.round((totalSubmissions / totalAssignments) * 100) : 0;

    // Teacher productivity - only copilot assignments
    const timeSavedMinutes = copilotAssignments * 18;
    const timeSavedHours = Math.round(timeSavedMinutes / 60);

    setMetrics({
      totalStudents,
      activeStudents: activeStudentIds.size,
      totalTeachers,
      totalAssignments,
      copilotAssignments,
      totalMaterials,
      totalSubmissions,
      avgAccuracy,
      completionRate,
      subjectBreakdown,
      recentActivity: logs.map(l => ({ action: l.action, date: l.created_at })),
      teacherProductivity: {
        assignmentsGenerated: copilotAssignments,
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
          sub={`${metrics.activeStudents} ${t('active (7d)', 'نشط (7 أيام)')}`}
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
          sub={`${metrics.copilotAssignments} ${t('AI-generated', 'بالذكاء الاصطناعي')}`}
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
                <span>{t('Engagement Rate (Last 7 Days)', 'معدل المشاركة (آخر 7 أيام)')}</span>
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
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{t('Assignment Completion Rate', 'معدل إكمال الواجبات')}</span>
                <span className={cn(
                  "font-bold",
                  metrics.completionRate >= 70 ? "text-green-500" : metrics.completionRate >= 50 ? "text-amber-500" : "text-red-500"
                )}>
                  {metrics.completionRate}%
                </span>
              </div>
              <Progress value={metrics.completionRate} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.totalSubmissions} / {metrics.totalAssignments} {t('assignments submitted', 'واجبات مسلمة')}
              </p>
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
              <span className="text-sm text-muted-foreground">{t('Copilot Assignments', 'واجبات المساعد')}</span>
              <span className="text-lg font-bold">{metrics.teacherProductivity.assignmentsGenerated}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('Manual Assignments', 'واجبات يدوية')}</span>
              <span className="text-lg font-bold">{metrics.totalAssignments - metrics.copilotAssignments}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('Time Saved (est.)', 'الوقت الموفر (تقديري)')}</span>
              <span className="text-lg font-bold text-green-500">{metrics.teacherProductivity.timeSaved}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'Based on 18 minutes saved per AI-generated assignment. Only Copilot assignments counted.',
                'استناداً إلى 18 دقيقة موفرة لكل واجب بالذكاء الاصطناعي فقط.'
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
