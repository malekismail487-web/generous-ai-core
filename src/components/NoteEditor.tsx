import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Note } from '@/hooks/useNotes';
import { Sparkles, Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { streamChat } from '@/lib/chat';

interface NoteEditorProps {
  note: Note | null;
  onUpdate: (noteId: string, updates: Partial<Pick<Note, 'title' | 'content' | 'ai_feedback'>>) => Promise<Note | null>;
  onCreateNote: () => Promise<Note | null>;
}

export function NoteEditor({ note, onUpdate, onCreateNote }: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setFeedback(note.ai_feedback);
      setHasUnsavedChanges(false);
    } else {
      setTitle('');
      setContent('');
      setFeedback(null);
      setHasUnsavedChanges(false);
    }
  }, [note]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setHasUnsavedChanges(true);
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  // Auto-save with debounce
  useEffect(() => {
    if (!note || !hasUnsavedChanges) return;

    const timer = setTimeout(async () => {
      await onUpdate(note.id, { title, content });
      setHasUnsavedChanges(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, content, note, onUpdate, hasUnsavedChanges]);

  const handleReview = async () => {
    if (!content.trim()) {
      toast({
        variant: 'destructive',
        title: 'No content',
        description: 'Please write some notes before asking for a review.',
      });
      return;
    }

    if (!note) {
      const newNote = await onCreateNote();
      if (!newNote) return;
    }

    setIsReviewing(true);
    setFeedback('');

    let feedbackContent = '';

    await streamChat({
      messages: [
        {
          id: 'review-request',
          role: 'user',
          content: `Please review my study notes and provide corrections, suggestions, and feedback. Point out any factual errors, unclear explanations, or areas that could be improved. Be encouraging but thorough.\n\nMy notes:\n\n${content}`,
        },
      ],
      onDelta: (delta) => {
        feedbackContent += delta;
        setFeedback(feedbackContent);
      },
      onDone: async () => {
        setIsReviewing(false);
        if (note) {
          await onUpdate(note.id, { ai_feedback: feedbackContent });
        }
      },
      onError: (error) => {
        setIsReviewing(false);
        toast({
          variant: 'destructive',
          title: 'Review failed',
          description: error.message || 'Failed to get AI review. Please try again.',
        });
      },
    });
  };

  if (!note) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Note Selected</h2>
        <p className="text-muted-foreground mb-4">
          Select a note from the sidebar or create a new one
        </p>
        <Button onClick={onCreateNote}>
          <FileText className="w-4 h-4 mr-2" />
          Create New Note
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="text-lg font-semibold border-0 bg-transparent focus-visible:ring-0 px-0"
        />
        <Button
          onClick={handleReview}
          disabled={isReviewing || !content.trim()}
          className="flex-shrink-0"
        >
          {isReviewing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Ask AI to Review
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Notes Area */}
        <div className="flex-1 flex flex-col p-4">
          <label className="text-sm font-medium text-muted-foreground mb-2">Your Notes</label>
          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write your study notes here..."
            className="flex-1 resize-none min-h-[300px]"
          />
          {hasUnsavedChanges && (
            <p className="text-xs text-muted-foreground mt-2">Saving...</p>
          )}
        </div>

        {/* AI Feedback Area */}
        {(feedback || isReviewing) && (
          <div className="w-1/2 border-l border-border flex flex-col">
            <div className="p-4 border-b border-border flex items-center gap-2">
              {isReviewing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">AI is reviewing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">AI Feedback</span>
                </>
              )}
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="prose prose-sm prose-invert max-w-none">
                {feedback ? (
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: feedback
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/\n/g, '<br />')
                    }} 
                  />
                ) : (
                  <p className="text-muted-foreground">Waiting for feedback...</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
