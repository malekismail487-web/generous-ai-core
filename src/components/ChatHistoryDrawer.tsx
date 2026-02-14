import { Conversation } from "@/hooks/useConversations";
import { MessageSquare, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface ChatHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentId?: string;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function ChatHistoryDrawer({
  open,
  onClose,
  conversations,
  currentId,
  onSelect,
  onDelete,
  onNewChat,
}: ChatHistoryDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative w-72 max-w-[80vw] h-full bg-background border-r border-border/30 animate-slide-in-right flex flex-col" style={{ animationDirection: 'reverse', transform: 'translateX(0)' }}>
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <h2 className="font-semibold text-foreground text-sm">Chat History</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-sm"
            onClick={() => { onNewChat(); onClose(); }}
          >
            <Plus size={14} />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 pb-4 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    currentId === conv.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50 text-foreground"
                  }`}
                  onClick={() => { onSelect(conv); onClose(); }}
                >
                  <MessageSquare size={14} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
