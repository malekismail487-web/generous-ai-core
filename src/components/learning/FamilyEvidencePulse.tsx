import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { buildFamilyPulse, familyConversationQuestions, type FamilyMasteryObservation } from '@/lib/familyEvidence';
import type { SupportCheckin, SupportPlan } from '@/lib/learningSupport';

type Evidence = { plans: SupportPlan[]; checkins: SupportCheckin[]; mastery: FamilyMasteryObservation[]; partial: boolean };
const emptyEvidence = (): Evidence => ({ plans: [], checkins: [], mastery: [], partial: false });

export function FamilyEvidencePulse({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const { language } = useThemeLanguage();
  const ar = language === 'ar';
  const [evidence, setEvidence] = useState<Evidence>(emptyEvidence);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(''); setNotice(''); setEvidence(emptyEvidence()); setSelected(new Set());
    try {
      const result = await supabase.from('learning_support_plans').select('*')
        .eq('school_id', schoolId).eq('student_id', studentId).eq('family_visible', true)
        .order('created_at', { ascending: false }).limit(50);
      if (current !== generation.current) return;
      if (result.error) throw result.error;
      const plans = result.data ?? [];
      if (!plans.length) { setEvidence(emptyEvidence()); setLoading(false); return; }
      const [checkinResult, masteryResult] = await Promise.all([
        supabase.from('learning_support_checkins').select('*').in('plan_id', plans.map(plan => plan.id))
          .order('created_at', { ascending: false }).limit(500),
        plans.some(plan => plan.source_kind === 'ALE_MASTERY')
          ? supabase.from('concept_mastery')
            .select('user_id, school_id, subject, topic, mastery_score, updated_at, is_test_data')
            .eq('user_id', studentId).eq('is_test_data', false)
            .or(`school_id.eq.${schoolId},school_id.is.null`).order('updated_at', { ascending: false }).limit(1000)
          : Promise.resolve({ data: [] as FamilyMasteryObservation[], error: null }),
      ]);
      if (current !== generation.current) return;
      if (checkinResult.error) throw checkinResult.error;
      if (masteryResult.error) throw masteryResult.error;
      setEvidence({
        plans, checkins: checkinResult.data ?? [], mastery: masteryResult.data ?? [],
        partial: plans.length === 50 || (checkinResult.data?.length ?? 0) === 500 || (masteryResult.data?.length ?? 0) === 1000,
      });
      setLoading(false);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'Family evidence is unavailable.');
      setLoading(false);
    }
  }, [schoolId, studentId]);

  useEffect(() => {
    const ref = generation;
    void load();
    return () => { ref.current++; };
  }, [load]);

  const pulse = useMemo(() => buildFamilyPulse(schoolId, studentId, evidence.plans, evidence.checkins, evidence.mastery),
    [schoolId, studentId, evidence]);
  const questions = useMemo(() => familyConversationQuestions(pulse), [pulse]);
  const approved = questions.filter(question => selected.has(question.planId));
  const draft = approved.map(question => `• ${ar ? question.textAr : question.text}`).join('\n');

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setNotice(ar ? 'نُسخت الأسئلة التي اخترتها فقط.' : 'Only your selected questions were copied.');
    } catch {
      setNotice(ar ? 'تعذر النسخ. يمكن نسخ النص الظاهر يدوياً.' : 'Copy failed. You can select the visible text manually.');
    }
  };

  return <section className="space-y-4" aria-label="Family evidence and teacher conversation">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{ar ? 'نبض التعلم وأسئلة المعلم' : 'Learning pulse & teacher conversation'}</h2>
        <p className="text-sm text-muted-foreground">{ar
          ? 'آخر سبعة أيام من الخطط التي شاركها المعلم مع الأسرة فقط؛ لا تظهر تأملات الطالب الخاصة هنا.'
          : 'The last seven days, using only teacher-shared family plans. Private student reflections are not read here.'}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh family evidence"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p className="text-sm text-muted-foreground">{ar ? 'جارٍ تحميل الأدلة…' : 'Loading evidence…'}</p>
      : error ? <p className="text-sm text-muted-foreground">{ar ? 'لا يمكن إصدار نبض موثوق الآن.' : 'A reliable pulse cannot be shown right now.'}</p>
      : evidence.plans.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? 'لا توجد خطط شاركها المعلم مع الأسرة.' : 'No teacher-shared family plans are available.'}</p>
      : <>
        {evidence.partial && <p role="status" className="text-sm text-amber-600">{ar
          ? 'وصلت القراءة إلى حد العرض؛ الأعداد أدناه جزئية وليست شاملة.'
          : 'A display limit was reached; counts below are partial, not comprehensive.'}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            [ar ? 'تسجيلات تدريب الطالب' : 'Learner practice check-ins', pulse.practiceCount],
            [ar ? 'طلبات المساعدة' : 'Help requests', pulse.helpCount],
            [ar ? 'تسجيلات دعم الأسرة' : 'Family support check-ins', pulse.familySupportCount],
          ] as const).map(([label, count]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-2xl">{count}</strong></CardContent></Card>)}
        </div>
        <p className="text-xs text-muted-foreground">{ar
          ? 'التسجيلات إجراءات مُبلّغ عنها، وليست دليلاً على التعلم. فروق تقدير ALE وصفية وليست تأثيراً سببياً.'
          : 'Check-ins are reported actions, not proof of learning. ALE estimate differences are descriptive, not causal impact.'}</p>
        <div className="space-y-2">{pulse.plans.map(plan => <Card key={plan.planId}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{plan.subject} · {plan.topic}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><strong>{ar ? 'هدف المعلم:' : 'Teacher goal:'}</strong> {plan.goal}</p>
            <p>{ar ? 'هذا الأسبوع:' : 'This week:'} {plan.practiceCount} {ar ? 'تدريب' : 'practice'}, {plan.helpCount} {ar ? 'طلب مساعدة' : 'help'}, {plan.familySupportCount} {ar ? 'دعم أسري' : 'family support'}</p>
            <p className="text-muted-foreground">{plan.estimateDelta === null
              ? (ar ? 'لا توجد ملاحظة ALE أحدث قابلة للمقارنة؛ حالة التقدم غير معروفة.' : 'No newer comparable ALE observation; progress is unknown.')
              : (ar
                ? `تقدير ALE: ${Math.round(plan.baselineEstimate! * 100)}% ← ${Math.round(plan.latestEstimate! * 100)}% (${plan.estimateDelta >= 0 ? '+' : ''}${Math.round(plan.estimateDelta * 100)} نقطة). يلزم تحقق مستقل.`
                : `ALE estimate: ${Math.round(plan.baselineEstimate! * 100)}% → ${Math.round(plan.latestEstimate! * 100)}% (${plan.estimateDelta >= 0 ? '+' : ''}${Math.round(plan.estimateDelta * 100)} points). Independent work is still needed.`)}</p>
          </CardContent>
        </Card>)}</div>
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">{ar ? 'جهّز أسئلة لقاء المعلم' : 'Prepare questions for a teacher conversation'}</h3>
          <p className="text-xs text-muted-foreground">{ar
            ? 'لا يُرسل شيء تلقائياً. اختر الأسئلة بنفسك؛ لا تُضمَّن تأملات الطالب الخاصة أو النصوص غير المشتركة.'
            : 'Nothing is sent automatically. Approve each question yourself; private reflections and unshared text are excluded.'}</p>
          {questions.map(question => <label key={question.planId} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox checked={selected.has(question.planId)} onCheckedChange={checked => setSelected(previous => {
              const next = new Set(previous);
              if (checked === true) next.add(question.planId); else next.delete(question.planId);
              return next;
            })} aria-label={`${ar ? 'ضمّن سؤال' : 'Include question'}: ${question.topic}`} />
            <span><span className="block font-medium">{question.subject} · {question.topic}</span>{ar ? question.textAr : question.text}<span className="mt-1 block text-xs text-muted-foreground">{question.basis}</span></span>
          </label>)}
          {approved.length > 0 && <><textarea readOnly className="min-h-24 w-full rounded-md border bg-background p-2 text-sm" value={draft} aria-label="Approved teacher questions" />
            <Button size="sm" variant="outline" onClick={() => void copyDraft()}><ClipboardCheck className="mr-2 h-4 w-4" />{ar ? 'انسخ الأسئلة المختارة' : 'Copy selected questions'}</Button></>}
        </div>
      </>}
  </section>;
}
