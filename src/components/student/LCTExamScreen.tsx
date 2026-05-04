import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Clock, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle,
  Brain, Flag, Keyboard, LayoutGrid, Minus, ArrowUp, ChevronDown,
  ChevronUp, BookOpen, BarChart3, Target, Wifi, WifiOff
} from 'lucide-react';
import { ConfidencePicker, type ConfidenceLevel } from '@/components/ConfidencePicker';
import { recordConfidence } from '@/lib/confidence';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface LCTExamScreenProps {
  examId: string;
  lockedUntil: string;
  userId: string;
}

interface QuestionData {
  id: number;
  subject: string;
  question: string;
  options: string[];
  correct_answer?: string; // Only available after submission for review
}

interface ExamResult {
  score: number;
  correct: number;
  total: number;
  results: Array<{
    id: number;
    subject: string;
    is_correct: boolean;
    student_answer: string;
    correct_answer: string;
    explanation: string;
  }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const SUBJECTS = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology'];
const SUBJECT_EMOJIS: Record<string, string> = {
  'English': '📝', 'Mathematics': '🔢', 'Physics': '⚡',
  'Chemistry': '🧪', 'Biology': '🧬', 'Unknown': '📋',
};
const AUTOSAVE_INTERVAL = 20_000; // 20 seconds
const WARNING_TIME_MS = 10 * 60 * 1000; // 10 minutes

// ─── Utility Sub-Components ─────────────────────────────────────────────────────

function SubjectProgressBar({ subject, answered, total, isCurrent, onClick }: {
  subject: string; answered: number; total: number; isCurrent: boolean; onClick: () => void;
}) {
  const pct = total > 0 ? (answered / total) * 100 : 0;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 p-2 rounded-lg transition-all text-left w-full ${
        isCurrent ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
      }`}
    >
      <span className="text-sm">{SUBJECT_EMOJIS[subject] || '📋'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-medium truncate">{subject}</span>
          <span className="text-[10px] text-muted-foreground">{answered}/{total}</span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function QuestionNavGrid({ questions, answers, currentQ, flaggedQuestions, onSelect }: {
  questions: QuestionData[]; answers: Record<string, string>; currentQ: number;
  flaggedQuestions: Set<number>; onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-1">
      {questions.map((q, i) => {
        const isAnswered = !!answers[String(q.id)];
        const isCurrent = i === currentQ;
        const isFlagged = flaggedQuestions.has(q.id);
        return (
          <button
            key={q.id}
            onClick={() => onSelect(i)}
            className={`relative w-8 h-8 text-[10px] font-mono rounded-md border transition-all ${
              isCurrent
                ? 'border-primary bg-primary text-primary-foreground shadow-md scale-110'
                : isAnswered
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {i + 1}
            {isFlagged && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-background" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ExamLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-primary rounded-sm" /> Current</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-500/30 border border-green-500/50 rounded-sm" /> Answered</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-background border border-border rounded-sm" /> Unanswered</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" /> Flagged</span>
    </div>
  );
}

// ─── Results Sub-Components ─────────────────────────────────────────────────────

function ResultsSubjectCard({ subject, results }: {
  subject: string; results: ExamResult['results'];
}) {
  const subjectResults = results.filter(r => r.subject === subject);
  const correct = subjectResults.filter(r => r.is_correct).length;
  const total = subjectResults.length;
  const pct = total > 0 ? (correct / total) * 100 : 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{SUBJECT_EMOJIS[subject] || '📋'}</span>
          <div className="text-left">
            <p className="text-sm font-medium">{subject}</p>
            <p className="text-[10px] text-muted-foreground">{correct}/{total} correct</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${pct >= 70 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
            {pct.toFixed(0)}%
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border p-2 space-y-1.5 max-h-60 overflow-y-auto">
          {subjectResults.map(r => (
            <div
              key={r.id}
              className={`p-2 rounded-lg text-xs ${
                r.is_correct ? 'bg-green-500/5 border border-green-500/20' : 'bg-destructive/5 border border-destructive/20'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-muted-foreground">Q{r.id}</span>
                {r.is_correct ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertTriangle className="w-3 h-3 text-destructive" />}
              </div>
              {!r.is_correct && (
                <div className="text-muted-foreground">
                  <p>You answered: <span className="font-bold text-destructive">{r.student_answer || 'Skipped'}</span> · Correct: <span className="font-bold text-green-600">{r.correct_answer}</span></p>
                </div>
              )}
              {r.explanation && <p className="text-muted-foreground mt-0.5 italic">{r.explanation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function LCTExamScreen({ examId, lockedUntil, userId }: LCTExamScreenProps) {
  const { toast } = useToast();

  // Core state
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidences, setConfidences] = useState<Record<string, ConfidenceLevel>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ExamResult | null>(null);

  // UI state
  const [showNav, setShowNav] = useState(false);
  const [showSubjectNav, setShowSubjectNav] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSaveTime, setLastSaveTime] = useState<string>('');
  const [resultsSubjectFilter, setResultsSubjectFilter] = useState<string>('all');

  // Refs for stale closure prevention
  const submittedRef = useRef(false);
  const answersRef = useRef<Record<string, string>>({});
  const confidencesRef = useRef<Record<string, ConfidenceLevel>>({});
  const currentQRef = useRef(0);

  // Keep refs synced
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { confidencesRef.current = confidences; }, [confidences]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);

  // ─── Derived Data ─────────────────────────────────────────────────────────

  const subjectGroups = useMemo(() => {
    const groups: Record<string, { questions: QuestionData[]; indices: number[] }> = {};
    questions.forEach((q, idx) => {
      const subj = q.subject || 'Unknown';
      if (!groups[subj]) groups[subj] = { questions: [], indices: [] };
      groups[subj].questions.push(q);
      groups[subj].indices.push(idx);
    });
    return groups;
  }, [questions]);

  const currentSubject = useMemo(() => {
    return questions[currentQ]?.subject || '';
  }, [questions, currentQ]);

  const subjectProgress = useMemo(() => {
    const progress: Record<string, { answered: number; total: number }> = {};
    questions.forEach(q => {
      const subj = q.subject || 'Unknown';
      if (!progress[subj]) progress[subj] = { answered: 0, total: 0 };
      progress[subj].total++;
      if (answers[String(q.id)]) progress[subj].answered++;
    });
    return progress;
  }, [questions, answers]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const flaggedCount = useMemo(() => flaggedQuestions.size, [flaggedQuestions]);
  const unansweredCount = useMemo(() => questions.length - answeredCount, [questions.length, answeredCount]);

  const timeRemainingMs = useMemo(() => {
    const end = new Date(lockedUntil).getTime();
    const now = Date.now();
    return Math.max(0, end - now);
  }, [lockedUntil, timeRemaining]); // re-evaluate when timeRemaining updates

  const isLowTime = timeRemainingMs < WARNING_TIME_MS;

  // ─── Online/Offline Detection ─────────────────────────────────────────────

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => {
      setIsOnline(false);
      toast({ variant: 'destructive', title: 'Connection lost', description: 'Your answers are saved locally. They will sync when connection returns.' });
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ─── Load Exam Data ───────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('lct_exam_students')
        .select('translated_questions_json, status, answers_json, score')
        .eq('exam_id', examId)
        .eq('student_id', userId)
        .single();

      if (error) {
        console.error('Failed to load LCT exam:', error);
        setLoading(false);
        return;
      }

      if (data) {
        // Already finished
        if (data.status === 'completed' || data.status === 'timed_out') {
          setSubmitted(true);
          submittedRef.current = true;
          setResults({ score: data.score ?? 0, correct: 0, total: 0, results: [] });
        }

        // Load questions
        const qs = Array.isArray(data.translated_questions_json) ? data.translated_questions_json : [];
        setQuestions(qs as unknown as QuestionData[]);

        // Restore answers
        if (data.answers_json && typeof data.answers_json === 'object' && !Array.isArray(data.answers_json)) {
          const restored = data.answers_json as Record<string, string>;
          setAnswers(restored);
          answersRef.current = restored;
        }

        // Mark as in_progress if pending
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

  // ─── Submit Handler ───────────────────────────────────────────────────────

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'submit_exam', exam_id: examId, answers: answersRef.current },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
      const examResults = data as ExamResult;
      setResults(examResults);
      toast({ title: '✅ Exam submitted successfully!' });

      // Fire confidence calibration batch for every question we have a confidence for.
      // Done after results land so we know was_correct per question.
      try {
        const confSnapshot = confidencesRef.current;
        const perResult = examResults?.results || [];
        const qIndex = new Map(questions.map(q => [q.id, q]));
        for (const r of perResult) {
          const conf = confSnapshot[String(r.id)];
          if (!conf) continue;
          const q = qIndex.get(r.id);
          void recordConfidence({
            subject: r.subject || 'LCT',
            topic: r.subject || 'LCT',
            question_id: String(r.id),
            question_text: q?.question,
            confidence_level: conf,
            was_correct: !!r.is_correct,
            source: 'lct',
          });
        }
      } catch {
        // Never block submit success on calibration recording.
      }
    } catch (err: any) {
      submittedRef.current = false;
      toast({ variant: 'destructive', title: 'Error submitting', description: err.message });
    }
    setSubmitting(false);
  }, [examId, toast, questions]);

  // ─── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const end = new Date(lockedUntil).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining('00:00:00');
        doSubmit();
        clearInterval(interval);
        return;
      }

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil, doSubmit]);

  // ─── Prevent Leaving ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You are in an active exam. Leaving will not end the exam.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ─── Auto-Save ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(async () => {
      const currentAnswers = answersRef.current;
      if (Object.keys(currentAnswers).length === 0) return;
      if (!navigator.onLine) return;

      try {
        await supabase.from('lct_exam_students').update({
          answers_json: currentAnswers,
        }).eq('exam_id', examId).eq('student_id', userId);
        setLastSaveTime(new Date().toLocaleTimeString());
      } catch {
        // Silent fail
      }
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [examId, userId, submitted]);

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    if (submitted || loading) return;
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'n':
          e.preventDefault();
          setCurrentQ(prev => Math.min(questions.length - 1, prev + 1));
          break;
        case 'ArrowLeft':
        case 'p':
          e.preventDefault();
          setCurrentQ(prev => Math.max(0, prev - 1));
          break;
        case '1': case '2': case '3': case '4':
          e.preventDefault();
          const q = questions[currentQRef.current];
          if (q?.options && q.options.length >= parseInt(e.key)) {
            const letter = q.options[parseInt(e.key) - 1]?.charAt(0);
            if (letter) selectAnswer(q.id, letter);
          }
          break;
        case 'f':
          e.preventDefault();
          toggleFlag(questions[currentQRef.current]?.id);
          break;
        case 'g':
          e.preventDefault();
          setShowNav(prev => !prev);
          break;
        case '?':
          e.preventDefault();
          setShowKeyboardHelp(prev => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitted, loading, questions]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const selectAnswer = useCallback((questionId: number, answer: string) => {
    // Block answering until confidence is set for this question.
    if (!confidencesRef.current[String(questionId)]) {
      toast({
        title: 'Set your confidence first',
        description: 'Pick how sure you are before choosing an option.',
      });
      return;
    }
    setAnswers(prev => ({ ...prev, [String(questionId)]: answer }));
  }, [toast]);

  const setConfidenceFor = useCallback((questionId: number, level: ConfidenceLevel) => {
    setConfidences(prev => ({ ...prev, [String(questionId)]: level }));
  }, []);

  const toggleFlag = useCallback((questionId: number | undefined) => {
    if (questionId == null) return;
    setFlaggedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  const jumpToSubject = useCallback((subject: string) => {
    const group = subjectGroups[subject];
    if (group?.indices.length) {
      setCurrentQ(group.indices[0]);
      setShowSubjectNav(false);
    }
  }, [subjectGroups]);

  const jumpToNextUnanswered = useCallback(() => {
    const start = currentQ;
    for (let i = 1; i <= questions.length; i++) {
      const idx = (start + i) % questions.length;
      if (!answers[String(questions[idx].id)]) {
        setCurrentQ(idx);
        return;
      }
    }
    toast({ title: 'All questions answered!', description: 'You can review and submit.' });
  }, [currentQ, questions, answers, toast]);

  const jumpToNextFlagged = useCallback(() => {
    if (flaggedQuestions.size === 0) {
      toast({ title: 'No flagged questions' });
      return;
    }
    const flaggedIndices = questions
      .map((q, i) => flaggedQuestions.has(q.id) ? i : -1)
      .filter(i => i !== -1);
    const nextIdx = flaggedIndices.find(i => i > currentQ) ?? flaggedIndices[0];
    if (nextIdx != null) setCurrentQ(nextIdx);
  }, [flaggedQuestions, questions, currentQ, toast]);

  // ─── Loading Screen ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-12 h-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-lg font-semibold">Loading Luminary Cognitive Test...</p>
          <p className="text-xs text-muted-foreground mt-1">Preparing your personalized exam</p>
        </div>
      </div>
    );
  }

  // ─── Results Screen ───────────────────────────────────────────────────────

  if (submitted && results) {
    const hasDetailedResults = results.results && results.results.length > 0;
    const resultSubjects = hasDetailedResults
      ? [...new Set(results.results.map(r => r.subject))]
      : [];

    const filteredResults = resultsSubjectFilter === 'all'
      ? results.results || []
      : (results.results || []).filter(r => r.subject === resultsSubjectFilter);

    const correctCount = (results.results || []).filter(r => r.is_correct).length;
    const wrongCount = (results.results || []).filter(r => !r.is_correct && r.student_answer).length;
    const skippedCount = (results.results || []).filter(r => !r.is_correct && !r.student_answer).length;

    return (
      <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Score Header */}
          <div className="text-center mb-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">LCT Complete</h1>
            <p className={`text-5xl font-bold mb-2 ${
              results.score >= 80 ? 'text-green-500' :
              results.score >= 50 ? 'text-amber-500' : 'text-destructive'
            }`}>
              {results.score}%
            </p>
            {hasDetailedResults && (
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {correctCount} correct
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> {wrongCount} wrong
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Minus className="w-3.5 h-3.5" /> {skippedCount} skipped
                </span>
              </div>
            )}
          </div>

          {/* Subject Breakdown Cards */}
          {hasDetailedResults && (
            <div className="space-y-3 mb-8">
              <h2 className="font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Performance by Subject
              </h2>
              {resultSubjects.map(subj => (
                <ResultsSubjectCard key={subj} subject={subj} results={results.results} />
              ))}
            </div>
          )}

          {/* All Results List with Filter */}
          {hasDetailedResults && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> All Questions
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => setResultsSubjectFilter('all')}
                    className={`text-[10px] px-2 py-1 rounded-full ${resultsSubjectFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    All
                  </button>
                  {resultSubjects.map(subj => (
                    <button
                      key={subj}
                      onClick={() => setResultsSubjectFilter(subj)}
                      className={`text-[10px] px-2 py-1 rounded-full ${resultsSubjectFilter === subj ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      {SUBJECT_EMOJIS[subj] || '📋'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                {filteredResults.map(r => (
                  <div
                    key={r.id}
                    className={`p-2.5 rounded-lg border text-xs ${
                      r.is_correct ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-muted-foreground">Q{r.id}</span>
                      <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px]">{r.subject}</span>
                      {r.is_correct
                        ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                        : <AlertTriangle className="w-3 h-3 text-destructive" />
                      }
                    </div>
                    {!r.is_correct && (
                      <p className="text-muted-foreground">
                        Your answer: <span className="font-bold text-destructive">{r.student_answer || 'Skipped'}</span>
                        {' · '}Correct: <span className="font-bold text-green-600">{r.correct_answer}</span>
                      </p>
                    )}
                    {r.explanation && <p className="text-muted-foreground mt-0.5 italic">{r.explanation}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            The exam lock will be released automatically when the time expires.
          </p>
        </div>
      </div>
    );
  }

  // Submitted but waiting for results
  if (submitted) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold">Exam Submitted</h1>
          <p className="text-sm text-muted-foreground">Waiting for the exam period to end...</p>
        </div>
      </div>
    );
  }

  // ─── Active Exam Screen ───────────────────────────────────────────────────

  const question = questions[currentQ];

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* ═══ Header ═══ */}
      <div className="border-b border-border bg-card px-4 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Top row */}
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h1 className="font-bold text-sm">Luminary Cognitive Test</h1>
              <p className="text-[10px] text-muted-foreground">
                Q{currentQ + 1}/{questions.length} · {answeredCount} answered
                {flaggedCount > 0 && ` · ${flaggedCount} flagged`}
                {unansweredCount > 0 && ` · ${unansweredCount} remaining`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isOnline && <WifiOff className="w-3.5 h-3.5 text-destructive" />}
              <div className="flex items-center gap-1.5">
                <Clock className={`w-4 h-4 ${isLowTime ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
                <span className={`font-mono font-bold text-base ${isLowTime ? 'text-destructive animate-pulse' : ''}`}>
                  {timeRemaining}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <Progress value={((currentQ + 1) / questions.length) * 100} className="h-1" />

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSubjectNav(!showSubjectNav)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <BookOpen className="w-3 h-3" /> Subjects
              </button>
              <span className="text-muted-foreground text-[10px]">·</span>
              <button
                onClick={() => setShowNav(!showNav)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <LayoutGrid className="w-3 h-3" /> {showNav ? 'Hide' : 'Show'} Grid
              </button>
              <span className="text-muted-foreground text-[10px]">·</span>
              <button onClick={jumpToNextUnanswered} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                <Target className="w-3 h-3" /> Next Empty
              </button>
              {flaggedCount > 0 && (
                <>
                  <span className="text-muted-foreground text-[10px]">·</span>
                  <button onClick={jumpToNextFlagged} className="text-[10px] text-amber-500 hover:underline flex items-center gap-0.5">
                    <Flag className="w-3 h-3" /> Next Flag ({flaggedCount})
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {lastSaveTime && (
                <span className="text-[9px] text-muted-foreground">Saved {lastSaveTime}</span>
              )}
              <button onClick={() => setShowKeyboardHelp(!showKeyboardHelp)} className="text-[10px] text-muted-foreground hover:text-foreground">
                <Keyboard className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Subject Navigation Panel */}
          {showSubjectNav && (
            <div className="mt-2 p-2 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-1">
                {Object.entries(subjectProgress).map(([subject, data]) => (
                  <SubjectProgressBar
                    key={subject}
                    subject={subject}
                    answered={data.answered}
                    total={data.total}
                    isCurrent={currentSubject === subject}
                    onClick={() => jumpToSubject(subject)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Question Grid */}
          {showNav && (
            <div className="mt-2 p-2 bg-muted/30 rounded-lg border border-border/50">
              <ExamLegend />
              <div className="mt-1.5">
                <QuestionNavGrid
                  questions={questions}
                  answers={answers}
                  currentQ={currentQ}
                  flaggedQuestions={flaggedQuestions}
                  onSelect={i => { setCurrentQ(i); setShowNav(false); }}
                />
              </div>
            </div>
          )}

          {/* Keyboard Help */}
          {showKeyboardHelp && (
            <div className="mt-2 p-2 bg-muted/30 rounded-lg border border-border/50 text-[10px] text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Keyboard Shortcuts</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span>← / p → Previous</span>
                <span>→ / n → Next</span>
                <span>1-4 → Select option</span>
                <span>f → Flag question</span>
                <span>g → Toggle grid</span>
                <span>? → This help</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Question Body ═══ */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {question && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{SUBJECT_EMOJIS[question.subject] || '📋'}</span>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">
                    {question.subject}
                  </span>
                  <span className="text-xs text-muted-foreground">Q{question.id}</span>
                </div>
                <button
                  onClick={() => toggleFlag(question.id)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    flaggedQuestions.has(question.id)
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Flag className="w-3 h-3" />
                  {flaggedQuestions.has(question.id) ? 'Flagged' : 'Flag'}
                </button>
              </div>

              <p className="text-base font-medium mb-6 leading-relaxed">{question.question}</p>

              <div className="space-y-3">
                {(question.options || []).map((opt: string, i: number) => {
                  const letter = opt.charAt(0);
                  const isSelected = answers[String(question.id)] === letter;
                  return (
                    <button
                      key={i}
                      onClick={() => selectAnswer(question.id, letter)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all group ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/20'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-sm leading-relaxed">{opt}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Footer ═══ */}
      <div className="border-t border-border bg-card px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </Button>

          <div className="flex items-center gap-2">
            {unansweredCount > 0 && currentQ === questions.length - 1 && (
              <span className="text-[10px] text-amber-500">{unansweredCount} unanswered</span>
            )}
          </div>

          {currentQ === questions.length - 1 ? (
            <Button onClick={doSubmit} disabled={submitting} className="gap-2">
              {submitting ? <Brain className="w-4 h-4 animate-pulse" /> : <CheckCircle2 className="w-4 h-4" />}
              {submitting ? 'Submitting...' : 'Submit Exam'}
            </Button>
          ) : (
            <Button onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))} className="gap-1">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
