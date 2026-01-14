import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trophy, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMaterials } from '@/hooks/useMaterials';
import { MathRenderer } from '@/components/MathRenderer';
import { useAuth } from '@/hooks/useAuth';

// ============================================
// ENUMS (IMMUTABLE)
// ============================================

enum ExamMenuType {
  SUBJECT = "SUBJECT",
  SAT = "SAT"
}

enum SubjectType {
  BIOLOGY = "BIOLOGY",
  TECHNOLOGY = "TECHNOLOGY",
  ENGLISH = "ENGLISH",
  MATHEMATICS = "MATHEMATICS",
  CHEMISTRY = "CHEMISTRY",
  PHYSICS = "PHYSICS",
  ARABIC = "ARABIC"
}

enum SubjectDifficulty {
  SUBJECT_BEGINNER = "SUBJECT_BEGINNER",
  SUBJECT_INTERMEDIATE = "SUBJECT_INTERMEDIATE",
  SUBJECT_EXPERT = "SUBJECT_EXPERT"
}

enum SATDifficulty {
  SAT_BEGINNER = "SAT_BEGINNER",
  SAT_INTERMEDIATE = "SAT_INTERMEDIATE",
  SAT_EXPERT = "SAT_EXPERT",
  SAT_FULL = "SAT_FULL"
}

// ============================================
// QUESTION COUNT MAPS (HARD CODED)
// ============================================

const SUBJECT_DIFFICULTY_COUNTS: Record<SubjectDifficulty, number> = {
  [SubjectDifficulty.SUBJECT_BEGINNER]: 10,
  [SubjectDifficulty.SUBJECT_INTERMEDIATE]: 20,
  [SubjectDifficulty.SUBJECT_EXPERT]: 30
};

const SAT_DIFFICULTY_COUNTS: Record<SATDifficulty, number> = {
  [SATDifficulty.SAT_BEGINNER]: 20,
  [SATDifficulty.SAT_INTERMEDIATE]: 30,
  [SATDifficulty.SAT_EXPERT]: 60,
  [SATDifficulty.SAT_FULL]: 140
};

// ============================================
// RESOLUTION FUNCTION (FAIL-CLOSED)
// ============================================

function resolveQuestionCount(menu: ExamMenuType, difficulty: string): number {
  if (menu === ExamMenuType.SUBJECT) {
    if (!(difficulty in SUBJECT_DIFFICULTY_COUNTS)) {
      throw new Error(`Invalid subject difficulty: ${difficulty}`);
    }
    return SUBJECT_DIFFICULTY_COUNTS[difficulty as SubjectDifficulty];
  }
  
  if (!(difficulty in SAT_DIFFICULTY_COUNTS)) {
    throw new Error(`Invalid SAT difficulty: ${difficulty}`);
  }
  return SAT_DIFFICULTY_COUNTS[difficulty as SATDifficulty];
}

// ============================================
// JSON SCHEMA TYPES
// ============================================

interface QuestionJSON {
  id: number;
  type: "multiple_choice";
  question: string;
  options: [string, string, string, string];
  correct_answer: string;
}

interface ExamJSON {
  exam_title: string;
  grade_level: string;
  subject: string;
  total_questions: number;
  questions: QuestionJSON[];
}

// ============================================
// VALIDATION (STRICT)
// ============================================

function validateQuestion(q: unknown, index: number): q is QuestionJSON {
  if (!q || typeof q !== 'object') return false;
  const question = q as Record<string, unknown>;
  
  if (typeof question.id !== 'number' || question.id !== index + 1) return false;
  if (question.type !== 'multiple_choice') return false;
  if (typeof question.question !== 'string' || question.question.length === 0) return false;
  if (!Array.isArray(question.options) || question.options.length !== 4) return false;
  if (!question.options.every((o: unknown) => typeof o === 'string' && o.length > 0)) return false;
  if (typeof question.correct_answer !== 'string' || !question.options.includes(question.correct_answer)) return false;
  
  return true;
}

