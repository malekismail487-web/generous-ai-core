import { MessageSquare, FileText, BookOpen, GraduationCap, Menu, X, Plus, Trash2, LogOut, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { Conversation } from '@/hooks/useConversations';
import { Note } from '@/hooks/useNotes';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export type TabType = 'chat' | 'notes' | 'examination' | 'sat';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  conversations: Conversation[];
  notes: Note[];
  currentConversationId?: string;
  currentNoteId?: string;
  onSelectConversation: (conv: Conversation) => void;
  onSelectNote: (note: Note) => void;
  onNewChat: () => void;
  onNewNote: () => void;
  onDeleteConversation: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

const tabs = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
  { id: 'notes' as const, icon: FileText, label: 'Notes' },
  { id: 'examination' as const, icon: BookOpen, label: 'Exam' },
  { id: 'sat' as const, icon: GraduationCap, label: 'SAT' },
];

export function BottomNav({
  activeTab,
  onTabChange,
  conversations,
  notes,
  currentConversationId,
  currentNoteId,
  onSelectConversation,
  onSelectNote,
  onNewChat,
  onNewNote,
  onDeleteConversation,
  onDeleteNote,
}: BottomNavProps) {
  const { signOut, user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const showList = activeTab === 'chat' || activeTab === 'notes';

  return (
    <>
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 glass-effect-strong border-b border-border/30">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'var(--gradient-primary)' }}>
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Study Bright</span>
          </div>

          <div className="flex items-center gap-2">
            {showList && (
              <Button
                variant="ghost"
                size="sm"
                onClick={activeTab === 'chat' ? onNewChat : onNewNote}
                className="gap-1.5 text-muted-foreground"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}
            
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0 bg-background border-border">
                <div className="flex flex-col h-full">
                  {/* Sheet Header */}
                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {activeTab === 'chat' ? 'Conversations' : activeTab === 'notes' ? 'Notes' : 'Menu'}
                      </span>
                    </div>
                    {user && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>
                    )}
                  </div>

                  {/* Content */}
                  <ScrollArea className="flex-1">
                    {activeTab === 'chat' && (
                      <div className="p-2 space-y-1">
                        {conversations.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No conversations yet
                          </p>
                        ) : (
                          conversations.map((conv) => (
                            <div
                              key={conv.id}
                              className={cn(
                                "group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                                currentConversationId === conv.id
                                  ? "bg-primary/10 text-foreground"
                                  : "hover:bg-secondary/50 text-muted-foreground"
                              )}
                              onClick={() => {
                                onSelectConversation(conv);
                                setSheetOpen(false);
                              }}
                            >
                              <MessageSquare size={16} className="flex-shrink-0" />
                              <span className="flex-1 truncate text-sm">{conv.title}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteConversation(conv.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {activeTab === 'notes' && (
                      <div className="p-2 space-y-1">
                        {notes.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No notes yet
                          </p>
                        ) : (
                          notes.map((note) => (
                            <div
                              key={note.id}
                              className={cn(
                                "group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                                currentNoteId === note.id
                                  ? "bg-primary/10 text-foreground"
                                  : "hover:bg-secondary/50 text-muted-foreground"
                              )}
                              onClick={() => {
                                onSelectNote(note);
                                setSheetOpen(false);
                              }}
                            >
                              <FileText size={16} className="flex-shrink-0" />
                              <span className="flex-1 truncate text-sm">{note.title}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNote(note.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {(activeTab === 'examination' || activeTab === 'sat') && (
                      <div className="p-4 text-center text-muted-foreground">
                        <p className="text-sm">Practice sessions are based on your chat history</p>
                      </div>
                    )}
                  </ScrollArea>

                  {/* Sign Out */}
                  <div className="p-4 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => signOut()}
                      className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <LogOut size={16} className="mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-effect-strong border-t border-border/30 pb-safe">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200",
                  isActive && "bg-primary/20"
                )}>
                  <Icon size={20} className={cn(isActive && "scale-110")} />
                </div>
                <span className={cn(
                  "text-[10px] font-medium transition-all",
                  isActive && "text-primary"
                )}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}