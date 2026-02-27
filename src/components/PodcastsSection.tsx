import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Podcast, Volume2, VolumeX, Loader2, FileText, X, Sparkles, History, ArrowLeft, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MathRenderer } from '@/components/MathRenderer';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import mammoth from 'mammoth';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { format } from 'date-fns';
import { useLearningStyle } from '@/hooks/useLearningStyle';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const EXPLAIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-file`;

interface PodcastEntry {
  id: string;
  file_name: string;
  content: string | null;
  created_at: string;
}

export function PodcastsSection() {
  const [file, setFile] = useState<File | null>(null);
  const [explanation, setExplanation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [podcastCount, setPodcastCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [pastPodcasts, setPastPodcasts] = useState<PodcastEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingPodcast, setViewingPodcast] = useState<PodcastEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { speak, stop, isSpeaking, isLoading: ttsLoading } = useTextToSpeech();
  const { t, language } = useThemeLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentLevel: adaptiveLevel } = useAdaptiveLevel();
  const { getLearningStylePrompt } = useLearningStyle();
  const { trackPodcastListened } = useActivityTracker();

  // Fetch podcast count on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from('podcast_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setPodcastCount(count ?? 0));
  }, [user]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('podcast_generations')
      .select('id, file_name, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setPastPodcasts((data as PodcastEntry[]) ?? []);
    setLoadingHistory(false);
  }, [user]);

  const handleShowHistory = useCallback(() => {
    setShowHistory(true);
    setViewingPodcast(null);
    fetchHistory();
  }, [fetchHistory]);

  const readFileContent = useCallback(async (f: File): Promise<string> => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'docx') {
      const arrayBuffer = await f.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }

    if (ext === 'pdf') {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        pages.push(textContent.items.map((item: any) => item.str).join(' '));
      }
      return pages.join('\n\n');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(f);
    });
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const maxSize = 5 * 1024 * 1024;
    if (selected.size > maxSize) {
      toast({
        variant: 'destructive',
        title: t('File too large', 'الملف كبير جداً'),
        description: t('Maximum file size is 5MB', 'الحد الأقصى لحجم الملف 5 ميجابايت'),
      });
      return;
    }

    setFile(selected);
    setExplanation('');
    setShowHistory(false);
    setViewingPodcast(null);
    stop();
  }, [toast, t, stop]);

  const handleExplain = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setExplanation('');
    stop();

    try {
      const content = await readFileContent(file);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(EXPLAIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          fileContent: content.slice(0, 30000),
          fileName: file.name,
          adaptiveLevel,
          learningStyle: getLearningStylePrompt(),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to explain file');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              setExplanation(fullText);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      setIsProcessing(false);

      // Track the podcast generation WITH content
      if (user && file) {
        supabase
          .from('podcast_generations')
          .insert({ user_id: user.id, file_name: file.name, content: fullText })
          .then(() => {
            setPodcastCount(prev => prev + 1);
            trackPodcastListened(file.name, 100, Math.max(30, Math.round(fullText.length / 12)));
          });
      }
    } catch (error) {
      setIsProcessing(false);
      toast({
        variant: 'destructive',
        title: t('Error', 'خطأ'),
        description: error instanceof Error ? error.message : t('Something went wrong', 'حدث خطأ'),
      });
    }
  }, [file, language, readFileContent, stop, toast, t, user]);

  const handleVoiceToggle = useCallback(() => {
    if (isSpeaking) {
      stop();
    } else {
      const text = viewingPodcast?.content || explanation;
      if (text) speak(text);
    }
  }, [isSpeaking, stop, explanation, speak, viewingPodcast]);

  const handleClear = useCallback(() => {
    setFile(null);
    setExplanation('');
    setViewingPodcast(null);
    stop();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [stop]);

  const activeContent = viewingPodcast?.content || explanation;

  // Viewing a past podcast
  if (viewingPodcast) {
    return (
      <div className="min-h-0 h-[calc(100vh-120px)] overflow-hidden pt-16 pb-20 flex flex-col">
        <div className="flex-1 flex flex-col overflow-hidden px-4">
          {/* Header */}
          <div className="flex items-center gap-3 py-3 px-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => { setViewingPodcast(null); stop(); }}>
              <ArrowLeft size={16} />
            </Button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{viewingPodcast.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(viewingPodcast.created_at), 'MMM d, yyyy · h:mm a')}
                </p>
              </div>
            </div>
            {viewingPodcast.content && (
              <Button
                variant="outline"
                size="icon"
                className={cn("h-9 w-9 rounded-xl", isSpeaking && "text-primary border-primary")}
                onClick={handleVoiceToggle}
                disabled={ttsLoading}
              >
                {ttsLoading ? <Loader2 size={16} className="animate-spin" /> : isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </Button>
            )}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="pb-4">
              {viewingPodcast.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MathRenderer content={viewingPodcast.content} className="text-sm" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-muted-foreground text-sm">
                    {t('No content saved for this podcast', 'لا يوجد محتوى محفوظ لهذا البودكاست')}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  // History list
  if (showHistory) {
    return (
      <div className="min-h-0 h-[calc(100vh-120px)] overflow-hidden pt-16 pb-20 flex flex-col">
        <div className="flex-1 flex flex-col overflow-hidden px-4">
          <div className="flex items-center gap-3 py-3 px-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setShowHistory(false)}>
              <ArrowLeft size={16} />
            </Button>
            <h2 className="text-lg font-bold">{t('Podcast History', 'سجل البودكاست')}</h2>
          </div>

          {loadingHistory ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pastPodcasts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <Podcast className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">
                {t('No podcasts yet. Upload a file to create your first one!', 'لا توجد بودكاست بعد. ارفع ملفاً لإنشاء أول بودكاست!')}
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 pb-4">
                {pastPodcasts.map((podcast) => (
                  <button
                    key={podcast.id}
                    onClick={() => setViewingPodcast(podcast)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/50 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{podcast.file_name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(podcast.created_at), 'MMM d, yyyy · h:mm a')}</span>
                      </div>
                    </div>
                    {!podcast.content && (
                      <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/50">
                        {t('No content', 'بلا محتوى')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-hidden pt-16 pb-20 flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.pdf,.docx"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex-1 flex flex-col overflow-hidden px-4">
        {!file && !explanation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-5">
              <Podcast className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">
              {t('AI Podcasts', 'بودكاست الذكاء الاصطناعي')}
            </h2>
            {podcastCount > 0 && (
              <button
                onClick={handleShowHistory}
                className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">
                  {podcastCount} {t('podcasts created', 'بودكاست تم إنشاؤه')}
                </span>
              </button>
            )}
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              {t(
                'Upload any file and the AI will explain it to you — read or listen!',
                'ارفع أي ملف وسيشرحه لك الذكاء الاصطناعي — اقرأ أو استمع!'
              )}
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl px-6 gap-2"
              size="lg"
            >
              <Upload className="w-5 h-5" />
              {t('Upload File', 'ارفع ملف')}
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 py-3 px-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {explanation && (
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn("h-9 w-9 rounded-xl", isSpeaking && "text-primary border-primary")}
                    onClick={handleVoiceToggle}
                    disabled={ttsLoading}
                  >
                    {ttsLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isSpeaking ? (
                      <VolumeX size={16} />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleClear}>
                  <X size={16} />
                </Button>
              </div>
            </div>

            {!explanation && !isProcessing ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <p className="text-muted-foreground text-sm text-center">
                  {t('Ready to explain this file', 'جاهز لشرح هذا الملف')}
                </p>
                <Button onClick={handleExplain} className="rounded-xl px-6 gap-2" size="lg">
                  <Sparkles className="w-5 h-5" />
                  {t('Explain with AI', 'اشرح بالذكاء الاصطناعي')}
                </Button>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="pb-4">
                  {isProcessing && !explanation && (
                    <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">{t('Analyzing file...', 'جارٍ تحليل الملف...')}</span>
                    </div>
                  )}
                  {explanation && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MathRenderer content={explanation} className="text-sm" />
                      {isProcessing && (
                        <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {explanation && !isProcessing && (
              <div className="py-3 border-t border-border/30">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {t('Upload Another File', 'ارفع ملف آخر')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
