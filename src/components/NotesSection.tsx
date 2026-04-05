import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ArrowRight, Loader2, FileText, Upload, BookmarkCheck, Trash2, Zap, BookOpen, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamChat, Message } from '@/lib/chat';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MathRenderer } from '@/components/MathRenderer';
import { mergeImagesIntoContent, urlsToInlineImages } from '@/lib/imageInsertion';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';
import { FileNotesGenerator } from '@/components/FileNotesGenerator';
import { useNotes, Note } from '@/hooks/useNotes';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { useLearningStyle } from '@/hooks/useLearningStyle';

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

type NoteLength = 'short' | 'medium' | 'long';
type ViewState = 'menu' | 'subjects' | 'grade' | 'input' | 'notes' | 'file-upload' | 'saved-notes' | 'saved-note-view';

export function NotesSection() {
  const { language } = useThemeLanguage();
  const { currentLevel: adaptiveLevel } = useAdaptiveLevel();
  const { getLearningStylePrompt } = useLearningStyle();
  const [viewState, setViewState] = useState<ViewState>('menu');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [notesContent, setNotesContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [noteLength, setNoteLength] = useState<NoteLength>('medium');
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const { toast } = useToast();
  const { notes, createNote, deleteNote, loading: notesLoading } = useNotes();

  const lang = language === 'ar' ? 'ar' : 'en';

  const fetchNoteDiagrams = useCallback(async (topic: string, subjectName: string, grade: string) => {
    setIsGeneratingImages(true);
    setNoteImages([]);
    const allImages: string[] = [];

    // 1) Wikipedia images with strict filtering
    try {
      const fillerWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'is', 'are', 'and', 'to', 'for', 'with']);
      const coreWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !fillerWords.has(w));
      const coreTopic = coreWords.join(' ') || topic;
      const personPatterns = /president|politician|actor|actress|singer|celebrity|minister|king|queen|prince|trump|biden|obama|leader|chairman|CEO|founder|footballer|player|rapper|musician|comedian|influencer/i;
      const irrelevantPatterns = /community|forum|software|band|album|film|movie|tv series|video game|disambiguation|logo|icon|screenshot|code|terminal|programming|website|debate|policy|politic|portrait|headshot|mugshot|selfie/i;
      const seenUrls = new Set<string>();
      const searchTerms = [`${coreTopic} ${subjectName}`, coreTopic];

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
          if (!thumb || seenUrls.has(thumb) || thumb.endsWith('.svg')) continue;
          if (page.thumbnail?.width < 150 || page.thumbnail?.height < 100) continue;
          if (irrelevantPatterns.test(title) || irrelevantPatterns.test(desc)) continue;
          if (personPatterns.test(title) || personPatterns.test(desc) || personPatterns.test(cats)) continue;
          if (/births|people|living people|deaths/i.test(cats)) continue;
          const titleLower = (title + ' ' + desc).toLowerCase();
          if (!coreWords.some(w => titleLower.includes(w))) continue;
          seenUrls.add(thumb);
          allImages.push(thumb);
        }
      }
    } catch { /* Wikipedia failed */ }

    if (allImages.length > 0) setNoteImages([...allImages]);

    // 2) AI-generated diagrams
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-diagram`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ subject: subjectName, topic, grade, count: 3 }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.images?.length > 0) {
          allImages.push(...data.images);
          setNoteImages([...allImages]);
        }
      }
    } catch (err) {
      console.warn('Diagram generation failed:', err);
    }

    setIsGeneratingImages(false);
  }, []);

  const getLengthPrompt = (length: NoteLength): string => {
    switch (length) {
      case 'short':
        return `Keep it CONCISE but THOROUGH — 4-6 pages.
Include: Overview paragraph (5+ sentences), all key definitions, core concepts as detailed bullets, at least 1 ASCII diagram or table using box-drawing characters (┌─┐│└─┘→), 2-3 worked examples, 3-5 common mistakes, summary checklist.
Use "💡 Pro Tip" boxes. **Bold** all key terms.`;
      case 'medium':
        return `Generate DETAILED content — 12-18 pages.
Include ALL:
1. Introduction & Context (full paragraph, historical background)
2. Definitions (every term, 3-5 sentences each)
3. Core Concepts Deep Dive (subsection per concept, step-by-step)
4. Visual Representations — AT LEAST 3 ASCII diagrams: flowcharts (┌─┐│└─┘→←↑↓▼), comparison tables, hierarchy/tree diagrams
5. Formulas & Rules with derivations
6. Worked Examples (3-5 per concept, varying difficulty)
7. Common Misconceptions (5-8 with wrong vs right)
8. Real-World Applications (3-5)
9. Self-Assessment (5-8 questions with answers)
10. Summary with checklist
Include "💡 Pro Tip" and "⚡ Quick Check" boxes throughout.`;
      case 'long':
        return `Make this a COLOSSAL ENCYCLOPEDIC resource — 30-50 pages, equivalent to a full textbook chapter.

