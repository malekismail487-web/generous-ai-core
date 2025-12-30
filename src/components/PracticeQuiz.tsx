import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Difficulty = 'beginner' | 'intermediate' | 'hard';
type PracticeType = 'examination' | 'sat';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface PracticeQuizProps {
  difficulty: Difficulty;
  type: PracticeType;
  onBack: () => void;
}

const difficultyPrompts = {
  beginner: 'easy, suitable for beginners with basic concepts',
  intermediate: 'moderate difficulty with some complex reasoning required',
  hard: 'challenging, requiring advanced understanding and critical thinking',
};

const typePrompts = {
  examination: 'general academic examination covering various subjects like science, math, history, and language',
  sat: 'SAT standardized test covering reading comprehension, writing, and mathematics',
};

export function PracticeQuiz({ difficulty, type, onBack }: PracticeQuizProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  const maxQuestions = difficulty === 'beginner' ? 5 : difficulty === 'intermediate' ? 7 : 10;

  const generateQuestion = useCallback(async () => {
    setIsLoading(true);
    setSelectedAnswer(null);
    setShowResult(false);

    const prompt = `Generate a single ${difficultyPrompts[difficulty]} multiple choice question for ${typePrompts[type]}.

Return ONLY valid JSON in this exact format, no other text:
{
  "question": "The question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation of why this is correct"
}

Make the question educational and engaging.`;

    const messages: Message[] = [
      { id: '1', role: 'user', content: prompt }
    ];

    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => {
          response += chunk;
        },
        onDone: () => {
          try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              setCurrentQuestion(parsed);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (e) {
            toast({
              variant: 'destructive',
              title: 'Error',
              description: 'Failed to parse question. Trying again...',
            });
            generateQuestion();
          }
          setIsLoading(false);
        },
        onError: (error) => {
          setIsLoading(false);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || 'Failed to generate question',
          });
        },
      });
    } catch (error) {
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate question',
      });
    }
  }, [difficulty, type, toast]);

  useEffect(() => {
    generateQuestion();
  }, []);

  const handleAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);

    if (index === currentQuestion?.correctIndex) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (questionCount + 1 >= maxQuestions) {
      setIsComplete(true);
    } else {
      setQuestionCount((prev) => prev + 1);
      generateQuestion();
    }
  };

  const handleRestart = () => {
    setScore(0);
    setQuestionCount(0);
    setIsComplete(false);
    generateQuestion();
  };

  if (isComplete) {
    const percentage = Math.round((score / maxQuestions) * 100);
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center animate-fade-in max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-effect">
            <Trophy className="w-12 h-12 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Practice Complete!</h2>
          <p className="text-muted-foreground mb-6">You've finished this practice session</p>
          
          <div className="glass-effect rounded-2xl p-6 mb-6">
            <div className="text-5xl font-bold gradient-text mb-2">{percentage}%</div>
            <p className="text-muted-foreground">
              {score} out of {maxQuestions} correct
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft size={16} />
              Back to Menu
            </Button>
            <Button onClick={handleRestart} className="gap-2">
              <RotateCcw size={16} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft size={16} />
          Back
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Question {questionCount + 1} of {maxQuestions}
          </span>
          <div className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
            Score: {score}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-secondary">
        <div 
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${((questionCount + 1) / maxQuestions) * 100}%` }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Generating question...</p>
            </div>
          ) : currentQuestion ? (
            <div className="animate-fade-in">
              {/* Question */}
              <div className="glass-effect rounded-2xl p-6 mb-6">
                <p className="text-lg font-medium leading-relaxed">{currentQuestion.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-3 mb-6">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer === index;
                  const isCorrect = index === currentQuestion.correctIndex;
                  const showCorrect = showResult && isCorrect;
                  const showWrong = showResult && isSelected && !isCorrect;

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswer(index)}
                      disabled={showResult}
                      className={cn(
                        "w-full p-4 rounded-xl text-left transition-all duration-300 border",
                        "flex items-center gap-4 group",
                        !showResult && "hover:bg-secondary/50 hover:border-primary/50 cursor-pointer",
                        !showResult && "bg-card/50 border-border/50",
                        showCorrect && "bg-emerald-500/20 border-emerald-500",
                        showWrong && "bg-destructive/20 border-destructive",
                        isSelected && !showResult && "border-primary bg-primary/10"
                      )}
                    >
                      <span className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0",
                        "bg-secondary text-secondary-foreground",
                        showCorrect && "bg-emerald-500 text-white",
                        showWrong && "bg-destructive text-white"
                      )}>
                        {showCorrect ? <CheckCircle2 size={16} /> : 
                         showWrong ? <XCircle size={16} /> : 
                         String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {showResult && (
                <div className="glass-effect rounded-2xl p-6 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      selectedAnswer === currentQuestion.correctIndex 
                        ? "bg-emerald-500/20 text-emerald-500" 
                        : "bg-amber-500/20 text-amber-500"
                    )}>
                      {selectedAnswer === currentQuestion.correctIndex ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <XCircle size={16} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium mb-1">
                        {selectedAnswer === currentQuestion.correctIndex ? 'Correct!' : 'Not quite right'}
                      </p>
                      <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      {showResult && (
        <div className="p-4 border-t border-border/50">
          <div className="max-w-2xl mx-auto flex justify-end">
            <Button onClick={handleNext} className="gap-2">
              {questionCount + 1 >= maxQuestions ? 'See Results' : 'Next Question'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}