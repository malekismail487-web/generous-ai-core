import { useState } from 'react';
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

const SUBJECTS = [
  { id: 'biology', name: 'Biology', emoji: '🧬' },
  { id: 'physics', name: 'Physics', emoji: '⚛️' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪' },
  { id: 'english', name: 'English', emoji: '📚' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍' },
  { id: 'technology', name: 'Technology', emoji: '💻' },
  { id: 'arabic', name: 'Arabic', emoji: '🕌' },
  { id: 'islamic_studies', name: 'Islamic Studies', emoji: '☪️' },
  { id: 'ksa_history', name: 'KSA History', emoji: '🏛️' },
  { id: 'art_design', name: 'Art and Design', emoji: '🎨' },
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
  
  // Assignment metadata
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [subject, setSubject] = useState('biology');
  const [gradeLevel, setGradeLevel] = useState('All');
  const [dueDate, setDueDate] = useState('');
  
  // Questions list
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Current question being created
  const [questionTitle, setQuestionTitle] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D' | ''>('');
  
  // UI state
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
      toast({ variant: 'destructive', title: 'Please enter a question title' });
      return;
    }
    if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
      toast({ variant: 'destructive', title: 'Please fill in all four choices' });
      return;
    }
    if (!correctAnswer) {
      toast({ variant: 'destructive', title: 'Please select the correct answer' });
      return;
    }

    const newQuestion: Question = {
      id: crypto.randomUUID(),
      questionTitle: questionTitle.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim(),
      optionD: optionD.trim(),
      correctAnswer
    };

    setQuestions([...questions, newQuestion]);
    resetQuestionForm();
    toast({ title: 'Question saved! Add another or create the assignment.' });
  };

  const removeQuestion = (questionId: string) => {
    setQuestions(questions.filter(q => q.id !== questionId));
    toast({ title: 'Question removed' });
  };

  const createAssignment = async () => {
    if (!assignmentTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter an assignment title' });
      return;
    }
    if (questions.length === 0) {
      toast({ variant: 'destructive', title: 'Please add at least one question' });
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
      points: questions.length * 10, // 10 points per question
      questions_json: questions as any
    };

    const { error } = await supabase
      .from('assignments')
      .insert(insertData as any);

    setIsCreating(false);

    if (error) {
      console.error('Error creating assignment:', error);
      toast({ variant: 'destructive', title: 'Error creating assignment', description: error.message });
    } else {
      toast({ title: 'Assignment created successfully!' });
      onSuccess();
    }
  };

  const proceedToQuestions = () => {
    if (!assignmentTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter an assignment title' });
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
            <h2 className="text-xl font-bold">Create Assignment</h2>
            <p className="text-sm text-muted-foreground">Step 1: Enter assignment details</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Assignment Title *</Label>
              <Input
                id="title"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="Enter assignment title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.emoji} {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Grade Level *</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger>
                    <SelectValue />
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
              <Label htmlFor="dueDate">Due Date (Optional)</Label>
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
              Continue to Add Questions
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
              {questions.length} question(s) added • {questions.length * 10} total points
            </p>
          </div>
        </div>
        {questions.length > 0 && (
          <Button onClick={createAssignment} disabled={isCreating} className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {isCreating ? 'Creating...' : 'Create Assignment'}
          </Button>
        )}
      </div>

      {/* Saved Questions List */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">Saved Questions:</h3>
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
                      <p className="text-green-600 font-medium">Correct: {q.correctAnswer}</p>
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
            {questions.length === 0 ? 'Add First Question' : 'Add Another Question'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="questionTitle">Question Title *</Label>
            <Input
              id="questionTitle"
              value={questionTitle}
              onChange={(e) => setQuestionTitle(e.target.value)}
              placeholder="Enter the question..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="optionA">Choice A *</Label>
              <Input
                id="optionA"
                value={optionA}
                onChange={(e) => setOptionA(e.target.value)}
                placeholder="Enter choice A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionB">Choice B *</Label>
              <Input
                id="optionB"
                value={optionB}
                onChange={(e) => setOptionB(e.target.value)}
                placeholder="Enter choice B"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionC">Choice C *</Label>
              <Input
                id="optionC"
                value={optionC}
                onChange={(e) => setOptionC(e.target.value)}
                placeholder="Enter choice C"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optionD">Choice D *</Label>
              <Input
                id="optionD"
                value={optionD}
                onChange={(e) => setOptionD(e.target.value)}
                placeholder="Enter choice D"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Please select the correct answer for this question *</Label>
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
              Save Question
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Assignment Button (alternative placement) */}
      {questions.length > 0 && (
        <div className="flex justify-center">
          <Button 
            onClick={createAssignment} 
            disabled={isCreating} 
            size="lg"
            className="gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isCreating ? 'Creating Assignment...' : `Create Assignment with ${questions.length} Question(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}
