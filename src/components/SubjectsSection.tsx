import { useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, Bot, BookOpen, Download, Image as ImageIcon, FileText, Presentation, Pencil, Save, Zap, GraduationCap } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMaterials, Material } from '@/hooks/useMaterials';
import { MathRenderer } from '@/components/MathRenderer';
import { mergeImagesIntoContent, urlsToInlineImages } from '@/lib/imageInsertion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { CourseMaterialsSection } from '@/components/CourseMaterialsSection';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { useLearningStyle } from '@/hooks/useLearningStyle';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useAdaptiveIntelligence } from '@/hooks/useAdaptiveIntelligence';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';
import { exportAsPDF, exportAsDOCX, exportAsPPTX } from '@/lib/lectureExport';
import { LectureGenerator } from '@/components/student/LectureGenerator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-emerald-500 to-green-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-violet-500 to-purple-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-rose-500 to-pink-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-emerald-600' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
  { id: 'arabic', name: 'اللغة العربية', emoji: '🕌', color: 'from-amber-500 to-yellow-600' },
  { id: 'islamic_studies', name: 'Islamic Studies', emoji: '☪️', color: 'from-green-600 to-emerald-700' },
  { id: 'ksa_history', name: 'KSA History', emoji: '🏛️', color: 'from-amber-600 to-orange-700' },
  { id: 'art_design', name: 'Art and Design', emoji: '🎨', color: 'from-pink-500 to-rose-600' },
  { id: 'entrepreneurship', name: 'Entrepreneurship', emoji: '💼', color: 'from-cyan-500 to-sky-600' },
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

type MenuType = 'main' | 'ai' | 'course';
type ViewState = 'subjects' | 'grade' | 'input' | 'lecture';

export function SubjectsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [menuType, setMenuType] = useState<MenuType>('main');
  const [viewState, setViewState] = useState<ViewState>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [lectureContent, setLectureContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lectureImages, setLectureImages] = useState<string[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [lectureLength, setLectureLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [showVisualLecture, setShowVisualLecture] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const { language } = useThemeLanguage();
  const tl = (key: Parameters<typeof tr>[0]) => tr(key, language);
  const { 
    getMaterialsBySubjectAndGrade, 
    createMaterial, 
    deleteMaterial,
    loading: materialsLoading 
  } = useMaterials();

  const { currentLevel: adaptiveLevel } = useAdaptiveLevel(selectedSubject || undefined);
  const { getLearningStylePrompt } = useLearningStyle();
  const { trackActivity, trackLectureViewed } = useActivityTracker();
  const { getSimpleParams, recordActivity, recordTeaching } = useAdaptiveIntelligence();

  const containerClass = embedded
    ? "flex-1 min-h-0 overflow-y-auto py-4"
    : "flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20";

  // Get saved materials for current subject/grade
  const savedMaterials = selectedSubject && selectedGrade 
    ? getMaterialsBySubjectAndGrade(selectedSubject, selectedGrade)
    : [];

  const fetchLectureImages = useCallback(async (topic: string, subjectName: string) => {
    setIsGeneratingImages(true);
    setLectureImages([]);
    const allImages: string[] = [];

    // 1) Fetch professional Wikipedia images with strict filtering
    try {
      const fillerWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'is', 'are', 'and', 'to', 'for', 'with', 'about', 'how', 'what', 'why', 'explain', 'show', 'tell', 'teach', 'understand']);
      const coreWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !fillerWords.has(w));
      const coreTopic = coreWords.join(' ') || topic;
      const searchTerms = [`${coreTopic} ${subjectName}`, coreTopic];
      const personPatterns = /president|politician|actor|actress|singer|celebrity|minister|king|queen|prince|trump|biden|obama|leader|chairman|CEO|founder|footballer|player|rapper|musician|comedian|influencer|youtuber|tiktoker/i;
      const irrelevantPatterns = /community|forum|software|band|album|film|movie|tv series|video game|disambiguation|logo|icon|screenshot|code|terminal|computer|programming|website|online|internet|chat|social media|debate|policy|politic|portrait|headshot|mugshot|selfie/i;
      const seenUrls = new Set<string>();

      for (const searchTerm of searchTerms) {
        if (allImages.length >= 2) break;
        const encoded = encodeURIComponent(searchTerm);
        const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrlimit=10&prop=pageimages|description|categories&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) continue;

        const sorted = Object.values(pages).sort((a: any, b: any) => (a.index || 0) - (b.index || 0));
        for (const page of sorted as any[]) {
          if (allImages.length >= 2) break;
          const thumb = page.thumbnail?.source;
          const title = page.title || '';
          const desc = page.description || '';
          const cats = (page.categories || []).map((c: any) => c.title?.toLowerCase() || '').join(' ');
          if (!thumb || seenUrls.has(thumb)) continue;
          if (thumb.endsWith('.svg')) continue;
          if (page.thumbnail?.width < 150 || page.thumbnail?.height < 100) continue;
          if (irrelevantPatterns.test(title) || irrelevantPatterns.test(desc)) continue;
          if (personPatterns.test(title) || personPatterns.test(desc) || personPatterns.test(cats)) continue;
          // Check category for "births" or "people" — skip biographical pages
          if (/births|people|living people|deaths/i.test(cats)) continue;
          const titleLower = (title + ' ' + desc).toLowerCase();
          const hasRelevance = coreWords.some(w => titleLower.includes(w));
          if (!hasRelevance) continue;
          seenUrls.add(thumb);
          allImages.push(thumb);
        }
      }
    } catch (err) {
      console.warn('Wikipedia images failed:', err);
    }

    // Update with Wikipedia images first
    if (allImages.length > 0) setLectureImages([...allImages]);

    // 2) Also generate AI diagrams
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-diagram`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ subject: subjectName, topic, grade: selectedGrade || 'General', count: 3 }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.images?.length > 0) {
          allImages.push(...data.images);
          setLectureImages([...allImages]);
        }
      }
    } catch (err) {
      console.warn('Diagram generation failed:', err);
    }

    setIsGeneratingImages(false);
  }, [selectedGrade]);

  const generateLecture = useCallback(async (topic: string) => {
    if (!selectedSubject || !selectedGrade || !user) return;
    
    setIsLoading(true);
    setLectureContent('');
    setLectureImages([]);

    const subject = subjects.find(s => s.id === selectedSubject);
    const isArabic = selectedSubject === 'arabic';

    const lengthInstruction = lectureLength === 'short'
      ? `Generate CONCISE but THOROUGH content — 4-6 pages.