function validateExamJSON(data: unknown): ExamJSON | null {
  if (!data || typeof data !== 'object') return null;
  const exam = data as Record<string, unknown>;
  
  if (typeof exam.exam_title !== 'string' || exam.exam_title.length === 0) return null;
  if (typeof exam.grade_level !== 'string' || exam.grade_level.length === 0) return null;
  if (typeof exam.subject !== 'string' || exam.subject.length === 0) return null;
  if (typeof exam.total_questions !== 'number' || exam.total_questions <= 0) return null;
  if (!Array.isArray(exam.questions)) return null;
  if (exam.total_questions !== exam.questions.length) return null;
  
  for (let i = 0; i < exam.questions.length; i++) {
    if (!validateQuestion(exam.questions[i], i)) return null;
  }
  
  return exam as unknown as ExamJSON;
}

// Legacy format conversion for backward compatibility
function convertLegacyFormat(questions: unknown[]): ExamJSON | null {
  try {
    const converted: QuestionJSON[] = questions.map((q: unknown, index: number) => {
      const legacy = q as Record<string, unknown>;
      const options = legacy.options as string[];
      const correctIndex = legacy.correctIndex as number;
      
      return {
        id: index + 1,
        type: "multiple_choice" as const,
        question: legacy.question as string,
        options: options as [string, string, string, string],
        correct_answer: options[correctIndex]
      };
    });
    
    return {
      exam_title: "Generated Exam",
      grade_level: "Various",
      subject: "Mixed",
      total_questions: converted.length,
      questions: converted
    };
  } catch {
    return null;
  }
}

// ============================================
// EXAM STATE (IMMUTABLE SHAPE)
// ============================================

interface ExamState {
  exam: ExamJSON;
  currentQuestionId: number;
  answered: boolean;
  completed: boolean;
  selectedAnswer: string | null;
  answers: Record<number, string>;
}

function createInitialExamState(exam: ExamJSON): ExamState {
  return {
    exam,
    currentQuestionId: 1,
    answered: false,
    completed: false,
    selectedAnswer: null,
    answers: {}
  };
}

// ============================================
// RENDER GUARD
// ============================================

function getCurrentQuestion(state: ExamState): QuestionJSON | null {
  if (state.currentQuestionId < 1 || state.currentQuestionId > state.exam.total_questions) {
    return null;
  }
  return state.exam.questions.find(q => q.id === state.currentQuestionId) || null;
}

// ============================================
// NEXT QUESTION BUTTON LOGIC (MANDATORY)
// ============================================

function shouldRenderNextButton(state: ExamState): boolean {
  return state.answered && !state.completed;
}

function onNextQuestion(state: ExamState): ExamState {
  if (state.currentQuestionId === state.exam.total_questions) {
    return { ...state, completed: true };
  }
  return {
    ...state,
    currentQuestionId: state.currentQuestionId + 1,
    answered: false,
    selectedAnswer: null
  };
}

// ============================================
// SUBJECT & DIFFICULTY DEFINITIONS
// ============================================

const subjects = [
  { id: SubjectType.BIOLOGY, name: 'Biology', emoji: '🧬' },
  { id: SubjectType.TECHNOLOGY, name: 'Technology', emoji: '💻' },
  { id: SubjectType.ENGLISH, name: 'English', emoji: '📚' },
  { id: SubjectType.MATHEMATICS, name: 'Mathematics', emoji: '📐' },
  { id: SubjectType.CHEMISTRY, name: 'Chemistry', emoji: '🧪' },
  { id: SubjectType.PHYSICS, name: 'Physics', emoji: '⚛️' },
  { id: SubjectType.ARABIC, name: 'اللغة العربية', emoji: '🕌' },
];

