/**
 * StudentLiveList — the "Live" bottom-nav tab.
 *
 * Lists all currently-live and scheduled meetings for the student's grade
 * (driven by useLiveMeetings, which subscribes to postgres_changes on
 * live_meetings). Tapping a live meeting navigates to /live/:meetingId.
 */
import { useNavigate } from 'react-router-dom';
import { useLiveMeetings } from '@/hooks/useLiveMeetings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, CalendarClock, Loader2 } from 'lucide-react';

export function StudentLiveList() {
  const navigate = useNavigate();
  const { liveMeetings, scheduledMeetings, loading } = useLiveMeetings();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 max-w-2xl mx-auto space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-red-500" /> Live right now
        </h2>
        {liveMeetings.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No class is live for your grade right now.
          </Card>
        ) : (
          <div className="space-y-2">
            {liveMeetings.map((m) => (
              <Card key={m.id} className="p-4 border-red-500/30 bg-red-500/5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="animate-pulse gap-1">
                        <Radio className="w-3 h-3" /> LIVE
                      </Badge>
                      <span className="font-medium truncate">{m.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {m.subject ?? 'Class'} · Grade {m.grade_level} · Code {m.share_code}
                    </p>
                  </div>
                  <Button onClick={() => navigate(`/live/${m.id}`)} className="gap-2">
                    <Radio className="w-4 h-4" /> Join Lumina
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5" /> Scheduled
        </h2>
        {scheduledMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nothing scheduled.</p>
        ) : (
          <div className="space-y-2">
            {scheduledMeetings.map((m) => (
              <Card key={m.id} className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {m.subject ?? 'Class'} · Grade {m.grade_level} · Code {m.share_code}
                    </p>
                  </div>
                  <Badge variant="secondary">Scheduled</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
