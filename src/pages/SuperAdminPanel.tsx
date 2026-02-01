import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAllSchools, createSchool, suspendSchool, activateSchool, deleteSchool, getCurrentUser } from '@/lib/educationApi';
import type { School } from '@/types/education';
import { useToast } from '@/hooks/use-toast';

export default function SuperAdminPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: '', short_id: '', activation_code: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const user = await getCurrentUser();
    if (!user || user.email !== 'malekismail487@gmail.com' || user.role !== 'super_admin') {
      navigate('/access-denied');
      return;
    }
    loadSchools();
  };

  const loadSchools = async () => {
    try {
      const data = await getAllSchools();
      setSchools(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createSchool(newSchool);
      setNewSchool({ name: '', short_id: '', activation_code: '' });
      setShowCreateForm(false);
      toast({ title: 'Success', description: 'School created successfully' });
      loadSchools();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleSuspend = async (schoolId: string) => {
    if (!confirm('Suspend this school? All users will be deactivated.')) return;
    try {
      await suspendSchool(schoolId);
      toast({ title: 'Success', description: 'School suspended' });
      loadSchools();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleActivate = async (schoolId: string) => {
    if (!confirm('Activate this school?')) return;
    try {
      await activateSchool(schoolId);
      toast({ title: 'Success', description: 'School activated' });
      loadSchools();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (schoolId: string) => {
    if (!confirm('DELETE this school and ALL related data? This cannot be undone!')) return;
    if (!confirm('Are you ABSOLUTELY sure?')) return;
    
    try {
      await deleteSchool(schoolId);
      toast({ title: 'Success', description: 'School deleted' });
      loadSchools();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">SUPER ADMIN PANEL</h1>
            <p className="text-sm text-muted-foreground">malekismail487@gmail.com</p>
          </div>
          <Button onClick={() => navigate('/')} variant="outline">
            Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Schools Management</h2>
            <Button onClick={() => setShowCreateForm(!showCreateForm)}>
              {showCreateForm ? 'Cancel' : '+ Create School'}
            </Button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateSchool} className="mb-6 p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label htmlFor="name">School Name</Label>
                  <Input
                    id="name"
                    value={newSchool.name}
                    onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                    placeholder="ABC High School"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="short_id">Short ID</Label>
                  <Input
                    id="short_id"
                    value={newSchool.short_id}
                    onChange={(e) => setNewSchool({ ...newSchool, short_id: e.target.value.toUpperCase() })}
                    placeholder="ABC123"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="activation_code">Activation Code</Label>
                  <Input
                    id="activation_code"
                    value={newSchool.activation_code}
                    onChange={(e) => setNewSchool({ ...newSchool, activation_code: e.target.value.toUpperCase() })}
                    placeholder="SCHOOL001"
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create School'}
              </Button>
            </form>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">School Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Short ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Activation Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Code Used</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Created</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {schools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No schools found
                    </td>
                  </tr>
                ) : (
                  schools.map((school) => (
                    <tr key={school.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">{school.name}</td>
                      <td className="px-4 py-3">{school.short_id}</td>
                      <td className="px-4 py-3 font-mono">{school.activation_code}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          school.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {school.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {school.code_used ? '✓ Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(school.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 space-x-2">
                        {school.status === 'active' ? (
                          <Button
                            onClick={() => handleSuspend(school.id)}
                            size="sm"
                            variant="outline"
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleActivate(school.id)}
                            size="sm"
                            variant="outline"
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          onClick={() => handleDelete(school.id)}
                          size="sm"
                          variant="destructive"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
