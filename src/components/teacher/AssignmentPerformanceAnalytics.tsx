import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart3, Users, AlertTriangle, CheckCircle2, XCircle,
  Loader2, ChevronDown, ChevronUp, Trophy, Target
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { buildAssignmentResponseEvidence, latestPerStudent, parseResponseQuestions, type ResponseBreakdown } from '@/lib/assignmentResponseEvidence';

interface AssignmentAnalytics {
  id: string;
  title: string;
  subject: string;
  grade_level: string;
  created_at: string;
  totalSubmissions: number;
  classAverage: number | null;
  questionBreakdown: ResponseBreakdown[];
  unreadableSubmissions: number;
  supersededSubmissions: number;
  questionsUnreadable: boolean;
  studentResults: {
    studentId: string;
    studentName: string;
    grade: number | null;
    totalPoints: number;
    submittedAt: string;
  }[];
}

interface Props {
  schoolId: string;
  teacherId: string;
}

export function AssignmentPerformanceAnalytics({ schoolId, teacherId }: Props) {
  const { t } = useThemeLanguage();
  const [analytics, setAnalytics] = useState<AssignmentAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    // Get teacher's assignments with questions
    const { data: assignments, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, title, subject, grade_level, created_at, questions_json, points')
      .eq('teacher_id', teacherId)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (assignmentError) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (!assignments || assignments.length === 0) {
      setAnalytics([]);
      setLoading(false);
      return;
    }

    const assignmentIds = assignments.map(a => a.id);

    // Get all submissions for these assignments
    const { data: submissions, error: submissionError } = await supabase
      .from('submissions')
      .select('id, assignment_id, student_id, grade, submitted_at, content')
      .in('assignment_id', assignmentIds);

    if (submissionError) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    // Get student names
    const studentIds = [...new Set((submissions || []).map(s => s.student_id))];
    const { data: profiles, error: profileError } = studentIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
      : { data: [], error: null };

    if (profileError) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    const result: AssignmentAnalytics[] = assignments.map(assignment => {
      const rawSubs = (submissions || []).filter(s => s.assignment_id === assignment.id);
      const subs = latestPerStudent(rawSubs);
      let questionBreakdown: ResponseBreakdown[] = [];
      let unreadableSubmissions = 0;
      let questionsUnreadable = false;
      try {
        const questions = parseResponseQuestions(assignment.questions_json);
        if (questions.length > 0) {
          const evidence = buildAssignmentResponseEvidence(questions, rawSubs);
          questionBreakdown = evidence.breakdown;
          unreadableSubmissions = evidence.unreadableSubmissions;
        }
      } catch {
        questionsUnreadable = true;
      }

      // Calculate class average from grades
      const gradedSubs = subs.filter(s => s.grade !== null);
      const totalPoints = assignment.points ?? 100;
      const classAverage = gradedSubs.length > 0 && totalPoints > 0
        ? Math.round(gradedSubs.reduce((sum, s) => sum + ((s.grade ?? 0) / totalPoints) * 100, 0) / gradedSubs.length)
        : null;

      // Student results
      const studentResults = subs.map(s => ({
        studentId: s.student_id,
        studentName: profileMap.get(s.student_id) || 'Student',
        grade: s.grade,
        totalPoints,
        submittedAt: s.submitted_at,
      })).sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1));

      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        grade_level: assignment.grade_level,
        created_at: assignment.created_at,
        totalSubmissions: subs.length,
        classAverage,
        questionBreakdown,
        unreadableSubmissions,
        supersededSubmissions: rawSubs.length - subs.length,
        questionsUnreadable,
        studentResults,
      };
    });

    setAnalytics(result);
    setLoading(false);
  }, [schoolId, teacherId]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="liquid-glass rounded-xl p-6 text-sm" role="alert">
        <p>{t('Assignment evidence could not be loaded. No performance conclusion is available.', 'تعذر تحميل دليل الواجبات. لا تتوفر نتيجة عن الأداء.')}</p>
        <button type="button" className="mt-2 underline" onClick={() => void fetchAnalytics()}>{t('Retry', 'أعد المحاولة')}</button>
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <div className="liquid-glass rounded-xl p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-2">{t('No Assignment Data', 'لا توجد بيانات')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Create assignments and wait for students to submit them.', 'أنشئ واجبات وانتظر تسليم الطلاب.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        {t('Assignment Performance Analytics', 'تحليلات أداء الواجبات')}
      </h2>

      {analytics.map(a => {
        const isExpanded = expandedId === a.id;
        const problemQuestions = a.questionBreakdown.filter(q => q.successRate !== null && q.successRate < 50 && q.totalAttempts >= 3);

        return (
          <div key={a.id} className="liquid-glass rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : a.id)}
              className="w-full p-4 text-left flex items-center gap-3"
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-foreground font-bold text-sm shrink-0",
                a.classAverage === null ? "bg-gradient-to-br from-slate-400 to-slate-500"
                  : "bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04]"
              )}>
                {a.classAverage === null ? '—' : `${a.classAverage}%`}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {a.subject} • {a.grade_level} • {a.totalSubmissions} {t('submissions', 'تسليم')}
                  {problemQuestions.length > 0 && (
                    <span className="text-amber-500 ml-2">
                      ⚠ {problemQuestions.length} {t('problem questions', 'أسئلة صعبة')}
                    </span>
                  )}
                </p>
              </div>

              <div className="shrink-0">
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-foreground/10 pt-3 space-y-4">
                {(a.questionsUnreadable || a.unreadableSubmissions > 0 || a.supersededSubmissions > 0) && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                    {a.questionsUnreadable && <p>{t('Question-level evidence is unavailable: the assignment question format could not be read.', 'دليل الأسئلة غير متاح: تعذرت قراءة تنسيق أسئلة الواجب.')}</p>}
                    {a.unreadableSubmissions > 0 && <p>{a.unreadableSubmissions} {t('submissions could not be attributed to answers and were excluded.', 'تسليمات تعذر ربطها بالإجابات واستُبعدت.')}</p>}
                    {a.supersededSubmissions > 0 && <p>{a.supersededSubmissions} {t('earlier attempts were superseded by each learner’s latest submission.', 'محاولات سابقة استُبدلت بأحدث تسليم لكل طالب.')}</p>}
                  </div>
                )}
                {/* Question Breakdown */}
                {a.questionBreakdown.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      {t('Question-by-Question Breakdown', 'تحليل سؤال بسؤال')}
                    </h4>
                    <div className="space-y-2">
                      {a.questionBreakdown.map(q => (
                        <div key={q.index} className="flex items-center gap-3">
                          <span className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            q.successRate !== null && q.successRate >= 70 ? "bg-green-500/10 text-green-500"
                              : q.successRate !== null && q.successRate >= 50 ? "bg-amber-500/10 text-amber-500"
                              : "bg-red-500/10 text-red-500"
                          )}>
                            {q.index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{q.questionText}</p>
                            <Progress value={q.successRate ?? 0} className="h-1.5 mt-1" />
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn(
                              "text-xs font-bold",
                              q.successRate !== null && q.successRate >= 70 ? "text-green-500" : q.successRate !== null && q.successRate >= 50 ? "text-amber-500" : "text-red-500"
                            )}>
                              {q.successRate === null ? '—' : `${q.successRate}%`}
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                              {q.correctCount}/{q.totalAttempts}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {a.questionBreakdown.some(q => q.totalAttempts >= 3 && Object.entries(q.selections).some(([letter, count]) => letter !== q.correctAnswer && count >= 2)) && (
                      <div className="mt-3 space-y-2 rounded-lg border p-3 text-xs">
                        <p className="font-semibold">{t('Common answer patterns to inspect', 'أنماط إجابة شائعة تستحق المراجعة')}</p>
                        <p className="text-muted-foreground">{t('A common wrong choice may indicate a misconception or a confusing question; inspect before intervening.', 'قد يشير الخيار الخاطئ الشائع إلى فكرة خاطئة أو سؤال مربك؛ تحقق قبل التدخل.')}</p>
                        {a.questionBreakdown.flatMap(q => Object.entries(q.selections)
                          .filter(([letter, count]) => q.totalAttempts >= 3 && letter !== q.correctAnswer && count >= 2)
                          .map(([letter, count]) => (
                            <p key={`${q.index}-${letter}`}>Q{q.index + 1} · {letter}: {q.optionTexts[letter as keyof typeof q.optionTexts]} · {count}/{q.totalAttempts}</p>
                          )))}
                      </div>
                    )}

                    {/* Pattern Alert */}
                    {problemQuestions.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>
                            <strong>{t('Pattern detected:', 'نمط مكتشف:')}</strong>{' '}
                            {problemQuestions.map(q => `Q${q.index + 1}`).join(', ')}{' '}
                            {t('have low success rates. Consider reteaching these topics.', 'لديها معدلات نجاح منخفضة. فكر في إعادة تدريس هذه المواضيع.')}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Student Results */}
                {a.studentResults.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      {t('Student Results', 'نتائج الطلاب')}
                    </h4>
                    <div className="space-y-1">
                      {a.studentResults.map(s => {
                        const pct = s.grade !== null && s.totalPoints > 0 ? Math.round((s.grade / s.totalPoints) * 100) : null;
                        return (
                          <div key={s.studentId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                            <span className="text-sm font-medium flex-1 truncate">{s.studentName}</span>
                            <Badge variant={pct === null ? 'secondary' : pct >= 70 ? 'default' : pct >= 50 ? 'secondary' : 'destructive'} className="text-xs gap-1">
                              <Trophy className="w-3 h-3" />
                              {s.grade === null ? t('Ungraded', 'لم يُقيّم') : `${s.grade}/${s.totalPoints}`}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground w-20 text-right">
                              {new Date(s.submittedAt).toLocaleDateString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {a.totalSubmissions === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    {t('No submissions yet for this assignment.', 'لا توجد تسليمات حتى الآن.')}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
