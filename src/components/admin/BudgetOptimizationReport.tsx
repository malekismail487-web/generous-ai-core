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

  const annualSavings = metrics.productivityDollars * 12;

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-xl p-5 bg-gradient-to-r from-green-500/10 to-emerald-500/10">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          {t('Budget Optimization Report', 'تقرير تحسين الميزانية')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('ROI analysis for Lumina investment', 'تحليل العائد على الاستثمار في لومينا')}
        </p>
      </div>

      {/* Productivity Savings */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-500" />
          {t('Teacher Productivity Savings', 'وفورات إنتاجية المعلمين')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{metrics.copilotAssignments}</p>
            <p className="text-xs text-muted-foreground">{t('AI Assignments', 'واجبات الذكاء الاصطناعي')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">{metrics.timeSavedHours}h</p>
            <p className="text-xs text-muted-foreground">{t('Hours Saved', 'ساعات موفرة')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-500">${metrics.productivityDollars}</p>
            <p className="text-xs text-muted-foreground">{t('Monthly Value', 'القيمة الشهرية')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-violet-500">${annualSavings.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{t('Annual Savings', 'التوفير السنوي')}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {t(
            `Based on ${metrics.copilotAssignments} AI-generated assignments × 18 min saved each × $${metrics.hourlyRate}/hr teacher rate.`,
            `بناءً على ${metrics.copilotAssignments} واجب بالذكاء الاصطناعي × 18 دقيقة موفرة × $${metrics.hourlyRate}/ساعة`
          )}
        </p>
      </div>

      {/* Quality & Engagement */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          {t('Quality Improvements', 'تحسينات الجودة')}
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

      {/* Summary */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          {t('Content Created', 'المحتوى المُنشأ')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{metrics.totalAssignments}</p>
            <p className="text-xs text-muted-foreground">{t('Total Assignments', 'إجمالي الواجبات')}</p>
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
