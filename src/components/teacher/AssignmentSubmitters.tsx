import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, User, Clock, Trophy } from 'lucide-react';
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

interface Submitter {
  student_id: string;
  submitted_at: string;
  grade: number | null;
  full_name: string;
  grade_level: string | null;
}

interface AssignmentSubmittersProps {
  assignmentId: string;
  assignmentTitle: string;
  totalPoints: number;
}

export function AssignmentSubmitters({ assignmentId, assignmentTitle, totalPoints }: AssignmentSubmittersProps) {
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);

  useEffect(() => {
    if (!open) return;

    const fetchSubmitters = async () => {
      setLoading(true);
      
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select('student_id, submitted_at, grade')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });

      if (submissionsError || !submissionsData) {
        setLoading(false);
        return;
      }

      const studentIds = submissionsData.map(s => s.student_id);
      
      if (studentIds.length === 0) {
        setSubmitters([]);
        setLoading(false);
        return;
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, grade_level')
        .in('id', studentIds);

      const profileMap = new Map(
        (profilesData || []).map(p => [p.id, { full_name: p.full_name, grade_level: p.grade_level }])
      );

      const submittersWithNames: Submitter[] = submissionsData.map(s => ({
        student_id: s.student_id,
        submitted_at: s.submitted_at,
        grade: s.grade,
        full_name: profileMap.get(s.student_id)?.full_name || t('studentWord'),
        grade_level: profileMap.get(s.student_id)?.grade_level || null,
      }));

      setSubmitters(submittersWithNames);
      setLoading(false);
    };

    fetchSubmitters();
  }, [assignmentId, open]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const gradedCount = submitters.filter(s => s.grade !== null).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('solvers')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4" />
            {t('studentsWhoSolvedTitle')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-1">{assignmentTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {t('loadingSubmitters')}
          </div>
        ) : submitters.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">{t('noStudentsSolved')}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                <span>{submitters.length} {t('solvedLabel')}</span>
                <span>{gradedCount}/{submitters.length} {t('gradedCount')}</span>
              </div>
              {submitters.map((submitter) => (
                <div
                  key={submitter.student_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{submitter.full_name}</p>
                      <div className="flex items-center gap-2">
                        {submitter.grade_level && (
                          <Badge variant="outline" className="text-[10px]">
                            {getGradeName(submitter.grade_level, language)}
                          </Badge>
                        )}
                        {submitter.grade !== null && (
                          <Badge className="text-[10px] gap-1 bg-emerald-500">
                            <Trophy className="w-2.5 h-2.5" />
                            {submitter.grade}/{totalPoints}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDate(submitter.submitted_at)}
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
