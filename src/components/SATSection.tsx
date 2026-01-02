import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, X, CheckCircle2, XCircle, Trophy, Clock, Flag, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const satSections = [
  { id: 'math', name: 'SAT Math', emoji: '🔢', color: 'from-blue-500 to-cyan-600' },
  { id: 'reading', name: 'SAT Reading', emoji: '📖', color: 'from-emerald-500 to-green-600' },
  { id: 'writing', name: 'SAT Writing and Language', emoji: '✍️', color: 'from-violet-500 to-purple-600' },
];

const satGrades = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

interface MaterialTab {
  id: string;
  name: string;
  content: string;
}

type ViewState = 'sections' | 'input' | 'lecture';

export function SATSection() {
  const [viewState, setViewState] = useState<ViewState>('sections');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [materialTabs, setMaterialTabs] = useState<MaterialTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [lectureContent, setLectureContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const generateLecture = useCallback(async (topic: string) => {
    if (!selectedSection || !selectedGrade) return;
    
    setIsLoading(true);
    setLectureContent('');

    const section = satSections.find(s => s.id === selectedSection);
    const prompt = `You are an SAT prep tutor teaching ${section?.name} to a ${selectedGrade} student.
    
The student is studying/struggling with: "${topic}"

Generate SAT-style material that includes:
1. Clear explanation of the concept
2. SAT-specific strategies and tips
3. Example SAT-style questions with explanations
4. Common mistakes to avoid
5. Quick review summary

Stay strictly within SAT ${section?.name} scope. Match official SAT format and style.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => {
          response += chunk;
          setLectureContent(response);
        },
        onDone: () => {
          setIsLoading(false);
          const newTab: MaterialTab = {
            id: `${Date.now()}`,
            name: topic,
            content: response,
          };
          setMaterialTabs(prev => [...prev, newTab]);
          setActiveTabId(newTab.id);
        },
        onError: (error) => {
          setIsLoading(false);
          toast({ variant: 'destructive', title: 'Error', description: error.message });
        },
      });
    } catch {
      setIsLoading(false);
    }
  }, [selectedSection, selectedGrade, toast]);

  const handleSectionClick = (sectionId: string) => {
    setSelectedSection(sectionId);
    setSelectedGrade(null);
    setMaterialTabs([]);
    setActiveTabId(null);
    setViewState('input');
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
  };

  const handleMaterialSubmit = () => {
    if (materialInput.trim() && selectedGrade) {
      generateLecture(materialInput.trim());
      setMaterialInput('');
      setViewState('lecture');
    }
  };

  const handleAddNewMaterial = () => {
    setMaterialInput('');
    setViewState('input');
  };

  const handleTabClick = (tab: MaterialTab) => {
    setActiveTabId(tab.id);
    setLectureContent(tab.content);
  };

  const handleRemoveTab = (tabId: string) => {
    setMaterialTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      const remaining = materialTabs.filter(t => t.id !== tabId);
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
        setLectureContent(remaining[remaining.length - 1].content);
      } else {
        setActiveTabId(null);
        setViewState('input');
      }
    }
  };

  const handleBackToSections = () => {
    setViewState('sections');
    setSelectedSection(null);
    setSelectedGrade(null);
    setMaterialTabs([]);
    setActiveTabId(null);
    setLectureContent('');
  };

  const section = satSections.find(s => s.id === selectedSection);

  // LECTURE VIEW
  if (viewState === 'lecture' && selectedSection) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToSections}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
              section?.color
            )}>
              {section?.emoji}
            </div>
            <div>
              <h1 className="font-bold text-sm">{section?.name}</h1>
              <p className="text-xs text-muted-foreground">{selectedGrade}</p>
            </div>
          </div>

          <div className="glass-effect rounded-xl p-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {materialTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer",
                    activeTabId === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                  onClick={() => handleTabClick(tab)}
                >
                  <span className="truncate max-w-[120px]">{tab.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              
              <button
                onClick={handleAddNewMaterial}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-dashed border-primary/30"
              >
                <Plus size={12} />
                New Material
              </button>
            </div>
          </div>

          <div className="glass-effect rounded-2xl p-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Generating SAT material...</span>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {lectureContent}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INPUT VIEW
  if (viewState === 'input' && selectedSection) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToSections}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              section?.color
            )}>
              {section?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{section?.name}</h1>
          </div>

          {!selectedGrade && (
            <div className="glass-effect rounded-2xl p-5 mb-4 animate-fade-in">
              <h3 className="font-semibold mb-4 text-center">Select Your Grade Level</h3>
              <p className="text-xs text-muted-foreground text-center mb-4">SAT prep is available for Grades 8-12</p>
              <div className="grid grid-cols-5 gap-2">
                {satGrades.map((grade) => (
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
                    {grade.replace('Grade ', 'G')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedGrade && (
            <div className="glass-effect rounded-2xl p-5 animate-fade-in">
              <h3 className="font-semibold mb-2 text-center text-lg">
                What are you currently studying or having problems with in this SAT section?
              </h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                Grade: {selectedGrade}
              </p>
              
              <input
                type="text"
                value={materialInput}
                onChange={(e) => setMaterialInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMaterialSubmit()}
                placeholder="e.g., Reading comprehension, Algebra word problems, Grammar rules..."
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
                autoFocus
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGrade(null)}
                >
                  Change Grade
                </Button>
                <Button
                  size="sm"
                  onClick={handleMaterialSubmit}
                  disabled={!materialInput.trim()}
                  className="flex-1 gap-2"
                >
                  Generate Material
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // SECTIONS VIEW
  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <GraduationCap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">SAT Practice</h1>
          <p className="text-muted-foreground text-sm">Click any section to start studying</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {satSections.map((sect, index) => (
            <button
              key={sect.id}
              onClick={() => handleSectionClick(sect.id)}
              className={cn(
                "glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in",
                "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white text-xl",
                sect.color
              )}>
                {sect.emoji}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{sect.name}</h3>
                <p className="text-xs text-muted-foreground">Click to study</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}