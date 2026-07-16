import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CheckCircle2, Loader2, PlusCircle, Send, Undo2, XCircle } from 'lucide-react';
import { useMinistryControl, type ChangeRequest, type ChangeStatus } from '@/hooks/useMinistryControl';
import { supabase } from '@/integrations/supabase/client';

const STATUSES: Array<{ id: 'all' | ChangeStatus; label: string; hint: string }> = [
  { id: 'all', label: 'All', hint: '' },
  { id: 'in_review', label: 'In Review', hint: 'Awaiting approval' },
  { id: 'approved', label: 'Approved', hint: 'Ready to publish' },
  { id: 'published', label: 'Published', hint: 'Applied to tenant' },
  { id: 'rejected', label: 'Rejected', hint: '' },
  { id: 'withdrawn', label: 'Withdrawn', hint: '' },
];

const STATUS_CLASS: Record<ChangeStatus, string> = {
  draft: 'text-gray-400 bg-gray-900 border-gray-800',
  in_review: 'text-amber-300 bg-amber-950/50 border-amber-800/50',
  approved: 'text-sky-300 bg-sky-950/50 border-sky-800/50',
  published: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50',
  rejected: 'text-red-300 bg-red-950/50 border-red-800/50',
  withdrawn: 'text-gray-500 bg-gray-950 border-gray-800',
};

