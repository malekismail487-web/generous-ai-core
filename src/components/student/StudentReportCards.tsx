import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Loader2, Trophy, TrendingUp, Calendar, File, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MaterialViewer } from '@/components/MaterialViewer';

interface SubjectScore {
  subject: string;
  score: number;
  maxScore: number;
}

interface ReportCard {
  id: string;
  term: string;
  scores_json: SubjectScore[];
  average: number | null;
  comments: string | null;
  file_url: string | null;
  created_at: string;
}

interface StudentReportCardsProps {
  studentId: string;
}

export function StudentReportCards({ studentId }: StudentReportCardsProps) {
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportCard | null>(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);

  useEffect(() => {
    const fetchReportCards = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('report_cards')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const typedData = data.map((rc: any) => ({
          ...rc,
          scores_json: rc.scores_json as SubjectScore[],
          file_url: rc.file_url || null
        })) as ReportCard[];
        setReportCards(typedData);
        if (typedData.length > 0) {
          setSelectedReport(typedData[0]);
        }
      }
      setLoading(false);
    };
    fetchReportCards();
  }, [studentId]);

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-emerald-500';
    if (percentage >= 80) return 'text-blue-500';
    if (percentage >= 70) return 'text-amber-500';
    if (percentage >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  const getGradeLetter = (percentage: number) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'B+';
    if (percentage >= 75) return 'B';
    if (percentage >= 70) return 'C+';
    if (percentage >= 65) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  const isFileReport = (report: ReportCard) => {
    return report.file_url && (!report.scores_json || report.scores_json.length === 0);
  };

  const openFileViewer = (report: ReportCard) => {
    setSelectedReport(report);
    setFileViewerOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (reportCards.length === 0) {
    return (
      <div className="glass-effect rounded-xl p-8 text-center">
        <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold mb-2">No Report Cards Yet</h3>
        <p className="text-muted-foreground">Your report cards will appear here once they are created by your school admin</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
    <div className="space-y-6 pb-24">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="w-5 h-5" />
        My Report Cards
      </h2>

      {/* Term Selector */}
      <div className="flex gap-2 flex-wrap">
        {reportCards.map((rc) => (
          <button
            key={rc.id}
            onClick={() => {
              if (isFileReport(rc)) {
                openFileViewer(rc);
              } else {
                setSelectedReport(rc);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              !isFileReport(rc) && selectedReport?.id === rc.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {isFileReport(rc) && <File className="w-3 h-3" />}
            {rc.term}
            {isFileReport(rc) && (
              <Eye className="w-3 h-3 ml-1" />
            )}
          </button>
        ))}
      </div>

      {/* Manual report card display */}
      {selectedReport && !isFileReport(selectedReport) && (
        <>
          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall Average - {selectedReport.term}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center">
                    <Trophy className={`w-8 h-8 ${getGradeColor(selectedReport.average || 0)}`} />
                  </div>
                  <div>
                    <div className={`text-4xl font-bold ${getGradeColor(selectedReport.average || 0)}`}>
                      {selectedReport.average || 0}%
                    </div>
                    <Badge className="mt-1">{getGradeLetter(selectedReport.average || 0)}</Badge>
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(selectedReport.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="glass-effect rounded-xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Subject Breakdown
            </h3>
            <div className="space-y-4">
              {selectedReport.scores_json.map((score) => {
                const percentage = score.maxScore > 0 ? Math.round((score.score / score.maxScore) * 100) : 0;
                return (
                  <div key={score.subject} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{score.subject}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{score.score}/{score.maxScore}</span>
                        <Badge variant="outline" className={getGradeColor(percentage)}>{percentage}%</Badge>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </div>

          {selectedReport.comments && (
            <div className="glass-effect rounded-xl p-5">
              <h3 className="font-semibold mb-2">Teacher Comments</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedReport.comments}</p>
            </div>
          )}
        </>
      )}

      {/* Full-page Material Viewer */}
      <MaterialViewer
        open={fileViewerOpen}
        onOpenChange={setFileViewerOpen}
        material={selectedReport ? {
          id: selectedReport.id,
          title: `${selectedReport.term} Report Card`,
          subject: 'Report Card',
          content: null,
          file_url: selectedReport.file_url,
          created_at: selectedReport.created_at,
        } : null}
        subjectInfo={{ name: 'Report Card', emoji: '📊', color: 'from-primary to-accent' }}
        teacherName="School Admin"
      />
    </div>
    </ScrollArea>
  );
}
