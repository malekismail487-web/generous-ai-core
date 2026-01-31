use client';

import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';

interface SuperAdminGuardProps {
  children: ReactNode;
}

const SUPER_ADMIN_EMAILS = ['malekismail487@gmail.com'];

export default function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const { user, loading } = useUserRole();

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!user) return <div className="p-8 text-center">You must log in to access this page.</div>;

  if (!SUPER_ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="mt-2 text-gray-600">You do not have super admin privileges.</p>
      </div>
    );
  }

  return <>{children}</>;
}
