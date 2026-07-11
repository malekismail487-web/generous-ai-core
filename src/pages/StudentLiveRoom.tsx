/**
 * StudentLiveRoom — parallel Lumina Live viewer.
 *
 * On mount:
 *  1. Loads the `live_meetings` row (RLS scopes it to the student's grade).
 *  2. Runs `useLessonBackfill` to hydrate LessonState from prior events —
 *     so a student joining mid-lecture picks up at the current concept, not
 *     the beginning.
 *  3. Wires `useLuminaLiveSession(lesson_id, { initialLastSeq })` for the
 *     continuous personalized stream.
 *  4. Subscribes to `live_meetings` changes so `status='ended'` auto-closes.
 *
 * View modes:
 *  - "Lumina" (default): streaming personalized explanation, TTS voice, subtitles.
 *  - "Teacher board": shows the teacher's raw timeline (no audio) so the
 *    student can silently glance at what the teacher wrote/said while
 *    Lumina keeps teaching them in parallel.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useLessonBackfill } from '@/hooks/useLessonBackfill';
import { useLuminaLiveSession } from '@/hooks/useLuminaLiveSession';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { MathRenderer } from '@/components/MathRenderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Volume2, VolumeX, Presentation, Sparkles, Loader2, Radio } from 'lucide-react';

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
}

type ViewMode = 'lumina' | 'teacher';

export default function StudentLiveRoom() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { school, profile, loading, isStudent } = useRoleGuard();

  const [meeting, setMeeting] = useState<LiveMeeting | null>(null);
  const [meetingLoading, setMeetingLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('lumina');
  const [voiceOn, setVoiceOn] = useState(true);

  // Load meeting + subscribe for status changes.
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('live_meetings')
        .select('*')
        .eq('id', meetingId)
        .maybeSingle();
      if (!cancelled) {
        setMeeting((data ?? null) as LiveMeeting | null);
        setMeetingLoading(false);
      }
    })();
    const channel = supabase
      .channel(`meeting:${meetingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_meetings', filter: `id=eq.${meetingId}` },
        (payload) => { setMeeting((payload.new as LiveMeeting) ?? null); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [meetingId]);

  // Hydrate lecture state before mounting the live session so the student
  // catches up to the current concept instead of gap-rejecting fresh events.
  const backfill = useLessonBackfill(meeting?.lesson_id ?? null);

  const sessionEnabled = !!(meeting && meeting.status === 'live' && backfill.ready);
  const { state, latest, session, lastGap } = useLuminaLiveSession(
    meeting?.lesson_id ?? '',
    { enabled: sessionEnabled, initialLastSeq: backfill.startSeq, feature: 'lecture' },
  );

  // TTS — speak Lumina's rendered text when a "done" event lands.
  const { speak, stop: stopSpeech, isSpeaking, isSupported: ttsSupported } = useTextToSpeech();
  useEffect(() => {
    if (!voiceOn) { stopSpeech(); return; }
    if (!latest) return;
    if (latest.status === 'done' && latest.text.length > 0) speak(latest.text);
  }, [voiceOn, latest?.status, latest?.text, latest, speak, stopSpeech]);
  useEffect(() => () => stopSpeech(), [stopSpeech]);

  // Merge backfill state as the initial view before any live event arrives.
  const displayState = useMemo(() => {
    if (state && state.timeline.length > 0) return state;
    return backfill.hydratedState ?? state;
  }, [state, backfill.hydratedState]);

  if (loading || meetingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isStudent || !school || !profile) return <Navigate to="/" replace />;
  if (!meeting) return <Navigate to="/" replace />;

  const isLive = meeting.status === 'live';
  const isEnded = meeting.status === 'ended';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-effect-strong border-b border-border/30">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 h-14">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isLive && <Badge variant="destructive" className="animate-pulse gap-1"><Radio className="w-3 h-3" /> LIVE</Badge>}
              {isEnded && <Badge variant="outline">Ended</Badge>}
              <span className="text-sm font-semibold truncate">{meeting.title}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {meeting.subject ?? 'Class'} · Grade {meeting.grade_level}
            </p>
          </div>
          {ttsSupported && (
            <Button variant="ghost" size="icon" onClick={() => setVoiceOn((v) => !v)} title="Lumina voice">
              {voiceOn ? <Volume2 className={`w-5 h-5 ${isSpeaking ? 'text-primary' : ''}`} /> : <VolumeX className="w-5 h-5" />}
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div className="max-w-3xl mx-auto px-3 pb-2 flex gap-2">
          <Button
            size="sm"
            variant={view === 'lumina' ? 'default' : 'outline'}
            onClick={() => setView('lumina')}
            className="gap-2 flex-1"
          >
            <Sparkles className="w-4 h-4" /> Lumina teaching me
          </Button>
          <Button
            size="sm"
            variant={view === 'teacher' ? 'default' : 'outline'}
            onClick={() => setView('teacher')}
            className="gap-2 flex-1"
          >
            <Presentation className="w-4 h-4" /> Teacher board
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
          {/* Current lecture context — always visible so student never loses the thread */}
          <Card className="p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Right now</div>
            <div className="mt-1 font-medium">
              {displayState?.currentConcept?.label ?? 'Waiting for the teacher to move on…'}
            </div>
            {displayState && displayState.prerequisitesCovered.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Array.from(displayState.prerequisitesCovered).slice(-6).map((p) => (
                  <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                ))}
              </div>
            )}
          </Card>

          {isEnded && (
            <Card className="p-6 text-center space-y-2">
              <h2 className="text-lg font-semibold">Meeting ended</h2>
              <p className="text-sm text-muted-foreground">
                The teacher has ended this class. Everything Lumina taught you has been folded into your profile.
              </p>
              <Button onClick={() => navigate('/')} className="mt-2">Back to dashboard</Button>
            </Card>
          )}

          {!isEnded && view === 'lumina' && (
            <>
              <Card className="p-4 min-h-[240px]">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Lumina — teaching in your style
                  {session === 'subscribed' && <Badge variant="outline" className="ml-auto text-[10px]">connected</Badge>}
                  {session === 'reconnecting' && <Badge variant="outline" className="ml-auto text-[10px]">reconnecting…</Badge>}
                </div>
                {latest ? (
                  <div className="font-serif-ai text-base leading-relaxed whitespace-pre-wrap">
                    <MathRenderer content={latest.text || ''} />
                    {latest.status === 'streaming' && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
                    {latest.status === 'error' && (
                      <div className="mt-3 text-sm text-destructive">
                        Lumina couldn't reach the gateway: {latest.errorMessage ?? 'unknown'}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    {isLive
                      ? 'Waiting for the teacher\'s next beat — Lumina will pick up from wherever they are.'
                      : 'This meeting hasn\'t started yet.'}
                  </div>
                )}
              </Card>

              {/* Subtitle strip: the last completed Lumina message compactly */}
              {latest && latest.status !== 'error' && latest.text && (
                <Card className="p-3 bg-muted/40">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Subtitles</div>
                  <div className="text-sm">{latest.text.split('\n').slice(-2).join(' ')}</div>
                </Card>
              )}

              {lastGap && (
                <p className="text-[11px] text-muted-foreground">
                  Missed a beat (seq {lastGap.receivedSeq} while expecting {lastGap.expectedSeq}); staying synchronized on the newest events.
                </p>
              )}
            </>
          )}

          {!isEnded && view === 'teacher' && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Teacher board (audio off)</div>
              {displayState && displayState.timeline.length > 0 ? (
                <ol className="space-y-3">
                  {displayState.timeline.slice(-20).map((e, i) => (
                    <li key={i} className="border-l-2 border-border pl-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{e.kind}</div>
                      <div className="text-sm whitespace-pre-wrap">{e.text}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nothing on the board yet.</p>
              )}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
