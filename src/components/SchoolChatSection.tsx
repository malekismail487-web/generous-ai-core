import { useState, useRef, useEffect } from 'react';
import { Send, Plus, MessageCircle, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSchoolChat } from '@/hooks/useSchoolChat';
import { useStrikes } from '@/hooks/useStrikes';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SchoolChatSectionProps {
  onBack?: () => void;
}

export function SchoolChatSection({ onBack }: SchoolChatSectionProps) {
  const [newMessage, setNewMessage] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    chatRooms,
    currentRoom,
    messages,
    loading,
    setCurrentRoom,
    sendMessage,
    createChatRoom,
    deleteMessage,
  } = useSchoolChat();
  
  const { isSuspended, isBricked, getStrikeCount } = useStrikes();
  const { isTeacher, isAdmin } = useUserRole();
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSuspended() || isBricked()) return;
    
    await sendMessage(newMessage.trim());
    setNewMessage('');
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    
    await createChatRoom(newRoomName.trim());
    setNewRoomName('');
    setShowNewRoom(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show suspension message
  if (isBricked()) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20 px-4">
        <div className="text-center glass-effect rounded-2xl p-6 max-w-sm">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-destructive mb-2">Account Disabled</h2>
          <p className="text-muted-foreground text-sm">
            Your account has been disabled due to 3 strikes. Contact your school administrator.
          </p>
        </div>
      </div>
    );
  }

  if (isSuspended()) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20 px-4">
        <div className="text-center glass-effect rounded-2xl p-6 max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-amber-500 mb-2">Account Suspended</h2>
          <p className="text-muted-foreground text-sm">
            You have been suspended due to {getStrikeCount()} strikes. You cannot send messages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-[calc(100vh-120px)] flex flex-col pt-14 pb-16 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border/30">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
        )}
        <MessageCircle className="w-5 h-5 text-primary" />
        <h2 className="font-semibold flex-1">School Chat</h2>
        {getStrikeCount() > 0 && (
          <span className="text-xs text-amber-500">{getStrikeCount()} strike(s)</span>
        )}
      </div>

      {/* Chat Room Tabs */}
      <div className="flex items-center gap-2 p-2 border-b border-border/30 overflow-x-auto">
        {chatRooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setCurrentRoom(room)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
              currentRoom?.id === room.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
            )}
          >
            {room.name}
          </button>
        ))}
        
        {(isTeacher || isAdmin) && (
          <>
            {showNewRoom ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Room name"
                  className="h-7 w-24 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
                <Button size="sm" variant="ghost" onClick={handleCreateRoom} className="h-7 w-7 p-0">
                  <Plus size={14} />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewRoom(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
              >
                <Plus size={12} />
                New
              </button>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatRooms.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">
            No chat rooms available. {(isTeacher || isAdmin) && 'Create one to get started!'}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.user_id === user?.id;
            return (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  isOwn ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2 relative group',
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-secondary rounded-bl-md'
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <span className="text-[10px] opacity-60">
                    {format(new Date(message.created_at), 'HH:mm')}
                  </span>
                  
                  {isOwn && (
                    <button
                      onClick={() => deleteMessage(message.id)}
                      className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {currentRoom && (
        <div className="p-3 border-t border-border/30">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim()}>
              <Send size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
