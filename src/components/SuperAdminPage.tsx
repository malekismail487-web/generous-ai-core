'use client';

import SuperAdminGuard from '@/components/SuperAdminGuard';
import SuperAdminPanel from '@/components/SuperAdminPanel';
import EnterSchoolCode from '@/components/EnterSchoolCode';

export default function SuperAdminPage() {
  return (
    <SuperAdminGuard>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Enter new school codes manually */}
        <EnterSchoolCode />

        {/* See all users and schools */}
        <SuperAdminPanel />
      </div>
    </SuperAdminGuard>
  );
}
