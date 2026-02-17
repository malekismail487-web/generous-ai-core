import { useState } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  ExternalLink,
  FileText,
  File,
  Image as ImageIcon,
  Video,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Loader2,
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

type FileType = 'pdf' | 'image' | 'video' | 'document' | 'presentation' | 'unknown';

function getFileType(fileUrl: string | null): FileType {
  if (!fileUrl) return 'unknown';
  const url = fileUrl.toLowerCase();
  
  if (url.includes('.pdf')) return 'pdf';
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i)) return 'image';
  if (url.match(/\.(mp4|webm|ogg|mov)/i)) return 'video';
  if (url.match(/\.(doc|docx)/i)) return 'document';
  if (url.match(/\.(ppt|pptx)/i)) return 'presentation';
  
  return 'unknown';
}

/** Build a Google Docs Viewer URL for embedding Word/PPT inline */
function getGoogleViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

/** Build a Microsoft Office Online viewer URL as secondary fallback */
function getOfficeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

function getFileTypeName(type: FileType): string {
  switch (type) {
    case 'pdf': return 'PDF Document';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'document': return 'Word Document';
    case 'presentation': return 'PowerPoint';
    default: return 'File';
  }
}

function getFileIcon(type: FileType) {
  switch (type) {
    case 'pdf': return <File className="w-5 h-5 text-red-500" />;
    case 'image': return <ImageIcon className="w-5 h-5 text-green-500" />;
    case 'video': return <Video className="w-5 h-5 text-purple-500" />;
    case 'document': return <File className="w-5 h-5 text-blue-500" />;
    case 'presentation': return <File className="w-5 h-5 text-orange-500" />;
    default: return <FileText className="w-5 h-5" />;
  }
}

