import { useState } from 'react';
import { ArrowLeft, Users, CheckCircle, XCircle, Clock, Loader2, GraduationCap, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSchoolAdmin } from '@/hooks/useSchoolAdmin';
import { useSchool, Profile } from '@/hooks/useSchool';
import { cn } from '@/lib/utils';

interface SchoolAdminPanelProps {
  onBack: () => void;
}

export function SchoolAdminPanel({ onBack }: SchoolAdminPanelProps) {
  const { school } = useSchool();
  const { pendingUsers, allUsers, loading, approveUser, rejectUser } = useSchoolAdmin();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const handleApprove = async (userId: string) => {
    setProcessingId(userId);
    await approveUser(userId);
    setProcessingId(null);
  };

  const handleReject = async (userId: string) => {
    setProcessingId(userId);
    await rejectUser(userId);
    setProcessingId(null);
  };

  const displayedUsers = filter === 'pending' ? pendingUsers : allUsers;

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>

        <div className="text-center mb-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <Users className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold mb-1 gradient-text">School Admin</h1>
          <p className="text-muted-foreground text-sm">{school?.name}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{pendingUsers.length}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">
              {allUsers.filter(u => u.status === 'approved').length}
            </div>
            <div className="text-xs text-muted-foreground">Approved</div>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-primary">{allUsers.length}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="glass-effect rounded-xl p-2 mb-4 flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              filter === 'pending'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            Pending ({pendingUsers.length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              filter === 'all'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            All Users
          </button>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : displayedUsers.length === 0 ? (
          <div className="glass-effect rounded-2xl p-8 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No users</h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'pending' ? 'No pending registrations' : 'No users registered yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedUsers.map((user) => (
              <div key={user.id} className="glass-effect rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    user.user_type === 'student'
                      ? "bg-gradient-to-br from-blue-500 to-cyan-600 text-white"
                      : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                  )}>
                    {user.user_type === 'student' ? (
                      <GraduationCap size={18} />
                    ) : (
                      <User size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{user.full_name}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full capitalize",
                        user.status === 'pending' && "bg-amber-500/20 text-amber-500",
                        user.status === 'approved' && "bg-emerald-500/20 text-emerald-500",
                        user.status === 'rejected' && "bg-red-500/20 text-red-500"
                      )}>
                        {user.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p className="capitalize">{user.user_type}</p>
                      {user.student_teacher_id && <p>ID: {user.student_teacher_id}</p>}
                      {user.grade_level && <p>Grade: {user.grade_level}</p>}
                      {user.department && <p>Dept: {user.department}</p>}
                    </div>
                  </div>
                  
                  {user.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(user.id)}
                        disabled={processingId === user.id}
                        className="text-red-500 hover:text-red-600"
                      >
                        {processingId === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <XCircle size={14} />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(user.id)}
                        disabled={processingId === user.id}
                        className="bg-emerald-500 hover:bg-emerald-600"
                      >
                        {processingId === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle size={14} />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
