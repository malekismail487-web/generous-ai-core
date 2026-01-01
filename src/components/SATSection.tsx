import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RotateCcw, Trophy, GraduationCap, BookOpen, Calculator, Clock, Flag, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type SATTab = 'reading_writing' | 'math' | 'sat_test';
type Difficulty = 'beginner' | 'intermediate' | 'hard';
type SATTestSection = 'reading' | 'writing' | 'math_no_calc' | 'math_calc';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface SATTestState {
  currentSection: SATTestSection;
  sectionQuestions: { [key in SATTestSection]?: Question[] };
  sectionAnswers: { [key in SATTestSection]?: (number | null)[] };
  flaggedQuestions: { [key in SATTestSection]?: boolean[] };
  currentQuestionIndex: number;
  timeRemaining: number;
  isComplete: boolean;
  showResults: boolean;
}

const satTabs = [
  { id: 'reading_writing' as const, name: 'Reading & Writing', icon: BookOpen },
  { id: 'math' as const, name: 'Math', icon: Calculator },
  { id: 'sat_test' as const, name: 'SAT Test', icon: FileText },
];

const satGrades = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

const difficulties = [
  { id: 'beginner' as const, name: 'Beginner', questions: 5, color: 'from-emerald-500 to-teal-500' },
  { id: 'intermediate' as const, name: 'Intermediate', questions: 7, color: 'from-amber-500 to-orange-500' },
  { id: 'hard' as const, name: 'Hard', questions: 10, color: 'from-rose-500 to-pink-500' },
];

const satSections: { id: SATTestSection; name: string; time: number; questions: number }[] = [
  { id: 'reading', name: 'Reading', time: 65 * 60, questions: 10 },
  { id: 'writing', name: 'Writing & Language', time: 35 * 60, questions: 8 },
  { id: 'math_no_calc', name: 'Math - No Calculator', time: 25 * 60, questions: 6 },
  { id: 'math_calc', name: 'Math - Calculator', time: 55 * 60, questions: 8 },
];

