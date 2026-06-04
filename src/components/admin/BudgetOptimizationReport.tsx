import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DollarSign, TrendingUp, Clock, Users, Loader2, BarChart3
} from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface Props {
  schoolId: string;
}

interface BudgetMetrics {
  copilotAssignments: number;
  manualAssignments: number;
  totalAssignments: number;
  timeSavedMinutes: number;
  timeSavedHours: number;
  productivityDollars: number;
  hourlyRate: number;
  totalStudents: number;
  totalTeachers: number;
  totalMaterials: number;
  engagementRate: number;
}

export function BudgetOptimizationReport({ schoolId }: Props) {
  const { t } = useThemeLanguage();
  const [metrics, setMetrics] = useState<BudgetMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [assignRes, profileRes, matRes, activityRes] = await Promise.all([
      supabase.from('assignments').select('id, source').eq('school_id', schoolId),
      supabase.from('profiles').select('id, user_type, is_active').eq('school_id', schoolId).eq('is_active', true),
      supabase.from('course_materials').select('id', { count: 'exact' }).eq('school_id', schoolId),
      supabase.from('activity_logs').select('user_id').eq('school_id', schoolId).gte('created_at', sevenDaysAgo),
    ]);

    const assignments = assignRes.data || [];
    const profiles = profileRes.data || [];
    const totalStudents = profiles.filter(p => p.user_type === 'student').length;
    const totalTeachers = profiles.filter(p => p.user_type === 'teacher').length;
    const copilotAssignments = assignments.filter((a: any) => a.source === 'copilot').length;
    const manualAssignments = assignments.length - copilotAssignments;
    const timeSavedMinutes = copilotAssignments * 18;
    const timeSavedHours = Math.round(timeSavedMinutes / 60);
    const hourlyRate = 30;
    const productivityDollars = timeSavedHours * hourlyRate;
    const activeUsers = new Set((activityRes.data || []).map((a: any) => a.user_id)).size;
    const engagementRate = totalStudents > 0 ? Math.round((activeUsers / totalStudents) * 100) : 0;

    setMetrics({
      copilotAssignments,
      manualAssignments,
      totalAssignments: assignments.length,
      timeSavedMinutes,
      timeSavedHours,
      productivityDollars,
      hourlyRate,
      totalStudents,
      totalTeachers,
      totalMaterials: matRes.count || 0,
      engagementRate,
    });
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-xl p-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          {t('Usage Report', 'تقرير الاستخدام')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('Measured platform activity for this school.', 'نشاط المنصة المسجَّل لهذه المدرسة.')}
        </p>
      </div>

      {/* Assignment Mix */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <LuminaLogo size={16} />
          {t('Assignment Mix', 'توزيع الواجبات')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{metrics.copilotAssignments}</p>
            <p className="text-xs text-muted-foreground">{t('AI Assignments', 'واجبات الذكاء الاصطناعي')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{metrics.manualAssignments}</p>
            <p className="text-xs text-muted-foreground">{t('Manual Assignments', 'واجبات يدوية')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{metrics.totalAssignments}</p>
            <p className="text-xs text-muted-foreground">{t('Total', 'الإجمالي')}</p>
          </div>
        </div>
      </div>

      {/* Engagement & Adoption */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          {t('Engagement & Adoption', 'المشاركة والتبني')}
        </h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{t('Student Engagement (7 days)', 'مشاركة الطلاب (7 أيام)')}</span>
              <span className="font-bold">{metrics.engagementRate}%</span>
            </div>
            <Progress value={metrics.engagementRate} className="h-3" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{t('AI Adoption Rate', 'معدل تبني الذكاء الاصطناعي')}</span>
              <span className="font-bold">
                {metrics.totalAssignments > 0 ? Math.round((metrics.copilotAssignments / metrics.totalAssignments) * 100) : 0}%
              </span>
            </div>
            <Progress
              value={metrics.totalAssignments > 0 ? (metrics.copilotAssignments / metrics.totalAssignments) * 100 : 0}
              className="h-3"
            />
          </div>
        </div>
      </div>

      {/* Content Created */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          {t('Roster & Content', 'القوائم والمحتوى')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{metrics.totalStudents}</p>
            <p className="text-xs text-muted-foreground">{t('Active Students', 'الطلاب النشطون')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{metrics.totalMaterials}</p>
            <p className="text-xs text-muted-foreground">{t('Course Materials', 'المواد الدراسية')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{metrics.totalTeachers}</p>
            <p className="text-xs text-muted-foreground">{t('Active Teachers', 'المعلمين النشطين')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

