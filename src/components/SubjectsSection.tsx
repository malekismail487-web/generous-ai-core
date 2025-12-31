import { useState } from 'react';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-emerald-500 to-green-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-violet-500 to-purple-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-rose-500 to-pink-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-emerald-600' },
  { id: 'art', name: 'Art', emoji: '🎨', color: 'from-fuchsia-500 to-pink-600' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

interface SubjectsSectionProps {
  onSelectSubject: (subject: string, grade: string) => void;
}

export function SubjectsSection({ onSelectSubject }: SubjectsSectionProps) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [showGrades, setShowGrades] = useState(false);

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setShowGrades(true);
    setSelectedGrade(null);
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
  };

  const handleStart = () => {
    if (selectedSubject && selectedGrade) {
      const subject = subjects.find(s => s.id === selectedSubject);
      onSelectSubject(subject?.name || selectedSubject, selectedGrade);
      setSelectedSubject(null);
      setSelectedGrade(null);
      setShowGrades(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <Sparkles className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Choose a Subject</h1>
          <p className="text-muted-foreground text-sm">Select a subject and grade level to start learning</p>
        </div>

        {/* Subjects Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {subjects.map((subject, index) => (
            <button
              key={subject.id}
              onClick={() => handleSubjectClick(subject.id)}
              className={cn(
                "glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in group",
                "hover:scale-[1.02] hover:shadow-lg",
                selectedSubject === subject.id && "ring-2 ring-primary bg-primary/10"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br text-white text-lg",
                subject.color
              )}>
                {subject.emoji}
              </div>
              <h3 className="font-semibold text-foreground text-sm">{subject.name}</h3>
            </button>
          ))}
        </div>

        {/* Grade Selection */}
        {showGrades && selectedSubject && (
          <div className="glass-effect rounded-2xl p-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <ChevronDown className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Select Grade Level</h3>
            </div>
            
            <div className="grid grid-cols-4 gap-2 mb-4">
              {grades.map((grade) => (
                <button
                  key={grade}
                  onClick={() => handleGradeSelect(grade)}
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

            {selectedGrade && (
              <Button 
                onClick={handleStart}
                className="w-full gap-2"
                size="sm"
              >
                Start Learning
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