Include:
- Clear overview paragraph (5+ sentences)
- All key definitions with precise explanations
- Core concepts as detailed bullet points
- At least 1 ASCII diagram or comparison table using box-drawing characters (┌─┐│└─┘→)
- 2-3 worked examples
- 3-5 common mistakes
- Summary checklist
Use "💡 Pro Tip" boxes. **Bold** all key terms.`
      : lectureLength === 'long'
      ? `Make this a COLOSSAL, ENCYCLOPEDIC resource — equivalent to 60+ slides or a full textbook chapter. Aim for 30-50 pages.

Structure as a COMPLETE TEXTBOOK CHAPTER with these parts:

PART 1: FOUNDATIONS — Overview, historical background, prerequisites review
PART 2: DEFINITIONS — Every term (15+ terms), glossary table with Term/Definition/Example/Related Terms columns
PART 3: CORE CONCEPTS DEEP DIVE — Each concept gets: What It Is, How It Works, ASCII Visual Diagram, Key Properties, Connection to Other Concepts (minimum 6-8 concept sections)
PART 4: DIAGRAMS & VISUAL LEARNING — Create 6-8 different ASCII visual elements:
  - Concept map (tree structure using ┌─┐│└─┘→←↑↓▼)
  - Process flowchart
  - Multiple comparison tables
  - Classification/hierarchy diagrams
  - Cause-effect diagrams
  - Cycle diagrams (if applicable)
PART 5: FORMULAS & DERIVATIONS — Complete formula sheet, step-by-step derivations, special cases
PART 6: EXTENSIVE WORKED EXAMPLES — 5+ easy, 5+ medium, 5+ challenging, 3+ real-world application problems
PART 7: MISCONCEPTIONS — Top 10 student mistakes with ❌ wrong vs ✅ correct approach for each
PART 8: CONNECTIONS — Cross-topic links, 10+ real-world applications, current research
PART 9: SELF-ASSESSMENT — 10 recall questions, 10 conceptual questions, 10 problem-solving exercises, 5 challenge problems, full answer key
PART 10: COMPREHENSIVE SUMMARY — Section recap, master cheat sheet, study checklist with checkboxes

Use horizontal rules (---) between parts. Include "💡 Pro Tip" boxes (minimum 10). Include "⚡ Quick Check" questions after every major section.`
      : `Generate DETAILED content — 12-18 pages of rich educational material.

