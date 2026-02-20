import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Loader2, Sparkles, Save, Copy, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MathRenderer } from '@/components/MathRenderer';

interface Subject {
  id: string;
  name: string;
}

interface LessonPlanGeneratorProps {
  schoolId: string;
  teacherId: string;
  onSaved?: () => void;
}

export function LessonPlanGenerator({ schoolId, teacherId, onSaved }: LessonPlanGeneratorProps) {
  const { t, language } = useThemeLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [duration, setDuration] = useState('45');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSubjects();
  }, [schoolId]);

  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId);
    setSubjects(data || []);
  };

  const generatePlan = async () => {
    if (!topic || !selectedSubject || !gradeLevel) {
      toast.error(t('Please fill in subject, topic and grade level', 'يرجى ملء المادة والموضوع والمستوى'));
      return;
    }

    setIsGenerating(true);
    setGeneratedPlan('');

    try {
      const subjectName = subjects.find(s => s.id === selectedSubject)?.name || selectedSubject;
      
      const systemPrompt = `You are an expert curriculum designer and lesson plan creator. Generate detailed, structured, and actionable lesson plans that teachers can immediately use in their classrooms.

${language === 'ar' ? 'CRITICAL: Respond entirely in Arabic.' : ''}

Create a comprehensive lesson plan with these sections:
1. **Lesson Overview** - Title, subject, grade, duration, objectives
2. **Learning Objectives** - 3-5 specific, measurable SMART objectives
3. **Prerequisites** - What students should already know
4. **Materials Needed** - All resources and materials
5. **Lesson Structure:**
   - **Warm-up/Hook** (5 min) - Engaging opener
   - **Introduction** (10 min) - Present new concepts
   - **Guided Practice** (15 min) - Teacher-led activities
   - **Independent Practice** (10 min) - Student work
   - **Closure** (5 min) - Summary and assessment
6. **Differentiation Strategies** - For struggling, on-level, and advanced students
7. **Assessment** - Formative and summative methods
8. **Extension Activities** - Homework or enrichment
9. **Teacher Notes** - Tips and common misconceptions

Be specific with activities, questions to ask, and expected student responses.`;

      const userPrompt = `Create a lesson plan for:
- Subject: ${subjectName}
- Topic: ${topic}
- Grade Level: ${gradeLevel}
- Duration: ${duration} minutes
${additionalNotes ? `- Additional Notes: ${additionalNotes}` : ''}`;

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

      toast.success(t('Lesson plan generated!', 'تم إنشاء خطة الدرس!'));
    } catch (e) {
      console.error('Generation error:', e);
      toast.error(t('Failed to generate. Check your API key.', 'فشل الإنشاء. تحقق من مفتاح API.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const savePlan = async () => {
    if (!generatedPlan || !selectedSubject) return;
    setIsSaving(true);

    try {
      const subjectName = subjects.find(s => s.id === selectedSubject)?.name || 'Lesson';
      const { error } = await supabase.from('lesson_plans').insert({
        teacher_id: teacherId,
        subject_id: selectedSubject,
        school_id: schoolId,
        title: `${subjectName}: ${topic}`,
        description: `AI-generated lesson plan for ${gradeLevel}`,
        content_json: { markdown: generatedPlan, topic, gradeLevel, duration },
        objectives: topic,
        is_published: false,
      });

      if (error) throw error;
      toast.success(t('Lesson plan saved!', 'تم حفظ خطة الدرس!'));
      onSaved?.();
    } catch (e) {
      console.error('Save error:', e);
      toast.error(t('Failed to save', 'فشل الحفظ'));
    } finally {
      setIsSaving(false);
    }
  };

  const copyPlan = () => {
    navigator.clipboard.writeText(generatedPlan);
    toast.success(t('Copied to clipboard!', 'تم النسخ!'));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t('AI Lesson Plan Generator', 'مولد خطط الدروس بالذكاء الاصطناعي')}</h2>
          <p className="text-sm text-muted-foreground">{t('Generate complete lesson plans in seconds', 'أنشئ خطط دروس كاملة في ثوانٍ')}</p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card rounded-xl border border-border/50 p-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t('Subject', 'المادة')}</label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger>
              <SelectValue placeholder={t('Select subject', 'اختر المادة')} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
            placeholder={t('e.g., Introduction to Fractions', 'مثال: مقدمة في الكسور')}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">{t('Duration (minutes)', 'المدة (دقائق)')}</label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['30', '45', '60', '90', '120'].map(d => (
                <SelectItem key={d} value={d}>{d} {t('min', 'دقيقة')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">{t('Additional Notes (optional)', 'ملاحظات إضافية (اختياري)')}</label>
          <Textarea
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            placeholder={t('Any specific requirements, standards, or focus areas...', 'أي متطلبات أو معايير أو مجالات تركيز...')}
            rows={2}
          />
        </div>

        <div className="md:col-span-2">
          <Button
            onClick={generatePlan}
            disabled={isGenerating || !topic || !selectedSubject || !gradeLevel}
            className="w-full"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('Generating...', 'جاري الإنشاء...')}</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {t('Generate Lesson Plan', 'إنشاء خطة الدرس')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Generated Plan */}
      {generatedPlan && (
        <div className="bg-card rounded-xl border border-border/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              {t('Generated Lesson Plan', 'خطة الدرس المُنشأة')}
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyPlan}>
                <Copy className="w-3.5 h-3.5 mr-1" /> {t('Copy', 'نسخ')}
              </Button>
              <Button size="sm" onClick={savePlan} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                {t('Save', 'حفظ')}
              </Button>
            </div>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MathRenderer content={generatedPlan} />
          </div>
        </div>
      )}
    </div>
  );
}
