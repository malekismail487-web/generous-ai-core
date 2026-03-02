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

interface AssignmentAnalytics {
  id: string;
  title: string;
  subject: string;
  grade_level: string;
  created_at: string;
  questions_json: any[];
  totalSubmissions: number;
  classAverage: number;
  questionBreakdown: {
    index: number;
    questionText: string;
    correctCount: number;
    totalAttempts: number;
    successRate: number;
  }[];
  studentResults: {
    studentId: string;
    studentName: string;
    grade: number;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);

    // Get teacher's assignments with questions
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, subject, grade_level, created_at, questions_json, points')
      .eq('teacher_id', teacherId)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (!assignments || assignments.length === 0) {
      setAnalytics([]);
      setLoading(false);
      return;
    }

    const assignmentIds = assignments.map(a => a.id);

    // Get all submissions for these assignments
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, assignment_id, student_id, grade, submitted_at, content')
      .in('assignment_id', assignmentIds);

    // Get student names
    const studentIds = [...new Set((submissions || []).map(s => s.student_id))];
    const { data: profiles } = studentIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    // Get assignment_submissions (quiz answers) for question-level breakdown
    const { data: quizSubmissions } = await supabase
      .from('assignment_submissions')
      .select('assignment_id, student_id, content, grade')
      .in('assignment_id', assignmentIds);

    const result: AssignmentAnalytics[] = assignments.map(assignment => {
      const questions = Array.isArray(assignment.questions_json) ? assignment.questions_json : [];
      const subs = (submissions || []).filter(s => s.assignment_id === assignment.id);
      const quizSubs = (quizSubmissions || []).filter(s => s.assignment_id === assignment.id);

      // Calculate class average from grades
      const gradedSubs = subs.filter(s => s.grade !== null);
      const totalPoints = assignment.points || 100;
      const classAverage = gradedSubs.length > 0
        ? Math.round(gradedSubs.reduce((sum, s) => sum + ((s.grade || 0) / totalPoints) * 100, 0) / gradedSubs.length)
        : 0;

      // Question-level breakdown from quiz submissions content
      const questionBreakdown = questions.map((q: any, idx: number) => {
        let correctCount = 0;
        let totalAttempts = 0;

        for (const qs of quizSubs) {
          try {
            const answers = typeof qs.content === 'string' ? JSON.parse(qs.content) : qs.content;
            if (Array.isArray(answers) && answers[idx] !== undefined) {
              totalAttempts++;
              if (answers[idx] === q.correctAnswer || answers[idx] === q.correct_answer) {
                correctCount++;
              }
            }
          } catch { /* skip malformed */ }
        }

        return {
          index: idx,
          questionText: q.question || q.text || `Question ${idx + 1}`,
          correctCount,
          totalAttempts,
          successRate: totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0,
        };
      });

      // Student results
      const studentResults = subs.map(s => ({
        studentId: s.student_id,
        studentName: profileMap.get(s.student_id) || 'Student',
        grade: s.grade || 0,
        totalPoints,
        submittedAt: s.submitted_at,
      })).sort((a, b) => b.grade - a.grade);

      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        grade_level: assignment.grade_level,
        created_at: assignment.created_at,
        questions_json: questions,
        totalSubmissions: subs.length,
        classAverage,
        questionBreakdown,
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

  if (analytics.length === 0) {
    return (
      <div className="glass-effect rounded-xl p-8 text-center">
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
        const problemQuestions = a.questionBreakdown.filter(q => q.successRate < 50 && q.totalAttempts >= 2);

        return (
          <div key={a.id} className="glass-effect rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : a.id)}
              className="w-full p-4 text-left flex items-center gap-3"
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                a.classAverage >= 70 ? "bg-gradient-to-br from-green-500 to-emerald-600"
                  : a.classAverage >= 50 ? "bg-gradient-to-br from-amber-500 to-orange-600"
                  : a.totalSubmissions === 0 ? "bg-gradient-to-br from-slate-400 to-slate-500"
                  : "bg-gradient-to-br from-red-500 to-rose-600"
              )}>
                {a.classAverage > 0 ? `${a.classAverage}%` : '—'}
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
              <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
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
                            q.successRate >= 70 ? "bg-green-500/10 text-green-500"
                              : q.successRate >= 50 ? "bg-amber-500/10 text-amber-500"
                              : "bg-red-500/10 text-red-500"
                          )}>
                            {q.index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{q.questionText}</p>
                            <Progress value={q.successRate} className="h-1.5 mt-1" />
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn(
                              "text-xs font-bold",
                              q.successRate >= 70 ? "text-green-500" : q.successRate >= 50 ? "text-amber-500" : "text-red-500"
                            )}>
                              {q.successRate}%
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                              {q.correctCount}/{q.totalAttempts}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

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
                        const pct = s.totalPoints > 0 ? Math.round((s.grade / s.totalPoints) * 100) : 0;
                        return (
                          <div key={s.studentId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                            <span className="text-sm font-medium flex-1 truncate">{s.studentName}</span>
                            <Badge variant={pct >= 70 ? 'default' : pct >= 50 ? 'secondary' : 'destructive'} className="text-xs gap-1">
                              <Trophy className="w-3 h-3" />
                              {s.grade}/{s.totalPoints}
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
