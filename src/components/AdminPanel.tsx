import { useState } from 'react';
import { ArrowLeft, Shield, CheckCircle, XCircle, Clock, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminPanel } from '@/hooks/useAdminPanel';
import { useUserRole, TeacherRequest } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';

interface AdminPanelProps {
  onBack: () => void;
}

export function AdminPanel({ onBack }: AdminPanelProps) {
  const { isAdmin } = useUserRole();
  const { pendingRequests, allRequests, loading, approveRequest, rejectRequest } = useAdminPanel();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You need admin privileges to access this panel.</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft size={16} className="mr-1" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handleApprove = async (request: TeacherRequest) => {
    setProcessingId(request.id);
    await approveRequest(request.id, request.user_id);
    setProcessingId(null);
  };

  const handleReject = async (request: TeacherRequest) => {
    setProcessingId(request.id);
    await rejectRequest(request.id);
    setProcessingId(null);
  };

  const displayedRequests = filter === 'pending' ? pendingRequests : allRequests;

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
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">Manage teacher access requests</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{pendingRequests.length}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-primary">{allRequests.length}</div>
            <div className="text-xs text-muted-foreground">Total Requests</div>
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
            Pending ({pendingRequests.length})
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
            All Requests
          </button>
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : displayedRequests.length === 0 ? (
          <div className="glass-effect rounded-2xl p-8 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No requests</h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'pending' ? 'No pending teacher requests' : 'No teacher requests yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedRequests.map((request) => (
              <div key={request.id} className="glass-effect rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    request.status === 'pending' && "bg-amber-500/20 text-amber-500",
                    request.status === 'approved' && "bg-emerald-500/20 text-emerald-500",
                    request.status === 'rejected' && "bg-red-500/20 text-red-500"
                  )}>
                    {request.status === 'pending' && <Clock size={16} />}
                    {request.status === 'approved' && <CheckCircle size={16} />}
                    {request.status === 'rejected' && <XCircle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground truncate">
                        {request.user_id.slice(0, 8)}...
                      </span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        request.status === 'pending' && "bg-amber-500/20 text-amber-500",
                        request.status === 'approved' && "bg-emerald-500/20 text-emerald-500",
                        request.status === 'rejected' && "bg-red-500/20 text-red-500"
                      )}>
                        {request.status}
                      </span>
                    </div>
                    {request.reason && (
                      <p className="text-sm text-foreground mb-2">"{request.reason}"</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  
                  {request.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(request)}
                        disabled={processingId === request.id}
                        className="text-red-500 hover:text-red-600"
                      >
                        {processingId === request.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <XCircle size={14} />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request)}
                        disabled={processingId === request.id}
                        className="bg-emerald-500 hover:bg-emerald-600"
                      >
                        {processingId === request.id ? (
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
