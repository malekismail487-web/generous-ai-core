import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, School, CheckCircle2, Brain, Play, Eye,
  ChevronRight, ChevronLeft, BarChart3, FileText, Clock
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

type WizardStep = 'select' | 'collecting' | 'collected' | 'generating' | 'preview' | 'translating' | 'translated' | 'launch' | 'monitor' | 'results';

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
  const [resultsData, setResultsData] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [existingExams, setExistingExams] = useState<LCTExam[]>([]);
  const [timeRemaining, setTimeRemaining] = useState('');

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('schools').select('id, name, code, status').eq('status', 'active').order('name');
    setSchools((data || []) as SchoolData[]);
    setLoading(false);
  }, []);

  const fetchExistingExams = useCallback(async () => {
    const { data } = await supabase.from('lct_exams').select('*').order('created_at', { ascending: false });
    setExistingExams((data || []) as LCTExam[]);

    // Check if there's an active exam
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

  // Timer for monitor
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

  // Poll monitor data
  useEffect(() => {
    if (step !== 'monitor' || !exam) return;
    const poll = async () => {
      const { data } = await supabase
        .from('lct_exam_students')
        .select('status')
        .eq('exam_id', exam.id);
      const total = data?.length || 0;
      const completed = data?.filter((s: any) => s.status === 'completed').length || 0;
      const inProgress = data?.filter((s: any) => s.status === 'in_progress').length || 0;
      setMonitorData({ total, completed, inProgress, pending: total - completed - inProgress });
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [step, exam?.id]);

  const toggleSchool = (id: string) => {
    setSelectedSchools(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedSchools.length === schools.length) {
      setSelectedSchools([]);
    } else {
      setSelectedSchools(schools.map(s => s.id));
    }
  };

  const createAndCollectData = async () => {
    if (!selectedSchools.length) {
      toast({ variant: 'destructive', title: 'Select at least one school' });
      return;
    }
    setActionLoading(true);
    setStep('collecting');

    try {
      // Create exam
      const { data: newExam, error: createErr } = await supabase
        .from('lct_exams')
        .insert({ title: 'Luminary Cognitive Test', created_by: (await supabase.auth.getUser()).data.user!.id })
        .select()
        .single();

      if (createErr) throw createErr;
      setExam(newExam as LCTExam);

      // Collect data
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
        setTranslateProgress(prev => Math.min(prev + 5, 90));
      }, 3000);

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
      // Load results
      const { data } = await supabase
        .from('lct_exam_students')
        .select('*')
        .eq('exam_id', exam.id)
        .order('score', { ascending: false });
      setResultsData(data || []);
      setStep('results');
      toast({ title: 'Exam ended. Results are ready.' });
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadResults = async (examId: string) => {
    const { data: examData } = await supabase.from('lct_exams').select('*').eq('id', examId).single();
    if (examData) {
      setExam(examData as LCTExam);
      const { data } = await supabase.from('lct_exam_students').select('*').eq('exam_id', examId).order('score', { ascending: false });
      setResultsData(data || []);
      setStep('results');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Previous exams */}
      {step === 'select' && existingExams.length > 0 && (
        <div className="glass-effect rounded-xl p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Previous LCT Exams</h3>
          <div className="space-y-2">
            {existingExams.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleDateString()} · Status: <span className="capitalize">{e.status}</span>
                  </p>
                </div>
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
            ))}
          </div>
        </div>
      )}

      {/* Step: Select Schools */}
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
                <Checkbox
                  checked={selectedSchools.includes(school.id)}
                  onCheckedChange={() => toggleSchool(school.id)}
                />
                <div>
                  <p className="font-medium text-sm">{school.name}</p>
                  <p className="text-xs text-muted-foreground">Code: {school.code}</p>
                </div>
              </label>
            ))}
          </div>

          <Button className="mt-4 w-full gap-2" onClick={createAndCollectData} disabled={actionLoading || !selectedSchools.length}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Collect Data
          </Button>
        </div>
      )}

      {/* Step: Collecting */}
      {step === 'collecting' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Collecting Adaptive Data...</h2>
          <p className="text-sm text-muted-foreground">Gathering learning profiles from all eligible students (Grade 9+)</p>
        </div>
      )}

      {/* Step: Collected */}
      {step === 'collected' && collectResult && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <h2 className="text-lg font-bold">All Data Collected</h2>
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
            Build Exam (140 Questions)
          </Button>
        </div>
      )}

      {/* Step: Generating */}
      {step === 'generating' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Generating LCT Exam...</h2>
          <p className="text-sm text-muted-foreground">Creating 140 challenging questions across 5 subjects. This may take a few minutes.</p>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>📝 English (28 questions)</p>
            <p>🔢 Mathematics (28 questions)</p>
            <p>⚡ Physics (28 questions)</p>
            <p>🧪 Chemistry (28 questions)</p>
            <p>🧬 Biology (28 questions)</p>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && exam?.questions_json && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Exam Preview</h2>
            <span className="text-sm text-muted-foreground">
              Question {previewIndex + 1} of {exam.questions_json.length}
            </span>
          </div>

          <Progress value={((previewIndex + 1) / exam.questions_json.length) * 100} className="mb-4" />

          {exam.questions_json[previewIndex] && (
            <div className="bg-muted/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">
                  {exam.questions_json[previewIndex].subject}
                </span>
                <span className="text-xs text-muted-foreground">Q{exam.questions_json[previewIndex].id}</span>
              </div>
              <p className="font-medium mb-3">{exam.questions_json[previewIndex].question}</p>
              <div className="space-y-2">
                {(exam.questions_json[previewIndex].options || []).map((opt: string, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg text-sm ${
                      opt.startsWith(exam.questions_json[previewIndex].correct_answer + ')')
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-background border border-border'
                    }`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
              {exam.questions_json[previewIndex].explanation && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  💡 {exam.questions_json[previewIndex].explanation}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewIndex(Math.min(exam.questions_json.length - 1, previewIndex + 1))} disabled={previewIndex >= exam.questions_json.length - 1}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button className="w-full mt-4 gap-2" onClick={translateExams} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Translate All Exams
          </Button>
        </div>
      )}

      {/* Step: Translating */}
      {step === 'translating' && (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Translating Exams...</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Rewording questions for each student's learning style. This preserves difficulty.
          </p>
          <Progress value={translateProgress} className="max-w-sm mx-auto" />
          <p className="text-xs text-muted-foreground mt-2">{translateProgress}%</p>
        </div>
      )}

      {/* Step: Translated */}
      {step === 'translated' && (
        <div className="glass-effect rounded-xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Translation Finished</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Every student now has a personalized version of the exam matching their learning style.
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2" size="lg">
                <Play className="w-5 h-5" /> Start Exam
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start Luminary Cognitive Test?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will lock ALL eligible students into the exam for 2 hours. Students will not be able to use any other part of the app, even if they log out and back in. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={startExam} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm — Lock Students
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Step: Monitor */}
      {step === 'monitor' && monitorData && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5" /> Live Monitor
            </h2>
            <div className="flex items-center gap-2 text-lg font-mono font-bold">
              <Clock className="w-5 h-5 text-destructive" />
              <span className={timeRemaining === '00:00:00' ? 'text-destructive' : 'text-foreground'}>{timeRemaining}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{monitorData.total}</p>
              <p className="text-xs text-muted-foreground">Total Students</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-primary">{monitorData.inProgress}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{monitorData.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>

          <Progress value={(monitorData.completed / monitorData.total) * 100} className="mb-2" />
          <p className="text-xs text-muted-foreground text-center">
            {monitorData.completed}/{monitorData.total} students finished
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full mt-4">Force End Exam</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Force End Exam?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately end the exam for all students. Unfinished exams will be marked as timed out.
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

      {/* Step: Results */}
      {step === 'results' && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> LCT Results
            </h2>
            <Button variant="outline" size="sm" onClick={() => { setStep('select'); setExam(null); fetchExistingExams(); }}>
              New LCT
            </Button>
          </div>

          {resultsData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No results available.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {resultsData.map((student, i) => (
                <div key={student.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground w-6">#{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">Student {student.student_id.slice(0, 8)}...</p>
                      <p className="text-xs text-muted-foreground capitalize">{student.learning_style} · {student.status}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${(student.score || 0) >= 70 ? 'text-green-500' : (student.score || 0) >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
                      {student.score ?? '—'}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Answer Key */}
          {exam?.answer_key_json && exam.answer_key_json.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">Answer Key</h3>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {(exam.answer_key_json as any[]).map((ak: any) => (
                  <div key={ak.id} className="flex items-center gap-2 text-xs p-2 bg-muted/20 rounded">
                    <span className="font-mono w-6">Q{ak.id}</span>
                    <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">{ak.subject}</span>
                    <span className="font-bold">{ak.correct_answer}</span>
                    <span className="text-muted-foreground truncate">{ak.explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