Include ALL of these:
1. Introduction & Context — What, why, historical background (full paragraph)
2. Definitions — Every term with 3-5 sentence definitions, etymology where helpful
3. Core Concepts Deep Dive — Each concept gets its own subsection with explanation, step-by-step breakdown, and connection to other concepts
4. Visual Representations — Create AT LEAST 3 ASCII diagrams:
   - Flowcharts using box-drawing characters (┌─┐│└─┘→←↑↓▼)
   - Comparison tables
   - Hierarchy/tree diagrams or concept maps
5. Formulas & Rules — Every formula with step-by-step breakdown
6. Worked Examples — 3-5 per concept at varying difficulty
7. Common Misconceptions — 5-8 errors with wrong vs right comparison
8. Real-World Applications — 3-5 practical applications
9. Self-Assessment — 5-8 practice questions with answers
10. Summary — Section recap, key takeaways, formula sheet, study checklist

Include "💡 Pro Tip" and "⚡ Quick Check" boxes throughout.`;
    
    const prompt = isArabic 
      ? `أنت معلم للغة العربية لطالب في الصف ${selectedGrade}.
    
الطالب يريد تعلم: "${topic}"

${lectureLength === 'short' ? 'اجعل الشرح قصيرًا ومختصرًا — صفحة أو صفحتان فقط.' : lectureLength === 'long' ? 'اجعل الشرح مفصلاً جداً — ما يعادل 32+ شريحة من المحتوى التعليمي الشامل مع رسوم بيانية وأمثلة متعددة.' : 'اجعل الشرح متوازنًا — 5-8 صفحات مع أمثلة ورسوم بيانية.'}

قم بإنشاء درس شامل يتضمن:
1. شرح واضح للتعريفات أولاً
2. شرح خطوة بخطوة للمفاهيم
3. أمثلة مناسبة لمستوى ${selectedGrade}
4. الأخطاء الشائعة التي يجب تجنبها
5. ملخص قصير للمراجعة

استخدم رموز الأقسام مع الإيموجي (📌، 🧠، 📊، ✅، ⚠️، 📝، 💡).
مهم جداً: اكتب الدرس بالكامل باللغة العربية فقط.
استخدم لغة مناسبة لعمر الطالب.

مهم: ضع بالضبط 5 علامات للصور في الأماكن المناسبة في الدرس.
استخدم التنسيق [IMAGE_PLACEHOLDER_1]، [IMAGE_PLACEHOLDER_2]، إلخ.
ضع كل علامة في سطر مستقل بعد الفقرة التي تحتاج صورة توضيحية.`
      : `You are teaching ${subject?.name} to a ${selectedGrade} student.
    
The student wants to learn about: "${topic}"

${lengthInstruction}

Generate a lecture that includes:
1. Clear explanation of definitions first
2. Step-by-step explanation of processes/concepts
3. Examples appropriate for ${selectedGrade} level
4. Common mistakes or misconceptions to avoid
5. A short summary for revision

IMPORTANT FORMATTING:
- Use emoji section headers (📌, 🧠, 📊, ✅, ⚠️, 📝, 💡, ⚡)
- **Bold** all key terms on first mention
- Use tables for comparisons between concepts
- Create ASCII diagrams or visual representations where helpful
- Include "💡 Pro Tip" boxes for study advice
- For ALL mathematical expressions, use LaTeX notation:
  \\( expression \\) or $expression$ for inline, \\[ expression \\] or $$expression$$ for display
- Always include plain-text fallback after complex formulas

IMPORTANT IMAGE PLACEMENT:
- Place exactly 5 image markers throughout your lecture at the most relevant points.
- Use the format [IMAGE_PLACEHOLDER_1], [IMAGE_PLACEHOLDER_2], etc.
- Place each marker on its own line, right after the paragraph or section where a visual would help.
- Example: After explaining photosynthesis, place [IMAGE_PLACEHOLDER_1] where a diagram of sunlight absorption would appear.

