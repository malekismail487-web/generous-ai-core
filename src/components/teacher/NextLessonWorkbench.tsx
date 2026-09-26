import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  classLessonNeeds, nextLessonDraft, readSavedNextLesson, validNextLessonDraft,
  type LessonLearner, type NextLessonDraft,
} from '@/lib/nextLesson';
import type { SupportPlan } from '@/lib/learningSupport';
import type { Database } from '@/integrations/supabase/types';

type Subject = { id: string; name: string };
type SavedLesson = Database['public']['Tables']['lesson_plans']['Row'];
type Evidence = { subjects: Subject[]; learners: LessonLearner[]; plans: SupportPlan[]; lessons: SavedLesson[]; partial: boolean };
const emptyEvidence = (): Evidence => ({ subjects: [], learners: [], plans: [], lessons: [], partial: false });

const fields: { id: keyof NextLessonDraft; en: string; ar: string }[] = [
  { id: 'objective', en: 'Observable objective', ar: 'هدف قابل للملاحظة' },
  { id: 'prerequisite', en: 'Prerequisite review', ar: 'مراجعة المتطلبات السابقة' },
  { id: 'warmup', en: 'Opening check', ar: 'فحص افتتاحي' },
  { id: 'alternateExplanation', en: 'Different explanation', ar: 'شرح مختلف' },
  { id: 'guidedPractice', en: 'Guided practice', ar: 'تدريب موجه' },
  { id: 'independentCheck', en: 'Independent check', ar: 'فحص مستقل' },
  { id: 'exitTicket', en: 'Exit ticket', ar: 'سؤال ختامي' },
];