export function SATSection() {
  const [activeTab, setActiveTab] = useState<SATTab>('reading_writing');
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
  const [showTopicInput, setShowTopicInput] = useState(false);
  const { toast } = useToast();

  // SAT Test state
  const [satTest, setSatTest] = useState<SATTestState | null>(null);
  const [isGeneratingSATTest, setIsGeneratingSATTest] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const maxQuestions = difficulties.find(d => d.id === selectedDifficulty)?.questions || 5;

  // Timer for SAT Test
  useEffect(() => {
    if (satTest && !satTest.isComplete && satTest.timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setSatTest(prev => {
          if (!prev) return prev;
          const newTime = prev.timeRemaining - 1;
          if (newTime <= 0) {
            // Auto-advance to next section
            return handleSectionTimeUp(prev);
          }
          return { ...prev, timeRemaining: newTime };
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [satTest?.currentSection, satTest?.isComplete]);

  const handleSectionTimeUp = (prev: SATTestState): SATTestState => {
    const currentSectionIndex = satSections.findIndex(s => s.id === prev.currentSection);
    if (currentSectionIndex < satSections.length - 1) {
      const nextSection = satSections[currentSectionIndex + 1];
      toast({ title: 'Time\'s up!', description: `Moving to ${nextSection.name}` });
      return {
        ...prev,
        currentSection: nextSection.id,
        currentQuestionIndex: 0,
        timeRemaining: nextSection.time,
      };
    }
    return { ...prev, isComplete: true, showResults: true };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateQuestion = useCallback(async () => {
    if (!selectedDifficulty || !selectedGrade) return;
    
    setIsLoading(true);
    setSelectedAnswer(null);
    setShowResult(false);

    const tabName = activeTab === 'reading_writing' ? 'Reading and Writing' : 'Math (Algebra and Geometry)';
    const difficultyDesc = selectedDifficulty === 'beginner' 
      ? 'basic understanding' 
      : selectedDifficulty === 'intermediate' 
        ? 'moderate complexity' 
        : 'challenging, exam-style';

    const prompt = `Generate an SAT ${tabName} practice question at ${difficultyDesc} level for a ${selectedGrade} student${topic ? ` about "${topic}"` : ''}.

For Reading and Writing: Focus on reading comprehension, grammar, vocabulary in context, or rhetorical skills.
For Math: Focus on algebra, problem-solving, geometry, or data analysis.

Return ONLY valid JSON:
{
  "question": "The SAT-style question text here",
  "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
  "correctIndex": 0,
  "explanation": "Step-by-step explanation"
}

Make it authentic to SAT format and difficulty.`;

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
  }, [selectedDifficulty, selectedGrade, activeTab, topic, toast]);

  const generateSATTestQuestions = useCallback(async (section: SATTestSection) => {
    const sectionInfo = satSections.find(s => s.id === section)!;
    const sectionType = section === 'reading' ? 'Reading Comprehension' :
      section === 'writing' ? 'Writing and Language' :
      section === 'math_no_calc' ? 'Math (No Calculator - focus on algebra and arithmetic)' :
      'Math (Calculator allowed - includes geometry and data analysis)';

    const prompt = `Generate ${sectionInfo.questions} SAT ${sectionType} questions for a ${selectedGrade} student.

Return ONLY a valid JSON array:
[
  {
    "question": "Question text",
    "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
    "correctIndex": 0,
    "explanation": "Explanation"
  }
]

Make questions authentic to official SAT format and difficulty.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    return new Promise<Question[]>((resolve) => {
      streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; },
        onDone: () => {
          try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              resolve([]);
            }
          } catch {
            resolve([]);
          }
        },
        onError: () => resolve([]),
      });
    });
  }, [selectedGrade]);

  const startSATTest = useCallback(async () => {
    if (!selectedGrade) return;
    
    setIsGeneratingSATTest(true);
    toast({ title: 'Generating SAT Test', description: 'This may take a moment...' });

    const allQuestions: { [key in SATTestSection]?: Question[] } = {};
    
    for (const section of satSections) {
      const questions = await generateSATTestQuestions(section.id);
      allQuestions[section.id] = questions;
    }

    const initialAnswers: { [key in SATTestSection]?: (number | null)[] } = {};
    const initialFlags: { [key in SATTestSection]?: boolean[] } = {};
    
    for (const section of satSections) {
      const count = allQuestions[section.id]?.length || 0;
      initialAnswers[section.id] = new Array(count).fill(null);
      initialFlags[section.id] = new Array(count).fill(false);
    }

    setSatTest({
      currentSection: 'reading',
      sectionQuestions: allQuestions,
      sectionAnswers: initialAnswers,
      flaggedQuestions: initialFlags,
      currentQuestionIndex: 0,
      timeRemaining: satSections[0].time,
      isComplete: false,
      showResults: false,
    });

    setIsGeneratingSATTest(false);
  }, [selectedGrade, generateSATTestQuestions, toast]);

  const handleStart = (difficulty: Difficulty) => {
    setSelectedDifficulty(difficulty);
    setScore(0);
    setQuestionCount(0);
    setIsComplete(false);
    setShowTopicInput(false);
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
    setSelectedDifficulty(null);
    setCurrentQuestion(null);
    setIsComplete(false);
    setShowTopicInput(false);
  };

  const handleSATTestAnswer = (answerIndex: number) => {
    if (!satTest) return;
    setSatTest(prev => {
      if (!prev) return prev;
      const newAnswers = { ...prev.sectionAnswers };
      const sectionAnswers = [...(newAnswers[prev.currentSection] || [])];
      sectionAnswers[prev.currentQuestionIndex] = answerIndex;
      newAnswers[prev.currentSection] = sectionAnswers;
      return { ...prev, sectionAnswers: newAnswers };
    });
  };

  const handleFlagQuestion = () => {
    if (!satTest) return;
    setSatTest(prev => {
      if (!prev) return prev;
      const newFlags = { ...prev.flaggedQuestions };
      const sectionFlags = [...(newFlags[prev.currentSection] || [])];
      sectionFlags[prev.currentQuestionIndex] = !sectionFlags[prev.currentQuestionIndex];
      newFlags[prev.currentSection] = sectionFlags;
      return { ...prev, flaggedQuestions: newFlags };
    });
  };

  const handleSATTestNavigation = (direction: 'prev' | 'next') => {
    if (!satTest) return;
    const questions = satTest.sectionQuestions[satTest.currentSection] || [];
    if (direction === 'next' && satTest.currentQuestionIndex < questions.length - 1) {
      setSatTest(prev => prev ? { ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 } : prev);
    } else if (direction === 'prev' && satTest.currentQuestionIndex > 0) {
      setSatTest(prev => prev ? { ...prev, currentQuestionIndex: prev.currentQuestionIndex - 1 } : prev);
    }
  };

  const submitSATSection = () => {
    if (!satTest) return;
    const currentSectionIndex = satSections.findIndex(s => s.id === satTest.currentSection);
    if (currentSectionIndex < satSections.length - 1) {
      const nextSection = satSections[currentSectionIndex + 1];
      setSatTest(prev => prev ? {
        ...prev,
        currentSection: nextSection.id,
        currentQuestionIndex: 0,
        timeRemaining: nextSection.time,
      } : prev);
    } else {
      setSatTest(prev => prev ? { ...prev, isComplete: true, showResults: true } : prev);
    }
  };

  const calculateSATScore = () => {
    if (!satTest) return { reading: 0, writing: 0, math: 0, total: 0 };
    
    let readingCorrect = 0, writingCorrect = 0, mathCorrect = 0;
    let readingTotal = 0, writingTotal = 0, mathTotal = 0;

    for (const section of satSections) {
      const questions = satTest.sectionQuestions[section.id] || [];
      const answers = satTest.sectionAnswers[section.id] || [];
      
      questions.forEach((q, i) => {
        const isCorrect = answers[i] === q.correctIndex;
        if (section.id === 'reading') {
          readingTotal++;
          if (isCorrect) readingCorrect++;
        } else if (section.id === 'writing') {
          writingTotal++;
          if (isCorrect) writingCorrect++;
        } else {
          mathTotal++;
          if (isCorrect) mathCorrect++;
        }
      });
    }

    // Scale to SAT scoring (200-800 per section)
    const readingScore = Math.round(200 + (readingCorrect / Math.max(readingTotal, 1)) * 600);
    const writingScore = Math.round(200 + (writingCorrect / Math.max(writingTotal, 1)) * 600);
    const mathScore = Math.round(200 + (mathCorrect / Math.max(mathTotal, 1)) * 600);
    const evidenceBasedRW = Math.round((readingScore + writingScore) / 2);
    
    return {
      reading: readingScore,
      writing: writingScore,
      math: mathScore,
      evidenceBasedRW,
      total: evidenceBasedRW + mathScore,
    };
  };

  // SAT Test Results View
  if (satTest?.showResults) {
    const scores = calculateSATScore();
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-6 animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-effect">
              <Trophy className="w-10 h-10 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">SAT Test Complete!</h2>
          </div>

          <div className="glass-effect rounded-2xl p-6 mb-6">
            <div className="text-center mb-6">
              <div className="text-5xl font-bold gradient-text mb-2">{scores.total}</div>
              <p className="text-muted-foreground">Total Score (out of 1600)</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-secondary/30 rounded-xl">
                <div className="text-2xl font-bold text-primary">{scores.evidenceBasedRW}</div>
                <p className="text-xs text-muted-foreground">Evidence-Based R&W</p>
              </div>
              <div className="text-center p-4 bg-secondary/30 rounded-xl">
                <div className="text-2xl font-bold text-primary">{scores.math}</div>
                <p className="text-xs text-muted-foreground">Math</p>
              </div>
            </div>
          </div>

          {/* Detailed Section Breakdown */}
          <div className="glass-effect rounded-2xl p-4 mb-6">
            <h3 className="font-semibold mb-4">Section Breakdown</h3>
            {satSections.map(section => {
              const questions = satTest.sectionQuestions[section.id] || [];
              const answers = satTest.sectionAnswers[section.id] || [];
              const correct = questions.filter((q, i) => answers[i] === q.correctIndex).length;
              return (
                <div key={section.id} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                  <span className="text-sm">{section.name}</span>
                  <span className="text-sm font-medium">{correct}/{questions.length}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => {
              setSatTest(null);
              setSelectedGrade(null);
            }}>
              Back to SAT
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // SAT Test in Progress
  if (satTest && !satTest.showResults) {
    const currentSectionInfo = satSections.find(s => s.id === satTest.currentSection)!;
    const questions = satTest.sectionQuestions[satTest.currentSection] || [];
    const currentQ = questions[satTest.currentQuestionIndex];
    const currentAnswer = satTest.sectionAnswers[satTest.currentSection]?.[satTest.currentQuestionIndex];
    const isFlagged = satTest.flaggedQuestions[satTest.currentSection]?.[satTest.currentQuestionIndex];

    return (
      <div className="flex-1 flex flex-col overflow-hidden pt-14 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border/30 bg-card/50">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm">{currentSectionInfo.name}</span>
            <span className="text-xs text-muted-foreground">
              {satTest.currentQuestionIndex + 1}/{questions.length}
            </span>
          </div>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            satTest.timeRemaining < 300 ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
          )}>
            <Clock size={14} />
            {formatTime(satTest.timeRemaining)}
          </div>
        </div>

        {/* Progress */}
        <div className="h-1 bg-secondary">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${((satTest.currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-lg mx-auto">
            {currentQ ? (
              <div className="animate-fade-in">
                <div className="glass-effect rounded-2xl p-5 mb-5">
                  <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{currentQ.question}</p>
                </div>

                <div className="space-y-2 mb-5">
                  {currentQ.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleSATTestAnswer(index)}
                      className={cn(
                        "w-full p-3.5 rounded-xl text-left transition-all duration-200 border",
                        "flex items-center gap-3 text-sm",
                        currentAnswer === index
                          ? "border-primary bg-primary/10"
                          : "hover:bg-secondary/50 hover:border-primary/50 bg-card/50 border-border/50"
                      )}
                    >
                      <span className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0",
                        currentAnswer === index ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                      )}>
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1">{option}</span>
                    </button>
                  ))}
                </div>

                <Button
                  variant={isFlagged ? "default" : "outline"}
                  size="sm"
                  onClick={handleFlagQuestion}
                  className="gap-2"
                >
                  <Flag size={14} />
                  {isFlagged ? 'Flagged' : 'Flag for Review'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                <p className="text-muted-foreground text-sm">Loading question...</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="p-3 border-t border-border/30">
          <div className="max-w-lg mx-auto flex justify-between">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSATTestNavigation('prev')}
              disabled={satTest.currentQuestionIndex === 0}
            >
              Previous
            </Button>
            {satTest.currentQuestionIndex === questions.length - 1 ? (
              <Button size="sm" onClick={submitSATSection}>
                Submit Section
              </Button>
            ) : (
              <Button 
                size="sm" 
                onClick={() => handleSATTestNavigation('next')}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Generating SAT Test
  if (isGeneratingSATTest) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Generating SAT Test</h2>
          <p className="text-muted-foreground text-sm">Preparing all sections...</p>
        </div>
      </div>
    );
  }

  // Selection view
  if (!selectedDifficulty && !satTest) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-violet-500 to-purple-600">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">SAT Practice</h1>
            <p className="text-muted-foreground text-sm">Grades 8-12 only</p>
          </div>

          {/* Grade Selection */}
          {!selectedGrade && (
            <div className="glass-effect rounded-xl p-4 mb-6 animate-fade-in">
              <h3 className="font-semibold text-sm mb-3">Select Your Grade</h3>
              <div className="grid grid-cols-3 gap-2">
                {satGrades.map((grade) => (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedGrade && (
            <>
              {/* Tab Selection */}
              <div className="flex gap-2 mb-6 p-1 glass-effect rounded-xl">
                {satTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                        activeTab === tab.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary/50"
                      )}
                    >
                      <Icon size={16} />
                      <span className="hidden sm:inline">{tab.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* SAT Test Tab */}
              {activeTab === 'sat_test' && (
                <div className="glass-effect rounded-xl p-5 mb-6 animate-fade-in">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Full-Length Timed SAT Exam</h3>
                      <p className="text-xs text-muted-foreground">
                        This is a complete SAT exam with all sections. Do not navigate away until completion. 
                        Total time: ~3 hours.
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    {satSections.map(section => (
                      <div key={section.id} className="flex justify-between items-center text-sm py-2 border-b border-border/30">
                        <span>{section.name}</span>
                        <span className="text-muted-foreground">{Math.floor(section.time / 60)} min</span>
                      </div>
                    ))}
                  </div>

                  <Button onClick={startSATTest} className="w-full gap-2">
                    <FileText size={16} />
                    Start SAT Test
                  </Button>
                </div>
              )}

              {/* Topic Input for Practice */}
              {activeTab !== 'sat_test' && showTopicInput && (
                <div className="glass-effect rounded-xl p-5 mb-6 animate-fade-in">
                  <h3 className="font-semibold text-sm mb-3">What do you want to study?</h3>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Reading comprehension, Algebra equations..."
                    className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowTopicInput(false)}>
                      Back
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => handleStart('intermediate')}>
                      Start Practice
                    </Button>
                  </div>
                </div>
              )}

              {/* Difficulty Selection */}
              {activeTab !== 'sat_test' && !showTopicInput && (
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowTopicInput(true)}
                    className="w-full mb-4"
                  >
                    Study a Specific Topic
                  </Button>
                  
                  <h3 className="font-semibold text-sm mb-2">Or take a practice quiz:</h3>
                  {difficulties.map((diff) => (
                    <button
                      key={diff.id}
                      onClick={() => handleStart(diff.id)}
                      className="difficulty-card w-full group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white font-bold",
                          diff.color
                        )}>
                          {diff.questions}
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="font-semibold text-foreground">{diff.name}</h3>
                          <p className="text-xs text-muted-foreground">{diff.questions} questions</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedGrade(null)}
                className="mt-4 text-muted-foreground"
              >
                ← Change Grade
              </Button>
            </>
          )}
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
          <h2 className="text-2xl font-bold mb-2">SAT Practice Complete!</h2>
          <div className="glass-effect rounded-2xl p-5 mb-5">
            <div className="text-4xl font-bold gradient-text mb-1">{percentage}%</div>
            <p className="text-muted-foreground text-sm">{score} out of {maxQuestions} correct</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={handleBack}>Back</Button>
            <Button size="sm" onClick={() => handleStart(selectedDifficulty!)}>
              <RotateCcw size={14} className="mr-1" />
              Try Again
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
