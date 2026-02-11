import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, RefreshCw, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

type School = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  created_at: string;
  updated_at: string;
  is_test_data: boolean | null;
};

interface SuperAdminPanelProps {
  onBack?: () => void;
}

export default function SuperAdminPanel({ onBack }: SuperAdminPanelProps) {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkEmail = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        setAuthorized(false);
        return;
      }

      setAuthorized(data.user.email === SUPER_ADMIN_EMAIL);
    };

    checkEmail();
  }, []);

  const fetchSchools = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('name');

    if (error) {
      setError(error.message);
    } else {
      setSchools(data || []);
    }

    setLoading(false);
  };

  const deleteSchool = async (schoolId: string) => {
    if (!confirm('Are you sure you want to delete this school? This will permanently remove all associated data (students, teachers, assignments, etc.).')) return;

    const { error } = await supabase
      .rpc('delete_school_cascade', { school_uuid: schoolId });

    if (error) {
      setError(error.message);
    } else {
      setSchools((prev) => prev.filter((s) => s.id !== schoolId));
    }
  };

  useEffect(() => {
    if (authorized) {
      fetchSchools();
    }
  }, [authorized]);

  if (authorized === null) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex-1 pt-16 pb-20 px-4">
        <div className="max-w-2xl mx-auto">
          {onBack && (
            <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">
              <ArrowLeft size={16} /> Back
            </Button>
          )}
          <div className="glass-effect rounded-2xl p-6 text-center">
            <p className="text-destructive font-semibold">
              Access denied. Super admin only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft size={20} />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold">Super Admin Panel</h1>
              <p className="text-sm text-muted-foreground">Manage all schools</p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={fetchSchools} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {error && (
          <div className="glass-effect rounded-2xl p-4 mb-4 bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : schools.length === 0 ? (
          <div className="glass-effect rounded-2xl p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No Schools Yet</h3>
            <p className="text-sm text-muted-foreground">
              Schools will appear here once they are registered.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <div
                key={school.id}
                className="glass-effect rounded-2xl p-5 hover:shadow-lg transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-lg">{school.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Code: <span className="font-mono">{school.code}</span>
                      </p>
                      {school.address && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {school.address}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Created: {new Date(school.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteSchool(school.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
