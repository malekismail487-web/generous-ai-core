import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trophy, BookOpen, GraduationCap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ExamType = 'subjects' | 'sat';

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
  { id: 'technology', name: 'Technology', emoji: '💻' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const subjectDifficulties = [
  { id: 'beginner', name: 'Beginner', questions: 10, color: 'from-emerald-500 to-teal-500' },
  { id: 'intermediate', name: 'Intermediate', questions: 20, color: 'from-amber-500 to-orange-500' },
  { id: 'expert', name: 'Expert', questions: 30, color: 'from-rose-500 to-pink-500' },
];

const satDifficulties = [
  { id: 'beginner', name: 'Beginner', questions: 20, color: 'from-emerald-500 to-teal-500' },
  { id: 'intermediate', name: 'Intermediate', questions: 50, color: 'from-amber-500 to-orange-500' },
  { id: 'expert', name: 'Expert', questions: 65, color: 'from-rose-500 to-pink-500' },
  { id: 'full_sat', name: 'Full SAT Exam', questions: 140, color: 'from-violet-500 to-purple-600' },
];

type ViewState = 'type' | 'subjects' | 'config' | 'exam' | 'results';

interface ExamState {
  questions: Question[];
  answers: (number | null)[];
  currentIndex: number;
  showExplanation: boolean;
}

export function ExaminationSection() {
  const [viewState, setViewState] = useState<ViewState>('type');
  const [examType, setExamType] = useState<ExamType | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [examState, setExamState] = useState<ExamState | null>(null);
  const { toast } = useToast();

  const generateQuestions = useCallback(async (count: number) => {
    setIsLoading(true);

    const subject = examType === 'subjects' 
      ? subjects.find(s => s.id === selectedSubject)?.name 
      : 'SAT';
    
    const prompt = `Generate ${count} ${subject} exam questions${topicInput ? ` about "${topicInput}"` : ''}${selectedGrade ? ` for ${selectedGrade} students` : ''}.

Difficulty: ${selectedDifficulty}

Return ONLY valid JSON array:
[
  {
    "question": "Question text",
    "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
    "correctIndex": 0,
    "explanation": "Step-by-step explanation"
  }
]

Make questions appropriate and educational.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; },
        onDone: () => {
          try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const questions = JSON.parse(jsonMatch[0]);
              setExamState({
                questions,
                answers: new Array(questions.length).fill(null),
                currentIndex: 0,
                showExplanation: false,
              });
              setViewState('exam');
            }
          } catch {
            toast({ variant: 'destructive', title: 'Error generating questions' });
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
  }, [examType, selectedSubject, selectedGrade, selectedDifficulty, topicInput, toast]);

  const handleExamTypeSelect = (type: ExamType) => {
    setExamType(type);
    setViewState(type === 'subjects' ? 'subjects' : 'config');
  };

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setViewState('config');
  };

  const handleStartExam = (difficultyId: string) => {
    setSelectedDifficulty(difficultyId);
    const difficulties = examType === 'subjects' ? subjectDifficulties : satDifficulties;
    const diff = difficulties.find(d => d.id === difficultyId);
    if (diff) {
      generateQuestions(diff.questions);
    }
  };

  const handleAnswer = (index: number) => {
    if (!examState || examState.showExplanation) return;
    setExamState(prev => {
      if (!prev) return prev;
      const newAnswers = [...prev.answers];
      newAnswers[prev.currentIndex] = index;
      return { ...prev, answers: newAnswers, showExplanation: true };
    });
  };

  const handleNext = () => {
    if (!examState) return;
    if (examState.currentIndex + 1 >= examState.questions.length) {
      setViewState('results');
    } else {
      setExamState(prev => prev ? {
        ...prev,
        currentIndex: prev.currentIndex + 1,
        showExplanation: false,
      } : prev);
    }
  };

  const handleReset = () => {
    setViewState('type');
    setExamType(null);
    setSelectedSubject(null);
    setSelectedGrade(null);
    setSelectedDifficulty(null);
    setTopicInput('');
    setExamState(null);
  };

  // RESULTS VIEW
  if (viewState === 'results' && examState) {
    const correct = examState.answers.filter((a, i) => a === examState.questions[i].correctIndex).length;
    const total = examState.questions.length;
    const percentage = Math.round((correct / total) * 100);

    return (
      <div className="flex-1 flex items-center justify-center p-4 pt-16 pb-20">
        <div className="text-center animate-fade-in max-w-sm w-full">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-effect">
            <Trophy className="w-10 h-10 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Exam Complete!</h2>
          <div className="glass-effect rounded-2xl p-5 mb-5">
            <div className="text-4xl font-bold gradient-text mb-1">{percentage}%</div>
            <p className="text-muted-foreground text-sm">{correct} out of {total} correct</p>
          </div>
          <Button onClick={handleReset}>Start New Exam</Button>
        </div>
      </div>
    );
  }

  // EXAM VIEW
  if (viewState === 'exam' && examState) {
    const currentQ = examState.questions[examState.currentIndex];
    const currentAnswer = examState.answers[examState.currentIndex];

    return (
      <div className="flex-1 flex flex-col overflow-hidden pt-14 pb-16">
        <div className="flex items-center justify-between p-3 border-b border-border/30">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <ArrowLeft size={14} className="mr-1" />
            Exit
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {examState.currentIndex + 1}/{examState.questions.length}
            </span>
            <div className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
              Score: {examState.answers.filter((a, i) => a === examState.questions[i]?.correctIndex).length}
            </div>
          </div>
        </div>

        <div className="h-1 bg-secondary">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${((examState.currentIndex + 1) / examState.questions.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="glass-effect rounded-2xl p-5 mb-5">
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{currentQ.question}</p>
            </div>

            <div className="space-y-2 mb-5">
              {currentQ.options.map((option, index) => {
                const isSelected = currentAnswer === index;
                const isCorrect = index === currentQ.correctIndex;
                const showCorrect = examState.showExplanation && isCorrect;
                const showWrong = examState.showExplanation && isSelected && !isCorrect;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={examState.showExplanation}
                    className={cn(
                      "w-full p-3.5 rounded-xl text-left transition-all duration-200 border",
                      "flex items-center gap-3 text-sm",
                      !examState.showExplanation && "hover:bg-secondary/50 hover:border-primary/50 bg-card/50 border-border/50",
                      showCorrect && "bg-emerald-500/20 border-emerald-500",
                      showWrong && "bg-destructive/20 border-destructive",
                      isSelected && !examState.showExplanation && "border-primary bg-primary/10"
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

            {examState.showExplanation && (
              <div className="glass-effect rounded-2xl p-4 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                    currentAnswer === currentQ.correctIndex 
                      ? "bg-emerald-500/20 text-emerald-500" 
                      : "bg-amber-500/20 text-amber-500"
                  )}>
                    {currentAnswer === currentQ.correctIndex ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {currentAnswer === currentQ.correctIndex ? 'Correct!' : 'Not quite right'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{currentQ.explanation}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {examState.showExplanation && (
          <div className="p-3 border-t border-border/30">
            <div className="max-w-lg mx-auto flex justify-end">
              <Button size="sm" onClick={handleNext}>
                {examState.currentIndex + 1 >= examState.questions.length ? 'See Results' : 'Next'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // LOADING VIEW
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Generating exam questions...</p>
        </div>
      </div>
    );
  }

  // CONFIG VIEW - Select grade, topic, difficulty
  if (viewState === 'config') {
    const difficulties = examType === 'subjects' ? subjectDifficulties : satDifficulties;
    const subject = examType === 'subjects' ? subjects.find(s => s.id === selectedSubject) : null;

    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState(examType === 'subjects' ? 'subjects' : 'type')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-primary to-accent">
              {examType === 'subjects' ? subject?.emoji : '📝'}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {examType === 'subjects' ? `${subject?.name} Exam` : 'SAT Exam'}
            </h1>
          </div>

          {examType === 'subjects' && !selectedGrade && (
            <div className="glass-effect rounded-2xl p-5 mb-4 animate-fade-in">
              <h3 className="font-semibold mb-4 text-center">Select Your Grade Level</h3>
              <div className="grid grid-cols-4 gap-2">
                {grades.map((grade) => (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(examType === 'sat' || selectedGrade) && (
            <>
              <div className="glass-effect rounded-2xl p-5 mb-4 animate-fade-in">
                <h3 className="font-semibold mb-3 text-center">Topic (Optional)</h3>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="e.g., Photosynthesis, Algebra..."
                  className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="glass-effect rounded-2xl p-5 animate-fade-in">
                <h3 className="font-semibold mb-3 text-center">Select Difficulty</h3>
                <div className="space-y-2">
                  {difficulties.map((diff) => (
                    <button
                      key={diff.id}
                      onClick={() => handleStartExam(diff.id)}
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
                        <p className="text-xs text-muted-foreground">{diff.questions} questions</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // SUBJECTS VIEW
  if (viewState === 'subjects') {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState('type')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-2xl font-bold mb-2 gradient-text">Select Subject</h1>
            <p className="text-muted-foreground text-sm">Choose a subject for your exam</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {subjects.map((subj, index) => (
              <button
                key={subj.id}
                onClick={() => handleSubjectClick(subj.id)}
                className={cn(
                  "glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in",
                  "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-3"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <span className="text-xl">{subj.emoji}</span>
                <span className="font-medium text-sm">{subj.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // TYPE VIEW - Choose between Subjects or SAT
  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <BookOpen className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Examination</h1>
          <p className="text-muted-foreground text-sm">Click to select exam type</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => handleExamTypeSelect('subjects')}
            className="glass-effect rounded-xl p-5 text-left transition-all duration-200 animate-fade-in hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <BookOpen size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Subjects</h3>
              <p className="text-xs text-muted-foreground">Biology, Physics, Math, and more</p>
              <p className="text-xs text-primary mt-1">Beginner (10) • Intermediate (20) • Expert (30)</p>
            </div>
          </button>

          <button
            onClick={() => handleExamTypeSelect('sat')}
            className="glass-effect rounded-xl p-5 text-left transition-all duration-200 animate-fade-in hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
            style={{ animationDelay: '50ms' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">SAT</h3>
              <p className="text-xs text-muted-foreground">Full SAT exam practice</p>
              <p className="text-xs text-primary mt-1">Beginner (20) • Intermediate (50) • Expert (65) • Full SAT (140)</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}