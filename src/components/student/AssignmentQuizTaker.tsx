import { useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Send, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

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
    if (isSubmitted) return;
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
    const percentage = Math.round((correctCount / questions.length) * 100);
    
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

        {/* Score Summary - Examination Style */}
        <div className="glass-effect rounded-2xl p-8 text-center">
          <div className={cn(
            "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
            percentage >= 70 ? "bg-emerald-500/20" : percentage >= 50 ? "bg-amber-500/20" : "bg-destructive/20"
          )}>
            <Trophy className={cn(
              "w-10 h-10",
              percentage >= 70 ? "text-emerald-500" : percentage >= 50 ? "text-amber-500" : "text-destructive"
            )} />
          </div>
          <p className="text-5xl font-bold mb-2">
            {finalScore}/{assignment.points}
          </p>
          <p className="text-lg text-muted-foreground mb-4">
            {correctCount} out of {questions.length} correct ({percentage}%)
          </p>
          <Progress 
            value={percentage} 
            className="h-3 max-w-sm mx-auto" 
          />
          <p className="text-sm text-muted-foreground mt-4">
            {percentage >= 70 ? "Great job! 🎉" : percentage >= 50 ? "Good effort! Keep practicing." : "Keep studying and try again!"}
          </p>
        </div>

        {/* Results Breakdown */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Question Results:</h3>
          {results.map((result, index) => {
            const question = questions[index];
            const getOptionText = (key: string) => {
              switch(key) {
                case 'A': return question.optionA;
                case 'B': return question.optionB;
                case 'C': return question.optionC;
                case 'D': return question.optionD;
                default: return '';
              }
            };

            return (
              <div 
                key={result.questionId}
                className={cn(
                  "glass-effect rounded-xl p-4 border",
                  result.isCorrect ? "border-emerald-500/50 bg-emerald-500/5" : "border-destructive/50 bg-destructive/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    result.isCorrect ? "bg-emerald-500 text-white" : "bg-destructive text-white"
                  )}>
                    {result.isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
                      <span className="font-medium">{result.questionTitle}</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="flex items-center gap-2">
                        <span className="text-muted-foreground">Your answer:</span>
                        <span className={cn(
                          "font-medium",
                          result.isCorrect ? "text-emerald-600" : "text-destructive"
                        )}>
                          {result.selectedAnswer ? `${result.selectedAnswer}. ${getOptionText(result.selectedAnswer)}` : 'Not answered'}
                        </span>
                      </p>
                      {!result.isCorrect && (
                        <p className="flex items-center gap-2">
                          <span className="text-muted-foreground">Correct answer:</span>
                          <span className="text-emerald-600 font-medium">
                            {result.correctAnswer}. {getOptionText(result.correctAnswer)}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={onBack} size="lg" className="w-full">
          Back to Assignments
        </Button>
      </div>
    );
  }

  // Previously submitted - show grade only
  if (existingSubmission?.grade !== null && existingSubmission?.grade !== undefined) {
    const percentage = Math.round((existingSubmission.grade / assignment.points) * 100);
    
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

        <div className="glass-effect rounded-2xl p-8 text-center">
          <div className={cn(
            "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
            percentage >= 70 ? "bg-emerald-500/20" : percentage >= 50 ? "bg-amber-500/20" : "bg-destructive/20"
          )}>
            <CheckCircle2 className={cn(
              "w-10 h-10",
              percentage >= 70 ? "text-emerald-500" : percentage >= 50 ? "text-amber-500" : "text-destructive"
            )} />
          </div>
          <p className="text-4xl font-bold mb-2">
            {existingSubmission.grade}/{assignment.points}
          </p>
          <p className="text-muted-foreground">You have already completed this quiz</p>
          {existingSubmission.feedback && (
            <div className="mt-6 p-4 bg-muted rounded-xl text-left max-w-md mx-auto">
              <p className="text-sm font-medium mb-1">Teacher Feedback:</p>
              <p className="text-sm text-muted-foreground">{existingSubmission.feedback}</p>
            </div>
          )}
        </div>

        <Button onClick={onBack} size="lg" className="w-full">
          Back to Assignments
        </Button>
      </div>
    );
  }

  // Quiz taking view - Examination style with all questions visible
  return (
    <div className="space-y-6">
      {/* Header */}
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
        <div className="px-3 py-1.5 rounded-full bg-primary/20 text-primary text-sm font-medium">
          {answeredCount}/{questions.length}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="glass-effect rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-sm text-muted-foreground">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Questions - Multiple Choice Only */}
      <div className="space-y-6">
        {questions.map((question, index) => (
          <div key={question.id} className="glass-effect rounded-2xl p-5">
            {/* Question Header */}
            <div className="flex items-center gap-2 mb-4">
              <Badge className="bg-primary/20 text-primary border-0">
                Question {index + 1}
              </Badge>
              {answers[question.id] && (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/50">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Answered
                </Badge>
              )}
            </div>
            
            {/* Question Text */}
            <p className="text-base font-medium mb-4">{question.questionTitle}</p>

            {/* Multiple Choice Options - Examination Style */}
            <div className="space-y-2">
              {[
                { key: 'A' as const, value: question.optionA },
                { key: 'B' as const, value: question.optionB },
                { key: 'C' as const, value: question.optionC },
                { key: 'D' as const, value: question.optionD },
              ].map(option => {
                const isSelected = answers[question.id] === option.key;
                
                return (
                  <button
                    key={option.key}
                    onClick={() => handleAnswerChange(question.id, option.key)}
                    className={cn(
                      "w-full p-4 rounded-xl text-left transition-all duration-200 border",
                      "flex items-center gap-3 text-sm",
                      "hover:bg-secondary/50 hover:border-primary/50",
                      isSelected 
                        ? "border-primary bg-primary/10" 
                        : "bg-card/50 border-border/50"
                    )}
                  >
                    <span className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0",
                      isSelected 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-secondary text-secondary-foreground"
                    )}>
                      {option.key}
                    </span>
                    <span className="flex-1">{option.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      <div className="sticky bottom-4">
        <Button 
          onClick={submitQuiz} 
          disabled={isSubmitting || answeredCount < questions.length}
          size="lg"
          className="w-full gap-2 shadow-lg"
        >
          <Send className="w-5 h-5" />
          {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
        </Button>

        {answeredCount < questions.length && (
          <p className="text-center text-sm text-muted-foreground mt-3">
            Answer all {questions.length - answeredCount} remaining question(s) to submit
          </p>
        )}
      </div>
    </div>
  );
}
