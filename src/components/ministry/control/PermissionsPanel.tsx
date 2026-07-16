import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useMinistryControl, type MinistryRole, type RoleAssignment,
} from '@/hooks/useMinistryControl';

const ROLES: Array<{ id: MinistryRole; label: string; blurb: string }> = [
  { id: 'minister', label: 'Minister', blurb: 'All capabilities' },
  { id: 'deputy_minister', label: 'Deputy Minister', blurb: 'All except assigning permissions' },
  { id: 'curriculum_officer', label: 'Curriculum Officer', blurb: 'Draft & review curriculum' },
  { id: 'regional_supervisor', label: 'Regional Supervisor', blurb: 'Schools + regions (draft)' },
  { id: 'ministry_admin', label: 'Ministry Admin', blurb: 'User governance + communications' },
  { id: 'viewer', label: 'Viewer', blurb: 'Audit read only' },
];

interface CapabilityRow { role: MinistryRole; capability: string }

export function PermissionsPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<MinistryRole>('curriculum_officer');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.listRoleAssignments(),
        supabase.from('ministry_capabilities').select('role, capability').order('role'),
      ]);
      setAssignments(a);
      setCapabilities((c.data ?? []) as CapabilityRow[]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = api.token;
      if (!token) return;
      const { data } = await supabase
        .from('ministry_sessions')
        .select('tenant_id')
        .eq('session_token', token)
        .maybeSingle();
      if (!cancelled && data?.tenant_id) setTenantId(data.tenant_id);
    })();
    return () => { cancelled = true; };
  }, [api.token]);

  const assign = async () => {
    if (!tenantId) {
      toast({ variant: 'destructive', title: 'Ministry session has no tenant' });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(userId.trim())) {
      toast({ variant: 'destructive', title: 'Enter a valid user UUID' });
      return;
    }
    setSaving(true);
    try {
      await api.assignRole(tenantId, userId.trim(), role);
      toast({ title: 'Role assigned' });
      setUserId('');
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Assign failed', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this role assignment?')) return;
    try {
      await api.revokeRole(id);
      toast({ title: 'Role revoked' });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Revoke failed', description: (e as Error).message });
    }
  };

  const capsByRole = capabilities.reduce<Record<string, string[]>>((acc, row) => {
    (acc[row.role] ||= []).push(row.capability);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <section className="bg-gray-900/40 border border-gray-800 rounded-lg p-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Assign role</p>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] items-end">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">User ID (auth.uid)</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="bg-gray-900 border-gray-800 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MinistryRole)}>
              <SelectTrigger className="bg-gray-900 border-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={assign} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-1.5" /> Assign</>}
          </Button>
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Active assignments</p>
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-500">User ID</TableHead>
                <TableHead className="text-gray-500">Role</TableHead>
                <TableHead className="text-gray-500">Assigned</TableHead>
                <TableHead className="text-gray-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" />
                </TableCell></TableRow>
              )}
              {!loading && assignments.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-gray-600 py-8">
                  No named ministry role assignments yet. The active ministry session
                  currently acts as Minister for this tenant (bootstrap).
                </TableCell></TableRow>
              )}
              {!loading && assignments.map((a) => (
                <TableRow key={a.id} className="border-gray-800/50">
                  <TableCell className="font-mono text-[11px] text-gray-300">{a.user_id}</TableCell>
                  <TableCell className="text-emerald-300 text-sm">{a.role}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-800/50 text-red-300"
                      onClick={() => revoke(a.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Capability matrix</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.id} className="border border-gray-800 rounded-lg p-3 bg-gray-950">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-gray-200">{r.label}</p>
                <p className="text-[10px] text-gray-600">{r.blurb}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(capsByRole[r.id] ?? []).map((cap) => (
                  <span key={cap} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800 text-gray-400">
                    {cap}
                  </span>
                ))}
                {(capsByRole[r.id] ?? []).length === 0 && (
                  <span className="text-[10px] text-gray-600">no capabilities</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
