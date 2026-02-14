import { useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMaterials, Material } from '@/hooks/useMaterials';
import { MathRenderer } from '@/components/MathRenderer';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';

const satSections = [
  { id: 'sat_math', emoji: '🔢', color: 'from-blue-500 to-cyan-600' },
  { id: 'sat_reading', emoji: '📖', color: 'from-emerald-500 to-green-600' },
  { id: 'sat_writing', emoji: '✍️', color: 'from-violet-500 to-purple-600' },
];

const satGrades = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

type ViewState = 'sections' | 'grade' | 'input' | 'lecture';

export function SATSection() {
  const { language } = useThemeLanguage();
  const [viewState, setViewState] = useState<ViewState>('sections');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [lectureContent, setLectureContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { getMaterialsBySubjectAndGrade, createMaterial, deleteMaterial } = useMaterials();

  const savedMaterials = selectedSection && selectedGrade ? getMaterialsBySubjectAndGrade(selectedSection, selectedGrade) : [];

  const generateLecture = useCallback(async (topic: string) => {
    if (!selectedSection || !selectedGrade || !user) return;
    setIsLoading(true);
    setLectureContent('');
    const sectionName = getSubjectName(selectedSection, 'en');
    const prompt = `You are an SAT prep tutor teaching ${sectionName} to a ${selectedGrade} student.\n\nThe student is studying/struggling with: "${topic}"\n\nGenerate SAT-style material that includes:\n1. Clear explanation of the concept\n2. SAT-specific strategies and tips\n3. Example SAT-style questions with explanations\n4. Common mistakes to avoid\n5. Quick review summary\n\nIMPORTANT: For ALL mathematical expressions, use LaTeX notation.\n\nStay strictly within SAT ${sectionName} scope. Match official SAT format and style.`;
    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';
    try {
      await streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; setLectureContent(response); },
        onDone: async () => {
          const newMaterial = await createMaterial(selectedSection, selectedGrade, topic, response);
          if (newMaterial) setActiveMaterial(newMaterial);
          setIsLoading(false);
        },
        onError: (error) => { setIsLoading(false); toast({ variant: 'destructive', title: 'Error', description: error.message }); },
      });
    } catch { setIsLoading(false); }
  }, [selectedSection, selectedGrade, user, createMaterial, toast]);

  const handleSectionClick = (sectionId: string) => { setSelectedSection(sectionId); setSelectedGrade(null); setActiveMaterial(null); setLectureContent(''); setViewState('grade'); };
  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
    const materials = getMaterialsBySubjectAndGrade(selectedSection!, grade);
    if (materials.length > 0) { setActiveMaterial(materials[0]); setLectureContent(materials[0].content); setViewState('lecture'); }
    else setViewState('input');
  };
  const handleMaterialSubmit = () => { if (materialInput.trim() && selectedGrade) { generateLecture(materialInput.trim()); setMaterialInput(''); setViewState('lecture'); } };
  const handleAddNewMaterial = () => { setMaterialInput(''); setViewState('input'); };
  const handleMaterialClick = (material: Material) => { setActiveMaterial(material); setLectureContent(material.content); };
  const handleDeleteMaterial = async (materialId: string) => {
    const success = await deleteMaterial(materialId);
    if (success) {
      if (activeMaterial?.id === materialId) {
        const remaining = savedMaterials.filter(m => m.id !== materialId);
        if (remaining.length > 0) { setActiveMaterial(remaining[0]); setLectureContent(remaining[0].content); }
        else { setActiveMaterial(null); setViewState('input'); }
      }
      toast({ title: tr('materialDeleted', language) });
    }
  };
  const handleBackToSections = () => { setViewState('sections'); setSelectedSection(null); setSelectedGrade(null); setActiveMaterial(null); setLectureContent(''); };
  const handleBackToGrades = () => { setSelectedGrade(null); setActiveMaterial(null); setLectureContent(''); setViewState('grade'); };

  const sectionName = selectedSection ? getSubjectName(selectedSection, language) : '';
  const section = satSections.find(s => s.id === selectedSection);

  // LECTURE VIEW
  if (viewState === 'lecture' && selectedSection && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToGrades}><ArrowLeft size={16} className="mr-1" />{tr('back', language)}</Button>
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br", section?.color)}>{section?.emoji}</div>
            <div><h1 className="font-bold text-sm">{sectionName}</h1><p className="text-xs text-muted-foreground">{getGradeName(selectedGrade, language)}</p></div>
          </div>
          <div className="glass-effect rounded-xl p-3 mb-4 overflow-x-auto">
            <div className="flex flex-wrap gap-2">
              {savedMaterials.map((material) => (
                <div key={material.id} className={cn("group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer", activeMaterial?.id === material.id ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary")} onClick={() => handleMaterialClick(material)}>
                  <span className="truncate max-w-[120px]">{material.topic}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(material.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                </div>
              ))}
              <button onClick={handleAddNewMaterial} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-dashed border-primary/30">
                <Plus size={12} />{tr('newMaterial', language)}
              </button>
            </div>
          </div>
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[60vh]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="ml-2 text-sm text-muted-foreground">{tr('generatingSATMaterial', language)}</span></div>
            ) : (
              <MathRenderer content={lectureContent} className="whitespace-pre-wrap text-sm leading-relaxed" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // INPUT VIEW
  if (viewState === 'input' && selectedSection && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6"><Button variant="ghost" size="sm" onClick={handleBackToGrades}><ArrowLeft size={16} className="mr-1" />{tr('back', language)}</Button></div>
          <div className="text-center mb-8 animate-fade-in">
            <div className={cn("inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br", section?.color)}>{section?.emoji}</div>
            <h1 className="text-2xl font-bold mb-2">{sectionName}</h1>
            <p className="text-sm text-muted-foreground">{getGradeName(selectedGrade, language)}</p>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">{tr('satWhatStudying', language)}</h3>
            <input type="text" value={materialInput} onChange={(e) => setMaterialInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleMaterialSubmit()} placeholder={tr('satPlaceholder', language)} className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4" autoFocus />
            <div className="flex gap-2">
              {savedMaterials.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => { setActiveMaterial(savedMaterials[0]); setLectureContent(savedMaterials[0].content); setViewState('lecture'); }}>{tr('viewSavedMaterials', language)}</Button>
              )}
              <Button size="sm" onClick={handleMaterialSubmit} disabled={!materialInput.trim()} className="flex-1 gap-2">{tr('generateMaterial', language)}<ArrowRight size={16} /></Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // GRADE VIEW
  if (viewState === 'grade' && selectedSection) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6"><Button variant="ghost" size="sm" onClick={handleBackToSections}><ArrowLeft size={16} className="mr-1" />{tr('back', language)}</Button></div>
          <div className="text-center mb-8 animate-fade-in">
            <div className={cn("inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br", section?.color)}>{section?.emoji}</div>
            <h1 className="text-2xl font-bold mb-2">{sectionName}</h1>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">{tr('selectGrade', language)}</h3>
            <p className="text-xs text-muted-foreground text-center mb-4">{tr('satGradeAvailable', language)}</p>
            <div className="grid grid-cols-5 gap-2 overflow-y-auto">
              {satGrades.map((grade) => {
                const materialCount = getMaterialsBySubjectAndGrade(selectedSection, grade).length;
                return (
                  <button key={grade} onClick={() => handleGradeSelect(grade)} className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary flex flex-col items-center gap-1">
                    <span>{getGradeName(grade, language).replace(language === 'ar' ? 'الصف ' : 'Grade ', language === 'ar' ? 'ص' : 'G')}</span>
                    {materialCount > 0 && <span className="text-[10px] text-primary">{materialCount} {tr('saved', language)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SECTIONS VIEW
  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <GraduationCap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">{tr('satPrep', language)}</h1>
          <p className="text-muted-foreground text-sm">{tr('satClickAnySection', language)}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 overflow-y-auto">
          {satSections.map((sect, index) => (
            <button key={sect.id} onClick={() => handleSectionClick(sect.id)} className={cn("glass-effect rounded-xl p-4 text-left transition-all duration-200 animate-fade-in", "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4")} style={{ animationDelay: `${index * 50}ms` }}>
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white text-xl", sect.color)}>{sect.emoji}</div>
              <div>
                <h3 className="font-semibold text-foreground">{getSubjectName(sect.id, language)}</h3>
                <p className="text-xs text-muted-foreground">{tr('satClickToStudy', language)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
