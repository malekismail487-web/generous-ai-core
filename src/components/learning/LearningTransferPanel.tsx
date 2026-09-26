import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SupportPlan } from '@/lib/learningSupport';
import {
  transferCaseState, validTransferPrompt, validTransferResponse, validTransferReview,
  type TransferCheck, type TransferVerdict,
} from '@/lib/learningTransfer';

type Role = 'teacher' | 'student';
interface Props {
  plan: SupportPlan;
  checks: TransferCheck[];
  role: Role;
  arabic: boolean;
  saving: boolean;
  onCreate: (planId: string, prompt: string, criteria: string) => Promise<boolean>;
  onSubmit: (checkId: string, response: string) => Promise<boolean>;
  onReview: (checkId: string, verdict: TransferVerdict, feedback: string) => Promise<boolean>;
}

const verdictLabel = (verdict: string | null, ar: boolean) => verdict === 'DEMONSTRATED'
  ? (ar ? 'أظهر الفهم في هذا الفحص' : 'Demonstrated on this check')
  : verdict === 'NOT_YET' ? (ar ? 'لم يُظهر الفهم بعد' : 'Not yet demonstrated')
    : (ar ? 'غير حاسم' : 'Inconclusive');

function TransferProbe({ check, role, arabic: ar, saving, onSubmit, onReview }: Pick<Props, 'role' | 'arabic' | 'saving' | 'onSubmit' | 'onReview'> & { check: TransferCheck }) {
  const [response, setResponse] = useState('');
  const [verdict, setVerdict] = useState<TransferVerdict | ''>('');
  const [feedback, setFeedback] = useState('');
  return <article className="rounded-lg border border-foreground/10 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{check.status}</Badge><span className="text-xs text-muted-foreground">{new Date(check.created_at).toLocaleDateString(ar ? 'ar-SA' : 'en-US')}</span></div>
    <p className="mt-2 font-medium whitespace-pre-wrap">{check.prompt}</p>
    <p className="mt-1 text-xs text-muted-foreground"><strong>{ar ? 'معيار الفحص:' : 'What to show:'}</strong> {check.success_criteria}</p>
    {check.status === 'OPEN' && role === 'student' && <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium">{ar ? 'اشرح تفكيرك في مسألة جديدة' : 'Explain your reasoning on this new problem'}
        <Textarea className="mt-1" maxLength={5000} value={response} onChange={event => setResponse(event.target.value)} />
      </label>
      <Button size="sm" disabled={saving || !validTransferResponse(response)} onClick={async () => {
        if (await onSubmit(check.id, response.trim())) setResponse('');
      }}>{ar ? 'أرسل إجابتي للمعلم' : 'Submit to teacher'}</Button>
    </div>}
    {check.status === 'OPEN' && role === 'teacher' && <p className="mt-2 text-xs text-muted-foreground">{ar ? 'بانتظار إجابة الطالب.' : 'Waiting for the learner’s response.'}</p>}
    {check.student_response && <div className="mt-3 rounded-md bg-muted/40 p-2"><strong>{ar ? 'إجابة الطالب:' : 'Learner response:'}</strong><p className="mt-1 whitespace-pre-wrap">{check.student_response}</p></div>}
    {check.status === 'SUBMITTED' && role === 'teacher' && <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium">{ar ? 'تقييم المعلم' : 'Teacher judgment'}
        <select className="mt-1 w-full rounded-md border bg-background p-2" value={verdict} onChange={event => setVerdict(event.target.value as TransferVerdict | '')}>
          <option value="">{ar ? 'اختر النتيجة' : 'Choose a result'}</option>
          <option value="DEMONSTRATED">{verdictLabel('DEMONSTRATED', ar)}</option>
          <option value="NOT_YET">{verdictLabel('NOT_YET', ar)}</option>
          <option value="INCONCLUSIVE">{verdictLabel('INCONCLUSIVE', ar)}</option>
        </select>
      </label>
      <label className="block text-xs font-medium">{ar ? 'السبب والخطوة التالية' : 'Reason and next step'}
        <Textarea className="mt-1" maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} />
      </label>
      <Button size="sm" disabled={saving || !validTransferReview(verdict, feedback)} onClick={async () => {
        if (await onReview(check.id, verdict as TransferVerdict, feedback.trim())) { setVerdict(''); setFeedback(''); }
      }}>{ar ? 'احفظ المراجعة' : 'Record review'}</Button>
    </div>}
    {check.status === 'SUBMITTED' && role === 'student' && <p className="mt-2 text-xs text-muted-foreground">{ar ? 'بانتظار مراجعة المعلم؛ إرسال الإجابة ليس دليلاً على الإتقان.' : 'Awaiting teacher review; submitting is not proof of mastery.'}</p>}
    {check.status === 'REVIEWED' && <div className="mt-3 rounded-md border p-2">
      <strong>{verdictLabel(check.verdict, ar)}</strong>
      <p className="mt-1 whitespace-pre-wrap">{check.teacher_feedback}</p>
      <p className="mt-1 text-xs text-muted-foreground">{ar ? 'هذه ملاحظة على فحص واحد، وليست دليلاً سببياً على أثر التدخل.' : 'This judges one transfer check; it does not establish that the intervention caused improvement.'}</p>
    </div>}
  </article>;
}

