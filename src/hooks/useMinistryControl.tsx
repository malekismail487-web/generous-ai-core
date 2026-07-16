import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Read the current ministry session token from sessionStorage. */
export function getMinistrySessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('ministry_session_token');
}

export type MinistryRole =
  | 'minister'
  | 'deputy_minister'
  | 'curriculum_officer'
  | 'regional_supervisor'
  | 'ministry_admin'
  | 'viewer';

export type ChangeStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'withdrawn';

export interface ChangeRequest {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  previous_snapshot: Record<string, unknown> | null;
  status: ChangeStatus;
  author_label: string | null;
  reviewer_label: string | null;
  publisher_label: string | null;
  review_notes: string | null;
  reject_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  tenant_id: string | null;
  actor_label: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RoleAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  role: MinistryRole;
  created_at: string;
}

/**
 * Draft & Publish + Permissions API surface for the Ministry Control Center.
 * All calls route through security-definer RPCs that accept the ministry
 * session token so the anonymous ministry portal works without a Supabase
 * auth session.
 */
export function useMinistryControl() {
  const [token, setToken] = useState<string | null>(() => getMinistrySessionToken());

  useEffect(() => {
    const sync = () => setToken(getMinistrySessionToken());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const listChangeRequests = useCallback(
    async (status?: ChangeStatus): Promise<ChangeRequest[]> => {
      const { data, error } = await supabase.rpc('list_change_requests', {
        p_status: status ?? null,
        p_session_token: token,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as ChangeRequest[];
    },
    [token],
  );

  const submitChangeRequest = useCallback(
    async (args: {
      tenantId: string;
      entityType: string;
      entityId?: string | null;
      title: string;
      summary?: string;
      payload: Record<string, unknown>;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('submit_change_request', {
        p_tenant_id: args.tenantId,
        p_entity_type: args.entityType,
        p_entity_id: args.entityId ?? null,
        p_title: args.title,
        p_summary: args.summary ?? null,
        p_payload: args.payload as any,
        p_session_token: token,
        p_author_label: 'Ministry Session',
      });
      if (error) throw error;
      return data as string;
    },
    [token],
  );

  const reviewChangeRequest = useCallback(
    async (id: string, decision: 'approve' | 'reject', notes?: string) => {
      const { error } = await supabase.rpc('review_change_request', {
        p_request_id: id,
        p_decision: decision,
        p_notes: notes ?? null,
        p_session_token: token,
        p_reviewer_label: 'Ministry Session',
      });
      if (error) throw error;
    },
    [token],
  );

  const publishChangeRequest = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.rpc('publish_change_request', {
        p_request_id: id,
        p_session_token: token,
        p_publisher_label: 'Ministry Session',
      });
      if (error) throw error;
      return data;
    },
    [token],
  );

  const withdrawChangeRequest = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('withdraw_change_request', {
        p_request_id: id,
        p_session_token: token,
        p_actor_label: 'Ministry Session',
      });
      if (error) throw error;
    },
    [token],
  );

  const listAudit = useCallback(async (): Promise<AuditEntry[]> => {
    const { data, error } = await supabase.rpc('list_ministry_audit', {
      p_session_token: token,
      p_limit: 200,
    });
    if (error) throw error;
    return (data ?? []) as AuditEntry[];
  }, [token]);

  const listRoleAssignments = useCallback(async (): Promise<RoleAssignment[]> => {
    const { data, error } = await supabase.rpc('list_ministry_role_assignments', {
      p_session_token: token,
    });
    if (error) throw error;
    return (data ?? []) as RoleAssignment[];
  }, [token]);

  const assignRole = useCallback(
    async (tenantId: string, userId: string, role: MinistryRole) => {
      const { error } = await supabase.rpc('assign_ministry_role', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_role: role,
        p_session_token: token,
        p_actor_label: 'Ministry Session',
      });
      if (error) throw error;
    },
    [token],
  );

  const revokeRole = useCallback(
    async (assignmentId: string) => {
      const { error } = await supabase.rpc('revoke_ministry_role', {
        p_assignment_id: assignmentId,
        p_session_token: token,
        p_actor_label: 'Ministry Session',
      });
      if (error) throw error;
    },
    [token],
  );

  return {
    token,
    listChangeRequests,
    submitChangeRequest,
    reviewChangeRequest,
    publishChangeRequest,
    withdrawChangeRequest,
    listAudit,
    listRoleAssignments,
    assignRole,
    revokeRole,
  };
}
