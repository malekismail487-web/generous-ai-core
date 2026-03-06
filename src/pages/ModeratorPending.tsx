import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Clock, CheckCircle, XCircle, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ModeratorPending() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');

  const checkStatus = useCallback(async () => {
    if (!user?.email) return;

    // Check moderator_requests table
    const { data } = await supabase
      .from('moderator_requests')
      .select('status, name')
      .eq('email', user.email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setName(data.name);
      if (data.status === 'approved') {
        // Check if profile exists and is active
        const { data: profile } = await supabase
          .from('profiles')
          .select('status, is_active, user_type')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.user_type === 'moderator' && profile?.is_active) {
          navigate('/moderator', { replace: true });
          return;
        }
      }
      setStatus(data.status as 'pending' | 'approved' | 'rejected');
    } else {
      setStatus('pending');
    }
    setLoading(false);
  }, [user, navigate]);

  useEffect(() => {
    if (!authLoading) checkStatus();
  }, [authLoading, checkStatus]);

  // Poll every 10 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [user, checkStatus]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    navigate('/ministry', { replace: true });
    return null;
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-black">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-gradient-to-br from-red-600 to-rose-700 shadow-lg shadow-red-900/30">
            <XCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Request Denied</h1>
          <p className="text-gray-400 mb-8">
            Your moderator application has been reviewed and was not approved. Contact the Ministry administrator for more information.
          </p>
          <Button variant="outline" onClick={() => signOut()} className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-900">
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="w-full max-w-md text-center">
        {/* Pulsing shield icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-900/30 animate-pulse">
          <Shield className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Moderator Verification Pending</h1>
        <p className="text-gray-400 mb-2">
          Your moderator application has been submitted and is awaiting Ministry approval.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          The Ministry will review your request and verify your credentials. This page auto-refreshes.
        </p>

        {/* Details card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-5 mb-6 text-left">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Clock size={16} className="text-emerald-500" />
            Application Details
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="text-gray-300">{name || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-300">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role</span>
              <span className="text-emerald-400 font-medium">Moderator</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="flex items-center gap-1 text-amber-400">
                <Clock size={12} />
                Pending Review
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={checkStatus}
            className="flex-1 gap-2 border-gray-700 text-gray-300 hover:bg-gray-900"
          >
            <RefreshCw size={16} />
            Check Status
          </Button>
          <Button
            variant="ghost"
            onClick={() => signOut()}
            className="gap-2 text-gray-500 hover:text-gray-300"
          >
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