Structure as 10 PARTS:
PART 1: FOUNDATIONS — Overview, historical background, prerequisites
PART 2: DEFINITIONS — 15+ terms in glossary table (Term/Definition/Example/Related)
PART 3: CONCEPTS DEEP DIVE — 6-8 concept sections each with: What It Is, How It Works, ASCII diagram, Key Properties, Connections
PART 4: DIAGRAMS — 6-8 ASCII visuals: concept maps (┌─┐│└─┘→←↑↓▼), flowcharts, comparison tables, classification diagrams, cause-effect, cycles
PART 5: FORMULAS — Complete sheet, step-by-step derivations, special cases
PART 6: EXAMPLES — 5+ easy, 5+ medium, 5+ challenging, 3+ real-world
PART 7: MISCONCEPTIONS — Top 10 mistakes with ❌ wrong vs ✅ correct
PART 8: CONNECTIONS — Cross-topic links, 10+ real-world apps, current research
PART 9: SELF-ASSESSMENT — 35+ questions (recall, conceptual, problem-solving, challenge) with answer key
PART 10: SUMMARY — Section recap, master cheat sheet, study checklist with □ checkboxes

Use --- between parts. Include 10+ "💡 Pro Tip" boxes. Include "⚡ Quick Check" after every section.`;
    }
  };

  const generateNotes = useCallback(async (topic: string) => {
    if (!selectedSubject || !selectedGrade) return;
    setIsLoading(true);
    setNotesContent('');

    const subjectName = getSubjectName(selectedSubject, 'en');
    const lengthPrompt = getLengthPrompt(noteLength);

    const prompt = `Generate structured study notes for ${subjectName} at ${selectedGrade} level about "${topic}".

${lengthPrompt}

IMPORTANT IMAGE PLACEMENT:
- Place exactly 5 image markers throughout your notes at the most relevant points.
- Use the format [IMAGE_PLACEHOLDER_1], [IMAGE_PLACEHOLDER_2], etc.
- Place each marker on its own line, right after the paragraph or section where a visual would help.

