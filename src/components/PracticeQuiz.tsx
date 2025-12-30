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
  learningContext: string;
}

const difficultyPrompts = {
  beginner: 'easy, suitable for beginners testing basic understanding',
  intermediate: 'moderate difficulty requiring good comprehension',
  hard: 'challenging, requiring deep understanding and critical thinking',
};

export function PracticeQuiz({ difficulty, type, onBack, learningContext }: PracticeQuizProps) {
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

    const satContext = type === 'sat' 
      ? 'Format the question in SAT standardized test style with reading comprehension or math focus.' 
      : '';

    const prompt = `Based on the following topics the student has been learning about:

${learningContext}

Generate a ${difficultyPrompts[difficulty]} multiple choice question that tests their understanding of these topics.
${satContext}

Return ONLY valid JSON in this exact format, no other text:
{
  "question": "The question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation of why this is correct"
}

Make sure the question directly relates to topics from their learning history. Be specific and educational.`;

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
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              setCurrentQuestion(parsed);
            } else {
              throw new Error('No JSON found');
            }
          } catch (e) {
            toast({
              variant: 'destructive',
              title: 'Error parsing question',
              description: 'Trying again...',
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
  }, [difficulty, type, learningContext, toast]);

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
      <div className="flex-1 flex items-center justify-center p-4 pt-16 pb-20">
        <div className="text-center animate-fade-in max-w-sm w-full">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-effect">
            <Trophy className="w-10 h-10 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Practice Complete!</h2>
          <p className="text-muted-foreground mb-5 text-sm">You've finished this session</p>
          
          <div className="glass-effect rounded-2xl p-5 mb-5">
            <div className="text-4xl font-bold gradient-text mb-1">{percentage}%</div>
            <p className="text-muted-foreground text-sm">
              {score} out of {maxQuestions} correct
            </p>
          </div>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button size="sm" onClick={handleRestart} className="gap-1.5">
              <RotateCcw size={14} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden pt-14 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 h-8">
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {questionCount + 1}/{maxQuestions}
          </span>
          <div className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
            Score: {score}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-secondary">
        <div 
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${((questionCount + 1) / maxQuestions) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-muted-foreground text-sm">Generating question...</p>
            </div>
          ) : currentQuestion ? (
            <div className="animate-fade-in">
              <div className="glass-effect rounded-2xl p-5 mb-5">
                <p className="text-sm font-medium leading-relaxed">{currentQuestion.question}</p>
              </div>

              <div className="space-y-2 mb-5">
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
                        "w-full p-3.5 rounded-xl text-left transition-all duration-200 border",
                        "flex items-center gap-3 group text-sm",
                        !showResult && "hover:bg-secondary/50 hover:border-primary/50",
                        !showResult && "bg-card/50 border-border/50",
                        showCorrect && "bg-emerald-500/20 border-emerald-500",
                        showWrong && "bg-destructive/20 border-destructive",
                        isSelected && !showResult && "border-primary bg-primary/10"
                      )}
                    >
                      <span className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0",
                        "bg-secondary text-secondary-foreground",
                        showCorrect && "bg-emerald-500 text-white",
                        showWrong && "bg-destructive text-white"
                      )}>
                        {showCorrect ? <CheckCircle2 size={14} /> : 
                         showWrong ? <XCircle size={14} /> : 
                         String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>

              {showResult && (
                <div className="glass-effect rounded-2xl p-4 animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      selectedAnswer === currentQuestion.correctIndex 
                        ? "bg-emerald-500/20 text-emerald-500" 
                        : "bg-amber-500/20 text-amber-500"
                    )}>
                      {selectedAnswer === currentQuestion.correctIndex ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <XCircle size={14} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {selectedAnswer === currentQuestion.correctIndex ? 'Correct!' : 'Not quite right'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{currentQuestion.explanation}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showResult && (
        <div className="p-3 border-t border-border/30">
          <div className="max-w-lg mx-auto flex justify-end">
            <Button size="sm" onClick={handleNext}>
              {questionCount + 1 >= maxQuestions ? 'See Results' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}