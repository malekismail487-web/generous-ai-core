import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Sparkles, RefreshCw, Download, ArrowLeft, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MathRenderer } from '@/components/MathRenderer';
import { exportAsPDF } from '@/lib/lectureExport';
import { cn } from '@/lib/utils';
import { validateAdaptation } from '@/lib/adaptiveValidator';
import { useAdaptiveIntelligence } from '@/hooks/useAdaptiveIntelligence';
import { normalizeStyle } from '@/lib/promptTemplates';
import { HelpfulnessFeedback } from '@/components/student/HelpfulnessFeedback';
import { recordHelpfulness } from '@/lib/helpfulnessSignal';

type Expertise = 'basic' | 'intermediate' | 'advanced' | 'expert';

type Paragraph = {
  heading: string;
  body: string;
  image_prompt: string;
};

type Outline = {
  title: string;
  intro: string;
  paragraphs: Paragraph[];
  conclusion: string;
  key_takeaways: string[];
};

type ImageState = { status: 'pending' | 'loading' | 'done' | 'failed'; url?: string };

const EXPERTISE_OPTIONS: { value: Expertise; label: string; desc: string }[] = [
  { value: 'basic', label: 'Basic', desc: '8th grade — simple language & analogies' },
  { value: 'intermediate', label: 'Intermediate', desc: 'High school / early college' },
  { value: 'advanced', label: 'Advanced', desc: 'Upper-division college, technical' },
  { value: 'expert', label: 'Expert', desc: 'Graduate / specialist level' },
];

async function callImage(prompt: string, expertise: Expertise): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const auth = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({ prompt, expertise }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `image_failed_${res.status}`);
  }
  const j = await res.json();
  if (!j.image) throw new Error('no_image');
  return j.image as string;
}

interface Props {
  defaultSubject?: string;
  defaultTopic?: string;
  onBack?: () => void;
}

