import { useState, useEffect } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';
import {
  Download,
  ExternalLink,
  FileText,
  File,
  Image as ImageIcon,
  Video,
  X,
  ZoomIn,
  ZoomOut,
  Loader2,
  ChevronLeft,
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

function getGoogleViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

function getFileTypeName(type: FileType): string {
  switch (type) {
    case 'pdf': return 'PDF';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'document': return 'Word';
    case 'presentation': return 'PowerPoint';
    default: return 'File';
  }
}

function getOriginalFilename(fileUrl: string | null, title: string): string {
  if (!fileUrl) return title;
  try {
    const questionIndex = fileUrl.indexOf('?');
    const cleanUrl = questionIndex >= 0 ? fileUrl.substring(0, questionIndex) : fileUrl;
    const segments = cleanUrl.split('/');
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment) return title;
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
  const [imageZoom, setImageZoom] = useState(1);
  const [viewerError, setViewerError] = useState(false);
  const [docViewerFailed, setDocViewerFailed] = useState(false);
  const { signedUrl, loading: signedUrlLoading } = useSignedUrl(material?.file_url);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || !material) return null;

  const fileType = getFileType(material.file_url);
  const filename = getOriginalFilename(material.file_url, material.title);
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

  const handleClose = () => {
    setImageZoom(1);
    setViewerError(false);
    setDocViewerFailed(false);
    onOpenChange(false);
  };

  const renderContent = () => {
    if (!effectiveUrl && !material.content) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No content available</p>
        </div>
      );
    }

    // Loading signed URL
    if (isLoadingUrl) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      );
    }

    // Viewer error fallback
    if (viewerError && effectiveUrl) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium mb-2">Unable to preview this file</h3>
          <p className="text-sm text-muted-foreground mb-6">This file format cannot be displayed in the browser.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
              <ExternalLink className="w-4 h-4" /> Open in New Tab
            </Button>
            <Button onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* File content */}
        {effectiveUrl && (
          <div className="flex-1 overflow-auto">
            {fileType === 'pdf' && (
              <iframe
                src={`${effectiveUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
                className="w-full h-full border-0"
                title={material.title}
                onError={() => setViewerError(true)}
              />
            )}

            {fileType === 'image' && (
              <div className="relative h-full">
                {/* Zoom controls */}
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-border/50">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))} disabled={imageZoom <= 0.5}>
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs font-medium px-1.5 min-w-[3rem] text-center">{Math.round(imageZoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} disabled={imageZoom >= 3}>
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="w-full h-full overflow-auto flex items-center justify-center p-6 bg-muted/30">
                  <img
                    src={effectiveUrl}
                    alt={material.title}
                    className="max-w-full max-h-full object-contain transition-transform"
                    style={{ transform: `scale(${imageZoom})` }}
                    onError={() => setViewerError(true)}
                  />
                </div>
              </div>
            )}

            {fileType === 'video' && (
              <div className="w-full h-full flex items-center justify-center bg-black">
                <video src={effectiveUrl} controls className="max-w-full max-h-full" onError={() => setViewerError(true)}>
                  Your browser does not support video playback.
                </video>
              </div>
            )}

            {(fileType === 'document' || fileType === 'presentation') && !docViewerFailed && (
              <div className="relative w-full h-full">
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 z-0">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Loading preview…</p>
                </div>
                <iframe
                  src={getGoogleViewerUrl(effectiveUrl)}
                  className="w-full h-full border-0 relative z-10"
                  title={material.title}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  onError={() => setDocViewerFailed(true)}
                />
                <div className="absolute bottom-4 right-4 z-20">
                  <Button variant="secondary" size="sm" className="gap-2 shadow-md" onClick={() => setDocViewerFailed(true)}>
                    <ExternalLink className="w-3 h-3" /> Can't see it?
                  </Button>
                </div>
              </div>
            )}

            {(fileType === 'document' || fileType === 'presentation') && docViewerFailed && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <File className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{filename}</h3>
                <p className="text-sm text-muted-foreground mb-6">{getFileTypeName(fileType)}</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
                    <ExternalLink className="w-4 h-4" /> Open in New Tab
                  </Button>
                  <Button onClick={handleDownload} className="gap-2">
                    <Download className="w-4 h-4" /> Download
                  </Button>
                </div>
              </div>
            )}

            {fileType === 'unknown' && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{filename}</h3>
                <p className="text-sm text-muted-foreground mb-6">{getFileTypeName(fileType)}</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleOpenExternal} className="gap-2">
                    <ExternalLink className="w-4 h-4" /> Open in New Tab
                  </Button>
                  <Button onClick={handleDownload} className="gap-2">
                    <Download className="w-4 h-4" /> Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Text content */}
        {material.content && (
          <div className={cn(
            "p-6 overflow-auto",
            material.file_url ? "border-t max-h-[30vh]" : "flex-1"
          )}>
            <div className="max-w-3xl mx-auto">
              <h4 className="font-medium mb-3 text-foreground text-sm uppercase tracking-wide">Notes</h4>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{material.content}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Clean top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-primary font-medium text-sm hover:opacity-80 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Done</span>
        </button>

        <div className="flex-1 text-center px-4">
          <h1 className="text-sm font-semibold truncate">{material.title}</h1>
          <p className="text-xs text-muted-foreground">
            {subjectInfo.emoji} {subjectInfo.name}
            {material.grade_level && material.grade_level !== 'All' && ` · ${material.grade_level}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {effectiveUrl && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpenExternal} title="Open in new tab">
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download">
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area - fills remaining space */}
      {renderContent()}

      {/* Minimal footer */}
      <div className="shrink-0 px-4 py-2 border-t border-border/30 bg-muted/20 text-center">
        <p className="text-xs text-muted-foreground">
          {teacherName} · {new Date(material.created_at).toLocaleDateString()}
          {material.file_url && ` · ${getFileTypeName(fileType)}`}
        </p>
      </div>
    </div>
  );
}
