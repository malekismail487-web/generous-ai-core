import { useState } from 'react';
import { ArrowLeft, FileText, BookmarkCheck, Trash2, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/MathRenderer';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { FileNotesGenerator } from '@/components/FileNotesGenerator';
import { useNotes, Note } from '@/hooks/useNotes';
import { cn } from '@/lib/utils';

type View = 'upload' | 'saved' | 'view-note';

export function NotesSection() {
  const { language } = useThemeLanguage();
  const lang = language === 'ar' ? 'ar' : 'en';
  const { toast } = useToast();
  const { notes, deleteNote, loading: notesLoading } = useNotes();

  const [view, setView] = useState<View>('upload');
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  if (view === 'view-note' && viewingNote) {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => { setViewingNote(null); setView('saved'); }}>
              <ArrowLeft size={14} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-accent text-lg">📝</div>
            <div className="flex-1">
              <h1 className="font-bold text-sm">{viewingNote.title}</h1>
              <p className="text-xs text-muted-foreground">{new Date(viewingNote.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="glass-effect rounded-2xl p-5 overflow-y-auto max-h-[65vh]">
            <MathRenderer
              content={viewingNote.content}
              className="whitespace-pre-wrap text-sm leading-relaxed"
            />
          </div>
        </div>
      </div>
    );
  }

  if (view === 'saved') {
    return (
      <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={() => setView('upload')}>
              <ArrowLeft size={16} className="mr-1" />{tr('back', language)}
            </Button>
          </div>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent">
              <BookmarkCheck className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {lang === 'ar' ? 'ملاحظاتي المحفوظة' : 'My Saved Notes'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {lang === 'ar' ? `${notes.length} ملاحظة` : `${notes.length} notes`}
            </p>
          </div>

          {notesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 glass-effect rounded-2xl">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {lang === 'ar' ? 'لا توجد ملاحظات محفوظة بعد' : 'No saved notes yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === 'ar' ? 'ارفع ملفاً لإنشاء ملاحظات' : 'Upload a file to generate notes'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note, idx) => (
                <button
                  key={note.id}
                  onClick={() => { setViewingNote(note); setView('view-note'); }}
                  className={cn(
                    'w-full glass-effect rounded-2xl p-4 text-left transition-all duration-200 group',
                    'hover:scale-[1.01] hover:shadow-lg active:scale-[0.99]'
                  )}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                      <FileText size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{note.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString()} • {note.content.length > 100 ? `${Math.ceil(note.content.length / 500)} pages` : 'Short'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                        toast({ title: lang === 'ar' ? 'تم الحذف' : 'Note deleted' });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // DEFAULT: file upload generator + saved-notes button
  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-3xl mx-auto px-4 pt-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload className="w-4 h-4" />
            <span>{lang === 'ar' ? 'ارفع ملف لتحويله إلى ملاحظات' : 'Upload a file to turn it into long-form notes'}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView('saved')}>
            <BookmarkCheck className="w-4 h-4 mr-1" />
            {lang === 'ar' ? 'محفوظ' : 'Saved'}
            {notes.length > 0 && (
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">{notes.length}</span>
            )}
          </Button>
        </div>
      </div>
      <FileNotesGenerator onBack={() => setView('saved')} />
    </div>
  );
}
