import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard, School } from '@/hooks/useRoleGuard';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  RefreshCw,
  Trash2,
  Plus,
  ShieldAlert,
  Copy,
  FlaskConical,
  GraduationCap,
  Users,
  UserCog,
  Check,
  X,
  ChartBar as BarChart3,
  KeyRound,
  Brain,
  Code,
  Puzzle,
  CirclePause as PauseCircle,
  CirclePlay as PlayCircle,
} from 'lucide-react';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';
import { StudentAppPreview } from '@/components/StudentAppPreview';
import LCTPanel from '@/components/admin/LCTPanel';
import { GlobalAnalyticsDashboard } from '@/components/admin/GlobalAnalyticsDashboard';
import { TeacherExcellenceProgram } from '@/components/admin/TeacherExcellenceProgram';
import { MinistryReadinessReport } from '@/components/admin/MinistryReadinessReport';
import MinistryCodeGenerator from '@/components/admin/MinistryCodeGenerator';
import LuminaApiPanel from '@/components/admin/LuminaApiPanel';
import { ExtensionReviewPanel } from '@/components/admin/ExtensionReviewPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TestingRole = 'none' | 'student' | 'teacher' | 'school_admin';
type TabId = 'schools' | 'analytics' | 'ministry' | 'lct' | 'api' | 'extensions' | 'testing';