export function LearningTransferPanel({ plan, checks, role, arabic: ar, saving, onCreate, onSubmit, onReview }: Props) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [criteria, setCriteria] = useState('');
  const ordered = [...checks].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const pending = checks.some(check => check.status !== 'REVIEWED');
  const state = transferCaseState(checks);
  const stateLabel = ({
    NOT_REQUESTED: ar ? 'لم يُطلب فحص' : 'No check yet',
    AWAITING_LEARNER: ar ? 'بانتظار الطالب' : 'Awaiting learner',
    AWAITING_TEACHER: ar ? 'بانتظار المعلم' : 'Awaiting teacher',
    DEMONSTRATED_ON_ONE_CHECK: verdictLabel('DEMONSTRATED', ar),
    NOT_YET_DEMONSTRATED: verdictLabel('NOT_YET', ar),
    INCONCLUSIVE: verdictLabel('INCONCLUSIVE', ar),
  })[state];

  return <div className="mt-3 space-y-3 border-t border-foreground/10 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="font-semibold">{ar ? 'فحص نقل التعلم' : 'Transfer check'}</h4>
        <p className="text-xs text-muted-foreground">{ar ? 'سؤال جديد من المعلم، إجابة الطالب، ثم مراجعة منفصلة.' : 'A new teacher question, learner response, then separate teacher review.'}</p></div>
      <Badge variant="secondary">{stateLabel}</Badge>
    </div>
    {role === 'teacher' && plan.status !== 'closed' && !pending && <>
      {!draftOpen && <Button size="sm" variant="outline" onClick={() => setDraftOpen(true)}>{ar ? 'أنشئ فحصاً جديداً' : 'Create a transfer check'}</Button>}
      {draftOpen && <div className="space-y-2 rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{ar ? 'استخدم مسألة جديدة تكشف التطبيق، لا تكرار المثال. لا تضع الإجابة في المعيار الظاهر للطالب.' : 'Use a genuinely new application, not the practiced example. Do not reveal the answer in criteria visible to the learner.'}</p>
        <label className="block text-xs font-medium">{ar ? 'المسألة الجديدة' : 'New problem'}<Textarea className="mt-1" maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
        <label className="block text-xs font-medium">{ar ? 'ما الذي يثبت الفهم؟' : 'Observable success criteria'}<Textarea className="mt-1" maxLength={1000} value={criteria} onChange={event => setCriteria(event.target.value)} /></label>
        <div className="flex gap-2"><Button size="sm" disabled={saving || !validTransferPrompt(prompt, criteria)} onClick={async () => {
          if (await onCreate(plan.id, prompt.trim(), criteria.trim())) { setPrompt(''); setCriteria(''); setDraftOpen(false); }
        }}>{ar ? 'أرسل الفحص' : 'Assign check'}</Button><Button size="sm" variant="ghost" onClick={() => setDraftOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button></div>
      </div>}
    </>}
    {ordered.length === 0 && <p className="text-xs text-muted-foreground">{ar ? 'لم يُنشأ فحص مستقل بعد؛ لا توجد نتيجة مثبتة.' : 'No separate check yet; no demonstrated outcome is claimed.'}</p>}
    {ordered.slice(0, 5).map(check => <TransferProbe key={check.id} check={check} role={role} arabic={ar} saving={saving} onSubmit={onSubmit} onReview={onReview} />)}
    {ordered.length > 5 && <p className="text-xs text-muted-foreground">{ar ? 'تظهر أحدث خمسة فحوص فقط.' : 'Showing the five most recent checks only.'}</p>}
  </div>;
}
