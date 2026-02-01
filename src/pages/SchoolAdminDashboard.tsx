import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  getCurrentUser, 
  createUserDirect, 
  getSchoolUsers, 
  updateUser, 
  deleteUser,
  createAnnouncement,
  getAnnouncements
} from '@/lib/educationApi';
import type { Profile, Announcement } from '@/types/education';

export default function SchoolAdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '' });

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'school_admin' || !currentUser.is_active) {
      navigate('/access-denied');
      return;
    }
    setUser(currentUser);
    loadData(currentUser);
  };

  const loadData = async (currentUser: Profile) => {
    try {
      const [usersData, announcementsData] = await Promise.all([
        getSchoolUsers(currentUser.school_id!),
        getAnnouncements(currentUser.school_id!)
      ]);
      setUsers(usersData);
      setAnnouncements(announcementsData);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const result = await createUserDirect({
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        role: formData.get('role') as any,
        grade: formData.get('grade') as string || undefined
      }, user!.school_id!);
      
      toast({
        title: 'User Created!',
        description: `Email: ${result.profile.email}\nPassword: ${result.temporary_password}\n\nPlease save this password!`
      });
      
      e.currentTarget.reset();
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await updateUser(userId, { is_active: !currentStatus });
      toast({ title: 'Success', description: 'User status updated' });
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await deleteUser(userId);
      toast({ title: 'Success', description: 'User deleted' });
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAnnouncement(announcementForm.title, announcementForm.body, user!.school_id!);
      setAnnouncementForm({ title: '', body: '' });
      toast({ title: 'Success', description: 'Announcement posted' });
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  const pendingCounts = {
    students: users.filter(u => u.role === 'student').length,
    teachers: users.filter(u => u.role === 'teacher').length
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Study Bright - School Admin</h1>
            <p className="text-sm text-muted-foreground">{user?.email} • Powered by Lumina AI</p>
          </div>
          <Button onClick={() => navigate('/')} variant="outline">Dashboard</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card p-6 rounded-lg border">
            <h3 className="text-lg font-semibold text-muted-foreground">Total Students</h3>
            <p className="text-4xl font-bold text-primary mt-2">{pendingCounts.students}</p>
          </div>
          <div className="bg-card p-6 rounded-lg border">
            <h3 className="text-lg font-semibold text-muted-foreground">Total Teachers</h3>
            <p className="text-4xl font-bold text-primary mt-2">{pendingCounts.teachers}</p>
          </div>
          <div className="bg-card p-6 rounded-lg border">
            <h3 className="text-lg font-semibold text-muted-foreground">Total Users</h3>
            <p className="text-4xl font-bold text-primary mt-2">{users.length}</p>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="bg-card p-6 rounded-lg border">
              <h2 className="text-xl font-bold mb-4">User Management</h2>
              
              <form onSubmit={handleCreateUser} className="mb-6 p-4 bg-muted rounded-lg">
                <h3 className="text-lg font-semibold mb-4">Create User Directly</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input name="name" required placeholder="John Doe" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input name="email" type="email" required placeholder="user@school.com" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <select name="role" required className="w-full px-3 py-2 border rounded-md bg-background">
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="parent">Parent</option>
                    </select>
                  </div>
                  <div>
                    <Label>Grade (Students Only)</Label>
                    <Input name="grade" placeholder="9th Grade" />
                  </div>
                </div>
                <Button type="submit" className="mt-4">Create User</Button>
              </form>

              <h3 className="text-lg font-semibold mb-3">All Users</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Grade</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3">{u.name}</td>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3 capitalize">{u.role.replace('_', ' ')}</td>
                        <td className="px-4 py-3">{u.grade || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            u.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-4 py-3 space-x-2">
                          <Button onClick={() => handleToggleUserStatus(u.id, u.is_active)} size="sm" variant="outline">
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </Button>
                          <Button onClick={() => handleDeleteUser(u.id)} size="sm" variant="destructive">Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="announcements">
            <div className="bg-card p-6 rounded-lg border">
              <h2 className="text-xl font-bold mb-4">Create Announcement</h2>
              <form onSubmit={handleCreateAnnouncement} className="mb-6 space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required />
                </div>
                <div>
                  <Label>Message</Label>
                  <textarea value={announcementForm.body} onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })} className="w-full px-3 py-2 border rounded-md min-h-[100px] bg-background" required />
                </div>
                <Button type="submit">Post Announcement</Button>
              </form>

              <h3 className="text-lg font-semibold mb-3">Recent Announcements</h3>
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div key={ann.id} className="border rounded-lg p-4">
                    <h4 className="font-bold text-lg">{ann.title}</h4>
                    <p className="text-muted-foreground mt-2">{ann.body}</p>
                    <p className="text-sm text-muted-foreground mt-2">{new Date(ann.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}