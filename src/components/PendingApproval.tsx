import { Clock, School, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSchool } from '@/hooks/useSchool';
import { useAuth } from '@/hooks/useAuth';

export function PendingApproval() {
  const { profile, school, refresh } = useSchool();
  const { signOut } = useAuth();

  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="ambient-glow" />
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-red-500 to-rose-600">
            <School className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Registration Declined</h1>
          <p className="text-muted-foreground mb-6">
            Your registration for <strong>{school?.name}</strong> was not approved. 
            Please contact your school administrator for more information.
          </p>
          <Button variant="outline" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse">
          <Clock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pending Approval</h1>
        <p className="text-muted-foreground mb-2">
          Your request to join <strong>{school?.name || 'your school'}</strong> has been submitted.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Your school administrator has been notified and will review your request shortly.
        </p>

        <div className="glass-effect rounded-2xl p-5 mb-6 text-left">
          <h3 className="font-semibold mb-3">Your Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>{profile?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{profile?.user_type}</span>
            </div>
            {profile?.student_teacher_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span>{profile.student_teacher_id}</span>
              </div>
            )}
            {profile?.grade_level && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grade</span>
                <span>{profile.grade_level}</span>
              </div>
            )}
            {profile?.department && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department</span>
                <span>{profile.department}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={refresh} className="flex-1 gap-2">
            <RefreshCw size={16} />
            Check Status
          </Button>
          <Button variant="ghost" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
