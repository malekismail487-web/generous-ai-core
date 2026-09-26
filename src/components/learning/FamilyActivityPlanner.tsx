import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { homeActivity, type HomePreference } from '@/lib/connectedLearning';
import type { SupportPlan } from '@/lib/learningSupport';

export function FamilyActivityPlanner({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const { user } = useAuth();
  const { language } = useThemeLanguage();
  const ar = language === 'ar';
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [preference, setPreference] = useState<HomePreference>({ minutes: 10, mode: 'conversation' });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setPlans([]);
    setError('');
    setNotice('');
    const { data, error: readError } = await supabase.from('learning_support_plans').select('*')
      .eq('school_id', schoolId).eq('student_id', studentId).eq('family_visible', true)
      .eq('status', 'active').order('created_at', { ascending: false }).limit(30);
    if (current !== generation.current) return;
    setPlans(readError ? [] : (data ?? []));
    if (readError) setError(readError.message);
    setLoading(false);
  }, [schoolId, studentId]);

  useEffect(() => {
    const ref = generation;
    void load();
    return () => { ref.current++; };
  }, [load]);

  const recordSupport = async (planId: string) => {
    if (!user || savingId) return;
    setSavingId(planId);
    setError(''); setNotice('');
    const { error: writeError } = await supabase.from('learning_support_checkins').insert({
      plan_id: planId, actor_id: user.id, kind: 'FAMILY_SUPPORTED',
    });
    if (writeError) setError(writeError.message);
    else setNotice(ar ? 'سُجّل دعم الأسرة. هذا ليس إثباتاً للإتقان.' : 'Family support recorded. This is not proof of mastery.');
    setSavingId(null);
  };

  return <section className="space-y-4" aria-label="Family learning activities">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{ar ? 'نشاط منزلي بإشراف المعلم' : 'Teacher-guided home activity'}</h2>
        <p className="text-sm text-muted-foreground">{ar
          ? 'تظل خطوة المعلم كما كتبها؛ تتغير طريقة الاستعداد فقط حسب وقت الأسرة ومواردها.'
          : 'The teacher-approved step stays intact; only the preparation adapts to your time and resources.'}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || !!savingId} aria-label="Refresh family activities"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{ar ? 'الوقت المتاح' : 'Time available'}
        <select className="mt-1 w-full rounded-md border bg-background p-2" value={preference.minutes}
          onChange={event => setPreference(current => ({ ...current, minutes: Number(event.target.value) as HomePreference['minutes'] }))}>
          {[5, 10, 15].map(minutes => <option key={minutes} value={minutes}>{minutes} {ar ? 'دقائق' : 'minutes'}</option>)}
        </select>
      </label>
      <label className="text-sm">{ar ? 'الموارد المتاحة' : 'What you have available'}
        <select className="mt-1 w-full rounded-md border bg-background p-2" value={preference.mode}
          onChange={event => setPreference(current => ({ ...current, mode: event.target.value as HomePreference['mode'] }))}>
          <option value="conversation">{ar ? 'محادثة فقط' : 'Conversation only'}</option>
          <option value="paper">{ar ? 'ورقة وقلم' : 'Paper and pencil'}</option>
          <option value="device">{ar ? 'جهاز متاح' : 'Device available'}</option>
        </select>
      </label>
    </div>
    {loading ? <p className="text-sm text-muted-foreground">{ar ? 'جارٍ تحميل خطوات المعلم…' : 'Loading teacher-approved steps…'}</p>
      : error ? <p className="text-sm text-muted-foreground">{ar ? 'لا يمكن التحقق من الأنشطة الآن.' : 'Activities cannot be verified right now.'}</p>
      : plans.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? 'لا توجد خطوة منزلية نشطة شاركها المعلم.' : 'No active home step has been shared by a teacher.'}</p>
      : plans.map(plan => {
        const activity = homeActivity(plan, preference);
        if (!activity) return null;
        return <Card key={activity.planId}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{activity.subject} · {activity.topic}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>{ar ? 'هدف المعلم:' : 'Teacher goal:'}</strong> {activity.goal}</p>
            <p className="rounded-lg border p-3"><strong>{ar ? 'خطوة المعلم المنزلية (نص أصلي):' : 'Teacher-approved home step (unchanged):'}</strong> {activity.teacherStep}</p>
            <p><strong>{ar ? 'الاستعداد:' : 'Prepare:'}</strong> {ar
              ? preference.mode === 'paper' ? 'جهّز ورقة ليرسم الطالب أو يكتب تفكيره.'
                : preference.mode === 'device' ? 'استخدم الجهاز إذا كانت خطوة المعلم تتطلبه.'
                  : 'خصص وقتاً لمحادثة قصيرة دون جهاز إضافي.'
              : activity.preparation}</p>
            <p><strong>{ar ? 'في النهاية:' : 'Finish:'}</strong> {ar
              ? 'اطلب من الطالب شرح جزء بأسلوبه. إذا لم يكن متأكداً فأبلغ المعلم بدلاً من ادعاء الإتقان.'
              : activity.followUp}</p>
            <p className="text-xs text-muted-foreground">{ar ? `${activity.minutes} دقائق مقترحة` : `${activity.minutes} suggested minutes`} · {activity.source === 'ALE_MASTERY'
              ? (ar ? 'خطة المعلم مبنية على ملاحظة ALE؛ النشاط ليس اختبار إتقان.' : 'Teacher plan cites ALE evidence; this activity is not a mastery test.')
              : (ar ? 'المصدر ملاحظة المعلم؛ لا تُدّعى درجة ALE.' : 'Source is teacher observation; no ALE score is claimed.')}</p>
            <Button size="sm" variant="outline" disabled={!!savingId} onClick={() => void recordSupport(activity.planId)}>
              <BookOpenCheck className="mr-2 h-4 w-4" />{ar ? 'سجّل دعم الأسرة' : 'Record family support'}
            </Button>
          </CardContent>
        </Card>;
      })}
  </section>;
}
