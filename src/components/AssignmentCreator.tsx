import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useToast } from '@/hooks/use-toast';
import { cn, generateId } from '@/lib/utils';

interface Question {
  id: string;
  question: string;
  type: 'short_answer' | 'multiple_choice' | 'essay';
  options?: string[];
  correctAnswer?: string;
  points: number;
}

interface AssignmentCreatorProps {
  onBack: () => void;
  onSuccess: () => void;
}

const subjects = [
  'Biology', 'Physics', 'Mathematics', 'Chemistry', 
  'English', 'Social Studies', 'Technology', 'Arabic'
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

export function AssignmentCreator({ onBack, onSuccess }: AssignmentCreatorProps) {
  const { school, profile } = useRoleGuard();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalPoints, setTotalPoints] = useState(100);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      id: generateId(),
      question: '',
      type,
      points: 10,
      options: type === 'multiple_choice' ? ['', '', '', ''] : undefined,
      correctAnswer: '',
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, ...updates } : q
    ));
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options) {
        const newOptions = [...q.options];
        newOptions[optionIndex] = value;
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleSubmit = async () => {
    if (!school || !profile) return;
    if (!title.trim() || !subject || !gradeLevel) {
      toast({ variant: 'destructive', title: 'Please fill in required fields' });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase
      .from('assignments')
      .insert({
        teacher_id: profile.id,
        school_id: school.id,
        title: title.trim(),
        description: description.trim() || null,
        subject,
        grade_level: gradeLevel,
        due_date: dueDate || null,
        points: totalPoints,
        questions_json: questions.length > 0 ? questions : null,
      } as any);

    setIsSubmitting(false);

    if (error) {
      console.error('Error creating assignment:', error);
      toast({ variant: 'destructive', title: 'Error creating assignment' });
    } else {
      toast({ title: 'Assignment created!' });
      onSuccess();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>

        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold mb-2">Create Assignment</h1>
          <p className="text-muted-foreground text-sm">Add questions for your students</p>
        </div>

        {/* Assignment Details */}
        <div className="glass-effect rounded-2xl p-5 mb-4 space-y-4">
          <h2 className="font-semibold">Assignment Details</h2>
          
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assignment title"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions for students..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Subject *</Label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Grade Level *</Label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
              >
                <option value="">Select grade</option>
                {grades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Due Date</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Total Points</Label>
              <Input
                type="number"
                value={totalPoints}
                onChange={(e) => setTotalPoints(parseInt(e.target.value) || 100)}
                min={1}
              />
            </div>
          </div>
        </div>

        {/* Questions Section */}
        <div className="glass-effect rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Questions ({questions.length})</h2>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => addQuestion('short_answer')} className="gap-2">
              <Plus size={14} />
              Short Answer
            </Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion('multiple_choice')} className="gap-2">
              <Plus size={14} />
              Multiple Choice
            </Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion('essay')} className="gap-2">
              <Plus size={14} />
              Essay
            </Button>
          </div>

          <div className="space-y-4">
            {questions.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-6">
                No questions added yet. Click a button above to add questions.
              </div>
            ) : (
              questions.map((q, index) => (
                <div key={q.id} className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripVertical size={16} />
                      <span className="font-medium text-sm">{index + 1}.</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          q.type === 'short_answer' && "bg-primary/20 text-primary",
                          q.type === 'multiple_choice' && "bg-accent/20 text-accent-foreground",
                          q.type === 'essay' && "bg-muted text-muted-foreground"
                        )}>
                          {q.type === 'short_answer' ? 'Short Answer' : 
                           q.type === 'multiple_choice' ? 'Multiple Choice' : 'Essay'}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <Input
                            type="number"
                            value={q.points}
                            onChange={(e) => updateQuestion(q.id, { points: parseInt(e.target.value) || 0 })}
                            className="w-20 h-8 text-xs"
                            min={0}
                          />
                          <span className="text-xs text-muted-foreground">pts</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeQuestion(q.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      <Textarea
                        value={q.question}
                        onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                        placeholder="Enter your question..."
                        rows={2}
                      />

                      {q.type === 'multiple_choice' && q.options && (
                        <div className="space-y-2">
                          <Label className="text-xs">Options (click to mark correct answer)</Label>
                          {q.options.map((option, optIndex) => (
                            <div key={optIndex} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuestion(q.id, { correctAnswer: option })}
                                className={cn(
                                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                                  q.correctAnswer === option && option
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border hover:border-primary"
                                )}
                              >
                                {q.correctAnswer === option && option && '✓'}
                              </button>
                              <Input
                                value={option}
                                onChange={(e) => updateOption(q.id, optIndex, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                                className="flex-1"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === 'short_answer' && (
                        <div>
                          <Label className="text-xs">Correct Answer (optional)</Label>
                          <Input
                            value={q.correctAnswer || ''}
                            onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                            placeholder="Expected answer..."
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !title.trim() || !subject || !gradeLevel}
          className="w-full"
        >
          {isSubmitting ? 'Creating...' : 'Create Assignment'}
        </Button>
      </div>
    </div>
  );
}