IMPORTANT FORMATTING:
- Use emoji section headers consistently (📌, 🧠, 📊, ✅, ⚠️, 📝, 💡, ⚡)
- **Bold** all key terms on first mention
- Use tables for comparisons
- Create ASCII diagrams using box-drawing characters: ┌ ─ ┐ │ └ ┘ → ← ↑ ↓ ▼ ▲
- For ALL mathematical expressions, use LaTeX notation: \\( expression \\) or $$expression$$
- Include "💡 Pro Tip" boxes for study advice`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        adaptiveLevel,
        learningStyle: getLearningStylePrompt(),
        onDelta: (chunk) => { response += chunk; setNotesContent(response); },
        onDone: async () => {
          setIsLoading(false);
          setViewState('notes');
          // Auto-save the note
          const noteTitle = `${getSubjectName(selectedSubject, language)} — ${topic}`;
          await createNote(noteTitle, response);
          toast({ title: lang === 'ar' ? 'تم الحفظ!' : 'Note saved!' });
          // Generate related diagrams
          const subjectName = getSubjectName(selectedSubject, 'en');
          fetchNoteDiagrams(topic, subjectName, selectedGrade!);
        },
        onError: (error) => { setIsLoading(false); toast({ variant: 'destructive', title: 'Error', description: error.message }); },
      });
    } catch { setIsLoading(false); }
  }, [selectedSubject, selectedGrade, toast, noteLength, createNote, language, adaptiveLevel, getLearningStylePrompt]);

  const handleSubjectClick = (subjectId: string) => { setSelectedSubject(subjectId); setSelectedGrade(null); setViewState('grade'); };
  const handleGradeSelect = (grade: string) => { setSelectedGrade(grade); setViewState('input'); };
  const handleTopicSubmit = () => { if (topicInput.trim() && selectedGrade) generateNotes(topicInput.trim()); };
  const handleBackToMenu = () => { setViewState('menu'); setSelectedSubject(null); setSelectedGrade(null); setTopicInput(''); setNotesContent(''); };
  const handleBackToSubjects = () => { setViewState('subjects'); setSelectedSubject(null); setSelectedGrade(null); setTopicInput(''); setNotesContent(''); };
  const handleBackToGrades = () => { setSelectedGrade(null); setViewState('grade'); };
  const handleNewNotes = () => { setViewState('input'); setTopicInput(''); setNotesContent(''); };

  const subjectName = selectedSubject ? getSubjectName(selectedSubject, language) : '';
  const subjectEmoji = subjects.find(s => s.id === selectedSubject)?.emoji;

  // FILE UPLOAD VIEW
  if (viewState === 'file-upload') {
    return <FileNotesGenerator onBack={handleBackToMenu} />;
  }

  // SAVED NOTE VIEW
  if (viewState === 'saved-note-view' && viewingNote) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => { setViewingNote(null); setViewState('saved-notes'); }}>
              <ArrowLeft size={14} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-accent text-lg">📝</div>
            <div className="flex-1">
              <h1 className="font-bold text-sm">{viewingNote.title}</h1>
              <p className="text-xs text-muted-foreground">{new Date(viewingNote.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[65vh]">
            <MathRenderer content={viewingNote.content} className="whitespace-pre-wrap text-sm leading-relaxed" />
          </div>
        </div>
      </div>
    );
  }

  // SAVED NOTES LIST
  if (viewState === 'saved-notes') {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToMenu}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="text-center mb-6 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-emerald-500 to-teal-600">
              <BookmarkCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">
              {lang === 'ar' ? 'ملاحظاتي المحفوظة' : 'My Saved Notes'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {lang === 'ar' ? `${notes.length} ملاحظة` : `${notes.length} notes`}
            </p>
          </div>

          {notesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 glass-effect rounded-2xl">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {lang === 'ar' ? 'لا توجد ملاحظات محفوظة بعد' : 'No saved notes yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === 'ar' ? 'أنشئ ملاحظات جديدة وسيتم حفظها تلقائيًا' : 'Generate notes and they\'ll be auto-saved here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note, idx) => (
                <button
                  key={note.id}
                  onClick={() => { setViewingNote(note); setViewState('saved-note-view'); }}
                  className="w-full glass-effect rounded-2xl p-4 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.01] hover:shadow-lg active:scale-[0.99]"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                      <FileText size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{note.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString()} • {note.content.length > 100 ? `${Math.ceil(note.content.length / 500)} pages` : 'Short'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                        toast({ title: lang === 'ar' ? 'تم الحذف' : 'Note deleted' });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
            <Button variant="ghost" size="sm" onClick={handleBackToMenu}><ArrowLeft size={14} className="mr-1" />{tr('back', language)}</Button>
            <Button variant="outline" size="sm" onClick={handleNewNotes}>{tr('newNotes', language)}</Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-accent text-lg">{subjectEmoji}</div>
            <div>
              <h1 className="font-bold text-sm">{subjectName} {tr('notes', language)}</h1>
              <p className="text-xs text-muted-foreground">{getGradeName(selectedGrade!, language)} • {topicInput}</p>
            </div>
          </div>
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[65vh]">
            <MathRenderer 
              content={noteImages.length > 0 
                ? mergeImagesIntoContent(notesContent, urlsToInlineImages(noteImages, topicInput))
                : notesContent
              } 
              className="whitespace-pre-wrap text-sm leading-relaxed" 
            />
          </div>

          {/* Loading indicator for images being generated */}
          {isGeneratingImages && noteImages.length === 0 && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 glass-effect rounded-xl justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{lang === 'ar' ? 'جاري إنشاء الرسوم البيانية...' : 'Loading diagrams...'}</span>
            </div>
          )}
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

            {/* Length Selector */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
                {lang === 'ar' ? 'مستوى التفصيل' : 'Detail Level'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'short' as NoteLength, icon: <Zap size={14} />, label: lang === 'ar' ? 'قصير' : 'Short' },
                  { key: 'medium' as NoteLength, icon: <BookOpen size={14} />, label: lang === 'ar' ? 'متوسط' : 'Medium' },
                  { key: 'long' as NoteLength, icon: <GraduationCap size={14} />, label: lang === 'ar' ? 'طويل' : 'Long' },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setNoteLength(opt.key)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
                      noteLength === opt.key
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

  if (viewState === 'subjects') {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToMenu}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
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

  // MAIN MENU
  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <FileText className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">{tr('notes', language)}</h1>
          <p className="text-muted-foreground text-sm">
            {lang === 'ar' ? 'اختر طريقة إنشاء الملاحظات' : 'Choose how to generate your notes'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Generate by Topic */}
          <button
            onClick={() => setViewState('subjects')}
            className="glass-effect rounded-2xl p-6 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                <FileText className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground">
                  {lang === 'ar' ? 'ملاحظات حسب الموضوع' : 'Notes by Topic'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {lang === 'ar' ? 'اختر مادة واكتب موضوعًا للحصول على ملاحظات ذكية' : 'Pick a subject & type a topic for AI-generated notes'}
                </p>
              </div>
              <ArrowRight className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>

          {/* Upload File */}
          <button
            onClick={() => setViewState('file-upload')}
            className="glass-effect rounded-2xl p-6 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            style={{ animationDelay: '50ms' }}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <Upload className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground">
                  {lang === 'ar' ? 'رفع ملف' : 'Upload a File'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {lang === 'ar' ? 'ارفع ملفًا وسيقوم الذكاء الاصطناعي بإنشاء ملاحظات مفصلة منه' : 'Drop a file and AI creates detailed notes from it'}
                </p>
              </div>
              <ArrowRight className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>

          {/* Saved Notes */}
          <button
            onClick={() => setViewState('saved-notes')}
            className="glass-effect rounded-2xl p-6 text-left transition-all duration-200 animate-fade-in group hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <BookmarkCheck className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground">
                  {lang === 'ar' ? 'ملاحظاتي المحفوظة' : 'My Saved Notes'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {lang === 'ar' ? 'عرض وإدارة ملاحظاتك المحفوظة' : 'View and manage your saved notes'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notes.length > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{notes.length}</span>
                )}
                <ArrowRight className="text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
