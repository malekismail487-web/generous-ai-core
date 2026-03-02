import { useState, useCallback, useRef } from 'react';
import { ArrowLeft, Upload, FileText, Loader2, File, X, Zap, BookOpen, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/MathRenderer';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type NoteLength = 'short' | 'medium' | 'long';

const lengthConfig: Record<NoteLength, { icon: React.ReactNode; label: { en: string; ar: string }; desc: { en: string; ar: string }; color: string }> = {
  short: {
    icon: <Zap className="w-5 h-5" />,
    label: { en: 'Short Summary', ar: 'ملخص قصير' },
    desc: { en: 'Quick overview — key points & definitions only', ar: 'نظرة سريعة — النقاط والتعريفات الرئيسية فقط' },
    color: 'from-amber-500 to-orange-500',
  },
  medium: {
    icon: <BookOpen className="w-5 h-5" />,
    label: { en: 'Medium Notes', ar: 'ملاحظات متوسطة' },
    desc: { en: 'Balanced notes with explanations & examples', ar: 'ملاحظات متوازنة مع شرح وأمثلة' },
    color: 'from-blue-500 to-cyan-500',
  },
  long: {
    icon: <GraduationCap className="w-5 h-5" />,
    label: { en: 'Full Detailed Notes', ar: 'ملاحظات تفصيلية كاملة' },
    desc: { en: '32+ slides of comprehensive explanation with diagrams', ar: '32+ شريحة من الشرح الشامل مع الرسوم البيانية' },
    color: 'from-violet-500 to-purple-600',
  },
};

function getLengthPrompt(length: NoteLength): string {
  switch (length) {
    case 'short':
      return `Generate a SHORT, concise summary of the file content. Keep it to 1-2 pages maximum.
Focus on:
- Key definitions (2-3 sentences each)
- Main concepts as bullet points
- Critical formulas or rules
- A brief recap paragraph

Use clear headings with emoji icons (e.g., 📌 Key Definitions, 🔑 Main Concepts).
Be concise — no fluff.`;

    case 'medium':
      return `Generate MEDIUM-length study notes from the file content. Aim for 5-8 pages.
Include:
1. 📋 **Overview** — What is this topic about?
2. 📌 **Key Definitions** — Every important term with clear definitions
3. 🧠 **Core Concepts** — Detailed explanation of each major concept
4. 📊 **Diagrams & Relationships** — Describe relationships using ASCII diagrams, flowcharts, or tables where helpful
5. ✅ **Examples** — 2-3 worked examples per concept
6. ⚠️ **Common Mistakes** — What students get wrong
7. 📝 **Summary** — Recap of the most important points

Use structured formatting with colored/bold key terms. Make it study-friendly.`;

    case 'long':
      return `Generate EXTREMELY DETAILED and COMPREHENSIVE study notes from the file content. This should be equivalent to 32+ slides of professional educational content.

Structure it as a FULL LECTURE SERIES:

## 📖 Part 1: Introduction & Context
- What is this topic? Why does it matter?
- Historical background or real-world relevance
- Prerequisites and foundational concepts

## 📌 Part 2: Definitions & Terminology
- EVERY term defined with precision
- Etymology where helpful
- Related terms and distinctions

## 🧠 Part 3: Core Concepts Deep Dive
- Each concept gets its own detailed section
- Step-by-step breakdowns
- Multiple perspectives and approaches
- Connections between concepts

## 📊 Part 4: Visual Representations
- ASCII diagrams, flowcharts, and tables
- Process flows described visually
- Comparison tables between related concepts
- Hierarchical structures

## 🔬 Part 5: Detailed Analysis
- In-depth explanations of mechanisms/processes
- Cause-and-effect relationships
- Mathematical derivations (if applicable)
- Scientific reasoning chains

## ✍️ Part 6: Worked Examples
- 5+ detailed examples per major concept
- Step-by-step solutions
- Varying difficulty levels
- Real-world application examples

## ⚠️ Part 7: Common Misconceptions & Pitfalls
- Detailed analysis of common errors
- Why students make these mistakes
- How to avoid them
- Correct vs incorrect reasoning

## 🔗 Part 8: Connections & Applications
- Cross-topic connections
- Real-world applications
- Related fields and disciplines
- Current research or developments

## 📝 Part 9: Comprehensive Summary
- Section-by-section recap
- Key takeaways numbered list
- Quick-reference formula/fact sheet
- Study checklist

IMPORTANT FORMATTING RULES:
- Use emoji section headers consistently
- Bold all key terms on first mention
- Use tables for comparisons
- Use numbered steps for processes
- Include "💡 Pro Tip" boxes for study advice
- Use "⚡ Quick Check" questions throughout
- Create ASCII diagrams for visual concepts`;
  }
}

export function FileNotesGenerator({ onBack }: { onBack: () => void }) {
  const { language } = useThemeLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [selectedLength, setSelectedLength] = useState<NoteLength | null>(null);
  const [notesContent, setNotesContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractFileContent = useCallback(async (file: File): Promise<string> => {
    setIsExtracting(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (['txt', 'md', 'csv', 'json', 'xml'].includes(ext || '')) {
        return await file.text();
      }

      if (ext === 'pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n\n';
        }
        return text;
      }

      if (['docx', 'doc'].includes(ext || '')) {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      }

      // Fallback: try reading as text
      return await file.text();
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleFileDrop = useCallback(async (file: File) => {
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 20MB' });
      return;
    }
    setSelectedFile(file);
    try {
      const content = await extractFileContent(file);
      if (!content.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not extract text from file' });
        setSelectedFile(null);
        return;
      }
      setFileContent(content);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to read file' });
      setSelectedFile(null);
    }
  }, [extractFileContent, toast]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileDrop(file);
  }, [handleFileDrop]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  }, [handleFileDrop]);

  const generateNotes = useCallback(async () => {
    if (!fileContent || !selectedLength) return;
    setIsLoading(true);
    setNotesContent('');

    const lengthPrompt = getLengthPrompt(selectedLength);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fileContent,
          fileName: selectedFile?.name || 'uploaded-file',
          customPrompt: lengthPrompt,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate notes');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setNotesContent(fullText);
            }
          } catch { /* skip */ }
        }
      }

      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  }, [fileContent, selectedLength, selectedFile, toast]);

  const handleReset = () => {
    setSelectedFile(null);
    setFileContent('');
    setSelectedLength(null);
    setNotesContent('');
  };

  const l = (key: 'en' | 'ar') => key;
  const lang = language === 'ar' ? 'ar' : 'en';

  // NOTES VIEW
  if (notesContent) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} className="mr-1" />{tr('back', language)}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              {lang === 'ar' ? 'ملاحظات جديدة' : 'New Notes'}
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br text-white", lengthConfig[selectedLength!]?.color)}>
              <FileText size={16} />
            </div>
            <div>
              <h1 className="font-bold text-sm">{selectedFile?.name}</h1>
              <p className="text-xs text-muted-foreground">{lengthConfig[selectedLength!]?.label[lang]}</p>
            </div>
          </div>

          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[65vh]">
            {isLoading && !notesContent && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">{tr('generatingNotes', language)}</span>
              </div>
            )}
            <MathRenderer content={notesContent} className="whitespace-pre-wrap text-sm leading-relaxed" />
          </div>
        </div>
      </div>
    );
  }

  // LENGTH SELECTION (after file uploaded)
  if (selectedFile && fileContent && !selectedLength) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>

          <div className="text-center mb-6 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/50 mb-4">
              <File size={16} className="text-primary" />
              <span className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</span>
              <button onClick={handleReset} className="ml-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
            <h1 className="text-xl font-bold mb-2">
              {lang === 'ar' ? 'اختر مستوى التفصيل' : 'Choose Detail Level'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {lang === 'ar' ? 'ما مدى تفصيل الملاحظات التي تريدها؟' : 'How detailed do you want your notes?'}
            </p>
          </div>

          <div className="space-y-3 animate-fade-in">
            {(Object.entries(lengthConfig) as [NoteLength, typeof lengthConfig.short][]).map(([key, config], idx) => (
              <button
                key={key}
                onClick={() => { setSelectedLength(key); }}
                className="w-full glass-effect rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] group"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white", config.color)}>
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground">{config.label[lang]}</h3>
                    <p className="text-sm text-muted-foreground">{config.desc[lang]}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // LOADING (after length selected, generating)
  if (selectedLength && !notesContent) {
    // Auto-trigger generation
    if (!isLoading) {
      generateNotes();
    }
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{tr('generatingNotes', language)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {lang === 'ar' ? 'يتم تحليل الملف...' : 'Analyzing your file...'}
          </p>
        </div>
      </div>
    );
  }

  // FILE UPLOAD VIEW (initial)
  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
          </Button>
        </div>

        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <Upload className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">
            {lang === 'ar' ? 'رفع ملف للملاحظات' : 'Upload File for Notes'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {lang === 'ar' ? 'ارفع ملفك وسيقوم الذكاء الاصطناعي بإنشاء ملاحظات احترافية' : 'Drop your file and AI will generate professional study notes'}
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "glass-effect rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 border-2 border-dashed animate-fade-in",
            dragActive
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-border/50 hover:border-primary/50 hover:bg-secondary/30",
            isExtracting && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.csv"
            onChange={handleFileInput}
            className="hidden"
          />

          {isExtracting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {lang === 'ar' ? 'جارٍ استخراج النص...' : 'Extracting text...'}
              </p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                {lang === 'ar' ? 'اسحب الملف هنا' : 'Drag & Drop your file here'}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {lang === 'ar' ? 'أو انقر للاختيار' : 'or click to browse'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {['PDF', 'DOCX', 'TXT', 'MD'].map(fmt => (
                  <span key={fmt} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/80 text-muted-foreground">
                    {fmt}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
