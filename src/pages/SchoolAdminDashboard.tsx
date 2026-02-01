import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard, UserProfile } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  Loader2,
  RefreshCw,
  LogOut,
  Users,
  UserPlus,
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
  Building2,
  Key,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Badge } from '@/components/ui/badge';

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

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export default function SchoolAdminDashboard() {
  const { isSchoolAdmin, school, profile, loading } = useRoleGuard();
  const { signOut } = useAuth();
  const { toast } = useToast();

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');

  // Invite codes state
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [newCodeRole, setNewCodeRole] = useState<'teacher' | 'student'>('student');
  const [creatingCode, setCreatingCode] = useState(false);

  // Invite requests state
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InviteRequest | null>(null);
  const [studentGrade, setStudentGrade] = useState('');

  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementBody, setNewAnnouncementBody] = useState('');
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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
      // Filter to only show requests for this school
      const filtered = (data || []).filter((r: InviteRequest) => 
        r.invite_codes && (r.invite_codes as unknown as { school_id: string }).school_id === school.id
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
      fetchActivityLogs();
    }
  }, [isSchoolAdmin, school, fetchUsers, fetchInviteCodes, fetchInviteRequests, fetchAnnouncements, fetchActivityLogs]);

  const generateInviteCode = async () => {
    if (!school || !profile) return;
    setCreatingCode(true);

    // Generate random 8 character code
    const code = Array.from({ length: 8 }, () => 
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 36))
    ).join('');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error } = await supabase
      .from('invite_codes')
      .insert({
        school_id: school.id,
        code,
        role: newCodeRole,
        expires_at: expiresAt.toISOString(),
        created_by: profile.id
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating invite code' });
      console.error(error);
    } else {
      toast({ title: 'Invite code created!' });
      fetchInviteCodes();
    }
    setCreatingCode(false);
  };

  const revokeInviteCode = async (codeId: string) => {
    const { error } = await supabase
      .from('invite_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', codeId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error revoking code' });
    } else {
      toast({ title: 'Code revoked' });
      fetchInviteCodes();
    }
  };

  const acceptInviteRequest = async (request: InviteRequest, grade?: string) => {
    if (!school) return;
    
    const inviteCode = request.invite_codes as unknown as InviteCode;
    const userId = (request as unknown as { user_id?: string }).user_id;
    
    // Create profile for the user
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId || crypto.randomUUID(),
        school_id: school.id,
        full_name: request.name,
        user_type: inviteCode.role,
        status: 'approved',
        is_active: true,
        grade_level: grade || null
      });

    if (profileError) {
      toast({ variant: 'destructive', title: 'Error accepting request' });
      console.error(profileError);
      return;
    }

    // Mark code as used
    await supabase
      .from('invite_codes')
      .update({ used: true, used_by: userId })
      .eq('id', request.code_id);

    // Update request status
    await supabase
      .from('invite_requests')
      .update({ status: 'accepted', grade: grade || null })
      .eq('id', request.id);

    toast({ title: 'User accepted!' });
    fetchInviteRequests();
    fetchUsers();
    setGradeModalOpen(false);
    setSelectedRequest(null);
    setStudentGrade('');
  };

  const denyInviteRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('invite_requests')
      .update({ status: 'denied' })
      .eq('id', requestId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error denying request' });
    } else {
      toast({ title: 'Request denied' });
      fetchInviteRequests();
    }
  };

  const suspendUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error suspending user' });
    } else {
      toast({ title: 'User suspended' });
      fetchUsers();
    }
  };

  const activateUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error activating user' });
    } else {
      toast({ title: 'User activated' });
      fetchUsers();
    }
  };

  const deleteUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting user' });
    } else {
      toast({ title: 'User deleted' });
      fetchUsers();
    }
  };

  const createAnnouncement = async () => {
    if (!school || !profile || !newAnnouncementTitle || !newAnnouncementBody) {
      toast({ variant: 'destructive', title: 'Please fill all fields' });
      return;
    }

    setCreatingAnnouncement(true);
    const { error } = await supabase
      .from('announcements')
      .insert({
        school_id: school.id,
        title: newAnnouncementTitle,
        body: newAnnouncementBody,
        created_by: profile.id
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating announcement' });
    } else {
      toast({ title: 'Announcement posted!' });
      setNewAnnouncementTitle('');
      setNewAnnouncementBody('');
      fetchAnnouncements();
    }
    setCreatingAnnouncement(false);
  };

  const deleteAnnouncement = async (announcementId: string) => {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting announcement' });
    } else {
      toast({ title: 'Announcement deleted' });
      fetchAnnouncements();
    }
  };

  const exportUsersCSV = () => {
    const csvContent = [
      ['Name', 'Role', 'Grade', 'Status'].join(','),
      ...filteredUsers.map(u => [
        u.full_name,
        u.user_type,
        u.grade_level || '',
        u.is_active ? 'Active' : 'Suspended'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${school?.code}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === 'all' || u.user_type === userRoleFilter;
    const matchesStatus = userStatusFilter === 'all' || 
      (userStatusFilter === 'active' && u.is_active) ||
      (userStatusFilter === 'suspended' && !u.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Count pending
  const pendingCounts = {
    students: inviteRequests.filter(r => (r.invite_codes as unknown as InviteCode)?.role === 'student').length,
    teachers: inviteRequests.filter(r => (r.invite_codes as unknown as InviteCode)?.role === 'teacher').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSchoolAdmin || !school) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-effect-strong border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{school.name}</h1>
              <p className="text-xs text-muted-foreground">School Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Total Users</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Pending Requests</p>
            <p className="text-2xl font-bold text-amber-500">{inviteRequests.length}</p>
          </div>
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Active Codes</p>
            <p className="text-2xl font-bold text-green-500">
              {inviteCodes.filter(c => !c.used && new Date(c.expires_at) > new Date()).length}
            </p>
          </div>
          <div className="glass-effect rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Announcements</p>
            <p className="text-2xl font-bold">{announcements.length}</p>
          </div>
        </div>

        {/* Pending Summary */}
        {inviteRequests.length > 0 && (
          <div className="glass-effect rounded-xl p-4 mb-6 bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-500">
              <Clock className="w-5 h-5" />
              <span className="font-medium">
                {pendingCounts.students} student{pendingCounts.students !== 1 ? 's' : ''}, {pendingCounts.teachers} teacher{pendingCounts.teachers !== 1 ? 's' : ''} pending approval
              </span>
            </div>
          </div>
        )}

        <Tabs defaultValue="codes" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="codes" className="gap-2">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Codes</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Pending</span>
              {inviteRequests.length > 0 && (
                <Badge variant="destructive" className="ml-1">{inviteRequests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">Announce</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          {/* Invite Codes Tab */}
          <TabsContent value="codes" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Invite Codes</h2>
              <div className="flex items-center gap-2">
                <Select value={newCodeRole} onValueChange={(v) => setNewCodeRole(v as 'teacher' | 'student')}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={generateInviteCode} disabled={creatingCode} className="gap-2">
                  {creatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Generate Code
                </Button>
              </div>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inviteCodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No invite codes yet. Generate one to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    inviteCodes.map((code) => {
                      const isExpired = new Date(code.expires_at) < new Date();
                      return (
                        <TableRow key={code.id}>
                          <TableCell>
                            <code className="bg-muted px-2 py-1 rounded font-mono">{code.code}</code>
                          </TableCell>
                          <TableCell className="capitalize">{code.role}</TableCell>
                          <TableCell>
                            {code.used ? (
                              <Badge variant="secondary">Used</Badge>
                            ) : isExpired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : (
                              <Badge variant="default" className="bg-green-500">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(code.expires_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {!code.used && !isExpired && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokeInviteCode(code.id)}
                              >
                                Revoke
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
          </TabsContent>

          {/* Pending Requests Tab */}
          <TabsContent value="pending" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pending Requests</h2>
              <Button variant="outline" size="icon" onClick={fetchInviteRequests} disabled={loadingRequests}>
                <RefreshCw className={`w-4 h-4 ${loadingRequests ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inviteRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No pending requests
                      </TableCell>
                    </TableRow>
                  ) : (
                    inviteRequests.map((request) => {
                      const inviteCode = request.invite_codes as unknown as InviteCode;
                      return (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.name}</TableCell>
                          <TableCell>{request.email}</TableCell>
                          <TableCell className="capitalize">{inviteCode?.role}</TableCell>
                          <TableCell>
                            <code className="bg-muted px-2 py-1 rounded text-xs">{inviteCode?.code}</code>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(request.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-green-500 hover:text-green-600"
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
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-destructive hover:text-destructive"
                                onClick={() => denyInviteRequest(request.id)}
                              >
                                <X className="w-4 h-4" />
                                Deny
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

            {/* Grade Modal for Students */}
            <Dialog open={gradeModalOpen} onOpenChange={setGradeModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enter Student Grade</DialogTitle>
                  <DialogDescription>
                    Please enter the grade level for {selectedRequest?.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="grade">Grade Level</Label>
                  <Input
                    id="grade"
                    value={studentGrade}
                    onChange={(e) => setStudentGrade(e.target.value)}
                    placeholder="e.g., Grade 10, 11th, Senior"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGradeModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => selectedRequest && acceptInviteRequest(selectedRequest, studentGrade)}>
                    Accept Student
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Users</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 w-40"
                  />
                </div>
                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="school_admin">Admin</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={exportUsersCSV}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell className="capitalize">{user.user_type.replace('_', ' ')}</TableCell>
                        <TableCell>{user.grade_level || '-'}</TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge variant="default" className="bg-green-500">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Suspended</Badge>
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
                                  className="gap-1"
                                >
                                  <Ban className="w-4 h-4" />
                                  Suspend
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => activateUser(user.id)}
                                  className="gap-1"
                                >
                                  <Play className="w-4 h-4" />
                                  Activate
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete User?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete {user.full_name} and all their data.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUser(user.id)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Delete
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
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <h2 className="text-lg font-semibold">Announcements</h2>

            {/* Create Announcement Form */}
            <div className="glass-effect rounded-xl p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  value={newAnnouncementTitle}
                  onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                  placeholder="Announcement title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-body">Message</Label>
                <Textarea
                  id="announcement-body"
                  value={newAnnouncementBody}
                  onChange={(e) => setNewAnnouncementBody(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                />
              </div>
              <Button
                onClick={createAnnouncement}
                disabled={creatingAnnouncement || !newAnnouncementTitle || !newAnnouncementBody}
              >
                {creatingAnnouncement ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
                Post Announcement
              </Button>
            </div>

            {/* Announcements List */}
            <div className="space-y-4">
              {announcements.length === 0 ? (
                <div className="glass-effect rounded-xl p-8 text-center">
                  <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No announcements yet</p>
                </div>
              ) : (
                announcements.map((announcement) => (
                  <div key={announcement.id} className="glass-effect rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{announcement.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(announcement.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAnnouncement(announcement.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{announcement.body}</p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Activity Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Activity Logs</h2>
              <Button variant="outline" size="icon" onClick={fetchActivityLogs} disabled={loadingLogs}>
                <RefreshCw className={`w-4 h-4 ${loadingLogs ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No activity logs yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    activityLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.action}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {JSON.stringify(log.details)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
