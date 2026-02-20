import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Loader2, Sparkles, Copy, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MathRenderer } from '@/components/MathRenderer';

export function AIStudyPlan() {
  const { user } = useAuth();
  const { t, language } = useThemeLanguage();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [duration, setDuration] = useState('30');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const subjectOptions = [
    'Math', 'Science', 'English', 'History', 'Geography', 'Physics',
    'Chemistry', 'Biology', 'Computer Science', 'Arabic', 'Islamic Studies',
    'Art', 'Music', 'Physical Education', 'Economics', 'Psychology',
  ];

  const generatePlan = async () => {
    if (!topic || !subject || !gradeLevel) {
      toast.error(t('Please fill in subject, topic and grade level', 'يرجى ملء المادة والموضوع والمستوى'));
      return;
    }

    setIsGenerating(true);
    setGeneratedPlan('');

    try {
      const systemPrompt = `You are an expert AI study coach that creates personalized study plans for students. Generate detailed, actionable study plans that students can follow on their own.

${language === 'ar' ? 'CRITICAL: Respond entirely in Arabic.' : ''}

Create a comprehensive study plan with these sections:
1. **Study Plan Overview** - Subject, topic, estimated time
2. **Learning Goals** - 3-5 specific things the student will master
3. **Prerequisites** - What you should already know
4. **Study Materials Needed** - Books, tools, websites
5. **Study Schedule:**
   - **Warm-up** (5 min) - Quick review of basics
   - **Core Learning** (15 min) - Main concepts to study
   - **Practice Problems** (10 min) - Exercises to try
   - **Self-Assessment** (5 min) - Quiz yourself
   - **Review & Reflect** (5 min) - Summarize what you learned
6. **Key Concepts to Remember** - Important formulas, facts, or ideas
7. **Practice Questions** - 5 practice questions with answers
8. **Helpful Resources** - YouTube links, websites, apps
9. **Study Tips** - How to study this topic effectively

Be encouraging, student-friendly, and include specific examples.`;

      const userPrompt = `Create a personal study plan for me:
- Subject: ${subject}
- Topic: ${topic}
- Grade Level: ${gradeLevel}
- Study Duration: ${duration} minutes
${additionalNotes ? `- My Notes: ${additionalNotes}` : ''}`;

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Generation failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              setGeneratedPlan(content);
            }
          } catch {}
        }
      }

      toast.success(t('Study plan generated!', 'تم إنشاء خطة الدراسة!'));
    } catch (e) {
      console.error('Generation error:', e);
      toast.error(t('Failed to generate plan', 'فشل إنشاء الخطة'));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPlan = () => {
    navigator.clipboard.writeText(generatedPlan);
    toast.success(t('Copied to clipboard!', 'تم النسخ!'));
  };

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{t('AI Study Plan', 'خطة دراسة بالذكاء الاصطناعي')}</h2>
            <p className="text-sm text-muted-foreground">{t('Get a personalized study plan in seconds', 'احصل على خطة دراسة مخصصة في ثوانٍ')}</p>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-card rounded-2xl border border-border/50 p-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('Subject', 'المادة')}</label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select subject', 'اختر المادة')} />
              </SelectTrigger>
              <SelectContent>
                {subjectOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('Grade Level', 'المستوى الدراسي')}</label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select grade', 'اختر المستوى')} />
              </SelectTrigger>
              <SelectContent>
                {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
                  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('Topic', 'الموضوع')}</label>
            <Input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={t('e.g., Quadratic Equations', 'مثال: المعادلات التربيعية')}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('Study Duration (min)', 'مدة الدراسة (دقائق)')}</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['15', '30', '45', '60', '90', '120'].map(d => (
                  <SelectItem key={d} value={d}>{d} {t('min', 'دقيقة')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-medium mb-1.5 block">{t('What do you need help with? (optional)', 'بماذا تحتاج مساعدة؟ (اختياري)')}</label>
            <Textarea
              value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)}
              placeholder={t('e.g., I struggle with word problems...', 'مثال: أجد صعوبة في المسائل اللفظية...')}
              rows={2}
            />
          </div>

          <div className="sm:col-span-2">
            <Button
              onClick={generatePlan}
              disabled={isGenerating || !topic || !subject || !gradeLevel}
              className="w-full"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('Generating...', 'جاري الإنشاء...')}</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> {t('Generate My Study Plan', 'إنشاء خطة دراستي')}</>
              )}
            </Button>
          </div>
        </div>

        {/* Generated Plan */}
        {generatedPlan && (
          <div className="bg-card rounded-2xl border border-border/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                {t('Your Study Plan', 'خطة دراستك')}
              </h3>
              <Button variant="outline" size="sm" onClick={copyPlan}>
                <Copy className="w-3.5 h-3.5 mr-1" /> {t('Copy', 'نسخ')}
              </Button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MathRenderer content={generatedPlan} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
