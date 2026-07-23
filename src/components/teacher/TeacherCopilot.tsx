import { useState, useRef } from 'react';
import { generateId } from '@/lib/utils';
import { Bot, Loader2, CheckCircle2, Trash2, X, Paperclip, MessageSquare, RefreshCw } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';

const SUBJECTS = [
  'biology', 'physics', 'mathematics', 'chemistry',
  'english', 'social_studies', 'technology', 'arabic',
  'islamic_studies', 'ksa_history', 'art_design',
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type Step = 'configure' | 'generating' | 'preview' | 'refining' | 'publishing';

interface TeacherCopilotProps {
  schoolId: string;
  authUserId: string;
  onSuccess: () => void;
}

export function TeacherCopilot({ schoolId, authUserId, onSuccess }: TeacherCopilotProps) {
  const { toast } = useToast();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('configure');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [gradeLevel, setGradeLevel] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [generatedTitle, setGeneratedTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    setChatMessages([]);
    setChatInput('');
    setIsRefining(false);
  };

  const handleGenerate = async () => {
    if (!title.trim() || !subject || !gradeLevel) {
      toast({ variant: 'destructive', title: t('fillTitleSubjectGrade') });
      return;
    }
    setStep('generating');

    try {
      const { data, error } = await supabase.functions.invoke('generate-assignment', {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          subject: getSubjectName(subject, 'en'),
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
          id: generateId(),
        }))
      );
      // Initialize chat with system message
      setChatMessages([{
        role: 'assistant',
        content: `I've generated ${data.questions?.length || 0} questions about "${title.trim()}". You can ask me to modify, replace, or add questions. For example: "Make question 3 harder" or "Replace question 5 with a diagram-based question."`
      }]);
      setStep('preview');
    } catch (err: any) {
      console.error('Generate error:', err);
      toast({
        variant: 'destructive',
        title: t('generationFailed'),
        description: err.message || t('couldNotGenerate'),
      });
      setStep('configure');
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || questions.length === 0) return;

    const userMessage: ChatMessage = { role: 'user', content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsRefining(true);

    try {
      // Build context from current questions
      const questionsContext = questions.map((q, i) => 
        `Q${i+1}: ${q.questionTitle}\nOptions: A) ${q.optionA} B) ${q.optionB} C) ${q.optionC} D) ${q.optionD}\nCorrect: ${q.correctAnswer}\n`
      ).join('\n');

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [
            ...chatMessages,
            userMessage,
            {
              role: 'system',
              content: `You are helping a teacher refine assignment questions. Current assignment: "${generatedTitle}"\nSubject: ${getSubjectName(subject, 'en')}\nGrade: ${gradeLevel}\n\nCurrent Questions:\n${questionsContext}\n\nThe teacher wants to modify these questions based on their request. Respond with specific suggestions and offer to regenerate specific questions. Be concise and helpful.`
            }
          ],
          schoolId,
        },
      });

      if (error) throw error;
      
      // For now, just show the response - full regeneration logic would go here
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data?.message || 'I understand your request. Let me help you refine these questions.'
      }]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.'
      }]);
    } finally {
      setIsRefining(false);
    }
  };

  const regenerateQuestion = async (questionIndex: number, instruction: string) => {
    if (!generatedTitle || questionIndex < 0 || questionIndex >= questions.length) return;
    
    setIsRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-assignment', {
        body: {
          title: `${generatedTitle} - Regenerate Question ${questionIndex + 1}`,
          description: `Original: ${questions[questionIndex].questionTitle}\nInstruction: ${instruction}\nKeep other questions unchanged.`,
          subject: getSubjectName(subject, 'en'),
          questionCount: 1,
          gradeLevel,
        },
      });

      if (error) throw error;
      if (data?.questions && data.questions.length > 0) {
        const newQuestions = [...questions];
        newQuestions[questionIndex] = {
          ...data.questions[0],
          id: generateId(),
        };
        setQuestions(newQuestions);
        toast({ title: 'Question updated successfully' });
      }
    } catch (err: any) {
      console.error('Regenerate error:', err);
      toast({ variant: 'destructive', title: 'Failed to regenerate question', description: err.message });
    } finally {
      setIsRefining(false);
    }
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handlePublish = async () => {
    if (questions.length === 0) {
      toast({ variant: 'destructive', title: t('noQuestionToPublish') });
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
      source: 'copilot',
    };

    const { data: insertedData, error } = await supabase
      .from('assignments')
      .insert(insertData as any)
      .select('id')
      .single();

    if (error) {
      console.error('Publish error:', error);
      toast({ variant: 'destructive', title: t('error') });
      setStep('preview');
      return;
    }

    // Scan assignment content for moderation (fire-and-forget)
    const scanText = questions.map((q: any) => `${q.question} ${(q.options || []).join(' ')}`).join(' ');
    import('@/lib/contentScanner').then(({ scanContent }) => {
      scanContent({
        content: scanText.substring(0, 4000),
        contentType: 'assignment',
        contentId: insertedData?.id,
        userId: authUserId,
        schoolId,
      });
    });

    toast({ title: t('assignmentPublished') });
    reset();
    setOpen(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl transition-shadow">
          <Bot className="w-4 h-4" />
          <span className="hidden sm:inline">{t('copilotLabel')}</span>
          <LuminaLogo size={12} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            {t('aiCopilotTitle')}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Configure */}
        {step === 'configure' && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>{t('assignmentTitleRequired')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: اختبار التمثيل الضوئي، المعادلات التربيعية...' : 'e.g. Photosynthesis Quiz, Quadratic Equations Test...'}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('descriptionOptional')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('additionalInstructions')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('subjectRequired')}</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectSubjectLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>{getSubjectName(s, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('gradeLevelRequired')}</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectGradePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>{getGradeName(g, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('numberOfQuestions')}</Label>
              <div className="grid grid-cols-4 gap-2">
                {QUESTION_COUNTS.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    variant={questionCount === count ? 'default' : 'outline'}
                    onClick={() => setQuestionCount(count)}
                    className="text-sm"
                  >
                    {count} {t('qsLabel')}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('dueDateOptionalLabel')}</Label>
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
              <LuminaLogo size={16} />
              {t('generateWithAI')} {questionCount} {t('questionsWithAI')}
            </Button>
          </div>
        )}

        {/* Step 2: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <LuminaLogo size={20} className="absolute -top-1 -right-1 animate-pulse" />
            </div>
            <p className="text-muted-foreground text-sm">{t('aiCraftingQuestions')}</p>
            <p className="text-xs text-muted-foreground/60">{t('mayTakeFewSeconds')}</p>
          </div>
        )}

        {/* Step 3: Preview & Refine */}
        {step === 'preview' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t('assignmentTitleLabel')}</Label>
              <Input
                value={generatedTitle}
                onChange={(e) => setGeneratedTitle(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {questions.length} {t('questionsAdded')} • {questions.length * 10} {t('pointsLabel')} • {getGradeName(gradeLevel, language)}
              </p>
              <Button variant="outline" size="sm" onClick={() => setStep('configure')}>
                {t('regenerate')}
              </Button>
            </div>

            {/* Questions List */}
            <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
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
                        {/* Quick regenerate options */}
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => regenerateQuestion(index, 'Make this question easier')}
                            disabled={isRefining}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Easier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => regenerateQuestion(index, 'Make this question harder')}
                            disabled={isRefining}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Harder
                          </Button>
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

            {/* Chat Interface for Refinement */}
            <Card className="border-primary/20">
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Refine with AI Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* Chat Messages */}
                <div className="max-h-[200px] overflow-y-auto space-y-2 text-sm">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isRefining && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder="Ask AI to modify questions... (e.g., 'Make Q3 more challenging' or 'Add a real-world example to Q5')"
                    className="flex-1 min-h-[40px] resize-none text-sm"
                    disabled={isRefining}
                  />
                  <Button
                    onClick={handleChatSubmit}
                    disabled={!chatInput.trim() || isRefining}
                    size="sm"
                  >
                    <Bot className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { reset(); }} className="flex-1">
                {t('cancel')}
              </Button>
              <Button
                onClick={handlePublish}
                className="flex-1 gap-2"
                disabled={questions.length === 0}
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('publishAssignment')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Publishing */}
        {step === 'publishing' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">{t('publishingAssignment')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
