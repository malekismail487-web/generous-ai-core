import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trophy, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMaterials } from '@/hooks/useMaterials';
import { MathRenderer } from '@/components/MathRenderer';
import { useAuth } from '@/hooks/useAuth';

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
  { id: 'full_sat', name: 'Full SAT Exam', questions: 140, color: 'from-violet-500 to-purple-600', 
    description: 'Reading/Writing: 2 modules (35+35) + Math: 2 modules (35+35)' },
];

type ViewState = 'type' | 'subjects' | 'grade' | 'config' | 'exam' | 'results';

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
  const [isLoading, setIsLoading] = useState(false);
  const [examState, setExamState] = useState<ExamState | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { getMaterialsBySubjectAndGrade, getMaterialsBySubject } = useMaterials();

  // Get saved materials for the selected subject and grade
  const savedMaterials = useMemo(() => {
    if (!selectedSubject) return [];
    if (selectedGrade) {
      return getMaterialsBySubjectAndGrade(selectedSubject, selectedGrade);
    }
    return getMaterialsBySubject(selectedSubject);
  }, [selectedSubject, selectedGrade, getMaterialsBySubjectAndGrade, getMaterialsBySubject]);

  // Check if there are any saved materials
  const hasSavedMaterials = savedMaterials.length > 0;

  // Build context from saved materials for exam generation
  const materialContext = useMemo(() => {
    if (!hasSavedMaterials) return '';
    return savedMaterials.map(m => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n');
  }, [savedMaterials, hasSavedMaterials]);

  // Get SAT materials for beginner/intermediate/expert levels
  const satMaterials = useMemo(() => {
    const satSubjects = ['sat_math', 'sat_reading', 'sat_writing'];
    return satSubjects.flatMap(subject => getMaterialsBySubject(subject));
  }, [getMaterialsBySubject]);

  const hasSatMaterials = satMaterials.length > 0;

  const satMaterialContext = useMemo(() => {
    if (!hasSatMaterials) return '';
    return satMaterials.map(m => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n');
  }, [satMaterials, hasSatMaterials]);

  const generateQuestions = useCallback(async (count: number) => {
    // For subject exams, require saved materials
    if (!hasSavedMaterials && examType === 'subjects') {
      toast({ 
        variant: 'destructive', 
        title: 'No saved materials', 
        description: 'You need to study some materials first before taking an exam.' 
      });
      return;
    }

    // For SAT beginner/intermediate/expert, require SAT materials
    if (examType === 'sat' && selectedDifficulty !== 'full_sat' && !hasSatMaterials) {
      toast({ 
        variant: 'destructive', 
        title: 'No SAT materials saved', 
        description: 'Go to SAT Practice tab first and study some materials before taking Beginner/Intermediate/Expert exams.' 
      });
      return;
    }

    setIsLoading(true);

    const subject = examType === 'subjects' 
      ? subjects.find(s => s.id === selectedSubject)?.name 
      : 'SAT';
    
    let prompt: string;
    
    if (examType === 'subjects' && hasSavedMaterials) {
      prompt = `Based ONLY on the following study materials, generate ${count} ${subject} exam questions for ${selectedGrade} students.

STUDY MATERIALS TO BASE QUESTIONS ON:
${materialContext}

Difficulty: ${selectedDifficulty}

IMPORTANT RULES:
1. Questions MUST be based ONLY on the content in the study materials above
2. Do NOT include any topics or concepts not covered in the materials
3. Include questions about definitions, formulas, concepts, and examples from the materials

ABSOLUTE MATH RENDERING SPECIFICATION (LaTeX Only):
- All math must use LaTeX notation exclusively
- Inline math: \\( expression \\)
- Display math: $$ expression $$
- Use \\frac{a}{b} for fractions, \\sqrt{x} for roots, x^{n} for exponents
- Use \\sin, \\cos, \\tan, \\log, \\ln for functions
- Use \\leq, \\geq, \\neq for comparisons
- Use \\cdot for multiplication
- Never use plaintext math like sqrt, ^, or /

Return ONLY valid JSON array:
[
  {
    "question": "Question text with LaTeX if needed",
    "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
    "correctIndex": 0,
    "explanation": "Step-by-step explanation with LaTeX for math"
  }
]`;
    } else if (examType === 'sat' && selectedDifficulty !== 'full_sat') {
      // SAT Beginner/Intermediate/Expert - uses saved SAT materials
      const difficultyDesc = selectedDifficulty === 'beginner' ? 'easier, foundational' :
                            selectedDifficulty === 'intermediate' ? 'medium difficulty' : 'challenging, advanced';
      
      prompt = `Based ONLY on the following saved SAT study materials, generate ${count} SAT-style exam questions.

SAVED SAT MATERIALS:
${satMaterialContext}

Difficulty Level: ${selectedDifficulty} (${difficultyDesc} questions)

RULES:
1. Questions MUST be based on the saved materials above
2. Include both Math and English/Reading questions proportionally
3. ${selectedDifficulty === 'beginner' ? 'Focus on basic concepts and straightforward applications' : 
     selectedDifficulty === 'intermediate' ? 'Include moderate complexity with some multi-step problems' :
     'Include challenging multi-step problems requiring deep understanding'}

ABSOLUTE MATH RENDERING SPECIFICATION (LaTeX Only):
- All math must use LaTeX notation exclusively
- Inline math: \\( expression \\)
- Display math: $$ expression $$
- Fractions: \\frac{a}{b}, NOT a/b
- Roots: \\sqrt{x}, \\sqrt[n]{x}
- Exponents: x^{n}, x^{2}
- Functions: \\sin(x), \\cos(x), \\tan(x), \\log(x), \\ln(x)
- Comparisons: \\leq, \\geq, \\neq
- Multiplication: \\cdot
- Summation: \\sum_{i=1}^{n}
- Integrals: \\int_{a}^{b}

Return ONLY valid JSON array:
[
  {
    "question": "Question text with LaTeX",
    "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
    "correctIndex": 0,
    "explanation": "Step-by-step explanation with LaTeX"
  }
]`;
    } else {
      // Full SAT Exam - covers ALL topics comprehensively
      prompt = `Generate a comprehensive Full SAT Practice Exam with ${count} questions covering ALL official SAT topics.

STRUCTURE (distribute questions proportionally):
- Reading & Writing: ~50% of questions
- Math (No Calculator + Calculator): ~50% of questions

===== SAT MATH TOPICS (Must Include All) =====

1. HEART OF ALGEBRA:
- Linear equations in one variable
- Linear inequalities in one variable
- Systems of linear equations (substitution, elimination)
- Word problems using linear equations or systems
- Linear functions: slope, intercepts, function notation, rate of change
- Absolute value equations: \\( |x - a| = b \\)
- Interpreting linear graphs and tables

2. PROBLEM SOLVING AND DATA ANALYSIS:
- Ratios, rates, proportions
- Percentages, percent change, discount, tax, interest
- Unit conversions (metric ↔ customary)
- Mean, median, mode, range, weighted averages
- Probability: simple, independent/dependent events
- Combinations and permutations
- Data interpretation: tables, bar graphs, line graphs, scatterplots
- Trend analysis, slope interpretation

3. PASSPORT TO ADVANCED MATH:
- Quadratic equations: factoring, quadratic formula \\( x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\)
- Graphing quadratics: vertex, intercepts, axis of symmetry
- Nonlinear equations: cubic, radical
- Functions: evaluation, composition, inverse, domain/range
- Factoring, simplifying, expanding expressions
- Rational expressions and equations
- Exponents: \\( x^{-n} = \\frac{1}{x^n} \\), \\( x^{\\frac{m}{n}} = \\sqrt[n]{x^m} \\)

4. ADDITIONAL TOPICS IN MATH:
- Geometry: lines, angles, triangles, circles, polygons, area, volume
- Right triangle trigonometry: \\( \\sin\\theta, \\cos\\theta, \\tan\\theta \\)
- Coordinate geometry: distance \\( d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2} \\), midpoint, slope
- Complex numbers: \\( i^2 = -1 \\), operations, conjugates
- Arithmetic and geometric sequences

===== SAT ENGLISH TOPICS (Must Include All) =====

1. READING COMPREHENSION:
- Words in context
- Main idea, theme, purpose
- Supporting details and evidence
- Inference questions
- Command of Evidence
- Charts/Graphs in passages

2. WRITING AND LANGUAGE:
- Sentence structure, punctuation, grammar
- Subject-verb agreement, pronoun agreement, verb tense
- Sentence revision: clarity, conciseness
- Paragraph revision: flow, transitions, organization
- Tone, style, improving passages
- Expression of ideas

ABSOLUTE MATH RENDERING SPECIFICATION:
- ALL math in LaTeX only
- Inline: \\( expression \\)
- Display: $$ expression $$
- Fractions: \\frac{numerator}{denominator}
- Square root: \\sqrt{x}, nth root: \\sqrt[n]{x}
- Exponents: x^{n}
- Trigonometry: \\sin, \\cos, \\tan
- Logarithms: \\log, \\ln
- Inequalities: \\leq, \\geq, \\neq
- Summation: \\sum_{i=1}^{n}
- Absolute value: |x|

Return ONLY valid JSON array with questions from ALL topics above:
[
  {
    "question": "Question with proper LaTeX for all math",
    "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
    "correctIndex": 0,
    "explanation": "Detailed step-by-step solution with LaTeX"
  }
]`;
    }

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
  }, [examType, selectedSubject, selectedGrade, selectedDifficulty, hasSavedMaterials, materialContext, hasSatMaterials, satMaterialContext, toast]);

  const handleExamTypeSelect = (type: ExamType) => {
    setExamType(type);
    setViewState(type === 'subjects' ? 'subjects' : 'config');
  };

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setViewState('grade');
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
    setViewState('config');
  };

  const handleStartExam = (difficultyId: string) => {
    setSelectedDifficulty(difficultyId);
    
    // Check SAT materials for non-full SAT exams
    if (examType === 'sat' && difficultyId !== 'full_sat' && !hasSatMaterials) {
      toast({ 
        variant: 'destructive', 
        title: 'No SAT materials saved', 
        description: 'Go to SAT Practice tab first and study some materials before taking Beginner/Intermediate/Expert exams.' 
      });
      return;
    }
    
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
              <MathRenderer content={currentQ.question} className="text-sm font-medium leading-relaxed" />
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
                    <MathRenderer content={option} className="flex-1" />
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
                    <MathRenderer content={currentQ.explanation} className="text-xs text-muted-foreground mt-0.5" />
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

  // CONFIG VIEW - Select difficulty and start exam
  if (viewState === 'config') {
    const difficulties = examType === 'subjects' ? subjectDifficulties : satDifficulties;
    const subject = examType === 'subjects' ? subjects.find(s => s.id === selectedSubject) : null;

    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState(examType === 'subjects' ? 'grade' : 'type')}>
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
            {selectedGrade && (
              <p className="text-sm text-muted-foreground">{selectedGrade}</p>
            )}
          </div>

          {/* Show saved materials info for subjects */}
          {examType === 'subjects' && (
            <div className={cn(
              "glass-effect rounded-2xl p-4 mb-4 animate-fade-in",
              !hasSavedMaterials && "border-amber-500/50"
            )}>
              {hasSavedMaterials ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Ready to create exam</p>
                    <p className="text-xs text-muted-foreground">
                      {savedMaterials.length} material(s) available: {savedMaterials.map(m => m.topic).join(', ')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-amber-500">No saved material available</p>
                    <p className="text-xs text-muted-foreground">
                      Go to Subjects tab first and study some materials before taking an exam.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Show SAT materials info for SAT exams */}
          {examType === 'sat' && (
            <div className={cn(
              "glass-effect rounded-2xl p-4 mb-4 animate-fade-in",
              !hasSatMaterials && "border-amber-500/50"
            )}>
              {hasSatMaterials ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">SAT materials available</p>
                    <p className="text-xs text-muted-foreground">
                      {satMaterials.length} SAT material(s) saved. Beginner/Intermediate/Expert use these materials.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-amber-500">No SAT materials saved</p>
                    <p className="text-xs text-muted-foreground">
                      Beginner/Intermediate/Expert require saved SAT materials. Full SAT covers all topics.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-3 text-center">Select Difficulty</h3>
            <div className="space-y-2 overflow-y-auto max-h-[50vh]">
              {difficulties.map((diff) => {
                const isDisabled = (examType === 'subjects' && !hasSavedMaterials) ||
                                   (examType === 'sat' && diff.id !== 'full_sat' && !hasSatMaterials);
                return (
                  <button
                    key={diff.id}
                    onClick={() => handleStartExam(diff.id)}
                    disabled={isDisabled}
                    className={cn(
                      "w-full p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all flex items-center gap-3",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br text-white text-sm font-bold",
                      diff.color
                    )}>
                      {diff.questions}
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-medium text-sm">{diff.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {diff.questions} questions
                        {'description' in diff && ` - ${diff.description}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // GRADE VIEW - Select grade for subjects
  if (viewState === 'grade' && examType === 'subjects') {
    const subject = subjects.find(s => s.id === selectedSubject);
    
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState('subjects')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-primary to-accent">
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name} Exam</h1>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">Select Your Grade Level</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => {
                const materialCount = getMaterialsBySubjectAndGrade(selectedSubject!, grade).length;
                return (
                  <button
                    key={grade}
                    onClick={() => handleGradeSelect(grade)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary flex flex-col items-center gap-1"
                  >
                    <span>{grade}</span>
                    {materialCount > 0 ? (
                      <span className="text-[10px] text-emerald-500">{materialCount} materials</span>
                    ) : (
                      <span className="text-[10px] text-amber-500">no materials</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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

          <div className="grid grid-cols-2 gap-3 overflow-y-auto">
            {subjects.map((subj, index) => {
              const materialCount = getMaterialsBySubject(subj.id).length;
              return (
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
                  <div>
                    <span className="font-medium text-sm block">{subj.name}</span>
                    {materialCount > 0 ? (
                      <span className="text-[10px] text-emerald-500">{materialCount} materials saved</span>
                    ) : (
                      <span className="text-[10px] text-amber-500">no materials yet</span>
                    )}
                  </div>
                </button>
              );
            })}
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
            <Trophy className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Examination</h1>
          <p className="text-muted-foreground text-sm">Choose your exam type</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleExamTypeSelect('subjects')}
            className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-xl">
              📚
            </div>
            <div>
              <h3 className="font-semibold">Subject Exams</h3>
              <p className="text-xs text-muted-foreground">
                Biology, Physics, Chemistry, Math, English, Social Studies, Technology
              </p>
              <p className="text-xs text-primary mt-1">Beginner: 10 | Intermediate: 20 | Expert: 30 questions</p>
            </div>
          </button>

          <button
            onClick={() => handleExamTypeSelect('sat')}
            className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl">
              📝
            </div>
            <div>
              <h3 className="font-semibold">SAT Exam</h3>
              <p className="text-xs text-muted-foreground">
                College admission standardized test
              </p>
              <p className="text-xs text-primary mt-1">Beginner: 20 | Intermediate: 50 | Expert: 65 | Full SAT: 140 questions</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
