import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Target, BookOpenCheck } from 'lucide-react';
import {
  isAllowedSupportCheckin, makeLearningSupportProposal, suggestedMasteryTarget,
  summarizeSupport, type SupportCheckin, type SupportPlan, type SupportRole,
} from '@/lib/learningSupport';
import type { WeakTopic } from '@/lib/mastery';
import { LearningTransferPanel } from './LearningTransferPanel';
import { transferSchoolSummary, type TransferCheck, type TransferVerdict } from '@/lib/learningTransfer';
import type { Database } from '@/integrations/supabase/types';
import { teacherSupportQueue, type TeacherAttentionReason } from '@/lib/teacherSupportTriage';

type Learner = { id: string; full_name: string | null; grade_level: string | null };
type LinkedQuestion = Database['public']['Tables']['student_learning_records']['Row'];

interface Props {
  role: SupportRole;
  schoolId: string;
  studentId?: string;
  onPractice?: () => void;
}

type MasteryObservation = { user_id: string; subject: string; topic: string; school_id: string | null; mastery_score: number; updated_at: string };
type SchoolTransferSummary = {
  evidence_state: string;
  learner_count: number | null;
  plans_with_checks: number | null;
  awaiting_learner: number | null;
  awaiting_teacher: number | null;
  demonstrated_on_one_check: number | null;
  not_yet_demonstrated: number | null;
  inconclusive: number | null;
};
type GradeAttentionSummary = {
  grade_label: string;
  learner_count: number;
  learners_with_active_plans: number;
  learners_with_recent_help: number;
  learners_awaiting_teacher_reply: number;
  learners_with_reviewed_transfer: number;
};
const masteryKey = (student: string, subject: string, topic: string) => `${student}\u0000${subject}\u0000${topic}`;
const conceptChoice = (item: WeakTopic) => JSON.stringify([item.subject, item.topic]);
const attentionLabels: Record<TeacherAttentionReason, { en: string; ar: string }> = {
  TRANSFER_AWAITING_REVIEW: { en: 'Review submitted transfer check', ar: 'راجع فحص الانتقال المرسل' },
  QUESTION_AWAITING_REPLY: { en: 'Reply to learner question', ar: 'أجب عن سؤال الطالب' },
  RECENT_HELP_SIGNAL: { en: 'Recent help signal', ar: 'طلب مساعدة حديث' },
  PLAN_AWAITING_REVIEW: { en: 'Review support plan', ar: 'راجع خطة الدعم' },
  OVERDUE_PLAN: { en: 'Review date passed', ar: 'تجاوز موعد المراجعة' },
  TRANSFER_NOT_YET: { en: 'Transfer not yet demonstrated', ar: 'لم يُظهر الفهم بعد في الفحص' },
};

