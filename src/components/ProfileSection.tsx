import { useState } from 'react';
import { User, Shield, GraduationCap, LogOut, ChevronRight, Building2, Users, School, Key, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useSchool } from '@/hooks/useSchool';
import { SchoolAdminPanel } from '@/components/SchoolAdminPanel';
import SuperAdminPanel from '@/components/SuperAdminPanel';
import { cn } from '@/lib/utils';

type ViewState = 'main' | 'school-admin' | 'super-admin';

export function ProfileSection() {
  const [viewState, setViewState] = useState<ViewState>('main');
  const [showAdminCodeInput, setShowAdminCodeInput] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin, isHardcodedAdmin, verifyAdminCode } = useUserRole();
  const { profile, school, isSchoolAdmin, loading } = useSchool();

  const handleVerifyAdminCode = async () => {
    if (!adminCode.trim()) return;
    setIsVerifying(true);
    const success = await verifyAdminCode(adminCode.trim());
    setIsVerifying(false);
    if (success) {
      setShowAdminCodeInput(false);
      setAdminCode('');
    }
  };

  if (viewState === 'school-admin') {
    return <SchoolAdminPanel onBack={() => setViewState('main')} />;
  }

  if (viewState === 'super-admin') {
    return <SuperAdminPanel onBack={() => setViewState('main')} />;
  }

  const userType = profile?.user_type || 'student';
  const isTeacher = userType === 'teacher';

  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4",
            isAdmin 
              ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : isTeacher 
                ? "bg-gradient-to-br from-violet-500 to-purple-600"
                : "bg-gradient-to-br from-blue-500 to-cyan-600"
          )}>
            {isAdmin ? (
              <Shield className="w-8 h-8 text-white" />
            ) : isTeacher ? (
              <User className="w-8 h-8 text-white" />
            ) : (
              <GraduationCap className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold mb-1">{profile?.full_name || 'Profile'}</h1>
          {user && (
            <p className="text-sm text-muted-foreground">{user.email}</p>
          )}
          {isHardcodedAdmin && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-amber-500/20 text-amber-600 text-xs font-medium rounded-full">
              <Shield size={12} /> Developer Admin
            </span>
          )}
        </div>

        {/* School Info */}
        {school && (
          <div className="glass-effect rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent text-white">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">{school.name}</h3>
                <p className="text-xs text-muted-foreground">School Code: {school.code}</p>
              </div>
            </div>
          </div>
        )}

        {/* Role & Details */}
        <div className="glass-effect rounded-2xl p-5 mb-4">
          <h3 className="font-semibold mb-3">Your Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="capitalize">
                {isAdmin ? 'Super Admin' : isSchoolAdmin ? 'School Admin' : profile?.user_type || 'Student'}
              </span>
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

        {/* Admin Code Recovery - Only show if not already admin */}
        {!isAdmin && (
          <div className="glass-effect rounded-2xl p-5 mb-4">
            {!showAdminCodeInput ? (
              <button
                onClick={() => setShowAdminCodeInput(true)}
                className="w-full flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-slate-600 to-slate-700 text-white">
                  <Key className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Admin Access Code</h3>
                  <p className="text-sm text-muted-foreground">Enter code to regain admin access</p>
                </div>
                <ChevronRight className="text-muted-foreground" />
              </button>
            ) : (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Key size={16} /> Enter Admin Access Code
                </h3>
                <input
                  type="password"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Enter your admin access code"
                  className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyAdminCode()}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowAdminCodeInput(false);
                      setAdminCode('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleVerifyAdminCode}
                    disabled={!adminCode.trim() || isVerifying}
                  >
                    {isVerifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key size={16} />
                    )}
                    Verify
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* School Admin Panel */}
        {isSchoolAdmin && (
          <button
            onClick={() => setViewState('school-admin')}
            className="w-full glass-effect rounded-2xl p-5 mb-4 text-left hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">School Admin</h3>
                <p className="text-sm text-muted-foreground">Manage user registrations</p>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
        )}

        {/* Super Admin Panel */}
        {isAdmin && (
          <button
            onClick={() => setViewState('super-admin')}
            className="w-full glass-effect rounded-2xl p-5 mb-4 text-left hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Manage Schools</h3>
                <p className="text-sm text-muted-foreground">Create and manage schools</p>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
        )}

        {/* Sign Out */}
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
