import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Loader2, ChevronLeft, ChevronRight, RotateCcw, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MathRenderer } from '@/components/MathRenderer';
import { useMaterials } from '@/hooks/useMaterials';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';

const subjects = [
  { id: 'biology', emoji: '🧬' },
  { id: 'physics', emoji: '⚛️' },
  { id: 'chemistry', emoji: '🧪' },
  { id: 'mathematics', emoji: '📐' },
  { id: 'english', emoji: '📚' },
  { id: 'social_studies', emoji: '🌍' },
  { id: 'technology', emoji: '💻' },
  { id: 'arabic', emoji: '🕌' },
  { id: 'islamic_studies', emoji: '🕋' },
  { id: 'ksa_history', emoji: '🏛️' },
  { id: 'art_and_design', emoji: '🎨' },
  { id: 'entrepreneurship', emoji: '💼' },
  { id: 'sat_math', emoji: '🔢' },
  { id: 'sat_reading', emoji: '📖' },
  { id: 'sat_writing', emoji: '✍️' },
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
  const { language } = useThemeLanguage();
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

  const savedMaterials = useMemo(() => {
    if (!selectedSubject || !selectedGrade) return [];
    return getMaterialsBySubjectAndGrade(selectedSubject, selectedGrade);
  }, [selectedSubject, selectedGrade, getMaterialsBySubjectAndGrade]);

  const hasSavedMaterials = savedMaterials.length > 0;

  const generateFlashcards = useCallback(async (topic: string, fromMaterials: boolean = false) => {
    if (!selectedSubject || !selectedGrade) return;
    
    setIsLoading(true);
    setFlashcards([]);

    const subjectName = getSubjectName(selectedSubject, 'en');
    const isArabic = selectedSubject === 'arabic';
    
    let materialContext = '';
    if (fromMaterials && hasSavedMaterials) {
      materialContext = savedMaterials.map(m => `Topic: ${m.topic}\n${m.content}`).join('\n\n---\n\n');
    }
    
    const prompt = isArabic 
      ? `قم بإنشاء 10 بطاقات تعليمية للغة العربية لطلاب ${selectedGrade} عن "${topic}".\n\n${fromMaterials && materialContext ? `استخدم المواد التالية كمرجع:\n${materialContext}\n\n` : ''}أعد مصفوفة JSON فقط بدون أي نص آخر:\n[\n  {"front": "السؤال أو المصطلح", "back": "الإجابة أو التعريف"},\n  ...\n]\n\nيجب أن تكون البطاقات:\n- قصيرة ومختصرة\n- فكرة واحدة لكل بطاقة\n- تركز على المصطلحات والقواعد الأساسية\n- مناسبة لطلاب ${selectedGrade}`
      : `Generate 10 educational flashcards for ${subjectName} at ${selectedGrade} level about "${topic}".\n\n${fromMaterials && materialContext ? `BASE THE FLASHCARDS ON THESE SAVED MATERIALS:\n${materialContext}\n\n` : ''}Return ONLY valid JSON array, no other text:\n[\n  {"front": "Question or term", "back": "Answer or definition"},\n  ...\n]\n\nIMPORTANT: For ALL mathematical expressions, use LaTeX notation:\n- Inline: \\( expression \\) or $expression$\n- Display: \\[ expression \\] or $$expression$$\n\nFlashcards must:\n- Be short and concise\n- One idea per card\n- Focus on key terms, formulas, rules, and concepts\n- Be appropriate for ${selectedGrade} students`;

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

  const subjectName = selectedSubject ? getSubjectName(selectedSubject, language) : '';
  const subjectEmoji = subjects.find(s => s.id === selectedSubject)?.emoji;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{tr('generatingFlashcards', language)}</p>
        </div>
      </div>
    );
  }

  if (viewState === 'cards' && flashcards.length > 0) {
    const currentCard = flashcards[currentIndex];
    return (
      <div className="flex-1 h-[calc(100vh-120px)] flex flex-col items-center justify-center pt-16 pb-20 px-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={14} className="mr-1" />
              {tr('back', language)}
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {flashcards.length}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setViewState('input'); setFlashcards([]); setCurrentIndex(0); setTopicInput(''); }} className="text-xs">
              <RotateCcw size={14} className="mr-1" />
              {tr('new', language)}
            </Button>
          </div>

          <div onClick={() => setIsFlipped(!isFlipped)} className={cn("relative w-full aspect-[3/4] cursor-pointer perspective-1000", "transition-transform duration-500", isFlipped && "rotate-y-180")} style={{ transformStyle: 'preserve-3d' }}>
            <div className={cn("absolute inset-0 glass-effect rounded-2xl p-6 flex flex-col items-center justify-center text-center backface-hidden", "bg-gradient-to-br from-primary/5 to-accent/5 overflow-y-auto")}>
              <span className="text-xs text-primary mb-2">{tr('question', language)}</span>
              <MathRenderer content={currentCard?.front} className="text-lg font-medium" />
              <span className="text-xs text-muted-foreground mt-4">{tr('tapToFlip', language)}</span>
            </div>
            <div className={cn("absolute inset-0 glass-effect rounded-2xl p-6 flex flex-col items-center justify-center text-center overflow-y-auto", "bg-gradient-to-br from-accent/10 to-primary/10")} style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}>
              <span className="text-xs text-accent mb-2">{tr('answer', language)}</span>
              <MathRenderer content={currentCard?.back} className="text-lg font-medium" />
              <span className="text-xs text-muted-foreground mt-4">{tr('tapToFlipBack', language)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="ghost" size="icon" onClick={prevCard}><ChevronLeft size={20} /></Button>
            <Button variant="ghost" size="icon" onClick={nextCard}><ChevronRight size={20} /></Button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'materials' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">{subjectEmoji}</div>
            <h1 className="text-2xl font-bold mb-2">{subjectName} {tr('flashcards', language)}</h1>
            <p className="text-sm text-muted-foreground">{getGradeName(selectedGrade, language)}</p>
          </div>
          <div className="space-y-3 animate-fade-in">
            <button onClick={handleGenerateFromMaterials} className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white"><Sparkles size={24} /></div>
              <div>
                <h3 className="font-semibold">{tr('fromSavedMaterials', language)}</h3>
                <p className="text-xs text-muted-foreground">{tr('fromSavedMaterialsDesc', language).replace('your saved material(s)', `${savedMaterials.length} ${tr('saved', language)}`)}</p>
              </div>
            </button>
            <button onClick={() => setViewState('input')} className="w-full glass-effect rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white"><BookOpen size={24} /></div>
              <div>
                <h3 className="font-semibold">{tr('customTopic', language)}</h3>
                <p className="text-xs text-muted-foreground">{tr('customTopicDesc', language)}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">{subjectEmoji}</div>
            <h1 className="text-2xl font-bold mb-2">{subjectName} {tr('flashcards', language)}</h1>
            <p className="text-sm text-muted-foreground">{getGradeName(selectedGrade, language)}</p>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">{tr('flashcardTopic', language)}</h3>
            <input type="text" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleTopicSubmit()} placeholder={tr('flashcardPlaceholder', language)} className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4" autoFocus />
            <Button size="sm" onClick={handleTopicSubmit} disabled={!topicInput.trim()} className="w-full gap-2">
              {tr('generateFlashcards', language)}<ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'grade' && selectedSubject) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-amber-500 to-orange-600">{subjectEmoji}</div>
            <h1 className="text-2xl font-bold mb-2">{subjectName} {tr('flashcards', language)}</h1>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">{tr('selectGrade', language)}</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => (
                <button key={grade} onClick={() => handleGradeSelect(grade)} className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary">
                  {getGradeName(grade, language)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-amber-500 to-orange-600">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">{tr('flashcards', language)}</h1>
          <p className="text-muted-foreground text-sm">{tr('clickSubject', language)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-y-auto">
          {subjects.map((subj, index) => (
            <button key={subj.id} onClick={() => handleSubjectClick(subj.id)} className={cn("glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in", "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-3")} style={{ animationDelay: `${index * 30}ms` }}>
              <span className="text-xl">{subj.emoji}</span>
              <span className="font-medium text-sm">{getSubjectName(subj.id, language)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
