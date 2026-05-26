import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Sparkles, ArrowLeft, Download, FileText, Presentation, FileType2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MathRenderer } from '@/components/MathRenderer';
import { useAdaptiveIntelligence } from '@/hooks/useAdaptiveIntelligence';
import { normalizeStyle } from '@/lib/promptTemplates';
import { validateAdaptation } from '@/lib/adaptiveValidator';
import { HelpfulnessFeedback } from '@/components/student/HelpfulnessFeedback';
import { recordHelpfulness } from '@/lib/helpfulnessSignal';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import type { Outline, ImageState, Expertise, Mode, ImageMode } from './types';
import { renderDiagramSVG } from './diagram';
import { exportLectureAsPDF } from './exporters/pdf';
import { exportLectureAsDOCX } from './exporters/docx';
import { exportLectureAsPPTX } from './exporters/pptx';
import { SlidePreview } from './SlidePreview';
import { generateGlbDataUrl, fallbackSpec } from './architecture/glbGenerator';
import type { ThreeDObjectSpec } from './architecture/types';

const EXPERTISE_OPTIONS: { value: Expertise; label: string; desc: string }[] = [
  { value: 'basic', label: 'Basic', desc: '8th grade — simple language' },
  { value: 'intermediate', label: 'Intermediate', desc: 'High school / early college' },
  { value: 'advanced', label: 'Advanced', desc: 'Upper-division college' },
  { value: 'expert', label: 'Expert', desc: 'Graduate / specialist' },
];

const GRADE_OPTIONS = ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
const DURATION_OPTIONS = ['30','45','60','90','120'];

async function callImage(prompt: string, expertise: Expertise, mode: ImageMode = 'slide_figure'): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const auth = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({ prompt, expertise, mode }),
  });
  if (!res.ok) throw new Error(`image_${res.status}`);
  const j = await res.json();
  if (!j.image) throw new Error('no_image');
  return j.image as string;
}

async function callImageWithRetry(prompt: string, expertise: Expertise, mode: ImageMode = 'slide_figure'): Promise<string> {
  try {
    return await callImage(prompt, expertise, mode);
  } catch (firstError) {
    const strengthenedPrompt = mode === 'slide_figure'
      ? `${prompt}\n\nRegenerate as a different premium sculpted 3-D cutout object for this exact slide. It must not be the shared hero, must not be a box/cube, and must be suitable as the main visual on a cinematic PowerPoint slide.`
      : prompt;
    try { return await callImage(strengthenedPrompt, expertise, mode); }
    catch { throw firstError; }
  }
}

async function fetch3DSpec(params: {
  subject?: string; topic: string; slide_heading: string; slide_body: string;
  palette: { primary?: string; secondary?: string; accent?: string; surface?: string };
}): Promise<ThreeDObjectSpec> {
  const { data: { session } } = await supabase.auth.getSession();
  const auth = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-3d-spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`spec_${r.status}`);
  const j = await r.json();
  return j.spec as ThreeDObjectSpec;
}

async function buildGlbForParagraph(params: {
  subject?: string; topic: string; slide_heading: string; slide_body: string;
  palette: { primary?: string; secondary?: string; accent?: string; surface?: string };
}): Promise<string | null> {
  // Two-layer fallback: AI spec fails → use fallbackSpec. Three.js fails → null (2D figure remains).
  let spec: ThreeDObjectSpec;
  try { spec = await fetch3DSpec(params); }
  catch {
    spec = fallbackSpec([params.palette.primary, params.palette.accent, params.palette.secondary].filter(Boolean) as string[]);
  }
  try { return await generateGlbDataUrl(spec); }
  catch (e) { console.warn('glb build failed', e); return null; }
}

interface Props {
  defaultSubject?: string;
  defaultTopic?: string;
  onBack?: () => void;
  /** If provided, overrides auto-detected role. */
  mode?: Mode;
  /** Optional save callback (teacher mode persistence). */
  schoolId?: string;
}

