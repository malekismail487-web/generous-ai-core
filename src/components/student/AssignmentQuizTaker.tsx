import { useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface Question {
  id: string;
  questionTitle: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  points: number;
  questions_json?: any;
  due_date: string | null;
}

interface AssignmentQuizTakerProps {
  assignment: Assignment;
  profileId: string;
  existingSubmission?: {
    id: string;
    content: string | null;
    grade: number | null;
    feedback: string | null;
  } | null;
  onBack: () => void;
  onSuccess: () => void;
}

interface QuizResult {
  questionId: string;
  questionTitle: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export function AssignmentQuizTaker({
  assignment,
  profileId,
  existingSubmission,
  onBack,
  onSuccess
}: AssignmentQuizTakerProps) {
  const { toast } = useToast();
  
  const questions: Question[] = (assignment.questions_json as Question[]) || [];
  
  // Student's answers for each question
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  
  // Quiz state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(!!existingSubmission?.grade);
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(existingSubmission?.grade ?? null);

  const handleAnswerChange = (questionId: string, answer: 'A' | 'B' | 'C' | 'D') => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const calculateScore = (): { results: QuizResult[]; score: number } => {
    const quizResults: QuizResult[] = questions.map(q => {
      const selectedAnswer = answers[q.id] || '';
      const isCorrect = selectedAnswer === q.correctAnswer;
      return {
        questionId: q.id,
        questionTitle: q.questionTitle,
        selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect
      };
    });

    const correctCount = quizResults.filter(r => r.isCorrect).length;
    const score = Math.round((correctCount / questions.length) * assignment.points);

    return { results: quizResults, score };
  };

  const submitQuiz = async () => {
    // Check if all questions are answered
    const unanswered = questions.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
      toast({ 
        variant: 'destructive', 
        title: `Please answer all questions`,
        description: `${unanswered.length} question(s) remaining`
      });
      return;
    }

    setIsSubmitting(true);

    const { results: quizResults, score } = calculateScore();

    // Save to database
    const submissionData = {
      assignment_id: assignment.id,
      student_id: profileId,
      content: JSON.stringify({ answers, results: quizResults }),
      grade: score,
      graded_at: new Date().toISOString(),
      graded_by: profileId // Auto-graded
    };

    let error;
    if (existingSubmission) {
      const result = await supabase
        .from('submissions')
        .update(submissionData)
        .eq('id', existingSubmission.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('submissions')
        .insert(submissionData);
      error = result.error;
    }

    setIsSubmitting(false);

    if (error) {
      console.error('Error submitting quiz:', error);
      toast({ variant: 'destructive', title: 'Error submitting quiz' });
    } else {
      setResults(quizResults);
      setFinalScore(score);
      setIsSubmitted(true);
      toast({ title: 'Quiz submitted and graded!' });
    }
  };

  const answeredCount = Object.keys(answers).length;
  const progressPercent = (answeredCount / questions.length) * 100;

  // No questions - show message
  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-bold">{assignment.title}</h2>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">This assignment has no questions yet.</p>
            <Button onClick={onBack} className="mt-4">Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show results after submission
  if (isSubmitted && results) {
    const correctCount = results.filter(r => r.isCorrect).length;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{assignment.title}</h2>
            <p className="text-sm text-muted-foreground">Quiz Results</p>
          </div>
        </div>

        {/* Score Summary */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="p-6 text-center">
            <p className="text-4xl font-bold text-primary mb-2">
              {finalScore}/{assignment.points}
            </p>
            <p className="text-muted-foreground">
              {correctCount} out of {questions.length} correct
            </p>
            <Progress 
              value={(correctCount / questions.length) * 100} 
              className="mt-4 h-3" 
            />
          </CardContent>
        </Card>

        {/* Results Breakdown */}
        <div className="space-y-4">
          <h3 className="font-semibold">Question Results:</h3>
          {results.map((result, index) => (
            <Card 
              key={result.questionId}
              className={result.isCorrect ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5'}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {result.isCorrect ? (
                    <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive mt-1 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">Q{index + 1}</Badge>
                      <span className="font-medium">{result.questionTitle}</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="text-muted-foreground">Your answer: </span>
                        <span className={result.isCorrect ? 'text-primary font-medium' : 'text-destructive font-medium'}>
                          {result.selectedAnswer || 'Not answered'}
                        </span>
                      </p>
                      {!result.isCorrect && (
                        <p>
                          <span className="text-muted-foreground">Correct answer: </span>
                          <span className="text-primary font-medium">{result.correctAnswer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button onClick={onBack} className="w-full">
          Back to Assignments
        </Button>
      </div>
    );
  }

  // Previously submitted - show grade
  if (existingSubmission?.grade !== null && existingSubmission?.grade !== undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{assignment.title}</h2>
            <p className="text-sm text-muted-foreground">Already Completed</p>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
            <p className="text-3xl font-bold text-primary mb-2">
              {existingSubmission.grade}/{assignment.points}
            </p>
            <p className="text-muted-foreground">You have already completed this quiz</p>
            {existingSubmission.feedback && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-left">
                <p className="text-sm font-medium mb-1">Teacher Feedback:</p>
                <p className="text-sm text-muted-foreground">{existingSubmission.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={onBack} className="w-full">
          Back to Assignments
        </Button>
      </div>
    );
  }

  // Quiz taking view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{assignment.title}</h2>
            <p className="text-sm text-muted-foreground">
              {questions.length} question(s) • {assignment.points} points
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <Card key={question.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant="outline">Q{index + 1}</Badge>
                {question.questionTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={answers[question.id] || ''}
                onValueChange={(val) => handleAnswerChange(question.id, val as 'A' | 'B' | 'C' | 'D')}
                className="space-y-3"
              >
                {[
                  { key: 'A', value: question.optionA },
                  { key: 'B', value: question.optionB },
                  { key: 'C', value: question.optionC },
                  { key: 'D', value: question.optionD },
                ].map(option => (
                  <div 
                    key={option.key}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      answers[question.id] === option.key 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => handleAnswerChange(question.id, option.key as 'A' | 'B' | 'C' | 'D')}
                  >
                    <RadioGroupItem value={option.key} id={`${question.id}-${option.key}`} />
                    <Label 
                      htmlFor={`${question.id}-${option.key}`} 
                      className="flex-1 cursor-pointer font-normal"
                    >
                      <span className="font-medium mr-2">{option.key}.</span>
                      {option.value}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submit Button */}
      <Button 
        onClick={submitQuiz} 
        disabled={isSubmitting || answeredCount < questions.length}
        size="lg"
        className="w-full gap-2"
      >
        <Send className="w-5 h-5" />
        {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
      </Button>

      {answeredCount < questions.length && (
        <p className="text-center text-sm text-muted-foreground">
          Please answer all questions before submitting
        </p>
      )}
    </div>
  );
}
