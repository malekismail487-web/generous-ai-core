/**
 * MinistryAnnouncementsEditor — Super-Admin authoring surface for per-tenant
 * ministry announcements. Reads/writes `public.ministry_announcements`
 * directly — RLS restricts writes to Super Admins.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Megaphone, Trash2, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface Row {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  published: boolean;
  published_at: string;
}

const SEV_ORDER: Row['severity'][] = ['info', 'warning', 'critical'];

export default function MinistryAnnouncementsEditor({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ title: '', body: '', severity: 'info' as Row['severity'] });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ministry_announcements')
      .select('id,title,body,severity,published,published_at')
      .eq('tenant_id', tenantId)
      .order('published_at', { ascending: false })
      .limit(25);
    if (!error) setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const publish = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      toast({ variant: 'destructive', title: 'Title and body are required' });
      return;
    }
    setCreating(true);
    const { error } = await supabase.from('ministry_announcements').insert({
      tenant_id: tenantId,
      title: draft.title.trim(),
      body: draft.body.trim(),
      severity: draft.severity,
      author_id: user?.id ?? null,
    });
    setCreating(false);
    if (error) { toast({ variant: 'destructive', title: 'Could not publish', description: error.message }); return; }
    toast({ title: 'Announcement published' });
    setDraft({ title: '', body: '', severity: 'info' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('ministry_announcements').delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: error.message }); return; }
    load();
  };

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <Megaphone className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ministry announcements
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <Input
          placeholder="Announcement title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <Textarea
          placeholder="Announcement body (visible to every user in this country)"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          rows={3}
        />
        <div className="flex items-center gap-2 justify-between">
          <div className="flex gap-1">
            {SEV_ORDER.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={draft.severity === s ? 'default' : 'outline'}
                onClick={() => setDraft({ ...draft, severity: s })}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={publish} disabled={creating} className="gap-1">
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Publish
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No announcements yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="bg-muted/30 rounded px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.title}</span>
                    <Badge
                      variant={r.severity === 'critical' ? 'destructive' : r.severity === 'warning' ? 'secondary' : 'outline'}
                      className="text-[10px] capitalize"
                    >
                      {r.severity}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(r.published_at).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
