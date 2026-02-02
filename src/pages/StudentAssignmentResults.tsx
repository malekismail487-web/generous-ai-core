import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  points: number;
  questions_json: any;
  due_date: string | null;
  grade_level: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
}

interface QuizResult {
  questionId: string;
  questionTitle: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export default function StudentAssignmentResults() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { isStudent, school, profile, loading } = useRoleGuard();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const studentId = profile?.id;

  const canAccess = useMemo(() => {
    if (!assignment || !profile?.grade_level) return true;
    return assignment.grade_level === 'All' || assignment.grade_level === profile.grade_level;
  }, [assignment, profile?.grade_level]);

  useEffect(() => {
    const run = async () => {
      if (!assignmentId || !school || !studentId) return;
      setLoadingData(true);

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', assignmentId)
        .eq('school_id', school.id)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setAssignment(null);
        setLoadingData(false);
        return;
      }

      setAssignment(assignmentData as Assignment);

      const { data: submissionData } = await supabase
        .from('submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', studentId)
        .maybeSingle();

      setSubmission((submissionData || null) as Submission | null);
      setLoadingData(false);
    };

    run();
  }, [assignmentId, school, studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStudent || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <p className="text-sm text-muted-foreground">Assignment not found.</p>
          <Button onClick={() => navigate('/student')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <p className="text-sm text-muted-foreground">
            This assignment isn't available for your grade.
          </p>
          <Button onClick={() => navigate('/student')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // Parse submission content to get quiz results.
  const questions = Array.isArray(assignment.questions_json) ? assignment.questions_json : [];
  let results: QuizResult[] = [];

  if (submission?.content) {
    try {
      const parsed = JSON.parse(submission.content);
      if (parsed.results && Array.isArray(parsed.results)) {
        results = parsed.results;
      }
    } catch (error) {
      console.error('Error parsing submission content:', error);
    }
  }

  const finalScore = submission?.grade ?? 0;
  const correctCount = results.filter((r) => r.isCorrect).length;
  const percentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  const getOptionText = (questionIndex: number, key: string) => {
    const question = questions[questionIndex];
    if (!question) return '';
    switch (key) {
      case 'A':
        return question.optionA;
      case 'B':
        return question.optionB;
      case 'C':
        return question.optionC;
      case 'D':
        return question.optionD;
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/student')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-xl font-bold">{assignment.title}</h2>
              <p className="text-sm text-muted-foreground">Quiz Results</p>
            </div>
          </div>

          {/* Score Summary - Examination Style */}
          <div className="glass-effect rounded-2xl p-8 text-center">
            <div
              className={cn(
                'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center',
                percentage >= 70
                  ? 'bg-emerald-500/20'
                  : percentage >= 50
                  ? 'bg-amber-500/20'
                  : 'bg-destructive/20'
              )}
            >
              <Trophy
                className={cn(
                  'w-10 h-10',
                  percentage >= 70
                    ? 'text-emerald-500'
                    : percentage >= 50
                    ? 'text-amber-500'
                    : 'text-destructive'
                )}
              />
            </div>
            <p className="text-5xl font-bold mb-2">
              {finalScore}/{assignment.points}
            </p>
            <p className="text-lg text-muted-foreground mb-4">
              {correctCount} out of {questions.length} correct ({percentage}%)
            </p>
            <Progress value={percentage} className="h-3 max-w-sm mx-auto" />
            <p className="text-sm text-muted-foreground mt-4">
              {percentage >= 70
                ? 'Great job! 🎉'
                : percentage >= 50
                ? 'Good effort! Keep practicing.'
                : 'Keep studying and try again!'}
            </p>
          </div>

          {/* Results Breakdown */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Question Results:</h3>
              {results.map((result, index) => {
                return (
                  <div
                    key={result.questionId}
                    className={cn(
                      'glass-effect rounded-xl p-4 border',
                      result.isCorrect
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-destructive/50 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          result.isCorrect ? 'bg-emerald-500 text-white' : 'bg-destructive text-white'
                        )}
                      >
                        {result.isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            Q{index + 1}
                          </Badge>
                          <span className="font-medium">{result.questionTitle}</span>
                        </div>
                        <div className="text-sm space-y-1">
                          <p className="flex items-center gap-2">
                            <span className="text-muted-foreground">Your answer:</span>
                            <span
                              className={cn(
                                'font-medium',
                                result.isCorrect ? 'text-emerald-600' : 'text-destructive'
                              )}
                            >
                              {result.selectedAnswer
                                ? `${result.selectedAnswer}. ${getOptionText(index, result.selectedAnswer)}`
                                : 'Not answered'}
                            </span>
                          </p>
                          {!result.isCorrect && (
                            <p className="flex items-center gap-2">
                              <span className="text-muted-foreground">Correct answer:</span>
                              <span className="text-emerald-600 font-medium">
                                {result.correctAnswer}. {getOptionText(index, result.correctAnswer)}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button onClick={() => navigate('/')} size="lg" className="w-full">
            Back to App
          </Button>
        </div>
      </main>
    </div>
  );
}
