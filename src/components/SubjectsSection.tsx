import { useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, Sparkles, Trash2, Bot, BookOpen, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMaterials, Material } from '@/hooks/useMaterials';
import { MathRenderer } from '@/components/MathRenderer';
import { useAuth } from '@/hooks/useAuth';

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

type MenuType = 'main' | 'ai' | 'course';
type ViewState = 'subjects' | 'grade' | 'input' | 'lecture';

export function SubjectsSection() {
  const [menuType, setMenuType] = useState<MenuType>('main');
  const [viewState, setViewState] = useState<ViewState>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [lectureContent, setLectureContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Course materials state
  const [courseTitle, setCourseTitle] = useState('');
  const [courseContent, setCourseContent] = useState('');
  
  const { toast } = useToast();
  const { user } = useAuth();
  const { 
    getMaterialsBySubjectAndGrade, 
    createMaterial, 
    deleteMaterial,
    loading: materialsLoading 
  } = useMaterials();

  // Get saved materials for current subject/grade
  const savedMaterials = selectedSubject && selectedGrade 
    ? getMaterialsBySubjectAndGrade(selectedSubject, selectedGrade)
    : [];

  const generateLecture = useCallback(async (topic: string) => {
    if (!selectedSubject || !selectedGrade || !user) return;
    
    setIsLoading(true);
    setLectureContent('');

    const subject = subjects.find(s => s.id === selectedSubject);
    const prompt = `You are teaching ${subject?.name} to a ${selectedGrade} student.
    
The student wants to learn about: "${topic}"

Generate a comprehensive lecture that includes:
1. Clear explanation of definitions first
2. Step-by-step explanation of processes/concepts
3. Examples appropriate for ${selectedGrade} level
4. Common mistakes or misconceptions to avoid
5. A short summary for revision

IMPORTANT: For ALL mathematical expressions, use LaTeX notation:
- Inline math: \\( expression \\) or $expression$
- Display math: \\[ expression \\] or $$expression$$
- Always include plain-text fallback after complex formulas
- Examples: \\( \\frac{a+b}{c} \\), \\( \\sqrt{x^2 + y^2} \\), \\( \\sum_{i=1}^n i \\)

Stay strictly within ${subject?.name}. Do not mix with other subjects.
Use age-appropriate language for ${selectedGrade}.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => {
          response += chunk;
          setLectureContent(response);
        },
        onDone: async () => {
          // Save to database
          const newMaterial = await createMaterial(selectedSubject, selectedGrade, topic, response);
          if (newMaterial) {
            setActiveMaterial(newMaterial);
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
  }, [selectedSubject, selectedGrade, user, createMaterial, toast]);

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setSelectedGrade(null);
    setActiveMaterial(null);
    setLectureContent('');
    setViewState('grade');
  };

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
    // Check if there are saved materials for this subject/grade
    const materials = getMaterialsBySubjectAndGrade(selectedSubject!, grade);
    if (materials.length > 0) {
      // Show existing materials
      setActiveMaterial(materials[0]);
      setLectureContent(materials[0].content);
      setViewState('lecture');
    } else {
      // No materials, go to input
      setViewState('input');
    }
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

  const handleMaterialClick = (material: Material) => {
    setActiveMaterial(material);
    setLectureContent(material.content);
  };

  const handleDeleteMaterial = async (materialId: string) => {
    const success = await deleteMaterial(materialId);
    if (success) {
      if (activeMaterial?.id === materialId) {
        const remaining = savedMaterials.filter(m => m.id !== materialId);
        if (remaining.length > 0) {
          setActiveMaterial(remaining[0]);
          setLectureContent(remaining[0].content);
        } else {
          setActiveMaterial(null);
          setViewState('input');
        }
      }
      toast({ title: 'Material deleted' });
    }
  };

  const handleBackToSubjects = () => {
    setViewState('subjects');
    setSelectedSubject(null);
    setSelectedGrade(null);
    setActiveMaterial(null);
    setLectureContent('');
  };

  const handleBackToGrades = () => {
    setSelectedGrade(null);
    setActiveMaterial(null);
    setLectureContent('');
    setViewState('grade');
  };

  const handleBackToMainMenu = () => {
    setMenuType('main');
    setViewState('subjects');
    setSelectedSubject(null);
    setSelectedGrade(null);
    setActiveMaterial(null);
    setLectureContent('');
    setCourseTitle('');
    setCourseContent('');
  };

  const handleUploadCourseMaterial = async () => {
    if (!courseTitle.trim() || !courseContent.trim() || !selectedSubject || !selectedGrade || !user) return;
    
    setIsLoading(true);
    try {
      const newMaterial = await createMaterial(selectedSubject, selectedGrade, `[Course] ${courseTitle}`, courseContent);
      if (newMaterial) {
        setActiveMaterial(newMaterial);
        setLectureContent(newMaterial.content);
        setCourseTitle('');
        setCourseContent('');
        setViewState('lecture');
        toast({ title: 'Course material uploaded successfully!' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error uploading material' });
    }
    setIsLoading(false);
  };

  const subject = subjects.find(s => s.id === selectedSubject);

  // LECTURE VIEW - Shows lecture content and material tabs
  if (viewState === 'lecture' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <div>
              <h1 className="font-bold text-sm">{subject?.name}</h1>
              <p className="text-xs text-muted-foreground">{selectedGrade}</p>
            </div>
          </div>

          {/* Material Tabs */}
          <div className="glass-effect rounded-xl p-3 mb-4 overflow-x-auto">
            <div className="flex flex-wrap gap-2">
              {savedMaterials.map((material) => (
                <div
                  key={material.id}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer",
                    activeMaterial?.id === material.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                  onClick={() => handleMaterialClick(material)}
                >
                  <span className="truncate max-w-[120px]">{material.topic}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMaterial(material.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
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

          {/* Lecture Content with Math Rendering */}
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[60vh]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Generating lecture...</span>
              </div>
            ) : (
              <MathRenderer content={lectureContent} className="whitespace-pre-wrap text-sm leading-relaxed" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // INPUT VIEW - User enters material/topic
  if (viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name}</h1>
            <p className="text-sm text-muted-foreground">{selectedGrade}</p>
          </div>

          {/* Topic Input */}
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">
              What are you taking or having problems with in this subject?
            </h3>
            
            <input
              type="text"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMaterialSubmit()}
              placeholder="e.g., Cell respiration, Newton's laws, Quadratic equations..."
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              autoFocus
            />

            <div className="flex gap-2">
              {savedMaterials.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveMaterial(savedMaterials[0]);
                    setLectureContent(savedMaterials[0].content);
                    setViewState('lecture');
                  }}
                >
                  View Saved Materials
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleMaterialSubmit}
                disabled={!materialInput.trim()}
                className="flex-1 gap-2"
              >
                Generate Lecture
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // GRADE SELECTION VIEW
  if (viewState === 'grade' && selectedSubject) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name}</h1>
          </div>

          {/* Grade Selection */}
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">Select Your Grade Level</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => {
                const materialCount = getMaterialsBySubjectAndGrade(selectedSubject, grade).length;
                return (
                  <button
                    key={grade}
                    onClick={() => handleGradeSelect(grade)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary flex flex-col items-center gap-1"
                  >
                    <span>{grade}</span>
                    {materialCount > 0 && (
                      <span className="text-[10px] text-primary">{materialCount} saved</span>
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

  // MAIN MENU - Choose between AI and Course Materials
  if (menuType === 'main') {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
              <Sparkles className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">Subjects</h1>
            <p className="text-muted-foreground text-sm">Choose how you want to learn</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* AI Lectures Menu */}
            <button
              onClick={() => setMenuType('ai')}
              className="glass-effect rounded-2xl p-6 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <Bot className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">AI Lectures</h3>
                  <p className="text-sm text-muted-foreground">Generate personalized lectures with AI</p>
                </div>
                <ArrowRight className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </button>

            {/* Course Materials Menu */}
            <button
              onClick={() => setMenuType('course')}
              className="glass-effect rounded-2xl p-6 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              style={{ animationDelay: '50ms' }}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">Course Materials</h3>
                  <p className="text-sm text-muted-foreground">Teacher-uploaded materials & resources</p>
                </div>
                <ArrowRight className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // COURSE MATERIALS - Input view for uploading
  if (menuType === 'course' && viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{subject?.name}</h1>
            <p className="text-sm text-muted-foreground">{selectedGrade} • Course Materials</p>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <Upload size={18} className="text-primary" />
              <h3 className="font-semibold">Upload Course Material</h3>
            </div>
            
            <input
              type="text"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              placeholder="Material title (e.g., Chapter 3: Photosynthesis)"
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
            />
            
            <textarea
              value={courseContent}
              onChange={(e) => setCourseContent(e.target.value)}
              placeholder="Paste or type the course content here..."
              rows={8}
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4 resize-none"
            />

            <div className="flex gap-2">
              {savedMaterials.filter(m => m.topic.startsWith('[Course]')).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const courseMats = savedMaterials.filter(m => m.topic.startsWith('[Course]'));
                    setActiveMaterial(courseMats[0]);
                    setLectureContent(courseMats[0].content);
                    setViewState('lecture');
                  }}
                >
                  View Uploaded Materials
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleUploadCourseMaterial}
                disabled={!courseTitle.trim() || !courseContent.trim() || isLoading}
                className="flex-1 gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={16} />}
                Upload Material
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SUBJECTS VIEW - Subject selection (for both AI and Course modes)
  if (viewState === 'subjects') {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToMainMenu}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br",
              menuType === 'ai' ? 'from-violet-500 to-purple-600' : 'from-emerald-500 to-teal-600'
            )}>
              {menuType === 'ai' ? <Bot className="w-7 h-7 text-white" /> : <BookOpen className="w-7 h-7 text-white" />}
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">
              {menuType === 'ai' ? 'AI Lectures' : 'Course Materials'}
            </h1>
            <p className="text-muted-foreground text-sm">Choose a subject</p>
          </div>

          <div className="grid grid-cols-2 gap-3 overflow-y-auto">
            {subjects.map((subj, index) => (
              <button
                key={subj.id}
                onClick={() => handleSubjectClick(subj.id)}
                className={cn(
                  "glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in group",
                  "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br text-white text-lg",
                  subj.color
                )}>
                  {subj.emoji}
                </div>
                <h3 className="font-semibold text-foreground text-sm">{subj.name}</h3>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Fallback - shouldn't reach here
  return null;
}
