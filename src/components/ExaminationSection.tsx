import { useState, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RotateCcw, Trophy, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Difficulty = 'beginner' | 'intermediate' | 'hard';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬' },
  { id: 'physics', name: 'Physics', emoji: '⚛️' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐' },
  { id: 'english', name: 'English', emoji: '📚' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const difficulties = [
  { id: 'beginner' as const, name: 'Beginner', desc: 'Basic understanding', questions: 5, color: 'from-emerald-500 to-teal-500' },
  { id: 'intermediate' as const, name: 'Intermediate', desc: 'Application questions', questions: 7, color: 'from-amber-500 to-orange-500' },
  { id: 'hard' as const, name: 'Hard', desc: 'Exam-style questions', questions: 10, color: 'from-rose-500 to-pink-500' },
];

export function ExaminationSection() {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [topic, setTopic] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const { toast } = useToast();

  const maxQuestions = difficulties.find(d => d.id === selectedDifficulty)?.questions || 5;

  const generateQuestion = useCallback(async () => {
    if (!selectedSubject || !selectedGrade || !selectedDifficulty) return;
    
    setIsLoading(true);
    setSelectedAnswer(null);
    setShowResult(false);

    const subject = subjects.find(s => s.id === selectedSubject);
    const diffDesc = selectedDifficulty === 'beginner' 
      ? 'basic understanding and definitions' 
      : selectedDifficulty === 'intermediate' 
        ? 'application and mixed questions' 
        : 'exam-style, multi-step, and tricky questions';

    const prompt = `Generate a ${subject?.name} exam question for ${selectedGrade} students${topic ? ` about "${topic}"` : ''}.

Difficulty: ${diffDesc}

Return ONLY valid JSON:
{
  "question": "The question text",
  "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
  "correctIndex": 0,
  "explanation": "Step-by-step explanation"
}

Make it appropriate for ${selectedGrade} level. Be educational and accurate.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; },
        onDone: () => {
          try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              setCurrentQuestion(JSON.parse(jsonMatch[0]));
            } else {
              throw new Error('No JSON');
            }
          } catch {
            toast({ variant: 'destructive', title: 'Error parsing question' });
            generateQuestion();
          }
          setIsLoading(false);
        },
        onError: (error) => {
          setIsLoading(false);
          toast({ variant: 'destructive', title: 'Error', description: error.message });
        },
      });
    } catch {
      setIsLoading(false);
    }
  }, [selectedSubject, selectedGrade, selectedDifficulty, topic, toast]);

  const handleStart = (difficulty: Difficulty) => {
    setSelectedDifficulty(difficulty);
    setScore(0);
    setQuestionCount(0);
    setIsComplete(false);
    setShowConfig(false);
    setTimeout(generateQuestion, 100);
  };

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

  const handleBack = () => {
    setShowConfig(true);
    setSelectedDifficulty(null);
    setCurrentQuestion(null);
    setIsComplete(false);
  };

  const handleReset = () => {
    setSelectedSubject(null);
    setSelectedGrade(null);
    setSelectedDifficulty(null);
    setTopic('');
    setShowConfig(true);
    setIsComplete(false);
  };

  // Configuration view
  if (showConfig) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
              <BookOpen className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">Examination</h1>
            <p className="text-muted-foreground text-sm">Test yourself on any subject and topic</p>
          </div>

          <div className="space-y-4">
            {/* Subject Selection */}
            <div className="glass-effect rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">Select Subject</h3>
              <div className="grid grid-cols-3 gap-2">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => setSelectedSubject(subject.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2",
                      selectedSubject === subject.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <span>{subject.emoji}</span>
                    <span>{subject.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grade Selection */}
            {selectedSubject && (
              <div className="glass-effect rounded-xl p-4 animate-fade-in">
                <h3 className="font-semibold text-sm mb-3">Select Grade</h3>
                <div className="grid grid-cols-4 gap-2">
                  {grades.map((grade) => (
                    <button
                      key={grade}
                      onClick={() => setSelectedGrade(grade)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-medium transition-all",
                        selectedGrade === grade
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Topic (optional) */}
            {selectedGrade && (
              <div className="glass-effect rounded-xl p-4 animate-fade-in">
                <h3 className="font-semibold text-sm mb-3">Topic (Optional)</h3>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Photosynthesis, Quadratic equations..."
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {/* Difficulty Selection */}
            {selectedGrade && (
              <div className="glass-effect rounded-xl p-4 animate-fade-in">
                <h3 className="font-semibold text-sm mb-3">Select Difficulty</h3>
                <div className="space-y-2">
                  {difficulties.map((diff) => (
                    <button
                      key={diff.id}
                      onClick={() => handleStart(diff.id)}
                      className="w-full p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all flex items-center gap-3"
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br text-white text-sm font-bold",
                        diff.color
                      )}>
                        {diff.questions}
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium text-sm">{diff.name}</p>
                        <p className="text-xs text-muted-foreground">{diff.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Complete view
  if (isComplete) {
    const percentage = Math.round((score / maxQuestions) * 100);
    return (
      <div className="flex-1 flex items-center justify-center p-4 pt-16 pb-20">
        <div className="text-center animate-fade-in max-w-sm w-full">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-effect">
            <Trophy className="w-10 h-10 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Exam Complete!</h2>
          <div className="glass-effect rounded-2xl p-5 mb-5">
            <div className="text-4xl font-bold gradient-text mb-1">{percentage}%</div>
            <p className="text-muted-foreground text-sm">{score} out of {maxQuestions} correct</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={handleReset}>New Exam</Button>
            <Button size="sm" onClick={() => handleStart(selectedDifficulty!)}>
              <RotateCcw size={14} className="mr-1" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Quiz view
  return (
    <div className="flex-1 flex flex-col overflow-hidden pt-14 pb-16">
      <div className="flex items-center justify-between p-3 border-b border-border/30">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5 h-8">
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{questionCount + 1}/{maxQuestions}</span>
          <div className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
            Score: {score}
          </div>
        </div>
      </div>

      <div className="h-1 bg-secondary">
        <div 
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${((questionCount + 1) / maxQuestions) * 100}%` }}
        />
      </div>

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
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{currentQuestion.question}</p>
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
                        "flex items-center gap-3 text-sm",
                        !showResult && "hover:bg-secondary/50 hover:border-primary/50 bg-card/50 border-border/50",
                        showCorrect && "bg-emerald-500/20 border-emerald-500",
                        showWrong && "bg-destructive/20 border-destructive",
                        isSelected && !showResult && "border-primary bg-primary/10"
                      )}
                    >
                      <span className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 bg-secondary text-secondary-foreground",
                        showCorrect && "bg-emerald-500 text-white",
                        showWrong && "bg-destructive text-white"
                      )}>
                        {showCorrect ? <CheckCircle2 size={14} /> : showWrong ? <XCircle size={14} /> : String.fromCharCode(65 + index)}
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
                      {selectedAnswer === currentQuestion.correctIndex ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
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
