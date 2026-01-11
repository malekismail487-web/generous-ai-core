import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, TeacherRequest } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';

export function useAdminPanel() {
  const [pendingRequests, setPendingRequests] = useState<TeacherRequest[]>([]);
  const [allRequests, setAllRequests] = useState<TeacherRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useUserRole();
  const { toast } = useToast();

  // Fetch all teacher requests (admin only)
  const fetchRequests = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('teacher_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching requests:', error);
    } else {
      const requests = (data || []) as TeacherRequest[];
      setAllRequests(requests);
      setPendingRequests(requests.filter(r => r.status === 'pending'));
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Approve a teacher request
  const approveRequest = useCallback(async (requestId: string, userId: string, adminNotes?: string) => {
    if (!isAdmin) return false;

    // Update request status
    const { error: updateError } = await supabase
      .from('teacher_requests')
      .update({ 
        status: 'approved',
        admin_notes: adminNotes || null
      })
      .eq('id', requestId);

    if (updateError) {
      toast({ variant: 'destructive', title: 'Error updating request' });
      return false;
    }

    // Add teacher role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'teacher'
      });

    if (roleError) {
      toast({ variant: 'destructive', title: 'Error assigning role' });
      return false;
    }

    toast({ title: 'Teacher request approved!' });
    fetchRequests();
    return true;
  }, [isAdmin, toast, fetchRequests]);

  // Reject a teacher request
  const rejectRequest = useCallback(async (requestId: string, adminNotes?: string) => {
    if (!isAdmin) return false;

    const { error } = await supabase
      .from('teacher_requests')
      .update({ 
        status: 'rejected',
        admin_notes: adminNotes || null
      })
      .eq('id', requestId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error rejecting request' });
      return false;
    }

    toast({ title: 'Request rejected' });
    fetchRequests();
    return true;
  }, [isAdmin, toast, fetchRequests]);

  // Remove teacher role
  const removeTeacherRole = useCallback(async (userId: string) => {
    if (!isAdmin) return false;

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', 'teacher');

    if (error) {
      toast({ variant: 'destructive', title: 'Error removing role' });
      return false;
    }

    toast({ title: 'Teacher role removed' });
    return true;
  }, [isAdmin, toast]);

  return {
    pendingRequests,
    allRequests,
    loading,
    approveRequest,
    rejectRequest,
    removeTeacherRole,
    refresh: fetchRequests
  };
}
