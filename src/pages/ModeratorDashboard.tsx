import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, LogOut, Loader2, AlertTriangle, Eye, Ban, Trash2,
  MessageSquare, FileText, BookOpen, RefreshCw, CheckCircle, XCircle
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

type ContentFlag = {
  id: string;
  content_type: string;
  content_id: string | null;
  content_text: string;
  user_id: string;
  school_id: string | null;
  severity: string;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

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
  appeal_status: string;
  created_at: string;
};

export default function ModeratorDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [activeTab, setActiveTab] = useState<'flags' | 'actions' | 'appeals'>('flags');
  const [actionDialog, setActionDialog] = useState<{ open: boolean; flag: ContentFlag | null }>({ open: false, flag: null });
  const [actionType, setActionType] = useState<'warning' | 'temp_ban' | 'terminate'>('warning');
  const [actionMessage, setActionMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');

  // Check moderator status
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }

    const check = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_type, is_active, status')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.user_type === 'moderator' && data.is_active && data.status === 'approved') {
        setIsModerator(true);
      } else {
        navigate('/pending-approval');
        return;
      }
      setLoading(false);
    };
    check();
  }, [user, authLoading, navigate]);

  const fetchFlags = useCallback(async () => {
    const query = supabase
      .from('content_flags')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (statusFilter === 'pending') {
      query.eq('status', 'pending');
    }

    const { data } = await query;
    setFlags((data || []) as ContentFlag[]);
  }, [statusFilter]);

  const fetchActions = useCallback(async () => {
    const { data } = await supabase
      .from('moderation_actions')
      .select('*')
      .order('created_at', { ascending: false });
    setActions((data || []) as ModerationAction[]);
  }, []);

  useEffect(() => {
    if (isModerator) {
      fetchFlags();
      fetchActions();
    }
  }, [isModerator, fetchFlags, fetchActions]);

  const handleTakeAction = async () => {
    if (!actionDialog.flag || !user) return;
    setSubmitting(true);

    const flag = actionDialog.flag;

    // Insert moderation action
    const expiresAt = actionType === 'temp_ban'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error: actionError } = await supabase
      .from('moderation_actions')
      .insert({
        flag_id: flag.id,
        target_user_id: flag.user_id,
        moderator_id: user.id,
        action_type: actionType,
        message: actionMessage || null,
        school_id: flag.school_id,
        expires_at: expiresAt,
      });

    if (actionError) {
      toast({ variant: 'destructive', title: 'Error', description: actionError.message });
      setSubmitting(false);
      return;
    }

    // Mark flag as reviewed
    await supabase
      .from('content_flags')
      .update({ status: 'reviewed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', flag.id);

    // If terminate, deactivate the user profile
    if (actionType === 'terminate') {
      await supabase
        .from('profiles')
        .update({ is_active: false, status: 'terminated' })
        .eq('id', flag.user_id);
    }

    // If temp_ban, deactivate temporarily
    if (actionType === 'temp_ban') {
      await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', flag.user_id);
    }

    toast({ title: 'Action taken successfully' });
    setActionDialog({ open: false, flag: null });
    setActionMessage('');
    setSubmitting(false);
    fetchFlags();
    fetchActions();
  };

  const dismissFlag = async (flagId: string) => {
    if (!user) return;
    await supabase
      .from('content_flags')
      .update({ status: 'dismissed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', flagId);
    fetchFlags();
    toast({ title: 'Flag dismissed' });
  };

  const resolveAppeal = async (actionId: string, decision: 'upheld' | 'overturned') => {
    if (!user) return;
    await supabase
      .from('moderation_actions')
      .update({
        appeal_status: decision,
        appeal_resolved_by: user.id,
        appeal_resolved_at: new Date().toISOString(),
        ...(decision === 'overturned' ? { is_active: false } : {}),
      })
      .eq('id', actionId);

    // If overturned, reactivate the user
    if (decision === 'overturned') {
      const action = actions.find(a => a.id === actionId);
      if (action) {
        await supabase
          .from('profiles')
          .update({ is_active: true, status: 'approved' })
          .eq('id', action.target_user_id);
      }
    }

    toast({ title: `Appeal ${decision}` });
    fetchActions();
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const contentTypeIcon = (t: string) => {
    switch (t) {
      case 'chat_message': return <MessageSquare className="w-4 h-4" />;
      case 'course_material': return <FileText className="w-4 h-4" />;
      case 'assignment': return <BookOpen className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const appeals = actions.filter(a => a.appeal_status === 'appealed');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Content Moderation</h1>
              <p className="text-[10px] text-muted-foreground">Global Content Safety Monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => { fetchFlags(); fetchActions(); }} className="gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => signOut()} className="gap-1">
              <LogOut className="w-3 h-3" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Pending Flags', value: flags.filter(f => f.status === 'pending').length, color: 'text-red-400' },
            { label: 'Total Actions', value: actions.length, color: 'text-amber-400' },
            { label: 'Active Bans', value: actions.filter(a => a.is_active && (a.action_type === 'temp_ban' || a.action_type === 'terminate')).length, color: 'text-orange-400' },
            { label: 'Pending Appeals', value: appeals.length, color: 'text-blue-400' },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b">
          {[
            { id: 'flags' as const, label: 'Flagged Content', icon: AlertTriangle },
            { id: 'actions' as const, label: 'Actions Taken', icon: Ban },
            { id: 'appeals' as const, label: `Appeals (${appeals.length})`, icon: Shield },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Flags Tab */}
        {activeTab === 'flags' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={statusFilter === 'pending' ? 'default' : 'outline'} onClick={() => setStatusFilter('pending')}>Pending</Button>
              <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>All</Button>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map(flag => (
                    <TableRow key={flag.id}>
                      <TableCell><div className="flex items-center gap-2">{contentTypeIcon(flag.content_type)}<span className="text-xs capitalize">{flag.content_type.replace('_', ' ')}</span></div></TableCell>
                      <TableCell><p className="max-w-[300px] truncate text-xs">{flag.content_text}</p></TableCell>
                      <TableCell><Badge className={severityColor(flag.severity)}>{flag.severity}</Badge></TableCell>
                      <TableCell><p className="text-xs max-w-[200px] truncate">{flag.reason || '-'}</p></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{new Date(flag.created_at).toLocaleDateString()}</span></TableCell>
                      <TableCell>
                        {flag.status === 'pending' ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setActionDialog({ open: true, flag }); setActionType('warning'); }}>
                              <Eye className="w-3 h-3" /> Review
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismissFlag(flag.id)}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs">{flag.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {flags.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No flagged content</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Appeal</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map(action => (
                  <TableRow key={action.id}>
                    <TableCell>
                      <Badge className={
                        action.action_type === 'terminate' ? 'bg-red-500/20 text-red-400' :
                        action.action_type === 'temp_ban' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>{action.action_type.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell><p className="text-xs max-w-[300px] truncate">{action.message || '-'}</p></TableCell>
                    <TableCell>{action.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                    <TableCell><span className="text-xs capitalize">{action.appeal_status}</span></TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{new Date(action.created_at).toLocaleDateString()}</span></TableCell>
                  </TableRow>
                ))}
                {actions.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No actions taken yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Appeals Tab */}
        {activeTab === 'appeals' && (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action Type</TableHead>
                  <TableHead>Appeal Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appeals.map(appeal => (
                  <TableRow key={appeal.id}>
                    <TableCell><Badge>{appeal.action_type.replace('_', ' ')}</Badge></TableCell>
                    <TableCell><p className="text-xs max-w-[300px]">{(appeal as any).appeal_reason || 'No reason provided'}</p></TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{new Date(appeal.created_at).toLocaleDateString()}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => resolveAppeal(appeal.id, 'upheld')}>
                          <CheckCircle className="w-3 h-3" /> Uphold
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-orange-400" onClick={() => resolveAppeal(appeal.id, 'overturned')}>
                          <XCircle className="w-3 h-3" /> Overturn
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {appeals.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No pending appeals</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(o) => { if (!o) setActionDialog({ open: false, flag: null }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take Moderation Action</DialogTitle>
          </DialogHeader>
          {actionDialog.flag && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Flagged Content:</p>
                <p className="text-sm">{actionDialog.flag.content_text.substring(0, 500)}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action Type</label>
                <Select value={actionType} onValueChange={(v) => setActionType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">⚠️ Warning</SelectItem>
                    <SelectItem value="temp_ban">🚫 Temporary Ban (24h)</SelectItem>
                    <SelectItem value="terminate">💀 Terminate Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message to User / School Admin</label>
                <Textarea placeholder="Explain the reason for this action..." value={actionMessage} onChange={(e) => setActionMessage(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, flag: null })}>Cancel</Button>
            <Button onClick={handleTakeAction} disabled={submitting} className={actionType === 'terminate' ? 'bg-red-600 hover:bg-red-700' : ''}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {actionType === 'warning' ? 'Send Warning' : actionType === 'temp_ban' ? 'Ban 24h' : 'Terminate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
