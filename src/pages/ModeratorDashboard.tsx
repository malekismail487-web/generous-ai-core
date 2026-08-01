import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  TriangleAlert as AlertTriangle,
  Eye,
  Ban,
  MessageSquare,
  FileText,
  BookOpen,
  RefreshCw,
  CircleCheck as CheckCircle,
  Circle as XCircle,
  Loader as Loader2,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';

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
  const { user, loading: authLoading } = useAuth();
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

  /* ── Check moderator status ── */
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

    await supabase
      .from('content_flags')
      .update({ status: 'reviewed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', flag.id);

    if (actionType === 'terminate') {
      await supabase
        .from('profiles')
        .update({ is_active: false, status: 'terminated' })
        .eq('id', flag.user_id);
    }

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
      case 'high':     return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':   return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:         return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const contentTypeIcon = (t: string) => {
    switch (t) {
      case 'chat_message':    return <MessageSquare className="w-4 h-4" />;
      case 'course_material': return <FileText className="w-4 h-4" />;
      case 'assignment':      return <BookOpen className="w-4 h-4" />;
      default:                return <AlertTriangle className="w-4 h-4" />;
    }
  };

  /* ── Loading ── */
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  const appeals = actions.filter(a => a.appeal_status === 'appealed');

  const pendingFlagsCount = flags.filter(f => f.status === 'pending').length;
  const activeBansCount = actions.filter(
    a => a.is_active && (a.action_type === 'temp_ban' || a.action_type === 'terminate'),
  ).length;

  const navItems: NavItem[] = [
    { id: 'flags',   icon: <AlertTriangle size={18} />, label: 'Flags',   badge: pendingFlagsCount },
    { id: 'actions', icon: <Ban size={18} />,           label: 'Actions' },
    { id: 'appeals', icon: <Shield size={18} />,        label: 'Appeals', badge: appeals.length },
  ];

  const stats = [
    { label: 'Pending Flags',    value: pendingFlagsCount, icon: <AlertTriangle size={20} />, delay: 'fade-up-delay-1' },
    { label: 'Total Actions',    value: actions.length,    icon: <Ban size={20} />,           delay: 'fade-up-delay-2' },
    { label: 'Active Bans',      value: activeBansCount,   icon: <Shield size={20} />,        delay: 'fade-up-delay-3' },
    { label: 'Pending Appeals',  value: appeals.length,    icon: <Eye size={20} />,           delay: 'fade-up-delay-4' },
  ];

  return (
    <DashboardShell
      role="Moderator"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as 'flags' | 'actions' | 'appeals')}
      headerRight={
        <Button
          size="sm"
          variant="outline"
          onClick={() => { fetchFlags(); fetchActions(); }}
          className="gap-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      }
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div key={i} className={`lumina-stat fade-up ${stat.delay}`}>
              <div className="lumina-icon-tile mb-3">{stat.icon}</div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ═══════════════ Flags Tab ═══════════════ */}
        {activeTab === 'flags' && (
          <div className="tab-enter space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="lumina-text text-lg font-semibold">Flagged Content</h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={statusFilter === 'pending' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('pending')}
                >
                  Pending
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </Button>
              </div>
            </div>

            <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/40">Type</TableHead>
                    <TableHead className="text-white/40">Content</TableHead>
                    <TableHead className="text-white/40">Severity</TableHead>
                    <TableHead className="text-white/40">Reason</TableHead>
                    <TableHead className="text-white/40">Time</TableHead>
                    <TableHead className="text-white/40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map(flag => (
                    <TableRow key={flag.id} className="border-white/5">
                      <TableCell>
                        <div className="flex items-center gap-2 text-white/70">
                          {contentTypeIcon(flag.content_type)}
                          <span className="text-xs capitalize">{flag.content_type.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[300px] truncate text-xs text-white/60">{flag.content_text}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={severityColor(flag.severity)}>{flag.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs max-w-[200px] truncate text-white/50">{flag.reason || '-'}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-white/30">{new Date(flag.created_at).toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell>
                        {flag.status === 'pending' ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-white/10 text-white/60 hover:text-white"
                              onClick={() => { setActionDialog({ open: true, flag }); setActionType('warning'); }}
                            >
                              <Eye className="w-3 h-3" /> Review
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-white/40 hover:text-white"
                              onClick={() => dismissFlag(flag.id)}
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs border-white/20 text-white/50">{flag.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {flags.length === 0 && (
                    <TableRow className="border-white/5">
                      <TableCell colSpan={6} className="text-center py-8 text-white/30">No flagged content</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ═══════════════ Actions Tab ═══════════════ */}
        {activeTab === 'actions' && (
          <div className="tab-enter space-y-4">
            <h2 className="lumina-text text-lg font-semibold">Actions Taken</h2>

            <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/40">Action</TableHead>
                    <TableHead className="text-white/40">Message</TableHead>
                    <TableHead className="text-white/40">Status</TableHead>
                    <TableHead className="text-white/40">Appeal</TableHead>
                    <TableHead className="text-white/40">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map(action => (
                    <TableRow key={action.id} className="border-white/5">
                      <TableCell>
                        <Badge className={
                          action.action_type === 'terminate' ? 'bg-red-500/20 text-red-400' :
                          action.action_type === 'temp_ban'  ? 'bg-orange-500/20 text-orange-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {action.action_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs max-w-[300px] truncate text-white/60">{action.message || '-'}</p>
                      </TableCell>
                      <TableCell>
                        {action.is_active
                          ? <Badge className="bg-white/10 text-white/80">Active</Badge>
                          : <Badge variant="outline" className="border-white/20 text-white/40">Inactive</Badge>}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs capitalize text-white/50">{action.appeal_status}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-white/30">{new Date(action.created_at).toLocaleDateString()}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {actions.length === 0 && (
                    <TableRow className="border-white/5">
                      <TableCell colSpan={5} className="text-center py-8 text-white/30">No actions taken yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ═══════════════ Appeals Tab ═══════════════ */}
        {activeTab === 'appeals' && (
          <div className="tab-enter space-y-4">
            <h2 className="lumina-text text-lg font-semibold">Pending Appeals</h2>

            <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/40">Action Type</TableHead>
                    <TableHead className="text-white/40">Appeal Reason</TableHead>
                    <TableHead className="text-white/40">Date</TableHead>
                    <TableHead className="text-white/40">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appeals.map(appeal => (
                    <TableRow key={appeal.id} className="border-white/5">
                      <TableCell>
                        <Badge className="bg-white/10 text-white/80">{appeal.action_type.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs max-w-[300px] text-white/60">
                          {(appeal as any).appeal_reason || 'No reason provided'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-white/30">{new Date(appeal.created_at).toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-white/10 text-white/60 hover:text-white"
                            onClick={() => resolveAppeal(appeal.id, 'upheld')}
                          >
                            <CheckCircle className="w-3 h-3" /> Uphold
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-white/10 text-orange-400 hover:text-orange-300"
                            onClick={() => resolveAppeal(appeal.id, 'overturned')}
                          >
                            <XCircle className="w-3 h-3" /> Overturn
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {appeals.length === 0 && (
                    <TableRow className="border-white/5">
                      <TableCell colSpan={4} className="text-center py-8 text-white/30">No pending appeals</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Dialog ── */}
      <Dialog open={actionDialog.open} onOpenChange={(o) => { if (!o) setActionDialog({ open: false, flag: null }); }}>
        <DialogContent className="bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="lumina-text">Take Moderation Action</DialogTitle>
          </DialogHeader>
          {actionDialog.flag && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-white/40 mb-1">Flagged Content:</p>
                <p className="text-sm text-white/80">{actionDialog.flag.content_text.substring(0, 500)}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Action Type</label>
                <Select value={actionType} onValueChange={(v) => setActionType(v as 'warning' | 'temp_ban' | 'terminate')}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-white/10">
                    <SelectItem value="warning">⚠️ Warning</SelectItem>
                    <SelectItem value="temp_ban">🚫 Temporary Ban (24h)</SelectItem>
                    <SelectItem value="terminate">💀 Terminate Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Message to User / School Admin</label>
                <Textarea
                  placeholder="Explain the reason for this action..."
                  value={actionMessage}
                  onChange={(e) => setActionMessage(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, flag: null })} className="border-white/10 text-white/60">
              Cancel
            </Button>
            <Button
              onClick={handleTakeAction}
              disabled={submitting}
              className={actionType === 'terminate' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {actionType === 'warning' ? 'Send Warning' : actionType === 'temp_ban' ? 'Ban 24h' : 'Terminate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
