import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, TeacherRequest } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { apiLogger } from '@/lib/logger';

export function useAdminPanel() {
  const [pendingRequests, setPendingRequests] = useState<TeacherRequest[]>([]);
  const [allRequests, setAllRequests] = useState<TeacherRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { isSchoolAdmin } = useUserRole();
  const { toast } = useToast();

  // Fetch all teacher requests (admin only)
  const fetchRequests = useCallback(async () => {
    if (!isSchoolAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('teacher_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      apiLogger.error('Error fetching requests', error);
    } else {
      const requests = (data || []) as TeacherRequest[];
      setAllRequests(requests);
      setPendingRequests(requests.filter(r => r.status === 'pending'));
    }
    setLoading(false);
  }, [isSchoolAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Approve a teacher request
  const approveRequest = useCallback(async (requestId: string, _userId: string, adminNotes?: string) => {
    if (!isSchoolAdmin) return false;

    const { error } = await supabase.rpc('approve_teacher_request' as never, {
      p_request_id: requestId,
      p_admin_notes: adminNotes || null,
    } as never);

    if (error) {
      apiLogger.error('Error approving teacher request', error);
      toast({ variant: 'destructive', title: 'Unable to approve request' });
      return false;
    }

    toast({ title: 'Teacher request approved!' });
    fetchRequests();
    return true;
  }, [isSchoolAdmin, toast, fetchRequests]);

  // Reject a teacher request
  const rejectRequest = useCallback(async (requestId: string, adminNotes?: string) => {
    if (!isSchoolAdmin) return false;

    const { error } = await supabase.rpc('reject_teacher_request' as never, {
      p_request_id: requestId,
      p_admin_notes: adminNotes || null,
    } as never);

    if (error) {
      apiLogger.error('Error rejecting teacher request', error);
      toast({ variant: 'destructive', title: 'Error rejecting request' });
      return false;
    }

    toast({ title: 'Request rejected' });
    fetchRequests();
    return true;
  }, [isSchoolAdmin, toast, fetchRequests]);

  return {
    pendingRequests,
    allRequests,
    loading,
    approveRequest,
    rejectRequest,
    refresh: fetchRequests
  };
}