export function LectureStudio({ defaultSubject = '', defaultTopic = '', onBack, mode: modeOverride, schoolId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isTeacher } = useUserRole();
  const { getContext } = useAdaptiveIntelligence();
  const mode: Mode = modeOverride ?? (isTeacher ? 'teacher' : 'student');

  const [topic, setTopic] = useState(defaultTopic);
  const [subject, setSubject] = useState(defaultSubject);
  const [expertise, setExpertise] = useState<Expertise>('intermediate');
  const [gradeLevel, setGradeLevel] = useState('Grade 9');
  const [duration, setDuration] = useState('45');
  const [designHint, setDesignHint] = useState('');

  const [phase, setPhase] = useState<'idle' | 'outlining' | 'imaging' | 'ready'>('idle');
  const [outline, setOutline] = useState<Outline | null>(null);
  const [images, setImages] = useState<ImageState[]>([]);
  const [glbDataUrls, setGlbDataUrls] = useState<(string | null)[]>([]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const cancelRef = useRef(false);

  const profileSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const readyAtRef = useRef<number | null>(null);
  const signalGivenRef = useRef(false);
  const lastOutputTextRef = useRef('');

  const flushImplicitSignal = useCallback((override?: 'implicit_regen') => {
    if (!lastOutputTextRef.current || signalGivenRef.current || mode !== 'student') return;
    const dwellMs = readyAtRef.current ? Date.now() - readyAtRef.current : 0;
    let signal: 'implicit_regen' | 'implicit_dwell_positive' | null = null;
    if (override === 'implicit_regen' && dwellMs < 30_000) signal = 'implicit_regen';
    else if (dwellMs >= 30_000) signal = 'implicit_dwell_positive';
    if (!signal) return;
    void recordHelpfulness({
      feature: 'visual_lecture',
      subject: subject || undefined,
      topic: topic || undefined,
      output: lastOutputTextRef.current,
      signal,
      profileSnapshot: profileSnapshotRef.current ?? undefined,
    }).catch(() => {});
    signalGivenRef.current = true;
  }, [mode, subject, topic]);

  useEffect(() => () => { flushImplicitSignal(); }, [flushImplicitSignal]);

  const generate = useCallback(async () => {
    if (!topic.trim()) { toast({ variant: 'destructive', title: 'Enter a topic' }); return; }
    flushImplicitSignal('implicit_regen');
    cancelRef.current = false;
    setPhase('outlining'); setOutline(null); setImages([]); setGlbDataUrls([]); setHeroUrl(null); setProgress({ done: 0, total: 0 });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      let dominantStyle = 'balanced';
      let profileForValidator: any = { adaptiveLevel: expertise };
      try {
        const ctx = await getContext('lecture' as any, subject || undefined);
        const ds = (ctx.profile as any)?.dominantStyle;
        if (ds) dominantStyle = normalizeStyle(ds);
        profileForValidator = {
          adaptiveLevel: expertise,
          dominantStyle,
          cognitiveLoad: (ctx.profile as any)?.cognitiveLoad,
          fatigueLevel: (ctx.profile as any)?.fatigueLevel,
        };
      } catch {}

      const fetchOutline = async (addendum: string): Promise<Outline> => {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-outline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({
            topic: topic.trim(), subject, expertise,
            learning_style: dominantStyle, addendum,
            mode,
            grade_level: mode === 'teacher' ? gradeLevel : '',
            duration_minutes: mode === 'teacher' ? Number(duration) : undefined,
            design_hint: designHint.trim() || undefined,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `outline_${r.status}`);
        }
        return await r.json();
      };

      let out = await fetchOutline('');
      if (cancelRef.current) return;

      if (mode === 'student') {
        try {
          const verdict = await validateAdaptation({
            output: [out.title, out.intro, ...out.paragraphs.map(p => `${p.heading}\n${p.body}`), out.conclusion].join('\n\n'),
            feature: 'visual_lecture',
            subject: subject || undefined,
            profile: profileForValidator,
          });
          if (verdict.shouldRegenerate && verdict.addendum) {
            const regen = await fetchOutline(verdict.addendum);
            if (cancelRef.current) return;
            out = regen;
          }
        } catch {}
      }

      setOutline(out);
      profileSnapshotRef.current = profileForValidator;
      lastOutputTextRef.current = [out.title, out.intro, ...out.paragraphs.map(p => `${p.heading}\n${p.body}`), out.conclusion].join('\n\n');
      readyAtRef.current = Date.now();
      signalGivenRef.current = false;

      const total = out.paragraphs.length;
      setImages(out.paragraphs.map(() => ({ status: 'loading' })));
      setGlbDataUrls(out.paragraphs.map(() => null));
      setProgress({ done: 0, total });
      setPhase('imaging');

      let done = 0;
      const paragraphJobs = out.paragraphs.map((p, i) =>
        callImageWithRetry(p.image_prompt, expertise, 'slide_figure')
          .then((url) => {
            if (cancelRef.current) return;
            setImages((prev) => { const n = [...prev]; n[i] = { status: 'done', url }; return n; });
          })
          .catch(() => {
            setImages((prev) => { const n = [...prev]; n[i] = { status: 'failed' }; return n; });
          })
          .finally(() => { done += 1; setProgress({ done, total }); })
      );

      // 3D GLB per paragraph — AI-decided geometry, procedural three.js build.
      // Independently fault-tolerant: any failure leaves that slot null and the slide falls back to its 2D figure.
      const glbJobs = out.paragraphs.map((p, i) =>
        buildGlbForParagraph({
          subject, topic: out.title, slide_heading: p.heading, slide_body: p.body,
          palette: out.palette || {},
        })
          .then((dataUrl) => {
            if (cancelRef.current) return;
            setGlbDataUrls((prev) => { const n = [...prev]; n[i] = dataUrl; return n; });
          })
          .catch((e) => { console.warn('glb job failed', i, e); })
      );

      // Hero subject — generated in parallel, used on EVERY slide
      const heroJob = out.hero_subject_prompt
        ? callImageWithRetry(out.hero_subject_prompt, expertise, 'hero_subject')
            .then((url) => { if (!cancelRef.current) setHeroUrl(url); })
            .catch((e) => { console.warn('hero failed', e); })
        : Promise.resolve();

      await Promise.allSettled([...paragraphJobs, ...glbJobs, heroJob]);


      if (!cancelRef.current) setPhase('ready');
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Generation failed', description: e.message });
      setPhase('idle');
    }
  }, [topic, subject, expertise, mode, gradeLevel, duration, designHint, toast, getContext, flushImplicitSignal]);

  const doExport = async (kind: 'pdf' | 'docx' | 'pptx') => {
    if (!outline) return;
    setIsExporting(true);
    try {
      if (kind === 'pdf') await exportLectureAsPDF(outline, images);
      else if (kind === 'docx') await exportLectureAsDOCX(outline, images);
      else await exportLectureAsPPTX(outline, images, heroUrl, glbDataUrls);
      toast({ title: `${kind.toUpperCase()} downloaded` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export failed', description: e.message });
    } finally { setIsExporting(false); }
  };

  const saveAsLessonPlan = async () => {
    if (!outline || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('lesson_plans').insert({
        teacher_id: user.id,
        school_id: schoolId || null,
        title: outline.title,
        description: `AI-generated for ${gradeLevel} · ${duration} min`,
        content_json: {
          markdown: [outline.intro, ...outline.paragraphs.map(p => `## ${p.heading}\n${p.body}`), outline.conclusion].join('\n\n'),
          outline,
          images: images.map(i => i.status === 'done' ? i.url : null),
          topic, gradeLevel, duration,
        },
        objectives: (outline.lesson_plan?.objectives || []).join('\n') || topic,
        is_published: false,
      } as any);
      if (error) throw error;
      toast({ title: 'Saved to lesson plans' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally { setIsSaving(false); }
  };

  // ---------------- UI ----------------
  if (phase === 'idle' || (!outline && phase !== 'outlining' && phase !== 'imaging')) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} className="mr-1" /> Back
          </Button>
        )}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 bg-gradient-to-br from-primary to-accent">
            <Sparkles className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Lecture Studio</h1>
          <p className="text-sm text-muted-foreground">
            One generator → PDF, Word & PowerPoint with illustrations and diagrams.
          </p>
        </div>

        <div className="glass-effect rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ls-topic">Topic</Label>
            <Input id="ls-topic" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, The French Revolution, Quantum Tunneling"
              onKeyDown={(e) => e.key === 'Enter' && generate()} autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ls-subject">Subject (optional)</Label>
              <Input id="ls-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" />
            </div>
            <div className="space-y-1">
              <Label>Expertise</Label>
              <Select value={expertise} onValueChange={(v) => setExpertise(v as Expertise)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPERTISE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-medium">{o.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{o.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === 'teacher' && (
              <>
                <div className="space-y-1">
                  <Label>Grade level</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GRADE_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Class duration</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DURATION_OPTIONS.map(d => <SelectItem key={d} value={d}>{d} min</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ls-design" className="flex items-center gap-1.5">
              <Wand2 size={12} /> Design preference (optional)
            </Label>
            <Input id="ls-design" value={designHint} onChange={(e) => setDesignHint(e.target.value)}
              placeholder="e.g. clean editorial, blueprint, warm textbook, vibrant — or leave blank and Lumina picks" />
            <p className="text-[11px] text-muted-foreground">
              If empty, Lumina chooses an aesthetic that fits the topic and uses smart slide transitions.
            </p>
          </div>
          <Button className="w-full" onClick={generate} disabled={!topic.trim()}>
            <Sparkles className="w-4 h-4 mr-2" /> Generate Lecture
          </Button>
        </div>
      </div>
    );
  }

  // Generating / ready view
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => { cancelRef.current = true; setPhase('idle'); setOutline(null); }}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        {outline && phase === 'ready' && (
          <div className="flex gap-2">
            {mode === 'teacher' && schoolId && (
              <Button size="sm" variant="outline" onClick={saveAsLessonPlan} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={isExporting}>
                  {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport('pdf')}><FileText className="w-4 h-4 mr-2" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('docx')}><FileType2 className="w-4 h-4 mr-2" /> Word (.docx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('pptx')}><Presentation className="w-4 h-4 mr-2" /> PowerPoint (.pptx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {phase === 'outlining' && (
        <div className="glass-effect rounded-2xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm font-medium">Writing lecture…</p>
          <p className="text-xs text-muted-foreground mt-1">Selecting an aesthetic and drafting sections.</p>
        </div>
      )}

      {outline && (
        <article className="space-y-8" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          <header className="text-center space-y-2 border-b border-border pb-6">
            <h1 className="text-3xl font-bold leading-tight">{outline.title}</h1>
            <p className="text-xs text-muted-foreground">
              Aesthetic: <span className="font-medium">{outline.aesthetic?.replace(/_/g, ' ')}</span>
              {outline.transition ? <> · Transition: <span className="font-medium">{outline.transition}</span></> : null}
            </p>
            {phase === 'imaging' && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating image {Math.min(progress.done + 1, progress.total)} of {progress.total}…
              </p>
            )}
          </header>

          {phase === 'ready' && (
            <SlidePreview outline={outline} images={images} heroUrl={heroUrl} />
          )}

          <section className="text-base leading-relaxed">
            <MathRenderer content={outline.intro} />
          </section>

          {outline.paragraphs.map((p, i) => {
            const img = images[i];
            return (
              <section key={i} className="space-y-3">
                <h2 className="text-xl font-bold border-l-4 border-primary pl-3">{p.heading}</h2>
                <div className="text-base leading-relaxed"><MathRenderer content={p.body} /></div>
                {img?.status === 'done' && img.url && (
                  <figure className="my-4">
                    <img src={img.url} alt={p.heading} className="w-full max-w-3xl mx-auto rounded-xl border border-border bg-card" loading="lazy" />
                  </figure>
                )}
                {img?.status === 'loading' && (
                  <div className="rounded-xl border border-border bg-muted/30 h-48 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {p.diagram_spec && (
                  <figure className="my-3">
                    <div className="rounded-xl border border-border bg-white p-2"
                      dangerouslySetInnerHTML={{ __html: renderDiagramSVG(p.diagram_spec, outline.palette) }} />
                  </figure>
                )}
              </section>
            );
          })}

          <section className="space-y-3">
            <h2 className="text-xl font-bold border-l-4 border-primary pl-3">Conclusion</h2>
            <div className="text-base leading-relaxed"><MathRenderer content={outline.conclusion} /></div>
          </section>

          {outline.key_takeaways?.length > 0 && (
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="font-semibold mb-2">Key Takeaways</h3>
              <ul className="list-disc ml-5 space-y-1 text-sm">
                {outline.key_takeaways.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </section>
          )}

          {mode === 'student' && phase === 'ready' && (
            <HelpfulnessFeedback
              feature="visual_lecture"
              subject={subject || undefined}
              topic={topic || undefined}
              output={lastOutputTextRef.current}
              profileSnapshot={profileSnapshotRef.current ?? undefined}
              onRecorded={() => { signalGivenRef.current = true; }}
            />
          )}
        </article>
      )}
    </div>
  );
}
