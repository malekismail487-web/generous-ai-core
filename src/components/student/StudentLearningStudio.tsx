import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CalendarClock, ClipboardCheck, Compass, HelpCircle, NotebookPen, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';
import type { DueReview, WeakTopic } from '@/lib/mastery';
import type { SupportPlan } from '@/lib/learningSupport';
import {
  alignConcepts, buildSchoolActions, learningPrompt, mappedCurriculumPrompt, teacherPlanPrompt,
  type ConceptMapRow, type SchoolAssignment, type StandardRow, type StudioTool,
} from '@/lib/learningStudio';

type LearningRecord = Database['public']['Tables']['student_learning_records']['Row'];
type Teacher = { id: string; full_name: string; assigned: boolean; subjects: string[] };
type StudioData = {
  assignments: SchoolAssignment[];
  submitted: Set<string>;
  plans: SupportPlan[];
  due: DueReview[];
  weak: WeakTopic[];
  mappings: ConceptMapRow[];
  standards: StandardRow[];
  records: LearningRecord[];
  teachers: Teacher[];
};
const emptyData = (): StudioData => ({
  assignments: [], submitted: new Set(), plans: [], due: [], weak: [],
  mappings: [], standards: [], records: [], teachers: [],
});
const TOOLS: { id: StudioTool; en: string; ar: string; icon: typeof BookOpenCheck; detail: string; detailAr: string }[] = [
  { id: 'priorities', en: 'School priorities', ar: 'أولويات المدرسة', icon: ClipboardCheck, detail: 'Assignments, teacher plans and ALE review in one queue', detailAr: 'واجبات وخطط المعلمين ومراجعات المحرك في قائمة واحدة' },
  { id: 'review', en: 'Recall sprint', ar: 'مراجعة الاسترجاع', icon: CalendarClock, detail: 'Practice the concepts actually due for review', detailAr: 'تدرب على المفاهيم المستحقة للمراجعة' },
  { id: 'curriculum', en: 'Curriculum compass', ar: 'بوصلة المنهج', icon: Compass, detail: 'Connect ALE gaps to verified school standards', detailAr: 'اربط نقاط الضعف بمعايير المنهج الموثقة' },
  { id: 'questions', en: 'Ask my teacher', ar: 'اسأل معلمي', icon: HelpCircle, detail: 'Route a specific learning question to the right teacher', detailAr: 'أرسل سؤالاً تعليمياً محدداً إلى المعلم المعني' },
  { id: 'mistakes', en: 'Mistake notebook', ar: 'دفتر الأخطاء', icon: NotebookPen, detail: 'Record, correct and retest a misconception', detailAr: 'سجّل الفكرة الخاطئة وصححها وأعد اختبارها' },
  { id: 'portfolio', en: 'Evidence portfolio', ar: 'ملف أدلة التعلم', icon: BookOpenCheck, detail: 'Show what you tried; teacher feedback stays distinct', detailAr: 'وثّق محاولاتك مع فصل ملاحظات المعلم عنها' },
];

interface Props {
  onNavigate: (action: 'assignments' | 'weeklyplan' | 'subjects') => void;
  onTutorPrompt: (prompt: string) => void;
}

