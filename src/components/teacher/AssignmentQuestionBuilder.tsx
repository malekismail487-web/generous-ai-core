import { useState } from 'react';
import { generateId } from '@/lib/utils';
import { ArrowLeft, Plus, Save, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';

const SUBJECTS = [
  { id: 'biology', emoji: '🧬' },
  { id: 'physics', emoji: '⚛️' },
  { id: 'mathematics', emoji: '📐' },
  { id: 'chemistry', emoji: '🧪' },
  { id: 'english', emoji: '📚' },
  { id: 'social_studies', emoji: '🌍' },
  { id: 'technology', emoji: '💻' },
  { id: 'arabic', emoji: '🕌' },
  { id: 'islamic_studies', emoji: '☪️' },
  { id: 'ksa_history', emoji: '🏛️' },
  { id: 'art_design', emoji: '🎨' },
];

const GRADES = [
  'All', 'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

interface Question {
  id: string;
  questionTitle: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
}

interface AssignmentQuestionBuilderProps {
  schoolId: string;
  authUserId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function AssignmentQuestionBuilder({
  schoolId,
  authUserId,
  onBack,
  onSuccess
}: AssignmentQuestionBuilderProps) {
  const { toast } = useToast();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);
  
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [subject, setSubject] = useState('biology');
  const [gradeLevel, setGradeLevel] = useState('All');
  const [dueDate, setDueDate] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTitle, setQuestionTitle] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D' | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(true);

  const resetQuestionForm = () => {
    setQuestionTitle('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('');
  };

  const saveQuestion = () => {
    if (!questionTitle.trim()) {
      toast({ variant: 'destructive', title: t('pleaseEnterQuestionTitle') });
      return;
    }
    if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
      toast({ variant: 'destructive', title: t('pleaseFillAllChoices') });
      return;
    }
    if (!correctAnswer) {
      toast({ variant: 'destructive', title: t('pleaseSelectCorrect') });
      return;
    }

    const newQuestion: Question = {
      id: generateId(),
      questionTitle: questionTitle.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim(),
      optionD: optionD.trim(),
      correctAnswer
    };

    setQuestions([...questions, newQuestion]);
    resetQuestionForm();
    toast({ title: t('questionSaved') });
  };

  const removeQuestion = (questionId: string) => {
    setQuestions(questions.filter(q => q.id !== questionId));
    toast({ title: t('questionRemoved') });
  };

  const createAssignment = async () => {
    if (!assignmentTitle.trim()) {
      toast({ variant: 'destructive', title: t('pleaseEnterTitle') });
      return;
    }
    if (questions.length === 0) {
      toast({ variant: 'destructive', title: t('pleaseAddQuestion') });
      return;
    }

    setIsCreating(true);

    const insertData = {
      teacher_id: authUserId,
      school_id: schoolId,
      title: assignmentTitle.trim(),
      description: `Multiple choice quiz with ${questions.length} question(s)`,
      subject: subject,
      grade_level: gradeLevel,
      due_date: dueDate || null,
      points: questions.length * 10,
      questions_json: questions as any
    };

    const { error } = await supabase
      .from('assignments')
      .insert(insertData as any);

    setIsCreating(false);

    if (error) {
      console.error('Error creating assignment:', error);
      toast({ variant: 'destructive', title: t('error'), description: error.message });
    } else {
      toast({ title: t('assignmentCreatedSuccess') });
      onSuccess();
    }
  };

  const proceedToQuestions = () => {
    if (!assignmentTitle.trim()) {
      toast({ variant: 'destructive', title: t('pleaseEnterTitle') });
      return;
    }
    setShowMetadataForm(false);
  };

  // Step 1: Assignment metadata
  if (showMetadataForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{t('createAssignmentTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('step1Details')}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('assignmentDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('assignmentTitleRequired')}</Label>
              <Input
                id="title"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder={t('enterAssignmentTitle')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('subjectRequired')}</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.emoji} {getSubjectName(s.id, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('gradeLevelRequired')}</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger>
                    <SelectValue />
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
              <Label htmlFor="dueDate">{t('dueDateOptionalLabel')}</Label>
              <Input
                id="dueDate"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <Button 
              onClick={proceedToQuestions} 
              className="w-full"
              disabled={!assignmentTitle.trim()}
            >
              {t('continueToAddQuestions')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Question builder
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setShowMetadataForm(true)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{assignmentTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {questions.length} {t('questionsAdded')} • {questions.length * 10} {t('totalPointsLabel')}
            </p>
          </div>
        </div>
        {questions.length > 0 && (
          <Button onClick={createAssignment} disabled={isCreating} className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {isCreating ? t('creatingBtn') : t('createAssignmentBtn')}
          </Button>
        )}
      </div>

      {/* Saved Questions List */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">{t('savedQuestionsLabel')}</h3>
          <div className="grid gap-3">
            {questions.map((q, index) => (
              <Card key={q.id} className="bg-muted/50">
                <CardContent className="p-4 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Q{index + 1}</Badge>
                      <span className="font-medium">{q.questionTitle}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>A: {q.optionA}</p>
                      <p>B: {q.optionB}</p>
                      <p>C: {q.optionC}</p>
                      <p>D: {q.optionD}</p>
                      <p className="text-green-600 font-medium">{t('correctLabel')} {q.correctAnswer}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8"
                    onClick={() => removeQuestion(q.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Question Builder Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {questions.length === 0 ? t('addFirstQuestionLabel') : t('addAnotherQuestionLabel')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="questionTitle">{t('questionTitleRequired')}</Label>
            <Input
              id="questionTitle"
              value={questionTitle}
              onChange={(e) => setQuestionTitle(e.target.value)}
              placeholder={t('enterTheQuestion')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="optionA">{t('choiceARequired')}</Label>
              <Input id="optionA" value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder={t('enterChoiceA')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionB">{t('choiceBRequired')}</Label>
              <Input id="optionB" value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder={t('enterChoiceB')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionC">{t('choiceCRequired')}</Label>
              <Input id="optionC" value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder={t('enterChoiceC')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionD">{t('choiceDRequired')}</Label>
              <Input id="optionD" value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder={t('enterChoiceD')} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t('selectCorrectAnswerLabel')}</Label>
            <RadioGroup
              value={correctAnswer}
              onValueChange={(val) => setCorrectAnswer(val as 'A' | 'B' | 'C' | 'D')}
              className="flex gap-6"
            >
              {['A', 'B', 'C', 'D'].map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`option-${option}`} />
                  <Label htmlFor={`option-${option}`} className="font-medium cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={saveQuestion} 
              className="flex-1 gap-2"
              disabled={!questionTitle.trim() || !optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim() || !correctAnswer}
            >
              <Save className="w-4 h-4" />
              {t('saveQuestionBtn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {questions.length > 0 && (
        <div className="flex justify-center">
          <Button 
            onClick={createAssignment} 
            disabled={isCreating} 
            size="lg"
            className="gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isCreating ? t('creatingAssignment') : `${t('createAssignmentWithCount')} ${questions.length} ${t('questionWord')}`}
          </Button>
        </div>
      )}
    </div>
  );
}
