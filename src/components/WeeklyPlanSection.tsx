import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Loader2, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { MaterialViewer } from '@/components/MaterialViewer';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';

interface WeeklyPlan {
  id: string;
  title: string;
  grade_level: string;
  week_start: string;
  plan_type: string;
  content_json: Record<string, string[]> | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

export function WeeklyPlanSection() {
  const { profile, school } = useRoleGuard();
  const { language } = useThemeLanguage();
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPlan, setViewerPlan] = useState<WeeklyPlan | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!school) return;
    setLoading(true);
    const { data, error } = await supabase.from('weekly_plans').select('*').eq('school_id', school.id).order('week_start', { ascending: false });
    if (!error && data) setPlans(data as unknown as WeeklyPlan[]);
    setLoading(false);
  }, [school]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const daysOfWeekKeys: Array<{ en: string; key: keyof typeof import('@/lib/translations').translations }> = [
    { en: 'Sunday', key: 'sunday' },
    { en: 'Monday', key: 'monday' },
    { en: 'Tuesday', key: 'tuesday' },
    { en: 'Wednesday', key: 'wednesday' },
    { en: 'Thursday', key: 'thursday' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-120px)] pt-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const materialViewerElement = (
    <MaterialViewer open={viewerOpen} onOpenChange={setViewerOpen} material={viewerPlan ? { id: viewerPlan.id, title: viewerPlan.title, subject: tr('weeklyPlan', language), content: null, file_url: viewerPlan.file_url, grade_level: viewerPlan.grade_level, created_at: viewerPlan.created_at } : null} subjectInfo={{ name: tr('weeklyPlan', language), emoji: '📅', color: 'from-blue-500 to-blue-600' }} teacherName={tr('schoolAdmin', language)} />
  );

  if (selectedPlan) {
    return (
      <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
        <div className="px-4 py-4">
          <button onClick={() => setSelectedPlan(null)} className="text-sm text-primary mb-4 hover:underline">
            {tr('backToAllPlans', language)}
          </button>
          <h2 className="text-xl font-bold mb-2">{selectedPlan.title}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {tr('weekOf', language)} {format(new Date(selectedPlan.week_start), 'MMM d, yyyy')} • {getGradeName(selectedPlan.grade_level, language)}
          </p>
          {selectedPlan.plan_type === 'file' && selectedPlan.file_url && (
            <button onClick={() => { setViewerPlan(selectedPlan); setViewerOpen(true); }} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors w-full">
              <FileText className="w-5 h-5" /><span>{tr('openMaterial', language)}</span>
            </button>
          )}
          {selectedPlan.plan_type === 'manual' && selectedPlan.content_json && (
            <div className="space-y-3">
              {daysOfWeekKeys.map(({ en, key }) => {
                const activities = (selectedPlan.content_json as Record<string, string[]>)?.[en] || [];
                return (
                  <div key={en} className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold text-sm mb-2">{tr(key, language)}</h3>
                    {activities.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{tr('noActivities', language)}</p>
                    ) : (
                      <ul className="space-y-1">
                        {activities.map((activity, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span><span>{activity}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {materialViewerElement}
      </div>
    );
  }

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      <div className="px-4 py-4">
        <h2 className="text-xl font-bold mb-4">{tr('weeklyPlan', language)}</h2>
        {plans.length === 0 ? (
          <div className="glass-effect rounded-xl p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">{tr('noWeeklyPlans', language)}</h3>
            <p className="text-sm text-muted-foreground">{tr('noWeeklyPlansDesc', language)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(plan => (
              <button key={plan.id} onClick={() => setSelectedPlan(plan)} className="w-full text-left glass-effect rounded-xl p-4 hover:border-primary/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    {plan.plan_type === 'file' ? <FileText className="w-5 h-5 text-white" /> : <Calendar className="w-5 h-5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{plan.title}</h3>
                    <p className="text-xs text-muted-foreground">{tr('weekOf', language)} {format(new Date(plan.week_start), 'MMM d, yyyy')} • {getGradeName(plan.grade_level, language)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {materialViewerElement}
    </div>
  );
}
