import { useState } from 'react';
import { Bot, Sparkles, Loader2, CheckCircle2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const SUBJECTS = [
  'Biology', 'Physics', 'Mathematics', 'Chemistry',
  'English', 'Social Studies', 'Technology', 'Arabic',
  'Islamic Studies', 'KSA History', 'Art and Design',
];

const GRADES = [
  'All', 'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const QUESTION_COUNTS = [5, 10, 25, 30];

interface Question {
  id: string;
  questionTitle: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
}

type Step = 'configure' | 'generating' | 'preview' | 'publishing';

interface TeacherCopilotProps {
  schoolId: string;
  authUserId: string;
  onSuccess: () => void;
}

export function TeacherCopilot({ schoolId, authUserId, onSuccess }: TeacherCopilotProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('configure');

  // Config state — mirrors the manual AssignmentCreator
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [gradeLevel, setGradeLevel] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Generated state
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);

  const reset = () => {
    setStep('configure');
    setTitle('');
    setDescription('');
    setSubject('');
    setQuestionCount(5);
    setGradeLevel('');
    setDueDate('');
    setGeneratedTitle('');
    setQuestions([]);
  };

  const handleGenerate = async () => {
    if (!title.trim() || !subject || !gradeLevel) {
      toast({ variant: 'destructive', title: 'Please fill in title, subject, and grade level' });
      return;
    }
    setStep('generating');

    try {
      const { data, error } = await supabase.functions.invoke('generate-assignment', {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          subject,
          questionCount,
          gradeLevel,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedTitle(title.trim());
      setQuestions(
        (data.questions || []).map((q: any) => ({
          ...q,
          id: crypto.randomUUID(),
        }))
      );
      setStep('preview');
    } catch (err: any) {
      console.error('Generate error:', err);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: err.message || 'Could not generate questions. Try again.',
      });
      setStep('configure');
    }
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handlePublish = async () => {
    if (questions.length === 0) {
      toast({ variant: 'destructive', title: 'No questions to publish' });
      return;
    }

    setStep('publishing');

    const insertData = {
      teacher_id: authUserId,
      school_id: schoolId,
      title: generatedTitle.trim(),
      description: `AI-generated quiz with ${questions.length} question(s)`,
      subject,
      grade_level: gradeLevel,
      due_date: dueDate || null,
      points: questions.length * 10,
      questions_json: questions as any,
    };

    const { error } = await supabase
      .from('assignments')
      .insert(insertData as any);

    if (error) {
      console.error('Publish error:', error);
      toast({ variant: 'destructive', title: 'Failed to publish assignment' });
      setStep('preview');
      return;
    }

    toast({ title: 'Assignment published successfully!' });
    reset();
    setOpen(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl transition-shadow">
          <Bot className="w-4 h-4" />
          <span className="hidden sm:inline">Copilot</span>
          <Sparkles className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            AI Copilot — Assignment Generator
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Configure */}
        {step === 'configure' && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Assignment Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Photosynthesis Quiz, Quadratic Equations Test..."
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional instructions or context..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grade Level *</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Number of Questions *</Label>
              <div className="grid grid-cols-4 gap-2">
                {QUESTION_COUNTS.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    variant={questionCount === count ? 'default' : 'outline'}
                    onClick={() => setQuestionCount(count)}
                    className="text-sm"
                  >
                    {count} Qs
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <Button
              onClick={handleGenerate}
              className="w-full gap-2"
              size="lg"
              disabled={!title.trim() || !subject || !gradeLevel}
            >
              <Sparkles className="w-4 h-4" />
              Generate {questionCount} Questions with AI
            </Button>
          </div>
        )}

        {/* Step 2: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <Sparkles className="w-5 h-5 text-accent absolute -top-1 -right-1 animate-pulse" />
            </div>
            <p className="text-muted-foreground text-sm">AI is crafting your questions...</p>
            <p className="text-xs text-muted-foreground/60">This may take a few seconds</p>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Assignment Title</Label>
              <Input
                value={generatedTitle}
                onChange={(e) => setGeneratedTitle(e.target.value)}
                placeholder="Assignment title"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {questions.length} question(s) • {questions.length * 10} points • {gradeLevel}
              </p>
              <Button variant="outline" size="sm" onClick={() => setStep('configure')}>
                Regenerate
              </Button>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {questions.map((q, index) => (
                <Card key={q.id} className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">Q{index + 1}</Badge>
                          <span className="font-medium text-sm">{q.questionTitle}</span>
                        </div>
                        <div className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-1 pl-2">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const key = `option${letter}` as keyof Question;
                            const isCorrect = q.correctAnswer === letter;
                            return (
                              <p key={letter} className={isCorrect ? 'text-green-600 font-medium' : ''}>
                                {letter}: {q[key] as string} {isCorrect && '✓'}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() => removeQuestion(q.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { reset(); }} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                className="flex-1 gap-2"
                disabled={questions.length === 0}
              >
                <CheckCircle2 className="w-4 h-4" />
                Publish Assignment
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Publishing */}
        {step === 'publishing' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Publishing assignment...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
