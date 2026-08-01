import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard, UserProfile } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';
import { Navigate } from 'react-router-dom';
import {
  Loader as Loader2,
  RefreshCw,
  Users,
  Clock,
  Megaphone,
  Download,
  Search,
  Plus,
  Check,
  X,
  Ban,
  Play,
  Trash2,
  Key,
  Shield,
  FileText,
  Calendar,
  Settings,
  Globe,
  MapPin,
  ChartBar as BarChart3,
  Network,
  GitBranch,
  Eye,
  BookOpen,
  GraduationCap,
  TrendingUp,
  Activity as ActivityIcon,
  Zap,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { WeeklyPlanBuilder } from '@/components/admin/WeeklyPlanBuilder';
import { SchoolPerformanceDashboard } from '@/components/admin/SchoolPerformanceDashboard';
import { BudgetOptimizationReport } from '@/components/admin/BudgetOptimizationReport';
import { SchoolAdminAppeals } from '@/components/admin/SchoolAdminAppeals';
import { CurriculumGraphManager } from '@/components/admin/CurriculumGraphManager';
import { CurriculumVersionsPanel } from '@/components/admin/CurriculumVersionsPanel';
import { StudentViewSimulator } from '@/components/admin/StudentViewSimulator';
import { SubjectsManager } from '@/components/admin/SubjectsManager';
import { TeacherCategoriesManager } from '@/components/admin/TeacherCategoriesManager';
import { useSchoolSubjects } from '@/hooks/useSchoolSubjects';
import { useTeacherCategories } from '@/hooks/useTeacherCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ReportCardCreator } from '@/components/admin/ReportCardCreator';
import { TenantExtensionsSection } from '@/components/extensions/TenantExtensionsSection';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';
import { cn } from '@/lib/utils';

/* ────────────────── Types ────────────────── */

interface InviteCode {
  id: string;
  code: string;
  role: string;
  used: boolean;
  expires_at: string;
  created_at: string;
}

interface InviteRequest {
  id: string;
  code_id: string;
  name: string;
  email: string;
  status: string;
  grade: string | null;
  created_at: string;
  invite_codes?: InviteCode;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

interface Trip {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

/* ────────────────── Sub-tab helper ────────────────── */

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
        active
          ? 'bg-white/15 text-white border-white/20'
          : 'bg-white/[0.03] text-white/40 border-white/5 hover:text-white/70 hover:bg-white/[0.06] hover:border-white/10',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ────────────────── Bento widget primitives ────────────────── */

/**
 * A single glass widget panel sized for the bento grid.
 * `span` controls grid footprint via col-span / row-span utilities.
 */
function BentoWidget({
  className = '',
  span = 'col-span-1 row-span-1',
  float = false,
  pulse = false,
  children,
}: {
  className?: string;
  span?: string;
  float?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'lumina-card relative overflow-hidden p-5 flex flex-col',
        span,
        float && 'cosmic-float',
        pulse && 'cosmic-pulse',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small orbit-ring decoration rendered behind a widget for the mini-animation. */
function OrbitRing({ className = '' }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute -right-10 -top-10 opacity-[0.12]', className)}>
      <div className="w-40 h-40 rounded-full border border-white/30" />
      <div className="absolute inset-4 rounded-full border border-white/20" />
      <div className="absolute inset-8 rounded-full border border-white/10" />
    </div>
  );
}

/* ────────────────── Main component ────────────────── */

export default function SchoolAdminDashboard() {
  const { isSchoolAdmin, school, profile, loading } = useRoleGuard();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const { language, setLanguage } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);

  /* ── Tab state (replaces Radix Tabs) ── */
  const [activeTab, setActiveTab] = useState('overview');
  const [curriculumSub, setCurriculumSub] = useState<'subjects' | 'graph' | 'versions' | 'simulator' | 'categories'>('subjects');
  const [reportsSub, setReportsSub] = useState<'report-cards' | 'usage'>('report-cards');

  /* ── Users state ── */
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');

  /* ── Invite codes state ── */
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [newCodeRole, setNewCodeRole] = useState<'teacher' | 'student'>('student');
  const [newCodeCategoryId, setNewCodeCategoryId] = useState<string>('');
  const { subjects: schoolSubjects } = useSchoolSubjects(school?.id);
  const { categories: teacherCategories } = useTeacherCategories(school?.id);
  const [creatingCode, setCreatingCode] = useState(false);

  /* ── Invite requests state ── */
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InviteRequest | null>(null);
  const [studentGrade, setStudentGrade] = useState('');

  /* ── Announcements state ── */
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementBody, setNewAnnouncementBody] = useState('');
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);

  /* ── Trips state ── */
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripBody, setNewTripBody] = useState('');
  const [creatingTrip, setCreatingTrip] = useState(false);

  /* ── Activity logs state ── */
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  /* ────────────────── Fetch functions ────────────────── */

  const fetchUsers = useCallback(async () => {
    if (!school) return;
    setLoadingUsers(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
    } else {
      setUsers((data || []) as UserProfile[]);
    }
    setLoadingUsers(false);
  }, [school]);

  const fetchInviteCodes = useCallback(async () => {
    if (!school) return;
    setLoadingCodes(true);

    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invite codes:', error);
    } else {
      setInviteCodes((data || []) as InviteCode[]);
    }
    setLoadingCodes(false);
  }, [school]);

  const fetchInviteRequests = useCallback(async () => {
    if (!school) return;
    setLoadingRequests(true);

    const { data, error } = await supabase
      .from('invite_requests')
      .select('*, invite_codes(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invite requests:', error);
    } else {
      const filtered = (data || []).filter(
        (r: InviteRequest) =>
          r.invite_codes &&
          (r.invite_codes as unknown as { school_id: string }).school_id === school.id,
      );
      setInviteRequests(filtered as InviteRequest[]);
    }
    setLoadingRequests(false);
  }, [school]);

  const fetchAnnouncements = useCallback(async () => {
    if (!school) return;
    setLoadingAnnouncements(true);

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching announcements:', error);
    } else {
      setAnnouncements((data || []) as Announcement[]);
    }
    setLoadingAnnouncements(false);
  }, [school]);

  const fetchTrips = useCallback(async () => {
    if (!school) return;
    setLoadingTrips(true);

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching trips:', error);
    } else {
      setTrips((data || []) as Trip[]);
    }
    setLoadingTrips(false);
  }, [school]);

  const fetchActivityLogs = useCallback(async () => {
    if (!school) return;
    setLoadingLogs(true);

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching activity logs:', error);
    } else {
      setActivityLogs((data || []) as ActivityLog[]);
    }
    setLoadingLogs(false);
  }, [school]);

  useEffect(() => {
    if (isSchoolAdmin && school) {
      fetchUsers();
      fetchInviteCodes();
      fetchInviteRequests();
      fetchAnnouncements();
      fetchTrips();
      fetchActivityLogs();
    }
  }, [
    isSchoolAdmin,
    school,
    fetchUsers,
    fetchInviteCodes,
    fetchInviteRequests,
    fetchAnnouncements,
    fetchTrips,
    fetchActivityLogs,
  ]);

  /* ────────────────── Action functions ────────────────── */

  const generateInviteCode = async () => {
    if (!school || !profile) return;
    if (newCodeRole === 'teacher' && !newCodeCategoryId) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: 'Pick a teacher category for the invite.',
      });
      return;
    }
    setCreatingCode(true);

    try {
      const { data, error } = await supabase.functions.invoke('invite-codes', {
        body: {
          role: newCodeRole,
          teacher_category_id: newCodeRole === 'teacher' ? newCodeCategoryId : null,
        },
      });

      if (error) {
        toast({ variant: 'destructive', title: t('error'), description: error.message });
        return;
      }

      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        toast({
          variant: 'destructive',
          title: t('error'),
          description: result?.error || 'Failed',
        });
        return;
      }

      toast({ title: t('success') });
      fetchInviteCodes();
    } finally {
      setCreatingCode(false);
    }
  };

  const revokeInviteCode = async (codeId: string) => {
    const { error } = await supabase
      .from('invite_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', codeId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchInviteCodes();
    }
  };

  const acceptInviteRequest = async (request: InviteRequest, grade?: string) => {
    if (!school) return;

    const { data, error } = await supabase.rpc('approve_invite_request', {
      p_request_id: request.id,
      p_grade: grade || null,
    });

    if (error) {
      toast({ variant: 'destructive', title: t('error'), description: error.message });
      console.error(error);
      return;
    }

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      toast({ variant: 'destructive', title: result.error || 'Failed' });
      return;
    }

    toast({ title: t('success') });
    fetchInviteRequests();
    fetchUsers();
    setGradeModalOpen(false);
    setSelectedRequest(null);
    setStudentGrade('');
  };

  const denyInviteRequest = async (requestId: string) => {
    const { data, error } = await supabase.rpc('deny_invite_request', {
      p_request_id: requestId,
    });

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchInviteRequests();
    }
  };

  const suspendUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchUsers();
    }
  };

  const activateUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchUsers();
    }
  };

  const deleteUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchUsers();
    }
  };

  const createAnnouncement = async () => {
    if (!school || !profile || !newAnnouncementTitle || !newAnnouncementBody) {
      toast({ variant: 'destructive', title: t('error') });
      return;
    }

    setCreatingAnnouncement(true);
    const { error } = await supabase.from('announcements').insert({
      school_id: school.id,
      title: newAnnouncementTitle,
      body: newAnnouncementBody,
      created_by: profile.id,
    });

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      setNewAnnouncementTitle('');
      setNewAnnouncementBody('');
      fetchAnnouncements();
    }
    setCreatingAnnouncement(false);
  };

  const deleteAnnouncement = async (announcementId: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', announcementId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchAnnouncements();
    }
  };

  const createTrip = async () => {
    if (!school || !profile || !newTripTitle || !newTripBody) {
      toast({ variant: 'destructive', title: t('error') });
      return;
    }

    setCreatingTrip(true);
    const { error } = await supabase.from('trips').insert({
      school_id: school.id,
      title: newTripTitle,
      body: newTripBody,
      created_by: profile.id,
    });

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      setNewTripTitle('');
      setNewTripBody('');
      fetchTrips();
    }
    setCreatingTrip(false);
  };

  const deleteTrip = async (tripId: string) => {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('success') });
      fetchTrips();
    }
  };

  /* ── Derived data ── */

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.full_name.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === 'all' || u.user_type === userRoleFilter;
    const matchesStatus =
      userStatusFilter === 'all' ||
      (userStatusFilter === 'active' && u.is_active) ||
      (userStatusFilter === 'suspended' && !u.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const pendingCounts = {
    students: inviteRequests.filter((r) => (r.invite_codes as unknown as InviteCode)?.role === 'student').length,
    teachers: inviteRequests.filter((r) => (r.invite_codes as unknown as InviteCode)?.role === 'teacher').length,
  };

  const activeCodesCount = inviteCodes.filter((c) => !c.used && new Date(c.expires_at) > new Date()).length;

  const exportUsersCSV = () => {
    const csvContent = [
      [t('name'), t('role'), t('grade'), t('status')].join(','),
      ...filteredUsers.map((u) =>
        [u.full_name, u.user_type, u.grade_level || '', u.is_active ? t('active') : t('suspended')].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${school?.code}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  /* ────────────────── Guards ────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  if (!isSchoolAdmin || !school) {
    return <Navigate to="/" replace />;
  }

  /* ────────────────── Nav items ────────────────── */

  const navItems: NavItem[] = [
    { id: 'overview', icon: <BarChart3 size={18} />, label: 'Overview' },
    { id: 'users', icon: <Users size={18} />, label: t('users') },
    { id: 'codes', icon: <Key size={18} />, label: 'Invites' },
    { id: 'requests', icon: <Clock size={18} />, label: 'Requests', badge: inviteRequests.length },
    { id: 'announcements', icon: <Megaphone size={18} />, label: t('announce') },
    { id: 'trips', icon: <MapPin size={18} />, label: t('trips') },
    { id: 'activity', icon: <ActivityIcon size={18} />, label: 'Activity' },
    { id: 'weekly-plan', icon: <Calendar size={18} />, label: 'Weekly Plan' },
    { id: 'performance', icon: <TrendingUp size={18} />, label: 'Performance' },
    { id: 'appeals', icon: <Shield size={18} />, label: 'Appeals' },
    { id: 'curriculum', icon: <Network size={18} />, label: 'Curriculum' },
    { id: 'reports', icon: <FileText size={18} />, label: 'Reports' },
    { id: 'settings', icon: <Settings size={18} />, label: t('settings') },
  ];

  /* ────────────────── Shared UI bits ────────────────── */

  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-3">
      <div className="lumina-icon-tile">{icon}</div>
      <h2 className="lumina-text text-xl font-semibold">{title}</h2>
    </div>
  );

  /** Bento stat tile used in the overview hero grid. */
  const StatTile = ({
    label,
    value,
    icon,
    delay,
    span = 'col-span-1 row-span-1',
    accent,
  }: {
    label: string;
    value: number | string;
    icon: React.ReactNode;
    delay: number;
    span?: string;
    accent?: string;
  }) => (
    <BentoWidget span={span} pulse className={cn('fade-up', `fade-up-delay-${Math.min(delay, 5)}`)}>
      <OrbitRing />
      <div className="relative flex items-start justify-between">
        <div className="lumina-icon-tile">{icon}</div>
        <span
          className="text-[10px] font-bold tracking-[0.2em] uppercase"
          style={{ color: accent || 'rgba(232,232,232,0.3)' }}
        >
          live
        </span>
      </div>
      <div className="relative mt-auto">
        <p className="text-xs text-white/40">{label}</p>
        <p className="text-3xl font-bold mt-1 text-white/90 font-mono">{value}</p>
      </div>
    </BentoWidget>
  );

  /* ═══════════════════════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════════════════════ */

  return (
    <DashboardShell
      role="School Admin"
      name={profile?.full_name}
      org={school.name}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={
        <button
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="lumina-btn-glass flex items-center gap-1.5"
        >
          <Globe className="w-3.5 h-3.5" />
          {language === 'en' ? 'AR' : 'EN'}
        </button>
      }
    >
      {/* ════════════ Overview — Bento Grid ════════════ */}
      {activeTab === 'overview' && (
        <div className="tab-enter">
          {/* Hero banner with LuminaAtom */}
          <div className="relative overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-white/[0.01] to-transparent" />
            <div className="relative max-w-6xl mx-auto px-6 py-14 flex items-center gap-8">
              <div className="cosmic-float">
                <LuminaAtom size={120} animate glow />
              </div>
              <div className="space-y-2">
                <h1 className="lumina-text text-3xl font-bold">{school.name}</h1>
                <p className="text-white/40 text-sm">{t('schoolAdminDashboard')}</p>
                <div className="flex items-center gap-2 pt-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 animate-ping opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400/70" />
                  </span>
                  <span className="text-xs text-white/40 font-mono">systems nominal</span>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
            {/* ─── BENTO GRID ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[140px] gap-4">
              {/* Hero / command widget — 2x2 */}
              <BentoWidget
                span="col-span-2 row-span-2"
                float
                className="fade-up"
              >
                <OrbitRing />
                <div className="relative flex items-center gap-3">
                  <div className="lumina-icon-tile">
                    <Sparkles className="w-5 h-5 text-white/70" />
                  </div>
                  <h3 className="lumina-text font-semibold">Command Center</h3>
                </div>
                <p className="relative text-sm text-white/40 mt-3">
                  {school.name} — manage every facet of your institution from a single vantage.
                </p>
                <div className="relative mt-auto grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab('curriculum')}
                    className="lumina-btn-glass flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2"><Network className="w-3.5 h-3.5" /> Curriculum</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab('requests')}
                    className="lumina-btn-glass flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Requests</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab('announcements')}
                    className="lumina-btn-glass flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2"><Megaphone className="w-3.5 h-3.5" /> Announce</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab('performance')}
                    className="lumina-btn-glass flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Performance</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </BentoWidget>

              {/* Stat tiles — 1x1 each */}
              <StatTile
                label={t('totalUsers')}
                value={users.length}
                icon={<Users className="w-5 h-5 text-white/70" />}
                delay={1}
              />
              <StatTile
                label={t('pendingRequests')}
                value={inviteRequests.length}
                icon={<Clock className="w-5 h-5 text-white/70" />}
                delay={2}
                accent="rgba(251,191,36,0.5)"
              />

              {/* Active codes — 2x1 wide */}
              <StatTile
                label={t('activeCodes')}
                value={activeCodesCount}
                icon={<Key className="w-5 h-5 text-white/70" />}
                delay={3}
                span="col-span-2 row-span-1"
              />

              {/* Announcements count — 1x1 */}
              <StatTile
                label={t('announcementsLabel')}
                value={announcements.length}
                icon={<Megaphone className="w-5 h-5 text-white/70" />}
                delay={1}
              />

              {/* Trips count — 1x1 */}
              <StatTile
                label={t('trips')}
                value={trips.length}
                icon={<MapPin className="w-5 h-5 text-white/70" />}
                delay={2}
              />

              {/* Pending requests banner — 2x1 wide */}
              {inviteRequests.length > 0 && (
                <BentoWidget
                  span="col-span-2 row-span-1"
                  pulse
                  className="fade-up fade-up-delay-3"
                >
                  <div className="flex items-center gap-3 h-full">
                    <div className="lumina-icon-tile">
                      <Clock className="w-5 h-5 text-white/70" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-white/40">{t('pendingRequests')}</p>
                      <p className="text-sm font-medium text-white/70 mt-0.5">
                        <span className="font-mono text-white/90">{pendingCounts.students}</span> {t('student')}
                        {pendingCounts.students !== 1 ? (language === 'ar' ? '' : 's') : ''},{' '}
                        <span className="font-mono text-white/90">{pendingCounts.teachers}</span> {t('teacher')}
                        {pendingCounts.teachers !== 1 ? (language === 'ar' ? '' : 's') : ''}{' '}
                        {t('pendingApprovalCount')}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('requests')}
                      className="lumina-btn-icon"
                      aria-label="View requests"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </BentoWidget>
              )}

              {/* Quick start — 2x1 wide */}
              <BentoWidget
                span="col-span-2 row-span-1"
                className="fade-up fade-up-delay-3"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="lumina-icon-tile">
                    <BookOpen className="w-5 h-5 text-white/70" />
                  </div>
                  <h3 className="lumina-text font-semibold text-sm">Quick start</h3>
                </div>
                <p className="text-sm text-white/40">
                  Build your curriculum in{' '}
                  <button onClick={() => setActiveTab('curriculum')} className="text-white/70 underline underline-offset-2 hover:text-white">
                    Curriculum
                  </button>
                  , approve new accounts under{' '}
                  <button onClick={() => setActiveTab('requests')} className="text-white/70 underline underline-offset-2 hover:text-white">
                    Requests
                  </button>
                  , and post school updates from{' '}
                  <button onClick={() => setActiveTab('announcements')} className="text-white/70 underline underline-offset-2 hover:text-white">
                    Announcements
                  </button>
                  .
                </p>
              </BentoWidget>

              {/* Activity pulse — 1x1 */}
              <BentoWidget pulse className="fade-up fade-up-delay-4">
                <div className="lumina-icon-tile">
                  <ActivityIcon className="w-5 h-5 text-white/70" />
                </div>
                <div className="mt-auto">
                  <p className="text-xs text-white/40">Activity</p>
                  <p className="text-2xl font-bold text-white/90 font-mono">{activityLogs.length}</p>
                </div>
              </BentoWidget>

              {/* Extensions tile — 1x1 */}
              <BentoWidget float className="fade-up fade-up-delay-4">
                <div className="lumina-icon-tile">
                  <Zap className="w-5 h-5 text-white/70" />
                </div>
                <div className="mt-auto">
                  <p className="text-xs text-white/40">Extensions</p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="text-sm text-white/70 hover:text-white mt-0.5 flex items-center gap-1"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </BentoWidget>
            </div>

            {/* Divider */}
            <div className="lumina-divider" />

            {/* Extensions section (full width) */}
            <div className="fade-up fade-up-delay-2">
              <TenantExtensionsSection />
            </div>
          </div>
        </div>
      )}

      {/* ════════════ Users ════════════ */}
      {activeTab === 'users' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 fade-up">
            {sectionHeader(<Users className="w-5 h-5 text-white/70" />, t('users'))}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input
                  placeholder={t('searchUsers')}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 w-40 bg-white/[0.04] border-white/10 text-white/80 placeholder:text-white/30"
                />
              </div>
              <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                <SelectTrigger className="w-32 bg-white/[0.04] border-white/10 text-white/70">
                  <SelectValue placeholder={t('role')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allRoles')}</SelectItem>
                  <SelectItem value="school_admin">{t('admin')}</SelectItem>
                  <SelectItem value="teacher">{t('teacher')}</SelectItem>
                  <SelectItem value="student">{t('student')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                <SelectTrigger className="w-32 bg-white/[0.04] border-white/10 text-white/70">
                  <SelectValue placeholder={t('status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allStatus')}</SelectItem>
                  <SelectItem value="active">{t('active')}</SelectItem>
                  <SelectItem value="suspended">{t('suspended')}</SelectItem>
                </SelectContent>
              </Select>
              <button onClick={exportUsersCSV} className="lumina-btn-icon" aria-label="Export CSV">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lumina-card fade-up fade-up-delay-1 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40">{t('name')}</TableHead>
                  <TableHead className="text-white/40">{t('role')}</TableHead>
                  <TableHead className="text-white/40">{t('grade')}</TableHead>
                  <TableHead className="text-white/40">{t('status')}</TableHead>
                  <TableHead className="text-white/40 text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow className="border-white/5">
                    <TableCell colSpan={5} className="text-center py-8 text-white/30">
                      {t('noUsersFound')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="border-white/5">
                      <TableCell className="font-medium text-white/80">{user.full_name}</TableCell>
                      <TableCell className="capitalize text-white/60">
                        {user.user_type === 'student'
                          ? t('student')
                          : user.user_type === 'teacher'
                            ? t('teacher')
                            : t('schoolAdmin')}
                      </TableCell>
                      <TableCell className="text-white/60">
                        {user.grade_level ? getGradeName(user.grade_level, language) : '-'}
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Badge className="bg-white/15 text-white/80 border border-white/10">
                            {t('active')}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-400/80 border border-red-500/20">
                            {t('suspended')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.id !== profile?.id && (
                          <div className="flex items-center justify-end gap-2">
                            {user.is_active ? (
                              <button
                                onClick={() => suspendUser(user.id)}
                                className="lumina-btn-glass flex items-center gap-1 text-xs"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                {t('suspend')}
                              </button>
                            ) : (
                              <button
                                onClick={() => activateUser(user.id)}
                                className="lumina-btn-glass flex items-center gap-1 text-xs"
                              >
                                <Play className="w-3.5 h-3.5" />
                                {t('activate')}
                              </button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="lumina-btn-icon text-red-400/70 hover:text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-black border-white/10 text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-white">{t('deleteUser')}</AlertDialogTitle>
                                  <AlertDialogDescription className="text-white/40">
                                    {t('deleteUserDesc')} {user.full_name} {t('andAllData')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10">
                                    {t('cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUser(user.id)}
                                    className="bg-red-500/80 text-white hover:bg-red-500"
                                  >
                                    {t('delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ════════════ Invite Codes ════════════ */}
      {activeTab === 'codes' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 fade-up">
            {sectionHeader(<Key className="w-5 h-5 text-white/70" />, t('inviteCodes'))}
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={newCodeRole}
                onValueChange={(v) => setNewCodeRole(v as 'teacher' | 'student')}
              >
                <SelectTrigger className="w-32 bg-white/[0.04] border-white/10 text-white/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{t('student')}</SelectItem>
                  <SelectItem value="teacher">{t('teacher')}</SelectItem>
                </SelectContent>
              </Select>
              {newCodeRole === 'teacher' && (
                <Select value={newCodeCategoryId} onValueChange={setNewCodeCategoryId}>
                  <SelectTrigger className="w-48 bg-white/[0.04] border-white/10 text-white/70">
                    <SelectValue placeholder="Teacher category" />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                onClick={generateInviteCode}
                disabled={creatingCode}
                className="lumina-btn-primary flex items-center gap-2"
              >
                {creatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('generateCode')}
              </button>
            </div>
          </div>

          <div className="lumina-card fade-up fade-up-delay-1 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40">{t('code')}</TableHead>
                  <TableHead className="text-white/40">{t('role')}</TableHead>
                  <TableHead className="text-white/40">{t('status')}</TableHead>
                  <TableHead className="text-white/40">{t('expires')}</TableHead>
                  <TableHead className="text-white/40 text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inviteCodes.length === 0 ? (
                  <TableRow className="border-white/5">
                    <TableCell colSpan={5} className="text-center py-8 text-white/30">
                      {t('noInviteCodesYet')}
                    </TableCell>
                  </TableRow>
                ) : (
                  inviteCodes.map((code) => {
                    const isExpired = new Date(code.expires_at) < new Date();
                    return (
                      <TableRow key={code.id} className="border-white/5">
                        <TableCell>
                          <code className="bg-white/10 px-2 py-1 rounded font-mono text-white/80">
                            {code.code}
                          </code>
                        </TableCell>
                        <TableCell className="capitalize text-white/60">
                          {code.role === 'student' ? t('student') : t('teacher')}
                        </TableCell>
                        <TableCell>
                          {code.used ? (
                            <Badge className="bg-white/5 text-white/40 border border-white/10">
                              {t('used')}
                            </Badge>
                          ) : isExpired ? (
                            <Badge className="bg-red-500/15 text-red-400/80 border border-red-500/20">
                              {t('expired')}
                            </Badge>
                          ) : (
                            <Badge className="bg-white/15 text-white/80 border border-white/10">
                              {t('active')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-white/40">
                          {new Date(code.expires_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {!code.used && !isExpired && (
                            <button
                              onClick={() => revokeInviteCode(code.id)}
                              className="lumina-btn-glass text-xs"
                            >
                              {t('revoke')}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ════════════ Requests ════════════ */}
      {activeTab === 'requests' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between fade-up">
            {sectionHeader(<Clock className="w-5 h-5 text-white/70" />, t('pendingRequests'))}
            <button
              onClick={fetchInviteRequests}
              disabled={loadingRequests}
              className="lumina-btn-icon"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loadingRequests && 'animate-spin')} />
            </button>
          </div>

          <div className="lumina-card fade-up fade-up-delay-1 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40">{t('name')}</TableHead>
                  <TableHead className="text-white/40">{t('email')}</TableHead>
                  <TableHead className="text-white/40">{t('role')}</TableHead>
                  <TableHead className="text-white/40">{t('code')}</TableHead>
                  <TableHead className="text-white/40">{t('requested')}</TableHead>
                  <TableHead className="text-white/40 text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inviteRequests.length === 0 ? (
                  <TableRow className="border-white/5">
                    <TableCell colSpan={6} className="text-center py-8 text-white/30">
                      {t('noPendingRequests')}
                    </TableCell>
                  </TableRow>
                ) : (
                  inviteRequests.map((request) => {
                    const inviteCode = request.invite_codes as unknown as InviteCode;
                    return (
                      <TableRow key={request.id} className="border-white/5">
                        <TableCell className="font-medium text-white/80">{request.name}</TableCell>
                        <TableCell className="text-white/60">{request.email}</TableCell>
                        <TableCell className="capitalize text-white/60">
                          {inviteCode?.role === 'student' ? t('student') : t('teacher')}
                        </TableCell>
                        <TableCell>
                          <code className="bg-white/10 px-2 py-1 rounded text-xs text-white/70">
                            {inviteCode?.code}
                          </code>
                        </TableCell>
                        <TableCell className="text-white/40">
                          {new Date(request.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="lumina-btn-glass flex items-center gap-1 text-xs"
                              onClick={() => {
                                if (inviteCode?.role === 'student') {
                                  setSelectedRequest(request);
                                  setGradeModalOpen(true);
                                } else {
                                  acceptInviteRequest(request);
                                }
                              }}
                            >
                              <Check className="w-3.5 h-3.5" />
                              {t('accept')}
                            </button>
                            <button
                              className="lumina-btn-icon text-red-400/70 hover:text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                              onClick={() => denyInviteRequest(request.id)}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Grade modal for students */}
          <Dialog open={gradeModalOpen} onOpenChange={setGradeModalOpen}>
            <DialogContent className="bg-black border-white/10 text-white">
              <DialogHeader>
                <DialogTitle className="lumina-text">{t('assignStudentGrade')}</DialogTitle>
                <DialogDescription className="text-white/40">
                  {t('selectGradeFor')} {selectedRequest?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="grade" className="text-white/60">
                  {t('gradeLevel')}
                </Label>
                <Select value={studentGrade} onValueChange={setStudentGrade}>
                  <SelectTrigger className="bg-white/[0.04] border-white/10 text-white/70">
                    <SelectValue placeholder={t('selectGradeLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {['KG1', 'KG2', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)].map(
                      (g) => (
                        <SelectItem key={g} value={g}>
                          {getGradeName(g, language)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <button
                  onClick={() => setGradeModalOpen(false)}
                  className="lumina-btn-glass"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => selectedRequest && acceptInviteRequest(selectedRequest, studentGrade)}
                  disabled={!studentGrade}
                  className="lumina-btn-primary"
                >
                  {t('acceptStudent')}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ════════════ Announcements ════════════ */}
      {activeTab === 'announcements' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="fade-up">{sectionHeader(<Megaphone className="w-5 h-5 text-white/70" />, t('announcementsLabel'))}</div>

          {/* Create announcement form */}
          <div className="lumina-card fade-up fade-up-delay-1 p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title" className="text-white/60">
                {t('title')}
              </Label>
              <Input
                id="announcement-title"
                value={newAnnouncementTitle}
                onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                placeholder={t('announcementTitle')}
                className="bg-white/[0.04] border-white/10 text-white/80 placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-body" className="text-white/60">
                {t('message')}
              </Label>
              <Textarea
                id="announcement-body"
                value={newAnnouncementBody}
                onChange={(e) => setNewAnnouncementBody(e.target.value)}
                placeholder={t('writeAnnouncement')}
                rows={4}
                className="bg-white/[0.04] border-white/10 text-white/80 placeholder:text-white/30"
              />
            </div>
            <button
              onClick={createAnnouncement}
              disabled={creatingAnnouncement || !newAnnouncementTitle || !newAnnouncementBody}
              className="lumina-btn-primary flex items-center gap-2"
            >
              {creatingAnnouncement ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Megaphone className="w-4 h-4" />
              )}
              {t('postAnnouncement')}
            </button>
          </div>

          <div className="lumina-divider" />

          {/* Announcements list */}
          <div className="space-y-4">
            {announcements.length === 0 ? (
              <div className="lumina-card fade-up fade-up-delay-2 p-8 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-white/20" />
                <p className="text-white/30">{t('noAnnouncementsYet')}</p>
              </div>
            ) : (
              announcements.map((announcement, i) => (
                <div
                  key={announcement.id}
                  className={cn('lumina-card p-5', 'fade-up', `fade-up-delay-${Math.min(i + 1, 5)}`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white/80">{announcement.title}</h3>
                      <p className="text-sm text-white/40">
                        {new Date(announcement.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAnnouncement(announcement.id)}
                      className="lumina-btn-icon text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-white/50 whitespace-pre-wrap">{announcement.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ════════════ Trips ════════════ */}
      {activeTab === 'trips' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="fade-up">{sectionHeader(<MapPin className="w-5 h-5 text-white/70" />, t('trips'))}</div>

          {/* Create trip form */}
          <div className="lumina-card fade-up fade-up-delay-1 p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trip-title" className="text-white/60">
                {t('title')}
              </Label>
              <Input
                id="trip-title"
                value={newTripTitle}
                onChange={(e) => setNewTripTitle(e.target.value)}
                placeholder={t('tripTitle')}
                className="bg-white/[0.04] border-white/10 text-white/80 placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-body" className="text-white/60">
                {t('message')}
              </Label>
              <Textarea
                id="trip-body"
                value={newTripBody}
                onChange={(e) => setNewTripBody(e.target.value)}
                placeholder={t('writeTrip')}
                rows={4}
                className="bg-white/[0.04] border-white/10 text-white/80 placeholder:text-white/30"
              />
            </div>
            <button
              onClick={createTrip}
              disabled={creatingTrip || !newTripTitle || !newTripBody}
              className="lumina-btn-primary flex items-center gap-2"
            >
              {creatingTrip ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {t('postTrip')}
            </button>
          </div>

          <div className="lumina-divider" />

          {/* Trips list */}
          <div className="space-y-4">
            {trips.length === 0 ? (
              <div className="lumina-card fade-up fade-up-delay-2 p-8 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-white/20" />
                <p className="text-white/30">{t('noTripsYet')}</p>
              </div>
            ) : (
              trips.map((trip, i) => (
                <div
                  key={trip.id}
                  className={cn('lumina-card p-5', 'fade-up', `fade-up-delay-${Math.min(i + 1, 5)}`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white/80">{trip.title}</h3>
                      <p className="text-sm text-white/40">
                        {new Date(trip.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteTrip(trip.id)}
                      className="lumina-btn-icon text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-white/50 whitespace-pre-wrap">{trip.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ════════════ Activity ════════════ */}
      {activeTab === 'activity' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between fade-up">
            {sectionHeader(<ActivityIcon className="w-5 h-5 text-white/70" />, t('activityLogs'))}
            <button
              onClick={fetchActivityLogs}
              disabled={loadingLogs}
              className="lumina-btn-icon"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loadingLogs && 'animate-spin')} />
            </button>
          </div>

          <div className="lumina-card fade-up fade-up-delay-1 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40">{t('action')}</TableHead>
                  <TableHead className="text-white/40">{t('details')}</TableHead>
                  <TableHead className="text-white/40">{t('time')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityLogs.length === 0 ? (
                  <TableRow className="border-white/5">
                    <TableCell colSpan={3} className="text-center py-8 text-white/30">
                      {t('noActivityLogs')}
                    </TableCell>
                  </TableRow>
                ) : (
                  activityLogs.map((log) => (
                    <TableRow key={log.id} className="border-white/5">
                      <TableCell className="font-medium text-white/80">{log.action}</TableCell>
                      <TableCell className="text-white/40 text-sm">
                        {JSON.stringify(log.details)}
                      </TableCell>
                      <TableCell className="text-white/40">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ════════════ Weekly Plan ════════════ */}
      {activeTab === 'weekly-plan' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6 fade-up">
            {sectionHeader(<Calendar className="w-5 h-5 text-white/70" />, t('weekly'))}
          </div>
          <div className="fade-up fade-up-delay-1">
            <WeeklyPlanBuilder />
          </div>
        </div>
      )}

      {/* ════════════ Performance ════════════ */}
      {activeTab === 'performance' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6 fade-up">
            {sectionHeader(<TrendingUp className="w-5 h-5 text-white/70" />, 'Performance')}
          </div>
          <div className="fade-up fade-up-delay-1">
            <SchoolPerformanceDashboard schoolId={school.id} />
          </div>
        </div>
      )}

      {/* ════════════ Appeals ════════════ */}
      {activeTab === 'appeals' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6 fade-up">
            {sectionHeader(<Shield className="w-5 h-5 text-white/70" />, 'Appeals')}
          </div>
          <div className="fade-up fade-up-delay-1">
            <SchoolAdminAppeals schoolId={profile?.school_id || ''} />
          </div>
        </div>
      )}

      {/* ════════════ Curriculum ════════════ */}
      {activeTab === 'curriculum' && (
        <div className="tab-enter max-w-6xl mx-auto px-6 py-8 space-y-6">
          <div className="fade-up">{sectionHeader(<Network className="w-5 h-5 text-white/70" />, 'Curriculum')}</div>

          {/* Sub-tab navigation */}
          <div className="flex gap-2 flex-wrap fade-up fade-up-delay-1">
            <SubTabButton
              active={curriculumSub === 'subjects'}
              onClick={() => setCurriculumSub('subjects')}
              icon={<BookOpen className="w-4 h-4" />}
              label="Subjects"
            />
            <SubTabButton
              active={curriculumSub === 'graph'}
              onClick={() => setCurriculumSub('graph')}
              icon={<Network className="w-4 h-4" />}
              label="Curriculum Graph"
            />
            <SubTabButton
              active={curriculumSub === 'versions'}
              onClick={() => setCurriculumSub('versions')}
              icon={<GitBranch className="w-4 h-4" />}
              label="Versions"
            />
            <SubTabButton
              active={curriculumSub === 'simulator'}
              onClick={() => setCurriculumSub('simulator')}
              icon={<Eye className="w-4 h-4" />}
              label="Student Simulator"
            />
            <SubTabButton
              active={curriculumSub === 'categories'}
              onClick={() => setCurriculumSub('categories')}
              icon={<GraduationCap className="w-4 h-4" />}
              label="Teacher Categories"
            />
          </div>

          <div className="lumina-divider" />

          {/* Sub-tab content */}
          <div className="fade-up fade-up-delay-2">
            {curriculumSub === 'subjects' && <SubjectsManager schoolId={school.id} />}
            {curriculumSub === 'graph' && <CurriculumGraphManager schoolId={school.id} />}
            {curriculumSub === 'versions' && <CurriculumVersionsPanel schoolId={school.id} />}
            {curriculumSub === 'simulator' && <StudentViewSimulator schoolId={school.id} />}
            {curriculumSub === 'categories' && <TeacherCategoriesManager schoolId={school.id} />}
          </div>
        </div>
      )}

      {/* ════════════ Reports ════════════ */}
      {activeTab === 'reports' && (
        <div className="tab-enter max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="fade-up">{sectionHeader(<FileText className="w-5 h-5 text-white/70" />, 'Reports')}</div>

          {/* Sub-tab navigation */}
          <div className="flex gap-2 flex-wrap fade-up fade-up-delay-1">
            <SubTabButton
              active={reportsSub === 'report-cards'}
              onClick={() => setReportsSub('report-cards')}
              icon={<FileText className="w-4 h-4" />}
              label="Report Cards"
            />
            <SubTabButton
              active={reportsSub === 'usage'}
              onClick={() => setReportsSub('usage')}
              icon={<Download className="w-4 h-4" />}
              label="Usage & Budget"
            />
          </div>

          <div className="lumina-divider" />

          {/* Sub-tab content */}
          <div className="fade-up fade-up-delay-2">
            {reportsSub === 'report-cards' && (
              <ReportCardCreator schoolId={school.id} adminId={profile.id} />
            )}
            {reportsSub === 'usage' && <BudgetOptimizationReport schoolId={school.id} />}
          </div>
        </div>
      )}

      {/* ════════════ Settings ════════════ */}
      {activeTab === 'settings' && (
        <div className="tab-enter max-w-3xl mx-auto px-6 py-8 space-y-6">
          <div className="fade-up">{sectionHeader(<Settings className="w-5 h-5 text-white/70" />, t('settings'))}</div>

          <div className="lumina-card fade-up fade-up-delay-1 p-6 space-y-6 max-w-lg">
            <div>
              <h3 className="lumina-text font-semibold mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-white/60" />
                {language === 'ar' ? 'اللغة' : 'Language'}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'lumina-btn-glass flex-1',
                    language === 'en' && 'bg-white/15 text-white border-white/20',
                  )}
                >
                  English
                </button>
                <button
                  onClick={() => setLanguage('ar')}
                  className={cn(
                    'lumina-btn-glass flex-1',
                    language === 'ar' && 'bg-white/15 text-white border-white/20',
                  )}
                >
                  العربية
                </button>
              </div>
            </div>
          </div>

          <div className="lumina-divider" />

          <div className="fade-up fade-up-delay-2">
            <TenantExtensionsSection />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
