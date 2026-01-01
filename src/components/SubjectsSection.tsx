import { useState } from 'react';
import { ArrowRight, ChevronDown, Sparkles, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-emerald-500 to-green-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-violet-500 to-purple-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-rose-500 to-pink-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-emerald-600' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

interface MaterialTab {
  id: string;
  name: string;
  subject: string;
  grade: string;
}

interface SubjectsSectionProps {
  onSelectSubject: (subject: string, grade: string, material?: string) => void;
}

export function SubjectsSection({ onSelectSubject }: SubjectsSectionProps) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [showGrades, setShowGrades] = useState(false);
  const [materialTabs, setMaterialTabs] = useState<MaterialTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [showMaterialInput, setShowMaterialInput] = useState(false);

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setShowGrades(true);
    setSelectedGrade(null);
    setMaterialTabs([]);
    setActiveTabId(null);
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
  };

  const handleStart = () => {
    if (selectedSubject && selectedGrade) {
      setShowMaterialInput(true);
    }
  };

  const handleMaterialSubmit = () => {
    if (selectedSubject && selectedGrade && materialInput.trim()) {
      const subject = subjects.find(s => s.id === selectedSubject);
      const newTab: MaterialTab = {
        id: `${Date.now()}`,
        name: materialInput.trim(),
        subject: subject?.name || selectedSubject,
        grade: selectedGrade,
      };
      setMaterialTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      onSelectSubject(newTab.subject, selectedGrade, materialInput.trim());
      setMaterialInput('');
      setShowMaterialInput(false);
    }
  };

  const handleAddNewMaterial = () => {
    setShowMaterialInput(true);
    setMaterialInput('');
  };

  const handleRemoveTab = (tabId: string) => {
    setMaterialTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      const remaining = materialTabs.filter(t => t.id !== tabId);
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleTabClick = (tab: MaterialTab) => {
    setActiveTabId(tab.id);
    onSelectSubject(tab.subject, tab.grade, tab.name);
  };

  // Material tabs view with add button
  if (materialTabs.length > 0 && !showMaterialInput) {
    const subject = subjects.find(s => s.id === selectedSubject);
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="text-center mb-6 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-1">{subject?.name}</h1>
            <p className="text-muted-foreground text-sm">{selectedGrade}</p>
          </div>

          {/* Material Tabs */}
          <div className="glass-effect rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-sm mb-3">Your Materials</h3>
            <div className="flex flex-wrap gap-2">
              {materialTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer",
                    activeTabId === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                  onClick={() => handleTabClick(tab)}
                >
                  <span className="truncate max-w-[150px]">{tab.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTab(tab.id);
                    }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-background/20",
                      activeTabId === tab.id ? "text-primary-foreground" : "text-muted-foreground"
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              
              {/* Add New Material Button */}
              <button
                onClick={handleAddNewMaterial}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-dashed border-primary/30"
              >
                <Plus size={14} />
                <span>New Material</span>
              </button>
            </div>
          </div>

          {/* Back to subjects button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedSubject(null);
              setSelectedGrade(null);
              setShowGrades(false);
              setMaterialTabs([]);
              setActiveTabId(null);
            }}
            className="text-muted-foreground"
          >
            ← Back to Subjects
          </Button>
        </div>
      </div>
    );
  }

  // Material input view
  if (showMaterialInput && selectedSubject && selectedGrade) {
    const subject = subjects.find(s => s.id === selectedSubject);
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-1">{subject?.name}</h1>
            <p className="text-muted-foreground text-sm">{selectedGrade}</p>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4">Enter Material/Lesson Name</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Type the name of the material or lesson you want to study
            </p>
            <input
              type="text"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMaterialSubmit()}
              placeholder="e.g., Photosynthesis, Quadratic Equations..."
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (materialTabs.length > 0) {
                    setShowMaterialInput(false);
                  } else {
                    setShowGrades(true);
                    setShowMaterialInput(false);
                  }
                }}
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleMaterialSubmit}
                disabled={!materialInput.trim()}
                className="flex-1 gap-2"
              >
                Start Learning
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                Continue
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
