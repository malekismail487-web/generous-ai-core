import React from 'react';
import { useUser } from '../hooks/useUser'; // Example hook that gets logged-in user
import SuperAdminDashboard from '../components/SuperAdminDashboard';
import Unauthorized from '../components/Unauthorized';
import Loading from '../components/Loading';

// List of super admins (you can expand later)
const SUPER_ADMINS = ['malekismail487@gmail.com'];

export default function SuperAdminGuard() {
  const { user, loading } = useUser();

  // Show loading while checking authentication
  if (loading) return <Loading />;

  // Not logged in
  if (!user) return <Unauthorized message="You must log in to access this page." />;

  // Check if user is super admin
  if (SUPER_ADMINS.includes(user.email)) {
    return <SuperAdminDashboard />;
  }

  // Otherwise, show forbidden message
  return <Unauthorized message="You do not have permission to access this page." />;
}
