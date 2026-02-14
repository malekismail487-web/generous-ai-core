import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Ban, Trash2, CheckCircle, Loader2, Monitor } from 'lucide-react';

type AttackLog = {
  id: string;
  device_fingerprint: string;
  user_agent: string | null;
  attempt_count: number;
  status: string;
  resolved_action: string | null;
  created_at: string;
  resolved_at: string | null;
};

export default function AttackLogsPanel() {
  const [logs, setLogs] = useState<AttackLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('super_admin_attack_logs')
      .select('*')
      .order('created_at', { ascending: false });
    setLogs((data as AttackLog[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleAction = async (log: AttackLog, action: 'block_device' | 'dismiss') => {
    setActionLoading(log.id);

    if (action === 'block_device') {
      // Permanently block the device
      await supabase
        .from('super_admin_attack_attempts')
        .update({ permanently_blocked: true, updated_at: new Date().toISOString() })
        .eq('device_fingerprint', log.device_fingerprint);
    }

    // Update log status
    await supabase
      .from('super_admin_attack_logs')
      .update({
        status: 'resolved',
        resolved_action: action === 'block_device' ? 'permanently_blocked' : 'dismissed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', log.id);

    setActionLoading(null);
    fetchLogs();
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return 'Unknown Device';
    if (ua.includes('Mobile')) return '📱 Mobile Device';
    if (ua.includes('Windows')) return '💻 Windows PC';
    if (ua.includes('Mac')) return '💻 Mac';
    if (ua.includes('Linux')) return '💻 Linux PC';
    return '💻 Desktop';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="glass-effect rounded-2xl p-6 text-center">
        <Shield className="w-10 h-10 mx-auto mb-3 text-green-500" />
        <h3 className="font-semibold mb-1">No Attack Attempts</h3>
        <p className="text-sm text-muted-foreground">Your account is secure. No suspicious activity detected.</p>
      </div>
    );
  }

  const unreviewed = logs.filter(l => l.status === 'unreviewed');
  const resolved = logs.filter(l => l.status !== 'unreviewed');

  return (
    <div className="space-y-4">
      {unreviewed.length > 0 && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
          <div className="flex items-center gap-2 text-destructive mb-3">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold">{unreviewed.length} Unreviewed Attack{unreviewed.length > 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-3">
            {unreviewed.map((log) => (
              <div key={log.id} className="glass-effect rounded-xl p-4 border border-destructive/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Monitor className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{parseUserAgent(log.user_agent)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {log.attempt_count} failed attempts • {new Date(log.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[200px]">
                      Device: {log.device_fingerprint.slice(0, 20)}...
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleAction(log, 'block_device')}
                      disabled={actionLoading === log.id}
                      className="gap-1"
                    >
                      <Ban className="w-3 h-3" />
                      Block Device
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(log, 'dismiss')}
                      disabled={actionLoading === log.id}
                      className="gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Resolved</h4>
          {resolved.map((log) => (
            <div key={log.id} className="glass-effect rounded-xl p-3 opacity-70">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{parseUserAgent(log.user_agent)}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {log.attempt_count} attempts • {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  log.resolved_action === 'permanently_blocked'
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {log.resolved_action === 'permanently_blocked' ? '🚫 Blocked' : '✓ Dismissed'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