export function LearningSupportPanel({ role, schoolId, studentId, onPractice }: Props) {
  const { user } = useAuth();
  const { language } = useThemeLanguage();
  const ar = language === 'ar';
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [checkins, setCheckins] = useState<SupportCheckin[]>([]);
  const [transferChecks, setTransferChecks] = useState<TransferCheck[]>([]);
  const [transferLoadFailed, setTransferLoadFailed] = useState(false);
  const [schoolTransferSummary, setSchoolTransferSummary] = useState<SchoolTransferSummary | null>(null);
  const [gradeAttention, setGradeAttention] = useState<GradeAttentionSummary[] | null>(null);
  const [linkedQuestions, setLinkedQuestions] = useState<LinkedQuestion[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [questionLoadFailed, setQuestionLoadFailed] = useState(false);
  const [checkinLoadFailed, setCheckinLoadFailed] = useState(false);
  const [mastery, setMastery] = useState<Map<string, MasteryObservation>>(new Map());
  const [learners, setLearners] = useState<Learner[]>([]);
  const [selectedLearner, setSelectedLearner] = useState('');
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [source, setSource] = useState<'ALE_MASTERY' | 'TEACHER_OBSERVATION'>('ALE_MASTERY');
  const [selectedConcept, setSelectedConcept] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [learnerStep, setLearnerStep] = useState('');
  const [familyStep, setFamilyStep] = useState('');
  const [familyVisible, setFamilyVisible] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    if (!user || !schoolId) return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    setTransferLoadFailed(false);
    setQuestionLoadFailed(false);
    setCheckinLoadFailed(false);
    let query = supabase.from('learning_support_plans').select('*').eq('school_id', schoolId);
    if (role === 'teacher') query = query.eq('teacher_id', user.id);
    if (role === 'student') query = query.eq('student_id', user.id);
    if (role === 'family' && studentId) query = query.eq('student_id', studentId).eq('family_visible', true);
    const [planResult, learnerResult, schoolTransferResult, gradeAttentionResult] = await Promise.all([
      query.order('created_at', { ascending: false }).limit(100),
      role === 'teacher'
        ? supabase.from('profiles').select('id, full_name, grade_level').eq('school_id', schoolId).eq('user_type', 'student').eq('is_active', true).order('full_name').limit(200)
        : Promise.resolve({ data: [] as Learner[], error: null }),
      role === 'admin'
        ? supabase.rpc('get_school_transfer_summary', { p_school_id: schoolId })
        : Promise.resolve({ data: null, error: null }),
      role === 'admin'
        ? supabase.rpc('get_school_learning_attention_by_grade', { p_school_id: schoolId })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (generation !== loadGeneration.current) return;
    setSchoolTransferSummary(role === 'admin' && !schoolTransferResult.error
      ? (schoolTransferResult.data?.[0] ?? null) as SchoolTransferSummary | null : null);
    if (schoolTransferResult.error) setError(schoolTransferResult.error.message);
    setGradeAttention(role === 'admin' && !gradeAttentionResult.error
      ? (gradeAttentionResult.data ?? []) as GradeAttentionSummary[] : null);
    if (gradeAttentionResult.error) setError(gradeAttentionResult.error.message);
    if (planResult.error) {
      setError(planResult.error.message);
      setPlans([]);
      setCheckins([]);
      setTransferChecks([]);
      setTransferLoadFailed(true);
      setLinkedQuestions([]);
      setQuestionLoadFailed(true);
      setCheckinLoadFailed(true);
    } else {
      const rows = planResult.data ?? [];
      setPlans(rows);
      if (rows.length) {
        const [checkinResult, transferResult, questionResult] = await Promise.all([
          supabase.from('learning_support_checkins')
            .select('*').in('plan_id', rows.map(row => row.id)).order('created_at', { ascending: false }).limit(500),
          role === 'teacher' || role === 'student'
            ? supabase.from('learning_support_transfer_checks').select('*')
              .in('plan_id', rows.map(row => row.id)).order('created_at', { ascending: false }).limit(300)
            : Promise.resolve({ data: [] as TransferCheck[], error: null }),
          role === 'teacher' || role === 'student'
            ? supabase.from('student_learning_records').select('*')
              .eq(role === 'teacher' ? 'teacher_id' : 'student_id', user.id)
              .in('support_plan_id', rows.map(row => row.id))
              .order('created_at', { ascending: false }).limit(300)
            : Promise.resolve({ data: [] as LinkedQuestion[], error: null }),
        ]);
        if (generation !== loadGeneration.current) return;
        if (checkinResult.error) { setError(checkinResult.error.message); setCheckinLoadFailed(true); }
        setCheckins(checkinResult.data ?? []);
        if (transferResult.error) { setError(transferResult.error.message); setTransferLoadFailed(true); }
        setTransferChecks((transferResult.data ?? []) as TransferCheck[]);
        if ((transferResult.data?.length ?? 0) === 300) { setError('Transfer checks reached the 300-record display limit; older reviews may be unavailable.'); setTransferLoadFailed(true); }
        if (questionResult.error) { setError(questionResult.error.message); setQuestionLoadFailed(true); }
        setLinkedQuestions((questionResult.data ?? []) as LinkedQuestion[]);
        if ((questionResult.data?.length ?? 0) === 300) { setError('Support questions reached the 300-record display limit; older replies may be unavailable.'); setQuestionLoadFailed(true); }
        if ((checkinResult.data?.length ?? 0) === 500) { setError('Support check-ins reached the 500-record display limit; older help signals may be unavailable.'); setCheckinLoadFailed(true); }
        const aleLearners = [...new Set(rows.filter(row => row.source_kind === 'ALE_MASTERY').map(row => row.student_id))];
        if (aleLearners.length) {
          const masteryResult = await supabase.from('concept_mastery')
            .select('user_id, subject, topic, school_id, mastery_score, updated_at')
            .in('user_id', aleLearners).eq('is_test_data', false)
            .order('updated_at', { ascending: false }).limit(2000);
          if (generation !== loadGeneration.current) return;
          if (masteryResult.error) setError(masteryResult.error.message);
          const current = new Map<string, MasteryObservation>();
          for (const observation of masteryResult.data ?? []) {
            if (observation.school_id !== null && observation.school_id !== schoolId) continue;
            const key = masteryKey(observation.user_id, observation.subject, observation.topic);
            if (!current.has(key)) current.set(key, observation);
          }
          setMastery(current);
          if ((masteryResult.data?.length ?? 0) === 2000) setError('ALE comparison reached its 2,000-record display limit; some current scores may be unavailable.');
        } else setMastery(new Map());
      } else { setCheckins([]); setTransferChecks([]); setLinkedQuestions([]); setMastery(new Map()); }
    }
    if (learnerResult.error) setError(learnerResult.error.message);
    setLearners(learnerResult.data ?? []);
    setLoading(false);
  }, [role, schoolId, studentId, user]);

  useEffect(() => {
    const generationRef = loadGeneration;
    void load();
    return () => { generationRef.current++; };
  }, [load]);

  useEffect(() => {
    if (role !== 'teacher' || !selectedLearner) { setWeak([]); return; }
    let current = true;
    void supabase.rpc('get_weakest_topics', {
      p_user_id: selectedLearner, p_subject: null, p_limit: 15, p_school_id: schoolId,
    }).then(({ data, error: rpcError }) => {
      if (!current) return;
      setWeak((data ?? []) as WeakTopic[]);
      if (rpcError) setError(rpcError.message);
    });
    return () => { current = false; };
  }, [role, selectedLearner, schoolId]);

  const pickConcept = (key: string) => {
    setSelectedConcept(key);
    const found = weak.find(item => conceptChoice(item) === key);
    if (!found) return;
    const proposal = makeLearningSupportProposal(schoolId, selectedLearner, found.subject, found.topic, Number(found.mastery_score));
    setSubject(found.subject);
    setTopic(found.topic);
    setGoal(proposal.proposedGoal);
    setLearnerStep(proposal.proposedLearnerStep);
  };

  const createPlan = async () => {
    if (!user || role !== 'teacher' || !selectedLearner) return;
    setError(''); setNotice(''); setSaving(true);
    const chosen = weak.find(item => conceptChoice(item) === selectedConcept);
    if (source === 'ALE_MASTERY' && !chosen) {
      setError('Choose a measured ALE concept, or select teacher observation.'); setSaving(false); return;
    }
    const target = source === 'ALE_MASTERY' ? suggestedMasteryTarget(Number(chosen!.mastery_score)) : null;
    const { error: saveError } = await supabase.from('learning_support_plans').insert({
      school_id: schoolId, student_id: selectedLearner, teacher_id: user.id,
      subject: subject.trim(), topic: topic.trim(), goal: goal.trim(), learner_step: learnerStep.trim(),
      family_step: familyVisible ? familyStep.trim() : null, family_visible: familyVisible,
      source_kind: source, baseline_mastery: source === 'ALE_MASTERY' ? Number(chosen!.mastery_score) : null,
      target_mastery: target, due_at: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
    });
    if (saveError) setError(saveError.message);
    else { setNotice('Support plan created. Its ALE baseline is verified by the database.'); await load(); }
    setSaving(false);
  };

  const recordCheckin = async (planId: string, kind: 'PRACTICED' | 'NEEDS_HELP' | 'FAMILY_SUPPORTED') => {
    if (!user || !isAllowedSupportCheckin(role, kind)) return;
    setSaving(true); setError(''); setNotice('');
    const { error: writeError } = await supabase.from('learning_support_checkins').insert({ plan_id: planId, actor_id: user.id, kind });
    if (writeError) setError(writeError.message);
    else { setNotice('Check-in recorded. Your teacher can see the update.'); await load(); }
    setSaving(false);
  };

  const askSupportQuestion = async (plan: SupportPlan) => {
    const body = (questionDrafts[plan.id] ?? '').trim();
    if (!user || role !== 'student' || plan.student_id !== user.id || plan.status !== 'active' || saving) return;
    if (body.length < 10 || body.length > 2000) {
      setError(ar ? 'اكتب سؤالاً من 10 إلى 2000 حرف.' : 'Describe the difficulty in 10–2000 characters.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: writeError } = await supabase.from('student_learning_records').insert({
        support_plan_id: plan.id, school_id: schoolId, student_id: user.id,
        teacher_id: plan.teacher_id, kind: 'QUESTION', subject: plan.subject,
        topic: plan.topic, body,
      });
      if (writeError) throw writeError;
      setQuestionDrafts(current => ({ ...current, [plan.id]: '' }));
      setNotice(ar ? 'أُرسل سؤالك للمعلم المرتبط بالخطة.' : 'Your question was sent to the teacher responsible for this plan.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'تعذر إرسال السؤال.' : 'Could not send the question.'));
    } finally { setSaving(false); }
  };

  const setPlanStatus = async (planId: string, status: 'active' | 'review' | 'closed') => {
    if (!user || role !== 'teacher') return;
    setSaving(true); setError('');
    const { error: writeError } = await supabase.from('learning_support_plans')
      .update({ status, reviewed_at: status === 'active' ? null : new Date().toISOString() })
      .eq('id', planId).eq('teacher_id', user.id);
    if (writeError) setError(writeError.message);
    else await load();
    setSaving(false);
  };

  const createTransferCheck = async (planId: string, prompt: string, criteria: string): Promise<boolean> => {
    if (!user || role !== 'teacher') return false;
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: writeError } = await supabase.from('learning_support_transfer_checks').insert({
        plan_id: planId, prompt, success_criteria: criteria,
      });
      if (writeError) throw writeError;
      setNotice(ar ? 'أُرسل الفحص إلى الطالب.' : 'Transfer check assigned to the learner.');
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'تعذر إنشاء الفحص.' : 'Could not create transfer check.'));
      return false;
    } finally { setSaving(false); }
  };

  const submitTransferResponse = async (checkId: string, response: string): Promise<boolean> => {
    if (!user || role !== 'student') return false;
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: changed, error: writeError } = await supabase.from('learning_support_transfer_checks')
        .update({ student_response: response, status: 'SUBMITTED' }).eq('id', checkId).eq('student_id', user.id)
        .eq('status', 'OPEN').select('id').single();
      if (writeError || !changed) throw writeError ?? new Error('The check is no longer open. Refresh and try again.');
      setNotice(ar ? 'وصلت إجابتك إلى المعلم. المراجعة مستقلة.' : 'Your answer was submitted; teacher review is separate.');
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'تعذر إرسال الإجابة.' : 'Could not submit response.'));
      return false;
    } finally { setSaving(false); }
  };

  const reviewTransferResponse = async (checkId: string, verdict: TransferVerdict, feedback: string): Promise<boolean> => {
    if (!user || role !== 'teacher') return false;
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: changed, error: writeError } = await supabase.from('learning_support_transfer_checks')
        .update({ verdict, teacher_feedback: feedback, status: 'REVIEWED' }).eq('id', checkId).eq('teacher_id', user.id)
        .eq('status', 'SUBMITTED').select('id').single();
      if (writeError || !changed) throw writeError ?? new Error('The response is no longer awaiting review.');
      setNotice(ar ? 'سُجلت مراجعة الفحص؛ لا تُنسب إليها نتيجة سببية تلقائية.' : 'Transfer review recorded; no causal learning claim was inferred.');
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'تعذرت مراجعة الفحص.' : 'Could not review response.'));
      return false;
    } finally { setSaving(false); }
  };

  const pulse = summarizeSupport(plans, checkins);
  const transferSummary = transferSchoolSummary(transferChecks);
  const attention = role === 'teacher' ? teacherSupportQueue(plans, checkins, transferChecks, linkedQuestions) : [];
  const attentionIncomplete = transferLoadFailed || questionLoadFailed || checkinLoadFailed || plans.length === 100;
  const learnerName = (id: string) => learners.find(learner => learner.id === id)?.full_name || 'Learner';

  return (
    <section className="space-y-5" aria-label="Learning support loop">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{ar ? 'رحلة دعم التعلم' : 'Learning support loop'}</h2>
          <p className="text-sm text-muted-foreground">
            {ar ? 'أدلة التعلّم ← خطة المعلم ← ممارسة الطالب ← دعم الأسرة ← مراجعة' : 'ALE evidence → teacher goal → learner practice → family support → review'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh learning support"><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-600">{notice}</p>}
      {role === 'teacher' && !loading && !transferLoadFailed && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {([
          [ar ? 'بانتظار الطالب' : 'Awaiting learners', transferSummary.awaitingLearner],
          [ar ? 'بانتظار المعلم' : 'Awaiting my review', transferSummary.awaitingTeacher],
          [ar ? 'أظهر الفهم بفحص واحد' : 'One check demonstrated', transferSummary.demonstratedOnOneCheck],
        ] as const).map(([label, count]) => <Card key={label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-xl">{count}</strong></CardContent></Card>)}
        <p className="col-span-full text-xs text-muted-foreground">{ar ? 'هذه أعداد سير عمل من أحدث الخطط فقط؛ ليست مقياساً لأثر التعلم.' : 'Workflow counts from the latest plans only; not a measure of learning impact.'}</p>
      </div>}
      {role === 'teacher' && !loading && <Card aria-label="Teacher support attention queue">
        <CardHeader><CardTitle className="text-base">{ar ? 'أولويات متابعة الدعم' : 'Support attention queue'}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{ar ? 'ترتيب لمهام مسجلة فقط، وليس تقديراً لقدرة الطالب أو أثر التدخل.' : 'Ranks recorded workflow obligations only; it is not a student-risk or learning-impact score.'}</p>
          {attentionIncomplete && <p role="status" className="text-xs text-amber-700">{ar ? 'الأدلة المعروضة غير مكتملة؛ قد توجد مهام أخرى خارج حدود التحميل.' : 'Evidence is incomplete; additional tasks may exist beyond the loaded records.'}</p>}
          {attention.length === 0 ? <p className="text-muted-foreground">{attentionIncomplete
            ? (ar ? 'لا توجد مهام ضمن السجلات المحمّلة.' : 'No obligations among loaded records.')
            : (ar ? 'لا توجد مهام دعم معلقة مسجلة.' : 'No recorded support obligations are pending.')}</p>
            : <ol className="space-y-2">{attention.slice(0, 10).map(item => <li key={item.planId} className="rounded-md border p-2">
              <a className="font-medium underline" href={`#support-plan-${item.planId}`}>{learnerName(item.studentId)} · {item.subject} · {item.topic}</a>
              <p className="text-muted-foreground">{item.reasons.map(reason => ar ? attentionLabels[reason].ar : attentionLabels[reason].en).join(' · ')}</p>
            </li>)}</ol>}
          {attention.length > 10 && <p className="text-xs text-muted-foreground">{ar ? `تظهر 10 من ${attention.length} خطط تحتاج إلى انتباه.` : `Showing 10 of ${attention.length} plans needing attention.`}</p>}
        </CardContent>
      </Card>}
      {role === 'admin' && !error && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([['Active', pulse.active], ['Needs review', pulse.awaitingReview], ['Help requests', pulse.needingHelp], ['Overdue', pulse.overdue]] as const).map(([label, value]) => (
              <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-2xl">{value}</strong></CardContent></Card>
            ))}
            <p className="col-span-full text-xs text-muted-foreground">Workflow counts only; not proof of learning impact. Limited to the latest 100 plans and 500 check-ins.</p>
          </div>
          {schoolTransferSummary?.evidence_state === 'INSUFFICIENT_COHORT' && <p className="text-sm text-muted-foreground">Transfer review summary withheld: fewer than three learners have checks in the past 90 days.</p>}
          {schoolTransferSummary?.evidence_state === 'AVAILABLE' && <div aria-label="School transfer review summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ['Learners with checks', schoolTransferSummary.learner_count],
              ['Plans with checks', schoolTransferSummary.plans_with_checks],
              ['Awaiting learner', schoolTransferSummary.awaiting_learner],
              ['Awaiting teacher', schoolTransferSummary.awaiting_teacher],
              ['One check demonstrated', schoolTransferSummary.demonstrated_on_one_check],
              ['Not yet demonstrated', schoolTransferSummary.not_yet_demonstrated],
              ['Inconclusive', schoolTransferSummary.inconclusive],
            ] as const).map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-2xl">{value}</strong></CardContent></Card>)}
            <p className="col-span-full text-xs text-muted-foreground">Latest check per plan, past 90 days, minimum three learners. A review is not a causal measure of intervention impact.</p>
          </div>}
          {!loading && !schoolTransferSummary && <p className="text-sm text-muted-foreground">Transfer review summary unavailable; no result was returned.</p>}
          <Card aria-label="Learning attention by grade cohort">
            <CardHeader><CardTitle className="text-base">{ar ? 'وصول دعم التعلّم حسب الصف' : 'Learning support reach by grade'}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{ar
                ? 'أعداد طلاب لديهم إشارات خدمة مسجلة؛ لا تقارن جودة المعلمين أو أثر التعلم. تُحجب المجموعات الأصغر من ثلاثة طلاب.'
                : 'Counts of learners with recorded service signals, not teacher quality or learning impact. Cohorts smaller than three learners are withheld.'}</p>
              {gradeAttention === null ? <p className="text-muted-foreground">{ar ? 'تعذر التحقق من بيانات الصفوف.' : 'Grade cohort evidence unavailable.'}</p>
                : gradeAttention.length === 0 ? <p className="text-muted-foreground">{ar ? 'لا توجد مجموعات صفية قابلة للعرض.' : 'No grade cohort meets the reporting threshold.'}</p>
                  : <div className="grid gap-2 md:grid-cols-2">{gradeAttention.map(row => <div key={row.grade_label} className="rounded-md border p-3">
                    <strong>{row.grade_label}</strong><span className="text-muted-foreground"> · {row.learner_count} {ar ? 'طلاب' : 'learners'}</span>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <li>{ar ? 'طلاب لديهم خطة نشطة:' : 'Learners with an active plan:'} {row.learners_with_active_plans}</li>
                      <li>{ar ? 'طلاب أرسلوا طلب مساعدة خلال 30 يوماً:' : 'Learners with a help signal in 30 days:'} {row.learners_with_recent_help}</li>
                      <li>{ar ? 'طلاب ينتظرون رد المعلم:' : 'Learners awaiting a teacher reply:'} {row.learners_awaiting_teacher_reply}</li>
                      <li>{ar ? 'طلاب لديهم فحص انتقال راجعه المعلم خلال 90 يوماً:' : 'Learners with a teacher-reviewed transfer check in 90 days:'} {row.learners_with_reviewed_transfer}</li>
                    </ul>
                  </div>)}</div>}
            </CardContent>
          </Card>
        </div>
      )}
      {role === 'teacher' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create an evidence-linked support plan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">Learner
              <select className="mt-1 w-full rounded-md border bg-background p-2" value={selectedLearner} onChange={event => { setSelectedLearner(event.target.value); setSelectedConcept(''); }}>
                <option value="">Select learner</option>{learners.map(learner => <option key={learner.id} value={learner.id}>{learner.full_name} {learner.grade_level && `· ${learner.grade_level}`}</option>)}
              </select>
            </label>
            <label className="block text-sm">Evidence source
              <select className="mt-1 w-full rounded-md border bg-background p-2" value={source} onChange={event => setSource(event.target.value as typeof source)}>
                <option value="ALE_MASTERY">Measured ALE mastery</option><option value="TEACHER_OBSERVATION">Teacher observation (not an ALE measurement)</option>
              </select>
            </label>
            {source === 'ALE_MASTERY' ? <label className="block text-sm">ALE concept
              <select className="mt-1 w-full rounded-md border bg-background p-2" value={selectedConcept} onChange={event => pickConcept(event.target.value)} disabled={!selectedLearner}>
                <option value="">{weak.length ? 'Select measured concept' : 'No measured concepts available'}</option>
                {weak.map((item, index) => <option key={`${conceptChoice(item)}:${index}`} value={conceptChoice(item)}>{item.subject} · {item.topic} · {Math.round(Number(item.mastery_score) * 100)}%</option>)}
              </select>
            </label> : <div className="grid sm:grid-cols-2 gap-2"><Input aria-label="Subject" placeholder="Subject" value={subject} onChange={event => setSubject(event.target.value)} maxLength={120} /><Input aria-label="Topic" placeholder="Topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={180} /></div>}
            <Textarea aria-label="Learning goal" placeholder="Observable learning goal" value={goal} onChange={event => setGoal(event.target.value)} maxLength={1000} />
            <Textarea aria-label="Learner step" placeholder="One concrete practice step" value={learnerStep} onChange={event => setLearnerStep(event.target.value)} maxLength={1000} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={familyVisible} onChange={event => setFamilyVisible(event.target.checked)} />Share a bounded home-support step with linked family</label>
            {familyVisible && <Textarea aria-label="Family step" placeholder="Practical support at home (no private teacher notes)" value={familyStep} onChange={event => setFamilyStep(event.target.value)} maxLength={1000} />}
            <label className="block text-sm">Review by <Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
            <Button onClick={() => void createPlan()} disabled={saving || !selectedLearner || !subject.trim() || !topic.trim() || goal.trim().length < 5 || learnerStep.trim().length < 5 || (familyVisible && familyStep.trim().length < 5)}>Create support plan</Button>
          </CardContent>
        </Card>
      )}
      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading support evidence…</div>
        : error && plans.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Support data is unavailable; no absence of plans can be inferred.</CardContent></Card>
        : plans.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No support plans yet. A teacher can connect an ALE concept or direct observation to a concrete learning goal.</CardContent></Card>
        : <div className="grid gap-3">{plans.map(plan => {
          const latest = checkins.filter(item => item.plan_id === plan.id).slice(0, 3);
          const current = mastery.get(masteryKey(plan.student_id, plan.subject, plan.topic));
          return <Card key={plan.id} id={`support-plan-${plan.id}`}>
            <CardHeader className="pb-2"><div className="flex flex-wrap items-center gap-2"><Target className="h-4 w-4" /><CardTitle className="text-base">{plan.subject} · {plan.topic}</CardTitle><Badge variant="outline">{plan.status}</Badge></div></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {role === 'teacher' && <p className="text-muted-foreground">{learnerName(plan.student_id)}</p>}
              <p><strong>Goal:</strong> {plan.goal}</p><p><strong>Next practice:</strong> {plan.learner_step}</p>
              {role === 'family' && plan.family_visible && <p><strong>At home:</strong> {plan.family_step}</p>}
              {plan.source_kind === 'ALE_MASTERY' && plan.baseline_mastery !== null && <p className="text-muted-foreground">ALE baseline: {Math.round(plan.baseline_mastery * 100)}% · target: {plan.target_mastery === null ? 'teacher review' : `${Math.round(plan.target_mastery * 100)}%`}</p>}
              {plan.ale_observed_at && <p className="text-xs text-muted-foreground">Baseline observed {new Date(plan.ale_observed_at).toLocaleDateString()}</p>}
              {current && <p className="text-muted-foreground">Latest ALE observation: {Math.round(current.mastery_score * 100)}% ({new Date(current.updated_at).toLocaleDateString()}){plan.baseline_mastery !== null && ` · ${current.mastery_score >= plan.baseline_mastery ? '+' : ''}${Math.round((current.mastery_score - plan.baseline_mastery) * 100)} points since baseline`}</p>}
              {plan.source_kind !== 'ALE_MASTERY' && <p className="text-muted-foreground">Source: teacher observation; no ALE measurement claimed.</p>}
              {plan.due_at && <p className="text-muted-foreground">Review by {new Date(plan.due_at).toLocaleDateString()}</p>}
              {latest.length > 0 && <p className="text-muted-foreground">Recent check-ins: {latest.map(item => item.kind.toLowerCase().replace(/_/g, ' ')).join(' · ')}</p>}
              {(role === 'teacher' || role === 'student') && !transferLoadFailed && <LearningTransferPanel
                plan={plan} checks={transferChecks.filter(check => check.plan_id === plan.id)} role={role}
                arabic={ar} saving={saving} onCreate={createTransferCheck}
                onSubmit={submitTransferResponse} onReview={reviewTransferResponse}
              />}
              {role === 'student' && !questionLoadFailed && <div className="space-y-2 rounded-lg border p-3" aria-label="Support plan questions">
                <p className="font-medium">{ar ? 'اسأل عن موضع الصعوبة' : 'Ask about this learning goal'}</p>
                {linkedQuestions.filter(question => question.support_plan_id === plan.id).slice(0, 3).map(question => <div key={question.id} className="space-y-1 rounded-md bg-muted/50 p-2">
                  <p className="whitespace-pre-wrap text-sm"><strong>{ar ? 'سؤالك:' : 'Your question:'}</strong> {question.body}</p>
                  <p className="whitespace-pre-wrap text-sm">{question.teacher_reply
                    ? <><strong>{ar ? 'رد المعلم:' : 'Teacher reply:'}</strong> {question.teacher_reply}</>
                    : <span className="text-muted-foreground">{ar ? 'بانتظار رد المعلم.' : 'Waiting for the teacher’s reply.'}</span>}</p>
                </div>)}
                {plan.status === 'active' && <><Textarea aria-label="Describe where you are stuck" placeholder={ar ? 'ما الذي لم تفهمه في هذه الخطوة؟' : 'What part of this step is unclear?'}
                  value={questionDrafts[plan.id] ?? ''} maxLength={2000}
                  onChange={event => setQuestionDrafts(current => ({ ...current, [plan.id]: event.target.value }))} />
                  <Button size="sm" variant="outline" disabled={saving || (questionDrafts[plan.id] ?? '').trim().length < 10}
                    onClick={() => void askSupportQuestion(plan)}>{ar ? 'أرسل السؤال إلى المعلم' : 'Ask the responsible teacher'}</Button></>}
                <p className="text-xs text-muted-foreground">{ar ? 'لا تُشارك هذه الأسئلة مع الأسرة أو المدير؛ وهي ليست دليلاً على الإتقان.' : 'Questions and replies are private to the learner and assigned teacher; they are not mastery evidence.'}</p>
              </div>}
              {role === 'student' && plan.status === 'active' && <div className="flex flex-wrap gap-2">{onPractice && <Button size="sm" variant="outline" onClick={onPractice}>Open practice</Button>}<Button size="sm" disabled={saving} onClick={() => void recordCheckin(plan.id, 'PRACTICED')}><BookOpenCheck className="h-4 w-4 mr-1" />I practiced</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void recordCheckin(plan.id, 'NEEDS_HELP')}>I need help</Button></div>}
              {role === 'family' && plan.status === 'active' && <Button size="sm" variant="outline" disabled={saving} onClick={() => void recordCheckin(plan.id, 'FAMILY_SUPPORTED')}>We supported this step</Button>}
              {role === 'teacher' && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving || plan.status === 'review'} onClick={() => void setPlanStatus(plan.id, 'review')}>Review</Button><Button size="sm" variant="outline" disabled={saving || plan.status === 'closed'} onClick={() => void setPlanStatus(plan.id, 'closed')}>Close</Button>{plan.status !== 'active' && <Button size="sm" variant="outline" disabled={saving} onClick={() => void setPlanStatus(plan.id, 'active')}>Reopen</Button>}</div>}
            </CardContent>
          </Card>;
        })}</div>}
    </section>
  );
}
