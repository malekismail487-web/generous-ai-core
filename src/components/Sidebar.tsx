import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, 
  FileText, 
  Plus, 
  Trash2, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Conversation } from '@/hooks/useConversations';
import { Note } from '@/hooks/useNotes';
import { cn } from '@/lib/utils';

export type TabType = 'chat' | 'notes' | 'examination' | 'sat';

interface SidebarProps {
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

export function Sidebar({
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
}: SidebarProps) {
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const showList = activeTab === 'chat' || activeTab === 'notes';
  const showNewButton = activeTab === 'chat' || activeTab === 'notes';

  return (
    <div className={cn(
      "h-full flex flex-col border-r border-sidebar-border transition-all duration-300",
      "bg-gradient-to-b from-sidebar-background to-background",
      collapsed ? "w-16" : "w-72"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border/50">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center glow-effect"
                 style={{ background: 'var(--gradient-primary)' }}>
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-sidebar-foreground">Study Bright</span>
              <span className="block text-xs text-muted-foreground">AI Learning</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className={cn(
        "p-2 space-y-1",
        collapsed ? "px-1" : "px-2"
      )}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <Button
              key={tab.id}
              variant="ghost"
              size={collapsed ? 'icon' : 'sm'}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "w-full justify-start transition-all duration-200",
                collapsed ? "h-10 w-10 p-0 justify-center" : "h-10",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-lg" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              style={isActive ? { boxShadow: '0 4px 20px -4px hsl(var(--primary) / 0.4)' } : undefined}
            >
              <Icon size={18} className={collapsed ? "" : "mr-2"} />
              {!collapsed && <span>{tab.label}</span>}
            </Button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-sidebar-border/50" />

      {/* New Button */}
      {showNewButton && (
        <div className="p-2">
          <Button
            variant="outline"
            size={collapsed ? 'icon' : 'sm'}
            onClick={activeTab === 'chat' ? onNewChat : onNewNote}
            className={cn(
              "w-full border-dashed border-sidebar-border/50 hover:border-primary/50",
              "hover:bg-primary/5 transition-all duration-200",
              collapsed && "h-10 w-10 p-0"
            )}
          >
            <Plus size={16} className={collapsed ? "" : "mr-2"} />
            {!collapsed && <span>New {activeTab === 'chat' ? 'Chat' : 'Note'}</span>}
          </Button>
        </div>
      )}

      {/* List */}
      {showList && (
        <ScrollArea className="flex-1 px-2">
          {activeTab === 'chat' ? (
            <div className="space-y-1 py-2">
              {conversations.length === 0 ? (
                <p className={cn(
                  "text-xs text-muted-foreground text-center py-4",
                  collapsed && "hidden"
                )}>
                  No conversations yet
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200",
                      currentConversationId === conv.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                    )}
                    onClick={() => onSelectConversation(conv)}
                  >
                    <MessageSquare size={16} className="flex-shrink-0 opacity-60" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-sm">{conv.title}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(conv.id);
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : activeTab === 'notes' ? (
            <div className="space-y-1 py-2">
              {notes.length === 0 ? (
                <p className={cn(
                  "text-xs text-muted-foreground text-center py-4",
                  collapsed && "hidden"
                )}>
                  No notes yet
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      "group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200",
                      currentNoteId === note.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                    )}
                    onClick={() => onSelectNote(note)}
                  >
                    <FileText size={16} className="flex-shrink-0 opacity-60" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-sm">{note.title}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNote(note.id);
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </ScrollArea>
      )}

      {/* Practice section placeholder when on exam/sat tabs */}
      {!showList && (
        <div className="flex-1 flex items-center justify-center p-4">
          {!collapsed && (
            <p className="text-xs text-muted-foreground text-center">
              Select a difficulty level to start practicing
            </p>
          )}
        </div>
      )}

      {/* User Section */}
      <div className="p-2 border-t border-sidebar-border/50 mt-auto">
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/50 truncate mb-2 px-2">
            {user.email}
          </p>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => signOut()}
          className={cn(
            "w-full text-sidebar-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed && "h-10 w-10 p-0"
          )}
        >
          <LogOut size={16} className={collapsed ? "" : "mr-2"} />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </div>
    </div>
  );
}