const subjectIdMap: Record<SubjectType, string> = {
  [SubjectType.BIOLOGY]: 'biology',
  [SubjectType.TECHNOLOGY]: 'technology',
  [SubjectType.ENGLISH]: 'english',
  [SubjectType.MATHEMATICS]: 'mathematics',
  [SubjectType.CHEMISTRY]: 'chemistry',
  [SubjectType.PHYSICS]: 'physics',
  [SubjectType.ARABIC]: 'arabic',
};

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const subjectDifficulties = [
  { id: SubjectDifficulty.SUBJECT_BEGINNER, name: 'Beginner', questions: 10, color: 'from-emerald-500 to-teal-500' },
  { id: SubjectDifficulty.SUBJECT_INTERMEDIATE, name: 'Intermediate', questions: 20, color: 'from-amber-500 to-orange-500' },
  { id: SubjectDifficulty.SUBJECT_EXPERT, name: 'Expert', questions: 30, color: 'from-rose-500 to-pink-500' },
];

const satDifficulties = [
  { id: SATDifficulty.SAT_BEGINNER, name: 'Beginner', questions: 20, color: 'from-emerald-500 to-teal-500' },
  { id: SATDifficulty.SAT_INTERMEDIATE, name: 'Intermediate', questions: 30, color: 'from-amber-500 to-orange-500' },
  { id: SATDifficulty.SAT_EXPERT, name: 'Expert', questions: 60, color: 'from-rose-500 to-pink-500' },
  { id: SATDifficulty.SAT_FULL, name: 'Full SAT Exam', questions: 140, color: 'from-violet-500 to-purple-600', 
    description: 'Reading/Writing: 70 + Math: 70 questions' },
];

type ViewState = 'type' | 'subjects' | 'grade' | 'config' | 'exam' | 'results';

