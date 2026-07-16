import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useMinistryControl, type RoleAssignment } from '@/hooks/useMinistryControl';
import { DraftChangeButton } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

/**
 * MC6 — User Governance
 *
 * Ministry-side view of named ministry role assignments. Assignments themselves
 * live in `ministry_role_assignments` (introduced in MC2). This panel exposes
 * the *governance* path: proposed role changes go through Draft → Review →
 * Publish so audit trail captures who assigned what and why. The direct
 * assignment surface still exists in the Permissions panel for immediate
 * super-admin bootstrap.
 */
export function UsersPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listRoleAssignments();
      setItems(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">Ministry personnel</p>
          <p className="text-xs text-gray-500">Named role holders for this tenant. Teachers and school administrators are governed by their schools; only ministry-level roles appear here.</p>
        </div>
        <DraftChangeButton
          entityType="user.role_assign"
          buttonLabel="Draft role change"
          dialogTitle="Draft ministry role change"
          buildTitle={(v) => `Role ${v.action}: ${v.role}`}
          buildPayload={(v) => ({
            user_id: v.user_id,
            role: v.role,
            action: v.action || 'assign',
          })}
          fields={[
            { key: 'user_id', label: 'User ID (auth.uid)', required: true,
              placeholder: '00000000-0000-0000-0000-000000000000' },
            { key: 'role', label: 'Role', required: true, default: 'curriculum_officer',
              help: 'minister | deputy_minister | curriculum_officer | regional_supervisor | ministry_admin | viewer' },
            { key: 'action', label: 'Action', default: 'assign', help: 'assign | revoke' },
          ]}
          onSubmitted={load}
        />
      </div>
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">User ID</TableHead>
              <TableHead className="text-gray-500">Role</TableHead>
              <TableHead className="text-gray-500">Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={3} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-gray-600 py-6">No named ministry personnel yet. Session-token operators act as Minister by default.</TableCell></TableRow>}
            {items.map((r) => (
              <TableRow key={r.id} className="border-gray-800/50">
                <TableCell className="font-mono text-[11px] text-gray-300">{r.user_id}</TableCell>
                <TableCell className="text-emerald-300">{r.role}</TableCell>
                <TableCell className="text-gray-500 text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