export function LectureGenerator({ defaultSubject = '', defaultTopic = '', onBack }: Props) {
  const { toast } = useToast();
  const { getContext } = useAdaptiveIntelligence();
  const [topic, setTopic] = useState(defaultTopic);
  const [subject, setSubject] = useState(defaultSubject);
  const [expertise, setExpertise] = useState<Expertise>('intermediate');

  const [phase, setPhase] = useState<'idle' | 'outlining' | 'imaging' | 'ready'>('idle');
  const [outline, setOutline] = useState<Outline | null>(null);
  const [images, setImages] = useState<ImageState[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const cancelRef = useRef(false);

  // Phase 4 — helpfulness signal bookkeeping (refs avoid re-render churn)
  const profileSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const readyAtRef = useRef<number | null>(null);
  const signalGivenRef = useRef(false);
  const lastTopicRef = useRef<string | null>(null);
  const lastSubjectRef = useRef<string>('');
  const lastOutputTextRef = useRef<string>('');

  const flattenOutline = (o: Outline) => [
    o.title, o.intro,
    ...o.paragraphs.map((p) => `${p.heading}\n${p.body}`),
    o.conclusion,
    ...(o.key_takeaways || []),
  ].join('\n\n');

  /** Fire implicit signal for the previously-shown outline (regen / sustained dwell). */
  const flushImplicitSignal = useCallback((reasonOverride?: 'implicit_regen') => {
    if (!lastOutputTextRef.current || signalGivenRef.current) return;
    const dwellMs = readyAtRef.current ? Date.now() - readyAtRef.current : 0;
    let signal: 'implicit_regen' | 'implicit_dwell_positive' | null = null;
    if (reasonOverride === 'implicit_regen' && dwellMs < 30_000) {
      signal = 'implicit_regen';
    } else if (dwellMs >= 30_000) {
      signal = 'implicit_dwell_positive';
    }
    if (!signal) return;
    void recordHelpfulness({
      feature: 'visual_lecture',
      subject: lastSubjectRef.current || undefined,
      topic: lastTopicRef.current || undefined,
      output: lastOutputTextRef.current,
      signal,
      profileSnapshot: profileSnapshotRef.current ?? undefined,
    }).catch(() => { /* fail open */ });
    signalGivenRef.current = true;
  }, []);

  // Flush any pending dwell-positive on unmount.
  useEffect(() => {
    return () => { flushImplicitSignal(); };
  }, [flushImplicitSignal]);

  const generate = useCallback(async () => {
    if (!topic.trim()) {
      toast({ variant: 'destructive', title: 'Enter a topic' });
      return;
    }

    // Phase 4: if a previous outline was on screen, flush its implicit signal
    // (regen if dwell was short, dwell-positive if it was long) BEFORE we
    // start the new run so we don't lose the signal.
    flushImplicitSignal('implicit_regen');

    cancelRef.current = false;
    setPhase('outlining');
    setOutline(null);
    setImages([]);
    setProgress({ done: 0, total: 0 });

    try {
      // Stage A — outline (Phase 2: hard-routed prompt template selected by level + style)
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Resolve dominant learning style from the adaptive engine — Phase 1↔2 bridge.
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
      } catch { /* fall through with defaults */ }

      const fetchOutline = async (addendum: string): Promise<Outline> => {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-outline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({
            topic: topic.trim(),
            subject,
            expertise,
            learning_style: dominantStyle,
            addendum,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `outline_failed_${r.status}`);
        }
        return await r.json();
      };

      let out = await fetchOutline('');
      if (cancelRef.current) return;

      // Phase 1+2 bridge: validate, and if it fails, regenerate ONCE with the
      // auditor's corrective addendum prepended to the same hard-routed template.
      try {
        const verdict = await validateAdaptation({
          output: [
            out.title,
            out.intro,
            ...out.paragraphs.map((p) => `${p.heading}\n${p.body}`),
            out.conclusion,
          ].join('\n\n'),
          feature: 'visual_lecture',
          subject: subject || undefined,
          profile: profileForValidator,
        });

        if (verdict.shouldRegenerate && verdict.addendum) {
          // Phase 3: validator already bumped the profile bus on low score.
          // Refresh the captured snapshot so regeneration uses the new
          // dominantStyle / level / cognitiveLoad if they shifted.
          try {
            const fresh = await getContext('lecture' as any, subject || undefined);
            const ds = (fresh.profile as any)?.dominantStyle;
            if (ds) dominantStyle = normalizeStyle(ds);
            profileForValidator = {
              adaptiveLevel: expertise,
              dominantStyle,
              cognitiveLoad: (fresh.profile as any)?.cognitiveLoad,
              fatigueLevel: (fresh.profile as any)?.fatigueLevel,
            };
          } catch { /* keep prior snapshot */ }

          const regenerated = await fetchOutline(verdict.addendum);
          if (cancelRef.current) return;
          out = regenerated;
          void validateAdaptation({
            output: [
              out.title,
              out.intro,
              ...out.paragraphs.map((p) => `${p.heading}\n${p.body}`),
              out.conclusion,
            ].join('\n\n'),
            feature: 'visual_lecture',
            subject: subject || undefined,
            profile: profileForValidator,
            regenerated: true,
          }).catch(() => { /* fail open */ });
        }
      } catch { /* validator must never block the flow */ }

      setOutline(out);

      // Phase 4: capture refs for the helpfulness widget + implicit signals.
      profileSnapshotRef.current = profileForValidator;
      lastTopicRef.current = topic.trim();
      lastSubjectRef.current = subject;
      lastOutputTextRef.current = flattenOutline(out);
      readyAtRef.current = Date.now();
      signalGivenRef.current = false;

      // Stage B — parallel images
      const total = out.paragraphs.length;
      setImages(out.paragraphs.map(() => ({ status: 'loading' })));
      setProgress({ done: 0, total });
      setPhase('imaging');

      let done = 0;
      await Promise.allSettled(
        out.paragraphs.map((p, i) =>
          callImage(p.image_prompt, expertise)
            .then((url) => {
              if (cancelRef.current) return;
              setImages((prev) => {
                const next = [...prev];
                next[i] = { status: 'done', url };
                return next;
              });
            })
            .catch(() => {
              setImages((prev) => {
                const next = [...prev];
                next[i] = { status: 'failed' };
                return next;
              });
            })
            .finally(() => {
              done += 1;
              setProgress({ done, total });
            })
        )
      );

      if (!cancelRef.current) setPhase('ready');
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Lecture failed', description: e.message || 'Try again' });
      setPhase('idle');
    }
  }, [topic, subject, expertise, toast, getContext]);

  const retryImage = useCallback(async (idx: number) => {
    if (!outline) return;
    setImages((prev) => {
      const n = [...prev];
      n[idx] = { status: 'loading' };
      return n;
    });
    try {
      const url = await callImage(outline.paragraphs[idx].image_prompt, expertise);
      setImages((prev) => {
        const n = [...prev];
        n[idx] = { status: 'done', url };
        return n;
      });
    } catch {
      setImages((prev) => {
        const n = [...prev];
        n[idx] = { status: 'failed' };
        return n;
      });
      toast({ variant: 'destructive', title: 'Image still failed' });
    }
  }, [outline, expertise, toast]);

  const handleExport = useCallback(async () => {
    if (!outline) return;
    setIsExporting(true);
    try {
      const body = [
        outline.intro,
        '',
        ...outline.paragraphs.flatMap((p) => [`## ${p.heading}`, p.body, '']),
        '## Conclusion',
        outline.conclusion,
        '',
        '## Key Takeaways',
        ...outline.key_takeaways.map((t) => `• ${t}`),
      ].join('\n');
      await exportAsPDF(outline.title, body);
      toast({ title: 'PDF saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export failed', description: e.message });
    } finally { setIsExporting(false); }
  }, [outline, toast]);

  // ----- UI -----
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
          <h1 className="text-2xl font-bold">Visual Lecture Generator</h1>
          <p className="text-sm text-muted-foreground">Type a topic — get a richly illustrated lecture in ~45s.</p>
        </div>

        <div className="glass-effect rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="lg-topic">Topic</Label>
            <Input
              id="lg-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, The French Revolution, Quantum Tunneling"
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lg-subject">Subject (optional)</Label>
              <Input
                id="lg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Biology"
              />
            </div>
            <div className="space-y-1">
              <Label>Expertise level</Label>
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
          </div>
          <Button className="w-full" onClick={generate} disabled={!topic.trim()}>
            <Sparkles className="w-4 h-4 mr-2" /> Generate Lecture
          </Button>
        </div>
      </div>
    );
  }

  // Loading / streaming display
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => { cancelRef.current = true; setPhase('idle'); setOutline(null); }}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        {outline && phase === 'ready' && (
          <Button size="sm" variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download PDF
          </Button>
        )}
      </div>

      {phase === 'outlining' && (
        <div className="glass-effect rounded-2xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm font-medium">Writing lecture…</p>
          <p className="text-xs text-muted-foreground mt-1">Drafting intro, body, and image prompts.</p>
        </div>
      )}

      {outline && (
        <article className="space-y-8" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          <header className="text-center space-y-2 border-b border-border pb-6">
            <h1 className="text-3xl font-bold leading-tight">{outline.title}</h1>
            {phase === 'imaging' && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating image {Math.min(progress.done + 1, progress.total)} of {progress.total}…
              </p>
            )}
          </header>

          <section className="text-base leading-relaxed">
            <MathRenderer content={outline.intro} />
          </section>

          {outline.paragraphs.map((p, i) => {
            const img = images[i];
            return (
              <section key={i} className="space-y-3">
                <h2 className="text-xl font-bold border-l-4 border-primary pl-3" style={{ fontFamily: 'inherit' }}>
                  {p.heading}
                </h2>
                <div className="text-base leading-relaxed">
                  <MathRenderer content={p.body} />
                </div>
                <figure className="my-4">
                  {img?.status === 'done' && img.url && (
                    <img
                      src={img.url}
                      alt={p.heading}
                      className="w-full max-w-3xl mx-auto rounded-xl border border-border bg-card"
                      loading="lazy"
                    />
                  )}
                  {img?.status === 'loading' && (
                    <div className="w-full aspect-video max-w-3xl mx-auto rounded-xl border border-border bg-muted/30 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Rendering image…</p>
                      </div>
                    </div>
                  )}
                  {img?.status === 'failed' && (
                    <div className="w-full aspect-video max-w-3xl mx-auto rounded-xl border border-destructive/40 bg-destructive/5 flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <ImageIcon className="w-6 h-6 mx-auto text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Image failed</p>
                        <Button size="sm" variant="outline" onClick={() => retryImage(i)}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      </div>
                    </div>
                  )}
                </figure>
              </section>
            );
          })}

          <section className="border-t border-border pt-6 space-y-3">
            <h2 className="text-xl font-bold">Conclusion</h2>
            <div className="text-base leading-relaxed">
              <MathRenderer content={outline.conclusion} />
            </div>
          </section>

          <section className="bg-muted/30 rounded-2xl p-5 space-y-2">
            <h2 className="text-xl font-bold">Key Takeaways</h2>
            <ul className="space-y-2 list-disc pl-5 text-base leading-relaxed">
              {outline.key_takeaways.map((t, i) => (<li key={i}>{t}</li>))}
            </ul>
          </section>

          {phase === 'ready' && (
            <HelpfulnessFeedback
              feature="visual_lecture"
              subject={lastSubjectRef.current || subject || undefined}
              topic={lastTopicRef.current || topic || undefined}
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