export function ExaminationSection() {
  const [viewState, setViewState] = useState<ViewState>('type');
  const [examMenuType, setExamMenuType] = useState<ExamMenuType | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectType | null>(null);
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
    const subjectId = subjectIdMap[selectedSubject];
    if (selectedGrade) {
      return getMaterialsBySubjectAndGrade(subjectId, selectedGrade);
    }
    return getMaterialsBySubject(subjectId);
  }, [selectedSubject, selectedGrade, getMaterialsBySubjectAndGrade, getMaterialsBySubject]);

  const hasSavedMaterials = savedMaterials.length > 0;

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

  const generateQuestions = useCallback(async (count: number, difficulty: string) => {
    // For subject exams, require saved materials
    if (!hasSavedMaterials && examMenuType === ExamMenuType.SUBJECT) {
      toast({ 
        variant: 'destructive', 
        title: 'No saved materials', 
        description: 'You need to study some materials first before taking an exam.' 
      });
      return;
    }

    // For SAT beginner/intermediate/expert, require SAT materials
    if (examMenuType === ExamMenuType.SAT && difficulty !== SATDifficulty.SAT_FULL && !hasSatMaterials) {
      toast({ 
        variant: 'destructive', 
        title: 'No SAT materials saved', 
        description: 'Go to SAT Practice tab first and study some materials before taking Beginner/Intermediate/Expert exams.' 
      });
      return;
    }

    setIsLoading(true);

    const subjectName = examMenuType === ExamMenuType.SUBJECT && selectedSubject
      ? subjects.find(s => s.id === selectedSubject)?.name 
      : 'SAT';
    
    let prompt: string;
    
    if (examMenuType === ExamMenuType.SUBJECT && hasSavedMaterials) {
      prompt = `Based ONLY on the following study materials, generate EXACTLY ${count} ${subjectName} exam questions for ${selectedGrade} students.

STUDY MATERIALS TO BASE QUESTIONS ON:
${materialContext}

Difficulty: ${difficulty}

IMPORTANT RULES:
1. Questions MUST be based ONLY on the content in the study materials above
2. Do NOT include any topics or concepts not covered in the materials
3. CONTENT CONSTRAINT: ${subjectName} topics ONLY - no other subjects

ABSOLUTE MATH RENDERING SPECIFICATION (LaTeX Only):
- All math must use LaTeX notation exclusively
- Inline math: \\( expression \\)
- Display math: $$ expression $$

You MUST return a valid JSON object with this EXACT structure:
{
  "exam_title": "${subjectName} ${difficulty.replace('SUBJECT_', '')} Exam",
  "grade_level": "${selectedGrade}",
  "subject": "${subjectName}",
  "total_questions": ${count},
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text with LaTeX if needed",
      "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
      "correct_answer": "A) Option"
    }
  ]
}

CRITICAL RULES:
- IDs must be sequential starting at 1
- Exactly 4 options per question
- correct_answer MUST match one of the options exactly
- total_questions MUST equal ${count}
- questions array MUST have exactly ${count} items`;
    } else if (examMenuType === ExamMenuType.SAT && difficulty !== SATDifficulty.SAT_FULL) {
      const difficultyDesc = difficulty === SATDifficulty.SAT_BEGINNER ? 'easier, foundational' :
                            difficulty === SATDifficulty.SAT_INTERMEDIATE ? 'medium difficulty' : 'challenging, advanced';
      
      prompt = `Based ONLY on the following saved SAT study materials, generate EXACTLY ${count} SAT-style exam questions.

SAVED SAT MATERIALS:
${satMaterialContext}

Difficulty Level: ${difficulty} (${difficultyDesc} questions)

ABSOLUTE MATH RENDERING SPECIFICATION (LaTeX Only):
- All math must use LaTeX notation exclusively
- Inline math: \\( expression \\)
- Display math: $$ expression $$

You MUST return a valid JSON object with this EXACT structure:
{
  "exam_title": "SAT ${difficulty.replace('SAT_', '')} Exam",
  "grade_level": "High School",
  "subject": "SAT",
  "total_questions": ${count},
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text",
      "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
      "correct_answer": "A) Option"
    }
  ]
}

CRITICAL RULES:
- IDs must be sequential starting at 1
- Exactly 4 options per question
- correct_answer MUST match one of the options exactly
- total_questions MUST equal ${count}
- questions array MUST have exactly ${count} items`;
    } else {
      // Full SAT Exam - covers ALL topics comprehensively
      prompt = `Generate a comprehensive Full SAT Practice Exam with EXACTLY ${count} questions covering ALL official SAT topics.

STRUCTURE:
- Reading & Writing: ~70 questions
- Math: ~70 questions

===== SAT MATH TOPICS (Must Include All) =====

1. HEART OF ALGEBRA:
- Linear equations, inequalities, systems
- Linear functions, slope, intercepts

2. PROBLEM SOLVING AND DATA ANALYSIS:
- Ratios, rates, percentages
- Statistics: mean, median, mode
- Probability, data interpretation

3. PASSPORT TO ADVANCED MATH:
- Quadratic equations: \\( x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\)
- Functions, rational expressions, exponents

4. ADDITIONAL TOPICS:
- Geometry, trigonometry
- Complex numbers: \\( i^2 = -1 \\)

===== SAT ENGLISH TOPICS =====

1. READING: Words in context, main idea, evidence
2. WRITING: Grammar, sentence structure, transitions

You MUST return a valid JSON object with this EXACT structure:
{
  "exam_title": "Full SAT Exam",
  "grade_level": "High School",
  "subject": "SAT",
  "total_questions": ${count},
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text",
      "options": ["A) Option", "B) Option", "C) Option", "D) Option"],
      "correct_answer": "A) Option"
    }
  ]
}

CRITICAL RULES:
- IDs must be sequential starting at 1 through ${count}
- Exactly 4 options per question
- correct_answer MUST match one of the options exactly
- total_questions MUST equal ${count}
- questions array MUST have exactly ${count} items`;
    }

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; },
        onDone: () => {
          try {
            // Try to parse as new JSON format
            let jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const validatedExam = validateExamJSON(parsed);
              if (validatedExam) {
                setExamState(createInitialExamState(validatedExam));
                setViewState('exam');
                setIsLoading(false);
                return;
              }
            }
            
            // Fallback: try legacy array format
            const arrayMatch = response.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
              const questions = JSON.parse(arrayMatch[0]);
              const converted = convertLegacyFormat(questions);
              if (converted) {
                setExamState(createInitialExamState(converted));
                setViewState('exam');
                setIsLoading(false);
                return;
              }
            }
            
            toast({ variant: 'destructive', title: 'Error', description: 'Invalid exam format received' });
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
  }, [examMenuType, selectedSubject, selectedGrade, hasSavedMaterials, materialContext, hasSatMaterials, satMaterialContext, toast]);

  const handleExamTypeSelect = (type: ExamMenuType) => {
    setExamMenuType(type);
    setViewState(type === ExamMenuType.SUBJECT ? 'subjects' : 'config');
  };

  const handleSubjectClick = (subjectId: SubjectType) => {
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
    if (examMenuType === ExamMenuType.SAT && difficultyId !== SATDifficulty.SAT_FULL && !hasSatMaterials) {
      toast({ 
        variant: 'destructive', 
        title: 'No SAT materials saved', 
        description: 'Go to SAT Practice tab first and study some materials before taking Beginner/Intermediate/Expert exams.' 
      });
      return;
    }
    
    try {
      const count = resolveQuestionCount(examMenuType!, difficultyId);
      generateQuestions(count, difficultyId);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    }
  };

  const handleAnswer = (answer: string) => {
    if (!examState || examState.answered) return;
    setExamState(prev => {
      if (!prev) return prev;
      const newAnswers = { ...prev.answers, [prev.currentQuestionId]: answer };
      return { ...prev, answers: newAnswers, selectedAnswer: answer, answered: true };
    });
  };

  const handleNext = () => {
    if (!examState) return;
    setExamState(prev => {
      if (!prev) return prev;
      const nextState = onNextQuestion(prev);
      if (nextState.completed) {
        setViewState('results');
      }
      return nextState;
    });
  };

  const handleReset = () => {
    setViewState('type');
    setExamMenuType(null);
    setSelectedSubject(null);
    setSelectedGrade(null);
    setSelectedDifficulty(null);
    setExamState(null);
  };

  // Calculate results
  const calculateResults = () => {
    if (!examState) return { correct: 0, total: 0, percentage: 0 };
    let correct = 0;
    examState.exam.questions.forEach(q => {
      if (examState.answers[q.id] === q.correct_answer) {
        correct++;
      }
    });
    const total = examState.exam.total_questions;
    const percentage = Math.round((correct / total) * 100);
    return { correct, total, percentage };
  };

  // RESULTS VIEW
  if (viewState === 'results' && examState) {
    const { correct, total, percentage } = calculateResults();

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
    const currentQ = getCurrentQuestion(examState);
    
    // FAIL-CLOSED: If question not found, abort
    if (!currentQ) {
      return (
        <div className="flex-1 flex items-center justify-center p-4 pt-16 pb-20">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">Invalid question ID: {examState.currentQuestionId}</p>
            <Button onClick={handleReset}>Return to Menu</Button>
          </div>
        </div>
      );
    }

    const isCorrect = examState.selectedAnswer === currentQ.correct_answer;

    return (
      <div className="flex-1 flex flex-col overflow-hidden pt-14 pb-16">
        <div className="flex items-center justify-between p-3 border-b border-border/30">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <ArrowLeft size={14} className="mr-1" />
            Exit
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {examState.currentQuestionId}/{examState.exam.total_questions}
            </span>
            <div className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
              Score: {Object.entries(examState.answers).filter(([id, ans]) => {
                const q = examState.exam.questions.find(q => q.id === parseInt(id));
                return q && ans === q.correct_answer;
              }).length}
            </div>
          </div>
        </div>

        <div className="h-1 bg-secondary">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${(examState.currentQuestionId / examState.exam.total_questions) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="glass-effect rounded-2xl p-5 mb-5">
              <MathRenderer content={currentQ.question} className="text-sm font-medium leading-relaxed" />
            </div>

            <div className="space-y-2 mb-5">
              {currentQ.options.map((option, index) => {
                const isSelected = examState.selectedAnswer === option;
                const isCorrectOption = option === currentQ.correct_answer;
                const showCorrect = examState.answered && isCorrectOption;
                const showWrong = examState.answered && isSelected && !isCorrectOption;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswer(option)}
                    disabled={examState.answered}
                    className={cn(
                      "w-full p-3.5 rounded-xl text-left transition-all duration-200 border",
                      "flex items-center gap-3 text-sm",
                      !examState.answered && "hover:bg-secondary/50 hover:border-primary/50 bg-card/50 border-border/50",
                      showCorrect && "bg-emerald-500/20 border-emerald-500",
                      showWrong && "bg-destructive/20 border-destructive",
                      isSelected && !examState.answered && "border-primary bg-primary/10"
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

            {examState.answered && (
              <div className="glass-effect rounded-2xl p-4 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                    isCorrect 
                      ? "bg-emerald-500/20 text-emerald-500" 
                      : "bg-amber-500/20 text-amber-500"
                  )}>
                    {isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {isCorrect ? 'Correct!' : 'Not quite right'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The correct answer is: {currentQ.correct_answer}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* NEXT QUESTION BUTTON (MANDATORY) */}
        {shouldRenderNextButton(examState) && (
          <div className="p-3 border-t border-border/30">
            <div className="max-w-lg mx-auto flex justify-end">
              <Button size="sm" onClick={handleNext}>
                {examState.currentQuestionId >= examState.exam.total_questions ? 'See Results' : 'Next Question'}
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
    const difficulties = examMenuType === ExamMenuType.SUBJECT ? subjectDifficulties : satDifficulties;
    const subject = examMenuType === ExamMenuType.SUBJECT && selectedSubject
      ? subjects.find(s => s.id === selectedSubject) 
      : null;

    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState(examMenuType === ExamMenuType.SUBJECT ? 'grade' : 'type')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-primary to-accent">
              {examMenuType === ExamMenuType.SUBJECT ? subject?.emoji : '📝'}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {examMenuType === ExamMenuType.SUBJECT ? `${subject?.name} Exam` : 'SAT Exam'}
            </h1>
            {selectedGrade && (
              <p className="text-sm text-muted-foreground">{selectedGrade}</p>
            )}
          </div>

          {/* Show saved materials info for subjects */}
          {examMenuType === ExamMenuType.SUBJECT && (
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
          {examMenuType === ExamMenuType.SAT && (
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
                const isDisabled = (examMenuType === ExamMenuType.SUBJECT && !hasSavedMaterials) ||
                                   (examMenuType === ExamMenuType.SAT && diff.id !== SATDifficulty.SAT_FULL && !hasSatMaterials);
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
  if (viewState === 'grade' && examMenuType === ExamMenuType.SUBJECT && selectedSubject) {
    const subject = subjects.find(s => s.id === selectedSubject);
    const subjectId = subjectIdMap[selectedSubject];
    
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
                const materialCount = getMaterialsBySubjectAndGrade(subjectId, grade).length;
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
              const materialCount = getMaterialsBySubject(subjectIdMap[subj.id]).length;
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
            onClick={() => handleExamTypeSelect(ExamMenuType.SUBJECT)}
            className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-xl">
              📚
            </div>
            <div>
              <h3 className="font-semibold">Subject Exams</h3>
              <p className="text-xs text-muted-foreground">
                Biology, Technology, English, Mathematics, Chemistry, Physics
              </p>
              <p className="text-xs text-primary mt-1">Beginner: 10 | Intermediate: 20 | Expert: 30 questions</p>
            </div>
          </button>

          <button
            onClick={() => handleExamTypeSelect(ExamMenuType.SAT)}
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
              <p className="text-xs text-primary mt-1">Beginner: 20 | Intermediate: 30 | Expert: 60 | Full SAT: 140 questions</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
