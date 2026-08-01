import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  LayoutGrid,
  Gavel,
  Inbox,
  Clock,
  CircleDot,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
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
  appeal_reason?: string | null;
  created_at: string;
};

/* ──────────────────────────────────────────────────────────────
 * Severity badge — red / amber / white per spec
 * ────────────────────────────────────────────────────────────── */
function SeverityBadge({ severity }: { severity: string }) {
  const cfg = (() => {
    switch (severity) {
      case 'critical':
      case 'high':
        return {
          ring: 'border-red-500/40',
          bg: 'bg-red-500/15',
          text: 'text-red-300',
          dot: 'bg-red-400',
        };
      case 'medium':
        return {
          ring: 'border-amber-500/40',
          bg: 'bg-amber-500/15',
          text: 'text-amber-300',
          dot: 'bg-amber-400',
        };
      default:
        return {
          ring: 'border-white/25',
          bg: 'bg-white/10',
          text: 'text-white/70',
          dot: 'bg-white/60',
        };
    }
  })();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono border ${cfg.ring} ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {severity}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Action-type badge
 * ────────────────────────────────────────────────────────────── */
function ActionBadge({ type }: { type: string }) {
  const cfg = (() => {
    switch (type) {
      case 'terminate':
        return { ring: 'border-red-500/40', bg: 'bg-red-500/15', text: 'text-red-300' };
      case 'temp_ban':
        return { ring: 'border-amber-500/40', bg: 'bg-amber-500/15', text: 'text-amber-300' };
      default:
        return { ring: 'border-white/25', bg: 'bg-white/10', text: 'text-white/70' };
    }
  })();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono border ${cfg.ring} ${cfg.bg} ${cfg.text}`}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

function contentTypeIcon(t: string) {
  switch (t) {
    case 'chat_message':    return <MessageSquare className="w-4 h-4" />;
    case 'course_material': return <FileText className="w-4 h-4" />;
    case 'assignment':      return <BookOpen className="w-4 h-4" />;
    default:                return <AlertTriangle className="w-4 h-4" />;
  }
}

/* ──────────────────────────────────────────────────────────────
 * ModeratorDashboard — Kanban Triage Board
 * Three glass columns: Pending Flags | Actions Taken | Appeals
 * ────────────────────────────────────────────────────────────── */
export default function ModeratorDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'board'>('overview');
  const [actionDialog, setActionDialog] = useState<{ open: boolean; flag: ContentFlag | null }>({ open: false, flag: null });
  const [actionType, setActionType] = useState<'warning' | 'temp_ban' | 'terminate'>('warning');
  const [actionMessage, setActionMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');

  /* ── Check moderator status — preserve gate ── */
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

  /* ── Loading state uses LuminaAtom ── */
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="flex flex-col items-center gap-4">
          <LuminaAtom size={72} animate glow />
          <p className="lumina-text text-xs tracking-[0.3em] uppercase font-mono text-white/40">Loading Triage</p>
        </div>
      </div>
    );
  }

  /* ── Derived data ── */
  const pendingFlags = flags.filter(f => f.status === 'pending');
  const reviewedFlags = flags.filter(f => f.status !== 'pending');
  const appeals = actions.filter(a => a.appeal_status === 'appealed');
  const activeBansCount = actions.filter(
    a => a.is_active && (a.action_type === 'temp_ban' || a.action_type === 'terminate'),
  ).length;

  const pendingFlagsCount = pendingFlags.length;

  const navItems: NavItem[] = [
    { id: 'overview', icon: <LayoutGrid size={18} />, label: 'Overview' },
    { id: 'board',    icon: <Gavel size={18} />,      label: 'Triage Board', badge: pendingFlagsCount },
  ];

  const stats = [
    { label: 'Pending Flags',   value: pendingFlagsCount, icon: <AlertTriangle size={20} />, delay: 'fade-up-delay-1', tone: 'text-red-300' },
    { label: 'Total Actions',   value: actions.length,    icon: <Ban size={20} />,           delay: 'fade-up-delay-2', tone: 'text-white' },
    { label: 'Active Bans',     value: activeBansCount,   icon: <Shield size={20} />,        delay: 'fade-up-delay-3', tone: 'text-amber-300' },
    { label: 'Pending Appeals', value: appeals.length,    icon: <Eye size={20} />,           delay: 'fade-up-delay-4', tone: 'text-white/80' },
  ];

  /* ── Kanban column config ── */
  const columns = [
    {
      key: 'pending',
      title: 'Pending Flags',
      icon: <Inbox size={16} />,
      count: pendingFlags.length,
      accent: 'text-red-300',
      ring: 'border-red-500/20',
      glow: 'shadow-[0_0_40px_-12px_rgba(239,68,68,0.25)]',
      empty: 'No pending flags — queue is clear',
    },
    {
      key: 'actions',
      title: 'Actions Taken',
      icon: <Ban size={16} />,
      count: actions.length,
      accent: 'text-amber-300',
      ring: 'border-amber-500/20',
      glow: 'shadow-[0_0_40px_-12px_rgba(245,158,11,0.2)]',
      empty: 'No actions recorded yet',
    },
    {
      key: 'appeals',
      title: 'Appeals',
      icon: <Shield size={16} />,
      count: appeals.length,
      accent: 'text-white/80',
      ring: 'border-white/15',
      glow: 'shadow-[0_0_40px_-12px_rgba(232,232,232,0.15)]',
      empty: 'No pending appeals',
    },
  ] as const;

  return (
    <DashboardShell
      role="Moderator"
      roleAccent="rgba(232,232,232,0.35)"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as 'overview' | 'board')}
      headerRight={
        <button
          onClick={() => { fetchFlags(); fetchActions(); }}
          className="lumina-btn-glass gap-1.5 text-xs"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ════════════ Stat bar ════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            <div key={i} className={`lumina-stat fade-up ${stat.delay}`}>
              <div className="lumina-icon-tile mb-3">{stat.icon}</div>
              <p className={`text-2xl font-bold font-mono ${stat.tone}`}>{stat.value}</p>
              <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="lumina-divider fade-up" />

        {/* ════════════ Overview Tab ════════════ */}
        {activeTab === 'overview' && (
          <div className="tab-enter space-y-6">
            {/* Atom hero */}
            <div className="lumina-card p-6 flex flex-col md:flex-row items-center gap-6 fade-up fade-up-delay-1">
              <LuminaAtom size={80} animate glow />
              <div className="flex-1 text-center md:text-left">
                <h2 className="lumina-text text-lg font-semibold mb-1">Moderation Triage</h2>
                <p className="text-sm text-white/40 max-w-md">
                  Review flagged content, take moderation actions, and resolve user appeals.
                  Use the Triage Board for a kanban-style workflow.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('board')}
                className="lumina-btn-glass gap-2 text-sm"
              >
                <Gavel className="w-4 h-4" />
                Open Board
              </button>
            </div>

            {/* Column summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 fade-up fade-up-delay-2">
              {columns.map((col) => (
                <button
                  key={col.key}
                  onClick={() => setActiveTab('board')}
                  className={`lumina-card p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:${col.glow}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={col.accent}>{col.icon}</span>
                      <h3 className="lumina-text text-sm font-semibold">{col.title}</h3>
                    </div>
                    <span className={`text-2xl font-bold font-mono ${col.accent}`}>{col.count}</span>
                  </div>
                  <p className="text-xs text-white/30">{col.empty}</p>
                </button>
              ))}
            </div>

            <div className="lumina-divider" />

            {/* Recent activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up fade-up-delay-3">
              <div className="lumina-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-white/40" />
                  <h3 className="lumina-text text-sm font-semibold">Recent Flags</h3>
                </div>
                <div className="space-y-2">
                  {flags.slice(0, 4).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <span className="text-white/40">{contentTypeIcon(f.content_type)}</span>
                      <p className="text-xs text-white/60 truncate flex-1 font-mono">{f.content_text}</p>
                      <SeverityBadge severity={f.severity} />
                    </div>
                  ))}
                  {flags.length === 0 && (
                    <p className="text-xs text-white/30 text-center py-4">No flags</p>
                  )}
                </div>
              </div>

              <div className="lumina-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Gavel className="w-4 h-4 text-white/40" />
                  <h3 className="lumina-text text-sm font-semibold">Recent Actions</h3>
                </div>
                <div className="space-y-2">
                  {actions.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <ActionBadge type={a.action_type} />
                      <p className="text-xs text-white/60 truncate flex-1 font-mono">{a.message || '—'}</p>
                      <span className="text-xs text-white/30 font-mono">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {actions.length === 0 && (
                    <p className="text-xs text-white/30 text-center py-4">No actions</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ Triage Board (Kanban) ════════════ */}
        {activeTab === 'board' && (
          <div className="tab-enter space-y-5">
            {/* Filter row */}
            <div className="flex items-center justify-between flex-wrap gap-3 fade-up">
              <h2 className="lumina-text text-lg font-semibold">Triage Board</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`lumina-btn-glass text-xs ${statusFilter === 'pending' ? 'ring-1 ring-white/30' : ''}`}
                >
                  <CircleDot className="w-3 h-3" /> Pending Only
                </button>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`lumina-btn-glass text-xs ${statusFilter === 'all' ? 'ring-1 ring-white/30' : ''}`}
                >
                  <LayoutGrid className="w-3 h-3" /> All
                </button>
              </div>
            </div>

            {/* ── Three-column kanban ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 fade-up fade-up-delay-1">
              {/* ───── Column: Pending Flags ───── */}
              <div className={`lumina-card p-4 flex flex-col min-h-[400px] ${columns[0].ring} ${columns[0].glow} cosmic-float`}>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className={columns[0].accent}><Inbox size={16} /></span>
                    <h3 className="lumina-text text-sm font-semibold">Pending Flags</h3>
                  </div>
                  <span className={`text-sm font-bold font-mono ${columns[0].accent}`}>{pendingFlags.length}</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {pendingFlags.map((flag, idx) => (
                    <div
                      key={flag.id}
                      className="lumina-card p-3 cursor-grab active:cursor-grabbing transition-transform hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-white/60">
                          {contentTypeIcon(flag.content_type)}
                          <span className="text-[10px] uppercase tracking-wider font-mono text-white/40">
                            {flag.content_type.replace('_', ' ')}
                          </span>
                        </div>
                        <SeverityBadge severity={flag.severity} />
                      </div>
                      <p className="text-xs text-white/70 font-mono leading-relaxed mb-2 line-clamp-3">
                        {flag.content_text}
                      </p>
                      {flag.reason && (
                        <p className="text-[10px] text-white/40 mb-3 truncate">↳ {flag.reason}</p>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-[10px] text-white/30 font-mono">
                          {new Date(flag.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setActionDialog({ open: true, flag }); setActionType('warning'); }}
                            className="lumina-btn-icon w-7 h-7"
                            title="Review / Take action"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => dismissFlag(flag.id)}
                            className="lumina-btn-icon w-7 h-7 text-white/40 hover:text-red-300"
                            title="Dismiss flag"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {pendingFlags.length === 0 && (
                    <div className="flex-1 flex items-center justify-center py-12">
                      <p className="text-xs text-white/30 text-center">{columns[0].empty}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ───── Column: Actions Taken ───── */}
              <div className={`lumina-card p-4 flex flex-col min-h-[400px] ${columns[1].ring} ${columns[1].glow} cosmic-float`} style={{ animationDelay: '0.4s' }}>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className={columns[1].accent}><Ban size={16} /></span>
                    <h3 className="lumina-text text-sm font-semibold">Actions Taken</h3>
                  </div>
                  <span className={`text-sm font-bold font-mono ${columns[1].accent}`}>{actions.length}</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {actions.map((action, idx) => (
                    <div
                      key={action.id}
                      className="lumina-card p-3 transition-transform hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <ActionBadge type={action.action_type} />
                        <span className={`text-[10px] font-mono ${action.is_active ? 'text-emerald-300' : 'text-white/30'}`}>
                          {action.is_active ? '● ACTIVE' : '○ INACTIVE'}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono leading-relaxed mb-2 line-clamp-3">
                        {action.message || 'No message recorded'}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-[10px] text-white/30 font-mono">
                          {new Date(action.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono capitalize">
                          appeal: {action.appeal_status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {actions.length === 0 && (
                    <div className="flex-1 flex items-center justify-center py-12">
                      <p className="text-xs text-white/30 text-center">{columns[1].empty}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ───── Column: Appeals ───── */}
              <div className={`lumina-card p-4 flex flex-col min-h-[400px] ${columns[2].ring} ${columns[2].glow} cosmic-float`} style={{ animationDelay: '0.8s' }}>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className={columns[2].accent}><Shield size={16} /></span>
                    <h3 className="lumina-text text-sm font-semibold">Appeals</h3>
                  </div>
                  <span className={`text-sm font-bold font-mono ${columns[2].accent}`}>{appeals.length}</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {appeals.map((appeal, idx) => (
                    <div
                      key={appeal.id}
                      className="lumina-card p-3 transition-transform hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <ActionBadge type={appeal.action_type} />
                        <span className="text-[10px] text-white/30 font-mono">
                          {new Date(appeal.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono leading-relaxed mb-3 line-clamp-3">
                        {appeal.appeal_reason || 'No reason provided'}
                      </p>
                      <div className="flex gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => resolveAppeal(appeal.id, 'upheld')}
                          className="lumina-btn-glass flex-1 text-[10px] gap-1 justify-center"
                        >
                          <CheckCircle className="w-3 h-3" /> Uphold
                        </button>
                        <button
                          onClick={() => resolveAppeal(appeal.id, 'overturned')}
                          className="lumina-btn-glass flex-1 text-[10px] gap-1 justify-center text-amber-300"
                        >
                          <XCircle className="w-3 h-3" /> Overturn
                        </button>
                      </div>
                    </div>
                  ))}
                  {appeals.length === 0 && (
                    <div className="flex-1 flex items-center justify-center py-12">
                      <p className="text-xs text-white/30 text-center">{columns[2].empty}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reviewed flags footer */}
            {reviewedFlags.length > 0 && (
              <>
                <div className="lumina-divider" />
                <div className="fade-up">
                  <h3 className="lumina-text text-sm font-semibold mb-3 text-white/50">
                    Recently Reviewed ({reviewedFlags.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {reviewedFlags.slice(0, 6).map((f) => (
                      <div key={f.id} className="lumina-card p-3 opacity-70">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono text-white/40">
                            {f.content_type.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-mono text-white/40 capitalize">{f.status}</span>
                        </div>
                        <p className="text-xs text-white/50 font-mono truncate">{f.content_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────
       * Action Dialog — preserved
       * ────────────────────────────────────────────── */}
      <Dialog open={actionDialog.open} onOpenChange={(o) => { if (!o) setActionDialog({ open: false, flag: null }); }}>
        <DialogContent className="bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="lumina-text">Take Moderation Action</DialogTitle>
          </DialogHeader>
          {actionDialog.flag && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-white/40 mb-1 font-mono">Flagged Content:</p>
                <p className="text-sm text-white/80 font-mono">{actionDialog.flag.content_text.substring(0, 500)}</p>
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
            <button
              onClick={() => setActionDialog({ open: false, flag: null })}
              className="lumina-btn-glass text-white/60"
            >
              Cancel
            </button>
            <button
              onClick={handleTakeAction}
              disabled={submitting}
              className={`lumina-btn-glass gap-2 ${actionType === 'terminate' ? 'ring-1 ring-red-500/40 text-red-300' : ''}`}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {actionType === 'warning' ? 'Send Warning' : actionType === 'temp_ban' ? 'Ban 24h' : 'Terminate'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
