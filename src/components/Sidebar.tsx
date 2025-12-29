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
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Conversation } from '@/hooks/useConversations';
import { Note } from '@/hooks/useNotes';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: 'chat' | 'notes';
  onTabChange: (tab: 'chat' | 'notes') => void;
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

  return (
    <div className={cn(
      "h-full flex flex-col bg-sidebar-background border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">Study Bright</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-2">
        <Button
          variant={activeTab === 'chat' ? 'secondary' : 'ghost'}
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => onTabChange('chat')}
          className={cn("flex-1", collapsed && "w-full")}
        >
          <MessageSquare size={16} />
          {!collapsed && <span className="ml-2">Chats</span>}
        </Button>
        <Button
          variant={activeTab === 'notes' ? 'secondary' : 'ghost'}
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => onTabChange('notes')}
          className={cn("flex-1", collapsed && "w-full")}
        >
          <FileText size={16} />
          {!collapsed && <span className="ml-2">Notes</span>}
        </Button>
      </div>

      {/* New Button */}
      <div className="p-2">
        <Button
          variant="outline"
          size={collapsed ? 'icon' : 'sm'}
          onClick={activeTab === 'chat' ? onNewChat : onNewNote}
          className="w-full border-dashed"
        >
          <Plus size={16} />
          {!collapsed && <span className="ml-2">New {activeTab === 'chat' ? 'Chat' : 'Note'}</span>}
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 px-2">
        {activeTab === 'chat' ? (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                  currentConversationId === conv.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                )}
                onClick={() => onSelectConversation(conv)}
              >
                <MessageSquare size={16} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-sm">{conv.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
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
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                  currentNoteId === note.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                )}
                onClick={() => onSelectNote(note)}
              >
                <FileText size={16} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-sm">{note.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
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
            ))}
          </div>
        )}
      </ScrollArea>

      {/* User Section */}
      <div className="p-2 border-t border-sidebar-border">
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/60 truncate mb-2 px-2">
            {user.email}
          </p>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => signOut()}
          className="w-full text-sidebar-foreground hover:text-destructive"
        >
          <LogOut size={16} />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </div>
    </div>
  );
}