export function PublishingPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [filter, setFilter] = useState<'all' | ChangeStatus>('all');
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChangeRequest | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listChangeRequests(filter === 'all' ? undefined : filter);
      setItems(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to load change requests', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api, filter, toast]);

  useEffect(() => { void load(); }, [load]);

  // Resolve the tenant this session is scoped to (needed for the "New draft" demo submission).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = api.token;
      if (!token) return;
      const { data } = await supabase
        .from('ministry_sessions')
        .select('tenant_id')
        .eq('session_token', token)
        .maybeSingle();
      if (!cancelled && data?.tenant_id) setTenantId(data.tenant_id);
    })();
    return () => { cancelled = true; };
  }, [api.token]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const it of items) map[it.status] = (map[it.status] || 0) + 1;
    return map;
  }, [items]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: ok });
      await load();
      setSelected(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Action failed', description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                filter === s.id
                  ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300'
                  : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              {s.label}
              <span className="ml-2 text-[10px] opacity-70">{counts[s.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <NewDraftDialog tenantId={tenantId} onCreated={load} />
      </div>

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">Title</TableHead>
              <TableHead className="text-gray-500">Entity</TableHead>
              <TableHead className="text-gray-500">Status</TableHead>
              <TableHead className="text-gray-500">Author</TableHead>
              <TableHead className="text-gray-500">Updated</TableHead>
              <TableHead className="text-gray-500 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500 inline" />
              </TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-600 py-10">
                No change requests {filter !== 'all' ? `in "${filter}"` : 'yet'}. Use "New draft" to exercise the pipeline.
              </TableCell></TableRow>
            )}
            {!loading && filtered.map((req) => (
              <TableRow key={req.id} className="border-gray-800/50">
                <TableCell className="font-medium text-gray-200">
                  <button className="hover:text-emerald-300 text-left" onClick={() => setSelected(req)}>
                    {req.title}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-gray-500">{req.entity_type}</TableCell>
                <TableCell>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_CLASS[req.status]}`}>
                    {req.status.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-gray-400 text-xs">{req.author_label ?? '—'}</TableCell>
                <TableCell className="text-gray-500 text-xs">
                  {new Date(req.updated_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <RequestActions
                    req={req}
                    busy={busyId === req.id}
                    onReview={(decision, notes) =>
                      act(req.id, () => api.reviewChangeRequest(req.id, decision, notes),
                        decision === 'approve' ? 'Change request approved' : 'Change request rejected')
                    }
                    onPublish={() =>
                      act(req.id, () => api.publishChangeRequest(req.id), 'Change published')
                    }
                    onWithdraw={() =>
                      act(req.id, () => api.withdrawChangeRequest(req.id), 'Change withdrawn')
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DetailDialog request={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RequestActions({
  req, busy, onReview, onPublish, onWithdraw,
}: {
  req: ChangeRequest;
  busy: boolean;
  onReview: (decision: 'approve' | 'reject', notes?: string) => void;
  onPublish: () => void;
  onWithdraw: () => void;
}) {
  if (busy) return <Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" />;
  if (req.status === 'in_review') {
    return (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs border-sky-800/50 text-sky-300"
          onClick={() => onReview('approve')}>
          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs border-red-800/50 text-red-300"
          onClick={() => {
            const notes = window.prompt('Reason for rejection?') ?? undefined;
            if (notes !== null) onReview('reject', notes);
          }}>
          <XCircle className="w-3 h-3 mr-1" /> Reject
        </Button>
      </div>
    );
  }
  if (req.status === 'approved') {
    return (
      <div className="flex justify-end gap-1">
        <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600" onClick={onPublish}>
          <Send className="w-3 h-3 mr-1" /> Publish
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onWithdraw}>
          <Undo2 className="w-3 h-3 mr-1" /> Withdraw
        </Button>
      </div>
    );
  }
  return <span className="text-[10px] text-gray-600">—</span>;
}

function NewDraftDialog({ tenantId, onCreated }: { tenantId: string | null; onCreated: () => void }) {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [payload, setPayload] = useState('{\n  "note": "MC2 pipeline verification"\n}');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!tenantId) {
      toast({ variant: 'destructive', title: 'No tenant context', description: 'Ministry session is not scoped to a tenant.' });
      return;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(payload || '{}');
    } catch {
      toast({ variant: 'destructive', title: 'Invalid JSON payload' });
      return;
    }
    setSaving(true);
    try {
      await api.submitChangeRequest({
        tenantId,
        entityType: 'mc.test',
        title: title.trim() || 'MC2 pipeline check',
        summary: summary.trim() || undefined,
        payload: parsed,
      });
      toast({ title: 'Draft submitted for review' });
      setOpen(false);
      setTitle('');
      setSummary('');
      onCreated();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Submit failed', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-emerald-800/50 text-emerald-300">
          <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> New draft
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-950 border-gray-800 text-gray-200">
        <DialogHeader>
          <DialogTitle>Submit change request</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            MC2 exposes only the generic <code className="font-mono">mc.test</code> entity type. Real
            curriculum, policy, and school entity types are registered in phases MC3+.
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Pipeline verification" className="bg-gray-900 border-gray-800" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Summary</Label>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional" className="bg-gray-900 border-gray-800" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Payload (JSON)</Label>
            <Textarea value={payload} onChange={(e) => setPayload(e.target.value)}
              rows={6} className="bg-gray-900 border-gray-800 font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit for review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ request, onClose }: { request: ChangeRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-gray-950 border-gray-800 text-gray-200 max-w-2xl">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {request.entity_type} · {request.status} · {new Date(request.created_at).toLocaleString()}
              </p>
            </DialogHeader>
            {request.summary && <p className="text-sm text-gray-400">{request.summary}</p>}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-600">Payload</p>
              <pre className="text-xs bg-black/40 border border-gray-800 p-3 rounded max-h-64 overflow-auto">
                {JSON.stringify(request.payload, null, 2)}
              </pre>
              {request.previous_snapshot && (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mt-3">Previous</p>
                  <pre className="text-xs bg-black/40 border border-gray-800 p-3 rounded max-h-40 overflow-auto">
                    {JSON.stringify(request.previous_snapshot, null, 2)}
                  </pre>
                </>
              )}
            </div>
            <div className="text-[11px] text-gray-500 space-y-1 border-t border-gray-800 pt-3">
              {request.author_label && <div>Author: {request.author_label}</div>}
              {request.reviewer_label && <div>Reviewer: {request.reviewer_label} {request.review_notes ? `— ${request.review_notes}` : ''}</div>}
              {request.publisher_label && <div>Published by: {request.publisher_label} on {request.published_at && new Date(request.published_at).toLocaleString()}</div>}
              {request.reject_reason && <div className="text-red-400">Rejected: {request.reject_reason}</div>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
