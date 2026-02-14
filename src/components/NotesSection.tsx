import { useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MathRenderer } from '@/components/MathRenderer';
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

type ViewState = 'subjects' | 'grade' | 'input' | 'notes';

export function NotesSection() {
  const { language } = useThemeLanguage();
  const [viewState, setViewState] = useState<ViewState>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [notesContent, setNotesContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const generateNotes = useCallback(async (topic: string) => {
    if (!selectedSubject || !selectedGrade) return;
    setIsLoading(true);
    setNotesContent('');

    const subjectName = getSubjectName(selectedSubject, 'en');
    const prompt = `Generate structured study notes for ${subjectName} at ${selectedGrade} level about "${topic}".\n\nCreate well-organized notes that include:\n1. Main topic heading\n2. Key definitions\n3. Important concepts with bullet points\n4. Formulas or rules (if applicable)\n5. Quick summary\n\nIMPORTANT: For ALL mathematical expressions, use LaTeX notation:\n- Inline: \\( expression \\) or $expression$\n- Display: \\[ expression \\] or $$expression$$\n\nFormat the notes clearly for easy studying. Be concise but comprehensive.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        onDelta: (chunk) => { response += chunk; setNotesContent(response); },
        onDone: () => { setIsLoading(false); setViewState('notes'); },
        onError: (error) => { setIsLoading(false); toast({ variant: 'destructive', title: 'Error', description: error.message }); },
      });
    } catch { setIsLoading(false); }
  }, [selectedSubject, selectedGrade, toast]);

  const handleSubjectClick = (subjectId: string) => { setSelectedSubject(subjectId); setSelectedGrade(null); setViewState('grade'); };
  const handleGradeSelect = (grade: string) => { setSelectedGrade(grade); setViewState('input'); };
  const handleTopicSubmit = () => { if (topicInput.trim() && selectedGrade) generateNotes(topicInput.trim()); };
  const handleBackToSubjects = () => { setViewState('subjects'); setSelectedSubject(null); setSelectedGrade(null); setTopicInput(''); setNotesContent(''); };
  const handleBackToGrades = () => { setSelectedGrade(null); setViewState('grade'); };
  const handleNewNotes = () => { setViewState('input'); setTopicInput(''); setNotesContent(''); };

  const subjectName = selectedSubject ? getSubjectName(selectedSubject, language) : '';
  const subjectEmoji = subjects.find(s => s.id === selectedSubject)?.emoji;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{tr('generatingNotes', language)}</p>
        </div>
      </div>
    );
  }

  if (viewState === 'notes' && notesContent) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={handleBackToSubjects}><ArrowLeft size={14} className="mr-1" />{tr('back', language)}</Button>
            <Button variant="outline" size="sm" onClick={handleNewNotes}>{tr('newNotes', language)}</Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-accent text-lg">{subjectEmoji}</div>
            <div>
              <h1 className="font-bold text-sm">{subjectName} {tr('notes', language)}</h1>
              <p className="text-xs text-muted-foreground">{getGradeName(selectedGrade!, language)} • {topicInput}</p>
            </div>
          </div>
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[60vh]">
            <MathRenderer content={notesContent} className="whitespace-pre-wrap text-sm leading-relaxed" />
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'input' && selectedSubject && selectedGrade) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6"><Button variant="ghost" size="sm" onClick={handleBackToGrades}><ArrowLeft size={16} className="mr-1" />{tr('back', language)}</Button></div>
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-primary to-accent">{subjectEmoji}</div>
            <h1 className="text-2xl font-bold mb-2">{subjectName} {tr('notes', language)}</h1>
            <p className="text-sm text-muted-foreground">{getGradeName(selectedGrade, language)}</p>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-2 text-center text-lg">{tr('notesTopicQuestion', language)}</h3>
            <input type="text" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleTopicSubmit()} placeholder={tr('notesPlaceholder', language)} className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4" autoFocus />
            <Button size="sm" onClick={handleTopicSubmit} disabled={!topicInput.trim()} className="w-full gap-2">{tr('generateNotes', language)}<ArrowRight size={16} /></Button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'grade' && selectedSubject) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6"><Button variant="ghost" size="sm" onClick={handleBackToSubjects}><ArrowLeft size={16} className="mr-1" />{tr('back', language)}</Button></div>
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-2xl bg-gradient-to-br from-primary to-accent">{subjectEmoji}</div>
            <h1 className="text-2xl font-bold mb-2">{subjectName} {tr('notes', language)}</h1>
          </div>
          <div className="glass-effect rounded-2xl p-5 animate-fade-in">
            <h3 className="font-semibold mb-4 text-center">{tr('selectGrade', language)}</h3>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-[50vh]">
              {grades.map((grade) => (
                <button key={grade} onClick={() => handleGradeSelect(grade)} className="px-3 py-2 rounded-lg text-xs font-medium transition-all bg-secondary/50 text-muted-foreground hover:bg-secondary">{getGradeName(grade, language)}</button>
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <FileText className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">{tr('notes', language)}</h1>
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
