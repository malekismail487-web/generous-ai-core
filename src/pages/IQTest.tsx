import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Brain, ChevronRight, Loader2, Trophy, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

// ================================================================
// 15 HARDCODED IQ TEST QUESTIONS
// Categories: processing_speed, logical_reasoning, pattern_recognition,
//             spatial_reasoning, verbal_reasoning, mathematical_ability,
//             abstract_thinking
// ================================================================

interface IQQuestion {
  id: number;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const IQ_QUESTIONS: IQQuestion[] = [
  // 1. Pattern Recognition
  {
    id: 1, category: 'pattern_recognition',
    question: 'What comes next in the sequence? 2, 6, 18, 54, __',
    options: ['108', '162', '148', '128'],
    correctIndex: 1,
    explanation: 'Each number is multiplied by 3: 2×3=6, 6×3=18, 18×3=54, 54×3=162',
  },
  // 2. Logical Reasoning
  {
    id: 2, category: 'logical_reasoning',
    question: 'All roses are flowers. Some flowers fade quickly. Which statement MUST be true?',
    options: [
      'All roses fade quickly',
      'Some roses fade quickly',
      'Some flowers are roses',
      'No roses fade quickly',
    ],
    correctIndex: 2,
    explanation: 'Since all roses are flowers, it must be true that some flowers are roses.',
  },
  // 3. Spatial Reasoning
  {
    id: 3, category: 'spatial_reasoning',
    question: 'If you fold a square piece of paper in half diagonally and cut a small circle from the folded corner, how many holes appear when unfolded?',
    options: ['1', '2', '4', '0'],
    correctIndex: 0,
    explanation: 'Cutting the folded corner creates one hole at the center of the original square.',
  },
  // 4. Mathematical Ability
  {
    id: 4, category: 'mathematical_ability',
    question: 'If 3x + 7 = 22, what is the value of 6x + 3?',
    options: ['30', '33', '27', '36'],
    correctIndex: 1,
    explanation: '3x + 7 = 22 → 3x = 15 → x = 5. Then 6(5) + 3 = 33.',
  },
  // 5. Verbal Reasoning
  {
    id: 5, category: 'verbal_reasoning',
    question: 'OCEAN is to WATER as DESERT is to __',
    options: ['Cactus', 'Sand', 'Heat', 'Dry'],
    correctIndex: 1,
    explanation: 'An ocean is primarily composed of water; a desert is primarily composed of sand.',
  },
  // 6. Abstract Thinking
  {
    id: 6, category: 'abstract_thinking',
    question: 'In a certain code, BRAIN is written as CSBJO. How is LOGIC written in that code?',
    options: ['MPHJD', 'KNFHB', 'MPIJD', 'KNGHC'],
    correctIndex: 0,
    explanation: 'Each letter is shifted forward by 1: L→M, O→P, G→H, I→J, C→D = MPHJD',
  },
  // 7. Processing Speed
  {
    id: 7, category: 'processing_speed',
    question: 'How many times does the digit 3 appear in numbers from 1 to 40?',
    options: ['4', '8', '12', '14'],
    correctIndex: 2,
    explanation: '3, 13, 23, 30, 31, 32, 33 (twice), 34, 35, 36, 37, 38, 39 → 3 appears 12 times.',
  },
  // 8. Pattern Recognition
  {
    id: 8, category: 'pattern_recognition',
    question: 'What number completes the pattern? 1, 1, 2, 3, 5, 8, 13, __',
    options: ['18', '20', '21', '16'],
    correctIndex: 2,
    explanation: 'Fibonacci sequence: each number is the sum of the two before it. 8 + 13 = 21.',
  },
  // 9. Logical Reasoning
  {
    id: 9, category: 'logical_reasoning',
    question: 'If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?',
    options: ['100 minutes', '5 minutes', '20 minutes', '1 minute'],
    correctIndex: 1,
    explanation: 'Each machine makes 1 widget in 5 minutes. 100 machines each making 1 widget = 5 minutes.',
  },
  // 10. Spatial Reasoning
  {
    id: 10, category: 'spatial_reasoning',
    question: 'A cube has 6 faces, 12 edges, and 8 vertices. If you cut one corner off a cube, how many faces does the new shape have?',
    options: ['6', '7', '8', '9'],
    correctIndex: 1,
    explanation: 'Cutting a corner removes part of 3 faces and creates 1 new triangular face: 6 - 0 + 1 = 7.',
  },
  // 11. Mathematical Ability
  {
    id: 11, category: 'mathematical_ability',
    question: 'A train travels 60 km in the first hour and 80 km in the second hour. What is the average speed for the entire journey?',
    options: ['70 km/h', '65 km/h', '75 km/h', '72 km/h'],
    correctIndex: 0,
    explanation: 'Total distance = 140 km. Total time = 2 hours. Average = 140 ÷ 2 = 70 km/h.',
  },
  // 12. Verbal Reasoning
  {
    id: 12, category: 'verbal_reasoning',
    question: 'Which word does NOT belong in the group? Apple, Banana, Carrot, Grape',
    options: ['Apple', 'Banana', 'Carrot', 'Grape'],
    correctIndex: 2,
    explanation: 'Carrot is a vegetable while the others are all fruits.',
  },
  // 13. Abstract Thinking
  {
    id: 13, category: 'abstract_thinking',
    question: 'If ★ means add 5 and ◆ means multiply by 2, what is ◆(★(3))?',
    options: ['11', '16', '13', '21'],
    correctIndex: 1,
    explanation: '★(3) = 3 + 5 = 8. ◆(8) = 8 × 2 = 16.',
  },
  // 14. Processing Speed
  {
    id: 14, category: 'processing_speed',
    question: 'Which of the following is the mirror image of "bqpd"?',
    options: ['dpqb', 'bpqd', 'dqpb', 'pdbq'],
    correctIndex: 2,
    explanation: 'A mirror image reverses the order and flips each letter: b↔d, q↔p → dqpb.',
  },
  // 15. Pattern Recognition + Abstract
  {
    id: 15, category: 'abstract_thinking',
    question: 'If A=1, B=2, C=3... what is the value of (Z - A) × (M - L)?',
    options: ['25', '26', '24', '50'],
    correctIndex: 0,
    explanation: 'Z=26, A=1, M=13, L=12. (26-1) × (13-12) = 25 × 1 = 25.',
  },
];

// Category display mapping
const categoryLabels: Record<string, string> = {
  processing_speed: 'Processing Speed',
  logical_reasoning: 'Logical Reasoning',
  pattern_recognition: 'Pattern Recognition',
  spatial_reasoning: 'Spatial Reasoning',
  verbal_reasoning: 'Verbal Reasoning',
  mathematical_ability: 'Mathematical Ability',
  abstract_thinking: 'Abstract Thinking',
};

// Calculate IQ estimate and scores from answers
function calculateResults(answers: Record<number, number>) {
  const categoryScores: Record<string, { correct: number; total: number }> = {};
  
  IQ_QUESTIONS.forEach(q => {
    if (!categoryScores[q.category]) {
      categoryScores[q.category] = { correct: 0, total: 0 };
    }
    categoryScores[q.category].total++;
    if (answers[q.id] === q.correctIndex) {
      categoryScores[q.category].correct++;
    }
  });

  const totalCorrect = Object.values(categoryScores).reduce((s, c) => s + c.correct, 0);
  const totalQuestions = IQ_QUESTIONS.length;
  const percentage = (totalCorrect / totalQuestions) * 100;

  // Map percentage to estimated IQ range (simplified)
  let estimatedIQ: number;
  let learningPace: string;
  if (percentage >= 93) { estimatedIQ = 140; learningPace = 'accelerated'; }
  else if (percentage >= 80) { estimatedIQ = 125; learningPace = 'fast'; }
  else if (percentage >= 60) { estimatedIQ = 110; learningPace = 'moderate'; }
  else if (percentage >= 40) { estimatedIQ = 100; learningPace = 'steady'; }
  else { estimatedIQ = 90; learningPace = 'gradual'; }

  const scoreForCategory = (cat: string) => {
    const c = categoryScores[cat];
    return c ? Math.round((c.correct / c.total) * 100) : 0;
  };

  return {
    score: totalCorrect,
    totalQuestions,
    percentage,
    estimatedIQ,
    learningPace,
    processing_speed_score: scoreForCategory('processing_speed'),
    logical_reasoning_score: scoreForCategory('logical_reasoning'),
    pattern_recognition_score: scoreForCategory('pattern_recognition'),
    spatial_reasoning_score: scoreForCategory('spatial_reasoning'),
    verbal_reasoning_score: scoreForCategory('verbal_reasoning'),
    mathematical_ability_score: scoreForCategory('mathematical_ability'),
    abstract_thinking_score: scoreForCategory('abstract_thinking'),
  };
}

export default function IQTest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useThemeLanguage();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const startTimeRef = useRef(Date.now());

