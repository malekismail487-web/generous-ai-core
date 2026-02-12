import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard, School } from '@/hooks/useRoleGuard';
import { Navigate, useNavigate } from 'react-router-dom';
import { 
  Building2, 
  Loader2, 
  RefreshCw, 
  Trash2, 
  PauseCircle, 
  PlayCircle,
  Plus,
  ShieldAlert,
  LogOut,
  Copy,
  FlaskConical,
  GraduationCap,
  Users,
  UserCog,
  Check,
  X
} from 'lucide-react';
import { StudentAppPreview } from '@/components/StudentAppPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
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

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useRoleGuard();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testingRole, setTestingRole] = useState<TestingRole>('none');
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  
  // Create school form state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newActivationCode, setNewActivationCode] = useState('');
  const [newSchoolAddress, setNewSchoolAddress] = useState('');
  const [creating, setCreating] = useState(false);

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
    setLoadingSchools(false);
  }, [toast]);

  useEffect(() => {
    if (isSuperAdmin && isVerified) {
      fetchSchools();
    }
  }, [isSuperAdmin, isVerified, fetchSchools]);

  // Handle sign out and clear verification
  const handleSignOut = async () => {
    sessionStorage.removeItem('superAdminVerified');
    await signOut();
    navigate('/auth');
  };

  const suspendSchool = async (schoolId: string) => {
    setActionLoading(schoolId);
    
    // Update school status
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
    
    const { error } = await supabase.rpc('delete_school_cascade', { school_uuid: schoolId });

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting school', description: error.message });
      console.error('Delete school error:', error);
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
      school_address: newSchoolAddress || null
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

  if (loading || isVerified === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isVerified) {
    // Will redirect via useEffect, show loading
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-destructive" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You do not have permission to access this page. This area is restricted to super administrators only.
          </p>
          <Button onClick={() => window.location.href = '/'} variant="outline">
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  // Render testing mode UI - navigate to actual dashboards with a banner
  if (testingRole !== 'none') {
    const roleLabels = {
      student: 'Student',
      teacher: 'Teacher',
      school_admin: 'School Administrator'
    };

    // For student testing, show the actual student app (Index.tsx components)
    if (testingRole === 'student') {
      // Import and render the actual student experience
      return (
        <div className="min-h-screen bg-background">
          {/* Testing Mode Banner */}
          <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FlaskConical className="w-5 h-5" />
                <span className="font-medium text-sm">
                  🧪 Testing as {roleLabels[testingRole]} - This is what students see (AI Chat, Subjects, Flashcards, Notes, SAT)
                </span>
              </div>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => setTestingRole('none')}
                className="gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                Done Testing
              </Button>
            </div>
          </div>
          
          {/* Render actual student app preview */}
          <div className="pt-10">
            <StudentAppPreview />
          </div>
        </div>
      );
    }

    // Teacher and School Admin testing modes with mock dashboards
    const roleIcons = {
      teacher: Users,
      school_admin: UserCog
    };

    const RoleIcon = roleIcons[testingRole as 'teacher' | 'school_admin'];

    return (
      <div className="min-h-screen bg-background">
        {/* Testing Mode Banner */}
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-5 h-5" />
              <span className="font-medium text-sm">
                🧪 Testing as {testingRole === 'teacher' ? 'Teacher' : 'School Administrator'}
              </span>
            </div>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setTestingRole('none')}
              className="gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              Done Testing
            </Button>
          </div>
        </div>

        <div className="pt-12">
          <header className="glass-effect-strong border-b border-border/30 sticky top-10 z-40">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <RoleIcon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">
                    {testingRole === 'teacher' ? 'Teacher' : 'School Administrator'} Dashboard
                  </h1>
                  <p className="text-xs text-muted-foreground">Preview Mode</p>
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 py-6">
            {testingRole === 'teacher' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">My Classes</p>
                    <p className="text-2xl font-bold">4</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-bold">87</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Active Assignments</p>
                    <p className="text-2xl font-bold text-primary">5</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">To Grade</p>
                    <p className="text-2xl font-bold text-warning">12</p>
                  </div>
                </div>

                <div className="glass-effect rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">📚 My Subjects</h2>
                    <Button size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create Assignment
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['Grade 9 Math', 'Grade 10 Math', 'Grade 11 Algebra', 'Grade 12 Calculus'].map((subject) => (
                      <div key={subject} className="p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                        <p className="font-medium">{subject}</p>
                        <p className="text-xs text-muted-foreground">24 students</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-effect rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">📋 Submissions to Grade</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Assignment</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { student: 'John Doe', assignment: 'Math Quiz', date: '2 hours ago' },
                        { student: 'Jane Smith', assignment: 'Math Quiz', date: '3 hours ago' },
                        { student: 'Mike Johnson', assignment: 'Algebra Test', date: 'Yesterday' }
                      ].map((submission, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{submission.student}</TableCell>
                          <TableCell>{submission.assignment}</TableCell>
                          <TableCell className="text-muted-foreground">{submission.date}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">Grade</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {testingRole === 'school_admin' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Total Teachers</p>
                    <p className="text-2xl font-bold">15</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-bold">342</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Pending Requests</p>
                    <p className="text-2xl font-bold text-warning">4</p>
                  </div>
                  <div className="glass-effect rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Active Codes</p>
                    <p className="text-2xl font-bold text-primary">8</p>
                  </div>
                </div>

                <div className="glass-effect rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">⏳ Pending Requests</h2>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { name: 'Sarah Wilson', email: 'sarah@email.com', role: 'Teacher', date: 'Today' },
                        { name: 'Tom Brown', email: 'tom@email.com', role: 'Student', date: 'Today' },
                        { name: 'Emily Davis', email: 'emily@email.com', role: 'Student', date: 'Yesterday' }
                      ].map((request, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{request.name}</TableCell>
                          <TableCell>{request.email}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${
                              request.role === 'Teacher' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent-foreground'
                            }`}>
                              {request.role}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{request.date}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="gap-1">
                                <Check className="w-3 h-3" />
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1 text-destructive">
                                <X className="w-3 h-3" />
                                Deny
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="glass-effect rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">🔑 Invite Codes</h2>
                    <Button size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      Generate Code
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { code: 'TEACH001', role: 'Teacher', status: 'Available' },
                        { code: 'STU2024A', role: 'Student', status: 'Used' },
                        { code: 'STU2024B', role: 'Student', status: 'Available' }
                      ].map((code, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <code className="bg-muted px-2 py-1 rounded text-xs">{code.code}</code>
                          </TableCell>
                          <TableCell>{code.role}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${
                              code.status === 'Available' ? 'bg-accent/10 text-accent-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                              {code.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">Today</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-effect-strong border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Super Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Manage all schools</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FlaskConical className="w-4 h-4" />
                  Testing
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTestingRole('student')} className="gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Test as Student
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTestingRole('teacher')} className="gap-2">
                  <Users className="w-4 h-4" />
                  Test as Teacher
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTestingRole('school_admin')} className="gap-2">
                  <UserCog className="w-4 h-4" />
                  Test as School Admin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="icon" onClick={fetchSchools} disabled={loadingSchools}>
              <RefreshCw className={`w-4 h-4 ${loadingSchools ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Total Schools</p>
            <p className="text-2xl font-bold">{schools.length}</p>
          </div>
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Active Schools</p>
            <p className="text-2xl font-bold text-green-500">
              {schools.filter(s => s.status === 'active').length}
            </p>
          </div>
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Suspended Schools</p>
            <p className="text-2xl font-bold text-destructive">
              {schools.filter(s => s.status === 'suspended').length}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Schools</h2>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create School
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New School</DialogTitle>
                <DialogDescription>
                  Create a new school with an activation code. Share the code with the school administrator.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">School Name *</Label>
                  <Input
                    id="name"
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    placeholder="e.g., Springfield Elementary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Short Code *</Label>
                  <Input
                    id="code"
                    value={newSchoolCode}
                    onChange={(e) => setNewSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g., SPE"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="activation">Activation Code *</Label>
                  <Input
                    id="activation"
                    value={newActivationCode}
                    onChange={(e) => setNewActivationCode(e.target.value.toUpperCase())}
                    placeholder="e.g., SPE001"
                  />
                  <p className="text-xs text-muted-foreground">
                    This code is given to the school admin to activate the school
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address (Optional)</Label>
                  <Input
                    id="address"
                    value={newSchoolAddress}
                    onChange={(e) => setNewSchoolAddress(e.target.value)}
                    placeholder="e.g., 123 Main St"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createSchool} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create School
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Schools Table */}
        <div className="glass-effect rounded-xl overflow-hidden">
          {loadingSchools ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : schools.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No Schools Yet</h3>
              <p className="text-sm text-muted-foreground">Create a school to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School Name</TableHead>
                  <TableHead>Short ID</TableHead>
                  <TableHead>Activation Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((school) => (
                  <TableRow key={school.id}>
                    <TableCell className="font-medium">{school.name}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-xs">{school.code}</code>
                    </TableCell>
                    <TableCell>
                      {school.activation_code ? (
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {school.activation_code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyCode(school.activation_code!)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          school.status === 'active'
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {school.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          school.code_used
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {school.code_used ? 'Used' : 'Available'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(school.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {school.status === 'active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => suspendSchool(school.id)}
                            disabled={actionLoading === school.id}
                            className="gap-1"
                          >
                            <PauseCircle className="w-4 h-4" />
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => activateSchool(school.id)}
                            disabled={actionLoading === school.id}
                            className="gap-1"
                          >
                            <PlayCircle className="w-4 h-4" />
                            Activate
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive"
                              disabled={actionLoading === school.id}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete School?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{school.name}</strong> and ALL related data including:
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
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteSchool(school.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
