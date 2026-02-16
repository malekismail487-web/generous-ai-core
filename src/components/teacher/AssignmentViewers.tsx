import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Eye, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';

interface Viewer {
  user_id: string;
  viewed_at: string;
  full_name: string;
  grade_level: string | null;
}

interface AssignmentViewersProps {
  assignmentId: string;
  assignmentTitle: string;
}

export function AssignmentViewers({ assignmentId, assignmentTitle }: AssignmentViewersProps) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);

  useEffect(() => {
    if (!open) return;

    const fetchViewers = async () => {
      setLoading(true);
      
      const { data: viewsData, error: viewsError } = await supabase
        .from('assignment_views')
        .select('user_id, viewed_at')
        .eq('assignment_id', assignmentId)
        .order('viewed_at', { ascending: false });

      if (viewsError || !viewsData) {
        setLoading(false);
        return;
      }

      const userIds = viewsData.map(v => v.user_id);
      
      if (userIds.length === 0) {
        setViewers([]);
        setLoading(false);
        return;
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, grade_level')
        .in('id', userIds);

      const profileMap = new Map(
        (profilesData || []).map(p => [p.id, { full_name: p.full_name, grade_level: p.grade_level }])
      );

      const viewersWithNames: Viewer[] = viewsData.map(v => ({
        user_id: v.user_id,
        viewed_at: v.viewed_at,
        full_name: profileMap.get(v.user_id)?.full_name || t('studentWord'),
        grade_level: profileMap.get(v.user_id)?.grade_level || null,
      }));

      setViewers(viewersWithNames);
      setLoading(false);
    };

    fetchViewers();
  }, [assignmentId, open]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Eye className="w-3.5 h-3.5" />
          {t('views')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4" />
            {t('studentsWhoViewedTitle')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-1">{assignmentTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {t('loadingViewers')}
          </div>
        ) : viewers.length === 0 ? (
          <div className="py-8 text-center">
            <Eye className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">{t('noStudentsViewed')}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                {viewers.length} {t('viewedThisAssignment')}
              </p>
              {viewers.map((viewer) => (
                <div
                  key={viewer.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{viewer.full_name}</p>
                      {viewer.grade_level && (
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {getGradeName(viewer.grade_level, language)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDate(viewer.viewed_at)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
