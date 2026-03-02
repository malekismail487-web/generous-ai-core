import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Loader2, ShieldOff } from 'lucide-react';

export default function MinistryPending() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'denied'>('pending');
  const sessionToken = sessionStorage.getItem('ministry_pending_token');

  useEffect(() => {
    if (!sessionToken) {
      navigate('/auth');
      return;
    }

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('ministry_access_requests')
        .select('status')
        .eq('session_token', sessionToken)
        .maybeSingle();

      const row = data as { status: string } | null;
      if (row?.status === 'approved') {
        sessionStorage.setItem('ministry_session_token', sessionToken);
        sessionStorage.removeItem('ministry_pending_token');
        clearInterval(interval);
        navigate('/ministry-dashboard');
      } else if (row?.status === 'denied') {
        setStatus('denied');
        sessionStorage.removeItem('ministry_pending_token');
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionToken, navigate]);

  if (status === 'denied') {
    return (
      <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-950/50 border-2 border-red-800 flex items-center justify-center">
            <ShieldOff className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-red-500 tracking-tight">ACCESS TERMINATED</h1>
          <div className="w-16 h-0.5 bg-red-800 mx-auto" />
          <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
            Your IP address and device have been permanently banned from accessing this portal.
            All activity has been logged and reported.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-amber-950/30 border border-amber-700/50 flex items-center justify-center">
          <Lock className="w-10 h-10 text-amber-500 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold text-amber-400">Verification Pending</h1>
        <p className="text-gray-400 text-sm">
          Your access request has been submitted. The system administrator has been notified
          and must manually verify your identity before access is granted.
        </p>
        <div className="flex items-center justify-center gap-2 text-amber-500/70">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Waiting for administrator approval...</span>
        </div>
        <div className="pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Do not close this window. Your session will expire if not approved.
          </p>
        </div>
      </div>
    </div>
  );
}