Stay strictly within ${subject?.name}. Do not mix with other subjects.
Use age-appropriate language for ${selectedGrade}.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        adaptiveLevel,
        learningStyle: getLearningStylePrompt(),
        onDelta: (chunk) => {
          response += chunk;
          setLectureContent(response);
        },
        onDone: async () => {
          const newMaterial = await createMaterial(selectedSubject, selectedGrade, topic, response);
          if (newMaterial) {
            setActiveMaterial(newMaterial);
          }
          trackActivity({
            activityType: 'subject_explored',
            category: 'learning',
            subject: selectedSubject,
            details: { topic, grade: selectedGrade },
          });
          trackLectureViewed(selectedSubject, topic, Math.max(30, Math.round(response.length / 12)));
          setIsLoading(false);
          // Fetch related images and merge inline
          fetchLectureImages(topic, subject?.name || selectedSubject).then(() => {
            // Images will be merged via the render logic
          });
        },
        onError: (error) => {
          setIsLoading(false);
          toast({ variant: 'destructive', title: 'Error', description: error.message });
        },
      });
    } catch {
      setIsLoading(false);
    }
  }, [selectedSubject, selectedGrade, user, createMaterial, toast, fetchLectureImages]);

  const handleExport = useCallback(async (format: 'pdf' | 'docx' | 'pptx') => {
    const title = activeMaterial?.topic || 'Lecture';
    const content = lectureContent;
    if (!content) return;
    setIsExporting(true);
    try {
      if (format === 'pdf') await exportAsPDF(title, content);
      else if (format === 'docx') await exportAsDOCX(title, content);
      else await exportAsPPTX(title, content, lectureImages);
      toast({ title: 'Exported!', description: `Lecture saved as ${format.toUpperCase()}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [activeMaterial, lectureContent, lectureImages, toast]);

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
  };

  const subject = subjects.find(s => s.id === selectedSubject);

  // LECTURE VIEW - Shows lecture content and material tabs
  if (viewState === 'lecture' && selectedSubject && selectedGrade) {
    return (
      <div className={containerClass}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              {tl('back')}
            </Button>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <div className="flex-1">
              <h1 className="font-bold text-sm">{getSubjectName(selectedSubject!, language)}</h1>
              <p className="text-xs text-muted-foreground">{getGradeName(selectedGrade!, language)}</p>
            </div>
            {/* Edit & Export buttons - Edit only for teachers (embedded mode) */}
            {!isLoading && lectureContent && (
              <div className="flex items-center gap-1.5">
                {embedded && (
                  <Button
                    variant={isEditing ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      if (isEditing) {
                        // Save edits
                        setLectureContent(editContent);
                        if (activeMaterial) {
                          // Update material in DB
                          import('@/integrations/supabase/client').then(({ supabase }) => {
                            supabase.from('materials').update({ content: editContent }).eq('id', activeMaterial.id).then(() => {
                              toast({ title: tl('saved') || 'Saved!' });
                            });
                          });
                        }
                        setIsEditing(false);
                      } else {
                        setEditContent(lectureContent);
                        setIsEditing(true);
                      }
                    }}
                  >
                    {isEditing ? <Save size={12} /> : <Pencil size={12} />}
                    {isEditing ? (tl('save') || 'Save') : (tl('edit') || 'Edit')}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={isExporting}>
                      {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      Convert
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport('pdf')}>
                      <FileText className="w-4 h-4 mr-2 text-red-500" />
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('docx')}>
                      <FileText className="w-4 h-4 mr-2 text-blue-500" />
                      Export as DOCX (Word)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('pptx')}>
                      <Presentation className="w-4 h-4 mr-2 text-orange-500" />
                      Export as PPTX (PowerPoint)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Material Tabs */}
          <div className="glass-effect rounded-xl p-3 mb-4">
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
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
                {tl('newMaterial')}
              </button>
            </div>
          </div>

          {/* Lecture Content with Math Rendering or Editor */}
          <div className="glass-effect rounded-2xl p-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">{tl('generatingLecture')}</span>
              </div>
            ) : isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[400px] bg-transparent border border-border rounded-xl p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y font-mono"
                dir="auto"
              />
            ) : (
              <div className="prose prose-sm max-w-none">
                <MathRenderer 
                  content={lectureImages.length > 0 
                    ? mergeImagesIntoContent(lectureContent, urlsToInlineImages(lectureImages, activeMaterial?.topic))
                    : lectureContent
                  } 
                  className="whitespace-pre-wrap text-sm leading-relaxed" 
                />
              </div>
            )}
          </div>

          {/* Loading indicator for images being generated */}
          {!isLoading && isGeneratingImages && lectureImages.length === 0 && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 glass-effect rounded-xl justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{language === 'ar' ? 'جاري إنشاء الرسوم البيانية...' : 'Loading diagrams...'}</span>
            </div>
          )}
        </div>
      </div>
    );

  }

  // INPUT VIEW - User enters material/topic
  if (viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className={containerClass}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}>
              <ArrowLeft size={16} className="mr-1" />
              {tl('back')}
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{getSubjectName(selectedSubject!, language)}</h1>
            <p className="text-sm text-muted-foreground">{getGradeName(selectedGrade!, language)}</p>
          </div>

          {/* Topic Input */}
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">
              {tl('whatTopic')}
            </h3>
            
            <input
              type="text"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMaterialSubmit()}
              placeholder={tl('topicPlaceholder')}
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              autoFocus
            />

            {/* Length Selector */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
                {language === 'ar' ? 'مستوى التفصيل' : 'Detail Level'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'short' as const, icon: <Zap size={14} />, label: language === 'ar' ? 'قصير' : 'Short', color: 'from-amber-500 to-orange-500' },
                  { key: 'medium' as const, icon: <BookOpen size={14} />, label: language === 'ar' ? 'متوسط' : 'Medium', color: 'from-blue-500 to-cyan-500' },
                  { key: 'long' as const, icon: <GraduationCap size={14} />, label: language === 'ar' ? 'طويل' : 'Long', color: 'from-violet-500 to-purple-600' },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setLectureLength(opt.key)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
                      lectureLength === opt.key
                        ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

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
                  {tl('viewSavedMaterials')}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleMaterialSubmit}
                disabled={!materialInput.trim()}
                className="flex-1 gap-2"
              >
                {tl('generateLecture')}
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
      <div className={containerClass}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}>
              <ArrowLeft size={16} className="mr-1" />
              {tl('back')}
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br",
              subject?.color
            )}>
              {subject?.emoji}
            </div>
            <h1 className="text-2xl font-bold mb-2">{getSubjectName(selectedSubject!, language)}</h1>
          </div>

          {/* Grade Selection */}
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">{tl('selectGrade')}</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => {
                const materialCount = getMaterialsBySubjectAndGrade(selectedSubject, grade).length;
                return (
                  <button
                    key={grade}
                    onClick={() => handleGradeSelect(grade)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary flex flex-col items-center gap-1"
                  >
                    <span>{getGradeName(grade, language)}</span>
                    {materialCount > 0 && (
                      <span className="text-[10px] text-primary">{materialCount} {tl('saved')}</span>
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
      <div className={containerClass}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 overflow-hidden">
              <LuminaLogo size={56} />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">{tl('subjects')}</h1>
            <p className="text-muted-foreground text-sm">{tl('chooseHowToLearn')}</p>
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
                  <h3 className="font-bold text-lg text-foreground">{tl('aiLectures')}</h3>
                  <p className="text-sm text-muted-foreground">{tl('aiLecturesDesc')}</p>
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

  // COURSE MATERIALS - Use the dedicated component
  if (menuType === 'course') {
    return <CourseMaterialsSection onBack={handleBackToMainMenu} />;
  }

  // SUBJECTS VIEW - Subject selection (for both AI and Course modes)
  if (viewState === 'subjects') {
    return (
      <div className={containerClass}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToMainMenu}>
              <ArrowLeft size={16} className="mr-1" />
              {tl('back')}
            </Button>
          </div>

          <div className="text-center mb-6 animate-fade-in">
            <div className={cn(
              "inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3 glow-effect bg-gradient-to-br",
              menuType === 'ai' ? 'from-violet-500 to-purple-600' : 'from-emerald-500 to-teal-600'
            )}>
              {menuType === 'ai' ? <Bot className="w-6 h-6 text-white" /> : <BookOpen className="w-6 h-6 text-white" />}
            </div>
            <h1 className="text-xl font-bold mb-1 gradient-text">
              {menuType === 'ai' ? tl('aiLectures') : tl('courseMaterials')}
            </h1>
            <p className="text-muted-foreground text-xs">{language === 'ar' ? 'اختر مادة' : 'Choose a subject'}</p>
          </div>

          {/* Responsive Grid - 2 cols on mobile, 3 cols on tablet, 4 cols on desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {subjects.map((subj, index) => (
              <button
                key={subj.id}
                onClick={() => handleSubjectClick(subj.id)}
                className={cn(
                  "glass-effect rounded-xl p-3 text-center transition-all duration-200 animate-fade-in group",
                  "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 bg-gradient-to-br text-white text-lg",
                  subj.color
                )}>
                  {subj.emoji}
                </div>
                <h3 className="font-semibold text-foreground text-xs">{getSubjectName(subj.id, language)}</h3>
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
