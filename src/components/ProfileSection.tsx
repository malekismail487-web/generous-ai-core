import { useState } from 'react';
import { ArrowLeft, User, Shield, GraduationCap, LogOut, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { TeacherRequestCard } from '@/components/TeacherRequestCard';
import { AdminPanel } from '@/components/AdminPanel';
import { cn } from '@/lib/utils';

type ViewState = 'main' | 'admin';

export function ProfileSection() {
  const [viewState, setViewState] = useState<ViewState>('main');
  const { user, signOut } = useAuth();
  const { isTeacher, isAdmin, roles, loading } = useUserRole();

  if (viewState === 'admin') {
    return <AdminPanel onBack={() => setViewState('main')} />;
  }

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Profile</h1>
          {user && (
            <p className="text-sm text-muted-foreground">{user.email}</p>
          )}
        </div>

        {/* Role Badge */}
        <div className="glass-effect rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isAdmin 
                ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
                : isTeacher 
                  ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white"
                  : "bg-gradient-to-br from-blue-500 to-cyan-600 text-white"
            )}>
              {isAdmin ? <Shield className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold">Your Role</h3>
              <p className="text-sm text-muted-foreground capitalize">
                {isAdmin ? 'Administrator' : isTeacher ? 'Teacher' : 'Student'}
              </p>
            </div>
          </div>
        </div>

        {/* Teacher Request (only for students) */}
        {!isTeacher && !isAdmin && !loading && (
          <div className="mb-4">
            <TeacherRequestCard />
          </div>
        )}

        {/* Admin Panel Link */}
        {isAdmin && (
          <button
            onClick={() => setViewState('admin')}
            className="w-full glass-effect rounded-2xl p-5 mb-4 text-left hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Admin Panel</h3>
                <p className="text-sm text-muted-foreground">Manage teacher requests and roles</p>
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
