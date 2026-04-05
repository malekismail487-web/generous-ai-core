import { useState, useCallback, useRef } from 'react';
import { ArrowLeft, Upload, FileText, Loader2, File, X, Zap, BookOpen, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/MathRenderer';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { useLearningStyle } from '@/hooks/useLearningStyle';

type NoteLength = 'short' | 'medium' | 'long';

const lengthConfig: Record<NoteLength, { icon: React.ReactNode; label: { en: string; ar: string }; desc: { en: string; ar: string }; color: string }> = {
  short: {
    icon: <Zap className="w-5 h-5" />,
    label: { en: 'Concise Notes', ar: 'ملاحظات مختصرة' },
    desc: { en: '4-6 pages — definitions, diagrams & examples', ar: '4-6 صفحات — تعريفات، رسوم بيانية وأمثلة' },
    color: 'from-amber-500 to-orange-500',
  },
  medium: {
    icon: <BookOpen className="w-5 h-5" />,
    label: { en: 'Detailed Notes', ar: 'ملاحظات مفصلة' },
    desc: { en: '12-18 pages — deep explanations, 3+ diagrams & practice', ar: '12-18 صفحة — شرح عميق، 3+ رسوم وتمارين' },
    color: 'from-blue-500 to-cyan-500',
  },
  long: {
    icon: <GraduationCap className="w-5 h-5" />,
    label: { en: 'Colossal Textbook', ar: 'مرجع شامل ضخم' },
    desc: { en: '30-50 pages — full textbook chapter with 8+ diagrams', ar: '30-50 صفحة — فصل كتاب كامل مع 8+ رسوم بيانية' },
    color: 'from-violet-500 to-purple-600',
  },
};

function getLengthPrompt(length: NoteLength): string {
  switch (length) {
    case 'short':
      return `Generate a CONCISE but THOROUGH summary of the file content. Aim for 4-6 pages.

Include ALL of the following sections:

## 📋 Overview
- Clear introduction (3-5 sentences) explaining the topic and its importance

## 📌 Key Definitions
- Every important term with clear, precise definitions (2-3 sentences each)
- **Bold** all key terms

## 🧠 Core Concepts
- Each major concept as a detailed bullet point with explanation
- Include at least 1 ASCII diagram or table

## 📊 Visual Summary
Create at least ONE of the following:
- ASCII flowchart showing relationships between concepts
- Comparison table between related ideas
- Process diagram using box-drawing characters (┌─┐│└─┘)

## 🔬 Key Formulas & Rules
- Important formulas with brief explanations
- For ALL math: use LaTeX \\( expression \\) or $$expression$$

## ✅ Quick Examples
- 2-3 worked examples showing concept application

## ⚠️ Watch Out
- 3-5 common mistakes students make

## 📝 Summary & Checklist
- Numbered list of key takeaways
- Quick-reference fact sheet

FORMATTING: Use emoji headers, **bold** key terms, tables for comparisons, ASCII diagrams. Include "💡 Pro Tip" boxes.`;

    case 'medium':
      return `Generate DETAILED and COMPREHENSIVE study notes from the file content. Aim for 12-18 pages of rich educational content.

Structure with ALL these sections:

## 📖 Introduction & Context
- What is this topic? Why does it matter? (5-8 sentences)
- Historical background or real-world relevance
- Prerequisites the student should know

## 📌 Definitions & Terminology
- EVERY important term with precise definitions
- Related terms and how they differ
- Etymology where helpful

## 🧠 Core Concepts Deep Dive
- Each concept gets its own subsection with:
  - Detailed explanation (paragraph form)
  - Step-by-step breakdown
  - How it connects to other concepts
- Include "💡 Pro Tip" boxes for study advice throughout

## 📊 Visual Representations & Diagrams
Create AT LEAST 3 of these visual elements:
- ASCII flowcharts showing processes (use ┌─┐│└─┘→←↑↓ characters)
- Comparison tables between related concepts
- Hierarchy/tree diagrams
- Process flow diagrams
- Venn diagram descriptions
- Mind map structures using ASCII art

Example diagram format:
\`\`\`
┌──────────────┐     ┌──────────────┐
│   Concept A  │────→│   Concept B  │
└──────┬───────┘     └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────┐     ┌──────────────┐
│  Sub-topic 1 │     │  Sub-topic 2 │
└──────────────┘     └──────────────┘
\`\`\`

## 🔬 Formulas, Rules & Derivations
- Every important formula with step-by-step breakdown
- Show HOW formulas are derived where applicable
- LaTeX for ALL math: \\( expression \\) or $$expression$$

## ✍️ Worked Examples
- 3-5 detailed examples per major concept
- Step-by-step solutions with reasoning
- Varying difficulty (easy → medium → challenging)

## ⚠️ Common Misconceptions & Pitfalls
- 5-8 common errors with detailed explanations
- "Wrong vs Right" comparison format
- Why students make these mistakes

## 🔗 Real-World Applications
- 3-5 practical applications
- How this topic appears in everyday life

## ⚡ Self-Assessment Questions
- 5-8 practice questions with answers
- Mix of multiple choice, short answer, and problem-solving

## 📝 Comprehensive Summary
- Section-by-section recap
- Key takeaways numbered list
- Quick-reference formula/fact sheet
- Study checklist with checkboxes

FORMATTING: Use emoji headers consistently, **bold** all key terms, create tables for comparisons, ASCII diagrams for visual concepts. Include "💡 Pro Tip" and "⚡ Quick Check" boxes throughout.`;

    case 'long':
      return `Generate an EXHAUSTIVE, ENCYCLOPEDIC study resource from the file content. This should be a COLOSSAL reference — equivalent to 60+ slides or a full textbook chapter. Aim for 30-50 pages of professional educational content.

Structure as a COMPLETE TEXTBOOK CHAPTER:

# 📖 PART 1: FOUNDATIONS (Introduction & Context)
## 1.1 Topic Overview
- Comprehensive introduction (full paragraph, 8-12 sentences)
- Why this topic matters in the real world
- Where it fits in the broader field

## 1.2 Historical Background
- Timeline of key discoveries/developments
- Notable figures and their contributions
- Evolution of understanding over time

## 1.3 Prerequisites Review
- Quick recap of foundational knowledge needed
- Key formulas/concepts from prior learning
- Bridge from what students already know

---

# 📌 PART 2: DEFINITIONS & TERMINOLOGY
## 2.1 Core Terminology
- EVERY term defined with precision (3-5 sentences each)
- Etymology and origin where helpful
- How terms relate to each other

## 2.2 Glossary Table
| Term | Definition | Example | Related Terms |
|------|-----------|---------|---------------|
(Include 15+ terms)

---

# 🧠 PART 3: CORE CONCEPTS DEEP DIVE
For EACH major concept, provide:
## 3.X [Concept Name]
### What It Is
- Full paragraph explanation
### How It Works
- Step-by-step mechanism/process
### Visual Representation
- ASCII diagram specific to this concept
### Key Properties/Characteristics
- Detailed bullet points
### Connection to Other Concepts
- How this relates to everything else

(Repeat for EVERY concept — minimum 6-8 concept sections)

---

# 📊 PART 4: DIAGRAMS & VISUAL LEARNING
Create AT LEAST 6-8 different visual elements:

## 4.1 Concept Map
\`\`\`
                    ┌─────────────────┐
                    │   MAIN TOPIC    │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │ Concept A │ │ Concept B │ │ Concept C │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              ▼              ▼              ▼
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │ Detail A1 │ │ Detail B1 │ │ Detail C1 │
        └───────────┘ └───────────┘ └───────────┘
\`\`\`

## 4.2 Process Flowchart
(Create a detailed step-by-step flow)

## 4.3 Comparison Tables
(Multiple tables comparing related concepts)

## 4.4 Classification Diagrams
(Hierarchical organization)

## 4.5 Cause-Effect Diagrams
## 4.6 Timeline Diagrams (if applicable)
## 4.7 Cycle Diagrams (if applicable)
## 4.8 Relationship Maps

---

# 🔬 PART 5: FORMULAS, RULES & DERIVATIONS
## 5.1 Complete Formula Sheet
- Every formula with full derivation
- Units and dimensions
- Conditions of applicability

## 5.2 Step-by-Step Derivations
- Show the mathematical reasoning chain
- Every step explained in words

## 5.3 Special Cases & Boundary Conditions
- What happens at extremes?
- Edge cases and exceptions

---

# ✍️ PART 6: EXTENSIVE WORKED EXAMPLES
## 6.1 Foundational Examples (Easy)
- 5+ basic examples with full solutions
- Focus on correct procedure

## 6.2 Intermediate Examples (Medium)
- 5+ examples requiring multiple concepts
- Multi-step solutions

## 6.3 Advanced Examples (Challenging)
- 5+ complex problems
- Real exam-style questions
- Tricky variations

## 6.4 Real-World Application Problems
- 3-5 problems from actual scenarios

---

# ⚠️ PART 7: MISCONCEPTIONS & ERROR ANALYSIS
## 7.1 Top 10 Student Mistakes
For each:
- ❌ The wrong approach
- ✅ The correct approach
- 🤔 Why students make this error
- 💡 How to avoid it

## 7.2 Tricky Distinctions
- Concepts that are easily confused
- Side-by-side comparison tables

---

# 🔗 PART 8: CONNECTIONS & APPLICATIONS
## 8.1 Cross-Topic Connections
- How this topic links to other subjects
- Interdisciplinary applications

## 8.2 Real-World Applications
- 10+ practical applications with descriptions
- Industry/career relevance

## 8.3 Current Research & Developments
- Modern applications and discoveries

---

# ⚡ PART 9: SELF-ASSESSMENT & PRACTICE
## 9.1 Quick Recall Questions (10 questions)
## 9.2 Conceptual Understanding (10 questions)
## 9.3 Problem-Solving Exercises (10 problems)
## 9.4 Challenge Problems (5 advanced problems)
## 9.5 Answer Key with Explanations

---

# 📝 PART 10: COMPREHENSIVE SUMMARY
## 10.1 Section-by-Section Recap
## 10.2 Master Cheat Sheet
- ALL formulas in one place
- ALL key terms in one place
- ALL critical relationships

## 10.3 Study Checklist
- □ I can define all key terms
- □ I understand each core concept
- □ I can solve basic problems
- □ I can solve advanced problems
- □ I can explain real-world applications

## 10.4 Recommended Study Path
- Suggested order for reviewing material
- Time estimates per section

CRITICAL FORMATTING:
- Use emoji section headers CONSISTENTLY
- **Bold** ALL key terms on first mention
- Create EXTENSIVE tables for comparisons
- Use box-drawing ASCII characters for ALL diagrams
- Include "💡 Pro Tip" boxes throughout (minimum 10)
- Include "⚡ Quick Check" questions after every major section
- Use LaTeX for ALL math: \\( expression \\) or $$expression$$
- Number everything for easy reference
- Use horizontal rules (---) between major parts`;
  }
}

export function FileNotesGenerator({ onBack }: { onBack: () => void }) {
  const { language } = useThemeLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentLevel: adaptiveLevel } = useAdaptiveLevel();
  const { getLearningStylePrompt } = useLearningStyle();

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
          adaptiveLevel,
          learningStyle: getLearningStylePrompt(),
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