function getOriginalFilename(fileUrl: string | null, title: string): string {
  if (!fileUrl) return title;
  
  // Try to extract original filename from URL
  try {
    // Use simple string parsing instead of URL constructor for older browser compatibility
    const questionIndex = fileUrl.indexOf('?');
    const cleanUrl = questionIndex >= 0 ? fileUrl.substring(0, questionIndex) : fileUrl;
    const segments = cleanUrl.split('/');
    const lastSegment = segments[segments.length - 1];
    
    if (!lastSegment) return title;
    
    // If the filename looks like a generated one (UUID-like), use title instead
    const uuidPattern = /^[a-f0-9-]+\.[a-z]+$/i;
    if (uuidPattern.test(lastSegment)) {
      const dotIndex = lastSegment.lastIndexOf('.');
      const ext = dotIndex >= 0 ? lastSegment.substring(dotIndex + 1) : '';
      return ext ? title + '.' + ext : title;
    }
    
    return decodeURIComponent(lastSegment);
  } catch {
    return title;
  }
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
  const [docViewerFailed, setDocViewerFailed] = useState(false);
  const { signedUrl, loading: signedUrlLoading } = useSignedUrl(material?.file_url);

  if (!material) return null;

  const fileType = getFileType(material.file_url);
  const filename = getOriginalFilename(material.file_url, material.title);
  const canEmbed = fileType === 'pdf' || fileType === 'image' || fileType === 'video' || fileType === 'document' || fileType === 'presentation';
  const effectiveUrl = signedUrl || material.file_url;
  const isLoadingUrl = material.file_url?.includes('/storage/v1/object/public/') && signedUrlLoading;

  const handleDownload = () => {
    if (!effectiveUrl) return;
    const link = document.createElement('a');
    link.href = effectiveUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExternal = () => {
    if (effectiveUrl) {
      window.open(effectiveUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const resetViewer = () => {
    setImageZoom(1);
    setViewerError(false);
    setDocViewerFailed(false);
  };

  const handleClose = () => {
    resetViewer();
    onOpenChange(false);
  };

  const renderEmbeddedViewer = () => {
    if (!effectiveUrl) return null;

    // Show loading while signed URL is being generated
    if (isLoadingUrl) {
      return (
        <div className={cn(
          "w-full flex flex-col items-center justify-center bg-muted/50 rounded-lg",
          isFullscreen ? "h-[85vh]" : "h-[60vh]"
        )}>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        </div>
      );
    }

    // If viewer previously failed, show fallback
    if (viewerError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Unable to preview this file</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This file format cannot be displayed in the browser.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" />
              Download File
            </Button>
            <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </Button>
          </div>
        </div>
      );
    }

    switch (fileType) {
      case 'pdf':
        return (
          <div className={cn(
            "w-full bg-muted rounded-lg overflow-hidden",
            isFullscreen ? "h-[85vh]" : "h-[60vh]"
          )}>
            <iframe
              src={`${effectiveUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-full border-0"
              title={material.title}
              onError={() => setViewerError(true)}
              onLoad={(e) => {
                // Detect if PDF failed to load in older browsers
                try {
                  const iframe = e.target as HTMLIFrameElement;
                  // Some older browsers load a blank page instead of the PDF
                  if (iframe.contentDocument && iframe.contentDocument.body && 
                      iframe.contentDocument.body.innerHTML === '') {
                    setViewerError(true);
                  }
                } catch {
                  // Cross-origin - PDF loaded in browser's native viewer, which is fine
                }
              }}
            />
          </div>
        );

      case 'image':
        return (
          <div className={cn(
            "w-full flex items-center justify-center bg-muted/50 rounded-lg overflow-hidden relative",
            isFullscreen ? "h-[85vh]" : "h-[60vh]"
          )}>
            {/* Zoom Controls */}
            <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))}
                disabled={imageZoom <= 0.5}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="flex items-center px-2 text-xs font-medium">
                {Math.round(imageZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setImageZoom(z => Math.min(3, z + 0.25))}
                disabled={imageZoom >= 3}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
              <img
                src={effectiveUrl}
                alt={material.title}
                className="max-w-full max-h-full object-contain transition-transform"
                style={{ transform: `scale(${imageZoom})` }}
                onError={() => setViewerError(true)}
              />
            </div>
          </div>
        );

      case 'video':
        return (
          <div className={cn(
            "w-full bg-black rounded-lg overflow-hidden",
            isFullscreen ? "h-[85vh]" : "h-[60vh]"
          )}>
            <video
              src={effectiveUrl}
              controls
              className="w-full h-full"
              onError={() => setViewerError(true)}
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case 'document':
      case 'presentation':
        // Classera-style: embed Word/PPT inline using Google Docs Viewer
        if (!docViewerFailed) {
          const googleViewerSrc = getGoogleViewerUrl(effectiveUrl);
          return (
            <div className={cn(
              "w-full bg-muted rounded-lg overflow-hidden relative",
              isFullscreen ? "h-[85vh]" : "h-[60vh]"
            )}>
              {/* Loading overlay while iframe loads */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 z-0">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Loading document preview…</p>
              </div>
              <iframe
                src={googleViewerSrc}
                className="w-full h-full border-0 relative z-10"
                title={material.title}
                sandbox="allow-scripts allow-same-origin allow-popups"
                onError={() => setDocViewerFailed(true)}
              />
              {/* Fallback link if viewer takes too long */}
              <div className="absolute bottom-3 right-3 z-20">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 shadow-md"
                  onClick={() => setDocViewerFailed(true)}
                >
                  <ExternalLink className="w-3 h-3" />
                  Can't see it?
                </Button>
              </div>
            </div>
          );
        }
        // Fallback: file info card with download + open actions
        return (
          <div className={cn(
            "w-full flex flex-col items-center justify-center bg-muted/50 rounded-lg py-16",
            isFullscreen ? "h-[85vh]" : "h-auto"
          )}>
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              {getFileIcon(fileType)}
            </div>
            <h3 className="font-semibold text-lg mb-1">{filename}</h3>
            <p className="text-sm text-muted-foreground mb-6">{getFileTypeName(fileType)}</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </div>
        );

      default:
        // Unknown files: download/open only
        return (
          <div className={cn(
            "w-full flex flex-col items-center justify-center bg-muted/50 rounded-lg py-16",
            isFullscreen ? "h-[85vh]" : "h-auto"
          )}>
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              {getFileIcon(fileType)}
            </div>
            <h3 className="font-semibold text-lg mb-1">{filename}</h3>
            <p className="text-sm text-muted-foreground mb-6">{getFileTypeName(fileType)}</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </div>
        );

    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden",
        isFullscreen 
          ? "max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh]" 
          : "max-w-4xl w-[calc(100%-2rem)] max-h-[90vh]"
      )}>
        {/* Header */}
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
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {subjectInfo.name}
                  </Badge>
                  {material.grade_level && material.grade_level !== 'All' && (
                    <Badge variant="secondary" className="text-xs">
                      {material.grade_level}
                    </Badge>
                  )}
                  {material.file_url && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      {getFileIcon(fileType)}
                      {getFileTypeName(fileType)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            {/* Header Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {canEmbed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* File Preview */}
          {material.file_url && renderEmbeddedViewer()}

          {/* Text Content */}
          {material.content && (
            <div className={cn(
              "prose prose-sm max-w-none",
              material.file_url && "mt-4 pt-4 border-t"
            )}>
              <h4 className="font-medium mb-2 text-foreground">Notes</h4>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {material.content}
              </p>
            </div>
          )}

          {/* No content fallback */}
          {!material.file_url && !material.content && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No content available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 pt-3 border-t shrink-0 bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              <p>Uploaded on {new Date(material.created_at).toLocaleDateString()}</p>
              <p>by {teacherName}</p>
              {material.file_url && (
                <p className="font-medium text-foreground mt-1">
                  📄 {filename}
                </p>
              )}
            </div>
            
            {material.file_url && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenExternal} className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </Button>
                <Button size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
