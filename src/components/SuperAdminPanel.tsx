import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

type School = {
  id: string;
  name: string;
  code: string;
  short_id: string | null;
  status: 'active' | 'suspended';
  activation_code: string | null;
  code_used: boolean;
};

export default function SuperAdminPanel() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // 🔒 HARD-CODED EMAIL CHECK
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

  const toggleSchoolStatus = async (school: School) => {
    const newStatus = school.status === 'active' ? 'suspended' : 'active';

    // Optimistically update state
    setSchools((prev) =>
      prev.map((s) => (s.id === school.id ? { ...s, status: newStatus } : s))
    );

    // Update Supabase in the background
    const { error } = await supabase
      .from('schools')
      .update({ status: newStatus })
      .eq('id', school.id);

    if (error) {
      // Revert state if error occurs
      setSchools((prev) =>
        prev.map((s) => (s.id === school.id ? { ...s, status: school.status } : s))
      );
      setError(error.message);
    }
  };

  const regenerateActivationCode = async (schoolId: string) => {
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Optimistically update state
    setSchools((prev) =>
      prev.map((s) =>
        s.id === schoolId ? { ...s, activation_code: newCode, code_used: false } : s
      )
    );

    // Update Supabase in the background
    const { error } = await supabase
      .from('schools')
      .update({ activation_code: newCode, code_used: false })
      .eq('id', schoolId);

    if (error) {
      // Revert state if error occurs
      fetchSchools(); // fallback: refetch the data
      setError(error.message);
    }
  };

  useEffect(() => {
    if (authorized) {
      fetchSchools();
    }
  }, [authorized]);

  if (authorized === null) {
    return <div className="p-6">Checking access…</div>;
  }

  if (!authorized) {
    return (
      <div className="p-6 text-red-600 font-semibold">
        Access denied. Super admin only.
      </div>
    );
  }

  if (loading) {
    return <div className="p-6">Loading schools…</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Super Admin Panel</h1>

      <div className="space-y-4">
        {schools.map((school) => (
          <div
            key={school.id}
            className="border rounded-lg p-4 flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold">{school.name}</h2>
                <p className="text-sm text-gray-500">
                  Code: {school.code} • Status: {school.status}
                </p>
              </div>

              <button
                onClick={() => toggleSchoolStatus(school)}
                className="px-3 py-1 text-sm border rounded"
              >
                {school.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span>
                Activation Code:{' '}
                <strong>{school.activation_code ?? '—'}</strong>
              </span>

              <span>
                Used: {school.code_used ? 'Yes' : 'No'}
              </span>

              <button
                onClick={() => regenerateActivationCode(school.id)}
                className="text-blue-600 underline"
              >
                Regenerate Code
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
