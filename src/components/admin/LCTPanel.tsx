import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, School, CheckCircle2, Brain, Play, Eye,
  ChevronRight, ChevronLeft, BarChart3, FileText, Clock,
  Users, TrendingUp, ArrowUp, ArrowDown, Minus, Target,
  Download, RefreshCw, AlertTriangle, Award, BookOpen,
  ChevronDown, ChevronUp, Search, Filter, X
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ─── Types ──────────────────────────────────────────────────────────────────────

type SchoolData = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type LCTExam = {
  id: string;
  title: string;
  status: string;
  questions_json: any[];
  answer_key_json: any[];
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
};

type StudentResult = {
  id: string;
  student_id: string;
  exam_id: string;
  score: number | null;
  status: string;
  learning_style: string;
  school_id: string;
  answers_json: Record<string, string>;
  translated_questions_json: any[];
  started_at: string | null;
  submitted_at: string | null;
  full_name: string;
  school_name: string;
  grade_level: string;
};

type AnalyticsData = {
  overall: {
    mean: number;
    median: number;
    stdDev: number;
    highest: number;
    lowest: number;
    passRate: number; // >= 50%
    excellenceRate: number; // >= 80%
    totalStudents: number;
    completedStudents: number;
    timedOutStudents: number;
  };
  bySubject: Record<string, { correct: number; total: number; accuracy: number }>;
  bySchool: Record<string, { name: string; mean: number; count: number; passRate: number }>;
  byLearningStyle: Record<string, { mean: number; count: number }>;
  byGrade: Record<string, { mean: number; count: number }>;
  scoreDistribution: number[];
};

type WizardStep = 'select' | 'collecting' | 'collected' | 'generating' | 'preview' | 'translating' | 'translated' | 'launch' | 'monitor' | 'results';

// ─── Utility Functions ──────────────────────────────────────────────────────────

