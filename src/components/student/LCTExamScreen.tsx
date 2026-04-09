import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Brain } from 'lucide-react';

interface LCTExamScreenProps {
  examId: string;
  lockedUntil: string;
  userId: string;
}

export default function LCTExamScreen({ examId, lockedUntil, userId }: LCTExamScreenProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<any>(null);
  const submittedRef = useRef(false);

  // Load student's exam
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('lct_exam_students')
        .select('translated_questions_json, status, answers_json, score')
        .eq('exam_id', examId)
        .eq('student_id', userId)
        .single();

      if (data) {
        if (data.status === 'completed' || data.status === 'timed_out') {
          setSubmitted(true);
          setResults({ score: data.score });
        }
        setQuestions(data.translated_questions_json || []);
        if (data.answers_json && typeof data.answers_json === 'object' && !Array.isArray(data.answers_json)) {
          setAnswers(data.answers_json as Record<number, string>);
        }

        // Mark as in_progress
        if (data.status === 'pending') {
          await supabase.from('lct_exam_students').update({
            status: 'in_progress',
            started_at: new Date().toISOString(),
          }).eq('exam_id', examId).eq('student_id', userId);
        }
      }
      setLoading(false);
    };
    load();
  }, [examId, userId]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(lockedUntil).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining('00:00:00');
        if (!submittedRef.current) {
          submitExam();
        }
        clearInterval(interval);
        return;
      }

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Prevent leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You are in an active exam. Your progress will be saved but you cannot leave.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Auto-save answers periodically
  useEffect(() => {
    if (submitted || Object.keys(answers).length === 0) return;
    const interval = setInterval(async () => {
      await supabase.from('lct_exam_students').update({
        answers_json: answers,
      }).eq('exam_id', examId).eq('student_id', userId);
    }, 30000); // Save every 30 seconds
    return () => clearInterval(interval);
  }, [answers, examId, userId, submitted]);

  const selectAnswer = useCallback((questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const submitExam = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'submit_exam', exam_id: examId, answers },
      });

      if (error) throw error;
      setSubmitted(true);
      setResults(data);
      toast({ title: 'Exam submitted!' });
    } catch (err: any) {
      submittedRef.current = false;
      toast({ variant: 'destructive', title: 'Error submitting', description: err.message });
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-12 h-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-lg font-semibold">Loading Luminary Cognitive Test...</p>
        </div>
      </div>
    );
  }

  // Results screen
  if (submitted && results) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">LCT Completed</h1>
            <p className="text-4xl font-bold text-primary mb-1">{results.score}%</p>
            <p className="text-sm text-muted-foreground">
              {results.correct}/{results.total} correct answers
            </p>
          </div>

          {results.results && (
            <div className="space-y-2">
              <h2 className="font-semibold mb-3">Your Results</h2>
              {results.results.map((r: any) => (
                <div key={r.id} className={`p-3 rounded-lg border ${r.is_correct ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono">Q{r.id}</span>
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{r.subject}</span>
                    {r.is_correct ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-destructive" />
                    )}
                  </div>
                  {!r.is_correct && (
                    <p className="text-xs text-muted-foreground">
                      Your answer: <span className="font-bold">{r.student_answer || 'No answer'}</span> · Correct: <span className="font-bold text-green-600">{r.correct_answer}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{r.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            The exam lock will be released automatically. You may close this screen.
          </p>
        </div>
      </div>
    );
  }

  // Waiting for results (submitted but no results yet)
  if (submitted) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold">Exam Submitted</h1>
          <p className="text-sm text-muted-foreground">Waiting for the exam to end...</p>
        </div>
      </div>
    );
  }

  const question = questions[currentQ];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-sm">Luminary Cognitive Test</h1>
            <p className="text-xs text-muted-foreground">
              Question {currentQ + 1} of {questions.length} · {answeredCount} answered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-destructive" />
            <span className={`font-mono font-bold text-lg ${timeRemaining <= '00:10:00' ? 'text-destructive animate-pulse' : ''}`}>
              {timeRemaining}
            </span>
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-2">
          <Progress value={((currentQ + 1) / questions.length) * 100} className="h-1.5" />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {question && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">
                  {question.subject}
                </span>
                <span className="text-xs text-muted-foreground">Q{question.id}</span>
              </div>

              <p className="text-base font-medium mb-6 leading-relaxed">{question.question}</p>

              <div className="space-y-3">
                {(question.options || []).map((opt: string, i: number) => {
                  const letter = opt.charAt(0);
                  const isSelected = answers[question.id] === letter;
                  return (
                    <button
                      key={i}
                      onClick={() => selectAnswer(question.id, letter)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-sm">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>

          {currentQ === questions.length - 1 ? (
            <Button onClick={submitExam} disabled={submittedRef.current} className="gap-2">
              <CheckCircle2 className="w-4 h-4" /> Submit Exam
            </Button>
          ) : (
            <Button onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
