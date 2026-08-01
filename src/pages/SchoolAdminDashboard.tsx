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
    { id: 'codes', icon: <Key size={18} />, label: 'Invite Codes' },
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <Globe className="w-3.5 h-3.5" />
          {language === 'en' ? 'AR' : 'EN'}
        </button>
      }
    >
      {/* ════════════ Overview ════════════ */}
      {activeTab === 'overview' && (
        <div className="tab-enter">
          {/* Hero banner with LuminaAtom */}
          <div className="relative overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-white/[0.01] to-transparent" />
            <div className="relative max-w-5xl mx-auto px-6 py-14 flex items-center gap-8">
              <LuminaAtom size={96} animate glow />
              <div className="space-y-2">
                <h1 className="lumina-text text-3xl font-bold">{school.name}</h1>
                <p className="text-white/40 text-sm">{t('schoolAdminDashboard')}</p>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
            <TenantExtensionsSection />

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="lumina-stat fade-up p-4">
                <p className="text-xs text-white/40">{t('totalUsers')}</p>
                <p className="text-2xl font-bold mt-1 text-white/90">{users.length}</p>
              </div>
              <div className="lumina-stat fade-up fade-up-delay-1 p-4">
                <p className="text-xs text-white/40">{t('pendingRequests')}</p>
                <p className="text-2xl font-bold mt-1 text-white/90">{inviteRequests.length}</p>
              </div>
              <div className="lumina-stat fade-up fade-up-delay-2 p-4">
                <p className="text-xs text-white/40">{t('activeCodes')}</p>
                <p className="text-2xl font-bold mt-1 text-white/90">
                  {inviteCodes.filter((c) => !c.used && new Date(c.expires_at) > new Date()).length}
                </p>
              </div>
              <div className="lumina-stat fade-up fade-up-delay-3 p-4">
                <p className="text-xs text-white/40">{t('announcementsLabel')}</p>
                <p className="text-2xl font-bold mt-1 text-white/90">{announcements.length}</p>
              </div>
            </div>

            {/* Pending requests banner */}
            {inviteRequests.length > 0 && (
              <div className="lumina-card fade-up fade-up-delay-2 p-4 flex items-center gap-3">
                <div className="lumina-icon-tile">
                  <Clock className="w-5 h-5 text-white/70" />
                </div>
                <span className="font-medium text-sm text-white/60">
                  {pendingCounts.students} {t('student')}
                  {pendingCounts.students !== 1 ? (language === 'ar' ? '' : 's') : ''},{' '}
                  {pendingCounts.teachers} {t('teacher')}
                  {pendingCounts.teachers !== 1 ? (language === 'ar' ? '' : 's') : ''}{' '}
                  {t('pendingApprovalCount')}
                </span>
              </div>
            )}

            {/* Quick start */}
            <div className="lumina-card fade-up fade-up-delay-3 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="lumina-icon-tile">
                  <BookOpen className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="lumina-text font-semibold">Quick start</h3>
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
              <Button
                variant="outline"
                size="icon"
                onClick={exportUsersCSV}
                className="border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
              >
                <Download className="w-4 h-4" />
              </Button>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => suspendUser(user.id)}
                                className="gap-1 border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
                              >
                                <Ban className="w-4 h-4" />
                                {t('suspend')}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => activateUser(user.id)}
                                className="gap-1 border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
                              >
                                <Play className="w-4 h-4" />
                                {t('activate')}
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-red-400/70 hover:text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
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
              <Button
                onClick={generateInviteCode}
                disabled={creatingCode}
                className="gap-2 bg-white/15 text-white border border-white/20 hover:bg-white/25"
              >
                {creatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('generateCode')}
              </Button>
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeInviteCode(code.id)}
                              className="border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
                            >
                              {t('revoke')}
                            </Button>
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
            <Button
              variant="outline"
              size="icon"
              onClick={fetchInviteRequests}
              disabled={loadingRequests}
              className="border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
            >
              <RefreshCw className={cn('w-4 h-4', loadingRequests && 'animate-spin')} />
            </Button>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-white/70 hover:text-white border-white/15 bg-white/[0.06] hover:bg-white/15"
                              onClick={() => {
                                if (inviteCode?.role === 'student') {
                                  setSelectedRequest(request);
                                  setGradeModalOpen(true);
                                } else {
                                  acceptInviteRequest(request);
                                }
                              }}
                            >
                              <Check className="w-4 h-4" />
                              {t('accept')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-red-400/70 hover:text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                              onClick={() => denyInviteRequest(request.id)}
                            >
                              <X className="w-4 h-4" />
                              {t('deny')}
                            </Button>
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
                <Button
                  variant="outline"
                  onClick={() => setGradeModalOpen(false)}
                  className="border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => selectedRequest && acceptInviteRequest(selectedRequest, studentGrade)}
                  disabled={!studentGrade}
                  className="bg-white/15 text-white border border-white/20 hover:bg-white/25"
                >
                  {t('acceptStudent')}
                </Button>
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
            <Button
              onClick={createAnnouncement}
              disabled={creatingAnnouncement || !newAnnouncementTitle || !newAnnouncementBody}
              className="gap-2 bg-white/15 text-white border border-white/20 hover:bg-white/25"
            >
              {creatingAnnouncement ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Megaphone className="w-4 h-4" />
              )}
              {t('postAnnouncement')}
            </Button>
          </div>

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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAnnouncement(announcement.id)}
                      className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
            <Button
              onClick={createTrip}
              disabled={creatingTrip || !newTripTitle || !newTripBody}
              className="gap-2 bg-white/15 text-white border border-white/20 hover:bg-white/25"
            >
              {creatingTrip ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {t('postTrip')}
            </Button>
          </div>

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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTrip(trip.id)}
                      className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
            <Button
              variant="outline"
              size="icon"
              onClick={fetchActivityLogs}
              disabled={loadingLogs}
              className="border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/10"
            >
              <RefreshCw className={cn('w-4 h-4', loadingLogs && 'animate-spin')} />
            </Button>
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
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-white/80">
                <Globe className="w-4 h-4 text-white/60" />
                {language === 'ar' ? 'اللغة' : 'Language'}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'flex-1 py-3 rounded-xl text-sm font-medium transition-all border',
                    language === 'en'
                      ? 'bg-white/15 text-white border-white/20'
                      : 'bg-white/[0.03] text-white/40 border-white/5 hover:border-white/15 hover:text-white/70',
                  )}
                >
                  English
                </button>
                <button
                  onClick={() => setLanguage('ar')}
                  className={cn(
                    'flex-1 py-3 rounded-xl text-sm font-medium transition-all border',
                    language === 'ar'
                      ? 'bg-white/15 text-white border-white/20'
                      : 'bg-white/[0.03] text-white/40 border-white/5 hover:border-white/15 hover:text-white/70',
                  )}
                >
                  العربية
                </button>
              </div>
            </div>
          </div>

          <div className="fade-up fade-up-delay-2">
            <TenantExtensionsSection />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
