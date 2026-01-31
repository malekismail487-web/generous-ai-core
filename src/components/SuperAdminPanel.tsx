'use client';

import { useUserRole } from '@/hooks/useUserRole';

export default function SuperAdminPanel() {
  const { allUsers, loading } = useUserRole();

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Super Admin Panel</h1>

      {allUsers.length === 0 ? (
        <p className="text-gray-500">No users registered yet.</p>
      ) : (
        allUsers.map(user => (
          <div key={user.email} className="mb-6 border p-4 rounded">
            <h2 className="font-semibold">{user.name} ({user.email})</h2>
            {user.schools.length === 0 ? (
              <p className="text-gray-500">No schools claimed.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {user.schools.map(school => (
                  <li key={school.id} className="flex justify-between">
                    <span>{school.name} ({school.status})</span>
                    {school.schoolAdminEmail && (
                      <span className="text-sm text-blue-600">Admin: {school.schoolAdminEmail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