function calcMedian(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcStdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function buildScoreDistribution(scores: number[]): number[] {
  const bins = new Array(10).fill(0); // 0-9, 10-19, ..., 90-100
  scores.forEach(s => {
    const idx = Math.min(Math.floor(s / 10), 9);
    bins[idx]++;
  });
  return bins;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color = 'text-foreground', subtext }: {
  label: string; value: string | number; icon: any; color?: string; subtext?: string;
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

function ScoreBar({ label, value, max = 100, color = 'bg-primary' }: {
  label: string; value: number; max?: number; color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

function DistributionChart({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 1);
  const labels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];
  return (
    <div className="flex items-end gap-1 h-24">
      {bins.map((count, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <span className="text-[8px] text-muted-foreground">{count}</span>
          <div
            className={`w-full rounded-t transition-all ${count > 0 ? 'bg-primary/70' : 'bg-muted'}`}
            style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? '4px' : '2px' }}
          />
          <span className="text-[7px] text-muted-foreground leading-none">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function StudentDetailModal({ student, answerKey, onClose }: {
  student: StudentResult; answerKey: any[]; onClose: () => void;
}) {
  const questions = student.translated_questions_json || [];
  const answers = student.answers_json || {};
  const keyMap: Record<string, any> = {};
  (answerKey || []).forEach((k: any) => { keyMap[String(k.id)] = k; });

  // Per-subject breakdown
  const subjectBreakdown: Record<string, { correct: number; total: number }> = {};
  questions.forEach((q: any) => {
    const subj = q.subject || 'Unknown';
    if (!subjectBreakdown[subj]) subjectBreakdown[subj] = { correct: 0, total: 0 };
    subjectBreakdown[subj].total++;
    const studentAns = answers[String(q.id)];
    const correctAns = keyMap[String(q.id)]?.correct_answer;
    if (studentAns && correctAns && studentAns === correctAns) {
      subjectBreakdown[subj].correct++;
    }
  });

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{student.full_name}</h3>
            <p className="text-xs text-muted-foreground">
              {student.school_name} · Grade {student.grade_level || '?'} · {student.learning_style} learner
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className={`text-2xl font-bold ${(student.score ?? 0) >= 70 ? 'text-green-500' : (student.score ?? 0) >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
                {student.score ?? 0}%
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{student.status}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Subject Performance */}
        <div className="p-4 border-b border-border">
          <h4 className="text-sm font-semibold mb-2">Subject Performance</h4>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(subjectBreakdown).map(([subj, data]) => {
              const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
              return (
                <div key={subj} className="text-center p-2 bg-muted/50 rounded-lg">
                  <p className="text-[10px] text-muted-foreground truncate">{subj}</p>
                  <p className={`text-sm font-bold ${pct >= 70 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
                    {pct.toFixed(0)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">{data.correct}/{data.total}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Question-by-question results */}
        <div className="p-4 overflow-y-auto max-h-[45vh]">
          <h4 className="text-sm font-semibold mb-2">Question Details ({questions.length} questions)</h4>
          <div className="space-y-1.5">
            {questions.map((q: any) => {
              const studentAns = answers[String(q.id)];
              const key = keyMap[String(q.id)];
              const correctAns = key?.correct_answer;
              const isCorrect = studentAns && correctAns && studentAns === correctAns;
              const wasSkipped = !studentAns;
              return (
                <div
                  key={q.id}
                  className={`p-2.5 rounded-lg border text-xs ${
                    isCorrect ? 'border-green-500/30 bg-green-500/5' :
                    wasSkipped ? 'border-muted bg-muted/30' :
                    'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">Q{q.id}</span>
                    <span className="bg-primary/10 text-primary px-1 py-0.5 rounded text-[9px]">{q.subject}</span>
                    {isCorrect ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : wasSkipped ? (
                      <Minus className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-destructive" />
                    )}
                    <span className="ml-auto text-muted-foreground truncate max-w-[200px]">{q.question?.substring(0, 60)}...</span>
                  </div>
                  {!isCorrect && (
                    <div className="mt-1 text-muted-foreground">
                      {wasSkipped ? (
                        <span>Skipped · Correct: <span className="font-bold text-green-600">{correctAns}</span></span>
                      ) : (
                        <span>Answered: <span className="font-bold text-destructive">{studentAns}</span> · Correct: <span className="font-bold text-green-600">{correctAns}</span></span>
                      )}
                      {key?.explanation && <span className="block mt-0.5 italic">{key.explanation}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function LCTPanel() {
  const { toast } = useToast();
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>('select');
  const [exam, setExam] = useState<LCTExam | null>(null);
  const [collectResult, setCollectResult] = useState<any>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [resultsData, setResultsData] = useState<StudentResult[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [existingExams, setExistingExams] = useState<LCTExam[]>([]);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'score' | 'name' | 'school' | 'grade'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [resultsTab, setResultsTab] = useState<'leaderboard' | 'analytics' | 'answers'>('leaderboard');
  const [previewSubjectFilter, setPreviewSubjectFilter] = useState<string>('all');

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('schools').select('id, name, code, status').eq('status', 'active').order('name');
    setSchools((data || []) as SchoolData[]);
    setLoading(false);
  }, []);

  const fetchExistingExams = useCallback(async () => {
    const { data } = await supabase.from('lct_exams').select('*').order('created_at', { ascending: false });
    setExistingExams((data || []) as LCTExam[]);
    const active = (data || []).find((e: any) => e.status === 'active');
    if (active) {
      setExam(active as LCTExam);
      setStep('monitor');
    }
  }, []);

  useEffect(() => {
    fetchSchools();
    fetchExistingExams();
  }, [fetchSchools, fetchExistingExams]);

  // ─── Monitor Timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'monitor' || !exam?.ends_at) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(exam.ends_at!).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setTimeRemaining('00:00:00');
        handleEndExam();
        clearInterval(interval);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, exam?.ends_at]);

  // ─── Monitor Polling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'monitor' || !exam) return;
    const poll = async () => {
      const { data } = await supabase
        .from('lct_exam_students')
        .select('status, student_id, answers_json, score')
        .eq('exam_id', exam.id);
      const total = data?.length || 0;
      const completed = data?.filter((s: any) => s.status === 'completed' || s.status === 'timed_out').length || 0;
      const inProgress = data?.filter((s: any) => s.status === 'in_progress').length || 0;
      const pending = total - completed - inProgress;
      const answeredCounts = (data || []).map((s: any) => {
        const ans = s.answers_json;
        return ans && typeof ans === 'object' ? Object.keys(ans).length : 0;
      });
      const avgAnswered = answeredCounts.length > 0
        ? Math.round(answeredCounts.reduce((a: number, b: number) => a + b, 0) / answeredCounts.length)
        : 0;
      setMonitorData({ total, completed, inProgress, pending, avgAnswered });
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [step, exam?.id]);

  // ─── Analytics Computation ──────────────────────────────────────────────────

  const analytics = useMemo<AnalyticsData | null>(() => {
    if (!resultsData.length || !exam?.answer_key_json) return null;

    const scores = resultsData.filter(r => r.score != null).map(r => r.score!);
    if (!scores.length) return null;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median = calcMedian(scores);
    const stdDev = calcStdDev(scores, mean);
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passRate = (scores.filter(s => s >= 50).length / scores.length) * 100;
    const excellenceRate = (scores.filter(s => s >= 80).length / scores.length) * 100;
    const completedStudents = resultsData.filter(r => r.status === 'completed').length;
    const timedOutStudents = resultsData.filter(r => r.status === 'timed_out').length;

    // By subject
    const keyMap: Record<string, any> = {};
    (exam.answer_key_json as any[]).forEach((k: any) => { keyMap[String(k.id)] = k; });

    const bySubject: Record<string, { correct: number; total: number; accuracy: number }> = {};
    resultsData.forEach(student => {
      const answers = student.answers_json || {};
      Object.entries(keyMap).forEach(([qId, key]) => {
        const subj = key.subject || 'Unknown';
        if (!bySubject[subj]) bySubject[subj] = { correct: 0, total: 0, accuracy: 0 };
        bySubject[subj].total++;
        if (answers[qId] && answers[qId] === key.correct_answer) {
          bySubject[subj].correct++;
        }
      });
    });
    Object.values(bySubject).forEach(v => { v.accuracy = v.total > 0 ? (v.correct / v.total) * 100 : 0; });

    // By school
    const bySchool: Record<string, { name: string; mean: number; count: number; passRate: number; scores: number[] }> = {};
    resultsData.forEach(s => {
      if (s.score == null) return;
      if (!bySchool[s.school_id]) bySchool[s.school_id] = { name: s.school_name, mean: 0, count: 0, passRate: 0, scores: [] };
      bySchool[s.school_id].scores.push(s.score);
      bySchool[s.school_id].count++;
    });
    Object.values(bySchool).forEach(v => {
      v.mean = v.scores.reduce((a, b) => a + b, 0) / v.scores.length;
      v.passRate = (v.scores.filter(s => s >= 50).length / v.scores.length) * 100;
    });

    // By learning style
    const byLearningStyle: Record<string, { mean: number; count: number; scores: number[] }> = {};
    resultsData.forEach(s => {
      if (s.score == null) return;
      const style = s.learning_style || 'unknown';
      if (!byLearningStyle[style]) byLearningStyle[style] = { mean: 0, count: 0, scores: [] };
      byLearningStyle[style].scores.push(s.score);
      byLearningStyle[style].count++;
    });
    Object.values(byLearningStyle).forEach(v => {
      v.mean = v.scores.reduce((a, b) => a + b, 0) / v.scores.length;
    });

    // By grade
    const byGrade: Record<string, { mean: number; count: number; scores: number[] }> = {};
    resultsData.forEach(s => {
      if (s.score == null) return;
      const grade = s.grade_level || 'Unknown';
      if (!byGrade[grade]) byGrade[grade] = { mean: 0, count: 0, scores: [] };
      byGrade[grade].scores.push(s.score);
      byGrade[grade].count++;
    });
    Object.values(byGrade).forEach(v => {
      v.mean = v.scores.reduce((a, b) => a + b, 0) / v.scores.length;
    });

    return {
      overall: { mean, median, stdDev, highest, lowest, passRate, excellenceRate, totalStudents: resultsData.length, completedStudents, timedOutStudents },
      bySubject,
      bySchool: bySchool as any,
      byLearningStyle: byLearningStyle as any,
      byGrade: byGrade as any,
      scoreDistribution: buildScoreDistribution(scores),
    };
  }, [resultsData, exam?.answer_key_json]);

  // ─── Filtered & Sorted Results ──────────────────────────────────────────────

  const filteredResults = useMemo(() => {
    let data = [...resultsData];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        s.school_name.toLowerCase().includes(q) ||
        s.learning_style.toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'score': cmp = (a.score ?? -1) - (b.score ?? -1); break;
        case 'name': cmp = a.full_name.localeCompare(b.full_name); break;
        case 'school': cmp = a.school_name.localeCompare(b.school_name); break;
        case 'grade': cmp = (a.grade_level || '').localeCompare(b.grade_level || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return data;
  }, [resultsData, searchQuery, sortField, sortDir]);

  // ─── Filtered Preview Questions ─────────────────────────────────────────────

  const previewQuestions = useMemo(() => {
    if (!exam?.questions_json) return [];
    if (previewSubjectFilter === 'all') return exam.questions_json;
    return exam.questions_json.filter((q: any) => q.subject === previewSubjectFilter);
  }, [exam?.questions_json, previewSubjectFilter]);

  const previewSubjects = useMemo(() => {
    if (!exam?.questions_json) return [];
    return [...new Set(exam.questions_json.map((q: any) => q.subject))];
  }, [exam?.questions_json]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const toggleSchool = (id: string) => {
    setSelectedSchools(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelectedSchools(prev => prev.length === schools.length ? [] : schools.map(s => s.id));
  };

  const createAndCollectData = async () => {
    if (!selectedSchools.length) {
      toast({ variant: 'destructive', title: 'Select at least one school' });
      return;
    }
    setActionLoading(true);
    setStep('collecting');
    try {
      const { data: newExam, error: createErr } = await supabase
        .from('lct_exams')
        .insert({ title: 'Luminary Cognitive Test', created_by: (await supabase.auth.getUser()).data.user!.id })
        .select()
        .single();
      if (createErr) throw createErr;
      setExam(newExam as LCTExam);

      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'collect_data', school_ids: selectedSchools, exam_id: newExam.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setCollectResult(data);
      setStep('collected');
      toast({ title: 'All data collected!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error collecting data', description: err.message });
      setStep('select');
    }
    setActionLoading(false);
  };

  const generateExam = async () => {
    if (!exam) return;
    setActionLoading(true);
    setStep('generating');
    try {
      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'generate_exam', exam_id: exam.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setExam(prev => prev ? { ...prev, questions_json: data.questions, answer_key_json: data.answer_key, status: 'generated' } : null);
      setStep('preview');
      toast({ title: `Exam generated with ${data.total_questions} questions!` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error generating exam', description: err.message });
      setStep('collected');
    }
    setActionLoading(false);
  };

  const translateExams = async () => {
    if (!exam) return;
    setActionLoading(true);
    setStep('translating');
    setTranslateProgress(10);
    try {
      const progressInterval = setInterval(() => {
        setTranslateProgress(prev => Math.min(prev + 3, 92));
      }, 4000);
      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'translate_exam', exam_id: exam.id },
      });
      clearInterval(progressInterval);
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setTranslateProgress(100);
      setStep('translated');
      toast({ title: 'Translation finished!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error translating exams', description: err.message });
      setStep('preview');
    }
    setActionLoading(false);
  };

  const startExam = async () => {
    if (!exam) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lct', {
        body: { action: 'start_exam', exam_id: exam.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setExam(prev => prev ? { ...prev, status: 'active', started_at: data.started_at, ends_at: data.ends_at } : null);
      setStep('monitor');
      toast({ title: `Exam started! ${data.locked_students} students locked for 2 hours.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error starting exam', description: err.message });
    }
    setActionLoading(false);
  };

  const handleEndExam = async () => {
    if (!exam) return;
    try {
      await supabase.functions.invoke('generate-lct', {
        body: { action: 'end_exam', exam_id: exam.id },
      });
      setExam(prev => prev ? { ...prev, status: 'completed' } : null);
      await loadResultsForExam(exam.id);
      setStep('results');
      toast({ title: 'Exam ended. Results are ready.' });
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadResultsForExam = async (examId: string) => {
    const { data: studentData } = await supabase
      .from('lct_exam_students')
      .select('*')
      .eq('exam_id', examId)
      .order('score', { ascending: false });

    if (!studentData?.length) {
      setResultsData([]);
      return;
    }

    // Fetch profiles and school names
    const studentIds = studentData.map((s: any) => s.student_id);
    const schoolIds = [...new Set(studentData.map((s: any) => s.school_id))];

    const [profilesRes, schoolsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, grade_level').in('id', studentIds),
      supabase.from('schools').select('id, name').in('id', schoolIds),
    ]);

    const nameMap: Record<string, { name: string; grade: string }> = {};
    (profilesRes.data || []).forEach((p: any) => {
      nameMap[p.id] = { name: p.full_name, grade: p.grade_level || '' };
    });
    const schoolMap: Record<string, string> = {};
    (schoolsRes.data || []).forEach((s: any) => { schoolMap[s.id] = s.name; });

    setResultsData(studentData.map((s: any) => ({
      ...s,
      full_name: nameMap[s.student_id]?.name || 'Unknown',
      grade_level: nameMap[s.student_id]?.grade || '',
      school_name: schoolMap[s.school_id] || 'Unknown School',
    })));
  };

  const loadResults = async (examId: string) => {
    const { data: examData } = await supabase.from('lct_exams').select('*').eq('id', examId).single();
    if (examData) {
      setExam(examData as LCTExam);
      await loadResultsForExam(examId);
      setStep('results');
    }
  };

  const exportResultsCSV = () => {
    if (!filteredResults.length) return;
    const headers = ['Rank', 'Name', 'School', 'Grade', 'Learning Style', 'Score', 'Status'];
    const rows = filteredResults.map((s, i) => [
      i + 1, s.full_name, s.school_name, s.grade_level, s.learning_style, s.score ?? 'N/A', s.status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LCT_Results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ════════════════════ Previous Exams ════════════════════ */}
      {step === 'select' && existingExams.length > 0 && (
        <div className="glass-effect rounded-xl p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Previous LCT Exams</h3>
          <div className="space-y-2">
            {existingExams.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleDateString()} · <span className="capitalize">{e.status}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {e.status === 'completed' && (
                    <Button size="sm" variant="outline" onClick={() => loadResults(e.id)} className="gap-1">
                      <BarChart3 className="w-3 h-3" /> Results
                    </Button>
                  )}
                  {e.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => { setExam(e as LCTExam); setStep('monitor'); }} className="gap-1">
                      <Eye className="w-3 h-3" /> Monitor
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════ Select Schools ════════════════════ */}
      {step === 'select' && (
        <div className="glass-effect rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <School className="w-5 h-5" /> Generate LCT — Select Schools
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select the schools to include. Only students in Grade 9 and above will be included.
          </p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{selectedSchools.length} of {schools.length} selected</span>
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedSchools.length === schools.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {schools.map(school => (
              <label
                key={school.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSchools.includes(school.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <Checkbox checked={selectedSchools.includes(school.id)} onCheckedChange={() => toggleSchool(school.id)} />
                <div>
                  <p className="font-medium text-sm">{school.name}</p>
                  <p className="text-xs text-muted-foreground">Code: {school.code}</p>
                </div>
              </label>
            ))}
          </div>
          <Button className="mt-4 w-full gap-2" onClick={createAndCollectData} disabled={actionLoading || !selectedSchools.length}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Collect Data & Begin
          </Button>
        </div>
      )}

      {/* ════════════════════ Collecting ════════════════════ */}
      {step === 'collecting' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Collecting Adaptive Data...</h2>
          <p className="text-sm text-muted-foreground">Gathering learning profiles from eligible students (Grade 9+)</p>
        </div>
      )}

      {/* ════════════════════ Collected ════════════════════ */}
      {step === 'collected' && collectResult && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <h2 className="text-lg font-bold">Data Collection Complete</h2>
              <p className="text-sm text-muted-foreground">{collectResult.total_students} eligible students from {collectResult.schools_count} school(s)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(collectResult.style_breakdown || {}).map(([style, count]) => (
              <div key={style} className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground capitalize">{style}</p>
                <p className="text-lg font-bold">{count as number}</p>
              </div>
            ))}
          </div>
          <Button className="w-full gap-2" onClick={generateExam} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Generate Exam (140 Questions)
          </Button>
        </div>
      )}

      {/* ════════════════════ Generating ════════════════════ */}
      {step === 'generating' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Generating LCT Exam...</h2>
          <p className="text-sm text-muted-foreground">Creating 140 challenging questions across 5 subjects with cross-model validation.</p>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>📝 English (28 questions)</p>
            <p>🔢 Mathematics (28 questions)</p>
            <p>⚡ Physics (28 questions)</p>
            <p>🧪 Chemistry (28 questions)</p>
            <p>🧬 Biology (28 questions)</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 italic">This may take 2-4 minutes. Please wait.</p>
        </div>
      )}

      {/* ════════════════════ Preview ════════════════════ */}
      {step === 'preview' && exam?.questions_json && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Exam Preview</h2>
            <span className="text-sm text-muted-foreground">
              {previewIndex + 1} / {previewQuestions.length}
              {previewSubjectFilter !== 'all' && ` (${previewSubjectFilter})`}
            </span>
          </div>

          {/* Subject filter tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            <button
              onClick={() => { setPreviewSubjectFilter('all'); setPreviewIndex(0); }}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${previewSubjectFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              All ({exam.questions_json.length})
            </button>
            {previewSubjects.map(subj => (
              <button
                key={subj}
                onClick={() => { setPreviewSubjectFilter(subj); setPreviewIndex(0); }}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${previewSubjectFilter === subj ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {subj} ({exam.questions_json.filter((q: any) => q.subject === subj).length})
              </button>
            ))}
          </div>

          <Progress value={((previewIndex + 1) / previewQuestions.length) * 100} className="mb-4 h-1.5" />

          {previewQuestions[previewIndex] && (
            <div className="bg-muted/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">{previewQuestions[previewIndex].subject}</span>
                <span className="text-xs text-muted-foreground">Q{previewQuestions[previewIndex].id}</span>
              </div>
              <p className="font-medium mb-3 leading-relaxed">{previewQuestions[previewIndex].question}</p>
              <div className="space-y-2">
                {(previewQuestions[previewIndex].options || []).map((opt: string, i: number) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-lg text-sm ${
                      opt.startsWith(previewQuestions[previewIndex].correct_answer + ')')
                        ? 'bg-green-500/10 border border-green-500/30 font-medium'
                        : 'bg-background border border-border'
                    }`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
              {previewQuestions[previewIndex].explanation && (
                <p className="text-xs text-muted-foreground mt-3 italic bg-muted/50 p-2 rounded">
                  💡 {previewQuestions[previewIndex].explanation}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewIndex(Math.min(previewQuestions.length - 1, previewIndex + 1))} disabled={previewIndex >= previewQuestions.length - 1}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button className="w-full mt-4 gap-2" onClick={translateExams} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Translate for All Students
          </Button>
        </div>
      )}

      {/* ════════════════════ Translating ════════════════════ */}
      {step === 'translating' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Translating for Every Student...</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Rewording each question to match every student's learning style while preserving difficulty.
          </p>
          <Progress value={translateProgress} className="max-w-sm mx-auto h-2" />
          <p className="text-xs text-muted-foreground mt-2">{translateProgress}%</p>
        </div>
      )}

      {/* ════════════════════ Translated ════════════════════ */}
      {step === 'translated' && (
        <div className="glass-effect rounded-xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">All Exams Personalized</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Every student now has a version matching their learning style. Ready to launch.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2" size="lg">
                <Play className="w-5 h-5" /> Launch Exam
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Launch Luminary Cognitive Test?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will lock ALL eligible students into the exam for 2 hours. They cannot use any other part of the app — even if they log out and back in. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={startExam} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm — Lock All Students
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* ════════════════════ Monitor ════════════════════ */}
      {step === 'monitor' && monitorData && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5 animate-pulse" /> Live Exam Monitor
            </h2>
            <div className="flex items-center gap-2 text-lg font-mono font-bold">
              <Clock className="w-5 h-5 text-destructive" />
              <span className={timeRemaining <= '00:10:00' ? 'text-destructive animate-pulse' : 'text-foreground'}>{timeRemaining}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard label="Total Students" value={monitorData.total} icon={Users} />
            <StatCard label="In Progress" value={monitorData.inProgress} icon={Play} color="text-primary" />
            <StatCard label="Completed" value={monitorData.completed} icon={CheckCircle2} color="text-green-500" />
            <StatCard label="Not Started" value={monitorData.pending} icon={Clock} color="text-muted-foreground" />
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Completion Progress</span>
              <span>{monitorData.total > 0 ? Math.round((monitorData.completed / monitorData.total) * 100) : 0}%</span>
            </div>
            <Progress value={monitorData.total > 0 ? (monitorData.completed / monitorData.total) * 100 : 0} className="h-2.5" />
          </div>

          {monitorData.avgAnswered > 0 && (
            <p className="text-xs text-muted-foreground text-center mb-4">
              Average questions answered: <span className="font-bold text-foreground">{monitorData.avgAnswered}</span> / 140
            </p>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">Force End Exam</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Force End Exam?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately end the exam for all students. In-progress exams will be auto-graded based on current answers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleEndExam}>End Exam Now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* ════════════════════ Results Dashboard ════════════════════ */}
      {step === 'results' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="glass-effect rounded-xl p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BarChart3 className="w-5 h-5" /> LCT Results Dashboard
              </h2>
              <p className="text-xs text-muted-foreground">
                {exam?.title} · {new Date(exam?.created_at || '').toLocaleDateString()} · {resultsData.length} students
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportResultsCSV} className="gap-1">
                <Download className="w-3 h-3" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setStep('select'); setExam(null); fetchExistingExams(); }} className="gap-1">
                <RefreshCw className="w-3 h-3" /> New LCT
              </Button>
            </div>
          </div>

          {/* Results Tabs */}
          <Tabs value={resultsTab} onValueChange={v => setResultsTab(v as any)} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="leaderboard" className="flex-1 gap-1"><Award className="w-3 h-3" /> Leaderboard</TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 gap-1"><TrendingUp className="w-3 h-3" /> Analytics</TabsTrigger>
              <TabsTrigger value="answers" className="flex-1 gap-1"><BookOpen className="w-3 h-3" /> Answer Key</TabsTrigger>
            </TabsList>

            {/* ──── Leaderboard Tab ──── */}
            <TabsContent value="leaderboard">
              <div className="glass-effect rounded-xl p-4">
                {/* Search & Sort Controls */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search students..."
                      className="w-full h-8 pl-8 pr-3 text-xs bg-muted/50 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Sort Headers */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span className="w-6">#</span>
                  <button onClick={() => toggleSort('name')} className="flex-1 flex items-center gap-1 hover:text-foreground">
                    Name {sortField === 'name' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                  </button>
                  <button onClick={() => toggleSort('school')} className="w-24 flex items-center gap-1 hover:text-foreground">
                    School {sortField === 'school' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                  </button>
                  <button onClick={() => toggleSort('grade')} className="w-12 flex items-center gap-1 hover:text-foreground">
                    Grade {sortField === 'grade' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                  </button>
                  <button onClick={() => toggleSort('score')} className="w-14 text-right flex items-center gap-1 justify-end hover:text-foreground">
                    Score {sortField === 'score' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                  </button>
                </div>

                {/* Student Rows */}
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {filteredResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No results found.</p>
                  ) : (
                    filteredResults.map((student, i) => {
                      const rank = i + 1;
                      const isTop3 = rank <= 3;
                      return (
                        <button
                          key={student.id}
                          onClick={() => setSelectedStudent(student)}
                          className={`w-full flex items-center gap-2 p-3 rounded-lg border transition-all text-left hover:bg-muted/50 ${
                            isTop3 ? 'border-primary/30 bg-primary/5' : 'border-border/50'
                          }`}
                        >
                          <span className={`text-xs font-mono w-6 ${isTop3 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{student.full_name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{student.learning_style} · {student.status}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground w-24 truncate hidden sm:block">{student.school_name}</span>
                          <span className="text-[10px] text-muted-foreground w-12">{student.grade_level || '—'}</span>
                          <span className={`text-base font-bold w-14 text-right ${
                            (student.score ?? 0) >= 80 ? 'text-green-500' :
                            (student.score ?? 0) >= 50 ? 'text-amber-500' : 'text-destructive'
                          }`}>
                            {student.score ?? '—'}%
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ──── Analytics Tab ──── */}
            <TabsContent value="analytics">
              {analytics ? (
                <div className="space-y-4">
                  {/* Overview Stats */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Overall Statistics</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Mean Score" value={`${analytics.overall.mean.toFixed(1)}%`} icon={Target} />
                      <StatCard label="Median Score" value={`${analytics.overall.median.toFixed(1)}%`} icon={BarChart3} />
                      <StatCard label="Std Deviation" value={analytics.overall.stdDev.toFixed(1)} icon={TrendingUp} />
                      <StatCard label="Highest Score" value={`${analytics.overall.highest}%`} icon={ArrowUp} color="text-green-500" />
                      <StatCard label="Lowest Score" value={`${analytics.overall.lowest}%`} icon={ArrowDown} color="text-destructive" />
                      <StatCard label="Pass Rate (≥50%)" value={`${analytics.overall.passRate.toFixed(1)}%`} icon={CheckCircle2} color="text-primary" />
                      <StatCard label="Excellence (≥80%)" value={`${analytics.overall.excellenceRate.toFixed(1)}%`} icon={Award} color="text-green-500" />
                      <StatCard label="Timed Out" value={analytics.overall.timedOutStudents} icon={AlertTriangle} color="text-amber-500" />
                    </div>
                  </div>

                  {/* Score Distribution */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Score Distribution</h3>
                    <DistributionChart bins={analytics.scoreDistribution} />
                  </div>

                  {/* By Subject */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Performance by Subject</h3>
                    <div className="space-y-2">
                      {Object.entries(analytics.bySubject)
                        .sort(([, a], [, b]) => b.accuracy - a.accuracy)
                        .map(([subj, data]) => (
                          <ScoreBar
                            key={subj}
                            label={subj}
                            value={data.accuracy}
                            color={data.accuracy >= 60 ? 'bg-green-500' : data.accuracy >= 40 ? 'bg-amber-500' : 'bg-destructive'}
                          />
                        ))}
                    </div>
                  </div>

                  {/* By School */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Performance by School</h3>
                    <div className="space-y-2">
                      {Object.entries(analytics.bySchool)
                        .sort(([, a]: any, [, b]: any) => b.mean - a.mean)
                        .map(([id, data]: any) => (
                          <ScoreBar
                            key={id}
                            label={`${data.name} (${data.count})`}
                            value={data.mean}
                            color={data.mean >= 60 ? 'bg-green-500' : data.mean >= 40 ? 'bg-amber-500' : 'bg-destructive'}
                          />
                        ))}
                    </div>
                  </div>

                  {/* By Learning Style */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Performance by Learning Style</h3>
                    <div className="space-y-2">
                      {Object.entries(analytics.byLearningStyle)
                        .sort(([, a]: any, [, b]: any) => b.mean - a.mean)
                        .map(([style, data]: any) => (
                          <ScoreBar
                            key={style}
                            label={`${style} (${data.count})`}
                            value={data.mean}
                            color="bg-primary"
                          />
                        ))}
                    </div>
                  </div>

                  {/* By Grade */}
                  <div className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold mb-3 text-sm">Performance by Grade</h3>
                    <div className="space-y-2">
                      {Object.entries(analytics.byGrade)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([grade, data]: any) => (
                          <ScoreBar
                            key={grade}
                            label={`Grade ${grade} (${data.count})`}
                            value={data.mean}
                            color="bg-primary/80"
                          />
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No analytics data available.</p>
              )}
            </TabsContent>

            {/* ──── Answer Key Tab ──── */}
            <TabsContent value="answers">
              <div className="glass-effect rounded-xl p-4">
                <h3 className="font-semibold mb-3 text-sm">Full Answer Key ({(exam?.answer_key_json as any[] || []).length} questions)</h3>
                {exam?.answer_key_json && (exam.answer_key_json as any[]).length > 0 ? (
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                    {(exam.answer_key_json as any[]).map((ak: any) => (
                      <div key={ak.id} className="flex items-start gap-2 text-xs p-2.5 bg-muted/30 rounded-lg border border-border/30">
                        <span className="font-mono w-7 shrink-0 text-muted-foreground">Q{ak.id}</span>
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] shrink-0">{ak.subject}</span>
                        <span className="font-bold text-green-600 w-5 shrink-0">{ak.correct_answer}</span>
                        <span className="text-muted-foreground">{ak.explanation || 'No explanation'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No answer key available.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ════════════════════ Student Detail Modal ════════════════════ */}
      {selectedStudent && exam?.answer_key_json && (
        <StudentDetailModal
          student={selectedStudent}
          answerKey={exam.answer_key_json as any[]}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}