export function StudentLearningStudio({ onNavigate, onTutorPrompt }: Props) {
  const { user } = useAuth();
  const { profile, school } = useRoleGuard();
  const { t, language } = useThemeLanguage();
  const [tool, setTool] = useState<StudioTool>('priorities');
  const [data, setData] = useState<StudioData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState('');
  const [correction, setCorrection] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!user || !school || !profile || profile.user_type !== 'student') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
    const schoolId = school.id;
    const assignmentResult = await supabase.from('assignments')
      .select('id, teacher_id, title, subject, grade_level, due_date, class_id')
      .eq('school_id', schoolId).order('due_date', { ascending: true }).limit(200);
    const assignmentIds = (assignmentResult.data ?? []).map(item => item.id);
    const submissionBatches = Array.from({ length: Math.ceil(assignmentIds.length / 50) }, (_, index) => assignmentIds.slice(index * 50, (index + 1) * 50));
    const submissionPromise = Promise.all(submissionBatches.map(ids => supabase.from('submissions')
      .select('assignment_id').eq('student_id', user.id).in('assignment_id', ids))).then(results => ({
      data: results.flatMap(result => result.data ?? []),
      error: results.find(result => result.error)?.error ?? null,
    }));
    const [submissionResult, planResult, dueResult, weakResult, mappingResult, standardResult, recordResult, classResult] = await Promise.all([
      submissionPromise,
      supabase.from('learning_support_plans').select('*').eq('school_id', schoolId).eq('student_id', user.id)
        .order('created_at', { ascending: false }).limit(100),
      supabase.rpc('get_due_reviews', { p_user_id: user.id, p_limit: 30, p_school_id: schoolId }),
      supabase.rpc('get_weakest_topics', { p_user_id: user.id, p_subject: null, p_limit: 30, p_school_id: schoolId }),
      supabase.from('concept_standard_map').select('subject, concept_key, standard_id, alignment_strength, school_id')
        .or(`school_id.eq.${schoolId},school_id.is.null`).limit(500),
      supabase.from('curriculum_standards').select('id, code, description, framework, school_id')
        .eq('is_active', true).or(`school_id.eq.${schoolId},school_id.is.null`).limit(500),
      supabase.from('student_learning_records').select('*').eq('school_id', schoolId).eq('student_id', user.id)
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('student_classes').select('class_id').eq('student_id', user.id).limit(100),
    ]);
    if (generation !== loadGeneration.current) return;
    const failures = [assignmentResult, submissionResult, planResult, dueResult, weakResult,
      mappingResult, standardResult, recordResult, classResult].filter(result => result.error).map(result => result.error?.message);
    if (failures.length) {
      setError(t('Some school evidence is unavailable. No missing data is treated as a passed task.',
        'بعض أدلة المدرسة غير متاحة. لن نعامل البيانات المفقودة كمهام مكتملة.') + ` ${failures.join(' · ')}`);
    }
    const classIds = new Set((classResult.data ?? []).map(row => row.class_id));
    const assignments = ((assignmentResult.data ?? []) as SchoolAssignment[]).filter(item =>
      (!profile.grade_level || !item.grade_level || item.grade_level === 'All' || item.grade_level === profile.grade_level)
      && (!item.class_id || classIds.has(item.class_id)));
    const plans = (planResult.data ?? []) as SupportPlan[];
    const teacherLabels = new Map<string, Teacher>();
    if (profile.student_teacher_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.student_teacher_id)) {
      teacherLabels.set(profile.student_teacher_id, { id: profile.student_teacher_id, full_name: t('Assigned teacher', 'المعلم المكلف'), assigned: true, subjects: [] });
    }
    for (const item of [...assignments, ...plans]) {
      const existing = teacherLabels.get(item.teacher_id);
      if (existing) existing.subjects.push(item.subject);
      else teacherLabels.set(item.teacher_id, { id: item.teacher_id, full_name: `${item.subject} ${t('teacher', 'معلم')}`, assigned: false, subjects: [item.subject] });
    }
    setData({
      assignments,
      submitted: new Set((submissionResult.data ?? []).map(row => row.assignment_id)),
      plans,
      due: (dueResult.data ?? []) as DueReview[],
      weak: (weakResult.data ?? []) as WeakTopic[],
      mappings: (mappingResult.data ?? []) as ConceptMapRow[],
      standards: (standardResult.data ?? []) as StandardRow[],
      records: (recordResult.data ?? []) as LearningRecord[],
      teachers: [...teacherLabels.values()],
    });
    setLoading(false);
    } catch {
      if (generation === loadGeneration.current) {
        setError(t('School evidence could not be loaded. Please retry.', 'تعذر تحميل أدلة المدرسة. حاول مرة أخرى.'));
        setLoading(false);
      }
    }
  }, [user, school, profile, t]);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo(() => buildSchoolActions(data.assignments, data.submitted, data.plans, data.due), [data]);
  const alignments = useMemo(() => alignConcepts(data.weak, data.mappings, data.standards, school?.id ?? ''), [data, school?.id]);
  const subjects = useMemo(() => [...new Set([
    ...data.assignments.map(item => item.subject), ...data.plans.map(item => item.subject),
    ...data.weak.map(item => item.subject),
  ].filter(Boolean))].sort(), [data]);
  const availableTeachers = useMemo(() => data.teachers.filter(teacher => teacher.assigned || !subject.trim()
    || teacher.subjects.some(value => value.trim().toLocaleLowerCase() === subject.trim().toLocaleLowerCase())), [data.teachers, subject]);
  const selectedTeacherId = availableTeachers.some(teacher => teacher.id === teacherId) ? teacherId : '';

  const saveRecord = async (kind: 'QUESTION' | 'MISCONCEPTION' | 'EVIDENCE') => {
    if (!user || !school || saving) return;
    if (!subject.trim() || !topic.trim() || body.trim().length < 10
      || (kind === 'QUESTION' && !selectedTeacherId)
      || (kind === 'MISCONCEPTION' && correction.trim().length < 10)
      || (kind === 'EVIDENCE' && nextStep.trim().length < 5)) {
      setError(t('Fill every required field with a specific explanation.', 'أكمل الحقول المطلوبة بشرح محدد.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('student_learning_records').insert({
        school_id: school.id, student_id: user.id, teacher_id: selectedTeacherId || null, kind,
        subject: subject.trim(), topic: topic.trim(), body: body.trim(),
        correction: kind === 'MISCONCEPTION' ? correction.trim() : null,
        next_step: kind === 'EVIDENCE' ? nextStep.trim() : null,
      });
      if (insertError) { setError(insertError.message); return; }
      setNotice(t('Saved. A self-report is not a verified learning result.', 'تم الحفظ. التقرير الذاتي ليس نتيجة تعلم مثبتة.'));
      setBody(''); setCorrection(''); setNextStep('');
      await load();
    } catch {
      setError(t('The learning record could not be saved. Please retry.', 'تعذر حفظ سجل التعلم. حاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  if (!school || profile?.user_type !== 'student') return <p className="p-6 text-sm">{t('This workspace needs an active school learner account.', 'تتطلب هذه المساحة حساب طالب في مدرسة نشطة.')}</p>;
  const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US') : t('No deadline', 'بلا موعد');
  const entries = data.records.filter(entry => entry.kind === (tool === 'questions' ? 'QUESTION' : tool === 'mistakes' ? 'MISCONCEPTION' : 'EVIDENCE'));

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto px-4 pb-24 pt-16">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t('School × adaptive intelligence', 'المدرسة × الذكاء التكيفي')}</p>
            <h1 className="text-2xl font-bold">{t('Learning Studio', 'استوديو التعلم')}</h1>
            <p className="text-sm text-muted-foreground">{t('Six connected tools. School facts, ALE signals and your own reports stay visibly distinct.', 'ست أدوات مترابطة. تبقى حقائق المدرسة وإشارات المحرك وتقاريرك الشخصية منفصلة بوضوح.')}</p></div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />{t('Refresh evidence', 'تحديث الأدلة')}</Button>
        </div>
        {error && <div role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-foreground/15 p-3 text-sm">{notice}</div>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(item => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => { setTool(item.id); setError(''); setNotice(''); }}
              aria-pressed={tool === item.id}
              className={`rounded-2xl border p-4 text-left transition-colors ${tool === item.id ? 'border-primary bg-primary/10' : 'border-foreground/10 bg-foreground/[0.03] hover:border-foreground/30'}`}>
              <Icon className="mb-2 h-5 w-5" /><span className="block font-semibold">{t(item.en, item.ar)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t(item.detail, item.detailAr)}</span>
            </button>;
          })}
        </div>
        {loading ? <p className="py-8 text-sm text-muted-foreground">{t('Loading school evidence…', 'جارٍ تحميل أدلة المدرسة…')}</p> : (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 sm:p-6">
            {tool === 'priorities' && <section className="space-y-3">
              <h2 className="font-semibold">{t('What needs attention', 'ما يحتاج إلى اهتمام')}</h2>
              <p className="text-xs text-muted-foreground">{t('Ranked by published deadlines and ALE review timing—not by an invented AI score.', 'مرتبة وفق مواعيد المدرسة ومراجعات المحرك، لا وفق درجة مختلقة.')}</p>
              {actions.length === 0 ? <Empty>{t('No pending assignments, active teacher plans or due reviews are visible.', 'لا تظهر واجبات معلقة أو خطط معلمين نشطة أو مراجعات مستحقة.')}</Empty> :
                actions.slice(0, 20).map(action => <div key={action.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 p-3">
                  <div className="min-w-0 flex-1"><p className="font-medium">{action.title}</p><p className="text-xs text-muted-foreground">{action.subject} · {action.explanation} · {formatDate(action.deadline)}</p></div>
                  {action.kind === 'support' && <Button size="sm" variant="outline" onClick={() => {
                    const plan = data.plans.find(item => `support:${item.id}` === action.id);
                    if (plan) onTutorPrompt(teacherPlanPrompt(plan));
                  }}>{t('Practice teacher goal', 'تدرب على هدف المعلم')}</Button>}
                  <Button size="sm" variant="outline" onClick={() => action.kind === 'review'
                    ? onTutorPrompt(learningPrompt(action.subject, action.topic ?? '', 'review'))
                    : onNavigate(action.kind === 'assignment' ? 'assignments' : 'weeklyplan')}>
                    {action.kind === 'review' ? t('Start recall', 'ابدأ التذكر') : t('Open', 'افتح')}
                  </Button>
                </div>)}
            </section>}
            {tool === 'review' && <section className="space-y-3">
              <h2 className="font-semibold">{t('ALE recall sprint', 'جولة استرجاع من المحرك التكيفي')}</h2>
              <p className="text-xs text-muted-foreground">{t('A review is due because of observed practice history. The tutor will ask, wait and give feedback; opening it never marks it mastered.', 'المراجعة مستحقة بناءً على سجل الممارسة. يسأل المعلم الرقمي وينتظر ويعطي ملاحظات؛ فتحها لا يعني إتقانها.')}</p>
              {data.due.length === 0 ? <Empty>{t('No due reviews are visible, or ALE evidence is unavailable.', 'لا تظهر مراجعات مستحقة، أو أن أدلة المحرك غير متاحة.')}</Empty> :
                data.due.map(item => <div key={`${item.subject}:${item.topic}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 p-3">
                  <div className="flex-1"><p className="font-medium">{item.topic}</p><p className="text-xs text-muted-foreground">{item.subject} · {Math.round(item.mastery_score * 100)}% {t('last estimated mastery', 'تقدير الإتقان السابق')}</p></div>
                  <Button size="sm" onClick={() => onTutorPrompt(learningPrompt(item.subject, item.topic, 'review'))}>{t('Quiz me', 'اختبرني')}</Button>
                </div>)}
            </section>}
            {tool === 'curriculum' && <section className="space-y-3">
              <h2 className="font-semibold">{t('My concepts in the school curriculum', 'مفاهيمي في المنهج المدرسي')}</h2>
              {alignments.length === 0 ? <Empty>{t('No ALE concept observations are visible yet.', 'لا تظهر ملاحظات مفاهيم من المحرك بعد.')}</Empty> :
                alignments.map(item => <div key={`${item.subject}:${item.topic}`} className="rounded-xl border border-foreground/10 p-3">
                  <div className="flex flex-wrap items-center gap-2"><strong>{item.topic}</strong><Badge variant="outline">{item.subject}</Badge><Badge variant={item.source === 'MAPPED' ? 'secondary' : 'outline'}>{item.source === 'MAPPED' ? item.standardCode : t('Unmapped', 'غير مربوط')}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('ALE estimate', 'تقدير المحرك')}: {Math.round(item.score * 100)}% · {item.framework ?? t('No verified mapping', 'لا يوجد ربط موثق')}</p>
                  {item.standardDescription && <p className="mt-2 text-sm">{item.standardDescription}</p>}
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => onTutorPrompt(mappedCurriculumPrompt(item))}>{t('Learn this', 'تعلم هذا')}</Button>
                </div>)}
            </section>}
            {(tool === 'questions' || tool === 'mistakes' || tool === 'portfolio') && <section className="space-y-4">
              <h2 className="font-semibold">{t(TOOLS.find(item => item.id === tool)?.en ?? '', TOOLS.find(item => item.id === tool)?.ar ?? '')}</h2>
              <p className="text-xs text-muted-foreground">{tool === 'questions'
                ? t('Questions go only to a linked school teacher, never an arbitrary account.', 'تذهب الأسئلة فقط إلى معلم مرتبط بالمدرسة، لا إلى حساب عشوائي.')
                : t('Your entry is a self-report. A teacher reply is separate feedback, not automatic proof of mastery.', 'إدخالك تقرير ذاتي. رد المعلم ملاحظات منفصلة، وليس إثباتاً تلقائياً للإتقان.')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">{t('Subject', 'المادة')}<Input list="studio-subjects" value={subject} onChange={event => setSubject(event.target.value)} maxLength={120} className="mt-1" /></label>
                <datalist id="studio-subjects">{subjects.map(value => <option key={value} value={value} />)}</datalist>
                <label className="text-sm">{t('Topic', 'الموضوع')}<Input value={topic} onChange={event => setTopic(event.target.value)} maxLength={180} className="mt-1" /></label>
              </div>
              <label className="block text-sm">{tool === 'questions' ? t('What exactly is unclear?', 'ما الذي لم تفهمه بالتحديد؟') : tool === 'mistakes' ? t('What did I think, and where did it fail?', 'ما الفكرة التي اعتقدتها وأين أخفقت؟') : t('What did I try or produce?', 'ماذا حاولت أو أنجزت؟')}
                <Textarea value={body} onChange={event => setBody(event.target.value)} maxLength={2000} className="mt-1" /></label>
              {tool === 'mistakes' && <label className="block text-sm">{t('My corrected explanation', 'شرحي المصحح')}<Textarea value={correction} onChange={event => setCorrection(event.target.value)} maxLength={2000} className="mt-1" /></label>}
              {tool === 'portfolio' && <label className="block text-sm">{t('What should be checked next?', 'ما الذي ينبغي التحقق منه بعد ذلك؟')}<Input value={nextStep} onChange={event => setNextStep(event.target.value)} maxLength={500} className="mt-1" /></label>}
              {availableTeachers.length > 0 && <label className="block text-sm">{t('School teacher', 'معلم المدرسة')} {tool !== 'questions' && t('(optional)', '(اختياري)')}
                <select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={selectedTeacherId} onChange={event => setTeacherId(event.target.value)}>
                  <option value="">{t('Private / choose teacher', 'خاص / اختر معلماً')}</option>
                  {availableTeachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
                </select></label>}
              {tool === 'questions' && availableTeachers.length === 0 && <p role="status" className="text-sm text-muted-foreground">{t('No linked teacher is available for this subject; ask your school to assign one.', 'لا يوجد معلم مرتبط لهذه المادة؛ اطلب من المدرسة تعيين معلم.')}</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving || (tool === 'questions' && !selectedTeacherId)} onClick={() => void saveRecord(tool === 'questions' ? 'QUESTION' : tool === 'mistakes' ? 'MISCONCEPTION' : 'EVIDENCE')}>{saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save school learning record', 'احفظ سجل التعلم')}</Button>
                {tool === 'mistakes' && subject && topic && <Button variant="outline" onClick={() => onTutorPrompt(learningPrompt(subject, topic, 'correct'))}>{t('Test my correction with Lumina', 'اختبر تصحيحي مع لومينا')}</Button>}
              </div>
              <div className="space-y-2 border-t border-foreground/10 pt-4">
                <h3 className="text-sm font-semibold">{t('Previous entries', 'الإدخالات السابقة')}</h3>
                {entries.length === 0 ? <Empty>{t('No entries yet.', 'لا توجد إدخالات بعد.')}</Empty> : entries.map(entry => <article key={entry.id} className="rounded-xl border border-foreground/10 p-3 text-sm">
                  <div className="flex flex-wrap gap-2"><strong>{entry.topic}</strong><Badge variant="outline">{entry.subject}</Badge><span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span></div>
                  <p className="mt-2 whitespace-pre-wrap">{entry.body}</p>
                  {entry.correction && <p className="mt-2"><strong>{t('Correction:', 'التصحيح:')}</strong> {entry.correction}</p>}
                  {entry.next_step && <p className="mt-2"><strong>{t('Next check:', 'التحقق القادم:')}</strong> {entry.next_step}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{t('Student self-report', 'تقرير ذاتي من الطالب')}{entry.teacher_id ? ` · ${t('Shared with school teacher', 'مشارك مع معلم المدرسة')}` : ''}</p>
                  {entry.teacher_reply && <p className="mt-2 rounded-lg bg-primary/10 p-2"><strong>{t('Teacher feedback:', 'ملاحظات المعلم:')}</strong> {entry.teacher_reply}</p>}
                </article>)}
              </div>
            </section>}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-foreground/15 p-5 text-sm text-muted-foreground">{children}</p>;
}