  // Check if user already completed IQ test
  useEffect(() => {
    if (!user) return;
    supabase
      .from('iq_test_results')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          // Already completed - go to destination
          const dest = sessionStorage.getItem('iqTestReturn') || '/';
          sessionStorage.removeItem('iqTestReturn');
          navigate(dest, { replace: true });
        }
        setCheckingExisting(false);
      });
  }, [user, navigate]);

  const question = IQ_QUESTIONS[currentQ];
  const progress = ((currentQ + (answered ? 1 : 0)) / IQ_QUESTIONS.length) * 100;

  const handleSelect = (index: number) => {
    if (answered) return;
    setSelectedOption(index);
    setAnswered(true);
    setAnswers(prev => ({ ...prev, [question.id]: index }));
  };

  const handleNext = async () => {
    if (currentQ < IQ_QUESTIONS.length - 1) {
      setCurrentQ(prev => prev + 1);
      setSelectedOption(null);
      setAnswered(false);
    } else {
      // Last question - save results
      setCompleted(true);
      setSaving(true);
      
      const results = calculateResults(answers);
      
      try {
        await supabase.from('iq_test_results').insert({
          user_id: user!.id,
          score: results.score,
          total_questions: results.totalQuestions,
          answers_json: answers,
          processing_speed_score: results.processing_speed_score,
          logical_reasoning_score: results.logical_reasoning_score,
          pattern_recognition_score: results.pattern_recognition_score,
          spatial_reasoning_score: results.spatial_reasoning_score,
          verbal_reasoning_score: results.verbal_reasoning_score,
          mathematical_ability_score: results.mathematical_ability_score,
          abstract_thinking_score: results.abstract_thinking_score,
          estimated_iq: results.estimatedIQ,
          learning_pace: results.learningPace,
        });

        // Also log as activity
        await supabase.from('user_activity_log').insert({
          user_id: user!.id,
          activity_type: 'iq_test_completed',
          category: 'assessment',
          details_json: {
            score: results.score,
            estimated_iq: results.estimatedIQ,
            learning_pace: results.learningPace,
            time_taken_seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
          },
        });
      } catch (err) {
        console.error('Failed to save IQ results:', err);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleContinue = () => {
    const dest = sessionStorage.getItem('iqTestReturn') || '/';
    sessionStorage.removeItem('iqTestReturn');
    navigate(dest, { replace: true });
  };

  if (checkingExisting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // RESULTS SCREEN
  if (completed) {
    const results = calculateResults(answers);
    const categories = [
      { key: 'processing_speed', label: 'Processing Speed', score: results.processing_speed_score },
      { key: 'logical_reasoning', label: 'Logical Reasoning', score: results.logical_reasoning_score },
      { key: 'pattern_recognition', label: 'Pattern Recognition', score: results.pattern_recognition_score },
      { key: 'spatial_reasoning', label: 'Spatial Reasoning', score: results.spatial_reasoning_score },
      { key: 'verbal_reasoning', label: 'Verbal Reasoning', score: results.verbal_reasoning_score },
      { key: 'mathematical_ability', label: 'Mathematical Ability', score: results.mathematical_ability_score },
      { key: 'abstract_thinking', label: 'Abstract Thinking', score: results.abstract_thinking_score },
    ];

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent glow-effect">
              <Trophy className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">{t('Assessment Complete!', 'اكتمل التقييم!')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('Your cognitive baseline has been established', 'تم تحديد مستواك المعرفي الأساسي')}
            </p>
          </div>

          <div className="glass-effect rounded-2xl p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text">{results.score}/{results.totalQuestions}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('Learning Pace:', 'وتيرة التعلم:')} <span className="font-semibold text-foreground capitalize">{results.learningPace}</span>
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {categories.map(cat => (
                <div key={cat.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{cat.label}</span>
                    <span className="font-medium">{cat.score}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700"
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-effect rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {t(
                  'Study Bright AI will now personalize your learning experience based on these results. Content difficulty, pace, and teaching style will adapt to YOU.',
                  'سيقوم Study Bright AI الآن بتخصيص تجربة التعلم الخاصة بك بناءً على هذه النتائج.'
                )}
              </p>
            </div>
          </div>

          <Button onClick={handleContinue} className="w-full gap-2" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            {t('Continue to App', 'متابعة إلى التطبيق')}
          </Button>
        </div>
      </div>
    );
  }

  // QUESTION SCREEN
  const isCorrect = selectedOption === question.correctIndex;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold">{t('Cognitive Assessment', 'التقييم المعرفي')}</h1>
            <p className="text-[10px] text-muted-foreground">{categoryLabels[question.category]}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{currentQ + 1}/{IQ_QUESTIONS.length}</span>
      </header>

      {/* Progress bar */}
      <div className="px-4">
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col justify-center p-4">
        <div className="max-w-md mx-auto w-full space-y-5">
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <p className="text-sm font-medium leading-relaxed">{question.question}</p>
          </div>

          <div className="space-y-2">
            {question.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrectOption = index === question.correctIndex;
              const showCorrect = answered && isCorrectOption;
              const showWrong = answered && isSelected && !isCorrectOption;

              return (
                <button
                  key={index}
                  onClick={() => handleSelect(index)}
                  disabled={answered}
                  className={cn(
                    "w-full p-3.5 rounded-xl text-left transition-all duration-200 border flex items-center gap-3 text-sm",
                    !answered && "hover:bg-secondary/50 hover:border-primary/50 bg-card/50 border-border/50",
                    showCorrect && "bg-emerald-500/20 border-emerald-500",
                    showWrong && "bg-destructive/20 border-destructive",
                    isSelected && !answered && "border-primary bg-primary/10"
                  )}
                >
                  <span className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 bg-secondary text-secondary-foreground",
                    showCorrect && "bg-emerald-500 text-white",
                    showWrong && "bg-destructive text-white"
                  )}>
                    {showCorrect ? <CheckCircle2 size={14} /> : String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1">{option}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation after answer */}
          {answered && (
            <div className={cn(
              "rounded-xl p-3 text-xs animate-fade-in",
              isCorrect ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400"
            )}>
              <p className="font-medium mb-1">{isCorrect ? '✓ Correct!' : '✗ Not quite'}</p>
              <p>{question.explanation}</p>
            </div>
          )}
        </div>
      </div>

      {/* Next button */}
      {answered && (
        <div className="p-4 pb-8">
          <div className="max-w-md mx-auto">
            <Button onClick={handleNext} className="w-full gap-2">
              {currentQ < IQ_QUESTIONS.length - 1 ? t('Next Question', 'السؤال التالي') : t('See Results', 'عرض النتائج')}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
