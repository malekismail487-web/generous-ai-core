import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Loader2, Trophy, TrendingUp, Calendar, File, ExternalLink, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

  const getFileExtension = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    return ext;
  };

  const isImageFile = (url: string) => {
    const ext = getFileExtension(url);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
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
        <p className="text-muted-foreground">
          Your report cards will appear here once they are created by your school admin
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="w-5 h-5" />
        My Report Cards
      </h2>

      {/* Term Selector */}
      <div className="flex gap-2 flex-wrap">
        {reportCards.map((rc) => (
          <button
            key={rc.id}
            onClick={() => setSelectedReport(rc)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              selectedReport?.id === rc.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {isFileReport(rc) && <File className="w-3 h-3" />}
            {rc.term}
          </button>
        ))}
      </div>

      {selectedReport && (
        <>
          {isFileReport(selectedReport) ? (
            // File-based report card view
            <div className="glass-effect rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <File className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{selectedReport.term} Report Card</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(selectedReport.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {isImageFile(selectedReport.file_url!) ? (
                // Display image directly
                <div className="rounded-lg overflow-hidden border">
                  <img 
                    src={selectedReport.file_url!} 
                    alt={`${selectedReport.term} Report Card`}
                    className="w-full h-auto"
                  />
                </div>
              ) : (
                // Show file preview/download options
                <div className="border rounded-lg p-6 text-center bg-muted/30">
                  <File className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    Report card file uploaded by your school admin
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button asChild>
                      <a href={selectedReport.file_url!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View File
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={selectedReport.file_url!} download>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Manual entry report card view
            <>
              {/* Overall Grade Card */}
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

              {/* Subject Breakdown */}
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
                            <span className="text-muted-foreground">
                              {score.score}/{score.maxScore}
                            </span>
                            <Badge variant="outline" className={getGradeColor(percentage)}>
                              {percentage}%
                            </Badge>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Comments */}
              {selectedReport.comments && (
                <div className="glass-effect rounded-xl p-5">
                  <h3 className="font-semibold mb-2">Teacher Comments</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {selectedReport.comments}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
