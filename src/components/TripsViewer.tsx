import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { MapPin, CheckCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Trip {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export function TripsViewer() {
  const { user } = useAuth();
  const { school } = useRoleGuard();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!school || !user) return;
    setLoading(true);

    const [{ data: tripData }, { data: readsData }] = await Promise.all([
      supabase
        .from('trips')
        .select('*')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('trip_reads')
        .select('trip_id')
        .eq('user_id', user.id),
    ]);

    setTrips((tripData || []) as Trip[]);
    setReadIds(new Set((readsData || []).map((r: { trip_id: string }) => r.trip_id)));
    setLoading(false);
  }, [school, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-mark as read
  useEffect(() => {
    if (!user || trips.length === 0) return;
    const unread = trips.filter(t => !readIds.has(t.id));
    if (unread.length === 0) return;

    const markRead = async () => {
      const inserts = unread.map(t => ({
        trip_id: t.id,
        user_id: user.id,
      }));
      await supabase.from('trip_reads').upsert(inserts, { onConflict: 'trip_id,user_id' });
      setReadIds(prev => {
        const next = new Set(prev);
        unread.forEach(t => next.add(t.id));
        return next;
      });
    };
    markRead();
  }, [trips, readIds, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="glass-effect rounded-2xl p-8 text-center">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">{t('noTripsYet')}</h3>
            <p className="text-sm text-muted-foreground">{t('tripsWillAppear')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {trips.map((trip) => (
          <div key={trip.id} className="glass-effect rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">{trip.title}</h3>
                  {readIds.has(trip.id) && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {language === 'ar' ? 'مقروء' : 'Read'}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {new Date(trip.created_at).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{trip.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
