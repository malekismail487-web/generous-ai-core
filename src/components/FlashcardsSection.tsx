import { useState, useCallback } from 'react';
import { Loader2, RotateCcw, ChevronLeft, ChevronRight, Sparkles, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

interface Flashcard {
  front: string;
  back: string;
}

export function FlashcardsSection() {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const generateFlashcards = useCallback(async () => {
    if (!selectedSubject || !selectedGrade) return;
    
    setIsLoading(true);
    setFlashcards([]);
    setCurrentIndex(0);
    setIsFlipped(false);

    const subject = subjects.find(s => s.id === selectedSubject);
    const prompt = `Generate 8 educational flashcards for ${subject?.name} at ${selectedGrade} level.

Return ONLY valid JSON array, no other text:
[
  {"front": "Question or term", "back": "Answer or definition"},
  ...
]

Make cards appropriate for ${selectedGrade} students. Focus on key terms, formulas, concepts, and rules.`;

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
  }, [selectedSubject, selectedGrade, toast]);

  const nextCard = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % flashcards.length), 150);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length), 150);
  };

  // Selection view
  if (flashcards.length === 0 && !isLoading) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-amber-500 to-orange-600">
              <BookOpen className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">Flashcards</h1>
            <p className="text-muted-foreground text-sm">Generate flashcards for any subject and grade</p>
          </div>

          <div className="space-y-4">
            <div className="glass-effect rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">Select Subject</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

            {selectedSubject && selectedGrade && (
              <Button onClick={generateFlashcards} className="w-full gap-2" size="sm">
                <Sparkles size={16} />
                Generate Flashcards
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading view
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

  // Flashcards view
  const currentCard = flashcards[currentIndex];

  return (
    <div className="flex-1 flex flex-col items-center justify-center pt-16 pb-20 px-4">
      <div className="w-full max-w-sm">
        {/* Progress */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {flashcards.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFlashcards([]);
              setSelectedSubject(null);
              setSelectedGrade(null);
            }}
            className="text-xs"
          >
            <RotateCcw size={14} className="mr-1" />
            New Set
          </Button>
        </div>

        {/* Card */}
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
            "bg-gradient-to-br from-primary/5 to-accent/5"
          )}>
            <span className="text-xs text-primary mb-2">Question</span>
            <p className="text-lg font-medium">{currentCard?.front}</p>
            <span className="text-xs text-muted-foreground mt-4">Tap to flip</span>
          </div>

          <div 
            className={cn(
              "absolute inset-0 glass-effect rounded-2xl p-6 flex flex-col items-center justify-center text-center",
              "bg-gradient-to-br from-accent/10 to-primary/10"
            )}
            style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs text-accent mb-2">Answer</span>
            <p className="text-lg font-medium">{currentCard?.back}</p>
            <span className="text-xs text-muted-foreground mt-4">Tap to flip back</span>
          </div>
        </div>

        {/* Navigation */}
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
