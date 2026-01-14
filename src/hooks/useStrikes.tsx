import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSchool } from './useSchool';
import { useToast } from './use-toast';

export interface Strike {
  id: string;
  user_id: string;
  school_id: string;
  reason: string;
  issued_by: string;
  created_at: string;
  is_active: boolean;
}

export function useStrikes() {
  const [myStrikes, setMyStrikes] = useState<Strike[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  // Fetch user's own strikes
  const fetchMyStrikes = useCallback(async () => {
    if (!user) {
      setMyStrikes([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_strikes')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching strikes:', error);
    } else {
      setMyStrikes(data || []);
    }
    setLoading(false);
  }, [user]);

  // Issue a strike (for admins)
  const issueStrike = useCallback(async (targetUserId: string, reason: string) => {
    if (!user || !school) return false;

    const { error } = await supabase
      .from('user_strikes')
      .insert({
        user_id: targetUserId,
        school_id: school.id,
        reason,
        issued_by: user.id,
      });

    if (error) {
      console.error('Error issuing strike:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to issue strike',
      });
      return false;
    }

    toast({
      title: 'Strike issued',
      description: 'The user has been warned',
    });
    return true;
  }, [user, school, toast]);

  // Get strike count for a user
  const getStrikeCount = useCallback(() => {
    return myStrikes.filter(s => s.is_active).length;
  }, [myStrikes]);

  // Check if user is suspended (2+ strikes)
  const isSuspended = useCallback(() => {
    return getStrikeCount() >= 2;
  }, [getStrikeCount]);

  // Check if user is bricked (3+ strikes)
  const isBricked = useCallback(() => {
    return getStrikeCount() >= 3;
  }, [getStrikeCount]);

  useEffect(() => {
    fetchMyStrikes();
  }, [fetchMyStrikes]);

  return {
    myStrikes,
    loading,
    issueStrike,
    getStrikeCount,
    isSuspended,
    isBricked,
    refresh: fetchMyStrikes,
  };
}
