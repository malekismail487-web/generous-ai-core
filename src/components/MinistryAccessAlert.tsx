import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Shield, CheckCircle, Ban, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

type MinistryRequest = {
  id: string;
  session_token: string;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  status: string;
  created_at: string;
};

export default function MinistryAccessAlert() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<MinistryRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (!isSuperAdmin) return;

    // Fetch existing pending requests
    const fetchPending = async () => {
      const { data } = await supabase
        .from('ministry_access_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      const pending = (data || []) as MinistryRequest[];
      setRequests(pending);
      if (pending.length > 0) setVisible(true);
    };

    fetchPending();

    // Real-time subscription for new requests
    const channel = supabase
      .channel('ministry-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ministry_access_requests',
          filter: 'status=eq.pending'
        },
        (payload) => {
          const newReq = payload.new as MinistryRequest;
          setRequests(prev => [newReq, ...prev]);
          setVisible(true);
          
          // Audio alert
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.3;
            osc.start();
            setTimeout(() => { osc.frequency.value = 1000; }, 200);
            setTimeout(() => { osc.frequency.value = 800; }, 400);
            setTimeout(() => { osc.stop(); ctx.close(); }, 600);
          } catch {}
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isSuperAdmin]);

  const handleAction = async (requestId: string, action: 'approve' | 'deny') => {
    setActionLoading(requestId);

    const { data, error } = await supabase.rpc('resolve_ministry_request', {
      p_request_id: requestId,
      p_action: action
    });

    const result = data as { success: boolean; action?: string; ip_banned?: string; error?: string } | null;

    if (error || !result?.success) {
      toast({ variant: 'destructive', title: result?.error || 'Failed to process request' });
    } else {
      if (action === 'approve') {
        toast({ title: '✅ Ministry access granted' });
      } else {
        toast({ 
          variant: 'destructive', 
          title: '🚫 Access denied & IP banned',
          description: `IP ${result.ip_banned || 'unknown'} has been permanently banned`
        });
      }
      setRequests(prev => prev.filter(r => r.id !== requestId));
    }

    setActionLoading(null);
    if (requests.length <= 1) setVisible(false);
  };

  if (!isSuperAdmin || !visible || requests.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-right duration-500">
      <div className="w-96 bg-red-950 border-2 border-red-500 rounded-2xl shadow-2xl shadow-red-500/20 overflow-hidden">
        {/* Header */}
        <div className="bg-red-900/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
            <span className="font-bold text-red-200 text-sm">⚠️ MINISTRY ACCESS ALERT</span>
          </div>
          <button onClick={() => setVisible(false)} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Requests */}
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {requests.map((req) => (
            <div key={req.id} className="bg-black/40 rounded-xl p-4 border border-red-800/50 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                <span className="text-red-200 text-xs font-mono">Ministry Login Attempt</span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">IP Address:</span>
                  <span className="text-red-300 font-mono">{req.ip_address || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time:</span>
                  <span className="text-red-300">{new Date(req.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Device:</span>
                  <span className="text-red-300 truncate ml-2 max-w-[180px]">
                    {req.device_fingerprint?.slice(0, 20) || 'Unknown'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAction(req.id, 'approve')}
                  disabled={actionLoading === req.id}
                  className="flex-1 bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400 border border-emerald-700/30 gap-1"
                >
                  {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAction(req.id, 'deny')}
                  disabled={actionLoading === req.id}
                  className="flex-1 bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-700/30 gap-1"
                >
                  {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                  Deny & Ban IP
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 bg-red-950/80 border-t border-red-800/30">
          <p className="text-[10px] text-red-700 text-center">
            DENY will permanently ban the IP address from all ministry access
          </p>
        </div>
      </div>
    </div>
  );
}
