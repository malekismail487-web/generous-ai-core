import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type LearningRecord = Database['public']['Tables']['student_learning_records']['Row'];

/** The teacher sees only records specifically addressed to them by RLS. */
export function TeacherLearningInbox({ schoolId }: { schoolId: string }) {
  const { user } = useAuth();
  const { t } = useThemeLanguage();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
    const result = await supabase.from('student_learning_records').select('*')
      .eq('school_id', schoolId).eq('teacher_id', user.id)
      .order('created_at', { ascending: false }).limit(100);
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const rows = result.data ?? [];
    setRecords(rows);
    const studentIds = [...new Set(rows.map(row => row.student_id))];
    if (studentIds.length) {
      const people = await supabase.from('profiles').select('id, full_name')
        .eq('school_id', schoolId).in('id', studentIds);
      if (!people.error) setNames(Object.fromEntries((people.data ?? []).map(person => [person.id, person.full_name])));
    }
    setLoading(false);
    } catch {
      setError(t('Teacher inbox could not be loaded. Please retry.', 'تعذر تحميل صندوق المعلم. حاول مرة أخرى.'));
      setLoading(false);
    }
  }, [schoolId, user, t]);

  useEffect(() => { void load(); }, [load]);

  const reply = async (record: LearningRecord) => {
    const text = (drafts[record.id] ?? record.teacher_reply ?? '').trim();
    if (text.length < 5 || text.length > 2000 || !user) {
      setError(t('Teacher feedback must be 5–2000 characters.', 'يجب أن تتكون ملاحظات المعلم من 5 إلى 2000 حرف.'));
      return;
    }
    setSaving(record.id);
    setError('');
    try {
      const result = await supabase.from('student_learning_records').update({ teacher_reply: text })
        .eq('id', record.id).eq('school_id', schoolId).eq('teacher_id', user.id).select('id').single();
      if (result.error) { setError(result.error.message); return; }
      await load();
    } catch {
      setError(t('Feedback could not be sent. Please retry.', 'تعذر إرسال الملاحظات. حاول مرة أخرى.'));
    } finally {
      setSaving(null);
    }
  };

  return <section className="space-y-4 rounded-2xl border border-foreground/10 p-4">
    <div><h2 className="font-semibold">{t('Learning questions and evidence', 'أسئلة التعلم وأدلته')}</h2>
      <p className="text-xs text-muted-foreground">{t('Student reports are not verified outcomes. Your reply stays attributable to you.', 'تقارير الطلاب ليست نتائج مثبتة. يبقى ردك منسوباً إليك.')}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p className="text-sm text-muted-foreground">{t('Loading…', 'جارٍ التحميل…')}</p> : records.length === 0
      ? <p className="text-sm text-muted-foreground">{t('No records addressed to you.', 'لا توجد سجلات موجهة إليك.')}</p>
      : records.map(record => <article key={record.id} className="space-y-2 rounded-xl border border-foreground/10 p-3">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{record.kind}</Badge>
          <strong>{record.topic}</strong><span className="text-xs text-muted-foreground">{record.subject} · {names[record.student_id] ?? t('Student', 'طالب')}</span>
          {record.support_plan_id && <a className="text-xs underline" href={`#support-plan-${record.support_plan_id}`}>{t('Linked support plan', 'خطة الدعم المرتبطة')}</a>}</div>
        <p className="whitespace-pre-wrap text-sm">{record.body}</p>
        {record.correction && <p className="text-sm"><strong>{t('Student correction:', 'تصحيح الطالب:')}</strong> {record.correction}</p>}
        {record.next_step && <p className="text-sm"><strong>{t('Proposed next check:', 'التحقق المقترح:')}</strong> {record.next_step}</p>}
        {record.teacher_reply ? <p className="rounded-lg bg-primary/10 p-2 text-sm"><strong>{t('Your feedback:', 'ملاحظاتك:')}</strong> {record.teacher_reply}</p> : <>
          <Textarea value={drafts[record.id] ?? ''}
            onChange={event => setDrafts(previous => ({ ...previous, [record.id]: event.target.value }))}
            maxLength={2000} aria-label={t('Teacher feedback', 'ملاحظات المعلم')} />
          <Button size="sm" disabled={saving === record.id} onClick={() => void reply(record)}>{t('Send teacher feedback', 'أرسل ملاحظات المعلم')}</Button>
        </>}
      </article>)}
  </section>;
}
