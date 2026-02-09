import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Loader2, Trophy, TrendingUp, Calendar, File, Download, Eye, ZoomIn, ZoomOut, Maximize2, Minimize2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

type FileType = 'pdf' | 'image' | 'video' | 'unknown';

function getFileType(url: string | null): FileType {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
  if (lower.match(/\.(mp4|webm|ogg|mov)$/i)) return 'video';
  return 'unknown';
}

export function StudentReportCards({ studentId }: StudentReportCardsProps) {
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportCard | null>(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [viewerError, setViewerError] = useState(false);

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
    setImageZoom(1);
    setViewerError(false);
    setIsFullscreen(false);
    setFileViewerOpen(true);
  };

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'report-card';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderFileViewer = (fileUrl: string) => {
    if (viewerError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Unable to preview this file</h3>
          <p className="text-sm text-muted-foreground mb-4">This file format cannot be displayed in the browser.</p>
          <Button onClick={() => handleDownload(fileUrl)} className="gap-2">
            <Download className="w-4 h-4" />
            Download File
          </Button>
        </div>
      );
    }

    const fileType = getFileType(fileUrl);

    switch (fileType) {
      case 'pdf':
        return (
          <div className={cn("w-full bg-muted rounded-lg overflow-hidden", isFullscreen ? "h-[85vh]" : "h-[60vh]")}>
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-full border-0"
              title="Report Card"
              onError={() => setViewerError(true)}
            />
          </div>
        );
      case 'image':
        return (
          <div className={cn("w-full flex items-center justify-center bg-muted/50 rounded-lg overflow-hidden relative", isFullscreen ? "h-[85vh]" : "h-[60vh]")}>
            <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))} disabled={imageZoom <= 0.5}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="flex items-center px-2 text-xs font-medium">{Math.round(imageZoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} disabled={imageZoom >= 3}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
              <img src={fileUrl} alt="Report Card" className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `scale(${imageZoom})` }} onError={() => setViewerError(true)} />
            </div>
          </div>
        );
      case 'video':
        return (
          <div className={cn("w-full bg-black rounded-lg overflow-hidden", isFullscreen ? "h-[85vh]" : "h-[60vh]")}>
            <video src={fileUrl} controls className="w-full h-full" onError={() => setViewerError(true)}>
              Your browser does not support video playback.
            </video>
          </div>
        );
      default:
        return (
          <div className={cn("w-full bg-muted rounded-lg overflow-hidden", isFullscreen ? "h-[85vh]" : "h-[60vh]")}>
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
              className="w-full h-full border-0"
              title="Report Card"
              onError={() => setViewerError(true)}
            />
          </div>
        );
    }
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

      {/* In-App File Viewer Dialog */}
      <Dialog open={fileViewerOpen} onOpenChange={(open) => { setFileViewerOpen(open); if (!open) { setImageZoom(1); setViewerError(false); setIsFullscreen(false); } }}>
        <DialogContent className={cn(
          "p-0 gap-0 overflow-hidden",
          isFullscreen ? "max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh]" : "max-w-4xl w-full max-h-[90vh]"
        )}>
          <DialogHeader className="p-4 pb-3 border-b shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg truncate pr-4">
                    {selectedReport?.term} Report Card
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedReport && new Date(selectedReport.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(!isFullscreen)}>
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFileViewerOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4">
            {selectedReport?.file_url && renderFileViewer(selectedReport.file_url)}
          </div>

          <div className="p-4 pt-3 border-t shrink-0 bg-muted/30">
            <div className="flex items-center justify-end gap-2">
              {selectedReport?.file_url && (
                <Button size="sm" onClick={() => handleDownload(selectedReport.file_url!)} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
