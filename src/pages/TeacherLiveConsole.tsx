/**
 * TeacherLiveConsole — Lumina Live meeting cockpit for teachers.
 *
 * Responsibilities:
 *  - List / create / start / end grade-targeted live meetings.
 *  - When live, emit `lesson_events` rows that the Stage A1 trigger
 *    broadcasts on `lesson:<uuid>`. Manual chips (concept, definition,
 *    formula, example, discussion, silence) are the source of truth.
 *  - Optional teacher-side transcription via the browser Web Speech API
 *    (webkitSpeechRecognition) — final chunks auto-insert as `discussion`
 *    events so Lumina hears the teacher continuously.
 *
 * Why Web Speech API and not whisper.cpp WASM: whisper.cpp shipped as WASM
 * is ~50-100MB and CPU-hungry, unusable on a student's mobile browser.
 * The teacher device runs continuously on WebKit/Chromium's built-in
 * streaming ASR, and Lumina consumes those chunks server-side. This gives
 * the same "Lumina hears the teacher" outcome without the 100MB download.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Radio, Copy, Square, Mic, MicOff, Send, Plus, Hand } from 'lucide-react';
import type { LessonEventKind } from '@/lib/lse/priorityTable';
import { openComprehensionGroups, type ComprehensionSignal } from '@/lib/lse/comprehensionSignals';

interface LiveMeeting {
  id: string;
  lesson_id: string;
  teacher_id: string;
  school_id: string;
  subject: string | null;
  title: string;
  grade_level: string;
  share_code: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
}

interface SpeechResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

// Must match the exact strings stored on profiles.grade_level ("Grade 8"),
// otherwise the student-side grade filter in useLiveMeetings never matches.
const GRADES = [
  'KG1', 'KG2', 'KG3',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];
const EVENT_KINDS: { kind: LessonEventKind; label: string }[] = [
  { kind: 'concept', label: 'Concept' },
  { kind: 'definition', label: 'Definition' },
  { kind: 'formula', label: 'Formula' },
  { kind: 'example', label: 'Example' },
  { kind: 'question', label: 'Question' },
  { kind: 'discussion', label: 'Discussion' },
];

function makeShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export default function TeacherLiveConsole() {
  const { isTeacher, school, profile, loading } = useRoleGuard();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<LiveMeeting[]>([]);
  const [active, setActive] = useState<LiveMeeting | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('Grade 9');

  const [kind, setKind] = useState<LessonEventKind>('concept');
  const [text, setText] = useState('');
  const [conceptRef, setConceptRef] = useState('');
  const [sending, setSending] = useState(false);
  const [signals, setSignals] = useState<ComprehensionSignal[]>([]);
  const [signalError, setSignalError] = useState('');

  // Web Speech API transcription
  const [micOn, setMicOn] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const micActiveRef = useRef(false);

  const fetchMeetings = useCallback(async () => {
    if (!user?.id || !school?.id) return;
    const { data } = await supabase
      .from('live_meetings')
      .select('*')
      .eq('school_id', school.id)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    setMeetings((data ?? []) as LiveMeeting[]);
  }, [user?.id, school?.id]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const createMeeting = async (goLive: boolean) => {
    if (!newTitle.trim() || !user?.id || !school?.id) return;
    const { data, error } = await supabase
      .from('live_meetings')
      .insert({
        teacher_id: user.id,
        school_id: school.id,
        title: newTitle.trim(),
        subject: newSubject.trim() || null,
        grade_level: newGrade,
        share_code: makeShareCode(),
        status: goLive ? 'live' : 'scheduled',
        started_at: goLive ? new Date().toISOString() : null,
        scheduled_at: goLive ? null : new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      toast({ title: 'Could not create meeting', description: error.message, variant: 'destructive' });
      return;
    }
    setNewTitle('');
    setNewSubject('');
    await fetchMeetings();
    if (goLive) setActive(data as LiveMeeting);
  };

  const startMeeting = async (m: LiveMeeting) => {
    const { error } = await supabase
      .from('live_meetings')
      .update({ status: 'live', started_at: new Date().toISOString() })
      .eq('id', m.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await fetchMeetings();
    setActive({ ...m, status: 'live', started_at: new Date().toISOString() });
  };

  const endMeeting = useCallback(async (m: LiveMeeting) => {
    stopMic();
    const { error } = await supabase
      .from('live_meetings')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', m.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await fetchMeetings();
    setActive(null);
    toast({ title: 'Meeting ended' });
  }, [toast, fetchMeetings]);

  const emitEvent = useCallback(async (opts: {
    kind: LessonEventKind;
    text: string;
    conceptRef?: string;
  }) => {
    if (!active || !user?.id || !school?.id) return;
    if (!opts.text.trim() && opts.kind !== 'silence') return;
    const priorityMap: Record<LessonEventKind, number> = {
      definition: 1, formula: 1, concept: 2, question: 2,
      example: 3, discussion: 4, admin: 5, silence: 5,
    };
    const { error } = await supabase.from('lesson_events').insert({
      lesson_id: active.lesson_id,
      teacher_id: user.id,
      school_id: school.id,
      kind: opts.kind,
      text: opts.text.trim(),
      concept_ref: opts.conceptRef?.trim() || null,
      priority: priorityMap[opts.kind],
      teacher_visible: true,
    });
    if (error) toast({ title: 'Emit failed', description: error.message, variant: 'destructive' });
  }, [active, user?.id, school?.id, toast]);

  const handleSend = async () => {
    if (!active) return;
    setSending(true);
    await emitEvent({ kind, text, conceptRef });
    setText('');
    setSending(false);
  };

  // --- Web Speech transcription -------------------------------------------
  const startMic = () => {
    // Browser vendor speech APIs have inconsistent DOM typings; the capability
    // is detected at runtime and adapted to the narrow shape used here.
    const W = typeof window !== 'undefined' ? window as unknown as SpeechWindow : null;
    const SR = W?.SpeechRecognition || W?.webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not expose Speech Recognition. Use text emits.',
        variant: 'destructive',
      });
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev: SpeechResultEventLike) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      setInterim(interimChunk);
      const cleaned = finalChunk.trim();
      if (cleaned.length > 3) {
        void emitEvent({ kind: 'discussion', text: cleaned });
      }
    };
    rec.onerror = () => { micActiveRef.current = false; setMicOn(false); };
    rec.onend = () => { if (micActiveRef.current) { try { rec.start(); } catch { /* already started */ } } };
    try {
      rec.start();
      recRef.current = rec;
      micActiveRef.current = true;
      setMicOn(true);
    } catch (e: unknown) {
      toast({ title: 'Mic error', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };
  const stopMic = () => {
    micActiveRef.current = false;
    setMicOn(false);
    setInterim('');
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } recRef.current = null; }
  };
  useEffect(() => () => stopMic(), []);

  const copyLink = (m: LiveMeeting) => {
    const url = `${window.location.origin}/live/${m.id}`;
    const msg = `Join my Lumina Live class:\n${m.title}${m.subject ? ` — ${m.subject}` : ''}\nCode: ${m.share_code}\n${url}`;
    navigator.clipboard.writeText(msg).then(
      () => toast({ title: 'Copied invite to clipboard' }),
      () => toast({ title: 'Copy failed', variant: 'destructive' }),
    );
  };

  const activeLessonId = active?.lesson_id ?? null;
  const fetchSignals = useCallback(async () => {
    if (!activeLessonId) { setSignals([]); return; }
    const { data, error } = await supabase.from('live_comprehension_signals')
      .select('id, event_seq, status, created_at')
      .eq('lesson_id', activeLessonId).order('created_at', { ascending: false }).limit(500);
    if (error) { setSignalError(error.message); setSignals([]); }
    else { setSignalError(''); setSignals(data ?? []); }
  }, [activeLessonId]);

  useEffect(() => {
    if (!activeLessonId) return;
    setSignals([]);
    void fetchSignals();
    const channel = supabase.channel(`live-signals:${activeLessonId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_comprehension_signals',
        filter: `lesson_id=eq.${activeLessonId}`,
      }, () => { void fetchSignals(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeLessonId, fetchSignals]);

  const acknowledgeSignals = async (eventSeq: number) => {
    if (!active || !user) return;
    const { error } = await supabase.from('live_comprehension_signals')
      .update({ status: 'acknowledged' })
      .eq('lesson_id', active.lesson_id).eq('event_seq', eventSeq).eq('status', 'open');
    if (error) setSignalError(error.message);
    else await fetchSignals();
  };

  const openSignals = openComprehensionGroups(signals);

  if (loading) return null;
  if (!isTeacher || !school || !profile) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 liquid-glass liquid-sheen liquid-rim border-b border-foreground/10">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 h-14">
          <Button variant="ghost" size="icon" onClick={() => navigate('/teacher')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Radio className="w-5 h-5 text-red-500" />
          <h1 className="text-lg font-semibold">Lumina Live</h1>
          {active && (
            <Badge variant="destructive" className="ml-2 animate-pulse">
              LIVE · {active.grade_level}
            </Badge>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6 pb-24">
        {!active && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Schedule or start a live class</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Label>Title</Label>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Photosynthesis — how plants make sugar" />
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Biology" />
                  </div>
                  <div>
                    <Label>Grade</Label>
                    <Select value={newGrade} onValueChange={setNewGrade}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => createMeeting(true)} disabled={!newTitle.trim()} className="gap-2">
                    <Radio className="w-4 h-4" /> Go Live now
                  </Button>
                  <Button variant="outline" onClick={() => createMeeting(false)} disabled={!newTitle.trim()} className="gap-2">
                    <Plus className="w-4 h-4" /> Schedule
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Every student in {newGrade} at {school.name} will see the join card the moment you go live.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your meetings</h2>
              {meetings.length === 0 && (
                <p className="text-sm text-muted-foreground">No meetings yet.</p>
              )}
              {meetings.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.title}</span>
                        {m.status === 'live' && <Badge variant="destructive" className="animate-pulse">LIVE</Badge>}
                        {m.status === 'scheduled' && <Badge variant="secondary">Scheduled</Badge>}
                        {m.status === 'ended' && <Badge variant="outline">Ended</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {m.subject ?? '—'} · {m.grade_level} · Code {m.share_code}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyLink(m)} className="gap-1">
                        <Copy className="w-3.5 h-3.5" /> Invite
                      </Button>
                      {m.status === 'scheduled' && (
                        <Button size="sm" onClick={() => startMeeting(m)} className="gap-1">
                          <Radio className="w-3.5 h-3.5" /> Start
                        </Button>
                      )}
                      {m.status === 'live' && (
                        <>
                          <Button size="sm" onClick={() => setActive(m)}>Open</Button>
                          <Button size="sm" variant="destructive" onClick={() => endMeeting(m)} className="gap-1">
                            <Square className="w-3.5 h-3.5" /> End
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {active && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Hand className="h-4 w-4" />Learner comprehension signals</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">Students can request a different explanation without exposing their adaptive profile. Counts are grouped by lesson beat, not student identity.</p>
                {signalError && <p role="alert" className="text-destructive">{signalError}</p>}
                {signalError ? <p className="text-muted-foreground">Signal status is unavailable.</p>
                  : openSignals.length === 0 ? <p className="text-muted-foreground">No open requests.</p>
                  : openSignals.slice(0, 8).map(group => (
                    <div key={group.eventSeq} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                      <Badge variant="outline">Beat {group.eventSeq}</Badge>
                      <span className="flex-1">{group.count} learner{group.count === 1 ? '' : 's'} need another example</span>
                      <Button size="sm" variant="outline" onClick={() => { setKind('example'); setText(''); }}>Prepare example</Button>
                      <Button size="sm" variant="outline" onClick={() => void acknowledgeSignals(group.eventSeq)}>Mark seen</Button>
                    </div>
                  ))}
                {signals.length === 500 && <p className="text-xs text-muted-foreground">Showing the latest 500 signals only; older counts may be incomplete.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">{active.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyLink(active)} className="gap-1">
                      <Copy className="w-3.5 h-3.5" /> Copy invite
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => endMeeting(active)} className="gap-1">
                      <Square className="w-3.5 h-3.5" /> End meeting
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-foreground/10">
                  <Button
                    size="sm"
                    variant={micOn ? 'destructive' : 'default'}
                    onClick={micOn ? stopMic : startMic}
                    className="gap-2"
                  >
                    {micOn ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {micOn ? 'Stop listening' : 'Lumina listens to you'}
                  </Button>
                  <div className="flex-1 text-xs text-muted-foreground">
                    {micOn
                      ? interim
                        ? `Hearing: "${interim}"`
                        : 'Listening… final phrases stream to Lumina automatically.'
                      : 'Turn on voice so Lumina hears everything you say and teaches each joining student from that point onward.'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <Label>Kind</Label>
                    <Select value={kind} onValueChange={(v) => setKind(v as LessonEventKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>Concept tag (optional)</Label>
                    <Input value={conceptRef} onChange={(e) => setConceptRef(e.target.value)} placeholder="photosynthesis.calvin_cycle" />
                  </div>
                </div>
                <div>
                  <Label>Text to broadcast</Label>
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Now we're moving to how plants convert CO₂ into sugar…" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSend} disabled={sending || !text.trim()} className="gap-2">
                    <Send className="w-4 h-4" /> Send to Lumina
                  </Button>
                  <Button variant="outline" onClick={() => emitEvent({ kind: 'silence', text: '' })}>
                    Mark silence / moving on
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Every send hits <code>lesson_events</code>. Students in {active.grade_level} who have joined Lumina Live receive a personalized explanation streamed to them in real time.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
