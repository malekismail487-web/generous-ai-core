import { useState } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Download,
  FileText,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MaterialViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: {
    id: string;
    title: string;
    subject: string;
    content: string | null;
    file_url: string | null;
    grade_level?: string | null;
    created_at: string;
    uploaded_by?: string;
  } | null;
  subjectInfo?: {
    name: string;
    emoji: string;
    color: string;
  };
  teacherName?: string;
}

type FileType = 'pdf' | 'image' | 'video' | 'unknown';

function getFileType(url: string | null): FileType {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)/i)) return 'image';
  if (lower.match(/\.(mp4|webm|ogg|mov)/i)) return 'video';
  return 'unknown';
}

export function MaterialViewer({
  open,
  onOpenChange,
  material,
  subjectInfo = { name: 'Subject', emoji: '📄', color: 'from-gray-500 to-gray-600' },
  teacherName = 'Teacher',
}: MaterialViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [viewerError, setViewerError] = useState(false);
  const { signedUrl } = useSignedUrl(material?.file_url);

  const effectiveFileUrl = signedUrl || material?.file_url;

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = material?.title || 'file';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClose = () => {
    setImageZoom(1);
    setViewerError(false);
    setIsFullscreen(false);
    onOpenChange(false);
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
              title={material?.title || 'Material'}
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
              <img src={fileUrl} alt={material?.title || 'Material'} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `scale(${imageZoom})` }} onError={() => setViewerError(true)} />
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
              title={material?.title || 'Material'}
              onError={() => setViewerError(true)}
            />
          </div>
        );
    }
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "p-0 gap-0 overflow-hidden",
        isFullscreen ? "max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh]" : "max-w-4xl w-full max-h-[90vh]"
      )}>
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-lg shrink-0",
                subjectInfo.color
              )}>
                {subjectInfo.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg truncate pr-4">
                  {material.title}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(material.created_at).toLocaleDateString()} · by {teacherName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4">
          {effectiveFileUrl ? renderFileViewer(effectiveFileUrl) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No file available</h3>
            </div>
          )}
        </div>

        <div className="p-4 pt-3 border-t shrink-0 bg-muted/30">
          <div className="flex items-center justify-end gap-2">
            {effectiveFileUrl && (
              <Button size="sm" onClick={() => handleDownload(effectiveFileUrl)} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
