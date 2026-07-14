/**
 * TenantObservatory — Super-Admin-only cross-tenant analytics view.
 *
 * Reads `get_cross_tenant_observatory()`, which returns one summary row per
 * country (schools, users, active users last 7 days, assignments last 30 days,
 * average grade). Only Super Admins can call this RPC; every other role gets
 * back an empty set by design.
 *
 * The same underlying data is also available to any signed-in user for their
 * own tenant via `get_tenant_analytics(p_tenant_id)`, which enforces isolation
 * server-side.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity, Globe2 } from 'lucide-react';

interface Row {
  tenant_id: string;
  tenant_slug: string;
  country_name: string;
  status: 'active' | 'provisioning' | 'suspended' | string;
  school_count: number;
  user_count: number;
  student_count: number;
  teacher_count: number;
  active_users_7d: number;
  assignments_30d: number;
  submissions_30d: number;
  avg_grade_30d: number;
  computed_at: string;
}

export default function TenantObservatory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_cross_tenant_observatory');
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" />
        <h3 className="font-semibold">Cross-tenant observatory</h3>
        <Badge variant="outline" className="text-[10px]">Super Admin only</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No tenants to report on yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Schools</th>
                <th className="py-2 pr-3 text-right">Users</th>
                <th className="py-2 pr-3 text-right">Students</th>
                <th className="py-2 pr-3 text-right">Teachers</th>
                <th className="py-2 pr-3 text-right">Active (7d)</th>
                <th className="py-2 pr-3 text-right">Assignments (30d)</th>
                <th className="py-2 pr-3 text-right">Submissions (30d)</th>
                <th className="py-2 pr-3 text-right">Avg grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenant_id} className="border-b border-border/20">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <Globe2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{r.country_name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{r.tenant_slug}</Badge>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={r.status === 'active' ? 'default' : r.status === 'suspended' ? 'destructive' : 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right">{r.school_count}</td>
                  <td className="py-2 pr-3 text-right">{r.user_count}</td>
                  <td className="py-2 pr-3 text-right">{r.student_count}</td>
                  <td className="py-2 pr-3 text-right">{r.teacher_count}</td>
                  <td className="py-2 pr-3 text-right">{r.active_users_7d}</td>
                  <td className="py-2 pr-3 text-right">{r.assignments_30d}</td>
                  <td className="py-2 pr-3 text-right">{r.submissions_30d}</td>
                  <td className="py-2 pr-3 text-right">{Number(r.avg_grade_30d).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
