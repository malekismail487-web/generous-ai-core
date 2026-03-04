import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Loader2, MessageSquare
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

type ModerationAction = {
  id: string;
  flag_id: string | null;
  target_user_id: string;
  moderator_id: string;
  action_type: string;
  message: string | null;
  school_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  appeal_status: string | null;
  appeal_reason: string | null;
  appealed_by: string | null;
  created_at: string;
};

interface SchoolAdminAppealsProps {
  schoolId: string;
}

export function SchoolAdminAppeals({ schoolId }: SchoolAdminAppealsProps) {
  const { toast } = useToast();
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [appealDialog, setAppealDialog] = useState<{ open: boolean; action: ModerationAction | null }>({ open: false, action: null });
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchActions = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    const { data } = await supabase
      .from('moderation_actions')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    setActions((data || []) as ModerationAction[]);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const submitAppeal = async () => {
    if (!appealDialog.action || !appealReason.trim()) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('moderation_actions')
      .update({
        appeal_status: 'appealed',
        appeal_reason: appealReason,
        appealed_by: (await supabase.auth.getUser()).data.user?.id || null,
      })
      .eq('id', appealDialog.action.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Appeal submitted', description: 'The appeal has been sent to moderators, ministry, and super admin for review.' });
    }

    setAppealDialog({ open: false, action: null });
    setAppealReason('');
    setSubmitting(false);
    fetchActions();
  };

  const actionTypeLabel = (type: string) => {
    switch (type) {
      case 'warning': return '⚠️ Warning';
      case 'temp_ban': return '🚫 24h Ban';
      case 'terminate': return '💀 Terminated';
      default: return type;
    }
  };

  const actionColor = (type: string) => {
    switch (type) {
      case 'terminate': return 'bg-destructive/20 text-destructive';
      case 'temp_ban': return 'bg-orange-500/20 text-orange-500';
      default: return 'bg-yellow-500/20 text-yellow-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Moderation Actions & Appeals</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Review moderation actions taken against students and teachers in your school. You can appeal any action you believe was incorrect.
      </p>

      {actions.length === 0 ? (
        <div className="rounded-xl border p-8 text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground">No moderation actions for your school. All clear!</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Appeal Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map(action => (
                <TableRow key={action.id}>
                  <TableCell>
                    <Badge className={actionColor(action.action_type)}>
                      {actionTypeLabel(action.action_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs max-w-[250px] truncate">{action.message || 'No message'}</p>
                  </TableCell>
                  <TableCell>
                    {action.is_active ? (
                      <Badge variant="destructive">Active</Badge>
                    ) : (
                      <Badge variant="outline">Resolved</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs capitalize ${
                      action.appeal_status === 'appealed' ? 'text-amber-500' :
                      action.appeal_status === 'overturned' ? 'text-primary' :
                      action.appeal_status === 'upheld' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {action.appeal_status || 'none'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(action.created_at).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {action.is_active && (!action.appeal_status || action.appeal_status === 'none') ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => { setAppealDialog({ open: true, action }); setAppealReason(''); }}
                      >
                        <MessageSquare className="w-3 h-3" /> Appeal
                      </Button>
                    ) : action.appeal_status === 'appealed' ? (
                      <span className="text-xs text-amber-500">Under Review</span>
                    ) : action.appeal_status === 'overturned' ? (
                      <span className="text-xs text-primary">✅ Overturned</span>
                    ) : action.appeal_status === 'upheld' ? (
                      <span className="text-xs text-destructive">Decision Upheld</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Appeal Dialog */}
      <Dialog open={appealDialog.open} onOpenChange={(o) => { if (!o) setAppealDialog({ open: false, action: null }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appeal Moderation Action</DialogTitle>
          </DialogHeader>
          {appealDialog.action && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Action:</p>
                <p className="text-sm font-medium">{actionTypeLabel(appealDialog.action.action_type)}</p>
                <p className="text-xs text-muted-foreground mt-2">Moderator's message:</p>
                <p className="text-sm">{appealDialog.action.message || 'No message provided'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason for Appeal</label>
                <Textarea
                  placeholder="Explain why this action should be reconsidered..."
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This appeal will be reviewed by the moderator, ministry, and super admin.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealDialog({ open: false, action: null })}>Cancel</Button>
            <Button onClick={submitAppeal} disabled={submitting || !appealReason.trim()}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit Appeal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