export function NextLessonWorkbench({ schoolId, teacherId }: { schoolId: string; teacherId: string }) {
  const { language } = useThemeLanguage();
  const ar = language === 'ar';
  const [evidence, setEvidence] = useState<Evidence>(emptyEvidence);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [draft, setDraft] = useState<NextLessonDraft | null>(null);
  const [savedId, setSavedId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(''); setNotice(''); setEvidence(emptyEvidence());
    setDraft(null); setSavedId(''); setDirty(false); setPublished(false);
    try {
      const [subjectResult, learnerResult, planResult, lessonResult] = await Promise.all([
        supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name').limit(200),
        supabase.from('profiles').select('id, grade_level').eq('school_id', schoolId)
          .eq('user_type', 'student').eq('is_active', true).limit(1000),
        supabase.from('learning_support_plans').select('*').eq('school_id', schoolId)
          .eq('teacher_id', teacherId).eq('status', 'active').order('created_at', { ascending: false }).limit(1000),
        supabase.from('lesson_plans').select('*').eq('school_id', schoolId).eq('teacher_id', teacherId)
          .order('created_at', { ascending: false }).limit(100),
      ]);
      if (current !== generation.current) return;
      const firstError = subjectResult.error || learnerResult.error || planResult.error || lessonResult.error;
      if (firstError) throw firstError;
      setEvidence({
        subjects: subjectResult.data ?? [], learners: learnerResult.data ?? [], plans: planResult.data ?? [],
        lessons: (lessonResult.data ?? []).filter(row => !!readSavedNextLesson(row.content_json)),
        partial: (subjectResult.data?.length ?? 0) === 200 || (learnerResult.data?.length ?? 0) === 1000
          || (planResult.data?.length ?? 0) === 1000 || (lessonResult.data?.length ?? 0) === 100,
      });
      setLoading(false);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'Class evidence is unavailable.');
      setLoading(false);
    }
  }, [schoolId, teacherId]);

  useEffect(() => {
    const ref = generation;
    void load();
    return () => { ref.current++; };
  }, [load]);

  const grades = useMemo(() => [...new Set(evidence.learners.map(item => item.grade_level).filter((value): value is string => !!value))].sort(), [evidence.learners]);
  const subject = evidence.subjects.find(item => item.id === subjectId);
  const needs = useMemo(() => classLessonNeeds(schoolId, teacherId, grade, subject?.name ?? '', evidence.learners, evidence.plans),
    [schoolId, teacherId, grade, subject?.name, evidence]);
  const selectedNeed = needs.find(item => item.topic === topic);

  const selectNeed = (nextTopic: string) => {
    setTopic(nextTopic); setSavedId(''); setDirty(true); setPublished(false); setNotice('');
    const need = needs.find(item => item.topic === nextTopic);
    setDraft(need ? nextLessonDraft(need, grade, ar) : null);
  };

  const edit = (field: keyof NextLessonDraft, value: string) => {
    if (published) return;
    setDraft(previous => previous ? { ...previous, [field]: value } : null);
    setDirty(true); setNotice('');
  };

  const openSaved = (lesson: SavedLesson) => {
    const saved = readSavedNextLesson(lesson.content_json);
    if (!saved || lesson.is_published) return;
    setSubjectId(lesson.subject_id); setGrade(saved.gradeLevel); setTopic(saved.topic);
    setDraft(saved.sections); setSavedId(lesson.id); setDirty(false); setPublished(false);
    setNotice(ar ? 'فُتحت المسودة. يلزم أن تظل الأدلة الحالية مستوفية لحد الخصوصية قبل النشر.'
      : 'Draft opened. Current evidence must still meet the privacy threshold before publication.');
  };

  const save = async () => {
    if (!draft || !selectedNeed || !subject || !validNextLessonDraft(draft) || saving || published) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        school_id: schoolId, teacher_id: teacherId, subject_id: subject.id,
        title: draft.title.trim(), description: `${grade} · ${selectedNeed.topic}`,
        objectives: draft.objective.trim(), pre_learning: draft.prerequisite.trim(),
        strategies: draft.alternateExplanation.trim(),
        activities: [draft.warmup, draft.guidedPractice, draft.independentCheck, draft.exitTicket].join('\n\n'),
        notes: 'Teacher-authored review required. Class-level need was supported by at least three distinct learners; counts do not demonstrate learning impact.',
        content_json: {
          version: 1, kind: 'NEXT_LESSON_EVIDENCE_DRAFT', gradeLevel: grade,
          topic: selectedNeed.topic, sections: draft,
          evidence: {
            minimumDistinctLearners: 3,
            sourceKinds: [
              ...(selectedNeed.alePlanCount ? ['ALE_MASTERY'] : []),
              ...(selectedNeed.observationPlanCount ? ['TEACHER_OBSERVATION'] : []),
            ],
            latestPlanAt: selectedNeed.latestPlanAt,
          },
        },
        is_published: false, is_shareable: false,
      };
      const result = savedId
        ? await supabase.from('lesson_plans').update(payload)
          .eq('id', savedId).eq('school_id', schoolId).eq('teacher_id', teacherId)
          .eq('is_published', false).select('id').single()
        : await supabase.from('lesson_plans').insert(payload).select('id').single();
      if (result.error) throw result.error;
      setSavedId(result.data.id);
      setDirty(false);
      setNotice(ar ? 'حُفظت مسودة غير منشورة. راجعها قبل النشر.' : 'Unpublished draft saved. Review it before publishing.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save draft.');
    } finally { setSaving(false); }
  };

  const publish = async () => {
    if (!savedId || !draft || !selectedNeed || dirty || !validNextLessonDraft(draft) || saving || published) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.from('lesson_plans')
        .update({ is_published: true, publish_date: new Date().toISOString() })
        .eq('id', savedId).eq('school_id', schoolId).eq('teacher_id', teacherId)
        .eq('is_published', false).select('id');
      if (result.error) throw result.error;
      if (result.data?.length !== 1) throw new Error('The saved draft is no longer eligible for publication. Refresh and review it again.');
      setPublished(true);
      setEvidence(previous => ({ ...previous, lessons: previous.lessons.map(row => row.id === savedId ? { ...row, is_published: true } : row) }));
      setNotice(ar ? 'نُشرت الخطة بعد موافقتك. يمكن لطلاب المدرسة عرضها.' : 'Published after your approval. Students in this school may view it.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish draft.');
    } finally { setSaving(false); }
  };

  return <section className="space-y-4" aria-label="Evidence-linked next lesson">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{ar ? 'مصمم الدرس التالي' : 'Next-lesson workbench'}</h2>
        <p className="text-sm text-muted-foreground">{ar
          ? 'تظهر الفجوات المشتركة لثلاثة طلاب على الأقل. المسودة قابلة للتحرير ولا تُنشر تلقائياً.'
          : 'Only needs shared by at least three learners are shown. Drafts are editable and never auto-published.'}</p></div>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh next-lesson evidence"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p className="text-sm text-muted-foreground">{ar ? 'جارٍ تحميل الأدلة…' : 'Loading class evidence…'}</p>
      : error && evidence.subjects.length === 0 ? <p className="text-sm text-muted-foreground">{ar ? 'لا يمكن إنشاء مسودة موثوقة الآن.' : 'A trustworthy draft cannot be made right now.'}</p>
      : <>
        {evidence.partial && <p role="status" className="text-sm text-amber-600">{ar
          ? 'وصلت القراءة إلى حد العرض؛ قد لا تظهر بعض الفجوات. لا تُفسر الغياب على أنه فهم.'
          : 'A display limit was reached; some needs may be missing. Absence is not evidence of understanding.'}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{ar ? 'المادة' : 'Subject'}<select className="mt-1 w-full rounded-md border bg-background p-2" value={subjectId}
            onChange={event => { setSubjectId(event.target.value); setTopic(''); setDraft(null); setSavedId(''); setDirty(false); setPublished(false); }}>
            <option value="">{ar ? 'اختر المادة' : 'Choose subject'}</option>{evidence.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="text-sm">{ar ? 'الصف' : 'Grade'}<select className="mt-1 w-full rounded-md border bg-background p-2" value={grade}
            onChange={event => { setGrade(event.target.value); setTopic(''); setDraft(null); setSavedId(''); setDirty(false); setPublished(false); }}>
            <option value="">{ar ? 'اختر الصف' : 'Choose grade'}</option>{grades.map(item => <option key={item} value={item}>{item}</option>)}
          </select></label>
        </div>
        {subjectId && grade && <label className="block text-sm">{ar ? 'فجوة متكررة' : 'Repeated need'}
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={topic} onChange={event => selectNeed(event.target.value)}>
            <option value="">{needs.length ? (ar ? 'اختر موضوعاً' : 'Choose a topic') : (ar ? 'لا توجد فجوة تستوفي حد الخصوصية' : 'No need meets the privacy threshold')}</option>
            {needs.map(item => <option key={item.topic} value={item.topic}>{item.topic} · {item.learnerCount} {ar ? 'طلاب' : 'learners'}</option>)}
          </select></label>}
        {draft && <Card><CardHeader><CardTitle className="text-base">{ar ? 'راجع وعدّل المسودة' : 'Review and edit the draft'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedNeed ? <p className="text-xs text-muted-foreground">{selectedNeed.learnerCount} {ar ? 'طلاب مختلفون' : 'distinct learners'} · {selectedNeed.alePlanCount} ALE · {selectedNeed.observationPlanCount} {ar ? 'ملاحظات معلم' : 'teacher observations'}. {ar ? 'ليست دليلاً على الفاعلية.' : 'Not evidence of instructional effectiveness.'}</p>
              : <p role="alert" className="text-sm text-amber-600">{ar ? 'لم تعد الأدلة الحالية تستوفي حد الخصوصية؛ لا يمكن حفظ المسودة أو نشرها.' : 'Current evidence no longer meets the privacy threshold; this draft cannot be saved or published.'}</p>}
            <label className="block text-sm">{ar ? 'العنوان' : 'Title'}<Input className="mt-1" value={draft.title} maxLength={1200} disabled={published} onChange={event => edit('title', event.target.value)} /></label>
            {fields.map(field => <label key={field.id} className="block text-sm">{ar ? field.ar : field.en}
              <Textarea className="mt-1" value={draft[field.id]} maxLength={1200} disabled={published} onChange={event => edit(field.id, event.target.value)} />
            </label>)}
            <p className="text-xs text-muted-foreground">{ar
              ? 'احفظ مسودة أولاً. النشر خطوة منفصلة بإقرار المعلم؛ يمكن لطلاب المدرسة رؤيتها بعد ذلك.'
              : 'Save an unpublished draft first. Publishing requires a separate teacher action and makes it visible to students in this school.'}</p>
            <div className="flex flex-wrap gap-2"><Button disabled={saving || published || !selectedNeed || (!dirty && !!savedId) || !validNextLessonDraft(draft)} onClick={() => void save()}>{savedId ? (ar ? 'احفظ التعديلات' : 'Save edits') : (ar ? 'احفظ مسودة' : 'Save unpublished draft')}</Button>
              {savedId && <Button variant="outline" disabled={saving || dirty || !selectedNeed || published} onClick={() => void publish()}>{published ? (ar ? 'منشور' : 'Published') : (ar ? 'وافق وانشر' : 'Approve and publish')}</Button>}
            </div>
          </CardContent></Card>}
        {evidence.lessons.length > 0 && <div className="space-y-2"><h3 className="font-semibold">{ar ? 'مسودات وخطط سابقة' : 'Saved drafts and plans'}</h3>
          {evidence.lessons.map(lesson => <div key={lesson.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="min-w-0 flex-1">{lesson.title} · {lesson.is_published ? (ar ? 'منشور' : 'Published') : (ar ? 'مسودة' : 'Draft')}</span>
            {!lesson.is_published && <Button size="sm" variant="outline" onClick={() => openSaved(lesson)}>{ar ? 'افتح للمراجعة' : 'Open for review'}</Button>}
          </div>)}
        </div>}
      </>}
  </section>;
}
