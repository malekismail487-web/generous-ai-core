import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LuminaLogo } from '@/components/LuminaLogo';
import {
  MessageSquare,
  FileText,
  Plus,
  Trash2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
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
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);
  const [collapsed, setCollapsed] = useState(false);

  const tabs = [
    { id: 'chat' as const, icon: MessageSquare, label: t('chat') },
    { id: 'notes' as const, icon: FileText, label: t('notes') },
    { id: 'examination' as const, icon: BookOpen, label: t('exam') },
    { id: 'sat' as const, icon: GraduationCap, label: t('sat') },
  ];

  const showList = activeTab === 'chat' || activeTab === 'notes';
  const showNewButton = activeTab === 'chat' || activeTab === 'notes';

  return (
    <div
      className={cn(
        'h-full flex flex-col transition-all duration-500 cosmic-header border-r',
        collapsed ? 'w-16' : 'w-72',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-primary/10">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden cosmic-pulse">
              <LuminaLogo size={40} />
            </div>
            <div>
              <span className="font-bold cosmic-glow-text">Lumina</span>
              <span className="block text-xs text-muted-foreground">{t('aiLearning')}</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className={cn('p-2 space-y-1', collapsed ? 'px-1' : 'px-2')}>
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
                'w-full justify-start transition-all duration-300 group',
                collapsed ? 'h-10 w-10 p-0 justify-center' : 'h-10',
                isActive
                  ? 'cosmic-button'
                  : 'text-sidebar-foreground hover:bg-primary/8 hover:text-primary',
              )}
              style={isActive ? { boxShadow: '0 0 20px -4px hsl(187 92% 52% / 0.4)' } : undefined}
            >
              <Icon
                size={18}
                className={cn(
                  'transition-transform duration-300',
                  !collapsed && 'mr-2',
                  isActive && 'scale-110',
                )}
              />
              {!collapsed && <span>{tab.label}</span>}
            </Button>
          );
        })}
      </div>

      <div className="mx-3 border-t border-primary/8" />

      {/* New Button */}
      {showNewButton && (
        <div className="p-2">
          <Button
            variant="outline"
            size={collapsed ? 'icon' : 'sm'}
            onClick={activeTab === 'chat' ? onNewChat : onNewNote}
            className={cn(
              'w-full border-dashed border-primary/25 hover:border-primary/60 hover:bg-primary/8 transition-all duration-300 text-primary',
              collapsed && 'h-10 w-10 p-0',
            )}
          >
            <Plus size={16} className={cn(!collapsed && 'mr-2')} />
            {!collapsed && <span>{activeTab === 'chat' ? t('newChatLabel') : t('newNote')}</span>}
          </Button>
        </div>
      )}

      {/* List */}
      {showList && (
        <ScrollArea className="flex-1 px-2">
          {activeTab === 'chat' ? (
            <div className="space-y-1 py-2">
              {conversations.length === 0 ? (
                <p className={cn('text-xs text-muted-foreground text-center py-4', collapsed && 'hidden')}>
                  {t('noConversationsYet')}
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-300',
                      currentConversationId === conv.id
                        ? 'bg-primary/12 text-primary border border-primary/20'
                        : 'hover:bg-primary/5 text-sidebar-foreground',
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
                <p className={cn('text-xs text-muted-foreground text-center py-4', collapsed && 'hidden')}>
                  {t('noNotesYet')}
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      'group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-300',
                      currentNoteId === note.id
                        ? 'bg-primary/12 text-primary border border-primary/20'
                        : 'hover:bg-primary/5 text-sidebar-foreground',
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

      {!showList && (
        <div className="flex-1 flex items-center justify-center p-4">
          {!collapsed && (
            <p className="text-xs text-muted-foreground text-center">{t('selectDifficultyToStart')}</p>
          )}
        </div>
      )}

      {/* User Section */}
      <div className="p-2 border-t border-primary/8 mt-auto">
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/50 truncate mb-2 px-2">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => signOut()}
          className={cn(
            'w-full text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300',
            collapsed && 'h-10 w-10 p-0',
          )}
        >
          <LogOut size={16} className={collapsed ? '' : 'mr-2'} />
          {!collapsed && <span>{t('signOut')}</span>}
        </Button>
      </div>
    </div>
  );
}