const STAGGER = ['fade-up-delay-1', 'fade-up-delay-2', 'fade-up-delay-3', 'fade-up-delay-4'] as const;

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useRoleGuard();
  const { toast } = useToast();

  const [schools, setSchools] = useState<School[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testingRole, setTestingRole] = useState<TestingRole>('none');
  const [activeTab, setActiveTab] = useState<TabId>('schools');
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  // Create school form state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newActivationCode, setNewActivationCode] = useState('');
  const [newSchoolAddress, setNewSchoolAddress] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Derived stats ──
  const activeCount = schools.filter((s) => s.status === 'active').length;
  const suspendedCount = schools.filter((s) => s.status === 'suspended').length;

  // Clean up sessionStorage on unmount (covers sign-out via shell)
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('superAdminVerified');
    };
  }, []);

  // Check if super admin is verified
  useEffect(() => {
    const checkVerification = () => {
      const verified = sessionStorage.getItem('superAdminVerified');
      if (verified === 'true') {
        setIsVerified(true);
      } else {
        setIsVerified(false);
        navigate('/super-admin-verify');
      }
    };

    if (!loading && isSuperAdmin) {
      checkVerification();
    }
  }, [loading, isSuperAdmin, navigate]);

  const fetchSchools = useCallback(async () => {
    setLoadingSchools(true);
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error loading schools' });
      console.error(error);
    } else {
      setSchools((data || []) as School[]);
    }

    // Fetch total user count
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    setTotalUsers(count ?? 0);

    setLoadingSchools(false);
  }, [toast]);

  useEffect(() => {
    if (isSuperAdmin && isVerified) {
      fetchSchools();
    }
  }, [isSuperAdmin, isVerified, fetchSchools]);

  const suspendSchool = async (schoolId: string) => {
    setActionLoading(schoolId);

    const { error: schoolError } = await supabase
      .from('schools')
      .update({ status: 'suspended' })
      .eq('id', schoolId);

    if (schoolError) {
      toast({ variant: 'destructive', title: 'Error suspending school' });
      setActionLoading(null);
      return;
    }

    // Deactivate all profiles in this school
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('school_id', schoolId);

    if (profileError) {
      console.error('Error deactivating profiles:', profileError);
    }

    toast({ title: 'School suspended successfully' });
    fetchSchools();
    setActionLoading(null);
  };

  const activateSchool = async (schoolId: string) => {
    setActionLoading(schoolId);

    const { error } = await supabase
      .from('schools')
      .update({ status: 'active' })
      .eq('id', schoolId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error activating school' });
    } else {
      // Reactivate all profiles in this school
      await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('school_id', schoolId);

      toast({ title: 'School activated successfully' });
      fetchSchools();
    }
    setActionLoading(null);
  };

  const deleteSchool = async (schoolId: string) => {
    setActionLoading(schoolId);

    // CASCADE handles related data deletion
    const { error } = await supabase
      .from('schools')
      .delete()
      .eq('id', schoolId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting school' });
      console.error(error);
    } else {
      toast({ title: 'School deleted successfully' });
      fetchSchools();
    }
    setActionLoading(null);
  };

  const createSchool = async () => {
    if (!newSchoolName || !newSchoolCode || !newActivationCode) {
      toast({ variant: 'destructive', title: 'Please fill all required fields' });
      return;
    }

    setCreating(true);

    const { data, error } = await supabase.rpc('create_school_with_code', {
      school_name: newSchoolName,
      school_code: newSchoolCode.toUpperCase(),
      activation_code_input: newActivationCode.toUpperCase(),
      school_address: newSchoolAddress || null,
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating school', description: error.message });
      setCreating(false);
      return;
    }

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      toast({ variant: 'destructive', title: result.error || 'Failed to create school' });
      setCreating(false);
      return;
    }

    toast({ title: 'School created successfully!' });
    setNewSchoolName('');
    setNewSchoolCode('');
    setNewActivationCode('');
    setNewSchoolAddress('');
    setCreateDialogOpen(false);
    setCreating(false);
    fetchSchools();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Code copied to clipboard' });
  };

  const handleTestingRole = (role: TestingRole) => {
    setTestingRole(role);
    if (role !== 'none') {
      setActiveTab('testing');
    }
  };

  // ════════════════════════════════════════════════════════════════
  //  Loading state
  // ════════════════════════════════════════════════════════════════
  if (loading || isVerified === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  // ── Not verified (will redirect via useEffect) ──
  if (!isVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  Access denied
  // ════════════════════════════════════════════════════════════════
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
        <div className="flex flex-col items-center gap-6 max-w-md w-full text-center fade-up">
          <LuminaAtom size={80} animate glow />
          <div
            className="lumina-icon-tile mx-auto"
            style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
          >
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="lumina-text text-2xl font-bold">Access Denied</h1>
          <p className="text-white/40 text-sm">
            You do not have permission to access this page. This area is restricted to super
            administrators only.
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            className="lumina-btn-glass px-5 h-10 text-sm"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  Nav items
  // ════════════════════════════════════════════════════════════════
  const navItems: NavItem[] = [
    { id: 'schools', icon: <Building2 size={18} />, label: 'Schools' },
    { id: 'analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
    { id: 'ministry', icon: <KeyRound size={18} />, label: 'Ministry' },
    { id: 'lct', icon: <Brain size={18} />, label: 'LCT' },
    { id: 'api', icon: <Code size={18} />, label: 'Lumina API' },
    { id: 'extensions', icon: <Puzzle size={18} />, label: 'Extensions' },
    { id: 'testing', icon: <FlaskConical size={18} />, label: 'Testing' },
  ];

  // ════════════════════════════════════════════════════════════════
  //  Header right — compact testing role simulator + refresh
  // ════════════════════════════════════════════════════════════════
  const headerRight = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="lumina-btn-glass h-9 px-3 gap-2 text-sm flex items-center">
            <FlaskConical className="w-4 h-4" />
            <span className="hidden sm:inline">
              {testingRole !== 'none' ? `Test: ${testingRole.replace('_', ' ')}` : 'Simulate'}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="lumina-card border-white/10 p-1 min-w-[180px]">
          <DropdownMenuItem onClick={() => handleTestingRole('student')} className="gap-2 cursor-pointer">
            <GraduationCap className="w-4 h-4" />
            Test as Student
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleTestingRole('teacher')} className="gap-2 cursor-pointer">
            <Users className="w-4 h-4" />
            Test as Teacher
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleTestingRole('school_admin')} className="gap-2 cursor-pointer">
            <UserCog className="w-4 h-4" />
            Test as School Admin
          </DropdownMenuItem>
          {testingRole !== 'none' && (
            <DropdownMenuItem
              onClick={() => setTestingRole('none')}
              className="gap-2 text-red-400 focus:text-red-400 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              Exit Testing Mode
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        onClick={fetchSchools}
        disabled={loadingSchools}
        className="lumina-btn-icon h-9 w-9"
      >
        <RefreshCw className={`w-4 h-4 ${loadingSchools ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  //  Main render
  // ════════════════════════════════════════════════════════════════
  return (
    <DashboardShell
      role="Super Admin"
      roleAccent="rgba(232,232,232,0.5)"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
      headerRight={headerRight}
    >
      {/* ════════════════════════════════════════════════════════════
          Schools Tab — Control Room Layout
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'schools' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* ── Control Room Hero: atom behind glass command panel ── */}
          <div className="relative fade-up">
            {/* Large animated atom positioned behind the panel */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <LuminaAtom size={140} animate glow className="opacity-40" />
            </div>

            {/* Glass command panel */}
            <div className="relative lumina-card p-6 md:p-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="lumina-icon-tile">
                  <Building2 className="w-6 h-6 text-white/60" />
                </div>
                <div>
                  <h2 className="lumina-text text-2xl font-bold">Schools Management</h2>
                  <p className="text-white/40 text-sm mt-1">
                    Create, suspend, activate, and delete schools across the Lumina platform.
                  </p>
                </div>
              </div>
            </div>

            {/* Floating stat orbs — arranged around the central content */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              {/* Total Schools orb */}
              <div className="lumina-card rounded-full px-4 py-2.5 flex items-center gap-3 transition-transform hover:scale-105 fade-up fade-up-delay-1">
                <div className="lumina-icon-tile w-9 h-9 rounded-full flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white/60" />
                </div>
                <div className="pr-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Schools</p>
                  <p className="text-lg font-bold lumina-text font-mono leading-tight">
                    {schools.length}
                  </p>
                </div>
              </div>

              {/* Active orb */}
              <div
                className="lumina-card rounded-full px-4 py-2.5 flex items-center gap-3 transition-transform hover:scale-105 fade-up fade-up-delay-2"
                style={{ borderColor: 'rgba(34,197,94,0.15)' }}
              >
                <div
                  className="lumina-icon-tile w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)' }}
                >
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <div className="pr-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Active</p>
                  <p className="text-lg font-bold text-green-400 font-mono leading-tight">
                    {activeCount}
                  </p>
                </div>
              </div>

              {/* Suspended orb */}
              <div
                className="lumina-card rounded-full px-4 py-2.5 flex items-center gap-3 transition-transform hover:scale-105 fade-up fade-up-delay-3"
                style={{ borderColor: 'rgba(239,68,68,0.15)' }}
              >
                <div
                  className="lumina-icon-tile w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
                >
                  <PauseCircle className="w-4 h-4 text-red-400" />
                </div>
                <div className="pr-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Suspended</p>
                  <p className="text-lg font-bold text-red-400 font-mono leading-tight">
                    {suspendedCount}
                  </p>
                </div>
              </div>

              {/* Total Users orb */}
              <div className="lumina-card rounded-full px-4 py-2.5 flex items-center gap-3 transition-transform hover:scale-105 fade-up fade-up-delay-4">
                <div className="lumina-icon-tile w-9 h-9 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-white/60" />
                </div>
                <div className="pr-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Users</p>
                  <p className="text-lg font-bold lumina-text font-mono leading-tight">
                    {totalUsers}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lumina-divider" />

          {/* ── Actions bar ── */}
          <div className="flex items-center justify-between fade-up fade-up-delay-1">
            <h2 className="text-lg font-semibold lumina-text">All Schools</h2>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <button className="lumina-btn-primary gap-2 flex items-center h-9 px-4 text-sm">
                  <Plus className="w-4 h-4" />
                  Create School
                </button>
              </DialogTrigger>
              <DialogContent className="lumina-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="lumina-text">Create New School</DialogTitle>
                  <DialogDescription className="text-white/40">
                    Create a new school with an activation code. Share the code with the school
                    administrator.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-white/60">
                      School Name *
                    </Label>
                    <Input
                      id="name"
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="e.g., Springfield Elementary"
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-white/60">
                      Short Code *
                    </Label>
                    <Input
                      id="code"
                      value={newSchoolCode}
                      onChange={(e) => setNewSchoolCode(e.target.value.toUpperCase())}
                      placeholder="e.g., SPE"
                      maxLength={10}
                      className="bg-white/5 border-white/10 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activation" className="text-white/60">
                      Activation Code *
                    </Label>
                    <Input
                      id="activation"
                      value={newActivationCode}
                      onChange={(e) => setNewActivationCode(e.target.value.toUpperCase())}
                      placeholder="e.g., SPE001"
                      className="bg-white/5 border-white/10 text-white font-mono"
                    />
                    <p className="text-xs text-white/30">
                      This code is given to the school admin to activate the school
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-white/60">
                      Address (Optional)
                    </Label>
                    <Input
                      id="address"
                      value={newSchoolAddress}
                      onChange={(e) => setNewSchoolAddress(e.target.value)}
                      placeholder="e.g., 123 Main St"
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <button
                    onClick={() => setCreateDialogOpen(false)}
                    className="lumina-btn-glass h-9 px-4 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSchool}
                    disabled={creating}
                    className="lumina-btn-primary gap-2 flex items-center justify-center h-9 px-4 text-sm"
                  >
                    {creating && <LuminaAtom size={16} animate />}
                    Create School
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* ── School cards grid with animated metallic border ── */}
          {loadingSchools ? (
            <div className="flex items-center justify-center py-24 fade-up">
              <LuminaAtom size={48} animate />
            </div>
          ) : schools.length === 0 ? (
            <div className="lumina-card p-12 text-center fade-up">
              <div className="lumina-icon-tile mx-auto mb-4">
                <Building2 className="w-6 h-6 text-white/40" />
              </div>
              <h3 className="lumina-text font-semibold mb-2">No Schools Yet</h3>
              <p className="text-sm text-white/40">Create a school to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {schools.map((school, i) => (
                <div
                  key={school.id}
                  className={`lumina-card lumina-border-sweep p-5 fade-up ${STAGGER[i % STAGGER.length]}`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="lumina-icon-tile shrink-0">
                        <Building2 className="w-5 h-5 text-white/60" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="lumina-text font-semibold truncate">{school.name}</h3>
                        <p className="text-xs text-white/35 font-mono">{school.code}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        school.status === 'active'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {school.status}
                    </span>
                  </div>

                  <div className="lumina-divider mb-4" />

                  {/* Card details */}
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs">Activation Code</span>
                      <div className="flex items-center gap-2">
                        {school.activation_code ? (
                          <>
                            <code className="font-mono text-xs text-white/60">
                              {school.activation_code}
                            </code>
                            <button
                              className="lumina-btn-icon h-6 w-6"
                              onClick={() => copyCode(school.activation_code!)}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-white/25 font-mono text-xs">—</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs">Code Status</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          school.code_used
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {school.code_used ? 'Used' : 'Available'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs">Created</span>
                      <span className="text-white/30 font-mono text-xs">
                        {new Date(school.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="lumina-divider my-4" />

                  {/* Card actions */}
                  <div className="flex items-center gap-2">
                    {school.status === 'active' ? (
                      <button
                        onClick={() => suspendSchool(school.id)}
                        disabled={actionLoading === school.id}
                        className="lumina-btn-glass gap-1.5 flex-1 h-9 text-sm flex items-center justify-center"
                      >
                        <PauseCircle className="w-4 h-4" />
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => activateSchool(school.id)}
                        disabled={actionLoading === school.id}
                        className="lumina-btn-glass gap-1.5 flex-1 h-9 text-sm flex items-center justify-center"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Activate
                      </button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          disabled={actionLoading === school.id}
                          className="lumina-btn-glass gap-1.5 h-9 px-3 text-sm text-red-400 hover:text-red-300 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="lumina-card border-white/10">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="lumina-text">
                            Delete School?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-white/40">
                            This will permanently delete{' '}
                            <strong className="text-white/70">{school.name}</strong> and ALL
                            related data including:
                            <ul className="list-disc ml-4 mt-2">
                              <li>All user profiles</li>
                              <li>All lesson plans</li>
                              <li>All assignments and submissions</li>
                              <li>All course materials</li>
                            </ul>
                            <br />
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="lumina-btn-glass h-9 px-4 text-sm">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteSchool(school.id)}
                            className="lumina-btn-primary h-9 px-4 text-sm"
                            style={{ background: 'rgba(220,38,38,0.9)' }}
                          >
                            Delete Permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Analytics Tab
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <BarChart3 className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">Analytics</h2>
              <p className="text-white/40 text-sm">Platform-wide analytics, excellence programs, and ministry readiness</p>
            </div>
          </div>

          <div className="fade-up fade-up-delay-1">
            <GlobalAnalyticsDashboard />
          </div>

          <div className="lumina-divider" />

          <div className="fade-up fade-up-delay-2">
            <TeacherExcellenceProgram />
          </div>

          <div className="lumina-divider" />

          <div className="fade-up fade-up-delay-3">
            <MinistryReadinessReport />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Ministry Tab
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'ministry' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <KeyRound className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">Ministry</h2>
              <p className="text-white/40 text-sm">Generate and manage ministry compliance codes</p>
            </div>
          </div>

          <div className="fade-up fade-up-delay-1">
            <MinistryCodeGenerator />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          LCT Tab
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'lct' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <Brain className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">LCT</h2>
              <p className="text-white/40 text-sm">Lumina Cognitive Training panel</p>
            </div>
          </div>

          <div className="fade-up fade-up-delay-1">
            <LCTPanel />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Lumina API Tab
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'api' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <Code className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">Lumina API</h2>
              <p className="text-white/40 text-sm">API keys, endpoints, and integration management</p>
            </div>
          </div>

          <div className="fade-up fade-up-delay-1">
            <LuminaApiPanel />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Extensions Tab
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'extensions' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <Puzzle className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">Extensions</h2>
              <p className="text-white/40 text-sm">Review and manage platform extensions</p>
            </div>
          </div>

          <div className="fade-up fade-up-delay-1">
            <ExtensionReviewPanel />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Testing Tab — Role Simulator
         ════════════════════════════════════════════════════════════ */}
      {activeTab === 'testing' && (
        <div className="tab-enter p-4 md:p-6 space-y-6">
          {/* Hero */}
          <div className="lumina-card p-5 flex items-center gap-4 fade-up">
            <div className="lumina-icon-tile">
              <FlaskConical className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold">Testing</h2>
              <p className="text-white/40 text-sm">Role simulator and preview mode</p>
            </div>
          </div>

          {testingRole === 'none' ? (
            /* ── Role selection ── */
            <div className="space-y-6">
              <div className="lumina-card p-6 md:p-8 flex items-center gap-6 fade-up fade-up-delay-1">
                <div className="lumina-icon-tile">
                  <FlaskConical className="w-6 h-6 text-white/60" />
                </div>
                <div>
                  <h2 className="lumina-text text-2xl font-bold">Role Simulator</h2>
                  <p className="text-white/40 text-sm mt-1">
                    Preview how different roles experience Lumina. Select a role below to see their
                    dashboard.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleTestingRole('student')}
                  className="lumina-card p-6 text-left hover:border-white/20 transition-colors fade-up fade-up-delay-1"
                >
                  <div className="lumina-icon-tile mb-4">
                    <GraduationCap className="w-6 h-6 text-white/60" />
                  </div>
                  <h3 className="lumina-text font-semibold mb-1">Student</h3>
                  <p className="text-sm text-white/40">
                    AI Chat, Subjects, Flashcards, Notes, SAT prep
                  </p>
                </button>
                <button
                  onClick={() => handleTestingRole('teacher')}
                  className="lumina-card p-6 text-left hover:border-white/20 transition-colors fade-up fade-up-delay-2"
                >
                  <div className="lumina-icon-tile mb-4">
                    <Users className="w-6 h-6 text-white/60" />
                  </div>
                  <h3 className="lumina-text font-semibold mb-1">Teacher</h3>
                  <p className="text-sm text-white/40">Classes, subjects, assignments, grading</p>
                </button>
                <button
                  onClick={() => handleTestingRole('school_admin')}
                  className="lumina-card p-6 text-left hover:border-white/20 transition-colors fade-up fade-up-delay-3"
                >
                  <div className="lumina-icon-tile mb-4">
                    <UserCog className="w-6 h-6 text-white/60" />
                  </div>
                  <h3 className="lumina-text font-semibold mb-1">School Admin</h3>
                  <p className="text-sm text-white/40">
                    Teachers, students, invite codes, requests
                  </p>
                </button>
              </div>
            </div>
          ) : (
            /* ── Testing preview ── */
            <div className="space-y-6">
              {/* Testing mode banner */}
              <div
                className="lumina-card p-4 flex items-center justify-between fade-up"
                style={{ borderColor: 'rgba(245,158,11,0.3)' }}
              >
                <div className="flex items-center gap-3">
                  <FlaskConical className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">
                    🧪 Testing as{' '}
                    {testingRole === 'student'
                      ? 'Student'
                      : testingRole === 'teacher'
                        ? 'Teacher'
                        : 'School Administrator'}{' '}
                    — Preview Mode
                  </span>
                </div>
                <button
                  onClick={() => setTestingRole('none')}
                  className="lumina-btn-glass gap-2 flex items-center h-9 px-3 text-sm"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Done Testing
                </button>
              </div>

              {/* ── Student preview ── */}
              {testingRole === 'student' && (
                <div className="fade-up fade-up-delay-1">
                  <StudentAppPreview />
                </div>
              )}

              {/* ── Teacher preview ── */}
              {testingRole === 'teacher' && (
                <div className="space-y-6 fade-up fade-up-delay-1">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="lumina-card p-4 fade-up">
                      <p className="text-sm text-white/40">My Classes</p>
                      <p className="text-2xl font-bold lumina-text font-mono">4</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-1">
                      <p className="text-sm text-white/40">Total Students</p>
                      <p className="text-2xl font-bold lumina-text font-mono">87</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-2">
                      <p className="text-sm text-white/40">Active Assignments</p>
                      <p className="text-2xl font-bold text-white/80 font-mono">5</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-3">
                      <p className="text-sm text-white/40">To Grade</p>
                      <p className="text-2xl font-bold text-amber-400 font-mono">12</p>
                    </div>
                  </div>

                  <div className="lumina-card p-6 fade-up fade-up-delay-1">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold lumina-text">My Subjects</h2>
                      <button className="lumina-btn-primary gap-2 flex items-center h-9 px-4 text-sm">
                        <Plus className="w-4 h-4" />
                        Create Assignment
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['Grade 9 Math', 'Grade 10 Math', 'Grade 11 Algebra', 'Grade 12 Calculus'].map(
                        (subject) => (
                          <div
                            key={subject}
                            className="p-4 border border-white/5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                          >
                            <p className="font-medium text-white/80">{subject}</p>
                            <p className="text-xs text-white/40 font-mono">24 students</p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="lumina-card p-6 fade-up fade-up-delay-2">
                    <h2 className="text-lg font-semibold lumina-text mb-4">Submissions to Grade</h2>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-white/40">Student</TableHead>
                          <TableHead className="text-white/40">Assignment</TableHead>
                          <TableHead className="text-white/40">Submitted</TableHead>
                          <TableHead className="text-white/40">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { student: 'John Doe', assignment: 'Math Quiz', date: '2 hours ago' },
                          { student: 'Jane Smith', assignment: 'Math Quiz', date: '3 hours ago' },
                          { student: 'Mike Johnson', assignment: 'Algebra Test', date: 'Yesterday' },
                        ].map((submission, i) => (
                          <TableRow key={i} className="border-white/5">
                            <TableCell className="font-medium text-white/90">
                              {submission.student}
                            </TableCell>
                            <TableCell className="text-white/60">{submission.assignment}</TableCell>
                            <TableCell className="text-white/30">{submission.date}</TableCell>
                            <TableCell>
                              <button className="lumina-btn-glass h-8 px-3 text-sm">
                                Grade
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── School Admin preview ── */}
              {testingRole === 'school_admin' && (
                <div className="space-y-6 fade-up fade-up-delay-1">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="lumina-card p-4 fade-up">
                      <p className="text-sm text-white/40">Total Teachers</p>
                      <p className="text-2xl font-bold lumina-text font-mono">15</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-1">
                      <p className="text-sm text-white/40">Total Students</p>
                      <p className="text-2xl font-bold lumina-text font-mono">342</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-2">
                      <p className="text-sm text-white/40">Pending Requests</p>
                      <p className="text-2xl font-bold text-amber-400 font-mono">4</p>
                    </div>
                    <div className="lumina-card p-4 fade-up fade-up-delay-3">
                      <p className="text-sm text-white/40">Active Codes</p>
                      <p className="text-2xl font-bold text-white/80 font-mono">8</p>
                    </div>
                  </div>

                  <div className="lumina-card p-6 fade-up fade-up-delay-1">
                    <h2 className="text-lg font-semibold lumina-text mb-4">Pending Requests</h2>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-white/40">Name</TableHead>
                          <TableHead className="text-white/40">Email</TableHead>
                          <TableHead className="text-white/40">Role</TableHead>
                          <TableHead className="text-white/40">Requested</TableHead>
                          <TableHead className="text-white/40">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { name: 'Sarah Wilson', email: 'sarah@email.com', role: 'Teacher', date: 'Today' },
                          { name: 'Tom Brown', email: 'tom@email.com', role: 'Student', date: 'Today' },
                          { name: 'Emily Davis', email: 'emily@email.com', role: 'Student', date: 'Yesterday' },
                        ].map((request, i) => (
                          <TableRow key={i} className="border-white/5">
                            <TableCell className="font-medium text-white/90">
                              {request.name}
                            </TableCell>
                            <TableCell className="text-white/60">{request.email}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 rounded text-xs bg-white/10 text-white/60">
                                {request.role}
                              </span>
                            </TableCell>
                            <TableCell className="text-white/30">{request.date}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <button className="lumina-btn-glass gap-1 flex items-center h-8 px-3 text-sm">
                                  <Check className="w-3 h-3" />
                                  Approve
                                </button>
                                <button className="lumina-btn-glass gap-1 flex items-center h-8 px-3 text-sm text-red-400">
                                  <X className="w-3 h-3" />
                                  Deny
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lumina-card p-6 fade-up fade-up-delay-2">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold lumina-text">Invite Codes</h2>
                      <button className="lumina-btn-primary gap-2 flex items-center h-9 px-4 text-sm">
                        <Plus className="w-4 h-4" />
                        Generate Code
                      </button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-white/40">Code</TableHead>
                          <TableHead className="text-white/40">Role</TableHead>
                          <TableHead className="text-white/40">Status</TableHead>
                          <TableHead className="text-white/40">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { code: 'TEACH001', role: 'Teacher', status: 'Available' },
                          { code: 'STU2024A', role: 'Student', status: 'Used' },
                          { code: 'STU2024B', role: 'Student', status: 'Available' },
                        ].map((code, i) => (
                          <TableRow key={i} className="border-white/5">
                            <TableCell>
                              <code className="bg-white/5 px-2 py-1 rounded text-xs text-white/60 font-mono">
                                {code.code}
                              </code>
                            </TableCell>
                            <TableCell className="text-white/60">{code.role}</TableCell>
                            <TableCell>
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  code.status === 'Available'
                                    ? 'bg-green-500/10 text-green-400'
                                    : 'bg-white/5 text-white/30'
                                }`}
                              >
                                {code.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-white/30">Today</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
