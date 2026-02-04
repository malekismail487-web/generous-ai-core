import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Loader2, ChevronLeft, ChevronRight, RotateCcw, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MathRenderer } from '@/components/MathRenderer';
import { useMaterials } from '@/hooks/useMaterials';

const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬' },
  { id: 'physics', name: 'Physics', emoji: '⚛️' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐' },
  { id: 'english', name: 'English', emoji: '📚' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍' },
  { id: 'technology', name: 'Technology', emoji: '💻' },
  { id: 'arabic', name: 'اللغة العربية', emoji: '🕌' },
  { id: 'sat_math', name: 'SAT Math', emoji: '🔢' },
  { id: 'sat_reading', name: 'SAT Reading', emoji: '📖' },
  { id: 'sat_writing', name: 'SAT Writing', emoji: '✍️' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

interface Flashcard {
  front: string;
  back: string;
}

type ViewState = 'subjects' | 'grade' | 'input' | 'cards' | 'materials';

export function FlashcardsSection() {
  const [viewState, setViewState] = useState<ViewState>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [useFromMaterials, setUseFromMaterials] = useState(false);
  const { toast } = useToast();
  const { getMaterialsBySubjectAndGrade } = useMaterials();

  // Get saved materials for selected subject and grade
  const savedMaterials = useMemo(() => {
    if (!selectedSubject || !selectedGrade) return [];
    return getMaterialsBySubjectAndGrade(selectedSubject, selectedGrade);
  }, [selectedSubject, selectedGrade, getMaterialsBySubjectAndGrade]);

  const hasSavedMaterials = savedMaterials.length > 0;

  const generateFlashcards = useCallback(async (topic: string, fromMaterials: boolean = false) => {
    if (!selectedSubject || !selectedGrade) return;
    
    setIsLoading(true);
    setFlashcards([]);

    const subject = subjects.find(s => s.id === selectedSubject);
    const isArabic = selectedSubject === 'arabic';
    
    let materialContext = '';
    if (fromMaterials && hasSavedMaterials) {
      materialContext = savedMaterials.map(m => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n');
    }
    
    const prompt = isArabic 
      ? `قم بإنشاء 10 بطاقات تعليمية للغة العربية لطلاب ${selectedGrade} عن "${topic}".

${fromMaterials && materialContext ? `استخدم المواد التالية كمرجع:\n${materialContext}\n\n` : ''}

أعد مصفوفة JSON فقط بدون أي نص آخر:
[
  {"front": "السؤال أو المصطلح", "back": "الإجابة أو التعريف"},
  ...
]

يجب أن تكون البطاقات:
- قصيرة ومختصرة
- فكرة واحدة لكل بطاقة
- تركز على المصطلحات والقواعد الأساسية
- مناسبة لطلاب ${selectedGrade}`
      : `Generate 10 educational flashcards for ${subject?.name} at ${selectedGrade} level about "${topic}".

${fromMaterials && materialContext ? `BASE THE FLASHCARDS ON THESE SAVED MATERIALS:\n${materialContext}\n\n` : ''}

Return ONLY valid JSON array, no other text:
[
  {"front": "Question or term", "back": "Answer or definition"},
  ...
]

IMPORTANT: For ALL mathematical expressions, use LaTeX notation:
- Inline: \\( expression \\) or $expression$
- Display: \\[ expression \\] or $$expression$$

Flashcards must:
- Be short and concise
- One idea per card
- Focus on key terms, formulas, rules, and concepts
- Be appropriate for ${selectedGrade} students`;

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
              const parsed = JSON.parse(jsonMatch[0]);
              setFlashcards(parsed);
              setViewState('cards');
            } else {
              throw new Error('No JSON found');
            }
          } catch {
            toast({ variant: 'destructive', title: 'Error parsing flashcards' });
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
  }, [selectedSubject, selectedGrade, hasSavedMaterials, savedMaterials, toast]);

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setSelectedGrade(null);
    setViewState('grade');
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
    // Check for saved materials
    const materials = getMaterialsBySubjectAndGrade(selectedSubject!, grade);
    if (materials.length > 0) {
      setViewState('materials');
    } else {
      setViewState('input');
    }
  };

  const handleTopicSubmit = () => {
    if (topicInput.trim() && selectedGrade) {
      generateFlashcards(topicInput.trim(), useFromMaterials);
    }
  };

  const handleGenerateFromMaterials = () => {
    if (hasSavedMaterials) {
      const topics = savedMaterials.map(m => m.topic).join(', ');
      generateFlashcards(topics, true);
    }
  };

  const handleBackToSubjects = () => {
    setViewState('subjects');
    setSelectedSubject(null);
    setSelectedGrade(null);
    setTopicInput('');
    setFlashcards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setUseFromMaterials(false);
  };

  const handleBackToGrades = () => {
    setSelectedGrade(null);
    setViewState('grade');
  };

  const nextCard = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % flashcards.length), 150);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length), 150);
  };

  const subject = subjects.find(s => s.id === selectedSubject);

  // LOADING VIEW
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Generating flashcards...</p>
        </div>
      </div>
    );
  }

  // CARDS VIEW
  if (viewState === 'cards' && flashcards.length > 0) {
    const currentCard = flashcards[currentIndex];

    return (
      <div className="flex-1 h-[calc(100vh-120px)] flex flex-col items-center justify-center pt-16 pb-20 px-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={14} className="mr-1" />
              Back
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {flashcards.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setViewState('input');
                setFlashcards([]);
                setCurrentIndex(0);
                setTopicInput('');
              }}
              className="text-xs"
            >
              <RotateCcw size={14} className="mr-1" />
              New
            </Button>
          </div>

          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className={cn(
              "relative w-full aspect-[3/4] cursor-pointer perspective-1000",
              "transition-transform duration-500",
              isFlipped && "rotate-y-180"
            )}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className={cn(
              "absolute inset-0 glass-effect rounded-2xl p-6 flex flex-col items-center justify-center text-center backface-hidden",
              "bg-gradient-to-br from-primary/5 to-accent/5 overflow-y-auto"
            )}>
              <span className="text-xs text-primary mb-2">Question</span>
              <MathRenderer content={currentCard?.front} className="text-lg font-medium" />
              <span className="text-xs text-muted-foreground mt-4">Tap to flip</span>
            </div>

            <div 
              className={cn(
                "absolute inset-0 glass-effect rounded-2xl p-6 flex flex-col items-center justify-center text-center overflow-y-auto",
                "bg-gradient-to-br from-accent/10 to-primary/10"
              )}
              style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
            >
              <span className="text-xs text-accent mb-2">Answer</span>
              <MathRenderer content={currentCard?.back} className="text-lg font-medium" />
              <span className="text-xs text-muted-foreground mt-4">Tap to flip back</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="ghost" size="icon" onClick={prevCard}>
              <ChevronLeft size={20} />
            </Button>
            <Button variant="ghost" size="icon" onClick={nextCard}>
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // MATERIALS VIEW - Choose to generate from saved materials
  if (viewState === 'materials' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name} Flashcards</h1>
            <p className="text-sm text-muted-foreground">{selectedGrade}</p>
          </div>

          <div className="space-y-3 animate-fade-in">
            {/* Generate from saved materials */}
            <button
              onClick={handleGenerateFromMaterials}
              className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="font-semibold">From Saved Materials</h3>
                <p className="text-xs text-muted-foreground">
                  Generate flashcards from your {savedMaterials.length} saved material(s)
                </p>
              </div>
            </button>

            {/* Custom topic */}
            <button
              onClick={() => setViewState('input')}
              className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="font-semibold">Custom Topic</h3>
                <p className="text-xs text-muted-foreground">
                  Enter a specific topic for flashcard generation
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // INPUT VIEW
  if (viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name} Flashcards</h1>
            <p className="text-sm text-muted-foreground">{selectedGrade}</p>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">
              What topic do you want flashcards for?
            </h3>
            
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTopicSubmit()}
              placeholder="e.g., Cell structure, Vocabulary, Chemical formulas..."
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              autoFocus
            />

            <Button
              size="sm"
              onClick={handleTopicSubmit}
              disabled={!topicInput.trim()}
              className="w-full gap-2"
            >
              Generate Flashcards
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // GRADE VIEW
  if (viewState === 'grade' && selectedSubject) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name} Flashcards</h1>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">Select Your Grade Level</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => (
                <button
                  key={grade}
                  onClick={() => handleGradeSelect(grade)}
                  className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary"
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SUBJECTS VIEW
  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-amber-500 to-orange-600">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Flashcards</h1>
          <p className="text-muted-foreground text-sm">Click a subject or SAT section</p>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto">
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
